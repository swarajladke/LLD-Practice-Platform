# AI Usage & Engineering Decision Log

This document records the collaborative pairing process between the engineer and AI during the design and implementation of the **LLD Practice Platform**. It highlights five critical architectural inflection points, what the AI proposed, what was accepted or rejected, and the technical rationale behind each decision.

---

## Summary of Decisions

| # | Topic | AI Suggestion | Outcome | Key Rationale |
|---|---|---|---|---|
| **1** | **Persistence Layer** | Introduce Prisma ORM or TypeORM with schema migrations | **REJECTED** | Preserved monolith simplicity; plain SQLite + explicit Repository pattern enables zero-dependency testing without ORM baggage. |
| **2** | **Score Aggregation** | Winner-Takes-All: LLM score overrides deterministic heuristics | **REJECTED** | Destroys objective syntactic signals. Adopted Confidence-Weighted Merging with full finding provenance. |
| **3** | **Evaluation Concurrency** | Add Redis + BullMQ distributed task queue | **REJECTED** | Explicitly out-of-scope for 2-day monolith. Monolith in-process async with startup stale recovery sweep achieved resilience without external infra. |
| **4** | **CompositeEvaluator State** | Store execution state (`evaluatorsRun`) as instance variables | **REJECTED** | Mutable state on shared services creates concurrency race conditions. Enforced pure stateless evaluation returning immutable provenance. |
| **5** | **DTO & Information Hiding** | Add `toDto()` helper methods directly onto Domain entity classes | **REJECTED** | Violates Clean Architecture dependency direction. Placed DTOs strictly in `infrastructure/web/dto` to isolate web contracts. |

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
  - LLMs frequently suffer from sycophancy or overlooking subtle syntactic violations (e.g. an entity having 8 methods or missing from relationships). Overwriting deterministic heuristics throws away objective, zero-cost truth.
  - Conversely, averaging bare numbers without context hides *why* a score was lowered.
  - **Adopted Solution**: We implemented **Confidence-Weighted Merging**:
    $$\text{Score} = \frac{\sum (\text{score}_i \times \text{confidence}_i)}{\sum \text{confidence}_i}$$
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
    1. `POST /api/attempts` persists the attempt in state `SUBMITTED` and immediately responds with `201 Accepted`.
    2. Evaluation runs asynchronously in the Node.js event loop via `void this.runEvaluationAsync(attempt, problem)`.
    3. The client polls `GET /api/attempts/:id/report` (`202 Accepted` while evaluating, `200 OK` on completion, `409 Conflict` on failure).
    4. To handle server crashes or restarts, we introduced a **Stale Evaluation Sweep** (`recoverStaleEvaluations()`) that runs on server startup, failing any attempt stuck in `EVALUATING` past a 60-second deadline.

---

### 4. Evaluator Statefulness: Instance Variables vs. Pure Function Execution
- **Context**: In `CompositeEvaluator`, we need to track which sub-evaluators ran, failed, or were skipped, and reflect whether the report was degraded.
- **AI Proposal**: Store `evaluatorsRun`, `evaluatorsFailed`, and `evaluatorsSkipped` as private array properties on the `CompositeEvaluator` class instance, exposed via a `getProvenance()` method.
- **Decision**: **REJECTED**.
- **Rationale**:
  - In a concurrent web application, multiple learner submissions hit the same `CompositeEvaluator` singleton.
  - If instance variables are modified during an `evaluate(ctx)` invocation, concurrent calls will cross-contaminate provenance arrays. One learner's failed LLM call would falsely mark another learner's evaluation as degraded!
  - **Adopted Solution**: We refactored `CompositeEvaluator` to be completely **stateless and pure**. `evaluate(ctx)` returns an immutable object containing both the `DimensionResult[]` and the evaluation `provenance`:
    ```typescript
    interface CompositeEvaluationResult {
      readonly results: readonly DimensionResult[];
      readonly provenance: {
        readonly evaluatorsRun: readonly string[];
        readonly evaluatorsFailed: readonly string[];
        readonly evaluatorsSkipped: readonly string[];
      };
    }
    ```
  - We verified this with a concurrency test where two evaluations execute simultaneously on a single `CompositeEvaluator` instance—one failing and one succeeding—asserting that neither leaks provenance to the other.

---

### 5. API Boundary & Information Hiding: Entity `toDto()` vs. Dedicated DTO Layer
- **Context**: We must prevent learners from inspecting API responses to uncover rubric thresholds (`godClassMethodThreshold`, `minRationaleLength`) or `expectedConcepts` cheat codes.
- **AI Proposal**: Add `.toDto()` methods directly on the `Problem` and `Attempt` domain entities in `src/domain/models/`.
- **Decision**: **REJECTED**.
- **Rationale**:
  - Placing serialization and wire-format concerns inside domain models violates Clean Architecture: the domain layer should have zero knowledge of HTTP or external serialization formats.
  - **Adopted Solution**: We created a dedicated DTO package in `src/infrastructure/web/dto/index.ts`:
    - `ProblemDto`: Exposes public requirements, clarifying context, and extension axes, while completely omitting `expectedConcepts`, `dimensionWeights`, and heuristic thresholds.
    - `AttemptDto` and `ReportDto`: Shape clean, versioned JSON responses.
  - Automated integration tests (`tests/web/ApiEndpoints.test.ts`) assert that querying `GET /api/problems/:id` contains no internal rubric keywords.

---

## Reflections on AI Collaboration

The AI was exceptionally effective at:
1. Quickly generating exhaustive test cases across positive and negative heuristic boundaries.
2. Formulating TypeScript discriminated unions and exhaustiveness checking for state transitions.
3. Rapidly scaffolding CSS styling tokens and React state management.

Human architectural judgment was required to:
1. Enforce strict scope boundaries and reject unnecessary distributed infrastructure (Redis, BullMQ, Prisma).
2. Catch subtle concurrency bugs stemming from mutable class instances.
3. Protect domain invariants from leaky abstractions and cheating vectors (DTO redaction).
