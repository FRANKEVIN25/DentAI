import re
from typing import Protocol


class ClinicalProcessor(Protocol):
    def process(self, text: str) -> dict[str, object]: ...


class MockClinicalProcessor:
    _number_words = {
        "un": "1",
        "una": "1",
        "dos": "2",
        "tres": "3",
        "cuatro": "4",
        "cinco": "5",
    }

    def process(self, text: str) -> dict[str, object]:
        tooth_match = re.search(r"(?:pieza|diente)\s*(\d{1,2})", text, re.IGNORECASE)
        duration_match = re.search(
            r"(?:desde hace|durante|hace)\s+(?:aproximadamente\s+)?"
            r"(\d+|un|una|dos|tres|cuatro|cinco)\s+(d[ií]as?|semanas?|meses?)",
            text,
            re.IGNORECASE,
        )
        symptom = next(
            (word for word in ("dolor", "inflamación", "sangrado", "sensibilidad") if word in text.casefold()),
            None,
        )
        duration = None
        if duration_match:
            amount = self._number_words.get(duration_match.group(1).casefold(), duration_match.group(1))
            duration = f"{amount} {duration_match.group(2).lower()}"

        return {
            "tooth": tooth_match.group(1) if tooth_match else None,
            "symptom": symptom,
            "duration": duration,
        }
