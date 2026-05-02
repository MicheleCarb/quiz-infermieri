import { useState } from 'react';

export default function MistakeHistory({ historyItems, markedForReviewIds, questionMap, onBack, onUnmark }) {
  const [activeTab, setActiveTab] = useState('history');
  const historyIds = new Set(historyItems.map((item) => String(item.questionId)));
  const markedIds = new Set(markedForReviewIds.map(String));
  const markedQuestions = markedForReviewIds
    .map((id) => ({ id: String(id), question: questionMap.get(String(id)) }))
    .filter((item) => Boolean(item.question));

  return (
    <section className="panel history">
      <div className="history__top">
        <div>
          <p className="eyebrow">Domande da rivedere</p>
          <h1>Domande da rivedere</h1>
        </div>
        <button className="button button--ghost" type="button" onClick={onBack}>
          Torna al quiz
        </button>
      </div>

      <div className="history-tabs" role="tablist" aria-label="Domande da rivedere">
        <button
          className={`history-tabs__button${activeTab === 'history' ? ' history-tabs__button--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
        >
          Sbagliate almeno una volta ({historyItems.length})
        </button>
        <button
          className={`history-tabs__button${activeTab === 'marked' ? ' history-tabs__button--active' : ''}`}
          type="button"
          role="tab"
          aria-selected={activeTab === 'marked'}
          onClick={() => setActiveTab('marked')}
        >
          Segnate ({markedForReviewIds.length})
        </button>
      </div>

      {activeTab === 'history' && (
        historyItems.length === 0 ? (
          <p className="empty-state">Non ci sono ancora domande sbagliate almeno una volta.</p>
        ) : (
          <div className="history__list">
            {historyItems.map((item) => {
              const questionId = String(item.questionId);
              const question = questionMap.get(questionId);
              if (!question) return null;

              return (
                <ReviewQuestionCard
                  question={question}
                  key={questionId}
                  badge={markedIds.has(questionId) ? '★ Segnata' : null}
                />
              );
            })}
          </div>
        )
      )}

      {activeTab === 'marked' && (
        markedQuestions.length === 0 ? (
          <p className="empty-state">Non ci sono ancora domande segnate.</p>
        ) : (
          <div className="history__list">
            {markedQuestions.map(({ id, question }) => (
              <ReviewQuestionCard
                question={question}
                key={id}
                badge={historyIds.has(id) ? 'Sbagliata almeno una volta' : null}
                action={(
                  <button
                    className="button button--mark button--mark-active history-item__mark"
                    type="button"
                    onClick={() => onUnmark(id)}
                    aria-pressed={true}
                  >
                    ★ Segnata
                  </button>
                )}
              />
            ))}
          </div>
        )
      )}
    </section>
  );
}

function ReviewQuestionCard({ question, badge, action }) {
  const correctAnswer = question.answers?.find(
    (answer) => answer.label === question.correctAnswer
  );
  const otherAnswers = question.answers?.filter(
    (answer) => answer.label !== question.correctAnswer
  ) || [];

  return (
    <article className="history-item">
      <div className="history-item__top">
        <div className="history-item__meta">
          <p className="question-id">ID domanda: {question.id}</p>
          {badge && <span className="history-badge">{badge}</span>}
        </div>
        {action}
      </div>
      <h2>{question.question}</h2>
      <div className="history-item__answers">
        {correctAnswer ? (
          <div className="answer answer--correct history-item__answer">
            <span className="answer__index">✓</span>
            <span>{correctAnswer.text}</span>
          </div>
        ) : (
          <p className="empty-state">Risposta corretta non trovata.</p>
        )}
        {otherAnswers.map((answer) => (
          <div className="answer history-item__answer history-item__answer--neutral" key={answer.label}>
            <span className="answer__index history-item__wrong-icon">×</span>
            <span>{answer.text}</span>
          </div>
        ))}
      </div>
    </article>
  );
}
