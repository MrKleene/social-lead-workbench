package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/input"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"time"
)

// Only normal, visible official IM controls. Never invokes a private platform API.
type DMSendDriver struct {
	chat             *DMConversationDriver
	typed, submitted bool
	existing         map[string]bool
}

func NewDMSendDriver(p *rod.Page, closeBrowser func()) *DMSendDriver {
	return &DMSendDriver{chat: NewDMConversationDriver(p, closeBrowser), existing: map[string]bool{}}
}

const dmSendDOM = `(sender,recipient,content)=>{
 const o=JSON.parse((` + dmConversationDOM + `)(sender,recipient));
 const out={safe:false,ready:false,empty:false,exact:false,focused:false,existingOutgoing:0,lastIncomingID:"",lastIncomingBody:"",outgoingAfterIncoming:false,matches:[],failed:false,pending:false};
 if(o.identity!=='MATCH'||o.route!=='CHAT'||o.risk||o.loginChallenge||!o.boundRecipient||o.conversationKind!=='c2c'||o.loading||!o.headerPresent)return JSON.stringify(out);
 const windows=document.querySelectorAll('.xhs-im-chat-window');if(windows.length!==1)return JSON.stringify(out);
 const win=windows[0],eds=win.querySelectorAll('.xhs-im-input-bar-editor[contenteditable="true"]');if(eds.length!==1)return JSON.stringify(out);
 const ed=eds[0],r=ed.getBoundingClientRect();out.ready=r.width>0&&r.height>0&&r.top>=0&&r.bottom<=innerHeight&&getComputedStyle(ed).visibility!=='hidden'&&ed.getAttribute('aria-disabled')!=='true'&&ed.getAttribute('data-placeholder')==='发消息...';
 const top=document.elementFromPoint(r.left+r.width/2,r.top+r.height/2);out.ready=out.ready&&(top===ed||ed.contains(top))&&!Array.from(document.querySelectorAll('[role="dialog"],.login-container,.login-qrcode')).some(e=>{const q=e.getBoundingClientRect();return q.width>0&&q.height>0&&getComputedStyle(e).visibility!=='hidden'});
 const notices=[...win.querySelectorAll('.xhs-im-hint__text'),...document.querySelectorAll('[role="alert"],.toast,[role="dialog"]')];
 if(notices.some(e=>/无法发送|不能发送|禁止|封禁|频繁|频率|验证码|安全验证|已达|不支持发|已被|对方不接收|发送失败|仅能发送/.test(e.innerText||e.textContent||'')))return JSON.stringify(out);
 out.safe=true;out.empty=ed.textContent==='';out.exact=ed.textContent===content&&!ed.querySelector('img,br');out.focused=document.activeElement===ed;
 for(const row of win.querySelectorAll('.xhs-im-msg-list .chat-item')){
  if(row.querySelector('.chat-item__bubble-row--left')&&!row.querySelector('.chat-item__bubble-row--right')){out.lastIncomingID=row.getAttribute('data-message-id')||'';out.lastIncomingBody=(row.querySelector('.chat-item__bubble')?.textContent||'').slice(0,10000);out.outgoingAfterIncoming=false;continue;}
  if(!row.querySelector('.chat-item__bubble-row--right'))continue;out.outgoingAfterIncoming=true;
  out.existingOutgoing++;
  const text=row.querySelector('.xhs-im-bubble__text');if(!text||text.textContent!==content)continue;
  const failed=!!row.querySelector('.chat-item__status-btn--failed'),pending=!!row.querySelector('.chat-item__status-loading');out.failed||=failed;out.pending||=pending;
  const id=row.getAttribute('data-message-id')||'';
  if(!failed&&!pending&&(/^[0-9]{10,30}$/.test(id)||(id.startsWith(sender+'.'+recipient+'.')&&/^[a-f0-9]{12,32}$/.test(id.slice(sender.length+recipient.length+2)))))out.matches.push(id);
 }
 return JSON.stringify(out);
}`

type dmState struct {
	Safe, Ready, Empty, Exact, Focused bool
	LastIncomingID, LastIncomingBody string
 OutgoingAfterIncoming bool
 ExistingOutgoing                   int
	Matches                            []string
	Failed, Pending                    bool
}

