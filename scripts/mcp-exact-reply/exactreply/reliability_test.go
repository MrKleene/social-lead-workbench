package exactreply

import (
	"bufio"
	"context"
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// This is a pure journal helper subprocess, never the MCP candidate or a browser.
func TestJournalKilledWriter(t *testing.T) {
	dir := os.Getenv("REPLY_SYNTHETIC_KILL_DIRECTORY")
	if dir == "" {
		return
	}
	journal, err := OpenJournal(dir, journalID)
	if err != nil {
		t.Fatal(err)
	}
	ctx := WithJournal(context.Background(), journal)
	_, _ = SubmitOnce(ctx, func() error {
		os.Stdout.WriteString("SYNTHETIC_INTENT_DURABLE\n")
		for {
			time.Sleep(time.Second)
		}
	})
}
func TestJournalSurvivesKilledProcessWithoutProvingSubmission(t *testing.T) {
	dir := t.TempDir()
	os.Chmod(dir, 0700)
	child := exec.Command(os.Args[0], "-test.run=^TestJournalKilledWriter$")
	child.Env = append(os.Environ(), "REPLY_SYNTHETIC_KILL_DIRECTORY="+dir)
	pipe, err := child.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	if err = child.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { _ = child.Process.Kill(); _ = child.Wait() }()
	ready := make(chan bool, 1)
	go func() { s := bufio.NewScanner(pipe); ready <- s.Scan() && s.Text() == "SYNTHETIC_INTENT_DURABLE" }()
	select {
	case ok := <-ready:
		if !ok {
			t.Fatal("missing durable intent")
		}
	case <-time.After(3 * time.Second):
		t.Fatal("synthetic helper timeout")
	}
	_ = child.Process.Kill()
	_ = child.Wait()
	rows := journalRows(t, filepath.Join(dir, "reply-stage-"+journalID+".jsonl"))
	if len(rows) != 2 || rows[0].Stage != "BEFORE_SUBMIT" || rows[1].Stage != "ATTEMPTED" {
		t.Fatal(rows)
	}
	if _, err = OpenJournal(dir, journalID); err == nil {
		t.Fatal("restart must not reuse intent")
	}
}

type finalRiskDriver struct {
	fake
	finalError error
	finalPanic bool
	finalCalls int
}

func (d *finalRiskDriver) FinalRestriction(context.Context, Command) error {
	d.finalCalls++
	if d.finalPanic {
		panic("private panic")
	}
	return d.finalError
}
func TestFinalRestrictionRunsBeforeCloseAndPreservesRisk(t *testing.T) {
	for _, code := range []string{"BANNED", "RATE_LIMITED", "VERIFICATION", "PLATFORM_REFUSED"} {
		d := &finalRiskDriver{finalError: RiskError(code)}
		r := Run(context.Background(), command(), d)
		if r.Kind != "RISK" || r.Reason != code || d.finalCalls != 1 || !r.Stopped {
			t.Fatal(r, d)
		}
	}
	d := &finalRiskDriver{finalPanic: true}
	r := Run(context.Background(), command(), d)
	if !r.Stopped {
		t.Fatal("observer panic prevented close")
	}
}
func TestKnownDiagnosticClassesNeverExposeRawErrors(t *testing.T) {
	for _, s := range []string{"ACCOUNT_CHANGED", "RECEIPT_NOT_UNIQUE", "SELECTION_STEP_MISSING"} {
		if diagnosticCode(errors.New(s)) != s {
			t.Fatal(s)
		}
	}
	if strings.Contains(diagnosticCode(errors.New("private token")), "private") {
		t.Fatal("raw error")
	}
}
