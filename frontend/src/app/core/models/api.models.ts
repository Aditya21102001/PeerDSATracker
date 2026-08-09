/** Sheet difficulty tier of a problem. */
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD';

/** Null status = the user has never marked the problem. */
export type ProblemStatus = 'SOLVED' | 'ATTEMPTED' | 'REVISIT';

/** The `status` query param also accepts these pseudo-statuses. */
export type StatusFilter = ProblemStatus | 'UNSOLVED' | 'STARRED';

/** Access/refresh pair returned by /api/auth/login, /signup, and /refresh. */
export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

/** The signed-in user's profile and headline stats, from /api/auth/me. */
export interface Me {
  id: number;
  email: string;
  username: string;
  displayName: string | null;
  /**
   * False for an account that has only ever signed in through Google. The security panel uses it
   * to offer "set a password" rather than ask for a current one that has never existed.
   */
  hasPassword: boolean;
  xp: number;
  totalSolved: number;
  currentStreak: number;
  longestStreak: number;
}

/**
 * Which sign-in methods this deployment offers, from GET /api/auth/options.
 *
 * Asked of the backend rather than hard-coded in an environment file, so the two cannot drift: a
 * "Continue with Google" button on a backend without Google credentials 401s and looks like a
 * broken site rather than an absent feature.
 */
export interface AuthOptions {
  googleEnabled: boolean;
  /** True when the backend returns codes in the response instead of emailing them. Dev only. */
  otpDemoMode: boolean;
}

/**
 * Answer to POST /api/auth/otp/request.
 *
 * `demoCode` is populated only when the backend is running with OTP_DEMO_MODE=true, so the flow
 * can be exercised with no mail provider configured. It is never populated as a fallback when
 * delivery fails — that case is a 503. Treat a non-null value as a development affordance and say
 * so on screen, never as "the code arrived".
 */
export interface OtpRequestResponse {
  demoMode: boolean;
  demoCode: string | null;
}

/**
 * Answer to POST /api/auth/change-password.
 *
 * `username` matters: recovery finds the account by email, but sign-in wants a username, and for
 * an account created through Google those differ. Show it, or the user sets a correct password and
 * is then told "invalid username or password" with nothing to explain why.
 *
 * `tokens` replaces the caller's session — the change revoked every existing refresh token.
 */
export interface ChangePasswordResponse {
  username: string;
  tokens: TokenResponse;
}

/** A sheet problem with the caller's own status/star, from /api/sheet/problems[/{id}]. */
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

/** Per-step solved/total counts, nested inside SheetProgress. */
export interface StepProgress {
  stepNo: number;
  stepTitle: string;
  total: number;
  solved: number;
}

/** Aggregate sheet counters plus the per-step breakdown, from /api/sheet/progress. */
export interface SheetProgress {
  total: number;
  solved: number;
  attempted: number;
  revisit: number;
  starred: number;
  steps: StepProgress[];
}

/** One day's activity cell from /api/activity/heatmap. */
export interface HeatmapDay {
  /** ISO yyyy-MM-dd, in the server's configured streak zone. */
  date: string;
  count: number;
  xp: number;
}

/** Current/longest streak figures from /api/activity/streak. */
export interface StreakSummary {
  current: number;
  longest: number;
  lastActiveDate: string | null;
  totalActiveDays: number;
}

/** The kind of threshold a badge is earned against. */
export type CriteriaType = 'TOTAL_SOLVED' | 'STREAK' | 'XP' | 'TOPIC_COMPLETE';

/** A badge definition plus the user's earned state, from /api/gamification/badges. */
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

/** XP total resolved into level progress, from /api/gamification/xp. */
export interface XpView {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpToNextLevel: number;
  xpPerLevel: number;
}

/** External judge a user can link for stat syncing. */
export type Platform = 'LEETCODE' | 'CODEFORCES';
/** Lifecycle state of a single sync run. */
export type SyncStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';

/** One topic's mastery figures, part of WeaknessReport. */
export interface TopicMastery {
  topic: string;
  mastery: number;
  solved: number;
  total: number;
  gap: number;
}

/** Weakest/strongest topic breakdown from /api/analytics/weakness (FastAPI). */
export interface WeaknessReport {
  userId: number;
  weakest: TopicMastery[];
  strongest: TopicMastery[];
  overallMastery: number;
}

/** A single suggested problem, part of ReviseNextReport. */
export interface Recommendation {
  problemId: number;
  title: string;
  reason: string;
  priority: number;
  suggestedIntervalDays: number;
}

/** Prioritized revision suggestions from /api/analytics/revise-next (FastAPI). */
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

/** A sync run record from /api/sync/run and /api/sync/runs. */
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

/** A problem's note body from /api/notes/problems/{id} (get and save). */
export interface NoteView {
  problemId: number;
  content: string;
  updatedAt: string | null;
}

/** A note list entry, paged inside /api/notes. */
export interface NoteSummary {
  problemId: number;
  problemTitle: string;
  stepNo: number;
  content: string;
  updatedAt: string;
}

/** A scheduled revision entry from /api/revision/{queue,upcoming} and schedule writes. */
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

/** A discoverable peer from /api/peers/{search,following,followers}. */
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

/** One ranked row; also returned directly as an array by /api/leaderboard/peers. */
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

/** A paged global ranking from /api/leaderboard/global. */
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

/** One runnable language from GET /api/code/languages; `id` is the Piston language id. */
export interface LanguageOption {
  id: string;
  label: string;
  /** Highlighting hint for the editor (e.g. 'python', 'cpp'). */
  editorMode: string;
  /** Starter source shown when no draft exists for this language. */
  template: string;
}

/** A user's saved code for one problem in one language, from /api/code/problems/{id}. */
export interface CodeDraft {
  problemId: number;
  language: string;
  source: string;
  updatedAt: string | null;
}

/**
 * Result of POST /api/code/run. `ran` is false when the language is unknown or the sandbox was
 * unreachable; `compileOutput` holds diagnostics for code that never ran, and `error` a
 * proxy-level failure that is not the user's code.
 */
export interface RunResult {
  ran: boolean;
  language: string;
  version: string | null;
  stdout: string;
  stderr: string;
  compileOutput: string | null;
  exitCode: number | null;
  signal: string | null;
  error: string | null;
}

/** A chat thread in the assistant widget, from /api/chat/conversations. */
export interface ChatConversation {
  id: number;
  title: string;
  updatedAt: string;
}

/** One stored turn. `role` is 'user' or 'assistant'; the system prompt is never returned. */
export interface ChatMessage {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
}

/** A conversation with its full message history, from /api/chat/conversations/{id}. */
export interface ChatConversationDetail {
  id: number;
  title: string;
  messages: ChatMessage[];
}
