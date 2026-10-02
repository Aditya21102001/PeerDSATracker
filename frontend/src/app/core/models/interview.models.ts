export type InterviewTrack = 'JAVA_SPRING' | 'DSA' | 'SYSTEM_DESIGN' | 'ANGULAR_FRONTEND' | 'BEHAVIORAL';
export type InterviewLevel = 'JUNIOR' | 'MID' | 'SENIOR';

export interface StartInterviewRequest {
  track: InterviewTrack;
  targetRole?: string;
  level: InterviewLevel;
}

export interface InterviewTurn {
  id: number;
  turnIndex: number;
  question: string;
  topic: string;
  candidateAnswer: string;
  aiEvaluation: string;
  score: number;
}

export interface InterviewSession {
  id: number;
  track: InterviewTrack;
  targetRole: string;
  level: InterviewLevel;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'ABANDONED';
  overallScore: number;
  technicalDepth: number;
  problemSolving: number;
  communication: number;
  feedbackSummary: string;
  strengths: string;
  weaknesses: string;
  recommendedTopics: string;
  turns: InterviewTurn[];
  createdAt: string;
  completedAt: string | null;
}

export interface TurnEvaluation {
  turnIndex: number;
  question: string;
  topic: string;
  candidateAnswer: string;
  aiEvaluation: string;
  score: number;
  isFinished: boolean;
  nextQuestion: string;
  nextTopic: string;
}

// ------------------------------------------------------------- AI Proctored Test

export interface TestSampleCase {
  input: string;
  expectedOutput: string;
}

export interface TestCodingProblem {
  id: number;
  title: string;
  description: string;
  constraints: string;
  starterCodeJava: string;
  starterCodePython: string;
  starterCodeCpp: string;
  sampleCases: TestSampleCase[];
}

export interface TestMcqQuestion {
  id: number;
  question: string;
  options: string[];
  category: string;
}

export interface TestSession {
  id: number;
  title: string;
  track: string;
  durationMinutes: number;
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'EXPIRED' | 'DISQUALIFIED';
  mcqs: TestMcqQuestion[];
  codingProblems: TestCodingProblem[];
  startedAt: string;
}

export interface ProctoringViolation {
  type: 'TAB_SWITCH' | 'WINDOW_BLUR' | 'PASTE_ANOMALY' | 'FACE_ABSENCE' | 'AUDIO_DISTURBANCE' | 'FULLSCREEN_EXIT' | string;
  details: string;
  timestampMs: number;
}

export interface SubmitTestRequest {
  mcqAnswers: Record<string, number>;
  codeSubmission: string;
  codeLanguage: string;
  codingProblemId: number;
  violations: ProctoringViolation[];
}

export interface TestResult {
  id: number;
  title: string;
  track: string;
  status: string;
  score: number;
  integrityScore: number;
  proctoringVerdict: 'CLEARED' | 'FLAGGED_FOR_REVIEW' | 'DISQUALIFIED' | string;
  mcqScore: number;
  codeScore: number;
  testCasesPassed: number;
  testCasesTotal: number;
  feedback: string;
  violations: ProctoringViolation[];
  startedAt: string;
  submittedAt: string;
}
