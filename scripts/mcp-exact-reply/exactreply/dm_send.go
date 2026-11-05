package exactreply

import (
	"context"
	"errors"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

const DMSendProtocol = "workbench.xhs.exact-dm.v1"

type DMReplyAnchor struct {
 MessageID string `json:"messageId"`
 ContentHash string `json:"contentSha256"`
}
type DMCommand struct {
 ReplyTo *DMReplyAnchor `json:"replyTo,omitempty"`
	Protocol       string `json:"protocol"`
	AttemptID      string `json:"attemptId"`
	RequestKey     string `json:"requestKey"`
	AccountID      string `json:"accountId"`
	SenderID       string `json:"senderId"`
	RecipientID    string `json:"recipientId"`
	Content        string `json:"content"`
	ContentHash    string `json:"contentSha256"`
	MaxSubmissions int    `json:"maxSubmissions"`
	ExpiresAt      string `json:"expiresAt"`
}

func (c DMCommand) Valid() bool {
	until, e := time.Parse(time.RFC3339Nano, c.ExpiresAt)
	return (c.ReplyTo == nil || (ValidDMMessageID(c.ReplyTo.MessageID,c.RecipientID,c.SenderID) && regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(c.ReplyTo.ContentHash))) && e == nil && until.After(time.Now()) && until.Before(time.Now().Add(5*time.Minute)) && c.Protocol == DMSendProtocol && uuid.MatchString(c.AttemptID) && opaque.MatchString(c.RequestKey) && opaque.MatchString(c.AccountID) && id.MatchString(c.SenderID) && id.MatchString(c.RecipientID) && c.SenderID != c.RecipientID && strings.TrimSpace(c.Content) == c.Content && c.Content != "" && !strings.ContainsAny(c.Content, "\r\n\x00") && utf8.RuneCountInString(c.Content) <= 1000 && Hash(c.Content) == c.ContentHash && c.MaxSubmissions == 1
}

type DMReceipt struct {
	MessageID   string `json:"messageId"`
	SenderID    string `json:"senderId"`
	RecipientID string `json:"recipientId"`
	ContentHash string `json:"contentSha256"`
	ObservedAt  string `json:"observedAt"`
}

var dmServerID = regexp.MustCompile(`^[0-9]{10,30}$`)

// Observed official c2c server ID binds both parties; a local timestamp-random UUID is never accepted.
func ValidDMMessageID(value,sender,recipient string) bool {
 if dmServerID.MatchString(value) {return true}
 prefix:=sender+"."+recipient+"."
 return strings.HasPrefix(value,prefix)&&regexp.MustCompile(`^[a-f0-9]{12,32}$`).MatchString(strings.TrimPrefix(value,prefix))
}

func (r DMReceipt) Matches(c DMCommand) bool {
	return ValidDMMessageID(r.MessageID,c.SenderID,c.RecipientID) && r.SenderID == c.SenderID && r.RecipientID == c.RecipientID && r.ContentHash == c.ContentHash
}

type DMResult struct {
	Protocol    string     `json:"protocol"`
	AttemptID   string     `json:"attemptId"`
	RequestKey  string     `json:"requestKey"`
	Kind        string     `json:"kind"`
	Reason      string     `json:"reason"`
	Inputs      int        `json:"inputs"`
	Submissions int        `json:"submissions"`
	Stopped     bool       `json:"stopped"`
	Receipt     *DMReceipt `json:"receipt,omitempty"`
	Readback    *DMReceipt `json:"readback,omitempty"`
}
type DMSender interface {
	Open(context.Context, DMCommand) error
	Check(context.Context, DMCommand, bool) error
	Input(context.Context, DMCommand) error
	Submit(context.Context, DMCommand) (bool, error)
	Receipt(context.Context, DMCommand) (DMReceipt, error)
	Readback(context.Context, DMCommand, DMReceipt) (DMReceipt, error)
	Close(context.Context) error
}
type DMSendEngine struct {
	mu   sync.Mutex
	used bool
}

func (e *DMSendEngine) Execute(ctx context.Context, c DMCommand, factory func() (DMSender, error)) (r DMResult) {
	r = DMResult{Protocol: DMSendProtocol, AttemptID: c.AttemptID, RequestKey: c.RequestKey, Kind: "NOT_SENT", Reason: "INVALID_SCOPE", Stopped: true}
	if !c.Valid() || ctx.Err() != nil {
		return
	}
	e.mu.Lock()
	if e.used {
		e.mu.Unlock()
		r.Kind = "UNKNOWN"
		r.Reason = "ALREADY_USED"
		return
	}
	e.used = true
	e.mu.Unlock()
	d, err := factory()
	if err != nil {
		r.Kind = "UNKNOWN"
		r.Reason = "OPEN_FAILED"
		return
	}
	r.Stopped = false
	ctx, cancel := context.WithTimeout(ctx, 55*time.Second)
	defer cancel()
	defer func() {
		if recover() != nil {
			r.Kind = "UNKNOWN"
			r.Reason = "DRIVER_PANIC"
		}
		closeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 4*time.Second)
		defer cancel()
		r.Stopped = closeDMSafely(closeCtx, d)
		if !r.Stopped {
			r.Kind = "UNKNOWN"
			r.Reason = "STOP_UNCONFIRMED"
		}
		if RecordStage(closeCtx, "DRIVER_CLOSED", nil, &r.Stopped) != nil {
			r.Kind = "UNKNOWN"
			r.Reason = "JOURNAL_UNAVAILABLE"
		}
	}()
	fail := func(err error) {
		r.Reason = "UNCONFIRMED"
		if err != nil && regexp.MustCompile(`^[A-Z_]{1,80}$`).MatchString(err.Error()) {
			r.Reason = err.Error()
		}
		if r.Submissions > 0 {
			r.Kind = "UNKNOWN"
		}
	}
	for _, step := range []func() error{
		func() error { return RecordStage(ctx, "STARTED", nil, nil) },
		func() error { return d.Open(ctx, c) },
		func() error { return d.Check(ctx, c, false) },
		func() error { return RecordStage(ctx, "INPUT_INTENT", nil, nil) },
		func() error { r.Inputs = 1; return d.Input(ctx, c) },
		func() error { return RecordStage(ctx, "INPUT_FINISHED", nil, nil) },
		func() error {
			if !c.Valid() {
				return errors.New("SCOPE_EXPIRED")
			}
			return d.Check(ctx, c, true)
		},
	} {
		if err = step(); err != nil {
			fail(err)
			return
		}
	}
	attempted, err := d.Submit(ctx, c)
	if attempted {
		r.Submissions = 1
		r.Kind = "UNKNOWN"
	}
	if err != nil {
		fail(err)
		return
	}
	if !attempted {
		fail(errors.New("NOT_SUBMITTED"))
		return
	}
	receipt, err := d.Receipt(ctx, c)
	if err != nil {
		fail(err)
		return
	}
	if !receipt.Matches(c) {
		fail(errors.New("RECEIPT_UNVERIFIED"))
		return
	}
	r.Receipt = &receipt
	readback, err := d.Readback(ctx, c, receipt)
	if err != nil {
		fail(err)
		return
	}
	if !readback.Matches(c) || readback.MessageID != receipt.MessageID {
		fail(errors.New("READBACK_UNVERIFIED"))
		return
	}
	if err = RecordStage(ctx, "READBACK", nil, nil); err != nil {
		fail(err)
		return
	}
	r.Kind = "CONFIRMED"
	r.Reason = "SERVER_ID_AND_FRESH_PAGE_READBACK"
	r.Readback = &readback
	return
}
func closeDMSafely(ctx context.Context, d DMSender) (ok bool) {
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	return d.Close(ctx) == nil
}

// A conversational reply requires the latest visible inbound message, not merely an existing chat.
func ReplyAnchorMatches(c DMCommand, messageID, body string, outgoingAfter bool) bool {
 return c.ReplyTo != nil && !outgoingAfter && c.ReplyTo.MessageID == messageID && Hash(body)==c.ReplyTo.ContentHash && ValidDMMessageID(messageID,c.RecipientID,c.SenderID)
}
