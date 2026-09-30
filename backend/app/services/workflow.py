from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.clinical_data.processing import ClinicalProcessor, MockClinicalProcessor
from app.integrations.smile import MockSmileIntegration, SmileIntegrationService
from app.models import AuditEvent, ClinicalData, ClinicalSession, SessionStatus, Transcription, User


class SessionNotFound(Exception):
    pass


class InvalidSessionState(Exception):
    pass


def _event(db: Session, session_id: str, event_type: str, details: dict[str, object] | None = None) -> None:
    db.add(AuditEvent(session_id=session_id, event_type=event_type, details=details or {}))


def _get_session(db: Session, session_id: str) -> ClinicalSession:
    session = db.get(ClinicalSession, session_id)
    if session is None:
        raise SessionNotFound(session_id)
    return session


def create_session(db: Session, display_name: str) -> ClinicalSession:
    user = db.scalar(select(User).where(User.display_name == display_name))
    if user is None:
        user = User(display_name=display_name)
        db.add(user)
        db.flush()
    session = ClinicalSession(user_id=user.id, status=SessionStatus.CREATED.value)
    db.add(session)
    db.flush()
    _event(db, session.id, "SESSION_CREATED", {"user_id": user.id})
    db.commit()
    db.refresh(session)
    return session


def add_transcription(db: Session, session_id: str, raw_text: str) -> ClinicalSession:
    session = _get_session(db, session_id)
    if session.status != SessionStatus.CREATED.value:
        raise InvalidSessionState("La transcripción solo se puede agregar a una sesión nueva.")
    db.add(Transcription(session_id=session.id, raw_text=raw_text, source="MOCK"))
    session.status = SessionStatus.PROCESSING.value
    _event(db, session.id, "TRANSCRIPTION_COMPLETED", {"source": "MOCK"})
    db.commit()
    db.refresh(session)
    return session


def process_session(
    db: Session,
    session_id: str,
    processor: ClinicalProcessor | None = None,
) -> ClinicalSession:
    session = _get_session(db, session_id)
    if session.status != SessionStatus.PROCESSING.value:
        raise InvalidSessionState("Solo se puede procesar una transcripción pendiente.")
    transcription = db.scalar(select(Transcription).where(Transcription.session_id == session.id))
    if transcription is None:
        raise InvalidSessionState("La sesión no tiene una transcripción.")
    clinical_data = db.scalar(select(ClinicalData).where(ClinicalData.session_id == session.id))
    if clinical_data is None:
        clinical_data = ClinicalData(session_id=session.id, structured_data={})
        db.add(clinical_data)
    clinical_data.structured_data = (processor or MockClinicalProcessor()).process(transcription.raw_text)
    session.status = SessionStatus.REVIEW.value
    _event(db, session.id, "DATA_PROCESSED", {"processor": "MOCK"})
    db.commit()
    db.refresh(session)
    return session


def update_clinical_data(db: Session, session_id: str, structured_data: dict[str, object]) -> ClinicalSession:
    session = _get_session(db, session_id)
    if session.status != SessionStatus.REVIEW.value:
        raise InvalidSessionState("Los datos solo se pueden editar durante la revisión.")
    clinical_data = db.scalar(select(ClinicalData).where(ClinicalData.session_id == session.id))
    if clinical_data is None:
        raise InvalidSessionState("La sesión no tiene datos clínicos para revisar.")
    clinical_data.structured_data = structured_data
    _event(db, session.id, "DATA_EDITED")
    db.commit()
    db.refresh(session)
    return session


def confirm_session(db: Session, session_id: str) -> ClinicalSession:
    session = _get_session(db, session_id)
    if session.status != SessionStatus.REVIEW.value:
        raise InvalidSessionState("Solo se puede confirmar una sesión en revisión.")
    clinical_data = db.scalar(select(ClinicalData).where(ClinicalData.session_id == session.id))
    if clinical_data is None:
        raise InvalidSessionState("No hay datos clínicos para confirmar.")
    session.status = SessionStatus.CONFIRMED.value
    session.confirmed_at = datetime.now(timezone.utc)
    _event(db, session.id, "USER_CONFIRMED", {"user_id": session.user_id})
    db.commit()
    db.refresh(session)
    return session


