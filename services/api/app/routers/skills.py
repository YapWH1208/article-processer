"""Skills router — list, run, create, update, delete, export, import skills."""

import json
import logging
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Article
from app.services.skills.registry import SkillRegistry, Skill
from app.services.skills.default_skills import DEFAULT_SKILLS
from app.services.ai.base import get_llm_provider

logger = logging.getLogger(__name__)
router = APIRouter()

# Initialize registry with default skills, then load persisted user skills
registry = SkillRegistry()
for skill in DEFAULT_SKILLS:
    registry.register(skill, persist=False)
registry.load_persisted()


# ── List & Run ──────────────────────────────────────────────────────────

@router.get("")
def list_skills():
    """List all available skills (defaults + user-created)."""
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
        output_language=body.get("language", "en"),
    )

    return {
        "skill": skill_name,
        "article_id": article_id,
        "result": result,
    }


# ── CRUD ────────────────────────────────────────────────────────────────

@router.post("")
def create_skill(body: dict):
    """Create a new skill. Required fields: name, purpose, description, input_schema, output_schema."""
    name = body.get("name", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Skill name is required")
    if not name.replace("_", "").replace("-", "").isalnum():
        raise HTTPException(status_code=400, detail="Skill name must be alphanumeric with underscores/hyphens")

    if registry.get(name):
        raise HTTPException(status_code=409, detail=f"Skill '{name}' already exists")

    try:
        skill = registry.create_skill(body)
        return {"skill": skill.model_dump(), "message": f"Skill '{name}' created"}
    except (KeyError, TypeError) as e:
        raise HTTPException(status_code=400, detail=f"Invalid skill data: {e}")


@router.put("/{skill_name}")
def update_skill(skill_name: str, body: dict):
    """Update an existing skill. Only user-created skills can be modified."""
    if not registry.get(skill_name):
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")

    if not registry.is_user_skill(skill_name):
        # Allow editing default skills too — just mark them as user-managed
        # Clone the default into a user skill, then update
        existing = registry.get(skill_name)
        registry.register(existing, persist=True)  # mark as user skill

    try:
        updated = registry.update_skill(skill_name, body)
        if not updated:
            raise HTTPException(status_code=500, detail="Update failed")
        return {"skill": updated.model_dump(), "message": f"Skill '{skill_name}' updated"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.delete("/{skill_name}")
def delete_skill(skill_name: str):
    """Delete a skill. Built-in defaults are protected from deletion unless they've been edited."""
    if not registry.get(skill_name):
        raise HTTPException(status_code=404, detail=f"Skill '{skill_name}' not found")

    success = registry.delete_skill(skill_name)
    if not success:
        raise HTTPException(status_code=403, detail=f"Cannot delete built-in skill '{skill_name}'. Edit it first to convert it to a user skill, then delete.")

    return {"message": f"Skill '{skill_name}' deleted"}


# ── Export / Import ─────────────────────────────────────────────────────

@router.get("/export")
def export_skills():
    """Export all skills as a JSON array."""
    return {"skills": registry.export_all()}


@router.post("/import")
async def import_skills(
    file: UploadFile = File(None),
    body: dict = None,
):
    """Import skills from an uploaded JSON file or a JSON body.

    Provide either a file upload (multipart) or a JSON body with a "skills" array.
    Set ?overwrite=true to replace existing skills with the same name.
    """
    data = None

    if file:
        if not file.filename or not file.filename.endswith(".json"):
            raise HTTPException(400, "Please upload a .json file")
        try:
            content = await file.read()
            data = json.loads(content.decode("utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise HTTPException(400, "Invalid JSON file")
    elif body and "skills" in body:
        data = body["skills"]
    else:
        raise HTTPException(400, "Provide either a file upload or a JSON body with 'skills' array")

    if not isinstance(data, list):
        raise HTTPException(400, "Expected a JSON array of skills")

    overwrite = body.get("overwrite", False) if body else False
    result = registry.import_skills(data, overwrite=overwrite)
    return result
