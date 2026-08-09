import { Component, DestroyRef, ElementRef, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ConversationView, MessageView, PeerView } from '../../core/models/api.models';
import { MessagingService } from '../../core/services/messaging.service';
import { PeerService } from '../../core/services/peer.service';

@Component({
  selector: 'app-messages-page',
  imports: [FormsModule, RouterLink],
  template: `
    <main id="main-content" tabindex="-1" class="messages" [class.reading]="active()">
      <header>
        <h1>Messages</h1>
        <nav>
          <a routerLink="/dashboard">Dashboard</a>
          <a routerLink="/peers">Peers</a>
        </nav>
      </header>

      <!-- Two panes on a laptop; on a phone the thread replaces the list, which is why the
           back button below exists and why the main element carries a "reading" class. -->
      <div class="panes">
        <section class="list" aria-label="Conversations">
          @if (loading()) {
            <p class="muted">Loading…</p>
          } @else if (!conversations().length && !startable().length) {
            <p class="empty">
              No one to message yet. Direct messages need a <strong>mutual follow</strong> — you
              follow them and they follow you back. <a routerLink="/peers">Find some peers</a>.
            </p>
          } @else {
            <ul>
              @for (c of conversations(); track c.id) {
                <li>
                  <button
                    type="button"
                    [class.on]="active()?.id === c.id"
                    [attr.aria-current]="active()?.id === c.id ? 'true' : null"
                    (click)="open(c)"
                  >
                    <span class="who">
                      <strong>{{ c.peerDisplayName || c.peerUsername }}</strong>
                      <small>&#64;{{ c.peerUsername }}</small>
                    </span>
                    @if (c.unread > 0) {
                      <span class="badge" [attr.aria-label]="c.unread + ' unread'">{{ c.unread }}</span>
                    }
                  </button>
                </li>
              }
            </ul>
          }

          <!--
            The bug this fixes: a mutual follow does not create a conversation, so somebody who
            had just followed a peer (and been followed back) opened this tab, saw "no
            conversations", and had no way to start one without knowing to go via /peers. These
            are the people you CAN message but have not yet.
          -->
          @if (startable().length) {
            <p class="sheet-title">Start a conversation</p>
            <ul class="startable">
              @for (p of startable(); track p.id) {
                <li>
                  <button type="button" (click)="startWith(p)">
                    <span class="who">
                      <strong>{{ p.displayName || p.username }}</strong>
                      <small>&#64;{{ p.username }}</small>
                    </span>
                    <span class="go" aria-hidden="true">＋</span>
                  </button>
                </li>
              }
            </ul>
          }
        </section>

        <section class="thread" aria-label="Conversation">
          @if (active(); as c) {
            <div class="thread-head">
              <!-- Only meaningful on a phone, where the thread covers the list. -->
              <button type="button" class="back" (click)="close()" aria-label="Back to conversations">
                ‹
              </button>
              <strong>{{ c.peerDisplayName || c.peerUsername }}</strong>
              <span class="live" [class.on]="live()" [attr.title]="live() ? 'Live' : 'Reconnecting…'">
                <span class="sr-only">{{ live() ? 'Live' : 'Reconnecting' }}</span>
              </span>
            </div>

            <!--
              aria-live="polite" so a screen reader announces an arriving message without
              interrupting; "assertive" on a chat would talk over the user mid-sentence.
            -->
            <ol class="bubbles" #scroller aria-live="polite" aria-relevant="additions">
              @for (m of messages(); track m.id) {
                <li [class.mine]="m.mine">
                  <span class="bubble">{{ m.body }}</span>
                  <time [attr.datetime]="m.createdAt">{{ time(m.createdAt) }}</time>
                </li>
              }
            </ol>

            @if (c.canMessage) {
              <form class="composer" (ngSubmit)="send()">
                <label class="sr-only" for="body">Message</label>
                <input
                  id="body"
                  name="body"
                  [(ngModel)]="draft"
                  maxlength="2000"
                  autocomplete="off"
                  placeholder="Write a message…"
                />
                <button type="submit" class="btn" [disabled]="!draft.trim() || sending()">Send</button>
              </form>
            } @else {
              <!-- Explained rather than silently failing the send. -->
              <p class="muted closed">
                You can only message peers who follow you back. You can still read this
                conversation.
              </p>
            }

            @if (error()) {
              <p class="error" role="alert">{{ error() }}</p>
            }
          } @else {
            <p class="empty pick">Pick a conversation to start reading.</p>
          }
        </section>
      </div>
    </main>
  `,
  styleUrl: './messages-page.scss',
})
/**
 * Peer-to-peer messages.
 *
 * <p>Two panes on a laptop, one at a time on a phone — a 375px screen cannot show a list and a
 * thread at once without making both unusable, so the thread takes over and a back button returns.
 *
 * <p>Messages arrive over the live stream, but the page never depends on it: opening a thread
 * fetches, and the service polls the unread count regardless of stream health. A permanently
 * failing stream degrades this to a slightly-late chat rather than losing messages, and the header
 * says which state it is in instead of pretending.
 */
