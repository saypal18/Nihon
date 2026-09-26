# Nihon Japanese Contextual Glossary
## Refined Implementation Plan

## 1. Goal

Transform the current glossary from:

```text
clicked token
    ↓
Jisho lookup
    ↓
first dictionary result
    ↓
free-form LLM explanation
```

into:

```text
clicked character span
        ↓
sentence analysis
        ↓
candidate lexical / grammatical spans
        ↓
canonical dictionary candidates
        ↓
deterministic filtering
        ↓
contextual sense ranking
        ↓
learner-oriented glossary
```

The governing principle is:

> Resolve what the learner clicked and what that expression means in this sentence before presenting dictionary information.

The current implementation does not retain enough information to do that reliably because Mode C is immediately split into Mode A and only the individual token is sent to the glossary endpoint.

---

# 2. Final Architecture

```text
                         USER CLICKS
                              │
                              ▼
                 character start/end offsets
                              │
                              ▼
                  ┌──────────────────────┐
                  │ Sentence Analyzer    │
                  │                      │
                  │ Sudachi A/B/C        │
                  │ morphology           │
                  │ readings             │
                  │ normalized forms     │
                  └──────────┬───────────┘
                             │
                     cached sentence graph
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Candidate Resolver   │
                  │                      │
                  │ compounds            │
                  │ phrases              │
                  │ idioms               │
                  │ grammar patterns     │
                  │ particles            │
                  │ proper names         │
                  └──────────┬───────────┘
                             │
                     lexical candidates
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Local Dictionary     │
                  │                      │
                  │ JMdict               │
                  │ JMnedict             │
                  │ Jitendex enrichment  │
                  └──────────┬───────────┘
                             │
                       candidate senses
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Context Filter       │
                  │                      │
                  │ POS                  │
                  │ inflection           │
                  │ reading              │
                  │ grammar              │
                  │ collocations         │
                  │ dependencies         │
                  └──────────┬───────────┘
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Sense Ranker         │
                  │                      │
                  │ deterministic score │
                  │ semantic similarity  │
                  │ optional LLM         │
                  └──────────┬───────────┘
                             │
                     selected interpretation
                             │
                             ▼
                  ┌──────────────────────┐
                  │ Enrichment           │
                  │                      │
                  │ furigana             │
                  │ grammar              │
                  │ kanji                │
                  │ pitch/audio          │
                  │ examples             │
                  └──────────┬───────────┘
                             │
                             ▼
                     Glossary Sidebar
```

---

# 3. Phase 0 — Build an Accuracy Benchmark First

Before changing the implementation, create a small gold-standard test set.

This is important because several proposed changes are architectural hypotheses and should not be accepted merely because they sound reasonable.

Create approximately 200–500 manually reviewed test cases covering:

### Simple vocabulary

```text
食べる
飲む
学校
先生
```

### Polysemous words

```text
かける
取る
つける
見る
上げる
出る
```

### Inflected forms

```text
食べました
行かなかった
見られませんでした
食べさせられた
```

### Compounds

```text
図書館
選挙管理委員会
高輪ゲートウェイ駅
```

### Multi-word expressions

```text
気をつける
世話になる
目を通す
```

### Auxiliary constructions

```text
見てもらいました
食べてしまった
行ってくれた
```

### Particles

```text
は
が
を
に
で
へ
と
```

### Names

```text
田中
東京
```

Each example should have:

```text
sentence
clicked character span
expected expression
expected lemma
expected reading
expected POS
expected selected sense
expected grammatical interpretation
```

This benchmark becomes the authority for deciding whether each architectural change actually improves the product.

---

# 4. Phase 1 — Fix Sentence Representation

## 4.1 Preserve all Sudachi granularities

The current parser runs Mode C and then immediately splits it into Mode A except for a small hardcoded heteronym list.

Change this.

For every sentence retain:

```text
Mode C tokens
Mode B tokens
Mode A morphemes
```

and map them using character offsets.

