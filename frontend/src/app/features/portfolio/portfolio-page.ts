import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { NavigationHistoryService } from '../../core/services/navigation-history.service';

interface Project {
  title: string;
  subtitle: string;
  description: string;
  tags: string[];
  githubUrl: string;
  liveUrl?: string;
  highlights: string[];
  metrics: string;
  isFlagship?: boolean;
}

interface Experience {
  role: string;
  company: string;
  period: string;
  location: string;
  badge: string;
  points: string[];
  techStack: string[];
}

interface Certification {
  name: string;
  issuer: string;
  badgeColor: string;
  verified: boolean;
}

@Component({
  selector: 'app-portfolio-page',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './portfolio-page.html',
  styleUrl: './portfolio-page.scss',
})
export class PortfolioPage {
  constructor(protected readonly nav: NavigationHistoryService) {}

  protected readonly activeFilter = signal<'ALL' | 'FULL_STACK' | 'GEN_AI' | 'SYSTEMS'>('ALL');
  protected readonly copiedContact = signal<string | null>(null);

  protected readonly developerInfo = {
    name: 'Aditya Yadav',
    headline: 'Software Developer | Full-Stack (Angular, Spring Boot) & Generative AI',
    subHeadline: 'Lead Architect & Owner of PeerDSATracker',
    location: 'Gorakhpur, Uttar Pradesh, India',
    email: 'adityakumaryadav21102001@gmail.com',
    phone: '+91 9217665318',
    linkedIn: 'https://linkedin.com/in/aditya-yadav-9b4a48192',
    github: 'https://github.com/Aditya21102001',
    summary:
      'Full-Stack Software Developer with 3 years of experience building enterprise web applications on modern Angular (v22, zoneless and signals-based), TypeScript, Java, and Spring Boot. Delivered Generative AI features on Azure OpenAI serving 10,000+ concurrent users, and adaptive HLS video streaming that runs inside a 512 MB container.',
    degree: 'B.Tech in Information Technology (CGPA: 8.32 / 10)',
    college: 'Madan Mohan Malaviya University of Technology (MMMUT), Gorakhpur',
    graduationYear: '2019 – 2023',
  };

  protected readonly skillCategories = [
    {
      category: 'Frontend Engineering',
      icon: '🎨',
      skills: [
        'Angular 22 (Zoneless, Signals)',
        'TypeScript',
        'JavaScript (ES2024)',
        'AngularJS',
        'HTML5 & Modern CSS3 / SCSS',
        'Responsive UI & Glassmorphism',
        'RxJS State & Observables',
        'Microfrontends',
      ],
    },
    {
      category: 'Backend & Distributed Systems',
      icon: '⚙️',
      skills: [
        'Java (17 / 21 / 25)',
        'Spring Boot 3 / 4',
        'REST APIs & Microservices',
        'FFmpeg & Adaptive HLS Streaming',
        'Spring Security & OAuth 2.0 / JWT',
        'Apache Kafka',
        'Redis Caching & Streams',
        'Spring Data JPA & Hibernate',
      ],
    },
    {
      category: 'Generative AI & LLMs',
      icon: '🤖',
      skills: [
        'Azure OpenAI Service',
        'LLM Orchestration & Prompting',
        'RAG (Retrieval-Augmented Gen)',
        'LangChain',
        'Vector Search (pgvector)',
        'Sentence-Transformers Embeddings',
        'FastAPI Python Microservices',
        'Groq, Gemini & OpenAI Models',
      ],
    },
    {
      category: 'Databases, Cloud & Security',
      icon: '🛡️',
      skills: [
        'PostgreSQL & pgvector',
        'MySQL',
        'Microsoft Azure & AWS',
        'Docker & Multi-Stage Builds',
        'CI/CD Pipelines & Git',
        'MFA (PIN + OTP Authentication)',
        'AES-128 Encryption & RSA-OAEP',
        'OWASP Security Hardening',
      ],
    },
  ];

