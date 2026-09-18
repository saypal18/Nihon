# Nihon (日本) - Japanese Language & English Touch-Typing App

A dual-purpose application designed to master Japanese reading comprehension and English touch typing simultaneously.

The user pastes Japanese text (or picks from classic literature presets), which is parsed with morphological precision into Hiragana/Katakana (via **SudachiPy**) and translated into English (via **Googletrans online API**). The user touch-types the passage using an English keyboard powered by **Emiel (Google Japanese Input Mozc rules engine)** and **WanaKana** with **Howler.js** mechanical keyboard audio.

---

## Active Open-Source Stack

1. **Typing Game Engine: `emiel` (by tomoemon)**:
   - [https://github.com/tomoemon/emiel](https://github.com/tomoemon/emiel)
   - Full implementation of Google Japanese Input (Mozc) romaji rules.
   - Ambiguity resolution (`sha`/`sya`/`cya`), sokuon consonant doubling (`kkka`), JIS/QWERTY layout detection, and backspacing patterns.

2. **Japanese Transliteration: `wanakana` (by WaniKani / Tofugu)**:
   - [https://github.com/WaniKani/WanaKana](https://github.com/WaniKani/WanaKana)
   - Industry-standard Japanese transliteration and tokenization utility.

3. **Audio Engine: `howler.js`**:
   - [https://github.com/goldfire/howler.js](https://github.com/goldfire/howler.js)
   - Plays mechanical switch sound assets (Thock, Blue Clicky, Brown Tactile), typo thuds, and completion chimes.

4. **Online Translation: `googletrans`**:
   - [https://github.com/ssut/py-googletrans](https://github.com/ssut/py-googletrans)
   - Direct online Google Translate API integration. Errors are logged and raised directly with zero silent fallbacks.

5. **Morphological Parser: `SudachiPy` (UniDic Mode C)**:
   - [https://github.com/WorksApplications/SudachiPy](https://github.com/WorksApplications/SudachiPy)
   - Tokenizes Kanji and orthographic particles (`は`, `へ`).

---

## Quick Start

### 1. Start Backend (Port 8000)
```powershell
cd backend
.\.venv\Scripts\python.exe run.py
```
Health check: `http://localhost:8000/api/health`

### 2. Start Frontend (Port 3000)
```powershell
cd frontend
npm run dev
```
Open `http://localhost:3000` in your web browser.

### Or Run Both with One Script
```powershell
.\start.ps1
```

---

## Running Automated Tests
```powershell
cd frontend
npx tsx src/tests/emielAdapter.test.ts
```
