export default function ReviewMistakesButton({ count, onClick, disabled }) {
  return (
    <button className="button button--secondary" type="button" onClick={onClick} disabled={disabled || count === 0}>
      Ripassa errori
      {count > 0 ? ` (${count})` : ''}
    </button>
  );
}
