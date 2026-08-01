from typing import Annotated

from fastapi import HTTPException, Query, status
from fastapi.concurrency import run_in_threadpool
from mangum import Mangum

from cloudpulse.api import create_api
from cloudpulse.models import Location, LocationCreate, Observation
from cloudpulse.open_meteo import fetch_observation
from cloudpulse.repository import (
    create_location,
    get_location,
    list_locations,
    list_observations,
    save_observation,
)

app = create_api("CloudPulse observations")


@app.get("/locations", response_model=list[Location])
async def locations() -> list[Location]:
    return await run_in_threadpool(list_locations)


@app.post("/locations", response_model=Location, status_code=status.HTTP_201_CREATED)
async def add_location(payload: LocationCreate) -> Location:
    return await run_in_threadpool(create_location, payload)


@app.post("/locations/{location_id}/refresh", response_model=Observation)
async def refresh_location(location_id: str) -> Observation:
    location = await run_in_threadpool(get_location, location_id)
    if location is None:
        raise HTTPException(status_code=404, detail="Location not found")
    observation = await fetch_observation(location)
    return await run_in_threadpool(save_observation, observation)


@app.get("/locations/{location_id}/observations", response_model=list[Observation])
async def observations(
    location_id: str,
    limit: Annotated[int, Query(ge=1, le=168)] = 48,
) -> list[Observation]:
    if await run_in_threadpool(get_location, location_id) is None:
        raise HTTPException(status_code=404, detail="Location not found")
    return await run_in_threadpool(list_observations, location_id, limit)


handler = Mangum(app, lifespan="off")
