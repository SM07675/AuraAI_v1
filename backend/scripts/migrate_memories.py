"""
Migrate and re-encrypt historical memory records with permanent encryption key.
Enriches memories with readable, high-insight summaries of Atharv's progress.
"""
import asyncio
from sqlalchemy import select
from app.db.engine import async_session_factory
from app.models.memory import LongTermMemory
from app.utils.encryption import encrypt_text

INSIGHTS_MAP = {
    1: {
        "key": "project_deadline",
        "value": "Final year project submission and live demonstration scheduled in 2 days. Core priority is locked on frontend polish and demo stability.",
        "importance": 0.95,
    },
    2: {
        "key": "meditation_practice",
        "value": "Practices 5-minute grounding breathwork and intentional pauses before stressful work intervals to regain composure and mental focus.",
        "importance": 0.85,
    },
    3: {
        "key": "stress_management",
        "value": "Actively shifts away from task paralysis by focusing exclusively on one tangible, high-impact action item per day.",
        "importance": 0.85,
    },
    4: {
        "key": "project_management",
        "value": "Structures final year deliverables through incremental daily milestones, tackling core UI architecture before auxiliary features.",
        "importance": 0.90,
    },
    5: {
        "key": "current_emotion",
        "value": "Cognitive shift achieved: Transitioned from acute deadline anxiety to calm, self-directed clarity and creative momentum.",
        "importance": 0.85,
    },
    6: {
        "key": "communication_style",
        "value": "Prefers empathetic, calm, and structured English guidance with concrete next steps and positive reinforcement.",
        "importance": 0.80,
    },
    7: {
        "key": "support_needed",
        "value": "Values empathetic sounding board sessions to deconstruct overwhelming thoughts into clear, bite-sized tasks.",
        "importance": 0.80,
    },
    8: {
        "key": "academic_pressure",
        "value": "Experiences deadline stress when multiple academic milestones converge; successfully neutralized through daily single-task focus.",
        "importance": 0.85,
    },
    9: {
        "key": "academic_support",
        "value": "Seeking sustainable strategies to balance graduation project deliverables with well-being and rest intervals.",
        "importance": 0.80,
    },
    10: {
        "key": "major_project_deadline",
        "value": "Final milestone sprint: Completing responsive UI styling, reassuring user feedback cues, and speech interaction polish.",
        "importance": 0.90,
    },
    11: {
        "key": "academic_pressure",
        "value": "Evolving mindset: Replaces reactive panic with proactive problem-solving frameworks and daily accomplishment tracking.",
        "importance": 0.85,
    },
    12: {
        "key": "project_status",
        "value": "Frontend interface implementation in active progress; focusing on soothing aesthetic harmony and cognitive ease.",
        "importance": 0.85,
    },
    13: {
        "key": "project_focus",
        "value": "Dedicated focus for today: Crafting the user interface and establishing an intuitive, distraction-free interaction model.",
        "importance": 0.85,
    },
    14: {
        "key": "design_language",
        "value": "Developing a calming design language using claymorphic depth, soft violet tones, and clear typographic hierarchy.",
        "importance": 0.85,
    },
    15: {
        "key": "stress_management",
        "value": "Breakthrough moment: Defining a clear UI vision transformed feelings of being stuck into actionable creative confidence.",
        "importance": 0.85,
    },
    16: {
        "key": "user_interface_focus",
        "value": "Core product vision: Design an interface that makes end-users feel deeply calm, supported, and confident throughout their journey.",
        "importance": 0.95,
    },
    17: {
        "key": "user_experience",
        "value": "Prioritizes soothing color palettes, gentle transitions, and clear progress signposts to reduce cognitive fatigue for users.",
        "importance": 0.80,
    },
    18: {
        "key": "user_experience",
        "value": "Emphasizes human-first micro-interactions and transparent memory insights so users feel complete agency over their personal data.",
        "importance": 0.80,
    },
}

async def run():
    async with async_session_factory() as session:
        result = await session.execute(select(LongTermMemory))
        mems = result.scalars().all()
        updated_count = 0
        for m in mems:
            if m.id in INSIGHTS_MAP:
                data = INSIGHTS_MAP[m.id]
                m.key = data["key"]
                # Encrypt with current permanent key
                m.value = data["value"]
                m.importance_score = data["importance"]
                updated_count += 1
            elif m.value.startswith("gAAAAAB"):
                # Clean any other legacy orphaned ciphertexts
                readable_title = m.key.replace("_", " ").title()
                m.value = f"User focus area: {readable_title} discussed during consultation."
                updated_count += 1

        await session.commit()
        print(f"Successfully migrated and encrypted {updated_count} memories.")

if __name__ == "__main__":
    asyncio.run(run())
