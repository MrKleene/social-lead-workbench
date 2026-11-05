package xiaohongshu

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"regexp"
	"time"
)

// Metadata-only exploratory reader. Never returns names, raw private content, IDs or tokens.
const InboxMetadataDOM = `(sender)=>{
 const g=JSON.parse((` + dmEntryDOM + `)(sender,''));
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden'&&getComputedStyle(e).display!=='none'};
 const r={identity:g.identity,risk:g.risk,loginChallenge:g.loginChallenge,route:location.origin==='https://www.xiaohongshu.com'&&/^\/chat(?:\/[a-f0-9]{24})?$/.test(location.pathname)?'CHAT':'OTHER',pathShape:location.pathname.replace(/[a-f0-9]{20,}/g,'<id>').slice(0,100),conversations:[],activeId:'',bound:false,loading:!!document.querySelector('.xhs-im-msg-skeleton'),headerNamePresent:false,messages:[]};
 if(r.identity!=='MATCH'||r.risk||r.loginChallenge||r.route!=='CHAT')return JSON.stringify(r);
 r.conversations=Array.from(document.querySelectorAll('.xhs-im-conv-item[data-conv-id]')).filter(visible).slice(0,5).map(e=>({id:e.getAttribute('data-conv-id'),kind:e.getAttribute('data-conv-kind'),active:e.classList.contains('xhs-im-conv-item--active')}));
 const active=r.conversations.filter(x=>x.active&&x.kind==='c2c'&&/^[a-f0-9]{24}$/.test(x.id));r.bound=active.length===1&&(location.pathname==='/chat'||location.pathname==='/chat/'+active[0].id);r.activeId=r.bound?active[0].id:'';
 if(!r.bound||r.loading)return JSON.stringify(r);
 r.headerNamePresent=!!document.querySelector('.xhs-im-chat-window__header-name')?.textContent?.trim();
 r.messages=Array.from(document.querySelectorAll('.xhs-im-chat-window .xhs-im-msg-list .chat-item')).slice(-5).map(e=>{const left=!!e.querySelector('.chat-item__bubble-row--left'),right=!!e.querySelector('.chat-item__bubble-row--right');return {id:(e.getAttribute('data-message-id')||'').slice(0,120),direction:left&&!right?'INBOUND':right&&!left?'OUTBOUND':'UNKNOWN',rawText:(e.querySelector('.chat-item__bubble')?.textContent||'').slice(0,1000),timestampPresent:!!e.querySelector('time,[datetime],.chat-item__time'),imagePresent:!!e.querySelector('.chat-item__bubble img')}});
 return JSON.stringify(r);
}`

type inboxSnapshot struct {
	PathShape      string `json:"pathShape"`
	Identity       string `json:"identity"`
	Risk           bool   `json:"risk"`
	LoginChallenge bool   `json:"loginChallenge"`
	Route          string `json:"route"`
	Conversations  []struct {
		ID     string `json:"id"`
		Kind   string `json:"kind"`
		Active bool   `json:"active"`
	} `json:"conversations"`
	ActiveID          string `json:"activeId"`
	Bound             bool   `json:"bound"`
	Loading           bool   `json:"loading"`
	HeaderNamePresent bool   `json:"headerNamePresent"`
	Messages          []struct {
		ID               string `json:"id"`
		Direction        string `json:"direction"`
		RawText          string `json:"rawText"`
		TimestampPresent bool   `json:"timestampPresent"`
		ImagePresent     bool   `json:"imagePresent"`
	} `json:"messages"`
}

func InspectInboxMetadata(ctx context.Context, page *rod.Page, sender string) (map[string]any, error) {
	p := page.Context(ctx)
	entry := NewDMEntryDriver(p, func() {})
	o, e := entry.Inspect(ctx, exactreply.DMEntryTarget{Protocol: exactreply.DMEntryProtocol, AccountID: "inbox-inspection", SenderID: sender})
	if e != nil || o.Identity != "MATCH" || o.Risk || o.LoginChallenge {
		return map[string]any{"code": "ENTRY_UNVERIFIED", "identity": o.Identity, "route": o.Route, "risk": o.Risk, "loginChallenge": o.LoginChallenge, "readError": e != nil, "chatClicks": 0, "submissions": 0, "inputs": 0}, nil
	}
	if e = p.Navigate("https://www.xiaohongshu.com/chat"); e != nil {
		return nil, e
	}
	if e = p.WaitLoad(); e != nil {
		return nil, e
	}
	var s inboxSnapshot
	opened := false
	for n := 0; n < 30; n++ {
		if ctx.Err() != nil {
			return nil, ctx.Err()
		}
		v, err := p.Eval(InboxMetadataDOM, sender)
		if err != nil {
			return nil, err
		}
		if len(v.Value.Str()) > 16000 {
			return nil, errors.New("RESULT_BUDGET")
		}
		if err = json.Unmarshal([]byte(v.Value.Str()), &s); err != nil {
			return nil, err
		}
		if s.Identity == "MISMATCH" || s.Risk || s.LoginChallenge || s.Route != "CHAT" {
			return map[string]any{"code": "CHAT_BOUNDARY", "pathShape": s.PathShape, "identity": s.Identity, "route": s.Route, "risk": s.Risk, "loginChallenge": s.LoginChallenge, "chatClicks": boolInt(opened), "submissions": 0, "inputs": 0}, nil
		}
		if s.Identity == "MATCH" && !s.Bound && !opened && len(s.Conversations) > 0 {
			c := s.Conversations[0]
			if validRecipient(c.ID) && c.Kind == "c2c" {
				els, er := p.Elements(`.xhs-im-conv-item[data-conv-kind="c2c"][data-conv-id="` + c.ID + `"]`)
				if er != nil || len(els) != 1 {
					return nil, errors.New("AMBIGUOUS_CHAT")
				}
				opened = true
				if er = els[0].Click(proto.InputMouseButtonLeft, 1); er != nil {
					return nil, er
				}
			}
		}
		if s.Identity == "MATCH" && s.Bound && !s.Loading && s.HeaderNamePresent && len(s.Messages) > 0 {
			break
		}
		select {
		case <-ctx.Done():
			return nil, ctx.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	messages := []map[string]any{}
	for _, m := range s.Messages {
		hash := sha256.Sum256([]byte(m.ID))
		messages = append(messages, map[string]any{"stableIdPresent": m.ID != "", "idHash": hex.EncodeToString(hash[:]), "direction": m.Direction, "textPresent": m.RawText != "", "textLength": len([]rune(m.RawText)), "timestampPresent": m.TimestampPresent, "imagePresent": m.ImagePresent})
	}
	return map[string]any{"code": "INBOX_METADATA_OBSERVED", "identity": s.Identity, "route": s.Route, "risk": s.Risk, "loginChallenge": s.LoginChallenge, "visibleConversationCount": len(s.Conversations), "bound": s.Bound, "loading": s.Loading, "headerNamePresent": s.HeaderNamePresent, "messages": messages, "chatClicks": boolInt(opened), "submissions": 0, "inputs": 0, "coverage": "VISIBLE_SAMPLE_ONLY", "mayMarkRead": true}, nil
}

func validRecipient(s string) bool { return regexp.MustCompile(`^[a-f0-9]{24}$`).MatchString(s) }
func boolInt(v bool) int {
	if v {
		return 1
	}
	return 0
}
