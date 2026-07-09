import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { LeaderboardResponse, LeaderboardRow, PeerView } from '../models/api.models';

/**
 * Following, follower lists, and both leaderboards.
 *
 * A row's `rank` is authoritative: the server computes `RANK()` before `LIMIT`, so page 2
 * carries true global ranks. Never re-derive a rank from a row's index in the page.
 */
@Service()
export class PeerService {
  private readonly http = inject(HttpClient);

  search(q: string): Observable<PeerView[]> {
    return this.http.get<PeerView[]>('/api/peers/search', { params: new HttpParams().set('q', q) });
  }

  following(): Observable<PeerView[]> {
    return this.http.get<PeerView[]>('/api/peers/following');
  }

  followers(): Observable<PeerView[]> {
    return this.http.get<PeerView[]>('/api/peers/followers');
  }

  follow(userId: number): Observable<void> {
    return this.http.post<void>(`/api/peers/follow/${userId}`, {});
  }

  unfollow(userId: number): Observable<void> {
    return this.http.delete<void>(`/api/peers/follow/${userId}`);
  }

  globalLeaderboard(page = 0, size = 50): Observable<LeaderboardResponse> {
    const params = new HttpParams().set('page', String(page)).set('size', String(size));
    return this.http.get<LeaderboardResponse>('/api/leaderboard/global', { params });
  }

  peersLeaderboard(): Observable<LeaderboardRow[]> {
    return this.http.get<LeaderboardRow[]>('/api/leaderboard/peers');
  }
}
