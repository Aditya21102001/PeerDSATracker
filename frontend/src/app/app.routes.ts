import { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards/auth.guard';

// Every feature route is lazy-loaded via loadComponent, so the initial bundle
// carries only the shell plus whichever route the user landed on.
export const routes: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'signin',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signin').then((m) => m.Signin),
  },
  {
    path: 'signup',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/signup').then((m) => m.Signup),
  },
  {
    path: 'forgot',
    canActivate: [guestGuard],
    loadComponent: () => import('./features/auth/forgot').then((m) => m.Forgot),
  },
  {
    // Deliberately not guest-only: a signed-in user following a reset link from their
    // inbox should still land on the form.
    path: 'reset',
    loadComponent: () => import('./features/auth/reset').then((m) => m.Reset),
  },
  {
    path: 'sheet',
    canActivate: [authGuard],
    loadComponent: () => import('./features/sheet/sheet-page').then((m) => m.SheetPage),
  },
  {
    path: 'peers',
    canActivate: [authGuard],
    loadComponent: () => import('./features/peers/peers-page').then((m) => m.PeersPage),
  },
  {
    path: 'leaderboard',
    canActivate: [authGuard],
    loadComponent: () => import('./features/leaderboard/leaderboard-page').then((m) => m.LeaderboardPage),
  },
  {
    path: 'notes',
    canActivate: [authGuard],
    loadComponent: () => import('./features/notes/notes-page').then((m) => m.NotesPage),
  },
  {
    // withComponentInputBinding() binds :problemId straight to the component input.
    path: 'notes/:problemId',
    canActivate: [authGuard],
    loadComponent: () => import('./features/notes/note-editor').then((m) => m.NoteEditor),
  },
  {
    path: 'revision',
    canActivate: [authGuard],
    loadComponent: () => import('./features/revision/revision-page').then((m) => m.RevisionPage),
  },
  {
    path: 'profile',
    canActivate: [authGuard],
    loadComponent: () => import('./features/profile/profile-page').then((m) => m.ProfilePage),
  },
  { path: '**', redirectTo: 'dashboard' },
];
