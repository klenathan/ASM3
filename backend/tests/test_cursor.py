import pytest

from rmit_society.base import decode_cursor, encode_cursor


def test_cursor_round_trip_stable() -> None:
    payload = {"after": "2026-01-01T00:00:00+00:00", "society": "s_1"}
    encoded = encode_cursor(payload)
    assert decode_cursor(encoded) == payload
    # Deterministic for the same payload.
    assert encode_cursor(payload) == encoded


def test_cursor_is_opaque_and_contains_version() -> None:
    payload = {"society": "s_1"}
    encoded = encode_cursor(payload)
    assert "_v" not in encoded
    assert "." in encoded


def test_cursor_rejects_tampering() -> None:
    payload = {"after": "2026-01-01T00:00:00+00:00"}
    encoded = encode_cursor(payload)
    tampered = encoded[:-2] + "xx"
    with pytest.raises(ValueError):
        decode_cursor(tampered)


def test_cursor_rejects_unsupported_version() -> None:
    payload = {"after": "2026-01-01T00:00:00+00:00"}
    encoded = encode_cursor(payload, version=1)
    with pytest.raises(ValueError):
        decode_cursor(encoded, version=2)
