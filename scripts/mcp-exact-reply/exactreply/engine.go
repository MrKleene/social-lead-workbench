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

// Diagnostics contain fixed enums only: no IDs, URLs, text, tokens or raw errors.
type IdentityChecks struct {
	Post   string `json:"post"`
	Sender string `json:"sender"`
	Target string `json:"target"`
	Author string `json:"author"`
}
type Diagnostic struct {
	Stage  string         `json:"stage"`
	Code   string         `json:"code"`
	Checks IdentityChecks `json:"checks"`
}

func checkID(actual, expected string) string {
	if actual == "" {
		return "UNKNOWN"
	}
	if actual == expected {
		return "MATCH"
	}
	return "MISMATCH"
}
func checks(s Snapshot, c Command) IdentityChecks {
	return IdentityChecks{checkID(s.PostID, c.PostID), checkID(s.SenderID, c.SenderID), checkID(s.TargetID, c.TargetID), checkID(s.TargetAuthor, c.RecipientID)}
}
func diagnosticCode(err error) string {
	if errors.Is(err, context.Canceled) || errors.Is(err, context.DeadlineExceeded) {
		return "CANCELLED"
	}
	if err == nil {
		return "UNCONFIRMED"
	}
	switch err.Error() {
	case "ACCOUNT_CHANGED", "RECEIPT_NOT_UNIQUE", "SELECTION_STEP_MISSING", "RESTRICTION_UNVERIFIED", "JOURNAL_UNAVAILABLE", "PREFLIGHT_NAVIGATION_UNVERIFIED", "PREFLIGHT_REFERENCE_UNVERIFIED", "INVALID_COMMAND", "STATE_UNAVAILABLE", "STATE_INVALID", "STATE_USER_MISSING", "STATE_POST_MISSING", "STATE_POST_MISMATCH", "STATE_COMMENTS_MISSING", "DEPTH_LIMIT", "ROW_LIMIT", "POST_MISMATCH", "EXACT_TARGET_MISSING_OR_AMBIGUOUS", "TARGET_MISMATCH", "TARGET_CHANGED", "COMPOSER_ALREADY_OPEN", "COMPOSER_DRAFT_PRESENT", "COMPOSER_HIDDEN", "COMPOSER_ACTIVE", "COMPOSER_TARGET_BOUND", "COMPOSER_NOT_DEFAULT", "COMPOSER_AMBIGUOUS", "COMPOSER_UNRECOGNIZED", "COMPOSER_BINDING_UNVERIFIED", "COMPOSER_NOT_ACTIVE", "BINDING_EMPTY", "BINDING_STATE_MISSING", "BINDING_USER_MISSING", "SUBMIT_NOT_READY", "BINDING_INVALID", "BINDING_TARGET_MISMATCH", "BINDING_AUTHOR_MISMATCH", "BINDING_POST_MISMATCH", "BINDING_ACCOUNT_MISMATCH", "EXACT_TARGET_NOT_VISIBLE", "AUTHOR_AMBIGUOUS", "EXACT_TARGET_MISSING", "AUTHOR_MISMATCH", "REPLY_BUTTON_AMBIGUOUS", "BUTTON_TARGET_MISMATCH", "CONTENT_CHANGED", "COMPOSER_CHANGED", "SUBMIT_AMBIGUOUS", "NOT_SUBMITTED":
		return err.Error()
	default:
		return "DRIVER_ERROR"
	}
}

