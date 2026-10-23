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
}
