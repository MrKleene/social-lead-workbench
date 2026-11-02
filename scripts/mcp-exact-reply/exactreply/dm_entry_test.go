package exactreply

import (
	"context"
	"errors"
	"testing"
)

type dmFixture struct {
	o      DMEntryObservation
	closed bool
	err    error
}

func (d *dmFixture) Inspect(context.Context, DMEntryTarget) (DMEntryObservation, error) {
	return d.o, d.err
}
func (d *dmFixture) Close(context.Context) error { d.closed = true; return nil }
func TestDMEntryInspection(t *testing.T) {
	target := DMEntryTarget{DMEntryProtocol, "fixtureaccount", "aaaaaaaaaaaaaaaaaaaaaaaa"}
	for _, tc := range []struct {
		o    DMEntryObservation
		code string
	}{{DMEntryObservation{Identity: "MATCH", Route: "/explore", Entries: []DMEntryLink{{Label: "私信", Tag: "A", Path: "/message"}}}, "ENTRY_OBSERVED_NOT_SEND_READY"}, {DMEntryObservation{Identity: "MATCH", Route: "/explore"}, "NO_VISIBLE_ENTRY"}, {DMEntryObservation{Identity: "MISMATCH"}, "IDENTITY_UNVERIFIED"}, {DMEntryObservation{Identity: "MATCH", Route: "/explore", Risk: true}, "PLATFORM_BLOCKED"}} {
		d := &dmFixture{o: tc.o}
		r := InspectDMEntry(context.Background(), target, func() (DMEntryInspector, error) { return d, nil })
		if r.Code != tc.code || !d.closed || !r.Stopped || r.Submissions != 0 || r.ConversationOpened {
			t.Fatalf("bad result %#v", r)
		}
	}
}
func TestDMEntryInvalidAndError(t *testing.T) {
	called := false
	r := InspectDMEntry(context.Background(), DMEntryTarget{}, func() (DMEntryInspector, error) { called = true; return nil, nil })
	if called || r.Code != "INVALID_TARGET" {
		t.Fatal(r)
	}
	d := &dmFixture{err: errors.New("private raw error")}
	r = InspectDMEntry(context.Background(), DMEntryTarget{DMEntryProtocol, "a", "aaaaaaaaaaaaaaaaaaaaaaaa"}, func() (DMEntryInspector, error) { return d, nil })
	if r.Code != "INSPECTION_FAILED" || !d.closed {
		t.Fatal(r)
	}
}
