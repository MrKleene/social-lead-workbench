package xiaohongshu

import (
	"context"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"
)

// Local synthetic page only. Fresh empty browser profile; no production MCP executed.
func TestBoundedBrowserFixture(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" {
		t.Skip("explicit reviewed local Chromium required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><style>.note-scroller{height:180px;overflow:auto}.parent-comment{padding:8px}.comment-item{height:28px}</style><div class="note-scroller"><div class="parent-comment"><div class="comment-item">Synthetic root</div><div class="comment-item">Synthetic reply</div><button class="show-more">展开2条回复</button></div><div style="height:500px"></div></div><script>
 const leaf=id=>({id,content:'synthetic',userInfo:{userId:'u'},subCommentCount:'0',subComments:[]});const root={...leaf('root'),subCommentCount:'3',subComments:[leaf('a')]};
 window.__INITIAL_STATE__={note:{noteDetailMap:{'synthetic-post':{note:{noteId:'synthetic-post',title:'synthetic'},comments:{hasMore:false,list:[root]}}}}};window.clicks=0;
 document.querySelector('button').onclick=()=>{window.clicks++;root.subComments.push(leaf('b'),leaf('c'));document.querySelector('button').remove();document.querySelector('.parent-comment').insertAdjacentHTML('beforeend','<div class="comment-item">B</div><div class="comment-item">C</div>')};
 </script>`))
	}))
	defer server.Close()
	launch := launcher.New().Bin(binary).UserDataDir(t.TempDir()).Headless(true).Leakless(false).Set("disable-background-networking").Set("disable-component-update").Set("no-first-run")
	control, e := launch.Context(ctx).Launch()
	if e != nil {
		t.Fatal(e)
	}
	defer launch.Cleanup()
	browser := rod.New().ControlURL(control).Context(ctx)
	if e = browser.Connect(); e != nil {
		t.Fatal(e)
	}
	defer browser.Close()
	for _, budget := range []int{0, 1} {
		page := browser.MustPage(server.URL)
		page.MustWaitLoad()
		c := cfg()
		c.TimeoutMs = 5000
		c.ReplyClicks = budget
		result, e := boundedReadDetail(ctx, page, "synthetic-post", c)
		if e != nil {
			t.Fatal(e)
		}
		got := result.BoundedRead.Retained.Loaded.Replies
		want := 1
		if budget == 1 {
			want = 3
		}
		if got != want {
			t.Fatalf("reply count %d want %d, reason %s", got, want, result.BoundedRead.Reason)
		}
		if result.BoundedRead.RootActions != 0 || result.BoundedRead.State == "COMPLETE" {
			t.Fatal(result.BoundedRead)
		}
		n := page.MustEval(`()=>window.clicks`).Int()
		if n != budget {
			t.Fatalf("clicks %d", n)
		}
		page.Close()
	}
	page := browser.MustPage(server.URL)
	page.MustWaitLoad()
	page.MustEval(`()=>{window.__INITIAL_STATE__.note.noteDetailMap['synthetic-post'].comments={hasMore:false,list:[]};document.querySelector('.note-scroller').innerHTML='<div class="no-comments-text" style="display:none">这是一片荒地</div>'}`)
	c := cfg()
	c.TimeoutMs = 5000
	result, e := boundedReadDetail(ctx, page, "synthetic-post", c)
	if e != nil {
		t.Fatal(e)
	}
	if result.BoundedRead.State == "COMPLETE" || result.BoundedRead.Reason != "EMPTY_UNCONFIRMED" {
		t.Fatal("hidden marker must not prove empty")
	}
	page.MustEval(`()=>document.querySelector('.no-comments-text').style.display='block'`)
	result, e = boundedReadDetail(ctx, page, "synthetic-post", c)
	if e != nil {
		t.Fatal(e)
	}
	if result.BoundedRead.State != "COMPLETE" || !result.BoundedRead.Final.Ready.EmptyVisible || result.BoundedRead.Final.Total.State == "EXACT" {
		t.Fatal("visible explicit empty state, without inventing total")
	}
	page.Close()

}

// The real Rod driver: delayed root paging, descendant expansion and re-rendered
// controls. No platform endpoints, user profile, cookies or persisted sessions.
func TestReadThroughBrowserPagination(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" {
		t.Skip("local Chromium required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><style>.note-scroller{height:180px;overflow:auto}.parent-comment{padding:8px}.comment-item{min-height:28px}</style><div class="note-scroller"></div><script>
 const leaf=id=>({id,content:'synthetic',userInfo:{userId:'u'},subCommentCount:'0',subComments:[]});
 const root={...leaf('root1'),subCommentCount:'1'},comments={hasMore:true,list:[root]};
 window.__INITIAL_STATE__={note:{noteDetailMap:{'synthetic-post':{note:{noteId:'synthetic-post',title:'synthetic',interactInfo:{commentCount:'5'}},comments}}}};
 window.events=[];let busy=false,step=0;const box=document.querySelector('.note-scroller');
 function draw(){box.innerHTML=comments.list.map((x,i)=>'<div class="parent-comment"><div class="comment-item">root</div>'+x.subComments.map(c=>'<div class="comment-item">reply</div>'+c.subComments.map(()=>'<div class="comment-item">nested</div>').join('')).join('')+(i===0&&step<2?'<button class="show-more">展开1条回复</button>':'')+'</div>').join('')+'<div style="height:600px"></div>';const b=box.querySelector('button');if(b)b.onclick=()=>{if(busy)return;busy=true;window.events.push('reply');setTimeout(()=>{if(step===0)root.subComments.push({...leaf('child'),subCommentCount:'1'});else root.subComments[0].subComments.push(leaf('grandchild'));step++;busy=false;draw()},650)}}
 box.onscroll=()=>{if(busy||step<2||!comments.hasMore||box.scrollTop+box.clientHeight<box.scrollHeight-3)return;busy=true;window.events.push('root');setTimeout(()=>{comments.list.push(leaf('root'+(comments.list.length+1)));comments.hasMore=comments.list.length<3;busy=false;draw()},900)};
 draw();</script>`))
	}))
	defer server.Close()
	launch := launcher.New().Bin(binary).UserDataDir(t.TempDir()).Headless(true).Leakless(false).Set("disable-background-networking").Set("disable-component-update").Set("no-first-run")
	control, e := launch.Context(ctx).Launch()
	if e != nil {
		t.Fatal(e)
	}
	defer launch.Cleanup()
	browser := rod.New().ControlURL(control).Context(ctx)
	if e = browser.Connect(); e != nil {
		t.Fatal(e)
	}
	defer browser.Close()
	page := browser.MustPage(server.URL)
	page.MustWaitLoad()
	c := cfg()
	c.RootPages = 3
	c.ReplyClicks = 12
	c.TimeoutMs = 12000
	result, e := boundedReadDetail(ctx, page, "synthetic-post", c)
	if e != nil {
		t.Fatal(e)
	}
	d := result.BoundedRead
	if d.Retained.Loaded.Roots != 3 || d.Retained.Loaded.Replies != 2 || d.RootActions != 2 || d.State != "COMPLETE" {
		t.Fatalf("unexpected safe report: %+v", d)
	}
	if got := page.MustEval(`()=>window.events.join(',')`).Str(); got != "reply,reply,root,root" {
		t.Fatalf("action order %s", got)
	}
}
