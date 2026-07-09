import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable, retry, throwError, timer } from 'rxjs';
import {
  Platform,
  PlatformAccountView,
  ReviseNextReport,
  SyncRunView,
  WeaknessReport,
} from '../models/api.models';

/**
 * Everything backed by the FastAPI service. All of it can 503 when that service is
 * down, so callers must degrade rather than break the page.
 */
/** Render's free tier spins a service down after 15 min idle; waking it takes ~30-60s. */
const WAKE_RETRIES = 2;
const WAKE_DELAY_MS = 12_000;

@Service()
export class InsightsService {
  private readonly http = inject(HttpClient);

  /**
   * A 503 from /api/analytics/* means the backend could not reach the analytics
   * service -- almost always because Render is spinning it back up. Retrying gives
   * it time to wake. Any other status is a real failure and fails fast.
   */
  private waitForWake<T>(request: Observable<T>): Observable<T> {
    return request.pipe(
      retry({
        count: WAKE_RETRIES,
        delay: (error: HttpErrorResponse, attempt) =>
          error.status === 503 ? timer(WAKE_DELAY_MS * attempt) : throwError(() => error),
      }),
    );
  }

  weakness(): Observable<WeaknessReport> {
    return this.waitForWake(this.http.get<WeaknessReport>('/api/analytics/weakness'));
  }

  reviseNext(): Observable<ReviseNextReport> {
    return this.waitForWake(this.http.get<ReviseNextReport>('/api/analytics/revise-next'));
  }

  accounts(): Observable<PlatformAccountView[]> {
    return this.http.get<PlatformAccountView[]>('/api/sync/accounts');
  }

  link(platform: Platform, handle: string): Observable<PlatformAccountView> {
    return this.http.post<PlatformAccountView>('/api/sync/accounts', { platform, handle });
  }

  unlink(platform: Platform): Observable<void> {
    return this.http.delete<void>(`/api/sync/accounts/${platform}`);
  }

  run(): Observable<SyncRunView[]> {
    return this.http.post<SyncRunView[]>('/api/sync/run', {});
  }

  runs(): Observable<SyncRunView[]> {
    return this.http.get<SyncRunView[]>('/api/sync/runs');
  }
}
