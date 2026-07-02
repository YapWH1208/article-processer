"""Skill registry — manages extraction/analysis skill definitions with file persistence."""

import json
import logging
from dataclasses import dataclass, asdict
from pathlib import Path
from typing import Any

from app.core.config import settings

logger = logging.getLogger(__name__)

# File path for persisting user-created/edited skills
SKILLS_FILE = settings.data_path / "data" / "skills.json"


@dataclass
class Skill:
    """A defined skill/workflow for article analysis."""
    name: str
    purpose: str
    description: str
    input_schema: dict
    output_schema: dict
    extraction_template: str | None = None
    prompt_instructions: str = ""

    def model_dump(self) -> dict:
        return {
            "name": self.name,
            "purpose": self.purpose,
            "description": self.description,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "prompt_instructions": self.prompt_instructions,
        }

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "purpose": self.purpose,
            "description": self.description,
            "input_schema": self.input_schema,
            "output_schema": self.output_schema,
            "extraction_template": self.extraction_template,
            "prompt_instructions": self.prompt_instructions,
        }

    @classmethod
    def from_dict(cls, d: dict) -> "Skill":
        return cls(
            name=d["name"],
            purpose=d.get("purpose", ""),
            description=d.get("description", ""),
            input_schema=d.get("input_schema", {}),
            output_schema=d.get("output_schema", {}),
            extraction_template=d.get("extraction_template"),
            prompt_instructions=d.get("prompt_instructions", ""),
        )


class SkillRegistry:
    """Registry for extraction/analysis skills with file persistence."""

    def __init__(self):
        self._skills: dict[str, Skill] = {}
        self._user_skill_names: set[str] = set()  # track which skills came from file

    def register(self, skill: Skill, persist: bool = False) -> None:
        """Register a skill. If persist=True, marks it as user-created for saving."""
        self._skills[skill.name] = skill
        if persist:
            self._user_skill_names.add(skill.name)

    def unregister(self, name: str) -> bool:
        """Remove a skill. Returns False if it's a default skill (protected)."""
        if name not in self._skills:
            return False
        del self._skills[name]
        self._user_skill_names.discard(name)
        return True

    def get(self, name: str) -> Skill | None:
        return self._skills.get(name)

    def list_all(self) -> list[Skill]:
        return list(self._skills.values())

    def is_user_skill(self, name: str) -> bool:
        """Check if a skill was user-created (can be deleted)."""
        return name in self._user_skill_names

    # ── Persistence ───────────────────────────────────────────────────

    def _load_user_skills(self) -> list[dict]:
        """Load user skills from disk."""
        if not SKILLS_FILE.exists():
            return []
        try:
            data = json.loads(SKILLS_FILE.read_text(encoding="utf-8"))
            if isinstance(data, list):
                return data
        except (json.JSONDecodeError, OSError) as e:
            logger.warning(f"Failed to load skills file: {e}")
        return []

    def _save_user_skills(self) -> None:
        """Save all user-created skills to disk."""
        user_skills = [
            s.to_dict() for s in self._skills.values()
            if s.name in self._user_skill_names
        ]
        SKILLS_FILE.parent.mkdir(parents=True, exist_ok=True)
        SKILLS_FILE.write_text(json.dumps(user_skills, indent=2), encoding="utf-8")

    def load_persisted(self) -> None:
        """Load user skills from disk and register them."""
        for item in self._load_user_skills():
            try:
                skill = Skill.from_dict(item)
                self._skills[skill.name] = skill
                self._user_skill_names.add(skill.name)
            except (KeyError, TypeError) as e:
                logger.warning(f"Skipping invalid skill entry: {e}")

    def create_skill(self, data: dict) -> Skill:
        """Create a new skill from dict, persist, and register it."""
        skill = Skill.from_dict(data)
        self.register(skill, persist=True)
        self._save_user_skills()
        return skill

    def update_skill(self, name: str, data: dict) -> Skill | None:
        """Update an existing user skill. Returns None if not found."""
        if name not in self._skills:
            return None
        # Merge: keep existing values for missing keys
        existing = self._skills[name].to_dict()
        existing.update(data)
        existing["name"] = name  # name cannot change
        skill = Skill.from_dict(existing)
        self._skills[name] = skill
        if name in self._user_skill_names:
            self._save_user_skills()
        return skill

    def delete_skill(self, name: str) -> bool:
        """Delete a user skill. Refuses to delete default skills."""
        if name not in self._skills:
            return False
        if name not in self._user_skill_names:
            return False  # can't delete built-in defaults
        success = self.unregister(name)
        if success:
            self._save_user_skills()
        return success

    def export_all(self) -> list[dict]:
        """Export all skills (both default and user) as a list of dicts."""
        return [s.to_dict() for s in self._skills.values()]

    def import_skills(self, data: list[dict], overwrite: bool = False) -> dict:
        """Import skills from a list of dicts.
        Returns {"imported": N, "skipped": N, "errors": [...]}.
        """
        imported = 0
        skipped = 0
        errors: list[str] = []

        for item in data:
            try:
                skill = Skill.from_dict(item)
                if skill.name in self._skills and not overwrite:
                    skipped += 1
                    continue
                self._skills[skill.name] = skill
                self._user_skill_names.add(skill.name)
                imported += 1
            except (KeyError, TypeError) as e:
                errors.append(f"{item.get('name', 'unknown')}: {e}")

        if imported > 0:
            self._save_user_skills()
        return {"imported": imported, "skipped": skipped, "errors": errors}
