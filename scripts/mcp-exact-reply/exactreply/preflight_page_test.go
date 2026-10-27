package exactreply

import (
	"context"
	"errors"
	"testing"
)

func readySample() PreflightObservation {
	c := target().command()
	return PreflightObservation{Snapshot: Snapshot{PostID: c.PostID, SenderID: c.SenderID, TargetID: c.TargetID, TargetAuthor: c.RecipientID}, Page: PageChecks{Navigation: "EXACT_POST", Token: "MATCH", Source: "MATCH", Root: "PLAIN", Note: "PLAIN", Map: "PLAIN", Entry: "PLAIN"}}
}
func TestExactReplyPreflightHydrationWaitIsBoundedReadOnly(t *testing.T) {
	calls := 0
	pauses := 0
	o, e := WaitForReadOnlyState(context.Background(), target(), func() (PreflightObservation, error) {
		calls++
		s := readySample()
		if calls < 3 {
			s.Snapshot.PostID = ""
			s.Page.Entry = "MISSING"
			return s, errors.New("STATE_POST_MISSING")
		}
		return s, nil
	}, func(context.Context) error { pauses++; return nil })
	if e != nil || calls != 3 || pauses != 2 || o.Page.Wait != "BECAME_READY" {
		t.Fatal(o, e, calls, pauses)
	}
	calls = 0
	o, e = WaitForReadOnlyState(context.Background(), target(), func() (PreflightObservation, error) {
		calls++
		s := readySample()
		s.Snapshot.PostID = ""
		return s, errors.New("STATE_POST_MISSING")
	}, func(context.Context) error { return nil })
	if e == nil || calls != 12 || o.Page.Wait != "EXHAUSTED" {
		t.Fatal(o, e, calls)
	}
}
func TestExactReplyPreflightDoesNotWaitAwayIdentityOrReferenceMismatch(t *testing.T) {
	for _, change := range []func(*PreflightObservation){func(s *PreflightObservation) { s.Snapshot.SenderID = "other" }, func(s *PreflightObservation) { s.Snapshot.PostID = "other" }, func(s *PreflightObservation) { s.Page.Navigation = "OTHER_POST" }, func(s *PreflightObservation) { s.Page.Token = "MISSING" }, func(s *PreflightObservation) { s.Page.Source = "MISMATCH" }} {
		calls := 0
		o, e := WaitForReadOnlyState(context.Background(), target(), func() (PreflightObservation, error) {
			calls++
			s := readySample()
			change(&s)
			return s, errors.New("STATE_POST_MISSING")
		}, func(context.Context) error { t.Fatal("must not resample"); return nil })
		if e == nil || calls != 1 || o.Page.Wait != "BLOCKED" {
			t.Fatal(o, e, calls)
		}
	}
}
func TestExactReplyPreflightWaitCancelAndRisk(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	calls := 0
	o, e := WaitForReadOnlyState(ctx, target(), func() (PreflightObservation, error) { calls++; return readySample(), errors.New("STATE_POST_MISSING") }, func(context.Context) error { cancel(); return ctx.Err() })
	if !errors.Is(e, context.Canceled) || calls != 1 || o.Page.Wait != "ABORTED" {
		t.Fatal(o, e, calls)
	}
	o, e = WaitForReadOnlyState(context.Background(), target(), func() (PreflightObservation, error) { return readySample(), RiskError("PLATFORM_REFUSED") }, func(context.Context) error { t.Fatal("risk must stop"); return nil })
	if risk(e) != "PLATFORM_REFUSED" || o.Page.Wait != "BLOCKED" {
		t.Fatal(o, e)
	}
}
func TestExactReplyPreflightPageEnumSanitization(t *testing.T) {
	p := SafePage(PageChecks{Navigation: "https://SECRET", Token: "SECRET", Source: "SECRET", Document: "SECRET", Root: "SECRET", Note: "SECRET", Map: "SECRET", Entry: "SECRET", Wait: "SECRET", Samples: 999})
	if p.Navigation != "UNKNOWN" || p.Token != "UNKNOWN" || p.Source != "UNKNOWN" || p.Root != "UNKNOWN" || p.Entry != "UNKNOWN" || p.Samples != 0 {
		t.Fatal(p)
	}
}
func TestExactReplyPreflightCancellationBeforeReadNeverSamples(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, e := WaitForReadOnlyState(ctx, target(), func() (PreflightObservation, error) { t.Fatal("read after cancellation"); return readySample(), nil }, ReadOnlySettle)
	if !errors.Is(e, context.Canceled) {
		t.Fatal(e)
	}
}
