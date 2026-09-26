Yes. **The entire core pipeline can run locally with no runtime internet dependency**:

```text
Japanese text
      ↓
Sudachi + SudachiDict Full
      ↓
Katakana reading
      ↓
Hiragana conversion
      ↓
VOICEVOX local engine
      ↓
WAV audio
```

Sudachi can be installed with the Full dictionary and then operates from a local dictionary file; its current Rust implementation supports local dictionary paths and outputs reading forms. :chatgpt-content-reference{index="0"} VOICEVOX Engine provides local CPU and NVIDIA-GPU Docker images and exposes an HTTP API on `localhost:50021`. :chatgpt-content-reference{index="1"}

One important correction to the architecture, though: **we should not simply send Sudachi's raw katakana to VOICEVOX and assume we've preserved all pronunciation/prosody information.** VOICEVOX has a proper mechanism for supplying kana plus accent information, and its API explicitly supports an AquesTalk-style kana representation for this purpose. :chatgpt-content-reference{index="2"}

## Design

### 1. Inputs and outputs

The service accepts:

```text
Input:
Japanese UTF-8 text
```

and returns three primary outputs:

```text
1. Original text
2. Hiragana conversion
3. Katakana conversion
4. Generated audio (.wav)
```

For example:

```text
INPUT
今日は東京へ行きます。

HIRAGANA
きょうはとうきょうへいきます。

KATAKANA
キョウハトウキョウヘイキマス

AUDIO
audio.wav
```

The displayed hiragana/katakana should represent the **same selected reading**, rather than being independently generated.

---

# 2. Core architecture

```text
                         ┌─────────────────────┐
                         │   Japanese Input    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Text Normalization  │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   Sudachi Full      │
                         │  morphological      │
                         │     analysis        │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  Reading extraction │
                         │  per morpheme       │
                         └──────────┬──────────┘
                                    │
                         ┌──────────┴──────────┐
                         ▼                     ▼
                  reading found          OOV / unknown
                         │                     │
                         └──────────┬──────────┘
                                    ▼
                         ┌─────────────────────┐
                         │ Reading resolution  │
                         │ / fallback layer    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Canonical Katakana  │
                         │ reading             │
                         └──────────┬──────────┘
                                    │
                       ┌────────────┴────────────┐
                       ▼                         ▼
             Katakana → Hiragana          VOICEVOX frontend
                       │                         │
                       ▼                         ▼
                Hiragana output        accent/prosody query
                                                 │
                                                 ▼
                                         VOICEVOX synthesis
                                                 │
                                                 ▼
                                               WAV
```

---

# 3. Stage 1 — input normalization

Before Sudachi sees the text, normalize it consistently.

Handle:

- Unicode normalization
- full-width / half-width variants
- punctuation normalization where appropriate
- whitespace normalization
- line endings
- obvious typographic variants

But **do not aggressively rewrite the Japanese text**.

The original text must be preserved because the user expects the audio and conversions to correspond exactly to what they supplied.

We should maintain two representations:

```text
source_text
normalized_text
```

The latter is used internally; the former is returned unchanged.

---

# 4. Stage 2 — Sudachi Full

Use **Sudachi Full**, not Core.

The benchmark we discussed is particularly relevant here: on JKYB-Parakeet, **Sudachi Full achieved 97.392% target reading accuracy**, making it the strongest of the classical open G2P/morphological systems reported in that benchmark. :chatgpt-content-reference{index="3"}

Sudachi gives us, per token:

```text
surface
POS
normalized form
dictionary form
reading
dictionary/OOV information
```

The current Sudachi tooling explicitly exposes `reading_form()`, and the Full dictionary contains miscellaneous proper nouns beyond the basic vocabulary. :chatgpt-content-reference{index="4"}

### Use the current Rust implementation

I would use **Sudachi 0.8.2 / current sudachi.rs**, rather than building a new system around the old archived SudachiPy repository.

Sudachi 0.8.2 is the current release, although the 0.8 series is explicitly described as transitional/unstable, so the exact version must be pinned. It also introduced the V1 dictionary format. :chatgpt-content-reference{index="5"}

For our deployment, pin:

```text
Sudachi version
SudachiDict version
```

as a matched pair.

The current dictionary documentation says V1 dictionaries require Sudachi 0.8.2 / compatible newer releases. :chatgpt-content-reference{index="6"}

---

# 5. Stage 3 — construct the canonical reading

For every Sudachi token we want:

```text
surface → reading
```

For example:

```text
今日      → キョウ
は        → ハ
東京      → トウキョウ
へ        → ヘ
行きます  → イキマス
```

Then concatenate:

