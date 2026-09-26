import os
import csv
import logging
from typing import Dict, List, Optional
from pydantic import BaseModel

logger = logging.getLogger("nihon-kanji")

class KanjiDetails(BaseModel):
    kanji: str
    meaning: str
    onyomi: List[str]
    kunyomi: List[str]
    jlpt_level: Optional[str] = None

class KanjiService:
    def __init__(self):
        self._cache: Dict[str, KanjiDetails] = {}
        self._loaded = False

    def load_data(self):
        if self._loaded:
            return
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        # This canonical dataset stores the app's JLPT labels. The levels are
        # legacy-derived estimates documented by data-prep/create_kanji_set.py.
        csv_path = os.path.abspath(
            os.path.join(base_dir, "..", "data-prep", "kanji_correct_order.csv")
        )

        if not os.path.exists(csv_path):
            logger.warning("data-prep/kanji_correct_order.csv not found for KanjiService.")
            self._loaded = True
            return

        try:
            with open(csv_path, mode="r", encoding="utf-8-sig") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    k = row.get("Kanji", "").strip()
                    if not k:
                        continue
                    jlpt = row.get("JLPT_Level", "").strip()
                    onyomi_raw = row.get("Onyomi", "").strip()
                    kunyomi_raw = row.get("Kunyomi", "").strip()
                    meaning = row.get("English_Meaning", "").strip()

                    onyomi = [x.strip() for x in onyomi_raw.split("、") if x.strip() and x.strip() != "nan"]
                    kunyomi = [x.strip() for x in kunyomi_raw.split("、") if x.strip() and x.strip() != "nan"]

                    self._cache[k] = KanjiDetails(
                        kanji=k,
                        meaning=meaning,
                        onyomi=onyomi,
                        kunyomi=kunyomi,
                        jlpt_level=jlpt if jlpt and jlpt != "Non-JLPT" else None
                    )
            logger.info(f"Loaded {len(self._cache)} Kanji details from kanji_correct_order.csv successfully.")
        except Exception as e:
            logger.error(f"Error loading kanji_correct_order.csv: {e}")
        finally:
            self._loaded = True

    def get_kanji_details(self, kanji: str) -> Optional[KanjiDetails]:
        if not self._loaded:
            self.load_data()
        return self._cache.get(kanji)

    def get_kanji_for_word(self, word: str) -> List[KanjiDetails]:
        if not self._loaded:
            self.load_data()
        results = []
        for char in word:
            # Check CJK ideograph
            code = ord(char)
            if (0x4E00 <= code <= 0x9FFF) or (0x3400 <= code <= 0x4DBF):
                details = self.get_kanji_details(char)
                if details:
                    results.append(details)
        return results

_kanji_service: Optional[KanjiService] = None

def get_kanji_service() -> KanjiService:
    global _kanji_service
    if _kanji_service is None:
        _kanji_service = KanjiService()
        _kanji_service.load_data()
    return _kanji_service
