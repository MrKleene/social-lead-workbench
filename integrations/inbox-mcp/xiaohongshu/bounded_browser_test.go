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
 function draw(){box.innerHTML=comments.list.map((x,i)=>'<div class="parent-comment"><div class="comment-item">root</div>'+x.subComments.map(c=>'<div class="comment-item">reply</div>'+c.subComments.map(()=>'<div class="comment-item">nested</div>').join('')).join('')+(i===0&&step<2?'<button class="show-more">展开1条回复</button>':'')+'</div>').join('')+'<div style="height:600px"></div>'+(comments.hasMore?'':'<div class="end-container">THE END</div>');const b=box.querySelector('button');if(b)b.onclick=()=>{if(busy)return;busy=true;window.events.push('reply');setTimeout(()=>{if(step===0)root.subComments.push({...leaf('child'),subCommentCount:'1'});else root.subComments[0].subComments.push(leaf('grandchild'));step++;busy=false;draw()},650)}}
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
	if d.Actions.ReplyClicks != 2 || d.Actions.RootScrolls != 2 || d.Final.Ready.RootEndVisible == nil || !*d.Final.Ready.RootEndVisible || d.Final.Ready.ReplyControls == nil || *d.Final.Ready.ReplyControls != 0 || d.Final.Ready.RootScopeExact == nil || !*d.Final.Ready.RootScopeExact {
		t.Fatal("missing action/visible end evidence")
	}
	page.Close()
	// The second window resumes the same live page; it must not navigate or repeat clicks.
	page = browser.MustPage(server.URL)
	page.MustWaitLoad()
	session := &BoundedSession{}
	c.RootPages = 1
	first, e := session.Read(ctx, page, "synthetic-post", c)
	if e != nil || first.BoundedRead.Window != 1 || first.BoundedRead.Reason != "ROOT_PAGE_BUDGET" || first.BoundedRead.Retained.Loaded.UniqueKnown != 4 {
		t.Fatal(e, first)
	}
	second, e := session.Read(ctx, nil, "synthetic-post", c)
	if e != nil || second.BoundedRead.Window != 2 || second.BoundedRead.Retained.Loaded.UniqueKnown != 5 || second.BoundedRead.Actions.ReplyClicks != 0 {
		t.Fatal(e, second)
	}
	if got := page.MustEval(`()=>window.events.join(',')`).Str(); got != "reply,reply,root,root" {
		t.Fatal("replayed actions: " + got)
	}
}

