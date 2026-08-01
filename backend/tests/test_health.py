import json

from cloudpulse.handlers.health import handler


def test_health_handler() -> None:
    response = handler({}, None)
    assert response["statusCode"] == 200
    assert json.loads(response["body"])["status"] == "ok"
