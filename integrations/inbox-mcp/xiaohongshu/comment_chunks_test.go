package xiaohongshu

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"reflect"
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

// 包装纯内存 fixture，失败快照故意携带不可用数据，不能覆盖已验证证据。
type chunkStateFixture struct {
	chunkFixture
	snapshotErr                              error
	failSnapshots                            int
	failInitially, clickReply, noProgress    bool
	snapshotCalls, failureCalls, expandCalls int
	delayFirstFailure                        time.Duration
	onFailure                                func()
	lastRaw                                  []byte
	lastReady                                CoverageReady
}

func (f *chunkStateFixture) Snapshot(ctx context.Context) ([]byte, CoverageReady, error) {
	f.snapshotCalls++
	if (f.failInitially || f.clicks+f.scrolls > 0) && (f.failSnapshots < 0 || f.failureCalls < f.failSnapshots) {
		if f.failureCalls == 0 && f.delayFirstFailure > 0 {
			timer := time.NewTimer(f.delayFirstFailure)
			defer timer.Stop()
			select {
			case <-ctx.Done():
				return nil, CoverageReady{}, ctx.Err()
			case <-timer.C:
			}
		}
		f.failureCalls++
		if f.onFailure != nil {
			f.onFailure()
		}
		return []byte(`{"invalid":true}`), CoverageReady{}, f.snapshotErr
	}
	b, r, e := f.chunkFixture.Snapshot(ctx)
	if e == nil {
		f.lastRaw, f.lastReady = b, r
	}
	return b, r, e
}

func (f *chunkStateFixture) ExpandReply(ctx context.Context, maxComments, maxReplies int) (string, error) {
	f.expandCalls++
	if f.clickReply && f.clicks == 0 {
		f.clicks++
		if !f.noProgress {
			f.perRoot = 2
		}
		return "CLICKED", nil
	}
	return f.chunkFixture.ExpandReply(ctx, maxComments, maxReplies)
}

func TestChunksStateUnavailableRecoversWithoutExtraActions(t *testing.T) {
	for _, action := range []string{"reply", "scroll", "initial"} {
		t.Run(action, func(t *testing.T) {
			f := &chunkStateFixture{
				chunkFixture:  chunkFixture{roots: 1, visible: 1, explicitEnd: true},
				snapshotErr:   fmt.Errorf("状态暂不可读: %w", errCoverageStateUnavailable),
				failSnapshots: 3, clickReply: action == "reply", failInitially: action == "initial",
			}
			wantRows, wantClicks, wantScrolls := 1, 0, 0
			if action == "reply" {
				wantRows, wantClicks = 3, 1
			} else if action == "scroll" {
				f.roots = 2
				wantRows, wantScrolls = 2, 1
			}
			s, _ := NewCommentChunkSession(nil)
			r, e := s.Read(context.Background(), f, "note", chunkConfig())
			if e != nil {
				t.Fatal(e)
			}
			if r.BoundedRead.State != "COMPLETE" || len(r.Chunk.Rows) != wantRows || len(r.Chunk.Checkpoint.Marks) != wantRows || f.failureCalls != 3 || f.clicks != wantClicks || f.scrolls != wantScrolls || r.BoundedRead.Actions.ReplyClicks != wantClicks || r.BoundedRead.Actions.RootScrolls != wantScrolls {
				t.Fatalf("恢复结果或动作计数不符: %+v, fixture=%+v", r, f)
			}
			if action == "reply" && (r.Chunk.Rows[1].Parent != "r0" || r.Chunk.Rows[2].Parent != "r0") {
				t.Fatal("恢复后漏掉回复或父子关系")
			}
		})
	}
}

func TestChunksStateUnavailableUsesFixedActionDeadline(t *testing.T) {
	f := &chunkStateFixture{
		chunkFixture: chunkFixture{roots: 1, visible: 1, explicitEnd: true},
		snapshotErr:  errCoverageStateUnavailable, failSnapshots: -1, clickReply: true,
		delayFirstFailure: time.Second,
	}
	s, _ := NewCommentChunkSession(nil)
	start := time.Now()
	r, e := s.Read(context.Background(), f, "note", chunkConfig())
	if e != nil {
		t.Fatal(e)
	}
	elapsed := time.Since(start)
	if r.BoundedRead.State != "PARTIAL" || r.BoundedRead.Reason != "READ_FAILED" || r.Chunk.CanContinue || len(r.Chunk.Rows) != 1 || f.clicks != 1 || f.scrolls != 0 || f.expandCalls != 1 || f.failureCalls < 2 || elapsed < 4500*time.Millisecond || elapsed > 6*time.Second {
		t.Fatalf("未复用固定动作期限或重复动作: %+v, fixture=%+v, elapsed=%v", r, f, elapsed)
	}
	_, records, err := chunkSnapshot(f.lastRaw, "note")
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(r.BoundedRead.Final, inspectCoverage(f.lastRaw, "note", f.lastReady)) || !reflect.DeepEqual(r.BoundedRead.Retained, r.BoundedRead.Final) || !reflect.DeepEqual(r.BoundedRead.ChunkSummary, chunkCoverage(records, f.lastRaw, "note", f.lastReady)) {
		t.Fatal("失败快照覆盖了已验证覆盖证据")
	}
	before := f.snapshotCalls
	again, e := s.Read(context.Background(), f, "note", chunkConfig())
	if e != nil || again != r || f.snapshotCalls != before || f.clicks != 1 {
		t.Fatal("未确认的失败窗口重放触发了页面动作")
	}
}

