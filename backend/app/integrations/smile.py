from typing import Protocol


class SmileIntegrationService(Protocol):
    def validate_connection(self) -> bool: ...

    def fill_fields(self, data: dict[str, object]) -> dict[str, object]: ...


class MockSmileIntegration:
    def validate_connection(self) -> bool:
        return True

    def fill_fields(self, data: dict[str, object]) -> dict[str, object]:
        return {"status": "accepted", "fields_count": len(data)}
