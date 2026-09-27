from typing import List, Literal, Optional
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

class SubTokenSchema(BaseModel):
    surface: str
    reading: str
    lemma: str
    pos: List[str] = []
    start_char: int
    end_char: int

class GrammarInfoSchema(BaseModel):
    pattern_name: str
    category: str
    meaning: str
    explanation: str
    formation: Optional[str] = None
    level: Optional[str] = None
    context_role: Optional[str] = None

class InflectionComponentSchema(BaseModel):
    surface: str
    lemma: str
    role: str

class InflectionInfoSchema(BaseModel):
    base_verb: str
    verb_type: Optional[str] = None
    form_name: str
    description: str
    components: List[InflectionComponentSchema] = []

class KanjiDetailSchema(BaseModel):
    kanji: str
    meaning: str
    onyomi: List[str] = []
    kunyomi: List[str] = []
    jlpt_level: Optional[str] = None

class GlossarySense(BaseModel):
    english_definitions: List[str]
    parts_of_speech: List[str] = []
    tags: List[str] = []
    info: Optional[str] = None

class GlossaryRequest(BaseModel):
    # Span-based click request (new)
    sentence: Optional[str] = Field(default=None, description="Full raw original sentence")
    clicked_start: Optional[int] = Field(default=None, description="Clicked start character offset")
    clicked_end: Optional[int] = Field(default=None, description="Clicked end character offset")
    selection_scope: Literal["sentence", "component", "exact"] = Field(default="sentence", description="Whether the span came from a sentence token, a component option, or an exact token selection")
    sentence_id: Optional[int] = None
    frontend_token_index: Optional[int] = None

    # Backward compatibility fields (old)
    word: Optional[str] = Field(default=None, description="Surface word or clicked word")
    dictionary_form: Optional[str] = Field(default=None, description="Dictionary/base form if known")
    reading: Optional[str] = Field(default=None, description="Kana reading")
    sentence_context: Optional[str] = Field(default=None, description="Full sentence context where word appears")

class GlossaryResponse(BaseModel):
    word: str
    dictionary_form: Optional[str] = None
    reading: str
    romaji: str
    senses: List[GlossarySense] = []
    selected_sense_index: int = 0
    jlpt_level: Optional[str] = None
    is_common: bool = False
    context_explanation: Optional[str] = None
    resolved_span: Optional[List[int]] = None  # [start, end]
    category: str = "word"  # "idiom", "auxiliary", "compound", "word", "particle", "name"
    grammar_info: Optional[GrammarInfoSchema] = None
    inflection_info: Optional[InflectionInfoSchema] = None
    kanji_breakdown: List[KanjiDetailSchema] = []
    sub_tokens: List[SubTokenSchema] = []
    confidence: float = 1.0
    source: str = "nihon_local"

class TTSRequest(BaseModel):
    text: str = Field(..., description="Japanese text to synthesize")
    kana: Optional[str] = Field(default=None, description="Optional caller-supplied kana pronunciation")
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
