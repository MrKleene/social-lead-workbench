package exactreply

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
)

func command() Command {
	c := Command{Protocol: Protocol, AttemptID: "11111111-1111-4111-8111-111111111111", RequestKey: "job:1", AccountID: "account1", SenderID: strings.Repeat("a", 24), PostID: strings.Repeat("b", 24), TargetID: strings.Repeat("c", 24), RecipientID: strings.Repeat("d", 24), Content: "synthetic-only"}
	c.ContentHash = Hash(c.Content)
	c.Reference = Reference{c.PostID, "synthetic", "pc_feed"}
	return c
}
func observation(c Command) Observation {
	return Observation{strings.Repeat("e", 24), c.PostID, c.TargetID, c.RecipientID, c.SenderID, c.ContentHash}
}

type fake struct {
	inspectError, selectError                                                       error
	c                                                                               Command
	inspects, selected, submitted, closed                                           int
	bad, change, closeFail, panicClose, panicSubmit, accepted, noResponse, readFail bool
	existing                                                                        bool
	risk                                                                            string
	cancel                                                                          context.CancelFunc
	response                                                                        *Observation
	readback                                                                        *Observation
	block                                                                           chan struct{}
}

func (f *fake) Inspect(ctx context.Context, c Command) (Snapshot, error) {
	f.inspects++
	s := Snapshot{c.PostID, c.SenderID, c.TargetID, c.RecipientID, map[string]bool{}}
	if f.bad || f.change && f.inspects > 1 {
		s.TargetID = "wrong"
	}
	if f.existing {
		s.ExistingIDs[observation(c).ID] = true
	}
	return s, f.inspectError
}
func (f *fake) Select(ctx context.Context, c Command) error {
	f.selected++
	if f.cancel != nil {
		f.cancel()
	}
	return f.selectError
}
func (f *fake) Submit(ctx context.Context, c Command) (Submission, error) {
	f.submitted++
	if f.block != nil {
		select {
		case <-f.block:
		case <-ctx.Done():
			return Submission{Attempted: true}, ctx.Err()
		}
	}
	if f.panicSubmit {
		panic("test")
	}
	o := observation(c)
	if f.response != nil {
		o = *f.response
	}
	s := Submission{Attempted: true, Accepted: f.accepted, Risk: f.risk}
	if !f.noResponse {
		s.Response = &o
	}
	return s, nil
}
func (f *fake) Readback(ctx context.Context, c Command, id string) (Observation, error) {
	if f.readFail {
		return Observation{}, errors.New("read failed")
	}
	if f.readback != nil {
		return *f.readback, nil
	}
	return observation(c), nil
}
func (f *fake) Close(ctx context.Context) error {
	f.closed++
	if f.panicClose {
		panic("close")
	}
	if f.closeFail {
		return errors.New("still running")
	}
	return nil
}
func TestExactReplyConfirmed(t *testing.T) {
	c := command()
	f := &fake{}
	r := Run(context.Background(), c, f)
	if r.Kind != "CONFIRMED" || !r.Stopped || r.Response.ID != observation(c).ID || f.submitted != 1 || f.closed != 1 {
		t.Fatal(r, f)
	}
}
func TestExactReplyRefusesTargetFallback(t *testing.T) {
	for _, change := range []bool{false, true} {
		f := &fake{bad: !change, change: change}
		r := Run(context.Background(), command(), f)
		if r.Kind != "NOT_SENT" || f.submitted != 0 {
			t.Fatal(r, f)
		}
	}
}
func TestExactReplyCancelledBeforeSubmit(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	f := &fake{cancel: cancel}
	r := Run(ctx, command(), f)
	if r.Kind != "NOT_SENT" || r.Reason != "CANCELLED" || f.submitted != 0 {
		t.Fatal(r)
	}
}
func TestExactReplyAcceptedIsNotConfirmed(t *testing.T) {
	f := &fake{accepted: true, noResponse: true}
	r := Run(context.Background(), command(), f)
	if r.Kind != "ACCEPTED" || r.Response != nil {
		t.Fatal(r)
	}
}
func TestExactReplyUnknownWithoutReceipt(t *testing.T) {
	for _, f := range []*fake{{noResponse: true}, {readFail: true}, {existing: true}, {panicSubmit: true}} {
		r := Run(context.Background(), command(), f)
		if r.Kind != "UNKNOWN" || !r.Stopped {
			t.Fatal(r)
		}
	}
}
func TestExactReplyMismatchedReceipt(t *testing.T) {
	c := command()
	for i := 0; i < 6; i++ {
		for _, side := range []string{"response", "readback"} {
			o := observation(c)
			switch i {
			case 0:
				o.ID = c.TargetID
			case 1:
				o.PostID = "wrong"
			case 2:
				o.ParentID = "wrong"
			case 3:
				o.RecipientID = "wrong"
			case 4:
				o.SenderID = "wrong"
			case 5:
				o.ContentHash = "wrong"
			}
			f := &fake{}
			if side == "response" {
				f.response = &o
			} else {
				f.readback = &o
			}
			if r := Run(context.Background(), c, f); r.Kind != "UNKNOWN" {
				t.Fatal(i, side, r)
			}
		}
	}
}
func TestExactReplyRiskAlwaysPauses(t *testing.T) {
	for _, reason := range []string{"RATE_LIMITED", "VERIFICATION", "BANNED", "PLATFORM_REFUSED"} {
		f := &fake{risk: reason, closeFail: true}
		r := Run(context.Background(), command(), f)
		if r.Kind != "RISK" || r.Reason != reason || r.Stopped {
			t.Fatal(r)
		}
	}
}
func TestExactReplyStopUnconfirmed(t *testing.T) {
	r := Run(context.Background(), command(), &fake{closeFail: true})
	if r.Kind != "UNKNOWN" || r.Stopped || r.Reason != "STOP_UNCONFIRMED" {
		t.Fatal(r)
	}
}
func TestExactReplyInvalidCommand(t *testing.T) {
	for i := 0; i < 7; i++ {
		c := command()
		switch i {
		case 0:
			c.TargetID = ""
		case 1:
			c.ContentHash = "wrong"
		case 2:
			c.Reference.PostID = "wrong"
		case 3:
			c.Reference.Token = "https://untrusted/"
		case 4:
			c.SenderID = ""
		case 5:
			c.Content = " "
		case 6:
			c.Protocol = "old"
		}
		f := &fake{}
		r := Run(context.Background(), c, f)
		if r.Kind != "NOT_SENT" || f.inspects != 0 || f.submitted != 0 {
			t.Fatal(r)
		}
	}
}
func TestExactReplyIdempotencyAndConflict(t *testing.T) {
	e := &Engine{}
	c := command()
	calls := 0
	factory := func() (Driver, error) { calls++; return &fake{}, nil }
	r := e.Execute(context.Background(), c, factory)
	again := e.Execute(context.Background(), c, factory)
	if r.Kind != "CONFIRMED" || again.AttemptID != r.AttemptID || calls != 1 {
		t.Fatal(r, again, calls)
	}
	c.Content = "different"
	c.ContentHash = Hash(c.Content)
	if r = e.Execute(context.Background(), c, factory); r.Kind != "UNKNOWN" || calls != 1 {
		t.Fatal(r, calls)
	}
}
func TestExactReplyConcurrentAndPoison(t *testing.T) {
	e := &Engine{}
	c := command()
	entered := make(chan struct{})
	release := make(chan struct{})
	done := make(chan Result, 1)
	go func() {
		done <- e.Execute(context.Background(), c, func() (Driver, error) { close(entered); return &fake{block: release, closeFail: true}, nil })
	}()
	<-entered
	c2 := c
	c2.RequestKey = "job:2"
	calls := 0
	if r := e.Execute(context.Background(), c2, func() (Driver, error) { calls++; return &fake{}, nil }); r.Reason != "BUSY" || calls != 0 {
		t.Fatal(r, calls)
	}
	close(release)
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("hung")
	}
	if r := e.Execute(context.Background(), c2, func() (Driver, error) { calls++; return &fake{}, nil }); r.Reason != "INSTANCE_PAUSED" || calls != 0 {
		t.Fatal(r, calls)
	}
}
func TestExactReplyStatusNeverCreatesDriver(t *testing.T) {
	e := &Engine{}
	c := command()
	if r := e.Status(c); r.Kind != "UNKNOWN" {
		t.Fatal(r)
	}
	e.Execute(context.Background(), c, func() (Driver, error) { return &fake{}, nil })
	if r := e.Status(c); r.Kind != "CONFIRMED" {
		t.Fatal(r)
	}
}

