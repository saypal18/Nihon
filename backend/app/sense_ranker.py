import re
import logging
from typing import List, Optional, Tuple, Dict, Any
from pydantic import BaseModel

from .dictionary_service import DictionaryEntry, DictionarySense
from .disambiguator import detect_available_model, OLLAMA_BASE_URL, get_http_client

logger = logging.getLogger("nihon-sense-ranker")

# High-frequency Japanese polysemous collocation cues
COLLOCATION_RULES: Dict[str, List[Tuple[List[str], List[str], str]]] = {
    # term: [ ([context keywords], [gloss keywords], reason) ]
    "かける": [
        (["電話", "でんわ", "コール"], ["call", "telephone", "phone"], "telephone context"),
        (["眼鏡", "めがね", "メガネ", "サングラス"], ["glasses", "wear", "put on (glasses"], "eyewear context"),
        (["鍵", "かぎ", "カギ"], ["lock"], "locking context"),
        (["時間", "じかん", "お金", "費用"], ["spend", "take", "invest"], "time/money expenditure"),
        (["迷惑", "めいわく", "心配", "しんぱい"], ["cause", "inflict", "worry"], "burden/trouble context"),
        (["声", "こえ"], ["call out", "greet"], "voice/greeting context"),
        (["毛布", "布団", "ふとん"], ["cover", "wrap"], "covering context"),
        (["ブレーキ"], ["apply", "brake"], "vehicle context"),
    ],
    "掛ける": [
        (["電話", "でんわ"], ["call", "telephone", "phone"], "telephone context"),
        (["眼鏡", "めがね"], ["wear", "put on"], "eyewear context"),
        (["時間", "お金"], ["spend", "take"], "expenditure"),
    ],
    "取る": [
        (["写真", "しゃしん", "ビデオ"], ["photograph", "take (photo)", "film"], "photo context"),
        (["責任", "せきにん"], ["take (responsibility)", "assume"], "responsibility context"),
        (["年", "歳", "とし"], ["grow older", "age"], "aging context"),
        (["点", "てん", "スコア", "資格"], ["score", "earn", "obtain"], "scoring/qualification context"),
        (["連絡", "れんらく"], ["contact", "get in touch"], "contact context"),
        (["食事", "しょくじ", "朝食", "昼食", "夕食"], ["eat", "have (meal)"], "meal context"),
    ],
    "撮る": [
        (["写真", "映画", "ビデオ", "カメラ"], ["take (photo)", "photograph", "record"], "photography/filming context"),
    ],
    "つける": [
        (["気", "き"], ["careful", "pay attention"], "attention context"),
        (["火", "ひ", "電気", "でんき", "明かり", "テレビ", "エアコン"], ["turn on", "switch on", "light"], "appliance/lighting context"),
        (["薬", "くすり", "クリーム"], ["apply", "rub on", "spread"], "medicine/lotion context"),
        (["日記", "にっき", "記録", "家計簿"], ["keep", "record", "write down"], "journal/record context"),
        (["身", "み", "力", "ちから", "知識"], ["acquire", "master"], "skill acquisition"),
    ],
    "付く": [
        (["気", "き"], ["notice", "become aware"], "notice context"),
        (["火", "ひ"], ["catch fire", "ignite"], "fire context"),
    ],
    "見る": [
        (["映画", "えいが", "テレビ", "アニメ", "劇"], ["watch", "view", "see"], "viewing context"),
        (["医者", "いしゃ", "病院", "先生"], ["consult", "examine", "have (doctor) examine"], "medical consultation"),
        (["夢", "ゆめ"], ["dream", "have a dream"], "dream context"),
    ],
    "出る": [
        (["家", "部屋", "学校", "大学"], ["leave", "exit", "graduate"], "departure/graduation"),
        (["電話", "でんわ"], ["answer", "pick up"], "answering phone"),
        (["手紙", "メール", "結果"], ["arrive", "appear", "come out"], "result/mail context"),
    ]
}

class RankedSenseResult(BaseModel):
    selected_sense_index: int
    confidence: float
    context_reason: Optional[str] = None
    scores: List[float] = []

