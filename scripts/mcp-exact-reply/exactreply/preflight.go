package exactreply

import (
	"context"
	"time"
)

const PreflightProtocol = "workbench.xhs.exact-preflight.v2"

// No text, send authorization, request key or submission option exists here.
type PreflightTarget struct {
	Protocol    string    `json:"protocol"`
	AccountID   string    `json:"accountId"`
	SenderID    string    `json:"senderId"`
	PostID      string    `json:"postId"`
	TargetID    string    `json:"targetCommentId"`
	RecipientID string    `json:"recipientId"`
	Reference   Reference `json:"postReference"`
}

func (t PreflightTarget) command() Command {
	return Command{AccountID: t.AccountID, SenderID: t.SenderID, PostID: t.PostID, TargetID: t.TargetID, RecipientID: t.RecipientID, Reference: t.Reference}
}
func (t PreflightTarget) Valid() bool {
	return t.Protocol == PreflightProtocol && opaque.MatchString(t.AccountID) && id.MatchString(t.SenderID) && id.MatchString(t.PostID) && id.MatchString(t.TargetID) && id.MatchString(t.RecipientID) && t.Reference.PostID == t.PostID && len(t.Reference.Token) <= 4096 && token.MatchString(t.Reference.Token) && (t.Reference.Source == "pc_feed" || t.Reference.Source == "pc_search")
}

// Read-only compile-time surface. Select, Type, Submit and send Engine are absent.
type ReadOnlyInspector interface {
	Inspect(context.Context, PreflightTarget) (PreflightObservation, error)
	Close(context.Context) error
}
type DOMChecks struct {
	Target      string `json:"target"`
	Author      string `json:"author"`
	ReplyButton string `json:"replyButton"`
	Composer    string `json:"composer"`
}
type FieldSources struct {
	Identity string `json:"identity"`
	Target   string `json:"target"`
	DOM      string `json:"dom"`
}
type PreflightObservation struct {
	Selection *SelectionEvidence
	Snapshot  Snapshot
	DOM       DOMChecks
	Sources   FieldSources
	Page      PageChecks
}
type PreflightResult struct {
	Selection       *SelectionEvidence `json:"selection,omitempty"`
	Protocol        string             `json:"protocol"`
	Kind            string             `json:"kind"`
	Diagnostic      Diagnostic         `json:"diagnostic"`
	DOM             DOMChecks          `json:"dom"`
	Sources         FieldSources       `json:"sources"`
	ProcessStopped  bool               `json:"processStopped"`
	WriteOperations int                `json:"writeOperations"`
	Page            PageChecks         `json:"page"`
}

func emptyPreflight(t PreflightTarget) PreflightResult {
	return PreflightResult{Protocol: PreflightProtocol, Kind: "UNAVAILABLE", Diagnostic: Diagnostic{"VALIDATE", "INVALID_COMMAND", checks(Snapshot{}, t.command())}, DOM: DOMChecks{"UNKNOWN", "UNKNOWN", "UNKNOWN", "UNKNOWN"}, Sources: FieldSources{"UNOBSERVED", "UNOBSERVED", "UNOBSERVED"}, Page: SafePage(PageChecks{})}
}
func Preflight(ctx context.Context, t PreflightTarget, newInspector func() (ReadOnlyInspector, error)) (r PreflightResult) {
	r = emptyPreflight(t)
	if !t.Valid() {
		r.ProcessStopped = true
		return
	}
	ctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	if ctx.Err() != nil {
		r.Diagnostic.Code = "CANCELLED"
		r.ProcessStopped = true
		return
	}
	// Inspector is responsible for cleaning partial construction; factory errors never claim stop.
	var d ReadOnlyInspector
	defer func() {
		if recover() != nil {
			r.Kind = "UNAVAILABLE"
			r.Diagnostic.Code = "DRIVER_PANIC"
		}
		if d != nil {
			closeCtx, stop := context.WithTimeout(context.Background(), 2*time.Second)
			defer stop()
			r.ProcessStopped = closeInspector(closeCtx, d)
		}
		if !r.ProcessStopped {
			r.Kind = "UNAVAILABLE"
			r.Diagnostic.Stage = "CLOSE"
			r.Diagnostic.Code = "STOP_UNCONFIRMED"
		}
	}()
	var err error
	d, err = newInspector()
	if err != nil || d == nil {
		r.Diagnostic.Code = "DRIVER_ERROR"
		return
	}
	r.Diagnostic.Stage = "INSPECT"
	o, err := d.Inspect(ctx, t)
	r.Diagnostic.Checks = checks(o.Snapshot, t.command())
	// Only these enums can cross the boundary, even from malformed drivers.
	r.DOM = safeDOM(o.DOM)
	r.Sources = safeSources(o.Sources)
	r.Page = SafePage(o.Page)
	if o.Selection != nil && o.Selection.Valid() {
		r.Selection = o.Selection
	}
	if err != nil {
		r.Diagnostic.Code = diagnosticCode(err)
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
	if r.Page.Navigation != "EXACT_POST" || r.Page.Token != "MATCH" || r.Page.Source != "MATCH" {
		r.Diagnostic.Code = "PREFLIGHT_REFERENCE_UNVERIFIED"
		return
	}
	if !sameTarget(o.Snapshot, t.command()) {
		r.Kind = "MISMATCH"
		r.Diagnostic.Code = "TARGET_MISMATCH"
		return
	}
	if r.DOM.Target != "UNIQUE" || r.DOM.Author != "MATCH" || r.DOM.ReplyButton != "EXACT" {
		r.Kind = "DOM_UNAVAILABLE"
		r.Diagnostic.Code = "DOM_LOCATOR_UNVERIFIED"
		return
	}
	r.Kind = "MATCHED_READ_ONLY"
	r.Diagnostic.Code = "READ_ONLY_MATCH"
	return
}
func closeInspector(ctx context.Context, d ReadOnlyInspector) (ok bool) {
	defer func() { _ = recover() }()
	return d.Close(ctx) == nil
}
func choose(s string, allowed ...string) string {
	for _, v := range allowed {
		if s == v {
			return s
		}
	}
	return "UNKNOWN"
}
func safeDOM(d DOMChecks) DOMChecks {
	return DOMChecks{choose(d.Target, "MISSING", "UNIQUE", "AMBIGUOUS"), choose(d.Author, "MISSING", "MATCH", "MISMATCH", "AMBIGUOUS"), choose(d.ReplyButton, "MISSING", "EXACT", "MISMATCH", "AMBIGUOUS"), choose(d.Composer, "ABSENT", "EMPTY", "NONEMPTY", "AMBIGUOUS")}
}
func safeSources(s FieldSources) FieldSources {
	return FieldSources{choose(s.Identity, "INITIAL_STATE_USER_INFO"), choose(s.Target, "INITIAL_STATE_NOTE_COMMENTS"), choose(s.DOM, "EXACT_COMMENT_ID_AND_SCOPED_DESCENDANTS")}
}
