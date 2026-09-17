# AI Usage & Engineering Decision Log

This document records the collaborative pairing process between the engineer and AI during the design and implementation of the **LLD Practice Platform**. It documents critical architectural inflection points, what was proposed, what was accepted, and two significant defects where AI-generated code passed existing unit tests and was subsequently caught in architectural review.

---

## Summary of Decisions

| # | Topic | AI Proposal / Code | Outcome | Key Rationale |
|---|---|---|---|---|
| **1** | **Persistence Layer** | Introduce Prisma ORM or TypeORM with schema migrations | **REJECTED** | Preserved monolith simplicity; plain SQLite + explicit Repository pattern enables zero-dependency testing without ORM baggage. |
| **2** | **Score Aggregation Strategy** | Winner-Takes-All: LLM score completely overrides deterministic heuristics | **REJECTED** | Destroys objective syntactic signals. Adopted Confidence-Weighted Merging with full finding provenance. |
| **3** | **Evaluation Concurrency** | Deploy BullMQ or RabbitMQ with Redis distributed queue | **REJECTED** | Explicitly out-of-scope for 2-day monolith. Monolith in-process async with startup stale recovery sweep achieved resilience without external infra. |
| **4** | **Evidence Representation** | Introduce `EvidenceRef` discriminated union (`quote` vs `absence`) | **ACCEPTED** | Replaced fabricated quote strings like `Evidence.create('entities: []')` with honest absence notices. |
| **5** | **Heuristic Finding Collection** | Accumulate all findings per dimension and calculate score via `deriveScoreFromFindings` | **ACCEPTED** | Replaced early-exit heuristics with exhaustive feedback across all checks within a dimension. |
| **6** | **Evaluator Concurrency State** | Store execution state (`evaluatorsRun`, etc.) as instance variables on `CompositeEvaluator` | **PASSED TESTS, CAUGHT IN REVIEW** | Passed all sequential tests (64 tests across 8 suites); caught in review because concurrent runs on a shared instance cross-contaminate provenance. Refactored to pure stateless execution. |
| **7** | **DTO & Information Hiding** | Serialize domain models directly or place `toDto()` methods on domain entities | **PASSED TESTS, CAUGHT IN REVIEW** | Passed functional tests, but leaked rubric internals (`expectedConcepts`, `godClassMethodThreshold`) to the API. Refactored to an explicit DTO layer with redaction. |
| **8** | **Competitive Research Positioning** | AI initially framed positioning as "no structured LLD feedback exists" | **REJECTED** | Factually incorrect; research revealed four platforms shipping AI feedback. Positioning narrowed to grounding citations, rubric versioning, and cross-attempt aggregation. |

---

## Detailed Decision Logs

### 1. Persistence Layer: ORM (Prisma / TypeORM) vs. Repository Interface
- **Context**: We needed persistent storage for `Attempt` records across server restarts, while supporting fast unit testing.
- **AI Proposal**: Use Prisma ORM with a PostgreSQL/SQLite connection, generating Prisma client types and running SQL migrations.
- **Decision**: **REJECTED**.
- **Rationale**:
  - The assignment explicitly limits architectural scope to a domain-focused monolith. Introducing an ORM brings heavy binary dependencies (`prisma-client`, schema engines), slow migration steps, and leaky abstractions.
  - Instead, we defined an explicit `AttemptRepository` port in the domain layer and implemented two adapters:
    1. `InMemoryAttemptRepository` for sub-millisecond, zero-dependency unit tests.
    2. `SqliteAttemptRepository` using synchronous `better-sqlite3` for local persistence.
  - This preserves clean architecture and guarantees that testing the domain state machine requires zero database setup.

---

### 2. Evaluator Merging: Winner-Takes-All vs. Confidence-Weighted Findings
- **Context**: Both `DeterministicEvaluator` (syntactic rules) and `LlmEvaluator` (architectural judgment) evaluate overlapping rubric dimensions (e.g., `classResponsibilities`, `abstractionPatterns`).
- **AI Proposal**: Use a "Winner-Takes-All" hierarchy where the LLM's score and commentary completely overwrite the deterministic rule outputs whenever the LLM succeeds.
- **Decision**: **REJECTED**.
- **Rationale**:
  - LLMs frequently suffer from sycophancy or overlook concrete syntactic violations (e.g. an entity having 8 methods or missing from relationships). Overwriting deterministic heuristics throws away objective, zero-cost truth.
  - Conversely, averaging bare numbers without context hides *why* a score was lowered.
  - **Adopted Solution**: We implemented **Confidence-Weighted Merging**:
    $$\text{weight}_i = \max(0.1, \text{confidence}_i), \quad \text{Score} = \frac{\sum (\text{score}_i \times \text{weight}_i)}{\sum \text{weight}_i}$$
    Each finding retains its originating `evaluatorId` and cited `EvidenceRef`. The final report combines findings from both evaluators, giving the learner an un-diluted view of both structural violations and nuanced architectural feedback.