Sudachi explicitly supports multi-granular tokenization and exposes dictionary form, reading, normalized form and POS/inflection information.

Do not choose one mode as "the correct tokenization."

All three are useful for different jobs.

### Example

```text
選挙管理委員会
```

Potential analyses:

```text
C:
選挙管理委員会

B:
選挙
管理
委員会

A:
選挙
管理
委員
会
```

The click resolver can then choose the lexical interpretation appropriate to the dictionary.

---

# 5. Phase 2 — Change Click Handling

Do not make the frontend's Mode A token the authoritative glossary target.

The frontend should send:

```text
sentence
clicked character start
clicked character end
```

Optionally also send:

```text
frontend token index
```

as a convenience/debug field.

The backend should be responsible for canonical sentence analysis.

This avoids the current frontend/backend dependency where `SentenceBlock.tsx` passes a single token and `GlossarySidebar` simply looks up that token.

### Why character offsets are better

Suppose the user clicks:

```text
気
```

inside:

```text
気をつけてください
```

The backend can then ask:

> Which lexical expressions containing this character are valid dictionary/grammar candidates?

rather than:

> What does the Mode A token 気 mean?

---

# 6. Phase 3 — Candidate Span Resolver

This is the most important new component.

Create:

```text
candidate_resolver.py
```

It produces candidates from several sources.

## 6.1 Single token

Always consider the clicked morpheme.

## 6.2 Mode B/C spans

Consider larger Sudachi units overlapping the clicked character span.

## 6.3 Adjacent lexical spans

Generate larger spans only up to a controlled maximum.

Do not blindly combine an arbitrary number of neighboring tokens.

## 6.4 Dictionary-driven phrase matching

Given the sentence:

```text
気をつけてください
```

generate:

```text
気
気を
気をつける
```

and query the lexical/expression index.

If:

```text
気をつける
```

exists as a lexical expression, it becomes a high-priority candidate.

## 6.5 Grammar-construction matching

Recognize patterns such as:

```text
〜ている
〜てしまう
〜てもらう
〜てくれる
〜てあげる
〜ことになる
〜ようになる
```

but only when the token sequence actually satisfies the corresponding morphological pattern.

---

# 7. Expression Candidate Priority

Use a ranking hierarchy:

```text
1. Exact idiom / fixed expression
2. Exact grammar construction
3. Dictionary compound
4. Lexicalized multi-token expression
5. Single dictionary word
6. Individual grammatical morpheme
```

This hierarchy generates candidate priority.

It should not automatically override context.

For example, a larger span should win because it is a valid lexical expression, not merely because it has more characters.

---

# 8. Phase 4 — Local Lexical Database

Remove live Jisho lookup from the main runtime path.

The current implementation makes a live request to Jisho and takes the first returned result.

Replace it with an application-owned read-only SQLite database.

## Recommended source strategy

### Core lexical source

Use:

```text
JMdict
JMnedict
```

JMdict is maintained as a continuously updated lexical database, with current distributions generated regularly.

### Enrichment

Use Jitendex data where appropriate.

Jitendex currently adds/organizes information beyond the basic JMdict presentation, including:

- example sentences
- usage notes
- etymology
- cross-references
- antonyms
- language-of-origin information
- definition notes

and its current distribution supports Yomitan and MDict.

### Important architectural correction

Do **not** assume:

```text
jamdict = Jitendex database
```

Jamdict is a library around JMdict, KANJIDIC2, JMnedict and related resources.

Instead:

```text
JMdict / JMdict-NG
JMnedict
Jitendex enrichment
JmdictFurigana
KANJIDIC2
Tatoeba
       ↓
Nihon's normalized SQLite database
```

A small custom SQLite layer is preferable because the glossary needs specialized indexes for:

```text
expression
reading
lemma
normalized form
POS
dictionary entry
sense
search aliases
source
```

---

# 9. JMdict Versioning

There is an important 2026 change that should be accounted for now.

