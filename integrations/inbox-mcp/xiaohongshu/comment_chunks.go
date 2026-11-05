package xiaohongshu

// Chunked traversal keeps only fingerprints of acknowledged records. A chunk is
// immutable until the caller acknowledges its transaction; replay never fetches
// an external API or trusts an array offset as a cursor.
import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-rod/rod"
	"time"
	"unicode/utf16"
)

const chunkLedgerLimit = 2000

type CommentMark struct {
	ID     string `json:"id"`
	Parent string `json:"parent"`
	Digest string `json:"digest"`
}
type CommentCheckpoint struct {
	Version  int           `json:"version"`
	Sequence int           `json:"sequence"`
	Marks    []CommentMark `json:"marks"`
}

func (c CommentCheckpoint) Valid() bool {
	if c.Version != 1 || c.Sequence < 0 || c.Sequence > 100000 || len(c.Marks) > chunkLedgerLimit {
		return false
	}
	seen := map[string]bool{}
	for _, m := range c.Marks {
		if !boundedID.MatchString(m.ID) || m.Parent != "" && !seen[m.Parent] || seen[m.ID] || !boundedHandle.MatchString(m.Digest) {
			return false
		}
		seen[m.ID] = true
	}
	return true
}
func (c CommentCheckpoint) Hash() string {
	b, _ := json.Marshal(c)
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

type CommentChunkRequest struct {
	Mode       string             `json:"mode"`
	Token      string             `json:"token,omitempty"`
	Ack        string             `json:"ack,omitempty"`
	Checkpoint *CommentCheckpoint `json:"checkpoint,omitempty"`
}

func (r CommentChunkRequest) Valid() bool {
	return r.Mode == "START" && r.Token == "" && r.Ack == "" && (r.Checkpoint == nil || r.Checkpoint.Valid()) || (r.Mode == "RESUME" || r.Mode == "FINISH") && boundedHandle.MatchString(r.Token) && boundedHandle.MatchString(r.Ack) && r.Checkpoint == nil
}

type CommentChunkRow struct {
	Comment Comment `json:"comment"`
	Parent  string  `json:"parent"`
}

func (r CommentChunkRow) MarshalJSON() ([]byte, error) {
	b, e := json.Marshal(r.Comment)
	if e != nil {
		return nil, e
	}
	m := coverageObject(b)
	// Go's pinned DTO emits absent optional noteId as an empty string. Preserve
	// absence instead of sending a fabricated invalid identifier to the adapter.
	if id, ok := boundedString(m["noteId"]); ok && id == "" {
		delete(m, "noteId")
	}
	return json.Marshal(struct {
		Comment map[string]json.RawMessage `json:"comment"`
		Parent  string                     `json:"parent"`
	}{m, r.Parent})
}

type CommentChunk struct {
	Version          int               `json:"version"`
	Rows             []CommentChunkRow `json:"rows"`
	Checkpoint       CommentCheckpoint `json:"checkpoint"`
	Hash             string            `json:"hash"`
	Replaying        bool              `json:"replaying"`
	RemainingAnchors int               `json:"remainingAnchors"`
	CanContinue      bool              `json:"canContinue"`
	Token            string            `json:"token,omitempty"`
}

type ChunkCoverageSummary struct {
	Roots                int           `json:"roots"`
	Replies              int           `json:"replies"`
	Unique               int           `json:"unique"`
	Declared             CoverageCount `json:"declared"`
	HasMore              CoverageBool  `json:"hasMore"`
	RootScopedLeafGroups int           `json:"rootScopedLeafGroups,omitempty"`
	UnknownReplyGroups   int           `json:"unknownReplyGroups"`
	ReplyDeficit         int           `json:"replyDeficit"`
	ReplyExcess          int           `json:"replyExcess"`
	RootEndVisible       *bool         `json:"rootEndVisible"`
	ReplyControls        *int          `json:"replyControls"`
	ScopeExact           *bool         `json:"scopeExact"`
	EmptyVisible         bool          `json:"emptyVisible"`
}

func chunkCoverage(rows []chunkRecord, raw []byte, id string, ready CoverageReady) *ChunkCoverageSummary {
	feed := coverageObject(coverageObject(raw)[id])
	comments := coverageObject(feed["comments"])
	note := coverageObject(feed["note"])
	c := &ChunkCoverageSummary{Unique: len(rows), Declared: coverageCount(coverageObject(note["interactInfo"])["commentCount"]), HasMore: coverageBoolean(comments["hasMore"]), RootEndVisible: ready.RootEndVisible, ReplyControls: ready.ReplyControls, ScopeExact: ready.RootScopeExact, EmptyVisible: ready.EmptyVisible}
	counts := map[string]int{}
	for _, r := range rows {
		if r.mark.Parent == "" {
			c.Roots++
		} else {
			c.Replies++
			counts[r.mark.Parent]++
		}
	}
	for _, r := range rows {
		n := coverageCount(r.raw["subCommentCount"])
		if n.Value == nil {
			c.UnknownReplyGroups++
			continue
		}
		difference := *n.Value - counts[r.mark.ID]
		if difference > 0 {
			c.ReplyDeficit += difference
		} else {
			c.ReplyExcess -= difference
		}
	}
	// The full row ledger is checked even when diagnostic samples exceed 200.
	groups := []CoverageReplyGroup{}
	ordinals := map[string]int{}
	for i, r := range rows {
		ordinals[r.mark.ID] = i + 1
	}
	for i, r := range rows {
		children, shape := coverageArray(r.raw["subComments"])
		loaded := CoverageCount{State: shape}
		if shape == "EXACT" {
			n := len(children)
			loaded.Value = &n
		}
		g := CoverageReplyGroup{Ordinal: i + 1, Declared: coverageCount(r.raw["subCommentCount"]), Loaded: loaded}
		if r.mark.Parent != "" {
			parent := ordinals[r.mark.Parent]
			g.Parent = &parent
			g.Depth = 1
			// A nested child is not a flat root reply, even if its direct target is a root.
			for _, p := range rows {
				if p.mark.ID == r.mark.Parent && p.mark.Parent != "" {
					g.Depth = 2
					break
				}
			}
		}
		groups = append(groups, g)
	}
	sample := CoverageSample{Groups: groups, Loaded: &CoverageLoaded{Roots: c.Roots, Replies: c.Replies, UniqueKnown: c.Unique}}
	if n, ok := rootScopedLeaves(sample); ok && (coverageCursor(comments["cursor"]) == "EMPTY" || coverageCursor(comments["cursor"]) == "NONEMPTY") && ready.Document == "complete" && ready.Container {
		c.RootScopedLeafGroups = n
	}
	return c
}
func (c *ChunkCoverageSummary) Complete() bool {
	return c != nil && c.HasMore.State == "EXACT" && c.HasMore.Value != nil && !*c.HasMore.Value && c.UnknownReplyGroups == c.RootScopedLeafGroups && c.ReplyDeficit == 0 && c.ReplyExcess == 0 && c.ScopeExact != nil && *c.ScopeExact && c.ReplyControls != nil && *c.ReplyControls == 0 && ((c.Declared.Value != nil && *c.Declared.Value == c.Unique && c.RootEndVisible != nil && *c.RootEndVisible) || (c.Unique == 0 && c.EmptyVisible && c.Declared.Value == nil))
}

type chunkRecord struct {
	mark    CommentMark
	raw     map[string]json.RawMessage
	comment Comment
}
type CommentChunkSession struct {
	committed CommentCheckpoint
	pending   *FeedDetailResponse
	known     map[string]CommentMark
	observed  map[string]bool
	windows   int
}

func NewCommentChunkSession(cp *CommentCheckpoint) (*CommentChunkSession, error) {
	c := CommentCheckpoint{Version: 1, Marks: []CommentMark{}}
	if cp != nil {
		if !cp.Valid() {
			return nil, errors.New("INVALID_CHECKPOINT")
		}
		c = *cp
		c.Marks = append([]CommentMark{}, cp.Marks...)
	}
	s := &CommentChunkSession{committed: c, known: map[string]CommentMark{}, observed: map[string]bool{}}
	for _, m := range c.Marks {
		s.known[m.ID] = m
	}
	return s, nil
}
func (s *CommentChunkSession) Ack(hash string) error {
	if s.pending == nil || s.pending.Chunk == nil || s.pending.Chunk.Hash != hash {
		return errors.New("CHUNK_ACK_MISMATCH")
	}
	s.committed = s.pending.Chunk.Checkpoint
	for _, m := range s.committed.Marks {
		if _, exists := s.known[m.ID]; !exists {
			s.observed[m.ID] = true
		}
		s.known[m.ID] = m
	}
	s.pending = nil
	return nil
}
func (s *CommentChunkSession) Remaining() int {
	n := 0
	for id := range s.known {
		if !s.observed[id] {
			n++
		}
	}
	return n
}

// Validate source identities/text before any emission. Unknown raw keys are never
// put in a checkpoint. Flat rows preserve the actual containment parent only.
func chunkSnapshot(raw []byte, id string) (FeedDetail, []chunkRecord, error) {
	var note FeedDetail
	if len(raw) > 2*1024*1024 {
		return note, nil, errors.New("RESPONSE_LIMIT")
	}
	feed := coverageObject(coverageObject(raw)[id])
	if feed == nil || json.Unmarshal(feed["note"], &note) != nil || note.NoteID != id {
		return note, nil, errors.New("INVALID_RESPONSE")
	}
	list, shape := coverageArray(coverageObject(feed["comments"])["list"])
	if shape != "EXACT" {
		return note, nil, errors.New("INVALID_RESPONSE")
	}
	out := []chunkRecord{}
	seen := map[string]CommentMark{}
	visits := 0
	var visit func([]json.RawMessage, string, int) error
	visit = func(rows []json.RawMessage, parent string, depth int) error {
		if depth > 8 && len(rows) > 0 {
			return errors.New("DEPTH_LIMIT")
		}
		for _, b := range rows {
			visits++
			if visits > chunkLedgerLimit {
				return errors.New("LEDGER_LIMIT")
			}
			m := coverageObject(b)
			cid, ok := boundedString(m["id"])
			if !ok || !boundedID.MatchString(cid) {
				return errors.New("INVALID_RESPONSE")
			}
			uid, ok := boundedString(coverageObject(m["userInfo"])["userId"])
			if !ok || !boundedID.MatchString(uid) {
				return errors.New("INVALID_RESPONSE")
			}
			text, ok := boundedString(m["content"])
			if !ok || len(utf16.Encode([]rune(text))) > 10000 {
				return errors.New("INVALID_RESPONSE")
			}
			if n, exists := m["noteId"]; exists {
				v, ok := boundedString(n)
				if !ok || v != id {
					return errors.New("IDENTITY_CONFLICT")
				}
			}
			digestText := ""
			for _, v := range []string{id, cid, parent, uid, text} {
				digestText += fmt.Sprintf("%d:%s", len([]byte(v)), v)
			}
			h := sha256.Sum256([]byte(digestText))
			mark := CommentMark{ID: cid, Parent: parent, Digest: hex.EncodeToString(h[:])}
			if old, exists := seen[cid]; exists {
				if old != mark {
					return errors.New("IDENTITY_CONFLICT")
				}
				continue
			}
			seen[cid] = mark
			// Decode display metadata with the already reviewed avatar normalization; strip children before decoding.
			flat := map[string]json.RawMessage{}
			for k, v := range m {
				if k != "subComments" {
					flat[k] = v
				}
			}
			flat["subComments"] = json.RawMessage("[]")
			fb, _ := json.Marshal(flat)
			var comment Comment
			if json.Unmarshal(fb, &comment) != nil {
				return errors.New("INVALID_RESPONSE")
			}
			out = append(out, chunkRecord{mark: mark, raw: m, comment: comment})
			children, state := coverageArray(m["subComments"])
			if state == "INVALID" {
				return errors.New("INVALID_RESPONSE")
			}
			if e := visit(children, cid, depth+1); e != nil {
				return e
			}
		}
		return nil
	}
	e := visit(list, "", 0)
	return note, out, e
}
func (s *CommentChunkSession) Read(ctx context.Context, p boundedPage, id string, c BoundedReadConfig) (*FeedDetailResponse, error) {
	if s.pending != nil {
		return s.pending, nil
	} // Lost response can be reread without another page action.
	if !c.Valid() || s.windows >= 8 {
		return nil, errors.New("CONTINUATION_LIMIT")
	}
	s.windows++
	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, time.Duration(c.TimeoutMs)*time.Millisecond)
	defer cancel()
	report := &BoundedReadReport{Version: 1, Window: s.windows, State: "PARTIAL", Reason: "VISIBLE_WINDOW_READ", RootStop: "NOT_RUN", ReplyStop: "NOT_RUN", Initial: coverageUnavailable(), Final: coverageUnavailable(), Retained: coverageUnavailable(), Actions: &BoundedActionEvidence{}}
	delta := []chunkRecord{}
	pendingIDs := map[string]CommentMark{}
	newRoots := 0
	replayBefore := s.Remaining()
	lastFingerprint := ""
	stagnant := 0
	var note FeedDetail
	var raw []byte
	var ready CoverageReady
	awaiting := ""
	var actionDeadline time.Time
	var hydrationDeadline time.Time
	hydrationObservation := ""
	chunkBytes := 0
	for {
		if ctx.Err() != nil {
			report.Reason = boundedError(ctx, ctx.Err())
			break
		}
		b, r, e := p.Snapshot(ctx)
		if e != nil {
			report.Reason = boundedError(ctx, e)
			break
		}
		raw, ready = b, r
		n, records, e := chunkSnapshot(raw, id)
		if e != nil {
			report.Reason = e.Error()
			break
		}
		note = n
		if awaiting != "" {
			if chunkObservation(records, raw, id, ready) == awaiting {
				if !time.Now().Before(actionDeadline) {
					report.Reason = "NO_PROGRESS"
					break
				}
				if !chunkWait(ctx) {
					report.Reason = boundedError(ctx, ctx.Err())
					break
				}
				continue
			}
			awaiting = ""
		}
		// End markers can precede Vue comment/reply hydration. Observe only, within
		// one fixed deadline; never infer absence or spend extra click/page budgets.
		if hydrationObservation != "" && chunkObservation(records, raw, id, ready) == hydrationObservation && time.Now().Before(hydrationDeadline) {
			if !chunkWait(ctx) {
				report.Reason = boundedError(ctx, ctx.Err())
				break
			}
			continue
		}
		hydrationObservation = ""
		report.Final = inspectCoverage(raw, id, ready)
		report.ChunkSummary = chunkCoverage(records, raw, id, ready)
		if report.Initial.Status == "UNAVAILABLE" {
			report.Initial = report.Final
		}
		if ready.Document != "complete" || !ready.Container {
			report.Reason = "PAGE_NOT_READY"
			break
		}
		// All acknowledged anchors must be seen again before new records may be delivered.
		for _, v := range records {
			if old, ok := s.known[v.mark.ID]; ok {
				if old != v.mark {
					return nil, errors.New("IDENTITY_CONFLICT")
				}
				s.observed[v.mark.ID] = true
			}
		}
		overflow := false
		if s.Remaining() == 0 {
			for _, v := range records {
				if _, ok := s.known[v.mark.ID]; ok {
					continue
				}
				if old, ok := pendingIDs[v.mark.ID]; ok {
					if old != v.mark {
						return nil, errors.New("IDENTITY_CONFLICT")
					}
					continue
				}
				if len(s.known)+len(delta) >= chunkLedgerLimit {
					report.Reason = "LEDGER_LIMIT"
					overflow = true
					break
				}
				rowBytes, _ := json.Marshal(CommentChunkRow{Comment: v.comment, Parent: v.mark.Parent})
				if chunkBytes+len(rowBytes) > 384*1024 {
					report.Reason = "CHUNK_READY"
					overflow = true
					break
				}
				if len(delta) >= c.MaxComments || v.mark.Parent == "" && newRoots >= c.MaxRoots {
					report.Reason = "CHUNK_READY"
					overflow = true
					break
				}
				// A parent must have been acknowledged or precede its child in this transaction.
				if v.mark.Parent != "" {
					if _, ok := s.known[v.mark.Parent]; !ok {
						if _, ok := pendingIDs[v.mark.Parent]; !ok {
							return nil, errors.New("REPLAY_ANCHOR_MISSING")
						}
					}
				}
				chunkBytes += len(rowBytes)
				delta = append(delta, v)
				pendingIDs[v.mark.ID] = v.mark
				if v.mark.Parent == "" {
					newRoots++
				}
			}
		}
		if overflow {
			break
		}
		if len(delta) >= c.MaxComments || newRoots >= c.MaxRoots {
			report.Reason = "CHUNK_READY"
			break
		}
		// Reply threshold is per action in chunk mode, not total replies in a root.
		if report.ReplyActions < c.ReplyClicks {
			report.ReplyActions++
			action, e := p.ExpandReply(ctx, c.MaxComments, c.MaxRepliesPerRoot)
			if e != nil {
				report.Reason = boundedError(ctx, e)
				break
			}
			report.ReplyStop = action
			if action == "CLICKED" {
				report.ReplyStop = "VISIBLE_WINDOW_READ"
				report.Actions.ReplyClicks++
				awaiting = chunkObservation(records, raw, id, ready)
				actionDeadline = time.Now().Add(2200 * time.Millisecond)
				if !chunkWait(ctx) {
					report.Reason = boundedError(ctx, ctx.Err())
					break
				}
				continue
			}
		} else {
			report.ReplyStop = "REPLY_CLICK_BUDGET"
		}
		if report.ReplyStop == "REPLY_CLICK_BUDGET" && (report.ChunkSummary.ReplyDeficit > 0 || ready.ReplyControls != nil && *ready.ReplyControls > 0) {
			report.Reason = "REPLY_CLICK_BUDGET"
			break
		}
		if report.Final.HasMore.State == "EXACT" && report.Final.HasMore.Value != nil && !*report.Final.HasMore.Value {
			report.RootStop = "ROOT_END"
			if s.Remaining() > 0 {
				if report.ReplyStop == "BUTTON_NOT_FOUND" {
					report.Reason = "REPLAY_ANCHOR_MISSING"
				} else {
					report.Reason = report.ReplyStop
				}
				break
			}
			if report.ReplyStop == "REPLY_CLICK_BUDGET" {
				report.Reason = "REPLY_CLICK_BUDGET"
				break
			}
			if report.ReplyStop != "BUTTON_NOT_FOUND" {
				report.Reason = report.ReplyStop
				break
			}
			if (declaredTreeExhausted(report.Final) || report.ChunkSummary.Complete()) && len(s.known)+len(delta) == len(records) {
				report.State = "COMPLETE"
				report.Reason = "DECLARED_TREE_EXHAUSTED"
				report.ReplyStop = "DECLARED_REPLIES_LOADED"
			} else {
				if hydrationDeadline.IsZero() {
					hydrationDeadline = time.Now().Add(2200 * time.Millisecond)
				}
				if time.Now().Before(hydrationDeadline) {
					hydrationObservation = chunkObservation(records, raw, id, ready)
					if !chunkWait(ctx) {
						report.Reason = boundedError(ctx, ctx.Err())
						break
					}
					continue
				}
				report.State = "UNKNOWN"
				report.Reason = "COVERAGE_INSUFFICIENT"
			}
			break
		}
		if report.RootActions >= c.RootPages {
			report.RootStop = "ROOT_PAGE_BUDGET"
			report.Reason = "ROOT_PAGE_BUDGET"
			break
		}
		if report.Final.HasMore.State != "EXACT" {
			report.RootStop = "UNKNOWN_HAS_MORE"
			report.Reason = "UNKNOWN_HAS_MORE"
			break
		}
		// Repeated stable identity sets, never offsets, bound replay and failed scrolls.
		fingerprint := chunkFingerprint(records)
		if fingerprint == lastFingerprint {
			stagnant++
		} else {
			stagnant = 0
		}
		lastFingerprint = fingerprint
		if stagnant >= 2 {
			report.Reason = "NO_PROGRESS"
			break
		}
		report.RootActions++
		if e := p.ScrollRoots(ctx); e != nil {
			report.Reason = boundedError(ctx, e)
			break
		}
		report.Actions.RootScrolls++
		report.RootStop = "VISIBLE_WINDOW_READ"
		awaiting = chunkObservation(records, raw, id, ready)
		actionDeadline = time.Now().Add(2200 * time.Millisecond)
		if !chunkWait(ctx) {
			report.Reason = boundedError(ctx, ctx.Err())
			break
		}
	}
	if note.NoteID == "" {
		return nil, errors.New(report.Reason)
	}
	report.Retained = report.Final
	report.ElapsedMs = int(time.Since(start).Milliseconds())
	if report.ElapsedMs > 60000 {
		report.ElapsedMs = 60000
	}
	rows := []CommentChunkRow{}
	cp := s.committed
	cp.Marks = append([]CommentMark{}, s.committed.Marks...)
	for _, v := range delta {
		rows = append(rows, CommentChunkRow{Comment: v.comment, Parent: v.mark.Parent})
		cp.Marks = append(cp.Marks, v.mark)
	}
	if len(delta) > 0 {
		cp.Sequence++
	}
	report.Actions.AddedRoots = newRoots
	report.Actions.AddedReplies = len(delta) - newRoots
	can := s.windows < 8 && (len(delta) > 0 || s.Remaining() < replayBefore || report.Actions.RootScrolls+report.Actions.ReplyClicks > 0)
	switch report.Reason {
	case "CHUNK_READY", "ROOT_PAGE_BUDGET", "REPLY_CLICK_BUDGET", "TIMEOUT":
	default:
		can = false
	}
	if s.Remaining() > 0 && !can && (report.Reason == "ROOT_PAGE_BUDGET" || report.Reason == "REPLY_CLICK_BUDGET" || report.Reason == "TIMEOUT") {
		report.Reason = "REPLAY_BUDGET"
	}
	ch := &CommentChunk{Version: 1, Rows: rows, Checkpoint: cp, Hash: cp.Hash(), Replaying: s.Remaining() > 0, RemainingAnchors: s.Remaining(), CanContinue: can}
	s.pending = &FeedDetailResponse{Note: note, Comments: CommentList{List: []Comment{}}, BoundedRead: report, Chunk: ch}
	return s.pending, nil
}
func chunkFingerprint(rows []chunkRecord) string {
	h := sha256.New()
	for _, v := range rows {
		h.Write([]byte(v.mark.ID))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}
func chunkWait(ctx context.Context) bool {
	t := time.NewTimer(250 * time.Millisecond)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-t.C:
		return true
	}
}

func (s *CommentChunkSession) ReadPage(ctx context.Context, page *rod.Page, id string, c BoundedReadConfig) (*FeedDetailResponse, error) {
	return s.Read(ctx, &boundedRodPage{page: page, feedID: id, refreshRoots: true, chunkMode: true}, id, c)
}

func chunkObservation(rows []chunkRecord, raw []byte, id string, ready CoverageReady) string {
	h := sha256.New()
	for _, v := range rows {
		h.Write([]byte(v.mark.Digest))
		h.Write(v.raw["subCommentCount"])
	}
	feed := coverageObject(coverageObject(raw)[id])
	h.Write(coverageObject(feed["comments"])["hasMore"])
	b, _ := json.Marshal(ready.RootEndVisible)
	h.Write(b)
	return hex.EncodeToString(h.Sum(nil))
}
