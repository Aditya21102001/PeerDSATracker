import { Injectable, computed, signal } from '@angular/core';
import {
  QuizAttempt,
  QuizFeedback,
  QuizQuestion,
  TopicQuizPrompt,
} from '../models/topic-quiz.models';

const QUIZ_HISTORY_KEY = 'peerdsa_topic_quiz_history_v1';

export const TOPIC_QUIZ_BANK: QuizQuestion[] = [
  // --- Java Concurrency & Threads ---
  {
    id: 'java-threads-1',
    topic: 'Java',
    subtopic: 'Concurrency',
    icon: '☕',
    question: 'What happens if a Java thread invokes object.wait() without holding the monitor lock for that object?',
    options: [
      'The thread sleeps indefinitely until notified',
      'An IllegalMonitorStateException is thrown at runtime',
      'The JVM automatically acquires the lock on the thread’s behalf',
      'The thread yields CPU execution to other runnable threads',
    ],
    correctIndex: 1,
    explanation:
      'In Java, wait(), notify(), and notifyAll() require the calling thread to own the monitor lock (usually via a synchronized block). Calling them without ownership immediately throws IllegalMonitorStateException.',
    takeawayNote:
      'Invariant: Always enclose wait() and notify() inside synchronized(obj) blocks to own the monitor, and loop over condition checks (while (!ready) wait()).',
    difficulty: 'MEDIUM',
  },
  {
    id: 'java-volatile-1',
    topic: 'Java',
    subtopic: 'Memory Model',
    icon: '☕',
    question: 'How does the "volatile" keyword in Java affect multi-threaded variable access?',
    options: [
      'It makes compound operations like count++ fully atomic',
      'It ensures writes are immediately visible to other threads and prevents instruction reordering',
      'It places the variable exclusively into thread-local CPU register caches',
      'It blocks other threads from reading the variable until released',
    ],
    correctIndex: 1,
    explanation:
      'The volatile modifier establishes a happens-before relationship: all writes are flushed directly to main memory and subsequent reads see the latest write. It prevents reordering via memory barriers, but does NOT provide mutual exclusion or atomic read-modify-write.',
    takeawayNote:
      'Rule: volatile guarantees visibility and ordering, NOT atomicity. Use AtomicInteger or synchronized for compound operations.',
    difficulty: 'MEDIUM',
  },

  // --- Spring Boot & Microservices ---
  {
    id: 'spring-boot-1',
    topic: 'Spring Boot',
    subtopic: 'Transactions',
    icon: '🍃',
    question: 'By default, which exception types trigger an automatic transaction rollback in a method annotated with @Transactional?',
    options: [
      'All exceptions including checked and unchecked (java.lang.Exception)',
      'Only unchecked exceptions (subclasses of RuntimeException and Error)',
      'Only SQLException and DataAccessException',
      'Transactions only roll back if explicitly caught and re-thrown',
    ],
    correctIndex: 1,
    explanation:
      'By default in Spring, transactions only roll back on unchecked exceptions (RuntimeException and Error). Checked exceptions (subclasses of Exception) do not trigger rollback unless explicitly configured with @Transactional(rollbackFor = Exception.class).',
    takeawayNote:
      'Spring Best Practice: Use @Transactional(rollbackFor = Exception.class) if you want checked business exceptions to trigger transaction rollback.',
    difficulty: 'MEDIUM',
  },
  {
    id: 'spring-boot-2',
    topic: 'Spring Boot',
    subtopic: 'Bean Scopes',
    icon: '🍃',
    question: 'What is the fundamental difference between Singleton and Prototype bean scopes in the Spring Framework?',
    options: [
      'Singleton creates one instance per JVM thread; Prototype creates one per HTTP request',
      'Singleton creates one shared instance per ApplicationContext; Prototype creates a new instance on every lookup or injection',
      'Prototype beans are destroyed automatically by Spring container; Singleton beans are garbage collected immediately',
      'Singleton beans cannot have dependencies injected; Prototype beans can',
    ],
    correctIndex: 1,
    explanation:
      'In Spring, Singleton scope (the default) instantiates exactly one shared bean instance per IoC ApplicationContext. Prototype scope creates a brand new instance every time the bean is requested or injected.',
    takeawayNote:
      'Architectural rule: Singleton is default and stateless. Prototype beans are stateful, but Spring does not call @PreDestroy on prototype beans.',
    difficulty: 'EASY',
  },

  // --- Data Structures & Algorithms ---
  {
    id: 'dsa-kadane-1',
    topic: 'DSA',
    subtopic: 'Arrays & Kadane',
    icon: '⚡',
    question: 'In Kadane’s algorithm for Maximum Subarray, when do we reset or restart the running currentSum?',
    options: [
      'Whenever the current element is smaller than the previous element',
      'Whenever the accumulated running sum drops below zero (currentSum < 0)',
      'Whenever we encounter a duplicate element in the array',
      'After checking exactly N/2 elements',
    ],
    correctIndex: 1,
    explanation:
      'If the running sum becomes negative (currentSum < 0), carrying it forward would only decrease the sum of any subsequent subarray. Thus, we reset currentSum to 0 (or start fresh with nums[i]).',
    takeawayNote:
      'Kadane’s Invariant: currentSum = max(nums[i], currentSum + nums[i]); maxSoFar = max(maxSoFar, currentSum). Time O(N), Space O(1).',
    difficulty: 'EASY',
  },
  {
    id: 'dsa-graphs-1',
    topic: 'DSA',
    subtopic: 'Graphs & DAGs',
    icon: '⚡',
    question: 'What is the optimal time complexity to find the single-source shortest paths on a Directed Acyclic Graph (DAG) with arbitrary weights?',
    options: [
      'O(V^3) using Floyd-Warshall',
      'O(E log V) using Dijkstra’s algorithm with a PriorityQueue',
      'O(V + E) using Topological Sort followed by edge relaxation in topological order',
      'O(V * E) using Bellman-Ford algorithm',
    ],
    correctIndex: 2,
    explanation:
      'Because the graph is a DAG (no cycles), we can compute a Topological Sort in O(V + E) and relax edges in that exact order. This guarantees optimal shortest paths in linear O(V + E) time, even with negative edge weights!',
    takeawayNote:
      'Algorithm Insight: DAG shortest path can be solved in linear O(V + E) time via Topological Sort + relaxation, outperforming Dijkstra and Bellman-Ford.',
    difficulty: 'HARD',
  },
  {
    id: 'dsa-dp-1',
    topic: 'DSA',
    subtopic: 'Dynamic Programming',
    icon: '⚡',
    question: 'What distinguishes Dynamic Programming from standard Divide and Conquer (e.g. Merge Sort)?',
    options: [
      'Dynamic Programming only works on trees; Divide and Conquer works on arrays',
      'Dynamic Programming requires overlapping subproblems and optimal substructure, caching sub-solutions',
      'Divide and Conquer stores intermediate answers in a memoization table',
      'Dynamic Programming is always recursive, whereas Divide and Conquer is purely iterative',
    ],
    correctIndex: 1,
    explanation:
      'Dynamic Programming applies when the problem exhibits: (1) Optimal Substructure, and (2) Overlapping Subproblems. By memoizing or tabulating subproblem answers, it avoids the exponential re-computation inherent in naive divide-and-conquer.',
    takeawayNote:
      'DP Check: Does subproblem(i) get called repeatedly? If yes, store it (memoization/tabulation) to transform O(2^N) into O(N).',
    difficulty: 'MEDIUM',
  },

  // --- System Design & Architecture ---
  {
    id: 'sysdesign-cap-1',
    topic: 'System Design',
    subtopic: 'Distributed Systems',
    icon: '🏛️',
    question: 'Under Eric Brewer’s CAP Theorem, if a network partition (P) occurs between distributed nodes, what trade-off must be made?',
    options: [
      'Sacrifice both Consistency and Availability until the network heals',
      'Choose either Consistency (refuse/delay requests to avoid stale data) OR Availability (return responses even if stale)',
      'Add more replicas to eliminate the partition instantly',
      'Switch from TCP to UDP to maintain Consistency and Availability simultaneously',
    ],
    correctIndex: 1,
    explanation:
      'In a distributed system, network partitions (P) are inevitable. When a partition occurs, the system must choose between returning an error/waiting for consensus (CP: Consistency over Availability) or returning stale data (AP: Availability over Consistency).',
    takeawayNote:
      'System Design Invariant: You cannot "opt out" of network partitions. In CP systems (e.g. Zookeeper, HBase), writes block without quorum. In AP systems (e.g. Cassandra, DynamoDB), eventual consistency is accepted.',
    difficulty: 'MEDIUM',
  },
  {
    id: 'sysdesign-cache-1',
    topic: 'System Design',
    subtopic: 'Caching Strategies',
    icon: '🏛️',
    question: 'In the Write-Behind (Write-Back) caching pattern, how does the application interact with the cache and database?',
    options: [
      'The application writes to both cache and database synchronously in a single transaction',
      'The application writes directly to the cache, which asynchronously batches writes to the database',
      'The application writes only to the database, and the cache invalidates its keys',
      'The application reads from the database and warms the cache on every read',
    ],
    correctIndex: 1,
    explanation:
      'In Write-Behind (Write-Back), the application writes to the cache, which acknowledges immediately. The cache then asynchronously writes/persists changes to the underlying database in batches. It provides blazing write throughput, at the risk of data loss if the cache node crashes before flushing.',
    takeawayNote:
      'Trade-off: Write-Behind gives highest write speed & batching efficiency, but introduces risk of data loss on cache node failure.',
    difficulty: 'MEDIUM',
  },

  // --- Kafka & Message Queues ---
  {
    id: 'kafka-partitions-1',
    topic: 'Spring Boot',
    subtopic: 'Kafka',
    icon: '📬',
    question: 'In Apache Kafka, what determines the maximum concurrency (parallel active consumers) within a single Consumer Group for a given topic?',
    options: [
      'The number of brokers in the Kafka cluster',
      'The number of partitions in the subscribed topic',
      'The number of CPU cores on the consumer machine',
      'There is no limit; any number of consumers in a group can read the same partition simultaneously',
    ],
    correctIndex: 1,
    explanation:
      'Each partition in a topic can only be consumed by at most one consumer instance within a specific Consumer Group at any given time. If you have 6 partitions, at most 6 consumer threads in that group can read in parallel; any additional consumer will sit idle.',
    takeawayNote:
      'Kafka Sizing Rule: Max concurrency per consumer group = Topic Partition Count. To scale consumer throughput, increase partitions.',
    difficulty: 'MEDIUM',
  },

  // --- Database & SQL Performance ---
  {
    id: 'database-indexing-1',
    topic: 'Database & SQL',
    subtopic: 'Indexing',
    icon: '🗄️',
    question: 'Given a composite B-Tree index on (last_name, first_name), which SQL query can fully utilize the index for searching?',
    options: [
      'SELECT * FROM users WHERE first_name = "Alex";',
      'SELECT * FROM users WHERE last_name = "Smith";',
      'SELECT * FROM users WHERE first_name LIKE "%Smith";',
      'SELECT * FROM users WHERE LENGTH(last_name) = 5;',
    ],
    correctIndex: 1,
    explanation:
      'Composite B-Tree indexes follow the Leftmost Prefix Rule. Queries filtering by the leading column (last_name) or both (last_name, first_name) can traverse the index tree. Searching only by second column (first_name) cannot use the composite index because entries are sorted primarily by last_name.',
    takeawayNote:
      'Index Invariant: Composite index (A, B) only accelerates queries filtering on A, or A + B. It does not index B alone.',
    difficulty: 'EASY',
  },

  // --- Python & Architecture ---
  {
    id: 'python-gil-1',
    topic: 'Python',
    subtopic: 'Runtime & Memory',
    icon: '🐍',
    question: 'What is the role of Python’s Global Interpreter Lock (GIL) in CPython?',
    options: [
      'It prevents concurrent I/O operations from opening multiple sockets',
      'It is a mutex that prevents multiple native threads from executing Python bytecodes simultaneously',
      'It locks variables in memory so they cannot be garbage collected',
      'It restricts Python scripts to a single CPU core permanently even if using multiprocessing',
    ],
    correctIndex: 1,
    explanation:
      'The GIL is a mutex in CPython that protects access to Python objects, preventing multiple threads from executing Python bytecodes at once. For CPU-bound parallel workloads, Python developers use multiprocessing or subinterpreters rather than multithreading.',
    takeawayNote:
      'Concurrency takeaway: In Python, use threading/asyncio for I/O-bound tasks, and multiprocessing/ProcessPoolExecutor for CPU-bound tasks.',
    difficulty: 'MEDIUM',
  },
];

