package xiaohongshu

import (
	"context"
	"encoding/json"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/launcher"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"
)

// Synthetic only: the production evaluator runs in a temporary browser, local pages only.
func TestSearchObservationBrowser(t *testing.T) {
	bin := os.Getenv("XHS_TEST_BROWSER")
	if bin == "" {
		t.Skip("loopback browser fixture requires XHS_TEST_BROWSER")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		w.Write([]byte("<html><body>synthetic fixture</body></html>"))
	}))
	defer server.Close()
	l := launcher.New().Bin(bin).Headless(true).Leakless(false)
	b := rod.New().ControlURL(l.MustLaunch()).MustConnect()
	defer l.Cleanup()
	defer b.MustClose()
	note := `{modelType:'note',id:'fixture-note',xsecToken:'SYNTHETIC_SECRET',noteCard:{displayTitle:'SYNTHETIC_PRIVATE_TEXT'}}`
	for _, tc := range []struct {
		name, script, state, stop string
		accepted                  int
	}{
		{"delayed notes", `window.__INITIAL_STATE__={search:{feeds:{value:[]}}};setTimeout(()=>{window.__INITIAL_STATE__.search.feeds.value=[` + note + `]},150)`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"legitimate empty still lacks completion proof", `window.__INITIAL_STATE__={search:{feeds:{value:[]}}}`, "EMPTY_UNCONFIRMED", "DEADLINE", 0},
		{"missing state", `delete window.__INITIAL_STATE__`, "STATE_MISSING", "DEADLINE", 0},
		{"missing feeds", `window.__INITIAL_STATE__={search:{}}`, "FEEDS_MISSING", "DEADLINE", 0},
		{"raw value", `window.__INITIAL_STATE__={search:{feeds:{_value:[` + note + `]}}}`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"conflicting wrappers", `window.__INITIAL_STATE__={search:{feeds:{value:[],_value:[` + note + `]}}}`, "AMBIGUOUS_FIELDS", "DEADLINE", 0},
		{"proxied array", `const raw=[` + note + `];const a=new Proxy(raw,{});window.__INITIAL_STATE__={search:{feeds:{value:a,_value:raw}}}`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"proxied nested note and cover", `const card=new Proxy({displayTitle:'SYNTHETIC_PRIVATE_TEXT',cover:new Proxy({urlDefault:'https://synthetic.invalid/cover'}, {})},{});const n=new Proxy({modelType:'note',id:'fixture-note',xsecToken:'SYNTHETIC_SECRET',noteCard:card},{});const raw=[{modelType:'hot_query',noteCard:false},n];window.__INITIAL_STATE__={search:{feeds:{value:new Proxy(raw,{}),_value:raw}}}`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"delayed proxy array", `window.__INITIAL_STATE__={search:{feeds:{value:[]}}};setTimeout(()=>{const a=[` + note + `];window.__INITIAL_STATE__.search.feeds={value:new Proxy(a,{}),_value:a}},150)`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"proxy invalid title remains rejected", `const a=[new Proxy({modelType:'note',id:'fixture-note',xsecToken:'SYNTHETIC_SECRET',noteCard:new Proxy({displayTitle:42},{})},{})];window.__INITIAL_STATE__={search:{feeds:{value:new Proxy(a,{}),_value:a}}}`, "NOTES_AVAILABLE", "DESERIALIZATION_FAILED", 0},
		{"array serialization cannot bypass root validation", `const a=[` + note + `];a.toJSON=()=>({fake:true});window.__INITIAL_STATE__={search:{feeds:{value:a,_value:a}}}`, "NOTES_AVAILABLE", "DESERIALIZATION_FAILED", 0},
		{"matching wrappers", `const a=[` + note + `];window.__INITIAL_STATE__={search:{feeds:{value:a,_value:a}}}`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"mixed cards filtered before parsing", `window.__INITIAL_STATE__={search:{feeds:{value:[{modelType:'hot_query',noteCard:false,index:'bad'},` + note + `,{modelType:'live_v2',index:'bad'}]}}}`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"unneeded note counters not decoded", `window.__INITIAL_STATE__={search:{feeds:{value:[{modelType:'note',id:'synthetic',xsecToken:'SYNTHETIC_SECRET',index:'bad',noteCard:{displayTitle:'合成',interactInfo:{likedCount:5}}}]}}}`, "NOTES_AVAILABLE", "NOTES_AVAILABLE", 1},
		{"title type fails with safe field", `window.__INITIAL_STATE__={search:{feeds:{value:[{modelType:'note',id:'synthetic',xsecToken:'SYNTHETIC_SECRET',noteCard:{displayTitle:5}}]}}}`, "NOTES_AVAILABLE", "DESERIALIZATION_FAILED", 0},
		{"known non notes", `window.__INITIAL_STATE__={search:{feeds:{value:[{modelType:'live_v2'},{modelType:'hot_query'}]}}}`, "FILTERED_NON_NOTES", "DEADLINE", 0},
		{"unknown types", `window.__INITIAL_STATE__={search:{feeds:{value:[{modelType:'SYNTHETIC_SECRET'}]}}}`, "UNKNOWN_ITEM_TYPES", "DEADLINE", 0},
		{"direct array unsupported", `window.__INITIAL_STATE__={search:{feeds:[]}}`, "UNSUPPORTED_SHAPE", "DEADLINE", 0},
		{"wrong value does not silently fallback", `window.__INITIAL_STATE__={search:{feeds:{value:null,_value:[` + note + `]}}}`, "AMBIGUOUS_FIELDS", "DEADLINE", 0},
		{"missing note identity", `window.__INITIAL_STATE__={search:{feeds:{value:[{modelType:'note'}]}}}`, "INVALID_NOTE", "DESERIALIZATION_FAILED", 0},
		{"access blocked", `document.body.innerHTML='<div class="blocked-wrapper">SYNTHETIC_PRIVATE_TEXT</div>';window.__INITIAL_STATE__={search:{feeds:{value:[` + note + `]}}}`, "ACCESS_BLOCKED", "BLOCKED", 0},
		{"wrong route", `history.replaceState(null,'','/explore');window.__INITIAL_STATE__={search:{feeds:{value:[` + note + `]}}}`, "ROUTE_UNCONFIRMED", "DEADLINE", 0},
	} {
		t.Run(tc.name, func(t *testing.T) {
			p := b.MustPage(server.URL + "/search_result?keyword=fixture")
			defer p.MustClose()
			p.MustWaitLoad()
			p.MustEval("() => {" + tc.script + "}")
			notes, d, err := observeSearchAtOrigin(context.Background(), p, "fixture", 450*time.Millisecond, server.URL)
			if d == nil || d.State != tc.state || d.Stop != tc.stop || len(notes) != tc.accepted {
				t.Fatalf("bad controlled result: %#v / %d", d, len(notes))
			}
			if tc.stop == "BLOCKED" || tc.stop == "DESERIALIZATION_FAILED" {
				if err == nil {
					t.Fatal("expected failure")
				}
			} else if err != nil {
				t.Fatal("unexpected failure")
			}
			safe, _ := json.Marshal(d)
			t.Log("SEARCH_OBSERVATION_FIXTURE " + string(safe))
			if tc.name == "proxied nested note and cover" {
				if notes[0].NoteCard == nil || notes[0].NoteCard.DisplayTitle == nil || *notes[0].NoteCard.DisplayTitle != "SYNTHETIC_PRIVATE_TEXT" || !strings.Contains(string(notes[0].NoteCard.Cover), "synthetic.invalid") {
					t.Fatal("nested proxy data lost")
				}
			}
			if tc.name == "array serialization cannot bypass root validation" && (d.ParseIssue == nil || d.ParseIssue.Field != "items" || d.ParseIssue.Actual != "OBJECT") {
				t.Fatal("non-array root incorrectly accepted")
			}
			if tc.name == "proxy invalid title remains rejected" && (d.ParseIssue == nil || d.ParseIssue.Field != "noteCard.displayTitle" || d.ParseIssue.Actual != "NUMBER") {
				t.Fatal("strict nested validation lost")
			}
			raw := SearchFailureJSON(searchObservedFailure(searchFailure("UNKNOWN", nil), d))
			if strings.Contains(raw, "SYNTHETIC_") {
				t.Fatal("private string escaped diagnostic")
			}
			if tc.name == "title type fails with safe field" && (d.ParseIssue == nil || d.ParseIssue.Field != "noteCard.displayTitle" || d.ParseIssue.Actual != "NUMBER") {
				t.Fatal("lost safe parsing issue")
			}
			if tc.name == "delayed notes" && (d.Observations < 2 || d.FirstRawCount == nil || *d.FirstRawCount != 0) {
				t.Fatal("missed initial empty observation")
			}
		})
	}
	t.Run("cancelled", func(t *testing.T) {
		p := b.MustPage(server.URL + "/search_result?keyword=fixture")
		defer p.MustClose()
		p.MustEval(`()=>window.__INITIAL_STATE__={search:{feeds:{value:[]}}}`)
		ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
		defer cancel()
		_, d, err := observeSearchAtOrigin(ctx, p, "fixture", time.Second, server.URL)
		if err == nil || d == nil || d.Stop != "CANCELLED" {
			t.Fatal("cancellation ignored")
		}
	})
}

