import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import {
  CodeDraft,
  LanguageOption,
  Problem,
  RunResult,
  SubmissionView,
  SubmitResultView,
  TestCaseView,
} from '../models/api.models';

/**
 * The in-app code editor's HTTP surface: the language catalogue, per-problem draft save/load,
 * sample test cases, stateless run, and code submissions with automatic SOLVED evaluation.
 *
 * Running never touches this browser or the Spring backend — the backend proxies to Piston's
 * sandbox. A `run` that reaches the sandbox but whose code fails to compile or crashes still
 * resolves successfully with a {@link RunResult} describing the failure; only the execution service
 * being unreachable surfaces as an HTTP error (503).
 */
@Service()
export class CodeService {
  private readonly http = inject(HttpClient);

  /** The catalogue rarely changes, so the first response is cached and shared. */
  private readonly languages$ = this.http
    .get<LanguageOption[]>('/api/code/languages')
    .pipe(shareReplay({ bufferSize: 1, refCount: false }));

  languages(): Observable<LanguageOption[]> {
    return this.languages$;
  }

  /** Every saved language for one problem; empty until the user saves something. */
  drafts(problemId: number): Observable<CodeDraft[]> {
    return this.http.get<CodeDraft[]>(`/api/code/problems/${problemId}`);
  }

  /** Sample test cases configured for this problem. */
  testCases(problemId: number): Observable<TestCaseView[]> {
    return this.http.get<TestCaseView[]>(`/api/code/problems/${problemId}/testcases`);
  }

  /** Submission history for the current user and problem. */
  submissions(problemId: number): Observable<SubmissionView[]> {
    return this.http.get<SubmissionView[]>(`/api/code/problems/${problemId}/submissions`);
  }

  save(problemId: number, language: string, source: string): Observable<CodeDraft> {
    return this.http.put<CodeDraft>(`/api/code/problems/${problemId}`, { language, source });
  }

  run(language: string, source: string, stdin: string): Observable<RunResult> {
    return this.http.post<RunResult>('/api/code/run', { language, source, stdin });
  }

  /**
   * Evaluates the code against all test cases for the problem, saves a submission record,
   * and automatically transitions the problem status to SOLVED with XP and streak updates upon ACCEPTED.
   */
  submit(
    problemId: number,
    language: string,
    source: string,
    stdin?: string,
  ): Observable<SubmitResultView> {
    return this.http.post<SubmitResultView>(`/api/code/problems/${problemId}/submit`, {
      language,
      source,
      stdin: stdin ?? '',
    });
  }

  /** The problem being solved, for the editor's header. */
  problem(problemId: number): Observable<Problem> {
    return this.http.get<Problem>(`/api/sheet/problems/${problemId}`);
  }

  /** Wakes up the analytics/sandbox container from cold start. */
  warmup(): Observable<void> {
    return this.http.post<void>('/api/code/warmup', {});
  }
}
