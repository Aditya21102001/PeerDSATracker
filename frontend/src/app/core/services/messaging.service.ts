import { HttpClient } from '@angular/common/http';
import { DestroyRef, Service, computed, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { ConversationView, MessageView } from '../models/api.models';
import { TokenService } from './token.service';

/**
 * Direct messages, and the live stream that delivers them.
 *
 * <p>The stream is a `fetch` rather than an `EventSource`, for the same reason the AI assistant's
 * is: `EventSource` cannot send an `Authorization` header, and the alternative — a token in the
 * query string — writes credentials into every access log and proxy trace between here and the
 * server.
 *
 * <p>The connection is expected to die. Render's free tier drops idle connections, the server caps
 * the stream deliberately, and phones suspend tabs. So reconnection is the normal path, not an
 * error path: it backs off, and a slow unread poll runs regardless so a missed message surfaces
 * even if the stream never comes back.
 */
@Service()
export class MessagingService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);

  private readonly unreadCount = signal(0);
  private readonly connected = signal(false);

  /** Total unread across all conversations, for the badge. */
  readonly unread = this.unreadCount.asReadonly();
  /** Whether the live stream is currently up. The UI says so rather than pretending. */
  readonly live = this.connected.asReadonly();
  readonly hasUnread = computed(() => this.unreadCount() > 0);

  /** Fires for every message that arrives on the stream. */
  private readonly listeners = new Set<(m: MessageView) => void>();

  private abort: AbortController | null = null;
  private retryDelay = 1000;
  private stopped = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.disconnect());
  }

  conversations(): Observable<ConversationView[]> {
    return this.http.get<ConversationView[]>('/api/messages/conversations');
  }

  /** Finds or creates the thread with a peer. 403 unless the two follow each other. */
  openWith(peerId: number): Observable<ConversationView> {
    return this.http.post<ConversationView>('/api/messages/conversations', { peerId });
  }

  /** Loading a thread also marks it read on the server, so refresh the badge afterwards. */
  messages(conversationId: number): Observable<MessageView[]> {
    return this.http
      .get<MessageView[]>(`/api/messages/conversations/${conversationId}`)
      .pipe(tap(() => this.refreshUnread()));
  }

  send(conversationId: number, body: string): Observable<MessageView> {
    return this.http.post<MessageView>(`/api/messages/conversations/${conversationId}`, { body });
  }

  markRead(conversationId: number): void {
    this.http
      .post<void>(`/api/messages/conversations/${conversationId}/read`, {})
      .subscribe({ next: () => this.refreshUnread(), error: () => {} });
  }

  refreshUnread(): void {
    this.http.get<{ unread: number }>('/api/messages/unread').subscribe({
      next: (r) => this.unreadCount.set(r.unread),
      error: () => {},
    });
  }

  /** Subscribe to messages arriving live. Returns an unsubscribe function. */
  onMessage(handler: (m: MessageView) => void): () => void {
    this.listeners.add(handler);
    return () => this.listeners.delete(handler);
  }

  /**
   * Opens the stream and keeps it open.
   *
   * Safe to call repeatedly — a second call while a connection is live is a no-op, so a component
   * that reconnects on init cannot pile up streams.
   */
  connect(): void {
    if (this.abort) {
      return;
    }
    this.stopped = false;
    void this.run();
  }

  disconnect(): void {
    this.stopped = true;
    this.abort?.abort();
    this.abort = null;
    this.connected.set(false);
  }

  private async run(): Promise<void> {
    while (!this.stopped) {
      const controller = new AbortController();
      this.abort = controller;
      try {
        await this.readStream(controller.signal);
        // A clean end is the server's deliberate timeout, so reconnect immediately.
        this.retryDelay = 1000;
      } catch {
        // Network dropped, instance asleep, tab suspended. Back off so a server that is down is
        // not hammered, but cap it: a chat that takes five minutes to notice it is back is broken.
        this.retryDelay = Math.min(this.retryDelay * 2, 30_000);
      } finally {
        this.connected.set(false);
      }
      if (this.stopped) {
        return;
      }
      // Whether or not the stream is healthy, poll the badge — this is the safety net that makes
      // a permanently failing stream a degradation rather than silent message loss.
      this.refreshUnread();
      await new Promise((r) => setTimeout(r, this.retryDelay));
    }
  }

  private async readStream(signal: AbortSignal): Promise<void> {
    const access = this.tokens.accessToken();
    const response = await fetch('/api/messages/stream', {
      signal,
      headers: {
        Accept: 'text/event-stream',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
    });
    if (!response.ok || !response.body) {
      throw new Error(`stream failed: ${response.status}`);
    }

    this.connected.set(true);
    this.retryDelay = 1000;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        return;
      }
      buffer += decoder.decode(value, { stream: true });

      // SSE frames are separated by a blank line.
      let split: number;
      while ((split = buffer.indexOf('\n\n')) !== -1) {
        const frame = buffer.slice(0, split);
        buffer = buffer.slice(split + 2);
        this.handleFrame(frame);
      }
    }
  }

  private handleFrame(frame: string): void {
    // Comment-only frames are the keep-alive; they carry no data and must not be parsed.
    const dataLines = frame
      .split('\n')
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.slice(5).trim());
    if (!dataLines.length) {
      return;
    }
    try {
      const parsed = JSON.parse(dataLines.join('\n'));
      if (parsed && typeof parsed.body === 'string') {
        for (const listener of this.listeners) {
          listener(parsed as MessageView);
        }
        this.refreshUnread();
      }
    } catch {
      // A malformed frame is not worth tearing the stream down for.
    }
  }
}
