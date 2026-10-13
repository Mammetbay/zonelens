"""Automated tests for FastAPI endpoints and database storage."""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.storage.database import clear_events, init_db, record_event


@pytest.fixture(scope="module")
def client():
    init_db()
    with TestClient(app) as test_client:
        yield test_client


def test_api_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert "cuda_available" in data
    assert "torch_version" in data


def test_api_status(client):
    response = client.get("/api/status")
    assert response.status_code == 200
    data = response.json()
    assert "status" in data
    assert "source_fps" in data
    assert "line_counts" in data


def test_api_rules_get_and_put(client):
    # GET rules
    response = client.get("/api/rules")
    assert response.status_code == 200
    data = response.json()
    assert "zones" in data

    # PUT valid rules
    new_rules = {
        "line": {
            "start": [0.2, 0.4],
            "end": [0.8, 0.4],
            "positive_label": "entry",
            "negative_label": "exit",
            "hysteresis_px": 5.0,
            "max_gap_frames": 6,
        },
        "zones": [
            {
                "name": "EntranceHall",
                "vertices": [[0.1, 0.1], [0.9, 0.1], [0.9, 0.9], [0.1, 0.9]],
                "dwell_seconds": 10.0,
                "max_gap_frames": 5,
            }
        ],
    }
    put_response = client.put("/api/rules", json=new_rules)
    assert put_response.status_code == 200
    updated = put_response.json()["rules"]
    assert updated["line"]["positive_label"] == "entry"
    assert len(updated["zones"]) == 1
    assert updated["zones"][0]["name"] == "EntranceHall"


def test_api_rules_validation_error(client):
    # Invalid zone: fewer than 3 vertices
    invalid_rules = {
        "line": None,
        "zones": [
            {
                "name": "BadZone",
                "vertices": [[0.1, 0.1], [0.2, 0.2]],
                "dwell_seconds": 5.0,
                "max_gap_frames": 5,
            }
        ],
    }
    response = client.put("/api/rules", json=invalid_rules)
    assert response.status_code == 400


def test_api_events_and_database(client):
    clear_events()

    # Record sample events
    record_event({
        "event": "line_crossing",
        "rule": "line",
        "track_id": 42,
        "video_time_ms": 1250.0,
        "direction": "entry",
    })
    record_event({
        "event": "zone_dwell",
        "zone": "EntranceHall",
        "track_id": 42,
        "video_time_ms": 5250.0,
        "dwell_seconds": 10.5,
    })

    # Query events via API
    res = client.get("/api/events?limit=10")
    assert res.status_code == 200
    data = res.json()
    assert data["total"] == 2
    assert len(data["events"]) == 2

    # Query with filter
    dwell_res = client.get("/api/events?type=zone_dwell")
    assert dwell_res.status_code == 200
    dwell_data = dwell_res.json()
    assert dwell_data["total"] == 1
    assert dwell_data["events"][0]["event_type"] == "zone_dwell"

    # Delete events
    del_res = client.delete("/api/events")
    assert del_res.status_code == 200
    assert del_res.json()["deleted_count"] == 2

    # Verify empty
    res_after = client.get("/api/events")
    assert res_after.json()["total"] == 0
