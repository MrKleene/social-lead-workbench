package exactreply

import (
	"context"
	"errors"
	"testing"
)

type verifyFixture struct {
	o             VerifyObservation
	err           error
	closeErr      error
	reads, closes int
}

func (f *verifyFixture) Verify(context.Context, VerifyTarget) (VerifyObservation, error) {
	f.reads++
	return f.o, f.err
}
func (f *verifyFixture) Close(context.Context) error { f.closes++; return f.closeErr }
func verifyTargetFixture() VerifyTarget {
	return VerifyTarget{Protocol: VerifyProtocol, AccountID: "account", SenderID: "aaaaaaaaaaaaaaaaaaaaaaaa", PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", TargetID: "cccccccccccccccccccccccc", RecipientID: "dddddddddddddddddddddddd", ReplyID: "eeeeeeeeeeeeeeeeeeeeeeee", ContentHash: Hash("synthetic"), Reference: Reference{PostID: "bbbbbbbbbbbbbbbbbbbbbbbb", Token: "synthetic", Source: "pc_feed"}}
}
func TestVerifyExistingReplyNeverSubmits(t *testing.T) {
	for _, mode := range []string{"visible", "collapsed", "wrong-id", "wrong-sender", "wrong-parent", "wrong-recipient", "wrong-content", "duplicate", "over-budget", "missing", "binding", "close-failed", "invalid", "cancelled"} {
		t.Run(mode, func(t *testing.T) {
			target := verifyTargetFixture()
			f := &verifyFixture{o: VerifyObservation{Reply: Observation{ID: target.ReplyID, PostID: target.PostID, ParentID: target.TargetID, RecipientID: target.RecipientID, SenderID: target.SenderID, ContentHash: target.ContentHash}, Counts: ReadbackCounts{InitialMatches: 1, FinalMatches: 1}}}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			switch mode {
			case "collapsed":
				f.o.Counts = ReadbackCounts{InitialMatches: 0, FinalMatches: 1, ExpansionWindows: 1}
			case "wrong-id":
				f.o.Reply.ID = "ffffffffffffffffffffffff"
			case "wrong-sender":
				f.o.Reply.SenderID = "ffffffffffffffffffffffff"
			case "wrong-parent":
				f.o.Reply.ParentID = "ffffffffffffffffffffffff"
			case "wrong-recipient":
				f.o.Reply.RecipientID = "ffffffffffffffffffffffff"
			case "wrong-content":
				f.o.Reply.ContentHash = Hash("different")
			case "duplicate":
				f.o.Counts.FinalMatches = 2
			case "over-budget":
				f.o.Counts.ExpansionWindows = 2
			case "missing":
				f.err = errors.New("RECEIPT_NOT_VISIBLE")
			case "binding":
				f.err = errors.New("RECEIPT_BINDING_INCOMPLETE")
			case "close-failed":
				f.closeErr = errors.New("close")
			case "invalid":
				target.Protocol = "wrong"
			case "cancelled":
				cancel()
			}
			factories := 0
			r := Verify(ctx, target, func() (ReplyVerifier, error) { factories++; return f, nil })
			want := mode == "visible" || mode == "collapsed"
			if (r.Kind == "VERIFIED") != want || r.Submissions != 0 {
				t.Fatal(r)
			}
			if mode == "invalid" || mode == "cancelled" {
				if factories != 0 {
					t.Fatal("opened invalid request")
				}
			} else if f.reads != 1 || f.closes != 1 {
				t.Fatal(f)
			}
			if mode == "missing" && r.Code != "RECEIPT_NOT_VISIBLE" {
				t.Fatal(r)
			}
			if mode == "binding" && r.Code != "RECEIPT_BINDING_INCOMPLETE" {
				t.Fatal(r)
			}
		})
	}
}
