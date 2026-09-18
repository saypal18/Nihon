import gzip
import urllib.request
import xml.etree.ElementTree as ET
import pandas as pd

# 1. Download KANJIDIC2 XML
url = "http://www.edrdg.org/kanjidic/kanjidic2.xml.gz"
archive_name = "kanjidic2.xml.gz"
print("Downloading KANJIDIC2...")
urllib.request.urlretrieve(url, archive_name)

raw_records = []


# 2. Re-map legacy JLPT + Grade to Modern N5-N1
def resolve_modern_jlpt(old_jlpt, grade):
    if old_jlpt == "4":
        return "N5"  # Old Level 4 = Modern N5 (~103 kanji)
    elif old_jlpt == "3":
        return "N4"  # Old Level 3 = Modern N4 (~180 kanji)
    elif old_jlpt == "2":
        return "N3" if grade in [3, 4] else "N2"  # Split Level 2 across N3/N2
    elif old_jlpt == "1":
        return "N1"  # Old Level 1 = Modern N1
    else:
        # Post-2010 Joyo additions (like 埼, 岡, 栃, 麺)
        return "N1" if grade == 8 else "N2"


# Priority map: 1 is easiest (Set 1), 5 is advanced (Set 214)
LEVEL_PRIORITY = {"N5": 1, "N4": 2, "N3": 3, "N2": 4, "N1": 5}

# 3. Parse XML
with gzip.open(archive_name, "rb") as f:
    context = ET.iterparse(f, events=("end",))
    for event, elem in context:
        if elem.tag == "character":
            kanji = elem.findtext("literal")
            grade = elem.findtext(".//misc/grade")
            old_jlpt = elem.findtext(".//misc/jlpt")

            # Filter for official Jōyō kanji (Grades 1-8)
            if grade and int(grade) <= 8:
                grade_int = int(grade)
                jlpt_tier = resolve_modern_jlpt(old_jlpt, grade_int)

                onyomi, kunyomi, meanings = [], [], []

                for rm in elem.findall(".//reading_meaning/rmgroup"):
                    for r in rm.findall("reading"):
                        if r.get("r_type") == "ja_on":
                            onyomi.append(r.text)
                        elif r.get("r_type") == "ja_kun":
                            kunyomi.append(r.text)
                    for m in rm.findall("meaning"):
                        if "m_lang" not in m.attrib:
                            meanings.append(m.text)

                raw_records.append(
                    {
                        "Kanji": kanji,
                        "JLPT_Level": jlpt_tier,
                        "Priority": LEVEL_PRIORITY[jlpt_tier],
                        "Grade": grade_int,
                        "Onyomi": "、".join(onyomi) if onyomi else "",
                        "Kunyomi": "、".join(kunyomi) if kunyomi else "",
                        "English_Meaning": "; ".join(meanings)
                        if meanings
                        else "",
                    }
                )
            elem.clear()

# 4. Sort: Priority ascending (N5 -> N4 -> N3 -> N2 -> N1), then School Grade, then Kanji
raw_records.sort(key=lambda x: (x["Priority"], x["Grade"], x["Kanji"]))

# 5. Group into sets of 10
KANJI_PER_SET = 10
final_dataset = []

for idx, item in enumerate(raw_records):
    final_dataset.append(
        {
            "Set_ID": (idx // KANJI_PER_SET) + 1,
            "JLPT_Level": item["JLPT_Level"],
            "Kanji": item["Kanji"],
            "Onyomi": item["Onyomi"],
            "Kunyomi": item["Kunyomi"],
            "English_Meaning": item["English_Meaning"],
        }
    )

# 6. Save final CSV with requested columns
df = pd.DataFrame(final_dataset)[
    ["Set_ID", "JLPT_Level", "Kanji", "Onyomi", "Kunyomi", "English_Meaning"]
]
df.to_csv("kanji_correct_order.csv", index=False, encoding="utf-8-sig")

print(f"Generated {len(df)} kanji across {df['Set_ID'].max()} sets.")