@Injectable({ providedIn: 'root' })
export class TopicQuizService {
  // --- State Signals ---
  readonly prompt = signal<TopicQuizPrompt | null>(null);
  readonly isOpen = signal<boolean>(false);
  readonly activeQuestion = signal<QuizQuestion | null>(null);
  readonly selectedOption = signal<number | null>(null);
  readonly isSubmitted = signal<boolean>(false);
  readonly isCorrect = signal<boolean | null>(null);
  readonly feedback = signal<QuizFeedback | null>(null);
  readonly attemptHistory = signal<QuizAttempt[]>(this.loadHistory());

  // --- External Hooks ---
  onSaveTakeaway: ((takeaway: string) => void) | null = null;
  onQuizCompleted: ((isCorrect: boolean, boost: number) => void) | null = null;

  // --- Cooldown Tracking ---
  private cooldownUntil = 0;
  private triggeredSessionKeys = new Set<string>();

  // --- Computed Stats ---
  readonly totalAttempts = computed(() => this.attemptHistory().length);
  readonly correctCount = computed(() => this.attemptHistory().filter((a) => a.isCorrect).length);
  readonly accuracyPercent = computed(() => {
    const total = this.totalAttempts();
    if (total === 0) return 0;
    return Math.round((this.correctCount() / total) * 100);
  });

