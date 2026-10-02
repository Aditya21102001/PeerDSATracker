import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  TestResult,
  TestSession,
} from '../../core/models/interview.models';
import { InterviewService } from '../../core/services/interview.service';
import { ProctoredTestPage } from './proctored-test-page';

describe('ProctoredTestPage — AI-Proctored Assessment & Live Proctoring HUD', () => {
  let fixture: ComponentFixture<ProctoredTestPage>;
  let component: ProctoredTestPage;

  const mockSession: TestSession = {
    id: 201,
    title: 'Full-Stack Technical Coding Assessment',
    track: 'FULL_STACK',
    durationMinutes: 45,
    status: 'IN_PROGRESS',
    mcqs: [
      {
        id: 1,
        question: 'What is the worst-case time complexity of search in Red-Black Tree?',
        options: ['O(1)', 'O(log N)', 'O(N)', 'O(N log N)'],
        category: 'Data Structures',
      },
    ],
    codingProblems: [
      {
        id: 1,
        title: 'Subarray Sum Equals K',
        description: 'Find number of subarrays whose sum is K.',
        constraints: '1 <= N <= 10^5',
        starterCodeJava: 'public class Solution {}',
        starterCodePython: 'def solution(): pass',
        starterCodeCpp: 'int main() {}',
        sampleCases: [{ input: '3 2\n1 1 1\n', expectedOutput: '2' }],
      },
    ],
    startedAt: '2026-10-02T12:00:00Z',
  };

  const mockResult: TestResult = {
    id: 201,
    title: 'Full-Stack Technical Coding Assessment',
    track: 'FULL_STACK',
    status: 'SUBMITTED',
    score: 88,
    integrityScore: 85,
    proctoringVerdict: 'CLEARED',
    mcqScore: 50,
    codeScore: 38,
    testCasesPassed: 4,
    testCasesTotal: 4,
    feedback: 'Assessment verified authentic. High technical performance.',
    violations: [
      {
        type: 'TAB_SWITCH',
        details: 'User navigated away from test window',
        timestampMs: 1727870400000,
      },
    ],
    startedAt: '2026-10-02T12:00:00Z',
    submittedAt: '2026-10-02T12:40:00Z',
  };

  const fakeInterviewService = {
    startTest: () => of(mockSession),
    submitTest: () => of(mockResult),
    getTest: () => of(mockResult),
    listTests: () => of([mockResult]),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProctoredTestPage],
      providers: [
        provideRouter([]),
        { provide: InterviewService, useValue: fakeInterviewService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ProctoredTestPage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component and default to rules view', () => {
    expect(component).toBeTruthy();
    expect((component as any).activeView()).toBe('rules');
    expect((component as any).integrityScore()).toBe(100);
  });

  it('should start test session and transition to test view with MCQs and Code', async () => {
    await (component as any).startTestSession();
    fixture.detectChanges();

    expect((component as any).activeView()).toBe('test');
    expect((component as any).currentSession()).toEqual(mockSession);
    expect((component as any).currentCodingProblem()?.title).toBe('Subarray Sum Equals K');
  });

  it('should record tab switch violation and deduct 15 points from integrity score', () => {
    (component as any).recordViolation('TAB_SWITCH', 'Switched browser tab');

    expect((component as any).violations().length).toBe(1);
    expect((component as any).integrityScore()).toBe(85);
    expect((component as any).alertToast()).toContain('Switched browser tab');
  });

  it('should select MCQ option accurately', () => {
    (component as any).selectMcqOption(1, 1);
    expect((component as any).mcqAnswers['1']).toBe(1);
  });

  it('should switch between MCQ and coding sections', () => {
    expect((component as any).activeSection()).toBe('mcq');

    (component as any).switchSection('coding');
    expect((component as any).activeSection()).toBe('coding');
  });

  it('should submit assessment and display audit report', () => {
    (component as any).currentSession.set(mockSession);
    (component as any).submitAssessment(true); // autoSubmit=true skips window.confirm

    expect((component as any).activeView()).toBe('result');
    expect((component as any).testResult()).toEqual(mockResult);
    expect((component as any).testResult()?.proctoringVerdict).toBe('CLEARED');
  });

  it('should handle startTest failure and display error banner with dismiss capability', async () => {
    const interviewService = TestBed.inject(InterviewService);
    vitest.spyOn(interviewService, 'startTest').mockReturnValue(
      throwError(() => ({ status: 401, error: { message: 'Unauthorized' } }))
    );

    await (component as any).startTestSession();
    fixture.detectChanges();

    expect((component as any).isStarting()).toBe(false);
    expect((component as any).errorMessage()).toContain('Please sign in');

    (component as any).dismissError();
    expect((component as any).errorMessage()).toBeNull();
  });
});

