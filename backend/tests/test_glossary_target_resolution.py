from types import SimpleNamespace

import pytest

from app import glossary
from app.candidate_resolver import resolve_candidates_at_span
from app.kanji_service import KanjiService
from app.schemas import GlossaryRequest


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
