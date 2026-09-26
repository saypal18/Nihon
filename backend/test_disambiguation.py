import sys
import asyncio
import time

sys.stdout.reconfigure(encoding='utf-8')

from app.parser import parse_japanese_text
from app.disambiguator import detect_available_model
from app.tts import synthesize_speech, is_voicevox_running, get_tts_status

TEST_CASES = [
    ("四月一日に会いましょう。", "一日", "ついたち"),
    ("あと一日だけ待ってください。", "一日", "いちにち"),
    ("角を右に曲がってください。", "角", "かど"),
    ("牛の角はとても鋭い。", "角", "つの"),
    ("彼はピアノがとても上手だ。", "上手", "じょうず"),
    ("生物の進化について学ぶ。", "生物", "せいぶつ"),
    ("新鮮な魚を市場で買う。", "市場", "いちば"),
    ("秋の紅葉を見に行く。", "紅葉", "こうよう"),
    ("下へ下りたり登ったりする。", "下り", "おり"),
    ("十分な睡眠をとることが大切です。", "十分", "じゅうぶん"),
]

async def main():
    print("=== Testing Local LLM Disambiguation (RTX 5070 Ti) ===")
    model = await detect_available_model()
    print(f"Active Ollama Model: {model}\n")

    passed = 0
    total = len(TEST_CASES)

    for sentence, target_word, expected_reading in TEST_CASES:
        t0 = time.perf_counter()
        parsed = await parse_japanese_text(sentence)
        elapsed_ms = (time.perf_counter() - t0) * 1000

        found_reading = None
        disambiguated = False
        candidates = None

        for s in parsed:
            for t in s.tokens:
                if t.surface == target_word:
                    found_reading = t.hiragana
                    disambiguated = t.disambiguated
                    candidates = t.candidates
                    break

        status = "[PASS]" if found_reading == expected_reading else "[FAIL]"
        if found_reading == expected_reading:
            passed += 1

        print(f"{status} \"{sentence}\"")
        print(f"       Word: '{target_word}' | Result: {found_reading} | Expected: {expected_reading}")
        if candidates:
            print(f"       Candidates: {candidates} | Disambiguated by LLM: {disambiguated}")
        print(f"       Sentence Katakana: {parsed[0].katakana} | TTS Kana: {parsed[0].tts_kana}")
        print(f"       Latency: {elapsed_ms:.1f}ms\n")

    print(f"=== Disambiguation Score: {passed}/{total} passed ===")

    # Test VOICEVOX Speech Synthesis
    print("\n=== Testing VOICEVOX Local Speech Synthesis ===")
    vv_status = get_tts_status()
    print(f"VOICEVOX Available: {vv_status['available']}, Engine: {vv_status['engine']}, Speakers: {vv_status['speakers_count']}")
    
    if is_voicevox_running():
        test_sentence = "四月一日に会いましょう。"
        parsed = await parse_japanese_text(test_sentence)
        tts_kana = parsed[0].tts_kana
        print(f"Synthesizing '{test_sentence}' using canonical TTS Kana '{tts_kana}'...")
        t_tts = time.perf_counter()
        audio_bytes = synthesize_speech(text=test_sentence, kana=tts_kana, speaker=3)
        tts_ms = (time.perf_counter() - t_tts) * 1000
        print(f"[PASS] VOICEVOX synthesis succeeded! Generated {len(audio_bytes)} WAV bytes in {tts_ms:.1f}ms.")
    else:
        print("[WARN] VOICEVOX is not running; synthesis test skipped.")

if __name__ == "__main__":
    asyncio.run(main())
