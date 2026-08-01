from __future__ import annotations

from typing import Any

from botocore.exceptions import ClientError
from fastapi import APIRouter, status
from pydantic import BaseModel, Field

from rmit_society.aws import client
from rmit_society.config import get_settings
from rmit_society.domain.registration import (
    derive_username_from_email,
    validate_display_name,
    validate_study_area,
)
from rmit_society.errors import AuthenticationError, ValidationError_
from rmit_society.repositories.dynamodb import DynamoDBRepository
from rmit_society.services import identity as identity_service

router = APIRouter(prefix="/auth", tags=["auth"])

repo = DynamoDBRepository()


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)


class RegistrationCredentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=60)
    major: str = Field(min_length=1, max_length=80)


class AuthTokens(BaseModel):
    access_token: str
    expires_in: int
    token_type: str


class RegistrationResult(BaseModel):
    username: str
    confirmation_required: bool = True


class ConfirmationCredentials(Credentials):
    confirmation_code: str = Field(min_length=6, max_length=12)


def _cognito() -> Any:
    if not get_settings().cognito_audience:
        raise AuthenticationError("Amazon Cognito is not configured")
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
            raise AuthenticationError("Invalid Cognito credentials") from error
        raise AuthenticationError("Cognito sign-in failed") from error
    return _tokens(response.get("AuthenticationResult", {}))


@router.post(
    "/sign-up",
    response_model=RegistrationResult,
    status_code=status.HTTP_201_CREATED,
)
def sign_up(credentials: RegistrationCredentials) -> RegistrationResult:
    # Validation is authoritative server-side; the derived username/handle is
    # never taken from client input.
    handle = derive_username_from_email(credentials.email)
    display_name = validate_display_name(credentials.display_name)
    major = validate_study_area(credentials.major)

    username = credentials.email.strip().lower()
    cognito = _cognito()
    try:
        response = cognito.sign_up(
            ClientId=get_settings().cognito_audience,
            Username=username,
            Password=credentials.password,
            UserAttributes=[
                {"Name": "email", "Value": username},
                {"Name": "preferred_username", "Value": handle},
                {"Name": "name", "Value": display_name},
                {"Name": "custom:major", "Value": major},
            ],
        )
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code == "InvalidPasswordException":
            raise ValidationError_(
                "Password must be at least 8 characters and include uppercase, lowercase, "
                "number, and symbol characters"
            ) from error
        if code == "UsernameExistsException":
            raise ValidationError_("An account already exists for this email") from error
        raise AuthenticationError("Cognito sign-up failed") from error

    sub = response.get("UserSub")
    if not isinstance(sub, str) or not sub:
        raise AuthenticationError("Cognito sign-up did not return an account subject")
    identity_service.create_user_profile(
        repo,
        cognito_sub=sub,
        handle=handle,
        display_name=display_name,
        major=major,
    )
    return RegistrationResult(username=username)


@router.post("/confirm", response_model=AuthTokens)
def confirm_sign_up(credentials: ConfirmationCredentials) -> AuthTokens:
    username = credentials.username.strip().lower()
    try:
        _cognito().confirm_sign_up(
            ClientId=get_settings().cognito_audience,
            Username=username,
            ConfirmationCode=credentials.confirmation_code.strip(),
        )
    except ClientError as error:
        code = str(error.response.get("Error", {}).get("Code", ""))
        if code in {
            "CodeMismatchException",
            "ExpiredCodeException",
            "NotAuthorizedException",
            "UserNotFoundException",
        }:
            raise AuthenticationError("Invalid or expired confirmation code") from error
        raise AuthenticationError("Cognito confirmation failed") from error
    return _sign_in(
        Credentials(username=username, password=credentials.password)
    )


@router.post("/sign-in", response_model=AuthTokens)
def sign_in(credentials: Credentials) -> AuthTokens:
    return _sign_in(credentials)
