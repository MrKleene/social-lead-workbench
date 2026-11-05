package exactreply

import (
	"context"
	"errors"
	"testing"
)

type dmConversationFixture struct {
	opens  int
	closed bool
	o      DMConversationObservation
	err    error
}

func (d *dmConversationFixture) Inspect(context.Context, DMConversationTarget) (DMConversationObservation, int, error) {
	d.opens++
	return d.o, 1, d.err
}
func (d *dmConversationFixture) Close(context.Context) error { d.closed = true; return nil }
func TestDMConversationNoInputsOrSubmissionsAndNoReplay(t *testing.T) {
	target := DMConversationTarget{DMConversationProtocol, "11111111-1111-4111-8111-111111111111", "fixture", "aaaaaaaaaaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbbbbbbbbbb", 1, 0, 0}
	for _, tc := range []struct {
		o    DMConversationObservation
		err  error
		code string
	}{{DMConversationObservation{Identity: "MATCH", Route: "CHAT", Editors: []DMConversationNode{{Tag: "TEXTAREA", Empty: true}}}, nil, "CONVERSATION_OBSERVED_NOT_SEND_READY"}, {DMConversationObservation{Identity: "MATCH", Route: "CHAT", Risk: true}, nil, "PLATFORM_BLOCKED"}, {DMConversationObservation{Identity: "MISMATCH"}, nil, "IDENTITY_UNVERIFIED"}, {DMConversationObservation{}, errors.New("private"), "INSPECTION_STOPPED"}} {
		engine := &DMConversationEngine{}
		d := &dmConversationFixture{o: tc.o, err: tc.err}
		factory := func() (DMConversationInspector, error) { return d, nil }
		r := engine.Execute(context.Background(), target, factory)
		if r.Code != tc.code || r.Inputs != 0 || r.Submissions != 0 || r.OpenInvocations != 1 || !r.Stopped || !d.closed {
			t.Fatal(r)
		}
		if engine.Execute(context.Background(), target, factory).Code != "ALREADY_USED" || d.opens != 1 {
			t.Fatal("replay")
		}
	}
	for _, mutate := range []func(*DMConversationTarget){func(t *DMConversationTarget) { t.MaxInputs = 1 }, func(t *DMConversationTarget) { t.MaxSubmissions = 1 }, func(t *DMConversationTarget) { t.MaxOpenings = 2 }, func(t *DMConversationTarget) { t.RecipientID = t.SenderID }} {
		bad := target
		mutate(&bad)
		called := false
		r := (&DMConversationEngine{}).Execute(context.Background(), bad, func() (DMConversationInspector, error) { called = true; return nil, nil })
		if called || r.Code != "INVALID_SCOPE" {
			t.Fatal(r)
		}
	}
}
