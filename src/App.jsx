import { useEffect, useMemo, useRef, useState } from 'react';
import QuizCard from './components/QuizCard.jsx';
import StatsBar from './components/StatsBar.jsx';
import ReviewMistakesButton from './components/ReviewMistakesButton.jsx';
import MistakeHistory from './components/MistakeHistory.jsx';
import { shuffle } from './utils/shuffle';
import { loadProgress, saveProgress } from './utils/storage';
import { DEFAULT_QUIZ_BANK, QUIZ_BANKS } from './config/quizBanks';
import {
  buildQuestionMap,
  createInitialProgressForIds,
  ensureBlockStudySets,
  getPercent,
  sanitizeProgress,
  sanitizeStudyState,
} from './utils/quizEngine';
import { getRandomMonkeyGif, loadMonkeyGifs } from './utils/monkeyGifs';

const EXPORT_APP_ID = 'quiz-kikka';
const EXPORT_SCHEMA_VERSION = 2;
const LEGACY_EXPORT_SCHEMA_VERSION = 1;
const LEGACY_QUIZ_ID = 'asl-bari-infermieri';
const BLOCK_SIZES = [500, 1000];

export default function App() {
  const [activeQuizBank, setActiveQuizBank] = useState(DEFAULT_QUIZ_BANK);
  const [status, setStatus] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [quizBankMessage, setQuizBankMessage] = useState('');
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
  const [studyModalOpen, setStudyModalOpen] = useState(false);
  const [studyModalMode, setStudyModalMode] = useState('all');
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const fileInputRef = useRef(null);
  const studyChangeButtonRef = useRef(null);
  const studyModalCloseRef = useRef(null);

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
        if (!activeQuizBank.available) {
          setStatus('unavailable');
          return;
        }

        const response = await fetch(activeQuizBank.questionsUrl);
        if (!response.ok) {
          throw new Error(`Impossibile caricare ${activeQuizBank.questionsUrl}: HTTP ${response.status}`);
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
        const restored = sanitizeStudyState(loadProgress(activeQuizBank.quizId), map, loadedQuestions);
        setStudyState(restored);
        saveProgress(restored, activeQuizBank.quizId);
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
  }, [activeQuizBank]);

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
    if (studyState) saveProgress(studyState, activeQuizBank.quizId);
  }, [studyState, activeQuizBank.quizId]);

  useEffect(() => {
    setStudyModalMode(selectedBlockSize || 'all');
  }, [selectedBlockSize]);

  useEffect(() => {
    if (!studyModalOpen) return;

    studyModalCloseRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') closeStudyModal();
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [studyModalOpen]);

  function closeStudyModal() {
    setQuizBankMessage('');
    setStudyModalOpen(false);
    window.setTimeout(() => studyChangeButtonRef.current?.focus(), 0);
  }

  function openStudyModal() {
    setQuizBankMessage('');
    setStudyModalOpen(true);
  }

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
    setMoreActionsOpen(false);

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
    setMoreActionsOpen(false);
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
    setMoreActionsOpen(false);
    setSelectedAnswer(null);
    setResult(null);
    setFeedbackGif(null);
    setHistoryMode(false);
    exitReviewMode();
    return true;
  }

  function handleChooseQuizBank(quizBank) {
    if (quizBank.quizId === activeQuizBank.quizId) return true;

    if (!quizBank.available) {
      setQuizBankMessage('La banca dati della prova scritta non è ancora disponibile.');
      return false;
    }

    if (selectedAnswer) {
      const confirmed = window.confirm('Vuoi cambiare prova? Potrai tornare ai progressi attuali in qualsiasi momento.');
      if (!confirmed) return false;
    }

    closeTransferProgress();
    setMoreActionsOpen(false);
    setQuizBankMessage('');
    setQuestions([]);
    setMetadata(null);
    setStudyState(null);
    setSelectedAnswer(null);
    setResult(null);
    setFeedbackGif(null);
    setHistoryMode(false);
    exitReviewMode();
    setActiveQuizBank(quizBank);
    return true;
  }

  function handleChooseAllQuestions() {
    if (studyState?.activeStudySetId === 'all') return true;
    if (!prepareForStudySetChange()) return false;

    setStudyState((previous) => ({
      ...previous,
      activeStudySetId: 'all',
    }));
    return true;
  }

  function handlePrepareBlocks(blockSize) {
    setStudyState((previous) => ensureBlockStudySets(previous, questions, blockSize));
    return true;
  }

  function handleChooseStudySet(studySetId) {
    if (!studyState?.studySets?.[studySetId]) return false;
    if (studyState.activeStudySetId === studySetId) return true;
    if (!prepareForStudySetChange()) return false;

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
    return true;
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
    setMoreActionsOpen(false);
    const message = activeStudySet?.type === 'block'
      ? `Vuoi ricominciare ${activeStudySet.label} da capo?`
      : 'Vuoi ricominciare tutte le domande da capo?';
    const confirmed = window.confirm(message);
    if (!confirmed) return;

    resetActiveProgress();
  }

  function openHistoryMode() {
    closeTransferProgress();
    setMoreActionsOpen(false);
    setHistoryMode(true);
  }

  function closeTransferProgress() {
    setTransferOpen(false);
  }

  function toggleMoreActions() {
    setMoreActionsOpen((isOpen) => {
      if (isOpen) closeTransferProgress();
      return !isOpen;
    });
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
      competitionId: activeQuizBank.competitionId,
      quizId: activeQuizBank.quizId,
      quizLabel: activeQuizBank.label,
      source: metadata?.source || activeQuizBank.description,
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
    link.download = `quiz-kikka-progressi-${activeQuizBank.quizId}.json`;
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
      saveProgress(importedStudyState, activeQuizBank.quizId);
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

    if (getImportedQuizId(parsed) !== activeQuizBank.quizId) {
      return { ok: false, message: "Questo salvataggio appartiene a un'altra prova." };
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

  function getImportedQuizId(parsed) {
    if (!parsed.quizId || parsed.quizId === LEGACY_QUIZ_ID) return 'preselettiva';
    return parsed.quizId;
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

  if (status === 'unavailable') {
    return (
      <Shell>
        <main className="panel panel--message">
          <h1>{activeQuizBank.label}</h1>
          <p>La banca dati di questa prova non è ancora disponibile.</p>
          <button className="button button--primary" type="button" onClick={() => handleChooseQuizBank(DEFAULT_QUIZ_BANK)}>
            Torna alla prova preselettiva
          </button>
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
          <p className="source">{activeQuizBank.competitionLabel}</p>
        </div>
      </header>

      <StudySummary
        activeQuizBank={activeQuizBank}
        activeStudySet={activeStudySet}
        buttonRef={studyChangeButtonRef}
        onOpen={openStudyModal}
      />

      {studyModalOpen && (
        <StudyModal
          quizBanks={QUIZ_BANKS}
          activeQuizBank={activeQuizBank}
          message={quizBankMessage}
          studyState={studyState}
          activeStudySet={activeStudySet}
          selectedMode={studyModalMode}
          blockSizes={BLOCK_SIZES}
          total={total}
          closeButtonRef={studyModalCloseRef}
          onClose={closeStudyModal}
          onChangeMode={setStudyModalMode}
          onChooseQuizBank={(quizBank) => {
            if (handleChooseQuizBank(quizBank)) closeStudyModal();
          }}
          onChooseAll={() => {
            setQuizBankMessage('');
            if (handleChooseAllQuestions()) closeStudyModal();
          }}
          onPrepareBlocks={(blockSize) => {
            setQuizBankMessage('');
            handlePrepareBlocks(blockSize);
          }}
          onChooseStudySet={(studySetId) => {
            setQuizBankMessage('');
            if (handleChooseStudySet(studySetId)) closeStudyModal();
          }}
        />
      )}

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
          <MoreActions
            open={moreActionsOpen}
            reviewQuestionsCount={reviewQuestionsCount}
            hasProgress={hasProgress}
            showTransfer={Boolean(currentQuestion)}
            transferOpen={transferOpen}
            transferMessage={transferMessage}
            fileInputRef={fileInputRef}
            onToggle={toggleMoreActions}
            onHistory={openHistoryMode}
            onTransferToggle={setTransferOpen}
            onExport={handleExportProgress}
            onChooseImportFile={handleChooseImportFile}
            onImportFile={handleImportFile}
            onReset={resetQuiz}
          />
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

function StudySummary({ activeQuizBank, activeStudySet, buttonRef, onOpen }) {
  const studyLabel = getStudyContextLabel(activeStudySet);

  return (
    <section className="study-summary" aria-label="Studio corrente">
      <div className="study-summary__text">
        <span className="study-summary__label">Studio:</span>
        <strong className="study-summary__current">{activeQuizBank.label} - {studyLabel}</strong>
      </div>
      <button
        className="button button--quiet study-summary__button"
        type="button"
        ref={buttonRef}
        aria-haspopup="dialog"
        onClick={onOpen}
      >
        Cambia
      </button>
    </section>
  );
}

function StudyModal({
  quizBanks,
  activeQuizBank,
  message,
  studyState,
  activeStudySet,
  selectedMode,
  blockSizes,
  total,
  closeButtonRef,
  onClose,
  onChangeMode,
  onChooseQuizBank,
  onChooseAll,
  onPrepareBlocks,
  onChooseStudySet,
}) {
  const blockSets = Object.values(studyState.studySets || {})
    .filter((set) => set.type === 'block' && set.blockSize === selectedMode)
    .sort((a, b) => a.blockIndex - b.blockIndex);

  function chooseMode(mode) {
    onChangeMode(mode);
    if (mode === 'all') {
      onChooseAll();
    } else {
      onPrepareBlocks(mode);
    }
  }

  function handleBackdropClick(event) {
    if (event.target === event.currentTarget) onClose();
  }

  return (
    <div className="study-modal-backdrop" role="presentation" onMouseDown={handleBackdropClick}>
      <section
        className="study-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="study-modal-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="study-modal__header">
          <h2 id="study-modal-title">Cambia studio</h2>
          <button
            className="study-modal__close"
            type="button"
            ref={closeButtonRef}
            aria-label="Chiudi"
            onClick={onClose}
          >
            X
          </button>
        </div>

        <div className="study-modal__body">
          <section className="study-modal__section" aria-labelledby="quiz-bank-title">
            <h3 id="quiz-bank-title">Prova del concorso</h3>
            <div className="study-modal__options">
              {quizBanks.map((quizBank) => {
                const isActive = quizBank.quizId === activeQuizBank.quizId;

                return (
                  <button
                    className={`study-modal__option${isActive ? ' study-modal__option--active' : ''}`}
                    type="button"
                    key={quizBank.quizId}
                    onClick={() => onChooseQuizBank(quizBank)}
                    aria-pressed={isActive}
                  >
                    <span>
                      <strong>{quizBank.label}</strong>
                      <small>{quizBank.description}</small>
                    </span>
                    {!quizBank.available && <span className="study-modal__badge">In arrivo</span>}
                  </button>
                );
              })}
            </div>
            {message && <p className="study-modal__message" role="status">{message}</p>}
          </section>

          <section className="study-modal__section" aria-labelledby="study-choice-title">
            <h3 id="study-choice-title">Cosa vuoi studiare</h3>
            <div className="study-modal__modes" aria-label="Scegli cosa studiare">
            <button
              className={`study-modal__mode${selectedMode === 'all' ? ' study-modal__mode--active' : ''}`}
              type="button"
              onClick={() => chooseMode('all')}
              aria-pressed={selectedMode === 'all'}
            >
              Tutte le domande
            </button>
            {blockSizes.map((blockSize) => (
              <button
                className={`study-modal__mode${selectedMode === blockSize ? ' study-modal__mode--active' : ''}`}
                type="button"
                key={blockSize}
                onClick={() => chooseMode(blockSize)}
                aria-pressed={selectedMode === blockSize}
              >
                Blocchi da {blockSize}
              </button>
            ))}
          </div>

          {selectedMode !== 'all' && (
            <div className="study-modal__blocks">
              {blockSets.length === 0 ? (
                <p className="empty-state">Preparazione blocchi...</p>
              ) : (
                blockSets.map((studySet) => {
                  const blockProgress = studyState.progressByStudySetId[studySet.id];
                  const completed = blockProgress ? Math.min(blockProgress.answeredIds.length, studySet.questionIds.length) : 0;
                  const isActive = activeStudySet?.id === studySet.id;

                  return (
                    <button
                      className={`study-modal__block${isActive ? ' study-modal__block--active' : ''}`}
                      type="button"
                      key={studySet.id}
                      onClick={() => onChooseStudySet(studySet.id)}
                      aria-pressed={isActive}
                    >
                      <span>{studySet.label}: {studySet.rangeLabel}</span>
                      <strong>{completed} / {studySet.questionIds.length}</strong>
                    </button>
                  );
                })
              )}
              <p className="study-modal__note">Totale banca dati: {total} domande</p>
            </div>
          )}
          </section>
        </div>
      </section>
    </div>
  );
}

function getStudyContextLabel(activeStudySet) {
  if (activeStudySet?.type === 'block') {
    return `${activeStudySet.label} - ${activeStudySet.rangeLabel}`;
  }

  return 'Tutte le domande';
}

function MoreActions({
  open,
  reviewQuestionsCount,
  hasProgress,
  showTransfer,
  transferOpen,
  transferMessage,
  fileInputRef,
  onToggle,
  onHistory,
  onTransferToggle,
  onExport,
  onChooseImportFile,
  onImportFile,
  onReset,
}) {
  const panelId = 'more-actions-panel';

  return (
    <section className="more-actions">
      <button
        className="button button--quiet more-actions__toggle"
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
      >
        Altro <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="more-actions__panel" id={panelId}>
          <button
            className="button button--quiet"
            type="button"
            onClick={onHistory}
            disabled={reviewQuestionsCount === 0}
          >
            Domande da rivedere{reviewQuestionsCount > 0 ? ` (${reviewQuestionsCount})` : ''}
          </button>

          {showTransfer && (
            <TransferProgress
              fileInputRef={fileInputRef}
              open={transferOpen}
              message={transferMessage}
              onToggle={onTransferToggle}
              onExport={onExport}
              onChooseImportFile={onChooseImportFile}
              onImportFile={onImportFile}
            />
          )}

          {hasProgress && (
            <button className="button button--danger button--danger-soft" type="button" onClick={onReset}>
              Ricomincia da capo
            </button>
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
