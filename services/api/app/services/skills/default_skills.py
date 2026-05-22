"""Default skill definitions for article analysis.

Each skill defines a focused extraction/analysis workflow that can be run
on an article's Markdown content.
"""

from app.services.skills.registry import Skill

DEFAULT_SKILLS: list[Skill] = [
    Skill(
        name="research_paper_summary",
        purpose="Generate a structured summary of a research paper",
        description="Extracts background, problem, methodology, experiments, results, limitations, and future work into a structured summary.",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
            },
            "required": ["article_id"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "background": {"type": "string"},
                "problem": {"type": "string"},
                "methodology": {"type": "string"},
                "experiments": {"type": "string"},
                "results": {"type": "string"},
                "limitations": {"type": "string"},
                "future_work": {"type": "string"},
                "practical_usefulness": {"type": "string"},
                "reviewer_critique": {"type": "string"},
            },
        },
        prompt_instructions=(
            "Provide a structured summary of the research paper:\n"
            "1. Background: What context and prior work does the paper build on?\n"
            "2. Problem: What specific research problem does it address?\n"
            "3. Methodology: What approach/methods does it use?\n"
            "4. Experiments: What experiments were conducted?\n"
            "5. Results: What were the key findings?\n"
            "6. Limitations: What limitations does the paper acknowledge?\n"
            "7. Future Work: What future directions are suggested?\n"
            "8. Practical Usefulness: How useful is this in practice?\n"
            "9. Reviewer Critique: A balanced critical assessment."
        ),
    ),
    Skill(
        name="methodology_extraction",
        purpose="Extract detailed methodology information",
        description="Deep-dive extraction of methodology: techniques, architectures, training details, hyperparameters.",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
            },
            "required": ["article_id"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "approach_type": {"type": "string"},
                "techniques": {"type": "array", "items": {"type": "string"}},
                "architecture": {"type": "string"},
                "training_details": {"type": "string"},
                "hyperparameters": {"type": "object"},
                "novel_contributions": {"type": "array", "items": {"type": "string"}},
            },
        },
        prompt_instructions=(
            "Extract detailed methodology information:\n"
            "1. Approach Type: What kind of approach (e.g., supervised, unsupervised, RL)?\n"
            "2. Techniques: List specific techniques used.\n"
            "3. Architecture: Describe the model architecture if applicable.\n"
            "4. Training Details: Training procedure, data splits, optimization.\n"
            "5. Hyperparameters: Key hyperparameters and their values.\n"
            "6. Novel Contributions: What is new about this methodology?"
        ),
    ),
    Skill(
        name="experiment_extraction",
        purpose="Extract experiment design and results",
        description="Detailed extraction of experimental setup, datasets, baselines, and results.",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
            },
            "required": ["article_id"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "datasets_used": {"type": "array", "items": {"type": "string"}},
                "baselines": {"type": "array", "items": {"type": "string"}},
                "metrics": {"type": "array", "items": {"type": "string"}},
                "results_summary": {"type": "string"},
                "statistical_significance": {"type": "string"},
                "ablation_studies": {"type": "string"},
            },
        },
        prompt_instructions=(
            "Extract experiment details:\n"
            "1. Datasets Used: All datasets mentioned in experiments.\n"
            "2. Baselines: Methods compared against.\n"
            "3. Metrics: Evaluation metrics used.\n"
            "4. Results Summary: Main quantitative results.\n"
            "5. Statistical Significance: Any significance testing reported.\n"
            "6. Ablation Studies: Any ablation or component analysis."
        ),
    ),
    Skill(
        name="literature_review_notes",
        purpose="Generate literature review notes",
        description="Produces notes suitable for inclusion in a literature review: key ideas, comparisons, gaps.",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
            },
            "required": ["article_id"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "key_ideas": {"type": "array", "items": {"type": "string"}},
                "relation_to_prior_work": {"type": "string"},
                "gaps_addressed": {"type": "array", "items": {"type": "string"}},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "weaknesses": {"type": "array", "items": {"type": "string"}},
                "citations_to_follow_up": {"type": "array", "items": {"type": "string"}},
            },
        },
        prompt_instructions=(
            "Generate literature review notes:\n"
            "1. Key Ideas: Main contributions in 2-3 bullet points.\n"
            "2. Relation to Prior Work: How does this relate to existing research?\n"
            "3. Gaps Addressed: What gaps in the literature does this fill?\n"
            "4. Strengths: What are the paper's strongest points?\n"
            "5. Weaknesses: What are its weaknesses or omissions?\n"
            "6. Citations to Follow Up: Key cited works worth reading."
        ),
    ),
    Skill(
        name="reviewer_critique",
        purpose="Generate a peer-review style critique",
        description="Produces a balanced critical review of the paper, similar to a peer review.",
        input_schema={
            "type": "object",
            "properties": {
                "article_id": {"type": "integer"},
            },
            "required": ["article_id"],
        },
        output_schema={
            "type": "object",
            "properties": {
                "summary": {"type": "string"},
                "strengths": {"type": "array", "items": {"type": "string"}},
                "weaknesses": {"type": "array", "items": {"type": "string"}},
                "clarity": {"type": "string"},
                "originality": {"type": "string"},
                "soundness": {"type": "string"},
                "significance": {"type": "string"},
                "recommendation": {"type": "string"},
                "questions_for_authors": {"type": "array", "items": {"type": "string"}},
            },
        },
        prompt_instructions=(
            "Generate a peer-review style critique:\n"
            "1. Summary: One paragraph summarizing the paper.\n"
            "2. Strengths: 3-5 specific strengths.\n"
            "3. Weaknesses: 3-5 specific weaknesses or concerns.\n"
            "4. Clarity: Assessment of writing quality and clarity.\n"
            "5. Originality: How novel is the contribution?\n"
            "6. Soundness: Are the methods and evaluation sound?\n"
            "7. Significance: How important is this work to the field?\n"
            "8. Recommendation: Accept / Minor Revision / Major Revision / Reject.\n"
            "9. Questions for Authors: Specific questions that need answers."
        ),
    ),
]
