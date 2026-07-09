import { booleanAttribute, Component, input } from '@angular/core';

/**
 * The one loading indicator for the whole app.
 *
 * `role="status"` + `aria-live="polite"` announce the wait to a screen reader once,
 * without stealing focus. The ring is decorative; the label carries the meaning, so it
 * must never be duplicated by a sibling paragraph.
 */
@Component({
  selector: 'app-spinner',
  template: `
    <div class="wrap" role="status" aria-live="polite" [class.inline]="inline()">
      <span class="ring" [style.--size.px]="size()" aria-hidden="true"></span>
      <span class="label">{{ label() }}</span>
    </div>
  `,
  styles: `
    .wrap {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: var(--sp-3);
      padding: var(--sp-6) 0;
      color: var(--text-muted);
    }

    .wrap.inline {
      flex-direction: row;
      justify-content: flex-start;
      padding: 0;
      gap: var(--sp-2);
    }

    .ring {
      flex: none;
      width: var(--size, 28px);
      height: var(--size, 28px);
      border-radius: 50%;
      /* A track plus one bright arc: the arc is what reads as spinning. */
      border: 2px solid var(--surface-2);
      border-top-color: var(--accent);
      border-right-color: var(--accent);
      animation: spin 700ms linear infinite;
    }

    .label {
      font-size: var(--fs-sm);
    }

    @keyframes spin {
      to {
        transform: rotate(1turn);
      }
    }

    /* The global reduced-motion rule freezes animations, which would leave a static
       arc that reads as broken. Show a calm full ring instead. */
    @media (prefers-reduced-motion: reduce) {
      .ring {
        animation: none;
        border-color: var(--accent);
        opacity: 0.55;
      }
    }
  `,
})
export class Spinner {
  /** Announced to assistive tech and shown next to the ring. */
  readonly label = input('Loading…');
  readonly size = input(28);

  /**
   * Sits beside text (e.g. in a panel) rather than centred in the page.
   * booleanAttribute so `<app-spinner inline />` works — a bare attribute is the
   * empty string, which is not a boolean.
   */
  readonly inline = input(false, { transform: booleanAttribute });
}