JMdict's **New Generation** format began parallel distribution in May 2026, with changes to the internal structure and especially cross-reference representation.

Therefore create a source adapter:

```text
JMdict Legacy
       │
       ├──────►
       │
JMdict NG
       │
       └──────►
        Unified Nihon schema
```

Do not let the rest of the application depend on raw JMdict XML structure.

Store:

```text
source_name
source_version
source_release_date
```

for every build.

---

# 10. Jisho's Role After Migration

Jisho should not be used as a production fallback for ordinary missing words.

Instead:

```text
Primary:
Nihon local dictionary

Missing:
upstream data update / unknown result

Optional development tool:
Jisho lookup for diagnostics
```

This makes the application's output deterministic and reproducible.

It also avoids having today's dictionary answer differ from tomorrow's answer because an external service changed.

---

# 11. Phase 5 — Proper Names

Search the normal lexicon and name lexicon separately.

Use:

```text
JMdict
JMnedict
```

and Sudachi's proper-name information.

Return an explicit classification:

```text
COMMON_WORD
PROPER_NAME
PLACE_NAME
PERSON_NAME
ORGANIZATION_NAME
UNKNOWN
```

Do not rely on a single dictionary search to determine this.

---

# 12. Phase 6 — Grammar Registry

The proposed `grammar_registry.py` is a good idea, but change its role.

It should be a:

> **Grammar Candidate Registry**

not a:

> **Grammar Override Registry**

It should contain:

```text
pattern
required POS sequence
optional variants
meaning
learner explanation
examples
priority
```

For example:

```text
〜てもらう

pattern:
Verb-TE + もらう

meaning:
receive the favor of someone doing X

```

Then the resolver decides whether the current sentence actually matches that pattern.

---

# 13. Particles

Particles can be handled more deterministically than ordinary lexical senses.

For:

```text
宿題をする
```

Sudachi identifies:

```text
を = 助詞-格助詞
```

The glossary can therefore use a curated grammatical entry rather than the normal dictionary definitions.

The result can say:

```text
を

Particle

Marks the direct object of the verb.

Here:
宿題を
→ 宿題 is the object of する
```

However, the grammar explanation should still use sentence context where the particle has multiple functions.

Do not implement every particle as one fixed English definition.

---

# 14. Auxiliary Constructions

Treat auxiliary constructions as compositional structures.

For:

```text
見てもらいました
```

do not reduce everything to:

```text
見る = to see
```

Instead resolve:

```text
見る
+
て-form
+
もらう
+
polite
+
past
```

and identify the construction:

```text
〜てもらう
```

as:

```text
receive the favor/benefit of someone doing something
```

The final explanation should distinguish:

```text
lexical meaning:
見る = see/look/check

construction:
〜てもらう = have/receive the favor of someone doing X

observed form:
見てもらいました = polite past
```

---

# 15. Phase 7 — Inflection

Do not generate a conjugation chain by manually constructing every intermediate surface form from the lemma.

Sudachi already provides dictionary form, reading and detailed inflection features.

The first implementation should therefore represent:

```text
surface:
食べました

lemma:
食べる

features:
polite
past

verb class:
ichidan
```

Then the UI can display:

```text
食べる
↓
食べました

polite + past form
```

For multi-morpheme constructions:

```text
見てもらいました
```

show the actual analyzed components rather than fabricating a synthetic derivation.

If a full step-by-step chain is later desired, build it from a tested conjugation engine or validated grammatical transformations.

---

# 16. Phase 8 — Context Filtering

Before using any neural model, eliminate impossible dictionary candidates.

Apply:

### Reading compatibility

Does the candidate allow the observed reading?

### POS compatibility

Does the candidate match the observed POS?

### Morphology compatibility

Does the candidate accept the observed conjugation?

### Spelling compatibility

Is this kanji/kana spelling valid for the entry?

### Restriction compatibility

Does JMdict restrict the sense to a particular expression/reading?

### Name classification

Is this a common noun or proper name?

