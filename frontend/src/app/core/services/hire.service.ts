import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApplyAllResult,
  CandidateProfile,
  ExtractedProfile,
  JobApplication,
  JobOpening,
  SaveCandidateProfileRequest,
} from '../models/hire.models';

@Injectable({ providedIn: 'root' })
export class HireService {
  private readonly http = inject(HttpClient);

  extractResume(resumeText: string): Observable<ExtractedProfile> {
    return this.http.post<ExtractedProfile>('/api/hire/extract-resume', { resumeText });
  }

  getProfile(): Observable<CandidateProfile> {
    return this.http.get<CandidateProfile>('/api/hire/profile');
  }

  saveProfile(req: SaveCandidateProfileRequest): Observable<CandidateProfile> {
    return this.http.put<CandidateProfile>('/api/hire/profile', req);
  }

  listJobs(): Observable<JobOpening[]> {
    return this.http.get<JobOpening[]>('/api/hire/jobs');
  }

  apply(jobId: number): Observable<JobApplication> {
    return this.http.post<JobApplication>(`/api/hire/jobs/${jobId}/apply`, {});
  }

  applyAll(minMatchScore: number = 70): Observable<ApplyAllResult> {
    return this.http.post<ApplyAllResult>('/api/hire/apply-all', { minMatchScore });
  }

  listApplications(): Observable<JobApplication[]> {
    return this.http.get<JobApplication[]>('/api/hire/applications');
  }
}
