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
> Rows for Hello Interview, algomaster.io, Low Level Design Mastery, and lldproblems.com are based on public marketing and free-tier pages because premium feedback internals are paywalled.

The following comparison matrix evaluates real-world tools and common learner workflows across five dimensions:

| Tool | Practice workflow | Submission format | Feedback type | Learning loop | Gap |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hello Interview** (LLD Guided Practice) | Pick from 9 problems (Connect Four, Elevator, Parking Lot, Rate Limiter), ~35 min, step-by-step through a Requirements to Design to Extensibility framework | Free-form per step | Instant AI feedback per step, described as rubric-based, tuned by FAANG interviewers | Per-problem "History" of past runs | Rubric is not exposed or versioned, so scores are not verifiably comparable across attempts; no cross-problem weakness aggregation; feedback is not tied to quoted spans of the submission |
| **algomaster.io** (LLD Practice) | 45 problems across 9 sections, step-by-step | Not publicly documented | "AI powered evaluation and feedback" | Section-based progression | Evaluation is a single opaque AI pass — no separation of deterministic checks from judgement, so the learner cannot tell which criticisms are mechanically certain |
| **Low Level Design Mastery** | 43 problems, explicit 4-step loop: Pick Problem, Draw Diagram, Write Code, AI review; XP and levels | Diagram plus code in 6 languages | AI review at the end of the workspace | Gamified XP, achievements, "Current Drill" | Progression is volume-based (XP), not diagnosis-based; no per-dimension score history, so a learner repeating the same mistake still levels up |
| **lldproblems.com** | 100+ machine-coding problems (Uber, Swiggy, Flipkart), gamified unlock from functional to non-functional to schema | Chat-based interview simulation | Conversational interviewer simulation | Gated unlocking by mastery tier | Conversational output is not structured into stable dimensions, so nothing is trackable or aggregable over time |
| **Educative / Grokking the LLD Interview** | Chaptered lessons on OOD principles and UML (use case, class, sequence, activity) | None — read-only | Worked solutions the learner self-compares against | Course completion percentage | No evaluation of the learner's own design at all; self-assessment against a model answer, which learners systematically over-score |
| **AlgoExpert / SystemsExpert** | 25 fundamentals modules, 13 design questions, 38 videos, 50-question quiz, workspace | Free-form notes in a workspace | Video solutions, not feedback | Quiz scores | The workspace records the design but nothing reads it; feedback is one-way content delivery |
| **Exercism** | Solve exercise, automated tests run, then request human mentoring | Code | Automated tests, then a human mentor who gives hints rather than answers; learners resubmit iterations | Iteration history per exercise with mentor continuity | Closest analogue to a real learning loop, but hours-to-days latency, dependent on volunteer availability, and no LLD or design coverage at all (it tests code correctness, not class structure) |
| **ChatGPT / generic LLM** | Paste a design, ask for critique | Free-form prose | Fluent, immediate, ungrounded | None — no memory of prior attempts | No fixed rubric (scores drift between sessions), no evidence citation, invents strengths, and cannot report what the learner keeps getting wrong |

---

## 3. Key Market Gaps

1. **Feedback is not grounded in the learner's own words.** Rows 1-4 all produce AI critique; none cites the exact span of the submission it is reacting to. A learner who disagrees has no way to check. Addressed by Evidence/sourcePath citations plus absenceRef for omissions such as unstated assumptions.
2. **Scores are not comparable over time.** Rows 1, 3, and 4 track activity (history, XP, unlocked tiers) rather than per-dimension movement against a pinned rubric. Without a rubricVersion, last week's 3.5 and today's 3.5 are different measurements. Addressed by a versioned rubric plus per-dimension deltas.
3. **Mechanical facts and opinions arrive indistinguishable.** Rows 2, 3, 4, and 8 return one AI verdict. "Your ParkingLot class has 11 methods" is checkable; "your abstraction feels forced" is judgement. Conflating them makes learners either over-trust or dismiss everything. Addressed by the deterministic/LLM split with contributor badges.
4. **Nothing reports what the learner keeps getting wrong.** Row 7 has genuine iteration history but no design coverage; rows 5, 6, and 8 have no loop at all. No tool aggregates weaknesses across problems. Addressed by recurring-weakness aggregation.
5. **The one real human-feedback loop is too slow to practice against.** Row 7 shows learners will iterate when feedback is specific, but hours of latency breaks the practice rhythm. Addressed by sub-15-second hybrid evaluation, with human review documented as an amendment path.

---

## 4. Product Direction: The LLD Practice Platform

Our platform addresses these gaps with a focused, minimal architecture:

- **Canonical Structured Spec**: The learner submits a structured design spec (`assumptions`, `entities`, `relationships`, `interfaces`, `tradeoffs`, `extensibility`). This provides the exact structure needed for deterministic heuristics while grounding LLM judgment in cited evidence.
- **Hybrid Evaluation Engine**: Combines zero-cost deterministic rule heuristics (god classes, orphan entities, anemic models, uncovered extension axes) with an evidence-grounded LLM evaluator operating under strict temperature 0 and Zod validation.
- **Explainable Feedback**: Every finding carries an honest citation (`EvidenceRef`) with citations to specific paths in the learner's submission or explicitly noting the absence of an expected requirement.
- **Continuous Learning Loop**: Per-attempt dimension deltas comparing consecutive submissions, coupled with an aggregated "Recurring Weaknesses" analyzer that surfaces persistent architectural anti-patterns across multiple practice sessions.

---

## 5. Source URLs & References

- Hello Interview — LLD course: https://www.hellointerview.com/learn/low-level-design/in-a-hurry/introduction
- Hello Interview — LLD Guided Practice (9 problems): https://www.hellointerview.com/practice/low-level-design
- algomaster.io — LLD Practice: https://algomaster.io/interview/low-level-design
- Low Level Design Mastery — practice hub (43 problems): https://www.lowleveldesignmastery.com/playground
- LLD Problems: https://www.lldproblems.com/
- Educative — Grokking the LLD Interview: https://www.educative.io/courses/grokking-the-low-level-design-interview-using-ood-principles
- AlgoExpert / SystemsExpert: https://www.algoexpert.io/systems/product
- Exercism — mentoring model: https://exercism.org/docs/using/feedback/mentor