  constructor() {}

  // --- Intelligent Question Matching ---

  getQuestionForTopic(topic: string, queryOrTitle = ''): QuizQuestion {
    const searchSpace = `${topic} ${queryOrTitle}`.toLowerCase();

    // 1. Check exact topic and keyword matches
    const scored = TOPIC_QUIZ_BANK.map((q) => {
      let score = 0;
      const qTopic = q.topic.toLowerCase();
      const qSubtopic = (q.subtopic || '').toLowerCase();
      const qQuestion = q.question.toLowerCase();

      if (searchSpace.includes(qTopic)) score += 10;
      if (qSubtopic && searchSpace.includes(qSubtopic)) score += 8;
      if (searchSpace.includes('thread') || searchSpace.includes('concurrency')) {
        if (qSubtopic.includes('concurrency') || qQuestion.includes('thread')) score += 12;
      }
      if (searchSpace.includes('spring') && qTopic.includes('spring')) score += 12;
      if (searchSpace.includes('kafka') && (qTopic.includes('spring') || qQuestion.includes('kafka'))) score += 15;
      if ((searchSpace.includes('array') || searchSpace.includes('dp') || searchSpace.includes('graph')) && qTopic === 'DSA') {
        score += 12;
      }
      if (searchSpace.includes('system design') || searchSpace.includes('distributed')) {
        if (qTopic === 'System Design') score += 15;
      }
      if (searchSpace.includes('database') || searchSpace.includes('sql') || searchSpace.includes('index')) {
        if (qTopic.includes('Database')) score += 15;
      }
      if (searchSpace.includes('python') && qTopic === 'Python') score += 15;

      return { q, score };
    });

    scored.sort((a, b) => b.score - a.score);
    return scored[0]?.score > 0 ? scored[0].q : TOPIC_QUIZ_BANK[0];
  }

