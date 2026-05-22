"""Neo4j adapter placeholder.

For production graph storage and querying, sync entities/relationships to Neo4j.
This adapter is a placeholder — implement when Neo4j integration is needed.
"""

import logging

logger = logging.getLogger(__name__)


class Neo4jAdapter:
    """Placeholder for Neo4j graph database integration."""

    def __init__(self, uri: str = "bolt://localhost:7687", user: str = "neo4j", password: str = ""):
        self.uri = uri
        self.user = user
        self.password = password
        logger.warning("Neo4j adapter is a placeholder — not connected")

    def sync_entities(self, entities: list[dict]) -> int:
        """Sync entities to Neo4j. Not implemented."""
        raise NotImplementedError(
            "Neo4j adapter is not implemented. Configure Neo4j connection and implement sync methods."
        )

    def sync_relationships(self, relationships: list[dict]) -> int:
        """Sync relationships to Neo4j. Not implemented."""
        raise NotImplementedError(
            "Neo4j adapter is not implemented. Configure Neo4j connection and implement sync methods."
        )

    def query(self, cypher: str, params: dict | None = None) -> list[dict]:
        """Run a Cypher query. Not implemented."""
        raise NotImplementedError(
            "Neo4j adapter is not implemented. Configure Neo4j connection and implement query method."
        )

    def health_check(self) -> bool:
        """Check Neo4j connectivity. Not implemented."""
        return False
