package exactreply

import (
	"context"
	"errors"
	"testing"
	"time"
)

func dmCommand() DMCommand {
	return DMCommand{Protocol: DMSendProtocol, AttemptID: "11111111-1111-4111-8111-111111111111", RequestKey: "request", AccountID: "account", SenderID: "111111111111111111111111", RecipientID: "222222222222222222222222", Content: "test", ContentHash: Hash("test"), MaxSubmissions: 1, ExpiresAt: time.Now().Add(time.Minute).Format(time.RFC3339Nano)}
}

type fakeDM struct {
	stage                                 string
	opens, inputs, submits, reads, checks int
	wrong                                 bool
	panicSubmit                           bool
	closed                                bool
}

func (d *fakeDM) Open(context.Context, DMCommand) error { d.opens++; return d.err("open") }
func (d *fakeDM) Check(_ context.Context, _ DMCommand, filled bool) error {
	d.checks++
	if filled {
		return d.err("recheck")
	}
	return d.err("check")
}
func (d *fakeDM) Input(context.Context, DMCommand) error { d.inputs++; return d.err("input") }
func (d *fakeDM) Submit(context.Context, DMCommand) (bool, error) {
	d.submits++
	if d.panicSubmit {
		panic("network uncertain")
	}
	return true, d.err("submit")
}
func (d *fakeDM) Receipt(_ context.Context, c DMCommand) (DMReceipt, error) {
	r := DMReceipt{MessageID: "1234567890123456", SenderID: c.SenderID, RecipientID: c.RecipientID, ContentHash: c.ContentHash}
	if d.wrong {
		r.RecipientID = "333333333333333333333333"
	}
	return r, d.err("receipt")
}
func (d *fakeDM) Readback(ctx context.Context, c DMCommand, r DMReceipt) (DMReceipt, error) {
	d.reads++
	return r, d.err("readback")
}
func (d *fakeDM) Close(context.Context) error { d.closed = true; return d.err("close") }
func (d *fakeDM) err(s string) error {
	if d.stage == s {
		return errors.New("TEST_FAILURE")
	}
	return nil
}
func TestDMSendHappyAndOneUse(t *testing.T) {
	e := &DMSendEngine{}
	d := &fakeDM{}
	c := dmCommand()
	factory := func() (DMSender, error) { return d, nil }
	r := e.Execute(context.Background(), c, factory)
	if r.Kind != "CONFIRMED" || r.Submissions != 1 || d.inputs != 1 || d.reads != 1 || !d.closed {
		t.Fatalf("%+v %+v", r, d)
	}
	r = e.Execute(context.Background(), c, factory)
	if r.Kind != "UNKNOWN" || d.submits != 1 {
		t.Fatal(r)
	}
}
func TestDMSendSafetyFailures(t *testing.T) {
	for _, stage := range []string{"open", "check", "input", "recheck", "submit", "receipt", "readback", "close"} {
		t.Run(stage, func(t *testing.T) {
			d := &fakeDM{stage: stage}
			r := (&DMSendEngine{}).Execute(context.Background(), dmCommand(), func() (DMSender, error) { return d, nil })
			if r.Kind == "CONFIRMED" || !d.closed {
				t.Fatal(r)
			}
			if (stage == "open" || stage == "check" || stage == "input" || stage == "recheck") && d.submits != 0 {
				t.Fatal("submitted despite precondition")
			}
			if d.submits > 0 && r.Kind != "UNKNOWN" {
				t.Fatal(r)
			}
		})
	}
}
func TestDMSendRejectsWrongReceiptAndPanic(t *testing.T) {
	for _, d := range []*fakeDM{{wrong: true}, {panicSubmit: true}} {
		r := (&DMSendEngine{}).Execute(context.Background(), dmCommand(), func() (DMSender, error) { return d, nil })
		if r.Kind != "UNKNOWN" || !d.closed {
			t.Fatal(r)
		}
	}
}
func TestDMSendInvalidNeverCreatesDriver(t *testing.T) {
	for _, mutate := range []func(*DMCommand){func(c *DMCommand) { c.RecipientID = c.SenderID }, func(c *DMCommand) { c.Content = "changed" }, func(c *DMCommand) { c.MaxSubmissions = 2 }, func(c *DMCommand) { c.ExpiresAt = time.Now().Add(-time.Second).Format(time.RFC3339Nano) }, func(c *DMCommand) { c.Content = "line\nline"; c.ContentHash = Hash(c.Content) }} {
		c := dmCommand()
		mutate(&c)
		r := (&DMSendEngine{}).Execute(context.Background(), c, func() (DMSender, error) { t.Fatal("created"); return nil, nil })
		if r.Kind != "NOT_SENT" {
			t.Fatal(r)
		}
	}
}
