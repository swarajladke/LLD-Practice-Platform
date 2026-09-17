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
- **Ungrounded / Ephemeral Feedback**: AI feedback on LLD now exists (Hello Interview, algomaster.io, Low Level Design Mastery, lldproblems.com), but it is per-session, ungrounded in the learner's own text, not pinned to a versioned rubric, and not aggregated across problems.
- **Lack of Longitudinal Tracking**: Learners do not know if their architectural habits (e.g. God classes, anemic domain models, missing abstractions) are improving across problem attempts.

---

## 2. Competitive Landscape & Comparison Table

> [!NOTE]
> Competitor analysis rows for Hello Interview, algomaster.io, Low Level Design Mastery, and lldproblems.com are based on publicly available marketing, documentation, and free-tier pages, because premium feedback internals are paywalled.

The following comparison matrix evaluates real-world tools and common learner workflows across five dimensions:

| Tool / Approach | Practice Workflow | Submission Format | Feedback Type | Learning Loop | Gap |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **LeetCode / HackerRank (DSA Style)** | | | | | |
| **Educative / Grokking the OOD Interview** | | | | | |
| **ByteByteGo / High-Level Design Platforms** | | | | | |
| **Exercism / Mentorship Platforms** | | | | | |
| **Generic "Ask ChatGPT" Workflow** | | | | | |
| **Hello Interview (Low-Level Design Track)** | | | | | |
| **Algomaster.io** | | | | | |
| **Low Level Design Mastery / LLDProblems.com** | | | | | |

---

## 3. Key Market Gaps

Analyzing the specific landscape rows above highlights three structural gaps:

1. **Unstructured Prose vs. Grounded Syntactic Anchors**:
   - In **Row 1 (LeetCode / HackerRank)**, submission requires compiling and executing full runnable code against unit tests; this tests language boilerplate and algorithmic mechanics rather than low-level object-oriented decomposition and architectural boundaries.
   - In **Row 2 (Educative)** and **Row 6 (Low Level Design Mastery)**, learners are predominantly presented with static editorial solutions or freeform text fields without automated structural validation.
   - In **Row 5 (Generic ChatGPT Workflow)**, unconstrained prose submissions cause LLMs to hallucinate requirements, miss subtle class coupling flaws, and produce flattering commentary that lacks verifiable line-level citations.

2. **Binary Scoring vs. Multi-Dimensional Rubric Grounding**:
   - In **Row 1 (LeetCode)**, the feedback signal is strictly binary (Passed / Failed test cases), offering zero insight into cohesion, separation of concerns, or testability.
   - In **Row 3 (ByteByteGo)**, analysis focuses on macro architectural topologies (load balancers, caching, partitions), leaving class-level encapsulation and interface abstraction out of scope.
   - In **Row 7 (Hello Interview Low-Level Design Track)**, comprehensive interview guides and qualitative rubrics are provided, but automated, deterministic evaluation across orthogonal OOD dimensions (SRP, cohesion, interface segregation, extensibility) remains absent.

3. **Absence of Memory (Longitudinal Learning Loop)**:
   - In **Row 4 (Exercism)**, human mentors provide high-quality feedback on individual exercises, but there is no automated system that tracks score trajectories or aggregates recurring anti-patterns across exercises.
   - In **Row 5 (ChatGPT)**, practice happens in ephemeral, stateless chat windows with zero memory of previous design attempts.
   - Across **Row 2 (Educative)**, **Row 6 (Low Level Design Mastery)**, and **Row 7 (Hello Interview)**, problems are treated as standalone exercises. None of these offerings compute dimension deltas between consecutive submissions or maintain an aggregate registry of the learner's recurring architectural weaknesses.

---

## 4. Product Direction: The LLD Practice Platform

Our platform addresses these gaps with a focused, minimal architecture:

- **Canonical Structured Spec**: The learner submits a structured design spec (`assumptions`, `entities`, `relationships`, `interfaces`, `tradeoffs`, `extensibility`). This provides the exact structure needed for deterministic heuristics while grounding LLM judgment in cited evidence.
- **Hybrid Evaluation Engine**: Combines zero-cost deterministic rule heuristics (god classes, orphan entities, anemic models, uncovered extension axes) with an evidence-grounded LLM evaluator operating under strict temperature 0 and Zod validation.
- **Explainable Feedback**: Every finding carries an honest citation (`EvidenceRef`) linking directly to the learner's JSON path or explicitly noting the absence of an expected requirement.
- **Continuous Learning Loop**: Per-attempt dimension deltas comparing consecutive submissions, coupled with an aggregated "Recurring Weaknesses" analyzer that surfaces persistent architectural anti-patterns across multiple practice sessions.

---

## 5. Source URLs & References

- **LeetCode**: [https://leetcode.com](https://leetcode.com)
- **Educative (Grokking OOD)**: [https://www.educative.io/courses/grokking-the-low-level-design-interview-using-ood-principles](https://www.educative.io/courses/grokking-the-low-level-design-interview-using-ood-principles)
- **ByteByteGo**: [https://bytebytego.com](https://bytebytego.com)
- **Exercism**: [https://exercism.org](https://exercism.org)
- **Hello Interview (Low-Level Design Track)**: [https://www.hellointerview.com/learn/system-design/in-a-hurry/low-level-design](https://www.hellointerview.com/learn/system-design/in-a-hurry/low-level-design)
- **Algomaster.io**: [https://algomaster.io](https://algomaster.io)
- **Low Level Design Mastery**: [https://lowleveldesign.io](https://lowleveldesign.io)
- **LLDProblems.com**: [https://lldproblems.com](https://lldproblems.com)
