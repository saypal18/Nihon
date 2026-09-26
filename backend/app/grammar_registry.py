import re
from typing import List, Optional, Dict, Any
from pydantic import BaseModel

class GrammarPattern(BaseModel):
    id: str
    pattern_name: str
    category: str  # "auxiliary", "particle", "conjunction", "construction"
    meaning: str
    explanation: str
    formation: Optional[str] = None
    level: Optional[str] = None  # JLPT level like N5, N4, N3

class GrammarMatch(BaseModel):
    pattern: GrammarPattern
    start_char: int
    end_char: int
    matched_text: str
    main_verb_lemma: Optional[str] = None
    auxiliary_lemma: Optional[str] = None

class ParticleInfo(BaseModel):
    particle: str
    function_name: str
    explanation: str
    context_role: str

# Curated registry of high-frequency Japanese grammatical constructions
AUXILIARY_PATTERNS = [
    {
        "id": "te_morau",
        "pattern_name": "〜てもらう",
        "category": "auxiliary",
        "meaning": "have someone do (as a favor)",
        "explanation": "Expresses receiving the favor of someone doing an action for you or someone close to you.",
        "formation": "Verb [て-form] + もらう / いただく",
        "level": "N4",
        "aux_verbs": ["もらう", "いただく", "もらえる", "もらいました", "もらった", "いただき"]
    },
    {
        "id": "te_kureru",
        "pattern_name": "〜てくれる",
        "category": "auxiliary",
        "meaning": "do (for me/us as a favor)",
        "explanation": "Expresses that someone kindly performs an action for the speaker's benefit.",
        "formation": "Verb [て-form] + くれる / くださる",
        "level": "N4",
        "aux_verbs": ["くれる", "くださる", "くれた", "くれました", "くださった"]
    },
    {
        "id": "te_ageru",
        "pattern_name": "〜てあげる",
        "category": "auxiliary",
        "meaning": "do (for someone else as a favor)",
        "explanation": "Expresses doing an action for another person's benefit.",
        "formation": "Verb [て-form] + あげる / さしあげる / やる",
        "level": "N4",
        "aux_verbs": ["あげる", "さしあげる", "やる", "あげた", "あげました"]
    },
    {
        "id": "te_shimau",
        "pattern_name": "〜てしまう",
        "category": "auxiliary",
        "meaning": "finish completely / regretful action",
        "explanation": "Expresses completing an action completely, or carrying out an unintentional action with a sense of regret.",
        "formation": "Verb [て-form] + しまう (colloquial: ちゃう / じゃう)",
        "level": "N4",
        "aux_verbs": ["しまう", "しまった", "しまいました", "ちゃう", "ちゃった", "じゃう", "じゃった"]
    },
    {
        "id": "te_iru",
        "pattern_name": "〜ている",
        "category": "auxiliary",
        "meaning": "be doing / continuous state",
        "explanation": "Indicates an ongoing progressive action or a persisting state resulting from a past action.",
        "formation": "Verb [て-form] + いる (colloquial: てる)",
        "level": "N5",
        "aux_verbs": ["いる", "います", "いた", "いました", "てる", "てます"]
    },
    {
        "id": "te_oku",
        "pattern_name": "〜ておく",
        "category": "auxiliary",
        "meaning": "do in advance / prepare",
        "explanation": "Indicates performing an action in advance in preparation for a future event.",
        "formation": "Verb [て-form] + おく (colloquial: とく)",
        "level": "N4",
        "aux_verbs": ["おく", "おきます", "おいた", "おきました", "とく", "といた"]
    },
    {
        "id": "te_miru",
        "pattern_name": "〜てみる",
        "category": "auxiliary",
        "meaning": "try doing (to see)",
        "explanation": "Indicates doing an action as an experiment or trial to see what happens.",
        "formation": "Verb [て-form] + みる",
        "level": "N4",
        "aux_verbs": ["みる", "みます", "みた", "みました"]
    },
    {
        "id": "koto_ni_naru",
        "pattern_name": "〜ことになる",
        "category": "construction",
        "meaning": "it has been decided that",
        "explanation": "Expresses an outcome or decision that has been made by external circumstances or an organization.",
        "formation": "Verb [dict-form / nai-form] + ことになる",
        "level": "N3",
        "aux_verbs": ["ことになる", "ことになった", "ことになりました"]
    },
    {
        "id": "you_ni_naru",
        "pattern_name": "〜ようになる",
        "category": "construction",
        "meaning": "come to be able to / reach a state",
        "explanation": "Indicates a gradual transition into a new state or acquiring a new ability.",
        "formation": "Verb [dict-form / potential] + ようになる",
        "level": "N3",
        "aux_verbs": ["ようになる", "ようになった", "ようになりました"]
    },
    {
        "id": "zaru_wo_enai",
        "pattern_name": "〜ざるを得ない",
        "category": "construction",
        "meaning": "cannot help but / have no choice but to",
        "explanation": "Expresses being compelled to take an action despite reluctance.",
        "formation": "Verb [未然形] + ざるを得ない",
        "level": "N2",
        "aux_verbs": ["ざるを得ない", "ざるをえません"]
    },
]

