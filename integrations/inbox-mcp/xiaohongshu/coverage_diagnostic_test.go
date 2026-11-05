package xiaohongshu

import (
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func coverageFixture(comments string) []byte {
	return []byte(`{"synthetic":{"note":{"interactInfo":{"commentCount":"15"}},"comments":` + comments + `}}`)
}

var readyCoverage = CoverageReady{Document: "complete", Container: true}

func TestCoveragePresence(t *testing.T) {
	for _, c := range []struct {
		raw, state string
		value      int
	}{{"", "MISSING", -1}, {"null", "NULL", -1}, {"0", "EXACT", 0}, {`"0"`, "EXACT", 0}, {`"15"`, "EXACT", 15}, {`" 2 "`, "INVALID", -1}, {"false", "INVALID", -1}, {"-1", "INVALID", -1}, {"1.5", "INVALID", -1}, {"1e2", "INVALID", -1}, {"10000001", "INVALID", -1}, {`"secret"`, "INVALID", -1}} {
		v := coverageCount([]byte(c.raw))
		if v.State != c.state || (c.value >= 0 && (v.Value == nil || *v.Value != c.value)) || (c.value < 0 && v.Value != nil) {
			t.Fatalf("count state mismatch %s", c.state)
		}
	}
	for _, c := range []struct{ raw, state string }{{"", "MISSING"}, {"null", "NULL"}, {"false", "EXACT"}, {"true", "EXACT"}, {`"false"`, "INVALID"}, {"0", "INVALID"}} {
		v := coverageBoolean([]byte(c.raw))
		if v.State != c.state {
			t.Fatal("bool state mismatch")
		}
		if c.raw == "false" && (v.Value == nil || *v.Value) {
			t.Fatal("false lost")
		}
	}
	for _, c := range []struct{ raw, state string }{{"", "MISSING"}, {"null", "NULL"}, {"[]", "EXACT"}, {"{}", "INVALID"}} {
		_, s := coverageArray([]byte(c.raw))
		if s != c.state {
			t.Fatal("array state mismatch")
		}
	}
}
func TestCoverageSameReadFixtureAndNoSensitiveValues(t *testing.T) {
	payload := coverageFixture(`{"hasMore":false,"cursor":"","list":[{"id":"private-root-id","content":"private text","userInfo":{"image":"https://private.example/?token=secret"},"subCommentCount":"3","subComments":[{"id":"private-child-id","subComments":[]}]}]}`)
	s := inspectCoverage(payload, "synthetic", readyCoverage)
	d := coverageReport([]CoverageSample{s, s, s}, 500)
	raw, err := os.ReadFile("xiaohongshu/coverage-cases.json")
	if err != nil {
		raw, err = os.ReadFile("coverage-cases.json")
	}
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Diagnostic json.RawMessage `json:"diagnostic"`
	}
	if json.Unmarshal(raw, &fixture) != nil {
		t.Fatal("fixture")
	}
	var expected, actual any
	_ = json.Unmarshal(fixture.Diagnostic, &expected)
	encoded, _ := json.Marshal(d)
	_ = json.Unmarshal(encoded, &actual)
	e, _ := json.Marshal(expected)
	a, _ := json.Marshal(actual)
	if string(e) != string(a) {
		t.Fatalf("shared schema fixture drift: %s", a)
	}
	for _, secret := range []string{"private", "token", "secret", "content", "userInfo", "https://"} {
		if strings.Contains(string(encoded), secret) {
			t.Fatal("sensitive output")
		}
	}
	if d.RangeExpanded || d.ReturnedSample != 0 || d.TotalScope != "UNCONFIRMED" {
		t.Fatal("false completeness")
	}
}
func TestCoverageDuplicatesMissingAndMismatch(t *testing.T) {
	s := inspectCoverage(coverageFixture(`{"hasMore":true,"cursor":"private-cursor","list":[{"id":"a","subCommentCount":"0","subComments":[{"id":"b"}]},{"id":"a"},null]}`), "synthetic", readyCoverage)
	if s.Loaded.Roots != 3 || s.Loaded.Replies != 1 || s.Loaded.UniqueKnown != 2 || s.Loaded.DuplicateIDs != 1 || s.Loaded.MissingIDs != 1 || s.Loaded.InvalidNodes != 1 || s.Cursor != "NONEMPTY" {
		t.Fatal("wrong counters")
	}
	if !strings.Contains(strings.Join(s.Findings, ","), "DECLARED_LT_LOADED") {
		t.Fatal("mismatch missing")
	}
	encoded, _ := json.Marshal(s)
	if strings.Contains(string(encoded), "private-cursor") {
		t.Fatal("cursor leaked")
	}
}
func TestCoverageMissingAndUnavailable(t *testing.T) {
	s := inspectCoverage([]byte(`{"synthetic":{"note":{},"comments":{}}}`), "synthetic", readyCoverage)
	if s.Total.State != "MISSING" || s.HasMore.State != "MISSING" || s.Loaded != nil || s.List != "MISSING" {
		t.Fatal("missing became zero")
	}
	s = inspectCoverage([]byte(`{"synthetic":{"note":{"interactInfo":{"commentCount":0}},"comments":{"list":[],"hasMore":false}}}`), "synthetic", readyCoverage)
	if s.Total.Value == nil || *s.Total.Value != 0 || s.Loaded == nil || s.Loaded.Roots != 0 || s.HasMore.Value == nil || *s.HasMore.Value {
		t.Fatal("zero/false lost")
	}
	for _, p := range []string{"null", "{broken", "{}"} {
		if inspectCoverage([]byte(p), "synthetic", readyCoverage).Status == "OK" {
			t.Fatal("invalid accepted")
		}
	}
	if inspectCoverage([]byte(strings.Repeat("x", 2*1024*1024+1)), "synthetic", readyCoverage).Status != "LIMIT" {
		t.Fatal("payload bound")
	}
}
func TestCoverageObservationAndLimits(t *testing.T) {
	s := inspectCoverage(coverageFixture(`{"list":[]}`), "synthetic", readyCoverage)
	changed := s
	changed.HasMore = coverageBoolean([]byte("true"))
	if coverageReport([]CoverageSample{s, s, changed}, 500).Observation != "CHANGED" {
		t.Fatal("change missing")
	}
	pending := s
	pending.Ready.Document = "loading"
	if coverageReport([]CoverageSample{s, pending, s}, 500).Observation != "UNAVAILABLE" {
		t.Fatal("page not ready")
	}
	if coverageReport([]CoverageSample{s, s}, 250).Observation != "UNAVAILABLE" {
		t.Fatal("too few observations")
	}
	raw := `{"id":"a","subComments":[]}`
	rows := strings.TrimSuffix(strings.Repeat(raw+",", 201), ",")
	capped := inspectCoverage(coverageFixture(`{"list":[`+rows+`]}`), "synthetic", readyCoverage)
	if capped.Status != "LIMIT" || len(capped.Groups) != 200 {
		t.Fatal("node bound")
	}
	total := inspectCoverage([]byte(`{"synthetic":{"note":{"interactInfo":{"commentCount":0}},"comments":{"list":[{"id":"a"}]}}}`), "synthetic", readyCoverage)
	if !strings.Contains(strings.Join(total.Findings, ","), "TOTAL_LT_LOADED") {
		t.Fatal("total mismatch")
	}
}
