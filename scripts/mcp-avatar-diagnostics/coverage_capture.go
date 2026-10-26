package xiaohongshu

import (
	"encoding/json"
	"fmt"
	"github.com/go-rod/rod"
	"time"
)

// Read the same state already used by the extractor. No scroll, click, fetch,
// timers in the page, profile request, or browser storage writes.
const coveragePageScript = `() => {
 const notes = window.__INITIAL_STATE__?.note?.noteDetailMap;
 return JSON.stringify({notes: notes ?? null, ready: {
  document: document.readyState,
  rootEndVisible: [...document.querySelectorAll('.note-scroller .end-container,.interact-container .end-container')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&/^(?:THE\s*END|-\s*THE\s*END\s*-)$/i.test((e.textContent||'').trim())),
  replyControls: Math.min(200,[...document.querySelectorAll('.note-scroller .show-more,.interact-container .show-more')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).length),
  container: !!document.querySelector('.interact-container, .note-scroller'),
  emptyVisible: [...document.querySelectorAll('.note-scroller .no-comments-text,.interact-container .no-comments-text')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&(e.textContent||'').trim()==='这是一片荒地')
 }});
}`

func captureCoveragePage(page *rod.Page) (string, CoverageReady, error) {
	ready := CoverageReady{Document: "UNKNOWN"}
	v, err := page.Eval(coveragePageScript)
	if err != nil {
		return "", ready, fmt.Errorf("coverage observation unavailable")
	}
	var envelope struct {
		Notes json.RawMessage `json:"notes"`
		Ready CoverageReady   `json:"ready"`
	}
	if json.Unmarshal([]byte(v.Value.Str()), &envelope) != nil || len(envelope.Notes) == 0 || string(envelope.Notes) == "null" {
		return "", ready, fmt.Errorf("page state unavailable")
	}
	return string(envelope.Notes), envelope.Ready, nil
}
func observeCoverage(page *rod.Page, feedID, original string, ready CoverageReady) *CoverageDiagnostic {
	started := time.Now()
	samples := []CoverageSample{inspectCoverage([]byte(original), feedID, ready)}
	for n := 0; n < 2; n++ {
		timer := time.NewTimer(250 * time.Millisecond)
		select {
		case <-page.GetContext().Done():
			timer.Stop()
			samples = append(samples, coverageUnavailable())
			continue
		case <-timer.C:
		}
		raw, state, err := captureCoveragePage(page)
		if err != nil {
			samples = append(samples, coverageUnavailable())
			continue
		}
		samples = append(samples, inspectCoverage([]byte(raw), feedID, state))
	}
	elapsed := int(time.Since(started).Milliseconds())
	if elapsed > 60000 {
		elapsed = 60000
	}
	return coverageReport(samples, elapsed)
}