func TestExactReplyFactoryFailurePoisonsInstance(t *testing.T) {
	for _, panics := range []bool{false, true} {
		e := &Engine{}
		c := command()
		calls := 0
		factory := func() (Driver, error) {
			calls++
			if panics {
				panic("factory")
			}
			return nil, errors.New("factory failed")
		}
		r := e.Execute(context.Background(), c, factory)
		if r.Kind != "UNKNOWN" || r.Stopped {
			t.Fatal(r)
		}
		c.RequestKey = "job:next"
		if r = e.Execute(context.Background(), c, factory); r.Reason != "INSTANCE_PAUSED" || calls != 1 {
			t.Fatal(r, calls)
		}
	}
}
func TestExactReplyClosePanicPoisonsInstance(t *testing.T) {
	e := &Engine{}
	c := command()
	r := e.Execute(context.Background(), c, func() (Driver, error) { return &fake{panicClose: true}, nil })
	if r.Kind != "UNKNOWN" || r.Stopped {
		t.Fatal(r)
	}
	c.RequestKey = "job:next"
	r = e.Execute(context.Background(), c, func() (Driver, error) { t.Fatal("must not create"); return nil, nil })
	if r.Reason != "INSTANCE_PAUSED" {
		t.Fatal(r)
	}
}

func TestExactReplyCancellationDuringSubmitNeverConfirms(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	f := &fake{block: make(chan struct{})}
	done := make(chan Result, 1)
	go func() { done <- Run(ctx, command(), f) }()
	time.Sleep(time.Millisecond)
	cancel()
	select {
	case r := <-done:
		if r.Kind == "CONFIRMED" || !r.Stopped {
			t.Fatal(r)
		}
	case <-time.After(time.Second):
		t.Fatal("cancellation ignored")
	}
}

