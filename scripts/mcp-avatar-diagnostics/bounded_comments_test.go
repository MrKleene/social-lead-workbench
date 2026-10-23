package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

// All inputs below are synthetic. No browser, platform or stored session is used.
func bc(id string, declared int, kids ...map[string]any) map[string]any {
	if kids == nil {
		kids = []map[string]any{}
	}
	return map[string]any{"id": id, "userInfo": map[string]any{"userId": "synthetic-user", "nickname": "Synthetic", "image": "https://example.invalid/not-requested"}, "content": "合成🙂", "subCommentCount": declared, "subComments": kids}
}
func bs(more any, roots ...map[string]any) []byte {
	c := map[string]any{"list": roots}
	if more != nil {
		c["hasMore"] = more
	}
	v, _ := json.Marshal(map[string]any{"synthetic-post": map[string]any{"note": map[string]any{"noteId": "synthetic-post", "title": "Synthetic"}, "comments": c}})
	return v
}
func cfg() BoundedReadConfig { return BoundedReadConfig{1, 0, 3, 20, 100, 10, 1000} }

type fakeBounded struct {
	snapshots          [][]byte
	i, scrolls, clicks int
	action             string
	err                error
	cancel             context.CancelFunc
	notReady           bool
}

func (f *fakeBounded) Snapshot(context.Context) ([]byte, CoverageReady, error) {
	i := f.i
	if i >= len(f.snapshots) {
		i = len(f.snapshots) - 1
	}
	f.i++
	if f.notReady {
		return f.snapshots[i], CoverageReady{Document: "loading"}, nil
	}
	return f.snapshots[i], CoverageReady{Document: "complete", Container: true}, nil
}
func (f *fakeBounded) ScrollRoots(context.Context) error { f.scrolls++; return f.err }
func (f *fakeBounded) ExpandReply(context.Context, int, int) (string, error) {
	f.clicks++
	if f.cancel != nil {
		f.cancel()
		return "", context.Canceled
	}
	if f.err != nil {
		return "", f.err
	}
	if f.action != "" {
		return f.action, nil
	}
	return "CLICKED", nil
}
func run(t *testing.T, f *fakeBounded, c BoundedReadConfig) *BoundedReadReport {
	t.Helper()
	raw, r, e := runBoundedRead(context.Background(), f, "synthetic-post", c)
	if e != nil || len(raw) == 0 {
		t.Fatalf("failed %v", e)
	}
	if r.State == "COMPLETE" {
		t.Fatal("must never assert full coverage")
	}
	return r
}
func TestBoundedRootEndStillExpandsReplies(t *testing.T) {
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("root", 3, bc("a", 0))), bs(false, bc("root", 3, bc("a", 0), bc("b", 0), bc("c", 0)))}}
	r := run(t, f, cfg())
	if f.scrolls != 0 || f.clicks != 1 || r.Retained.Loaded.Replies != 3 || r.RootStop != "ROOT_END" || r.ReplyStop != "DECLARED_REPLIES_LOADED" {
		t.Fatalf("bad result %+v", r)
	}
}
func TestBoundedIndependentRootPaging(t *testing.T) {
	c := cfg()
	c.RootPages = 1
	c.ReplyClicks = 0
	f := &fakeBounded{snapshots: [][]byte{bs(true, bc("r", 1)), bs(false, bc("r", 1), bc("s", 0))}}
	r := run(t, f, c)
	if f.scrolls != 1 || f.clicks != 0 || r.ReplyStop != "REPLY_EXPANSION_DISABLED" || r.State != "PARTIAL" {
		t.Fatal(r)
	}
}
func TestBoundedStops(t *testing.T) {
	for _, code := range []string{"CLICK_FAILED", "BUTTON_NOT_FOUND", "UNKNOWN_REPLY_COUNT", "REPLY_THRESHOLD", "DOM_SCOPE_UNKNOWN"} {
		t.Run(code, func(t *testing.T) {
			r := run(t, &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 3, bc("a", 0)))}, action: code}, cfg())
			if r.Reason != code || r.Retained.Loaded.UniqueKnown != 2 {
				t.Fatal(r)
			}
		})
	}
}
func TestBoundedNoProgressAndBudget(t *testing.T) {
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2, bc("a", 0)))}}
	r := run(t, f, cfg())
	if r.ReplyStop != "NO_PROGRESS" || f.clicks != 1 {
		t.Fatal(r)
	}
	c := cfg()
	c.ReplyClicks = 1
	f = &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 3)), bs(false, bc("r", 3, bc("a", 0)))}}
	r = run(t, f, c)
	if r.ReplyStop != "REPLY_CLICK_BUDGET" || r.Retained.Loaded.UniqueKnown != 2 {
		t.Fatal(r)
	}
}
func TestBoundedRetainsOnErrors(t *testing.T) {
	for _, code := range []string{"PLATFORM_LIMIT", "READ_FAILED"} {
		f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2, bc("a", 0)))}, err: errors.New(code)}
		r := run(t, f, cfg())
		if r.Reason != code || r.Retained.Loaded.UniqueKnown != 2 {
			t.Fatal(r)
		}
	}
	ctx, cancel := context.WithCancel(context.Background())
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2, bc("a", 0)))}, cancel: cancel}
	_, r, e := runBoundedRead(ctx, f, "synthetic-post", cfg())
	if e != nil || r.Reason != "CANCELLED" || r.Retained.Loaded.UniqueKnown != 2 {
		t.Fatal(r, e)
	}
}
func TestBoundedAtomicConflict(t *testing.T) {
	a := bc("a", 0)
	b := bc("a", 0)
	b["content"] = "conflicting private text"
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 3, a)), bs(false, bc("r", 3, b, bc("b", 0)))}}
	r := run(t, f, cfg())
	if r.Reason != "IDENTITY_CONFLICT" || r.Retained.Loaded.UniqueKnown != 2 {
		t.Fatal(r)
	}
	encoded, _ := json.Marshal(r)
	if strings.Contains(string(encoded), "private") || strings.Contains(string(encoded), "synthetic-user") || strings.Contains(string(encoded), "https:") {
		t.Fatal("report leaks source")
	}
}
func TestBoundedDedupNestingAndNoIncidentalRoots(t *testing.T) {
	a := bc("a", 1, bc("nested", 0))
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2)), bs(false, bc("r", 2, a, a), bc("unrequested", 0))}}
	r := run(t, f, cfg())
	if r.Retained.Loaded.UniqueKnown != 3 || r.ExcludedRoots != 1 || r.State != "PARTIAL" {
		t.Fatal(r)
	}
}
func TestBoundedLimitsStripUnretainedChildren(t *testing.T) {
	c := cfg()
	c.MaxRoots = 1
	c.MaxComments = 1
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2, bc("a", 0), bc("b", 0)))}}
	r := run(t, f, c)
	if r.Retained.Loaded.UniqueKnown != 1 || r.Reason != "COMMENT_LIMIT" {
		t.Fatal(r)
	}
}
func TestBoundedMissingIsUnknown(t *testing.T) {
	r := run(t, &fakeBounded{snapshots: [][]byte{bs(nil, bc("r", 0))}}, cfg())
	if r.RootStop != "UNKNOWN_HAS_MORE" || r.State != "UNKNOWN" {
		t.Fatal(r)
	}
}
func TestBoundedConfigValidation(t *testing.T) {
	c := cfg()
	if !c.Valid() {
		t.Fatal("valid")
	}
	c.RootPages = 4
	if c.Valid() {
		t.Fatal("unbounded")
	}
	c = cfg()
	c.TimeoutMs = 0
	if c.Valid() {
		t.Fatal("zero timeout")
	}
	c = cfg()
	c.ReplyClicks = 13
	if c.Valid() {
		t.Fatal("clicks")
	}
}

