import unicodedata
import re

def normalize_japanese_text(text: str) -> str:
    """
    Normalizes Japanese text for morphological and phonetic processing:
    - Normalizes Unicode forms (NFKC for alphanumeric, symbols)
    - Normalizes Japanese punctuation marks and whitespace
    - Preserves Japanese hiragana, katakana, and kanji characters intact
    """
    if not text:
        return ""
    
    # 1. Normalize line breaks
    normalized = text.replace('\r\n', '\n').replace('\r', '\n')
    
    # 2. Normalize whitespace (full-width space to normal space or single spacing)
    # Replace non-breaking spaces and irregular spaces
    normalized = re.sub(r'[\u00A0\u200B\u200E\u200F\uFEFF]', '', normalized)
    
    # 3. Unicode NFKC normalization for ASCII and symbols
    # Note: NFKC also normalizes half-width katakana to full-width katakana (e.g. ｶ -> カ)
    normalized = unicodedata.normalize('NFKC', normalized)
    
    # 4. Standardize common Japanese punctuation variants
    # ~ and 〜 (wave dash / fullwidth tilde)
    normalized = normalized.replace('~', '〜')
    
    # Standardize quotation marks
    normalized = normalized.replace('“', '「').replace('”', '」')
    
    return normalized