# Curated particle information
PARTICLE_DATABASE: Dict[str, Dict[str, Any]] = {
    "を": {
        "particle": "を",
        "function_name": "Direct Object Marker",
        "explanation": "Marks the direct object receiving the action of a transitive verb, or the space/path through which movement occurs.",
        "roles": {
            "default": "Marks the direct grammatical object of the verb."
        }
    },
    "に": {
        "particle": "に",
        "function_name": "Target / Time / Agent / Location of Existence",
        "explanation": "Marks a specific point in time, destination of movement, recipient of an action, agent in passive/causative sentences, or location of existence (with いる/ある).",
        "roles": {
            "destination": "Marks the destination or target of movement (e.g. going to a place).",
            "time": "Marks a specific point in time at which an event occurs.",
            "recipient": "Marks the indirect object or person receiving an action.",
            "agent": "Marks the agent performing the action in a passive or causative structure.",
            "default": "Marks target, destination, time, or recipient."
        }
    },
    "で": {
        "particle": "で",
        "function_name": "Location of Action / Means / Cause",
        "explanation": "Marks the physical location where an active event takes place, the tool/means/language used, or the reason/cause.",
        "roles": {
            "location": "Marks the location where an activity takes place.",
            "means": "Marks the tool, vehicle, instrument, or method used.",
            "cause": "Marks the reason or cause of an occurrence.",
            "default": "Marks location of activity, method, or means."
        }
    },
    "は": {
        "particle": "は",
        "function_name": "Topic / Contrast Marker",
        "explanation": "Marks the conversational topic ('as for X...'), sets the frame of reference, or establishes a contrast with something else.",
        "roles": {
            "default": "Establishes the theme or topic of the sentence ('As for...')."
        }
    },
    "が": {
        "particle": "が",
        "function_name": "Subject Marker / Identifier",
        "explanation": "Marks the grammatical subject of a predicate, identifies new information (who/what did it), or functions as a conjunctive 'but'.",
        "roles": {
            "default": "Marks the specific grammatical subject performing the state or action."
        }
    },
    "へ": {
        "particle": "へ",
        "function_name": "Direction Marker",
        "explanation": "Indicates physical direction or orientation towards a goal or destination.",
        "roles": {
            "default": "Indicates physical direction towards a destination."
        }
    },
    "と": {
        "particle": "と",
        "function_name": "Comitative / Quotation / Conditional",
        "explanation": "Functions as 'and' / 'with' connecting nouns, marks direct or indirect quotations (with 言う, 思う), or acts as a conditional clause marker.",
        "roles": {
            "default": "Connects nouns ('with', 'and') or marks quotes/thoughts."
        }
    },
    "から": {
        "particle": "から",
        "function_name": "Starting Point / Origin / Reason",
        "explanation": "Marks a starting point in space or time ('from', 'since'), or indicates cause/reason ('because').",
        "roles": {
            "default": "Indicates starting point ('from') or reason ('because')."
        }
    },
    "まで": {
        "particle": "まで",
        "function_name": "Limit / Extent",
        "explanation": "Indicates the ending boundary or limit in time or space ('until', 'as far as').",
        "roles": {
            "default": "Indicates temporal or spatial endpoint ('until', 'as far as')."
        }
    },
    "より": {
        "particle": "より",
        "function_name": "Comparison / Starting Point",
        "explanation": "Used in comparative sentences ('more than X'), or formal starting point ('from').",
        "roles": {
            "default": "Indicates comparison ('more than') or starting point."
        }
    },
    "も": {
        "particle": "も",
        "function_name": "Inclusion / Emphasis",
        "explanation": "Expresses 'also', 'too', or 'as many as/even' replacing は, が, or を.",
        "roles": {
            "default": "Expresses inclusion ('also', 'too', 'as well')."
        }
    },
    "の": {
        "particle": "の",
        "function_name": "Possessive / Attributive / Nominalizer",
        "explanation": "Links two nouns indicating possession ('s, of) or attribution; can also nominalize phrases or act as explanatory sentence-ending marker.",
        "roles": {
            "default": "Connects nouns to indicate possession or attribution ('s, of)."
        }
    }
}

