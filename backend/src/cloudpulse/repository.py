import json
from decimal import Decimal
from typing import Any

from boto3.dynamodb.conditions import Key

from cloudpulse.aws import client, resource
from cloudpulse.config import get_settings
from cloudpulse.models import Location, LocationCreate, Observation, utc_now
from cloudpulse.slug import location_slug


def _table() -> Any:
    return resource("dynamodb").Table(get_settings().table_name)


def _decimalize(data: dict[str, Any]) -> dict[str, Any]:
    return json.loads(json.dumps(data), parse_float=Decimal)


def create_location(payload: LocationCreate) -> Location:
    location = Location(id=location_slug(payload.name), created_at=utc_now(), **payload.model_dump())
    item = {
        "PK": f"LOCATION#{location.id}",
        "SK": "PROFILE",
        "entity_type": "LOCATION",
        **location.model_dump(),
    }
    _table().put_item(Item=_decimalize(item))
    return location


def list_locations() -> list[Location]:
    response = _table().scan(
        FilterExpression="#entity_type = :location",
        ExpressionAttributeNames={"#entity_type": "entity_type"},
        ExpressionAttributeValues={":location": "LOCATION"},
    )
    return [Location.model_validate(item) for item in response.get("Items", [])]


def get_location(location_id: str) -> Location | None:
    response = _table().get_item(Key={"PK": f"LOCATION#{location_id}", "SK": "PROFILE"})
    item = response.get("Item")
    return Location.model_validate(item) if item else None


def save_observation(observation: Observation) -> Observation:
    item = {
        "PK": f"LOCATION#{observation.location_id}",
        "SK": f"OBSERVATION#{observation.observed_at}",
        "entity_type": "OBSERVATION",
        **observation.model_dump(),
    }
    _table().put_item(Item=_decimalize(item))

    settings = get_settings()
    date = observation.observed_at[:10]
    key = (
        f"raw/date={date}/location={observation.location_id}/"
        f"{observation.observed_at.replace(':', '-')}.json"
    )
    client("s3").put_object(
        Bucket=settings.data_bucket,
        Key=key,
        Body=(observation.model_dump_json() + "\n").encode(),
        ContentType="application/x-ndjson",
    )
    return observation


def list_observations(location_id: str, limit: int = 48) -> list[Observation]:
    response = _table().query(
        KeyConditionExpression=(
            Key("PK").eq(f"LOCATION#{location_id}") & Key("SK").begins_with("OBSERVATION#")
        ),
        ScanIndexForward=False,
        Limit=limit,
    )
    return [Observation.model_validate(item) for item in response.get("Items", [])]
