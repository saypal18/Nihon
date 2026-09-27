import logging
from typing import Optional, Dict, Any, List
from .schemas import (
    GlossaryRequest,
    GlossaryResponse,
    GlossarySense,
    GrammarInfoSchema,
    InflectionInfoSchema,
    InflectionComponentSchema,
    KanjiDetailSchema,
    SubTokenSchema
)
from .candidate_resolver import resolve_candidates_at_span, CandidateExpression
from .dictionary_service import get_dictionary_service, DictionaryEntry
from .sense_ranker import rank_senses_for_candidate
from .kanji_service import get_kanji_service
from .parser import katakana_to_hiragana
from .sentence_analysis import analyze_sentence

logger = logging.getLogger("nihon-glossary")

_glossary_cache: Dict[str, GlossaryResponse] = {}

def kana_to_romaji(kana: str) -> str:
    """Rule-based Kana to Romaji converter for display in glossary header."""
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

async def resolve_glossary(req: GlossaryRequest) -> GlossaryResponse:
    """
    Resolve contextual glossary entry for a clicked span or fallback word.
    """
    sentence_text = req.sentence or req.sentence_context or ""
    clicked_start = req.clicked_start
    clicked_end = req.clicked_end

    cache_key = f"{sentence_text}_{clicked_start}_{clicked_end}_{req.selection_scope}_{req.word}_{req.dictionary_form}"
    if cache_key in _glossary_cache:
        return _glossary_cache[cache_key]

    kanji_service = get_kanji_service()
    dict_service = get_dictionary_service()

    # 1. Primary path: Resolve by character span within sentence
    if sentence_text and clicked_start is not None:
        if clicked_end is None:
            clicked_end = clicked_start + 1
        valid_click = 0 <= clicked_start < clicked_end <= len(sentence_text)
        resolution = (
            resolve_candidates_at_span(
                sentence_text,
                clicked_start,
                clicked_end,
                expand_context=req.selection_scope == "sentence",
            )
            if valid_click
            else None
        )
        if resolution:
            cand = resolution.primary
            return await _build_response_from_candidate(
                cand=cand,
                sentence=sentence_text,
                kanji_service=kanji_service,
                cache_key=cache_key
            )

    # 2. Exact-span fallback: never replace a clicked span with its surrounding token.
    has_valid_span = (
        sentence_text
        and clicked_start is not None
        and clicked_end is not None
        and 0 <= clicked_start < clicked_end <= len(sentence_text)
    )
    target_term = sentence_text[clicked_start:clicked_end] if has_valid_span else (req.word or "")
    target_reading = req.reading if req.word == target_term else None
    if has_valid_span:
        try:
            analyzed = analyze_sentence(sentence_text)
            overlapping = [
                m for m in analyzed.morphemes_a
                if m.start_char < clicked_end and m.end_char > clicked_start
            ]
            if overlapping and overlapping[0].start_char == clicked_start and overlapping[-1].end_char == clicked_end:
                target_reading = "".join(m.reading for m in overlapping)
        except Exception:
            logger.exception("Could not derive reading for clicked glossary span")

    # With legacy requests that have no span, retain the provided dictionary form.
    lookup_term = (req.dictionary_form or target_term) if not has_valid_span else target_term
    entries = dict_service.lookup_term(lookup_term, reading=target_reading)

    if entries:
        entry = entries[0]
        rank_res = await rank_senses_for_candidate(sentence_text, target_term, entry, use_llm=True)
        senses = [
            GlossarySense(
                english_definitions=s.glosses,
                parts_of_speech=s.parts_of_speech,
                tags=s.misc,
                info=s.info
            )
            for s in entry.senses
        ]
        hira_reading = katakana_to_hiragana(target_reading or entry.primary_reading or target_term)
        romaji = kana_to_romaji(hira_reading)
        kanji_details = [
            KanjiDetailSchema(
                kanji=k.kanji,
                meaning=k.meaning,
                onyomi=k.onyomi,
                kunyomi=k.kunyomi,
                jlpt_level=k.jlpt_level
            )
            for k in kanji_service.get_kanji_for_word(target_term)
        ]

        response = GlossaryResponse(
            word=target_term or entry.primary_kanji,
            dictionary_form=entry.primary_kanji,
            reading=hira_reading,
            romaji=romaji,
            senses=senses,
            selected_sense_index=rank_res.selected_sense_index,
            is_common=entry.is_common,
            context_explanation=rank_res.context_reason,
            resolved_span=[clicked_start, clicked_end] if has_valid_span else None,
            kanji_breakdown=kanji_details,
            confidence=rank_res.confidence,
            source="nihon_local"
        )
        _glossary_cache[cache_key] = response
        return response

    # 3. Not found fallback
    display_word = target_term or "Unknown"
    hira_reading = katakana_to_hiragana(target_reading or display_word)
    response = GlossaryResponse(
        word=display_word,
        dictionary_form=None if has_valid_span else req.dictionary_form,
        reading=hira_reading,
        romaji=kana_to_romaji(hira_reading),
        resolved_span=[clicked_start, clicked_end] if has_valid_span else None,
        senses=[
            GlossarySense(
                english_definitions=["No local dictionary definition found."],
                parts_of_speech=[]
            )
        ],
        source="nihon_local"
    )
    _glossary_cache[cache_key] = response
    return response

