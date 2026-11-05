package xiaohongshu

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
)

func TestSearchPageReadinessWithBackgroundRequest(t *testing.T) {
	bin := os.Getenv("XHS_TEST_BROWSER")
	if bin == "" {
		t.Skip("set XHS_TEST_BROWSER to run browser regression")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/background" {
			<-r.Context().Done()
			return
		}
		w.Header().Set("Content-Type", "text/html")
		if r.URL.Path == "/missing" {
			_, _ = w.Write([]byte("<html><body>No search state</body></html>"))
			return
		}
		_, _ = w.Write([]byte(`<html><body><div>Search results</div><script>
   setTimeout(()=>{window.__INITIAL_STATE__={search:{feeds:{value:[]}}};},100);
   setTimeout(()=>fetch('/background'),150);
  </script></body></html>`))
	}))
	defer server.Close()
	launch := launcher.New().Bin(bin).Headless(true).Leakless(false)
	browser := rod.New().ControlURL(launch.MustLaunch()).MustConnect()
	defer launch.Cleanup()
	defer browser.MustClose()

	t.Run("legacy_exhausts_deadline", func(t *testing.T) {
		page := browser.MustPage()
		defer page.MustClose()
		ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		p := page.Context(ctx)
		p.MustNavigate(server.URL)
		_ = p.WaitStable(time.Second)
		if ctx.Err() == nil {
			t.Fatal("fixture did not reproduce background-network wait")
		}
	})
	t.Run("ready_despite_background_activity", func(t *testing.T) {
		page := browser.MustPage()
		defer page.MustClose()
		p := page.Timeout(2 * time.Second)
		p.MustNavigate(server.URL)
		start := time.Now()
		if err := p.Wait(rod.Eval(searchPageReadyJS)); err != nil {
			t.Fatal(err)
		}
		if time.Since(start) > time.Second {
			t.Fatal("search readiness waited for unrelated background activity")
		}
	})
	t.Run("missing_state_is_not_success", func(t *testing.T) {
		page := browser.MustPage()
		defer page.MustClose()
		p := page.Timeout(500 * time.Millisecond)
		p.MustNavigate(server.URL + "/missing")
		if err := p.Wait(rod.Eval(searchPageReadyJS)); err == nil {
			t.Fatal("missing search state was accepted")
		}
	})
}
