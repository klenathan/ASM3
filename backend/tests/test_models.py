import pytest
from pydantic import ValidationError

from cloudpulse.models import LocationCreate
from cloudpulse.slug import location_slug


def test_location_name_is_normalized() -> None:
    location = LocationCreate(name="  Melbourne   CBD ", latitude=-37.81, longitude=144.96)
    assert location.name == "Melbourne CBD"
    assert location_slug(location.name) == "melbourne-cbd"


def test_invalid_latitude_is_rejected() -> None:
    with pytest.raises(ValidationError):
        LocationCreate(name="Invalid", latitude=91, longitude=0)