  protected readonly experiences: Experience[] = [
    {
      role: 'Software Developer',
      company: 'Tata Consultancy Services (TCS)',
      period: 'Aug 2023 – Present',
      location: 'India',
      badge: 'Current Role · Full-Time',
      points: [
        'Engineered the complete UI of the Annual General Meeting (VIRTUAL MEETING) product in Angular 22 with Spring Boot REST APIs, enabling multi-level filtering and answering of questions from 10,000+ concurrent shareholders.',
        'Integrated Generative AI features on Azure OpenAI: contextual draft answers auto-generated during VIRTUAL MEETING question capture, accelerating L1 response workflows, plus AI-generated Agenda Summary and Agenda Comparison for faster meeting preparation.',
        'Led adoption of a zoneless, signals-based Angular architecture across 3 flagship products (VIRTUAL MEETING, BoardApp, IEPF), removing Zone.js overhead for finer-grained change detection and faster runtime performance.',
        'Developed BoardApp’s board-recording video module end to end: an FFmpeg/Spring Boot pipeline transcoding uploads into an adaptive-bitrate HLS ladder indexed in PostgreSQL for instant seeking, with a custom Angular 22 player (quality/speed control, seek previews, WebVTT captions, cross-route Picture-in-Picture).',
        'Secured BoardApp recordings with AES-128 encrypted HLS segments, content keys wrapped via RSA-OAEP/ECDH (P-256), and short-lived signed playback tickets; stream-copied source-resolution renditions to eliminate generation loss.',
        'Designed and deployed a PIN + OTP Multi-Factor Authentication (MFA) system for BoardApp, securing 10,000+ enterprise accounts against credential-based attacks.',
        'Migrated 5+ enterprise applications to Angular 22, including the IEPF investor-claims portal (Companies Act 2013) and legacy AngularJS applications with zero downtime.',
        'Resolved 100+ security vulnerabilities across the project tower, substantially shrinking the attack surface.',
      ],
      techStack: [
        'Angular 22',
        'Spring Boot',
        'Azure OpenAI',
        'FFmpeg',
        'HLS Streaming',
        'AES-128',
        'PostgreSQL',
        'Signals',
        'MFA',
      ],
    },
    {
      role: 'Software Development Intern',
      company: 'Sunrise Mentors Pvt. Ltd. (Coding Ninjas)',
      period: 'Mar 2023 – Jun 2023',
      location: 'India',
      badge: 'Internship',
      points: [
        'Developed high-traffic Help & Support and Referral modules in Django and Angular, serving 100,000+ active users.',
        'Drove a 25% increase in user engagement through faster issue resolution and automated referral workflows.',
        'Implemented optimized database queries and modular clientside state management.',
      ],
      techStack: ['Django', 'Python', 'Angular', 'REST APIs', 'MySQL'],
    },
  ];

