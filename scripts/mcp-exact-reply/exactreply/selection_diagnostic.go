package exactreply

import (
	"context"
	"errors"
	"sync"
	"time"
)

const SelectionDiagnosticProtocol = "workbench.xhs.reply-selection-diagnostic.v1"

type SelectionTarget struct {
	Protocol           string    `json:"protocol"`
	InspectionID       string    `json:"inspectionId"`
	AccountID          string    `json:"accountId"`
	SenderID           string    `json:"senderId"`
	PostID             string    `json:"postId"`
	TargetID           string    `json:"targetCommentId"`
	RecipientID        string    `json:"recipientId"`
	Reference          Reference `json:"postReference"`
	MaxReplySelections int       `json:"maxReplySelections"`
	MaxInputs          int       `json:"maxInputs"`
	MaxSubmissions     int       `json:"maxSubmissions"`
}

func (t SelectionTarget) Command() Command {
	return Command{AccountID: t.AccountID, SenderID: t.SenderID, PostID: t.PostID, TargetID: t.TargetID, RecipientID: t.RecipientID, Reference: t.Reference}
}
func (t SelectionTarget) Valid() bool {
	return t.Protocol == SelectionDiagnosticProtocol && uuid.MatchString(t.InspectionID) && t.MaxReplySelections == 1 && t.MaxInputs == 0 && t.MaxSubmissions == 0 && (PreflightTarget{PreflightProtocol, t.AccountID, t.SenderID, t.PostID, t.TargetID, t.RecipientID, t.Reference}).Valid()
}

type SelectionTrace struct {
	Before         *SelectionEvidence `json:"before,omitempty"`
	Scrolled       *SelectionEvidence `json:"scrolled,omitempty"`
	After          *SelectionEvidence `json:"after,omitempty"`
	ClickAttempted bool               `json:"clickAttempted"`
	ClickEvent     string             `json:"clickEvent"`
}

// No full send Driver, body, Type, Submit or Readback is accepted.
type SelectionInspector interface {
	Inspect(context.Context, SelectionTarget) (Snapshot, error)
	OpenOnce(context.Context, SelectionTarget) error
	Trace() SelectionTrace
	Close(context.Context) error
}
type SelectionDiagnosticResult struct {
	Protocol         string         `json:"protocol"`
	InspectionID     string         `json:"inspectionId"`
	Kind             string         `json:"kind"`
	Diagnostic       Diagnostic     `json:"diagnostic"`
	Trace            SelectionTrace `json:"trace"`
	InputOperations  int            `json:"inputOperations"`
	SubmitOperations int            `json:"submitOperations"`
	ProcessStopped   bool           `json:"processStopped"`
}
type SelectionDiagnosticEngine struct {
	mu   sync.Mutex
	used bool
}

