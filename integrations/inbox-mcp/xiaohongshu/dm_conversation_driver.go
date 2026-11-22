package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"strings"
	"time"
)

// Only opens the observed recipient-profile IM button once. No input/send method exists.
type DMConversationDriver struct {
	entry *DMEntryDriver
	used  bool
}

func NewDMConversationDriver(p *rod.Page, closeBrowser func()) *DMConversationDriver {
	return &DMConversationDriver{entry: NewDMEntryDriver(p, closeBrowser)}
}

const dmConversationDOM = `(sender,recipient)=>{const guard=JSON.parse((` + dmEntryDOM + `)(sender,recipient));
 const route=location.origin!=='https://www.xiaohongshu.com'?'OTHER':location.pathname==='/chat'?'CHAT':location.pathname==='/user/profile/'+recipient?'PROFILE':'OTHER';
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).display!=='none'};
 const cls=e=>typeof e.className==='string'?e.className.split(/\s+/).filter(x=>/^[A-Za-z0-9_-]{1,60}$/.test(x)).slice(0,8).join(' '):'';
 const node=e=>{const r=e.getBoundingClientRect(),parents=[];let n=e.parentElement;for(let i=0;n&&i<7;i++,n=n.parentElement)parents.push({tag:n.tagName,className:cls(n)});return {tag:e.tagName,className:cls(e),empty:!(e.value||e.textContent||''),x:Math.max(0,Math.round(r.x)),y:Math.max(0,Math.round(r.y)),width:Math.round(r.width),height:Math.round(r.height),parents}};
 const result={identity:guard.identity,route,risk:guard.risk,loginChallenge:guard.loginChallenge,editors:[],targetLinks:[],regions:[],sendButtons:0,loading:false,headerPresent:false,bindingAttributes:[],scriptResources:[],stateKeys:[],boundRecipient:false,conversationKind:"",headerName:"",hints:[],actions:[],messages:[]};
 if(guard.identity!=='MATCH'||guard.risk||guard.loginChallenge||route==='OTHER')return JSON.stringify(result);
 result.editors=Array.from(document.querySelectorAll('textarea,[contenteditable="true"],[role="textbox"]')).filter(visible).slice(0,5).map(node);
 result.targetLinks=Array.from(document.querySelectorAll('a[href]')).filter(e=>{if(!visible(e))return false;try{const u=new URL(e.getAttribute('href'),location.origin);return u.origin===location.origin&&u.pathname==='/user/profile/'+recipient}catch{return false}}).slice(0,8).map(node);
 result.regions=Array.from(document.querySelectorAll('.xhs-im-view__main [class*="xhs-im"],.xhs-im-conv-item--active')).filter(visible).slice(0,24).map(node);
 result.sendButtons=Array.from(document.querySelectorAll('button,[role="button"]')).filter(e=>visible(e)&&['发送','发送消息'].includes((e.innerText||e.textContent||'').trim())).length;
 result.loading=Array.from(document.querySelectorAll('.xhs-im-msg-skeleton')).some(visible);
 result.headerPresent=Array.from(document.querySelectorAll('.xhs-im-chat-window__header-info')).some(e=>visible(e)&&!!(e.innerText||e.textContent||'').trim());
 for(const [source,selector] of [['ACTIVE_ITEM','.xhs-im-conv-item--active'],['HEADER','.xhs-im-chat-window__header-info'],['WINDOW','.xhs-im-chat-window']]){for(const e of document.querySelectorAll(selector)){if(!visible(e))continue;for(const a of e.attributes){if(!/^(data-[a-z0-9-]{1,60}|id|aria-label)$/.test(a.name))continue;const value=a.value;const match=value===recipient?'RECIPIENT':value===sender?'SENDER':value===''?'EMPTY':'OTHER';result.bindingAttributes.push({source,name:a.name,match});if(result.bindingAttributes.length>=30)break}}}
 const active=Array.from(document.querySelectorAll('.xhs-im-conv-item--active')).filter(visible);
 result.boundRecipient=active.length===1&&active[0].getAttribute('data-conv-id')===recipient;
 if(result.boundRecipient){const kind=active[0].getAttribute('data-conv-kind')||'';result.conversationKind=/^[A-Za-z0-9_-]{1,20}$/.test(kind)?kind:'';const header=document.querySelector('.xhs-im-chat-window__header-name');result.headerName=header&&visible(header)?(header.innerText||header.textContent||'').trim().slice(0,120):'';result.hints=Array.from(document.querySelectorAll('.xhs-im-chat-window .xhs-im-hint__text')).filter(visible).slice(0,4).map(e=>(e.innerText||e.textContent||'').trim().slice(0,200));result.actions=Array.from(document.querySelectorAll('.xhs-im-input-bar-actions button,.xhs-im-input-bar-actions [role="button"]')).filter(visible).slice(0,8).map(e=>({tag:e.tagName,className:cls(e),label:(e.getAttribute('aria-label')||e.getAttribute('title')||e.innerText||e.textContent||'').trim().slice(0,80),disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true'}));}
 if(result.boundRecipient&&result.conversationKind==='c2c'&&!result.loading){result.messages=Array.from(document.querySelectorAll('.xhs-im-chat-window .xhs-im-msg-list .chat-item')).filter(e=>!!e.querySelector('.chat-item__bubble-row--right')).slice(-5).map(e=>({id:(e.getAttribute('data-message-id')||'').slice(0,120),className:cls(e),attrs:Array.from(e.attributes).map(a=>a.name+'='+a.value).join('|').slice(0,500),rawText:(e.querySelector('.chat-item__bubble')?.textContent||'').slice(0,1000),failed:!!e.querySelector('.chat-item__status-btn--failed'),pending:!!e.querySelector('.chat-item__status-loading')}));}
 const resources=[...Array.from(document.querySelectorAll('script[src]')).map(e=>e.src),...performance.getEntriesByType('resource').map(e=>e.name)];
 result.scriptResources=Array.from(new Set(resources.flatMap(s=>{try{const u=new URL(s);const url=u.origin+u.pathname;return u.protocol==='https:'&&!u.username&&!u.password&&(u.hostname==='www.xiaohongshu.com'||u.hostname.endsWith('.xhscdn.com')||u.hostname.endsWith('.xiaohongshu.com'))&&/\.js$/.test(u.pathname)&&url.length<300?[url]:[]}catch{return []}}))).slice(-20);
 result.stateKeys=Object.keys(window.__INITIAL_STATE__||{}).filter(k=>/^[A-Za-z0-9_-]{1,50}$/.test(k)&&/chat|conversation|im/i.test(k)).slice(0,20);
 return JSON.stringify(result);
}`

