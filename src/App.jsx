import { useEffect, useMemo, useRef, useState } from 'react';
import QuizCard from './components/QuizCard.jsx';
import StatsBar from './components/StatsBar.jsx';
import ReviewMistakesButton from './components/ReviewMistakesButton.jsx';
import MistakeHistory from './components/MistakeHistory.jsx';
import { shuffle } from './utils/shuffle';
import { loadProgress, saveProgress } from './utils/storage';
import {
  buildQuestionMap,
  createInitialProgressForIds,
  ensureBlockStudySets,
  getPercent,
  sanitizeProgress,
  sanitizeStudyState,
} from './utils/quizEngine';
import { getRandomMonkeyGif, loadMonkeyGifs } from './utils/monkeyGifs';

const QUESTIONS_URL = `${import.meta.env.BASE_URL}data/questions.json`;
const EXPORT_APP_ID = 'quiz-kikka';
const EXPORT_SCHEMA_VERSION = 2;
const LEGACY_EXPORT_SCHEMA_VERSION = 1;
const QUIZ_ID = 'asl-bari-infermieri';
const BLOCK_SIZES = [500, 1000];

export default function App() {
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [questions, setQuestions] = useState([]);
  const [metadata, setMetadata] = useState(null);
  const [studyState, setStudyState] = useState(null);
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
  const activeStudySet = studyState?.studySets?.[studyState.activeStudySetId] || null;
  const progress = activeStudySet ? studyState?.progressByStudySetId?.[activeStudySet.id] : null;
  const activeTotal = activeStudySet?.type === 'block'
    ? activeStudySet.questionIds.length
    : total;
  const activeStudyLabel = activeStudySet?.type === 'block'
    ? `${activeStudySet.label} - Domande ${activeStudySet.rangeLabel}`
    : '';
  const selectedBlockSize = activeStudySet?.type === 'block' ? activeStudySet.blockSize : null;
  const mistakesCount = progress ? Object.keys(progress.mistakes).length : 0;
  const markedForReviewIds = progress?.markedForReviewIds || [];
  const historyItems = useMemo(
    () => Object.values(progress?.mistakeHistory || {}).sort((a, b) => {
      return new Date(b.timestamp || 0) - new Date(a.timestamp || 0);
    }),
    [progress]
  );
  const reviewQuestionsCount = progress
    ? new Set([...Object.keys(progress.mistakeHistory || {}), ...markedForReviewIds]).size
    : 0;
  const completedCount = progress ? Math.min(progress.answeredIds.length, activeTotal) : 0;
  const hasProgress = progress
    ? completedCount > 0
      || progress.correctCount > 0
      || progress.wrongCount > 0
      || mistakesCount > 0
      || reviewQuestionsCount > 0
    : false;

  const currentQuestionId = reviewMode
    ? reviewOrder[reviewIndex]
    : progress?.questionOrder[progress.currentIndex];
  const currentQuestion = currentQuestionId ? questionMap.get(String(currentQuestionId)) : null;
  const isCurrentQuestionMarked = currentQuestionId
    ? markedForReviewIds.includes(String(currentQuestionId))
    : false;
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
        const restored = sanitizeStudyState(loadProgress(), map, loadedQuestions);
        setStudyState(restored);
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
    if (studyState) saveProgress(studyState);
  }, [studyState]);

  function updateActiveProgress(updater) {
    setStudyState((previous) => {
      const activeId = previous.activeStudySetId;
      const currentProgress = previous.progressByStudySetId[activeId];
      const nextProgress = updater(currentProgress);

      return {
        ...previous,
        progressByStudySetId: {
          ...previous.progressByStudySetId,
          [activeId]: nextProgress,
        },
      };
    });
  }

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

    updateActiveProgress((previous) => {
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

  function handleToggleMarkedForReview() {
    if (!currentQuestionId) return;

    closeTransferProgress();
    const questionId = String(currentQuestionId);

    updateActiveProgress((previous) => {
      const markedIds = new Set(previous.markedForReviewIds || []);

      if (markedIds.has(questionId)) {
        markedIds.delete(questionId);
      } else {
        markedIds.add(questionId);
      }

      return {
        ...previous,
        markedForReviewIds: [...markedIds],
      };
    });
  }

  function handleUnmarkForReview(questionId) {
    updateActiveProgress((previous) => ({
      ...previous,
      markedForReviewIds: (previous.markedForReviewIds || []).filter((id) => String(id) !== String(questionId)),
    }));
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

    updateActiveProgress((previous) => ({
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

  function prepareForStudySetChange() {
    if (selectedAnswer) {
      const confirmed = window.confirm('Vuoi passare a questo blocco? Potrai tornare ai progressi attuali in qualsiasi momento.');
      if (!confirmed) return false;
    }

    closeTransferProgress();
    setSelectedAnswer(null);
    setResult(null);
    setFeedbackGif(null);
    setHistoryMode(false);
    exitReviewMode();
    return true;
  }

  function handleChooseAllQuestions() {
    if (studyState?.activeStudySetId === 'all') return;
    if (!prepareForStudySetChange()) return;

    setStudyState((previous) => ({
      ...previous,
      activeStudySetId: 'all',
    }));
  }

  function handlePrepareBlocks(blockSize) {
    setStudyState((previous) => ensureBlockStudySets(previous, questions, blockSize));
  }

  function handleChooseStudySet(studySetId) {
    if (!studyState?.studySets?.[studySetId]) return;
    if (studyState.activeStudySetId === studySetId) return;
    if (!prepareForStudySetChange()) return;

    setStudyState((previous) => {
      const studySet = previous.studySets[studySetId];
      const existingProgress = previous.progressByStudySetId[studySetId];
      const nextProgress = existingProgress || createInitialProgressForIds(
        studySet.type === 'block' ? studySet.questionIds : questions.map((question, index) => String(question.id || question.number || index))
      );

      return {
        ...previous,
        activeStudySetId: studySetId,
        progressByStudySetId: {
          ...previous.progressByStudySetId,
          [studySetId]: nextProgress,
        },
      };
    });
  }

  function resetActiveProgress() {
    const questionIds = activeStudySet?.type === 'block'
      ? activeStudySet.questionIds
      : questions.map((question, index) => String(question.id || question.number || index));

    updateActiveProgress(() => createInitialProgressForIds(questionIds));
    setSelectedAnswer(null);
    setResult(null);
    setFeedbackGif(null);
    setHistoryMode(false);
    exitReviewMode();
  }

  function repeatActiveBlock() {
    if (activeStudySet?.type !== 'block') return;
    resetActiveProgress();
  }

  function resetQuiz() {
    closeTransferProgress();
    const message = activeStudySet?.type === 'block'
      ? `Vuoi ricominciare ${activeStudySet.label} da capo?`
      : 'Vuoi ricominciare tutte le domande da capo?';
    const confirmed = window.confirm(message);
    if (!confirmed) return;

    resetActiveProgress();
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
    if (!studyState) return;

    const exportData = {
      app: EXPORT_APP_ID,
      schemaVersion: EXPORT_SCHEMA_VERSION,
      quizId: QUIZ_ID,
      source: metadata?.source || 'Quiz infermieristica',
      totalQuestions: metadata?.totalQuestions || total,
      questionsHash: await getQuestionsHash(),
      exportedAt: new Date().toISOString(),
      activeStudySetId: studyState.activeStudySetId,
      studySets: studyState.studySets,
      progressByStudySetId: studyState.progressByStudySetId,
      progress: studyState.progressByStudySetId.all,
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

      const importedStudyState = validation.studyState || sanitizeStudyState(validation.progress, questionMap, questions);
      saveProgress(importedStudyState);
      setStudyState(importedStudyState);
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

    if (
      parsed.app !== EXPORT_APP_ID
      || ![LEGACY_EXPORT_SCHEMA_VERSION, EXPORT_SCHEMA_VERSION].includes(parsed.schemaVersion)
    ) {
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

    if (parsed.schemaVersion === EXPORT_SCHEMA_VERSION && parsed.studySets && parsed.progressByStudySetId) {
      const sanitized = sanitizeStudyState({
        version: 2,
        activeStudySetId: parsed.activeStudySetId || 'all',
        studySets: parsed.studySets,
        progressByStudySetId: parsed.progressByStudySetId,
      }, questionMap, questions);

      if (!sanitized.progressByStudySetId.all || sanitized.progressByStudySetId.all.questionOrder.length !== total) {
        return { ok: false, message: 'Questo salvataggio non e compatibile con questa banca dati.' };
      }

      return { ok: true, studyState: sanitized };
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
      markedForReviewIds: Array.isArray(parsed.progress.markedForReviewIds)
        ? parsed.progress.markedForReviewIds.map(String)
        : [],
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
    if (
      importedProgress.markedForReviewIds !== undefined
      && !Array.isArray(importedProgress.markedForReviewIds)
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

      <StudySelector
        studyState={studyState}
        activeStudySet={activeStudySet}
        selectedBlockSize={selectedBlockSize}
        blockSizes={BLOCK_SIZES}
        total={total}
        onChooseAll={handleChooseAllQuestions}
        onPrepareBlocks={handlePrepareBlocks}
        onChooseStudySet={handleChooseStudySet}
      />

      <StatsBar
        completed={completedCount}
        total={activeTotal}
        correctCount={progress.correctCount}
        wrongCount={progress.wrongCount}
      />

      {historyMode ? (
        <MistakeHistory
          historyItems={historyItems}
          markedForReviewIds={markedForReviewIds}
          questionMap={questionMap}
          onBack={() => setHistoryMode(false)}
          onUnmark={handleUnmarkForReview}
        />
      ) : isFinished ? (
        <FinalScreen
          total={activeTotal}
          activeStudySet={activeStudySet}
          correctCount={progress.correctCount}
          wrongCount={progress.wrongCount}
          mistakesCount={mistakesCount}
          reviewQuestionsCount={reviewQuestionsCount}
          onReview={startReviewMode}
          onHistory={openHistoryMode}
          onRepeatBlock={repeatActiveBlock}
          onChooseAll={handleChooseAllQuestions}
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
          displayIndex={Math.min(progress.currentIndex + 1, activeTotal)}
          total={activeTotal}
          contextLabel={activeStudyLabel}
          answers={answers}
          selectedAnswer={selectedAnswer}
          result={result}
          feedbackGif={feedbackGif}
          reviewMode={reviewMode}
          mistakesCount={mistakesCount}
          completedCount={completedCount}
          isMarkedForReview={isCurrentQuestionMarked}
          onSelectAnswer={handleSelectAnswer}
          onNext={handleNext}
          onExitReview={exitReviewMode}
          onToggleMarked={handleToggleMarkedForReview}
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
            disabled={reviewQuestionsCount === 0}
          >
            Domande da rivedere{reviewQuestionsCount > 0 ? ` (${reviewQuestionsCount})` : ''}
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

function StudySelector({
  studyState,
  activeStudySet,
  selectedBlockSize,
  blockSizes,
  total,
  onChooseAll,
  onPrepareBlocks,
  onChooseStudySet,
}) {
  const [selectedMode, setSelectedMode] = useState(selectedBlockSize || 'all');
  const [isOpen, setIsOpen] = useState(false);
  const panelId = 'study-selector-panel';

  useEffect(() => {
    setSelectedMode(selectedBlockSize || 'all');
  }, [selectedBlockSize]);

  const activeLabel = activeStudySet?.type === 'block'
    ? `${activeStudySet.label} - ${activeStudySet.rangeLabel}`
    : 'Tutte le domande';
  const blockSets = Object.values(studyState.studySets || {})
    .filter((set) => set.type === 'block' && set.blockSize === selectedMode)
    .sort((a, b) => a.blockIndex - b.blockIndex);

  function chooseMode(mode) {
    setSelectedMode(mode);
    if (mode === 'all') {
      onChooseAll();
    } else {
      onPrepareBlocks(mode);
    }
    setIsOpen(false);
  }

  function chooseStudySet(studySetId) {
    onChooseStudySet(studySetId);
    setIsOpen(false);
  }

  return (
    <section className="study-selector">
      <button
        className="study-selector__summary"
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="study-selector__summary-text">
          <span className="eyebrow">Scegli cosa studiare</span>
          <span className="study-selector__current">Stai studiando: <strong>{activeLabel}</strong></span>
        </span>
        <span className="study-selector__toggle">{isOpen ? 'Chiudi' : 'Cambia'}</span>
      </button>

      {isOpen && (
        <div className="study-selector__panel" id={panelId}>
          <div className="study-selector__modes" aria-label="Scegli cosa studiare">
            <button
              className={`study-selector__mode${selectedMode === 'all' ? ' study-selector__mode--active' : ''}`}
              type="button"
              onClick={() => chooseMode('all')}
            >
              Tutte le domande
            </button>
            {blockSizes.map((blockSize) => (
              <button
                className={`study-selector__mode${selectedMode === blockSize ? ' study-selector__mode--active' : ''}`}
                type="button"
                key={blockSize}
                onClick={() => chooseMode(blockSize)}
              >
                Blocchi da {blockSize}
              </button>
            ))}
          </div>

          {selectedMode !== 'all' && (
            <div className="study-selector__blocks">
              {blockSets.length === 0 ? (
                <p className="empty-state">Preparazione blocchi...</p>
              ) : (
                blockSets.map((studySet) => {
                  const blockProgress = studyState.progressByStudySetId[studySet.id];
                  const completed = blockProgress ? Math.min(blockProgress.answeredIds.length, studySet.questionIds.length) : 0;
                  const isActive = activeStudySet?.id === studySet.id;

                  return (
                    <button
                      className={`study-selector__block${isActive ? ' study-selector__block--active' : ''}`}
                      type="button"
                      key={studySet.id}
                      onClick={() => chooseStudySet(studySet.id)}
                    >
                      <span>{studySet.label}: {studySet.rangeLabel}</span>
                      <strong>{completed} / {studySet.questionIds.length}</strong>
                    </button>
                  );
                })
              )}
              <p className="study-selector__note">Totale banca dati: {total} domande</p>
            </div>
          )}
        </div>
      )}
    </section>
  );
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

function FinalScreen({
  total,
  activeStudySet,
  correctCount,
  wrongCount,
  mistakesCount,
  reviewQuestionsCount,
  onReview,
  onHistory,
  onRepeatBlock,
  onChooseAll,
}) {
  const accuracy = getPercent(correctCount, correctCount + wrongCount);
  const isBlock = activeStudySet?.type === 'block';

  return (
    <section className="panel final">
      <p className="eyebrow">Sessione completata</p>
      <h1>{isBlock ? `Hai completato ${activeStudySet.label}` : 'Hai completato tutte le domande'}</h1>
      <div className="final__grid">
        <div><span>Totale domande</span><strong>{total}</strong></div>
        <div><span>Risposte corrette</span><strong>{correctCount}</strong></div>
        <div><span>Risposte sbagliate</span><strong>{wrongCount}</strong></div>
        <div><span>Correttezza</span><strong>{accuracy}%</strong></div>
        <div><span>Errori da ripassare</span><strong>{mistakesCount}</strong></div>
        <div><span>Domande da rivedere</span><strong>{reviewQuestionsCount}</strong></div>
      </div>
      <div className="final__actions">
        {mistakesCount > 0 && (
          <button className="button button--secondary" type="button" onClick={onReview}>
            Ripassa errori
          </button>
        )}
        {reviewQuestionsCount > 0 && (
          <button className="button button--quiet" type="button" onClick={onHistory}>
            Domande da rivedere
          </button>
        )}
        {isBlock && (
          <>
            <button className="button button--primary" type="button" onClick={onRepeatBlock}>
              Ripeti questo blocco
            </button>
            <button className="button button--quiet" type="button" onClick={onChooseAll}>
              Torna a tutte le domande
            </button>
          </>
        )}
      </div>
    </section>
  );
}
