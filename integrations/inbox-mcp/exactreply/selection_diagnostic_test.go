package exactreply

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
)

func selectionTarget() SelectionTarget {
	return SelectionTarget{SelectionDiagnosticProtocol, "11111111-1111-1111-1111-111111111111", "account", "aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb", "cccccccccccccccccccccccc", "dddddddddddddddddddddddd", Reference{"bbbbbbbbbbbbbbbbbbbbbbbb", "fixture", "pc_feed"}, 1, 0, 0}
}
func selectionEvidence(binding string) *SelectionEvidence {
	return &SelectionEvidence{Frame: "TOP", Target: "UNIQUE", Depth: "ROOT", Button: "EXACT", CenterHit: "EXACT", Component: "ABSENT", Handler: "ABSENT", BindingShape: "VALUE_REF", Binding: binding, Editor: "EMPTY", ReplyUI: "ACTIVE"}
}

type selectFixture struct {
	opens, closes               int
	trace                       SelectionTrace
	inspectErr, openErr         error
	wrong, closeFail, panicOpen bool
	cancel                      context.CancelFunc
}

func (f *selectFixture) Inspect(ctx context.Context, t SelectionTarget) (Snapshot, error) {
	s := Snapshot{PostID: t.PostID, SenderID: t.SenderID, TargetID: t.TargetID, TargetAuthor: t.RecipientID}
	if f.wrong {
		s.TargetAuthor = "other"
	}
	return s, f.inspectErr
}
func (f *selectFixture) OpenOnce(ctx context.Context, t SelectionTarget) error {
	f.opens++
	f.trace = SelectionTrace{Before: selectionEvidence("EMPTY"), After: selectionEvidence("MATCH"), ClickAttempted: true, ClickEvent: "SELECT_EVENT_EXACT"}
	if f.panicOpen {
		panic("PRIVATE")
	}
	if f.cancel != nil {
		f.cancel()
	}
	return f.openErr
}
func (f *selectFixture) Trace() SelectionTrace { return f.trace }
func (f *selectFixture) Close(context.Context) error {
	f.closes++
	if f.closeFail {
		return errors.New("PRIVATE")
	}
	return nil
}
func (f *selectFixture) Type()   { panic("INPUT_UNREACHABLE") }
func (f *selectFixture) Submit() { panic("SUBMIT_UNREACHABLE") }
func TestSelectionDiagnosticOpensOnceAndNeverUsesSendCapabilities(t *testing.T) {
	e := &SelectionDiagnosticEngine{}
	f := &selectFixture{}
	factory := func() (SelectionInspector, error) { return f, nil }
	r := e.Execute(context.Background(), selectionTarget(), factory)
	if r.Kind != "SELECTED_EMPTY" || f.opens != 1 || f.closes != 1 || !r.ProcessStopped || r.InputOperations != 0 || r.SubmitOperations != 0 {
		t.Fatal(r, f)
	}
	r = e.Execute(context.Background(), selectionTarget(), factory)
	if r.Diagnostic.Code != "SELECTION_ALREADY_USED" || f.opens != 1 || f.closes != 1 {
		t.Fatal(r, f)
	}
}
func TestSelectionDiagnosticStopsAndCloses(t *testing.T) {
	for _, name := range []string{"restriction", "unknown", "mismatch", "draft", "empty", "cancel", "panic", "close"} {
		t.Run(name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			f := &selectFixture{}
			want := "DRIVER_ERROR"
			opens := 0
			switch name {
			case "restriction":
				f.inspectErr = RiskError("BANNED")
				want = "BANNED"
			case "unknown":
				f.inspectErr = errors.New("PRIVATE")
			case "mismatch":
				f.wrong = true
				want = "TARGET_MISMATCH"
			case "draft":
				f.openErr = errors.New("COMPOSER_DRAFT_PRESENT")
				opens = 1
				want = "COMPOSER_DRAFT_PRESENT"
			case "empty":
				f.openErr = errors.New("BINDING_EMPTY")
				opens = 1
				want = "POST_SELECTION_BINDING_EMPTY"
			case "cancel":
				f.cancel = cancel
				opens = 1
				want = "CANCELLED"
			case "panic":
				f.panicOpen = true
				opens = 1
				want = "DRIVER_PANIC"
			case "close":
				f.closeFail = true
				opens = 1
				want = "STOP_UNCONFIRMED"
			}
			r := (&SelectionDiagnosticEngine{}).Execute(ctx, selectionTarget(), func() (SelectionInspector, error) { return f, nil })
			if r.Kind == "SELECTED_EMPTY" || r.Diagnostic.Code != want || f.opens != opens || f.closes != 1 {
				t.Fatal(r, f)
			}
		})
	}
}
func TestSelectionDiagnosticInvalidBudgetsNoFactory(t *testing.T) {
	for _, modify := range []func(*SelectionTarget){func(t *SelectionTarget) { t.MaxInputs = 1 }, func(t *SelectionTarget) { t.MaxSubmissions = 1 }, func(t *SelectionTarget) { t.MaxReplySelections = 2 }, func(t *SelectionTarget) { t.MaxReplySelections = 0 }, func(t *SelectionTarget) { t.InspectionID = "bad" }, func(t *SelectionTarget) { t.Reference.PostID = "wrong" }} {
		target := selectionTarget()
		modify(&target)
		r := (&SelectionDiagnosticEngine{}).Execute(context.Background(), target, func() (SelectionInspector, error) { t.Fatal("factory reached"); return nil, nil })
		if r.Diagnostic.Code != "INVALID_COMMAND" || !r.ProcessStopped {
			t.Fatal(r)
		}
	}
}
func TestSelectionDiagnosticJournalFailureBeforeBrowserAndRetainsClose(t *testing.T) {
	dir, _ := filepath.EvalSymlinks(t.TempDir())
	os.Chmod(dir, 0700)
	target := selectionTarget()
	j, err := OpenJournal(dir, target.InspectionID)
	if err != nil {
		t.Fatal(err)
	}
	j.Close()
	r := (&SelectionDiagnosticEngine{}).Execute(WithJournal(context.Background(), j), target, func() (SelectionInspector, error) { t.Fatal("factory reached"); return nil, nil })
	if r.Diagnostic.Code != "JOURNAL_UNAVAILABLE" {
		t.Fatal(r)
	}
	if strings.Contains(r.Diagnostic.Code, "PRIVATE") {
		t.Fatal(r)
	}
}

func TestSelectionDiagnosticConcurrentCallsOnlyOneFactoryAndSelection(t *testing.T) {
	var factories atomic.Int32
	e := &SelectionDiagnosticEngine{}
	f := &selectFixture{}
	var wg sync.WaitGroup
	for n := 0; n < 8; n++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			e.Execute(context.Background(), selectionTarget(), func() (SelectionInspector, error) { factories.Add(1); return f, nil })
		}()
	}
	wg.Wait()
	if factories.Load() != 1 || f.opens != 1 || f.closes != 1 {
		t.Fatal(factories.Load(), f)
	}
}
