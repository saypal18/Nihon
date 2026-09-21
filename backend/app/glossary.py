import logging
import urllib.parse
from typing import Optional, Dict, Any, List
import httpx

from .schemas import GlossaryRequest, GlossaryResponse, GlossarySense
from .disambiguator import detect_available_model, OLLAMA_BASE_URL, get_http_client
from .parser import katakana_to_hiragana

logger = logging.getLogger("nihon-glossary")

# In-memory dictionary cache to provide 0ms response on repeat word lookups
_glossary_cache: Dict[str, GlossaryResponse] = {}

def kana_to_romaji(kana: str) -> str:
    """Simple rule-based Kana to Romaji converter for display in glossary header."""
    hepburn_table = {
        'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
        'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
        'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
        'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
        'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
        'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
        'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
        'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
        'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
        'わ': 'wa', 'を': 'wo', 'ん': 'n',
        'が': 'ga', 'ぎ': 'gi', 'ぐ': 'gu', 'げ': 'ge', 'ご': 'go',
        'ざ': 'za', 'じ': 'ji', 'ず': 'zu', 'ぜ': 'ze', 'ぞ': 'zo',
        'だ': 'da', 'ぢ': 'ji', 'づ': 'zu', 'で': 'de', 'ど': 'do',
        'ば': 'ba', 'び': 'bi', 'ぶ': 'bu', 'べ': 'be', 'ぼ': 'bo',
        'ぱ': 'pa', 'ぴ': 'pi', 'ぷ': 'pu', 'ぺ': 'pe', 'ぽ': 'po',
        'きゃ': 'kya', 'きゅ': 'kyu', 'きょ': 'kyo',
        'しゃ': 'sha', 'しゅ': 'shu', 'しょ': 'sho',
        'ちゃ': 'cha', 'ちゅ': 'chu', 'ちょ': 'cho',
        'にゃ': 'nya', 'にゅ': 'nyu', 'にょ': 'nyo',
        'ひゃ': 'hya', 'ひゅ': 'hyu', 'ひょ': 'hyo',
        'みゃ': 'mya', 'みゅ': 'myu', 'みょ': 'myo',
        'りゃ': 'rya', 'りゅ': 'ryu', 'りょ': 'ryo',
        'ぎゃ': 'gya', 'ぎゅ': 'gyu', 'ぎょ': 'gyo',
        'じゃ': 'ja', 'じゅ': 'ju', 'じょ': 'jo',
        'びゃ': 'bya', 'びゅ': 'byu', 'びょ': 'byo',
        'ぴゃ': 'pya', 'ぴゅ': 'pyu', 'ぴょ': 'pyo',
        'っ': '', 'ー': '-',
    }
    
    hira = katakana_to_hiragana(kana)
    res = []
    i = 0
    n = len(hira)
    while i < n:
        if i + 1 < n and hira[i:i+2] in hepburn_table:
            res.append(hepburn_table[hira[i:i+2]])
            i += 2
        elif hira[i] == 'っ' and i + 1 < n:
            next_char = hira[i+1]
            next_rom = hepburn_table.get(next_char, '')
            if next_rom:
                res.append(next_rom[0])
            i += 1
        elif hira[i] in hepburn_table:
            res.append(hepburn_table[hira[i]])
            i += 1
        else:
            res.append(hira[i])
            i += 1
    return "".join(res)

async def fetch_jisho_data(term: str) -> Optional[Dict[str, Any]]:
    """Query Jisho API for word definitions, POS, and JLPT level."""
    try:
        url = f"https://jisho.org/api/v1/search/words?keyword={urllib.parse.quote(term)}"
        async with httpx.AsyncClient(timeout=4.0) as client:
            res = await client.get(url)
            if res.status_code == 200:
                data = res.json()
                items = data.get("data", [])
                if items:
                    return items[0]
    except Exception as e:
        logger.warning(f"Jisho API query failed for '{term}': {e}")
    return None

