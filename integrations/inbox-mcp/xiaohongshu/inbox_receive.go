package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"net/url"
	"sync"
	"time"
)

type InboxSession struct {
	Sender   string
	page     *rod.Page
	ctx      context.Context
	cancel   context.CancelFunc
	mu       sync.Mutex
	readMu   sync.Mutex
	frames   []string
	wake     chan struct{}
	done     chan struct{}
	closed   bool
	overflow bool
	socket   bool
}

func StartInbox(parent context.Context, p *rod.Page, sender string) (*InboxSession, error) {
	ctx, cancel := context.WithCancel(parent)
	s := &InboxSession{Sender: sender, page: p, ctx: ctx, cancel: cancel, wake: make(chan struct{}, 1), done: make(chan struct{})}
	hosts := map[proto.NetworkRequestID]bool{}
	wait := p.Context(ctx).EachEvent(func(e *proto.NetworkWebSocketCreated) {
		u, err := url.Parse(e.URL)
		if err == nil && u.Scheme == "wss" && u.Hostname() == "apppush-rws.xiaohongshu.com" && u.Path == "/rwp" {
			s.mu.Lock()
			hosts[e.RequestID] = true
			s.mu.Unlock()
		}
	}, func(e *proto.NetworkWebSocketHandshakeResponseReceived) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if hosts[e.RequestID] && e.Response != nil && e.Response.Status == 101 {
			s.socket = true
		}
	}, func(e *proto.NetworkWebSocketClosed) {
		s.mu.Lock()
		if hosts[e.RequestID] {
			s.socket = false
		}
		s.mu.Unlock()
		s.notify()
	}, func(e *proto.NetworkWebSocketFrameReceived) {
		s.mu.Lock()
		defer s.mu.Unlock()
		if !hosts[e.RequestID] || e.Response == nil || e.Response.Opcode != 1 || len(e.Response.PayloadData) > 262144 {
			return
		}
		var f struct {
			V int `json:"v"`
			T int `json:"t"`
		}
		if json.Unmarshal([]byte(e.Response.PayloadData), &f) != nil || f.V != 1 || f.T != 4 {
			return
		}
		if len(s.frames) >= 200 {
			s.overflow = true
		} else {
			s.frames = append(s.frames, e.Response.PayloadData)
		}
		s.notify()
	})
	go func() { defer close(s.done); defer func() { recover() }(); wait() }()
	o, err := NewDMEntryDriver(p.Context(ctx), func() {}).Inspect(ctx, exactreply.DMEntryTarget{Protocol: exactreply.DMEntryProtocol, AccountID: "inbox", SenderID: sender})
	if err != nil || o.Identity != "MATCH" || o.Risk || o.LoginChallenge {
		s.Close()
		return nil, errors.New("IDENTITY_OR_RISK")
	}
	return s, nil
}
func (s *InboxSession) notify() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}
func (s *InboxSession) Close() {
	s.cancel()
	<-s.done
	s.mu.Lock()
	s.closed = true
	s.mu.Unlock()
	s.notify()
}
func (s *InboxSession) identity(p *rod.Page) bool {
	v, e := p.Context(s.ctx).Eval(`sender=>{const s=JSON.parse((`+dmEntryDOM+`)(sender,''));return s.identity==='MATCH'&&!s.risk&&!s.loginChallenge}`, s.Sender)
	return e == nil && v.Value.Bool()
}
func (s *InboxSession) Drain(ctx context.Context) any {
	select {
	case <-ctx.Done():
	case <-s.ctx.Done():
	case <-s.wake:
	case <-time.After(15 * time.Second):
	}
	if s.ctx.Err() == nil && !s.identity(s.page) {
		s.cancel()
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	frames := s.frames
	if frames == nil {
		frames = []string{}
	}
	s.frames = nil
	overflow := s.overflow
	s.overflow = false
	return map[string]any{"protocol": "workbench.inbox.v1", "identity": "MATCH", "frames": frames, "overflow": overflow, "socketConnected": s.socket, "stopped": s.ctx.Err() != nil || s.closed, "submissions": 0}
}

// On first connect and a native comment signal only. No periodic platform reads.
func (s *InboxSession) Snapshot(ctx context.Context) (any, error) {
	s.readMu.Lock()
	defer s.readMu.Unlock()
	if s.ctx.Err() != nil || !s.identity(s.page) {
		return nil, errors.New("IDENTITY")
	}
	bounded, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	p, e := s.page.Browser().Page(proto.TargetCreateTarget{URL: "about:blank"})
	if e != nil {
		return nil, e
	}
	defer p.Close()
	p = p.Context(bounded)
	list, e := NewNotificationAction(p).List(bounded, TabMentions, 100)
	if e != nil {
		return nil, errors.New("COMMENT_READ_INCOMPLETE")
	}
	if !s.identity(p) {
		return nil, errors.New("IDENTITY")
	}
	raw, e := NewNotificationAction(p).readTab(p, TabMentions)
	if e != nil {
		return nil, e
	}
	items := []map[string]any{}
	for _, v := range list.Items {
		if v.ID == "" || v.From.UserID == "" || v.From.UserID == s.Sender || v.CommentID == "" {
			continue
		}
		items = append(items, map[string]any{"id": v.ID, "sender": v.From.UserID, "nickname": v.From.Nickname, "body": v.CommentText, "published": v.Time, "postId": v.FeedID, "postTitle": v.FeedTitle, "commentId": v.CommentID, "channel": "COMMENT", "type": "TEXT"})
	}
	return map[string]any{"identity": "MATCH", "items": items, "complete": !raw.HasMore && raw.MessageList != nil && list.Filtered == 0, "coverage": "BOUNDED_NOTIFICATIONS", "submissions": 0}, nil
}

// Reads only bounded visible one-to-one conversations. Opening may mark platform read.
// Missing timestamp stays unknown. Never presents this window as complete history.
func (s *InboxSession) SnapshotDM(ctx context.Context) (any, error) {
	s.readMu.Lock()
	defer s.readMu.Unlock()
	if s.ctx.Err() != nil || !s.identity(s.page) {
		return nil, errors.New("IDENTITY")
	}
	bounded, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	p, e := s.page.Browser().Page(proto.TargetCreateTarget{URL: "https://www.xiaohongshu.com/chat"})
	if e != nil {
		return nil, e
	}
	defer p.Close()
	p = p.Context(bounded)
	if e = p.WaitLoad(); e != nil {
		return nil, e
	}
	var ids []string
	for i := 0; i < 20; i++ {
		v, err := p.Eval(`()=>JSON.stringify([...document.querySelectorAll('.xhs-im-conv-item[data-conv-kind="c2c"][data-conv-id]')].filter(e=>e.getBoundingClientRect().height>0).slice(0,10).map(e=>e.getAttribute('data-conv-id')))`)
		if err != nil {
			return nil, err
		}
		if json.Unmarshal([]byte(v.Value.Str()), &ids) != nil {
			return nil, errors.New("SHAPE")
		}
		if len(ids) > 0 {
			break
		}
		select {
		case <-bounded.Done():
			return nil, bounded.Err()
		case <-time.After(250 * time.Millisecond):
		}
	}
	if !s.identity(p) {
		return nil, errors.New("IDENTITY")
	}
	items := []map[string]any{}
	for _, id := range ids {
		if !validRecipient(id) || id == s.Sender {
			continue
		}
		els, err := p.Elements(`.xhs-im-conv-item[data-conv-kind="c2c"][data-conv-id="` + id + `"]`)
		if err != nil || len(els) != 1 {
			continue
		}
		if err = els[0].Click(proto.InputMouseButtonLeft, 1); err != nil {
			return nil, err
		}
		var rows []map[string]any
		for n := 0; n < 20; n++ {
			if !s.identity(p) {
				return nil, errors.New("IDENTITY")
			}
			v, err := p.Eval(`id=>{const a=[...document.querySelectorAll('.xhs-im-conv-item--active[data-conv-kind="c2c"]')];if(a.length!==1||a[0].getAttribute('data-conv-id')!==id||!(location.pathname==='/chat'||location.pathname==='/chat/'+id)||document.querySelector('.xhs-im-msg-skeleton'))return '';const name=document.querySelector('.xhs-im-chat-window__header-name')?.textContent?.trim()||'';return JSON.stringify([...document.querySelectorAll('.xhs-im-chat-window .xhs-im-msg-list .chat-item')].slice(-50).filter(e=>e.querySelector('.chat-item__bubble-row--left')&&!e.querySelector('.chat-item__bubble-row--right')).map(e=>({id:e.getAttribute('data-message-id')||'',sender:id,nickname:name.slice(0,100),body:(e.querySelector('.chat-item__bubble')?.textContent||'').slice(0,10000),published:null,channel:'DM',type:e.querySelector('.chat-item__bubble img')?'UNSUPPORTED':'TEXT'})))}`, id)
			if err != nil {
				return nil, err
			}
			if v.Value.Str() != "" && json.Unmarshal([]byte(v.Value.Str()), &rows) == nil {
				break
			}
			select {
			case <-bounded.Done():
				return nil, bounded.Err()
			case <-time.After(200 * time.Millisecond):
			}
		}
		for _, r := range rows {
			if r["id"] != "" {
				items = append(items, r)
			}
		}
	}
	return map[string]any{"identity": "MATCH", "items": items, "complete": false, "coverage": "VISIBLE_CONVERSATIONS_ONLY", "submissions": 0}, nil
}
