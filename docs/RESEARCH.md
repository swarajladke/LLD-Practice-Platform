# Research & Problem Understanding

## 1. The Learner Problem in Low-Level Design (LLD)

Low-Level Design (LLD) and Object-Oriented Design (OOD) interview preparation is notoriously ambiguous compared to Data Structures & Algorithms (DSA). In DSA (LeetCode), practice follows a tight, automated feedback loop:
1. Read problem
2. Write code
3. Run against unit tests
4. Immediate pass/fail verdict

In LLD, however, learners face fundamental obstacles:
- **No Single "Correct" Answer**: System designs inherently balance tradeoffs (e.g., extensibility vs. simplicity, in-memory vs. database, inheritance vs. composition).
- **The "Blank Page" Paralysis**: Learners often jump straight into drawing massive class diagrams or writing thousands of lines of boilerplate code without isolating core responsibilities and invariants.
- **Unexplainable / Vague Feedback**: Existing preparation relies either on static book chapters or prompting generic LLMs with "Review my code", which results in flattering, non-deterministic 100-point scores lacking concrete citations.
- **Lack of Longitudinal Tracking**: Learners do not know if their architectural habits (e.g. God classes, anemic domain models, missing abstractions) are improving across problem attempts.

---

## 2. Competitive Landscape & Comparison Table

The following comparison matrix evaluates real-world tools and common learner workflows across five dimensions:

| Tool / Approach | Practice Workflow | Submission Format | Feedback Type | Learning Loop | Gap |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **LeetCode / HackerRank (DSA Style)** | *[Learner to fill / customize]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* |
| **Educative / Grokking the OOD Interview** | *[Learner to fill / customize]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* |
| **ByteByteGo / High-Level Design Platforms** | *[Learner to fill / customize]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* |
| **Exercism / Mentorship Platforms** | *[Learner to fill / customize]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* |
| **Generic "Ask ChatGPT" Workflow** | *[Learner to fill / customize]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* | *[Learner to fill]* |

---

## 3. Key Market Gaps

From the comparison above, three structural gaps emerge:

1. **Unstructured Prose vs. Grounded Evidence**: Freeform text makes deterministic syntactic checks impossible and causes LLMs to hallucinate or evaluate irrelevancies. Conversely, demanding full working code tests language syntax and boilerplate rather than architectural intent.
2. **Binary Scoring vs. Multi-Dimensional Rubrics**: Asking "Is this a good design?" yields arbitrary scores. High-quality feedback requires decomposing evaluation into orthogonal architectural dimensions (cohesion, coupling, encapsulation, extension axes, tradeoffs).
3. **Absence of Memory (Learning Loop)**: Most platforms treat attempts as isolated events. Without tracking per-dimension progression and aggregating recurring anti-patterns across attempts, learners cannot identify their persistent architectural blind spots.

---

## 4. Product Direction: The LLD Practice Platform

Our platform addresses these gaps with a focused, minimal architecture:

- **Canonical Structured Spec**: The learner submits a structured design spec (`assumptions`, `entities`, `relationships`, `interfaces`, `tradeoffs`, `extensibility`). This provides the exact structure needed for deterministic heuristics while grounding LLM judgment in cited evidence.
- **Hybrid Evaluation Engine**: Combines zero-cost deterministic rule heuristics (god classes, orphan entities, anemic models, uncovered extension axes) with an evidence-grounded LLM evaluator operating under strict temperature 0 and Zod validation.
- **Explainable Feedback**: Every finding carries an honest citation (`EvidenceRef`) linking directly to the learner's JSON path or explicitly noting the absence of an expected requirement.
- **Continuous Learning Loop**: Per-attempt dimension deltas (+1.5, -0.5) and an aggregated "Recurring Weaknesses" analyzer that tracks persistent anti-patterns across multiple practice sessions.
