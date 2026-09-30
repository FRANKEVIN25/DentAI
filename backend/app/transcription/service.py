from typing import Protocol


class SpeechToTextService(Protocol):
    def transcribe(self, audio: bytes) -> str: ...


class MockSpeechToText:
    def __init__(self, transcript: str = "") -> None:
        self.transcript = transcript

    def transcribe(self, audio: bytes) -> str:
        return self.transcript
