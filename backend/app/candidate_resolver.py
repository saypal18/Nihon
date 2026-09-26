import logging
from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel

from .sentence_analysis import analyze_sentence, AnalyzedMorpheme, AnalyzedCompound, AnalyzedSentence
from .dictionary_service import get_dictionary_service, DictionaryEntry
from .grammar_registry import find_auxiliary_matches, get_particle_info, GrammarMatch, ParticleInfo
from .inflection import analyze_inflection_chain, InflectionAnalysis

logger = logging.getLogger("nihon-candidate-resolver")

class SubToken(BaseModel):
    surface: str
    reading: str
    lemma: str
    pos: List[str]
    start_char: int
    end_char: int

class CandidateExpression(BaseModel):
    span: Tuple[int, int]
    surface: str
    lemma: str
    reading: str
    category: str  # "idiom", "auxiliary", "compound", "word", "particle", "name"
    priority: int  # 1 (highest) to 6 (lowest)
    confidence: float
    dict_entry: Optional[DictionaryEntry] = None
    grammar_match: Optional[GrammarMatch] = None
    particle_info: Optional[ParticleInfo] = None
    inflection: Optional[InflectionAnalysis] = None
    sub_tokens: List[SubToken] = []

class ResolutionResult(BaseModel):
    primary: CandidateExpression
    alternatives: List[CandidateExpression] = []
    sentence_analyzed: AnalyzedSentence

