import logging
from typing import List
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .schemas import PassageRequest, PassageResponse, HealthResponse
from .parser import parse_japanese_text, get_tokenizer
from .translator import translate_sentences, get_translator
from .disambiguator import detect_available_model

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("nihon-backend")

app = FastAPI(
    title="Nihon Japanese Touch-Typing Backend",
    description="NLP Morphological Analysis (SudachiPy) + Local LLM Disambiguation (Ollama)",
    version="2.1.0",
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
    logger.info("Initializing SudachiPy dictionary...")
    get_tokenizer()
    logger.info("Initializing Googletrans online translation client...")
    get_translator()
    logger.info("Detecting local Ollama LLM model...")
    model = await detect_available_model()
    if model:
        logger.info(f"Ollama LLM Disambiguator ready with model: {model}")
    else:
        logger.info("Ollama not currently detected. Operating in SudachiPy standalone mode.")
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

    return HealthResponse(
        status="ok",
        morphological_parser="SudachiPy (UniDic Mode C)",
        translation_engine="Googletrans (Online Google Translate API)",
        sudachi_ready=sudachi_ready,
        online_translation_ready=online_trans_ready,
        llm_disambiguator_ready=llm_ready,
        llm_model=llm_model,
    )

@app.post("/api/process-passage", response_model=PassageResponse)
async def process_passage(request: PassageRequest):
    text = request.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="Text cannot be empty.")
        
    try:
        # Step 1: Sudachi morphological parsing + local LLM reading disambiguation
        sentences = await parse_japanese_text(text)
        if not sentences:
            raise HTTPException(status_code=400, detail="No readable sentences found.")
            
        # Step 2: Contextual English translation via online library
        originals = [s.original for s in sentences]
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
