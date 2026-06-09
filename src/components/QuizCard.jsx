export default function QuizCard({
  question,
  displayIndex,
  total,
  contextLabel,
  answers,
  selectedAnswer,
  result,
  feedbackGif,
  reviewMode,
  mistakesCount,
  completedCount,
  isMarkedForReview,
  onSelectAnswer,
  onNext,
  onExitReview,
  onToggleMarked,
}) {
  const correctLabel = question.correctAnswer || 'A';
  const answerLetters = ['A', 'B', 'C'];
  const isProcedureQuestion = Boolean(
    question.procedureTopic
      && Array.isArray(question.displayedSteps)
      && question.displayedSteps.length > 0
  );

  function answerClass(answer) {
    if (!selectedAnswer) return 'answer';
    if (answer.label === correctLabel) return 'answer answer--correct';
    if (answer.label === selectedAnswer) return 'answer answer--wrong';
    return 'answer answer--muted';
  }

  return (
    <article className="quiz-card">
      <div className="quiz-card__top">
        <div>
          <p className="eyebrow">{reviewMode ? 'Ripasso errori' : `Domanda ${displayIndex} di ${total}`}</p>
          {contextLabel && <p className="question-context">{contextLabel}</p>}
          <p className="question-id">ID domanda: {question.id || 'non disponibile'}</p>
        </div>
        <div className="quiz-card__top-actions">
          <button
            className={`button button--mark${isMarkedForReview ? ' button--mark-active' : ''}`}
            type="button"
            onClick={onToggleMarked}
            aria-pressed={isMarkedForReview}
          >
            {isMarkedForReview ? '★ Segnata' : '☆ Segna'}
          </button>
          {reviewMode && (
            <button className="button button--ghost" type="button" onClick={onExitReview}>
              Torna al quiz
            </button>
          )}
        </div>
      </div>

      {isProcedureQuestion ? (
        <ProcedureQuestion question={question} />
      ) : (
        <h1>{question.question || 'Domanda senza testo'}</h1>
      )}

      <div className="answers" role="list">
        {answers.length === 0 ? (
          <p className="empty-state">Questa domanda non contiene risposte.</p>
        ) : (
          answers.map((answer, index) => (
            <button
              className={answerClass(answer)}
              type="button"
              key={`${answer.label}-${index}`}
              onClick={() => onSelectAnswer(answer)}
              disabled={Boolean(selectedAnswer)}
            >
              <span className="answer__index">{answerLetters[index] || String.fromCharCode(65 + index)}</span>
              <span className="answer__text">{answer.text || 'Risposta senza testo'}</span>
            </button>
          ))
        )}
      </div>

      {result && (
        <div className={`result result--${result}`} role="status">
          <span>{result === 'correct' ? 'Corretto' : 'Sbagliato'}</span>
        </div>
      )}

      <div className="quiz-card__footer">
        {selectedAnswer && (
          <button className="button button--primary quiz-card__next-inline" type="button" onClick={onNext}>
            {reviewMode ? 'Prossimo errore' : 'Prossima domanda'}
          </button>
        )}
        <FeedbackGif gif={feedbackGif} />
        <p>
          Completate: {completedCount} / {total}
          <br />
          Errori da ripassare: {mistakesCount}
        </p>
      </div>
    </article>
  );
}

function ProcedureQuestion({ question }) {
  return (
    <section className="procedure-question" aria-labelledby={`procedure-question-${question.id}`}>
      <div className="procedure-question__header">
        <h1 id={`procedure-question-${question.id}`}>{question.procedureTopic}</h1>
        <p>Identificare la sequenza corretta.</p>
      </div>

      <ol className="procedure-steps">
        {question.displayedSteps.map((step) => (
          <li className="procedure-step" key={`${step.number}-${step.originalNumber}`}>
            <span className="procedure-step__number">{step.number}</span>
            <span className="procedure-step__text">{step.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function FeedbackGif({ gif }) {
  if (!gif) return null;

  if (gif.type === 'tenor') {
    return (
      <iframe
        className="result__gif"
        src={gif.src}
        title="Monkey GIF"
        loading="lazy"
        allowFullScreen
      />
    );
  }

  return <img className="result__gif" src={gif.src} alt="" aria-hidden="true" />;
}
