import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApplyAllResult,
  CandidateProfile,
  JobApplication,
  JobOpening,
  SaveCandidateProfileRequest,
} from '../../core/models/hire.models';
import { HireService } from '../../core/services/hire.service';

@Component({
  selector: 'app-hire-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe],
  templateUrl: './hire-page.html',
  styleUrl: './hire-page.scss',
})
export class HirePage implements OnInit {
  private readonly hire = inject(HireService);

  // Active view tab
  protected readonly activeTab = signal<'jobs' | 'profile' | 'applications'>('jobs');

  // Core data signals
  protected readonly profile = signal<CandidateProfile | null>(null);
  protected readonly jobs = signal<JobOpening[]>([]);
  protected readonly applications = signal<JobApplication[]>([]);

  // UI state signals
  protected readonly loading = signal<boolean>(true);
  protected readonly applyingAll = signal<boolean>(false);
  protected readonly applyingJobId = signal<number | null>(null);
  protected readonly savingProfile = signal<boolean>(false);
  protected readonly notification = signal<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  protected readonly selectedJobModal = signal<JobOpening | null>(null);

  // Filters
  protected readonly searchQuery = signal<string>('');
  protected readonly selectedLocation = signal<string>('ALL');
  protected readonly selectedWorkplace = signal<string>('ALL');
  protected readonly minScoreFilter = signal<number>(0);

  // Editable Profile Draft Form
  protected profileForm: SaveCandidateProfileRequest = {
    headline: '',
    yearsOfExperience: 0,
    currentCompany: '',
    currentRole: '',
    currentCtc: '',
    expectedCtc: '',
    noticePeriodDays: 30,
    preferredLocations: '',
    resumeUrl: '',
    resumeSummary: '',
    skills: '',
    certifications: '',
    education: '',
  };

  protected newSkillInput = '';

  // Quick popular skills to add with 1 click
  protected readonly popularSkills = [
    'Java',
    'Spring Boot',
    'Angular',
    'DSA',
    'System Design',
    'Microservices',
    'PostgreSQL',
    'Redis',
    'Kafka',
    'Docker',
    'AWS',
    'TypeScript',
    'SQL',
    'C++',
    'REST APIs',
  ];

  // Locations for filter pills
  protected readonly locationOptions = ['ALL', 'Remote', 'Bengaluru', 'Pune', 'Hyderabad', 'Gurugram', 'Mumbai'];

  // Count of eligible matching jobs (matchScore >= 70% and not yet applied)
  protected readonly eligibleMatchingJobs = computed(() => {
    return this.jobs().filter((j) => !j.isApplied && j.matchScore >= 70);
  });

