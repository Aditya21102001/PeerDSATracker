import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  ApplyAllResult,
  CandidateProfile,
  ExtractedProfile,
  JobApplication,
  JobOpening,
  SaveCandidateProfileRequest,
} from '../../core/models/hire.models';
import { HireService } from '../../core/services/hire.service';

const SAMPLE_JAVA_RESUME = `Aditya Yadav
Senior Java Full Stack Engineer
Bengaluru, India | 4.5 Years Experience

PROFESSIONAL SUMMARY:
Experienced Java and Spring Boot Engineer with 4.5+ years building distributed backend microservices, high-throughput REST APIs, and responsive web portals with Angular and TypeScript. Strong background in DSA, Kafka, and PostgreSQL.

TECHNICAL SKILLS:
Java, Spring Boot, Microservices, Spring Security, Hibernate, JPA, Angular, TypeScript, PostgreSQL, Redis, Kafka, Docker, Kubernetes, AWS, REST APIs, Git, DSA, System Design

EXPERIENCE:
Senior Software Engineer - Infosys (2022 - Present)
- Architected payment processing microservices using Spring Boot and Kafka handling 15K req/min.
- Optimized database query execution and caching with Redis, reducing latency by 40%.
- Developed modular Angular management portal.

Software Engineer - TCS (2020 - 2022)
- Implemented secure RESTful web services in Java and Spring MVC.
- Created unit tests with JUnit 5 and Mockito.

EDUCATION:
B.Tech in Computer Science and Engineering

CERTIFICATIONS:
AWS Certified Developer Associate, Oracle Certified Java SE 11
Current CTC: ₹14 LPA | Expected CTC: ₹26 LPA | Notice Period: 30 days | Preferred: Bengaluru, Remote, Pune`;

const SAMPLE_DSA_RESUME = `Rohan Sharma
Backend & Algorithms Engineer
Pune, India | 3.5 Years Experience

PROFESSIONAL SUMMARY:
Backend engineer with expertise in Data Structures, Algorithms, low-latency system design, and distributed caching. Solved 500+ LeetCode problems.

TECHNICAL SKILLS:
DSA, System Design, Java, Spring Boot, C++, Python, Redis, PostgreSQL, MySQL, Docker, Kafka, Git, Linux, REST APIs

EXPERIENCE:
Software Engineer - Swiggy (2021 - Present)
- Designed real-time driver allocation and routing engine with Redis geospatial indexing.
- Improved order dispatch throughput by 25%.

EDUCATION:
B.E. in Computer Engineering

CERTIFICATIONS:
Certified Kubernetes Administrator (CKA)
Current CTC: ₹16 LPA | Expected CTC: ₹30 LPA | Notice Period: 15 days | Preferred: Bengaluru, Pune, Remote`;

