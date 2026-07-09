export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** Null status = the user has never marked the problem. */
export type ProblemStatus = 'SOLVED' | 'ATTEMPTED' | 'REVISIT';

/** The `status` query param also accepts these pseudo-statuses. */
export type StatusFilter = ProblemStatus | 'UNSOLVED' | 'STARRED';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface Me {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  xp: number;
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
}

export interface Problem {
  id: number;
  title: string;
  difficulty: Difficulty;
  position: number;
  leetcodeUrl: string | null;
  youtubeUrl: string | null;
  articleUrl: string | null;
  subStepId: number;
  subStepTitle: string;
  stepNo: number;
  stepTitle: string;
  status: ProblemStatus | null;
  starred: boolean;
}

export interface StepProgress {
  stepNo: number;
  stepTitle: string;
  total: number;
  solved: number;
}

export interface SheetProgress {
  total: number;
  solved: number;
  attempted: number;
  revisit: number;
  starred: number;
  steps: StepProgress[];
}

export interface HeatmapDay {
  /** ISO yyyy-MM-dd, in the server's configured streak zone. */
  date: string;
  count: number;
  xp: number;
}

export interface StreakSummary {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  totalActiveDays: number;
}

export type CriteriaType = 'TOTAL_SOLVED' | 'STREAK' | 'XP' | 'TOPIC_COMPLETE';

export interface BadgeView {
  code: string;
  name: string;
  description: string | null;
  icon: string | null;
  criteriaType: CriteriaType;
  criteriaValue: number;
  earned: boolean;
  awardedAt: string | null;
}

export interface XpView {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  xpPerLevel: number;
}

export type Platform = 'LEETCODE' | 'CODEFORCES';
export type SyncStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

export interface TopicMastery {
  topic: string;
  mastery: number;
  solved: number;
  total: number;
  gap: number;
}

export interface WeaknessReport {
  userId: number;
  weakest: TopicMastery[];
  strongest: TopicMastery[];
  overallMastery: number;
}

export interface Recommendation {
  problemId: number;
  title: string;
  reason: string;
  priority: number;
  suggestedIntervalDays: number;
}

export interface ReviseNextReport {
  userId: number;
  recommendations: Recommendation[];
}

/** Whatever the platform last returned, cached verbatim. Shape varies by platform. */
export interface PlatformAccountView {
  platform: Platform;
  handle: string;
  verified: boolean;
  lastSyncedAt: string | null;
  externalStats: Record<string, unknown> | null;
}

export interface SyncRunView {
  id: number;
  platform: Platform;
  status: SyncStatus;
  triggerSource: 'SCHEDULED' | 'MANUAL';
  startedAt: string;
  finishedAt: string | null;
  itemsProcessed: number;
  errorMessage: string | null;
}

export interface NoteView {
  problemId: number;
  content: string;
  updatedAt: string | null;
}

export interface NoteSummary {
  problemId: number;
  problemTitle: string;
  stepNo: number;
  content: string;
  updatedAt: string;
}

export interface RevisionItem {
  problemId: number;
  title: string;
  difficulty: Difficulty;
  stepNo: number;
  leetcodeUrl: string | null;
  nextReviewAt: string;
  intervalDays: number | null;
  lastReviewedAt: string | null;
  overdueDays: number;
}

export interface PeerView {
  id: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  xp: number;
  totalSolved: number;
  currentStreak: number;
  /** Whether the signed-in user follows this person. */
  following: boolean;
}

export interface LeaderboardRow {
  rank: number;
  userId: number;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  xp: number;
  totalSolved: number;
  currentStreak: number;
}

export interface LeaderboardResponse {
  rows: LeaderboardRow[];
  page: number;
  size: number;
  totalUsers: number;
}

/** Mirrors Spring Data's serialized Page<T>. */
export interface Page<T> {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
}
