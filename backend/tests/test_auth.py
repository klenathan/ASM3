from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError

from rmit_society.errors import ValidationError_
from rmit_society.handlers import auth


def test_sign_up_returns_actionable_password_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class CognitoStub:
        def sign_up(self, **kwargs: object) -> None:
            del kwargs
            raise ClientError(
                {
                    "Error": {
                        "Code": "InvalidPasswordException",
                        "Message": "password policy failure",
                    }
                },
                "SignUp",
            )

    monkeypatch.setattr(auth, "_cognito", lambda: CognitoStub())
    monkeypatch.setattr(
        auth,
        "get_settings",
        lambda: SimpleNamespace(
            environment="local",
            cognito_audience="client",
            cognito_user_pool_id="pool",
        ),
    )

    with pytest.raises(ValidationError_) as raised:
        auth.sign_up(
            auth.Credentials(
                username="student@example.com",
                password="Password123!",
            )
        )

    assert "uppercase, lowercase, number, and symbol" in raised.value.message
