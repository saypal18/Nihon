import os
import sqlite3
import logging
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

logger = logging.getLogger("nihon-dictionary")

class DictionarySense(BaseModel):
    sense_index: int
    parts_of_speech: List[str] = []
    misc: List[str] = []
    info: Optional[str] = None
    glosses: List[str] = []

class DictionaryEntry(BaseModel):
    id: int
    ent_seq: str
    primary_kanji: str
    primary_reading: str
    is_common: bool
    is_name: bool = False
    name_type: Optional[str] = None
    matched_form: Optional[str] = None
    matched_form_is_reading: bool = False
    senses: List[DictionarySense] = []

class DictionaryService:
    def __init__(self, db_path: Optional[str] = None):
        if db_path is None:
            base_dir = os.path.dirname(os.path.abspath(__file__))
            db_path = os.path.join(base_dir, "data", "nihon_dictionary.db")
        self.db_path = db_path
        self._conn: Optional[sqlite3.Connection] = None
        self._lru_cache: Dict[str, List[DictionaryEntry]] = {}

    def _get_connection(self) -> sqlite3.Connection:
        if self._conn is None:
            if not os.path.exists(self.db_path):
                raise FileNotFoundError(f"Dictionary database not found at {self.db_path}. Please run build_dictionary.py first.")
            self._conn = sqlite3.connect(self.db_path, check_same_thread=False)
            self._conn.row_factory = sqlite3.Row
            # Fast in-memory caching and reading pragmas
            self._conn.execute("PRAGMA cache_size = 50000;")
            self._conn.execute("PRAGMA mmap_size = 268435456;") # 256MB mmap
        return self._conn

    def exists(self, term: str) -> bool:
        """Check if term exists in forms table."""
        if not term:
            return False
        conn = self._get_connection()
        cur = conn.cursor()
        cur.execute("SELECT 1 FROM forms WHERE form = ? LIMIT 1;", (term,))
        return cur.fetchone() is not None

    def lookup_term(self, term: str, reading: Optional[str] = None, limit: int = 10) -> List[DictionaryEntry]:
        """Lookup dictionary entries by exact surface, reading, or lemma."""
        if not term:
            return []

        cache_key = f"{term}_{reading or ''}_{limit}"
        if cache_key in self._lru_cache:
            return self._lru_cache[cache_key]

        conn = self._get_connection()
        cur = conn.cursor()

        query = """
            SELECT e.id, e.ent_seq, e.primary_kanji, e.primary_reading,
                   e.is_common, e.is_name, e.name_type, f.form,
                   MIN(f.is_reading) AS matched_form_is_reading
            FROM forms f
            JOIN entries e ON f.entry_id = e.id
            WHERE f.form = ?
            GROUP BY e.id, e.ent_seq, e.primary_kanji, e.primary_reading,
                     e.is_common, e.is_name, e.name_type, f.form
            ORDER BY matched_form_is_reading ASC, e.is_common DESC,
                     e.is_name ASC, e.id ASC
            LIMIT ?;
        """
        cur.execute(query, (term, limit))
        entry_rows = cur.fetchall()

        # If not found and reading was provided, search reading
        if not entry_rows and reading and reading != term:
            cur.execute(query, (reading, limit))
            entry_rows = cur.fetchall()

        entries: List[DictionaryEntry] = []
        for er in entry_rows:
            entry_id = er["id"]
            # Fetch senses and glosses for this entry
            cur.execute("""
                SELECT s.id as sense_id, s.sense_index, s.pos, s.misc, s.info,
                       g.gloss, g.gloss_order
                FROM senses s
                LEFT JOIN glosses g ON s.id = g.sense_id
                WHERE s.entry_id = ?
                ORDER BY s.sense_index ASC, g.gloss_order ASC;
            """, (entry_id,))
            sense_rows = cur.fetchall()

            senses_dict: Dict[int, DictionarySense] = {}
            for sr in sense_rows:
                s_id = sr["sense_id"]
                if s_id not in senses_dict:
                    pos_list = [p.strip() for p in sr["pos"].split(",") if p.strip()] if sr["pos"] else []
                    misc_list = [m.strip() for m in sr["misc"].split(",") if m.strip()] if sr["misc"] else []
                    senses_dict[s_id] = DictionarySense(
                        sense_index=sr["sense_index"],
                        parts_of_speech=pos_list,
                        misc=misc_list,
                        info=sr["info"],
                        glosses=[]
                    )
                if sr["gloss"]:
                    senses_dict[s_id].glosses.append(sr["gloss"])

            entries.append(DictionaryEntry(
                id=er["id"],
                ent_seq=er["ent_seq"],
                primary_kanji=er["primary_kanji"],
                primary_reading=er["primary_reading"],
                is_common=bool(er["is_common"]),
                is_name=bool(er["is_name"]),
                name_type=er["name_type"],
                matched_form=er["form"],
                matched_form_is_reading=bool(er["matched_form_is_reading"]),
                senses=list(senses_dict.values())
            ))

        if len(self._lru_cache) > 2000:
            self._lru_cache.clear()
        self._lru_cache[cache_key] = entries
        return entries

_dict_service: Optional[DictionaryService] = None

def get_dictionary_service() -> DictionaryService:
    global _dict_service
    if _dict_service is None:
        _dict_service = DictionaryService()
    return _dict_service
