# LLD Practice Platform

A focused, deliberate practice platform for Low-Level Design (LLD) and Object-Oriented Design (OOD). While AI feedback on LLD now exists (Hello Interview, algomaster.io, Low Level Design Mastery, lldproblems.com), it is per-session, ungrounded in the learner's own text, not pinned to a versioned rubric, and not aggregated across problems.

LLD Practice Platform solves this: learners choose a system design problem, author a structured design specification, receive grounded hybrid feedback with citations to specific paths in the learner's submission from deterministic heuristics and LLM evaluation, review score deltas over time, and systematically eliminate recurring architectural anti-patterns.

---

## Key Features

- **Structured Design Specification**: Normalizes design submissions into canonical sections (`assumptions`, `entities`, `relationships`, `interfaces`, `tradeoffs`, `extensibility`), avoiding ambiguous freeform prose while testing architectural intent rather than language boilerplate.
- **Hybrid Evaluation Engine**:
  - **Deterministic Rule Heuristics**: Zero-cost, instantaneous checks for structural anti-patterns (God classes, orphan entities, anemic domain models, unhandled extension axes, missing trade-offs).
  - **LLM Architectural Judgment**: Deep qualitative evaluation of separation of concerns, single responsibility nuances, and trade-off justification using strict temperature-0 prompts validated via Zod schemas.
  - **Confidence-Weighted Aggregation**: Evaluators run concurrently with per-evaluator timeouts; scores are merged via confidence weighting and degraded gracefully if an evaluator fails or is skipped.
- **Grounded Evidence & Honest Citations**: Every finding carries an immutable `EvidenceRef` (`quote` pointing to the exact JSON path like `entities[1].methods` or explicit `absence` of a requirement). No fabricated quotes.
- **State Machine & Failure Recovery**: Strict lifecycle (`DRAFT` → `SUBMITTED` → `EVALUATING` → `EVALUATED` / `FAILED`). Attempt records are persisted **before** evaluation starts. A startup stale-evaluation sweep automatically reclaims orphaned evaluations.
- **Learning Loop & Longitudinal Analytics**: Tracks per-dimension score deltas between consecutive attempts and surfaces cross-attempt "Recurring Weaknesses" to guide targeted study.
- **Clean Architecture & Information Hiding**: Inward-pointing clean architecture (domain layer has zero external dependencies). DTO layer strictly redacts internal rubric thresholds and expected concept lists from learner-facing API endpoints.

---

## Architectural Highlights

### Strict Clean Layering
```
src/
├── domain/            # Pure domain models, state machine, value objects, domain errors (ZERO external dependencies)
│   ├── models/        # Attempt aggregate, DesignSpec, Rubric, EvaluationReport, Evidence, LearningLoop
│   └── errors/        # Typed domain errors (ProblemNotFoundError, ValidationFailedError, etc.)
├── application/       # Orchestration services, evaluation engines, assemblers, learning loop calculator
│   ├── evaluators/    # DeterministicEvaluator, LlmEvaluator, CompositeEvaluator, EvaluationReportAssembler
│   └── services/      # EvaluationService, LearningLoopService
├── infrastructure/    # Concrete adapters, SQLite persistence, LLM client, seeds, Express web server
│   ├── repositories/  # SqliteAttemptRepository, InMemoryAttemptRepository, InMemoryProblemRepository
│   ├── formats/       # StructuredTextFormat (Factory pattern)
│   ├── llm/           # FakeLlmClient with offline determinism and simulated timeouts
│   ├── seeds/         # 4 real-world seeded problems
│   └── web/           # Express app, DTO mappers, centralized error middleware, server entrypoint
└── web/               # Client frontend: React 18, Vite, responsive CSS design system
```

### Justified Design Patterns
1. **Strategy Pattern (`Evaluator`)**: Decouples evaluation engines (`DeterministicEvaluator`, `LlmEvaluator`) from orchestration logic, allowing new evaluators (e.g. human review or AST linters) to plug in seamlessly.
2. **Composite Pattern (`CompositeEvaluator`)**: Treats individual and composite evaluators uniformly, running members concurrently with per-evaluator timeouts and aggregating results into a single composite report.
3. **Repository Pattern (`AttemptRepository`, `ProblemRepository`)**: Isolates domain entities from database engines, allowing SQLite in production and blazing-fast in-memory repositories in unit tests.
4. **Factory Pattern (`SubmissionFormat`)**: Normalizes arbitrary inputs (structured text, and in future Mermaid diagrams or code) into canonical `DesignSpec` objects before reaching evaluators.

---

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 9.0.0 or higher

---

## Setup & Installation

Clone the repository and install dependencies:

```bash
git clone https://github.com/swarajladke/LLD-Practice-Platform.git
cd LLD-Practice-Platform
npm install
```

---

## Running Locally

To run the complete platform locally:

### 1. Start the Backend API Server
In a terminal, start the Express backend with hot reloading (runs on port 3000):
```bash
npm run dev:server
```
The server will initialize the SQLite database (`lld_platform.db`), run the startup stale-evaluation recovery sweep, seed 4 core problems, and listen on `http://localhost:3000`.

### 2. Start the Frontend Application
In a second terminal, launch the Vite development server (runs on port 5173):
```bash
npm run dev
```
Open your browser to `http://localhost:5173`. The Vite dev server automatically proxies `/api` requests to the backend server at `http://localhost:3000`.