```text
キョウハトウキョウヘイキマス
```

This becomes our **canonical reading representation**.

This representation is the important internal artifact of the whole system.

---

# 6. Do not make Hiragana and Katakana independently

This is important.

We should have exactly **one authoritative reading**.

For example:

```text
canonical_reading:
キョウハトウキョウヘイキマス
```

Then derive:

```text
katakana:
キョウハトウキョウヘイキマス
```

and:

```text
hiragana:
きょうはとうきょうへいきます
```

using deterministic kana conversion.

That guarantees:

```text
hiragana ↔ katakana
```

cannot disagree.

The only intelligent component is selecting the correct reading.

---

# 7. OOV handling

This needs to be part of the design from day one.

Sudachi explicitly identifies dictionary IDs and OOV entries. :chatgpt-content-reference{index="7"}

Examples:

```text
知らない新しい単語
         ↓
possibly OOV
```

We should distinguish:

### A. Known word + known reading

Trust Sudachi.

### B. Known surface, but contextually ambiguous reading

This requires a future fallback mechanism.

### C. OOV

Needs fallback.

### D. Proper name / organization / place

Often deserves fallback or user dictionary treatment.

For **version 1**, I recommend that unresolved cases be explicitly surfaced rather than silently making a potentially incorrect guess.

For example:

```json
{
  "surface": "〇〇",
  "reading": null,
  "status": "unresolved"
}
```

That is much safer than pretending that a guessed reading is authoritative.

---

# 8. User pronunciation dictionary

This should be a first-class component.

Example:

```text
surface:     日本橋
reading:     ニホンバシ
```

or:

```text
surface:     独自製品名
reading:     ドクジセイヒンメイ
```

The dictionary should take precedence over the normal analyzer.

Conceptually:

```text
User Dictionary
       ↓
Sudachi Full
       ↓
OOV/fallback
```

Sudachi itself supports user dictionaries. :chatgpt-content-reference{index="8"}

This will be enormously useful for:

- people's names
- fictional characters
- company names
- product names
- game terminology
- location names
- technical vocabulary

---

# 9. Stage 4 — Katakana output

At this point we already have:

```text
canonical_katakana
```

Return that directly.

For example:

```text
キョウハトウキョウヘイキマス
```

No additional model is involved.

---

# 10. Stage 5 — Hiragana output

Perform deterministic katakana-to-hiragana conversion.

This is intentionally boring.

There should be **zero ML involved here**.

For example:

```text
キョウ
 ↓
きょう
```

and:

```text
トウキョウ
 ↓
とうきょう
```

The advantage is that a reading error can only originate from the G2P stage, not from two different conversion systems.

---

# 11. Stage 6 — VOICEVOX

VOICEVOX Engine runs as a completely local service.

Officially it supports:

```text
CPU Docker image
voicevox/voicevox_engine:cpu-latest
```

and:

```text
NVIDIA GPU Docker image
voicevox/voicevox_engine:nvidia-latest
```

with the engine exposed locally on port `50021`. :chatgpt-content-reference{index="9"}

So the application communicates with:

```text
localhost:50021
```

rather than the internet.

---

# 12. How to feed our reading to VOICEVOX

There are two possible modes.

## Mode A — kana as ordinary text

We give VOICEVOX:

```text
キョウハトウキョウヘイキマス
```

instead of the original:

```text
今日は東京へ行きます
```

This removes the kanji-reading problem from VOICEVOX.

It can now focus on segmentation, accent and synthesis.

This is the simplest implementation.

---

## Mode B — explicit VOICEVOX pronunciation representation

This is what I would ultimately use.

VOICEVOX supports an AquesTalk-like kana representation in which we can specify:

```text
kana
accent position
phrase boundaries
devoicing
```

For example, conceptually:

```text
キョ'ウ/トウキョ'ウ/...
```

VOICEVOX's own documentation explicitly describes this facility and shows the workflow of generating an `audio_query`, obtaining/replacing accent phrases with `is_kana=true`, and then synthesizing the resulting query. :chatgpt-content-reference{index="10"}

So our architecture can become:

```text
Sudachi
   ↓
canonical kana
   ↓
VOICEVOX accent frontend
   ↓
accent phrases
   ↓
optional correction
   ↓
audio query
   ↓
synthesis
```

The key point is that **we do not need to invent the phoneme/audio implementation ourselves**.

VOICEVOX already handles:

```text
kana → mora
mora → pitch
mora → duration
phonological realization
       ↓
       audio
```

---

# 13. Accent handling

This is the one piece that Sudachi's reading alone doesn't give us.

For example, knowing:

```text
ハシ
```