func TestExactReplyDiagnosticsSeparateHistoricalMergedFailures(t *testing.T) {
	for _, tc := range []struct{ stage, code string }{
		{"INSPECT", "STATE_POST_MISSING"}, {"INSPECT", "EXACT_TARGET_MISSING_OR_AMBIGUOUS"},
		{"SELECT", "COMPOSER_ALREADY_OPEN"}, {"SELECT", "AUTHOR_MISMATCH"}, {"SELECT", "BUTTON_TARGET_MISMATCH"},
	} {
		t.Run(tc.code, func(t *testing.T) {
			f := &fake{}
			if tc.stage == "INSPECT" {
				f.inspectError = errors.New(tc.code)
			} else {
				f.selectError = errors.New(tc.code)
			}
			r := Run(context.Background(), command(), f)
			if r.Kind != "NOT_SENT" || r.Diagnostic == nil || r.Diagnostic.Stage != tc.stage || r.Diagnostic.Code != tc.code || f.submitted != 0 || !r.Stopped {
				t.Fatal(r, f)
			}
		})
	}
}
func TestExactReplyDiagnosticsDoNotLeakRawError(t *testing.T) {
	f := &fake{selectError: errors.New("URL https://private.invalid/?token=SECRET and private comment")}
	r := Run(context.Background(), command(), f)
	if r.Diagnostic.Code != "DRIVER_ERROR" || r.Diagnostic.Stage != "SELECT" || f.submitted != 0 {
		t.Fatal(r)
	}
}
func TestExactReplyDiagnosticsIdentityChecksCannotMakeTargetPass(t *testing.T) {
	f := &fake{bad: true}
	r := Run(context.Background(), command(), f)
	if r.Diagnostic.Checks.Target != "MISMATCH" || r.Diagnostic.Checks.Sender != "MATCH" || r.Diagnostic.Stage != "INSPECT" || f.selected != 0 || f.submitted != 0 {
		t.Fatal(r)
	}
	d := checks(Snapshot{}, command())
	if d.Target != "UNKNOWN" || d.Author != "UNKNOWN" || d.Sender != "UNKNOWN" || d.Post != "UNKNOWN" {
		t.Fatal(d)
	}
}
func TestExactReplyDiagnosticsInvalidCommandHasNoDriver(t *testing.T) {
	e := &Engine{}
	c := command()
	c.TargetID = "invalid"
	called := false
	r := e.Execute(context.Background(), c, func() (Driver, error) { called = true; return &fake{}, nil })
	if called || r.Diagnostic.Stage != "VALIDATE" || r.Diagnostic.Code != "INVALID_COMMAND" || r.Kind != "NOT_SENT" {
		t.Fatal(r)
	}
}

func TestExactReplyComposerGuardsStopBeforeSubmitAndClose(t *testing.T) {
	for _, code := range []string{"COMPOSER_DRAFT_PRESENT", "COMPOSER_HIDDEN", "COMPOSER_ACTIVE", "COMPOSER_TARGET_BOUND", "COMPOSER_NOT_DEFAULT", "COMPOSER_AMBIGUOUS", "COMPOSER_UNRECOGNIZED", "COMPOSER_BINDING_UNVERIFIED", "EXACT_TARGET_NOT_VISIBLE", "AUTHOR_AMBIGUOUS"} {
		t.Run(code, func(t *testing.T) {
			f := &fake{selectError: errors.New(code)}
			r := Run(context.Background(), command(), f)
			if r.Kind != "NOT_SENT" || !r.Stopped || f.submitted != 0 || r.Diagnostic.Code != code {
				t.Fatal(r, f)
			}
		})
	}
}
