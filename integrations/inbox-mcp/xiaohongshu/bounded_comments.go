package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"regexp"
	"time"
	"unicode/utf16"

	"github.com/sirupsen/logrus"
)

// Independent, mandatory finite budgets. Legacy full-load flags cannot be combined.
type BoundedReadConfig struct {
	Version           int `json:"version"`
	RootPages         int `json:"root_pages"`
	ReplyClicks       int `json:"reply_clicks"`
	MaxRoots          int `json:"max_roots"`
	MaxComments       int `json:"max_comments"`
	MaxRepliesPerRoot int `json:"max_replies_per_root"`
	TimeoutMs         int `json:"timeout_ms"`
}

func (c BoundedReadConfig) Valid() bool {
	return c.Version == 1 && c.RootPages >= 0 && c.RootPages <= 3 && c.ReplyClicks >= 0 && c.ReplyClicks <= 12 && c.MaxRoots >= 1 && c.MaxRoots <= 40 && c.MaxComments >= c.MaxRoots && c.MaxComments <= 100 && c.MaxRepliesPerRoot >= 1 && c.MaxRepliesPerRoot <= 30 && c.TimeoutMs >= 1000 && c.TimeoutMs <= 15000
}

type BoundedActionEvidence struct {
	ReplyClicks  int `json:"replyClicks"`
	RootScrolls  int `json:"rootScrolls"`
	AddedRoots   int `json:"addedRoots"`
	AddedReplies int `json:"addedReplies"`
}

type BoundedReadReport struct {
	ChunkSummary  *ChunkCoverageSummary  `json:"chunkSummary,omitempty"`
	Window        int                    `json:"window,omitempty"`
	Actions       *BoundedActionEvidence `json:"actions,omitempty"`
	Version       int                    `json:"version"`
	State         string                 `json:"state"`
	Reason        string                 `json:"reason"`
	RootStop      string                 `json:"rootStop"`
	ReplyStop     string                 `json:"replyStop"`
	RootActions   int                    `json:"rootActions"`
	ReplyActions  int                    `json:"replyActions"`
	ExcludedRoots int                    `json:"excludedRoots"`
	ElapsedMs     int                    `json:"elapsedMs"`
	Initial       CoverageSample         `json:"initial"`
	Final         CoverageSample         `json:"final"`
	Retained      CoverageSample         `json:"retained"`
}

// Driver operates only the already-open note. No search/profile/network API client.
type boundedPage interface {
	Snapshot(context.Context) ([]byte, CoverageReady, error)
	ScrollRoots(context.Context) error
	ExpandReply(context.Context, int, int) (string, error)
}
type boundedNode struct {
	raw                    map[string]json.RawMessage
	id, parent, user, text string
}
type boundedStore struct {
	feedID   string
	base     map[string]json.RawMessage
	nodes    map[string]boundedNode
	order    []string
	roots    []string
	excluded map[string]bool
}

var boundedID = regexp.MustCompile(`^[A-Za-z0-9_-]{1,150}$`)

func boundedString(raw json.RawMessage) (string, bool) {
	var s string
	err := json.Unmarshal(raw, &s)
	return s, err == nil && string(raw) != "null"
}
func newBoundedStore(id string) *boundedStore {
	return &boundedStore{feedID: id, nodes: map[string]boundedNode{}, excluded: map[string]bool{}}
}