  // --- Triggers for Articles & Videos ---

  checkArticleTrigger(
    articleId: string | number,
    title: string,
    subject: string,
    depthPercent: number,
    continuousSeconds: number
  ): void {
    if (this.isOpen() || this.prompt() || Date.now() < this.cooldownUntil) return;

    const triggerKey = `article_${articleId}_check`;
    if (this.triggeredSessionKeys.has(triggerKey)) return;

    // Trigger condition: reached midpoint (45-60%) OR read continuously for > 4.5 minutes (270s)
    if (depthPercent >= 45 || continuousSeconds >= 270) {
      this.triggeredSessionKeys.add(triggerKey);
      const question = this.getQuestionForTopic(subject, title);
      this.suggestQuiz({
        question,
        contextType: 'article',
        sourceId: articleId,
        sourceTitle: title,
        topic: subject,
        reason: depthPercent >= 45 ? 'midpoint' : 'continuous_streak',
      });
    }
  }

  checkVideoTrigger(
    videoId: string,
    title: string,
    category: string,
    watchSeconds: number,
    continuousSeconds: number
  ): void {
    if (this.isOpen() || this.prompt() || Date.now() < this.cooldownUntil) return;

    const triggerKey = `video_${videoId}_check`;
    if (this.triggeredSessionKeys.has(triggerKey)) return;

    // Trigger condition: watched continuously for > 4 minutes (240s) or watched > 300s total
    if (continuousSeconds >= 240 || watchSeconds >= 300) {
      this.triggeredSessionKeys.add(triggerKey);
      const question = this.getQuestionForTopic(category, title);
      this.suggestQuiz({
        question,
        contextType: 'video',
        sourceId: videoId,
        sourceTitle: title,
        topic: category || 'Software Engineering',
        reason: 'continuous_streak',
      });
    }
  }

  suggestQuiz(prompt: TopicQuizPrompt): void {
    if (Date.now() < this.cooldownUntil) return;
    this.prompt.set(prompt);
  }

