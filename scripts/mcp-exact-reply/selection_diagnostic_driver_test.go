package xiaohongshu

import (
	"context"
	"encoding/json"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func TestExactReplySelectionDiagnosticHasNoSendMethods(t *testing.T) {
	for _, v := range []any{&SelectionDiagnosticDriver{}, &exactReplyPage{}} {
		typ := reflect.TypeOf(v)
		for _, method := range []string{"Select", "Submit", "Type", "Input", "Readback"} {
			if _, found := typ.MethodByName(method); found {
				t.Fatal(typ, method)
			}
		}
	}
	typ := reflect.TypeOf(exactreply.SelectionTarget{})
	for _, field := range []string{"Content", "ContentHash", "Submit", "Send"} {
		if _, found := typ.FieldByName(field); found {
			t.Fatal(field)
		}
	}
}

const selectionFixtureHTML = `<!doctype html><meta charset="utf-8"><title>Offline synthetic fixture</title><style>body{margin:0}#spacer{height:1600px}.comment-item{padding:20px}.reply{display:block;width:90px;height:40px}.engage-bar-container{position:fixed;bottom:0;background:white;min-height:80px;width:100%}.content-input{min-height:20px}.reply-content{display:none}</style>
<div id="spacer"></div><div class="comment-item" id="comment-cccccccccccccccccccccccc"><a data-user-id="dddddddddddddddddddddddd">avatar</a><img data-user-id="dddddddddddddddddddddddd"><a class="name" data-user-id="dddddddddddddddddddddddd">Synthetic author</a><div class="right"><div class="interactions"><button class="reply">reply</button></div></div><div class="comment-item" id="comment-child"><a data-user-id="child">child</a><div class="right"><div class="interactions"><button class="reply">child reply</button></div></div></div></div><div style="height:1200px"></div>
<div class="engage-bar-container"><div class="engage-bar"><div class="reply-content">Synthetic reply header</div><div class="input-box"><div class="content-edit"><p class="content-input" id="content-textarea" contenteditable="true"></p><span class="not-active inner-when-not-active">说点什么...</span></div></div><button id="submit">Submit</button></div></div>
<script>
const mode='FIXTURE_MODE';window.counts={clicks:0,childClicks:0,input:0,submit:0};
const comment={id:'cccccccccccccccccccccccc',noteId:'bbbbbbbbbbbbbbbbbbbbbbbb',userInfo:{userId:'dddddddddddddddddddddddd'},content:'Synthetic comment'};
window.__INITIAL_STATE__={user:{userInfo:{value:{userId:'aaaaaaaaaaaaaaaaaaaaaaaa'}}},note:{commentTarget:{value:{}},noteDetailMap:{bbbbbbbbbbbbbbbbbbbbbbbb:{note:{noteId:'bbbbbbbbbbbbbbbbbbbbbbbb'},comments:{list:[comment]}}}}};
const input=document.querySelector('.content-input');input.addEventListener('input',()=>window.counts.input++);document.querySelector('#submit').addEventListener('click',()=>window.counts.submit++);
document.querySelector('#comment-child .reply').addEventListener('click',()=>window.counts.childClicks++);
document.querySelector('#comment-cccccccccccccccccccccccc > .right .reply').addEventListener('click',()=>{window.counts.clicks++;if(mode==='nohandler')return;window.__INITIAL_STATE__.note.commentTarget.value=mode==='wrongbinding'?{...comment,id:'eeeeeeeeeeeeeeeeeeeeeeee'}:comment;document.querySelector('.engage-bar').classList.add('active');document.querySelector('.reply-content').style.display='block';document.querySelector('.not-active').remove();input.focus();if(mode==='afterdraft')input.textContent='preserve draft';if(mode==='afterban'){const e=document.createElement('div');e.className='blocked-wrapper';e.textContent='账号已被封禁';document.body.append(e)}});
if(mode==='draft')input.textContent='preserve draft';
if(mode==='unknown')delete window.__INITIAL_STATE__.note.commentTarget;
if(mode==='wrongauthor')document.querySelector('a.name').setAttribute('data-user-id','eeeeeeeeeeeeeeeeeeeeeeee');
if(mode==='ban'){const e=document.createElement('div');e.className='blocked-wrapper';e.textContent='账号已被封禁';document.body.append(e)}
</script>`

func TestExactReplySelectionDiagnosticBrowserOffline(t *testing.T) {
	chrome := os.Getenv("SELECTION_FIXTURE_CHROME")
	if chrome == "" {
		t.Skip("offline Chromium functional suite is a separate mandatory delivery check")
	}
	for _, mode := range []string{"normal", "mobile", "nohandler", "draft", "unknown", "wrongauthor", "wrongbinding", "afterdraft", "ban", "afterban", "cancel"} {
		t.Run(mode, func(t *testing.T) {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			// Fresh profile; proxy deny + fetch interception ensure no platform/network request escapes.
			l := launcher.New().Bin(chrome).UserDataDir(t.TempDir()).Headless(true).Proxy("http://127.0.0.1:9").Set("disable-background-networking").Set("disable-component-update").Leakless(false)
			endpoint, err := l.Launch()
			if err != nil {
				t.Fatal(err)
			}
			defer l.Kill()
			b := rod.New().ControlURL(endpoint)
			if err = b.Connect(); err != nil {
				t.Fatal(err)
			}
			defer b.Close()
			router := b.HijackRequests()
			if err = router.Add("*", "", func(h *rod.Hijack) {
				h.Response.SetHeader("Content-Type", "text/html; charset=utf-8")
				h.Response.SetBody(strings.ReplaceAll(selectionFixtureHTML, "FIXTURE_MODE", mode))
			}); err != nil {
				t.Fatal(err)
			}
			go router.Run()
			defer router.Stop()
			p, err := b.Page(proto.TargetCreateTarget{URL: "about:blank"})
			if err != nil {
				t.Fatal(err)
			}
			width := 1024
			if mode == "mobile" {
				width = 390
			}
			if err = p.SetViewport(&proto.EmulationSetDeviceMetricsOverride{Width: width, Height: 800, DeviceScaleFactor: 1, Mobile: false}); err != nil {
				t.Fatal(err)
			}
			counts := struct{ Clicks, ChildClicks, Input, Submit int }{}
			closed := false
			d := NewSelectionDiagnosticDriver(p, func() {
				v, e := p.Eval(`() => JSON.stringify(window.counts||{})`)

				if e == nil {
					json.Unmarshal([]byte(v.Value.Str()), &counts)
				}
				b.Close()
				closed = true
			})
			// Test-only profile bypass: this suite exercises the actual production target/selection implementation.
			d.selection.profileChecked = true
			target := exactreply.SelectionTarget{Protocol: exactreply.SelectionDiagnosticProtocol, InspectionID: "11111111-1111-1111-1111-111111111111", AccountID: "fixture", SenderID: "aaaaaaaaaaaaaaaaaaaaaaaa", PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", TargetID: "cccccccccccccccccccccccc", RecipientID: "dddddddddddddddddddddddd", Reference: exactreply.Reference{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Token: "synthetic", Source: "pc_feed"}, MaxReplySelections: 1}
			if mode == "cancel" {
				cancel()
			}
			journalDir, _ := filepath.EvalSymlinks(t.TempDir())
			os.Chmod(journalDir, 0700)
			journal, je := exactreply.OpenJournal(journalDir, target.InspectionID)
			if je != nil {
				t.Fatal(je)
			}
			defer journal.Close()
			ctx = exactreply.WithJournal(ctx, journal)
			r := (&exactreply.SelectionDiagnosticEngine{}).Execute(ctx, target, func() (exactreply.SelectionInspector, error) { return d, nil })
			if mode == "cancel" {
				if r.Diagnostic.Code != "CANCELLED" || counts.Clicks != 0 {
					t.Fatal(r, counts)
				}
				return
			}
			records, re := os.ReadFile(filepath.Join(journalDir, "reply-stage-"+target.InspectionID+".jsonl"))
			if re != nil {
				t.Fatal(re)
			}
			intents := 0
			for _, line := range strings.Split(strings.TrimSpace(string(records)), "\n") {
				var record exactreply.JournalRecord
				if json.Unmarshal([]byte(line), &record) != nil {
					t.Fatal("invalid journal")
				}
				switch record.Stage {
				case "INPUT_INTENT", "INPUT_FINISHED", "BEFORE_SUBMIT", "ATTEMPTED", "AFTER_SUBMIT", "READBACK":
					t.Fatal("send phase reachable", record.Stage)
				case "SELECT_CLICK_INTENT":
					intents++
				}
			}
			if intents > 1 || intents != counts.Clicks {
				t.Fatal("journal vs actual click", intents, counts)
			}
			if !closed || !r.ProcessStopped || counts.Input != 0 || counts.Submit != 0 || counts.ChildClicks != 0 || counts.Clicks > 1 {
				t.Fatal(r, counts, closed)
			}
			switch mode {
			case "normal", "mobile":
				if r.Kind != "SELECTED_EMPTY" || counts.Clicks != 1 || r.Trace.Before.Binding != "EMPTY" || r.Trace.Before.CenterHit != "OFFSCREEN" || r.Trace.Scrolled == nil || r.Trace.Scrolled.CenterHit != "EXACT" || r.Trace.Scrolled.Viewport.Width != width || r.Trace.After.Binding != "MATCH" {
					t.Fatal(r, counts)
				}
			case "nohandler":
				if r.Diagnostic.Code != "POST_SELECTION_BINDING_EMPTY" || counts.Clicks != 1 || r.Trace.After.Binding != "EMPTY" {
					t.Fatal(r, counts)
				}
			case "wrongbinding", "afterdraft", "afterban":
				if r.Kind == "SELECTED_EMPTY" || counts.Clicks != 1 {
					t.Fatal(r, counts)
				}
			default:
				if r.Kind == "SELECTED_EMPTY" || counts.Clicks != 0 {
					t.Fatal(r, counts)
				}
			}
			t.Logf("%s kind=%s code=%s clicks=%d input=%d submit=%d closed=%v", mode, r.Kind, r.Diagnostic.Code, counts.Clicks, counts.Input, counts.Submit, closed)
		})
	}
}

func TestExactReplySelectionCapabilityCannotReachInputOrSubmit(t *testing.T) {
	tree, err := parser.ParseFile(token.NewFileSet(), "exact_reply_driver.go", nil, 0)
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for _, decl := range tree.Decls {
		fn, ok := decl.(*ast.FuncDecl)
		if !ok || fn.Recv == nil {
			continue
		}
		recv, ok := fn.Recv.List[0].Type.(*ast.StarExpr)
		if !ok {
			continue
		}
		name, ok := recv.X.(*ast.Ident)
		if !ok || name.Name != "exactReplyPage" {
			continue
		}
		count++
		ast.Inspect(fn.Body, func(n ast.Node) bool {
			switch x := n.(type) {
			case *ast.SelectorExpr:
				for _, forbidden := range []string{"Type", "Input", "Submit", "Readback", "Select", "ContentHash"} {
					if x.Sel.Name == forbidden {
						t.Fatalf("selection capability references %s in %s", forbidden, fn.Name.Name)
					}
				}
			case *ast.Ident:
				if x.Name == "NewExactReplyDriver" || x.Name == "runReplyInput" || x.Name == "runReplySelect" {
					t.Fatal("send dependency", x.Name)
				}
			}
			return true
		})
	}
	if count < 10 {
		t.Fatal("base capability methods not inspected", count)
	}
}
