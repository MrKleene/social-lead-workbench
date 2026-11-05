package exactreply

import (
	"context"
	"regexp"
	"time"
)

const VerifyProtocol = "workbench.xhs.exact-reply-verify.v1"

type VerifyTarget struct {
	Protocol    string    `json:"protocol"`
	AccountID   string    `json:"accountId"`
	SenderID    string    `json:"senderId"`
	PostID      string    `json:"postId"`
	TargetID    string    `json:"targetCommentId"`
	RecipientID string    `json:"recipientId"`
	ReplyID     string    `json:"replyId"`
	ContentHash string    `json:"contentSha256"`
	Reference   Reference `json:"postReference"`
}

func (t VerifyTarget) Command() Command {
	return Command{AccountID: t.AccountID, SenderID: t.SenderID, PostID: t.PostID, TargetID: t.TargetID, RecipientID: t.RecipientID, ContentHash: t.ContentHash, Reference: t.Reference}
}
func (t VerifyTarget) Valid() bool {
	p := PreflightTarget{Protocol: PreflightProtocol, AccountID: t.AccountID, SenderID: t.SenderID, PostID: t.PostID, TargetID: t.TargetID, RecipientID: t.RecipientID, Reference: t.Reference}
	return t.Protocol == VerifyProtocol && p.Valid() && id.MatchString(t.ReplyID) && t.ReplyID != t.TargetID && t.ReplyID != t.PostID && t.ReplyID != t.SenderID && t.ReplyID != t.RecipientID && regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(t.ContentHash)
}

type ReadbackCounts struct {
	InitialMatches   int `json:"initialMatches"`
	FinalMatches     int `json:"finalMatches"`
	ExpansionWindows int `json:"expansionWindows"`
}
type VerifyObservation struct {
	Reply  Observation    `json:"reply"`
	Counts ReadbackCounts `json:"counts"`
}

// Compile-time surface has no selection, typing, submission or send engine.
type ReplyVerifier interface {
	Verify(context.Context, VerifyTarget) (VerifyObservation, error)
	Close(context.Context) error
}
type VerifyResult struct {
	Protocol       string             `json:"protocol"`
	Kind           string             `json:"kind"`
	Code           string             `json:"code"`
	Observation    *VerifyObservation `json:"observation,omitempty"`
	ProcessStopped bool               `json:"processStopped"`
	Submissions    int                `json:"submissions"`
}

func Verify(ctx context.Context, t VerifyTarget, factory func() (ReplyVerifier, error)) (r VerifyResult) {
	r = VerifyResult{Protocol: VerifyProtocol, Kind: "UNAVAILABLE", Code: "INVALID_COMMAND"}
	if !t.Valid() {
		r.ProcessStopped = true
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	if ctx.Err() != nil {
		r.Code = "CANCELLED"
		r.ProcessStopped = true
		return
	}
	var d ReplyVerifier
	defer func() {
		if recover() != nil {
			r.Kind = "UNAVAILABLE"
			r.Code = "DRIVER_PANIC"
		}
		if d != nil {
			func() {
				defer func() { _ = recover() }()
				c, stop := context.WithTimeout(context.Background(), 2*time.Second)
				defer stop()
				r.ProcessStopped = d.Close(c) == nil
			}()
		}
		if !r.ProcessStopped {
			r.Kind = "UNAVAILABLE"
			r.Code = "STOP_UNCONFIRMED"
		}
		if ctx.Err() != nil {
			r.Kind = "UNAVAILABLE"
			r.Code = "CANCELLED"
		}
	}()
	var err error
	d, err = factory()
	if err != nil || d == nil {
		r.Code = "DRIVER_ERROR"
		return
	}
	o, err := d.Verify(ctx, t)
	r.Observation = &o
	if err != nil {
		r.Code = diagnosticCode(err)
		return
	}
	if o.Reply.ID != t.ReplyID || !Matches(o.Reply, t.Command()) || o.Counts.FinalMatches != 1 || o.Counts.InitialMatches < 0 || o.Counts.InitialMatches > 1 || o.Counts.ExpansionWindows < 0 || o.Counts.ExpansionWindows > 1 {
		r.Code = "READBACK_MISMATCH"
		return
	}
	r.Kind = "VERIFIED"
	r.Code = "EXACT_MATCH"
	return
}
