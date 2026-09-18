import logging
from typing import List, Optional
import httpx
from deep_translator import GoogleTranslator

logger = logging.getLogger("nihon-translator")

OLLAMA_BASE_URL = "http://127.0.0.1:11434"
_translator = None

def get_translator():
    global _translator
    if _translator is None:
        _translator = GoogleTranslator(source="ja", target="en")
    return _translator

def translate_with_ollama(sentence: str, model: str = "qwen2.5:7b") -> Optional[str]:
    """Translate Japanese sentence using local Ollama model on RTX 5070 Ti."""
    try:
        messages = [
            {
                "role": "system",
                "content": "You are a professional Japanese-to-English translator. Translate the given Japanese sentence into natural, fluent English. Output ONLY the English translation without quotes or notes."
            },
            {
                "role": "user",
                "content": sentence
            }
        ]
        with httpx.Client(timeout=8.0) as client:
            res = client.post(
                f"{OLLAMA_BASE_URL}/api/chat",
                json={
                    "model": model,
                    "messages": messages,
                    "stream": False,
                    "options": {"temperature": 0.3}
                }
            )
            if res.status_code == 200:
                translation = res.json().get("message", {}).get("content", "").strip()
                if translation:
                    return translation
    except Exception as e:
        logger.debug(f"Ollama local translation unavailable: {e}")
    return None

def translate_sentences(sentences: List[str]) -> List[str]:
    """
    Translate a list of Japanese sentences to English.
    Prioritizes local Ollama (RTX 5070 Ti) for zero rate-limits and privacy,
    falling back to online Google Translate if Ollama is not running.
    """
    if not sentences:
        return []

    results = []
    translator = get_translator()

    for idx, s in enumerate(sentences, start=1):
        trimmed = s.strip()
        if not trimmed:
            results.append("")
            continue

        # 1. Try local Ollama translation
        local_trans = translate_with_ollama(trimmed)
        if local_trans:
            results.append(local_trans)
            continue

        # 2. Fallback to online translation
        try:
            res = translator.translate(trimmed)
            if res:
                results.append(res.strip())
            else:
                results.append("")
        except Exception as e:
            logger.warning(f"Translation failed for sentence {idx} ('{trimmed}'): {e}")
            results.append("")

    return results
