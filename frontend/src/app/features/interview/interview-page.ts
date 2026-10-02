import { CommonModule, DatePipe } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  InterviewLevel,
  InterviewSession,
  InterviewTrack,
  InterviewTurn,
  StartInterviewRequest,
} from '../../core/models/interview.models';
import { InterviewService } from '../../core/services/interview.service';
import { Spinner } from '../../shared/spinner';

@Component({
  selector: 'app-interview-page',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, DatePipe, Spinner],
  templateUrl: './interview-page.html',
  styleUrl: './interview-page.scss',
})
export class InterviewPage implements OnInit, OnDestroy {
  private readonly interviewService = inject(InterviewService);

  // View state: 'setup' | 'live' | 'scorecard' | 'history'
  protected readonly activeView = signal<'setup' | 'live' | 'scorecard' | 'history'>('setup');

  // Setup form
  protected selectedTrack = signal<InterviewTrack>('JAVA_SPRING');
  protected selectedLevel = signal<InterviewLevel>('MID');
  protected targetRole = signal<string>('Senior Java & Spring Boot Backend Engineer');

  // Live session state
  protected readonly currentSession = signal<InterviewSession | null>(null);
  protected readonly currentTurnIndex = signal<number>(1);
  protected readonly candidateAnswer = signal<string>('');
  protected readonly isSubmitting = signal<boolean>(false);
  protected readonly isStarting = signal<boolean>(false);
  protected readonly hintVisible = signal<boolean>(false);
  protected readonly latestEvaluation = signal<{ score: number; feedback: string } | null>(null);

  // Audio / Speech
  protected readonly isListening = signal<boolean>(false);
  protected readonly isSpeaking = signal<boolean>(false);
  protected readonly voiceEnabled = signal<boolean>(true);
  private speechRecognition: any = null;

  // History state
  protected readonly historySessions = signal<InterviewSession[]>([]);
  protected readonly loadingHistory = signal<boolean>(false);

  // Tracks catalog
  protected readonly tracks = [
    {
      id: 'JAVA_SPRING' as InterviewTrack,
      title: 'Java & Spring Boot',
      desc: 'Virtual Threads, Concurrency, Spring Security, JPA/Hibernate, Microservices & Distributed Sagas',
      icon: '☕',
      badge: 'Backend Core',
      roleDefault: 'Senior Java & Spring Boot Engineer',
    },
    {
      id: 'DSA' as InterviewTrack,
      title: 'Data Structures & Algorithms',
      desc: 'Sliding Window, Binary Search, Graphs & Topological Sort, Dynamic Programming, Two Heaps',
      icon: '⚡',
      badge: 'Problem Solving',
      roleDefault: 'Software Development Engineer',
    },
    {
      id: 'SYSTEM_DESIGN' as InterviewTrack,
      title: 'System Design & Distributed Systems',
      desc: 'Distributed Rate Limiting, Caching, Consistent Hashing, Kafka Event-Driven Architecture, Global Scale',
      icon: '🏗️',
      badge: 'Architecture',
      roleDefault: 'Distributed Systems Architect',
    },
    {
      id: 'ANGULAR_FRONTEND' as InterviewTrack,
      title: 'Angular & Frontend Systems',
      desc: 'Signals Reactivity, Change Detection OnPush, State Management, Web Performance & INP, Interceptors',
      icon: '🅰️',
      badge: 'Frontend Lead',
      roleDefault: 'Senior Frontend Engineer (Angular)',
    },
    {
      id: 'BEHAVIORAL' as InterviewTrack,
      title: 'Engineering Culture & Behavioral',
      desc: 'STAR Framework, Technical Disagreements, Production Outage Post-Mortems, Prioritization & Velocity',
      icon: '🎯',
      badge: 'Leadership',
      roleDefault: 'Engineering Lead & Culture',
    },
  ];

  // Levels catalog
  protected readonly levels: { id: InterviewLevel; label: string; desc: string }[] = [
    { id: 'JUNIOR', label: 'Junior (0 - 2 yrs)', desc: 'Fundamental syntax, core concepts, clean code basics' },
    { id: 'MID', label: 'Mid-Level (2 - 5 yrs)', desc: 'Architectural trade-offs, concurrency, performance optimization' },
    { id: 'SENIOR', label: 'Senior / Lead (5+ yrs)', desc: 'High-throughput scalability, failure recovery, deep system internals' },
  ];

  // Current active turn computed from session
  protected readonly activeTurn = computed<InterviewTurn | null>(() => {
    const s = this.currentSession();
    if (!s || !s.turns || s.turns.length === 0) return null;
    return s.turns[s.turns.length - 1];
  });

  // Progress percentage (5 questions max)
  protected readonly progressPercent = computed<number>(() => {
    const turn = this.currentTurnIndex();
    return Math.min(100, Math.round(((turn - 1) / 5) * 100));
  });

  ngOnInit(): void {
    this.initSpeechRecognition();
  }

  ngOnDestroy(): void {
    this.stopSpeaking();
    if (this.speechRecognition) {
      try {
        this.speechRecognition.abort();
      } catch (e) {}
    }
  }

  // ------------------------------------------------------------- Track Selection

  protected selectTrack(trackId: InterviewTrack): void {
    this.selectedTrack.set(trackId);
    const item = this.tracks.find((t) => t.id === trackId);
    if (item) {
      this.targetRole.set(item.roleDefault);
    }
  }

