const LEGACY_STORAGE_KEY = 'asl-bari-quiz-progress-v1';
const DEFAULT_QUIZ_ID = 'preselettiva';

export function loadProgress(quizId = DEFAULT_QUIZ_ID) {
  try {
    const raw = localStorage.getItem(getStorageKey(quizId))
      || (quizId === DEFAULT_QUIZ_ID ? localStorage.getItem(LEGACY_STORAGE_KEY) : null);
    if (!raw) return null;

    const parsed = JSON.parse(raw);

    if (
      parsed
      && typeof parsed === 'object'
      && parsed.studySets
      && parsed.progressByStudySetId
    ) {
      return parsed;
    }

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
      markedForReviewIds: Array.isArray(parsed.markedForReviewIds) ? parsed.markedForReviewIds : [],
    };
  } catch (error) {
    console.warn('Progressi localStorage corrotti, verranno ignorati.', error);
    return null;
  }
}

export function saveProgress(progress, quizId = progress?.quizId || DEFAULT_QUIZ_ID) {
  localStorage.setItem(getStorageKey(quizId), JSON.stringify(progress));
}

export function clearProgress(quizId = DEFAULT_QUIZ_ID) {
  localStorage.removeItem(getStorageKey(quizId));
}

export function getStorageKey(quizId = DEFAULT_QUIZ_ID) {
  return `quiz-kikka-progress-${quizId}-v1`;
}
