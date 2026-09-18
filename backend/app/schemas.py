from typing import List, Optional
from pydantic import BaseModel, Field

class PassageRequest(BaseModel):
    text: str = Field(..., description="Japanese text to be parsed and translated")

class TokenReading(BaseModel):
    surface: str
    reading: str
    hiragana: str
    is_punctuation: bool = False
    candidates: Optional[List[str]] = None
    disambiguated: Optional[bool] = False

class SentencePayload(BaseModel):
    id: int
    original: str
    hiragana: str
    katakana: str
    translation: str
    tokens: List[TokenReading] = []

class PassageResponse(BaseModel):
    sentences: List[SentencePayload]

class HealthResponse(BaseModel):
    status: str
    morphological_parser: str
    translation_engine: str
    sudachi_ready: bool
    online_translation_ready: bool
    llm_disambiguator_ready: bool = False
    llm_model: Optional[str] = None