---

## Running Tests

The test suite contains 64 unit and integration tests covering domain invariants, evaluation heuristics, concurrent composite execution, repository persistence, and API error mappings:

```bash
# Run all tests once
npm test

# Run tests in watch mode
npm run test:watch
```

### Test Suite Structure
- `tests/architecture/DomainBoundary.test.ts`: Verifies zero external imports or forbidden node modules inside `src/domain/`.
- `tests/domain/AttemptStateMachine.test.ts`: Enforces state transitions, invariants, and rehydration safety.
- `tests/domain/EvidenceAndRubric.test.ts`: Validates quote/absence value objects and rubric normalization.
- `tests/application/DeterministicEvaluator.test.ts`: Tests all 8 positive and negative heuristic triggers (god classes, orphans, anemic models, missing abstractions, tradeoff checks).
- `tests/application/LlmAndCompositeEvaluator.test.ts`: Verifies pure stateless concurrent execution, simulated timeouts, skipped evaluators, and composite nesting.
- `tests/application/EvaluationAndLearningLoopService.test.ts`: Verifies idempotency safeguards, payload mismatch detection, stale recovery sweeps, and score delta calculations.
- `tests/infrastructure/AttemptRepository.test.ts`: Validates SQLite and in-memory idempotency key uniqueness and persistence.
- `tests/web/ApiEndpoints.test.ts`: Validates HTTP status code contracts (200, 201, 202, 400, 404, 409, 413, 422, 500), DTO redaction, and error mapping middleware.

---

## Reviewer Walkthrough & Demo Script

Follow this step-by-step click-through to evaluate the platform end-to-end:

1. **Select a Problem**:
   - On `http://localhost:5173`, the sidebar displays 4 seeded problems: *Parking Lot System*, *Elevator Dispatcher*, *Vending Machine*, and *Rate Limiter*.
   - Click **Parking Lot System**.
   - Notice the requirements, clarifying context, and extension axes displayed in the problem details pane. (Inspect the network response: rubric thresholds and expected concept arrays are strictly redacted by the DTO layer).

2. **Load Starter Template**:
   - In the Submission Editor pane, click **Load Template**.
   - A structured JSON template pre-populates with valid sections: `assumptions`, `entities`, `relationships`, `interfaces`, `tradeoffs`, and `extensibility`.

3. **Submit Attempt**:
   - Click **Submit Design for Evaluation**.
   - The UI generates a unique idempotency key and dispatches `POST /api/attempts`.
   - The backend responds with `201 Created` and enqueues evaluation asynchronously.
   - The UI polls `GET /api/attempts/:id` for lifecycle status (`SUBMITTED` → `EVALUATING`) and `GET /api/attempts/:id/report` (`202 Accepted` while evaluating).

4. **Inspect the Evaluation Report**:
   - Once evaluation completes, the server returns `200 OK` with the full `EvaluationReport`.
   - Review the **Overall Score** (0-10) and the **Evaluator Provenance** badges (`deterministic: completed`, `llm: completed`).
   - Expand the **Dimension Breakdown** to see scores across all 8 rubric criteria:
     - Requirement Understanding
     - Class Responsibilities
     - Coupling & Cohesion
     - Encapsulation & Interfaces
     - Abstraction & Patterns
     - Extensibility & Change
     - Edge Cases & Testability
     - Explanation & Tradeoffs
   - Click on findings to inspect honest citations (`quote` with target JSON path or explicit `absence` notice).

5. **Test Idempotency & Conflict Handling**:
   - Click **Submit Design for Evaluation** again without modifying the JSON.
   - The server detects the identical payload and replays the existing attempt (`200 OK`, same `attemptId`).
   - Now modify a single character in the editor and click submit with the same key.
   - The backend catches the collision and returns `409 Conflict` (`IdempotencyPayloadMismatchError`).

6. **View Attempt History & Longitudinal Learning Loop**:
   - Make a second, improved submission for the same problem (e.g. break down a large entity or add an interface).
   - In the **Attempt History** tab, observe the calculated score deltas (e.g., `+1.8` overall, with per-dimension gain/loss chips).
   - Switch to the **Recurring Weaknesses** panel: any architectural flaw flagged in 2 or more attempts is aggregated with actionable recommendations.

---

## Key Design Decisions & Tradeoffs

| Decision | Alternative Considered | Rationale |
| :--- | :--- | :--- |
| **Structured Spec (JSON)** | Freeform prose / markdown | Freeform prose induces heavy LLM hallucination and prevents syntactic heuristics. Structured input provides reliable AST-like anchors for deterministic analysis. |
| **Monolith In-Process Async** | Celery / BullMQ / Redis | Monolithic simplicity meets take-home scope boundaries. A startup recovery sweep handles process crashes without adding external infrastructure dependencies. |
| **Confidence-Weighted Merging** | Winner-Takes-All scoring | Deterministic rules have near 1.0 confidence on syntax violations, while LLMs provide 0.8 confidence on design nuances. Merging preserves both findings with attribution. |
| **DTO Redaction Layer** | Exposing domain models directly | Prevents learners from inspecting browser DevTools to read `expectedConcepts` and game the evaluation heuristics. |

For full details, read [docs/DESIGN.md](docs/DESIGN.md) and [docs/RESEARCH.md](docs/RESEARCH.md).
