from typing import List, Optional, Any
from pydantic import BaseModel

class InflectedComponent(BaseModel):
    surface: str
    lemma: str
    role: str

class InflectionAnalysis(BaseModel):
    base_verb: str
    verb_type: Optional[str] = None
    form_name: str
    description: str
    components: List[InflectedComponent] = []

VERB_TYPE_NAMES = {
    "一段": "Ichidan verb (ru-verb)",
    "五段": "Godan verb (u-verb)",
    "サ行変格": "Suru irregular verb",
    "カ行変格": "Kuru irregular verb",
    "形容詞": "I-adjective",
}

FORM_DESCRIPTIONS = {
    "過去形": "Past tense (た-form)",
    "連用形": "Conjunctive / stem form (ます-stem)",
    "未然形": "Negative / imperfective base (未然形)",
    "終止形": "Dictionary / terminal form",
    "連体形": "Attributive form (modifying a noun)",
    "仮定形": "Hypothetical / conditional form (ば-form)",
    "命令形": "Imperative form",
}

def analyze_inflection_chain(morphemes: List[Any]) -> Optional[InflectionAnalysis]:
    """
    Given a sequence of morphemes forming a predicate (verb/adjective + auxiliaries),
    return a structured inflection breakdown.
    """
    if not morphemes:
        return None

    head = morphemes[0]
    head_pos = head.pos[0] if head.pos else ""
    if head_pos not in ["動詞", "形容詞"]:
        return None

    verb_type = None
    if head.inflection_type:
        for k, v in VERB_TYPE_NAMES.items():
            if k in head.inflection_type:
                verb_type = v
                break
        if not verb_type:
            verb_type = head.inflection_type

    components: List[InflectedComponent] = [
        InflectedComponent(
            surface=head.surface,
            lemma=head.lemma,
            role="Base stem"
        )
    ]

    features = []
    has_causative = False
    has_passive = False
    has_negative = False
    has_polite = False
    has_past = False
    has_te = False
    has_potential = False

    for m in morphemes[1:]:
        s = m.surface
        lem = m.lemma
        m_pos = m.pos[0] if m.pos else ""

        if lem in ["せる", "させる"]:
            has_causative = True
            components.append(InflectedComponent(surface=s, lemma=lem, role="Causative (make/let)"))
        elif lem in ["れる", "られる"]:
            if has_causative:
                features.append("causative-passive")
                components.append(InflectedComponent(surface=s, lemma=lem, role="Passive (be made to)"))
            else:
                has_passive = True
                components.append(InflectedComponent(surface=s, lemma=lem, role="Passive / Potential"))
        elif lem in ["ない", "ぬ", "ず"]:
            has_negative = True
            components.append(InflectedComponent(surface=s, lemma=lem, role="Negative"))
        elif lem in ["ます", "です"]:
            has_polite = True
            components.append(InflectedComponent(surface=s, lemma=lem, role="Polite (丁寧語)"))
        elif lem in ["た", "だ"]:
            has_past = True
            components.append(InflectedComponent(surface=s, lemma=lem, role="Past tense (完了/過去)"))
        elif lem in ["て", "で"]:
            has_te = True
            components.append(InflectedComponent(surface=s, lemma=lem, role="Te-form (conjunctive)"))
        elif lem in ["たい"]:
            components.append(InflectedComponent(surface=s, lemma=lem, role="Desire (want to)"))
            features.append("desiderative")
        elif lem in ["う", "よう"]:
            components.append(InflectedComponent(surface=s, lemma=lem, role="Volitional (let's / will)"))
            features.append("volitional")

    # Assemble summary description
    summary_parts = []
    if has_causative and "causative-passive" in features:
        summary_parts.append("causative-passive (was made to do)")
    else:
        if has_causative:
            summary_parts.append("causative (make/let do)")
        if has_passive:
            summary_parts.append("passive / potential")

    if has_potential and "passive / potential" not in summary_parts:
        summary_parts.append("potential (can do)")

    if has_negative:
        summary_parts.append("negative")
    if has_polite:
        summary_parts.append("polite")
    if has_past:
        summary_parts.append("past tense")
    elif has_te:
        summary_parts.append("te-form")

    if not summary_parts:
        # Check inflection form of head
        if head.inflection_form:
            for k, desc in FORM_DESCRIPTIONS.items():
                if k in head.inflection_form:
                    summary_parts.append(desc)
                    break
        if not summary_parts:
            summary_parts.append("Dictionary / plain form")

    form_title = " + ".join([p.capitalize() for p in summary_parts])
    full_desc = f"{head.lemma} ({verb_type or 'Verb'}) in {' + '.join(summary_parts)}."

    return InflectionAnalysis(
        base_verb=head.lemma,
        verb_type=verb_type,
        form_name=form_title,
        description=full_desc,
        components=components
    )
