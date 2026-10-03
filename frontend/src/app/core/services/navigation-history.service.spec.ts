import { Location } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from './auth.store';
import { NavigationHistoryService } from './navigation-history.service';

describe('NavigationHistoryService', () => {
  let service: NavigationHistoryService;
  let routerEvents$: Subject<any>;
  const mockRouter = {
    events: undefined as any,
    navigateByUrl: vi.fn(),
  };
  const mockLocation = {
    back: vi.fn(),
  };
  const mockAuthStore = {
    isAuthenticated: vi.fn().mockReturnValue(true),
  };

  beforeEach(() => {
    routerEvents$ = new Subject<any>();
    mockRouter.events = routerEvents$.asObservable();
    mockRouter.navigateByUrl.mockReset();
    mockLocation.back.mockReset();

    TestBed.configureTestingModule({
      providers: [
        NavigationHistoryService,
        { provide: Router, useValue: mockRouter },
        { provide: Location, useValue: mockLocation },
        { provide: AuthStore, useValue: mockAuthStore },
      ],
    });

    service = TestBed.inject(NavigationHistoryService);
  });

  it('tracks sequential NavigationEnd events and derives previousUrl and label', () => {
    expect(service.previousUrl()).toBeNull();
    expect(service.previousPageLabel()).toBe('Dashboard');

    routerEvents$.next(new NavigationEnd(1, '/dashboard', '/dashboard'));
    routerEvents$.next(new NavigationEnd(2, '/videos', '/videos'));

    expect(service.previousUrl()).toBe('/dashboard');
    expect(service.previousPageLabel()).toBe('Dashboard');
  });

  it('identifies friendly names for different routes', () => {
    routerEvents$.next(new NavigationEnd(1, '/sheet', '/sheet'));
    routerEvents$.next(new NavigationEnd(2, '/code/42', '/code/42'));

    expect(service.previousUrl()).toBe('/sheet');
    expect(service.previousPageLabel()).toBe('Sheet');
  });

  it('calls location.back() when history stack has items', () => {
    routerEvents$.next(new NavigationEnd(1, '/dashboard', '/dashboard'));
    routerEvents$.next(new NavigationEnd(2, '/videos', '/videos'));

    service.back('/dashboard');
    expect(mockLocation.back).toHaveBeenCalled();
  });

  it('navigates to fallback URL when history stack is empty', () => {
    service.back('/sheet');
    expect(mockRouter.navigateByUrl).toHaveBeenCalledWith('/sheet');
  });
});