def find_auxiliary_matches(morphemes_a: List[Any], sentence: str) -> List[GrammarMatch]:
    """
    Search morpheme sequence for known auxiliary verb patterns (e.g. て-form + aux).
    """
    matches: List[GrammarMatch] = []
    n = len(morphemes_a)

    for i in range(n - 1):
        m1 = morphemes_a[i]
        # Check if m1 is a verb or ends with te-form
        pos1 = m1.pos
        if not pos1 or pos1[0] != "動詞":
            continue

        # Lookahead up to 4 morphemes for auxiliary pattern
        for pat_def in AUXILIARY_PATTERNS:
            aux_verbs = pat_def["aux_verbs"]
            for j in range(i + 1, min(i + 5, n)):
                mj = morphemes_a[j]
                if mj.lemma in aux_verbs or mj.surface in aux_verbs:
                    # Verified match between i and j
                    span_start = m1.start_char
                    span_end = mj.end_char
                    matched_str = sentence[span_start:span_end]

                    pattern = GrammarPattern(
                        id=pat_def["id"],
                        pattern_name=pat_def["pattern_name"],
                        category=pat_def["category"],
                        meaning=pat_def["meaning"],
                        explanation=pat_def["explanation"],
                        formation=pat_def.get("formation"),
                        level=pat_def.get("level")
                    )

                    matches.append(GrammarMatch(
                        pattern=pattern,
                        start_char=span_start,
                        end_char=span_end,
                        matched_text=matched_str,
                        main_verb_lemma=m1.lemma,
                        auxiliary_lemma=mj.lemma
                    ))
                    break

    return matches

def get_particle_info(particle_surface: str, sentence: str = "") -> Optional[ParticleInfo]:
    """Retrieve curated particle grammatical information."""
    data = PARTICLE_DATABASE.get(particle_surface)
    if not data:
        return None

    role = data["roles"]["default"]
    # Contextual role refinement if sentence context is provided
    if particle_surface == "に":
        if any(v in sentence for v in ["行く", "行きます", "来た", "来ます", "着く"]):
            role = data["roles"]["destination"]
        elif any(v in sentence for v in ["言った", "話す", "渡す", "あげる", "もらう"]):
            role = data["roles"]["recipient"]
        elif any(v in sentence for v in ["れる", "られる", "れた", "られた"]):
            role = data["roles"]["agent"]
        elif any(v in sentence for v in ["いる", "あります", "ある", "住む"]):
            role = "Marks location of existence or residence."
    elif particle_surface == "で":
        if any(v in sentence for v in ["食べる", "勉強", "買う", "遊ぶ", "読む", "書く"]):
            role = data["roles"]["location"]
        elif any(v in sentence for v in ["バス", "電車", "車", "箸", "ペン", "英語", "日本語"]):
            role = data["roles"]["means"]

    return ParticleInfo(
        particle=particle_surface,
        function_name=data["function_name"],
        explanation=data["explanation"],
        context_role=role
    )