// Merge atomically: identity/content conflicts retain the entire previous snapshot.
// IDs and source text remain in memory/normal response only, never the report.
func (s *boundedStore) merge(raw []byte, c BoundedReadConfig, allowRoots bool) (int, string) {
	if len(raw) > 2*1024*1024 {
		return 0, "INVALID_RESPONSE"
	}
	feeds := coverageObject(raw)
	feed := coverageObject(feeds[s.feedID])
	comments := coverageObject(feed["comments"])
	list, shape := coverageArray(comments["list"])
	if feed == nil || (shape != "EXACT" && shape != "NULL") {
		return 0, "INVALID_RESPONSE"
	}
	next := make(map[string]boundedNode, len(s.nodes))
	for k, v := range s.nodes {
		next[k] = v
	}
	order := append([]string{}, s.order...)
	roots := append([]string{}, s.roots...)
	excluded := map[string]bool{}
	for k, v := range s.excluded {
		excluded[k] = v
	}
	visited := 0
	cut := ""
	active := map[string]bool{}
	parents := map[string]string{}
	var visit func([]json.RawMessage, string, int) string
	visit = func(rows []json.RawMessage, parent string, depth int) string {
		if len(rows) == 0 {
			return ""
		}
		if depth > 8 {
			return "DEPTH_LIMIT"
		}
		for _, item := range rows {
			visited++
			if visited > 400 {
				return "INVALID_RESPONSE"
			}
			m := coverageObject(item)
			if m == nil {
				return "INVALID_RESPONSE"
			}
			id, ok := boundedString(m["id"])
			if !ok || !boundedID.MatchString(id) {
				return "INVALID_RESPONSE"
			}
			user := coverageObject(m["userInfo"])
			uid, ok := boundedString(user["userId"])
			if !ok || !boundedID.MatchString(uid) {
				return "INVALID_RESPONSE"
			}
			text, ok := boundedString(m["content"])
			if !ok || len(utf16.Encode([]rune(text))) > 10000 {
				return "INVALID_RESPONSE"
			}
			if note, exists := m["noteId"]; exists {
				v, valid := boundedString(note)
				if !valid || v != s.feedID {
					return "IDENTITY_CONFLICT"
				}
			}
			if active[id] {
				return "IDENTITY_CONFLICT"
			}
			if prior, seen := parents[id]; seen && prior != parent {
				return "IDENTITY_CONFLICT"
			}
			parents[id] = parent
			old, exists := next[id]
			if exists && (old.parent != parent || old.user != uid || old.text != text) {
				return "IDENTITY_CONFLICT"
			}
			if !exists && parent == "" && (!allowRoots || len(roots) >= c.MaxRoots) {
				excluded[id] = true
				if allowRoots {
					cut = "ROOT_LIMIT"
				}
				continue
			}
			if !exists && len(next) >= c.MaxComments {
				cut = "COMMENT_LIMIT"
				continue
			}
			if !exists {
				order = append(order, id)
				if parent == "" {
					roots = append(roots, id)
				}
			}
			delete(excluded, id)
			next[id] = boundedNode{raw: m, id: id, parent: parent, user: uid, text: text}
			children, state := coverageArray(m["subComments"])
			if state == "INVALID" {
				return "INVALID_RESPONSE"
			}
			active[id] = true
			if reason := visit(children, id, depth+1); reason != "" {
				return reason
			}
			delete(active, id)
		}
		return ""
	}
	if reason := visit(list, "", 0); reason != "" {
		return 0, reason
	}
	newBase := feed
	if s.base != nil {
		newBase = map[string]json.RawMessage{}
		for k, v := range s.base {
			newBase[k] = v
		}
		newBase["comments"] = feed["comments"]
	}
	trial := &boundedStore{feedID: s.feedID, base: newBase, nodes: next, order: order, roots: roots, excluded: excluded}
	// Leave room for escaped MCP envelope and diagnostic evidence under transport cap.
	if len(trial.payload()) > 512*1024 {
		return 0, "RESPONSE_LIMIT"
	}
	added := len(next) - len(s.nodes)
	*s = *trial
	return added, cut
}
func (s *boundedStore) payload() []byte {
	if s.base == nil {
		return nil
	}
	feed := map[string]json.RawMessage{}
	for k, v := range s.base {
		feed[k] = v
	}
	children := map[string][]string{}
	for _, id := range s.order {
		n := s.nodes[id]
		children[n.parent] = append(children[n.parent], id)
	}
	var encode func(string) map[string]json.RawMessage
	encode = func(id string) map[string]json.RawMessage {
		n := s.nodes[id]
		m := map[string]json.RawMessage{}
		for k, v := range n.raw {
			m[k] = v
		}
		nested := []map[string]json.RawMessage{}
		for _, child := range children[id] {
			nested = append(nested, encode(child))
		}
		if _, shape := coverageArray(n.raw["subComments"]); shape == "EXACT" || len(nested) > 0 {
			m["subComments"], _ = json.Marshal(nested)
		}
		return m
	}
	list := []map[string]json.RawMessage{}
	for _, id := range children[""] {
		list = append(list, encode(id))
	}
	comments := coverageObject(feed["comments"])
	if comments == nil {
		comments = map[string]json.RawMessage{}
	}
	if len(list) > 0 || string(comments["list"]) != "null" {
		comments["list"], _ = json.Marshal(list)
	}
	feed["comments"], _ = json.Marshal(comments)
	raw, _ := json.Marshal(map[string]any{s.feedID: feed})
	return raw
}
func boundedError(ctx context.Context, err error) string {
	if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
		return "TIMEOUT"
	}
	if errors.Is(err, context.Canceled) || errors.Is(ctx.Err(), context.Canceled) {
		return "CANCELLED"
	}
	if err != nil {
		switch err.Error() {
		case "PLATFORM_LIMIT", "IDENTITY_CONFLICT", "INVALID_RESPONSE":
			return err.Error()
		}
	}
	logrus.Errorf("bounded read failed: %v", err)
	return "READ_FAILED"
}
func boundedReplies(s CoverageSample) (gap, unknown bool) {
	if rootScopedRepliesExhausted(s) {
		return false, false
	}
	if s.Loaded == nil {
		return false, true
	}
	for _, g := range s.Groups {
		if g.Declared.Value == nil {
			unknown = true
			continue
		}
		if g.Loaded.Value == nil {
			if *g.Declared.Value > 0 {
				gap = true
			} else {
				unknown = true
			}
			continue
		}
		if *g.Declared.Value > *g.Loaded.Value {
			gap = true
		}
		if *g.Declared.Value < *g.Loaded.Value {
			unknown = true
		}
	}
	return
}

