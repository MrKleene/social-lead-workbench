package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"time"
)

// Inspection-only: same MCP-owned browser; no conversation click, input or send.
type DMEntryDriver struct {
	page         *rod.Page
	closeBrowser func()
	used         bool
}

func NewDMEntryDriver(p *rod.Page, closeBrowser func()) *DMEntryDriver {
	return &DMEntryDriver{page: p, closeBrowser: closeBrowser}
}

const dmEntryDOM = `(sender)=>{
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).display!=='none'};
 const origin=location.origin==='https://www.xiaohongshu.com',route=origin&&location.pathname==='/explore'?'/explore':'OTHER';
 const unwrap=v=>v&&v.value!==undefined?v.value:v&&v._rawValue!==undefined?v._rawValue:v;
 const u=unwrap(window.__INITIAL_STATE__?.user?.userInfo),stateId=u&&!u.guest?(u.userId||u.user_id||''):'';
 const self=[...new Set(Array.from(document.querySelectorAll('a[href*="/user/profile/"]')).filter(a=>a.textContent?.trim()==='我').map(a=>{try{const url=new URL(a.getAttribute('href'),location.origin);return url.origin==='https://www.xiaohongshu.com'&&!url.username&&!url.password?url.pathname.match(/^\/user\/profile\/([a-f0-9]{24})$/)?.[1]||'':''}catch{return ''}}).filter(Boolean))];
 const identity=(stateId||self.length)?((stateId&&stateId!==sender)||self.some(x=>x!==sender)||self.length>1?'MISMATCH':'MATCH'):'UNKNOWN';
 const loginChallenge=Array.from(document.querySelectorAll('.login-container,.login-qrcode')).some(visible);
 const risk=Array.from(document.querySelectorAll('[role="alert"],[role="dialog"],.toast,.access-wrapper,.error-wrapper')).filter(visible).some(e=>/验证码|安全验证|频繁|频率|封禁|访问受限|账号异常|请重新登录/.test(e.innerText||''));
 const entries=[];if(origin&&route==='/explore'&&identity==='MATCH'&&!risk&&!loginChallenge){for(const e of document.querySelectorAll('a,button,[role="button"]')){if(!visible(e))continue;const label=(e.innerText||e.textContent||'').trim();if(!['私信','消息','聊天','通知'].includes(label))continue;let path='NONE';if(e.tagName==='A'){try{const url=new URL(e.getAttribute('href'),location.origin);path=url.origin===location.origin&&!url.username&&!url.password&&/^\/[a-zA-Z/-]{1,60}$/.test(url.pathname)?url.pathname:'OTHER'}catch{path='OTHER'}}entries.push({label,tag:e.tagName==='A'?'A':e.tagName==='BUTTON'?'BUTTON':'ROLE_BUTTON',path,disabled:!!e.disabled||e.getAttribute('aria-disabled')==='true'});if(entries.length===8)break}}
 return JSON.stringify({identity,route,loginChallenge,risk,entries});
}`

func (d *DMEntryDriver) Inspect(ctx context.Context, t exactreply.DMEntryTarget) (o exactreply.DMEntryObservation, err error) {
	if d.used || !t.Valid() {
		return o, errors.New("INVALID_INSPECTION")
	}
	d.used = true
	p := d.page.Context(ctx)
	if err = p.Navigate("https://www.xiaohongshu.com/explore"); err != nil {
		return
	}
	if err = p.WaitLoad(); err != nil {
		return
	}
	for sample := 0; sample < 8; sample++ {
		if ctx.Err() != nil {
			return o, ctx.Err()
		}
		v, e := p.Eval(dmEntryDOM, t.SenderID)
		if e != nil {
			return o, e
		}
		raw := v.Value.Str()
		if len(raw) > 4096 {
			return o, errors.New("OVERSIZE")
		}
		if e = json.Unmarshal([]byte(raw), &o); e != nil {
			return o, e
		}
		if o.Identity == "MISMATCH" || len(o.Entries) > 0 || o.Risk || o.LoginChallenge || o.Route != "/explore" || sample == 7 {
			return o, nil
		}
		timer := time.NewTimer(200 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return o, ctx.Err()
		case <-timer.C:
		}
	}
	return
}
func (d *DMEntryDriver) Close(ctx context.Context) error {
	if ctx.Err() != nil {
		return ctx.Err()
	}
	d.closeBrowser()
	return nil
}
