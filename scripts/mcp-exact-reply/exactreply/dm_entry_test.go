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
	target := DMEntryTarget{Protocol: DMEntryProtocol, AccountID: "fixtureaccount", SenderID: "aaaaaaaaaaaaaaaaaaaaaaaa"}
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
	r = InspectDMEntry(context.Background(), DMEntryTarget{Protocol: DMEntryProtocol, AccountID: "a", SenderID: "aaaaaaaaaaaaaaaaaaaaaaaa"}, func() (DMEntryInspector, error) { return d, nil })
	if r.Code != "INSPECTION_FAILED" || !d.closed {
		t.Fatal(r)
	}
}

func TestDMRecipientProfileScope(t *testing.T) {
	target := DMEntryTarget{Protocol: DMEntryProtocol, AccountID: "fixture", SenderID: "aaaaaaaaaaaaaaaaaaaaaaaa", RecipientID: "bbbbbbbbbbbbbbbbbbbbbbbb"}
	for _, route := range []string{"/explore", "PROFILE", "OTHER"} {
		d := &dmFixture{o: DMEntryObservation{Identity: "MATCH", Route: route, Entries: []DMEntryLink{{Label: "私信", Tag: "BUTTON", Path: "NONE"}}}}
		r := InspectDMEntry(context.Background(), target, func() (DMEntryInspector, error) { return d, nil })
		want := "ROUTE_CHANGED"
		if route == "PROFILE" {
			want = "ENTRY_OBSERVED_NOT_SEND_READY"
		}
		if r.Code != want || r.ConversationOpened || r.Submissions != 0 {
			t.Fatal(r)
		}
	}
	target.RecipientID = target.SenderID
	if target.Valid() {
		t.Fatal("self target")
	}
	target.RecipientID = "../chat"
	if target.Valid() {
		t.Fatal("path target")
	}
}
