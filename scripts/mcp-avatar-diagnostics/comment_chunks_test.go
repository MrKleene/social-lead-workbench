package xiaohongshu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"testing"
	"time"
)

type chunkFixture struct {
	roots, total, perRoot                   int
	visible                                 int
	clicks, scrolls                         int
	fail                                    bool
	reverse                                 bool
	invalidTotal, emptyVisible, explicitEnd bool
}

func (f *chunkFixture) Snapshot(context.Context) ([]byte, CoverageReady, error) {
	if f.fail {
		return nil, CoverageReady{}, errors.New("PLATFORM_LIMIT")
	}
	rows := []any{}
	for i := 0; i < f.visible; i++ {
		kids := []any{}
		n := 0
		if i == 0 {
			n = f.perRoot
		}
		for j := 0; j < n; j++ {
			kids = append(kids, map[string]any{"id": fmt.Sprintf("c%d", j), "content": "synthetic", "userInfo": map[string]any{"userId": "u"}, "subCommentCount": "0", "subComments": []any{}})
		}
		rows = append(rows, map[string]any{"id": fmt.Sprintf("r%d", i), "content": "synthetic", "userInfo": map[string]any{"userId": "u"}, "subCommentCount": fmt.Sprint(n), "subComments": kids})
	}
	if f.reverse {
		for i, j := 0, len(rows)-1; i < j; i, j = i+1, j-1 {
			rows[i], rows[j] = rows[j], rows[i]
		}
	}
	total := fmt.Sprint(f.roots + f.perRoot)
	if f.invalidTotal {
		total = "unknown"
	}
	end := !(f.visible < f.roots)
	controls := 0
	scope := true
	b, _ := json.Marshal(map[string]any{"note": map[string]any{"note": map[string]any{"noteId": "note", "title": "synthetic", "interactInfo": map[string]any{"commentCount": total}}, "comments": map[string]any{"list": rows, "hasMore": f.visible < f.roots}}})
	return b, CoverageReady{Document: "complete", Container: true, EmptyVisible: f.emptyVisible, RootEndVisible: func() *bool {
		if f.explicitEnd {
			return &end
		}
		return nil
	}(), ReplyControls: func() *int {
		if f.explicitEnd {
			return &controls
		}
		return nil
	}(), RootScopeExact: func() *bool {
		if f.explicitEnd {
			return &scope
		}
		return nil
	}()}, nil
}
func (f *chunkFixture) ScrollRoots(context.Context) error {
	f.scrolls++
	f.visible += 10
	if f.visible > f.roots {
		f.visible = f.roots
	}
	return nil
}
func (f *chunkFixture) ExpandReply(context.Context, int, int) (string, error) {
	return "BUTTON_NOT_FOUND", nil
}
func chunkConfig() BoundedReadConfig {
	return BoundedReadConfig{Version: 1, RootPages: 3, ReplyClicks: 12, MaxRoots: 40, MaxComments: 100, MaxRepliesPerRoot: 30, TimeoutMs: 15000}
}
func TestChunksBeyondCumulativeLimitsAndAck(t *testing.T) {
	f := &chunkFixture{roots: 130, visible: 130, perRoot: 45}
	s, _ := NewCommentChunkSession(nil)
	count := 0
	var last *FeedDetailResponse
	for i := 0; i < 8; i++ {
		r, e := s.Read(context.Background(), f, "note", chunkConfig())
		if e != nil {
			t.Fatal(e)
		}
		if len(r.Chunk.Rows) > 100 {
			t.Fatal("oversized")
		}
		count += len(r.Chunk.Rows)
		before := f.scrolls
		again, e := s.Read(context.Background(), f, "note", chunkConfig())
		if e != nil || again != r || f.scrolls != before {
			t.Fatal("unacked chunk reran page")
		}
		if e = s.Ack("wrong"); e == nil {
			t.Fatal("bad ack")
		}
		if e = s.Ack(r.Chunk.Hash); e != nil {
			t.Fatal(e)
		}
		last = r
		if !r.Chunk.CanContinue {
			break
		}
	}
	if count != 175 || len(last.Chunk.Checkpoint.Marks) != 175 {
		t.Fatalf("count=%d", count)
	}
}
func TestChunksDurableReplayReorderMissingAndConflict(t *testing.T) {
	f := &chunkFixture{roots: 80, visible: 80}
	s, _ := NewCommentChunkSession(nil)
	r, e := s.Read(context.Background(), f, "note", chunkConfig())
	if e != nil {
		t.Fatal(e)
	}
	if len(r.Chunk.Rows) != 40 {
		t.Fatal("chunk")
	}
	// Simulate DB commit then process loss before ACK. All acknowledged IDs are
	// replayed by identity; reordered rows cannot cause duplicates or index skips.
	cp := r.Chunk.Checkpoint
	s, _ = NewCommentChunkSession(&cp)
	f.reverse = true
	r, e = s.Read(context.Background(), f, "note", chunkConfig())
	if e != nil {
		t.Fatal(e)
	}
	if len(r.Chunk.Rows) != 40 || r.Chunk.RemainingAnchors != 0 {
		t.Fatal("replay")
	}
	missing := &chunkFixture{roots: 20, visible: 20}
	s, _ = NewCommentChunkSession(&cp)
	r, e = s.Read(context.Background(), missing, "note", chunkConfig())
	if e != nil {
		t.Fatal(e)
	}
	if r.BoundedRead.Reason != "REPLAY_ANCHOR_MISSING" || len(r.Chunk.Rows) != 0 || r.Chunk.CanContinue {
		t.Fatal("missing anchor guessed")
	}
	cp.Marks[0].Digest = fmt.Sprintf("%064d", 0)
	s, _ = NewCommentChunkSession(&cp)
	if _, e = s.Read(context.Background(), f, "note", chunkConfig()); e == nil {
		t.Fatal("conflict")
	}
}
func TestChunksReplayBudgetAndCancellation(t *testing.T) {
	f := &chunkFixture{roots: 80, visible: 80}
	s, _ := NewCommentChunkSession(nil)
	r, _ := s.Read(context.Background(), f, "note", chunkConfig())
	cp := r.Chunk.Checkpoint
	s, _ = NewCommentChunkSession(&cp)
	f.visible = 10
	c := chunkConfig()
	c.RootPages = 1
	r, e := s.Read(context.Background(), f, "note", c)
	if e != nil {
		t.Fatal(e)
	}
	if !r.Chunk.Replaying || len(r.Chunk.Rows) != 0 || !r.Chunk.CanContinue {
		t.Fatal("bounded replay")
	}
	if e = s.Ack(r.Chunk.Hash); e != nil {
		t.Fatal(e)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, e = s.Read(ctx, f, "note", c)
	if e == nil {
		t.Fatal("cancel")
	}
}

func TestChunksEmptyExplicitAndUnknown(t *testing.T) {
	for _, explicit := range []bool{false, true} {
		f := &chunkFixture{roots: 0, visible: 0, invalidTotal: true, emptyVisible: explicit}
		s, _ := NewCommentChunkSession(nil)
		r, e := s.Read(context.Background(), f, "note", chunkConfig())
		if e != nil {
			t.Fatal(e)
		}
		if len(r.Chunk.Rows) != 0 {
			t.Fatal("empty")
		}
		if (r.BoundedRead.State == "COMPLETE") != explicit {
			t.Fatal("invalid total is not zero")
		}
	}
}

func TestChunksWireGolden(t *testing.T) {
	s, _ := NewCommentChunkSession(nil)
	r, e := s.Read(context.Background(), &chunkFixture{roots: 3, visible: 3, perRoot: 2}, "note", chunkConfig())
	if e != nil {
		t.Fatal(e)
	}
	r.Chunk.Token = fmt.Sprintf("%064d", 1)
	r.BoundedRead.ElapsedMs = 0
	b, e := json.Marshal(map[string]any{"feed_id": "note", "data": r})
	if e != nil {
		t.Fatal(e)
	}
	if os.Getenv("CRM_WRITE_SYNTHETIC_CHUNK_GOLDEN") == "1" {
		if e = os.WriteFile("comment-chunk-wire.json", b, 0600); e != nil {
			t.Fatal(e)
		}
		return
	}
	expected, e := os.ReadFile("comment-chunk-wire.json")
	if e != nil {
		t.Fatal(e)
	}
	if !bytes.Equal(bytes.TrimSpace(expected), b) {
		t.Fatal("synthetic wire contract changed")
	}
}

func TestChunksAggregateBeyondOldDiagnosticLimit(t *testing.T) {
	f := &chunkFixture{roots: 125, visible: 125, perRoot: 100, explicitEnd: true}
	s, _ := NewCommentChunkSession(nil)
	n := 0
	var last *FeedDetailResponse
	for i := 0; i < 8; i++ {
		r, e := s.Read(context.Background(), f, "note", chunkConfig())
		if e != nil {
			t.Fatal(e)
		}
		n += len(r.Chunk.Rows)
		if e = s.Ack(r.Chunk.Hash); e != nil {
			t.Fatal(e)
		}
		last = r
		if !r.Chunk.CanContinue {
			break
		}
	}
	if n != 225 || last.BoundedRead.State != "COMPLETE" || last.BoundedRead.ChunkSummary.Unique != 225 || last.BoundedRead.Final.Status != "LIMIT" {
		t.Fatal("bounded aggregate must not truncate to old 200-node diagnostic", n, last.BoundedRead.State)
	}
}

type timedChunkPage struct{ chunkFixture }

func (f *timedChunkPage) ScrollRoots(ctx context.Context) error { <-ctx.Done(); return ctx.Err() }
func TestChunksTimeoutKeepsReturnedChunkAndNoProgressStops(t *testing.T) {
	p := &timedChunkPage{chunkFixture{roots: 80, visible: 10}}
	s, _ := NewCommentChunkSession(nil)
	c := chunkConfig()
	c.TimeoutMs = 1000
	r, e := s.Read(context.Background(), p, "note", c)
	if e != nil || len(r.Chunk.Rows) != 10 || r.BoundedRead.Reason != "TIMEOUT" {
		t.Fatal("timeout lost valid data", e)
	}
	if e = s.Ack(r.Chunk.Hash); e != nil {
		t.Fatal(e)
	}
	p.fail = true
	if _, e = s.Read(context.Background(), p, "note", c); e == nil {
		t.Fatal("platform restriction must stop")
	}
}

func TestChunkReadyRetainsActualRootProgress(t *testing.T) {
	f := &chunkFixture{roots: 60, visible: 10}
	s, _ := NewCommentChunkSession(nil)
	r, err := s.Read(context.Background(), f, "note", chunkConfig())
	if err != nil {
		t.Fatal(err)
	}
	if r.BoundedRead.Actions.RootScrolls == 0 || r.BoundedRead.RootStop == "NOT_RUN" {
		t.Fatal("successful root action falsely reported as not run")
	}
}

// Synthetic delayed hydration, no platform or network access.
type hydrationFixture struct {
	chunkFixture
	snapshots int
	hydrateAt int
}

func (f *hydrationFixture) Snapshot(ctx context.Context) ([]byte, CoverageReady, error) {
	f.snapshots++
	if f.hydrateAt > 0 && f.snapshots >= f.hydrateAt {
		f.visible = f.roots
	}
	b, r, e := f.chunkFixture.Snapshot(ctx)
	var v map[string]any
	_ = json.Unmarshal(b, &v)
	v["note"].(map[string]any)["comments"].(map[string]any)["hasMore"] = false
	b, _ = json.Marshal(v)
	end := true
	r.RootEndVisible = &end
	return b, r, e
}
func TestChunksWaitForHydrationWithoutExtraActions(t *testing.T) {
	f := &hydrationFixture{chunkFixture: chunkFixture{roots: 2, visible: 1, explicitEnd: true}, hydrateAt: 3}
	s, _ := NewCommentChunkSession(nil)
	r, e := s.Read(context.Background(), f, "note", chunkConfig())
	if e != nil || r.BoundedRead.State != "COMPLETE" || len(r.Chunk.Rows) != 2 || f.scrolls != 0 || r.BoundedRead.Actions.ReplyClicks != 0 {
		t.Fatalf("%+v %v", r, e)
	}
}
func TestChunksUnresolvedCoverageStaysUnknown(t *testing.T) {
	f := &hydrationFixture{chunkFixture: chunkFixture{roots: 6, visible: 1, explicitEnd: true}}
	s, _ := NewCommentChunkSession(nil)
	start := time.Now()
	r, e := s.Read(context.Background(), f, "note", chunkConfig())
	if e != nil || r.BoundedRead.State != "UNKNOWN" || r.BoundedRead.Reason != "COVERAGE_INSUFFICIENT" || len(r.Chunk.Rows) != 1 || f.scrolls != 0 || r.BoundedRead.ReplyActions > 2 || time.Since(start) > 4*time.Second {
		t.Fatalf("%+v %v", r, e)
	}
}
func TestChunksHydrationHonorsCancellation(t *testing.T) {
	f := &hydrationFixture{chunkFixture: chunkFixture{roots: 6, visible: 1, explicitEnd: true}}
	s, _ := NewCommentChunkSession(nil)
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	r, e := s.Read(ctx, f, "note", chunkConfig())
	if e != nil || r.BoundedRead.State == "COMPLETE" || r.BoundedRead.Reason != "TIMEOUT" || len(r.Chunk.Rows) != 1 {
		t.Fatalf("%+v %v", r, e)
	}
}
