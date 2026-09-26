import logging
from typing import List, Optional, Tuple
from sudachipy import SplitMode
from pydantic import BaseModel

from .parser import get_tokenizer, katakana_to_hiragana, hiragana_to_katakana

logger = logging.getLogger("nihon-sentence-analysis")

class AnalyzedMorpheme(BaseModel):
    index: int
    surface: str
    start_char: int
    end_char: int
    lemma: str
    reading: str
    hiragana: str
    pos: List[str]
    inflection_type: Optional[str] = None
    inflection_form: Optional[str] = None
    normalized_form: Optional[str] = None

class AnalyzedCompound(BaseModel):
    surface: str
    start_char: int
    end_char: int
    lemma: str
    reading: str
    pos: List[str]
    a_morphemes: List[AnalyzedMorpheme]

class AnalyzedSentence(BaseModel):
    sentence: str
    morphemes_a: List[AnalyzedMorpheme]
    compounds_c: List[AnalyzedCompound]

def analyze_sentence(sentence: str) -> AnalyzedSentence:
    """
    Perform multi-granular Sudachi analysis on the sentence:
    - Retains Mode A morphemes with exact character offsets.
    - Retains Mode C compounds with exact character offsets.
    """
    tokenizer = get_tokenizer()

    # Mode C tokens
    c_tokens = tokenizer.tokenize(sentence, SplitMode.C)

    compounds_c: List[AnalyzedCompound] = []
    morphemes_a: List[AnalyzedMorpheme] = []

    current_char_idx = 0
    m_idx = 0

    for c in c_tokens:
        c_surf = c.surface()
        start_char = c.begin()
        end_char = c.end()

        c_reading = c.reading_form() or c_surf
        c_lemma = c.dictionary_form() or c_surf
        c_pos = [p for p in c.part_of_speech() if p != '*']

        # Mode A sub-tokens
        a_splits = c.split(SplitMode.A)
        units = a_splits if len(a_splits) > 0 else [c]
        sub_morphemes: List[AnalyzedMorpheme] = []

        for a in units:
            a_surf = a.surface()
            a_start = a.begin()
            a_end = a.end()

            a_reading = a.reading_form() or a_surf
            a_hira = katakana_to_hiragana(a_reading)
            a_lemma = a.dictionary_form() or a_surf
            a_norm = a.normalized_form() or a_surf
            a_pos = [p for p in a.part_of_speech() if p != '*']

            inf_type = None
            inf_form = None
            try:
                full_pos = a.part_of_speech()
                if len(full_pos) >= 5 and full_pos[4] != '*':
                    inf_type = full_pos[4]
                if len(full_pos) >= 6 and full_pos[5] != '*':
                    inf_form = full_pos[5]
            except Exception:
                pass

            morpheme = AnalyzedMorpheme(
                index=m_idx,
                surface=a_surf,
                start_char=a_start,
                end_char=a_end,
                lemma=a_lemma,
                reading=a_reading,
                hiragana=a_hira,
                pos=a_pos,
                inflection_type=inf_type,
                inflection_form=inf_form,
                normalized_form=a_norm
            )
            m_idx += 1
            sub_morphemes.append(morpheme)
            morphemes_a.append(morpheme)

        compounds_c.append(AnalyzedCompound(
            surface=c_surf,
            start_char=start_char,
            end_char=end_char,
            lemma=c_lemma,
            reading=c_reading,
            pos=c_pos,
            a_morphemes=sub_morphemes
        ))

    return AnalyzedSentence(
        sentence=sentence,
        morphemes_a=morphemes_a,
        compounds_c=compounds_c
    )
