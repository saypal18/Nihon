import logging
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

from .schemas import (
    PassageRequest, PassageResponse, HealthResponse,
    GlossaryRequest, GlossaryResponse, TTSRequest, TTSStatusResponse
)
from .parser import parse_japanese_text, get_tokenizer
from .translator import translate_sentences, get_translator
from .disambiguator import detect_available_model
from .glossary import resolve_glossary
from .tts import synthesize_speech, get_tts_status, is_voicevox_running, get_speakers

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nihon-backend")

app = FastAPI(
    title="Nihon Japanese Touch-Typing Backend",
    description="NLP Morphological Analysis (Sudachi Full) + Local LLM Disambiguation (Ollama) + VOICEVOX TTS",
    version="3.0.0",
)

# Enable CORS for frontend Next.js dev server
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    logger.info("Initializing Sudachi Full dictionary...")
    get_tokenizer()
    
    logger.info("Initializing Googletrans online translation client...")
    get_translator()
    
    logger.info("Detecting local Ollama LLM model...")
    model = await detect_available_model()
    if model:
        logger.info(f"Ollama LLM Disambiguator ready with model: {model}")
    else:
        logger.info("Ollama not currently detected. Operating in Sudachi standalone mode.")
    
    # Check VOICEVOX Engine connectivity
    if is_voicevox_running():
        logger.info("VOICEVOX Engine connected on localhost:50021.")
    else:
        logger.warning("VOICEVOX Engine not currently detected on localhost:50021. Audio synthesis will be unavailable until started.")

    logger.info("Nihon backend ready.")

@app.get("/api/health", response_model=HealthResponse)
async def health_check():
    sudachi_ready = False
    try:
        tok = get_tokenizer()
        sudachi_ready = tok is not None
    except Exception as e:
        logger.error(f"Sudachi initialization error: {e}")

    online_trans_ready = False
    try:
        t = get_translator()
        online_trans_ready = t is not None
    except Exception as e:
        logger.error(f"Googletrans client error: {e}")

    llm_model = await detect_available_model()
    llm_ready = llm_model is not None
    vv_ready = is_voicevox_running()

    return HealthResponse(
        status="ok",
        morphological_parser="Sudachi Full (UniDic Mode C + A)",
        translation_engine="Googletrans (Online Google Translate API)",
        sudachi_ready=sudachi_ready,
        online_translation_ready=online_trans_ready,
        llm_disambiguator_ready=llm_ready,
        llm_model=llm_model,
        voicevox_ready=vv_ready,
    )

@app.post("/api/process-passage", response_model=PassageResponse)
async def process_passage(request: PassageRequest):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
        
    try:
        # Step 1: Sudachi Full morphological parsing + local LLM reading disambiguation + allowed Kanji filter
        sentences = await parse_japanese_text(text, allowed_kanji=request.allowed_kanji)
        if not sentences:
            raise HTTPException(status_code=400, detail="No readable sentences found.")
            
        # Step 2: Contextual English translation via online library
        # Use complete raw_original text for accurate context-aware translation
        originals = [s.raw_original or s.original for s in sentences]
        translations = translate_sentences(originals)
        
        # Merge translations
        for s, trans in zip(sentences, translations):
            s.translation = trans
            
        return PassageResponse(sentences=sentences)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error processing passage: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Translation / Processing error: {str(e)}")

@app.post("/api/glossary", response_model=GlossaryResponse)
async def get_glossary(request: GlossaryRequest):
    has_span = bool(request.sentence and request.clicked_start is not None)
    has_word = bool(request.word and request.word.strip())
    if not has_span and not has_word:
        raise HTTPException(status_code=400, detail="Either character span (sentence, clicked_start) or word must be provided.")
    try:
        glossary_res = await resolve_glossary(request)
        return glossary_res
    except Exception as e:
        logger.error(f"Error resolving glossary: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Glossary lookup error: {str(e)}")

@app.get("/api/tts/status", response_model=TTSStatusResponse)
async def tts_status():
    status = get_tts_status()
    return TTSStatusResponse(**status)

@app.get("/api/tts/speakers")
async def tts_speakers() -> List[Dict[str, Any]]:
    return get_speakers()

@app.post("/api/tts")
async def text_to_speech(request: TTSRequest):
    text = request.text.strip()
    kana = (request.kana or "").strip()
    if not text and not kana:
        raise HTTPException(status_code=400, detail="Either text or kana must be provided.")
    try:
        wav_bytes = synthesize_speech(
            text=text or kana,
            kana=kana if kana else None,
            speaker=request.speaker if request.speaker is not None else 3,
            speed=request.speed or 1.0,
            pitch=request.pitch or 0.0
        )
        return Response(content=wav_bytes, media_type="audio/wav")
    except Exception as e:
        logger.error(f"VOICEVOX TTS generation error: {e}", exc_info=True)
        raise HTTPException(status_code=503, detail=f"TTS service unavailable: {str(e)}")
