import { HttpClient, HttpParams } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { BadgeView, HeatmapDay, StreakSummary, XpView } from '../models/api.models';

@Service()
export class ActivityService {
  private readonly http = inject(HttpClient);

  heatmap(year?: number): Observable<HeatmapDay[]> {
    const params = year ? new HttpParams().set('year', String(year)) : undefined;
    return this.http.get<HeatmapDay[]>('/api/activity/heatmap', { params });
  }

  streak(): Observable<StreakSummary> {
    return this.http.get<StreakSummary>('/api/activity/streak');
  }

  badges(): Observable<BadgeView[]> {
    return this.http.get<BadgeView[]>('/api/gamification/badges');
  }

  xp(): Observable<XpView> {
    return this.http.get<XpView>('/api/gamification/xp');
  }
}
