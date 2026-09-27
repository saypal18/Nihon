from types import SimpleNamespace

import pytest

from app import glossary
from app.candidate_resolver import (
    CandidateExpression,
    SubToken,
    _normalize_expression_candidates,
    resolve_candidates_at_span,
)
from app.dictionary_service import DictionaryEntry, DictionarySense
from app.kanji_service import KanjiService
from app.schemas import GlossaryRequest
from app.sentence_analysis import AnalyzedMorpheme, AnalyzedSentence


def test_same_mixed_pos_expression_has_consistent_category_across_resolver_paths():
    entry = DictionaryEntry(
        id=42,
        ent_seq="",
        primary_kanji="吾輩は猫である",
        primary_reading="わがはいはねこである",
        is_common=False,
        senses=[DictionarySense(sense_index=0, parts_of_speech=["n"], glosses=["title"])],
    )
    subtokens = [
        SubToken(surface="吾輩", reading="わがはい", lemma="吾輩", pos=["名詞"], start_char=0, end_char=2),
        SubToken(surface="は", reading="は", lemma="は", pos=["助詞"], start_char=2, end_char=3),
        SubToken(surface="猫", reading="ねこ", lemma="猫", pos=["名詞"], start_char=3, end_char=4),
        SubToken(surface="である", reading="である", lemma="である", pos=["助動詞"], start_char=4, end_char=7),
    ]
    candidates = [
        CandidateExpression(
            span=(0, 7), surface="吾輩は猫である", lemma=entry.primary_kanji,
            reading=entry.primary_reading, category="idiom", priority=1,
            confidence=0.95, dict_entry=entry, sub_tokens=subtokens,
        ),
        CandidateExpression(
            span=(0, 7), surface="吾輩は猫である", lemma=entry.primary_kanji,
            reading=entry.primary_reading, category="compound", priority=3,
            confidence=0.90, dict_entry=entry, sub_tokens=subtokens,
        ),
    ]

    normalized = _normalize_expression_candidates(candidates)

    assert len(normalized) == 1
    assert normalized[0].category == "idiom"


def test_nominal_expression_is_classified_as_compound():
    entry = DictionaryEntry(
        id=43,
        ent_seq="",
        primary_kanji="図書館",
        primary_reading="としょかん",
        is_common=True,
        senses=[DictionarySense(sense_index=0, parts_of_speech=["n"], glosses=["library"])],
    )
    candidate = CandidateExpression(
        span=(0, 3), surface="図書館", lemma="図書館", reading="トショカン",
        category="idiom", priority=1, confidence=0.95, dict_entry=entry,
        sub_tokens=[
            SubToken(surface="図書", reading="トショ", lemma="図書", pos=["名詞"], start_char=0, end_char=2),
            SubToken(surface="館", reading="カン", lemma="館", pos=["名詞"], start_char=2, end_char=3),
        ],
    )

    normalized = _normalize_expression_candidates([candidate])

    assert normalized[0].category == "compound"


def test_clicking_past_auxiliary_resolves_its_attached_predicate(monkeypatch):
    sentence = "どこで生れたかとんと見当がつかぬ。"
    verb = AnalyzedMorpheme(
        index=0, surface="生れ", start_char=3, end_char=5,
        lemma="生れる", reading="ウマレ", hiragana="うまれ",
        pos=["動詞", "一般"], inflection_type="下一段-ラ行",
        inflection_form="連用形-一般",
    )
    past = AnalyzedMorpheme(
        index=1, surface="た", start_char=5, end_char=6,
        lemma="た", reading="タ", hiragana="た",
        pos=["助動詞", "助動詞-タ"], inflection_type="助動詞-タ",
        inflection_form="終止形-一般",
    )
    question = AnalyzedMorpheme(
        index=2, surface="か", start_char=6, end_char=7,
        lemma="か", reading="カ", hiragana="か",
        pos=["助詞", "終助詞"],
    )
    analyzed = AnalyzedSentence(sentence=sentence, morphemes_a=[verb, past, question], compounds_c=[])
    verb_entry = DictionaryEntry(
        id=51, ent_seq="", primary_kanji="生れる", primary_reading="うまれる",
        is_common=True,
        senses=[DictionarySense(sense_index=0, parts_of_speech=["v1"], glosses=["to be born"])],
    )
    unrelated_ta_entry = DictionaryEntry(
        id=52, ent_seq="", primary_kanji="多", primary_reading="た",
        is_common=True,
        senses=[DictionarySense(sense_index=0, parts_of_speech=["n", "pref"], glosses=["multi-"])],
    )
    unrelated_taka_entry = DictionaryEntry(
        id=53, ent_seq="", primary_kanji="多寡", primary_reading="たか",
        is_common=True, matched_form="たか", matched_form_is_reading=True,
        senses=[DictionarySense(sense_index=0, parts_of_speech=["n"], glosses=["amount"])],
    )
    lookups = []

    class StubDictionary:
        def lookup_term(self, term, reading=None):
            lookups.append(term)
            return {
                "生れる": [verb_entry],
                "た": [unrelated_ta_entry],
                "たか": [unrelated_taka_entry],
            }.get(term, [])

    monkeypatch.setattr("app.candidate_resolver.analyze_sentence", lambda _sentence: analyzed)
    monkeypatch.setattr("app.candidate_resolver.get_dictionary_service", lambda: StubDictionary())
    monkeypatch.setattr("app.candidate_resolver.find_auxiliary_matches", lambda *_args: [])

    result = resolve_candidates_at_span(sentence, 5, 6)

    assert result is not None
    assert result.primary.surface == "生れた"
    assert result.primary.span == (3, 6)
    assert result.primary.dict_entry == verb_entry
    assert result.primary.inflection is not None
    assert "past tense" in result.primary.inflection.form_name.lower()
    assert "た" not in lookups