// Synthetic large note: delayed paging and >30 replies in one discussion.
// ACK followed by a fresh session simulates committed data surviving process loss.
func TestChunkBrowserLargeAndRestart(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" {
		t.Skip("local Chromium required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 50*time.Second)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><style>.note-scroller{height:180px;overflow:auto}.comment-item{min-height:28px}</style><div class="note-scroller"></div><script>
 const leaf=id=>({id,content:'synthetic',userInfo:{userId:'u'},subCommentCount:'0',subComments:[]});let busy=false;const comments={hasMore:true,list:Array.from({length:10},(_,i)=>leaf('root'+i))};comments.list[0].subCommentCount='45';
 window.__INITIAL_STATE__={note:{noteDetailMap:{'synthetic-post':{note:{noteId:'synthetic-post',title:'synthetic',interactInfo:{commentCount:'175'}},comments}}}};window.events=[];const box=document.querySelector('.note-scroller');
 function draw(){box.innerHTML=comments.list.map((x,i)=>'<div class="parent-comment"><div class="comment-item">root</div>'+x.subComments.map(()=>'<div class="comment-item">reply</div>').join('')+(i===0&&x.subComments.length<45?'<button class="show-more">展开15条回复</button>':'')+'</div>').join('')+'<div style="height:400px"></div>'+(comments.hasMore?'':'<div class="end-container">THE END</div>');const b=box.querySelector('button');if(b)b.onclick=()=>{if(busy)return;busy=true;window.events.push('reply');setTimeout(()=>{const root=comments.list[0],n=root.subComments.length;root.subComments.push(...Array.from({length:15},(_,j)=>leaf('child'+(n+j))));busy=false;draw()},650)}}
 box.onscroll=()=>{if(busy||comments.list[0].subComments.length<45||!comments.hasMore||box.scrollTop+box.clientHeight<box.scrollHeight-3)return;busy=true;window.events.push('root');setTimeout(()=>{const n=comments.list.length;comments.list.push(...Array.from({length:Math.min(20,130-n)},(_,i)=>leaf('root'+(n+i))));comments.hasMore=comments.list.length<130;busy=false;draw()},600)};draw();</script>`))
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
	s, _ := NewCommentChunkSession(nil)
	c := chunkConfig()
	c.RootPages = 2
	c.ReplyClicks = 2
	c.TimeoutMs = 10000
	seen := map[string]bool{}
	var last *FeedDetailResponse
	for i := 0; i < 8; i++ {
		r, e := s.ReadPage(ctx, page, "synthetic-post", c)
		if e != nil {
			t.Fatal(e)
		}
		for _, row := range r.Chunk.Rows {
			if seen[row.Comment.ID] {
				t.Fatal("duplicate chunk")
			}
			seen[row.Comment.ID] = true
		}
		if e = s.Ack(r.Chunk.Hash); e != nil {
			t.Fatal(e)
		}
		last = r
		if !r.Chunk.CanContinue {
			break
		}
	}
	if len(seen) != 175 || last.BoundedRead.State != "COMPLETE" {
		t.Fatalf("count=%d reason=%s state=%s actions=%+v reply=%s events=%s", len(seen), last.BoundedRead.Reason, last.BoundedRead.State, last.BoundedRead.Actions, last.BoundedRead.ReplyStop, page.MustEval(`()=>window.events.join(",")`).Str())
	}
	if page.MustEval(`()=>window.events.filter(x=>x==='reply').length`).Int() != 3 {
		t.Fatal("reply clicks repeated or >30 blocked")
	}
	cp := last.Chunk.Checkpoint
	page.Close()
	page = browser.MustPage(server.URL)
	page.MustWaitLoad()
	s, _ = NewCommentChunkSession(&cp)
	for i := 0; i < 8; i++ {
		r, e := s.ReadPage(ctx, page, "synthetic-post", c)
		if e != nil {
			t.Fatal(e)
		}
		if len(r.Chunk.Rows) != 0 {
			t.Fatal("replayed stored data as new")
		}
		if e = s.Ack(r.Chunk.Hash); e != nil {
			t.Fatal(e)
		}
		last = r
		if !r.Chunk.CanContinue {
			break
		}
	}
	if last.Chunk.RemainingAnchors != 0 || last.BoundedRead.State != "COMPLETE" {
		t.Fatalf("restart incomplete: %s, anchors=%d", last.BoundedRead.Reason, last.Chunk.RemainingAnchors)
	}
}

func TestChunksBrowserDelayedParentReplies(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" {
		t.Skip("local Chromium required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><style>.note-scroller{height:180px;overflow:auto}.comment-item{height:28px}</style><div class="note-scroller"><div class="parent-comment"><div class="comment-item">synthetic parent</div></div><div class="end-container">THE END</div></div><script>
 const leaf=id=>({id,content:'synthetic',userInfo:{userId:'u'},subCommentCount:'0',subComments:[]});const root={...leaf('parent'),subCommentCount:'1'};
 window.__INITIAL_STATE__={note:{noteDetailMap:{'synthetic-post':{note:{noteId:'synthetic-post',title:'synthetic',interactInfo:{commentCount:'2'}},comments:{hasMore:false,list:[root]}}}}};window.readClicks=0;window.sendClicks=0;
 setTimeout(()=>{const p=document.querySelector('.parent-comment');p.insertAdjacentHTML('beforeend','<button class="show-more">展开1条回复</button>');p.querySelector('button').onclick=()=>{window.readClicks++;setTimeout(()=>{root.subComments.push(leaf('reply'));p.querySelector('button').remove();p.insertAdjacentHTML('beforeend','<div class="comment-item">synthetic reply</div>')},200)}},650);
 </script>`))
	}))
	defer server.Close()
	launch := launcher.New().Bin(binary).UserDataDir(t.TempDir()).Headless(true).Leakless(false).Set("disable-background-networking").Set("disable-component-update").Set("no-first-run")
	control, e := launch.Context(ctx).Launch()
	if e != nil {
		t.Fatal(e)
	}
	defer launch.Cleanup()
	b := rod.New().ControlURL(control).Context(ctx)
	if e = b.Connect(); e != nil {
		t.Fatal(e)
	}
	defer b.Close()
	page := b.MustPage(server.URL)
	page.MustWaitLoad()
	s, _ := NewCommentChunkSession(nil)
	result, e := s.ReadPage(ctx, page, "synthetic-post", chunkConfig())
	if e != nil {
		t.Fatal(e)
	}
	if result.BoundedRead.State != "COMPLETE" || len(result.Chunk.Rows) != 2 || page.MustEval(`()=>window.readClicks`).Int() != 1 || page.MustEval(`()=>window.sendClicks`).Int() != 0 {
		t.Fatalf("%+v", result.BoundedRead)
	}
}

