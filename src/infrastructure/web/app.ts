import express, { type Request, type Response } from 'express';
import cors from 'cors';
import type { ProblemRepository } from '../../domain/interfaces/ProblemRepository.js';
import type { AttemptRepository } from '../../domain/interfaces/AttemptRepository.js';
import type { EvaluationService } from '../../application/services/EvaluationService.js';
import type { LearningLoopService } from '../../application/services/LearningLoopService.js';

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

  // 1. List all practice problems
  app.get('/api/problems', async (_req: Request, res: Response) => {
    try {
      const problems = await problemRepo.findAll();
      res.json(problems);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 2. Get specific problem details
  app.get('/api/problems/:id', async (req: Request, res: Response) => {
    try {
      const problem = await problemRepo.findById(req.params.id);
      if (!problem) {
        res.status(404).json({ error: 'Problem not found' });
        return;
      }
      res.json(problem);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 3. Submit an attempt (immediate return, async evaluation)
  app.post('/api/attempts', async (req: Request, res: Response) => {
    try {
      const { learnerId, problemId, formatId, rawSubmission, idempotencyKey } = req.body;

      if (!learnerId || !problemId || !idempotencyKey) {
        res.status(400).json({
          error: 'learnerId, problemId, and idempotencyKey are required',
        });
        return;
      }

      const result = await evaluationService.submitAttempt({
        learnerId,
        problemId,
        formatId: formatId || 'structured-text',
        rawSubmission,
        idempotencyKey,
      });

      if (result.status === 'VALIDATION_FAILED') {
        res.status(422).json({
          error: 'Validation failed for submission payload',
          validationErrors: result.validationErrors,
        });
        return;
      }

      res.status(result.isExisting ? 200 : 201).json(result);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 4. Get attempt status & metadata
  app.get('/api/attempts/:id', async (req: Request, res: Response) => {
    try {
      const attempt = await attemptRepo.findById(req.params.id);
      if (!attempt) {
        res.status(404).json({ error: 'Attempt not found' });
        return;
      }

      res.json({
        id: attempt.id,
        problemId: attempt.problemId,
        learnerId: attempt.learnerId,
        status: attempt.status,
        degraded: attempt.degraded,
        createdAt: attempt.createdAt,
        updatedAt: attempt.updatedAt,
        errorMessage: attempt.errorMessage,
      });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 5. Get attempt report
  app.get('/api/attempts/:id/report', async (req: Request, res: Response) => {
    try {
      const attempt = await attemptRepo.findById(req.params.id);
      if (!attempt) {
        res.status(404).json({ error: 'Attempt not found' });
        return;
      }

      if (attempt.status !== 'EVALUATED' || !attempt.report) {
        res.status(400).json({
          error: `Attempt is in status '${attempt.status}', report not available yet. Poll /api/attempts/:id for status.`,
        });
        return;
      }

      res.json(attempt.report);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 6. Get learner attempt history with deltas for a specific problem
  app.get('/api/learners/:learnerId/problems/:problemId/history', async (req: Request, res: Response) => {
    try {
      const { learnerId, problemId } = req.params;
      const attempts = await attemptRepo.findByLearnerAndProblem(learnerId, problemId);
      const decorated = learningLoopService.decorateHistoryWithDeltas(attempts);
      res.json(decorated);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  // 7. Get aggregated recurring weaknesses across attempts
  app.get('/api/learners/:learnerId/weaknesses', async (req: Request, res: Response) => {
    try {
      const { learnerId } = req.params;
      const attempts = await attemptRepo.listByLearner(learnerId);
      const weaknesses = learningLoopService.computeWeaknesses(learnerId, attempts);
      res.json(weaknesses);
    } catch (err) {
      res.status(500).json({ error: (err as Error).message });
    }
  });

  return app;
}