---

### 3. Background Evaluation: Distributed Task Queue vs. Monolithic In-Process Async
- **Context**: LLM evaluations take between 2 and 15 seconds. Blocking the HTTP submission request (`POST /api/attempts`) would cause client timeouts, browser stalls, and dropped attempts if the connection breaks.
- **AI Proposal**: Deploy BullMQ or RabbitMQ with Redis to manage an asynchronous background worker pool.
- **Decision**: **REJECTED**.
- **Rationale**:
  - The problem specification strictly mandates: *"Monolith is expected. Do NOT build microservices, Kubernetes, sharding, CDN, or queue infrastructure."*
  - Adding Redis and a separate worker runner adds operational complexity and violates the scope boundary.
  - **Adopted Solution**: We designed an **In-Process Asynchronous Pipeline**:
    1. `POST /api/attempts` persists the attempt in state `SUBMITTED` and immediately responds with `201 Created`.
    2. Evaluation runs asynchronously in the Node.js event loop via `void this.runEvaluationAsync(attemptId, problemId, spec)`.
    3. The client polls `GET /api/attempts/:id` for lifecycle status, and `GET /api/attempts/:id/report` for the report (`202 Accepted` while evaluating, `200 OK` on completion, `409 Conflict` on failure).
    4. To handle server crashes or restarts, we introduced a **Stale Evaluation Sweep** (`recoverStaleEvaluations()`) that runs on server startup, failing any attempt stuck in `EVALUATING` past a configurable deadline.

---

### 4. Evidence Representation: `EvidenceRef` Union Replacing Fabricated Quotes
- **Context**: Findings need to cite concrete evidence from the learner's submission. When a required entity, relationship, or section was missing, the earlier code fabricated fake quotes such as `Evidence.create('entities: []', 'spec.entities')` or `Evidence.create('No extensibility details', 'extensibility')`.
- **AI Proposal**: Introduce a discriminated union:
  ```typescript
  export type EvidenceRef =
    | { readonly kind: 'quote'; readonly evidence: Evidence }
    | { readonly kind: 'absence'; readonly expectedPath: string; readonly note: string };
  ```
- **Decision**: **ACCEPTED**.
- **Rationale**:
  - The domain should never invent quotations that do not exist in the learner's text.
  - The `EvidenceRef` union models reality honestly: positive findings quote the learner's actual text with exact JSON path coordinates (e.g. `entities[0].methods[2]`), while missing sections or unfulfilled rubric requirements are clearly identified as `absence` references with an explanatory note.

---

### 5. Heuristic Finding Collection: Exhaustive Findings via `deriveScoreFromFindings`
- **Context**: Initial heuristic implementations exited early on the first detected issue (e.g. bailing out immediately if an entity lacked an interface, without checking for anemic attributes or God-class method counts).
- **AI Proposal**: Refactor all deterministic heuristics to collect all findings across the dimension, and derive the dimension score deterministically using a unified scoring function `deriveScoreFromFindings(findings, baseScore)`.
- **Decision**: **ACCEPTED**.
- **Rationale**:
  - Early-exit heuristics force the learner into a frustrating "whack-a-mole" cycle: they fix one issue, re-submit, and only then discover three other violations on the same dimension.
  - Accumulating all findings provides complete diagnostic clarity in a single report.

---

### 6. Evaluator Concurrency State: Mutable Instance State Caught in Review
- **Context**: `CompositeEvaluator` runs registered sub-evaluators and tracks provenance (`evaluatorsRun`, `evaluatorsFailed`, `evaluatorsSkipped`).
- **AI-Generated Code**: The AI originally implemented provenance tracking using mutable private class fields:
  ```typescript
  class CompositeEvaluator {
    private evaluatorsRun: string[] = [];
    private evaluatorsFailed: string[] = [];
    // ...
    public getProvenance() { return { ... }; }
  }
  ```
