package xiaohongshu

import (
	"bytes"
	"encoding/json"
	"regexp"
	"unicode/utf16"
)

// Search uses only the fields needed to open a note and normalize its cover.
// Homepage Feed and its unrelated counters/video/user structures remain unchanged.
type SearchFeed struct {
	ID        string          `json:"id"`
	XsecToken string          `json:"xsecToken"`
	ModelType string          `json:"modelType"`
	NoteCard  *SearchNoteCard `json:"noteCard,omitempty"`
}
type SearchNoteCard struct {
	DisplayTitle *string `json:"displayTitle,omitempty"`
	// Preserve optional cover shape for the existing strict image normalizer.
	// Never included in a diagnostic, log, or parsing error.
	Cover json.RawMessage `json:"cover,omitempty"`
}

// All strings here are selected by code, never copied from input or error messages.
type SearchParseIssue struct {
	ItemOrdinal int    `json:"itemOrdinal"`
	Field       string `json:"field"`
	Expected    string `json:"expected"`
	Actual      string `json:"actual"`
	Reason      string `json:"reason"`
}

var searchIDPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,150}$`)

func searchJSONType(raw json.RawMessage) string {
	b := bytes.TrimSpace(raw)
	if len(b) == 0 {
		return "MISSING"
	}
	if !json.Valid(b) {
		return "INVALID_JSON"
	}
	switch b[0] {
	case '{':
		return "OBJECT"
	case '[':
		return "ARRAY"
	case '"':
		return "STRING"
	case 'n':
		return "NULL"
	case 't', 'f':
		return "BOOLEAN"
	default:
		return "NUMBER"
	}
}
func searchIssue(n int, field, expected string, raw json.RawMessage, reason string) *SearchParseIssue {
	return &SearchParseIssue{n, field, expected, searchJSONType(raw), reason}
}
func searchString(raw json.RawMessage, n int, field string, required bool, max int) (*string, *SearchParseIssue) {
	kind := searchJSONType(raw)
	if !required && (kind == "MISSING" || kind == "NULL") {
		return nil, nil
	}
	if kind != "STRING" {
		reason := "TYPE"
		if kind == "MISSING" {
			reason = "MISSING"
		}
		return nil, searchIssue(n, field, "STRING", raw, reason)
	}
	var value string
	if json.Unmarshal(raw, &value) != nil {
		return nil, searchIssue(n, field, "STRING", raw, "JSON")
	}
	if required && value == "" {
		return nil, searchIssue(n, field, "STRING", raw, "EMPTY")
	}
	if len(utf16.Encode([]rune(value))) > max {
		return nil, searchIssue(n, field, "STRING", raw, "LENGTH")
	}
	return &value, nil
}

// Decode the discriminator before any note-only structure. Unknown kinds are
// counted by the observer and never promoted to notes. No partial batch success.
func parseSearchNotes(raw json.RawMessage) ([]SearchFeed, *SearchParseIssue) {
	if searchJSONType(raw) != "ARRAY" {
		return nil, searchIssue(0, "items", "ARRAY", raw, "TYPE")
	}
	var rows []json.RawMessage
	if json.Unmarshal(raw, &rows) != nil {
		return nil, searchIssue(0, "items", "ARRAY", raw, "JSON")
	}
	if len(rows) > 200 {
		return nil, searchIssue(0, "items", "ARRAY", raw, "LENGTH")
	}
	result := make([]SearchFeed, 0)
	for i, row := range rows {
		n := i + 1
		if searchJSONType(row) != "OBJECT" {
			return nil, searchIssue(n, "item", "OBJECT", row, "TYPE")
		}
		var object map[string]json.RawMessage
		if json.Unmarshal(row, &object) != nil {
			return nil, searchIssue(n, "item", "OBJECT", row, "JSON")
		}
		kind, issue := searchString(object["modelType"], n, "modelType", true, 100)
		if issue != nil {
			return nil, issue
		}
		if *kind != "note" {
			continue
		}
		id, issue := searchString(object["id"], n, "id", true, 150)
		if issue != nil {
			return nil, issue
		}
		if !searchIDPattern.MatchString(*id) {
			return nil, searchIssue(n, "id", "STRING", object["id"], "FORMAT")
		}
		token, issue := searchString(object["xsecToken"], n, "xsecToken", true, 4096)
		if issue != nil {
			return nil, issue
		}
		note := SearchFeed{ID: *id, XsecToken: *token, ModelType: "note"}
		card := object["noteCard"]
		if searchJSONType(card) != "MISSING" {
			if searchJSONType(card) != "OBJECT" {
				return nil, searchIssue(n, "noteCard", "OBJECT", card, "TYPE")
			}
			var fields map[string]json.RawMessage
			if json.Unmarshal(card, &fields) != nil {
				return nil, searchIssue(n, "noteCard", "OBJECT", card, "JSON")
			}
			title, issue := searchString(fields["displayTitle"], n, "noteCard.displayTitle", false, 500)
			if issue != nil {
				return nil, issue
			}
			note.NoteCard = &SearchNoteCard{DisplayTitle: title, Cover: fields["cover"]}
		}
		result = append(result, note)
	}
	return result, nil
}
