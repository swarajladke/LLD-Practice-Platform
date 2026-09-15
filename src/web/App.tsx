import { useState, useEffect } from 'react';
import { STARTER_TEMPLATES } from './starterTemplates.js';

interface Problem {
  id: string;
  title: string;
  description: string;
  requirements: string[];
  clarifyingContext: string[];
  rubric: {
    expectedConcepts: string[];
    extensionAxes: string[];
    minEntities: number;
    minTradeoffs: number;
  };
}

interface Finding {
  evidenceRef:
    | { kind: 'quote'; evidence: { quote: string; sourcePath: string } }
    | { kind: 'absence'; expectedPath: string; note: string };
  concern: string;
  suggestion: string;
  evaluatorId: string;
}

interface DimensionResult {
  criterion: string;
  score: number;
  confidence: number;
  evaluatorIds: string[];
  findings: Finding[];
}

interface EvaluationReport {
  attemptId: string;
  rubricVersion: string;
  evaluatorsRun: string[];
  evaluatorsFailed: string[];
  evaluatorsSkipped: string[];
  dimensionsMissing: string[];
  overallScoreComparable: boolean;
  dimensionResults: DimensionResult[];
  overallScore: number;
  summary: string;
  degraded: boolean;
  evaluatedAt: string;
}

interface DimensionDelta {
  criterion: string;
  previousScore: number;
  currentScore: number;
  delta: number;
}

interface AttemptWithDeltas {
  attempt: {
    id: string;
    status: string;
    createdAt: string;
    report?: EvaluationReport;
  };
  deltas?: DimensionDelta[];
}

interface RecurringWeakness {
  criterion: string;
  averageScore: number;
  lowScoreCount: number;
  recurringConcerns: string[];
  recommendedFocus: string;
}

interface WeaknessSummary {
  learnerId: string;
  totalEvaluatedAttempts: number;
  recurringWeaknesses: RecurringWeakness[];
}

