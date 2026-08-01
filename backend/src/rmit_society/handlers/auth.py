from __future__ import annotations

from typing import Any

from botocore.exceptions import ClientError
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from rmit_society.aws import client
from rmit_society.config import get_settings
from rmit_society.errors import AuthenticationError, ValidationError_

router = APIRouter(prefix="/auth/local", tags=["auth"])


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class AuthTokens(BaseModel):
    access_token: str
    expires_in: int
    token_type: str


def _cognito() -> Any:
    settings = get_settings()
    if settings.environment != "local":
        raise AuthenticationError("Local Cognito sign-in is disabled")
    if not settings.cognito_audience:
        raise AuthenticationError(
            "Local Cognito is not configured; run make deploy-local and source "
            ".cloudpulse/local.env"
        )
    return client("cognito-idp")


def _tokens(result: dict[str, Any]) -> AuthTokens:
    access_token = result.get("AccessToken")
    if not isinstance(access_token, str):
        raise AuthenticationError("Cognito sign-in requires an additional challenge")
    return AuthTokens(
        access_token=access_token,
        expires_in=int(result.get("ExpiresIn", 3600)),
        token_type=str(result.get("TokenType", "Bearer")),
    )


def _sign_in(credentials: Credentials) -> AuthTokens:
    try:
        response = _cognito().initiate_auth(
            ClientId=get_settings().cognito_audience,
            AuthFlow="USER_PASSWORD_AUTH",
            AuthParameters={
                "USERNAME": credentials.username.strip().lower(),
                "PASSWORD": credentials.password,
            },
        )
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in {
            "NotAuthorizedException",
            "UserNotFoundException",
            "UserNotConfirmedException",
            "PasswordResetRequiredException",
        }:
            raise AuthenticationError("Invalid local Cognito credentials") from error
        raise AuthenticationError("Local Cognito sign-in failed") from error
    return _tokens(response.get("AuthenticationResult", {}))


@router.post("/sign-up", response_model=AuthTokens, status_code=status.HTTP_201_CREATED)
def sign_up(credentials: Credentials) -> AuthTokens:
    username = credentials.username.strip().lower()
    if "@" not in username:
        raise ValidationError_("Local Cognito username must be an email address")
    cognito = _cognito()
    try:
        cognito.sign_up(
            ClientId=get_settings().cognito_audience,
            Username=username,
            Password=credentials.password,
            UserAttributes=[{"Name": "email", "Value": username}],
        )
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code == "InvalidPasswordException":
            raise ValidationError_(
                "Password must be at least 8 characters and include uppercase, lowercase, "
                "number, and symbol characters"
            ) from error
        if code != "UsernameExistsException":
            raise AuthenticationError("Local Cognito sign-up failed") from error
    try:
        cognito.admin_confirm_sign_up(
            UserPoolId=get_settings().cognito_user_pool_id,
            Username=username,
        )
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code not in {"NotAuthorizedException", "ResourceNotFoundException"}:
            raise AuthenticationError("Local Cognito confirmation failed") from error
    return _sign_in(Credentials(username=username, password=credentials.password))


@router.post("/sign-in", response_model=AuthTokens)
def sign_in(credentials: Credentials) -> AuthTokens:
    return _sign_in(credentials)