This should produce a small candidate set.

---

# 17. Phase 9 — Contextual Sense Ranking

This is where the original plan needs its biggest refinement.

The existing proposal says:

```text
candidate senses
    ↓
Ollama
    ↓
selected sense index
```

That is directionally correct, but it should not be the only ranking mechanism.

Japanese WSD research demonstrates that contextual Transformer models can distinguish senses, including a recent large-scale Japanese system trained on manually sense-annotated BCCWJ data; however, reported accuracy still varies substantially by domain (68.2–91.8%).

Another Japanese study found Sentence-BERT combined with dictionary sense definitions effective for sense-level semantic comparison.

Therefore use a cascade.

---

# 18. Recommended Sense-Ranking Cascade

## Stage A — deterministic score

Use:

```text
POS compatibility
reading compatibility
inflection compatibility
grammar compatibility
expression restrictions
```

These receive the highest weight.

## Stage B — lexical/context score

Use:

```text
neighbor words
collocations
particle relationships
common usage patterns
dictionary examples
frequency
```

## Stage C — semantic embedding score

Represent:

```text
sentence context
```

and:

```text
candidate dictionary sense / definition
```

in a common semantic space.

Rank by similarity.

A Sentence-BERT-style approach is worth testing because Japanese research has demonstrated the usefulness of dictionary-definition semantic matching.

## Stage D — local LLM reranker

Only when the top candidates remain close:

```text
Candidate A
Candidate B
Candidate C
```

send them to Ollama.

The model is asked to choose/rank **only these candidates**.

It must not generate a new dictionary sense.

---

# 19. LLM Output Contract

The model should conceptually return:

```text
selected_candidate
confidence
brief_contextual_reason
```

not:

```text
dictionary_definition
```

The dictionary definition remains the canonical source.

This preserves the architectural rule already present in the proposed plan:

> The LLM explains/ranks dictionary facts; it does not become the dictionary.

---

# 20. Add Abstention

This is a major improvement to the current proposal.

The system should be allowed to say:

```text
Ambiguous in this context.
```

when confidence is low.

Do not force:

```text
Top-1 = correct
```

every time.

Internally maintain:

```text
resolution_confidence
sense_confidence
expression_confidence
```

For example:

```text
かける

Sense:
make a phone call

confidence:
0.96
```

versus:

```text
かける

Sense:
hang / suspend

confidence:
0.57
```

The UI can still show the highest-ranked interpretation while keeping alternative meanings visible.

---

# 21. GiNZA Decision — Revised

The current implementation plan says:

> omit GiNZA and replace it completely with Sudachi POS heuristics.

I would change that.

### Do not install GiNZA as a hard requirement for MVP.

But also:

### Do not remove dependency parsing from the architecture.

GiNZA v5.2.1 is current as of September 2026, and its Transformer models provide explicit dependency parsing. Its published evaluation reports approximately:

```text
ja_ginza:
LAS 89.2
UAS 91.1

ja_ginza_electra:
LAS 92.3
UAS 93.7

ja_ginza_bert_large:
LAS 93.8
UAS 94.9
```

on its specified UD Japanese evaluation setup.

Those numbers demonstrate that dependency information is materially different from simple POS rules.

Your existing claim that GiNZA provides "minimal practical accuracy gain" is therefore too strong.

---

# 22. Recommended GiNZA Strategy

Implement a syntax abstraction:

```text
SyntaxProvider
```

with:

```text
SudachiHeuristicSyntaxProvider
GiNZASyntaxProvider
```

### Default MVP

```text
Sudachi heuristics
```

### Low-confidence fallback

```text
GiNZA
```

For example:

```text
candidate ranking confidence > threshold
        ↓
no GiNZA required
```

but:

```text
ambiguous:
かける
取る
つける
見る

        ↓

run GiNZA
        ↓
rerank
```

This gives you most of the performance benefit of the lightweight design while retaining a path to better accuracy.

---