// One large expansion, generic button text, Vue refs and a temporarily missing
// state after clicking. Recover by observing, never by clicking twice.
func TestChunksBrowserStateRecoveryAndFullExpansion(t *testing.T) {
	binary := os.Getenv("CRM_OFFLINE_CHROMIUM")
	if binary == "" { t.Skip("explicit local Chromium required") }
	ctx, cancel := context.WithTimeout(context.Background(), 25*time.Second)
	defer cancel()
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Write([]byte(`<!doctype html><meta charset="utf-8"><style>.note-scroller{height:180px;overflow:auto}.comment-item{height:25px}</style><div class="note-scroller"></div><script>
 const leaf=id=>({id,content:'synthetic',userInfo:{userId:'u'},subCommentCount:'0',subComments:[]});
 const root={...leaf('root'),subCommentCount:'161'};
 const map={'synthetic-post':{note:{value:{noteId:'synthetic-post',title:'synthetic',interactInfo:{commentCount:'162'}}},comments:{_rawValue:{hasMore:false,list:[root]}}}};
 const state={note:{value:{noteDetailMap:{_rawValue:map}}}};window.__INITIAL_STATE__=state;window.clicks=0;
 const box=document.querySelector('.note-scroller');
 function draw(){box.innerHTML='<div class="parent-comment"><div class="comment-item">root</div>'+root.subComments.map(()=>'<div class="comment-item">reply</div>').join('')+(root.subComments.length<161?'<button class="show-more">'+(root.subComments.length===0?'展开160条回复':'展开更多回复')+'</button>':'')+'</div><div class="end-container">THE END</div>';
 const b=box.querySelector('button');if(b)b.onclick=()=>{window.clicks++;window.__INITIAL_STATE__=null;setTimeout(()=>{const n=root.subComments.length;root.subComments.push(...Array.from({length:n===0?160:1},(_,i)=>leaf('child'+(n+i))));window.__INITIAL_STATE__=state;draw()},700)}}draw();</script>`))
	}))
	defer server.Close()
	l := launcher.New().Bin(binary).UserDataDir(t.TempDir()).Headless(true).Leakless(false).Set("no-sandbox").Set("disable-background-networking").Set("disable-component-update")
	url, err := l.Context(ctx).Launch(); if err != nil { t.Fatal(err) }; defer l.Cleanup()
	b := rod.New().ControlURL(url).Context(ctx); if err=b.Connect();err!=nil {t.Fatal(err)};defer b.Close()
	p := b.MustPage(server.URL); p.MustWaitLoad()
	s,_:=NewCommentChunkSession(nil); seen:=map[string]bool{};var result *FeedDetailResponse
	for i:=0;i<10;i++ {
		result,err=s.ReadPage(ctx,p,"synthetic-post",chunkConfig());if err!=nil {t.Fatal(err)}
		for _,row:=range result.Chunk.Rows {if seen[row.Comment.ID]{t.Fatal("duplicate comment")};seen[row.Comment.ID]=true}
		if err=s.Ack(result.Chunk.Hash);err!=nil {t.Fatal(err)}
		if !result.Chunk.CanContinue {break}
	}
	if len(seen)!=162||result.BoundedRead.State!="COMPLETE"||p.MustEval(`()=>window.clicks`).Int()!=2 {t.Fatalf("saved=%d state=%s reason=%s",len(seen),result.BoundedRead.State,result.BoundedRead.Reason)}
}
