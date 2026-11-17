package xiaohongshu

import "testing"

// Rate-limited accounts land on the platform's login/error shell with an
// error_code; that is a platform limit, not a different note.
func TestClassifyGuardLocation(t *testing.T) {
	for _, tc := range []struct{ href, want string }{
		{"https://www.xiaohongshu.com/website-login/error?error_code=300013&redirectPath=x", "PLATFORM_LIMIT"},
		{"https://www.xiaohongshu.com/login?redirectPath=%2Fexplore%2F6a5b38d3000000001b01e326", "PLATFORM_LIMIT"},
		{"https://www.xiaohongshu.com/explore/6a5b38d3000000001b01e326?xsec_token=SYNTHETIC", "IDENTITY_CONFLICT"},
		{"https://www.xiaohongshu.com/user/profile/5e0d0f1e0000000001000000", "IDENTITY_CONFLICT"},
		{"https://example.com/explore/6a5b38d3000000001b01e326", "IDENTITY_CONFLICT"},
		{"", "IDENTITY_CONFLICT"},
		{"not a url", "IDENTITY_CONFLICT"},
	} {
		if got := classifyGuardLocation(tc.href); got != tc.want {
			t.Fatalf("classifyGuardLocation(%q)=%q want %q", tc.href, got, tc.want)
		}
	}
}