# 23. Why Syntax Should Be a Feature, Not the Whole Resolver

Even perfect dependency parsing does not solve dictionary sense ambiguity.

The complete signal is:

```text
morphology
+
syntax
+
lexical expression
+
collocation
+
semantic context
```

Therefore GiNZA should contribute one feature group, not become the core glossary engine.

---

# 24. Phase 10 — Examples

The proposed plan currently puts Tatoeba mostly into Phase 2.

I would move **example data ingestion into the dictionary build pipeline earlier**, even if example display starts later.

Jitendex already incorporates example sentences and other supplemental information.

Tatoeba's textual data are available under CC BY 2.0 FR, with some sentences under CC0, so attribution/provenance needs to be retained.

Store:

```text
example
translation
source
author/license metadata
associated lexical entry
```

Then examples become both:

```text
UI content
```

and:

```text
sense-ranking evidence
```

---

# 25. Phase 11 — Kanji Enrichment

The existing repository already contains:

```text
kanji_correct_order.csv
kanjidic2.xml.gz
```

so this should be straightforward to integrate.

Use the current Jōyō dataset for the initial learner UI.

Display:

```text
勉強

勉
reading
meaning

強
reading
meaning
```

But make clear:

> kanji meaning ≠ compound-word meaning.

For:

```text
勉強
```

do not imply that combining the English meanings of 勉 and 強 gives the definition of 勉強.

---

# 26. Phase 12 — Furigana

Keep the existing alignment algorithm initially.

The application already has a character/reading alignment system.

Do not replace functioning code merely to introduce another dependency.

JmdictFurigana can become the preferred source for dictionary-headword ruby alignment when available, with your current algorithm remaining the fallback.

Recommended order:

```text
JmdictFurigana
      ↓
existing Nihon alignment
      ↓
simple whole-word reading
```

---

# 27. Phase 13 — Pronunciation

Keep VOICEVOX.

The current application already has working local pronunciation support.

Pitch accent should be an enrichment feature, not part of core lookup correctness.

Therefore:

```text
Core:
word + reading + meaning

Optional enrichment:
pitch
audio
```

---

# 28. Final Backend Modules

Recommended structure:

```text
backend/app/

parser.py
    └── sentence morphological analysis

sentence_analysis.py
    └── cached A/B/C analysis + offsets

candidate_resolver.py
    └── lexical/phrase/grammar candidate generation

dictionary_service.py
    └── local SQLite dictionary access

grammar_registry.py
    └── grammar construction definitions/patterns

inflection.py
    └── morphological interpretation

syntax_provider.py
    └── abstract syntax interface

syntax_sudachi.py
    └── lightweight heuristic syntax

syntax_ginza.py
    └── optional dependency parser

sense_ranker.py
    └── deterministic + semantic + LLM ranking

kanji_service.py
    └── kanji enrichment

pronunciation_service.py
    └── VOICEVOX/pitch

glossary.py
    └── orchestration layer
```

The crucial change is that `glossary.py` becomes an orchestrator rather than containing all logic.

---

# 29. API Request

Recommended request:

```text
sentence
clicked_start
clicked_end
```

Optionally:

```text
sentence_id
frontend_token_id
```

Do not make:

```text
dictionary_form
reading
sentence_tokens
```

from the frontend authoritative.

Those should be derived from the backend's canonical sentence analysis.

---

# 30. API Response

The response should conceptually contain:

```text
resolved_expression
surface_form
reading
lemma
romaji

part_of_speech

selected_sense
alternative_senses

context_explanation

grammar_info

inflection_info

kanji_breakdown

pronunciation

examples

resolution_confidence
sense_confidence

source_metadata
```

The frontend should not need to understand JMdict, Sudachi or GiNZA internals.

---

# 31. Glossary UI

Recommended ordering:

