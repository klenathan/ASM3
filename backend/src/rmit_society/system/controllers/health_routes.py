from rmit_society.base import utc_now


def health() -> dict[str, str]:
    return {"status": "ok", "service": "rmit-society", "time": utc_now()}
