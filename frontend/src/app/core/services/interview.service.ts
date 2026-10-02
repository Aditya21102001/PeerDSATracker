import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  InterviewSession,
  StartInterviewRequest,
  SubmitTestRequest,
  TestResult,
  TestSession,
  TurnEvaluation,
} from '../models/interview.models';

@Injectable({ providedIn: 'root' })
export class InterviewService {
  private readonly http = inject(HttpClient);

  // ------------------------------------------------------------- AI Mock Interview

  startInterview(req: StartInterviewRequest): Observable<InterviewSession> {
    return this.http.post<InterviewSession>('/api/interview/start', req);
  }

  submitAnswer(interviewId: number, answer: string): Observable<TurnEvaluation> {
    return this.http.post<TurnEvaluation>(`/api/interview/${interviewId}/answer`, { answer });
  }

  getInterview(interviewId: number): Observable<InterviewSession> {
    return this.http.get<InterviewSession>(`/api/interview/${interviewId}`);
  }

  listInterviews(): Observable<InterviewSession[]> {
    return this.http.get<InterviewSession[]>('/api/interview/history');
  }

  // ------------------------------------------------------------- AI Proctored Test

  startTest(req: { track: string; title?: string; durationMinutes?: number }): Observable<TestSession> {
    return this.http.post<TestSession>('/api/proctor/start', req);
  }

  submitTest(testId: number, req: SubmitTestRequest): Observable<TestResult> {
    return this.http.post<TestResult>(`/api/proctor/${testId}/submit`, req);
  }

  getTest(testId: number): Observable<TestResult> {
    return this.http.get<TestResult>(`/api/proctor/${testId}`);
  }

  listTests(): Observable<TestResult[]> {
    return this.http.get<TestResult[]>('/api/proctor/history');
  }
}
