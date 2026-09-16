import express, { type Request, type Response, type NextFunction } from 'express';
import cors from 'cors';
import type { ProblemRepository } from '../../domain/interfaces/ProblemRepository.js';
import type { AttemptRepository } from '../../domain/interfaces/AttemptRepository.js';
import type { EvaluationService } from '../../application/services/EvaluationService.js';
import type { LearningLoopService } from '../../application/services/LearningLoopService.js';
import {
  ProblemNotFoundError,
  UnsupportedFormatError,
  ValidationFailedError,
  DuplicateIdempotencyKeyError,
  IdempotencyPayloadMismatchError,
  PayloadTooLargeError,
  EvaluationFailedError,
} from '../../domain/errors/DomainErrors.js';
import { toProblemDto, toAttemptDto, toReportDto } from './dto/index.js';

export interface AppDependencies {
  problemRepo: ProblemRepository;
  attemptRepo: AttemptRepository;
  evaluationService: EvaluationService;
  learningLoopService: LearningLoopService;
}

export function createApp(deps: AppDependencies): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '500kb' }));

  const { problemRepo, attemptRepo, evaluationService, learningLoopService } = deps;

  // 1. List problems (DTO filtered - no rubric internals exposed)
  app.get('/api/problems', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const problems = await problemRepo.findAll();
      res.json(problems.map(toProblemDto));
    } catch (err) {
      next(err);
    }
  });

  // 2. Get specific problem details (DTO filtered)
  app.get('/api/problems/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const problem = await problemRepo.findById(req.params.id);
      if (!problem) {
        throw new ProblemNotFoundError(req.params.id);
      }
      res.json(toProblemDto(problem));
    } catch (err) {
      next(err);
    }
  });

  // 3. Submit attempt (returns 201 accepted, 200 replay, or 422 rejected)
  app.post('/api/attempts', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { learnerId, problemId, formatId, rawSubmission, idempotencyKey } = req.body;

      const result = await evaluationService.submitAttempt({
        learnerId,
        problemId,
        formatId,
        rawSubmission,
        idempotencyKey,
      });

      if (result.outcome === 'rejected') {
        res.status(422).json({
          error: 'Validation failed for submission payload',
          validationErrors: result.validationErrors,
        });
        return;
      }

      res.status(result.isReplay ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  // 4. Get attempt status & metadata (DTO)
  app.get('/api/attempts/:id', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attempt = await attemptRepo.findById(req.params.id);
      if (!attempt) {
        res.status(404).json({ error: `Attempt '${req.params.id}' not found` });
        return;
      }
      res.json(toAttemptDto(attempt));
    } catch (err) {
      next(err);
    }
  });

  // 5. Get attempt report (202 if in progress, 409 if failed, 200 if evaluated)
  app.get('/api/attempts/:id/report', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const attempt = await attemptRepo.findById(req.params.id);
      if (!attempt) {
        res.status(404).json({ error: `Attempt '${req.params.id}' not found` });
        return;
      }

      if (attempt.status === 'SUBMITTED' || attempt.status === 'EVALUATING') {
        res.status(202).json({
          status: attempt.status,
          message: `Evaluation is in progress (${attempt.status}). Please poll /api/attempts/${attempt.id} for updates.`,
        });
        return;
      }

      if (attempt.status === 'FAILED') {
        res.status(409).json({
          status: 'FAILED',
          errorMessage: attempt.errorMessage ?? 'Evaluation failed',
        });
        return;
      }

      if (!attempt.report) {
        res.status(500).json({ error: 'Evaluation report missing from evaluated attempt' });
        return;
      }

      res.status(200).json(toReportDto(attempt.report));
    } catch (err) {
      next(err);
    }
  });

  // 6. History with score deltas
  app.get(
    '/api/learners/:learnerId/problems/:problemId/history',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { learnerId, problemId } = req.params;
        const attempts = await attemptRepo.findByLearnerAndProblem(learnerId, problemId);
        const decorated = learningLoopService.decorateHistoryWithDeltas(attempts);
        res.json(
          decorated.map((item) => ({
            attempt: toAttemptDto(item.attempt),
            report: item.attempt.report ? toReportDto(item.attempt.report) : undefined,
            deltas: item.deltas,
          }))
        );
      } catch (err) {
        next(err);
      }
    }
  );

  // 7. Aggregated recurring weaknesses
  app.get(
    '/api/learners/:learnerId/weaknesses',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { learnerId } = req.params;
        const attempts = await attemptRepo.listByLearner(learnerId);
        const weaknesses = learningLoopService.computeWeaknesses(learnerId, attempts);
        res.json(weaknesses);
      } catch (err) {
        next(err);
      }
    }
  );

  // Express Error-Mapping Middleware (Replaces per-handler error handlers)
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof ProblemNotFoundError) {
      res.status(404).json({ error: err.message });
      return;
    }
    if (err instanceof UnsupportedFormatError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof ValidationFailedError) {
      res.status(422).json({
        error: err.message,
        validationErrors: err.validationErrors,
      });
      return;
    }
    if (
      err instanceof DuplicateIdempotencyKeyError ||
      err instanceof IdempotencyPayloadMismatchError
    ) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof PayloadTooLargeError) {
      res.status(413).json({ error: err.message });
      return;
    }
    if (err instanceof EvaluationFailedError) {
      console.error('EvaluationFailedError:', err.message);
      res.status(500).json({ error: 'Internal evaluation failure' });
      return;
    }

    // Generic 500 error mapping (never leak raw error message in production 500s)
    console.error('Unhandled internal error:', err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}
