package main

import (
	"strings"
	"testing"
)

// Route construction only: no browser, account, candidate executable or platform connection.
func TestExactPreflightRoutesExcludeAllLegacyHTTPActions(t *testing.T) {
	t.Setenv("CRM_EXACT_PREFLIGHT_ONLY", "1")
	router := setupRoutes(&AppServer{})
	for _, route := range router.Routes() {
		if route.Path != "/health" && route.Path != "/mcp" && route.Path != "/mcp/*path" {
			t.Fatalf("unexpected route %s", route.Path)
		}
	}
	t.Setenv("CRM_EXACT_PREFLIGHT_ONLY", "")
	ordinary := setupRoutes(&AppServer{})
	found := false
	for _, route := range ordinary.Routes() {
		if strings.HasPrefix(route.Path, "/api/v1/") {
			found = true
		}
	}
	if !found {
		t.Fatal("ordinary runtime registration unexpectedly changed")
	}
}
