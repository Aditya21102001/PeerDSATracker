import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Difficulty,
  Page,
  Problem,
  ProblemStatus,
  SheetProgress,
  StatusFilter,
} from '../models/api.models';

export interface ProblemQuery {
  step?: number | null;
  difficulty?: Difficulty | null;
  status?: StatusFilter | null;
  q?: string | null;
  page?: number;
  size?: number;
}

@Service()
export class SheetService {
  private readonly http = inject(HttpClient);

  problems(query: ProblemQuery = {}): Observable<Page<Problem>> {
    let params = new HttpParams()
      .set('page', String(query.page ?? 0))
      .set('size', String(query.size ?? 50));

    if (query.step) params = params.set('step', String(query.step));
    if (query.difficulty) params = params.set('difficulty', query.difficulty);
    if (query.status) params = params.set('status', query.status);
    if (query.q?.trim()) params = params.set('q', query.q.trim());

    return this.http.get<Page<Problem>>('/api/sheet/problems', { params });
  }

  progress(): Observable<SheetProgress> {
    return this.http.get<SheetProgress>('/api/sheet/progress');
  }

  setStatus(problemId: number, status: ProblemStatus): Observable<unknown> {
    return this.http.put(`/api/status/problems/${problemId}`, { status });
  }

  clearStatus(problemId: number): Observable<unknown> {
    return this.http.delete(`/api/status/problems/${problemId}`);
  }

  toggleStar(problemId: number): Observable<{ problemId: number; starred: boolean }> {
    return this.http.post<{ problemId: number; starred: boolean }>(
      `/api/status/problems/${problemId}/star`,
      {},
    );
  }
}