- **Why Existing Tests Missed It**:
  - The test suite had 64 unit tests across 8 suites. Every single test executed evaluations sequentially on a freshly instantiated `CompositeEvaluator`. Because no test ran evaluations concurrently on the same instance, all tests passed green with zero errors.
- **Review Finding & Resolution**:
  - In a real Node.js web server, `CompositeEvaluator` is instantiated as a singleton shared across concurrent HTTP requests.
  - If two learners submit designs concurrently, their evaluations share the instance. If learner A's LLM call fails while learner B's succeeds, `this.evaluatorsFailed` is mutated in place, causing learner B's report to be falsely marked as `degraded: true`!
  - **Fix**: Removed all instance state. `evaluate(ctx)` was made a pure, stateless function returning:
    ```typescript
    {
      readonly results: readonly DimensionResult[];
      readonly provenance: {
        readonly evaluatorsRun: readonly string[];
        readonly evaluatorsFailed: readonly FailedEvaluatorInfo[];
        readonly evaluatorsSkipped: readonly string[];
      };
    }
    ```
  - Added an explicit concurrency test in `tests/application/LlmAndCompositeEvaluator.test.ts` executing two evaluations simultaneously on one `CompositeEvaluator` instance (one failing, one succeeding) to prove complete isolation.

---

### 7. API Boundary & Information Hiding: Domain Serialization Caught in Review
- **Context**: Problem requirements and rubric definitions must be served to the frontend practice UI.
- **AI-Generated Code**: The AI initially returned raw `Problem` domain models directly from Express route handlers or attached `toDto()` methods directly to domain classes.
- **Why Existing Tests Missed It**:
  - The API tests checked that `GET /api/problems/:id` returned status 200 and that `body.id` matched. The tests did not assert the *absence* of internal fields.
- **Review Finding & Resolution**:
  - Exposing the raw `Problem` domain entity leaked internal evaluation rubric secrets: `expectedConcepts` (e.g. `['Spot', 'Vehicle', 'Ticket']`), `minEntities`, `minTradeoffs`, and `godClassMethodThreshold`.
  - Any learner could open browser DevTools, inspect the `/api/problems/:id` response, and trivially game the evaluation heuristics.
  - Furthermore, having `toDto()` on domain models coupled the domain layer to HTTP wire representations.
  - **Fix**: Created an explicit DTO mapping layer in `src/infrastructure/web/dto/index.ts`. `ProblemDto` exposes public requirements, clarifying context, and extension axes, while completely omitting all internal rubric thresholds and concept keywords.
  - Added an integration test in `tests/web/ApiEndpoints.test.ts` asserting that `GET /api/problems/:id` contains none of the rubric internal keys.

---

### 8. Competitive Research: AI-Gathered, Human-Filtered
- **Context**: Mapping the competitive landscape of existing Low-Level Design preparation platforms to position our product.
- **AI Proposal & Initial Framing**: The AI ran the initial web research and drafted the competitive comparison table and market gap analysis. It initially framed the product positioning around the premise that "no automated or structured LLD feedback exists in the market."
- **Review Finding & Human Verification**:
  - The human engineer verified the research rows against available public marketing and free-tier pages. (Note: Premium feedback internals for Hello Interview, algomaster.io, Low Level Design Mastery, and lldproblems.com are behind paywalls and explicitly marked as unverified in `docs/RESEARCH.md`).
  - The AI's initial framing ("no structured LLD feedback exists") was **REJECTED** as factually wrong after the research surfaced that four active competitors are already shipping automated or LLM-driven LLD feedback experiences.
- **Decision & Refined Positioning**:
  - The positioning was narrowed to what actually differentiates the platform: AI feedback on LLD now exists, but it is per-session, ungrounded in the learner's own text with citations to specific paths in the learner's submission, not pinned to a versioned rubric, and not aggregated across problems into a longitudinal learning loop.

---

## Reflections on AI Collaboration

The AI was exceptionally effective at:
1. Quickly generating exhaustive test suites across heuristic positive/negative boundaries.
2. Formulating TypeScript discriminated unions and exhaustiveness checking for state transitions.
3. Rapidly scaffolding CSS styling tokens and React state management.

Human architectural judgment was required to:
1. Enforce strict scope boundaries and reject unnecessary distributed infrastructure (Redis, BullMQ, Prisma).
2. Catch subtle concurrency bugs stemming from mutable class instances that passed all sequential unit tests.
3. Protect domain invariants from leaky abstractions and cheating vectors (DTO redaction).
