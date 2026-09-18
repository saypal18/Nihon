import asyncio
import time
from app.parser import parse_japanese_text
from app.disambiguator import detect_available_model

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

        status = "✓ PASS" if found_reading == expected_reading else "✗ FAIL"
        if found_reading == expected_reading:
            passed += 1

        print(f"[{status}] \"{sentence}\"")
        print(f"       Word: '{target_word}' | Result: {found_reading} | Expected: {expected_reading}")
        if candidates:
            print(f"       Candidates: {candidates} | Disambiguated by LLM: {disambiguated}")
        print(f"       Latency: {elapsed_ms:.1f}ms\n")

    print(f"=== Final Score: {passed}/{total} passed ===")

if __name__ == "__main__":
    asyncio.run(main())
