import json

from rmit_society.workers.health import handler


def test_health_handler() -> None:
    response = handler({}, None)
    assert response["statusCode"] == 200
    assert json.loads(response["body"])["status"] == "ok"
    assert json.loads(response["body"])["service"] == "rmit-society"
