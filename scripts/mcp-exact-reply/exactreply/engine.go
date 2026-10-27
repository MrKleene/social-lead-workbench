// Package exactreply owns the finite, fail-closed reply state machine.
// It has no network/client dependency; production uses a context-bound Rod driver.
package exactreply

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"regexp"
	"strings"
	"sync"
	"time"
)

const Protocol = "workbench.xhs.exact-reply.v1"

type Reference struct {
	PostID string `json:"postId"`
	Token  string `json:"token"`
	Source string `json:"source"`
}
type Command struct {
	Protocol    string    `json:"protocol"`
	AttemptID   string    `json:"attemptId"`
	RequestKey  string    `json:"requestKey"`
	AccountID   string    `json:"accountId"`
	SenderID    string    `json:"senderId"`
	PostID      string    `json:"postId"`
	TargetID    string    `json:"targetCommentId"`
	RecipientID string    `json:"recipientId"`
	Content     string    `json:"content"`
	ContentHash string    `json:"contentSha256"`
	Reference   Reference `json:"postReference"`
}
type Observation struct {
	ID          string `json:"commentId"`
	PostID      string `json:"postId"`
	ParentID    string `json:"parentCommentId"`
	RecipientID string `json:"recipientId"`
	SenderID    string `json:"senderId"`
	ContentHash string `json:"contentSha256"`
}
type Snapshot struct {
	PostID, SenderID, TargetID, TargetAuthor string
	ExistingIDs                              map[string]bool
}
type Submission struct {
	Attempted, Accepted bool
	Response            *Observation
	Risk                string
}
type Result struct {
	Protocol            string       `json:"protocol"`
	AttemptID           string       `json:"attemptId"`
	RequestKey          string       `json:"requestKey"`
	AccountID           string       `json:"accountId"`
	Kind                string       `json:"kind"`
	Stopped             bool         `json:"processStopped"`
	Reason              string       `json:"reason,omitempty"`
	Phase               string       `json:"phase,omitempty"`
	Proof               string       `json:"proof,omitempty"`
	Response            *Observation `json:"response,omitempty"`
	Readback            *Observation `json:"readback,omitempty"`
	ObservedAfterSubmit bool         `json:"observedAfterSubmit,omitempty"`
}
type Driver interface {
	Inspect(context.Context, Command) (Snapshot, error)
	Select(context.Context, Command) error
	Submit(context.Context, Command) (Submission, error)
	Readback(context.Context, Command, string) (Observation, error)
	Close(context.Context) error
}
type RiskError string

func (r RiskError) Error() string { return string(r) }
func risk(err error) string {
	var r RiskError
	if errors.As(err, &r) && isRisk(string(r)) {
		return string(r)
	}
	return ""
}
func isRisk(s string) bool {
	return s == "RATE_LIMITED" || s == "VERIFICATION" || s == "BANNED" || s == "PLATFORM_REFUSED"
}

var id = regexp.MustCompile(`^[a-f0-9]{24}$`)
var uuid = regexp.MustCompile(`^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$`)
var opaque = regexp.MustCompile(`^[A-Za-z0-9:_-]{1,200}$`)
var token = regexp.MustCompile(`^[A-Za-z0-9_+/=-]+$`)

func Hash(s string) string { h := sha256.Sum256([]byte(s)); return hex.EncodeToString(h[:]) }
func Valid(c Command) bool {
	return c.Protocol == Protocol && uuid.MatchString(c.AttemptID) && opaque.MatchString(c.RequestKey) && opaque.MatchString(c.AccountID) && id.MatchString(c.PostID) && id.MatchString(c.TargetID) && id.MatchString(c.RecipientID) && id.MatchString(c.SenderID) && c.Reference.PostID == c.PostID && len(c.Reference.Token) <= 4096 && token.MatchString(c.Reference.Token) && (c.Reference.Source == "pc_feed" || c.Reference.Source == "pc_search") && strings.TrimSpace(c.Content) != "" && len(c.Content) <= 16000 && Hash(c.Content) == c.ContentHash
}
func sameTarget(s Snapshot, c Command) bool {
	return s.PostID == c.PostID && s.TargetID == c.TargetID && s.TargetAuthor == c.RecipientID && s.SenderID == c.SenderID
}
func Matches(o Observation, c Command) bool {
	return id.MatchString(o.ID) && o.ID != c.TargetID && o.PostID == c.PostID && o.ParentID == c.TargetID && o.RecipientID == c.RecipientID && o.SenderID == c.SenderID && o.ContentHash == c.ContentHash
}
func base(c Command) Result {
	return Result{Protocol: Protocol, AttemptID: c.AttemptID, RequestKey: c.RequestKey, AccountID: c.AccountID, Kind: "UNKNOWN", Reason: "UNCONFIRMED"}
}