def resolve_candidates_at_span(
    sentence: str,
    clicked_start: int,
    clicked_end: int,
    expand_context: bool = True
) -> Optional[ResolutionResult]:
    """
    Resolve candidate lexical and grammatical interpretations for a clicked character span.
    """
    analyzed = analyze_sentence(sentence)
    morphemes = analyzed.morphemes_a
    if not morphemes:
        return None

    # Normalize span
    if clicked_start == clicked_end:
        clicked_end = clicked_start + 1

    # 1. Identify overlapping Mode A morphemes
    clicked_indices = []
    for idx, m in enumerate(morphemes):
        if not (m.end_char <= clicked_start or m.start_char >= clicked_end):
            clicked_indices.append(idx)

    if not clicked_indices:
        return None

    anchor_idx = clicked_indices[0]
    dict_service = get_dictionary_service()
    candidates: List[CandidateExpression] = []

    # Pre-compute auxiliary verb constructions across sentence
    aux_matches = find_auxiliary_matches(morphemes, sentence)

    # 2. Check Idiomatic Multi-Word Expressions (1 to 5 tokens around anchor)
    n_morphemes = len(morphemes)
    mode_c_spans = {
        (comp.start_char, comp.end_char)
        for comp in analyzed.compounds_c
        if len(comp.a_morphemes) > 1
    }
    min_i = max(0, anchor_idx - 3)
    max_i = min(n_morphemes, anchor_idx + 4)

    for i in range(min_i, anchor_idx + 1):
        for j in range(anchor_idx + 1, max_i + 1):
            if j - i <= 1:
                continue  # Single tokens handled separately
            span_morphemes = morphemes[i:j]
            span_surf = "".join(m.surface for m in span_morphemes)
            span_start = span_morphemes[0].start_char
            span_end = span_morphemes[-1].end_char
            if not expand_context and (span_start < clicked_start or span_end > clicked_end):
                continue

            # Also try lemma sequence (e.g. 気 + を + つける -> 気をつける)
            lemma_combo = "".join(m.surface if m != span_morphemes[-1] else m.lemma for m in span_morphemes)

            entries = dict_service.lookup_term(span_surf)
            matched_term = span_surf
            if not entries and lemma_combo != span_surf:
                entries = dict_service.lookup_term(lemma_combo)
                matched_term = lemma_combo

            # Check polite prefix removal (e.g. お世話になる -> 世話になる)
            if not entries and span_surf.startswith("お") and len(span_surf) > 2:
                unprefixed = span_surf[1:]
                entries = dict_service.lookup_term(unprefixed)
                if not entries and lemma_combo.startswith("お"):
                    entries = dict_service.lookup_term(lemma_combo[1:])
                if entries:
                    matched_term = entries[0].primary_kanji or unprefixed

            if entries:
                entry = entries[0]
                # A reading-only hit is weak evidence that adjacent morphemes form
                # one expression. Keep it only when the same span is recognized as
                # a compound by Sudachi, or when the matched spelling is the entry's
                # own written form (which also supports kana-only dictionary words).
                has_morphological_span = (span_start, span_end) in mode_c_spans
                has_written_form_match = (
                    not entry.matched_form_is_reading
                    or entry.primary_kanji == span_surf
                )
                if not has_morphological_span and not has_written_form_match:
                    continue

                sub_toks = [
                    SubToken(
                        surface=m.surface,
                        reading=m.reading,
                        lemma=m.lemma,
                        pos=m.pos,
                        start_char=m.start_char,
                        end_char=m.end_char
                    )
                    for m in span_morphemes
                ]

                # Check if this expression also matches an auxiliary construction
                matching_aux = None
                for aux in aux_matches:
                    if not (aux.end_char <= span_start or aux.start_char >= span_end):
                        matching_aux = aux
                        break

                inflection = analyze_inflection_chain(span_morphemes) if len(span_morphemes) > 1 else None

                candidates.append(CandidateExpression(
                    span=(span_start, span_end),
                    surface=span_surf,
                    lemma=entry.primary_kanji or matched_term,
                    reading=(
                        "".join(m.reading for m in span_morphemes)
                        if inflection
                        else entry.primary_reading or "".join(m.reading for m in span_morphemes)
                    ),
                    category="name" if entry.is_name else "idiom",
                    priority=3 if entry.is_name else 1,
                    confidence=0.95,
                    dict_entry=entry,
                    grammar_match=matching_aux,
                    inflection=inflection,
                    sub_tokens=sub_toks
                ))
    for aux in aux_matches:
        if not expand_context and (aux.start_char < clicked_start or aux.end_char > clicked_end):
            continue
        if not (aux.end_char <= clicked_start or aux.start_char >= clicked_end):
            # The click landed in this construction
            main_verb_entries = dict_service.lookup_term(aux.main_verb_lemma) if aux.main_verb_lemma else []
            dict_ent = main_verb_entries[0] if main_verb_entries else None

            # Extract inflection for the auxiliary chain
            relevant_morphemes = [
                m for m in morphemes
                if m.start_char >= aux.start_char and m.end_char <= aux.end_char
            ]
            inflection = analyze_inflection_chain(relevant_morphemes)

            sub_toks = [
                SubToken(
                    surface=m.surface,
                    reading=m.reading,
                    lemma=m.lemma,
                    pos=m.pos,
                    start_char=m.start_char,
                    end_char=m.end_char
                )
                for m in relevant_morphemes
            ]

            candidates.append(CandidateExpression(
                span=(aux.start_char, aux.end_char),
                surface=aux.matched_text,
                lemma=f"{aux.main_verb_lemma or ''}{aux.pattern.pattern_name.replace('〜', '')}",
                reading="".join(m.reading for m in relevant_morphemes),
                category="auxiliary",
                priority=2,
                confidence=0.92,
                dict_entry=dict_ent,
                grammar_match=aux,
                inflection=inflection,
                sub_tokens=sub_toks
            ))

    # 4. Check Mode C Compounds
    for comp in analyzed.compounds_c:
        if not expand_context and (comp.start_char < clicked_start or comp.end_char > clicked_end):
            continue
        if not (comp.end_char <= clicked_start or comp.start_char >= clicked_end):
            if len(comp.a_morphemes) > 1:
                entries = dict_service.lookup_term(comp.surface)
                if not entries and comp.lemma != comp.surface:
                    entries = dict_service.lookup_term(comp.lemma)
                if entries:
                    entry = entries[0]
                    sub_toks = [
                        SubToken(
                            surface=m.surface,
                            reading=m.reading,
                            lemma=m.lemma,
                            pos=m.pos,
                            start_char=m.start_char,
                            end_char=m.end_char
                        )
                        for m in comp.a_morphemes
                    ]
                    candidates.append(CandidateExpression(
                        span=(comp.start_char, comp.end_char),
                        surface=comp.surface,
                        lemma=comp.lemma,
                        reading=comp.reading,
                        category="name" if entry.is_name else "compound",
                        priority=3,
                        confidence=0.90,
                        dict_entry=entry,
                        sub_tokens=sub_toks
                    ))

    # 5. Check Single Mode A Morphemes
    for c_idx in clicked_indices:
        m = morphemes[c_idx]
        if not expand_context and (m.start_char < clicked_start or m.end_char > clicked_end):
            continue
        pos0 = m.pos[0] if m.pos else ""

        # Check if Particle
        if pos0 == "助詞":
            p_info = get_particle_info(m.surface, sentence)
            entries = dict_service.lookup_term(m.surface)
            candidates.append(CandidateExpression(
                span=(m.start_char, m.end_char),
                surface=m.surface,
                lemma=m.lemma,
                reading=m.reading,
                category="particle",
                priority=5,
                confidence=0.95,
                dict_entry=entries[0] if entries else None,
                particle_info=p_info,
                sub_tokens=[]
            ))
        else:
            # Check dictionary entry
            entries = dict_service.lookup_term(m.lemma)
            if not entries and m.surface != m.lemma:
                entries = dict_service.lookup_term(m.surface)

            entry = entries[0] if entries else None
            is_name = entry.is_name if entry else False

            # Check if this morpheme is a verb with inflections attached
            # (e.g. 食べさせられた or 食べた or 行かなかった)
            pred_morphemes = [m]
            if expand_context:
                for j in range(c_idx + 1, min(c_idx + 5, n_morphemes)):
                    next_m = morphemes[j]
                    next_pos = next_m.pos[0] if next_m.pos else ""
                    if next_pos in ["助動詞", "接尾辞"] or next_m.lemma in ["ない", "た", "ます", "れる", "られる", "せる", "させる"]:
                        pred_morphemes.append(next_m)
                    else:
                        break

            has_single_morpheme_inflection = bool(m.inflection_form)
            inflection = (
                analyze_inflection_chain(pred_morphemes)
                if len(pred_morphemes) > 1 or has_single_morpheme_inflection
                else None
            )
            span_start = pred_morphemes[0].start_char
            span_end = pred_morphemes[-1].end_char
            full_surface = sentence[span_start:span_end]

            sub_toks = [
                SubToken(
                    surface=pm.surface,
                    reading=pm.reading,
                    lemma=pm.lemma,
                    pos=pm.pos,
                    start_char=pm.start_char,
                    end_char=pm.end_char
                )
                for pm in pred_morphemes
            ] if len(pred_morphemes) > 1 else []

            candidates.append(CandidateExpression(
                span=(span_start, span_end),
                surface=full_surface if inflection else m.surface,
                lemma=m.lemma,
                reading="".join(pm.reading for pm in pred_morphemes),
                category="name" if is_name else "word",
                priority=4 if not is_name else 3,
                confidence=0.88,
                dict_entry=entry,
                inflection=inflection,
                sub_tokens=sub_toks
            ))

    if not candidates:
        return None

    # Sort candidates: lower priority number first, then larger span, then higher confidence
    candidates.sort(key=lambda c: (c.priority, -(c.span[1] - c.span[0]), -c.confidence))

    primary = candidates[0]
    alternatives = candidates[1:]

    return ResolutionResult(
        primary=primary,
        alternatives=alternatives,
        sentence_analyzed=analyzed
    )
