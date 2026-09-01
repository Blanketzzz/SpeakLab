"""Generic public-speaking rubric — replace with course criteria later."""

from __future__ import annotations

RUBRIC = {
    "version": "generic-v1",
    "course": "The Art of Public Speaking",
    "scale": {"min": 1, "max": 5, "label": "1=needs work … 5=excellent"},
    "criteria": [
        {
            "id": "structure",
            "name": "Structure & Organization",
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
            "weight": 0.10,
            "look_for": [
                "Hooks and rhetorical questions",
                "Storytelling or vivid imagery",
                "Confidence and authenticity",
            ],
        },
    ],
}


def rubric_prompt_block() -> str:
    lines = [
        f"Course: {RUBRIC['course']}",
        f"Scale: {RUBRIC['scale']['label']}",
        "Criteria:",
    ]
    for c in RUBRIC["criteria"]:
        looks = "; ".join(c["look_for"])
        lines.append(
            f"- {c['id']} | {c['name']} | weight={c['weight']} | look for: {looks}"
        )
    return "\n".join(lines)
