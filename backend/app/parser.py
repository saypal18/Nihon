import os
import csv
import re
import logging
from typing import List, Set, Optional, Tuple
from sudachipy import dictionary, SplitMode
from .schemas import SentencePayload, TokenReading
from .disambiguator import disambiguate_token
from .normalizer import normalize_japanese_text

logger = logging.getLogger("nihon-parser")

_dict = None
_tokenizer = None

def get_dictionary():
    global _dict
    if _dict is None:
        try:
            _dict = dictionary.Dictionary(dict="full")
            logger.info("Loaded Sudachi Full dictionary successfully.")
        except Exception as e:
            logger.warning(f"Could not load Sudachi Full dictionary ({e}), falling back to default Dictionary.")
            _dict = dictionary.Dictionary()
    return _dict

def get_tokenizer():
    global _tokenizer
    if _tokenizer is None:
        _tokenizer = get_dictionary().tokenizer()
    return _tokenizer

# Comprehensive Japanese heteronyms where context-dependent disambiguation is essential
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
    '十分': ['じゅうぶん', 'じゅっぷん'],
    '辛い': ['からい', 'つらい'],
    '開く': ['ひらく', 'あく'],
    '下り': ['くだり', 'おり'],
    '生': ['なま', 'せい', 'しょう'],
    '雨天': ['うてん', 'あめてん'],
    '両面': ['りょうめん', 'りょうおもて'],
    '客間': ['きゃくま', 'きゃくのま'],
    '色気': ['いろけ', 'しきけ'],
    '木綿': ['もめん', 'ゆう'],
    '日本橋': ['にほんばし', 'にっぽんばし'],
    '色紙': ['しきし', 'いろがみ'],
    '大分': ['だいぶ', 'おおいた'],
}

def katakana_to_hiragana(text: str) -> str:
    """Convert Katakana characters in text to Hiragana deterministically."""
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
    """Convert Hiragana characters in text to Katakana deterministically."""
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

def is_kanji(char: str) -> bool:
    """Check if any character in string is a CJK ideograph (Kanji)."""
    if not char:
        return False
    return any(
        (0x4E00 <= ord(c) <= 0x9FFF) or
        (0x3400 <= ord(c) <= 0x4DBF) or
        (0x20000 <= ord(c) <= 0x2A6DF) or
        (0xF900 <= ord(c) <= 0xFAFF)
        for c in char
    )

def extract_kanji_set(text: str) -> Set[str]:
    """Extract all unique Kanji characters from text."""
    if not text:
        return set()
    return {c for c in text if is_kanji(c)}

_kanji_readings = None

def get_kanji_readings():
    global _kanji_readings
    if _kanji_readings is None:
        _kanji_readings = {}
        base_dir = os.path.dirname(os.path.abspath(__file__))
        possible_paths = [
            os.path.join(base_dir, "..", "..", "data-prep", "kanji_correct_order.csv"),
            os.path.join(base_dir, "..", "data-prep", "kanji_correct_order.csv"),
            os.path.join(os.getcwd(), "data-prep", "kanji_correct_order.csv"),
        ]
        csv_path = None
        for p in possible_paths:
            if os.path.exists(p):
                csv_path = p
                break
        
        if csv_path:
            try:
                with open(csv_path, mode='r', encoding='utf-8-sig') as f:
                    reader = csv.DictReader(f)
                    for row in reader:
                        k = row['Kanji']
                        r_set = set()
                        for col in ['Onyomi', 'Kunyomi']:
                            v = row.get(col, '')
                            if v and v != 'nan':
                                for part in v.split('、'):
                                    clean = re.sub(r'[\.\-\(\)]', '', part).strip()
                                    if clean:
                                        r_set.add(katakana_to_hiragana(clean))
                        _kanji_readings[k] = r_set
            except Exception as e:
                logger.warning(f"Failed to load kanji_correct_order.csv: {e}")

        # Common rendaku / sound changes / irregular readings
        common_sound_changes = {
            '土': ['ど'],
            '日': ['び', 'にっ', 'ひ'],
            '供': ['ども', 'ぐ'],
            '学': ['がっ', 'がく'],
            '校': ['こう'],
            '中': ['ちゅう', 'じゅう', 'なか'],
            '声': ['こえ'],
            '響': ['ひび'],
            '元': ['げん', 'がん', 'もと'],
            '気': ['き', 'け'],
            '時': ['じ', 'とき'],
            '人': ['にん', 'びと', 'ひと'],
            '本': ['ぼん', 'ぽん', 'ほん'],
            '物': ['もの', 'ぶつ'],
        }
        for k, extras in common_sound_changes.items():
            if k in _kanji_readings:
                _kanji_readings[k].update(extras)
            else:
                _kanji_readings[k] = set(extras)

    return _kanji_readings

