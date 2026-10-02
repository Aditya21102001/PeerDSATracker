import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  InterviewSession,
  TurnEvaluation,
} from '../../core/models/interview.models';
import { InterviewService } from '../../core/services/interview.service';
import { InterviewPage } from './interview-page';

describe('InterviewPage — Interactive AI Technical Mock Interviewer', () => {
  let fixture: ComponentFixture<InterviewPage>;
  let component: InterviewPage;

  const mockSession: InterviewSession = {
    id: 101,
    track: 'JAVA_SPRING',
    targetRole: 'Senior Java & Spring Boot Backend Engineer',
    level: 'SENIOR',
    status: 'IN_PROGRESS',
    overallScore: 0,
    technicalDepth: 0,
    problemSolving: 0,
    communication: 0,
    feedbackSummary: '',
    strengths: '',
    weaknesses: '',
    recommendedTopics: '',
    turns: [
      {
        id: 501,
        turnIndex: 1,
        question: 'How do Virtual Threads in Java 21 differ from platform OS threads?',
        topic: 'Concurrency & Virtual Threads',
        candidateAnswer: '',
        aiEvaluation: '',
        score: 0,
      },
    ],
    createdAt: '2026-10-02T12:00:00Z',
    completedAt: null,
  };

  const mockTurnEvaluation: TurnEvaluation = {
    turnIndex: 1,
    question: 'How do Virtual Threads in Java 21 differ from platform OS threads?',
    topic: 'Concurrency & Virtual Threads',
    candidateAnswer: 'Virtual threads are lightweight threads managed by the JVM runtime.',
    aiEvaluation: 'Score: 85/100. Strong conceptual understanding of JVM-managed carrier threads.',
    score: 85,
    isFinished: false,
    nextQuestion: 'Walk me through how SecurityFilterChain processes a JWT token.',
    nextTopic: 'Spring Security & Auth',
  };

  const fakeInterviewService = {
    startInterview: () => of(mockSession),
    submitAnswer: () => of(mockTurnEvaluation),
    getInterview: () =>
      of({
        ...mockSession,
        turns: [
          ...mockSession.turns,
          {
            id: 502,
            turnIndex: 2,
            question: mockTurnEvaluation.nextQuestion,
            topic: mockTurnEvaluation.nextTopic,
            candidateAnswer: '',
            aiEvaluation: '',
            score: 0,
          },
        ],
      }),
    listInterviews: () => of([mockSession]),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InterviewPage],
      providers: [
        provideRouter([]),
        { provide: InterviewService, useValue: fakeInterviewService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InterviewPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and default to setup view', () => {
    expect(component).toBeTruthy();
    expect((component as any).activeView()).toBe('setup');
    expect((component as any).selectedTrack()).toBe('JAVA_SPRING');
    expect((component as any).selectedLevel()).toBe('MID');
  });

  it('should switch tracks and update targetRole', () => {
    (component as any).selectTrack('SYSTEM_DESIGN');
    expect((component as any).selectedTrack()).toBe('SYSTEM_DESIGN');
    expect((component as any).targetRole()).toBe('Distributed Systems Architect');
  });

  it('should start interview and transition to live room', () => {
    (component as any).startInterview();
    fixture.detectChanges();

    expect((component as any).activeView()).toBe('live');
    expect((component as any).currentSession()).toEqual(mockSession);
    expect((component as any).activeTurn()?.question).toContain('Virtual Threads');
  });

  it('should submit answer and update latestEvaluation and turn index', () => {
    (component as any).startInterview();
    (component as any).candidateAnswer.set('Virtual threads are lightweight threads managed by the JVM runtime.');

    (component as any).submitAnswer();
    fixture.detectChanges();

    expect((component as any).latestEvaluation()?.score).toBe(85);
    expect((component as any).currentTurnIndex()).toBe(2);
  });

  it('should toggle hint display', () => {
    expect((component as any).hintVisible()).toBe(false);
    (component as any).toggleHint();
    expect((component as any).hintVisible()).toBe(true);
  });

  it('should display error message when startInterview fails', () => {
    const errorService = {
      startInterview: () => throwError(() => ({ status: 500, error: { message: 'Server is currently starting up.' } })),
      submitAnswer: () => of(mockTurnEvaluation),
      getInterview: () => of(mockSession),
      listInterviews: () => of([mockSession]),
    };

    const errFixture = TestBed.createComponent(InterviewPage);
    const errComp = errFixture.componentInstance;
    (errComp as any).interviewService = errorService;

    (errComp as any).startInterview();
    errFixture.detectChanges();

    expect((errComp as any).isStarting()).toBe(false);
    expect((errComp as any).errorMessage()).toBe('Server is currently starting up.');
  });

  it('should display 401 sign in error message when unauthenticated', () => {
    const authErrorService = {
      startInterview: () => throwError(() => ({ status: 401 })),
      submitAnswer: () => of(mockTurnEvaluation),
      getInterview: () => of(mockSession),
      listInterviews: () => of([mockSession]),
    };

    const authFixture = TestBed.createComponent(InterviewPage);
    const authComp = authFixture.componentInstance;
    (authComp as any).interviewService = authErrorService;

    (authComp as any).startInterview();
    authFixture.detectChanges();

    expect((authComp as any).errorMessage()).toContain('Please sign in to start an AI mock interview session.');
  });
});
