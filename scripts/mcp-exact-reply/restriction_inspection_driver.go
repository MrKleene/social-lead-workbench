package xiaohongshu

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"image/png"
	"sync/atomic"
	"time"
)

// Same MCP-owned page and saved session as other drivers; no ordinary Chrome.
// Only read operations: a post, or explore then an identity-bound self profile. No editor or send methods.
type RestrictionInspectionDriver struct {
	page                           *rod.Page
	closeBrowser                   func()
	cancelEvents                   context.CancelFunc
	eventsDone                     chan struct{}
	consoleErrors, networkFailures atomic.Int32
	used                           bool
}

func NewRestrictionInspectionDriver(p *rod.Page, closeBrowser func()) *RestrictionInspectionDriver {
	return &RestrictionInspectionDriver{page: p, closeBrowser: closeBrowser}
}

var _ exactreply.RestrictionInspector = (*RestrictionInspectionDriver)(nil)

const restrictionInspectionDOM = `(post,sender,secret) => {
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&r.bottom>0&&r.right>0&&r.top<innerHeight&&r.left<innerWidth&&getComputedStyle(e).visibility==='visible'&&getComputedStyle(e).display!=='none'};
 const unwrap=v=>v&&v.value!==undefined?v.value:v&&v._rawValue!==undefined?v._rawValue:v;
 const u=unwrap(window.__INITIAL_STATE__?.user?.userInfo);const stateId=u&&!u.guest?(u.userId||u.user_id||''):'';
 const self=[...new Set(Array.from(document.querySelectorAll('a[href*="/user/profile/"]')).filter(a=>a.textContent?.trim()==='我').map(a=>{try{const url=new URL(a.getAttribute('href'),location.origin);if(url.origin!=='https://www.xiaohongshu.com'||url.username||url.password)return '';return url.pathname.match(/^\/user\/profile\/([a-f0-9]{24})$/)?.[1]||''}catch{return ''}}).filter(Boolean))];
 let identity='UNKNOWN',identitySource='UNKNOWN';if(stateId||self.length){identitySource=stateId&&self.length?'STATE_AND_SELF_LINK':stateId?'INITIAL_STATE_USER_INFO':'SELF_PROFILE_LINK';identity=(stateId&&stateId!==sender)||self.some(id=>id!==sender)||self.length>1?'MISMATCH':'MATCH'};
 const exactOrigin=location.origin==='https://www.xiaohongshu.com';
 const profilePath='/user/profile/'+sender;
 const path=!exactOrigin?'/[EXTERNAL_ORIGIN]':location.pathname===profilePath?'/user/profile/[SENDER]':location.pathname==='/explore/'+post?'/explore/[POST]':['/explore','/login','/404'].includes(location.pathname)?location.pathname:'/[OTHER_ROUTE]';
 const classify=s=>/电脑设备登录超限|请重新登录/.test(s)?'SESSION_LIMIT':/接相关投诉该账户违反|其内容无法查看/.test(s)?'ACCOUNT_CONTENT_RESTRICTED':/封禁|封号/.test(s)?'BANNED':/禁言/.test(s)?'MUTED':/验证码|安全验证|身份验证/.test(s)?'VERIFICATION':/频繁|频率|限流/.test(s)?'RATE_LIMITED':/禁止评论|无法评论|评论已关闭|限制评论/.test(s)?'COMMENT_RESTRICTED':/审核中|等待审核/.test(s)?'REVIEW_PENDING':/仅自己可见/.test(s)?'VISIBILITY_RESTRICTED':'ACCESS_ERROR';
 const pattern=/接相关投诉该账户违反|其内容无法查看|电脑设备登录超限|请重新登录|封禁|封号|禁言|验证码|安全验证|身份验证|频繁|频率|限流|禁止评论|无法评论|评论已关闭|限制评论|审核中|等待审核|仅自己可见|访问受限|账号异常/;
 const sensitive=s=>!!s&&((secret && s.includes(secret))||/https?:\/\/|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}|\d{7,}|[A-Za-z0-9_+/=-]{24,}/.test(s));
 const warnings=[];let clip=null,clipNode=null;const reasons=[];
 const add=code=>{if(!reasons.includes(code))reasons.push(code)};
 // Capture only a visible restriction notice. Ordinary viewport content is never exported.
 const nodes=Array.from(document.querySelectorAll('.access-wrapper,.error-wrapper,.not-found-wrapper,.blocked-wrapper,[role="alert"],[role="dialog"],.toast,.message,.login-container')).filter(visible);
 if(path==='/user/profile/[SENDER]')nodes.push(...Array.from(document.querySelectorAll('.user-page .ban .content')).filter(visible));
 const loginChallenge=Array.from(document.querySelectorAll('.login-container')).some(visible);
 if(loginChallenge)add('LOGIN_CHALLENGE');
 for(const e of nodes){const text=e.innerText||'';if(!pattern.test(text))continue;if(warnings.length===5)break;warnings.push({code:classify(text),text:text.slice(0,2000)});if(!clip){clipNode=e;const r=e.getBoundingClientRect();clip={x:Math.max(0,r.x),y:Math.max(0,r.y),width:Math.min(r.width,innerWidth-Math.max(0,r.x),1280),height:Math.min(r.height,innerHeight-Math.max(0,r.y),900)};if(sensitive(text))add('NOTICE_SENSITIVE_TEXT')}}
 const intersects=e=>{if(!visible(e))return false;if(!clip)return true;const r=e.getBoundingClientRect();return r.left<clip.x+clip.width&&r.right>clip.x&&r.top<clip.y+clip.height&&r.bottom>clip.y};
 for(const e of document.querySelectorAll('input,textarea,[contenteditable="true"]'))if(intersects(e)&&((e.value||e.textContent||'').length||e.type==='password'))add('EDITABLE_CONTENT');
 for(const e of document.querySelectorAll('.qrcode-img,.login-qrcode,[data-qr-code]'))if(intersects(e))add('VISIBLE_QR');
 if(clip){
  for(const [x,y] of [[clip.x+1,clip.y+1],[clip.x+clip.width-1,clip.y+1],[clip.x+1,clip.y+clip.height-1],[clip.x+clip.width-1,clip.y+clip.height-1],[clip.x+clip.width/2,clip.y+clip.height/2]]) { const top=document.elementFromPoint(x,y);if(!top||!(top===clipNode||clipNode.contains(top)))add('OCCLUDED_NOTICE') }
  for(const e of document.querySelectorAll('img,canvas,video,iframe'))if(intersects(e))add('UNVERIFIED_MEDIA');
  let n=0;const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){if(++n>1500){add('TEXT_SCAN_LIMIT');break}const e=walker.currentNode.parentElement;if(e&&intersects(e)&&sensitive(walker.currentNode.textContent||''))add('REGION_SENSITIVE_TEXT')}
 }else add('NO_SAFE_REGION');
 return JSON.stringify({selfProfile:exactOrigin&&self.length===1&&self[0]===sender,loginChallenge,identity,identitySource,title:document.title,pathname:path,warnings,sensitiveUI:reasons.some(x=>x!=='NO_SAFE_REGION'),screenshotReasons:reasons,clip:clip||{x:0,y:0,width:0,height:0},scope:'VISIBLE_WARNING',ready:document.readyState});
}`

