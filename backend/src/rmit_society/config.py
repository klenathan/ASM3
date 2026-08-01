from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "RMIT Society API"
    api_version: str = "0.1.0"
    openapi_enabled: bool = True
    openapi_server_url: str = ""
    environment: str = "local"
    aws_region: str = "ap-southeast-2"

    table_name: str = "rmit-society-local"
    media_bucket: str = "rmit-society-local-media"
    analytics_bucket: str = "rmit-society-local-analytics"

    moderation_queue_url: str = ""
    image_queue_url: str = ""
    event_queue_url: str = ""

    athena_database: str = "rmit_society_local"
    athena_workgroup: str = "rmit-society-local"
    ecs_cluster: str = "rmit-society-local"
    ecs_task_definition: str = "rmit-society-local-analytics"
    ecs_subnet_ids: str = ""
    ecs_security_group_ids: str = ""

    cors_origins: str = "http://localhost:5173"

    cognito_issuer: str = ""
    cognito_audience: str = ""
    cognito_jwks_url: str = ""
    cognito_user_pool_region: str = "ap-southeast-2"
    cognito_user_pool_id: str = ""

    moderation_provider: str = "local"
    image_provider: str = "local"
    policy_version: str = "1"

    post_edit_window_s: int = 600
    comment_edit_window_s: int = 300
    max_comment_depth: int = 6
    max_post_text: int = 2000
    max_comment_text: int = 2000
    max_image_bytes: int = 10 * 1024 * 1024
    presigned_expiry_s: int = 300
    appeal_window_s: int = 259200

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def subnet_ids(self) -> list[str]:
        return [subnet.strip() for subnet in self.ecs_subnet_ids.split(",") if subnet.strip()]

    @property
    def security_group_ids(self) -> list[str]:
        return [group.strip() for group in self.ecs_security_group_ids.split(",") if group.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
