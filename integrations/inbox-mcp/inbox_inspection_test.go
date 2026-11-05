package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestInboxScopeBounds(t *testing.T) {
	base := inboxInspectionInput{Protocol: "workbench.inbox.v1", SenderID: strings.Repeat("a", 24)}
	if !validInboxInput(base) {
		t.Fatal("valid rejected")
	}
	for _, change := range []func(*inboxInspectionInput){func(x *inboxInspectionInput) { x.MaxSubmissions = 1 }, func(x *inboxInspectionInput) { x.SenderID = "other" }, func(x *inboxInspectionInput) { x.Protocol = "send" }} {
		v := base
		change(&v)
		if validInboxInput(v) {
			t.Fatal("unsafe accepted")
		}
	}
}
func TestInboxOnlyRoutesHaveNoLegacyActions(t *testing.T) {
	t.Setenv("CRM_INBOX_INSPECTION_ONLY", "1")
	s := NewAppServer(NewXiaohongshuService(), "test")
	r := setupRoutes(s)
	for _, url := range []string{"/api/v1/feeds/comment", "/api/v1/notifications/reply", "/api/v1/publish", "/api/v1/login/qrcode", "/api/v1/notifications/list"} {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, url, nil)
		req.Header.Set("Authorization", "Bearer test")
		r.ServeHTTP(w, req)
		if w.Code != 404 {
			t.Fatalf("%s exposed", url)
		}
	}
}
