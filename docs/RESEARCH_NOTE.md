# Research Note — LLD Practice Platform

## 1. The learner problem
DSA practice has a tight loop: read, code, run tests, instant verdict. LLD has no such loop.
- **No single correct answer.** Designs trade extensibility against simplicity; there is nothing to diff against.
- **Blank-page paralysis.** Learners draw large class diagrams before isolating responsibilities and invariants.
- **Ungrounded feedback.** AI feedback on LLD now exists, but it is per-session, not tied to the learner's own text, not pinned to a versioned rubric, and not aggregated across problems.
- **No longitudinal signal.** Learners cannot tell whether habits (God classes, anemic models, missing abstractions) are improving.

## 2. Competitive landscape
> Rows 1–4 are based on public marketing and free-tier pages; premium feedback internals are paywalled and unverified.

| # | Tool | Workflow | Submission | Feedback | Loop | Gap |
|---|---|---|---|---|---|---|
| 1 | Hello Interview | 9 LLD problems, ~35 min, requirements→design→extensibility | Free-form per step | Instant AI, described as rubric-based | Per-problem history | Rubric not exposed or versioned; no cross-problem aggregation; not tied to quoted spans |
| 2 | algomaster.io | 45 problems, 9 sections | Undocumented | "AI powered evaluation" | Section progression | Single opaque pass; cannot tell which criticisms are mechanically certain |
| 3 | Low Level Design Mastery | 43 problems; pick→diagram→code→AI review | Diagram + code, 6 languages | AI review at end | XP, levels, drills | Progression is volume-based, not diagnosis-based; repeat mistakes still level up |
| 4 | lldproblems.com | 100+ machine-coding problems; gated unlocks | Chat simulation | Conversational interviewer | Mastery tiers | Output not structured into stable dimensions, so nothing is trackable |
| 5 | Educative / Grokking LLD | Chaptered lessons on OOD and UML | None (read-only) | Worked solutions to self-compare | Completion % | No evaluation of the learner's design; self-scoring is systematically generous |
| 6 | AlgoExpert / SystemsExpert | 25 modules, 13 design questions, 38 videos | Notes in a workspace | Video solutions | Quiz scores | Workspace records the design but nothing reads it |
| 7 | Exercism | Solve, auto-tests, then human mentor | Code | Tests, then mentor hints; learners resubmit iterations | Iteration history, mentor continuity | Closest real loop, but hours-to-days latency and no LLD coverage at all |
| 8 | ChatGPT | Paste design, ask for critique | Prose | Fluent, immediate, ungrounded | None | No fixed rubric, no citations, invents strengths, no memory of prior attempts |

## 3. Market gaps
1. **Not grounded in the learner's words.** Rows 1–4 critique without citing the span they react to; a learner who disagrees cannot check. → `sourcePath` citations plus explicit absence references.
2. **Scores not comparable over time.** Rows 1, 3, 4 track activity, not per-dimension movement against a pinned rubric. Without `rubricVersion`, two 3.5s are different measurements. → versioned rubric plus per-dimension deltas.
3. **Facts and opinions indistinguishable.** Rows 2, 3, 4, 8 return one verdict. "11 methods" is checkable; "feels forced" is judgement. → deterministic/LLM split with contributor badges.
4. **Nothing reports the repeated mistake.** Row 7 has iteration history but no design coverage; rows 5, 6, 8 have no loop. → recurring-weakness aggregation across problems.
5. **The one real human loop is too slow.** Row 7 shows learners iterate when feedback is specific, but hours of latency breaks practice rhythm. → sub-15s hybrid evaluation, human review as a documented amendment path.

## 4. Product direction
- **Canonical structured spec** (`assumptions`, `entities`, `relationships`, `interfaces`, `tradeoffs`, `extensibility`) gives deterministic checks real anchors and grounds LLM judgement.
- **Hybrid evaluation**: zero-cost deterministic heuristics plus a temperature-0, Zod-validated LLM evaluator, merged by confidence weighting with full finding provenance.
- **Honest citations**: every finding carries a path into the learner's submission, or an explicit absence notice. No fabricated quotes.
- **Longitudinal loop**: per-dimension deltas between attempts plus cross-problem recurring-weakness aggregation.
