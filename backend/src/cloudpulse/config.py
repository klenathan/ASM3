from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CloudPulse API"
    environment: str = "local"
    aws_region: str = "ap-southeast-2"
    aws_endpoint_url: str | None = None
    table_name: str = "cloudpulse-local"
    data_bucket: str = "cloudpulse-local-data"
    athena_database: str = "cloudpulse_local"
    athena_workgroup: str = "cloudpulse-local"
    ecs_cluster: str = "cloudpulse-local"
    ecs_task_definition: str = "cloudpulse-local-analytics"
    ecs_subnet_ids: str = ""
    ecs_security_group_ids: str = ""
    cors_origins: str = "http://localhost:5173"

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
