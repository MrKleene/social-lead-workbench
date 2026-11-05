package xiaohongshu

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/browser"
	"github.com/xpzouying/xiaohongshu-mcp/humanize"
)

// This diagnostic never calls PostComment or clicks a submit button.
func TestCommentSubmitReadOnlyDiagnostic(t *testing.T) {
	path := os.Getenv("XHS_DIAG_SEARCH")
	if path == "" {
		t.Skip("explicit diagnostic input required")
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	var envelope struct {
		Result struct {
			Content []struct {
				Text string `json:"text"`
			} `json:"content"`
		} `json:"result"`
	}
	if err = json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	var result struct {
		Feeds []struct {
			ID    string `json:"id"`
			Token string `json:"xsecToken"`
		} `json:"feeds"`
	}
	if err = json.Unmarshal([]byte(envelope.Result.Content[0].Text), &result); err != nil {
		t.Fatal(err)
	}
	var token string
	id := "6ad3adb1000000001301ac1f"
	for _, f := range result.Feeds {
		if f.ID == id {
			token = f.Token
		}
	}
	if token == "" {
		t.Fatal("missing original search token")
	}
	b := browser.NewBrowser(true, browser.WithFingerprintSeed(763730951))
	defer b.Close()
	page := b.NewPage()
	defer page.Close()
	page = page.Timeout(35 * time.Second)
	ctx := context.Background()
	start := time.Now()
	page.MustNavigate(makeFeedDetailURL(id, token))
	waitFeedPageReady(page)
	// Guard against an accidental submit while inspecting the draft.
	page.MustEval(`()=>document.addEventListener('click',e=>{if(e.target.closest('button.submit')){e.preventDefault();e.stopImmediatePropagation()}},true)`)
	if err = checkPageAccessible(page); err != nil {
		t.Fatal(err)
	}
	t.Log("page ready", time.Since(start))
	elem, err := page.Element("div.input-box div.content-edit span")
	if err != nil {
		t.Fatal(err)
	}
	if err = humanize.Click(elem); err != nil {
		t.Fatal(err)
	}
	humanize.Delay(ctx, humanize.AfterClick)
	input, err := page.Element("div.input-box div.content-edit p.content-input")
	if err != nil {
		t.Fatal(err)
	}
	if err = humanize.Type(ctx, input, "丢失宠物可以联系专业团队"); err != nil {
		t.Fatal(err)
	}
	humanize.Delay(ctx, humanize.AfterType)
	t.Log("draft entered", time.Since(start))
	data := page.MustEval(`()=>JSON.stringify({buttons:[...document.querySelectorAll('div.bottom button.submit')].map(x=>{const r=x.getBoundingClientRect();const e=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return {html:x.outerHTML,disabled:x.disabled,visible:!!(r.width&&r.height),rect:r.toJSON(),hit:e?.outerHTML.slice(0,600),matches:!!e&&(x===e||x.contains(e))}}),inputs:[...document.querySelectorAll('p.content-input')].map(x=>({text:x.innerText,html:x.outerHTML}))})`).Str()
	out := os.Getenv("XHS_DIAG_OUTPUT")
	if out == "" {
		t.Fatal("output path required")
	}
	out = filepath.Join(out, time.Now().Format("20060102T150405.000"))
	os.MkdirAll(out, 0700)
	if err = os.WriteFile(filepath.Join(out, "submit-dom.json"), []byte(data), 0600); err != nil {
		t.Fatal(err)
	}
	t.Log(data)
	buttons, err := page.Elements("div.bottom button.submit")
	if err != nil {
		t.Fatal(err)
	}
	for i, button := range buttons {
		pt, e := button.Timeout(2 * time.Second).Interactable()
		t.Logf("button %d point=%v interactable=%v", i, pt, e)
		if i == 0 {
			beg := time.Now()
			_, e = button.Timeout(3 * time.Second).WaitInteractable()
			t.Logf("first selector wait=%s error=%v", time.Since(beg), e)
			if e == nil && pt != nil {
				beg = time.Now()
				e = humanize.MoveTo(page, *pt)
				t.Logf("move to submit (NO click)=%s error=%v", time.Since(beg), e)
				beg = time.Now()
				e = button.Timeout(2 * time.Second).WaitEnabled()
				t.Logf("wait enabled=%s error=%v", time.Since(beg), e)
			}
		}
	}
	shot, err := page.Screenshot(false, &proto.PageCaptureScreenshot{Format: proto.PageCaptureScreenshotFormatPng})
	if err == nil {
		os.WriteFile(filepath.Join(out, "submit-draft.png"), shot, 0600)
	}
	t.Log("NO SUBMIT CLICK; draft browser closes now; total", time.Since(start))
}
