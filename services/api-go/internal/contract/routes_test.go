package contract

import "testing"

func TestRoutesAreUniqueAndIncludeHealth(t *testing.T) {
	routes, err := Routes()
	if err != nil {
		t.Fatalf("Routes() error = %v", err)
	}
	if len(routes) != 71 {
		t.Fatalf("route count = %d, want 71", len(routes))
	}
	seen := make(map[string]struct{}, len(routes))
	for _, route := range routes {
		if _, ok := seen[route]; ok {
			t.Errorf("duplicate route %q", route)
		}
		seen[route] = struct{}{}
	}
	if _, ok := seen["GET /health"]; !ok {
		t.Error("health route is missing")
	}
}
