import { HttpClient } from '@angular/common/http';
import { Service, inject } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';
import { ChatConversation, ChatConversationDetail } from '../models/api.models';
import { AuthStore } from './auth.store';
import { TokenService } from './token.service';

/** One event from the streamed reply. */
export type ChatStreamEvent =
  | { type: 'token'; value: string }
  | { type: 'done'; conversationId: number }
  | { type: 'error'; message: string };

/**
 * The AI assistant.
 *
 * CRUD goes through HttpClient, so the auth interceptor attaches the token and refreshes on 401.
 * The streamed reply cannot: it is Server-Sent Events, and `EventSource` cannot send an
 * Authorization header. So {@link streamReply} uses `fetch`, attaches the bearer itself, and
 * replays the interceptor's one-shot refresh-and-retry on a 401.
 */
@Service()
export class ChatService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenService);
  private readonly auth = inject(AuthStore);

  conversations(): Observable<ChatConversation[]> {
    return this.http.get<ChatConversation[]>('/api/chat/conversations');
  }

  conversation(id: number): Observable<ChatConversationDetail> {
    return this.http.get<ChatConversationDetail>(`/api/chat/conversations/${id}`);
  }

  deleteConversation(id: number): Observable<void> {
    return this.http.delete<void>(`/api/chat/conversations/${id}`);
  }

  /**
   * Streams the assistant's reply. `conversationId` is null to start a new thread; the `done`
   * event carries the id the server assigned. Pass an AbortSignal to cancel (e.g. the user closes
   * the widget or hits stop).
   */
  async *streamReply(
    conversationId: number | null,
    content: string,
    signal: AbortSignal,
  ): AsyncGenerator<ChatStreamEvent> {
    const body = JSON.stringify({ conversationId, content });

    let response = await this.send(body, signal);
    if (response.status === 401) {
      // Mirror the interceptor: one shared refresh, then retry once. A dead refresh signs out.
      const refreshed = await this.refresh();
      if (!refreshed) {
        yield { type: 'error', message: 'Your session expired. Please sign in again.' };
        return;
      }
      response = await this.send(body, signal);
    }

    if (!response.ok || !response.body) {
      yield { type: 'error', message: await this.errorMessage(response) };
      return;
    }

    yield* this.parse(response.body, signal);
  }

  private send(body: string, signal: AbortSignal): Promise<Response> {
    const access = this.tokens.accessToken();
    return fetch('/api/chat/stream', {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        ...(access ? { Authorization: `Bearer ${access}` } : {}),
      },
      body,
    });
  }

  private async refresh(): Promise<boolean> {
    try {
      await firstValueFrom(this.auth.refreshOnce());
      return true;
    } catch {
      this.auth.forceSignOut();
      return false;
    }
  }

  /** Reads the SSE body, decoding `event:`/`data:` frames into typed events. */
  private async *parse(stream: ReadableStream<Uint8Array>, signal: AbortSignal): AsyncGenerator<ChatStreamEvent> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (!signal.aborted) {
        const { value, done } = await reader.read();
        if (done) {
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        // Events are separated by a blank line. Keep the trailing partial in the buffer.
        let boundary: number;
        while ((boundary = buffer.indexOf('\n\n')) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const event = this.decodeFrame(frame);
          if (event) {
            yield event;
          }
        }
      }
    } finally {
      reader.cancel().catch(() => {});
    }
  }

  private decodeFrame(frame: string): ChatStreamEvent | null {
    let name = 'message';
    const dataLines: string[] = [];
    for (const raw of frame.split('\n')) {
      const line = raw.trimEnd();
      if (line.startsWith('event:')) {
        name = line.slice(6).trim();
      } else if (line.startsWith('data:')) {
        // A single leading space after the colon is part of SSE framing, not the data.
        dataLines.push(line.slice(5).replace(/^ /, ''));
      }
    }
    if (!dataLines.length) {
      return null;
    }
    const data = dataLines.join('\n');
    try {
      if (name === 'token') {
        return { type: 'token', value: JSON.parse(data) as string };
      }
      if (name === 'done') {
        return { type: 'done', conversationId: (JSON.parse(data) as { conversationId: number }).conversationId };
      }
      if (name === 'error') {
        return { type: 'error', message: (JSON.parse(data) as { message: string }).message };
      }
    } catch {
      return null;
    }
    return null;
  }

  private async errorMessage(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { message?: string };
      if (body?.message) {
        return body.message;
      }
    } catch {
      // non-JSON body
    }
    return response.status === 503
      ? 'The assistant is unavailable right now. Try again shortly.'
      : 'Something went wrong reaching the assistant.';
  }
}