  // Filtered jobs list based on user search & filters
  protected readonly filteredJobs = computed(() => {
    const q = this.searchQuery().toLowerCase().trim();
    const loc = this.selectedLocation();
    const wp = this.selectedWorkplace();
    const minScore = this.minScoreFilter();

    return this.jobs().filter((job) => {
      // Search query filter (title, company, skills)
      if (q) {
        const matchesQuery =
          job.title.toLowerCase().includes(q) ||
          job.company.toLowerCase().includes(q) ||
          job.requiredSkills.toLowerCase().includes(q) ||
          job.location.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      // Location filter
      if (loc !== 'ALL') {
        const matchesLoc =
          loc === 'Remote'
            ? job.workplaceType === 'REMOTE' || job.location.toLowerCase().includes('remote')
            : job.location.toLowerCase().includes(loc.toLowerCase());
        if (!matchesLoc) return false;
      }

      // Workplace type filter
      if (wp !== 'ALL' && job.workplaceType !== wp) {
        return false;
      }

      // Match score filter
      if (minScore > 0 && job.matchScore < minScore) {
        return false;
      }

      return true;
    });
  });

  // Application Pipeline stats
  protected readonly applicationStats = computed(() => {
    const apps = this.applications();
    return {
      total: apps.length,
      underReview: apps.filter((a) => a.status === 'UNDER_REVIEW').length,
      shortlisted: apps.filter((a) => a.status === 'SHORTLISTED').length,
      interview: apps.filter((a) => a.status === 'INTERVIEW').length,
      offered: apps.filter((a) => a.status === 'OFFERED').length,
    };
  });

  ngOnInit(): void {
    this.loadAll();
  }

  protected loadAll(): void {
    this.loading.set(true);
    this.hire.getProfile().subscribe({
      next: (p) => {
        this.profile.set(p);
        this.initForm(p);
      },
      error: () => this.showToast('Could not load profile', 'error'),
    });

    this.hire.listJobs().subscribe({
      next: (jobs) => {
        this.jobs.set(jobs);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.showToast('Could not load jobs', 'error');
      },
    });

    this.hire.listApplications().subscribe({
      next: (apps) => this.applications.set(apps),
    });
  }

  private initForm(p: CandidateProfile): void {
    this.profileForm = {
      headline: p.headline || '',
      yearsOfExperience: p.yearsOfExperience || 0,
      currentCompany: p.currentCompany || '',
      currentRole: p.currentRole || '',
      currentCtc: p.currentCtc || '',
      expectedCtc: p.expectedCtc || '',
      noticePeriodDays: p.noticePeriodDays || 30,
      preferredLocations: p.preferredLocations || '',
      resumeUrl: p.resumeUrl || '',
      resumeSummary: p.resumeSummary || '',
      skills: p.skills || '',
      certifications: p.certifications || '',
      education: p.education || '',
    };
  }

  protected setTab(tab: 'jobs' | 'profile' | 'applications'): void {
    this.activeTab.set(tab);
    if (tab === 'jobs' && this.jobs().length === 0) {
      this.loadAll();
    }
  }

  // 1-Click Apply to a single job
  protected applyToJob(job: JobOpening): void {
    if (job.isApplied) return;
    this.applyingJobId.set(job.id);

    this.hire.apply(job.id).subscribe({
      next: (app) => {
        this.applyingJobId.set(null);
        // Mark job as applied in state
        this.jobs.update((list) =>
          list.map((j) => (j.id === job.id ? { ...j, isApplied: true, applicationStatus: 'APPLIED', appliedAt: app.appliedAt } : j))
        );
        this.applications.update((list) => [app, ...list]);
        this.showToast(`Successfully applied to ${job.company} (${job.title})!`, 'success');
      },
      error: () => {
        this.applyingJobId.set(null);
        this.showToast(`Failed to apply to ${job.company}. Try again.`, 'error');
      },
    });
  }

  // Naukri-style 1-Click "Apply to All Matching"
  protected applyToAllMatching(): void {
    const eligible = this.eligibleMatchingJobs();
    if (eligible.length === 0) {
      this.showToast('No unapplied jobs meet the 70% match threshold. Try adding more skills to your profile!', 'info');
      return;
    }

    this.applyingAll.set(true);
    this.hire.applyAll(70).subscribe({
      next: (res: ApplyAllResult) => {
        this.applyingAll.set(false);
        this.showToast(res.message, 'success');

        // Refresh jobs and application list
        this.hire.listJobs().subscribe((jobs) => this.jobs.set(jobs));
        this.hire.listApplications().subscribe((apps) => this.applications.set(apps));
      },
      error: () => {
        this.applyingAll.set(false);
        this.showToast('Error executing bulk application. Please try again.', 'error');
      },
    });
  }

  // Save Candidate Profile
  protected saveProfile(): void {
    this.savingProfile.set(true);
    this.hire.saveProfile(this.profileForm).subscribe({
      next: (p) => {
        this.savingProfile.set(false);
        this.profile.set(p);
        this.showToast('Profile updated! Job match scores recalculated.', 'success');
        // Refresh jobs to reflect updated match scores
        this.hire.listJobs().subscribe((jobs) => this.jobs.set(jobs));
      },
      error: () => {
        this.savingProfile.set(false);
        this.showToast('Could not save profile. Check fields.', 'error');
      },
    });
  }

  // Skill tag management helpers
  protected get parsedSkills(): string[] {
    if (!this.profileForm.skills) return [];
    return this.profileForm.skills
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
  }

  protected addSkill(skillName: string): void {
    const clean = skillName.trim();
    if (!clean) return;
    const current = this.parsedSkills;
    if (current.some((s) => s.toLowerCase() === clean.toLowerCase())) return;
    current.push(clean);
    this.profileForm.skills = current.join(', ');
    this.newSkillInput = '';
  }

  protected removeSkill(index: number): void {
    const current = this.parsedSkills;
    current.splice(index, 1);
    this.profileForm.skills = current.join(', ');
  }

  protected onSkillKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      this.addSkill(this.newSkillInput);
    }
  }

  // Job Modal details
  protected openJobModal(job: JobOpening): void {
    this.selectedJobModal.set(job);
  }

  protected closeJobModal(): void {
    this.selectedJobModal.set(null);
  }

  // Toast feedback
  protected showToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
    this.notification.set({ message, type });
    setTimeout(() => {
      if (this.notification()?.message === message) {
        this.notification.set(null);
      }
    }, 4500);
  }

  protected getMatchScoreClass(score: number): string {
    if (score >= 90) return 'match-top';
    if (score >= 75) return 'match-high';
    if (score >= 60) return 'match-mid';
    return 'match-low';
  }

  protected getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'OFFERED':
        return 'status-offered';
      case 'INTERVIEW':
        return 'status-interview';
      case 'SHORTLISTED':
        return 'status-shortlisted';
      case 'UNDER_REVIEW':
        return 'status-review';
      case 'REJECTED':
        return 'status-rejected';
      default:
        return 'status-applied';
    }
  }
}
