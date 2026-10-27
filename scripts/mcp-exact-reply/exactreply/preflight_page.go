package exactreply

import (
	"context"
	"errors"
	"time"
)

// Fixed enum observations only. Never serialize actual location, query, IDs or state keys.
type PageChecks struct {
	Navigation string `json:"navigation"`
	Token      string `json:"token"`
	Source     string `json:"source"`
	Document   string `json:"document"`
	Root       string `json:"root"`
	Note       string `json:"note"`
	Map        string `json:"map"`
	Entry      string `json:"entry"`
	Wait       string `json:"wait"`
	Samples    int    `json:"samples"`
}

func SafePage(p PageChecks) PageChecks {
	p.Navigation = choose(p.Navigation, "EXACT_POST", "OTHER_POST", "OTHER_ROUTE", "EXTERNAL_ORIGIN")
	p.Token = choose(p.Token, "MATCH", "MISSING", "MISMATCH", "AMBIGUOUS")
	p.Source = choose(p.Source, "MATCH", "MISSING", "MISMATCH", "AMBIGUOUS")
	p.Document = choose(p.Document, "loading", "interactive", "complete")
	shape := func(s string) string {
		return choose(s, "MISSING", "PLAIN", "VALUE_REF", "RAW_VALUE_REF", "UNSUPPORTED_REF", "INVALID")
	}
	p.Root = shape(p.Root)
	p.Note = shape(p.Note)
	p.Map = shape(p.Map)
	p.Entry = shape(p.Entry)
	p.Wait = choose(p.Wait, "NOT_NEEDED", "BECAME_READY", "EXHAUSTED", "ABORTED", "BLOCKED")
	if p.Samples < 0 || p.Samples > 12 {
		p.Samples = 0
	}
	return p
}
func WaitForReadOnlyState(ctx context.Context, t PreflightTarget, sample func() (PreflightObservation, error), pause func(context.Context) error) (o PreflightObservation, err error) {
	for n := 1; n <= 12; n++ {
		if ctx.Err() != nil {
			o.Page.Wait = "ABORTED"
			return o, ctx.Err()
		}
		o, err = sample()
		o.Page = SafePage(o.Page)
		o.Page.Samples = n
		if ctx.Err() != nil {
			o.Page.Wait = "ABORTED"
			return o, ctx.Err()
		}
		if risk(err) != "" {
			o.Page.Wait = "BLOCKED"
			return
		}
		if o.Page.Navigation != "EXACT_POST" {
			o.Page.Wait = "BLOCKED"
			return o, errors.New("PREFLIGHT_NAVIGATION_UNVERIFIED")
		}
		if o.Page.Token != "MATCH" || o.Page.Source != "MATCH" {
			o.Page.Wait = "BLOCKED"
			return o, errors.New("PREFLIGHT_REFERENCE_UNVERIFIED")
		}
		// Known identity mismatch is terminal, never waited away or replaced.
		if o.Snapshot.SenderID != "" && o.Snapshot.SenderID != t.SenderID || o.Snapshot.PostID != "" && o.Snapshot.PostID != t.PostID {
			o.Page.Wait = "BLOCKED"
			return o, errors.New("TARGET_MISMATCH")
		}
		if err == nil {
			o.Page.Wait = "NOT_NEEDED"
			if n > 1 {
				o.Page.Wait = "BECAME_READY"
			}
			return
		}
		code := diagnosticCode(err)
		if code != "STATE_POST_MISSING" && code != "STATE_COMMENTS_MISSING" && code != "STATE_UNAVAILABLE" {
			o.Page.Wait = "BLOCKED"
			return
		}
		if n == 12 {
			o.Page.Wait = "EXHAUSTED"
			return
		}
		if e := pause(ctx); e != nil {
			o.Page.Wait = "ABORTED"
			return o, e
		}
	}
	return
}
func ReadOnlySettle(ctx context.Context) error {
	timer := time.NewTimer(250 * time.Millisecond)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-timer.C:
		return nil
	}
}
