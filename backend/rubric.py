"""Course rubrics for SpeakLab (UCUG 1504 The Art of Public Speaking).

Presets follow the syllabus Presentation table (Informative vs Persuasive).
Students pick a preset (or send a validated custom rubric) before scoring.
"""

from __future__ import annotations

from copy import deepcopy
from typing import Any

COURSE = "UCUG 1504 · The Art of Public Speaking"

# Shared delivery standards (syllabus: same wording for I and P)
_BODY = [
    "Positive, purposeful body language that complements the speech",
    "Gestures and posture enhance delivery and audience engagement",
]
_VOICE = [
    "Clear, confident voice with appropriate volume and tone",
    "Vocal variety that keeps the audience's attention",
]
_FLUENCY = [
    "Speech flows smoothly with minimal hesitations",
    "Ease and confidence in delivery",
]


def _crit(
    cid: str,
    name: str,
    max_points: float,
    look_for: list[str],
) -> dict[str, Any]:
    return {
        "id": cid,
        "name": name,
        "max_points": max_points,
        "weight": None,  # filled after total known
        "look_for": look_for,
    }


def _finalize(rubric: dict[str, Any]) -> dict[str, Any]:
    criteria = rubric["criteria"]
    total = float(sum(float(c["max_points"]) for c in criteria)) or 1.0
    for c in criteria:
        c["weight"] = round(float(c["max_points"]) / total, 4)
    rubric["scale"] = {
        "min": 0,
        "max": total,
        "label": f"0–{total:g} course points (syllabus Presentation)",
    }
    return rubric


INFORMATIVE = _finalize(
    {
        "id": "informative",
        "version": "ucug1504-informative-v1",
        "course": COURSE,
        "title": "Presentation 1 · Informative Speech",
        "assignment": "informative",
        "description": (
            "4–5 min informative speech (20% of course). "
            "Emphasizes clear organization, logical appeal, and credibility."
        ),
        "criteria": [
            _crit(
                "attention_getter",
                "Attention Getter",
                2,
                [
                    "Opening attempts to engage the audience",
                    "Clarity and some creativity in the hook",
                ],
            ),
            _crit(
                "thesis_statement",
                "Thesis Statement",
                2,
                [
                    "Thesis is clear, concise",
                    "Directly addresses the speech’s purpose or argument",
                ],
            ),
            _crit(
                "rhetorical_devices",
                "Rhetorical Devices",
                1,
                [
                    "Some use of devices such as metaphors or analogies",
                ],
            ),
            _crit(
                "organization",
                "Organization",
                3,
                [
                    "Structure is clear; ideas are easy to follow",
                    "Signaling / transition words guide the listener",
                ],
            ),
            _crit(
                "logical_appeal",
                "Logical Appeal",
                2,
                [
                    "Strong arguments that facilitate clarity or precision",
                    "Claims supported in ways the audience can follow",
                ],
            ),
            _crit(
                "emotional_appeal",
                "Emotional Appeal",
                1,
                [
                    "Emotional appeals are attempted to resonate with the audience",
                ],
            ),
            _crit(
                "credibility",
                "Credibility",
                2,
                [
                    "Credibility via expertise, experience, or reliable sources",
                    "Sources/experience reinforce the argument",
                ],
            ),
            _crit(
                "eye_contact",
                "Eye Contact",
                1,
                ["Consistent eye contact with the audience / camera"],
            ),
            _crit("body_language", "Body Language", 2, list(_BODY)),
            _crit("voice", "Voice", 2, list(_VOICE)),
            _crit("fluency", "Fluency", 2, list(_FLUENCY)),
        ],
    }
)

