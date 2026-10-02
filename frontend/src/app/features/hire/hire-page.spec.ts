import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import {
  ApplyAllResult,
  CandidateProfile,
  JobApplication,
  JobOpening,
} from '../../core/models/hire.models';
import { HireService } from '../../core/services/hire.service';
import { HirePage } from './hire-page';

describe('HirePage — Naukri-style Career Portal & 1-Click Auto Apply', () => {
  let fixture: ComponentFixture<HirePage>;
  let component: HirePage;

  const mockProfile: CandidateProfile = {
    headline: 'Senior Backend Engineer | Java, Spring Boot, AWS',
    yearsOfExperience: 4.5,
    currentCompany: 'Fintech Corp',
    currentRole: 'Software Engineer II',
    currentCtc: '22 LPA',
    expectedCtc: '32 LPA',
    noticePeriodDays: 30,
    preferredLocations: 'Bengaluru, Remote, Hyderabad',
    resumeUrl: 'https://example.com/resumes/aditya-resume.pdf',
    resumeSummary: 'Experienced in high-throughput microservices, concurrency, distributed systems, and Spring Boot.',
    skills: 'Java, Spring Boot, Kafka, PostgreSQL, Docker, DSA, AWS, Redis',
    certifications: 'AWS Certified Developer Associate, Oracle Certified Java SE 17 Developer',
    education: 'B.Tech in Computer Science',
    completenessPercent: 92,
    updatedAt: '2026-10-02T12:00:00Z',
  };

  let currentJobs: JobOpening[] = [
    {
      id: 1,
      title: 'Software Development Engineer II',
      company: 'Amazon',
      companyLogoUrl: 'https://logo.clearbit.com/amazon.com',
      location: 'Bengaluru',
      workplaceType: 'HYBRID',
      jobType: 'FULL_TIME',
      experienceMin: 3,
      experienceMax: 6,
      salaryRange: '₹35 - 50 LPA',
      requiredSkills: 'Java, Distributed Systems, AWS, Spring Boot, System Design',
      description: 'Design and operate massive-scale cloud storage services.',
      externalApplyUrl: 'https://amazon.jobs',
      postedAt: '2026-10-01T10:00:00Z',
      matchScore: 94,
      matchingSkills: ['Java', 'AWS', 'Spring Boot'],
      missingSkills: ['Distributed Systems', 'System Design'],
      isApplied: false,
      applicationStatus: null,
      appliedAt: null,
    },
    {
      id: 2,
      title: 'Senior Backend Engineer',
      company: 'Swiggy',
      companyLogoUrl: 'https://logo.clearbit.com/swiggy.com',
      location: 'Bengaluru',
      workplaceType: 'REMOTE',
      jobType: 'FULL_TIME',
      experienceMin: 4,
      experienceMax: 7,
      salaryRange: '₹32 - 45 LPA',
      requiredSkills: 'Java, Spring Boot, Kafka, Redis, PostgreSQL',
      description: 'Build real-time delivery dispatch matching and rider routing systems.',
      externalApplyUrl: 'https://swiggy.com/careers',
      postedAt: '2026-10-01T12:00:00Z',
      matchScore: 88,
      matchingSkills: ['Java', 'Spring Boot', 'Kafka', 'Redis', 'PostgreSQL'],
      missingSkills: [],
      isApplied: false,
      applicationStatus: null,
      appliedAt: null,
    },
    {
      id: 3,
      title: 'Frontend Lead',
      company: 'TCS',
      companyLogoUrl: 'https://logo.clearbit.com/tcs.com',
      location: 'Pune',
      workplaceType: 'ONSITE',
      jobType: 'FULL_TIME',
      experienceMin: 7,
      experienceMax: 12,
      salaryRange: '₹18 - 26 LPA',
      requiredSkills: 'Angular, TypeScript, RxJS, NgRx',
      description: 'Lead enterprise banking web frontend team.',
      externalApplyUrl: 'https://tcs.com/careers',
      postedAt: '2026-09-30T10:00:00Z',
      matchScore: 45,
      matchingSkills: [],
      missingSkills: ['Angular', 'TypeScript', 'RxJS', 'NgRx'],
      isApplied: false,
      applicationStatus: null,
      appliedAt: null,
    },
  ];

  const mockApplications: JobApplication[] = [
    {
      id: 1,
      jobId: 10,
      jobTitle: 'Software Engineer',
      company: 'PhonePe',
      companyLogoUrl: 'https://logo.clearbit.com/phonepe.com',
      location: 'Bengaluru',
      salaryRange: '₹28 - 42 LPA',
      status: 'SHORTLISTED',
      matchScore: 85,
      appliedAt: '2026-10-01T15:00:00Z',
      notes: 'Profile forwarded to Hiring Manager.',
    },
  ];

  const fakeHireService = {
    getProfile: () => of(mockProfile),
    saveProfile: (req: any) => of({ ...mockProfile, headline: req.headline }),
    listJobs: () => of(currentJobs),
    apply: (jobId: number) => {
      currentJobs = currentJobs.map((j) =>
        j.id === jobId ? { ...j, isApplied: true, applicationStatus: 'APPLIED' } : j
      );
      return of<JobApplication>({
        id: 99,
        jobId,
        jobTitle: 'Software Engineer',
        company: 'Amazon',
        companyLogoUrl: '',
        location: 'Bengaluru',
        salaryRange: '₹35 - 50 LPA',
        status: 'APPLIED',
        matchScore: 94,
        appliedAt: new Date().toISOString(),
        notes: '',
      });
    },
    applyAll: (minScore = 70) => {
      currentJobs = currentJobs.map((j) =>
        j.matchScore >= minScore ? { ...j, isApplied: true, applicationStatus: 'APPLIED' } : j
      );
      return of<ApplyAllResult>({
        appliedCount: 2,
        totalMatchingCount: 2,
        minScoreThreshold: minScore,
        appliedApplications: [mockApplications[0]],
        message: 'Successfully applied to 2 matching roles!',
      });
    },
    listApplications: () => of(mockApplications),
  };

  beforeEach(async () => {
    // Reset test data
    currentJobs = currentJobs.map((j) => ({ ...j, isApplied: false, applicationStatus: null }));

    await TestBed.configureTestingModule({
      imports: [HirePage],
      providers: [
        provideRouter([]),
        { provide: HireService, useValue: fakeHireService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HirePage);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should initialize and load profile, jobs, and applications', () => {
    expect(component).toBeTruthy();
    expect((component as any).profile()).toEqual(mockProfile);
    expect((component as any).jobs().length).toBe(3);
    expect((component as any).applications().length).toBe(1);
    expect((component as any).loading()).toBe(false);
  });

  it('should compute eligibleMatchingJobs accurately for roles >= 70% match', () => {
    const eligibleMatches = (component as any).eligibleMatchingJobs();
    expect(eligibleMatches.length).toBe(2);
    expect(eligibleMatches.some((j: JobOpening) => j.company === 'Amazon')).toBe(true);
    expect(eligibleMatches.some((j: JobOpening) => j.company === 'Swiggy')).toBe(true);
    expect(eligibleMatches.some((j: JobOpening) => j.company === 'TCS')).toBe(false);
  });

  it('should filter jobs when searchQuery signal is changed', () => {
    (component as any).searchQuery.set('Amazon');
    fixture.detectChanges();

    const filtered = (component as any).filteredJobs();
    expect(filtered.length).toBe(1);
    expect(filtered[0].company).toBe('Amazon');
  });

  it('should switch activeTab correctly', () => {
    expect((component as any).activeTab()).toBe('jobs');

    (component as any).activeTab.set('profile');
    expect((component as any).activeTab()).toBe('profile');

    (component as any).activeTab.set('applications');
    expect((component as any).activeTab()).toBe('applications');
  });

  it('should trigger 1-Click Apply to All and mark jobs as applied', () => {
    (component as any).applyToAllMatching();

    const note = (component as any).notification();
    expect(note).toBeTruthy();
    expect(note.type).toBe('success');
    expect(note.message).toContain('Successfully applied');

    const amazonJob = (component as any).jobs().find((j: JobOpening) => j.company === 'Amazon');
    expect(amazonJob.isApplied).toBe(true);
  });

  it('should save candidate profile and display success feedback', () => {
    (component as any).profileForm.headline = 'Principal Distributed Systems Engineer';
    (component as any).saveProfile();

    expect((component as any).savingProfile()).toBe(false);
    expect((component as any).profile().headline).toBe('Principal Distributed Systems Engineer');
    expect((component as any).notification()?.type).toBe('success');
  });
});
