package xiaohongshu

import (
	"encoding/json"
	"errors"
	"fmt"
	"github.com/go-rod/rod"
	"github.com/sirupsen/logrus"
	"time"
)

// Read the same state already used by the extractor. No scroll, click, fetch,
// timers in the page, profile request, or browser storage writes.
var errCoverageStateUnavailable = errors.New("PAGE_STATE_UNAVAILABLE")

const coveragePageScript = `() => {
 const unwrap=x=>x&&typeof x==='object'&&!Array.isArray(x)?(x.value!==undefined?x.value:x._rawValue!==undefined?x._rawValue:x):x;
 const shape=x=>x==null?'MISSING':typeof x!=='object'?'INVALID':x.value!==undefined?'VALUE_REF':x._rawValue!==undefined?'RAW_VALUE_REF':'PLAIN';
 const root=unwrap(window.__INITIAL_STATE__),note=unwrap(root?.note),map=unwrap(note?.noteDetailMap);
 const notes=map&&typeof map==='object'&&!Array.isArray(map)?Object.fromEntries(Object.entries(map).map(([id,v])=>{const entry=unwrap(v);return [id,entry&&typeof entry==='object'?{...entry,note:unwrap(entry.note),comments:unwrap(entry.comments)}:entry]})):null;
 const route=/^\/explore\/[a-f0-9]{24}$/.test(location.pathname)?'POST':location.pathname.startsWith('/user/profile/')?'PROFILE':'OTHER';
 return JSON.stringify({notes, state:{root:shape(window.__INITIAL_STATE__),note:shape(root?.note),map:shape(note?.noteDetailMap),route}, ready: {
  document: document.readyState,
  rootEndVisible: [...document.querySelectorAll('.note-scroller .end-container,.interact-container .end-container')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&/^(?:THE\s*END|-\s*THE\s*END\s*-)$/i.test((e.textContent||'').trim())),
  replyControls: Math.min(200,[...document.querySelectorAll('.note-scroller .show-more,.interact-container .show-more')].filter(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0).length),
  container: !!document.querySelector('.interact-container, .note-scroller'),
  emptyVisible: [...document.querySelectorAll('.note-scroller .no-comments-text,.note-scroller .comments-el,.interact-container .no-comments-text,.interact-container .comments-el')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&/^这是一片荒地/.test((e.textContent||'').trim())),
  commentsLoading: [...document.querySelectorAll('.note-scroller .comments-el,.interact-container .comments-el')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0&&/^加载中/.test((e.textContent||'').trim()))
 }});
}`

func captureCoveragePage(page *rod.Page) (string, CoverageReady, error) {
	ready := CoverageReady{Document: "UNKNOWN"}
	v, err := page.Eval(coveragePageScript)
	if err != nil {
		return "", ready, fmt.Errorf("coverage observation unavailable")
	}
	var envelope struct {
		Notes json.RawMessage                         `json:"notes"`
		Ready CoverageReady                           `json:"ready"`
		State struct{ Root, Note, Map, Route string } `json:"state"`
	}
	if json.Unmarshal([]byte(v.Value.Str()), &envelope) != nil {
		return "", ready, errors.New("INVALID_RESPONSE")
	}
	if len(envelope.Notes) == 0 || string(envelope.Notes) == "null" {
		// Only bounded shape enums, never source text, cookies or URLs.
		logrus.Warnf("coverage state missing: root=%s note=%s map=%s route=%s document=%s container=%v", envelope.State.Root, envelope.State.Note, envelope.State.Map, envelope.State.Route, envelope.Ready.Document, envelope.Ready.Container)
		return "", envelope.Ready, errCoverageStateUnavailable
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
