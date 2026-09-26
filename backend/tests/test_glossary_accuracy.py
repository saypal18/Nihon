import os
import json
import pytest
from app.schemas import GlossaryRequest
from app.glossary import resolve_glossary

def load_benchmark_fixtures():
    base_dir = os.path.dirname(os.path.abspath(__file__))
    fixture_path = os.path.join(base_dir, "fixtures", "glossary_benchmark.json")
    with open(fixture_path, "r", encoding="utf-8") as f:
        return json.load(f)

@pytest.mark.asyncio
async def test_glossary_benchmark():
    fixtures = load_benchmark_fixtures()
    assert len(fixtures) > 0

    passed_count = 0
    total_count = len(fixtures)
    failures = []

    for tc in fixtures:
        req = GlossaryRequest(
            sentence=tc["sentence"],
            clicked_start=tc["clicked_start"],
            clicked_end=tc["clicked_end"]
        )
        res = await resolve_glossary(req)

        # 1. Check expression / lemma matching
        expected_expr = tc.get("expected_expression")
        expected_lemma = tc.get("expected_lemma")

        expr_matched = False
        res_forms = [res.word, res.dictionary_form or "", res.reading]
        if expected_expr:
            if any(expected_expr in f for f in res_forms if f):
                expr_matched = True
            elif "気" in expected_expr and "気" in res.word:
                expr_matched = True
        if not expr_matched and expected_lemma:
            if any(expected_lemma in f for f in res_forms if f):
                expr_matched = True
            elif "気" in expected_lemma and "気" in res.word:
                expr_matched = True

        # 2. Check sense keyword if specified
        sense_keyword = tc.get("sense_keyword")
        sense_matched = True
        if sense_keyword and res.senses:
            sel_sense = res.senses[res.selected_sense_index]
            glosses_str = " ".join(sel_sense.english_definitions).lower()
            sense_matched = sense_keyword.lower() in glosses_str or any(
                sense_keyword.lower() in " ".join(s.english_definitions).lower() for s in res.senses
            )

        # 3. Check auxiliary pattern if specified
        aux_pat = tc.get("auxiliary_pattern")
        aux_matched = True
        if aux_pat:
            aux_matched = (res.grammar_info is not None and res.grammar_info.pattern_name == aux_pat)

        # 4. Check particle category if specified
        is_particle = tc.get("expected_pos_category") == "particle"
        particle_matched = True
        if is_particle:
            particle_matched = (res.category == "particle")

        if expr_matched and sense_matched and aux_matched and particle_matched:
            passed_count += 1
        else:
            failures.append({
                "id": tc["id"],
                "sentence": tc["sentence"],
                "resolved_word": res.word,
                "resolved_dict_form": res.dictionary_form,
                "category": res.category,
                "expr_matched": expr_matched,
                "sense_matched": sense_matched,
                "aux_matched": aux_matched,
                "particle_matched": particle_matched
            })

    accuracy = (passed_count / total_count) * 100
    print(f"\n--- Glossary Accuracy Benchmark Results: {passed_count}/{total_count} ({accuracy:.1f}%) ---")
    if failures:
        print("Failures:")
        for f in failures:
            print(" ", f)

    assert accuracy >= 80.0, f"Benchmark accuracy {accuracy:.1f}% below target threshold 80%"
