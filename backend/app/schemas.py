from typing import Any

from pydantic import BaseModel, Field


class SessionCreate(BaseModel):
    display_name: str = Field(default="Odontólogo", min_length=1, max_length=120)


class TranscriptionCreate(BaseModel):
    raw_text: str = Field(min_length=1, max_length=10000)


class ClinicalDataUpdate(BaseModel):
    structured_data: dict[str, Any]