  dismissPrompt(): void {
    this.prompt.set(null);
    // 4-minute cooldown before another automatic trigger
    this.cooldownUntil = Date.now() + 240 * 1000;
  }

  // --- Modal & Quiz Interaction ---

  openQuiz(customQuestion?: QuizQuestion, customPrompt?: TopicQuizPrompt): void {
    const q = customQuestion || this.prompt()?.question || TOPIC_QUIZ_BANK[0];
    this.activeQuestion.set(q);
    this.selectedOption.set(null);
    this.isSubmitted.set(false);
    this.isCorrect.set(null);
    this.feedback.set(null);

    if (customPrompt) {
      this.prompt.set(customPrompt);
    }

    this.isOpen.set(true);
  }

  openManualQuiz(topic: string, title = '', contextType: 'article' | 'video' = 'article'): void {
    const question = this.getQuestionForTopic(topic, title);
    this.prompt.set({
      question,
      contextType,
      sourceId: 'manual',
      sourceTitle: title || topic,
      topic,
      reason: 'manual',
    });
    this.openQuiz(question);
  }

  selectOption(index: number): void {
    if (this.isSubmitted()) return;
    this.selectedOption.set(index);
  }

  submitAnswer(): QuizFeedback | null {
    const selected = this.selectedOption();
    const q = this.activeQuestion();
    if (selected === null || !q) return null;

    const isCorrect = selected === q.correctIndex;
    this.isCorrect.set(isCorrect);
    this.isSubmitted.set(true);

    const feedback: QuizFeedback = {
      grade: isCorrect ? 'CORRECT' : 'INCORRECT',
      badge: isCorrect ? '🎯 Accurate Understanding!' : '💡 Learning Opportunity!',
      title: isCorrect
        ? 'Spot-on! You mastered this invariant.'
        : 'Good effort! Notice the nuance in this pattern.',
      explanation: q.explanation,
      takeawayNote: q.takeawayNote,
      retentionBoost: isCorrect ? 10 : 4,
    };

    this.feedback.set(feedback);

    // Record attempt
    const attempt: QuizAttempt = {
      questionId: q.id,
      topic: q.topic,
      selectedIndex: selected,
      isCorrect,
      timestamp: Date.now(),
      contextType: this.prompt()?.contextType || 'article',
      sourceTitle: this.prompt()?.sourceTitle || q.topic,
    };

    this.attemptHistory.update((h) => [attempt, ...h.slice(0, 49)]);
    this.saveHistory();

    if (this.onQuizCompleted) {
      this.onQuizCompleted(isCorrect, feedback.retentionBoost);
    }

    this.playAudioChime(isCorrect);
    return feedback;
  }

  saveTakeaway(): void {
    const fb = this.feedback();
    const q = this.activeQuestion();
    if (!fb || !q) return;

    const textToInsert = `\n\n### 💡 Checkpoint Takeaway: ${q.topic} (${q.subtopic || 'Concept'})\n- **Question:** ${q.question}\n- **Key Takeaway:** ${q.takeawayNote}\n- **Explanation:** ${q.explanation}\n`;

    if (this.onSaveTakeaway) {
      this.onSaveTakeaway(textToInsert);
    }
  }

  closeQuiz(): void {
    this.isOpen.set(false);
    this.prompt.set(null);
    this.selectedOption.set(null);
    this.isSubmitted.set(false);
    this.isCorrect.set(null);
    this.feedback.set(null);
    // Brief cooldown after answering so user can study peacefully
    this.cooldownUntil = Date.now() + 180 * 1000;
  }

  // --- Audio Feedback ---

  private playAudioChime(isCorrect: boolean): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      if (isCorrect) {
        // High celebratory C5 -> E5 -> G5 chord
        osc.frequency.setValueAtTime(523.25, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(659.25, ctx.currentTime + 0.12);
        osc.frequency.exponentialRampToValueAtTime(783.99, ctx.currentTime + 0.25);
      } else {
        // Gentle focus chord
        osc.frequency.setValueAtTime(440.0, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(349.23, ctx.currentTime + 0.2);
      }

      gain.gain.setValueAtTime(0.08, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.35);
    } catch {}
  }

  // --- Persistence ---

  private loadHistory(): QuizAttempt[] {
    try {
      const raw = localStorage.getItem(QUIZ_HISTORY_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  }

  private saveHistory(): void {
    try {
      localStorage.setItem(QUIZ_HISTORY_KEY, JSON.stringify(this.attemptHistory()));
    } catch {}
  }
}
