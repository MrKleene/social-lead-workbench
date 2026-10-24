package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"regexp"
	"strconv"
)

// Candidate driver: no arbitrary page links, API fetches or profile lookups.
// Only known root containers and their own reply buttons are actionable.
type boundedRodPage struct {
	page         *rod.Page
	feedID       string
	roots        rod.Elements
	refreshRoots bool
	scopeOK      bool
}

func (p *boundedRodPage) guard(ctx context.Context) error {
	v, e := p.page.Context(ctx).Eval(`() => [...document.querySelectorAll('.access-wrapper,.error-wrapper,.not-found-wrapper,.blocked-wrapper,.captcha-container,.login-container')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0)`)
	if e != nil {
		return errors.New("READ_FAILED")
	}
	if v.Value.Bool() {
		return errors.New("PLATFORM_LIMIT")
	}
	return nil
}
func (p *boundedRodPage) Snapshot(ctx context.Context) ([]byte, CoverageReady, error) {
	if e := p.guard(ctx); e != nil {
		return nil, CoverageReady{Document: "UNKNOWN"}, e
	}
	raw, ready, e := captureCoveragePage(p.page.Context(ctx))
	if e != nil {
		return nil, ready, errors.New("READ_FAILED")
	}
	{ // Re-resolve after every page-state snapshot; retained handles may detach.
		p.refreshRoots = false
		p.scopeOK = false
		roots, err := p.page.Context(ctx).Elements(".parent-comment")
		sample := inspectCoverage([]byte(raw), p.feedID, ready)
		if err == nil && sample.Loaded != nil && len(roots) == sample.Loaded.Roots {
			p.roots = roots
			p.scopeOK = true
		}
	}
	scope := p.scopeOK
	ready.RootScopeExact = &scope
	return []byte(raw), ready, nil
}
func (p *boundedRodPage) ScrollRoots(ctx context.Context) error {
	if e := p.guard(ctx); e != nil {
		return e
	}
	v, e := p.page.Context(ctx).Eval(`() => {const e=[...document.querySelectorAll('.note-scroller,.comments-container')].find(x=>x.scrollHeight>x.clientHeight+1);if(!e)return false;e.scrollTo({top:e.scrollHeight,behavior:'instant'});return true}`)
	if e != nil || !v.Value.Bool() {
		return errors.New("READ_FAILED")
	}
	p.refreshRoots = true
	return nil
}

var boundedReplyLabel = regexp.MustCompile(`^展开\s*(\d+)\s*条回复$`)

func (p *boundedRodPage) ExpandReply(ctx context.Context, remaining, maxPerRoot int) (string, error) {
	if e := p.guard(ctx); e != nil {
		return "", e
	}
	if !p.scopeOK {
		return "DOM_SCOPE_UNKNOWN", nil
	}
	reason := "BUTTON_NOT_FOUND"
	for _, root := range p.roots {
		root = root.Context(ctx)
		info, e := root.Eval(`function(){return {connected:this.isConnected,n:this.querySelectorAll('.comment-item').length+(this.matches('.comment-item')?1:0)}}`)
		if e != nil || !info.Value.Get("connected").Bool() {
			return "DOM_SCOPE_UNKNOWN", nil
		}
		loaded := info.Value.Get("n").Int() - 1
		if loaded < 0 {
			return "DOM_SCOPE_UNKNOWN", nil
		}
		buttons, e := root.Elements(".show-more")
		if e != nil {
			return "CLICK_FAILED", nil
		}
		for _, button := range buttons {
			visible, e := button.Visible()
			if e != nil {
				return "CLICK_FAILED", nil
			}
			if !visible {
				continue
			}
			label, e := button.Text()
			if e != nil {
				return "CLICK_FAILED", nil
			}
			m := boundedReplyLabel.FindStringSubmatch(label)
			if m == nil {
				reason = "UNKNOWN_REPLY_COUNT"
				continue
			}
			n, e := strconv.Atoi(m[1])
			if e != nil || n < 1 {
				reason = "UNKNOWN_REPLY_COUNT"
				continue
			}
			if n > remaining || loaded+n > maxPerRoot {
				reason = "REPLY_THRESHOLD"
				continue
			}
			// Scroll only an already-admitted root's reply control into view. Any incidental
			// new roots in page state are excluded by the merger, never silently admitted.
			if e = button.ScrollIntoView(); e != nil {
				return "CLICK_FAILED", nil
			}
			if e = p.guard(ctx); e != nil {
				return "", e
			}
			if e = button.Click(proto.InputMouseButtonLeft, 1); e != nil {
				return "CLICK_FAILED", nil
			}
			return "CLICKED", nil
		}
	}
	return reason, nil
}
func boundedReadDetail(ctx context.Context, page *rod.Page, id string, c BoundedReadConfig) (*FeedDetailResponse, error) {
	raw, report, e := runBoundedRead(ctx, &boundedRodPage{page: page, feedID: id, refreshRoots: true}, id, c)
	if e != nil {
		return nil, e
	}
	return decodeBoundedDetail(raw, id, report)
}
func decodeBoundedDetail(raw []byte, id string, report *BoundedReadReport) (*FeedDetailResponse, error) {
	var notes map[string]struct {
		Note     FeedDetail  `json:"note"`
		Comments CommentList `json:"comments"`
	}
	if json.Unmarshal(raw, &notes) != nil {
		return nil, errors.New("INVALID_RESPONSE")
	}
	note, ok := notes[id]
	if !ok {
		return nil, errors.New("INVALID_RESPONSE")
	}
	return &FeedDetailResponse{Note: note.Note, Comments: note.Comments, AvatarSourceDiagnostic: inspectRawAvatarSource(raw, id), BoundedRead: report}, nil
}