def cancel_session(db: Session, session_id: str) -> ClinicalSession:
    session = _get_session(db, session_id)
    if session.status not in {SessionStatus.CREATED.value, SessionStatus.PROCESSING.value, SessionStatus.REVIEW.value}:
        raise InvalidSessionState("Esta sesión ya no se puede cancelar.")
    session.status = SessionStatus.CANCELLED.value
    _event(db, session.id, "SESSION_CANCELLED")
    db.commit()
    db.refresh(session)
    return session


def sync_to_smile(
    db: Session,
    session_id: str,
    integration: SmileIntegrationService | None = None,
) -> dict[str, object]:
    session = _get_session(db, session_id)
    if session.status != SessionStatus.CONFIRMED.value:
        raise InvalidSessionState("Se requiere confirmación humana antes de enviar datos a SMILE.")
    synced = db.scalar(
        select(AuditEvent.id).where(
            AuditEvent.session_id == session.id,
            AuditEvent.event_type == "SMILE_SYNC_COMPLETED",
        )
    )
    if synced:
        raise InvalidSessionState("La sesión ya fue enviada al mock de SMILE.")
    clinical_data = db.scalar(select(ClinicalData).where(ClinicalData.session_id == session.id))
    if clinical_data is None:
        raise InvalidSessionState("No hay datos clínicos confirmados para enviar.")

    service = integration or MockSmileIntegration()
    _event(db, session.id, "SMILE_SYNC_STARTED")
    db.commit()
    if not service.validate_connection():
        _event(db, session.id, "ERROR", {"operation": "SMILE_SYNC", "reason": "connection_unavailable"})
        db.commit()
        raise InvalidSessionState("El mock de SMILE no está disponible.")
    result = service.fill_fields(clinical_data.structured_data)
    _event(db, session.id, "SMILE_SYNC_COMPLETED", {"fields_count": result.get("fields_count", 0)})
    db.commit()
    return result


def complete_session(db: Session, session_id: str) -> ClinicalSession:
    session = _get_session(db, session_id)
    if session.status != SessionStatus.CONFIRMED.value:
        raise InvalidSessionState("Solo una sesión confirmada se puede finalizar.")
    synced = db.scalar(
        select(AuditEvent.id).where(
            AuditEvent.session_id == session.id,
            AuditEvent.event_type == "SMILE_SYNC_COMPLETED",
        )
    )
    if not synced:
        raise InvalidSessionState("La sesión debe completar el envío simulado antes de finalizar.")
    session.status = SessionStatus.COMPLETED.value
    _event(db, session.id, "SESSION_COMPLETED")
    db.commit()
    db.refresh(session)
    return session


def get_session_detail(db: Session, session_id: str) -> dict[str, object]:
    session = _get_session(db, session_id)
    user = db.get(User, session.user_id)
    transcription = db.scalar(select(Transcription).where(Transcription.session_id == session.id))
    clinical_data = db.scalar(select(ClinicalData).where(ClinicalData.session_id == session.id))
    events = db.scalars(
        select(AuditEvent).where(AuditEvent.session_id == session.id).order_by(AuditEvent.created_at)
    ).all()
    return {
        "id": session.id,
        "status": session.status,
        "created_at": session.created_at,
        "confirmed_at": session.confirmed_at,
        "user": {"id": user.id, "display_name": user.display_name} if user else None,
        "transcription": {"raw_text": transcription.raw_text, "source": transcription.source} if transcription else None,
        "clinical_data": clinical_data.structured_data if clinical_data else None,
        "audit_events": [
            {"event_type": event.event_type, "details": event.details, "created_at": event.created_at}
            for event in events
        ],
    }