func TestChunksStateUnavailableWithoutActionIsBounded(t *testing.T) {
	f := &chunkStateFixture{snapshotErr: errCoverageStateUnavailable, failSnapshots: -1, failInitially: true}
	s, _ := NewCommentChunkSession(nil)
	start := time.Now()
	r, e := s.Read(context.Background(), f, "note", chunkConfig())
	elapsed := time.Since(start)
	if r != nil || e == nil || e.Error() != "READ_FAILED" || f.failureCalls < 2 || f.expandCalls != 0 || f.scrolls != 0 || elapsed < 4500*time.Millisecond || elapsed > 6*time.Second {
		t.Fatalf("无动作恢复未有界退出: response=%+v, err=%v, fixture=%+v, elapsed=%v", r, e, f, elapsed)
	}
}

func TestChunksStateUnavailableRecoveryDoesNotCompleteWithoutProgress(t *testing.T) {
	f := &chunkStateFixture{
		chunkFixture: chunkFixture{roots: 1, visible: 1, explicitEnd: true},
		snapshotErr:  errCoverageStateUnavailable, failSnapshots: 2, clickReply: true, noProgress: true,
	}
	s, _ := NewCommentChunkSession(nil)
	start := time.Now()
	r, e := s.Read(context.Background(), f, "note", chunkConfig())
	if e != nil {
		t.Fatal(e)
	}
	if r.BoundedRead.State != "PARTIAL" || r.BoundedRead.Reason != "NO_PROGRESS" || len(r.Chunk.Rows) != 1 || f.failureCalls != 2 || f.clicks != 1 || f.expandCalls != 1 || f.scrolls != 0 || time.Since(start) > 6*time.Second {
		t.Fatalf("恢复被误判为完成或延长动作等待: %+v, fixture=%+v", r, f)
	}
}

func TestChunksSnapshotFatalErrorsDoNotRetry(t *testing.T) {
	for _, tc := range []struct {
		name, reason string
		err          error
	}{
		{"platform", "PLATFORM_LIMIT", errors.New("PLATFORM_LIMIT")},
		{"protocol", "READ_FAILED", errors.New("READ_FAILED")},
		{"invalid_error", "INVALID_RESPONSE", errors.New("INVALID_RESPONSE")},
		{"identity", "IDENTITY_CONFLICT", errors.New("IDENTITY_CONFLICT")},
		{"same_text_not_sentinel", "READ_FAILED", errors.New("PAGE_STATE_UNAVAILABLE")},
		{"invalid_data", "INVALID_RESPONSE", nil},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := &chunkStateFixture{
				chunkFixture: chunkFixture{roots: 1, visible: 1, explicitEnd: true},
				snapshotErr:  tc.err, failSnapshots: -1, clickReply: true,
			}
			s, _ := NewCommentChunkSession(nil)
			r, e := s.Read(context.Background(), f, "note", chunkConfig())
			if e != nil {
				t.Fatal(e)
			}
			if r.BoundedRead.State != "PARTIAL" || r.BoundedRead.Reason != tc.reason || len(r.Chunk.Rows) != 1 || f.failureCalls != 1 || f.snapshotCalls != 2 || f.clicks != 1 || f.expandCalls != 1 || f.scrolls != 0 || !reflect.DeepEqual(r.BoundedRead.Final, inspectCoverage(f.lastRaw, "note", f.lastReady)) {
				t.Fatalf("致命快照失败被重试或丢失数据: %+v, fixture=%+v", r, f)
			}
		})
	}
}

func TestChunksStateUnavailableHonorsContext(t *testing.T) {
	for _, reason := range []string{"CANCELLED", "TIMEOUT"} {
		t.Run(reason, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			f := &chunkStateFixture{
				chunkFixture: chunkFixture{roots: 1, visible: 1, explicitEnd: true},
				snapshotErr:  errCoverageStateUnavailable, failSnapshots: -1, clickReply: true,
			}
			c := chunkConfig()
			c.TimeoutMs = 1000
			if reason == "CANCELLED" {
				f.onFailure = func() {
					if f.failureCalls == 2 {
						cancel()
					}
				}
			}
			s, _ := NewCommentChunkSession(nil)
			start := time.Now()
			r, e := s.Read(ctx, f, "note", c)
			if e != nil {
				t.Fatal(e)
			}
			if r.BoundedRead.State != "PARTIAL" || r.BoundedRead.Reason != reason || len(r.Chunk.Rows) != 1 || f.clicks != 1 || f.expandCalls != 1 || f.scrolls != 0 || time.Since(start) > 2*time.Second {
				t.Fatalf("未尊重上下文或丢失已验证数据: %+v, fixture=%+v", r, f)
			}
		})
	}
}
