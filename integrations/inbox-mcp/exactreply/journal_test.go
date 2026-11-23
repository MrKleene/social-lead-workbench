package exactreply

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

const journalID = "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"

func journalFixture(t *testing.T) (*Journal, string, context.Context) {
	t.Helper()
	dir := t.TempDir()
	os.Chmod(dir, 0700)
	real, _ := filepath.EvalSymlinks(dir)
	j, e := OpenJournal(real, journalID)
	if e != nil {
		t.Fatal(e)
	}
	t.Cleanup(func() { j.Close() })
	return j, filepath.Join(real, "reply-stage-"+journalID+".jsonl"), WithJournal(context.Background(), j)
}
func journalRows(t *testing.T, path string) []JournalRecord {
	t.Helper()
	b, e := os.ReadFile(path)
	if e != nil {
		t.Fatal(e)
	}
	rows := []JournalRecord{}
	for _, line := range strings.Split(strings.TrimSpace(string(b)), "\n") {
		if line == "" {
			continue
		}
		var r JournalRecord
		if e = json.Unmarshal([]byte(line), &r); e != nil {
			t.Fatal(e)
		}
		rows = append(rows, r)
	}
	return rows
}
func TestJournalIntentDurableBeforeClickAndReturn(t *testing.T) {
	_, path, ctx := journalFixture(t)
	calls := 0
	attempted, err := SubmitOnce(ctx, func() error {
		calls++
		rows := journalRows(t, path)
		if len(rows) != 2 || rows[0].Stage != "BEFORE_SUBMIT" || rows[1].Stage != "ATTEMPTED" {
			t.Fatal(rows)
		}
		return nil
	})
	rows := journalRows(t, path)
	if !attempted || err != nil || calls != 1 || len(rows) != 3 || rows[2].Stage != "AFTER_SUBMIT" {
		t.Fatal(attempted, err, calls, rows)
	}
	st, _ := os.Stat(path)
	if runtime.GOOS != "windows" && st.Mode().Perm() != 0600 {
		t.Fatal(st.Mode())
	}
}
func TestJournalFailureBlocksClick(t *testing.T) {
	j, _, ctx := journalFixture(t)
	j.Close()
	calls := 0
	a, e := SubmitOnce(ctx, func() error { calls++; return nil })
	if a || e == nil || calls != 0 {
		t.Fatal(a, e, calls)
	}
}
func TestJournalLostAcknowledgementNeverInventsAfterSubmit(t *testing.T) {
	_, p, ctx := journalFixture(t)
	calls := 0
	a, e := SubmitOnce(ctx, func() error { calls++; return errors.New("secret raw token") })
	if !a || e == nil || calls != 1 || len(journalRows(t, p)) != 2 {
		t.Fatal(a, e, calls)
	}
	b, _ := os.ReadFile(p)
	if strings.Contains(string(b), "secret") {
		t.Fatal("leak")
	}
}
func TestJournalPanicPreservesIntentWithoutRetry(t *testing.T) {
	_, p, ctx := journalFixture(t)
	func() { defer func() { recover() }(); SubmitOnce(ctx, func() error { panic("secret") }) }()
	if len(journalRows(t, p)) != 2 {
		t.Fatal("lost intent")
	}
}
func TestJournalCancellationHasZeroClicks(t *testing.T) {
	_, p, ctx := journalFixture(t)
	ctx, cancel := context.WithCancel(ctx)
	cancel()
	a, e := SubmitOnce(ctx, func() error { t.Fatal("clicked"); return nil })
	if a || e == nil || len(journalRows(t, p)) != 0 {
		t.Fatal(a, e)
	}
}
func TestJournalExclusiveAndNoArbitraryPayload(t *testing.T) {
	j, p, ctx := journalFixture(t)
	if _, e := OpenJournal(filepath.Dir(p), journalID); e == nil {
		t.Fatal("reuse")
	}
	if _, e := OpenJournal(filepath.Dir(p), "../secret"); e == nil {
		t.Fatal("path")
	}
	if e := RecordStage(ctx, "raw secret", nil, nil); e == nil {
		t.Fatal("raw stage")
	}
	if e := j.append("DRIVER_CLOSED", nil, new(bool)); e != nil {
		t.Fatal(e)
	}
}
func TestJournalRunRecordsCloseAfterCancel(t *testing.T) {
	_, p, ctx := journalFixture(t)
	ctx, cancel := context.WithCancel(ctx)
	cancel()
	f := &fake{}
	Run(ctx, command(), f)
	rows := journalRows(t, p)
	if len(rows) != 3 || rows[0].Stage != "CANCELLED" || rows[1].Stage != "BEFORE_CLOSE" || rows[2].Stage != "DRIVER_CLOSED" || rows[2].Stopped == nil {
		t.Fatal(rows)
	}
}

func TestJournalFailureAfterClickKeepsAmbiguity(t *testing.T) {
	j, p, ctx := journalFixture(t)
	calls := 0
	a, e := SubmitOnce(ctx, func() error { calls++; return j.Close() })
	if !a || e == nil || calls != 1 || len(journalRows(t, p)) != 2 {
		t.Fatal(a, e, calls)
	}
}
func TestJournalFailureNeverHidesPlatformRisk(t *testing.T) {
	j, _, ctx := journalFixture(t)
	f := &fake{selectError: RiskError("VERIFICATION")}
	// Closing journal from Select is represented by a wrapper; risk must survive
	// the failed durable DRIVER_CLOSED record and still pause the workbench.
	wrapped := &journalRiskDriver{fake: f, j: j}
	r := Run(ctx, command(), wrapped)
	if r.Kind != "RISK" || r.Reason != "VERIFICATION" {
		t.Fatal(r)
	}
}

type journalRiskDriver struct {
	*fake
	j *Journal
}

func (d *journalRiskDriver) Select(ctx context.Context, c Command) error {
	d.j.Close()
	return RiskError("VERIFICATION")
}

func TestJournalRestrictionEvidenceIsSafeAndDurable(t *testing.T) {
	_, p, ctx := journalFixture(t)
	target := restrictionTarget()
	if err := RecordRestriction(ctx, RestrictionObservation{Identity: "MATCH", Title: "synthetic-only https://private.invalid/token", Path: "/explore/[POST]", Warnings: []RestrictionWarning{{"BANNED", "封禁 synthetic-only"}}}, target); err != nil {
		t.Fatal(err)
	}
	rows := journalRows(t, p)
	if len(rows) != 1 || rows[0].Evidence == nil || rows[0].Evidence.ScreenshotState != "NOT_CAPTURED" {
		t.Fatal(rows)
	}
	raw, _ := os.ReadFile(p)
	if strings.Contains(string(raw), "synthetic-only") || strings.Contains(string(raw), "private.invalid") {
		t.Fatal("unsafe evidence")
	}
}
