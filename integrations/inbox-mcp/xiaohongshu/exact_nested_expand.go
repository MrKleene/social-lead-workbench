package xiaohongshu

import (
	"context"
	"errors"
	"time"

	"github.com/go-rod/rod/lib/proto"
	"github.com/xpzouying/xiaohongshu-mcp/exactreply"
)

// exactCommentPath returns the root-to-target chain from the already loaded
// initial state. It is used only to find the floor that owns a nested target;
// the enclosing subComments relationship is never treated as the reply target.
func exactCommentPath(rows []Comment, targetID string) ([]Comment, bool) {
	var visit func([]Comment, []Comment) ([]Comment, bool)
	visit = func(xs []Comment, path []Comment) ([]Comment, bool) {
		for _, c := range xs {
			next := append(append([]Comment{}, path...), c)
			if c.ID == targetID {
				return next, true
			}
			if found, ok := visit(c.SubComments, next); ok {
				return found, true
			}
		}
		return nil, false
	}
	return visit(rows, nil)
}

func exactTargetDOMCount(ctx context.Context, d *exactReplyPage, targetID string) (int, error) {
	nodes, err := d.page.Context(ctx).Elements("#comment-" + targetID)
	if err != nil {
		return 0, err
	}
	return len(nodes), nil
}

// expandNestedTarget reveals a collapsed reply only after the exact target is
// already present in the platform state and only when its exact DOM node is
// absent. It clicks the floor's own .show-more control, never a reply control,
// never "收起", and is bounded to 12 clicks / 5 seconds. The caller must re-read
// state after a click so new siblings enter the before-set used for duplicate
// detection.
func (d *exactReplyPage) expandNestedTarget(ctx context.Context, c exactreply.Command, path []Comment) (bool, error) {
	if len(path) < 2 {
		return false, nil
	}
	count, err := exactTargetDOMCount(ctx, d, c.TargetID)
	if err != nil {
		return false, err
	}
	if count == 1 {
		return false, nil
	}
	if count > 1 {
		return false, errors.New("EXACT_TARGET_MISSING_OR_AMBIGUOUS")
	}

	rootID := path[0].ID
	deadline := time.Now().Add(5 * time.Second)
	clicks := 0
	for clicks < 12 && time.Now().Before(deadline) {
		if err := ctx.Err(); err != nil {
			return clicks > 0, err
		}
		// Recheck the exact page and account notice before every expansion click.
		if err := d.restrictions(ctx, c); err != nil {
			return clicks > 0, err
		}
		clicked, err := d.clickExpandOne(ctx, rootID)
		if err != nil {
			return clicks > 0, err
		}
		if !clicked {
			break
		}
		clicks++
		visible, err := d.waitExactTargetDOM(ctx, c.TargetID, 800*time.Millisecond, deadline)
		if err != nil {
			return true, err
		}
		if visible {
			return true, nil
		}
	}
	return clicks > 0, nil
}

func (d *exactReplyPage) clickExpandOne(ctx context.Context, rootID string) (bool, error) {
	roots, err := d.page.Context(ctx).Elements("#comment-" + rootID)
	if err != nil {
		return false, err
	}
	if len(roots) != 1 {
		return false, nil
	}
	// .show-more belongs to the floor container, not necessarily to the
	// .comment-item node itself. Find the one .parent-comment that owns this
	// exact root, then only admit its directly owned controls.
	parents, err := d.page.Context(ctx).Elements(".parent-comment")
	if err != nil {
		return false, err
	}
	for _, parent := range parents {
		ownsRoot, err := parent.Eval("function(){return !!this.querySelector('#comment-" + rootID + "')}")
		if err != nil {
			return false, err
		}
		if !ownsRoot.Value.Bool() {
			continue
		}
		buttons, err := parent.Elements(".show-more")
		if err != nil {
			return false, err
		}
		for index, button := range buttons {
			visible, err := button.Visible()
			if err != nil {
				return false, err
			}
			if !visible {
				continue
			}
			label, err := button.Text()
			if err != nil {
				return false, err
			}
			if !boundedReplyLabel.MatchString(label) && !moreReplyLabel.MatchString(label) {
				continue
			}
			owned, err := parent.Eval("function(i){const b=this.querySelectorAll('.show-more')[i];return !!b&&b.closest('.parent-comment')===this}", index)
			if err != nil || !owned.Value.Bool() {
				return false, err
			}
			if err := button.ScrollIntoView(); err != nil {
				return false, err
			}
			if err := button.Click(proto.InputMouseButtonLeft, 1); err != nil {
				return false, err
			}
			return true, nil
		}
	}
	return false, nil
}

func (d *exactReplyPage) waitExactTargetDOM(ctx context.Context, targetID string, wait time.Duration, deadline time.Time) (bool, error) {
	until := time.Now().Add(wait)
	if until.After(deadline) {
		until = deadline
	}
	for {
		if err := ctx.Err(); err != nil {
			return false, err
		}
		count, err := exactTargetDOMCount(ctx, d, targetID)
		if err != nil {
			return false, err
		}
		if count == 1 {
			return true, nil
		}
		if count > 1 {
			return false, errors.New("EXACT_TARGET_MISSING_OR_AMBIGUOUS")
		}
		if !time.Now().Before(until) {
			return false, nil
		}
		timer := time.NewTimer(100 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return false, ctx.Err()
		case <-timer.C:
		}
	}
}