PERSUASIVE = _finalize(
    {
        "id": "persuasive",
        "version": "ucug1504-persuasive-v1",
        "course": COURSE,
        "title": "Presentation 2 · Persuasive Speech",
        "assignment": "persuasive",
        "description": (
            "4–5 min persuasive speech (20% of course). "
            "Heavier weight on eye contact and emotional appeal; "
            "thesis / organization / logos slightly lighter than informative."
        ),
        "criteria": [
            _crit(
                "attention_getter",
                "Attention Getter",
                2,
                [
                    "Opening effectively grabs attention",
                    "Creative or thought-provoking approach",
                ],
            ),
            _crit(
                "thesis_statement",
                "Thesis Statement",
                1,
                [
                    "Thesis is clear",
                    "Explicitly or implicitly addresses purpose/argument",
                ],
            ),
            _crit(
                "rhetorical_devices",
                "Rhetorical Devices",
                1,
                [
                    "Metaphors, analogies, repetition, or similar devices",
                    "Devices enhance persuasive impact",
                ],
            ),
            _crit(
                "organization",
                "Organization",
                2,
                [
                    "Logically structured",
                    "Ideas flow coherently and naturally",
                ],
            ),
            _crit(
                "logical_appeal",
                "Logical Appeal",
                1,
                [
                    "Clear, well-supported arguments with facts and reasoning",
                    "Demonstrates logical appeal (logos)",
                ],
            ),
            _crit(
                "emotional_appeal",
                "Emotional Appeal",
                2,
                [
                    "Emotional appeals connect with the audience",
                    "Pathos strengthens persuasion",
                ],
            ),
            _crit(
                "credibility",
                "Credibility",
                1,
                [
                    "Credibility is clear and convincing",
                    "Personal style / ethos supports the message",
                ],
            ),
            _crit(
                "eye_contact",
                "Eye Contact",
                4,
                [
                    "Consistent, purposeful eye contact",
                    "Engages the audience and strengthens connection to the message",
                ],
            ),
            _crit("body_language", "Body Language", 2, list(_BODY)),
            _crit("voice", "Voice", 2, list(_VOICE)),
            _crit("fluency", "Fluency", 2, list(_FLUENCY)),
        ],
    }
)

GENERIC = {
    "id": "generic",
    "version": "generic-v1",
    "course": COURSE,
    "title": "General practice (1–5 scale)",
    "assignment": "practice",
    "description": (
        "Lightweight practice rubric (not the official syllabus point table). "
        "Useful for early rehearsals before choosing Informative or Persuasive."
    ),
    "scale": {"min": 1, "max": 5, "label": "1=needs work … 5=excellent"},
    "criteria": [
        {
            "id": "structure",
            "name": "Structure & Organization",
            "max_points": 5,
            "weight": 0.20,
            "look_for": [
                "Clear opening that states purpose",
                "Logical body with transitions",
                "Memorable closing / call to action",
            ],
        },
        {
            "id": "content",
            "name": "Content & Argument",
            "max_points": 5,
            "weight": 0.20,
            "look_for": [
                "Relevant examples and evidence",
                "Audience-aware wording",
                "Depth without filler",
            ],
        },
        {
            "id": "language",
            "name": "Language & Clarity",
            "max_points": 5,
            "weight": 0.15,
            "look_for": [
                "Precise vocabulary",
                "Varied sentence rhythm",
                "Minimal verbal fillers (um/uh/like)",
            ],
        },
        {
            "id": "delivery_voice",
            "name": "Voice & Timing",
            "max_points": 5,
            "weight": 0.20,
            "look_for": [
                "Projection and clarity",
                "Pacing and strategic pauses",
                "Energy matching the message",
            ],
        },
        {
            "id": "delivery_body",
            "name": "Presence & Body Language",
            "max_points": 5,
            "weight": 0.15,
            "look_for": [
                "Eye contact / camera engagement",
                "Purposeful gestures",
                "Posture and stage use",
            ],
        },
        {
            "id": "engagement",
            "name": "Audience Engagement",
            "max_points": 5,
            "weight": 0.10,
            "look_for": [
                "Hooks and rhetorical questions",
                "Storytelling or vivid imagery",
                "Confidence and authenticity",
            ],
        },
    ],
}

RUBRICS: dict[str, dict[str, Any]] = {
    "informative": INFORMATIVE,
    "persuasive": PERSUASIVE,
    "generic": GENERIC,
}

DEFAULT_RUBRIC_ID = "informative"

# Back-compat for older imports
RUBRIC = INFORMATIVE