func (d *DMSendDriver) state(ctx context.Context, c exactreply.DMCommand) (o dmState, err error) {
	v, err := d.chat.entry.page.Context(ctx).Eval(dmSendDOM, c.SenderID, c.RecipientID, c.Content)
	if err != nil {
		return
	}
	err = json.Unmarshal([]byte(v.Value.Str()), &o)
	return
}
func (d *DMSendDriver) Open(ctx context.Context, c exactreply.DMCommand) error {
	o, _, err := d.chat.Inspect(ctx, exactreply.DMConversationTarget{Protocol: exactreply.DMConversationProtocol, InspectionID: c.AttemptID, AccountID: c.AccountID, SenderID: c.SenderID, RecipientID: c.RecipientID, MaxOpenings: 1})
	if err != nil {
		return err
	}
	if !o.BoundRecipient || o.ConversationKind != "c2c" || o.Identity != "MATCH" || o.Risk || o.LoginChallenge {
		return errors.New("CONVERSATION_UNVERIFIED")
	}
	return nil
}
func (d *DMSendDriver) Check(ctx context.Context, c exactreply.DMCommand, filled bool) error {
	s, err := d.state(ctx, c)
	if err != nil {
		return err
	}
	if !s.Safe || !s.Ready {
		return errors.New("CONVERSATION_UNSAFE")
	}
	if c.ReplyTo != nil && !exactreply.ReplyAnchorMatches(c,s.LastIncomingID,s.LastIncomingBody,s.OutgoingAfterIncoming) { return errors.New("INBOUND_ANCHOR_UNVERIFIED") }
 if c.ReplyTo == nil && s.ExistingOutgoing > 0 {
		return errors.New("EXISTING_OUTGOING_CONTACT")
	}
	if filled {
		if !s.Exact || !s.Focused {
			return errors.New("DRAFT_CHANGED")
		}
	} else {
  if !s.Empty { return errors.New("EXISTING_DRAFT") };for _,id:=range s.Matches {d.existing[id]=true}
 }
	return nil
}
func (d *DMSendDriver) Input(ctx context.Context, c exactreply.DMCommand) error {
	if d.typed {
		return errors.New("INPUT_ALREADY_USED")
	}
	if err := d.Check(ctx, c, false); err != nil {
		return err
	}
	d.typed = true
	es, err := d.chat.entry.page.Context(ctx).Elements(".xhs-im-chat-window .xhs-im-input-bar-editor[contenteditable=true]")
	if err != nil || len(es) != 1 {
		return errors.New("EDITOR_AMBIGUOUS")
	}
	return es[0].Input(c.Content)
}
func (d *DMSendDriver) Submit(ctx context.Context, c exactreply.DMCommand) (bool, error) {
	if d.submitted || !d.typed {
		return false, errors.New("SUBMISSION_ALREADY_USED")
	}
	if err := d.Check(ctx, c, true); err != nil {
		return false, err
	}
	d.submitted = true
	// Public official IM component dispatches handleSend on Enter (no Shift).
	return exactreply.SubmitOnce(ctx, func() error {
		if err := d.Check(ctx, c, true); err != nil {
			return err
		}
		return d.chat.entry.page.Context(ctx).Keyboard.Type(input.Enter)
	})
}
func (d *DMSendDriver) Receipt(ctx context.Context, c exactreply.DMCommand) (exactreply.DMReceipt, error) {
	return d.waitReceipt(ctx, c, "")
}
func (d *DMSendDriver) waitReceipt(ctx context.Context, c exactreply.DMCommand, want string) (exactreply.DMReceipt, error) {
	for i := 0; i < 40; i++ {
		s, err := d.state(ctx, c)
		if err != nil {
			return exactreply.DMReceipt{}, err
		}
		if !s.Safe {
			return exactreply.DMReceipt{}, errors.New("CONVERSATION_UNSAFE")
		}
		if s.Failed {
			return exactreply.DMReceipt{}, errors.New("PLATFORM_SEND_FAILED")
		}
		filtered:=[]string{};for _,id:=range s.Matches {if (want!="" && id==want)||(want=="" && !d.existing[id]) {filtered=append(filtered,id)}};s.Matches=filtered
 if len(s.Matches) > 1 {
			return exactreply.DMReceipt{}, errors.New("RECEIPT_AMBIGUOUS")
		}
		if len(s.Matches) == 1 && !s.Pending && (want == "" || s.Matches[0] == want) {
			return exactreply.DMReceipt{MessageID: s.Matches[0], SenderID: c.SenderID, RecipientID: c.RecipientID, ContentHash: c.ContentHash, ObservedAt: time.Now().UTC().Format(time.RFC3339Nano)}, nil
		}
		timer := time.NewTimer(200 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return exactreply.DMReceipt{}, ctx.Err()
		case <-timer.C:
		}
	}
	return exactreply.DMReceipt{}, errors.New("RECEIPT_UNVERIFIED")
}
func (d *DMSendDriver) Readback(ctx context.Context, c exactreply.DMCommand, r exactreply.DMReceipt) (exactreply.DMReceipt, error) {
	// A fresh page reopens the same bound recipient through the profile control.
	p, err := d.chat.entry.page.Browser().Page(proto.TargetCreateTarget{URL: "about:blank"})
	if err != nil {
		return exactreply.DMReceipt{}, err
	}
	verifier := NewDMConversationDriver(p, d.chat.entry.closeBrowser)
	o, _, err := verifier.Inspect(ctx, exactreply.DMConversationTarget{Protocol: exactreply.DMConversationProtocol, InspectionID: c.AttemptID, AccountID: c.AccountID, SenderID: c.SenderID, RecipientID: c.RecipientID, MaxOpenings: 1})
	if err != nil {
		return exactreply.DMReceipt{}, err
	}
	if !o.BoundRecipient || o.ConversationKind != "c2c" {
		return exactreply.DMReceipt{}, errors.New("READBACK_IDENTITY_UNVERIFIED")
	}
	d.chat = verifier
	return d.waitReceipt(ctx, c, r.MessageID)
}
func (d *DMSendDriver) Close(ctx context.Context) error { return d.chat.Close(ctx) }