func TestBoundedDeadlineAndRootBudget(t *testing.T) {
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2))}, err: context.DeadlineExceeded}
	r := run(t, f, cfg())
	if r.Reason != "TIMEOUT" || r.Retained.Loaded.Roots != 1 {
		t.Fatal(r)
	}
	c := cfg()
	c.RootPages = 1
	f = &fakeBounded{snapshots: [][]byte{bs(true, bc("r", 0)), bs(true, bc("r", 0), bc("s", 0))}}
	r = run(t, f, c)
	if r.RootStop != "ROOT_PAGE_BUDGET" || f.scrolls != 1 {
		t.Fatal(r)
	}
}
func TestBoundedMetadataAndInvalidSnapshot(t *testing.T) {
	a := bc("a", 0)
	b := bc("a", 0)
	b["userInfo"] = map[string]any{"userId": "synthetic-user", "nickname": "New display"}
	f := &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2, a)), bs(false, bc("r", 2, b, bc("b", 0)))}}
	r := run(t, f, cfg())
	if r.Retained.Loaded.UniqueKnown != 3 || r.Reason == "IDENTITY_CONFLICT" {
		t.Fatal(r)
	}
	f = &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2)), []byte(`{"synthetic-post":{"comments":{"list":[{}]}}}`)}}
	r = run(t, f, cfg())
	if r.Reason != "INVALID_RESPONSE" || r.Retained.Loaded.Roots != 1 {
		t.Fatal(r)
	}
}

func TestBoundedNullListRemainsUnknown(t *testing.T) {
	f := &fakeBounded{snapshots: [][]byte{bs(false)}}
	c := cfg()
	c.ReplyClicks = 0
	r := run(t, f, c)
	if r.Retained.List != "NULL" || r.Retained.Loaded != nil || r.State != "UNKNOWN" {
		t.Fatal(r)
	}
}

func TestBoundedReadinessAndResponseBudget(t *testing.T) {
	f := &fakeBounded{snapshots: [][]byte{bs(true, bc("r", 2))}, notReady: true}
	r := run(t, f, cfg())
	if r.Reason != "PAGE_NOT_READY" || f.clicks != 0 || f.scrolls != 0 {
		t.Fatal(r)
	}
	huge := bc("a", 0)
	huge["syntheticExtra"] = strings.Repeat("x", 530000)
	f = &fakeBounded{snapshots: [][]byte{bs(false, bc("r", 2)), bs(false, bc("r", 2, huge))}}
	r = run(t, f, cfg())
	if r.Reason != "RESPONSE_LIMIT" || r.Retained.Loaded.UniqueKnown != 1 {
		t.Fatal(r)
	}
}
