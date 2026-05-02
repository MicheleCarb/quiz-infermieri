import { useEffect, useMemo, useRef, useState } from 'react';
import QuizCard from './components/QuizCard.jsx';
import StatsBar from './components/StatsBar.jsx';
import ReviewMistakesButton from './components/ReviewMistakesButton.jsx';
import MistakeHistory from './components/MistakeHistory.jsx';
import { shuffle } from './utils/shuffle';
import { clearProgress, loadProgress, saveProgress } from './utils/storage';
import { buildQuestionMap, createInitialProgress, getPercent, sanitizeProgress } from './utils/quizEngine';
import { getRandomMonkeyGif, loadMonkeyGifs } from './utils/monkeyGifs';

const QUESTIONS_URL = `${import.meta.env.BASE_URL}data/questions.json`;
const EXPORT_APP_ID = 'quiz-kikka';
const EXPORT_SCHEMA_VERSION = 1;
const QUIZ_ID = 'asl-bari-infermieri';

export default function App() {
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [progress, setProgress] = useState(null);
  const [answers, setAnswers] = useState([]);
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const [result, setResult] = useState(null);
  const [feedbackGif, setFeedbackGif] = useState(null);
  const [monkeyGifs, setMonkeyGifs] = useState({ correct: [], wrong: [] });
  const [reviewMode, setReviewMode] = useState(false);
  const [reviewOrder, setReviewOrder] = useState([]);
  const [reviewIndex, setReviewIndex] = useState(0);
  const [reviewAttempt, setReviewAttempt] = useState(0);
  const [historyMode, setHistoryMode] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferMessage, setTransferMessage] = useState('');
  const fileInputRef = useRef(null);

  const questionMap = useMemo(() => buildQuestionMap(questions), [questions]);
  const total = questions.length;
  const mistakesCount = progress ? Object.keys(progress.mistakes).length : 0;
  const historyItems = useMemo(
    () => Object.values(progress?.mistakeHistory || {}).sort((a, b) => {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    }),
    [progress]
  );
  const historyCount = historyItems.length;
  const completedCount = progress ? Math.min(progress.answeredIds.length, total) : 0;
  const hasProgress = progress
    ? completedCount > 0 || progress.correctCount > 0 || progress.wrongCount > 0 || mistakesCount > 0 || historyCount > 0
    : false;

  const currentQuestionId = reviewMode
    ? reviewOrder[reviewIndex]
    : progress?.questionOrder[progress.currentIndex];
  const currentQuestion = currentQuestionId ? questionMap.get(String(currentQuestionId)) : null;
  const isFinished = !reviewMode && progress && progress.currentIndex >= progress.questionOrder.length;
  const isReviewFinished = reviewMode && reviewOrder.length > 0 && reviewIndex >= reviewOrder.length;
  const showStickyNext = Boolean(
    selectedAnswer
      && currentQuestion
      && !historyMode
      && !isFinished
      && !isReviewFinished
      && !(reviewMode && reviewOrder.length === 0)
  );

  useEffect(() => {
    let cancelled = false;

    async function loadQuestions() {
      try {
        setStatus('loading');
        const response = await fetch(QUESTIONS_URL);
        if (!response.ok) {
          throw new Error(`Impossibile caricare ${QUESTIONS_URL}: HTTP ${response.status}`);
        }

        const data = await response.json();
        const loadedQuestions = Array.isArray(data.questions) ? data.questions : [];

        if (cancelled) return;

        setMetadata(data.metadata || null);
        setQuestions(loadedQuestions);

        if (loadedQuestions.length === 0) {
          setStatus('empty');
          return;
        }

        const map = buildQuestionMap(loadedQuestions);
        const restored = sanitizeProgress(loadProgress(), map, loadedQuestions);
        setProgress(restored);
        saveProgress(restored);
        setStatus('ready');
      } catch (error) {
        if (!cancelled) {
          setLoadError(error.message || 'Errore sconosciuto durante il caricamento.');
          setStatus('error');
        }
      }
    }

    loadQuestions();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    loadMonkeyGifs(import.meta.env.BASE_URL).then((gifLists) => {
      if (!cancelled) setMonkeyGifs(gifLists);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!currentQuestion) {
      setAnswers([]);
      setSelectedAnswer(null);
      setResult(null);
      setFeedbackGif(null);
      return;
    }

    setAnswers(shuffle(Array.isArray(currentQuestion.answers) ? currentQuestion.answers : []));
    setSelectedAnswer(null);
    setResult(null);
    setFeedbackGif(null);
  }, [currentQuestionId, currentQuestion, reviewAttempt]);

  useEffect(() => {
    if (progress) saveProgress(progress);
  }, [progress]);

  function handleSelectAnswer(answer) {
    if (!currentQuestion || selectedAnswer) return;

    closeTransferProgress();
    const selectedLabel = answer.label;
    const correctLabel = currentQuestion.correctAnswer || 'A';
    const isCorrect = selectedLabel === correctLabel;
    const questionId = String(currentQuestion.id);

    setSelectedAnswer(selectedLabel);
    const nextResult = isCorrect ? 'correct' : 'wrong';
    setResult(nextResult);
    setFeedbackGif(getRandomMonkeyGif(nextResult, monkeyGifs));

    setProgress((previous) => {
      const next = {
        ...previous,
        mistakes: { ...previous.mistakes },
        mistakeHistory: { ...previous.mistakeHistory },
      };
      const mistakeRecord = {
        questionId,
        selectedAnswer: selectedLabel,
        correctAnswer: correctLabel,
        timestamp: new Date().toISOString(),
      };

      if (reviewMode) {
        if (isCorrect) {
          delete next.mistakes[questionId];
        } else {
          next.mistakes[questionId] = mistakeRecord;
          next.mistakeHistory[questionId] = mistakeRecord;
        }
        return next;
      }

      const answeredIds = new Set(next.answeredIds);
      if (!answeredIds.has(questionId)) {
        answeredIds.add(questionId);
        next.answeredIds = [...answeredIds];
        next.correctCount += isCorrect ? 1 : 0;
        next.wrongCount += isCorrect ? 0 : 1;
      }

      if (isCorrect) {
        delete next.mistakes[questionId];
      } else {
        next.mistakes[questionId] = mistakeRecord;
        next.mistakeHistory[questionId] = mistakeRecord;
      }

      return next;
    });
  }

  function handleNext() {
    closeTransferProgress();

    if (reviewMode) {
      const remainingReviewIds = reviewOrder.filter((id) => progress?.mistakes[id]);
      const nextIndex = reviewIndex + 1;

      if (nextIndex >= reviewOrder.length) {
        setReviewOrder(remainingReviewIds);
        setReviewIndex(remainingReviewIds.length > 0 ? 0 : nextIndex);
        setReviewAttempt((attempt) => attempt + 1);
      } else {
        setReviewIndex(nextIndex);
      }
      return;
    }

    setProgress((previous) => ({
      ...previous,
      currentIndex: Math.min(previous.currentIndex + 1, previous.questionOrder.length),
    }));
  }

  function startReviewMode() {
    const ids = Object.keys(progress?.mistakes || {});
    if (ids.length === 0) return;

    closeTransferProgress();
    setReviewOrder(shuffle(ids));
    setReviewIndex(0);
    setReviewAttempt(0);
    setReviewMode(true);
  }

  function exitReviewMode() {
    setReviewMode(false);
    setReviewOrder([]);
    setReviewIndex(0);
    setReviewAttempt(0);
  }

  function resetQuiz() {
    closeTransferProgress();
    const confirmed = window.confirm('Vuoi cancellare i progressi e ricominciare da capo?');
    if (!confirmed) return;

    clearProgress();
    const freshProgress = createInitialProgress(questions);
    setProgress(freshProgress);
    saveProgress(freshProgress);
    setHistoryMode(false);
    exitReviewMode();
  }

  function openHistoryMode() {
    closeTransferProgress();
    setHistoryMode(true);
  }

  function closeTransferProgress() {
    setTransferOpen(false);
  }

  async function getQuestionsHash() {
    if (!window.crypto?.subtle) return null;

    const serialized = JSON.stringify(questions);
    const data = new TextEncoder().encode(serialized);
    const digest = await window.crypto.subtle.digest('SHA-256', data);

    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  }

  async function handleExportProgress() {
    if (!progress) return;

    const exportData = {
      app: EXPORT_APP_ID,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      quizId: QUIZ_ID,
      source: metadata?.source || 'Quiz infermieristica',
      totalQuestions: metadata?.totalQuestions || total,
      questionsHash: await getQuestionsHash(),
      exportedAt: new Date().toISOString(),
      progress,
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `quiz-kikka-progressi-${QUIZ_ID}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setTransferMessage('Progressi scaricati.');
  }

  function handleChooseImportFile() {
    fileInputRef.current?.click();
  }

  async function handleImportFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    try {
      const parsed = JSON.parse(await file.text());
      const validation = await validateProgressExport(parsed);

      if (!validation.ok) {
        setTransferMessage(validation.message);
        return;
      }

      const confirmed = window.confirm('Caricare questi progressi sostituirà quelli attuali. Vuoi continuare?');
      if (!confirmed) return;

      saveProgress(validation.progress);
      setProgress(validation.progress);
      setSelectedAnswer(null);
      setResult(null);
      setFeedbackGif(null);
      setHistoryMode(false);
      exitReviewMode();
      closeTransferProgress();
      setTransferMessage('Progressi caricati! Puoi continuare da dove eri.');
    } catch (error) {
      setTransferMessage('Questo file non sembra un salvataggio valido dei quiz.');
    }
  }

  async function validateProgressExport(parsed) {
    if (!parsed || typeof parsed !== 'object') {
      return invalidSave();
    }

    if (parsed.app !== EXPORT_APP_ID || parsed.schemaVersion !== EXPORT_SCHEMA_VERSION) {
      return invalidSave();
    }

    if (parsed.quizId !== QUIZ_ID) {
      return { ok: false, message: 'Questo salvataggio appartiene a un altro quiz.' };
    }

    if (
      typeof parsed.totalQuestions === 'number'
      && parsed.totalQuestions !== total
    ) {
      return { ok: false, message: 'Questo salvataggio non è compatibile con questa banca dati.' };
    }

    if (parsed.questionsHash) {
      const currentHash = await getQuestionsHash();
      if (currentHash && parsed.questionsHash !== currentHash) {
        return { ok: false, message: 'Questo salvataggio non è compatibile con questa banca dati.' };
      }
    }

    if (!isProgressShapeValid(parsed.progress)) {
      return invalidSave();
    }

    if (parsed.progress.questionOrder.length !== total) {
      return { ok: false, message: 'Questo salvataggio non è compatibile con questa banca dati.' };
    }

    const importedProgress = {
      ...parsed.progress,
      questionOrder: parsed.progress.questionOrder.map(String),
      answeredIds: parsed.progress.answeredIds.map(String),
      mistakes: parsed.progress.mistakes || {},
      mistakeHistory: parsed.progress.mistakeHistory || {},
    };
    const sanitized = sanitizeProgress(importedProgress, questionMap, questions);

    if (sanitized.questionOrder.length !== total) {
      return { ok: false, message: 'Questo salvataggio non è compatibile con questa banca dati.' };
    }

    return { ok: true, progress: sanitized };
  }

  function isProgressShapeValid(importedProgress) {
    if (!importedProgress || typeof importedProgress !== 'object') return false;
    if (!Array.isArray(importedProgress.questionOrder)) return false;
    if (!Array.isArray(importedProgress.answeredIds)) return false;
    if (typeof importedProgress.currentIndex !== 'number') return false;
    if (importedProgress.currentIndex < 0 || importedProgress.currentIndex > total) return false;
    if (typeof importedProgress.correctCount !== 'number') return false;
    if (typeof importedProgress.wrongCount !== 'number') return false;
    if (!isPlainObject(importedProgress.mistakes)) return false;
    if (
      importedProgress.mistakeHistory !== undefined
      && !isPlainObject(importedProgress.mistakeHistory)
    ) return false;

    const seen = new Set();
    for (const id of importedProgress.questionOrder) {
      const normalizedId = String(id);
      if (!questionMap.has(normalizedId) || seen.has(normalizedId)) return false;
      seen.add(normalizedId);
    }

    for (const id of importedProgress.answeredIds) {
      if (!questionMap.has(String(id))) return false;
    }

    return true;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }

  function invalidSave() {
    return { ok: false, message: 'Questo file non sembra un salvataggio valido dei quiz.' };
  }

  if (status === 'loading') {
    return <Shell><main className="panel">Caricamento domande...</main></Shell>;
  }

  if (status === 'error') {
    return (
      <Shell>
        <main className="panel panel--message">
          <h1>Non riesco a caricare le domande</h1>
          <p>{loadError}</p>
        </main>
      </Shell>
    );
  }

  if (status === 'empty') {
    return (
      <Shell>
        <main className="panel panel--message">
          <h1>Nessuna domanda disponibile</h1>
          <p>Il file JSON e stato caricato, ma non contiene domande utilizzabili.</p>
        </main>
      </Shell>
    );
  }

  if (!progress) {
    return <Shell><main className="panel">Preparazione sessione...</main></Shell>;
  }

  return (
    <Shell stickyNext={showStickyNext}>
      <header className="app-header">
        <div>
          <h1>I quiz di Kikka 🐵</h1>
          <p className="source">{metadata?.source || 'Quiz infermieristica'}</p>
        </div>
      </header>

      <StatsBar
        completed={completedCount}
        total={total}
        correctCount={progress.correctCount}
        wrongCount={progress.wrongCount}
      />

      {historyMode ? (
        <MistakeHistory
          historyItems={historyItems}
          questionMap={questionMap}
          onBack={() => setHistoryMode(false)}
        />
      ) : isFinished ? (
        <FinalScreen
          total={total}
          correctCount={progress.correctCount}
          wrongCount={progress.wrongCount}
          mistakesCount={mistakesCount}
          historyCount={historyCount}
          onReview={startReviewMode}
          onHistory={openHistoryMode}
        />
      ) : isReviewFinished || (reviewMode && reviewOrder.length === 0) ? (
        <section className="panel panel--message">
          <h1>Ripasso completato</h1>
          <p>Errori rimasti da ripassare: {mistakesCount}</p>
          <button className="button button--primary" type="button" onClick={exitReviewMode}>
            Torna al quiz principale
          </button>
        </section>
      ) : currentQuestion ? (
        <QuizCard
          question={currentQuestion}
          displayIndex={Math.min(progress.currentIndex + 1, total)}
          total={total}
          answers={answers}
          selectedAnswer={selectedAnswer}
          result={result}
          feedbackGif={feedbackGif}
          reviewMode={reviewMode}
          mistakesCount={mistakesCount}
          completedCount={completedCount}
          onSelectAnswer={handleSelectAnswer}
          onNext={handleNext}
          onExitReview={exitReviewMode}
        />
      ) : (
        <section className="panel panel--message">
          <h1>Domanda non trovata</h1>
          <p>Una domanda salvata nei progressi non esiste piu nel file JSON.</p>
          <button className="button button--primary" type="button" onClick={resetQuiz}>
            Rigenera sessione
          </button>
        </section>
      )}

      {!reviewMode && !isFinished && !historyMode && (
        <div className="actions">
          <ReviewMistakesButton count={mistakesCount} onClick={startReviewMode} />
          <button
            className="button button--quiet"
            type="button"
            onClick={openHistoryMode}
            disabled={historyCount === 0}
          >
            Storico errori{historyCount > 0 ? ` (${historyCount})` : ''}
          </button>
        </div>
      )}
      {!reviewMode && !historyMode && !isFinished && currentQuestion && (
        <TransferProgress
          fileInputRef={fileInputRef}
          open={transferOpen}
          message={transferMessage}
          onToggle={setTransferOpen}
          onExport={handleExportProgress}
          onChooseImportFile={handleChooseImportFile}
          onImportFile={handleImportFile}
        />
      )}
      {hasProgress && !reviewMode && !historyMode && !isFinished && currentQuestion && (
        <div className="reset-actions">
          <button className="button button--danger button--danger-soft" type="button" onClick={resetQuiz}>
            Ricomincia da capo
          </button>
        </div>
      )}
      {showStickyNext && (
        <div className="sticky-next">
          <button className="button button--primary" type="button" onClick={handleNext}>
            {reviewMode ? 'Prossimo errore' : 'Prossima domanda'}
          </button>
        </div>
      )}
    </Shell>
  );
}

function Shell({ children, stickyNext = false }) {
  return <div className={`app-shell${stickyNext ? ' app-shell--sticky-next' : ''}`}>{children}</div>;
}

function TransferProgress({ fileInputRef, open, message, onToggle, onExport, onChooseImportFile, onImportFile }) {
  return (
    <details className="transfer-progress" open={open} onToggle={(event) => onToggle(event.currentTarget.open)}>
      <summary>Trasferisci progressi</summary>
      <div className="transfer-progress__body">
        <p>Vuoi continuare su un altro dispositivo? Scarica un file con i progressi e caricalo sull’altro dispositivo.</p>
        <div className="transfer-progress__actions">
          <button className="button button--secondary" type="button" onClick={onExport}>
            Scarica progressi
          </button>
          <button className="button button--quiet" type="button" onClick={onChooseImportFile}>
            Carica da file
          </button>
        </div>
        <input
          ref={fileInputRef}
          className="transfer-progress__file"
          type="file"
          accept="application/json,.json"
          onChange={onImportFile}
        />
        {message && <p className="transfer-progress__message" role="status">{message}</p>}
      </div>
    </details>
  );
}

function FinalScreen({ total, correctCount, wrongCount, mistakesCount, historyCount, onReview, onHistory }) {
  const accuracy = getPercent(correctCount, correctCount + wrongCount);

  return (
    <section className="panel final">
      <p className="eyebrow">Sessione completata</p>
      <h1>Hai completato tutte le domande</h1>
      <div className="final__grid">
        <div><span>Totale domande</span><strong>{total}</strong></div>
        <div><span>Risposte corrette</span><strong>{correctCount}</strong></div>
        <div><span>Risposte sbagliate</span><strong>{wrongCount}</strong></div>
        <div><span>Correttezza</span><strong>{accuracy}%</strong></div>
        <div><span>Errori da ripassare</span><strong>{mistakesCount}</strong></div>
        <div><span>Storico errori</span><strong>{historyCount}</strong></div>
      </div>
      <div className="final__actions">
        {mistakesCount > 0 && (
          <button className="button button--secondary" type="button" onClick={onReview}>
            Ripassa errori
          </button>
        )}
        {historyCount > 0 && (
          <button className="button button--quiet" type="button" onClick={onHistory}>
            Storico errori
          </button>
        )}
      </div>
    </section>
  );
}
