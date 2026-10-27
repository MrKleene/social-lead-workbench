package exactreply

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
)

type readFixture struct {
	calls, closed, writes                   int
	err                                     error
	missing, wrong, closeFail, panicInspect bool
	cancel                                  context.CancelFunc
}

func (f *readFixture) Inspect(ctx context.Context, t PreflightTarget) (PreflightObservation, error) {
	f.calls++
	if f.panicInspect {
		panic("SECRET")
	}
	if f.cancel != nil {
		f.cancel()
	}
	c := t.command()
	s := Snapshot{c.PostID, c.SenderID, c.TargetID, c.RecipientID, nil}
	if f.wrong {
		s.TargetAuthor = "wrong"
	}
	dom := DOMChecks{"UNIQUE", "MATCH", "EXACT", "EMPTY"}
	if f.missing {
		dom.Target = "MISSING"
	}
	return PreflightObservation{s, dom, FieldSources{"INITIAL_STATE_USER_INFO", "INITIAL_STATE_NOTE_COMMENTS", "EXACT_COMMENT_ID_AND_SCOPED_DESCENDANTS"}}, f.err
}
func (f *readFixture) Close(context.Context) error {
	f.closed++
	if f.closeFail {
		return errors.New("SECRET")
	}
	return nil
}

// Trap methods are deliberately not part of ReadOnlyInspector.
func (f *readFixture) Select() { f.writes++; panic("write") }
func (f *readFixture) Type()   { f.writes++; panic("write") }
func (f *readFixture) Submit() { f.writes++; panic("write") }
func target() PreflightTarget {
	c := command()
	return PreflightTarget{PreflightProtocol, c.AccountID, c.SenderID, c.PostID, c.TargetID, c.RecipientID, c.Reference}
}
func TestExactReplyPreflightNeverWritesOnSuccessOrFailure(t *testing.T) {
	for _, tc := range []struct {
		name       string
		f          readFixture
		kind, code string
	}{
		{"match", readFixture{}, "MATCHED_READ_ONLY", "READ_ONLY_MATCH"},
		{"missing DOM", readFixture{missing: true}, "DOM_UNAVAILABLE", "DOM_LOCATOR_UNVERIFIED"},
		{"wrong author", readFixture{wrong: true}, "MISMATCH", "TARGET_MISMATCH"},
		{"missing login", readFixture{err: errors.New("STATE_USER_MISSING")}, "UNAVAILABLE", "STATE_USER_MISSING"},
		{"missing comment", readFixture{err: errors.New("EXACT_TARGET_MISSING_OR_AMBIGUOUS")}, "UNAVAILABLE", "EXACT_TARGET_MISSING_OR_AMBIGUOUS"},
		{"private error", readFixture{err: errors.New("SECRET cookie and text")}, "UNAVAILABLE", "DRIVER_ERROR"},
		{"risk", readFixture{err: RiskError("VERIFICATION")}, "RISK", "VERIFICATION"},
		{"close failure", readFixture{closeFail: true}, "UNAVAILABLE", "STOP_UNCONFIRMED"},
		{"panic", readFixture{panicInspect: true}, "UNAVAILABLE", "DRIVER_PANIC"},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := &tc.f
			r := Preflight(context.Background(), target(), func() (ReadOnlyInspector, error) { return f, nil })
			if r.Kind != tc.kind || r.Diagnostic.Code != tc.code || r.WriteOperations != 0 || f.writes != 0 || f.calls != 1 || f.closed != 1 {
				t.Fatal(r, f)
			}
			b, _ := json.Marshal(r)
			if strings.Contains(string(b), "SECRET") || strings.Contains(string(b), target().SenderID) || strings.Contains(string(b), "synthetic") {
				t.Fatal("private data", string(b))
			}
		})
	}
}
func TestExactReplyPreflightCancelAndInvalidNeverOpen(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	called := false
	factory := func() (ReadOnlyInspector, error) { called = true; return &readFixture{}, nil }
	r := Preflight(ctx, target(), factory)
	if called || r.Diagnostic.Code != "CANCELLED" || !r.ProcessStopped {
		t.Fatal(r)
	}
	bad := target()
	bad.TargetID = "bad"
	r = Preflight(context.Background(), bad, factory)
	if called || r.Diagnostic.Code != "INVALID_COMMAND" {
		t.Fatal(r)
	}
}
func TestExactReplyPreflightCancelDuringInspectCloses(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	f := &readFixture{cancel: cancel}
	r := Preflight(ctx, target(), func() (ReadOnlyInspector, error) { return f, nil })
	if r.Diagnostic.Code != "CANCELLED" || f.closed != 1 || f.writes != 0 || !r.ProcessStopped {
		t.Fatal(r, f)
	}
}
func TestExactReplyPreflightOnlyWhitelistedOutputs(t *testing.T) {
	d := safeDOM(DOMChecks{"TOKEN", "ID", "text", "url"})
	if d.Target != "UNKNOWN" || d.Author != "UNKNOWN" || d.ReplyButton != "UNKNOWN" || d.Composer != "UNKNOWN" {
		t.Fatal(d)
	}
	s := safeSources(FieldSources{"TOKEN", "ID", "text"})
	if s.Identity != "UNKNOWN" || s.Target != "UNKNOWN" || s.DOM != "UNKNOWN" {
		t.Fatal(s)
	}
}

type closingPanic struct{ readFixture }

func (*closingPanic) Close(context.Context) error { panic("SECRET") }
func TestExactReplyPreflightFactoryAndCloseFailureCannotClaimStopped(t *testing.T) {
	for _, factory := range []func() (ReadOnlyInspector, error){
		func() (ReadOnlyInspector, error) { return nil, errors.New("SECRET") },
		func() (ReadOnlyInspector, error) { panic("SECRET") },
		func() (ReadOnlyInspector, error) { return &closingPanic{}, nil },
	} {
		r := Preflight(context.Background(), target(), factory)
		if r.ProcessStopped || r.Kind != "UNAVAILABLE" || r.Diagnostic.Code != "STOP_UNCONFIRMED" || r.WriteOperations != 0 {
			t.Fatal(r)
		}
	}
}
