package exactreply

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func selectionFixture() SelectionEvidence {
	return SelectionEvidence{nil, "TOP", "UNIQUE", "ROOT", "EXACT", "EXACT", "MATCH", "PRESENT", "VALUE_REF", "EMPTY", "EMPTY", "INACTIVE", false}
}
func TestSelectionEvidenceOnlyFixedEnums(t *testing.T) {
	s := selectionFixture()
	if !s.Valid() {
		t.Fatal(s)
	}
	s.Component = "private text"
	if s.Valid() {
		t.Fatal("raw text allowed")
	}
	if RecordSelection(context.Background(), "SELECTION_AFTER", s) == nil {
		t.Fatal("invalid emitted")
	}
	for _, code := range []string{"REPLY_POINT_COVERED", "REPLY_POINT_MOVED", "REPLY_FRAME_UNSUPPORTED", "SELECTION_OBSERVATION_UNAVAILABLE"} {
		if diagnosticCode(errors.New(code)) != code {
			t.Fatal("reason lost", code)
		}
	}
}
func TestSelectionJournalDurableProjection(t *testing.T) {
	dir := t.TempDir()
	if err := os.Chmod(dir, 0700); err != nil {
		t.Fatal(err)
	}
	id := "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"
	j, err := OpenJournal(dir, id)
	if err != nil {
		t.Fatal(err)
	}
	if err = RecordSelection(WithJournal(context.Background(), j), "SELECTION_AFTER", selectionFixture()); err != nil {
		t.Fatal(err)
	}
	j.Close()
	b, err := os.ReadFile(filepath.Join(dir, "reply-stage-"+id+".jsonl"))
	if err != nil || !strings.Contains(string(b), `"selection"`) {
		t.Fatal(err, string(b))
	}
}
