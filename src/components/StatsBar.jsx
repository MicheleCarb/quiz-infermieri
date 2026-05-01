import ProgressBar from './ProgressBar.jsx';
import { getPercentWithDecimals } from '../utils/quizEngine';

export default function StatsBar({ completed, total, correctCount, wrongCount }) {
  return (
    <section className="stats" aria-label="Statistiche quiz">
      <ProgressBar completed={completed} total={total} />
      <div className="stats__grid">
        <div>
          <span>Corrette</span>
          <strong>{correctCount}</strong>
        </div>
        <div>
          <span>Sbagliate</span>
          <strong>{wrongCount}</strong>
        </div>
        <div>
          <span>Completato</span>
          <strong>{getPercentWithDecimals(completed, total)}%</strong>
        </div>
      </div>
    </section>
  );
}
