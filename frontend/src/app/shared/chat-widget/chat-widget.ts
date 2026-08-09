import { Component, computed, effect, inject, signal, viewChild, ElementRef } from '@angular/core';
import { ChatConversation, ChatMessage } from '../../core/models/api.models';
import { ChatService } from '../../core/services/chat.service';
import { Spinner } from '../spinner';

/**
 * A floating assistant available on every page. The bubble opens a non-modal panel with a thread,
 * a streamed reply, and a history of past conversations. Replies arrive token-by-token from
 * {@link ChatService.streamReply}; the panel is client state only — the server owns the history.
 */
@Component({
  selector: 'app-chat-widget',
  imports: [Spinner],
  template: `
    <button
      #launcher
      type="button"
      class="fab"
      [attr.aria-expanded]="open()"
      [attr.aria-label]="open() ? 'Close the study assistant' : 'Open the study assistant'"
      (click)="toggle()"
    >
      @if (open()) {
        <span aria-hidden="true">✕</span>
      } @else {
        <span aria-hidden="true">💬</span>
      }
    </button>

    @if (open()) {
      <section class="panel" role="dialog" aria-label="Study assistant">
        <header>
          <div class="who">
            <strong>Grind Buddy</strong>
            <small>Your DSA study help</small>
          </div>
          <div class="tools">
            <button type="button" (click)="toggleHistory()" [class.on]="historyOpen()" aria-label="Conversation history">
              <span aria-hidden="true">🕑</span>
            </button>
            <button type="button" (click)="newChat()" aria-label="New conversation">
              <span aria-hidden="true">＋</span>
            </button>
            <button type="button" (click)="close()" aria-label="Close assistant">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </header>

        @if (historyOpen()) {
          <div class="history">
            @if (listLoading()) {
              <app-spinner inline label="Loading chats…" />
            } @else {
              <ul>
                @for (c of conversations(); track c.id) {
                  <li [class.active]="c.id === activeId()">
                    <button type="button" class="pick" (click)="openConversation(c.id)">{{ c.title }}</button>
                    <button
                      type="button"
                      class="del"
                      (click)="remove(c)"
                      [attr.aria-label]="'Delete ' + c.title"
                    >
                      <span aria-hidden="true">🗑</span>
                    </button>
                  </li>
                } @empty {
                  <li class="empty">No conversations yet.</li>
                }
              </ul>
            }
          </div>
        }

        <div class="thread" #thread>
          @if (threadLoading()) {
            <app-spinner label="Loading conversation…" />
          } @else {
            @for (m of messages(); track m.id) {
              <div class="msg" [class.user]="m.role === 'user'" [class.bot]="m.role === 'assistant'">
                <div class="bubble">{{ m.content }}</div>
              </div>
            } @empty {
              @if (!streaming()) {
                <div class="hello">
                  <p>Hi! Ask me about a problem, an algorithm, or Big-O.</p>
                  <p class="faint">I give hints first — say “just show me” for a full solution.</p>
                </div>
              }
            }

            @if (streaming(); as s) {
              <div class="msg bot">
                <div class="bubble">{{ s }}<span class="cursor" aria-hidden="true"></span></div>
              </div>
            } @else if (sending()) {
              <div class="msg bot">
                <div class="bubble thinking"><app-spinner inline label="Thinking…" /></div>
              </div>
            }
          }

          @if (error(); as e) {
            <p class="error" role="alert">{{ e }}</p>
          }
        </div>

        <form class="composer" (submit)="submit($event)">
          <label class="sr-only" for="chat-input">Message the assistant</label>
          <textarea
            id="chat-input"
            #composer
            rows="1"
            placeholder="Ask anything…"
            [value]="draft()"
            (input)="onInput($event)"
            (keydown)="onKeydown($event)"
            [disabled]="sending()"
          ></textarea>
          @if (sending()) {
            <button type="button" class="stop" (click)="stop()" aria-label="Stop generating">■</button>
          } @else {
            <button type="submit" class="send" [disabled]="!draft().trim()" aria-label="Send">➤</button>
          }
        </form>
      </section>
    }
  `,
  styleUrl: './chat-widget.scss',
  host: {
    // Escape closes the panel from anywhere inside it. Without this the only way out is to find
    // and click the ✕, which for a keyboard user means tabbing through the whole conversation.
    '(keydown.escape)': 'onEscape($event)',
  },
})
export class ChatWidget {
  private readonly chat = inject(ChatService);
  private readonly threadEl = viewChild<ElementRef<HTMLElement>>('thread');
  private readonly composerEl = viewChild<ElementRef<HTMLTextAreaElement>>('composer');
  private readonly launcherEl = viewChild<ElementRef<HTMLButtonElement>>('launcher');

  protected readonly open = signal(false);
  protected readonly historyOpen = signal(false);
  protected readonly conversations = signal<ChatConversation[]>([]);
  protected readonly activeId = signal<number | null>(null);
  protected readonly messages = signal<ChatMessage[]>([]);
  protected readonly streaming = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly listLoading = signal(false);
  protected readonly threadLoading = signal(false);
  protected readonly draft = signal('');

