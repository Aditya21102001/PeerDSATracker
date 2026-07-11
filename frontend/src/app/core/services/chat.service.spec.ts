import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthStore } from './auth.store';
import { ChatService, ChatStreamEvent } from './chat.service';
import { TokenService } from './token.service';

/**
 * The streamed reply crosses a wire the auth interceptor cannot help with, so this pins two things
 * that only reveal themselves at runtime: that the SSE frames Spring's SseEmitter produces parse
 * back into the right tokens (including newlines, which must survive the JSON encoding), and that a
 * 401 triggers exactly one refresh-and-retry, matching the interceptor's contract.
 */
describe('ChatService streaming', () => {
  const refreshOnce = vi.fn();
  const forceSignOut = vi.fn();
  let chat: ChatService;

  beforeEach(() => {
    refreshOnce.mockReset();
    forceSignOut.mockReset();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: TokenService, useValue: { accessToken: () => 'access-token' } },
        { provide: AuthStore, useValue: { refreshOnce, forceSignOut } },
      ],
    });
    chat = TestBed.inject(ChatService);
  });

  afterEach(() => vi.unstubAllGlobals());

  /** Exactly the framing Spring's SseEmitter writes: `event:<name>\n` then `data:<payload>\n\n`. */
  function sseResponse(frames: string[], status = 200): Response {
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        const encoder = new TextEncoder();
        // Split each frame into two chunks to prove the parser reassembles across reads.
        for (const frame of frames) {
          const mid = Math.floor(frame.length / 2);
          controller.enqueue(encoder.encode(frame.slice(0, mid)));
          controller.enqueue(encoder.encode(frame.slice(mid)));
        }
        controller.close();
      },
    });
    return new Response(body, { status });
  }

  async function collect(signal: AbortSignal): Promise<ChatStreamEvent[]> {
    const events: ChatStreamEvent[] = [];
    for await (const e of chat.streamReply(null, 'hi', signal)) {
      events.push(e);
    }
    return events;
  }

  it('parses tokens (newlines intact) and the done event', async () => {
    // A token with a newline is JSON-encoded to "line1\nline2" on the wire, so it stays one frame.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse([
          'event:token\ndata:"Hello"\n\n',
          'event:token\ndata:"line1\\nline2"\n\n',
          'event:done\ndata:{"conversationId":42}\n\n',
        ]),
      ),
    );

    const events = await collect(new AbortController().signal);

    expect(events).toEqual([
      { type: 'token', value: 'Hello' },
      { type: 'token', value: 'line1\nline2' },
      { type: 'done', conversationId: 42 },
    ]);
  });

  it('surfaces a server error event', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        sseResponse(['event:error\ndata:{"message":"The assistant is rate-limited right now."}\n\n']),
      ),
    );

    const events = await collect(new AbortController().signal);

    expect(events).toEqual([{ type: 'error', message: 'The assistant is rate-limited right now.' }]);
  });

  it('refreshes once on a 401 and retries, then streams', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('unauthorized', { status: 401 }))
      .mockResolvedValueOnce(sseResponse(['event:token\ndata:"ok"\n\n', 'event:done\ndata:{"conversationId":7}\n\n']));
    vi.stubGlobal('fetch', fetchMock);
    refreshOnce.mockReturnValue(of('fresh-token'));

    const events = await collect(new AbortController().signal);

    expect(refreshOnce).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toContainEqual({ type: 'token', value: 'ok' });
    expect(events).toContainEqual({ type: 'done', conversationId: 7 });
  });

  it('signs out when the refresh also fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('unauthorized', { status: 401 })));
    refreshOnce.mockReturnValue(throwError(() => new Error('refresh dead')));

    const events = await collect(new AbortController().signal);

    expect(forceSignOut).toHaveBeenCalledOnce();
    expect(events).toEqual([{ type: 'error', message: 'Your session expired. Please sign in again.' }]);
  });
});