def align_token(surface: str, hiragana: str) -> List[Tuple[str, str]]:
    """
    Align individual characters of a surface word to slices of its Hiragana reading.
    Returns list of (surface_char, hiragana_slice) pairs.
    """
    if all(not is_kanji(c) for c in surface):
        return [(surface, hiragana)]
    if len(surface) == 1:
        return [(surface, hiragana)]
    
    kanji_dict = get_kanji_readings()
    memo = {}

    def dp(s_i, h_i):
        key = (s_i, h_i)
        if key in memo:
            return memo[key]
        if s_i == len(surface) and h_i == len(hiragana):
            return []
        if s_i == len(surface) or h_i == len(hiragana):
            return None
        
        char = surface[s_i]
        if not is_kanji(char):
            if hiragana[h_i] == char:
                rest = dp(s_i + 1, h_i + 1)
                if rest is not None:
                    memo[key] = [(char, char)] + rest
                    return memo[key]
            memo[key] = None
            return None
        
        known = kanji_dict.get(char, set())
        best_candidate = None
        for l in range(1, min(6, len(hiragana) - h_i + 1)):
            chunk = hiragana[h_i:h_i+l]
            rest = dp(s_i + 1, h_i + l)
            if rest is not None:
                pair = [(char, chunk)] + rest
                if chunk in known:
                    memo[key] = pair
                    return pair
                if best_candidate is None:
                    best_candidate = pair
        memo[key] = best_candidate
        return best_candidate

    result = dp(0, 0)
    if result is not None:
        return result
    return [(surface, hiragana)]

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

async def parse_japanese_text(text: str, allowed_kanji: Optional[str] = None) -> List[SentencePayload]:
    """
    Parse a passage of Japanese text into structured sentence payloads:
    1. Input normalization (NFKC, punctuation, full-width variants).
    2. Sudachi Full morphological parsing + tokenization.
    3. Context-aware local LLM (Ollama) disambiguation for heteronyms.
    4. Canonical Katakana + deterministic Hiragana derivation (guaranteed 100% agreement).
    5. Construction of phonetic TTS kana for VOICEVOX synthesis.
    6. Allowed Kanji filtering (furigana conversion for unlearned Kanji).
    """
    normalized_text = normalize_japanese_text(text)
    tokenizer = get_tokenizer()
    raw_sentences = split_sentences(normalized_text)
    payloads = []
    
    filtering_active = (allowed_kanji is not None)
    allowed_set = extract_kanji_set(allowed_kanji) if filtering_active else set()
    
    for idx, sentence_str in enumerate(raw_sentences, start=1):
        morphemes = tokenizer.tokenize(sentence_str, SplitMode.C)
        tokens: List[TokenReading] = []
        hiragana_parts = []
        katakana_parts = []
        tts_kana_parts = []
        
        for m in morphemes:
            # If compound word has A-mode splits and is not a heteronym requiring full-unit disambiguation:
            is_hetero = m.surface() in COMMON_HETERONYMS
            a_splits = m.split(SplitMode.A)
            units = [m] if (is_hetero or len(a_splits) <= 1) else a_splits
            
            for u in units:
                surface = u.surface()
                pos = u.part_of_speech()
                reading = u.reading_form()
                
                is_punct = (
                    pos[0] == '補助記号' or 
                    all(c in '。、！？!?「」『』（）()【】…・ー〜～ \t\u3000,.' for c in surface)
                )
                
                if is_punct or not reading:
                    reading = surface
                
                # Determine initial Hiragana & Katakana representation
                if is_punct:
                    token_kata = surface
                    token_hira = surface
                    candidates = []
                    was_disambiguated = False
                elif is_all_kana_or_punct(surface):
                    token_kata = hiragana_to_katakana(surface)
                    token_hira = katakana_to_hiragana(surface)
                    candidates = []
                    was_disambiguated = False
                else:
                    token_kata = reading
                    token_hira = katakana_to_hiragana(reading)
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
                
                # Derive phonetic reading for speech synthesis (VOICEVOX)
                # Particles は and へ are pronounced ワ and エ in standard Japanese phonetics
                if pos[0] == '助詞' and surface == 'は':
                    phonetic_kata = 'ワ'
                elif pos[0] == '助詞' and surface == 'へ':
                    phonetic_kata = 'エ'
                else:
                    phonetic_kata = token_kata

                # Apply allowed Kanji filtering to rendered surface
                rendered_surface = surface
                if filtering_active:
                    kanjis_in_unit = [c for c in surface if is_kanji(c)]
                    if kanjis_in_unit and not all(k in allowed_set for k in kanjis_in_unit):
                        alignment = align_token(surface, token_hira)
                        parts = []
                        for c, c_hira in alignment:
                            if is_kanji(c):
                                if c in allowed_set:
                                    parts.append(c)
                                else:
                                    parts.append(c_hira)
                            else:
                                parts.append(c)
                        rendered_surface = "".join(parts)
                
                dict_form = None
                try:
                    dict_form = u.dictionary_form()
                except Exception:
                    pass

                pos_tags = None
                try:
                    pos_tags = [p for p in u.part_of_speech() if p != '*']
                except Exception:
                    pass

                tokens.append(TokenReading(
                    surface=rendered_surface,
                    raw_surface=surface,
                    reading=token_kata,
                    hiragana=token_hira,
                    is_punctuation=is_punct,
                    candidates=candidates if len(candidates) > 1 else None,
                    disambiguated=was_disambiguated,
                    dictionary_form=dict_form or surface,
                    part_of_speech=pos_tags
                ))
                
                hiragana_parts.append(token_hira)
                katakana_parts.append(token_kata)
                tts_kana_parts.append(phonetic_kata)
            
        full_hiragana = "".join(hiragana_parts)
        full_katakana = "".join(katakana_parts)
        full_tts_kana = "".join(tts_kana_parts)
        rendered_original = "".join(t.surface for t in tokens) if filtering_active else sentence_str
        
        payloads.append(SentencePayload(
            id=idx,
            original=rendered_original,
            raw_original=sentence_str,
            hiragana=full_hiragana,
            katakana=full_katakana,
            tts_kana=full_tts_kana,
            translation="",
            tokens=tokens
        ))
        
    return payloads
