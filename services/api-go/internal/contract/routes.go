package contract

import (
	_ "embed"
	"encoding/json"
	"fmt"
)

//go:embed routes.json
var routeManifest []byte

// Routes returns the API operation inventory that must remain available while
// responsibility moves from Python to Go.
func Routes() ([]string, error) {
	var routes []string
	if err := json.Unmarshal(routeManifest, &routes); err != nil {
		return nil, fmt.Errorf("decode route manifest: %w", err)
	}
	return routes, nil
}
