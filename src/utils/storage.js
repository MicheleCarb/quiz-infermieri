const STORAGE_KEY = 'asl-bari-quiz-progress-v1';

export function loadProgress() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.questionOrder)) return null;
    if (typeof parsed.currentIndex !== 'number') return null;

    return {
      questionOrder: parsed.questionOrder,
      currentIndex: parsed.currentIndex,
      correctCount: parsed.correctCount || 0,
      wrongCount: parsed.wrongCount || 0,
      answeredIds: Array.isArray(parsed.answeredIds) ? parsed.answeredIds : [],
      mistakes: parsed.mistakes && typeof parsed.mistakes === 'object' ? parsed.mistakes : {},
      mistakeHistory: parsed.mistakeHistory && typeof parsed.mistakeHistory === 'object'
        ? parsed.mistakeHistory
        : {},
    };
  } catch (error) {
    console.warn('Progressi localStorage corrotti, verranno ignorati.', error);
    return null;
  }
}

export function saveProgress(progress) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(progress));
}

export function clearProgress() {
  localStorage.removeItem(STORAGE_KEY);
}