def list_rubrics() -> list[dict[str, Any]]:
    out = []
    for rid, r in RUBRICS.items():
        out.append(
            {
                "id": rid,
                "title": r["title"],
                "version": r["version"],
                "assignment": r.get("assignment"),
                "description": r.get("description", ""),
                "scale": r["scale"],
                "criterion_count": len(r["criteria"]),
                "total_points": r["scale"]["max"],
            }
        )
    return out


def get_rubric(rubric_id: str | None = None) -> dict[str, Any]:
    rid = (rubric_id or DEFAULT_RUBRIC_ID).strip().lower()
    if rid not in RUBRICS:
        raise KeyError(rid)
    return deepcopy(RUBRICS[rid])


def rubric_prompt_block(rubric: dict[str, Any]) -> str:
    scale = rubric["scale"]
    lines = [
        f"Course: {rubric.get('course', COURSE)}",
        f"Rubric: {rubric.get('title', rubric.get('id', ''))} ({rubric.get('version', '')})",
        f"Scale: {scale.get('label')} (min={scale.get('min')}, max={scale.get('max')})",
        "Score EACH criterion with a numeric score from 0 up to that criterion's max_points "
        "(do not exceed max_points). overall_score should be the SUM of criterion scores "
        f"(target range 0–{scale.get('max')}).",
        "Criteria:",
    ]
    for c in rubric["criteria"]:
        looks = "; ".join(c["look_for"])
        lines.append(
            f"- {c['id']} | {c['name']} | max_points={c['max_points']} | "
            f"weight≈{c.get('weight')} | look for: {looks}"
        )
    return "\n".join(lines)


def schema_hint_for(rubric: dict[str, Any]) -> dict[str, Any]:
    ids = "|".join(c["id"] for c in rubric["criteria"])
    scale_max = rubric["scale"]["max"]
    return {
        "overall_score": f"number 0–{scale_max} (sum of criterion scores; one decimal ok)",
        "summary": "2-4 sentence overall coaching summary in English",
        "strengths": ["3 concrete strengths"],
        "improvements": ["3 prioritized improvements"],
        "criteria": [
            {
                "id": ids,
                "score": "0..max_points for that criterion",
                "feedback": "specific feedback in English",
                "evidence": ["short evidence notes"],
            }
        ],
        "coach_checklist": ["5 short next-practice drills"],
    }


def validate_custom_rubric(raw: dict[str, Any]) -> dict[str, Any]:
    """Validate a student/TA-supplied rubric override."""
    if not isinstance(raw, dict):
        raise ValueError("rubric must be an object")
    title = str(raw.get("title") or "Custom rubric").strip()[:120]
    criteria_in = raw.get("criteria")
    if not isinstance(criteria_in, list) or not (1 <= len(criteria_in) <= 16):
        raise ValueError("criteria must be a list of 1–16 items")
    criteria: list[dict[str, Any]] = []
    seen: set[str] = set()
    for i, item in enumerate(criteria_in):
        if not isinstance(item, dict):
            raise ValueError(f"criteria[{i}] invalid")
        cid = str(item.get("id") or f"c{i+1}").strip().lower().replace(" ", "_")[:40]
        if not cid or cid in seen:
            raise ValueError(f"duplicate or empty criterion id: {cid}")
        seen.add(cid)
        name = str(item.get("name") or cid).strip()[:80]
        try:
            max_points = float(item.get("max_points", item.get("weight", 1)))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"criteria[{i}].max_points invalid") from exc
        if max_points <= 0 or max_points > 20:
            raise ValueError(f"criteria[{i}].max_points out of range")
        looks = item.get("look_for") or []
        if isinstance(looks, str):
            looks = [looks]
        if not isinstance(looks, list) or not looks:
            raise ValueError(f"criteria[{i}].look_for required")
        look_for = [str(x).strip()[:200] for x in looks if str(x).strip()][:8]
        criteria.append(_crit(cid, name, max_points, look_for))
    rubric = {
        "id": "custom",
        "version": "custom-v1",
        "course": COURSE,
        "title": title,
        "assignment": "custom",
        "description": str(raw.get("description") or "Student/TA custom rubric")[:300],
        "criteria": criteria,
    }
    return _finalize(rubric)
