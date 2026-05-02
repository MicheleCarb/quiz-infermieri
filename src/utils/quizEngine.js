import { shuffle } from './shuffle';

export function buildQuestionMap(questions) {
  const map = new Map();
  const duplicatedIds = new Set();

  questions.forEach((question, index) => {
    const id = String(question.id || question.number || index);
    if (map.has(id)) duplicatedIds.add(id);
    map.set(id, question);
  });

  if (duplicatedIds.size > 0) {
    console.warn('ID duplicati nel JSON:', [...duplicatedIds]);
  }

  return map;
}

export function createInitialProgress(questions) {
  const ids = questions.map((question, index) => String(question.id || question.number || index));

  return {
    questionOrder: shuffle(ids),
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    answeredIds: [],
    mistakes: {},
    mistakeHistory: {},
    markedForReviewIds: [],
  };
}

export function sanitizeProgress(progress, questionMap, questions) {
  if (!progress) return createInitialProgress(questions);

  const usableOrder = progress.questionOrder.filter((id) => questionMap.has(String(id))).map(String);
  const knownIds = new Set(usableOrder);

  questions.forEach((question, index) => {
    const id = String(question.id || question.number || index);
    if (!knownIds.has(id)) {
      usableOrder.push(id);
      knownIds.add(id);
    }
  });

  const answeredIds = progress.answeredIds.filter((id) => questionMap.has(String(id))).map(String);
  const answeredSet = new Set(answeredIds);
  let currentIndex = Math.min(Math.max(progress.currentIndex, 0), usableOrder.length);

  while (currentIndex < usableOrder.length && answeredSet.has(usableOrder[currentIndex])) {
    currentIndex += 1;
  }

  const mistakes = {};
  const mistakeHistory = {};
  const markedForReviewIds = Array.isArray(progress.markedForReviewIds)
    ? [...new Set(progress.markedForReviewIds.map(String))].filter((id) => questionMap.has(id))
    : [];

  Object.entries(progress.mistakes || {}).forEach(([id, mistake]) => {
    const normalizedId = String(id);
    if (questionMap.has(normalizedId)) {
      mistakes[normalizedId] = mistake;
    } else {
      console.warn('Domanda salvata nei progressi ma non trovata nel JSON:', normalizedId);
    }
  });

  Object.entries(progress.mistakeHistory || {}).forEach(([id, mistake]) => {
    const normalizedId = String(id);
    if (questionMap.has(normalizedId)) {
      mistakeHistory[normalizedId] = mistake;
    }
  });

  Object.entries(mistakes).forEach(([id, mistake]) => {
    if (!mistakeHistory[id]) {
      mistakeHistory[id] = mistake;
    }
  });

  return {
    ...progress,
    questionOrder: usableOrder,
    currentIndex,
    answeredIds,
    mistakes,
    mistakeHistory,
    markedForReviewIds,
  };
}

export function getPercent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function getPercentWithDecimals(value, total, decimals = 1) {
  if (!total) return '0.0';
  return ((value / total) * 100).toFixed(decimals);
}
