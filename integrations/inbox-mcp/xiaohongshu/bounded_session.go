package xiaohongshu

import (
	"context"
	"errors"
	"github.com/go-rod/rod"
	"regexp"
)

// Owned by one authenticated account process and one live browser page. No URL,
// credentials or raw data are persisted in a continuation handle.
var boundedHandle = regexp.MustCompile(`^[a-f0-9]{64}$`)

type BoundedSession struct {
	page    *rod.Page
	id      string
	store   *boundedStore
	windows int
}

func (s *BoundedSession) Read(ctx context.Context, page *rod.Page, id string, c BoundedReadConfig) (*FeedDetailResponse, error) {
	if s.windows >= 8 {
		return nil, errors.New("CONTINUATION_LIMIT")
	}
	if s.store == nil {
		s.page = page
		s.id = id
		s.store = newBoundedStore(id)
	} else if page != nil && s.page != page || s.id != id {
		return nil, errors.New("CONTINUATION_MISMATCH")
	}
	s.windows++
	page = s.page
	raw, report, e := runBoundedReadWindow(ctx, &boundedRodPage{page: page, feedID: id, refreshRoots: true}, id, c, s.store)
	if e != nil {
		return nil, e
	}
	report.Window = s.windows
	return decodeBoundedDetail(raw, id, report)
}
func CanContinueBounded(r *BoundedReadReport) bool {
	if r == nil || r.Actions == nil || r.Actions.AddedRoots+r.Actions.AddedReplies == 0 || r.State == "COMPLETE" || r.Window >= 8 || r.Retained.Loaded == nil || r.Retained.Loaded.UniqueKnown >= 100 || r.Retained.Loaded.Roots >= 40 {
		return false
	}
	switch r.Reason {
	case "ROOT_PAGE_BUDGET", "REPLY_CLICK_BUDGET", "TIMEOUT":
		return true
	}
	return false
}

type BoundedContinuationRequest struct {
	Mode  string `json:"mode"`
	Token string `json:"token,omitempty"`
}

func (r BoundedContinuationRequest) Valid() bool {
	return r.Mode == "START" && r.Token == "" || r.Mode == "RESUME" && len(r.Token) == 64 && boundedHandle.MatchString(r.Token)
}

type BoundedContinuation struct {
	Token string `json:"token,omitempty"`
	State string `json:"state"`
}
