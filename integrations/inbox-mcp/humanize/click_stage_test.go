package humanize

import (
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

func TestClickStages(t *testing.T) {
	bin := os.Getenv("XHS_TEST_BROWSER")
	if bin == "" {
		t.Skip("set XHS_TEST_BROWSER")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		_, _ = w.Write([]byte(`<button id="submit" style="position:absolute;left:20px;top:20px;width:120px;height:40px">Send</button><script>window.clicks=0;window.downs=0;document.querySelector('button').onclick=()=>clicks++;document.addEventListener('mousedown',()=>downs++);</script>`))
	}))
	defer server.Close()
	launch := launcher.New().Bin(bin).Headless(true).Leakless(false)
	browser := rod.New().ControlURL(launch.MustLaunch()).MustConnect()
	defer launch.Cleanup()
	defer browser.MustClose()
	for _, tc := range []struct{ name, setup, stage string }{
		{"covered", `()=>{const c=document.createElement('div');c.style='position:fixed;inset:0;z-index:99;background:white';document.body.append(c)}`, "等待元素可点击"},
		{"disabled", `()=>document.querySelector('button').disabled=true`, "等待按钮启用"},
		{"enabled", `()=>true`, ""},
	} {
		t.Run(tc.name, func(t *testing.T) {
			page := browser.MustPage(server.URL)
			defer page.MustClose()
			page.MustWaitLoad()
			page.MustEval(tc.setup)
			button := page.Timeout(time.Second).MustElement("#submit")
			err := Click(button)
			if tc.stage == "" {
				if err != nil {
					t.Fatal(err)
				}
				if page.MustEval(`()=>clicks`).Int() != 1 {
					t.Fatal("expected exactly one local click")
				}
				return
			}
			var ce *ClickError
			if !errors.As(err, &ce) || ce.Stage != tc.stage || ce.MayHaveClicked {
				t.Fatalf("unexpected classification: %v", err)
			}
			if page.MustEval(`()=>downs`).Int() != 0 {
				t.Fatal("pre-submit failure dispatched mousedown")
			}
		})
	}
}
