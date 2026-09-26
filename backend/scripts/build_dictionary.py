import os
import sys
import json
import sqlite3
import zipfile
import time

def build_dictionary(
    jmdict_zip_path: str,
    jmnedict_zip_path: str,
    output_db_path: str,
    include_names: bool = True
):
    print(f"Building Nihon SQLite Dictionary at: {output_db_path}")
    t0 = time.time()

    if os.path.exists(output_db_path):
        os.remove(output_db_path)

    conn = sqlite3.connect(output_db_path)
    cur = conn.cursor()

    cur.execute("PRAGMA synchronous = OFF;")
    cur.execute("PRAGMA journal_mode = MEMORY;")
    cur.execute("PRAGMA cache_size = 100000;")

    # Schema
    cur.execute("""
    CREATE TABLE entries (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        ent_seq TEXT,
        primary_kanji TEXT,
        primary_reading TEXT,
        is_common INTEGER,
        is_name INTEGER DEFAULT 0,
        name_type TEXT
    );
    """)

    cur.execute("""
    CREATE TABLE forms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER,
        form TEXT,
        reading TEXT,
        is_reading INTEGER,
        is_primary INTEGER,
        is_common INTEGER
    );
    """)

    cur.execute("""
    CREATE TABLE senses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        entry_id INTEGER,
        sense_index INTEGER,
        pos TEXT,
        misc TEXT,
        info TEXT
    );
    """)

    cur.execute("""
    CREATE TABLE glosses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sense_id INTEGER,
        gloss_order INTEGER,
        gloss TEXT
    );
    """)

    # 1. Ingest JMdict
    print("Reading JMdict JSON...")
    with zipfile.ZipFile(jmdict_zip_path) as zf:
        json_file_name = [n for n in zf.namelist() if n.endswith('.json')][0]
        with zf.open(json_file_name) as f:
            jmdict_data = json.load(f)

    words = jmdict_data.get("words", [])
    print(f"Ingesting {len(words)} JMdict entries...")

    entry_rows = []
    form_rows = []
    sense_rows = []
    gloss_rows = []

    current_entry_id = 0
    current_sense_id = 0

    for w in words:
        current_entry_id += 1
        ent_seq = w.get("id", "")
        kanjis = w.get("kanji", [])
        kanas = w.get("kana", [])
        senses = w.get("sense", [])

        primary_kanji = kanjis[0].get("text") if kanjis else (kanas[0].get("text") if kanas else "")
        primary_reading = kanas[0].get("text") if kanas else ""

        is_common = 1 if (
            any(k.get("common", False) for k in kanjis) or
            any(k.get("common", False) for k in kanas)
        ) else 0

        entry_rows.append((
            current_entry_id,
            ent_seq,
            primary_kanji,
            primary_reading,
            is_common,
            0, # is_name
            None # name_type
        ))

        # Forms
        added_forms = set()
        for idx, k in enumerate(kanjis):
            txt = k.get("text")
            if txt and txt not in added_forms:
                added_forms.add(txt)
                form_rows.append((
                    current_entry_id,
                    txt,
                    primary_reading,
                    0, # is_reading
                    1 if idx == 0 else 0,
                    1 if k.get("common", False) else 0
                ))

        for idx, r in enumerate(kanas):
            txt = r.get("text")
            if txt and txt not in added_forms:
                added_forms.add(txt)
                form_rows.append((
                    current_entry_id,
                    txt,
                    txt,
                    1, # is_reading
                    1 if idx == 0 else 0,
                    1 if r.get("common", False) else 0
                ))

        # Senses
        for s_idx, s in enumerate(senses):
            current_sense_id += 1
            pos_list = s.get("partOfSpeech", [])
            misc_list = s.get("misc", [])
            info_list = s.get("info", [])

            pos_str = ", ".join(pos_list)
            misc_str = ", ".join(misc_list)
            info_str = "; ".join(info_list) if info_list else None

            sense_rows.append((
                current_sense_id,
                current_entry_id,
                s_idx,
                pos_str,
                misc_str,
                info_str
            ))

            for g_idx, g in enumerate(s.get("gloss", [])):
                gloss_text = g.get("text", "")
                if gloss_text:
                    gloss_rows.append((
                        current_sense_id,
                        g_idx,
                        gloss_text
                    ))

    print("Writing JMdict rows to SQLite...")
    cur.executemany("INSERT INTO entries VALUES (?,?,?,?,?,?,?)", entry_rows)
    cur.executemany("INSERT INTO forms (entry_id, form, reading, is_reading, is_primary, is_common) VALUES (?,?,?,?,?,?)", form_rows)
    cur.executemany("INSERT INTO senses VALUES (?,?,?,?,?,?)", sense_rows)
    cur.executemany("INSERT INTO glosses (sense_id, gloss_order, gloss) VALUES (?,?,?)", gloss_rows)

    del entry_rows, form_rows, sense_rows, gloss_rows, words, jmdict_data

    # 2. Ingest JMnedict (Names)
    if include_names and os.path.exists(jmnedict_zip_path):
        print("Reading JMnedict JSON...")
        with zipfile.ZipFile(jmnedict_zip_path) as zf:
            json_file_name = [n for n in zf.namelist() if n.endswith('.json')][0]
            with zf.open(json_file_name) as f:
                jmnedict_data = json.load(f)

        name_words = jmnedict_data.get("words", [])
        print(f"Total JMnedict entries: {len(name_words)}. Filtering common name types...")

        entry_rows = []
        form_rows = []
        sense_rows = []
        gloss_rows = []

        allowed_name_types = {'surname', 'place', 'person', 'given', 'station', 'organization', 'company'}

        for w in name_words:
            kanjis = w.get("kanji", [])
            kanas = w.get("kana", [])
            translations = w.get("translation", [])

            types_present = set()
            for t in translations:
                types_present.update(t.get("type", []))

            # Only ingest relevant names (reduces noise)
            relevant_types = types_present.intersection(allowed_name_types)
            if not relevant_types:
                continue

            current_entry_id += 1
            ent_seq = w.get("id", "")
            primary_kanji = kanjis[0].get("text") if kanjis else (kanas[0].get("text") if kanas else "")
            primary_reading = kanas[0].get("text") if kanas else ""
            name_type_str = ", ".join(sorted(relevant_types))

            entry_rows.append((
                current_entry_id,
                ent_seq,
                primary_kanji,
                primary_reading,
                0, # is_common
                1, # is_name
                name_type_str
            ))

            added_forms = set()
            for idx, k in enumerate(kanjis):
                txt = k.get("text")
                if txt and txt not in added_forms:
                    added_forms.add(txt)
                    form_rows.append((
                        current_entry_id,
                        txt,
                        primary_reading,
                        0,
                        1 if idx == 0 else 0,
                        0
                    ))

            for idx, r in enumerate(kanas):
                txt = r.get("text")
                if txt and txt not in added_forms:
                    added_forms.add(txt)
                    form_rows.append((
                        current_entry_id,
                        txt,
                        txt,
                        1,
                        1 if idx == 0 else 0,
                        0
                    ))

            for s_idx, t in enumerate(translations):
                current_sense_id += 1
                t_types = ", ".join(t.get("type", []))
                sense_rows.append((
                    current_sense_id,
                    current_entry_id,
                    s_idx,
                    t_types or "name",
                    "name",
                    None
                ))

                for g_idx, tr in enumerate(t.get("translation", [])):
                    tr_text = tr.get("text", "")
                    if tr_text:
                        gloss_rows.append((
                            current_sense_id,
                            g_idx,
                            tr_text
                        ))

        print(f"Writing {len(entry_rows)} JMnedict rows to SQLite...")
        cur.executemany("INSERT INTO entries VALUES (?,?,?,?,?,?,?)", entry_rows)
        cur.executemany("INSERT INTO forms (entry_id, form, reading, is_reading, is_primary, is_common) VALUES (?,?,?,?,?,?)", form_rows)
        cur.executemany("INSERT INTO senses VALUES (?,?,?,?,?,?)", sense_rows)
        cur.executemany("INSERT INTO glosses (sense_id, gloss_order, gloss) VALUES (?,?,?)", gloss_rows)

        del entry_rows, form_rows, sense_rows, gloss_rows, name_words, jmnedict_data

    # 3. Create Indexes
    print("Creating database indexes...")
    cur.execute("CREATE INDEX idx_forms_form ON forms(form);")
    cur.execute("CREATE INDEX idx_forms_entry ON forms(entry_id);")
    cur.execute("CREATE INDEX idx_senses_entry ON senses(entry_id);")
    cur.execute("CREATE INDEX idx_glosses_sense ON glosses(sense_id);")
    cur.execute("CREATE INDEX idx_entries_seq ON entries(ent_seq);")

    conn.commit()
    conn.close()

    db_size = os.path.getsize(output_db_path) / (1024 * 1024)
    print(f"Database build complete in {time.time() - t0:.2f}s! DB size: {db_size:.2f} MB")

if __name__ == "__main__":
    base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    jmdict_zip = os.path.join(base_dir, "app", "data", "jmdict-eng.zip")
    jmnedict_zip = os.path.join(base_dir, "app", "data", "jmnedict-all.zip")
    output_db = os.path.join(base_dir, "app", "data", "nihon_dictionary.db")

    build_dictionary(jmdict_zip, jmnedict_zip, output_db, include_names=True)
