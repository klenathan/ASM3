from rmit_society.server import app


def test_openapi_exposes_api_metadata_and_tags() -> None:
    schema = app.openapi()

    assert schema["info"]["title"] == "RMIT Society local API"
    assert schema["info"]["version"] == "0.1.0"
    assert {tag["name"] for tag in schema["tags"]} >= {
        "system",
        "identity",
        "moderation",
    }
    assert "/docs" in {getattr(route, "path", "") for route in app.routes}
    assert "/openapi.json" in {getattr(route, "path", "") for route in app.routes}


def test_openapi_documents_bearer_auth_only_for_protected_operations() -> None:
    schema = app.openapi()

    assert schema["components"]["securitySchemes"]["bearerAuth"] == {
        "type": "http",
        "scheme": "bearer",
        "description": "Cognito access token",
    }
    assert schema["paths"]["/api/v1/me"]["get"]["security"] == [{"bearerAuth": []}]
    assert "security" not in schema["paths"]["/api/v1/health"]["get"]