// Pin the previously untested production boundary, not merely parser fixtures.
// Only structural categories are printed; synthetic payloads remain in memory.
func TestSearchProxyCDPBoundary(t *testing.T) {
	bin := os.Getenv("XHS_TEST_BROWSER")
	if bin == "" {
		t.Skip("loopback only")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.Write([]byte("<html><body>synthetic</body></html>")) }))
	defer server.Close()
	l := launcher.New().Bin(bin).Headless(true).Leakless(false)
	b := rod.New().ControlURL(l.MustLaunch()).MustConnect()
	defer l.Cleanup()
	defer b.MustClose()
	p := b.MustPage(server.URL + "/search_result?keyword=fixture")
	defer p.MustClose()
	p.MustWaitLoad()
	p.MustEval(`()=>{const raw=[{modelType:'note',id:'synthetic',xsecToken:'SYNTHETIC_SECRET'}];window.__INITIAL_STATE__={search:{feeds:{value:new Proxy(raw,{}),_value:raw}}}}`)
	v, err := p.Eval(searchObservationJS, "fixture", server.URL)
	if err != nil {
		t.Fatal("legacy evaluation failed")
	}
	var legacy struct {
		Diagnostic SearchObservation `json:"diagnostic"`
		Feeds      json.RawMessage   `json:"feeds"`
	}
	if v.Value.Unmarshal(&legacy) != nil {
		t.Fatal("legacy envelope failed")
	}
	_, issue := parseSearchNotes(legacy.Feeds)
	if legacy.Diagnostic.ValueType != "ARRAY" || issue == nil || issue.Field != "items" || issue.Actual != "OBJECT" {
		t.Fatal("legacy proxy failure not reproduced")
	}
	notes, d, err := observeSearchAtOrigin(context.Background(), p, "fixture", time.Second, server.URL)
	if err != nil || len(notes) != 1 || d.Stop != "NOTES_AVAILABLE" {
		t.Fatal("explicit JSON transport failed")
	}
	t.Log("CDP_PROXY_BOUNDARY: page ARRAY, legacy wire OBJECT; explicit JSON wire ARRAY, strict parse accepted")
}
