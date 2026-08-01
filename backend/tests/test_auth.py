from types import SimpleNamespace

import pytest
from botocore.exceptions import ClientError

from rmit_society.errors import ValidationError_
from rmit_society.identity import api as auth


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
            auth.RegistrationCredentials(
                email="s1234567@student.rmit.edu.au",
                password="Password123!",
                display_name="Alex",
                major="Engineering",
            )
        )

    assert "uppercase, lowercase, number, and symbol" in raised.value.message


def test_sign_up_rejects_non_rmit_email_before_calling_cognito(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    called = False

    def fail(**kwargs: object) -> None:
        del kwargs
        nonlocal called
        called = True

    monkeypatch.setattr(auth, "_cognito", lambda: SimpleNamespace(sign_up=fail))

    with pytest.raises(ValidationError_):
        auth.sign_up(
            auth.RegistrationCredentials(
                email="student@example.com",
                password="Password123!",
                display_name="Alex",
                major="Engineering",
            )
        )
    assert called is False