def score_senses_deterministically(
    entry: DictionaryEntry,
    sentence: str,
    target_surface: str
) -> Tuple[int, float, Optional[str], List[float]]:
    """
    Score senses of a dictionary entry based on sentence context and collocation rules.
    Returns: (best_index, confidence, context_reason, list_of_scores)
    """
    if not entry.senses:
        return 0, 0.5, None, []

    if len(entry.senses) == 1:
        return 0, 0.95, None, [1.0]

    scores = [1.0] * len(entry.senses)
    matched_reason = None
    highest_bonus = 0.0

    # Check collocation rules for target_surface or primary_kanji / primary_reading
    rule_keys = [target_surface, entry.primary_kanji, entry.primary_reading]
    for key in rule_keys:
        if not key or key not in COLLOCATION_RULES:
            continue
        rules = COLLOCATION_RULES[key]
        for ctx_keywords, gloss_keywords, reason in rules:
            if any(kw in sentence for kw in ctx_keywords):
                for s_idx, sense in enumerate(entry.senses):
                    all_glosses_lower = " ".join(sense.glosses).lower()
                    if any(gk.lower() in all_glosses_lower for gk in gloss_keywords):
                        scores[s_idx] += 10.0
                        if 10.0 > highest_bonus:
                            highest_bonus = 10.0
                            matched_reason = f"Identified {reason} from sentence context."

    best_idx = int(scores.index(max(scores)))
    if highest_bonus > 0:
        confidence = 0.92
    else:
        # Default sense 0 with moderate confidence
        confidence = 0.70

    return best_idx, confidence, matched_reason, scores

async def disambiguate_with_llm(
    sentence: str,
    expression: str,
    entry: DictionaryEntry
) -> Optional[Tuple[int, float, str]]:
    """
    Optionally use local Ollama to choose the most accurate sense among dictionary senses.
    Strictly constrained: returns sense index and brief reason.
    """
    if len(entry.senses) <= 1:
        return None

    model = await detect_available_model()
    if not model:
        return None

    senses_prompt = []
    for idx, s in enumerate(entry.senses[:6]):
        gloss_str = "; ".join(s.glosses[:3])
        senses_prompt.append(f"{idx}: {gloss_str}")

    prompt = (
        f"Target Japanese word: \"{expression}\"\n"
        f"Sentence: \"{sentence}\"\n\n"
        f"Candidate dictionary senses:\n" + "\n".join(senses_prompt) + "\n\n"
        f"Which sense index (0-{len(senses_prompt)-1}) best matches the word in this sentence? "
        f"Respond in format: INDEX: <number> | REASON: <one short English sentence>."
    )

    try:
        client = get_http_client()
        payload = {
            "model": model,
            "messages": [
                {
                    "role": "system",
                    "content": "You are a Japanese linguist assistant. Select the single best matching sense index."
                },
                {
                    "role": "user",
                    "content": prompt
                }
            ],
            "stream": False,
            "options": {"temperature": 0.1, "num_predict": 60}
        }
        res = await client.post(f"{OLLAMA_BASE_URL}/api/chat", json=payload, timeout=6.0)
        if res.status_code == 200:
            content = res.json().get("message", {}).get("content", "").strip()
            match = re.search(r"INDEX:\s*(\d+)", content)
            if match:
                selected_idx = int(match.group(1))
                if 0 <= selected_idx < len(entry.senses):
                    reason_match = re.search(r"REASON:\s*(.+)", content)
                    reason = reason_match.group(1).strip() if reason_match else "Selected by contextual language model."
                    return selected_idx, 0.90, reason
    except Exception as e:
        logger.debug(f"Ollama sense disambiguation skipped: {e}")

    return None

async def rank_senses_for_candidate(
    sentence: str,
    target_surface: str,
    entry: Optional[DictionaryEntry],
    use_llm: bool = True
) -> RankedSenseResult:
    """
    Produce the optimal sense index and contextual reason for a dictionary entry.
    """
    if not entry or not entry.senses:
        return RankedSenseResult(
            selected_sense_index=0,
            confidence=0.50,
            context_reason=None,
            scores=[]
        )

    best_idx, confidence, reason, scores = score_senses_deterministically(
        entry, sentence, target_surface
    )

    # If deterministic confidence is not definitive (no strong collocation triggered) and LLM is enabled:
    if confidence < 0.85 and use_llm and len(entry.senses) > 1:
        llm_res = await disambiguate_with_llm(sentence, target_surface, entry)
        if llm_res:
            llm_idx, llm_conf, llm_reason = llm_res
            return RankedSenseResult(
                selected_sense_index=llm_idx,
                confidence=llm_conf,
                context_reason=llm_reason,
                scores=scores
            )

    return RankedSenseResult(
        selected_sense_index=best_idx,
        confidence=confidence,
        context_reason=reason,
        scores=scores
    )
