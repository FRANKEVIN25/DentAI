from collections.abc import Callable
from typing import TypeVar

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models import ClinicalSession
from app.schemas import ClinicalDataUpdate, SessionCreate, TranscriptionCreate
from app.services import workflow

router = APIRouter(prefix="/sessions", tags=["sessions"])
Result = TypeVar("Result")


def _execute(action: Callable[[], Result]) -> Result:
    try:
        return action()
    except workflow.SessionNotFound as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión no encontrada.") from exc
    except workflow.InvalidSessionState as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("", status_code=status.HTTP_201_CREATED)
def create_session(payload: SessionCreate, db: Session = Depends(get_db)) -> dict[str, object]:
    session = workflow.create_session(db, payload.display_name)
    return workflow.get_session_detail(db, session.id)


@router.get("/{session_id}")
def read_session(session_id: str, db: Session = Depends(get_db)) -> dict[str, object]:
    return _execute(lambda: workflow.get_session_detail(db, session_id))


@router.post("/{session_id}/transcription")
def add_transcription(
    session_id: str,
    payload: TranscriptionCreate,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return _execute(lambda: _detail_after(db, workflow.add_transcription(db, session_id, payload.raw_text)))


@router.post("/{session_id}/process")
def process_session(session_id: str, db: Session = Depends(get_db)) -> dict[str, object]:
    return _execute(lambda: _detail_after(db, workflow.process_session(db, session_id)))


@router.patch("/{session_id}/clinical-data")
def edit_clinical_data(
    session_id: str,
    payload: ClinicalDataUpdate,
    db: Session = Depends(get_db),
) -> dict[str, object]:
    return _execute(
        lambda: _detail_after(
            db,
            workflow.update_clinical_data(db, session_id, payload.structured_data),
        )
    )


@router.post("/{session_id}/confirm")
def confirm_session(session_id: str, db: Session = Depends(get_db)) -> dict[str, object]:
    return _execute(lambda: _detail_after(db, workflow.confirm_session(db, session_id)))


@router.post("/{session_id}/cancel")
def cancel_session(session_id: str, db: Session = Depends(get_db)) -> dict[str, object]:
    return _execute(lambda: _detail_after(db, workflow.cancel_session(db, session_id)))


@router.post("/{session_id}/smile-sync")
def sync_smile(session_id: str, db: Session = Depends(get_db)) -> dict[str, object]:
    return _execute(lambda: workflow.sync_to_smile(db, session_id))


@router.post("/{session_id}/complete")
def complete_session(session_id: str, db: Session = Depends(get_db)) -> dict[str, object]:
    return _execute(lambda: _detail_after(db, workflow.complete_session(db, session_id)))


def _detail_after(db: Session, session: ClinicalSession) -> dict[str, object]:
    return workflow.get_session_detail(db, session.id)