export type StudyPatternType =
  | 'CALIBRATING'
  | 'OPTIMAL_ACTIVE'
  | 'PASSIVE_BINGE'
  | 'COGNITIVE_OVERLOAD'
  | 'EXTENDED_PAUSE';

export type PauseReason =
  | 'USER_PAUSE'
  | 'AWAY_TAB_SWITCH'
  | 'AWAY_PRESENCE_LOST'
  | 'BREAK_TIMER';

export interface PauseEvent {
  id: string;
  startedAt: number;
  endedAt?: number;
  durationSeconds: number;
  reason: PauseReason;
  notesRecorded: boolean;
}

export interface StudyCoachingRecommendation {
  id: string;
  title: string;
  description: string;
  badge: string;
  category: 'retention' | 'pacing' | 'cognitive_load' | 'break';
  actionText?: string;
  actionKey?: string;
}

export type UserGestureType =
  | 'none'
  | 'WAVE'
  | 'PALM'
  | 'THUMBS_UP'
  | 'NOD'
  | 'V_SIGN';

export interface FaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface StudyCoachSettings {
  autoPauseOnAway: boolean;
  enableCameraPresence: boolean;
  soundAlertOnAutoPause: boolean;
  autoResumeOnReturn: boolean;
  enableGestureControl?: boolean;
}

export interface StudyHabitMetrics {
  totalWatchSeconds: number;
  totalPauseSeconds: number;
  continuousWatchSeconds: number;
  maxContinuousStreakSeconds: number;
  pauseCount: number;
  activePauseCount: number;
  frequentPauseStreak: number;
  activeLearningIndex: number; // 0 to 100
  pattern: StudyPatternType;
  currentStatus: string;
}