  /** Client-side ids for optimistic messages, kept negative so they never collide with server ids. */
  private tempId = -1;
  private abort: AbortController | null = null;

  constructor() {
    // Follow the conversation as it grows, whether from history load or streamed tokens.
    effect(() => {
      this.messages();
      this.streaming();
      this.scrollToBottom();
    });
  }

  protected toggle(): void {
    this.open.update((v) => !v);
    if (this.open()) {
      if (!this.conversations().length) {
        this.loadConversations();
      }
      // Move focus into the panel. A dialog that opens without taking focus is invisible to a
      // screen reader user -- nothing is announced, and their next Tab continues from wherever
      // they were on the page behind it.
      this.focusComposer();
    }
  }

  protected close(): void {
    const wasOpen = this.open();
    this.open.set(false);
    this.historyOpen.set(false);
    if (wasOpen) {
      // Focus goes back where it came from. Otherwise closing the panel destroys the focused
      // element and the browser drops focus to <body>, restarting the tab order at the top.
      this.launcherEl()?.nativeElement.focus();
    }
  }

  /** Escape closes, and only when there is something open to close. */
  protected onEscape(event: Event): void {
    if (!this.open()) {
      return;
    }
    // Close the history drawer first, so one Escape does not discard both layers at once.
    if (this.historyOpen()) {
      this.historyOpen.set(false);
    } else {
      this.close();
    }
    event.stopPropagation();
  }

  private focusComposer(): void {
    // After the panel has actually rendered; the textarea does not exist until then.
    queueMicrotask(() => this.composerEl()?.nativeElement.focus());
  }

  protected toggleHistory(): void {
    this.historyOpen.update((v) => !v);
    if (this.historyOpen()) {
      this.loadConversations();
    }
  }

  protected newChat(): void {
    this.stop();
    this.activeId.set(null);
    this.messages.set([]);
    this.streaming.set('');
    this.error.set(null);
    this.historyOpen.set(false);
  }

  protected openConversation(id: number): void {
    if (id === this.activeId() && this.messages().length) {
      this.historyOpen.set(false);
      return;
    }
    this.stop();
    this.threadLoading.set(true);
    this.error.set(null);
    this.historyOpen.set(false);
    this.activeId.set(id);
    this.chat.conversation(id).subscribe({
      next: (detail) => {
        this.messages.set(detail.messages);
        this.threadLoading.set(false);
      },
      error: () => {
        this.error.set('Could not load that conversation.');
        this.threadLoading.set(false);
      },
    });
  }

  protected remove(conversation: ChatConversation): void {
    this.chat.deleteConversation(conversation.id).subscribe({
      next: () => {
        this.conversations.update((list) => list.filter((c) => c.id !== conversation.id));
        if (this.activeId() === conversation.id) {
          this.newChat();
        }
      },
      error: () => this.error.set('Could not delete that conversation.'),
    });
  }

  protected onInput(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    this.draft.set(el.value);
    this.autoGrow(el);
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Enter sends; Shift+Enter is a newline.
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.submit(event);
    }
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const content = this.draft().trim();
    if (!content || this.sending()) {
      return;
    }

    this.draft.set('');
    this.error.set(null);
    this.pushMessage('user', content);
    this.streaming.set('');
    this.sending.set(true);

    void this.run(content);
  }

  protected stop(): void {
    this.abort?.abort();
    this.abort = null;
    this.finishStreaming();
  }

  private async run(content: string): Promise<void> {
    this.abort = new AbortController();
    try {
      for await (const event of this.chat.streamReply(this.activeId(), content, this.abort.signal)) {
        if (event.type === 'token') {
          this.streaming.update((s) => s + event.value);
        } else if (event.type === 'done') {
          const wasNew = this.activeId() === null;
          this.activeId.set(event.conversationId);
          this.finishStreaming();
          // A new thread needs its server title; an existing one just moved to the top.
          if (wasNew || this.historyOpen()) {
            this.loadConversations();
          }
        } else {
          this.finishStreaming();
          this.error.set(event.message);
        }
      }
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) {
        this.error.set('The connection to the assistant dropped.');
      }
      this.finishStreaming();
    } finally {
      this.abort = null;
      this.sending.set(false);
    }
  }

  /** Commits whatever text has streamed so far as an assistant message. */
  private finishStreaming(): void {
    const text = this.streaming();
    if (text.trim()) {
      this.pushMessage('assistant', text);
    }
    this.streaming.set('');
    this.sending.set(false);
  }

  private pushMessage(role: 'user' | 'assistant', content: string): void {
    const msg: ChatMessage = { id: this.tempId--, role, content, createdAt: new Date().toISOString() };
    this.messages.update((list) => [...list, msg]);
  }

  private loadConversations(): void {
    this.listLoading.set(true);
    this.chat.conversations().subscribe({
      next: (list) => {
        this.conversations.set(list);
        this.listLoading.set(false);
      },
      error: () => this.listLoading.set(false),
    });
  }

  private autoGrow(el: HTMLTextAreaElement): void {
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }

  private scrollToBottom(): void {
    const el = this.threadEl()?.nativeElement;
    if (el) {
      queueMicrotask(() => (el.scrollTop = el.scrollHeight));
    }
  }
}
