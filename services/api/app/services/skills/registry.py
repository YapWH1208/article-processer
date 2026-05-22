"""Skill registry — manages extraction/analysis skill definitions."""

from dataclasses import dataclass
from typing import Any
import logging

logger = logging.getLogger(__name__)


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
        }


class SkillRegistry:
    """Registry for extraction/analysis skills."""

    def __init__(self):
        self._skills: dict[str, Skill] = {}

    def register(self, skill: Skill) -> None:
        if skill.name in self._skills:
            logger.warning(f"Skill '{skill.name}' already registered, overwriting")
        self._skills[skill.name] = skill

    def get(self, name: str) -> Skill | None:
        return self._skills.get(name)

    def list_all(self) -> list[Skill]:
        return list(self._skills.values())