  protected selectLevel(levelId: InterviewLevel): void {
    this.selectedLevel.set(levelId);
  }

  // ------------------------------------------------------------- Start Interview

  protected startInterview(): void {
    this.isStarting.set(true);
    const req: StartInterviewRequest = {
      track: this.selectedTrack(),
      targetRole: this.targetRole(),
      level: this.selectedLevel(),
    };

    this.interviewService.startInterview(req).subscribe({
      next: (session) => {
        this.isStarting.set(false);
        this.currentSession.set(session);
        this.currentTurnIndex.set(1);
        this.candidateAnswer.set('');
        this.latestEvaluation.set(null);
        this.hintVisible.set(false);
        this.activeView.set('live');

        if (this.voiceEnabled() && session.turns.length > 0) {
          this.speakText(session.turns[0].question);
        }
      },
      error: () => {
        this.isStarting.set(false);
      },
    });
  }

  // ------------------------------------------------------------- Submit Answer

  protected submitAnswer(): void {
    const s = this.currentSession();
    const ans = this.candidateAnswer().trim();
    if (!s || !ans || this.isSubmitting()) return;

    this.isSubmitting.set(true);
    this.stopSpeaking();

    this.interviewService.submitAnswer(s.id, ans).subscribe({
      next: (evalResult) => {
        this.isSubmitting.set(false);
        this.latestEvaluation.set({
          score: evalResult.score,
          feedback: evalResult.aiEvaluation,
        });

        // Update local session
        this.interviewService.getInterview(s.id).subscribe((updated) => {
          this.currentSession.set(updated);

          if (evalResult.isFinished) {
            // Interview is complete -> show scorecard
            this.activeView.set('scorecard');
            if (this.voiceEnabled()) {
              this.speakText(`Interview complete. Your overall evaluation score is ${updated.overallScore} out of 100.`);
            }
          } else {
            // Advance to next question
            this.currentTurnIndex.set(evalResult.turnIndex + 1);
            this.candidateAnswer.set('');
            this.hintVisible.set(false);
            if (this.voiceEnabled() && evalResult.nextQuestion) {
              this.speakText(evalResult.nextQuestion);
            }
          }
        });
      },
      error: () => {
        this.isSubmitting.set(false);
      },
    });
  }

  // ------------------------------------------------------------- Speech & Voice

  private initSpeechRecognition(): void {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      this.speechRecognition = new SpeechRecognition();
      this.speechRecognition.continuous = true;
      this.speechRecognition.interimResults = true;
      this.speechRecognition.lang = 'en-US';

      this.speechRecognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript.trim()) {
          const current = this.candidateAnswer();
          this.candidateAnswer.set(current ? `${current} ${transcript}` : transcript);
        }
      };

      this.speechRecognition.onerror = () => {
        this.isListening.set(false);
      };

      this.speechRecognition.onend = () => {
        this.isListening.set(false);
      };
    }
  }

  protected toggleVoiceInput(): void {
    if (!this.speechRecognition) {
      alert('Speech recognition is not supported in this browser. Please type your answer.');
      return;
    }

    if (this.isListening()) {
      this.speechRecognition.stop();
      this.isListening.set(false);
    } else {
      this.stopSpeaking();
      this.speechRecognition.start();
      this.isListening.set(true);
    }
  }

  protected speakText(text: string): void {
    if (!('speechSynthesis' in window)) return;
    this.stopSpeaking();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    // Pick an English voice if available
    const voices = window.speechSynthesis.getVoices();
    const englishVoice = voices.find((v) => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (englishVoice) {
      utterance.voice = englishVoice;
    }

    utterance.onstart = () => this.isSpeaking.set(true);
    utterance.onend = () => this.isSpeaking.set(false);
    utterance.onerror = () => this.isSpeaking.set(false);

    window.speechSynthesis.speak(utterance);
  }

  protected toggleAutoVoice(): void {
    this.voiceEnabled.set(!this.voiceEnabled());
    if (!this.voiceEnabled()) {
      this.stopSpeaking();
    }
  }

  protected stopSpeaking(): void {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      this.isSpeaking.set(false);
    }
  }

  protected speakCurrentQuestion(): void {
    const turn = this.activeTurn();
    if (turn) {
      this.speakText(turn.question);
    }
  }

  // ------------------------------------------------------------- Hints & Navigation

  protected toggleHint(): void {
    this.hintVisible.set(!this.hintVisible());
  }

  protected restart(): void {
    this.stopSpeaking();
    this.currentSession.set(null);
    this.candidateAnswer.set('');
    this.latestEvaluation.set(null);
    this.activeView.set('setup');
  }

  protected openHistory(): void {
    this.stopSpeaking();
    this.activeView.set('history');
    this.loadingHistory.set(true);
    this.interviewService.listInterviews().subscribe({
      next: (list) => {
        this.historySessions.set(list);
        this.loadingHistory.set(false);
      },
      error: () => this.loadingHistory.set(false),
    });
  }

  protected viewSessionScorecard(s: InterviewSession): void {
    this.currentSession.set(s);
    this.activeView.set('scorecard');
  }

  protected getScoreBadgeClass(score: number): string {
    if (score >= 85) return 'score-excellent';
    if (score >= 70) return 'score-good';
    return 'score-needs-work';
  }
}