```text
┌──────────────────────────────┐
│ 見てもらいました             │
│ みてもらいました             │
│ Verb / Construction           │
│ 🔊                            │
├──────────────────────────────┤
│ Meaning in this sentence      │
│ "have someone check/look at"  │
├──────────────────────────────┤
│ Grammar                       │
│ 見る + 〜てもらう + polite     │
│ + past                        │
├──────────────────────────────┤
│ Dictionary meaning            │
│ 見る                          │
│ • to see                      │
│ • to look at                  │
│ • to watch                    │
│ ...                           │
├──────────────────────────────┤
│ Kanji                         │
│ 見                             │
├──────────────────────────────┤
│ Examples                      │
│ ...                            │
└──────────────────────────────┘
```

The first thing shown should be:

> **What does this mean here?**

not the dictionary's first sense.

---

# 32. Phase 14 — Caching

Cache analysis at three levels.

## Sentence cache

```text
sentence
    ↓
tokens + morphology + candidate spans + syntax
```

## Lexical cache

```text
lemma/reading/expression
    ↓
dictionary candidates
```

## Context cache

```text
sentence + clicked span
    ↓
final glossary
```

This is particularly important because users will frequently click several words in the same sentence.

---

# 33. Phase 15 — Confidence-Aware UI

Internally distinguish:

```text
high confidence
medium confidence
low confidence
```

The UI does not need to expose numeric probabilities initially.

For example:

### High confidence

```text
Meaning in this sentence
to make a phone call
```

### Ambiguous

```text
Likely meaning in this sentence
to hang / suspend

Other possible meanings
...
```

This is preferable to confidently presenting a wrong sense.

---

# 34. Phase 16 — Evaluation Gates

Every implementation stage should be measured against the Phase-0 benchmark.

## Gate A — lexical resolution

Measure:

```text
correct expression
correct lemma
correct reading
```

## Gate B — phrase resolution

Measure:

```text
idiom detected
compound detected
grammar construction detected
```

## Gate C — sense ranking

Measure:

```text
Top-1 accuracy
Top-3 accuracy
abstention accuracy
```

## Gate D — grammar interpretation

Measure:

```text
correct particle role
correct auxiliary construction
correct inflection
```

## Gate E — end-user utility

Have Japanese-proficient reviewers judge:

```text
Was the meaning presented for this sentence correct?
Was the grammar explanation correct?
Was the explanation useful to a learner?
```

---

# 35. Revised Implementation Order

The implementation order should therefore be:

### Stage 1
Preserve Sudachi A/B/C + character offsets.

### Stage 2
Change click API to send character span.

### Stage 3
Build candidate span resolver.

### Stage 4
Build local normalized SQLite dictionary.

### Stage 5
Integrate JMdict/JMnedict/Jitendex data.

### Stage 6
Implement deterministic lexical filtering.

### Stage 7
Implement grammar/particle construction matching.

### Stage 8
Implement inflection interpretation.

### Stage 9
Add example retrieval.

### Stage 10
Add deterministic/contextual sense scoring.

### Stage 11
Add semantic embedding ranking.

### Stage 12
Add Ollama as a constrained tie-breaker.

### Stage 13
Add optional GiNZA fallback for difficult sentences.

### Stage 14
Connect kanji/furigana/audio enrichment.

### Stage 15
Upgrade glossary UI.

### Stage 16
Run the complete benchmark and tune thresholds.

---

# 36. What Should NOT Be Implemented

Avoid these patterns:

### Do not do

```text
clicked token
→ Jisho first result
```

### Do not do

```text
clicked token
→ LLM invents definition
```

### Do not do

```text
clicked token
→ blindly join neighboring tokens
```

### Do not do

```text
grammar registry
→ unconditional override
```

### Do not do

```text
Sudachi POS
→ assume syntactic dependency is known
```

### Do not do

```text
LLM top-1
→ treat as guaranteed correct
```

### Do not do

```text
JMdict raw schema
→ expose directly to frontend
```

---

# 37. Final Recommended Architecture

The refined architecture is:

```text
                         JAPANESE SENTENCE
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Sudachi A / B / C    │
                    │ morphology + offsets │
                    └───────────┬───────────┘
                                │
                       Sentence Analysis
                                │
             ┌──────────────────┼──────────────────┐
             │                  │                  │
             ▼                  ▼                  ▼
       Lexical spans       Grammar patterns    Proper names
             │                  │                  │
             └──────────────────┼──────────────────┘
                                ▼
                     Candidate expressions
                                │
                                ▼
                    ┌───────────────────────┐
                    │ Local Dictionary DB   │
                    │                       │
                    │ JMdict                │
                    │ JMnedict              │
                    │ Jitendex enrichment   │
                    └───────────┬───────────┘
                                │
                         Candidate senses
                                │
                                ▼
                    Deterministic filtering
                                │
                                ▼
                     Context feature score
                                │
                ┌───────────────┴──────────────┐
                │                              │
                ▼                              ▼
       Sudachi heuristics              Optional GiNZA
                │                              │
                └───────────────┬──────────────┘
                                ▼
                       Semantic ranking
                                │
                                ▼
                     Optional Ollama reranker
                                │
                                ▼
                     Selected interpretation
                                │
              ┌─────────────────┼─────────────────┐
              │                 │                 │
              ▼                 ▼                 ▼
          Grammar            Kanji           Pronunciation
          Inflection         Furigana        Audio/Pitch
              │                 │                 │
              └─────────────────┼─────────────────┘
                                ▼
                      LEARNER GLOSSARY
```

---

# 38. Final Decisions

The implementation plan should therefore be updated to these decisions:

| Component | Final decision |
|---|---|
| Sudachi | **Keep and expand; retain A/B/C simultaneously** |
| Click resolution | **Character-span based, backend authoritative** |
| Phrase detection | **Lexicon + grammar-pattern candidate generation** |
| Jisho | **Remove from production lookup path** |
| Dictionary | **Local normalized SQLite** |
| JMdict | **Canonical lexical foundation** |
| JMnedict | **Proper-name source** |
| Jitendex | **Enrichment source; don't confuse it with jamdict** |
| Jamdict | **Optional tooling/library, not the canonical architecture** |
| Grammar registry | **Candidate recognizer, not unconditional override** |
| Inflection | **Use Sudachi features; avoid hand-generated conjugation chains initially** |
| Sense ranking | **Deterministic → semantic similarity → LLM tie-breaker** |
| LLM | **Never invent canonical dictionary senses** |
| GiNZA | **Not mandatory for MVP, but retain as an optional low-confidence syntax provider** |
| Kanji | **Integrate existing repository data** |
| Furigana | **Keep existing alignment; optionally add JmdictFurigana** |
| VOICEVOX | **Keep** |
| Pitch | **Later enrichment** |
| Examples | **Integrate into offline data pipeline** |
| Confidence | **Explicit internal confidence + abstention** |
| Evaluation | **Build benchmark before tuning architecture/model choices** |

## Most important change from the previous plan

I would **not** frame the decision as:

```text
Sudachi heuristics OR GiNZA
```

or:

```text
LLM OR deterministic ranking
```

The more accurate architecture is:

```text
Sudachi
  +
lexical rules
  +
optional dependency parsing
  +
dictionary constraints
  +
semantic ranking
  +
LLM only for difficult cases
```

That is both more accurate and more practical.

In particular, the current evidence supports treating GiNZA as a **useful accuracy fallback rather than unnecessary complexity**, and it supports treating BERT/Sentence-BERT-style contextual ranking as a genuine WSD technique—but **not** assuming that a local Qwen prompt is automatically accurate enough to be the final arbiter. Japanese WSD work in 2026 still shows meaningful domain-dependent error rates, which is exactly why the system should retain candidate alternatives and confidence rather than forcing a single opaque answer.

Also, because JMdict's New Generation distribution is now active in 2026, I would make the dictionary ingestion/versioning layer a first-class component from the start rather than hard-wiring the application to a particular JMdict representation.