is not enough to determine the exact pitch accent.

We therefore let VOICEVOX's frontend create the default accent phrase structure from our **already-resolved kana**.

The engine returns an `AudioQuery` containing accent phrases and mora information, and those can be edited before synthesis. VOICEVOX documents this explicitly. :chatgpt-content-reference{index="11"}

That gives us:

```text
Sudachi decides:
"What sounds?"

VOICEVOX decides:
"How is it accented and synthesized?"
```

This is an appropriate separation.

---

# 14. Very important: don't claim benchmark equivalence

There is a subtle but important scientific point.

The published JKYB-Parakeet result for VOICEVOX is:

```text
VOICEVOX
Accuracy: 93.890%
Target Kana-CER: 4.859%
Sentence Kana-CER: 1.457%
```

and the benchmark identifies its G2P backend as **OpenJTalk / VOICEVOX Engine 0.25.2**, not our proposed Sudachi→VOICEVOX pipeline. :chatgpt-content-reference{index="12"}

Likewise, Sudachi Full's:

```text
97.392%
```

is the **Sudachi G2P result**, not a complete end-to-end Sudachi→VOICEVOX score. :chatgpt-content-reference{index="13"}

So our claim should be:

> We are combining the strongest publicly benchmarked classical G2P component among those tested, Sudachi Full, with a locally controllable TTS engine.

We should **not** claim that therefore our complete system gets 97.392% or any particular TTS score.

Instead, we should run the complete pipeline through JKYB-Parakeet ourselves.

The benchmark explicitly supports evaluating both G2P and TTS, and its TTS evaluation obtains kana from generated audio using `kana-whisper`. :chatgpt-content-reference{index="14"}

---

# 15. Evaluation should be built into the project

Before worrying about UI or optimization, create an evaluation harness.

Run at least:

```text
A. Sudachi Full
B. VOICEVOX on original Japanese
C. Sudachi Full → VOICEVOX
D. Sudachi Full → VOICEVOX with explicit kana/accent control
```

Measure:

```text
G2P:
  Target Accuracy
  Target Kana-CER
  Sentence Kana-CER

TTS:
  Target Accuracy
  Target Kana-CER
  Sentence Kana-CER
  Transcript CER
```

Those are the metrics defined by JKYB-Parakeet. :chatgpt-content-reference{index="15"}

This will tell us something much more useful than looking at individual demo sentences.

---

# 16. Hardware

You don't need a GPU for the linguistic part.

### Sudachi

Essentially CPU-bound.

```text
GPU: not required
RAM: modest
```

### VOICEVOX

Can run on:

```text
CPU
```

or:

```text
NVIDIA GPU
```

The official project provides both Docker variants. :chatgpt-content-reference{index="16"}

So on your 16 GB-VRAM machine, the GPU is available to VOICEVOX, but **the system doesn't depend on having 16 GB VRAM**.

That's useful if you eventually deploy this on another machine.

---

# 17. Runtime architecture

I'd separate the application into three processes.

```text
┌─────────────────────────────────────────┐
│              Your App                   │
│                                         │
│  REST / local API                       │
└───────────────┬─────────────────────────┘
                │
        ┌───────┴────────┐
        ▼                ▼
┌───────────────┐ ┌───────────────────┐
│    Sudachi    │ │     VOICEVOX      │
│               │ │                   │
│ G2P / reading │ │ TTS / prosody     │
└───────────────┘ └───────────────────┘
```

The main application orchestrates them.

That means VOICEVOX doesn't become embedded into your application logic.

---

# 18. Internal request/result model

Internally, I'd represent a request approximately as:

```text
Request
 ├── source_text
 ├── normalized_text
 └── voice_settings

Analysis
 ├── tokens[]
 │    ├── surface
 │    ├── normalized
 │    ├── POS
 │    ├── reading
 │    ├── source = sudachi/user/fallback
 │    └── confidence/status
 │
 ├── katakana
 └── hiragana

Speech
 ├── speaker
 ├── accent_phrases
 ├── audio_query
 └── audio
```

This is useful because debugging becomes straightforward.

For example:

```text
Input:
人気の店です。

Sudachi:
人気 → ニンキ

Output:
にんきの...
```

If the user expected:

```text
ひとけ
```

we can immediately see that the error happened at **G2P**, rather than blaming the TTS engine.

---

# 19. Error handling

We should classify errors.

### `KNOWN`

Sudachi has a reading.

### `USER_OVERRIDE`

User dictionary supplied the reading.

### `OOV`

No dictionary reading exists.

### `AMBIGUOUS`

Potentially multiple contextual readings.

### `UNRESOLVED`

System cannot confidently determine reading.