export class MessagesPage {
  private readonly messaging = inject(MessagingService);
  private readonly peers = inject(PeerService);
  private readonly scroller = viewChild<ElementRef<HTMLElement>>('scroller');

  protected readonly conversations = signal<ConversationView[]>([]);
  protected readonly active = signal<ConversationView | null>(null);
  protected readonly messages = signal<MessageView[]>([]);
  protected readonly loading = signal(true);

  /** Everyone I follow who follows me back. */
  private readonly mutuals = signal<PeerView[]>([]);

  /**
   * Mutual follows I have no conversation with yet. A mutual follow does not create a thread, so
   * without this the tab is empty for exactly the person who has just made a friend and come
   * looking for them.
   */
  protected readonly startable = computed(() => {
    const existing = new Set(this.conversations().map((c) => c.peerId));
    return this.mutuals().filter((p) => !existing.has(p.id));
  });
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly live = this.messaging.live;

  protected draft = '';

  constructor() {
    this.reload();
    this.messaging.connect();

    // Messages that arrive while a thread is open are appended immediately; ones for another
    // thread only bump its unread count, which the list reload picks up.
    const stop = this.messaging.onMessage((m) => this.receive(m));
    inject(DestroyRef).onDestroy(() => {
      stop();
      this.messaging.disconnect();
    });

    // Follow the conversation as it grows.
    effect(() => {
      this.messages();
      queueMicrotask(() => {
        const el = this.scroller()?.nativeElement;
        if (el) {
          el.scrollTop = el.scrollHeight;
        }
      });
    });
  }

  protected open(c: ConversationView): void {
    this.active.set(c);
    this.messages.set([]);
    this.error.set(null);
    this.messaging.messages(c.id).subscribe({
      next: (m) => {
        this.messages.set(m);
        // The server marked it read when it served the thread; mirror that locally so the badge
        // clears without waiting for a reload.
        this.conversations.update((list) =>
          list.map((x) => (x.id === c.id ? { ...x, unread: 0 } : x)),
        );
      },
      error: () => this.error.set('Could not load that conversation.'),
    });
  }

  /** Opens (or finds) the thread with someone I have not messaged before. */
  protected startWith(p: PeerView): void {
    this.messaging.openWith(p.id).subscribe({
      next: (c) => {
        this.conversations.update((list) => [c, ...list.filter((x) => x.id !== c.id)]);
        this.open(c);
      },
      error: () =>
        this.error.set('You can only message peers who follow you back.'),
    });
  }

  protected close(): void {
    this.active.set(null);
    this.messages.set([]);
  }

  protected send(): void {
    const conversation = this.active();
    const body = this.draft.trim();
    if (!conversation || !body) {
      return;
    }
    this.sending.set(true);
    this.error.set(null);

    this.messaging.send(conversation.id, body).subscribe({
      next: () => {
        this.sending.set(false);
        this.draft = '';
        // The message arrives back over the stream, which is what appends it — so a send and a
        // receive take the same path and cannot render differently.
      },
      error: (err) => {
        this.sending.set(false);
        this.error.set(
          err?.status === 403
            ? 'You can only message peers who follow you back.'
            : err?.status === 429
              ? 'Slow down a moment.'
              : 'Could not send that message.',
        );
      },
    });
  }

  protected time(iso: string): string {
    return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private receive(m: MessageView): void {
    if (this.active()?.id === m.conversationId) {
      // De-duplicated by id: the sender receives their own message back on the stream, and a
      // reconnect can replay one.
      this.messages.update((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
      this.messaging.markRead(m.conversationId);
    } else {
      this.reload();
    }
  }

  private reload(): void {
    this.messaging.conversations().subscribe({
      next: (list) => {
        this.conversations.set(list);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });

    // Separate request, deliberately: an empty conversation list is the case that most needs
    // this, so it must not be gated on conversations loading first.
    this.peers.following().subscribe({
      next: (list) => this.mutuals.set(list.filter((p) => p.followsYou)),
      error: () => {},
    });
  }
}
