export interface CandidateProfile {
  headline: string;
  yearsOfExperience: number;
  currentCompany: string;
  currentRole: string;
  currentCtc: string;
  expectedCtc: string;
  noticePeriodDays: number;
  preferredLocations: string;
  resumeUrl: string;
  resumeSummary: string;
  skills: string;
  certifications: string;
  education: string;
  updatedAt: string;
  completenessPercent: number;
}

export interface SaveCandidateProfileRequest {
  headline: string;
  yearsOfExperience: number;
  currentCompany: string;
  currentRole: string;
  currentCtc: string;
  expectedCtc: string;
  noticePeriodDays: number;
  preferredLocations: string;
  resumeUrl: string;
  resumeSummary: string;
  skills: string;
  certifications: string;
  education: string;
}

export interface ExtractedProfile {
  headline: string;
  yearsOfExperience: number;
  currentCompany: string;
  currentRole: string;
  currentCtc: string;
  expectedCtc: string;
  noticePeriodDays: number;
  preferredLocations: string;
  skills: string;
  certifications: string;
  education: string;
  resumeSummary: string;
}


export interface JobOpening {
  id: number;
  title: string;
  company: string;
  companyLogoUrl: string;
  location: string;
  experienceMin: number;
  experienceMax: number;
  salaryRange: string;
  jobType: string;
  workplaceType: string;
  requiredSkills: string;
  description: string;
  externalApplyUrl: string;
  postedAt: string;
  matchScore: number;
  matchingSkills: string[];
  missingSkills: string[];
  isApplied: boolean;
  applicationStatus: string | null;
  appliedAt: string | null;
}

export interface JobApplication {
  id: number;
  jobId: number;
  jobTitle: string;
  company: string;
  companyLogoUrl: string;
  location: string;
  salaryRange: string;
  status: 'APPLIED' | 'UNDER_REVIEW' | 'SHORTLISTED' | 'INTERVIEW' | 'REJECTED' | 'OFFERED' | string;
  matchScore: number;
  appliedAt: string;
  notes: string;
}

export interface ApplyAllResult {
  appliedCount: number;
  totalMatchingCount: number;
  minScoreThreshold: number;
  message: string;
  appliedApplications: JobApplication[];
}