type Result struct {
	Diagnostic          *Diagnostic  `json:"diagnostic,omitempty"`
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
	stage := "VALIDATE"
	identity := checks(Snapshot{}, c)
	ctx, cancel := context.WithTimeout(ctx, 40*time.Second)
	defer cancel()
	defer func() {
		if recover() != nil {
			r = base(c)
			r.Reason = "DRIVER_PANIC"
			r.Diagnostic = &Diagnostic{stage, "DRIVER_PANIC", identity}
		}
		closeCtx, stop := context.WithTimeout(context.WithoutCancel(ctx), 2*time.Second)
		defer stop()
		if ctx.Err() != nil {
			_ = RecordStage(ctx, "CANCELLED", nil, nil)
		}
		if observer, ok := d.(interface {
			FinalRestriction(context.Context, Command) error
		}); ok {
			// Bounded read on the existing page only, including error/panic paths.
			if err := finalRestrictionSafely(closeCtx, c, observer.FinalRestriction); risk(err) != "" {
				r = base(c)
				r.Kind = "RISK"
				r.Reason = risk(err)
				r.Phase = ""
				r.Diagnostic = &Diagnostic{stage, r.Reason, identity}
			} else if err != nil && r.Kind == "CONFIRMED" {
				r = base(c)
				r.Diagnostic = &Diagnostic{"CLOSE", "RESTRICTION_UNVERIFIED", identity}
			}
		}
		_ = RecordStage(ctx, "BEFORE_CLOSE", nil, nil)
		stopped := closeSafely(closeCtx, d)
		r.Stopped = stopped
		if RecordStage(ctx, "DRIVER_CLOSED", nil, &r.Stopped) != nil && r.Kind != "RISK" {
			r = base(c)
			r.Reason = "JOURNAL_UNAVAILABLE"
			r.Stopped = stopped // preserve actual shutdown acknowledgement
			r.Diagnostic = &Diagnostic{"CLOSE", "JOURNAL_UNAVAILABLE", identity}
		}
		if !r.Stopped && r.Kind != "RISK" {
			r = base(c)
			r.Reason = "STOP_UNCONFIRMED"
			r.Diagnostic = &Diagnostic{"CLOSE", "STOP_UNCONFIRMED", identity}
		}
	}()
	fail := func(err error) Result {
		r = base(c)
		r.Diagnostic = &Diagnostic{stage, diagnosticCode(err), identity}
		if code := risk(err); code != "" {
			r.Kind = "RISK"
			r.Reason = code
			r.Diagnostic.Code = code
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
	if err := RecordStage(ctx, "STARTED", nil, nil); err != nil {
		return fail(err)
	}
	stage = "INSPECT"
	before, err := d.Inspect(ctx, c)
	identity = checks(before, c)
	if err != nil {
		return fail(err)
	}
	if !sameTarget(before, c) {
		return fail(errors.New("TARGET_MISMATCH"))
	}
	if ctx.Err() != nil {
		return fail(ctx.Err())
	}
	if err = RecordStage(ctx, "INSPECTED", nil, nil); err != nil {
		return fail(err)
	}
	stage = "SELECT"
	if err = d.Select(ctx, c); err != nil {
		return fail(err)
	}
	if err = RecordStage(ctx, "SELECTED", nil, nil); err != nil {
		return fail(err)
	}
	stage = "RECHECK"
	again, err := d.Inspect(ctx, c)
	identity = checks(again, c)
	if err != nil {
		return fail(err)
	}
	if !sameTarget(again, c) {
		return fail(errors.New("TARGET_CHANGED"))
	}
	if ctx.Err() != nil {
		return fail(ctx.Err())
	}
	if err = RecordStage(ctx, "RECHECKED", nil, nil); err != nil {
		return fail(err)
	}
	// Once Submit is entered, errors are ambiguous unless the driver proves no click.
	stage = "SUBMIT"
	submitted = true
	s, err := d.Submit(ctx, c)
	submitted = s.Attempted
	if journalErr := RecordStage(ctx, "SUBMIT_FINISHED", &s.Attempted, nil); journalErr != nil && !isRisk(s.Risk) && risk(err) == "" {
		r = base(c)
		r.Reason = "JOURNAL_UNAVAILABLE"
		r.Diagnostic = &Diagnostic{stage, "JOURNAL_UNAVAILABLE", identity}
		return r
	}
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
	r.Diagnostic = &Diagnostic{"SUBMIT", "UNCONFIRMED", identity}
	if s.Response == nil || !Matches(*s.Response, c) || before.ExistingIDs[s.Response.ID] || again.ExistingIDs[s.Response.ID] {
		if s.Accepted {
			r.Kind = "ACCEPTED"
			r.Reason = "RECEIPT_UNCONFIRMED"
		}
		return r
	}
	stage = "READBACK"
	observed, err := d.Readback(ctx, c, s.Response.ID)
	if err != nil {
		return fail(err)
	}
	if ctx.Err() != nil || !Matches(observed, c) || observed != *s.Response {
		return r
	}
	if err = RecordStage(ctx, "READBACK", nil, nil); err != nil {
		return fail(err)
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
		r.Diagnostic = &Diagnostic{"VALIDATE", "INVALID_COMMAND", checks(Snapshot{}, c)}
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

func finalRestrictionSafely(ctx context.Context, c Command, inspect func(context.Context, Command) error) (err error) {
	defer func() {
		if recover() != nil {
			err = errors.New("RESTRICTION_UNVERIFIED")
		}
	}()
	return inspect(ctx, c)
}
