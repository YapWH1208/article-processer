"""Skills router — list and run extraction/analysis skills."""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article
from app.services.skills.registry import SkillRegistry
from app.services.skills.default_skills import DEFAULT_SKILLS
from app.services.ai.base import get_llm_provider

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize registry with default skills
registry = SkillRegistry()
for skill in DEFAULT_SKILLS:
    registry.register(skill)


@router.get("")
def list_skills():
    """List all available skills."""
    return {"skills": [s.model_dump() for s in registry.list_all()]}


@router.post("/{skill_name}/run")
async def run_skill(
    skill_name: str,
    body: dict,
    db: Session = Depends(get_db),
):
    """Run a skill on a specific article. Body should contain article_id."""
    skill = registry.get(skill_name)
    if not skill:
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")

    article_id = body.get("article_id")
    if not article_id:
        raise HTTPException(status_code=400, detail="article_id is required")

    article = db.query(Article).filter(Article.id == article_id).first()
    if not article:
        raise HTTPException(status_code=404, detail="Article not found")

    if not article.markdown_text:
        raise HTTPException(status_code=400, detail="Article has not been processed yet")

    llm = get_llm_provider()

    result = await llm.run_skill(
        skill=skill,
        article_markdown=article.markdown_text,
    )

    return {
        "skill": skill_name,
        "article_id": article_id,
        "result": result,
    }
