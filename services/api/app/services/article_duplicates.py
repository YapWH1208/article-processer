"""Article duplicate detection helpers."""

from sqlalchemy.orm import Session

from app.db.models import Article


def find_active_article_by_hash(db: Session, file_hash: str | None) -> Article | None:
    if not file_hash:
        return None

    return (
        db.query(Article)
        .filter(
            Article.file_hash == file_hash,
            Article.deleted_at.is_(None),
        )
        .first()
    )
