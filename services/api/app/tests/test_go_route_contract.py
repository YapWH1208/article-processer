"""Guard the API route inventory while handlers migrate from Python to Go."""

import json
from pathlib import Path

from app.main import app


def test_go_route_manifest_matches_python_openapi() -> None:
	"""The Go migration contract must track every Python operation exactly."""
	manifest_path = (
		Path(__file__).resolve().parents[4]
		/ "services"
		/ "api-go"
		/ "internal"
		/ "contract"
		/ "routes.json"
	)
	expected_routes = json.loads(manifest_path.read_text(encoding="utf-8"))
	openapi = app.openapi()
	current_routes = sorted(
		f"{method.upper()} {path}"
		for path, operations in openapi["paths"].items()
		for method in operations
		if method.lower() in {"get", "post", "put", "patch", "delete"}
	)

	assert expected_routes == current_routes
