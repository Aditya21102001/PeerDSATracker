import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
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
@Service()
export class InsightsService {
  private readonly http = inject(HttpClient);

  weakness(): Observable<WeaknessReport> {
    return this.http.get<WeaknessReport>('/api/analytics/weakness');
  }

  reviseNext(): Observable<ReviseNextReport> {
    return this.http.get<ReviseNextReport>('/api/analytics/revise-next');
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