const SAMPLE_ANGULAR_RESUME = `Neha Verma
Lead Frontend & Full Stack Developer
Hyderabad, India | 5 Years Experience

PROFESSIONAL SUMMARY:
Frontend specialist with 5 years experience crafting scalable web applications with Angular, TypeScript, RxJS, Node.js, and modern CSS.

TECHNICAL SKILLS:
Angular, TypeScript, JavaScript, RxJS, HTML5, CSS3, SCSS, Node.js, REST APIs, Git, Docker, AWS, SQL

EXPERIENCE:
Lead Frontend Developer - Capgemini (2021 - Present)
- Built enterprise portals in Angular 17+ with standalone components and signals.
- Reduced initial bundle load by 35% using lazy loading and tree-shaking.

EDUCATION:
Master of Computer Applications (MCA)

CERTIFICATIONS:
AWS Certified Cloud Practitioner
Current CTC: ₹13 LPA | Expected CTC: ₹24 LPA | Notice Period: 45 days | Preferred: Hyderabad, Bengaluru, Remote`;


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

  // Resume extraction signals & states
  protected readonly resumeInputMode = signal<'file' | 'paste'>('file');
  protected readonly resumeRawText = signal<string>('');
  protected readonly uploadedFileName = signal<string>('');
  protected readonly extractingResume = signal<boolean>(false);
  protected readonly isDraggingResume = signal<boolean>(false);
  protected readonly extractedReviewPending = signal<boolean>(false);
  protected readonly extractionSuccess = signal<boolean>(false);

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

  // Resume extraction methods & handlers
  protected setResumeMode(mode: 'file' | 'paste'): void {
    this.resumeInputMode.set(mode);
  }

  protected onFileSelect(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      this.processResumeFile(input.files[0]);
    }
  }

  protected onDragOver(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingResume.set(true);
  }

  protected onDragLeave(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingResume.set(false);
  }

  protected onDrop(event: DragEvent): void {
    event.preventDefault();
    event.stopPropagation();
    this.isDraggingResume.set(false);
    if (event.dataTransfer?.files && event.dataTransfer.files.length > 0) {
      this.processResumeFile(event.dataTransfer.files[0]);
    }
  }

  protected processResumeFile(file: File): void {
    this.uploadedFileName.set(file.name);
    const reader = new FileReader();

    if (file.name.endsWith('.txt') || file.name.endsWith('.md') || file.type.startsWith('text/')) {
      reader.onload = () => {
        const text = (reader.result as string) || '';
        this.resumeRawText.set(text);
        this.showToast(`Loaded "${file.name}" (${file.size} bytes). Ready to extract profile!`, 'info');
      };
      reader.readAsText(file);
    } else {
      // Binary (PDF / Word / Docx): Extract readable text strings
      reader.onload = () => {
        const buffer = reader.result as ArrayBuffer;
        const bytes = new Uint8Array(buffer);
        let extractedAscii = '';
        let currentWord = '';
        for (let i = 0; i < bytes.length; i++) {
          const charCode = bytes[i];
          if ((charCode >= 32 && charCode <= 126) || charCode === 10 || charCode === 13 || charCode === 9) {
            currentWord += String.fromCharCode(charCode);
          } else {
            if (currentWord.length > 2) {
              extractedAscii += currentWord + ' ';
            }
            currentWord = '';
          }
        }
        if (currentWord.length > 2) extractedAscii += currentWord;

        const cleanText = extractedAscii.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s{3,}/g, ' \n');
        if (cleanText.trim().length > 30) {
          this.resumeRawText.set(cleanText);
          this.showToast(`Extracted readable text from "${file.name}". Ready to analyze!`, 'info');
        } else {
          this.showToast(`Selected "${file.name}". For highest accuracy, you can also paste text directly.`, 'info');
        }
      };
      reader.readAsArrayBuffer(file);
    }
  }

  protected loadSampleResume(type: 'java' | 'dsa' | 'angular'): void {
    if (type === 'java') {
      this.resumeRawText.set(SAMPLE_JAVA_RESUME);
      this.uploadedFileName.set('Aditya_Java_FullStack_Resume.txt');
    } else if (type === 'dsa') {
      this.resumeRawText.set(SAMPLE_DSA_RESUME);
      this.uploadedFileName.set('Rohan_DSA_Backend_Resume.txt');
    } else {
      this.resumeRawText.set(SAMPLE_ANGULAR_RESUME);
      this.uploadedFileName.set('Neha_Angular_Frontend_Resume.txt');
    }
    this.resumeInputMode.set('paste');
    this.showToast(`Loaded sample ${type.toUpperCase()} resume! Click "Extract Profile with AI".`, 'info');
  }

  // AI Profile Extraction from Resume
  protected extractProfileFromResume(): void {
    const text = this.resumeRawText().trim();
    if (!text && !this.uploadedFileName()) {
      this.showToast('Please upload a resume file or paste your resume text first.', 'error');
      return;
    }

    this.extractingResume.set(true);
    this.hire.extractResume(text).subscribe({
      next: (extracted: ExtractedProfile) => {
        this.extractingResume.set(false);
        this.extractedReviewPending.set(true);
        this.extractionSuccess.set(true);

        // Populate the profile form with extracted data for user review and editing
        this.profileForm = {
          headline: extracted.headline || this.profileForm.headline || '',
          yearsOfExperience: Math.max(0, Math.min(50, extracted.yearsOfExperience ?? this.profileForm.yearsOfExperience ?? 0)),
          currentCompany: extracted.currentCompany || this.profileForm.currentCompany || '',
          currentRole: extracted.currentRole || this.profileForm.currentRole || '',
          currentCtc: extracted.currentCtc || this.profileForm.currentCtc || '',
          expectedCtc: extracted.expectedCtc || this.profileForm.expectedCtc || '',
          noticePeriodDays: Math.max(0, Math.min(180, extracted.noticePeriodDays ?? this.profileForm.noticePeriodDays ?? 30)),
          preferredLocations: extracted.preferredLocations || this.profileForm.preferredLocations || '',
          resumeUrl: this.profileForm.resumeUrl || '',
          resumeSummary: extracted.resumeSummary || this.profileForm.resumeSummary || '',
          skills: extracted.skills || this.profileForm.skills || '',
          certifications: extracted.certifications || this.profileForm.certifications || '',
          education: extracted.education || this.profileForm.education || '',
        };

        this.showToast('Profile extracted! Please review and edit the fields below, then click Save.', 'success');

        // Smooth scroll to the form for review and editing
        setTimeout(() => {
          const formEl = document.getElementById('profile-edit-section');
          if (formEl) {
            formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 150);
      },
      error: () => {
        this.extractingResume.set(false);
        this.showToast('Could not extract resume. Check format or try pasting text.', 'error');
      },
    });
  }

  protected dismissReviewBanner(): void {
    this.extractedReviewPending.set(false);
  }

  protected cancelReviewAndReset(): void {
    this.extractedReviewPending.set(false);
    if (this.profile()) {
      this.initForm(this.profile()!);
    }
    this.showToast('Restored previous saved profile state.', 'info');
  }

  // Save Candidate Profile with sanitization to prevent Jackson numeric 400 Bad Request
  protected saveProfile(): void {
    this.savingProfile.set(true);

    const sanitizedPayload: SaveCandidateProfileRequest = {
      headline: (this.profileForm.headline || '').trim(),
      yearsOfExperience: Math.max(0, Math.min(50, Number(this.profileForm.yearsOfExperience) || 0)),
      currentCompany: (this.profileForm.currentCompany || '').trim(),
      currentRole: (this.profileForm.currentRole || '').trim(),
      currentCtc: (this.profileForm.currentCtc || '').trim(),
      expectedCtc: (this.profileForm.expectedCtc || '').trim(),
      noticePeriodDays: Math.max(0, Math.min(180, Number(this.profileForm.noticePeriodDays) || 30)),
      preferredLocations: (this.profileForm.preferredLocations || '').trim(),
      resumeUrl: (this.profileForm.resumeUrl || '').trim(),
      resumeSummary: (this.profileForm.resumeSummary || '').trim(),
      skills: (this.profileForm.skills || '').trim(),
      certifications: (this.profileForm.certifications || '').trim(),
      education: (this.profileForm.education || '').trim(),
    };

    this.hire.saveProfile(sanitizedPayload).subscribe({
      next: (p) => {
        this.savingProfile.set(false);
        this.profile.set(p);
        this.extractedReviewPending.set(false);
        this.showToast('Profile successfully saved! Realtime job match scores recalculated.', 'success');
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