async def fetch_ollama_explanation(word: str, dictionary_form: Optional[str], sentence: str) -> Optional[str]:
    """Use local Ollama model to generate a concise contextual explanation."""
    detected = await detect_available_model()
    if not detected or not sentence:
        return None

    # Prefer non-thinking model like qwen2.5:7b for fast sub-second response if installed
    model = "qwen2.5:7b" if detected.startswith("qwen3") else detected

    lemma_hint = f" (dictionary form: {dictionary_form})" if dictionary_form and dictionary_form != word else ""
    prompt = (
        f"In 1 or 2 concise sentences, explain the Japanese word '{word}'{lemma_hint} "
        f"as used in this sentence: \"{sentence}\". "
        f"State its role (e.g. subject marker, past tense verb, adverb) and specific nuance in English. Be direct."
    )

    try:
        client = get_http_client()
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a concise Japanese language tutor. Provide clear, succinct contextual explanations in English without markdown titles or headers."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "stream": False,
            "options": {
                "temperature": 0.2,
                "num_predict": 100
            }
        }
        res = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=10.0)
        if res.status_code == 200:
            content = res.json().get("message", {}).get("content", "").strip()
            if content:
                return content
    except Exception as e:
        logger.debug(f"Ollama glossary explanation skipped: {e}")
    return None

async def resolve_glossary(req: GlossaryRequest) -> GlossaryResponse:
    """
    Resolve complete glossary information for a target word:
    1. Check memory cache.
    2. Query Jisho API using dictionary_form, then surface word.
    3. Query local Ollama for contextual nuance if sentence is provided.
    4. Return structured response.
    """
    cache_key = f"{req.word}_{req.dictionary_form or ''}_{req.reading or ''}_{req.sentence_context or ''}"
    if cache_key in _glossary_cache:
        return _glossary_cache[cache_key]

    # Term to query in dictionary
    query_term = req.dictionary_form if req.dictionary_form else req.word
    jisho_item = await fetch_jisho_data(query_term)
    
    # If not found with dictionary_form, try surface word
    if not jisho_item and req.word != query_term:
        jisho_item = await fetch_jisho_data(req.word)

    # If still not found and reading exists, try reading
    if not jisho_item and req.reading:
        hira_reading = katakana_to_hiragana(req.reading)
        jisho_item = await fetch_jisho_data(hira_reading)

    senses: List[GlossarySense] = []
    jlpt_level = None
    is_common = False
    display_reading = req.reading or req.word

    if jisho_item:
        is_common = jisho_item.get("is_common", False)
        jlpt_tags = jisho_item.get("jlpt", [])
        if jlpt_tags:
            jlpt_level = jlpt_tags[0].replace("jlpt-", "JLPT ").upper()

        # Try to obtain reading from Jisho item
        jp_list = jisho_item.get("japanese", [])
        if jp_list:
            display_reading = jp_list[0].get("reading") or display_reading

        for s in jisho_item.get("senses", []):
            defs = s.get("english_definitions", [])
            pos = s.get("parts_of_speech", [])
            tags = s.get("tags", [])
            info = "; ".join(s.get("info", [])) if s.get("info") else None
            if defs:
                senses.append(GlossarySense(
                    english_definitions=defs,
                    parts_of_speech=pos,
                    tags=tags,
                    info=info
                ))

    # Contextual explanation from Ollama
    context_exp = None
    if req.sentence_context:
        context_exp = await fetch_ollama_explanation(
            word=req.word,
            dictionary_form=req.dictionary_form,
            sentence=req.sentence_context
        )

    # Fallback definition if Jisho had no result
    if not senses:
        if context_exp:
            senses.append(GlossarySense(
                english_definitions=[context_exp],
                parts_of_speech=["Contextual Gloss"]
            ))
        else:
            senses.append(GlossarySense(
                english_definitions=["No dictionary definition found."],
                parts_of_speech=[]
            ))

    hira_reading = katakana_to_hiragana(display_reading)
    romaji = kana_to_romaji(hira_reading)

    response = GlossaryResponse(
        word=req.word,
        dictionary_form=req.dictionary_form,
        reading=hira_reading,
        romaji=romaji,
        senses=senses,
        jlpt_level=jlpt_level,
        is_common=is_common,
        context_explanation=context_exp,
        source="jisho+ollama" if (jisho_item and context_exp) else ("jisho" if jisho_item else "ollama")
    )

    _glossary_cache[cache_key] = response
    return response
