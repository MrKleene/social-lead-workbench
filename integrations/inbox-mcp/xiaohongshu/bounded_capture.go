package xiaohongshu

import (
	"context"
	"encoding/json"
	"errors"
	"github.com/go-rod/rod"
	"github.com/go-rod/rod/lib/proto"
	"github.com/sirupsen/logrus"
	"net/url"
	"regexp"
	"strconv"
	"strings"
)

// Candidate driver: no arbitrary page links, API fetches or profile lookups.
// Only known root containers and their own reply buttons are actionable.
type boundedRodPage struct {
	page         *rod.Page
	feedID       string
	roots        rod.Elements
	refreshRoots bool
	scopeOK      bool
	chunkMode    bool
}

func (p *boundedRodPage) guard(ctx context.Context) error {
	v, e := p.page.Context(ctx).Eval(`post => {
		if([...document.querySelectorAll('.access-wrapper,.error-wrapper,.not-found-wrapper,.blocked-wrapper,.captcha-container,.login-container')].some(e=>e.getBoundingClientRect().width>0&&e.getBoundingClientRect().height>0))return 'WRAPPER|'+location.href;
		if(location.hostname==='www.xiaohongshu.com'&&location.pathname!=='/explore/'+post)return 'URL|'+location.href;
		return 'OK';
	}`, p.feedID)
	if e != nil {
		logrus.Errorf("guard eval failed: %v", e)
		return errors.New("READ_FAILED")
	}
	raw := v.Value.Str()
	if raw == "OK" {
		return nil
	}
	kind, location, _ := strings.Cut(raw, "|")
	code := "IDENTITY_CONFLICT"
	if kind == "WRAPPER" {
		code = "PLATFORM_LIMIT"
	} else {
		code = classifyGuardLocation(location)
	}
	// Log the path and platform error code only; the query string carries access tokens.
	logrus.Warnf("guard rejected: %s path=%s error_code=%s", code, guardLogPath(location), guardErrorCode(location))
	return errors.New(code)
}

// A redirected page is not always another note: the platform sends rate-limited
// accounts to its login/error shell (for example error_code=300013), which must
// stop the read as a platform limit instead of a note identity conflict.
func classifyGuardLocation(href string) string {
	u, e := url.Parse(href)
	if e != nil || u.Host == "" {
		return "IDENTITY_CONFLICT"
	}
	host := strings.ToLower(u.Hostname())
	if host != "www.xiaohongshu.com" && host != "xiaohongshu.com" {
		return "IDENTITY_CONFLICT"
	}
	path := u.Path
	if strings.HasPrefix(path, "/website-login") || strings.HasPrefix(path, "/login") || u.Query().Get("error_code") != "" {
		return "PLATFORM_LIMIT"
	}
	return "IDENTITY_CONFLICT"
}

func guardLogPath(href string) string {
	if u, e := url.Parse(href); e == nil {
		return u.Path
	}
	return ""
}

func guardErrorCode(href string) string {
	if u, e := url.Parse(href); e == nil {
		return u.Query().Get("error_code")
	}
	return ""
}
func (p *boundedRodPage) Snapshot(ctx context.Context) ([]byte, CoverageReady, error) {
	if e := p.guard(ctx); e != nil {
		return nil, CoverageReady{Document: "UNKNOWN"}, e
	}
	raw, ready, e := captureCoveragePage(p.page.Context(ctx))
	if e != nil {
		logrus.Errorf("capture coverage failed: %v", e)
		return nil, ready, e
	}
	{ // Re-resolve after every page-state snapshot; retained handles may detach.
		p.refreshRoots = false
		p.scopeOK = false
		roots, err := p.page.Context(ctx).Elements(".parent-comment")
		sample := inspectCoverage([]byte(raw), p.feedID, ready)
		count := -1
		if sample.Loaded != nil {
			count = sample.Loaded.Roots
		}
		if p.chunkMode {
			if _, rows, e := chunkSnapshot([]byte(raw), p.feedID); e == nil {
				count = 0
				for _, row := range rows {
					if row.mark.Parent == "" {
						count++
					}
				}
			}
		}
		if err == nil && len(roots) == count {
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
	// Only scroll the known comment containers; missing scope is not proof of exhaustion.
	v, e := p.page.Context(ctx).Eval(`() => {const e=[...document.querySelectorAll('.note-scroller,.comments-container')].find(x=>x.scrollHeight>x.clientHeight+1);if(!e)return false;e.scrollTo({top:e.scrollHeight,behavior:'instant'});return true}`)
	if e != nil || !v.Value.Bool() {
		return errors.New("READ_FAILED")
	}
	p.refreshRoots = true
	return nil
}

var boundedReplyLabel = regexp.MustCompile(`^(?:展开|查看)\s*(\d+)\s*条回复$`)
var moreReplyLabel = regexp.MustCompile(`^(?:展开更多回复|查看更多回复|更多回复)$`)

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
		for buttonIndex, button := range buttons {
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
			if m == nil && !(p.chunkMode && moreReplyLabel.MatchString(label)) {
				reason = "UNKNOWN_REPLY_COUNT"
				continue
			}
			if m != nil {
				n, parseErr := strconv.Atoi(m[1])
				if parseErr != nil || n < 1 {
					reason = "UNKNOWN_REPLY_COUNT"
					continue
				}
				// Chunking limits what is emitted, not what one expansion may reveal.
				// Never skip an accessible discussion just because its label says >30.
				if !p.chunkMode && (n > remaining || loaded+n > maxPerRoot) {
					reason = "REPLY_THRESHOLD"
					continue
				}
			}
			owned, ownershipErr := root.Eval(`function(i){const b=this.querySelectorAll('.show-more')[i];return !!b&&b.closest('.parent-comment')===this}`, buttonIndex)
			if ownershipErr != nil || !owned.Value.Bool() {
				return "DOM_SCOPE_UNKNOWN", nil
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
