import * as path from 'node:path';
import * as fs from 'node:fs';
import { createApp } from './app.js';
import { SqliteAttemptRepository } from '../repositories/SqliteAttemptRepository.js';
import { InMemoryProblemRepository } from '../repositories/InMemoryProblemRepository.js';
import { StructuredTextFormat } from '../formats/StructuredTextFormat.js';
import { DeterministicEvaluator } from '../../application/evaluators/DeterministicEvaluator.js';
import { LlmEvaluator } from '../../application/evaluators/LlmEvaluator.js';
import { CompositeEvaluator } from '../../application/evaluators/CompositeEvaluator.js';
import { EvaluationReportAssembler } from '../../application/evaluators/EvaluationReportAssembler.js';
import { FakeLlmClient } from '../llm/FakeLlmClient.js';
import { EvaluationService } from '../../application/services/EvaluationService.js';
import { LearningLoopService } from '../../application/services/LearningLoopService.js';

const PORT = Number(process.env.PORT) || 3000;
const dataDir = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'lld_platform.db');
const attemptRepo = new SqliteAttemptRepository(dbPath);
const problemRepo = new InMemoryProblemRepository();

const formats = new Map();
const structuredFormat = new StructuredTextFormat();
formats.set(structuredFormat.formatId, structuredFormat);

const deterministicEvaluator = new DeterministicEvaluator();
const fakeLlmClient = new FakeLlmClient();
const llmEvaluator = new LlmEvaluator(fakeLlmClient);

const compositeEvaluator = new CompositeEvaluator([deterministicEvaluator, llmEvaluator], {
  timeoutMs: 15000,
});
const assembler = new EvaluationReportAssembler();

const evaluationService = new EvaluationService(
  attemptRepo,
  problemRepo,
  formats,
  compositeEvaluator,
  assembler
);

const learningLoopService = new LearningLoopService();

const app = createApp({
  problemRepo,
  attemptRepo,
  evaluationService,
  learningLoopService,
});

app.listen(PORT, () => {
  console.log(`LLD Practice Platform Backend running on http://localhost:${PORT}`);
});
