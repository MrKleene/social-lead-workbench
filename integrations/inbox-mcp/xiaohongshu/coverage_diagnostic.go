package xiaohongshu

// Coverage diagnostics contain counts/enums only. IDs are compared in memory;
// URLs, text, identity, cursor values and arbitrary source keys never leave here.
import (
	"bytes"
	"encoding/json"
	"regexp"
	"strconv"
)

const coverageNodeLimit = 200

var coverageDigits = regexp.MustCompile(`^(0|[1-9][0-9]{0,7})$`)

type CoverageCount struct {
	State string `json:"state"`
	Value *int   `json:"value"`
}
type CoverageBool struct {
	State string `json:"state"`
	Value *bool  `json:"value"`
}
type CoverageReady struct {
	RootEndVisible *bool  `json:"rootEndVisible,omitempty"`
	ReplyControls  *int   `json:"replyControls,omitempty"`
	RootScopeExact *bool  `json:"rootScopeExact,omitempty"`
	Document       string `json:"document"`
	Container      bool   `json:"container"`
	EmptyVisible   bool   `json:"emptyVisible,omitempty"`
}
type CoverageLoaded struct {
	Roots        int `json:"roots"`
	Replies      int `json:"replies"`
	UniqueKnown  int `json:"uniqueKnown"`
	DuplicateIDs int `json:"duplicateIds"`
	MissingIDs   int `json:"missingIds"`
	InvalidNodes int `json:"invalidNodes"`
}
type CoverageReplyGroup struct {
	Ordinal  int           `json:"ordinal"`
	Parent   *int          `json:"parent"`
	Depth    int           `json:"depth"`
	Declared CoverageCount `json:"declared"`
	Loaded   CoverageCount `json:"loaded"`
}
type CoverageSample struct {
	Relations *ReplyRelationEvidence `json:"relations,omitempty"`
	Status    string                 `json:"status"`
	Ready     CoverageReady          `json:"ready"`
	Total     CoverageCount          `json:"total"`
	HasMore   CoverageBool           `json:"hasMore"`
	Cursor    string                 `json:"cursor"`
	List      string                 `json:"list"`
	Loaded    *CoverageLoaded        `json:"loaded"`
	Groups    []CoverageReplyGroup   `json:"groups"`
	Findings  []string               `json:"findings"`
}
type CoverageDiagnostic struct {
	Version        int              `json:"version"`
	TotalScope     string           `json:"totalScope"`
	ReturnedSample int              `json:"returnedSample"`
	Samples        []CoverageSample `json:"samples"`
	Observation    string           `json:"observation"`
	ElapsedMs      int              `json:"elapsedMs"`
	RangeExpanded  bool             `json:"rangeExpanded"`
}

