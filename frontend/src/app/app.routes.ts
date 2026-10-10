import { Routes } from '@angular/router';
import { environment } from '../environments/environment';
import { authGuard, guestGuard } from './core/guards/auth.guard';

// Password reset has no mailer yet. When disabled these routes are absent entirely,
// so the lazy chunks never ship and a stale bookmark falls through to the wildcard.
// The backend 404s /api/auth/forgot and /reset to match.
const resetRoutes: Routes = environment.resetEnabled
  ? [
      {
        path: 'forgot',
        canActivate: [guestGuard],
        loadComponent: () => import('./features/auth/forgot').then((m) => m.Forgot),
      },
      {
        // Deliberately not guest-only: a signed-in user following a reset link from
        // their inbox should still land on the form.
        path: 'reset',
        loadComponent: () => import('./features/auth/reset').then((m) => m.Reset),
      },
    ]
  : [];

// Every feature route is lazy-loaded via loadComponent, so the initial bundle
// carries only the shell plus whichever route the user landed on.
export const routes: Routes = [
  {
    // Public landing page: accessible immediately to guests and signed-in visitors alike.
    // Allows instant exploration without auth while the backend warms up silently in the background.
    path: '',
    pathMatch: 'full',
    title: 'PeerDSATracker — 474 Striver A2Z Sheet, AI Mock Interviews & Revision Tracker',
    loadComponent: () => import('./features/welcome/welcome-page').then((m) => m.WelcomePage),
  },
  {
    // Public how-it-works page: no guard, reachable by guests and signed-in users alike.
    path: 'guide',
    title: 'How It Works & Spaced Repetition Methodology | PeerDSATracker',
    loadComponent: () => import('./features/guide/guide-page').then((m) => m.GuidePage),
  },
  {
    path: 'dashboard',
    title: 'My Learning Dashboard & Streak | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'signin',
    title: 'Sign In | PeerDSATracker',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signin').then((m) => m.Signin),
  },
  {
    path: 'signup',
    title: 'Create Free Account — Start Grinding | PeerDSATracker',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup').then((m) => m.Signup),
  },
  {
    // Sign in with a one-time code, then set a password. Guest-only, and always routed: unlike
    // the older /forgot flow this has a working transport (Brevo's HTTP API), and in demo mode it
    // works with no mail provider at all.
    path: 'code',
    title: 'Sign In with Verification Code | PeerDSATracker',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/code-signin').then((m) => m.CodeSignin),
  },
  {
    // Where the backend lands the browser after a Google sign-in, successful or refused.
    // Deliberately NOT guest-only: this route's whole job is to establish the session, and a
    // guard that redirects a signed-in visitor would fire on the very reload that follows.
    path: 'oauth/callback',
    title: 'Authenticating with Google | PeerDSATracker',
    loadComponent: () => import('./features/auth/oauth-callback').then((m) => m.OauthCallback),
  },
  {
    // Change or set a password. Authenticated: the backend resolves the account from the session.
    path: 'security',
    title: 'Account Security & Password Settings | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/auth/security').then((m) => m.Security),
  },
  ...resetRoutes,
  {
    path: 'sheet',
    title: 'Striver A2Z 474 Problems Sheet — Syllabus Tracker | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sheet/sheet-page').then((m) => m.SheetPage),
  },
  {
    // Direct messages. Only between peers who follow each other -- the backend enforces it, and
    // this page explains it rather than letting a send fail.
    path: 'messages',
    title: 'Direct Messages & Study Circles | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/messages/messages-page').then((m) => m.MessagesPage),
  },
  {
    path: 'peers',
    title: 'Find & Follow Peers | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/peers/peers-page').then((m) => m.PeersPage),
  },
  {
    path: 'leaderboard',
    title: 'Global Peer Leaderboard & XP Rankings | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/leaderboard/leaderboard-page').then((m) => m.LeaderboardPage),
  },
  {
    path: 'notes',
    title: 'My Problem Notes & Solutions | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/notes/notes-page').then((m) => m.NotesPage),
  },
  {
    path: 'blog',
    title: 'Engineering Articles & System Design Blog | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/blog/blog-page').then((m) => m.BlogPage),
  },
  {
    // withComponentInputBinding() binds :problemId straight to the component input.
    path: 'notes/:problemId',
    title: 'Edit Problem Note | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/notes/note-editor').then((m) => m.NoteEditor),
  },
  {
    // :problemId is bound to the CodeEditor input, same as the note editor above.
    path: 'code/:problemId',
    title: 'Multi-Language Code Sandbox & Runner | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/code/code-editor').then((m) => m.CodeEditor),
  },
  {
    path: 'revision',
    title: 'Spaced-Repetition Revision Deck | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/revision/revision-page').then((m) => m.RevisionPage),
  },
  {
    path: 'profile',
    title: 'User Profile & Statistics | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  {
    // Public study guides: comprehensive notes on DSA, Java, Spring Boot, Angular. Accessible without auth.
    path: 'study-guides',
    title: 'Free DSA, Java, Spring Boot & System Design Study Guides | PeerDSATracker',
    loadComponent: () =>
      import('./features/study-guides/study-guides-page').then((m) => m.StudyGuidesPage),
  },
  {
    // guideId is bound to StudyGuideDetail input via withComponentInputBinding()
    path: 'study-guides/:guideId',
    title: 'Study Guide | PeerDSATracker',
    loadComponent: () =>
      import('./features/study-guides/study-guide-detail').then((m) => m.StudyGuideDetail),
  },
  {
    path: 'hire',
    title: 'Career Matchmaker & ATS Job Matching | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/hire/hire-page').then((m) => m.HirePage),
  },
  {
    path: 'interview',
    title: 'AI Mock Technical Interview Simulator | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/interview/interview-page').then((m) => m.InterviewPage),
  },
  {
    path: 'proctor',
    title: 'Anti-Cheat Proctored Assessment Simulator | PeerDSATracker',
    canActivate: [authGuard],
    loadComponent: () => import('./features/proctor/proctored-test-page').then((m) => m.ProctoredTestPage),
  },
  {
    // Video Hub & Playlists: search YouTube, build custom playlists, and watch embedded video with notes.
    // Accessible to both guests and signed-in users.
    path: 'videos',
    title: 'Curated DSA & Tech Interview Video Hub | PeerDSATracker',
    loadComponent: () => import('./features/videos/video-hub-page').then((m) => m.VideoHubPage),
  },
  {
    // Interactive System Architecture & Workflows (Archify): explorable SVG/HTML architecture diagrams.
    // Accessible to both guests and signed-in users.
    path: 'architecture',
    title: 'System Architecture & Engineering Diagrams | PeerDSATracker',
    loadComponent: () =>
      import('./features/architecture/architecture-page').then((m) => m.ArchitecturePage),
  },
  { path: '**', redirectTo: '' },
];
