import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { NavigationEnd, Router } from '@angular/router';
import { filter } from 'rxjs';

export interface SeoConfig {
  title?: string;
  description?: string;
  keywords?: string;
  url?: string;
  image?: string;
  type?: string;
  robots?: string;
}

const DEFAULT_ORIGIN = 'https://peer-dsa-tracker-iota.vercel.app';
const DEFAULT_TITLE = 'PeerDSATracker — 474 Striver A2Z DSA Sheet, Spaced Repetition & AI Mock Interviews';
const DEFAULT_DESCRIPTION =
  'Master 474 Striver A2Z DSA problems with automated spaced repetition revision, multi-engine code sandbox, AI mock technical interviews, and free deep study guides. Zero excuses.';
const DEFAULT_KEYWORDS =
  'PeerDSATracker, PeerDSA, Striver A2Z Sheet, DSA Sheet Tracker, LeetCode Progress Tracker, Coding Interview Prep, Spaced Repetition DSA, System Design Guide, Spring Boot Interview, Angular Signals, AI Mock Interview, Data Structures and Algorithms';
const DEFAULT_IMAGE = `${DEFAULT_ORIGIN}/og-image.png`;

/**
 * Manages SEO metadata across Angular routes, including page titles, descriptions,
 * canonical links, OpenGraph, and Twitter Card tags.
 */
@Injectable({
  providedIn: 'root',
})
export class SeoService {
  private readonly titleService = inject(Title);
  private readonly meta = inject(Meta);
  private readonly doc = inject(DOCUMENT);
  private readonly router = inject(Router);

  constructor() {
    // Automatically keep canonical link and og:url synchronized with router navigations
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event) => {
        const cleanPath = (event.urlAfterRedirects || event.url).split('?')[0].split('#')[0];
        const fullUrl = cleanPath === '/' ? DEFAULT_ORIGIN : `${DEFAULT_ORIGIN}${cleanPath}`;
        this.setCanonical(fullUrl);
        this.meta.updateTag({ property: 'og:url', content: fullUrl });
        this.meta.updateTag({ name: 'twitter:url', content: fullUrl });
      });
  }

  /**
   * Updates all relevant SEO and social meta tags in one call.
   */
  updateMeta(config: SeoConfig): void {
    const title = config.title ? `${config.title}` : DEFAULT_TITLE;
    const description = config.description || DEFAULT_DESCRIPTION;
    const keywords = config.keywords || DEFAULT_KEYWORDS;
    const image = config.image || DEFAULT_IMAGE;
    const type = config.type || 'website';
    const robots = config.robots || 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1';

    this.titleService.setTitle(title);

    // Primary tags
    this.meta.updateTag({ name: 'title', content: title });
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ name: 'keywords', content: keywords });
    this.meta.updateTag({ name: 'robots', content: robots });

    // OpenGraph
    this.meta.updateTag({ property: 'og:title', content: title });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:image', content: image });
    this.meta.updateTag({ property: 'og:type', content: type });

    // Twitter Card
    this.meta.updateTag({ name: 'twitter:title', content: title });
    this.meta.updateTag({ name: 'twitter:description', content: description });
    this.meta.updateTag({ name: 'twitter:image', content: image });

    if (config.url) {
      this.setCanonical(config.url);
      this.meta.updateTag({ property: 'og:url', content: config.url });
      this.meta.updateTag({ name: 'twitter:url', content: config.url });
    }
  }

  /**
   * Sets or updates the canonical link tag in the document <head>.
   */
  setCanonical(url: string): void {
    let link: HTMLLinkElement | null = this.doc.querySelector('link[rel="canonical"]');
    if (!link) {
      link = this.doc.createElement('link');
      link.setAttribute('rel', 'canonical');
      this.doc.head.appendChild(link);
    }
    link.setAttribute('href', url);
  }

  /**
   * Resets page metadata back to the platform defaults.
   */
  resetToDefaults(): void {
    this.updateMeta({
      title: DEFAULT_TITLE,
      description: DEFAULT_DESCRIPTION,
      keywords: DEFAULT_KEYWORDS,
      image: DEFAULT_IMAGE,
      type: 'website',
    });
  }
}
