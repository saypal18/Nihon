from typing import List, Optional
from pydantic import BaseModel, Field

class PassageRequest(BaseModel):
    text: str = Field(..., description="Japanese text to be parsed and translated")
    allowed_kanji: Optional[str] = Field(default=None, description="Allowed Kanji characters or string")

class TokenReading(BaseModel):
    surface: str
    raw_surface: Optional[str] = None
    reading: str
    hiragana: str
    is_punctuation: bool = False
    candidates: Optional[List[str]] = None
    disambiguated: Optional[bool] = False
    dictionary_form: Optional[str] = None
    part_of_speech: Optional[List[str]] = None

class SentencePayload(BaseModel):
    id: int
    original: str
    raw_original: Optional[str] = None
    hiragana: str
    katakana: str
    tts_kana: Optional[str] = None
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
    voicevox_ready: bool = False

class GlossaryRequest(BaseModel):
    word: str = Field(..., description="Surface word or clicked word")
    dictionary_form: Optional[str] = Field(default=None, description="Dictionary/base form if known")
    reading: Optional[str] = Field(default=None, description="Kana reading")
    sentence_context: Optional[str] = Field(default=None, description="Full sentence context where word appears")

class GlossarySense(BaseModel):
    english_definitions: List[str]
    parts_of_speech: List[str] = []
    tags: List[str] = []
    info: Optional[str] = None

class GlossaryResponse(BaseModel):
    word: str
    dictionary_form: Optional[str] = None
    reading: str
    romaji: str
    senses: List[GlossarySense] = []
    jlpt_level: Optional[str] = None
    is_common: bool = False
    context_explanation: Optional[str] = None
    source: str = "jisho+ollama"

class TTSRequest(BaseModel):
    text: str = Field(..., description="Japanese text to synthesize")
    kana: Optional[str] = Field(default=None, description="Authoritative phonetic kana / katakana representation from G2P")
    speaker: Optional[int] = Field(default=1, description="VOICEVOX style ID (default: 1 - Zundamon normal or 3)")
    speed: Optional[float] = Field(default=1.0, description="Speech playback speed")
    pitch: Optional[float] = Field(default=0.0, description="Speech pitch adjustment")

class SpeakerStyle(BaseModel):
    id: int
    name: str

class SpeakerInfo(BaseModel):
    name: str
    speaker_uuid: str
    styles: List[SpeakerStyle]

class TTSStatusResponse(BaseModel):
    available: bool
    engine: str = "VOICEVOX Engine"
    url: str = "http://127.0.0.1:50021"
    speakers_count: int = 0
    error: Optional[str] = None