async def _build_response_from_candidate(
    cand: CandidateExpression,
    sentence: str,
    kanji_service: Any,
    cache_key: str
) -> GlossaryResponse:
    """Helper to assemble rich GlossaryResponse from CandidateExpression."""
    entry = None
    if cand.dict_entry and (
        cand.inflection is not None
        or (cand.category == "word" and cand.lemma != cand.surface)
    ):
        # An inflected component can share its written form with an unrelated
        # dictionary headword; the resolver's morphological lemma identifies it.
        entry = cand.dict_entry
    if entry is None and cand.surface:
        entries = get_dictionary_service().lookup_term(cand.surface, reading=cand.reading)
        if entries:
            entry = entries[0]
    if entry is None and cand.lemma and cand.lemma != cand.surface:
        entries = get_dictionary_service().lookup_term(cand.lemma, reading=cand.reading)
        if entries:
            entry = entries[0]
    if entry is None:
        entry = cand.dict_entry
    senses: List[GlossarySense] = []
    selected_idx = 0
    context_exp = None
    confidence = cand.confidence

    # If Grammatical Particle
    if cand.category == "particle" and cand.particle_info:
        p = cand.particle_info
        senses = [
            GlossarySense(
                english_definitions=[f"{p.function_name}: {p.context_role}"],
                parts_of_speech=["Particle (助詞)"],
                info=p.explanation
            )
        ]
        context_exp = p.context_role
        grammar_info = GrammarInfoSchema(
            pattern_name=p.particle,
            category="particle",
            meaning=p.function_name,
            explanation=p.explanation,
            context_role=p.context_role
        )
    # If Auxiliary Verb Pattern
    elif cand.category == "auxiliary" and cand.grammar_match:
        gm = cand.grammar_match
        pat = gm.pattern
        senses = [
            GlossarySense(
                english_definitions=[f"{pat.meaning} ({pat.pattern_name})"],
                parts_of_speech=["Auxiliary Verb Construction"],
                info=pat.explanation
            )
        ]
        # Include main verb senses if available
        if entry:
            for s in entry.senses:
                senses.append(GlossarySense(
                    english_definitions=s.glosses,
                    parts_of_speech=s.parts_of_speech,
                    info=f"Base meaning of {cand.dict_entry.primary_kanji if cand.dict_entry else ''}"
                ))

        grammar_info = GrammarInfoSchema(
            pattern_name=pat.pattern_name,
            category=pat.category,
            meaning=pat.meaning,
            explanation=pat.explanation,
            formation=pat.formation,
            level=pat.level
        )
        context_exp = f"{pat.meaning} — {pat.explanation}"
    # Standard Word, Idiom, Compound, or Name
    else:
        grammar_info = None
        if cand.grammar_match:
            pat = cand.grammar_match.pattern
            grammar_info = GrammarInfoSchema(
                pattern_name=pat.pattern_name,
                category=pat.category,
                meaning=pat.meaning,
                explanation=pat.explanation,
                formation=pat.formation,
                level=pat.level
            )
        if entry:
            rank_res = await rank_senses_for_candidate(sentence, cand.surface, entry, use_llm=True)
            selected_idx = rank_res.selected_sense_index
            context_exp = rank_res.context_reason
            confidence = min(cand.confidence, rank_res.confidence)
            senses = [
                GlossarySense(
                    english_definitions=s.glosses,
                    parts_of_speech=s.parts_of_speech,
                    tags=s.misc,
                    info=s.info
                )
                for s in entry.senses
            ]
        else:
            senses = [
                GlossarySense(
                    english_definitions=["No dictionary definition found."],
                    parts_of_speech=[]
                )
            ]

    # Inflection info
    inflection_info = None
    if cand.inflection:
        inf = cand.inflection
        inflection_info = InflectionInfoSchema(
            base_verb=inf.base_verb,
            verb_type=inf.verb_type,
            form_name=inf.form_name,
            description=inf.description,
            components=[
                InflectionComponentSchema(
                    surface=c.surface,
                    lemma=c.lemma,
                    role=c.role
                )
                for c in inf.components
            ]
        )

    # Sub-tokens
    sub_tokens = [
        SubTokenSchema(
            surface=st.surface,
            reading=st.reading,
            lemma=st.lemma,
            pos=st.pos,
            start_char=st.start_char,
            end_char=st.end_char
        )
        for st in cand.sub_tokens
    ]

    # Kanji breakdown
    kanji_details = [
        KanjiDetailSchema(
            kanji=k.kanji,
            meaning=k.meaning,
            onyomi=k.onyomi,
            kunyomi=k.kunyomi,
            jlpt_level=k.jlpt_level
        )
        for k in kanji_service.get_kanji_for_word(cand.lemma or cand.surface)
    ]

    hira_reading = katakana_to_hiragana(cand.reading or cand.surface)
    romaji = kana_to_romaji(hira_reading)

    response = GlossaryResponse(
        word=cand.surface,
        dictionary_form=entry.primary_kanji if entry else cand.lemma,
        reading=hira_reading,
        romaji=romaji,
        senses=senses,
        selected_sense_index=selected_idx,
        is_common=entry.is_common if entry else False,
        context_explanation=context_exp,
        resolved_span=list(cand.span),
        category=cand.category,
        grammar_info=grammar_info,
        inflection_info=inflection_info,
        kanji_breakdown=kanji_details,
        sub_tokens=sub_tokens,
        confidence=confidence,
        source="nihon_local"
    )

    _glossary_cache[cache_key] = response
    return response
