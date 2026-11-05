package xiaohongshu

import "testing"

func TestSocketEndpointRedaction(t *testing.T) {
	cases := []struct{ raw, host, path string }{{"wss://zelda.xiaohongshu.com/websocketV2?token=secret", "zelda.xiaohongshu.com", "websocketV2"}, {"wss://evil.test/websocket?token=secret", "OTHER", "OTHER"}, {"wss://example.xiaohongshu.com/private/secret", "example.xiaohongshu.com", "OTHER"}, {"https://zelda.xiaohongshu.com/websocketV2", "OTHER", "OTHER"}}
	for _, c := range cases {
		h, p := socketEndpoint(c.raw)
		if h != c.host || p != c.path {
			t.Fatal("unsafe endpoint metadata")
		}
	}
}
func TestMetricsOnlyWhitelistedNumbers(t *testing.T) {
	r := metricPhase(map[string]float64{"TaskDuration": 1, "ScriptDuration": 0.5, "JSHeapUsedSize": 100}, map[string]float64{"TaskDuration": 1.2, "ScriptDuration": 0.6, "JSHeapUsedSize": 150}, 40)
	if r["seconds"] != float64(40) || r["heapUsedEnd"] != float64(150) {
		t.Fatal("metrics")
	}
}

func TestFrameClassDoesNotLeakPrivatePayload(t *testing.T) {
	for _, raw := range []string{`{"secret":"private"}`, `{"type":"private","content":"private"}`, `private`} {
		if frameClass(raw) == "private" {
			t.Fatal("leak")
		}
	}
	if frameClass(`{"type":4,"content":"private"}`) != "NUMERIC_TYPE_4_OR_132" {
		t.Fatal("classification")
	}
	if frameClass(`{"type":2,"content":"private"}`) != "NUMERIC_TYPE_2_UNCLASSIFIED" {
		t.Fatal("must not assume message")
	}
}
