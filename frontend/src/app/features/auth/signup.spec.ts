import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Signup } from './signup';

/**
 * The bug: "Create account" stayed disabled after pasting. Zoneless change detection
 * was not at fault -- a pasted value carries a trailing space, and the username pattern
 * rejected it, with no error message to say so.
 *
 * The contract now: the button is only disabled while a request is in flight. An invalid
 * form submits, stops, and names the offending field.
 */
describe('Signup', () => {
  let fixture: ComponentFixture<Signup>;

  const setValue = (id: string, value: string) => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector(`#${id}`);
    input.value = value;
    input.dispatchEvent(new Event('input')); // what typing and pasting both fire
  };

  const button = (): HTMLButtonElement => fixture.nativeElement.querySelector('button[type=submit]');
  const errors = (): string[] =>
    [...fixture.nativeElement.querySelectorAll('.field-error')].map((e) => (e as HTMLElement).textContent!.trim());

  const fill = async (email: string, username: string, password: string) => {
    setValue('email', email);
    setValue('username', username);
    setValue('password', password);
    await fixture.whenStable();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Signup],
      providers: [provideHttpClient(), provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Signup);
    await fixture.whenStable();
  });

  it('never disables the button for an invalid form — it explains instead', async () => {
    expect(button().disabled).toBe(false);

    await fill('not-an-email', 'x', 'short');
    button().click();
    await fixture.whenStable();

    expect(errors().length).toBe(3);
  });

  it('shows no errors before the user has tried', async () => {
    await fill('', '', '');
    expect(errors()).toEqual([]);
  });

  it('trims values pasted with surrounding whitespace', async () => {
    await fill(' someone@example.com\n', 'valid_user1 ', 'Passw0rd!');

    button().click();
    await fixture.whenStable();

    expect(errors()).toEqual([]);
  });

  it('accepts dots and hyphens in a username', async () => {
    for (const name of ['aditya.yadav', 'aditya-yadav', 'aditya_yadav', 'aditya1']) {
      await fill('someone@example.com', name, 'Passw0rd!');
      button().click();
      await fixture.whenStable();

      expect(errors(), `"${name}" should be accepted`).toEqual([]);
    }
  });

  it('still rejects a username with a space or an @', async () => {
    for (const name of ['has spaces', 'has@at']) {
      await fill('someone@example.com', name, 'Passw0rd!');
      button().click();
      await fixture.whenStable();

      expect(errors().length, `"${name}" should be rejected`).toBe(1);
    }
  });

  it('rejects a password under 8 characters and says so', async () => {
    await fill('someone@example.com', 'valid_user1', 'short');
    button().click();
    await fixture.whenStable();

    expect(errors()).toEqual(['At least 8 characters.']);
  });
});
