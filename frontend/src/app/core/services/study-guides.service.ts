import { Injectable } from '@angular/core';

export interface GuideSection {
  id: string;
  title: string;
  content: string;
  code?: string;
  language?: string;
  tip?: string;
  warning?: string;
}

export interface GuideTopic {
  id: string;
  title: string;
  description: string;
  sections: GuideSection[];
}

export interface StudyGuide {
  id: string;
  title: string;
  icon: string;
  color: string;
  description: string;
  topics: GuideTopic[];
}

@Injectable({ providedIn: 'root' })
export class StudyGuidesService {
  private readonly guides: StudyGuide[] = [
    {
      id: 'dsa',
      title: 'DSA',
      icon: '🧮',
      color: '#6366f1',
      description: 'Data Structures & Algorithms — from arrays to graphs, with patterns and complexity analysis.',
      topics: [
        {
          id: 'arrays-strings',
          title: 'Arrays & Strings',
          description: 'Foundation of most coding problems. Master sliding window, two-pointer, and prefix sum patterns.',
          sections: [
            {
              id: 'two-pointer',
              title: 'Two Pointer Pattern',
              content: `Two pointers move toward each other (or in the same direction) to reduce O(n²) brute force to O(n). Use when dealing with sorted arrays, or when you need to find pairs/subarrays meeting a condition.

**When to use:**
- Find a pair that sums to a target (sorted array)
- Remove duplicates from sorted array in-place
- Determine if a string is a palindrome
- Container with most water`,
              code: `// Two-sum in sorted array — O(n) time, O(1) space
function twoSum(nums: number[], target: number): number[] {
  let left = 0, right = nums.length - 1;
  while (left < right) {
    const sum = nums[left] + nums[right];
    if (sum === target) return [left, right];
    else if (sum < target) left++;
    else right--;
  }
  return [];
}`,
              language: 'typescript',
              tip: 'Sort first if the array is unsorted — O(n log n) sort + O(n) scan beats O(n²) brute force.',
            },
            {
              id: 'sliding-window',
              title: 'Sliding Window Pattern',
              content: `A window [left, right] expands right until invalid, then contracts from the left. Avoids re-computing overlapping sub-arrays.

**Fixed-size window** — maintain a sum/count, subtract the element leaving, add the one entering.
**Variable-size window** — expand right freely; shrink left to restore the invariant.

**Classic problems:** Max sum subarray of size k, Longest substring without repeating characters, Minimum window substring.`,
              code: `// Longest substring without repeating chars — O(n)
function lengthOfLongestSubstring(s: string): number {
  const seen = new Map<string, number>();
  let max = 0, left = 0;
  for (let right = 0; right < s.length; right++) {
    const ch = s[right];
    if (seen.has(ch) && seen.get(ch)! >= left) {
      left = seen.get(ch)! + 1;
    }
    seen.set(ch, right);
    max = Math.max(max, right - left + 1);
  }
  return max;
}`,
              language: 'typescript',
            },
            {
              id: 'prefix-sum',
              title: 'Prefix Sum',
              content: `Precompute cumulative sums so any sub-array sum query answers in O(1). sum(i, j) = prefix[j+1] - prefix[i].

**2D prefix sum** extends the idea to grids — useful for rectangle sum queries.`,
              code: `// Sub-array sum equals k — O(n)
function subarraySum(nums: number[], k: number): number {
  const counts = new Map([[0, 1]]);
  let count = 0, prefix = 0;
  for (const n of nums) {
    prefix += n;
    count += counts.get(prefix - k) ?? 0;
    counts.set(prefix, (counts.get(prefix) ?? 0) + 1);
  }
  return count;
}`,
              language: 'typescript',
              tip: 'The map stores how many times each prefix sum has been seen, not the index!',
            },
          ],
        },
        {
          id: 'trees-graphs',
          title: 'Trees & Graphs',
          description: 'BFS, DFS, topological sort, union-find, shortest paths — the backbone of graph problems.',
          sections: [
            {
              id: 'bfs-dfs',
              title: 'BFS vs DFS',
              content: `**BFS (Breadth-First Search)** — explores layer by layer using a queue. Use for:
- Shortest path in an unweighted graph
- Level-order traversal of a tree
- "Minimum steps" problems

**DFS (Depth-First Search)** — goes deep first using a stack (or recursion). Use for:
- Detect cycles
- Topological sort
- Connected components
- Backtracking / permutations`,
              code: `// BFS shortest path — O(V + E)
function bfs(graph: number[][], start: number): number[] {
  const dist = new Array(graph.length).fill(-1);
  dist[start] = 0;
  const queue = [start];
  while (queue.length) {
    const node = queue.shift()!;
    for (const neighbor of graph[node]) {
      if (dist[neighbor] === -1) {
        dist[neighbor] = dist[node] + 1;
        queue.push(neighbor);
      }
    }
  }
  return dist;
}`,
              language: 'typescript',
            },
            {
              id: 'union-find',
              title: 'Union-Find (Disjoint Set)',
              content: `Efficiently track connected components. Two operations: **find** (with path compression) and **union** (by rank). Both run in near O(1) amortized — O(α(n)), the inverse Ackermann function.

**Use cases:** Number of islands, detecting cycles in undirected graph, Kruskal's MST.`,
              code: `class UnionFind {
  private parent: number[];
  private rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(x: number): number {
    if (this.parent[x] !== x)
      this.parent[x] = this.find(this.parent[x]); // path compression
    return this.parent[x];
  }
  union(x: number, y: number): boolean {
    const px = this.find(x), py = this.find(y);
    if (px === py) return false;
    if (this.rank[px] < this.rank[py]) this.parent[px] = py;
    else if (this.rank[px] > this.rank[py]) this.parent[py] = px;
    else { this.parent[py] = px; this.rank[px]++; }
    return true;
  }
}`,
              language: 'typescript',
              tip: 'Always use both path compression AND union by rank — either alone degrades to O(log n).',
            },
            {
              id: 'dijkstra',
              title: "Dijkstra's Shortest Path",
              content: `Single-source shortest path for graphs with non-negative weights. Uses a min-heap (priority queue).

**Time complexity:** O((V + E) log V) with a binary heap.
**Bellman-Ford** handles negative edges in O(VE).
**Floyd-Warshall** handles all-pairs shortest paths in O(V³).`,
              code: `// Dijkstra with a min-heap
function dijkstra(graph: [number, number][][], start: number): number[] {
  const dist = new Array(graph.length).fill(Infinity);
  dist[start] = 0;
  // [distance, node]
  const heap: [number, number][] = [[0, start]];
  while (heap.length) {
    heap.sort((a, b) => a[0] - b[0]); // use a proper MinHeap in production
    const [d, u] = heap.shift()!;
    if (d > dist[u]) continue; // stale entry
    for (const [v, w] of graph[u]) {
      if (dist[u] + w < dist[v]) {
        dist[v] = dist[u] + w;
        heap.push([dist[v], v]);
      }
    }
  }
  return dist;
}`,
              language: 'typescript',
              warning: 'Dijkstra fails with negative-weight edges. Use Bellman-Ford instead.',
            },
          ],
        },
        {
          id: 'dp',
          title: 'Dynamic Programming',
          description: 'Memoization, tabulation, and recognizing DP patterns — knapsack, LCS, intervals.',
          sections: [
            {
              id: 'dp-framework',
              title: 'DP Problem Framework',
              content: `**Step 1 — Define state:** What info do you need to describe a subproblem? e.g. dp[i] = answer for first i elements.
**Step 2 — Recurrence:** How does dp[i] relate to smaller subproblems?
**Step 3 — Base case:** What are the trivially known answers?
**Step 4 — Order:** Do you fill top-down (memo) or bottom-up (table)?

**Recognising DP:** "Optimal substructure" (optimal solution uses optimal sub-solutions) + "overlapping subproblems".`,
              tip: 'Start with brute-force recursion, add memoization, then convert to tabulation if needed.',
            },
            {
              id: '0-1-knapsack',
              title: '0/1 Knapsack',
              content: `Classic DP: given weights and values, maximize value within a weight limit. Each item is included or excluded exactly once.

**State:** dp[i][w] = max value using first i items with weight limit w.
**Recurrence:** dp[i][w] = max(dp[i-1][w], dp[i-1][w-weight[i]] + value[i]) if w >= weight[i].`,
              code: `function knapsack(weights: number[], values: number[], W: number): number {
  const n = weights.length;
  // Space-optimized: 1D dp array, iterate weights backwards
  const dp = new Array(W + 1).fill(0);
  for (let i = 0; i < n; i++) {
    for (let w = W; w >= weights[i]; w--) {
      dp[w] = Math.max(dp[w], dp[w - weights[i]] + values[i]);
    }
  }
  return dp[W];
}`,
              language: 'typescript',
              tip: 'Iterate W backwards for 0/1 knapsack, forwards for unbounded knapsack.',
            },
            {
              id: 'lcs',
              title: 'Longest Common Subsequence',
              content: `**LCS** — find the longest sequence present in both strings (not necessarily contiguous).

**State:** dp[i][j] = LCS length of s1[0..i-1] and s2[0..j-1].
**Recurrence:**
- If s1[i-1] == s2[j-1]: dp[i][j] = dp[i-1][j-1] + 1
- Else: dp[i][j] = max(dp[i-1][j], dp[i][j-1])

**Variants:** Longest Common Substring (must be contiguous), Edit Distance (Levenshtein).`,
              code: `function lcs(s1: string, s2: string): number {
  const m = s1.length, n = s2.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = s1[i-1] === s2[j-1]
        ? dp[i-1][j-1] + 1
        : Math.max(dp[i-1][j], dp[i][j-1]);
    }
  }
  return dp[m][n];
}`,
              language: 'typescript',
            },
          ],
        },
        {
          id: 'complexity',
          title: 'Complexity Cheatsheet',
          description: 'Big-O intuition and common complexities at a glance.',
          sections: [
            {
              id: 'big-o',
              title: 'Big-O Quick Reference',
              content: `| Complexity | Name | Example |
|---|---|---|
| O(1) | Constant | Hash map lookup |
| O(log n) | Logarithmic | Binary search |
| O(n) | Linear | Single loop |
| O(n log n) | Linearithmic | Merge sort |
| O(n²) | Quadratic | Nested loops |
| O(2ⁿ) | Exponential | All subsets |
| O(n!) | Factorial | All permutations |

**Space:** Recursive DFS on a tree is O(h) space (height). BFS is O(w) (width at widest level).`,
              tip: 'For interview purposes: O(n log n) or better is usually acceptable. O(n²) is a red flag for n > 10⁴.',
            },
          ],
        },
      ],
    },
    {
      id: 'java',
      title: 'Java',
      icon: '☕',
      color: '#f97316',
      description: 'Core Java — OOP, Collections, Concurrency, Streams, JVM internals, and interview essentials.',
      topics: [
        {
          id: 'oop',
          title: 'OOP Principles',
          description: 'Encapsulation, Inheritance, Polymorphism, Abstraction — with Java examples.',
          sections: [
            {
              id: 'solid',
              title: 'SOLID Principles',
              content: `**S** — Single Responsibility: A class should have one reason to change.
**O** — Open/Closed: Open for extension, closed for modification (use abstractions).
**L** — Liskov Substitution: Subtypes must be substitutable for their base types without altering correctness.
**I** — Interface Segregation: Many small interfaces are better than one big one.
**D** — Dependency Inversion: Depend on abstractions, not concretions (inject dependencies).`,
              code: `// DIP example: inject the repository, don't new it up
public class UserService {
    private final UserRepository repo; // interface, not impl

    public UserService(UserRepository repo) { // inject
        this.repo = repo;
    }

    public User findById(Long id) {
        return repo.findById(id).orElseThrow();
    }
}`,
              language: 'java',
            },
            {
              id: 'interfaces-abstract',
              title: 'Interface vs Abstract Class',
              content: `**Interface (Java 8+):**
- Only constants, abstract methods, default methods, static methods
- A class can implement multiple interfaces
- Use when defining a **contract** / capability ("can-do")

**Abstract Class:**
- Can have state (fields), constructors, concrete methods
- Single inheritance only
- Use for **partial implementation** / "is-a" relationship`,
              code: `// Interface — defines capability
public interface Sortable<T extends Comparable<T>> {
    List<T> sort(List<T> items);
    default List<T> sortReversed(List<T> items) {
        List<T> sorted = sort(items);
        Collections.reverse(sorted);
        return sorted;
    }
}

// Abstract class — partial implementation
public abstract class Shape {
    protected String color;
    public Shape(String color) { this.color = color; }
    public abstract double area(); // subclass fills this
    public String describe() { return color + " shape, area=" + area(); }
}`,
              language: 'java',
            },
          ],
        },
        {
          id: 'collections',
          title: 'Collections Framework',
          description: 'When to use ArrayList vs LinkedList, HashMap vs TreeMap, and more.',
          sections: [
            {
              id: 'collection-choice',
              title: 'Choosing the Right Collection',
              content: `| Need | Use |
|---|---|
| Fast random access by index | ArrayList |
| Fast insert/delete at head/tail | LinkedList / ArrayDeque |
| Fast key lookup | HashMap |
| Key lookup + sorted order | TreeMap (Red-Black tree) |
| Insertion-order iteration | LinkedHashMap |
| Uniqueness | HashSet |
| Uniqueness + sorted | TreeSet |
| Thread-safe map | ConcurrentHashMap |
| Priority queue | PriorityQueue (min-heap by default) |

**Key complexities:** HashMap/HashSet — O(1) avg. TreeMap/TreeSet — O(log n). ArrayList get — O(1). LinkedList get — O(n).`,
              tip: 'Prefer ArrayDeque over Stack and LinkedList for stack/queue use cases — it\'s faster and has no synchronization overhead.',
            },
            {
              id: 'streams',
              title: 'Streams API',
              content: `Streams provide a functional, lazy pipeline for data processing. They don't mutate the source.

**Intermediate (lazy):** filter, map, flatMap, distinct, sorted, limit, skip
**Terminal (eager, produces result):** collect, forEach, reduce, count, findFirst, anyMatch`,
              code: `List<String> names = employees.stream()
    .filter(e -> e.getSalary() > 50_000)    // intermediate
    .sorted(Comparator.comparing(Employee::getName)) // intermediate
    .map(Employee::getName)                  // intermediate
    .collect(Collectors.toList());           // terminal

// groupingBy
Map<Department, List<Employee>> byDept = employees.stream()
    .collect(Collectors.groupingBy(Employee::getDepartment));

// parallel stream (use only for CPU-intensive, side-effect-free ops)
long count = bigList.parallelStream()
    .filter(x -> isPrime(x))
    .count();`,
              language: 'java',
              warning: 'Parallel streams have overhead from thread coordination. Only use for large datasets and CPU-bound operations without shared mutable state.',
            },
          ],
        },
        {
          id: 'concurrency',
          title: 'Concurrency',
          description: 'Threads, locks, volatile, java.util.concurrent, and common concurrency patterns.',
          sections: [
            {
              id: 'thread-safety',
              title: 'Thread Safety Fundamentals',
              content: `A class is **thread-safe** if it behaves correctly when accessed from multiple threads simultaneously, with no additional synchronization by the caller.

**volatile** — guarantees visibility (changes visible to all threads) but NOT atomicity. Use for simple flags.
**synchronized** — guarantees mutual exclusion AND visibility, but can cause contention.
**java.util.concurrent.atomic** — lock-free, CAS-based atomic operations (AtomicInteger, AtomicReference).
**ReentrantLock** — more flexible than synchronized: tryLock, timed locking, fairness.`,
              code: `// Double-checked locking for singleton — correct with volatile
public class Singleton {
    private static volatile Singleton instance;

    private Singleton() {}

    public static Singleton getInstance() {
        if (instance == null) {             // first check (no lock)
            synchronized (Singleton.class) {
                if (instance == null) {     // second check (with lock)
                    instance = new Singleton();
                }
            }
        }
        return instance;
    }
}`,
              language: 'java',
              tip: 'Prefer Enum singleton or static holder pattern — they\'re simpler and guaranteed thread-safe by the JVM.',
            },
            {
              id: 'executors',
              title: 'ExecutorService & Thread Pools',
              content: `Raw Thread creation is expensive. **ExecutorService** pools threads and manages their lifecycle.

- **newFixedThreadPool(n)** — n threads, queue unbounded work
- **newCachedThreadPool()** — grows as needed, idle threads die after 60s
- **newSingleThreadExecutor()** — serial order guaranteed
- **newScheduledThreadPool(n)** — delayed / periodic tasks
- **ForkJoinPool.commonPool()** — used by parallel streams and CompletableFuture`,
              code: `ExecutorService pool = Executors.newFixedThreadPool(4);
List<Future<Integer>> futures = new ArrayList<>();

for (int i = 0; i < 10; i++) {
    final int task = i;
    futures.add(pool.submit(() -> compute(task)));
}

// Collect results
for (Future<Integer> f : futures) {
    System.out.println(f.get()); // blocks until done
}
pool.shutdown();
pool.awaitTermination(1, TimeUnit.MINUTES);`,
              language: 'java',
            },
          ],
        },
        {
          id: 'jvm',
          title: 'JVM & Memory',
          description: 'Heap, stack, GC, class loading — essential for performance tuning.',
          sections: [
            {
              id: 'memory-model',
              title: 'JVM Memory Model',
              content: `**Heap** — Objects and class instances live here. Split into Young Generation (Eden + Survivor) and Old Generation (Tenured).
**Stack** — Each thread has its own stack of frames (local vars, operand stack, return address).
**Metaspace** (Java 8+) — Class metadata, method bytecode. Replaces PermGen.
**Code Cache** — JIT-compiled native code.

**GC cycle:** Minor GC collects Young Gen (frequent, fast). Major/Full GC collects Old Gen (rare, slow).`,
              tip: 'The most common cause of OutOfMemoryError in production is a memory leak (objects referenced longer than their useful life). Use heap dumps + tools like VisualVM or Eclipse MAT to diagnose.',
            },
          ],
        },
      ],
    },
    {
      id: 'spring-boot',
      title: 'Spring Boot',
      icon: '🍃',
      color: '#22c55e',
      description: 'Spring ecosystem essentials — IoC, MVC, Security, Data JPA, and microservice patterns.',
      topics: [
        {
          id: 'ioc-di',
          title: 'IoC & Dependency Injection',
          description: 'The core philosophy of Spring — beans, context, and injection strategies.',
          sections: [
            {
              id: 'bean-lifecycle',
              title: 'Bean Lifecycle',
              content: `1. **Instantiation** — Spring creates the bean instance
2. **Populate properties** — injects dependencies
3. **BeanNameAware / BeanFactoryAware** callbacks
4. **BeanPostProcessor.postProcessBeforeInitialization**
5. **@PostConstruct / InitializingBean.afterPropertiesSet**
6. **BeanPostProcessor.postProcessAfterInitialization**
7. **Bean ready to use**
8. On shutdown: **@PreDestroy / DisposableBean.destroy**`,
              code: `@Component
public class DataLoader {

    private final UserRepository repo;

    public DataLoader(UserRepository repo) { // constructor injection (preferred)
        this.repo = repo;
    }

    @PostConstruct
    void init() {
        // runs after all dependencies are injected
        if (repo.count() == 0) seedData();
    }

    @PreDestroy
    void cleanup() {
        // runs before Spring destroys the bean
    }
}`,
              language: 'java',
              tip: 'Prefer constructor injection over @Autowired field injection — it makes dependencies explicit and enables immutability (final fields).',
            },
            {
              id: 'scopes',
              title: 'Bean Scopes',
              content: `| Scope | Created | Suitable for |
|---|---|---|
| **singleton** (default) | Once per ApplicationContext | Stateless services, repos |
| **prototype** | Each injection | Stateful beans |
| **request** | Each HTTP request | Web layer beans |
| **session** | Each HTTP session | Session-scoped state |
| **application** | Each ServletContext | App-wide singletons |`,
              warning: 'Injecting a prototype bean into a singleton produces only one instance. Use ObjectProvider<T> or ApplicationContext.getBean() to get a fresh prototype each time.',
            },
          ],
        },
        {
          id: 'spring-mvc',
          title: 'Spring MVC & REST',
          description: 'Building RESTful APIs — controllers, request mapping, validation, exception handling.',
          sections: [
            {
              id: 'rest-controller',
              title: 'REST Controller Best Practices',
              content: `- Use **@RestController** (= @Controller + @ResponseBody)
- Return proper HTTP status codes via **ResponseEntity<T>** or **@ResponseStatus**
- Validate input with **@Valid** + Bean Validation annotations
- Use **@ExceptionHandler** or **@ControllerAdvice** for centralised error handling
- Keep controllers thin — delegate business logic to **@Service** layer`,
              code: `@RestController
@RequestMapping("/api/users")
@Validated
public class UserController {

    private final UserService service;

    public UserController(UserService service) { this.service = service; }

    @GetMapping("/{id}")
    public ResponseEntity<UserDto> get(@PathVariable Long id) {
        return ResponseEntity.ok(service.findById(id));
    }

    @PostMapping
    public ResponseEntity<UserDto> create(@Valid @RequestBody CreateUserRequest req) {
        UserDto created = service.create(req);
        URI location = URI.create("/api/users/" + created.id());
        return ResponseEntity.created(location).body(created);
    }
}

@ControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ErrorBody> notFound(EntityNotFoundException ex) {
        return ResponseEntity.status(404).body(new ErrorBody(ex.getMessage()));
    }
}`,
              language: 'java',
            },
            {
              id: 'spring-security',
              title: 'Spring Security Fundamentals',
              content: `Spring Security plugs into the Servlet filter chain. Key concepts:

**Authentication** — who are you? (UsernamePasswordAuthenticationToken, JWT, OAuth2)
**Authorization** — what are you allowed to do? (roles, permissions, method security)

**SecurityFilterChain** is the modern replacement for WebSecurityConfigurerAdapter.
**JWT flow:** Client sends token in Authorization header → JwtAuthFilter extracts + validates → sets SecurityContext → controller runs.`,
              code: `@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        return http
            .csrf(AbstractHttpConfigurer::disable)
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .authorizeHttpRequests(auth -> auth
                .requestMatchers("/api/auth/**").permitAll()
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated()
            )
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter.class)
            .build();
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder();
    }
}`,
              language: 'java',
              tip: 'BCrypt is the recommended password hasher. Never store plain text or MD5/SHA passwords.',
            },
          ],
        },
        {
          id: 'spring-data',
          title: 'Spring Data JPA',
          description: 'Entities, repositories, JPQL, N+1 problem, transactions.',
          sections: [
            {
              id: 'entity-mapping',
              title: 'Entity Mapping Essentials',
              content: `- **@Entity @Table** — marks the class and its table
- **@Id @GeneratedValue** — primary key + auto-increment strategy
- **@Column** — column name, nullable, length constraints
- **@OneToMany / @ManyToOne** — join column and cascade settings
- Always implement **equals/hashCode** using the business key or ID, not Lombok @Data on entities (it can cause issues with Hibernate)`,
              code: `@Entity
@Table(name = "orders")
public class Order {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY) // LAZY to avoid N+1
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderItem> items = new ArrayList<>();

    // domain methods, getters, equals/hashCode by id
}`,
              language: 'java',
              warning: 'Default fetch type for @OneToMany is EAGER in JPA spec, but Hibernate makes it LAZY. Always set FetchType.LAZY explicitly and use JOIN FETCH in queries to avoid N+1.',
            },
            {
              id: 'n-plus-1',
              title: 'N+1 Problem & Fix',
              content: `**N+1 problem:** loading N parent entities triggers N additional queries for their children.

**Fix options:**
1. **JOIN FETCH** in JPQL: \`SELECT o FROM Order o JOIN FETCH o.items\`
2. **@EntityGraph** on repository methods
3. **@BatchSize(size = 25)** on collection — fetches in batches
4. **Projections** — fetch only what you need via interface or DTO projections`,
              code: `public interface OrderRepository extends JpaRepository<Order, Long> {

    // JOIN FETCH avoids N+1
    @Query("SELECT o FROM Order o JOIN FETCH o.items WHERE o.user.id = :userId")
    List<Order> findByUserIdWithItems(@Param("userId") Long userId);

    // EntityGraph alternative
    @EntityGraph(attributePaths = {"items", "items.product"})
    List<Order> findByUserId(Long userId);
}`,
              language: 'java',
            },
          ],
        },
      ],
    },
    {
      id: 'angular',
      title: 'Angular',
      icon: '🅰️',
      color: '#ef4444',
      description: 'Modern Angular — signals, standalone components, routing, forms, RxJS, and performance.',
      topics: [
        {
          id: 'signals',
          title: 'Angular Signals',
          description: 'Fine-grained reactivity without Zone.js — the future of Angular change detection.',
          sections: [
            {
              id: 'signals-basics',
              title: 'Signals, Computed & Effects',
              content: `**signal()** — a reactive value. Reading it tracks the dependency; writing it schedules a re-render of only the affected components.
**computed()** — derives a value from one or more signals, re-evaluated only when dependencies change.
**effect()** — runs a side effect whenever its signal dependencies change (use sparingly — prefer computed).
**toSignal()** — converts an Observable to a signal.`,
              code: `import { signal, computed, effect } from '@angular/core';

// writable signal
const count = signal(0);
const doubled = computed(() => count() * 2); // re-computes when count changes

// update
count.set(5);
count.update(n => n + 1); // 6
count.mutate(arr => arr.push(item)); // for arrays/objects in-place

effect(() => {
  console.log('Count changed:', count()); // logs on every change
});`,
              language: 'typescript',
              tip: 'Use signals for local component state. Keep Observables for async data flows (HTTP, events). Bridge them with toSignal() / toObservable().',
            },
            {
              id: 'input-output',
              title: 'Signal-based Inputs & Outputs',
              content: `Angular 17+ introduces **input()** and **output()** as alternatives to @Input/@Output decorators.

- **input()** — readonly signal bound by the parent
- **input.required()** — required input, type-inferred
- **model()** — two-way bindable signal (like [(ngModel)])
- **output()** — typed event emitter`,
              code: `@Component({
  selector: 'app-card',
  template: \`<button (click)="toggle()">{{ label() }} ({{ active() ? 'on' : 'off' }})</button>\`
})
export class Card {
  readonly label = input.required<string>();
  readonly active = model(false); // two-way: [(active)]="parentSignal"

  readonly toggled = output<boolean>();

  toggle() {
    this.active.update(v => !v);
    this.toggled.emit(this.active());
  }
}`,
              language: 'typescript',
            },
          ],
        },
        {
          id: 'standalone',
          title: 'Standalone Components',
          description: 'NgModule-free Angular — how standalone components, directives and pipes work.',
          sections: [
            {
              id: 'standalone-basics',
              title: 'Standalone Architecture',
              content: `Standalone components declare their own imports directly, eliminating the need for NgModule for most scenarios.

**Key rules:**
- Add \`standalone: true\` in @Component (or just omit it in Angular 19+ where standalone is default)
- Import other standalone components/directives/pipes in the \`imports\` array
- For library modules (FormsModule, RouterModule), import them in each component that needs them`,
              code: `@Component({
  selector: 'app-user-card',
  standalone: true,
  imports: [DatePipe, RouterLink, NgClass], // import what you need
  template: \`
    <a [routerLink]="['/user', user().id]" [ngClass]="{ active: isActive() }">
      {{ user().name }} — {{ user().createdAt | date }}
    </a>
  \`
})
export class UserCard {
  readonly user = input.required<User>();
  readonly isActive = computed(() => this.user().status === 'ACTIVE');
}`,
              language: 'typescript',
            },
          ],
        },
        {
          id: 'rxjs',
          title: 'RxJS Patterns',
          description: 'Essential operators, error handling, and combining streams.',
          sections: [
            {
              id: 'key-operators',
              title: 'Essential Operators',
              content: `**Transformation:** map, switchMap, mergeMap, concatMap, exhaustMap
**Filtering:** filter, take, takeUntil, debounceTime, distinctUntilChanged
**Combination:** forkJoin, combineLatest, zip, merge
**Error handling:** catchError, retry, retryWhen

**switchMap vs mergeMap vs concatMap:**
- **switchMap** — cancels in-flight inner observable on new emission (use for search)
- **mergeMap** — runs all concurrently (use for independent requests)
- **concatMap** — queues requests, runs sequentially (use for ordered side effects)
- **exhaustMap** — ignores new emissions while inner is active (use for form submit)`,
              code: `// Search with debounce + switchMap (cancels stale requests)
const results$ = searchInput.valueChanges.pipe(
  debounceTime(300),
  distinctUntilChanged(),
  filter(term => term.length >= 2),
  switchMap(term =>
    this.api.search(term).pipe(
      catchError(() => of([]))  // swallow errors per search
    )
  )
);

// Parallel requests with forkJoin
const data$ = forkJoin({
  user: this.api.getUser(id),
  posts: this.api.getPosts(id),
  followers: this.api.getFollowers(id),
});`,
              language: 'typescript',
              tip: 'Always unsubscribe! Use takeUntilDestroyed(), the async pipe, or toSignal() — they all handle cleanup automatically.',
            },
          ],
        },
        {
          id: 'performance',
          title: 'Performance',
          description: 'OnPush, lazy loading, trackBy, deferrable views, and bundle optimization.',
          sections: [
            {
              id: 'change-detection',
              title: 'Change Detection Strategy',
              content: `**Default** — checks every component on every event (setTimeout, HTTP, DOM events).
**OnPush** — only checks when:
1. An @Input reference changes
2. An event originated inside the component
3. Async pipe resolves
4. A signal used in the template changes

With Signals + zoneless (provideExperimentalZonelessChangeDetection), the runtime is even more surgical — only components using changed signals re-render.`,
              code: `@Component({
  changeDetection: ChangeDetectionStrategy.OnPush,
  // ...
})
export class ProductList {
  readonly products = input.required<Product[]>();

  // With OnPush: template re-renders only when 'products' input reference changes
  // Use immutable updates: products = [...products, newItem] not products.push(newItem)
}`,
              language: 'typescript',
            },
            {
              id: 'defer',
              title: '@defer — Deferrable Views',
              content: `Angular 17+ \`@defer\` lazy-loads a component's template chunk on demand — powerful for below-the-fold content.

**Triggers:** idle, viewport, interaction, hover, timer, immediate, when <condition>`,
              code: `<!-- Loads only when the block enters the viewport -->
@defer (on viewport) {
  <app-heavy-chart [data]="analyticsData()" />
} @placeholder {
  <div class="chart-skeleton">Loading chart…</div>
} @loading (minimum 300ms) {
  <app-spinner />
} @error {
  <p>Chart failed to load.</p>
}`,
              language: 'html',
              tip: '@defer moves the lazy component into a separate chunk automatically — no manual loadComponent() needed.',
            },
          ],
        },
      ],
    },
    {
      id: 'system-design',
      title: 'System Design',
      icon: '🏗️',
      color: '#8b5cf6',
      description: 'Scalability, availability, databases, caching, messaging, and distributed system patterns.',
      topics: [
        {
          id: 'fundamentals',
          title: 'Core Concepts',
          description: 'CAP theorem, ACID vs BASE, availability vs consistency trade-offs.',
          sections: [
            {
              id: 'cap-theorem',
              title: 'CAP Theorem',
              content: `A distributed system can guarantee at most **2 of 3**:

**C — Consistency:** Every read gets the most recent write (or an error).
**A — Availability:** Every request gets a (potentially stale) response.
**P — Partition Tolerance:** The system keeps working despite network partitions.

Since network partitions **will** happen, you must choose between CP or AP:
- **CP systems:** ZooKeeper, HBase, MongoDB (in strong consistency mode)
- **AP systems:** Cassandra, CouchDB, DynamoDB

**ACID vs BASE:**
- ACID (traditional DBs): Atomicity, Consistency, Isolation, Durability
- BASE (NoSQL): Basically Available, Soft-state, Eventual consistency`,
              tip: 'In interviews: ask the interviewer about consistency requirements early — this drives many DB and architecture choices.',
            },
            {
              id: 'scalability',
              title: 'Scaling Strategies',
              content: `**Vertical scaling (scale up):** Bigger machine. Simple, but has a ceiling and is expensive. No fault tolerance.
**Horizontal scaling (scale out):** More machines behind a load balancer. Requires statelessness (sessions in Redis, files in S3).

**Load balancing algorithms:**
- Round robin — simplest
- Least connections — routes to least-loaded server
- IP hash — consistent routing for the same client (session affinity)
- Weighted — more traffic to powerful servers

**Database scaling:**
- Read replicas — replicate reads, writes go to primary
- Sharding — partition data by key range or hash
- CQRS — separate read and write models`,
            },
          ],
        },
        {
          id: 'caching',
          title: 'Caching',
          description: 'Cache strategies, eviction policies, Redis patterns, and CDNs.',
          sections: [
            {
              id: 'cache-patterns',
              title: 'Cache-Aside vs Write-Through vs Write-Back',
              content: `**Cache-aside (lazy loading):** App checks cache → miss → fetch from DB → populate cache → return.
  - Pro: Only caches what is actually needed
  - Con: Cache miss penalty, possible stale data

**Write-through:** Every write goes to cache AND DB synchronously.
  - Pro: Cache always fresh
  - Con: Writes are slower; caches cold data on first write

**Write-back (write-behind):** Write to cache immediately; persist to DB asynchronously later.
  - Pro: Very fast writes
  - Con: Data loss risk if cache fails before flush

**Eviction policies:** LRU (most common), LFU (frequency-based), FIFO, TTL-based.`,
              tip: 'For interview: default to cache-aside + TTL. Mention write-through only if data must always be fresh.',
            },
            {
              id: 'redis-patterns',
              title: 'Redis Use Cases',
              content: `Redis is an in-memory data structure store used for:

- **Session store** — stateless app servers store sessions in Redis
- **Rate limiting** — INCR + EXPIRE per user key per minute
- **Distributed lock** — SET NX EX (or Redlock for multi-node)
- **Pub/Sub** — lightweight message fan-out
- **Sorted sets** — leaderboards (ZADD / ZRANGE)
- **Caching** — with TTL, LRU eviction
- **Job queues** — BLPOP for reliable queue consumption`,
              code: `# Rate limiting with Redis — allow 100 req/minute per IP
MULTI
INCR user:rate:{ip}
EXPIRE user:rate:{ip} 60
EXEC
# if result > 100, reject the request`,
              language: 'bash',
            },
          ],
        },
        {
          id: 'messaging',
          title: 'Messaging & Queues',
          description: 'Kafka, RabbitMQ, SQS — patterns for async, decoupled communication.',
          sections: [
            {
              id: 'kafka-vs-rabbitmq',
              title: 'Kafka vs RabbitMQ',
              content: `| Feature | Kafka | RabbitMQ |
|---|---|---|
| Model | Log (pull) | Queue (push) |
| Retention | Days/weeks (replay) | Until consumed |
| Ordering | Per-partition | Per-queue |
| Throughput | Very high | High |
| Use case | Event streaming, analytics | Task queues, RPC, routing |

**Kafka patterns:**
- **Consumer groups** — each group reads independently; partitions balance within a group
- **Compacted topic** — keeps only latest value per key (good for change data capture)
- **Exactly-once semantics** — requires idempotent producer + transactional consumer`,
              tip: 'Use Kafka when you need replay, high throughput, or multiple consumers. Use RabbitMQ for complex routing, low-latency task queues, or simpler setup.',
            },
          ],
        },
        {
          id: 'design-patterns',
          title: 'System Design Patterns',
          description: 'Rate limiting, circuit breaker, saga, and other distributed patterns.',
          sections: [
            {
              id: 'circuit-breaker',
              title: 'Circuit Breaker Pattern',
              content: `Prevents cascading failures when a downstream service is slow or unavailable.

**States:**
- **Closed (normal):** Requests pass through; failures are counted.
- **Open (tripped):** All requests fail fast without hitting the service.
- **Half-Open (probing):** A few test requests are allowed through; if they succeed, close the breaker.

**Implementations:** Resilience4j (Java), Polly (.NET), Hystrix (deprecated).`,
              code: `// Resilience4j circuit breaker — Spring Boot
@CircuitBreaker(name = "paymentService", fallbackMethod = "fallbackPayment")
public PaymentResponse charge(PaymentRequest req) {
    return paymentClient.charge(req);
}

private PaymentResponse fallbackPayment(PaymentRequest req, Exception ex) {
    log.warn("Payment service unavailable, using fallback", ex);
    return PaymentResponse.queued(req.orderId()); // queue for retry
}`,
              language: 'java',
            },
            {
              id: 'saga-pattern',
              title: 'Saga Pattern',
              content: `In microservices, a saga manages distributed transactions without a two-phase commit (which is slow and blocking).

**Choreography saga:** Services publish events; each service reacts and publishes the next event. Decoupled but harder to visualise.
**Orchestration saga:** A central orchestrator tells each service what to do and handles compensations.

**Compensating transactions:** Each step has an undo operation. If step 3 fails, run compensations for steps 2 and 1.

Example — Order flow: Create Order → Reserve Inventory → Process Payment → Send Confirmation. If Payment fails: refund → unreserve inventory → cancel order.`,
              tip: 'Choreography fits simple flows; orchestration is easier to reason about for complex multi-step processes.',
            },
          ],
        },
      ],
    },
  ];

  getAll(): StudyGuide[] {
    return this.guides;
  }

  getById(id: string): StudyGuide | undefined {
    return this.guides.find((g) => g.id === id);
  }
}
