package xiaohongshu

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"testing"
)

type rootScopeFixture struct {
	raw             []byte
	ready           CoverageReady
	action          string
	clicks, scrolls int
}

func (f *rootScopeFixture) Snapshot(context.Context) ([]byte, CoverageReady, error) {
	return f.raw, f.ready, nil
}
func (f *rootScopeFixture) ExpandReply(context.Context, int, int) (string, error) {
	f.clicks++
	if f.action != "" {
		return f.action, nil
	}
	return "BUTTON_NOT_FOUND", nil
}
func (f *rootScopeFixture) ScrollRoots(context.Context) error { f.scrolls++; return nil }
func scopeInput(roots int) (map[string]any, CoverageReady) {
	rows := []any{}
	for i := 0; i < roots; i++ {
		leaf := map[string]any{"id": fmt.Sprintf("leaf%d", i), "content": "synthetic reply", "userInfo": map[string]any{"userId": "synthetic-user"}, "targetComment": map[string]any{"id": fmt.Sprintf("root%d", i)}}
		rows = append(rows, map[string]any{"id": fmt.Sprintf("root%d", i), "content": "synthetic root", "userInfo": map[string]any{"userId": "synthetic-user"}, "subCommentCount": "1", "subComments": []any{leaf}})
	}
	end, scope, controls := true, true, 0
	return map[string]any{"note": map[string]any{"noteId": "synthetic-post", "title": "Synthetic", "interactInfo": map[string]any{"commentCount": fmt.Sprint(roots * 2)}}, "comments": map[string]any{"hasMore": false, "cursor": "opaque-terminal-cursor", "list": rows}}, CoverageReady{Document: "complete", Container: true, RootEndVisible: &end, RootScopeExact: &scope, ReplyControls: &controls}
}
func scopeRaw(feed map[string]any) []byte {
	b, _ := json.Marshal(map[string]any{"synthetic-post": feed})
	return b
}
func scopeRoot(feed map[string]any) map[string]any {
	return feed["comments"].(map[string]any)["list"].([]any)[0].(map[string]any)
}
func scopeLeaf(feed map[string]any) map[string]any {
	return scopeRoot(feed)["subComments"].([]any)[0].(map[string]any)
}
func TestRootReplyScopeRequiresIndependentClosure(t *testing.T) {
	cases := []struct {
		name     string
		change   func(map[string]any, *CoverageReady)
		complete bool
	}{
		{"six with scoped end", func(map[string]any, *CoverageReady) {}, true},
		{"observed six without end remains unknown", func(_ map[string]any, r *CoverageReady) { *r.RootEndVisible = false }, false},
		{"root counter missing", func(f map[string]any, _ *CoverageReady) { delete(scopeRoot(f), "subCommentCount") }, false},
		{"root counter null", func(f map[string]any, _ *CoverageReady) { scopeRoot(f)["subCommentCount"] = nil }, false},
		{"leaf null is not missing", func(f map[string]any, _ *CoverageReady) { scopeLeaf(f)["subCommentCount"] = nil }, false},
		{"leaf invalid is not missing", func(f map[string]any, _ *CoverageReady) { scopeLeaf(f)["subCommentCount"] = "?" }, false},
		{"leaf children null", func(f map[string]any, _ *CoverageReady) { scopeLeaf(f)["subComments"] = nil }, false},
		{"leaf explicit empty", func(f map[string]any, _ *CoverageReady) { scopeLeaf(f)["subComments"] = []any{} }, true},
		{"known zero without children array stays unknown", func(f map[string]any, _ *CoverageReady) { scopeLeaf(f)["subCommentCount"] = 0 }, false},
		{"root reply deficit", func(f map[string]any, _ *CoverageReady) { scopeRoot(f)["subCommentCount"] = 2 }, false},
		{"root reply excess", func(f map[string]any, _ *CoverageReady) { scopeRoot(f)["subCommentCount"] = 0 }, false},
		{"total conflict", func(f map[string]any, _ *CoverageReady) {
			f["note"].(map[string]any)["interactInfo"].(map[string]any)["commentCount"] = 7
		}, false},
		{"total missing", func(f map[string]any, _ *CoverageReady) {
			delete(f["note"].(map[string]any)["interactInfo"].(map[string]any), "commentCount")
		}, false},
		{"has more", func(f map[string]any, _ *CoverageReady) { f["comments"].(map[string]any)["hasMore"] = true }, false},
		{"unknown has more", func(f map[string]any, _ *CoverageReady) { delete(f["comments"].(map[string]any), "hasMore") }, false},
		{"invalid cursor", func(f map[string]any, _ *CoverageReady) { f["comments"].(map[string]any)["cursor"] = 1 }, false},
		{"missing cursor", func(f map[string]any, _ *CoverageReady) { delete(f["comments"].(map[string]any), "cursor") }, false},
		{"unknown DOM scope", func(_ map[string]any, r *CoverageReady) { *r.RootScopeExact = false }, false},
		{"remaining control", func(_ map[string]any, r *CoverageReady) { *r.ReplyControls = 1 }, false},
		{"page loading", func(_ map[string]any, r *CoverageReady) { r.Document = "loading" }, false},
		{"nested child not flat", func(f map[string]any, _ *CoverageReady) {
			scopeLeaf(f)["subComments"] = []any{map[string]any{"id": "nested", "content": "synthetic", "userInfo": map[string]any{"userId": "u"}}}
			f["note"].(map[string]any)["interactInfo"].(map[string]any)["commentCount"] = 7
		}, false},
		{"target differs from containment", func(f map[string]any, _ *CoverageReady) {
			scopeLeaf(f)["targetComment"] = map[string]any{"id": "leaf1"}
		}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			feed, ready := scopeInput(3)
			tc.change(feed, &ready)
			raw := scopeRaw(feed)
			sample := inspectCoverage(raw, "synthetic-post", ready)
			if rootScopedRepliesExhausted(sample) != tc.complete {
				t.Fatalf("sample closure=%v", rootScopedRepliesExhausted(sample))
			}
			_, rows, err := chunkSnapshot(raw, "synthetic-post")
			if err != nil {
				if tc.complete {
					t.Fatal(err)
				}
				return
			}
			summary := chunkCoverage(rows, raw, "synthetic-post", ready)
			if summary.Complete() != tc.complete {
				t.Fatalf("chunk closure=%v %+v", summary.Complete(), summary)
			}
			// No rewriting of the raw absent field, including after proving the root scope.
			if _, ok := scopeLeaf(feed)["subCommentCount"]; !ok && sample.Groups[1].Declared.State != "MISSING" {
				t.Fatal("rewrote missing")
			}
		})
	}
}
func TestRootReplyScopeChunkAndBoundedRead(t *testing.T) {
	feed, ready := scopeInput(3)
	f := &rootScopeFixture{raw: scopeRaw(feed), ready: ready}
	s, _ := NewCommentChunkSession(nil)
	result, err := s.Read(context.Background(), f, "synthetic-post", chunkConfig())
	if err != nil || result.BoundedRead.State != "COMPLETE" || len(result.Chunk.Rows) != 6 || result.BoundedRead.ChunkSummary.RootScopedLeafGroups != 3 {
		t.Fatalf("chunk result %v %+v", err, result)
	}
	_, r, err := runBoundedRead(context.Background(), f, "synthetic-post", cfg())
	if err != nil || r.State != "COMPLETE" {
		t.Fatalf("bounded %v %+v", err, r)
	}
	// Budget/action errors still terminate incomplete, regardless of geometric end.
	for _, reason := range []string{"CLICK_FAILED", "UNKNOWN_REPLY_COUNT", "DOM_SCOPE_UNKNOWN", "REPLY_THRESHOLD"} {
		f := &rootScopeFixture{raw: scopeRaw(feed), ready: ready, action: reason}
		s, _ := NewCommentChunkSession(nil)
		r, e := s.Read(context.Background(), f, "synthetic-post", chunkConfig())
		if e != nil || r.BoundedRead.State == "COMPLETE" {
			t.Fatal(reason, e)
		}
	}
	c := chunkConfig()
	c.ReplyClicks = 0
	f = &rootScopeFixture{raw: scopeRaw(feed), ready: ready}
	s, _ = NewCommentChunkSession(nil)
	result, err = s.Read(context.Background(), f, "synthetic-post", c)
	if err != nil || result.BoundedRead.State == "COMPLETE" {
		t.Fatal("reply budget bypass")
	}
}
func TestRootReplyScopeBeyondDiagnosticSample(t *testing.T) {
	feed, ready := scopeInput(120)
	raw := scopeRaw(feed)
	sample := inspectCoverage(raw, "synthetic-post", ready)
	if sample.Status != "LIMIT" {
		t.Fatal("expected sample limit")
	}
	_, rows, err := chunkSnapshot(raw, "synthetic-post")
	if err != nil {
		t.Fatal(err)
	}
	summary := chunkCoverage(rows, raw, "synthetic-post", ready)
	if !summary.Complete() || summary.RootScopedLeafGroups != 120 || summary.UnknownReplyGroups != 120 {
		t.Fatal(summary)
	}
}

func TestRootScopeWireGolden(t *testing.T) {
	feed, ready := scopeInput(3)
	f := &rootScopeFixture{raw: scopeRaw(feed), ready: ready}
	s, _ := NewCommentChunkSession(nil)
	result, err := s.Read(context.Background(), f, "synthetic-post", chunkConfig())
	if err != nil {
		t.Fatal(err)
	}
	result.Chunk.Token = fmt.Sprintf("%064d", 1)
	result.BoundedRead.ElapsedMs = 0
	b, err := json.Marshal(map[string]any{"feed_id": "synthetic-post", "data": result})
	if err != nil {
		t.Fatal(err)
	}
	if os.Getenv("CRM_WRITE_SYNTHETIC_CHUNK_GOLDEN") == "1" {
		if err = os.WriteFile("root-scope-wire.json", b, 0600); err != nil {
			t.Fatal(err)
		}
		return
	}
	expected, err := os.ReadFile("root-scope-wire.json")
	if err != nil || !bytes.Equal(bytes.TrimSpace(expected), b) {
		t.Fatal("root scope synthetic wire changed", err)
	}
}
