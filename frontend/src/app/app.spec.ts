import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('creates the shell', () => {
    expect(TestBed.createComponent(App).componentInstance).toBeTruthy();
  });

  it('renders a router outlet for the feature routes', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    // The shell holds nothing but the outlet; every page is lazy-loaded into it.
    expect(fixture.nativeElement.querySelector('router-outlet')).toBeTruthy();
  });
});
