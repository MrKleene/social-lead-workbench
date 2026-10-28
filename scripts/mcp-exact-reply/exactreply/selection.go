package exactreply

import (
	"context"
	"errors"
)

// Fixed enums only: no body, name, ID, URL, token, event payload or function source.
// Hints are diagnostic, never a replacement for exact store binding.
type ViewportEvidence struct {
	Width   int `json:"width"`
	Height  int `json:"height"`
	ScrollX int `json:"scrollX"`
	ScrollY int `json:"scrollY"`
}
type SelectionEvidence struct {
	Viewport     *ViewportEvidence `json:"viewport,omitempty"`
	Frame        string            `json:"frame"`
	Target       string            `json:"target"`
	Depth        string            `json:"depth"`
	Button       string            `json:"button"`
	CenterHit    string            `json:"centerHit"`
	Component    string            `json:"component"`
	Handler      string            `json:"handler"`
	BindingShape string            `json:"bindingShape"`
	Binding      string            `json:"binding"`
	Editor       string            `json:"editor"`
	ReplyUI      string            `json:"replyUI"`
	Focused      bool              `json:"focused"`
}

func (s SelectionEvidence) Valid() bool {
	if v := s.Viewport; v != nil && (v.Width < 1 || v.Width > 32768 || v.Height < 1 || v.Height > 32768 || v.ScrollX < 0 || v.ScrollX > 100000000 || v.ScrollY < 0 || v.ScrollY > 100000000) {
		return false
	}
	in := func(v string, values ...string) bool {
		for _, x := range values {
			if v == x {
				return true
			}
		}
		return false
	}
	return in(s.Frame, "TOP", "SUBFRAME") && in(s.Target, "MISSING", "UNIQUE", "AMBIGUOUS") && in(s.Depth, "ROOT", "REPLY", "UNKNOWN") && in(s.Button, "MISSING", "EXACT", "AMBIGUOUS") && in(s.CenterHit, "EXACT", "COVERED", "OFFSCREEN", "UNAVAILABLE") && in(s.Component, "MATCH", "MISMATCH", "ABSENT") && in(s.Handler, "PRESENT", "ABSENT") && in(s.BindingShape, "PLAIN", "VALUE_REF", "RAW_VALUE_REF", "UNSUPPORTED_REF", "MISSING", "INVALID") && in(s.Binding, "EMPTY", "MATCH", "MISMATCH", "INVALID") && in(s.Editor, "ABSENT", "AMBIGUOUS", "EMPTY", "DRAFT") && in(s.ReplyUI, "ACTIVE", "INACTIVE", "AMBIGUOUS")
}
func RecordSelection(ctx context.Context, stage string, evidence SelectionEvidence) error {
	if !evidence.Valid() || (stage != "SELECTION_BEFORE" && stage != "SELECTION_AFTER" && stage != "SELECTION_STOPPED" && stage != "SELECTION_SCROLLED") {
		return errors.New("SELECTION_OBSERVATION_INVALID")
	}
	if j, ok := ctx.Value(journalKey{}).(*Journal); ok {
		return j.appendSelection(stage, &evidence)
	}
	return nil
}
