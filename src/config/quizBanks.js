const COMPETITION_ID = 'asl-bari-1000-infermieri-2025-2026';
const COMPETITION_LABEL = 'Concorso 1000 Infermieri ASL Bari 2025-2026';

export const QUIZ_BANKS = [
  {
    quizId: 'preselettiva',
    competitionId: COMPETITION_ID,
    competitionLabel: COMPETITION_LABEL,
    label: 'Prova preselettiva',
    description: 'Banca dati prova preselettiva',
    questionsUrl: `${import.meta.env.BASE_URL}data/questions.json`,
    available: true,
    default: true,
  },
  {
    quizId: 'scritta',
    competitionId: COMPETITION_ID,
    competitionLabel: COMPETITION_LABEL,
    label: 'Prova scritta',
    description: 'Banca dati prova scritta',
    questionsUrl: `${import.meta.env.BASE_URL}data/questions-scritta.json`,
    available: false,
    default: false,
  },
];

export const DEFAULT_QUIZ_BANK = QUIZ_BANKS.find((bank) => bank.default) || QUIZ_BANKS[0];

