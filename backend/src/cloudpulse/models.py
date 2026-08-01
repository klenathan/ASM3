from datetime import datetime, timezone

from pydantic import BaseModel, Field, field_validator


class LocationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)

    @field_validator("name")
    @classmethod
    def normalize_name(cls, value: str) -> str:
        return " ".join(value.split())


class Location(LocationCreate):
    id: str
    created_at: str


class Observation(BaseModel):
    location_id: str
    location_name: str
    observed_at: str
    temperature_c: float | None = None
    relative_humidity_percent: float | None = None
    wind_speed_kmh: float | None = None
    european_aqi: float | None = None
    pm2_5: float | None = None
    pm10: float | None = None
    source: str = "Open-Meteo"


class QueryStarted(BaseModel):
    query_execution_id: str
    status: str = "QUEUED"


class QueryResult(BaseModel):
    query_execution_id: str
    status: str
    columns: list[str] = []
    rows: list[dict[str, str | None]] = []
    reason: str | None = None


class AnalyticsRun(BaseModel):
    task_arn: str
    status: str


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")
