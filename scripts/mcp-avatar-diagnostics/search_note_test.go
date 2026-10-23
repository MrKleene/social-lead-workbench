package xiaohongshu

import (
	"encoding/json"
	"strings"
	"testing"
)

func TestSearchNoteProjection(t *testing.T) {
	raw := `[{"modelType":"hot_query","index":"not-an-int","noteCard":false},{"modelType":"note","id":"synthetic","xsecToken":"SYNTHETIC_SECRET","index":"unused","noteCard":{"displayTitle":"合成😀","user":{"userId":999},"interactInfo":{"likedCount":9},"video":{"capa":{"duration":"unused"}},"cover":{"urlDefault":"https://example.invalid/SYNTHETIC_IMAGE","width":"unused"}}},{"modelType":"live_v2","noteCard":{"interactInfo":{"likedCount":99}}},{"modelType":"SYNTHETIC_UNKNOWN","noteCard":1}]`
	notes, issue := parseSearchNotes(json.RawMessage(raw))
	if issue != nil || len(notes) != 1 {
		t.Fatalf("projection rejected: %#v", issue)
	}
	if notes[0].ID != "synthetic" || notes[0].XsecToken != "SYNTHETIC_SECRET" || *notes[0].NoteCard.DisplayTitle != "合成😀" {
		t.Fatal("required value changed")
	}
	encoded, _ := json.Marshal(notes)
	if strings.Contains(string(encoded), "likedCount") || strings.Contains(string(encoded), "userId") || strings.Contains(string(encoded), "duration") {
		t.Fatal("unneeded typed fields retained")
	}
	if !strings.Contains(string(encoded), "SYNTHETIC_IMAGE") {
		t.Fatal("cover lost before existing safety filter")
	}
}
func TestSearchNoteFailuresAreClosed(t *testing.T) {
	base := map[string]any{"modelType": "note", "id": "synthetic", "xsecToken": "SYNTHETIC_SECRET"}
	for _, tc := range []struct {
		name, field, expected, actual, reason string
		value                                 any
		remove                                bool
	}{
		{"missing id", "id", "STRING", "MISSING", "MISSING", nil, true},
		{"null id", "id", "STRING", "NULL", "TYPE", nil, false},
		{"number id", "id", "STRING", "NUMBER", "TYPE", 1, false},
		{"empty id", "id", "STRING", "STRING", "EMPTY", "", false},
		{"invalid id", "id", "STRING", "STRING", "FORMAT", "https://SYNTHETIC_SECRET", false},
		{"long id", "id", "STRING", "STRING", "LENGTH", strings.Repeat("x", 151), false},
		{"missing token", "xsecToken", "STRING", "MISSING", "MISSING", nil, true},
		{"object token", "xsecToken", "STRING", "OBJECT", "TYPE", map[string]any{"SYNTHETIC_SECRET": "private"}, false},
		{"empty token", "xsecToken", "STRING", "STRING", "EMPTY", "", false},
		{"long token", "xsecToken", "STRING", "STRING", "LENGTH", strings.Repeat("x", 4097), false},
		{"null card", "noteCard", "OBJECT", "NULL", "TYPE", nil, false},
		{"array card", "noteCard", "OBJECT", "ARRAY", "TYPE", []any{}, false},
		{"number title", "noteCard.displayTitle", "STRING", "NUMBER", "TYPE", 123, false},
		{"boolean title", "noteCard.displayTitle", "STRING", "BOOLEAN", "TYPE", true, false},
		{"long title", "noteCard.displayTitle", "STRING", "STRING", "LENGTH", strings.Repeat("😀", 251), false},
		{"missing discriminator", "modelType", "STRING", "MISSING", "MISSING", nil, true},
	} {
		t.Run(tc.name, func(t *testing.T) {
			m := map[string]any{}
			for k, v := range base {
				m[k] = v
			}
			if tc.field == "noteCard.displayTitle" {
				m["noteCard"] = map[string]any{"displayTitle": tc.value}
			} else if tc.remove {
				delete(m, tc.field)
			} else {
				m[tc.field] = tc.value
			}
			raw, _ := json.Marshal([]any{map[string]any{"modelType": "hot_query", "id": 999}, base, m})
			notes, issue := parseSearchNotes(raw)
			if notes != nil || issue == nil || issue.ItemOrdinal != 3 || issue.Field != tc.field || issue.Expected != tc.expected || issue.Actual != tc.actual || issue.Reason != tc.reason {
				t.Fatalf("wrong safe issue: %#v", issue)
			}
			out, _ := json.Marshal(issue)
			if strings.Contains(string(out), "SYNTHETIC") || strings.Contains(string(out), "http") || strings.Contains(string(out), "private") {
				t.Fatal("value leak")
			}
		})
	}
}
func TestSearchNoteOptionalAndLimits(t *testing.T) {
	for _, card := range []string{"", `,"noteCard":{}`, `,"noteCard":{"displayTitle":null}`, `,"noteCard":{"displayTitle":""}`, `,"noteCard":{"displayTitle":"` + strings.Repeat("😀", 250) + `","cover":null}`} {
		notes, issue := parseSearchNotes(json.RawMessage(`[{"modelType":"note","id":"synthetic","xsecToken":"SYNTHETIC_SECRET"` + card + `}]`))
		if issue != nil || len(notes) != 1 {
			t.Fatal("optional valid fields rejected")
		}
	}
	for _, raw := range []string{`null`, `{}`, `true`, `"SYNTHETIC"`, `[`, `[] trailing`, `[` + strings.Repeat(`{"modelType":"hot_query"},`, 200) + `{"modelType":"hot_query"}]`, `[null]`, `[false]`} {
		notes, issue := parseSearchNotes(json.RawMessage(raw))
		if issue == nil || notes != nil {
			t.Fatal("bad root/item accepted")
		}
	}
	notes, issue := parseSearchNotes(json.RawMessage(`[]`))
	if issue != nil || notes == nil || len(notes) != 0 {
		t.Fatal("empty array contract changed")
	}
}
