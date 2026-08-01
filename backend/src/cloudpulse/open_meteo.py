import asyncio

import httpx

from cloudpulse.models import Location, Observation, utc_now

WEATHER_URL = "https://api.open-meteo.com/v1/forecast"
AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality"


async def fetch_observation(location: Location) -> Observation:
    coordinates = {"latitude": location.latitude, "longitude": location.longitude}
    weather_params = {
        **coordinates,
        "current": "temperature_2m,relative_humidity_2m,wind_speed_10m",
        "timezone": "UTC",
    }
    air_params = {
        **coordinates,
        "current": "european_aqi,pm2_5,pm10",
        "timezone": "UTC",
    }

    async with httpx.AsyncClient(timeout=15) as http:
        weather_response, air_response = await asyncio.gather(
            http.get(WEATHER_URL, params=weather_params),
            http.get(AIR_QUALITY_URL, params=air_params),
        )
        weather_response.raise_for_status()
        air_response.raise_for_status()

    weather = weather_response.json().get("current", {})
    air = air_response.json().get("current", {})
    return Observation(
        location_id=location.id,
        location_name=location.name,
        observed_at=weather.get("time") or air.get("time") or utc_now(),
        temperature_c=weather.get("temperature_2m"),
        relative_humidity_percent=weather.get("relative_humidity_2m"),
        wind_speed_kmh=weather.get("wind_speed_10m"),
        european_aqi=air.get("european_aqi"),
        pm2_5=air.get("pm2_5"),
        pm10=air.get("pm10"),
    )
