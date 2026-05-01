export default function ProgressBar({ completed, total }) {
  const percent = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="progress" aria-label={`Progresso ${percent}%`}>
      <div className="progress__fill" style={{ width: `${percent}%` }} />
    </div>
  );
}
