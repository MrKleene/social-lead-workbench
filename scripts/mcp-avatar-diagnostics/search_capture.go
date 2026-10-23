package xiaohongshu

import (
	"context"
	"encoding/json"
	"github.com/go-rod/rod"
	"time"
)

// Poll only the already-open page. No reload, search retry, scroll or expansion.
// Eight seconds is a deadline, never a readiness signal.
func observeSearch(ctx context.Context, page *rod.Page, keyword string, timeout time.Duration) ([]SearchFeed, *SearchObservation, error) {
	return observeSearchAtOrigin(ctx, page, keyword, timeout, "https://www.xiaohongshu.com")
}

// Origin is injected only by loopback tests; production uses the fixed official origin above.
func observeSearchAtOrigin(ctx context.Context, page *rod.Page, keyword string, timeout time.Duration, origin string) ([]SearchFeed, *SearchObservation, error) {
	started := time.Now()
	deadline := started.Add(timeout)
	var last *SearchObservation
	observations := 0
	var first *int
	for {
		if err := ctx.Err(); err != nil {
			if last != nil {
				last.Stop = "CANCELLED"
			}
			return nil, last, err
		}
		v, err := page.Eval(searchObservationTransportJS, keyword, origin)
		if err != nil {
			if last != nil {
				last.Stop = "EVALUATION_FAILED"
			}
			return nil, last, searchFailure("PAGE_EVALUATION_FAILED", err)
		}
		var sample struct {
			Diagnostic SearchObservation `json:"diagnostic"`
			Feeds      json.RawMessage   `json:"feeds"`
		}
		// Serialize inside the page: CDP returnByValue can turn Proxy arrays into
		// objects even when Array.isArray is true. Never coerce objects to arrays.
		var encoded string
		err = v.Value.Unmarshal(&encoded)
		if err == nil {
			err = json.Unmarshal([]byte(encoded), &sample)
		}
		if err != nil {
			if last != nil {
				last.Stop = "DESERIALIZATION_FAILED"
			}
			return nil, last, searchFailure("DESERIALIZATION_FAILED", err)
		}
		observations++
		last = &sample.Diagnostic
		if observations == 1 {
			first = last.RawCount
		}
		last.Observations = observations
		last.WaitedMs = int(time.Since(started).Milliseconds())
		last.FirstRawCount = first
		if last.State == "ACCESS_BLOCKED" {
			last.Stop = "BLOCKED"
			return nil, last, searchFailure("PAGE_REPORTED_ERROR", nil)
		}
		if last.State == "NOTES_AVAILABLE" || last.State == "INVALID_NOTE" {
			notes, issue := parseSearchNotes(sample.Feeds)
			if issue != nil {
				last.ParseIssue = issue
				last.Stop = "DESERIALIZATION_FAILED"
				return nil, last, searchFailure("DESERIALIZATION_FAILED", nil)
			}
			last.AcceptedCount = len(notes)
			last.Stop = "NOTES_AVAILABLE"
			return notes, last, nil
		}
		if !time.Now().Before(deadline) {
			last.Stop = "DEADLINE"
			return []SearchFeed{}, last, nil
		}
		timer := time.NewTimer(200 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			last.Stop = "CANCELLED"
			return nil, last, ctx.Err()
		case <-timer.C:
		}
	}
}
