export interface QuizQuestion {
  id: string;
  topic: string;
  subtopic?: string;
  icon: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  takeawayNote: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
}

export interface QuizAttempt {
  questionId: string;
  topic: string;
  selectedIndex: number;
  isCorrect: boolean;
  timestamp: number;
  contextType: 'article' | 'video';
  sourceTitle: string;
}

export interface QuizFeedback {
  grade: 'CORRECT' | 'INCORRECT';
  badge: string;
  title: string;
  explanation: string;
  takeawayNote: string;
  retentionBoost: number;
}

export interface TopicQuizPrompt {
  question: QuizQuestion;
  contextType: 'article' | 'video';
  sourceId: string | number;
  sourceTitle: string;
  topic: string;
  reason: 'midpoint' | 'continuous_streak' | 'manual' | 'comprehension_checkpoint';
}
