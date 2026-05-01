import { useEffect, useMemo, useState } from 'react';
import QuizCard from './components/QuizCard.jsx';
import StatsBar from './components/StatsBar.jsx';
import ReviewMistakesButton from './components/ReviewMistakesButton.jsx';
import { shuffle } from './utils/shuffle';
import { clearProgress, loadProgress, saveProgress } from './utils/storage';
import { buildQuestionMap, createInitialProgress, getPercent, sanitizeProgress } from './utils/quizEngine';
import { getRandomMonkeyGif, loadMonkeyGifs } from './utils/monkeyGifs';

const QUESTIONS_URL = `${import.meta.env.BASE_URL}data/questions.json`;

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

  const questionMap = useMemo(() => buildQuestionMap(questions), [questions]);
  const total = questions.length;
  const mistakesCount = progress ? Object.keys(progress.mistakes).length : 0;
  const completedCount = progress ? Math.min(progress.answeredIds.length, total) : 0;
  const hasProgress = progress
    ? completedCount > 0 || progress.correctCount > 0 || progress.wrongCount > 0 || mistakesCount > 0
    : false;

  const currentQuestionId = reviewMode
    ? reviewOrder[reviewIndex]
    : progress?.questionOrder[progress.currentIndex];
  const currentQuestion = currentQuestionId ? questionMap.get(String(currentQuestionId)) : null;
  const isFinished = !reviewMode && progress && progress.currentIndex >= progress.questionOrder.length;
  const isReviewFinished = reviewMode && reviewOrder.length > 0 && reviewIndex >= reviewOrder.length;

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

    const selectedLabel = answer.label;
    const correctLabel = currentQuestion.correctAnswer || 'A';
    const isCorrect = selectedLabel === correctLabel;
    const questionId = String(currentQuestion.id);

    setSelectedAnswer(selectedLabel);
    const nextResult = isCorrect ? 'correct' : 'wrong';
    setResult(nextResult);
    setFeedbackGif(getRandomMonkeyGif(nextResult, monkeyGifs));

    setProgress((previous) => {
      const next = { ...previous, mistakes: { ...previous.mistakes } };

      if (reviewMode) {
        if (isCorrect) {
          delete next.mistakes[questionId];
        } else {
          next.mistakes[questionId] = {
            questionId,
            selectedAnswer: selectedLabel,
            correctAnswer: correctLabel,
            timestamp: new Date().toISOString(),
          };
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
        next.mistakes[questionId] = {
          questionId,
          selectedAnswer: selectedLabel,
          correctAnswer: correctLabel,
          timestamp: new Date().toISOString(),
        };
      }

      return next;
    });
  }

  function handleNext() {
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
    const confirmed = window.confirm('Vuoi cancellare i progressi e ricominciare da capo?');
    if (!confirmed) return;

    clearProgress();
    const freshProgress = createInitialProgress(questions);
    setProgress(freshProgress);
    saveProgress(freshProgress);
    exitReviewMode();
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
    <Shell>
      <header className="app-header">
        <div>
          <p className="source">{metadata?.source || 'Quiz infermieristica'}</p>
          <h1>I quiz di Kikka 🐵</h1>
        </div>
        {hasProgress && (
          <button className="button button--danger" type="button" onClick={resetQuiz}>
            Ricomincia da capo
          </button>
        )}
      </header>

      <StatsBar
        completed={completedCount}
        total={total}
        correctCount={progress.correctCount}
        wrongCount={progress.wrongCount}
      />

      {isFinished ? (
        <FinalScreen
          total={total}
          correctCount={progress.correctCount}
          wrongCount={progress.wrongCount}
          mistakesCount={mistakesCount}
          onReview={startReviewMode}
          onReset={resetQuiz}
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

      {!reviewMode && !isFinished && (
        <div className="actions">
          <ReviewMistakesButton count={mistakesCount} onClick={startReviewMode} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }) {
  return <div className="app-shell">{children}</div>;
}

function FinalScreen({ total, correctCount, wrongCount, mistakesCount, onReview, onReset }) {
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
      </div>
      <div className="final__actions">
        {mistakesCount > 0 && (
          <button className="button button--secondary" type="button" onClick={onReview}>
            Ripassa errori
          </button>
        )}
        <button className="button button--danger" type="button" onClick={onReset}>
          Ricomincia da capo
        </button>
      </div>
    </section>
  );
}
