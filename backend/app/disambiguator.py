import logging
import re
from typing import List, Tuple, Optional
import httpx

logger = logging.getLogger("nihon-disambiguator")

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
PREFERRED_MODELS = [
    "qwen2.5:7b",
    "qwen2.5:7b-instruct",
    "qwen2.5:14b",
    "qwen2.5:32b",
    "qwen2.5:latest",
    "qwen2.5",
    "qwen3:latest",
    "qwen3",
    "qwen3:8b",
    "qwen3:14b",
    "aya-expanse:8b",
    "phi4:latest",
    "deepseek-r1:7b",
    "deepseek-r1:8b",
    "gemma4:e2b",
]

_detected_model: Optional[str] = None
_client: Optional[httpx.AsyncClient] = None

def get_http_client() -> httpx.AsyncClient:
    global _client
    if _client is None or getattr(_client, "is_closed", False):
        _client = httpx.AsyncClient(timeout=15.0)
    return _client

async def detect_available_model() -> Optional[str]:
    """Check Ollama for the best available model on the system."""
    global _detected_model
    try:
        client = get_http_client()
        res = await client.get(f"{OLLAMA_BASE_URL}/api/tags")
        if res.status_code == 200:
            data = res.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            
            for pref in PREFERRED_MODELS:
                for m in models:
                    if m == pref or m.startswith(f"{pref}:") or m.startswith(pref):
                        _detected_model = m
                        return _detected_model
            
            if models:
                _detected_model = models[0]
                return _detected_model
    except Exception as e:
        logger.debug(f"Ollama not reachable or error querying models: {e}")
    
    return None

async def disambiguate_token(
    sentence: str,
    surface: str,
    candidates: List[str],
    default_reading: str
) -> Tuple[str, bool]:
    """
    Constrained contextual selection using local LLM (Qwen2.5 / Ollama on RTX 5070 Ti).
    Returns (selected_hiragana, was_disambiguated).
    """
    if len(candidates) <= 1:
        return default_reading, False

    model = await detect_available_model()
    if not model:
        return default_reading, False

    cand_str = ", ".join(candidates)
    messages = [
        {
            "role": "system",
            "content": (
                "あなたは日本語の読み（ふりがな）の専門家です。"
                "文脈に基づいて対象語の正しい読みを候補の中から1つ選び、そのひらがなだけを出力してください。"
                "暦・日付（何月一日）は「ついたち」、期間・日数は「いちにち」です。"
                "余計な説明や前置きは一切出力しないでください。"
            )
        },
        {
            "role": "user",
            "content": f"文: {sentence}\n対象: {surface}\n候補: {cand_str}\n正しい読み:"
        }
    ]

    try:
        client = get_http_client()
        payload = {
            "model": model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": 0.0,
                "num_predict": 30,
            }
        }
        res = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload)
        if res.status_code == 200:
            msg_obj = res.json().get("message", {})
            content = msg_obj.get("content", "").strip()
            if not content and "thinking" in msg_obj:
                content = msg_obj.get("thinking", "").strip()

            # Exact match check first
            clean_content = content.replace('*', '').replace('「', '').replace('」', '').strip()
            for c in candidates:
                if clean_content == c:
                    logger.info(f"Disambiguated '{surface}' in \"{sentence}\" -> '{c}' (via {model})")
                    return c, True

            # Match first occurring candidate in response
            # Find candidate with earliest position in response
            earliest_idx = 999999
            earliest_cand = None
            for c in candidates:
                idx = content.find(c)
                if idx != -1 and idx < earliest_idx:
                    earliest_idx = idx
                    earliest_cand = c

            if earliest_cand:
                logger.info(f"Disambiguated '{surface}' in \"{sentence}\" -> '{earliest_cand}' (via {model})")
                return earliest_cand, True

    except Exception as e:
        logger.warning(f"Failed to disambiguate '{surface}' via Ollama: {e}")

    return default_reading, False