def test_reading_matched_dictionary_expression_keeps_full_morphological_span(monkeypatch):
    sentence = "どこで生れたかとんと見当がつかぬ。"
    first = AnalyzedMorpheme(
        index=0, surface="と", start_char=7, end_char=8,
        lemma="と", reading="ト", hiragana="と", pos=["助詞", "格助詞"],
    )
    second = AnalyzedMorpheme(
        index=1, surface="んと", start_char=8, end_char=10,
        lemma="んと", reading="ント", hiragana="んと", pos=["感動詞", "フィラー"],
    )
    analyzed = AnalyzedSentence(sentence=sentence, morphemes_a=[first, second], compounds_c=[])
    entry = DictionaryEntry(
        id=61, ent_seq="", primary_kanji="頓と", primary_reading="とんと",
        is_common=True, matched_form="とんと", matched_form_is_reading=True,
        senses=[DictionarySense(sense_index=0, parts_of_speech=["adv"], glosses=["not at all"])],
    )

    class StubDictionary:
        def lookup_term(self, term, reading=None):
            return [entry] if term == "とんと" else []

    monkeypatch.setattr("app.candidate_resolver.analyze_sentence", lambda _sentence: analyzed)
    monkeypatch.setattr("app.candidate_resolver.get_dictionary_service", lambda: StubDictionary())
    monkeypatch.setattr("app.candidate_resolver.find_auxiliary_matches", lambda *_args: [])

    result = resolve_candidates_at_span(sentence, 8, 10)

    assert result is not None
    assert result.primary.surface == "とんと"
    assert result.primary.span == (7, 10)
    assert result.primary.dict_entry == entry


def test_sentence_selection_resolves_full_inflection(monkeypatch):
    monkeypatch.setattr(
        "app.candidate_resolver.get_dictionary_service",
        lambda: SimpleNamespace(lookup_term=lambda term, reading=None: []),
    )

    result = resolve_candidates_at_span("分からない", 0, 1)

    assert result is not None
    assert result.primary.surface == "分からない"
    assert result.primary.reading == "ワカラナイ"


def test_component_selection_stays_within_clicked_span(monkeypatch):
    monkeypatch.setattr(
        "app.candidate_resolver.get_dictionary_service",
        lambda: SimpleNamespace(lookup_term=lambda term, reading=None: []),
    )

    result = resolve_candidates_at_span("分からない", 0, 3, expand_context=False)

    assert result is not None
    assert result.primary.span == (0, 3)
    assert result.primary.surface == "分から"
    assert result.primary.reading == "ワカラ"


def test_exact_token_selection_stays_within_clicked_span(monkeypatch):
    monkeypatch.setattr(
        "app.candidate_resolver.get_dictionary_service",
        lambda: SimpleNamespace(lookup_term=lambda term, reading=None: []),
    )

    request = GlossaryRequest(
        sentence="分からない",
        clicked_start=0,
        clicked_end=3,
        selection_scope="exact",
        word="分から",
    )
    result = resolve_candidates_at_span(
        request.sentence,
        request.clicked_start,
        request.clicked_end,
        expand_context=request.selection_scope == "sentence",
    )

    assert result is not None
    assert result.primary.span == (0, 3)
    assert result.primary.surface == "分から"


@pytest.mark.parametrize(
    ("start", "end", "surface"),
    [(0, 2, "書き"), (2, 4, "留め")],
)
def test_compound_component_selection_returns_only_clicked_component(monkeypatch, start, end, surface):
    monkeypatch.setattr(
        "app.candidate_resolver.get_dictionary_service",
        lambda: SimpleNamespace(lookup_term=lambda term, reading=None: []),
    )

    result = resolve_candidates_at_span("書き留め", start, end, expand_context=False)

    assert result is not None
    assert result.primary.span == (start, end)
    assert result.primary.surface == surface


@pytest.mark.asyncio
async def test_unresolved_span_fallback_uses_exact_span_not_outer_token(monkeypatch):
    lookups = []

    class EmptyDictionary:
        def lookup_term(self, term, reading=None):
            lookups.append((term, reading))
            return []

    class EmptyKanji:
        def get_kanji_for_word(self, word):
            return []

    monkeypatch.setattr(glossary, "resolve_candidates_at_span", lambda *args, **kwargs: None)
    monkeypatch.setattr(glossary, "get_dictionary_service", lambda: EmptyDictionary())
    monkeypatch.setattr(glossary, "get_kanji_service", lambda: EmptyKanji())
    monkeypatch.setattr(
        glossary,
        "analyze_sentence",
        lambda sentence: SimpleNamespace(
            morphemes_a=[SimpleNamespace(start_char=1, end_char=2, reading="ビー")]
        ),
    )
    glossary._glossary_cache.clear()

    response = await glossary.resolve_glossary(
        GlossaryRequest(
            sentence="ABC",
            clicked_start=1,
            clicked_end=2,
            selection_scope="component",
            word="outer-token",
            dictionary_form="outer-lemma",
            reading="outer-reading",
        )
    )

    assert response.word == "B"
    assert response.reading == "びー"
    assert lookups == [("B", "ビー")]


def test_kanji_service_reads_level_from_canonical_dataset():
    details = KanjiService().get_kanji_details("分")

    assert details is not None
    assert details.jlpt_level == "N5"
