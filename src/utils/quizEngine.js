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

export function getQuestionId(question, index) {
  return String(question.id || question.number || index);
}

export function getOrderedQuestionIds(questions) {
  return questions
    .map((question, index) => ({
      id: getQuestionId(question, index),
      order: typeof question.number === 'number' ? question.number : index + 1,
      index,
    }))
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.index - b.index;
    })
    .map((item) => item.id);
}

export function createInitialProgress(questions) {
  const ids = questions.map((question, index) => getQuestionId(question, index));

  return createInitialProgressForIds(ids);
}

export function createInitialProgressForIds(questionIds) {
  return {
    questionOrder: shuffle(questionIds.map(String)),
    currentIndex: 0,
    correctCount: 0,
    wrongCount: 0,
    answeredIds: [],
    mistakes: {},
    mistakeHistory: {},
    markedForReviewIds: [],
  };
}

export function createInitialStudyState(questions) {
  return {
    version: 2,
    activeStudySetId: 'all',
    studySets: {
      all: createAllStudySet(),
    },
    progressByStudySetId: {
      all: createInitialProgress(questions),
    },
  };
}

export function createAllStudySet() {
  return {
    id: 'all',
    type: 'all',
    label: 'Tutte le domande',
  };
}

export function createBlockStudySets(questions, blockSize) {
  const orderedIds = getOrderedQuestionIds(questions);
  const sets = {};

  for (let start = 0; start < orderedIds.length; start += blockSize) {
    const blockIndex = Math.floor(start / blockSize);
    const questionIds = orderedIds.slice(start, start + blockSize);
    const id = getBlockStudySetId(blockSize, blockIndex);
    const end = start + questionIds.length;

    sets[id] = {
      id,
      type: 'block',
      blockSize,
      blockIndex,
      label: `Blocco ${blockIndex + 1}`,
      rangeLabel: `${start + 1}-${end}`,
      questionIds,
    };
  }

  return sets;
}

export function getBlockStudySetId(blockSize, blockIndex) {
  return `block-${blockSize}-${blockIndex}`;
}

export function ensureBlockStudySets(studyState, questions, blockSize) {
  const existingSets = studyState.studySets || {};
  const alreadyInitialized = Object.values(existingSets).some((set) => (
    set?.type === 'block' && set.blockSize === blockSize && Array.isArray(set.questionIds)
  ));

  if (alreadyInitialized) return studyState;

  return {
    ...studyState,
    studySets: {
      ...existingSets,
      ...createBlockStudySets(questions, blockSize),
    },
  };
}

export function sanitizeProgress(progress, questionMap, questions, allowedQuestionIds = null) {
  const fallbackIds = allowedQuestionIds
    ? allowedQuestionIds.map(String).filter((id) => questionMap.has(id))
    : questions.map((question, index) => getQuestionId(question, index));

  if (!progress) return createInitialProgressForIds(fallbackIds);

  const allowedSet = new Set(fallbackIds);
  const sourceOrder = Array.isArray(progress.questionOrder) ? progress.questionOrder : [];
  const usableOrder = sourceOrder
    .filter((id) => questionMap.has(String(id)) && allowedSet.has(String(id)))
    .map(String);

  const knownIds = new Set(usableOrder);

  fallbackIds.forEach((id) => {
    if (!knownIds.has(id)) {
      usableOrder.push(id);
      knownIds.add(id);
    }
  });

  const answeredSource = Array.isArray(progress.answeredIds) ? progress.answeredIds : [];
  const answeredIds = answeredSource
    .filter((id) => questionMap.has(String(id)) && allowedSet.has(String(id)))
    .map(String);
  const answeredSet = new Set(answeredIds);
  let currentIndex = Math.min(Math.max(progress.currentIndex || 0, 0), usableOrder.length);

  while (currentIndex < usableOrder.length && answeredSet.has(usableOrder[currentIndex])) {
    currentIndex += 1;
  }

  const mistakes = {};
  const mistakeHistory = {};
  const markedForReviewIds = Array.isArray(progress.markedForReviewIds)
    ? [...new Set(progress.markedForReviewIds.map(String))]
      .filter((id) => questionMap.has(id) && allowedSet.has(id))
    : [];

  Object.entries(progress.mistakes || {}).forEach(([id, mistake]) => {
    const normalizedId = String(id);
    if (questionMap.has(normalizedId) && allowedSet.has(normalizedId)) {
      mistakes[normalizedId] = mistake;
    } else {
      console.warn('Domanda salvata nei progressi ma non trovata nel JSON:', normalizedId);
    }
  });

  Object.entries(progress.mistakeHistory || {}).forEach(([id, mistake]) => {
    const normalizedId = String(id);
    if (questionMap.has(normalizedId) && allowedSet.has(normalizedId)) {
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
    correctCount: progress.correctCount || 0,
    wrongCount: progress.wrongCount || 0,
    mistakes,
    mistakeHistory,
    markedForReviewIds,
  };
}

export function sanitizeStudyState(savedState, questionMap, questions) {
  if (!savedState) return createInitialStudyState(questions);

  if (!isStudyState(savedState)) {
    const allProgress = sanitizeProgress(savedState, questionMap, questions);
    return {
      version: 2,
      activeStudySetId: 'all',
      studySets: {
        all: createAllStudySet(),
      },
      progressByStudySetId: {
        all: allProgress,
      },
    };
  }

  const studySets = {
    all: createAllStudySet(),
  };

  Object.entries(savedState.studySets || {}).forEach(([id, studySet]) => {
    if (!studySet || typeof studySet !== 'object') return;
    if (id === 'all' || studySet.type === 'all') return;
    if (studySet.type !== 'block') return;
    if (typeof studySet.blockSize !== 'number') return;
    if (typeof studySet.blockIndex !== 'number') return;
    if (!Array.isArray(studySet.questionIds)) return;

    const questionIds = [...new Set(studySet.questionIds.map(String))]
      .filter((questionId) => questionMap.has(questionId));

    if (questionIds.length === 0) return;

    studySets[id] = {
      ...studySet,
      id,
      questionIds,
      label: studySet.label || `Blocco ${studySet.blockIndex + 1}`,
      rangeLabel: studySet.rangeLabel || '',
    };
  });

  const progressByStudySetId = {};
  Object.entries(studySets).forEach(([id, studySet]) => {
    const allowedIds = studySet.type === 'block' ? studySet.questionIds : null;
    progressByStudySetId[id] = sanitizeProgress(
      savedState.progressByStudySetId?.[id],
      questionMap,
      questions,
      allowedIds
    );
  });

  const activeStudySetId = studySets[savedState.activeStudySetId]
    ? savedState.activeStudySetId
    : 'all';

  return {
    version: 2,
    activeStudySetId,
    studySets,
    progressByStudySetId,
  };
}

function isStudyState(value) {
  return Boolean(
    value
      && typeof value === 'object'
      && value.progressByStudySetId
      && typeof value.progressByStudySetId === 'object'
      && value.studySets
      && typeof value.studySets === 'object'
  );
}

export function getPercent(value, total) {
  if (!total) return 0;
  return Math.round((value / total) * 100);
}

export function getPercentWithDecimals(value, total, decimals = 1) {
  if (!total) return '0.0';
  return ((value / total) * 100).toFixed(decimals);
}
