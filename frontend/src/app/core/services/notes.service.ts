import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { NoteSummary, NoteView, Page, Problem, RevisionItem } from '../models/api.models';

@Service()
export class NotesService {
  private readonly http = inject(HttpClient);

  // -- notes ---------------------------------------------------------------

  /** Never 404s: an unwritten note comes back with empty content. */
  get(problemId: number): Observable<NoteView> {
    return this.http.get<NoteView>(`/api/notes/problems/${problemId}`);
  }

  save(problemId: number, content: string): Observable<NoteView> {
    return this.http.put<NoteView>(`/api/notes/problems/${problemId}`, { content });
  }

  delete(problemId: number): Observable<void> {
    return this.http.delete<void>(`/api/notes/problems/${problemId}`);
  }

  list(page = 0, size = 20): Observable<Page<NoteSummary>> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.http.get<Page<NoteSummary>>('/api/notes', { params });
  }

  problem(problemId: number): Observable<Problem> {
    return this.http.get<Problem>(`/api/sheet/problems/${problemId}`);
  }

  // -- revision ------------------------------------------------------------

  dueQueue(): Observable<RevisionItem[]> {
    return this.http.get<RevisionItem[]>('/api/revision/queue');
  }

  upcoming(): Observable<RevisionItem[]> {
    return this.http.get<RevisionItem[]>('/api/revision/upcoming');
  }

  schedule(problemId: number, intervalDays?: number): Observable<RevisionItem> {
    return this.http.post<RevisionItem>(`/api/revision/problems/${problemId}/schedule`, { intervalDays });
  }

  /** Recalled it: climb one rung up the interval ladder. */
  reviewed(problemId: number): Observable<RevisionItem> {
    return this.http.post<RevisionItem>(`/api/revision/problems/${problemId}/done`, {});
  }

  /** Forgot it: back to a 1-day interval. */
  resetReview(problemId: number): Observable<RevisionItem> {
    return this.http.post<RevisionItem>(`/api/revision/problems/${problemId}/reset`, {});
  }

  retire(problemId: number): Observable<void> {
    return this.http.delete<void>(`/api/revision/problems/${problemId}`);
  }
}