export function App() {
  const [activeTab, setActiveTab] = useState<'practice' | 'history' | 'weaknesses'>('practice');
  const [learnerId, setLearnerId] = useState('learner-alex');
  const [problems, setProblems] = useState<Problem[]>([]);
  const [selectedProblemId, setSelectedProblemId] = useState('parking-lot');
  const [editorText, setEditorText] = useState(STARTER_TEMPLATES['parking-lot'] || '');

  // Submission state
  const [currentAttemptId, setCurrentAttemptId] = useState<string | null>(null);
  const [attemptStatus, setAttemptStatus] = useState<string | null>(null);
  const [report, setReport] = useState<EvaluationReport | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<any[] | null>(null);

  // History & weaknesses
  const [history, setHistory] = useState<AttemptWithDeltas[]>([]);
  const [weaknessSummary, setWeaknessSummary] = useState<WeaknessSummary | null>(null);

  useEffect(() => {
    fetch('/api/problems')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setProblems(data);
          if (!selectedProblemId) {
            setSelectedProblemId(data[0].id);
          }
        }
      })
      .catch((e) => console.error('Failed to load problems', e));
  }, []);

  const selectedProblem = problems.find((p) => p.id === selectedProblemId) || problems[0];

  const handleProblemChange = (pId: string) => {
    setSelectedProblemId(pId);
    setReport(null);
    setCurrentAttemptId(null);
    setAttemptStatus(null);
    setValidationErrors(null);
    if (STARTER_TEMPLATES[pId]) {
      setEditorText(STARTER_TEMPLATES[pId]);
    }
  };

  const handleLoadTemplate = () => {
    if (STARTER_TEMPLATES[selectedProblemId]) {
      setEditorText(STARTER_TEMPLATES[selectedProblemId]);
    }
  };

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setValidationErrors(null);
    setReport(null);

    let parsedPayload: any;
    try {
      parsedPayload = JSON.parse(editorText);
    } catch {
      alert('Invalid JSON in editor. Please ensure proper JSON syntax.');
      setIsSubmitting(false);
      return;
    }

    const idempotencyKey = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    try {
      const res = await fetch('/api/attempts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          learnerId,
          problemId: selectedProblemId,
          formatId: 'structured-text',
          rawSubmission: parsedPayload,
          idempotencyKey,
        }),
      });

      const data = await res.json();
      if (res.status === 422) {
        setValidationErrors(data.validationErrors || [{ message: data.error }]);
        setIsSubmitting(false);
        return;
      }

      setCurrentAttemptId(data.attemptId);
      setAttemptStatus(data.status);
      pollAttempt(data.attemptId);
    } catch (err: any) {
      alert(`Submission error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  const pollAttempt = (attemptId: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/attempts/${attemptId}`);
        const data = await res.json();
        setAttemptStatus(data.status);

        if (data.status === 'EVALUATED') {
          clearInterval(interval);
          setIsSubmitting(false);
          const repRes = await fetch(`/api/attempts/${attemptId}/report`);
          const repData = await repRes.json();
          setReport(repData);
        } else if (data.status === 'FAILED') {
          clearInterval(interval);
          setIsSubmitting(false);
          alert(`Evaluation failed: ${data.errorMessage}`);
        }
      } catch (err) {
        console.error('Polling error', err);
      }
    }, 800);
  };

  const loadHistory = async () => {
    try {
      const res = await fetch(`/api/learners/${learnerId}/problems/${selectedProblemId}/history`);
      const data = await res.json();
      setHistory(data);
    } catch (e) {
      console.error(e);
    }
  };

  const loadWeaknesses = async () => {
    try {
      const res = await fetch(`/api/learners/${learnerId}/weaknesses`);
      const data = await res.json();
      setWeaknessSummary(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    if (activeTab === 'history') {
      loadHistory();
    } else if (activeTab === 'weaknesses') {
      loadWeaknesses();
    }
  }, [activeTab, selectedProblemId, learnerId]);

  return (
    <div className="container">
      <header>
        <div className="brand">
          <h1>LLD Practice Platform</h1>
          <span className="badge badge-info">v1.0.0</span>
        </div>
        <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>Learner:</span>
            <input
              type="text"
              value={learnerId}
              onChange={(e) => setLearnerId(e.target.value)}
              style={{
                background: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                color: '#fff',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '0.85rem',
                width: '120px',
              }}
            />
          </div>
          <div className="nav-tabs">
            <button
              className={`nav-tab ${activeTab === 'practice' ? 'active' : ''}`}
              onClick={() => setActiveTab('practice')}
            >
              Practice Loop
            </button>
            <button
              className={`nav-tab ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Attempt History
            </button>
            <button
              className={`nav-tab ${activeTab === 'weaknesses' ? 'active' : ''}`}
              onClick={() => setActiveTab('weaknesses')}
            >
              Recurring Weaknesses
            </button>
          </div>
        </div>
      </header>

      {activeTab === 'practice' && (
        <div className="grid-main">
          {/* Left Column: Problem description & editor */}
          <div>
            <div className="card">
              <label style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
                Select Practice Problem:
              </label>
              <select
                className="problem-select"
                value={selectedProblemId}
                onChange={(e) => handleProblemChange(e.target.value)}
              >
                {problems.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title}
                  </option>
                ))}
              </select>

              {selectedProblem && (
                <div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                    {selectedProblem.description}
                  </p>

                  <div style={{ marginBottom: '10px' }}>
                    <strong style={{ fontSize: '0.85rem', color: '#38bdf8' }}>Requirements:</strong>
                    <ul className="req-list">
                      {selectedProblem.requirements.map((req, i) => (
                        <li key={i}>{req}</li>
                      ))}
                    </ul>
                  </div>

                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '12px' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Core Concepts:</span>
                    {selectedProblem.rubric.expectedConcepts.map((c) => (
                      <span key={c} className="badge badge-info" style={{ textTransform: 'none' }}>
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">
                <span>Structured Design Spec (JSON)</span>
                <button className="btn btn-secondary" style={{ padding: '4px 10px', fontSize: '0.8rem' }} onClick={handleLoadTemplate}>
                  Load Starter Template
                </button>
              </div>

              <textarea
                className="code-editor"
                value={editorText}
                onChange={(e) => setEditorText(e.target.value)}
                placeholder="Enter structured JSON specification..."
              />

              {validationErrors && (
                <div style={{ background: 'var(--danger-bg)', border: '1px solid rgba(239, 68, 68, 0.4)', padding: '10px 14px', borderRadius: '8px', marginTop: '12px' }}>
                  <strong style={{ color: 'var(--danger)', fontSize: '0.85rem' }}>Validation Issues:</strong>
                  <ul style={{ listStyle: 'none', marginTop: '4px', fontSize: '0.82rem', color: '#fca5a5' }}>
                    {validationErrors.map((err, i) => (
                      <li key={i}>• {err.path ? `${err.path}: ` : ''}{err.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ marginTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <button className="btn" onClick={handleSubmit} disabled={isSubmitting}>
                  {isSubmitting ? (
                    <>
                      <span className="status-pulse"></span>
                      Evaluating...
                    </>
                  ) : (
                    'Submit Design'
                  )}
                </button>

                {currentAttemptId && (
                  <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                    Attempt: <code style={{ color: '#38bdf8' }}>{currentAttemptId}</code> | Status:{' '}
                    <span className={`badge ${attemptStatus === 'EVALUATED' ? 'badge-success' : 'badge-warning'}`}>
                      {attemptStatus}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Column: Evaluation Report */}
          <div>
            <div className="card">
              <div className="card-title">
                <span>Evaluation Report</span>
                {report && (
                  <span className="badge badge-success" style={{ fontSize: '0.9rem', padding: '6px 12px' }}>
                    Overall: {report.overallScore} / 5.0
                  </span>
                )}
              </div>

              {!report && !isSubmitting && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                  Submit your design spec to receive explainable, grounded feedback across all 8 rubric dimensions.
                </div>
              )}

              {isSubmitting && !report && (
                <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-secondary)' }}>
                  <span className="status-pulse" style={{ width: '14px', height: '14px' }}></span>
                  <p style={{ marginTop: '12px', fontWeight: 500 }}>
                    Evaluating submission in background ({attemptStatus})...
                  </p>
                </div>
              )}

              {report && (
                <div>
                  {report.degraded && (
                    <div style={{ background: 'var(--warning-bg)', border: '1px solid rgba(245, 158, 11, 0.4)', padding: '10px 14px', borderRadius: '8px', marginBottom: '16px' }}>
                      <strong style={{ color: 'var(--warning)', fontSize: '0.85rem' }}>Degraded Evaluation Notice:</strong>
                      <p style={{ fontSize: '0.82rem', color: '#fde68a', marginTop: '2px' }}>
                        Partial report generated via deterministic heuristics. Failed/skipped evaluators: [
                        {report.evaluatorsFailed.concat(report.evaluatorsSkipped).join(', ')}].
                      </p>
                    </div>
                  )}

                  <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginBottom: '16px', background: 'var(--bg-primary)', padding: '10px 12px', borderRadius: '8px' }}>
                    {report.summary}
                  </p>

                  <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Evaluators Run:</span>
                    {report.evaluatorsRun.map((e) => (
                      <span key={e} className="badge badge-info" style={{ fontSize: '0.7rem' }}>
                        {e}
                      </span>
                    ))}
                  </div>

                  <div>
                    {report.dimensionResults.map((dr) => (
                      <div key={dr.criterion} className="dimension-card">
                        <div className="dimension-header">
                          <div>
                            <strong style={{ fontSize: '0.9rem', color: '#f8fafc' }}>{dr.criterion}</strong>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              Confidence: {Math.round(dr.confidence * 100)}% | Evaluators: {dr.evaluatorIds.join(', ')}
                            </div>
                          </div>
                          <span className="score-display" style={{ color: dr.score >= 4 ? 'var(--success)' : dr.score >= 3 ? 'var(--warning)' : 'var(--danger)' }}>
                            {dr.score} / 5.0
                          </span>
                        </div>

                        {dr.findings.length === 0 ? (
                          <div style={{ fontSize: '0.8rem', color: 'var(--success)', marginTop: '4px' }}>
                            ✓ No violations detected; well-modeled.
                          </div>
                        ) : (
                          dr.findings.map((f, idx) => (
                            <div key={idx} className="finding-item">
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                                <span className="finding-quote">
                                  {f.evidenceRef.kind === 'quote'
                                    ? `"${f.evidenceRef.evidence.quote}" (${f.evidenceRef.evidence.sourcePath})`
                                    : `[ABSENCE] ${f.evidenceRef.expectedPath}`}
                                </span>
                                <span className={`badge ${f.evaluatorId === 'deterministic' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: '0.65rem' }}>
                                  {f.evaluatorId}
                                </span>
                              </div>
                              <div className="finding-concern">⚠️ {f.concern}</div>
                              <div className="finding-suggestion">💡 {f.suggestion}</div>
                            </div>
                          ))
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'history' && (
        <div className="card">
          <div className="card-title">
            <span>Attempt History: {selectedProblem?.title}</span>
            <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={loadHistory}>
              Refresh History
            </button>
          </div>

          {history.length === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>No previous attempts recorded for this problem yet.</p>
          ) : (
            <div>
              {history.map((item, idx) => (
                <div key={item.attempt.id} style={{ background: 'var(--bg-primary)', padding: '14px', borderRadius: '8px', marginBottom: '12px', border: '1px solid var(--border-color)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                    <div>
                      <strong>Attempt #{idx + 1}</strong> ({item.attempt.id})
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '12px' }}>
                        {new Date(item.attempt.createdAt).toLocaleString()}
                      </span>
                    </div>
                    {item.attempt.report && (
                      <span className="score-display" style={{ color: 'var(--accent-primary)' }}>
                        Overall: {item.attempt.report.overallScore} / 5.0
                      </span>
                    )}
                  </div>

                  {item.deltas && item.deltas.length > 0 && (
                    <div style={{ marginTop: '10px' }}>
                      <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Score Progression from Prior Attempt:</span>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '8px', marginTop: '6px' }}>
                        {item.deltas.map((d) => (
                          <div key={d.criterion} style={{ background: 'var(--bg-secondary)', padding: '6px 10px', borderRadius: '6px', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ color: 'var(--text-secondary)' }}>{d.criterion}:</span>
                            <span className={d.delta >= 0 ? 'delta-green' : 'delta-red'}>
                              {d.previousScore} → {d.currentScore} ({d.delta > 0 ? `+${d.delta}` : d.delta})
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'weaknesses' && (
        <div className="card">
          <div className="card-title">
            <span>Aggregated Recurring Weaknesses ({learnerId})</span>
            <button className="btn btn-secondary" style={{ padding: '4px 12px', fontSize: '0.8rem' }} onClick={loadWeaknesses}>
              Refresh Summary
            </button>
          </div>

          {!weaknessSummary || weaknessSummary.totalEvaluatedAttempts === 0 ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
              No evaluated attempts recorded yet. Submit designs to see weakness pattern analysis.
            </p>
          ) : (
            <div>
              <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '16px' }}>
                Analysis across <strong>{weaknessSummary.totalEvaluatedAttempts}</strong> evaluated attempts identified the following recurring architectural weakness areas:
              </p>

              {weaknessSummary.recurringWeaknesses.length === 0 ? (
                <div style={{ color: 'var(--success)', fontSize: '0.95rem' }}>
                  🎉 No persistent weaknesses detected across attempts! Solid architectural consistency.
                </div>
              ) : (
                weaknessSummary.recurringWeaknesses.map((w) => (
                  <div key={w.criterion} style={{ background: 'var(--bg-primary)', padding: '16px', borderRadius: '8px', marginBottom: '14px', borderLeft: '4px solid var(--warning)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <strong style={{ fontSize: '1rem', color: '#f8fafc' }}>{w.criterion}</strong>
                      <span className="badge badge-warning">
                        Average: {w.averageScore} / 5.0 (Low {w.lowScoreCount}x)
                      </span>
                    </div>

                    <div style={{ marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>Recurring Patterns:</span>
                      <ul style={{ listStyle: 'none', marginTop: '4px', fontSize: '0.84rem', color: '#fca5a5' }}>
                        {w.recurringConcerns.map((c, i) => (
                          <li key={i}>• {c}</li>
                        ))}
                      </ul>
                    </div>

                    <div style={{ background: 'rgba(56, 189, 248, 0.08)', padding: '10px', borderRadius: '6px', marginTop: '8px' }}>
                      <strong style={{ fontSize: '0.8rem', color: '#38bdf8' }}>Recommended Focus:</strong>
                      <p style={{ fontSize: '0.84rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                        {w.recommendedFocus}
                      </p>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
