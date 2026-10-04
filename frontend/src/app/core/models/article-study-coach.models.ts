export type ArticleReadingPattern =
  | 'CALIBRATING'
  | 'DEEP_ACTIVE_READING'
  | 'SKIMMING'
  | 'PASSIVE_READING'
  | 'COMPREHENSION_STRUGGLE'
  | 'EXTENDED_PAUSE';

export interface ArticlePauseRecord {
  id: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
  scrollDepthPercent: number;
  notesRecorded: boolean;
  textHighlighted: boolean;
}

export interface ArticleStudyRecommendation {
  id: string;
  title: string;
  description: string;
  badge: string;
  category: 'retention' | 'pacing' | 'comprehension' | 'break';
  actionText?: string;
  actionKey?: string;
}

export interface ArticleCoachSettings {
  enableReadingCoach: boolean;
  soundChimeOnAlerts: boolean;
  autoSaveNotes: boolean;
}

export interface ArticleStudyMetrics {
  totalReadSeconds: number;
  totalPauseSeconds: number;
  continuousReadSeconds: number;
  maxContinuousStreakSeconds: number;
  pauseCount: number;
  activePauseCount: number;
  estimatedWpm: number;
  scrollDepthPercent: number;
  reReadCount: number;
  retentionIndex: number;
  pattern: ArticleReadingPattern;
}
