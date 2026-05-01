export default function MistakeHistory({ historyItems, questionMap, onBack }) {
  return (
    <section className="panel history">
      <div className="history__top">
        <div>
          <p className="eyebrow">Storico errori</p>
          <h1>Domande sbagliate almeno una volta</h1>
        </div>
        <button className="button button--ghost" type="button" onClick={onBack}>
          Torna al quiz
        </button>
      </div>

      {historyItems.length === 0 ? (
        <p className="empty-state">Non ci sono ancora domande nello storico.</p>
      ) : (
        <div className="history__list">
          {historyItems.map((item) => {
            const question = questionMap.get(String(item.questionId));
            if (!question) return null;

            const correctAnswer = question.answers?.find(
              (answer) => answer.label === question.correctAnswer
            );
            const otherAnswers = question.answers?.filter(
              (answer) => answer.label !== question.correctAnswer
            ) || [];

            return (
              <article className="history-item" key={item.questionId}>
                <p className="question-id">ID domanda: {question.id}</p>
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
          })}
        </div>
      )}
    </section>
  );
}