func coverageCount(raw json.RawMessage) CoverageCount {
	raw = bytes.TrimSpace(raw)
	out := CoverageCount{State: "MISSING"}
	if len(raw) == 0 {
		return out
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		out.State = "NULL"
		return out
	}
	out.State = "INVALID"
	var text string
	if raw[0] == '"' {
		if json.Unmarshal(raw, &text) != nil {
			return out
		}
	} else {
		text = string(raw)
	}
	if !coverageDigits.MatchString(text) {
		return out
	}
	n, err := strconv.Atoi(text)
	if err != nil || n > 10000000 {
		return out
	}
	out.State = "EXACT"
	out.Value = &n
	return out
}
func coverageBoolean(raw json.RawMessage) CoverageBool {
	out := CoverageBool{State: "MISSING"}
	if len(raw) == 0 {
		return out
	}
	switch string(bytes.TrimSpace(raw)) {
	case "null":
		out.State = "NULL"
	case "true", "false":
		v := string(bytes.TrimSpace(raw)) == "true"
		out.State = "EXACT"
		out.Value = &v
	default:
		out.State = "INVALID"
	}
	return out
}
func coverageArray(raw json.RawMessage) ([]json.RawMessage, string) {
	if len(raw) == 0 {
		return nil, "MISSING"
	}
	if bytes.Equal(bytes.TrimSpace(raw), []byte("null")) {
		return nil, "NULL"
	}
	var a []json.RawMessage
	if json.Unmarshal(raw, &a) != nil {
		return nil, "INVALID"
	}
	return a, "EXACT"
}
func coverageObject(raw json.RawMessage) map[string]json.RawMessage {
	var o map[string]json.RawMessage
	_ = json.Unmarshal(raw, &o)
	return o
}
func coverageUnavailable() CoverageSample {
	return CoverageSample{Status: "UNAVAILABLE", Ready: CoverageReady{Document: "UNKNOWN"}, Total: CoverageCount{State: "MISSING"}, HasMore: CoverageBool{State: "MISSING"}, Cursor: "MISSING", List: "MISSING", Groups: []CoverageReplyGroup{}, Findings: []string{}}
}
func inspectCoverage(payload []byte, feedID string, ready CoverageReady) CoverageSample {
	d := coverageUnavailable()
	d.Ready = ready
	if ready.Document != "loading" && ready.Document != "interactive" && ready.Document != "complete" {
		d.Ready.Document = "UNKNOWN"
	}
	if len(payload) > 2*1024*1024 {
		d.Status = "LIMIT"
		return d
	}
	feeds := coverageObject(payload)
	if feeds == nil {
		d.Status = "INVALID_JSON"
		return d
	}
	feed := coverageObject(feeds[feedID])
	if feed == nil {
		d.Status = "FEED_MISSING"
		return d
	}
	d.Status = "OK"
	note := coverageObject(feed["note"])
	info := coverageObject(note["interactInfo"])
	comments := coverageObject(feed["comments"])
	d.Total = coverageCount(info["commentCount"])
	d.HasMore = coverageBoolean(comments["hasMore"])
	d.Cursor = coverageCursor(comments["cursor"])
	roots, state := coverageArray(comments["list"])
	d.List = state
	if state != "EXACT" {
		return d
	}
	d.Loaded = &CoverageLoaded{}
	seen := map[string]bool{}
	relationRows := []map[string]json.RawMessage{}
	findings := map[string]bool{}
	var visit func([]json.RawMessage, int, *int)
	visit = func(rows []json.RawMessage, depth int, parent *int) {
		for _, raw := range rows {
			if len(d.Groups) >= coverageNodeLimit || depth > 8 {
				d.Status = "LIMIT"
				return
			}
			ordinal := len(d.Groups) + 1
			if depth == 0 {
				d.Loaded.Roots++
			} else {
				d.Loaded.Replies++
			}
			c := coverageObject(raw)
			relationRows = append(relationRows, c)
			if c == nil {
				d.Loaded.InvalidNodes++
				findings["INVALID_NODES"] = true
			}
			var id string
			_ = json.Unmarshal(c["id"], &id)
			if id == "" || len(id) > 200 {
				d.Loaded.MissingIDs++
				findings["MISSING_IDS"] = true
			} else if seen[id] {
				d.Loaded.DuplicateIDs++
				findings["DUPLICATE_IDS"] = true
			} else {
				seen[id] = true
				d.Loaded.UniqueKnown++
			}
			children, shape := coverageArray(c["subComments"])
			loaded := CoverageCount{State: shape}
			if shape == "EXACT" {
				n := len(children)
				if n > 10000000 {
					loaded.State = "INVALID"
				} else {
					loaded.Value = &n
				}
			}
			declared := coverageCount(c["subCommentCount"])
			d.Groups = append(d.Groups, CoverageReplyGroup{Ordinal: ordinal, Parent: parent, Depth: depth, Declared: declared, Loaded: loaded})
			if declared.Value != nil && loaded.Value != nil {
				if *declared.Value > *loaded.Value {
					findings["DECLARED_GT_LOADED"] = true
				}
				if *declared.Value < *loaded.Value {
					findings["DECLARED_LT_LOADED"] = true
				}
			}
			visit(children, depth+1, &ordinal)
		}
	}
	visit(roots, 0, nil)
	d.Relations = inspectReplyRelations(relationRows)
	if d.Total.Value != nil && *d.Total.Value < d.Loaded.Roots+d.Loaded.Replies {
		findings["TOTAL_LT_LOADED"] = true
	}
	for _, key := range []string{"INVALID_NODES", "MISSING_IDS", "DUPLICATE_IDS", "DECLARED_GT_LOADED", "DECLARED_LT_LOADED", "TOTAL_LT_LOADED"} {
		if findings[key] {
			d.Findings = append(d.Findings, key)
		}
	}
	return d
}
func coverageReport(samples []CoverageSample, elapsed int) *CoverageDiagnostic {
	d := &CoverageDiagnostic{Version: 1, TotalScope: "UNCONFIRMED", ReturnedSample: 0, Samples: samples, Observation: "UNAVAILABLE", ElapsedMs: elapsed}
	if len(samples) != 3 {
		return d
	}
	for _, s := range samples {
		if s.Status != "OK" || s.List != "EXACT" || s.Ready.Document != "complete" || !s.Ready.Container {
			return d
		}
	}
	// Equality is only structural/count equality, never proof of complete content.
	d.Observation = "COUNTS_UNCHANGED"
	first, _ := json.Marshal(samples[0])
	for _, s := range samples[1:] {
		next, _ := json.Marshal(s)
		if !bytes.Equal(first, next) {
			d.Observation = "CHANGED"
		}
	}
	return d
}

func coverageCursor(raw json.RawMessage) string {
	if len(raw) == 0 {
		return "MISSING"
	}
	if string(raw) == "null" {
		return "NULL"
	}
	var cursor string
	if json.Unmarshal(raw, &cursor) != nil {
		return "INVALID"
	}
	if cursor == "" {
		return "EMPTY"
	}
	return "NONEMPTY"
}
