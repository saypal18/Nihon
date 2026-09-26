import io
import re
import logging
from typing import Optional, Dict, Any, Tuple, List
from collections import OrderedDict
import threading
import httpx

logger = logging.getLogger("nihon-tts")

VOICEVOX_BASE_URL = "http://127.0.0.1:50021"

# In-memory FIFO audio cache for fast repetitive sentence replay
FIFO_CACHE_SIZE = 50
_audio_cache: OrderedDict[Tuple[str, int, float, float], bytes] = OrderedDict()
_cache_lock = threading.Lock()

_client: Optional[httpx.Client] = None

def get_http_client() -> httpx.Client:
    global _client
    if _client is None or getattr(_client, "is_closed", False):
        _client = httpx.Client(timeout=30.0)
    return _client

def is_voicevox_running() -> bool:
    """Check if local VOICEVOX engine is responding."""
    try:
        client = get_http_client()
        r = client.get(f"{VOICEVOX_BASE_URL}/version", timeout=1.5)
        return r.status_code == 200
    except Exception:
        return False

def get_tts_status() -> dict:
    available = is_voicevox_running()
    speakers_count = 0
    if available:
        try:
            client = get_http_client()
            r = client.get(f"{VOICEVOX_BASE_URL}/speakers", timeout=2.0)
            if r.status_code == 200:
                speakers_count = len(r.json())
        except Exception:
            pass

    return {
        "available": available,
        "engine": "VOICEVOX Engine",
        "url": VOICEVOX_BASE_URL,
        "speakers_count": speakers_count,
        "error": None if available else "VOICEVOX Engine not running on localhost:50021"
    }

def get_speakers() -> List[Dict[str, Any]]:
    """Retrieve list of available speakers from VOICEVOX."""
    try:
        client = get_http_client()
        r = client.get(f"{VOICEVOX_BASE_URL}/speakers")
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        logger.warning(f"Failed to fetch VOICEVOX speakers: {e}")
    return []

def clean_kana_for_voicevox(kana: str) -> str:
    """
    Clean kana text for VOICEVOX is_kana mode:
    - Standardize Japanese punctuation
    - Remove characters incompatible with AquesTalk syntax
    """
    if not kana:
        return ""
    # Standardize punctuation
    cleaned = kana.replace('?', '？').replace('!', '！').replace(',', '、').replace('.', '。')
    cleaned = cleaned.replace(' ', '、').replace('\u3000', '、')
    # Filter only supported characters: Katakana, Hiragana, prolonged sound mark, and standard Japanese punctuation
    # AquesTalk kana allows Katakana, '/', ''', and Japanese punctuation marks
    return cleaned

def synthesize_speech(
    text: str,
    kana: Optional[str] = None,
    speaker: int = 3,
    speed: float = 1.0,
    pitch: float = 0.0
) -> bytes:
    """
    Synthesize Japanese speech using local VOICEVOX Engine.
    Uses VOICEVOX text analysis when no caller-supplied kana reading is provided.
    This preserves sentence context for pronunciation analysis.
    """
    client = get_http_client()
    target_speaker = int(speaker) if speaker is not None else 3
    speech_key = (kana or text).strip()
    cache_key = (speech_key, target_speaker, round(speed, 2), round(pitch, 2))

    # 1. Check in-memory FIFO cache
    with _cache_lock:
        if cache_key in _audio_cache:
            logger.info(f"Serving VOICEVOX speech from FIFO cache: '{speech_key[:25]}...' [speaker={target_speaker}]")
            return _audio_cache[cache_key]

    # 2. Generate AudioQuery from VOICEVOX
    audio_query = None
    if kana and kana.strip():
        cleaned_kana = clean_kana_for_voicevox(kana.strip())
        try:
            # Query using canonical kana with is_kana=true
            q_res = client.post(
                f"{VOICEVOX_BASE_URL}/audio_query",
                params={
                    "text": cleaned_kana,
                    "speaker": target_speaker,
                    "is_kana": "true"
                }
            )
            if q_res.status_code == 200:
                audio_query = q_res.json()
        except Exception as e:
            logger.debug(f"Audio query with is_kana=true failed ({e}), falling back to text query.")

    # Fallback to plain text audio_query if kana query was not possible
    if audio_query is None:
        q_res = client.post(
            f"{VOICEVOX_BASE_URL}/audio_query",
            params={
                "text": text.strip(),
                "speaker": target_speaker
            }
        )
        if q_res.status_code != 200:
            raise RuntimeError(f"VOICEVOX audio_query failed ({q_res.status_code}): {q_res.text}")
        audio_query = q_res.json()

    # 3. Apply prosody / speed / pitch parameters
    if speed != 1.0:
        audio_query["speedScale"] = max(0.5, min(2.0, speed))
    if pitch != 0.0:
        audio_query["pitchScale"] = max(-0.15, min(0.15, pitch))

    # 4. Synthesize speech WAV from AudioQuery
    synth_res = client.post(
        f"{VOICEVOX_BASE_URL}/synthesis",
        params={"speaker": target_speaker},
        json=audio_query
    )
    if synth_res.status_code != 200:
        raise RuntimeError(f"VOICEVOX synthesis failed ({synth_res.status_code}): {synth_res.text}")

    wav_bytes = synth_res.content
    logger.info(f"Synthesized {len(wav_bytes)} bytes WAV via VOICEVOX [speaker={target_speaker}] for '{speech_key[:25]}...'")

    # 5. Store in FIFO cache
    with _cache_lock:
        if len(_audio_cache) >= FIFO_CACHE_SIZE:
            _audio_cache.popitem(last=False)
        _audio_cache[cache_key] = wav_bytes

    return wav_bytes
