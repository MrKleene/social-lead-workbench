package xiaohongshu

// Missing leaf counters remain MISSING. This alternate proof closes a root's
// flat subComments list; containment is not the reply's direct targetComment.
func rootScopedLeaves(s CoverageSample) (int, bool) {
	if s.Loaded == nil || len(s.Groups) != s.Loaded.UniqueKnown {
		return 0, false
	}
	roots := map[int]CoverageReplyGroup{}
	counts := map[int]int{}
	leaves := 0
	for _, g := range s.Groups {
		if g.Depth == 0 && g.Parent == nil {
			roots[g.Ordinal] = g
			continue
		}
		if g.Depth != 1 || g.Parent == nil {
			return 0, false
		}
		counts[*g.Parent]++
		if g.Declared.State == "MISSING" && (g.Loaded.State == "MISSING" || g.Loaded.State == "EXACT" && g.Loaded.Value != nil && *g.Loaded.Value == 0) {
			leaves++
			continue
		}
		if g.Declared.State != "EXACT" || g.Declared.Value == nil || *g.Declared.Value != 0 || g.Loaded.State != "EXACT" || g.Loaded.Value == nil || *g.Loaded.Value != 0 {
			return 0, false
		}
	}
	if len(roots) != s.Loaded.Roots || len(roots) == 0 {
		return 0, false
	}
	for parent := range counts {
		if _, ok := roots[parent]; !ok {
			return 0, false
		}
	}
	for id, g := range roots {
		if g.Declared.State != "EXACT" || g.Loaded.State != "EXACT" || g.Declared.Value == nil || g.Loaded.Value == nil || *g.Declared.Value != counts[id] || *g.Loaded.Value != counts[id] {
			return 0, false
		}
	}
	return leaves, true
}
func rootScopedRepliesExhausted(s CoverageSample) bool {
	if s.Status != "OK" || s.List != "EXACT" || s.Loaded == nil || s.Ready.Document != "complete" || !s.Ready.Container || s.Ready.RootEndVisible == nil || !*s.Ready.RootEndVisible || s.Ready.RootScopeExact == nil || !*s.Ready.RootScopeExact || s.Ready.ReplyControls == nil || *s.Ready.ReplyControls != 0 || s.HasMore.State != "EXACT" || s.HasMore.Value == nil || *s.HasMore.Value || (s.Cursor != "EMPTY" && s.Cursor != "NONEMPTY") {
		return false
	}
	if s.Total.State != "EXACT" || s.Total.Value == nil || *s.Total.Value != s.Loaded.UniqueKnown || s.Loaded.UniqueKnown != s.Loaded.Roots+s.Loaded.Replies || s.Loaded.MissingIDs != 0 || s.Loaded.DuplicateIDs != 0 || s.Loaded.InvalidNodes != 0 || len(s.Findings) != 0 {
		return false
	}
	n, ok := rootScopedLeaves(s)
	return ok && n > 0
}