// The first snapshot is captured before any optional action. Cancellation or an
// internal timeout returns retained data; transport termination cannot guarantee delivery.
func runBoundedRead(ctx context.Context, p boundedPage, id string, c BoundedReadConfig) ([]byte, *BoundedReadReport, error) {
	return runBoundedReadWindow(ctx, p, id, c, newBoundedStore(id))
}

// A live continuation owns this store and the same page; never replay from a new page silently.
func runBoundedReadWindow(ctx context.Context, p boundedPage, id string, c BoundedReadConfig, store *boundedStore) ([]byte, *BoundedReadReport, error) {
	if !c.Valid() || store == nil || store.feedID != id {
		return nil, nil, errors.New("INVALID_READ_WINDOW")
	}
	start := time.Now()
	ctx, cancel := context.WithTimeout(ctx, time.Duration(c.TimeoutMs)*time.Millisecond)
	defer cancel()
	r := &BoundedReadReport{Version: 1, State: "UNKNOWN", Reason: "VISIBLE_WINDOW_READ", RootStop: "NOT_RUN", ReplyStop: "NOT_RUN", Initial: coverageUnavailable(), Final: coverageUnavailable(), Retained: coverageUnavailable()}
	r.Actions = &BoundedActionEvidence{}
	baseRoots, baseReplies := len(store.roots), len(store.nodes)-len(store.roots)
	raw, ready, err := p.Snapshot(ctx)
	if err != nil {
		return nil, nil, errors.New(boundedError(ctx, err))
	}
	r.Initial = inspectCoverage(raw, id, ready)
	r.Final = r.Initial
	if _, why := store.merge(raw, c, len(store.nodes) == 0); why != "" {
		r.Reason = why
		if len(store.nodes) == 0 && store.base == nil {
			return nil, nil, errors.New(why)
		}
	}
	baseRoots, baseReplies = len(store.roots), len(store.nodes)-len(store.roots)
	fatal := ""
	if ready.Document != "complete" || !ready.Container {
		r.Reason = "PAGE_NOT_READY"
	}
	read := func(allowRoots bool) (int, string) {
		raw, nextReady, err := p.Snapshot(ctx)
		ready = nextReady
		if err != nil {
			return 0, boundedError(ctx, err)
		}
		r.Final = inspectCoverage(raw, id, ready)
		if ready.Document != "complete" || !ready.Container {
			return 0, "PAGE_NOT_READY"
		}
		return store.merge(raw, c, allowRoots)
	}
	// Wait for real retained data/end-state changes, never treat a timer as completion.
	readAfterAction := func(allowRoots bool, before int) (int, string) {
		deadline := time.Now().Add(2200 * time.Millisecond)
		for {
			_, why := read(allowRoots)
			if why != "" {
				return 0, why
			}
			added := len(store.nodes) - before
			ended := allowRoots && r.Final.HasMore.State == "EXACT" && r.Final.HasMore.Value != nil && !*r.Final.HasMore.Value
			if added > 0 || ended {
				return added, ""
			}
			if !time.Now().Before(deadline) {
				return 0, ""
			}
			timer := time.NewTimer(200 * time.Millisecond)
			select {
			case <-ctx.Done():
				timer.Stop()
				return 0, boundedError(ctx, ctx.Err())
			case <-timer.C:
			}
		}
	}
	// Drain replies of the current admitted tree before advancing roots. Preserve
	// every merge, including failures and DOM re-renders; never repeat a click
	// merely because its result is delayed.
	drainReplies := func() {
		for {
			if ctx.Err() != nil {
				fatal = boundedError(ctx, ctx.Err())
				r.ReplyStop = fatal
				return
			}
			gap, unknown := boundedReplies(inspectCoverage(store.payload(), id, ready))
			if !gap && !unknown {
				r.ReplyStop = "DECLARED_REPLIES_LOADED"
				return
			}
			if c.ReplyClicks == 0 {
				r.ReplyStop = "REPLY_EXPANSION_DISABLED"
				return
			}
			if r.ReplyActions >= c.ReplyClicks {
				r.ReplyStop = "REPLY_CLICK_BUDGET"
				return
			}
			if len(store.nodes) >= c.MaxComments {
				r.ReplyStop = "COMMENT_LIMIT"
				return
			}
			r.ReplyActions++
			action, err := p.ExpandReply(ctx, c.MaxComments-len(store.nodes), c.MaxRepliesPerRoot)
			if err != nil {
				fatal = boundedError(ctx, err)
				r.ReplyStop = fatal
				return
			}
			if action != "CLICKED" {
				switch action {
				case "REPLY_THRESHOLD", "UNKNOWN_REPLY_COUNT", "CLICK_FAILED", "BUTTON_NOT_FOUND", "DOM_SCOPE_UNKNOWN":
					r.ReplyStop = action
				default:
					r.ReplyStop = "CLICK_FAILED"
				}
				return
			}
			r.Actions.ReplyClicks++
			added, why := readAfterAction(false, len(store.nodes))
			if why != "" {
				fatal = why
				r.ReplyStop = why
				return
			}
			if added == 0 {
				r.ReplyStop = "NO_PROGRESS"
				return
			}
		}
	}
	if r.Reason != "VISIBLE_WINDOW_READ" {
		fatal = r.Reason
		r.RootStop = fatal
	} else {
		for {
			drainReplies()
			if fatal != "" {
				break
			}
			if ctx.Err() != nil {
				fatal = boundedError(ctx, ctx.Err())
				r.RootStop = fatal
				break
			}
			// A reply control may scroll the page and reveal additional roots.
			// With root paging authorized, admit that already-visible page against
			// its own budget before trusting its hasMore=false end flag.
			if len(store.excluded) > 0 && c.RootPages > 0 {
				if len(store.roots) >= c.MaxRoots {
					r.RootStop = "ROOT_LIMIT"
					break
				}
				if len(store.nodes) >= c.MaxComments {
					r.RootStop = "COMMENT_LIMIT"
					break
				}
				if r.RootActions >= c.RootPages {
					r.RootStop = "ROOT_PAGE_BUDGET"
					break
				}
				r.RootActions++
				before := len(store.roots)
				_, why := read(true)
				if why != "" {
					fatal = why
					r.RootStop = why
					break
				}
				if len(store.roots) == before {
					r.RootStop = "NO_PROGRESS"
					break
				}
				continue
			}
			if r.Final.HasMore.State != "EXACT" {
				r.RootStop = "UNKNOWN_HAS_MORE"
				break
			}
			if !*r.Final.HasMore.Value {
				r.RootStop = "ROOT_END"
				break
			}
			if c.RootPages == 0 {
				r.RootStop = "ROOT_PAGING_DISABLED"
				break
			}
			if len(store.roots) >= c.MaxRoots {
				r.RootStop = "ROOT_LIMIT"
				break
			}
			if len(store.nodes) >= c.MaxComments {
				r.RootStop = "COMMENT_LIMIT"
				break
			}
			if r.RootActions >= c.RootPages {
				r.RootStop = "ROOT_PAGE_BUDGET"
				break
			}
			r.RootActions++
			if err := p.ScrollRoots(ctx); err != nil {
				fatal = boundedError(ctx, err)
				r.RootStop = fatal
				break
			}
			r.Actions.RootScrolls++
			beforeRoots := len(store.roots)
			_, why := readAfterAction(true, len(store.nodes))
			if why != "" {
				fatal = why
				r.RootStop = why
				break
			}
			if len(store.roots) == beforeRoots {
				if r.Final.HasMore.State == "EXACT" && r.Final.HasMore.Value != nil && !*r.Final.HasMore.Value {
					r.RootStop = "ROOT_END"
				} else {
					r.RootStop = "NO_PROGRESS"
				}
				break
			}
		}
	}
	r.Actions.AddedRoots = len(store.roots) - baseRoots
	r.Actions.AddedReplies = len(store.nodes) - len(store.roots) - baseReplies
	r.Retained = inspectCoverage(store.payload(), id, ready)
	r.ExcludedRoots = len(store.excluded)
	if r.ExcludedRoots > 200 {
		r.ExcludedRoots = 200
	}
	gap, unknown := boundedReplies(r.Retained)
	if fatal != "" {
		r.Reason = fatal
		r.State = "PARTIAL"
	} else if gap {
		r.Reason = r.ReplyStop
		r.State = "PARTIAL"
	} else if r.RootStop != "ROOT_END" {
		r.Reason = r.RootStop
		r.State = "PARTIAL"
		if r.RootStop == "UNKNOWN_HAS_MORE" {
			r.State = "UNKNOWN"
		}
	} else if unknown || r.ReplyStop != "DECLARED_REPLIES_LOADED" {
		r.Reason = r.ReplyStop
		r.State = "UNKNOWN"
	}
	if r.ExcludedRoots > 0 {
		r.State = "PARTIAL"
		if r.Reason == "VISIBLE_WINDOW_READ" {
			r.Reason = "ROOT_LIMIT"
		}
	}
	if fatal == "" && r.ExcludedRoots == 0 && r.RootStop == "ROOT_END" && r.ReplyStop == "DECLARED_REPLIES_LOADED" && declaredTreeExhausted(r.Retained) && declaredTreeExhausted(r.Final) {
		r.State = "COMPLETE"
		r.Reason = "DECLARED_TREE_EXHAUSTED"
	} else if fatal == "" && r.Retained.Loaded != nil && r.Retained.Loaded.UniqueKnown == 0 && r.Retained.Total.State != "EXACT" {
		r.State = "UNKNOWN"
		r.Reason = "EMPTY_UNCONFIRMED"
	}
	r.ElapsedMs = int(time.Since(start).Milliseconds())
	if r.ElapsedMs > 60000 {
		r.ElapsedMs = 60000
	}
	return store.payload(), r, nil
}

// Completion is only the explicitly declared, accessible tree at this observation.
// Hidden/deleted/moderated content is outside this evidence. Missing is not zero.
func declaredTreeExhausted(s CoverageSample) bool {
	if s.Status != "OK" || s.List != "EXACT" || s.Ready.Document != "complete" || !s.Ready.Container || s.Loaded == nil || s.HasMore.Value == nil || *s.HasMore.Value || s.HasMore.State != "EXACT" {
		return false
	}
	if s.Loaded.MissingIDs != 0 || s.Loaded.DuplicateIDs != 0 || s.Loaded.InvalidNodes != 0 || len(s.Findings) > 0 {
		return false
	}
	if !(s.Total.State == "EXACT" && s.Total.Value != nil && *s.Total.Value == s.Loaded.UniqueKnown) && !(s.Ready.EmptyVisible && s.Loaded.UniqueKnown == 0 && s.Total.State != "EXACT") {
		return false
	}
	gap, unknown := boundedReplies(s)
	return !gap && !unknown
}