For the first version, I'd rather return:

```text
status: unresolved
```

than silently generate bad Japanese.

That also gives us a dataset of real failures that we can later use to improve the system.

---

# 20. Caching

There should be aggressive caching.

For each normalized text:

```text
hash(normalized_text + pipeline_version)
```

cache:

```text
reading
hiragana
katakana
VOICEVOX audio query
audio
```

This matters because the same Japanese sentences may be synthesized repeatedly.

Also cache Sudachi analysis independently from TTS so changing speaker doesn't require re-running G2P.

---

# 21. Versioning

This is important for reproducibility.

Record:

```text
pipeline_version

Sudachi version
SudachiDict version

VOICEVOX Engine version

VOICEVOX speaker/style ID
```

For example:

```text
pipeline: 1.0

sudachi:       0.8.2
dictionary:    pinned version
voicevox:      0.25.2
speaker:       <id>
```

The exact versions matter because both Sudachi behavior and VOICEVOX output can change between releases.

Sudachi specifically warns that the 0.8 series can have behavioral/API changes even between patch releases. :chatgpt-content-reference{index="17"}

---

# 22. Offline operation

After installation/assets are downloaded:

```text
             INTERNET
                │
          installation only
                │
                ▼
      ┌─────────────────────┐
      │ Local machine       │
      │                     │
      │ Sudachi             │
      │ SudachiDict         │
      │ VOICEVOX Engine     │
      │ VOICEVOX voices     │
      │ Your application    │
      └─────────────────────┘
                │
                ▼
           NO INTERNET
```

There is no API call to a cloud LLM or cloud TTS service.

VOICEVOX's official distribution supports Windows, macOS and Linux, and the Engine provides local CPU/GPU containers. :chatgpt-content-reference{index="18"}

---

# 23. Licensing caveat

There are two separate licensing questions.

**Software:** the VOICEVOX software itself is free for commercial and non-commercial use, but its software terms require following each voice library's separate terms and require crediting VOICEVOX when used. :chatgpt-content-reference{index="19"}

**Voice:** the individual VOICEVOX voice libraries can have their own conditions, so the specific speaker we choose must be checked before distributing a commercial application or its generated audio. VOICEVOX explicitly directs users to each character's terms. :chatgpt-content-reference{index="20"}

For a clean application design, I'd therefore make the speaker configurable rather than hard-code one voice.

**VOICEVOX Nemo** is particularly interesting for a product because it is explicitly positioned as a character-free VOICEVOX product and says commercial/non-commercial use is free, while still having its own terms. :chatgpt-content-reference{index="21"}

---

# 24. What we should *not* build initially

I would deliberately leave these out of v1:

```text
❌ Local LLM
❌ neural G2P training
❌ custom TTS model
❌ phoneme model
❌ cloud APIs
❌ automatic pronunciation guessing
```

The benchmark already gives us a good classical starting point, so the first implementation should be deterministic and measurable.

---

# 25. Final v1 architecture

The concrete system becomes:

```text
                    USER
                     │
                     │ Japanese text
                     ▼
             ┌────────────────┐
             │ Text normalize │
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ Sudachi Full   │
             │ morphological  │
             │ analysis       │
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ User dictionary│
             │ overrides      │
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ Reading        │
             │ resolution     │
             └───────┬────────┘
                     │
                     ▼
             ┌────────────────┐
             │ Canonical      │
             │ Katakana       │
             └───────┬────────┘
                     │
            ┌────────┴────────┐
            ▼                 ▼
     ┌──────────────┐   ┌───────────────┐
     │ Hiragana     │   │ VOICEVOX      │
     │ converter    │   │ accent parser │
     └──────┬───────┘   └───────┬───────┘
            │                   │
            │                   ▼
            │            ┌───────────────┐
            │            │ Audio Query   │
            │            │ adjustments   │
            │            └───────┬───────┘
            │                    │
            │                    ▼
            │            ┌───────────────┐
            │            │ VOICEVOX      │
            │            │ synthesis     │
            │            └───────┬───────┘
            │                    │
            ▼                    ▼
       hiragana.txt          audio.wav

                         + katakana.txt
```

### The key decision

For v1, **Sudachi is responsible for “what is being said”; VOICEVOX is responsible for “how it sounds.”**

And we should benchmark the **complete pipeline**, rather than assuming that combining two individually benchmarked components automatically gives us the sum of their scores.

That gives you a fully local, free-to-run architecture with a strong public benchmark basis, while leaving a clean extension point later for a local LLM or better G2P model when we have evidence that it actually improves JKYB-Parakeet performance. :chatgpt-content-reference{index="22"}