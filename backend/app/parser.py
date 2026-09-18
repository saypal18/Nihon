import re
import logging
from typing import List, Set
from sudachipy import dictionary, SplitMode
from .schemas import SentencePayload, TokenReading
from .disambiguator import disambiguate_token

logger = logging.getLogger("nihon-parser")

_dict = None
_tokenizer = None

def get_dictionary():
    global _dict
    if _dict is None:
        _dict = dictionary.Dictionary()
    return _dict

def get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = get_dictionary().create()
    return _tokenizer

# High-frequency Japanese heteronyms where context-dependent disambiguation is essential
COMMON_HETERONYMS = {
    '一日': ['いちにち', 'ついたち'],
    '何人': ['なんにん', 'なんびと'],
    '角': ['かど', 'つの'],
    '風': ['かぜ', 'ふう'],
    '上手': ['じょうず', 'かみて', 'うわて'],
    '下手': ['へた', 'しもて', 'したて'],
    '人気': ['にんき', 'ひとけ'],
    '大人気': ['だいにんき', 'おとなげ'],
    '色': ['いろ', 'しょく'],
    '方': ['かた', 'ほう'],
    '生物': ['せいぶつ', 'なまもの'],
    '市場': ['いちば', 'しじょう'],
    '紅葉': ['こうよう', 'もみじ'],
    '昨日': ['きのう', 'さくじつ'],
    '明日': ['あした', 'あす', 'みょうにち'],
    '今日': ['きょう', 'こんにち'],
    '大人': ['おとな', 'だいじん'],
    '初日': ['しょにち', 'はつひ'],
    '白黒': ['しろくろ', 'はくこく'],
    '行': ['ぎょう', 'こう'],
}

def katakana_to_hiragana(text: str) -> str:
    """Convert Katakana characters in text to Hiragana."""
    result = []
    for c in text:
        code = ord(c)
        if 0x30A1 <= code <= 0x30F6:
            result.append(chr(code - 0x60))
        elif c == 'ヴ':
            result.append('ゔ')
        else:
            result.append(c)
    return "".join(result)

def hiragana_to_katakana(text: str) -> str:
    """Convert Hiragana characters in text to Katakana."""
    result = []
    for c in text:
        code = ord(c)
        if 0x3041 <= code <= 0x3096:
            result.append(chr(code + 0x60))
        elif c == 'ゔ':
            result.append('ヴ')
        else:
            result.append(c)
    return "".join(result)

def split_sentences(text: str) -> List[str]:
    """
    Split Japanese text into sentences cleanly by punctuation:
    '。', '！', '？', '!', '?', or newlines.
    """
    normalized = text.replace('\r\n', '\n').replace('\r', '\n')
    lines = normalized.split('\n')
    
    sentences = []
    pattern = re.compile(r'([^。！？!?]+[。！？!?]*)')
    
    for line in lines:
        line = line.strip()
        if not line:
            continue
        
        matches = pattern.findall(line)
        if matches:
            for match in matches:
                m = match.strip()
                if m:
                    sentences.append(m)
        else:
            sentences.append(line)
            
    return sentences

def is_all_kana_or_punct(text: str) -> bool:
    """Check if all characters in text are kana, punctuation, or spaces (no kanji)."""
    for c in text:
        code = ord(c)
        is_kana = (0x3040 <= code <= 0x309F) or (0x30A0 <= code <= 0x30FF)
        is_punct = c in '。、！？!?「」『』（）()【】…・ー〜～ \t\u3000,.'
        if not (is_kana or is_punct):
            return False
    return True

def get_candidate_readings(surface: str, primary_reading: str) -> List[str]:
    """
    Return candidate readings for words identified as genuine heteronyms.
    Only heteronyms with multiple plausible interpretations trigger LLM evaluation.
    """
    if surface in COMMON_HETERONYMS:
        candidates_set = set(COMMON_HETERONYMS[surface])
        if primary_reading:
            candidates_set.add(katakana_to_hiragana(primary_reading))
        valid = [c for c in candidates_set if c and len(c) > 0]
        if len(valid) > 1:
            return sorted(valid)
    return []

async def parse_japanese_text(text: str) -> List[SentencePayload]:
    """
    Parse a passage of Japanese text into structured sentence payloads.
    Detects ambiguous Kanji readings and uses local LLM (Ollama) to disambiguate.
    """
    tokenizer = get_tokenizer()
    raw_sentences = split_sentences(text)
    payloads = []
    
    for idx, sentence_str in enumerate(raw_sentences, start=1):
        morphemes = tokenizer.tokenize(sentence_str, SplitMode.C)
        tokens: List[TokenReading] = []
        hiragana_parts = []
        katakana_parts = []
        
        for m in morphemes:
            surface = m.surface()
            pos = m.part_of_speech()
            reading = m.reading_form()
            
            is_punct = (
                pos[0] == '補助記号' or 
                all(c in '。、！？!?「」『』（）()【】…・ー〜～ \t\u3000,.' for c in surface)
            )
            
            if is_punct or not reading:
                reading = surface
            
            # Determine initial Hiragana representation
            if is_punct:
                token_hira = surface
                token_kata = surface
                candidates = []
                was_disambiguated = False
            elif is_all_kana_or_punct(surface):
                token_hira = katakana_to_hiragana(surface)
                token_kata = hiragana_to_katakana(surface)
                candidates = []
                was_disambiguated = False
            else:
                token_hira = katakana_to_hiragana(reading)
                token_kata = reading
                candidates = get_candidate_readings(surface, reading)
                
                # If multiple valid readings exist, disambiguate with local LLM
                if len(candidates) > 1:
                    selected_hira, was_disambiguated = await disambiguate_token(
                        sentence_str, surface, candidates, token_hira
                    )
                    token_hira = selected_hira
                    token_kata = hiragana_to_katakana(selected_hira)
                else:
                    was_disambiguated = False
                
            tokens.append(TokenReading(
                surface=surface,
                reading=token_kata,
                hiragana=token_hira,
                is_punctuation=is_punct,
                candidates=candidates if len(candidates) > 1 else None,
                disambiguated=was_disambiguated
            ))
            
            hiragana_parts.append(token_hira)
            katakana_parts.append(token_kata)
            
        full_hiragana = "".join(hiragana_parts)
        full_katakana = "".join(katakana_parts)
        
        payloads.append(SentencePayload(
            id=idx,
            original=sentence_str,
            hiragana=full_hiragana,
            katakana=full_katakana,
            translation="",
            tokens=tokens
        ))
        
    return payloads
