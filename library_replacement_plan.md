# Library Replacement Plan: Migrating In-House Implementations to Battle-Tested Online Open-Source Libraries

This document outlines the detailed architecture and migration plan to replace in-house custom implementations (Romaji typing DAG, procedural sound synthesizer, and local NLP translation) with industry-standard, battle-tested open-source libraries and GitHub repositories.

---

## 1. Selected Open-Source Libraries & Repositories

| Subsystem | In-House Code | Selected Online / Open-Source Library | GitHub Repository | Package / Install |
| :--- | :--- | :--- | :--- | :--- |
| **1. Japanese Typing Engine** | Custom `romajiDAG.ts` | **`emiel`** (by tomoemon) + **`wanakana`** (by WaniKani / Tofugu) | [tomoemon/emiel](https://github.com/tomoemon/emiel)<br>[WaniKani/WanaKana](https://github.com/WaniKani/WanaKana) | `npm install emiel wanakana` |
| **2. Kana & Furigana Processing** | Custom regex / char codes | **`wanakana`** + **`kuroshiro`** | [WaniKani/WanaKana](https://github.com/WaniKani/WanaKana)<br>[hexenq/kuroshiro](https://github.com/hexenq/kuroshiro) | `npm install wanakana kuroshiro` |
| **3. Audio Engine & Switch FX** | Procedural Web Audio oscillators | **`howler.js`** + **`Mechvibes` Sound Packs** | [goldfire/howler.js](https://github.com/goldfire/howler.js)<br>[hainguyents13/mechvibes](https://github.com/hainguyents13/mechvibes) | `npm install howler`<br>`npm install -D @types/howler` |
| **4. Online Translation** | Local Ollama only | **`google-translate-api`** / **`googletrans`** / **`deepl-node`** | [vitalets/google-translate-api](https://github.com/vitalets/google-translate-api)<br>[ssut/py-googletrans](https://github.com/ssut/py-googletrans) | `npm install @vitalets/google-translate-api` or `pip install googletrans==4.0.0-rc1` |
| **5. Morphological Analysis** | Custom token splitter | **SudachiPy** (UniDic Mode C) | [WorksApplications/SudachiPy](https://github.com/WorksApplications/SudachiPy) | `pip install sudachipy sudachidict_core` (Standard Python package) |

---

## 2. Component-by-Component Replacement Details

### 2.1 Typing Engine: Replacing `romajiDAG.ts` with `emiel` + `wanakana`

#### Why `emiel` & `wanakana`?
- **`emiel`** ([https://github.com/tomoemon/emiel](https://github.com/tomoemon/emiel)):
  - Specifically designed as a headless, framework-agnostic Japanese typing game engine.
  - Fully supports **Google Japanese Input (Mozc)** romaji input rules out of the box.
  - Handles complex edge cases natively:
    - Digraphs and Yōon (`sha` / `sya` / `cya` for `しゃ`).
    - Multiple sokuon geminate consonants (`kkka` for `っっか`).
    - Dual roman/kana input, Mozc JSON rule merging.
    - Multiple backspace behavior patterns (`react-backspace` pattern).
    - Built-in `performance.now()` precision latency and keystroke event metrics.
- **`wanakana`** ([https://github.com/WaniKani/WanaKana](https://github.com/WaniKani/WanaKana)):
  - The gold-standard Japanese transliteration utility created and maintained by the WaniKani/Tofugu team.
  - Provides robust `toHiragana()`, `toKatakana()`, `toRomaji()`, `isKana()`, and `tokenize()` methods.

#### Strict Rule:
> **Do not modify the `emiel` or `wanakana` packages.**
> All adaptations, event piping, and UI state mapping will be written in a local adapter layer.

#### Implementation Architecture:
Create local adapter `frontend/src/lib/emielAdapter.ts`:
```typescript
import {
  build,
  loadPresetRuleRoman,
  createDirectInputRule,
  detectKeyboardLayout,
  type Automaton,
  type InputEventResult,
} from 'emiel';
import * as wanakana from 'wanakana';

export interface EmielSessionState {
  automaton: Automaton;
  finishedRoman: string;
  pendingRoman: string;
  isFinished: boolean;
  totalKeystrokes: number;
  correctKeystrokes: number;
  incorrectKeystrokes: number;
}

export async function createEmielSession(kanaSentence: string): Promise<Automaton> {
  // Use US / JIS QWERTY layout detected or fallback
  const layout = typeof window !== 'undefined' ? await detectKeyboardLayout(window) : undefined;
  const romanRule = loadPresetRuleRoman(layout);
  const directRule = createDirectInputRule(layout);
  const combinedRule = romanRule.merge(directRule);

  // Normalize kana with WanaKana to ensure 100% valid Hiragana input
  const normalizedKana = wanakana.toHiragana(kanaSentence);
  return build(combinedRule, normalizedKana);
}
```

#### How to integrate into `TypingArea.tsx`:
1. Replace `engineRef.current = new TypingEngineState(...)` with `const automaton = await createEmielSession(sentence.hiragana)`.
2. On `keydown` event, pass the event directly into `automaton.input(e)`.
3. Read `const view = automaton.currentView()`, providing:
   - `view.finishedRoman` (the confirmed roman keystrokes typed so far).
   - `view.pendingRoman` (the remaining expected romaji).
   - `view.finishedKana` and `view.pendingKana` for pinpoint cursor highlight on the Japanese text.
4. If `result.isFinished`, trigger sentence and passage completion.

---

### 2.2 Audio Engine: Replacing Procedural Synthesizer with `howler.js` + Mechvibes Sound Packs

#### Why `howler.js` & Mechvibes?
- **`howler.js`** ([https://github.com/goldfire/howler.js](https://github.com/goldfire/howler.js)):
  - The industry-standard web audio library for modern browsers, handling audio caching, polyfills, fallback, spatial audio, and concurrent sound sprites.
- **`Mechvibes` Sound Packs** ([https://github.com/hainguyents13/mechvibes](https://github.com/hainguyents13/mechvibes)):
  - High-fidelity studio recordings of genuine mechanical switches (Gateron Ink Black, Cherry MX Blue, Holy Panda, Topre, etc.).

#### Strict Rule:
> **Do not modify `howler.js`.**
> Audio files are placed in `frontend/public/sounds/` and loaded through standard `Howl` instances in a local wrapper.

#### Implementation Architecture:
Create local audio wrapper `frontend/src/lib/howlerAudio.ts`:
```typescript
import { Howl } from 'howler';

export class HowlerSoundEngine {
  private keySounds: Record<string, Howl> = {};
  private errorSound: Howl;
  private chimeSound: Howl;

  constructor() {
    this.keySounds['thock'] = new Howl({
      src: ['/sounds/gateron_black_press.mp3'],
      volume: 0.6,
      preload: true,
    });
    this.keySounds['blue'] = new Howl({
      src: ['/sounds/cherry_blue_press.mp3'],
      volume: 0.6,
      preload: true,
    });
    this.keySounds['brown'] = new Howl({
      src: ['/sounds/cherry_brown_press.mp3'],
      volume: 0.6,
      preload: true,
    });
    this.errorSound = new Howl({
      src: ['/sounds/error_thud.mp3'],
      volume: 0.5,
    });
    this.chimeSound = new Howl({
      src: ['/sounds/sentence_chime.mp3'],
      volume: 0.7,
    });
  }

  playKey(profile: 'thock' | 'blue' | 'brown') {
    this.keySounds[profile]?.play();
  }

  playError() {
    this.errorSound.play();
  }

  playChime() {
    this.chimeSound.play();
  }
}
```

---

### 2.3 Online Translation: Adding Google Translate / DeepL API Integration

#### Why an Online Library for Translation?
- Currently, translations run locally via Ollama (`backend/app/translator.py`).
- Users wanting online cloud translation services can leverage:
  - **`google-translate-api`** ([https://github.com/vitalets/google-translate-api](https://github.com/vitalets/google-translate-api)):
    Popular open-source library for Google Translate.
  - **`deepl-node`** ([https://github.com/DeepLcom/deepl-node](https://github.com/DeepLcom/deepl-node)) / **`deepl-python`** ([https://github.com/DeepLcom/deepl-python](https://github.com/DeepLcom/deepl-python)):
    Official DeepL API client for high-fidelity literary Japanese translation.
  - **`googletrans`** ([https://github.com/ssut/py-googletrans](https://github.com/ssut/py-googletrans)):
    Python library using Google Translate AJAX API.

#### Implementation Architecture:
In `backend/app/translator.py`, support a pluggable online translation provider without altering external packages:
```python
# Selectable via TRANSLATION_PROVIDER environment variable:
# "google" -> Uses googletrans / online API
# "deepl"  -> Uses deepl API
# "ollama" -> Uses local Ollama GPU
```

---

## 3. Step-by-Step Execution Roadmap

### Step 1: Install Dependencies
```powershell
# Frontend
cd frontend
npm install emiel wanakana howler
npm install -D @types/howler

# Backend
cd ../backend
.\.venv\Scripts\python.exe -m pip install googletrans==4.0.0-rc1
```

### Step 2: Create Local Wrappers (Zero Modification to External Libraries)
1. Write `frontend/src/lib/emielAdapter.ts` wrapping `emiel` and `wanakana`.
2. Write `frontend/src/lib/howlerAudio.ts` wrapping `howler`.
3. Add switch sound assets into `frontend/public/sounds/`.
4. Update `backend/app/translator.py` with the online translation provider.

### Step 3: Wire into UI Components
1. Update `TypingArea.tsx` to use `emielAdapter.ts` instead of `romajiDAG.ts`.
2. Update `SentenceBlock.tsx` to read `emiel` cursor coordinates and `wanakana` script conversions.
3. Update `Navbar.tsx` and `AudioSettingsModal.tsx` to control `howlerAudio.ts`.

### Step 4: Verification & Testing
1. Run automated test with `emiel` for edge-case words (`し`, `つ`, `がっこう`, `っち`, `さんか`, `しゃ`).
2. Verify online Google/DeepL translation output for Japanese passages.
3. Verify mechanical switch audio playback via `howler.js`.
4. Run `npm run build` to confirm 0 compilation errors.

---

## 4. Repository & Reference Links

- **`emiel`**: [https://github.com/tomoemon/emiel](https://github.com/tomoemon/emiel) (npm: [emiel](https://www.npmjs.com/package/emiel))
- **`wanakana`**: [https://github.com/WaniKani/WanaKana](https://github.com/WaniKani/WanaKana) (npm: [wanakana](https://www.npmjs.com/package/wanakana))
- **`howler.js`**: [https://github.com/goldfire/howler.js](https://github.com/goldfire/howler.js) (npm: [howler](https://www.npmjs.com/package/howler))
- **`mechvibes`**: [https://github.com/hainguyents13/mechvibes](https://github.com/hainguyents13/mechvibes)
- **`kuroshiro`**: [https://github.com/hexenq/kuroshiro](https://github.com/hexenq/kuroshiro) (npm: [kuroshiro](https://www.npmjs.com/package/kuroshiro))
- **`googletrans`**: [https://github.com/ssut/py-googletrans](https://github.com/ssut/py-googletrans)
- **`google-translate-api`**: [https://github.com/vitalets/google-translate-api](https://github.com/vitalets/google-translate-api)
- **`SudachiPy`**: [https://github.com/WorksApplications/SudachiPy](https://github.com/WorksApplications/SudachiPy)