  protected readonly projects: Project[] = [
    {
      title: 'PeerDSATracker',
      subtitle: 'Spaced Repetition DSA Syllabus, AI Mock Interviews & Realtime Career Gateway',
      description:
        'A comprehensive platform for mastering Data Structures and Algorithms with Striver 474 A2Z Sheet, spaced-repetition revision ladder (1–90 days), AI-driven mock interviews, proctored code evaluations, and authentic live job matching.',
      tags: ['Angular 22', 'Spring Boot 4', 'PostgreSQL', 'OpenRouter AI', 'Docker', 'WebSockets', 'Brevo'],
      githubUrl: 'https://github.com/Aditya21102001/PeerDSATracker',
      liveUrl: 'https://peer-dsa-tracker-iota.vercel.app',
      highlights: [
        '474 Striver A2Z problems with automated spaced repetition scheduling (1 to 90 days interval ladder).',
        'Interactive code execution studio supporting Java, C++, Python, and JavaScript with instant feedback.',
        'AI Mock Interview engine with proctoring, face tracking, and OpenCV gesture-based navigation.',
        'Real-time job matching and bulk 1-click ATS application module connecting directly to live Arbeitnow & Remotive APIs.',
      ],
      metrics: '474 Problems · Single-Flight JWT Auth · 100% Type-Safe Full-Stack',
      isFlagship: true,
    },
    {
      title: 'VIRTUAL MEETING Sentinel',
      subtitle: 'Real-Time Q&A Intelligence, Semantic Clustering & Low-Memory HLS Video Platform',
      description:
        'A polyglot microservices platform that clusters, ranks, and drafts cited answers for thousands of simultaneous live audience questions in real time using LangChain and pgvector.',
      tags: ['Angular', 'Spring Boot', 'Python/FastAPI', 'LangChain', 'pgvector', 'Redis Streams', 'FFmpeg', 'Docker'],
      githubUrl: 'https://github.com/Aditya21102001/Virtual-Meeting-Sentinel',
      liveUrl: 'https://virtual-meeting-sentinel.vercel.app/ask',
      highlights: [
        'Semantic deduplication with sentence-transformers embeddings and pgvector online clustering, collapsing 60–70% duplicate audience questions.',
        'Ranked clusters streamed to live moderator board over WebSocket backed by Redis Streams for backpressure handling.',
        'LLM-agnostic RAG pipeline (LangChain) auto-drafting cited answers, swappable across Groq, Gemini, and Azure OpenAI.',
        'Adaptive-bitrate HLS video library with streaming segment persistence keeping hour-long FFmpeg transcodes inside a 512 MB container.',
      ],
      metrics: '60-70% Q&A Deduplication · Runs inside 512 MB RAM Container · Multi-LLM RAG',
      isFlagship: true,
    },
  ];

  protected readonly competitiveStats = [
    {
      title: 'LeetCode Knight',
      rating: 'Max Rating 1857',
      solved: '400+ Problems Solved',
      platform: 'LeetCode',
      icon: '⚔️',
      color: '#f59e0b',
    },
    {
      title: 'Codeforces Specialist',
      rating: 'Max Rating 1432',
      solved: '500+ Problems Solved',
      platform: 'Codeforces',
      icon: '🏆',
      color: '#06b6d4',
    },
    {
      title: 'TCS CodeVita Season 10',
      rating: 'Global Rank 229',
      solved: 'Top 0.3% out of 100,000+ Participants Worldwide',
      platform: 'Global Contest',
      icon: '🥇',
      color: '#10b981',
    },
    {
      title: 'TCS Excellence Awards',
      rating: 'Contextual Master & Special Initiative',
      solved: 'Multiple Star of the Quarter Recognition Awards',
      platform: 'Corporate Honors',
      icon: '⭐',
      color: '#8b5cf6',
    },
  ];

  protected readonly certifications: Certification[] = [
    {
      name: 'Microsoft Certified: Azure AI Engineer Associate',
      issuer: 'Microsoft',
      badgeColor: '#0078d4',
      verified: true,
    },
    {
      name: 'Microsoft Certified: Azure AI Fundamentals (AI-900)',
      issuer: 'Microsoft',
      badgeColor: '#0078d4',
      verified: true,
    },
    {
      name: 'AWS Certified Cloud Practitioner',
      issuer: 'Amazon Web Services',
      badgeColor: '#ff9900',
      verified: true,
    },
    {
      name: 'Getting Started with Competitive Programming',
      issuer: 'NPTEL (National Programme on Technology Enhanced Learning)',
      badgeColor: '#10b981',
      verified: true,
    },
    {
      name: 'MTA: Introduction to Programming Using Python',
      issuer: 'Microsoft Technology Associate',
      badgeColor: '#6366f1',
      verified: true,
    },
  ];

  protected copyContact(type: string, value: string): void {
    navigator.clipboard.writeText(value).then(() => {
      this.copiedContact.set(type);
      setTimeout(() => {
        if (this.copiedContact() === type) {
          this.copiedContact.set(null);
        }
      }, 2000);
    });
  }
}
