import '@angular/compiler';
import { DOCUMENT } from '@angular/common';
import { TestBed } from '@angular/core/testing';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SeoService } from './seo.service';

describe('SeoService', () => {
  let service: SeoService;
  let routerEvents$: Subject<any>;
  let titleService: Title;
  let metaService: Meta;
  let mockDoc: Document;

  const mockRouter = {
    events: undefined as any,
  };

  beforeEach(() => {
    routerEvents$ = new Subject<any>();
    mockRouter.events = routerEvents$.asObservable();

    mockDoc = document.implementation.createHTMLDocument();

    TestBed.configureTestingModule({
      providers: [
        SeoService,
        Title,
        Meta,
        { provide: Router, useValue: mockRouter },
        { provide: DOCUMENT, useValue: mockDoc },
      ],
    });

    titleService = TestBed.inject(Title);
    metaService = TestBed.inject(Meta);
    service = TestBed.inject(SeoService);
  });

  it('updates title, meta tags, and canonical link on updateMeta', () => {
    service.updateMeta({
      title: 'Custom Title | PeerDSATracker',
      description: 'Custom description for SEO',
      url: 'https://peer-dsa-tracker-iota.vercel.app/study-guides/dsa',
    });

    expect(titleService.getTitle()).toBe('Custom Title | PeerDSATracker');
    expect(metaService.getTag('name="description"')?.content).toBe('Custom description for SEO');
    expect(metaService.getTag('property="og:title"')?.content).toBe('Custom Title | PeerDSATracker');
    expect(metaService.getTag('property="og:url"')?.content).toBe('https://peer-dsa-tracker-iota.vercel.app/study-guides/dsa');

    const canonical = mockDoc.querySelector('link[rel="canonical"]');
    expect(canonical).not.toBeNull();
    expect(canonical?.getAttribute('href')).toBe('https://peer-dsa-tracker-iota.vercel.app/study-guides/dsa');
  });

  it('automatically syncs canonical link on router NavigationEnd', () => {
    routerEvents$.next(new NavigationEnd(1, '/study-guides', '/study-guides'));

    const canonical = mockDoc.querySelector('link[rel="canonical"]');
    expect(canonical?.getAttribute('href')).toBe('https://peer-dsa-tracker-iota.vercel.app/study-guides');
    expect(metaService.getTag('property="og:url"')?.content).toBe('https://peer-dsa-tracker-iota.vercel.app/study-guides');
  });

  it('resets to platform defaults', () => {
    service.updateMeta({ title: 'Temporary Title', description: 'Temporary Desc' });
    service.resetToDefaults();

    expect(titleService.getTitle()).toContain('PeerDSATracker — 474 Striver A2Z DSA Sheet');
    expect(metaService.getTag('name="description"')?.content).toContain('Master 474 Striver A2Z DSA problems');
  });
});