func (e *SelectionDiagnosticEngine) Execute(ctx context.Context, t SelectionTarget, factory func() (SelectionInspector, error)) (r SelectionDiagnosticResult) {
	r = SelectionDiagnosticResult{Protocol: SelectionDiagnosticProtocol, InspectionID: t.InspectionID, Kind: "STOPPED", Diagnostic: Diagnostic{"VALIDATE", "INVALID_COMMAND", checks(Snapshot{}, t.Command())}, Trace: SelectionTrace{ClickEvent: "NOT_OBSERVED"}, ProcessStopped: true}
	if !t.Valid() {
		return
	}
	e.mu.Lock()
	used := e.used
	e.used = true
	e.mu.Unlock()
	if used {
		r.Diagnostic.Code = "SELECTION_ALREADY_USED"
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 25*time.Second)
	defer cancel()
	if ctx.Err() != nil {
		r.Diagnostic.Code = "CANCELLED"
		return
	}
	var d SelectionInspector
	defer func() {
		if recover() != nil {
			r.Kind = "STOPPED"
			r.Diagnostic.Code = "DRIVER_PANIC"
		}
		if d != nil {
			r.Trace = safeSelectionTrace(d)
			closeCtx, stop := context.WithTimeout(context.Background(), 2*time.Second)
			defer stop()
			journalErr := RecordStage(closeCtxWithJournal(ctx, closeCtx), "BEFORE_CLOSE", nil, nil)
			r.ProcessStopped = closeSelection(closeCtx, d)
			if err := RecordStage(closeCtxWithJournal(ctx, closeCtx), "DRIVER_CLOSED", nil, &r.ProcessStopped); err != nil {
				journalErr = err
			}
			if journalErr != nil {
				r.Kind = "STOPPED"
				r.Diagnostic.Code = "JOURNAL_UNAVAILABLE"
			}
		}
		if !r.ProcessStopped {
			r.Kind = "STOPPED"
			r.Diagnostic.Stage = "CLOSE"
			r.Diagnostic.Code = "STOP_UNCONFIRMED"
		}
	}()
	if err := RecordStage(ctx, "STARTED", nil, nil); err != nil {
		r.Diagnostic.Code = "JOURNAL_UNAVAILABLE"
		return
	}
	r.ProcessStopped = false
	var err error
	d, err = factory()
	if err != nil || d == nil {
		r.Diagnostic.Code = "DRIVER_ERROR"
		return
	}
	r.Diagnostic.Stage = "INSPECT"
	snap, err := d.Inspect(ctx, t)
	r.Diagnostic.Checks = checks(snap, t.Command())
	if err == nil && !sameTarget(snap, t.Command()) {
		err = errors.New("TARGET_MISMATCH")
	}
	if err == nil {
		err = ctx.Err()
	}
	if err == nil {
		err = RecordStage(ctx, "INSPECTED", nil, nil)
	}
	if err == nil {
		r.Diagnostic.Stage = "SELECT"
		err = d.OpenOnce(ctx, t)
	}
	r.Trace = safeSelectionTrace(d)
	if err != nil {
		r.Diagnostic.Code = diagnosticCode(err)
		if err.Error() == "BINDING_EMPTY" && r.Trace.ClickAttempted {
			r.Diagnostic.Code = "POST_SELECTION_BINDING_EMPTY"
		}
		if code := risk(err); code != "" {
			r.Kind = "RISK"
			r.Diagnostic.Code = code
		}
		return
	}
	if ctx.Err() != nil {
		r.Diagnostic.Code = "CANCELLED"
		return
	}
	// Opening is not delivery or send eligibility. Require exact evidence even for diagnostic success.
	if r.Trace.Before == nil || r.Trace.Before.Binding != "EMPTY" || r.Trace.Before.Editor != "EMPTY" || !r.Trace.ClickAttempted || r.Trace.ClickEvent != "SELECT_EVENT_EXACT" || r.Trace.After == nil || r.Trace.After.Binding != "MATCH" || r.Trace.After.Editor != "EMPTY" || r.Trace.After.ReplyUI != "ACTIVE" {
		r.Diagnostic.Code = "SELECTION_OBSERVATION_INVALID"
		return
	}
	r.Kind = "SELECTED_EMPTY"
	r.Diagnostic.Code = "SELECTED_WITHOUT_INPUT"
	return
}
func closeCtxWithJournal(original, ctx context.Context) context.Context {
	if j, ok := original.Value(journalKey{}).(*Journal); ok {
		return WithJournal(ctx, j)
	}
	return ctx
}
func closeSelection(ctx context.Context, d SelectionInspector) (ok bool) {
	defer func() { _ = recover() }()
	return d.Close(ctx) == nil
}
func safeSelectionTrace(d SelectionInspector) (s SelectionTrace) {
	s.ClickEvent = "NOT_OBSERVED"
	defer func() { _ = recover() }()
	raw := d.Trace()
	s.ClickAttempted = raw.ClickAttempted
	s.ClickEvent = choose(raw.ClickEvent, "NOT_OBSERVED", "SELECT_EVENT_EXACT", "SELECT_EVENT_NONE", "SELECT_EVENT_OTHER", "SELECT_EVENT_MULTIPLE", "SELECT_EVENT_UNAVAILABLE")
	for _, pair := range []struct {
		in  *SelectionEvidence
		out **SelectionEvidence
	}{{raw.Before, &s.Before}, {raw.Scrolled, &s.Scrolled}, {raw.After, &s.After}} {
		if pair.in != nil && pair.in.Valid() {
			value := *pair.in
			*pair.out = &value
		}
	}
	return
}
