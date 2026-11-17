package xiaohongshu

import (
	"os"
	"testing"
)

// Completion semantics are what tests assert; human pacing only makes them slow.
func TestMain(m *testing.M) {
	replyExpandPace, replyExpandJitter = 0, 0
	rootScrollPace, rootScrollJitter = 0, 0
	readingPause, readingPauseJitter = 0, 0
	readingPauseEvery = 0
	os.Exit(m.Run())
}
