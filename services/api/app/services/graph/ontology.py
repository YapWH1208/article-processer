"""Graph ontology — defines allowed entity and relationship types.

This module provides the canonical definitions of the knowledge graph schema.
"""

from enum import Enum


class EntityType(str, Enum):
    ARTICLE = "Article"
    AUTHOR = "Author"
    INSTITUTION = "Institution"
    METHOD = "Method"
    DATASET = "Dataset"
    EXPERIMENT = "Experiment"
    METRIC = "Metric"
    RESULT = "Result"
    CLAIM = "Claim"
    TASK = "Task"
    DOMAIN = "Domain"
    TOOL = "Tool"
    MODEL = "Model"
    CITATION = "Citation"
    KEYWORD = "Keyword"


class RelationshipType(str, Enum):
    USES_METHOD = "USES_METHOD"
    EVALUATES_ON = "EVALUATES_ON"
    REPORTS_RESULT = "REPORTS_RESULT"
    USES_METRIC = "USES_METRIC"
    CITES = "CITES"
    SUPPORTED_BY = "SUPPORTED_BY"
    ADDRESSES_TASK = "ADDRESSES_TASK"
    IMPROVES_ON = "IMPROVES_ON"
    HAS_LIMITATION = "HAS_LIMITATION"
    HAS_KEYWORD = "HAS_KEYWORD"


# Description of each relationship type for prompt generation
RELATIONSHIP_DESCRIPTIONS = {
    "USES_METHOD": "The source uses the target method/technique in its approach",
    "EVALUATES_ON": "The source evaluates performance on the target dataset",
    "REPORTS_RESULT": "The source reports the target result/outcome",
    "USES_METRIC": "The source uses the target metric for evaluation",
    "CITES": "The source cites the target paper/work",
    "SUPPORTED_BY": "The source claim is supported by the target evidence",
    "ADDRESSES_TASK": "The source addresses the target task/problem",
    "IMPROVES_ON": "The source improves upon the target prior work",
    "HAS_LIMITATION": "The source has the target limitation",
    "HAS_KEYWORD": "The source is tagged with the target keyword",
}
