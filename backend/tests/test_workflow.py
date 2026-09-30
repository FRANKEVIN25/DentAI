import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.core.database import Base, get_db
from app import models as _models  # noqa: F401
from app.main import app


@pytest.fixture
def client() -> TestClient:
    engine = create_engine(
        "sqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    testing_session = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)
    Base.metadata.create_all(engine)

    def override_get_db():
        with testing_session() as database:
            yield database

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
    Base.metadata.drop_all(engine)
    engine.dispose()


def test_review_confirmation_gates_smile_sync_and_completion(client: TestClient) -> None:
    created = client.post("/api/v1/sessions", json={"display_name": "Odontólogo de prueba"})
    assert created.status_code == 201
    session_id = created.json()["id"]

    blocked_sync = client.post(f"/api/v1/sessions/{session_id}/smile-sync")
    assert blocked_sync.status_code == 409

    transcription = client.post(
        f"/api/v1/sessions/{session_id}/transcription",
        json={"raw_text": "Paciente presenta dolor en la pieza 26 desde hace aproximadamente tres días."},
    )
    assert transcription.status_code == 200
    assert transcription.json()["status"] == "PROCESSING"

    processed = client.post(f"/api/v1/sessions/{session_id}/process")
    assert processed.status_code == 200
    assert processed.json()["status"] == "REVIEW"
    assert processed.json()["clinical_data"] == {
        "tooth": "26",
        "symptom": "dolor",
        "duration": "3 días",
    }

    edited = client.patch(
        f"/api/v1/sessions/{session_id}/clinical-data",
        json={"structured_data": {"tooth": "27", "symptom": "dolor", "duration": "3 días"}},
    )
    assert edited.status_code == 200
    assert edited.json()["clinical_data"]["tooth"] == "27"

    confirmed = client.post(f"/api/v1/sessions/{session_id}/confirm")
    assert confirmed.status_code == 200
    assert confirmed.json()["status"] == "CONFIRMED"

    rejected_edit = client.patch(
        f"/api/v1/sessions/{session_id}/clinical-data",
        json={"structured_data": {"tooth": "28"}},
    )
    assert rejected_edit.status_code == 409

    sync = client.post(f"/api/v1/sessions/{session_id}/smile-sync")
    assert sync.status_code == 200
    assert sync.json() == {"status": "accepted", "fields_count": 3}

    completed = client.post(f"/api/v1/sessions/{session_id}/complete")
    assert completed.status_code == 200
    assert completed.json()["status"] == "COMPLETED"
    assert all("raw_text" not in event["details"] for event in completed.json()["audit_events"])