func (d *DMConversationDriver) Inspect(ctx context.Context, t exactreply.DMConversationTarget) (o exactreply.DMConversationObservation, n int, err error) {
	if d.used || !t.Valid() {
		return o, 0, errors.New("INVALID_SCOPE")
	}
	d.used = true
	before, err := d.entry.Inspect(ctx, exactreply.DMEntryTarget{Protocol: exactreply.DMEntryProtocol, AccountID: t.AccountID, SenderID: t.SenderID, RecipientID: t.RecipientID})
	if err != nil || before.Identity != "MATCH" || before.Route != "PROFILE" || before.Risk || before.LoginChallenge {
		return o, 0, errors.New("PROFILE_UNVERIFIED")
	}
	p := d.entry.page.Context(ctx)
	buttons, err := p.Elements(".user-page button.xhs-user-im-btn")
	if err != nil || len(buttons) != 1 {
		return o, 0, errors.New("AMBIGUOUS_IM_BUTTON")
	}
	enabled, err := buttons[0].Eval(`function(){const e=this,r=e.getBoundingClientRect();return !e.disabled&&e.getAttribute('aria-disabled')!=='true'&&r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(e).visibility==='visible'}`)
	if err != nil || !enabled.Value.Bool() {
		return o, 0, errors.New("IM_BUTTON_DISABLED")
	}
	check, err := p.Eval(dmEntryDOM, t.SenderID, t.RecipientID)
	var current exactreply.DMEntryObservation
	if err != nil || json.Unmarshal([]byte(check.Value.Str()), &current) != nil || current.Identity != "MATCH" || current.Route != "PROFILE" || current.Risk || current.LoginChallenge {
		return o, 0, errors.New("PROFILE_CHANGED")
	}
	pages, err := p.Browser().Pages()
	if err != nil {
		return o, 0, err
	}
	known := map[proto.TargetTargetID]bool{}
	for _, page := range pages {
		known[page.TargetID] = true
	}
	if ctx.Err() != nil {
		return o, 0, ctx.Err()
	}
	n = 1
	if err = buttons[0].Click(proto.InputMouseButtonLeft, 1); err != nil {
		return o, n, err
	}
	for sample := 0; sample < 24; sample++ {
		pages, e := p.Browser().Pages()
		if e != nil {
			return o, n, e
		}
		var added []*rod.Page
		for _, page := range pages {
			if !known[page.TargetID] {
				added = append(added, page)
			}
		}
		if len(added) > 1 {
			return o, n, errors.New("AMBIGUOUS_NEW_PAGE")
		}
		if len(added) == 1 {
			info, e := added[0].Info()
			if e != nil {
				return o, n, e
			}
			if !strings.HasPrefix(info.URL, "https://www.xiaohongshu.com/chat") {
				return o, n, errors.New("EXTERNAL_PAGE")
			}
			p = added[0].Context(ctx)
			d.entry.page = p
			known[p.TargetID] = true
		}
		value, e := p.Eval(dmConversationDOM, t.SenderID, t.RecipientID)
		if e != nil {
			return o, n, e
		}
		if len(value.Value.Str()) > 24000 {
			return o, n, errors.New("OVERSIZE")
		}
		if e = json.Unmarshal([]byte(value.Value.Str()), &o); e != nil {
			return o, n, e
		}
		var raw struct {
			Messages []struct {
				RawText string `json:"rawText"`
			}
		}
		if json.Unmarshal([]byte(value.Value.Str()), &raw) != nil || len(raw.Messages) != len(o.Messages) {
			return o, n, errors.New("MESSAGE_METADATA_INVALID")
		}
		for i := range o.Messages {
			o.Messages[i].ContentHash = exactreply.Hash(raw.Messages[i].RawText)
		}
		if o.Identity == "MISMATCH" || o.Risk || o.LoginChallenge || o.Route == "OTHER" || (len(o.Editors) > 0 && !o.Loading && o.HeaderPresent) || sample == 23 {
			return o, n, nil
		}
		timer := time.NewTimer(250 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return o, n, ctx.Err()
		case <-timer.C:
		}
	}
	return
}
func (d *DMConversationDriver) Close(ctx context.Context) error { return d.entry.Close(ctx) }
