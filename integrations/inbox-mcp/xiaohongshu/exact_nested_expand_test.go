package xiaohongshu

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
)

func TestExactCommentPathKeepsContainmentSeparateFromTarget(t *testing.T) {
	rows := []Comment{{ID: "root", SubComments: []Comment{{ID: "child", SubComments: []Comment{{ID: "grandchild"}}}}}}
	path, ok := exactCommentPath(rows, "grandchild")
	if !ok || len(path) != 3 || path[0].ID != "root" || path[1].ID != "child" || path[2].ID != "grandchild" {
		t.Fatal(path, ok)
	}
	if _, ok = exactCommentPath(rows, "missing"); ok {
		t.Fatal("missing target found")
	}
}

const nestedExpandHTML = `<!doctype html><meta charset="utf-8"><title>Nested fixture</title>
<style>.comment-item{min-height:35px}.show-more{display:block;height:30px}</style>
<div class="note-scroller"><div class="parent-comment">
<div class="comment-item" id="comment-cccccccccccccccccccccccc"><a class="name" data-user-id="dddddddddddddddddddddddd">root</a><div class="right"><div class="interactions"><button class="reply">reply</button></div></div></div>
<button class="show-more">展开1条回复</button></div></div>
<script>
const child={id:'eeeeeeeeeeeeeeeeeeeeeeee',noteId:'bbbbbbbbbbbbbbbbbbbbbbbb',userInfo:{userId:'999999999999999999999999'},content:'child',subComments:[]};
const root={id:'cccccccccccccccccccccccc',noteId:'bbbbbbbbbbbbbbbbbbbbbbbb',userInfo:{userId:'dddddddddddddddddddddddd'},content:'root',subComments:[child]};
window.__INITIAL_STATE__={user:{userInfo:{value:{userId:'aaaaaaaaaaaaaaaaaaaaaaaa'}}},note:{noteDetailMap:{bbbbbbbbbbbbbbbbbbbbbbbb:{note:{noteId:'bbbbbbbbbbbbbbbbbbbbbbbb'},comments:{hasMore:false,list:[root]}}}}};
window.counts={expansions:0,inputs:0,submissions:0};
document.querySelector('.show-more').onclick=function(){window.counts.expansions++;this.insertAdjacentHTML('beforebegin','<div class="comment-item" id="comment-eeeeeeeeeeeeeeeeeeeeeeee"><a class="name" data-user-id="999999999999999999999999">child</a><div class="right"><div class="interactions"><button class="reply">reply</button></div></div></div>');this.remove()};
document.addEventListener('input',()=>window.counts.inputs++);
document.addEventListener('submit',()=>window.counts.submissions++);
</script>`

func TestExactReplyInspectExpandsNestedTargetOnce(t *testing.T) {
	chrome := os.Getenv("SELECTION_FIXTURE_CHROME")
	if chrome == "" {
		t.Skip("offline Chromium required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	l := launcher.New().Bin(chrome).UserDataDir(t.TempDir()).Headless(true).Proxy("http://127.0.0.1:9").Set("disable-background-networking").Leakless(false)
	endpoint, e := l.Launch()
	if e != nil {
		t.Fatal(e)
	}
	defer l.Kill()
	b := rod.New().ControlURL(endpoint)
	if e = b.Connect(); e != nil {
		t.Fatal(e)
	}
	defer b.Close()
	router := b.HijackRequests()
	if e = router.Add("*", "", func(h *rod.Hijack) {
		h.Response.SetHeader("Content-Type", "text/html")
		h.Response.SetBody(nestedExpandHTML)
	}); e != nil {
		t.Fatal(e)
	}
	go router.Run()
	defer router.Stop()
	p, e := b.Page(proto.TargetCreateTarget{URL: "about:blank"})
	if e != nil {
		t.Fatal(e)
	}
	d := NewExactReplyDriver(p, func() {})
	d.profileChecked = true
	c := exactreply.Command{AccountID: "synthetic", SenderID: "aaaaaaaaaaaaaaaaaaaaaaaa", PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", TargetID: "eeeeeeeeeeeeeeeeeeeeeeee", RecipientID: "999999999999999999999999", Reference: exactreply.Reference{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Token: "synthetic", Source: "pc_feed"}}
	snap, e := d.Inspect(ctx, c)
	if e != nil || snap.TargetID != c.TargetID || snap.TargetAuthor != c.RecipientID || snap.PostID != c.PostID {
		t.Fatal(snap, e)
	}
	if _, e = d.Inspect(ctx, c); e != nil {
		t.Fatal(e)
	}
	v, e := p.Eval(`()=>window.counts`)
	if e != nil || v.Value.Get("expansions").Int() != 1 || v.Value.Get("inputs").Int() != 0 || v.Value.Get("submissions").Int() != 0 {
		t.Fatal(v, e)
	}
}