type restrictionDOM struct {
	SelfProfile       bool                            `json:"selfProfile"`
	LoginChallenge    bool                            `json:"loginChallenge"`
	Identity          string                          `json:"identity"`
	IdentitySource    string                          `json:"identitySource"`
	Title             string                          `json:"title"`
	Path              string                          `json:"pathname"`
	Warnings          []exactreply.RestrictionWarning `json:"warnings"`
	ScreenshotReasons []string                        `json:"screenshotReasons"`
	Sensitive         bool                            `json:"sensitiveUI"`
	Scope             string                          `json:"scope"`
	Ready             string                          `json:"ready"`
	Clip              struct {
		X      float64 `json:"x"`
		Y      float64 `json:"y"`
		Width  float64 `json:"width"`
		Height float64 `json:"height"`
	} `json:"clip"`
}

func (d *RestrictionInspectionDriver) Inspect(ctx context.Context, t exactreply.RestrictionTarget) (o exactreply.RestrictionObservation, err error) {
	if d.used {
		return o, errors.New("INSPECTION_ALREADY_USED")
	}
	d.used = true
	if ctx.Err() != nil {
		return o, ctx.Err()
	}
	p := d.page.Context(ctx)
	eventCtx, cancel := context.WithCancel(ctx)
	d.cancelEvents = cancel
	d.eventsDone = make(chan struct{})
	wait := p.Context(eventCtx).EachEvent(func(e *proto.RuntimeConsoleAPICalled) bool {
		if e.Type == proto.RuntimeConsoleAPICalledTypeError {
			return d.consoleErrors.Add(1) >= 32
		}
		return false
	}, func(_ *proto.NetworkLoadingFailed) bool { return d.networkFailures.Add(1) >= 32 })
	go func() { defer close(d.eventsDone); defer func() { _ = recover() }(); wait() }()

	profile := t.Protocol == exactreply.ProfileRestrictionProtocol
	destination := "https://www.xiaohongshu.com/explore"
	if !profile {
		destination = exactURL(exactreply.Command{PostID: t.PostID, Reference: t.Reference})
	}
	var dom restrictionDOM
	var navigation []exactreply.RestrictionStep
	defer func() { o.Navigation = navigation }()
	for step := 0; step < 2; step++ {
		if err = p.Navigate(destination); err != nil {
			return o, err
		}
		if err = p.WaitLoad(); err != nil {
			return o, err
		}
		for sample := 0; sample < 8; sample++ {
			if ctx.Err() != nil {
				return o, ctx.Err()
			}
			v, e := p.Eval(restrictionInspectionDOM, t.PostID, t.SenderID, t.Reference.Token)
			if e != nil {
				return o, e
			}
			raw := v.Value.Str()
			if len(raw) > 16000 {
				return o, errors.New("INSPECTION_TOO_LARGE")
			}
			if e = json.Unmarshal([]byte(raw), &dom); e != nil {
				return o, e
			}
			if len(dom.Warnings) > 0 || dom.LoginChallenge || dom.Identity == "MISMATCH" || dom.Path == "/[EXTERNAL_ORIGIN]" || sample == 7 {
				break
			}
			timer := time.NewTimer(200 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return o, ctx.Err()
			case <-timer.C:
			}
		}
		navigation = append(navigation, exactreply.RestrictionStep{ObservedAt: time.Now().UTC().Format(time.RFC3339Nano), Path: dom.Path, Identity: dom.Identity})
		if !profile || step == 1 || !profileNavigationAllowed(dom) {
			break
		}
		// Only a live exact self link authorizes the second navigation. No arbitrary URLs,
		// notification/message routes, menu clicks, query tokens or third-party origins.
		destination = "https://www.xiaohongshu.com/user/profile/" + t.SenderID
	}
	o = exactreply.RestrictionObservation{Navigation: navigation, Identity: dom.Identity, IdentitySource: dom.IdentitySource, Title: dom.Title, Path: dom.Path, Warnings: dom.Warnings, ScreenshotState: "UNAVAILABLE", ScreenshotReasons: dom.ScreenshotReasons, ConsoleErrors: int(d.consoleErrors.Load()), NetworkFailures: int(d.networkFailures.Load())}
	// No recovery navigation after a restriction, unknown route or account mismatch.
	if dom.Identity == "MISMATCH" {
		o.ScreenshotState = "IDENTITY_MISMATCH"
		return o, nil
	}
	if dom.Path == "/[EXTERNAL_ORIGIN]" {
		o.ScreenshotState = "EXTERNAL_ORIGIN"
		return o, nil
	}
	if len(dom.Warnings) == 0 {
		o.ScreenshotState = "NO_SAFE_REGION"
		return o, nil
	}
	if dom.Sensitive {
		o.ScreenshotState = "SENSITIVE_UI"
		return o, nil
	}
	if dom.Identity != "MATCH" {
		return o, nil
	}
	r := dom.Clip
	if r.Width <= 0 || r.Height <= 0 || r.Width > 1280 || r.Height > 900 || r.X < 0 || r.Y < 0 {
		return o, nil
	}
	if ctx.Err() != nil {
		o.ScreenshotState = "CANCELLED"
		return o, ctx.Err()
	}
	// fullPage=false: no viewport override, scroll, focus, input or DOM mutation.
	data, e := p.Screenshot(false, &proto.PageCaptureScreenshot{Format: proto.PageCaptureScreenshotFormatPng, Clip: &proto.PageViewport{X: r.X, Y: r.Y, Width: r.Width, Height: r.Height, Scale: 1}})
	if e != nil {
		return o, e
	}
	// Revalidate before exporting pixels: a newly appearing login overlay or changed
	// notice invalidates the capture. Bytes stay in memory and are never returned.
	verify, verifyErr := p.Eval(restrictionInspectionDOM, t.PostID, t.SenderID, t.Reference.Token)
	var after restrictionDOM
	if verifyErr != nil || len(verify.Value.Str()) > 16000 || json.Unmarshal([]byte(verify.Value.Str()), &after) != nil || !safeRestrictionCapture(dom, after) {
		o.ScreenshotState = "SENSITIVE_UI"
		o.ScreenshotReasons = []string{"UI_CHANGED"}
		return o, nil
	}
	if len(data) > 1500000 {
		o.ScreenshotState = "OVERSIZE"
		return o, nil
	}
	cfg, e := png.DecodeConfig(bytes.NewReader(data))
	if e != nil {
		return o, e
	}
	o.Screenshot = &exactreply.RestrictionImage{Mime: "image/png", Data: base64.StdEncoding.EncodeToString(data), Width: cfg.Width, Height: cfg.Height, Scope: dom.Scope}
	o.ScreenshotState = "CAPTURED"
	return o, nil
}
func (d *RestrictionInspectionDriver) Close(ctx context.Context) error {
	if d.cancelEvents != nil {
		d.cancelEvents()
	}
	if d.eventsDone != nil {
		select {
		case <-d.eventsDone:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	done := make(chan bool, 1)
	go func() { ok := false; defer func() { _ = recover(); done <- ok }(); d.closeBrowser(); ok = true }()
	select {
	case ok := <-done:
		if !ok {
			return errors.New("CLOSE_FAILED")
		}
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

// Pure decision boundary exercised without starting Chromium.
func profileNavigationAllowed(d restrictionDOM) bool {
	return d.Identity == "MATCH" && d.SelfProfile && d.Path == "/explore" && len(d.Warnings) == 0 && !d.LoginChallenge
}

func sameRestrictionWarnings(a, b []exactreply.RestrictionWarning) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func safeRestrictionCapture(before, after restrictionDOM) bool {
	return !after.Sensitive && after.Identity == "MATCH" && after.Path == before.Path && after.Clip == before.Clip && !after.LoginChallenge && sameRestrictionWarnings(after.Warnings, before.Warnings)
}