// Run never retries a click. Close is called before processStopped is reported.
func Run(ctx context.Context, c Command, d Driver) (r Result) {
	r = base(c)
	submitted := false
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	defer func() {
		if recover() != nil {
			r = base(c)
			r.Reason = "DRIVER_PANIC"
		}
		closeCtx, stop := context.WithTimeout(context.Background(), 2*time.Second)
		defer stop()
		r.Stopped = closeSafely(closeCtx, d)
		if !r.Stopped && r.Kind != "RISK" {
			r = base(c)
			r.Reason = "STOP_UNCONFIRMED"
		}
	}()
	fail := func(err error) Result {
		r = base(c)
		if code := risk(err); code != "" {
			r.Kind = "RISK"
			r.Reason = code
			return r
		}
		if !submitted {
			r.Kind = "NOT_SENT"
			r.Phase = "BEFORE_SUBMIT"
			r.Reason = "TARGET_MISMATCH"
			if ctx.Err() != nil {
				r.Reason = "CANCELLED"
			}
		}
		return r
	}
	if !Valid(c) {
		return fail(errors.New("INVALID_COMMAND"))
	}
	if ctx.Err() != nil {
		return fail(ctx.Err())
	}
	before, err := d.Inspect(ctx, c)
	if err != nil {
		return fail(err)
	}
	if !sameTarget(before, c) {
		return fail(errors.New("TARGET_MISMATCH"))
	}
	if ctx.Err() != nil {
		return fail(ctx.Err())
	}
	if err = d.Select(ctx, c); err != nil {
		return fail(err)
	}
	again, err := d.Inspect(ctx, c)
	if err != nil {
		return fail(err)
	}
	if !sameTarget(again, c) {
		return fail(errors.New("TARGET_CHANGED"))
	}
	if ctx.Err() != nil {
		return fail(ctx.Err())
	}
	// Once Submit is entered, errors are ambiguous unless the driver proves no click.
	submitted = true
	s, err := d.Submit(ctx, c)
	submitted = s.Attempted
	if isRisk(s.Risk) {
		r.Kind = "RISK"
		r.Reason = s.Risk
		return r
	}
	if err != nil {
		return fail(err)
	}
	if !s.Attempted {
		submitted = false
		return fail(errors.New("NOT_SUBMITTED"))
	}
	if s.Response == nil || !Matches(*s.Response, c) || before.ExistingIDs[s.Response.ID] || again.ExistingIDs[s.Response.ID] {
		if s.Accepted {
			r.Kind = "ACCEPTED"
			r.Reason = "RECEIPT_UNCONFIRMED"
		}
		return r
	}
	observed, err := d.Readback(ctx, c, s.Response.ID)
	if err != nil {
		return fail(err)
	}
	if ctx.Err() != nil || !Matches(observed, c) || observed != *s.Response {
		return r
	}
	r.Kind = "CONFIRMED"
	r.Reason = ""
	r.Proof = "PLATFORM_RESPONSE_AND_READBACK"
	r.Response = s.Response
	r.Readback = &observed
	r.ObservedAfterSubmit = true
	return r
}
func closeSafely(ctx context.Context, d Driver) (ok bool) {
	defer func() {
		if recover() != nil {
			ok = false
		}
	}()
	return d.Close(ctx) == nil
}

type entry struct {
	fingerprint string
	result      Result
}
type Engine struct {
	mu       sync.Mutex
	seen     map[string]entry
	poisoned bool
}

func (e *Engine) Execute(ctx context.Context, c Command, newDriver func() (Driver, error)) (r Result) {
	r = base(c)
	if !Valid(c) {
		r.Kind = "NOT_SENT"
		r.Phase = "BEFORE_SUBMIT"
		r.Reason = "TARGET_MISMATCH"
		r.Stopped = true
		return r
	}
	// No waiting queue or cross-account overlap within this MCP instance.
	if !e.mu.TryLock() {
		r.Reason = "BUSY"
		return r
	}
	defer e.mu.Unlock()
	bytes, _ := json.Marshal(c)
	fingerprint := Hash(string(bytes))
	if prior, ok := e.seen[c.RequestKey]; ok {
		if prior.fingerprint == fingerprint {
			return prior.result
		}
		r.Reason = "REQUEST_CONFLICT"
		return r
	}
	if e.poisoned || len(e.seen) >= 1000 {
		r.Reason = "INSTANCE_PAUSED"
		return r
	}
	if e.seen == nil {
		e.seen = map[string]entry{}
	}
	// Reserve before driver creation. A panic must not permit a repeated send.
	e.seen[c.RequestKey] = entry{fingerprint, r}
	defer func() {
		if recover() != nil {
			r = base(c)
			r.Reason = "DRIVER_PANIC"
			e.poisoned = true
			e.seen[c.RequestKey] = entry{fingerprint, r}
		}
	}()
	d, err := newDriver()
	if err != nil {
		r.Reason = "STOP_UNCONFIRMED"
	} else {
		r = Run(ctx, c, d)
	}
	if !r.Stopped || r.Kind == "RISK" {
		e.poisoned = true
	}
	e.seen[c.RequestKey] = entry{fingerprint, r}
	return r
}

// Status never launches a browser. Process loss yields UNKNOWN, not a retry.
func (e *Engine) Status(c Command) Result {
	r := base(c)
	if !e.mu.TryLock() {
		r.Reason = "BUSY"
		return r
	}
	defer e.mu.Unlock()
	bytes, _ := json.Marshal(c)
	if p, ok := e.seen[c.RequestKey]; ok && p.fingerprint == Hash(string(bytes)) {
		return p.result
	}
	r.Reason = "NO_RECEIPT"
	return r
}
