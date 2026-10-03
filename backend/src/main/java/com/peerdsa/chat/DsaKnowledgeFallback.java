package com.peerdsa.chat;

import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Intelligent algorithmic knowledge engine and resilient fallback tutor for Grind Buddy.
 *
 * <p>When upstream OpenRouter is unavailable (rate-limited, server errors, network latency, or
 * unconfigured), this engine provides structured, high-yield DSA coaching, complexity analysis,
 * and problem-solving hints so the user's study session is never interrupted by a dead error.
 */
@Component
public class DsaKnowledgeFallback {

    private static final Logger log = LoggerFactory.getLogger(DsaKnowledgeFallback.class);

    /**
     * Streams the generated tutor response chunk by chunk to emulate real-time AI completion,
     * returning the full aggregated reply for persistence.
     */
    public String streamReply(List<OpenRouterClient.Turn> turns, Consumer<String> onToken) {
        String userQuery = extractLastUserQuery(turns);
        String reply = buildResponse(userQuery);

        // Emit in natural reading chunks with subtle micro-pauses
        String[] words = reply.split("(?<=\\s)|(?<=\n)");
        StringBuilder currentChunk = new StringBuilder();
        int tokenCount = 0;

        for (String word : words) {
            currentChunk.append(word);
            tokenCount++;
            if (tokenCount >= 3 || word.endsWith("\n") || word.endsWith(".") || word.endsWith(";")) {
                String fragment = currentChunk.toString();
                onToken.accept(fragment);
                currentChunk.setLength(0);
                tokenCount = 0;
                sleepBriefly(12);
            }
        }
        if (currentChunk.length() > 0) {
            onToken.accept(currentChunk.toString());
        }

        return reply;
    }

    private void sleepBriefly(long millis) {
        try {
            Thread.sleep(millis);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
    }

    private String extractLastUserQuery(List<OpenRouterClient.Turn> turns) {
        if (turns == null || turns.isEmpty()) {
            return "";
        }
        for (int i = turns.size() - 1; i >= 0; i--) {
            OpenRouterClient.Turn t = turns.get(i);
            if ("user".equalsIgnoreCase(t.role()) && t.content() != null && !t.content().isBlank()) {
                return t.content().trim();
            }
        }
        return "";
    }

    String buildResponse(String query) {
        String lower = query == null ? "" : query.toLowerCase(Locale.ROOT).trim();

        // 1. Greetings & Meta Queries
        if (lower.isEmpty() || isGreeting(lower)) {
            return greetingResponse();
        }

        // 2. Specific Classic Problems
        if (matchesProblem(lower, "two sum")) {
            return twoSumGuide();
        }
        if (matchesProblem(lower, "3sum", "three sum")) {
            return threeSumGuide();
        }
        if (matchesProblem(lower, "lru cache")) {
            return lruCacheGuide();
        }
        if (matchesProblem(lower, "reverse linked list", "reverse a linked list")) {
            return reverseLinkedListGuide();
        }
        if (matchesProblem(lower, "valid parentheses", "balanced parentheses")) {
            return validParenthesesGuide();
        }
        if (matchesProblem(lower, "trapping rain water")) {
            return trappingRainWaterGuide();
        }
        if (matchesProblem(lower, "longest substring without repeating")) {
            return longestSubstringGuide();
        }
        if (matchesProblem(lower, "merge k sorted lists")) {
            return mergeKSortedListsGuide();
        }
        if (matchesProblem(lower, "number of islands")) {
            return numberOfIslandsGuide();
        }
        if (matchesProblem(lower, "coin change")) {
            return coinChangeGuide();
        }
        if (matchesProblem(lower, "climbing stairs")) {
            return climbingStairsGuide();
        }
        if (matchesProblem(lower, "kadane", "maximum subarray")) {
            return kadaneGuide();
        }
        if (matchesProblem(lower, "binary search") && (lower.contains("rotated") || lower.contains("template"))) {
            return rotatedBinarySearchGuide();
        }

        // 3. Algorithmic Patterns & Data Structures
        if (lower.contains("sliding window")) {
            return slidingWindowPatternGuide();
        }
        if (lower.contains("two pointer")) {
            return twoPointersPatternGuide();
        }
        if (lower.contains("monotonic stack")) {
            return monotonicStackGuide();
        }
        if (lower.contains("binary search")) {
            return binarySearchGuide();
        }
        if (lower.contains("dynamic programming") || lower.contains(" dp ") || lower.startsWith("dp ") || lower.equals("dp")) {
            return dynamicProgrammingFrameworkGuide();
        }
        if (lower.contains("tree") || lower.contains("bst") || lower.contains("binary tree")) {
            return treeTraversalGuide();
        }
        if (lower.contains("graph") || lower.contains("dijkstra") || lower.contains("bfs") || lower.contains("dfs")) {
            return graphGuide();
        }
        if (lower.contains("heap") || lower.contains("priority queue")) {
            return heapGuide();
        }
        if (lower.contains("complexity") || lower.contains("big o") || lower.contains("time complexity") || lower.contains("space complexity")) {
            return complexityAnalysisGuide();
        }
        if (lower.contains("interview") || lower.contains("prepare") || lower.contains("roadmap") || lower.contains("strategy")) {
            return interviewStrategyGuide();
        }

        // 4. General DSA Tutor Analysis Fallback
        return contextualDsaGuide(query);
    }

    private boolean isGreeting(String lower) {
        return lower.equals("hi") || lower.equals("hello") || lower.equals("hey")
                || lower.startsWith("hi ") || lower.startsWith("hello ") || lower.startsWith("hey ")
                || lower.contains("who are you") || lower.contains("what can you do");
    }

    private boolean matchesProblem(String lower, String... candidates) {
        for (String c : candidates) {
            if (lower.contains(c)) return true;
        }
        return false;
    }

    private String headerBanner(String topic) {
        return "> ⚡ **Grind Buddy DSA Tutor** *(Smart Algorithmic Engine)*\n"
                + "> *Upstream AI is warming up; here is your tailored step-by-step breakdown:*\n\n"
                + "### " + topic + "\n\n";
    }

    private String greetingResponse() {
        return "> ⚡ **Grind Buddy DSA Tutor**\n\n"
                + "Hey there! I am **Grind Buddy**, your dedicated coding interview & DSA mentor inside PeerDSATracker.\n\n"
                + "Here is how I can help you level up:\n"
                + "- **Pattern Hints & Intuition**: Break down tricky problems (Sliding Window, DP, Graphs, Binary Search).\n"
                + "- **Optimal Approaches**: Transition from Brute Force $O(N^2)$ to Optimal $O(N)$ or $O(N \\log N)$.\n"
                + "- **Complexity Breakdown**: Analyze time and auxiliary space constraints.\n"
                + "- **Mock Interview Guidance**: 4-step framework to structure your answers.\n\n"
                + "What topic or problem are you working on today? Try asking:\n"
                + "- *\"How do I solve Two Sum in O(N) time?\"*\n"
                + "- *\"Give me a sliding window pattern template\"*\n"
                + "- *\"How does Dijkstra's algorithm work?\"*\n"
                + "- *\"Tips to master Dynamic Programming\"*";
    }

    private String twoSumGuide() {
        return headerBanner("Two Sum — Optimal One-Pass Hash Table")
                + "**1. Core Intuition:**\n"
                + "Instead of checking every pair with a nested loop ($O(N^2)$), we can trade a little memory for massive speed ($O(N)$). As we iterate through `nums`, for each number $x$, we check if its complement `target - x` has already been seen.\n\n"
                + "**2. Step-by-Step Approach:**\n"
                + "1. Maintain a Hash Map `seen: value -> index`.\n"
                + "2. For each element `nums[i]` at index `i`:\n"
                + "   - Calculate `complement = target - nums[i]`.\n"
                + "   - If `complement` exists in `seen`, return `[seen.get(complement), i]`.\n"
                + "   - Otherwise, store `seen.put(nums[i], i)`.\n\n"
                + "**3. Implementation (Java):**\n"
                + "```java\n"
                + "public int[] twoSum(int[] nums, int target) {\n"
                + "    Map<Integer, Integer> seen = new HashMap<>();\n"
                + "    for (int i = 0; i < nums.length; i++) {\n"
                + "        int complement = target - nums[i];\n"
                + "        if (seen.containsKey(complement)) {\n"
                + "            return new int[]{seen.get(complement), i};\n"
                + "        }\n"
                + "        seen.put(nums[i], i);\n"
                + "    }\n"
                + "    throw new IllegalArgumentException(\"No two sum solution\");\n"
                + "}\n"
                + "```\n\n"
                + "**4. Complexity Analysis:**\n"
                + "- **Time Complexity:** $O(N)$ — Single pass through the array with $O(1)$ average hash map lookups.\n"
                + "- **Space Complexity:** $O(N)$ — To store up to $N$ elements in the hash map.\n\n"
                + "**5. Interview Edge Cases:**\n"
                + "- Duplicate numbers (e.g. `[3, 3]`, target `6`). Check complement before overwriting the map entry.\n"
                + "- Negative numbers and zero are handled seamlessly.";
    }

    private String threeSumGuide() {
        return headerBanner("3Sum — Sorting + Two Pointers")
                + "**1. Core Intuition:**\n"
                + "To find unique triplets `[a, b, c]` that sum to 0, sorting the array allows us to fix the first element $a$ and use **Two Pointers** (`left` and `right`) to find $b + c = -a$ in $O(N)$ time per element.\n\n"
                + "**2. Avoiding Duplicates (Crucial for Interviews):**\n"
                + "- If `i > 0 && nums[i] == nums[i-1]`, skip the iteration.\n"
                + "- After finding a valid triplet `nums[i] + nums[left] + nums[right] == 0`, advance `left` and `right` past identical adjacent values.\n\n"
                + "**3. Algorithm Outline:**\n"
                + "```java\n"
                + "Arrays.sort(nums);\n"
                + "List<List<Integer>> res = new ArrayList<>();\n"
                + "for (int i = 0; i < nums.length - 2; i++) {\n"
                + "    if (i > 0 && nums[i] == nums[i - 1]) continue;\n"
                + "    int left = i + 1, right = nums.length - 1;\n"
                + "    while (left < right) {\n"
                + "        int sum = nums[i] + nums[left] + nums[right];\n"
                + "        if (sum == 0) {\n"
                + "            res.add(List.of(nums[i], nums[left], nums[right]));\n"
                + "            while (left < right && nums[left] == nums[left + 1]) left++;\n"
                + "            while (left < right && nums[right] == nums[right - 1]) right--;\n"
                + "            left++; right--;\n"
                + "        } else if (sum < 0) left++;\n"
                + "        else right--;\n"
                + "    }\n"
                + "}\n"
                + "```\n\n"
                + "**4. Complexity:**\n"
                + "- **Time Complexity:** $O(N^2)$ — Sorting takes $O(N \\log N)$, and the outer loop with two pointers takes $O(N^2)$.\n"
                + "- **Space Complexity:** $O(1)$ auxiliary space (ignoring sorting/output).";
    }

    private String lruCacheGuide() {
        return headerBanner("LRU Cache — Hash Map + Doubly Linked List")
                + "**1. Requirement:**\n"
                + "`get(key)` and `put(key, value)` must both run in strictly $O(1)$ average time.\n\n"
                + "**2. Why HashMap + Doubly Linked List?**\n"
                + "- **HashMap<K, Node>**: Gives $O(1)$ key lookup to find the node.\n"
                + "- **Doubly Linked List (DLL)**: Allows $O(1)$ removal and insertion of any node once its reference is known (unlike singly linked list which requires finding the predecessor in $O(N)$).\n"
                + "- Use pseudo `head` and `tail` sentinel nodes to avoid edge-case null checks!\n\n"
                + "**3. Core Operations:**\n"
                + "- `get(key)`: If present, detach node from DLL and insert right after `head` (most recently used). Return `node.val`.\n"
                + "- `put(key, val)`: If key exists, update value and move to `head`. If new and capacity reached, remove `tail.prev` (least recently used) and evict from map. Then insert new node at `head`.\n\n"
                + "**4. Complexity:**\n"
                + "- **Time:** $O(1)$ for both `get` and `put`.\n"
                + "- **Space:** $O(capacity)$ memory footprint.";
    }

    private String reverseLinkedListGuide() {
        return headerBanner("Reverse Linked List — Iterative vs Recursive")
                + "**1. Iterative 3-Pointer Approach (Preferred in Interviews):**\n"
                + "We maintain three pointers: `prev = null`, `curr = head`, and temporary `next`.\n\n"
                + "```java\n"
                + "public ListNode reverseList(ListNode head) {\n"
                + "    ListNode prev = null;\n"
                + "    ListNode curr = head;\n"
                + "    while (curr != null) {\n"
                + "        ListNode next = curr.next; // save next\n"
                + "        curr.next = prev;          // reverse pointer\n"
                + "        prev = curr;               // advance prev\n"
                + "        curr = next;               // advance curr\n"
                + "    }\n"
                + "    return prev;\n"
                + "}\n"
                + "```\n\n"
                + "**2. Complexity:**\n"
                + "- **Time:** $O(N)$ single pass.\n"
                + "- **Space:** $O(1)$ auxiliary memory (iterative) vs $O(N)$ call stack (recursive).";
    }

    private String validParenthesesGuide() {
        return headerBanner("Valid Parentheses — Stack Matching")
                + "**1. Intuition:**\n"
                + "Parentheses must close in reverse of the order they opened (Last-In, First-Out). A **Stack** naturally models this.\n\n"
                + "**2. Elegant Implementation:**\n"
                + "Push the expected closing bracket whenever an opening bracket is encountered:\n"
                + "```java\n"
                + "public boolean isValid(String s) {\n"
                + "    Deque<Character> stack = new ArrayDeque<>();\n"
                + "    for (char c : s.toCharArray()) {\n"
                + "        if (c == '(') stack.push(')');\n"
                + "        else if (c == '{') stack.push('}');\n"
                + "        else if (c == '[') stack.push(']');\n"
                + "        else if (stack.isEmpty() || stack.pop() != c) return false;\n"
                + "    }\n"
                + "    return stack.isEmpty();\n"
                + "}\n"
                + "```\n"
                + "- **Time:** $O(N)$ | **Space:** $O(N)$.";
    }

    private String trappingRainWaterGuide() {
        return headerBanner("Trapping Rain Water — Two Pointers (O(1) Space)")
                + "**1. Key Insight:**\n"
                + "The water trapped above bar `i` is determined by `min(maxLeft, maxRight) - height[i]`.\n"
                + "By using two pointers `left` and `right`, whichever side has the smaller maximum limits the water height on that side!\n\n"
                + "**2. Algorithm:**\n"
                + "```java\n"
                + "int left = 0, right = height.length - 1;\n"
                + "int maxLeft = 0, maxRight = 0, water = 0;\n"
                + "while (left < right) {\n"
                + "    if (height[left] < height[right]) {\n"
                + "        if (height[left] >= maxLeft) maxLeft = height[left];\n"
                + "        else water += maxLeft - height[left];\n"
                + "        left++;\n"
                + "    } else {\n"
                + "        if (height[right] >= maxRight) maxRight = height[right];\n"
                + "        else water += maxRight - height[right];\n"
                + "        right--;\n"
                + "    }\n"
                + "}\n"
                + "```\n"
                + "- **Time Complexity:** $O(N)$ | **Space Complexity:** $O(1)$.";
    }

    private String longestSubstringGuide() {
        return headerBanner("Longest Substring Without Repeating Characters — Sliding Window")
                + "**1. Intuition:**\n"
                + "Maintain a window `[left, right]` where all characters are distinct. Store character -> last seen index.\n"
                + "When character `s[right]` was previously seen at `prevIndex >= left`, jump `left = prevIndex + 1`.\n\n"
                + "```java\n"
                + "Map<Character, Integer> lastSeen = new HashMap<>();\n"
                + "int maxLen = 0, left = 0;\n"
                + "for (int right = 0; right < s.length(); right++) {\n"
                + "    char c = s.charAt(right);\n"
                + "    if (lastSeen.containsKey(c)) {\n"
                + "        left = Math.max(left, lastSeen.get(c) + 1);\n"
                + "    }\n"
                + "    lastSeen.put(c, right);\n"
                + "    maxLen = Math.max(maxLen, right - left + 1);\n"
                + "}\n"
                + "```\n"
                + "- **Time:** $O(N)$ | **Space:** $O(\\min(N, \\Sigma))$ where $\\Sigma$ is alphabet size.";
    }

    private String mergeKSortedListsGuide() {
        return headerBanner("Merge K Sorted Lists — Min-Heap")
                + "**1. Optimal Pattern:**\n"
                + "Use a Min-Heap (PriorityQueue) of size $K$ storing the head node of each list.\n"
                + "Poll the smallest node, append it to the merged list, and if `node.next != null`, push `node.next`.\n\n"
                + "- **Time Complexity:** $O(N \\log K)$ where $N$ is total nodes, $K$ is number of lists.\n"
                + "- **Space Complexity:** $O(K)$ for the priority queue.";
    }

    private String numberOfIslandsGuide() {
        return headerBanner("Number of Islands — Grid BFS/DFS")
                + "**1. Approach:**\n"
                + "Iterate through every cell `(r, c)`. When `grid[r][c] == '1'`, increment `islandCount` and run a BFS/DFS to sink all connected land cells by setting them to `'0'` (or marking visited).\n\n"
                + "- **Time Complexity:** $O(R \\times C)$ — Each cell visited a constant number of times.\n"
                + "- **Space Complexity:** $O(R \\times C)$ worst-case call stack or queue.";
    }

    private String coinChangeGuide() {
        return headerBanner("Coin Change — Unbounded Knapsack DP")
                + "**1. State Definition:**\n"
                + "`dp[a]` = minimum coins required to make amount `a`.\n"
                + "- Base Case: `dp[0] = 0`, initialize all other entries to `amount + 1`.\n"
                + "- Transition: For each coin $c$: `dp[a] = min(dp[a], dp[a - c] + 1)` for $a \\ge c$.\n\n"
                + "- **Time Complexity:** $O(\\text{amount} \\times \\text{coins.length})$\n"
                + "- **Space Complexity:** $O(\\text{amount})$ 1D array.";
    }

    private String climbingStairsGuide() {
        return headerBanner("Climbing Stairs — Fibonacci DP")
                + "**1. Recurrence:**\n"
                + "To reach step $n$, you must come from step $n-1$ or step $n-2$.\n"
                + "`dp[n] = dp[n-1] + dp[n-2]` with `dp[1] = 1, dp[2] = 2`.\n"
                + "- **Space Optimization:** Maintain only two variables `prev1` and `prev2`.\n"
                + "- **Time:** $O(N)$ | **Space:** $O(1)$.";
    }

    private String kadaneGuide() {
        return headerBanner("Maximum Subarray — Kadane's Algorithm")
                + "**1. Core Intuition:**\n"
                + "At each index `i`, decide: should I extend the existing subarray sum, or start fresh from `nums[i]`?\n"
                + "`currentMax = Math.max(nums[i], currentMax + nums[i])`\n"
                + "`globalMax = Math.max(globalMax, currentMax)`\n\n"
                + "- **Time:** $O(N)$ single pass | **Space:** $O(1)$ memory.";
    }

    private String rotatedBinarySearchGuide() {
        return headerBanner("Search in Rotated Sorted Array — Modified Binary Search")
                + "**1. Key Insight:**\n"
                + "In any rotated sorted array, splitting at `mid` always leaves **at least one half sorted**!\n"
                + "1. If `nums[left] <= nums[mid]`: left half is sorted.\n"
                + "   - If `target >= nums[left] && target < nums[mid]`, search left (`right = mid - 1`), else search right.\n"
                + "2. Otherwise: right half is sorted.\n"
                + "   - If `target > nums[mid] && target <= nums[right]`, search right (`left = mid + 1`), else search left.\n\n"
                + "- **Time:** $O(\\log N)$ | **Space:** $O(1)$.";
    }

    private String slidingWindowPatternGuide() {
        return headerBanner("Sliding Window Pattern — Universal Framework")
                + "**When to use:** Contiguous subarrays/substrings where you need to maximize, minimize, or count valid windows.\n\n"
                + "**The Standard Template (Java):**\n"
                + "```java\n"
                + "int left = 0;\n"
                + "for (int right = 0; right < n; right++) {\n"
                + "    // 1. Expand window: include element at right\n"
                + "    add(nums[right]);\n"
                + "\n"
                + "    // 2. Shrink window while invalid\n"
                + "    while (windowIsInvalid()) {\n"
                + "        remove(nums[left]);\n"
                + "        left++;\n"
                + "    }\n"
                + "\n"
                + "    // 3. Update answer with valid window [left, right]\n"
                + "    maxLen = Math.max(maxLen, right - left + 1);\n"
                + "}\n"
                + "```\n"
                + "- **Time Complexity:** $O(N)$ amortized — each pointer increments at most $N$ times.";
    }

    private String twoPointersPatternGuide() {
        return headerBanner("Two Pointers Pattern — When and How")
                + "**Common Variants:**\n"
                + "1. **Converging Pointers:** Opposite ends moving inward (Two Sum II sorted, 3Sum, Valid Palindrome, Container With Most Water).\n"
                + "2. **Fast & Slow Pointers (Floyd's):** Cycle detection in linked lists, find middle node.\n"
                + "3. **Sliding Pointers:** Same direction maintaining a range.\n\n"
                + "**Pro Tip:** If an array is unsorted and you need pairs or triplets, sorting ($O(N \\log N)$) often unlocks the two-pointer technique ($O(N)$).";
    }

    private String monotonicStackGuide() {
        return headerBanner("Monotonic Stack — Next Greater / Smaller Element")
                + "**What is it?** A stack where elements are strictly increasing or decreasing.\n\n"
                + "**Template for Next Greater Element:**\n"
                + "```java\n"
                + "Deque<Integer> stack = new ArrayDeque<>(); // stores indices\n"
                + "int[] nextGreater = new int[n];\n"
                + "Arrays.fill(nextGreater, -1);\n"
                + "for (int i = 0; i < n; i++) {\n"
                + "    while (!stack.isEmpty() && nums[stack.peek()] < nums[i]) {\n"
                + "        int prevIdx = stack.pop();\n"
                + "        nextGreater[prevIdx] = nums[i];\n"
                + "    }\n"
                + "    stack.push(i);\n"
                + "}\n"
                + "```\n"
                + "- Each element is pushed and popped at most once: **$O(N)$ time**.";
    }

    private String binarySearchGuide() {
        return headerBanner("Binary Search — The Invariant Template")
                + "To avoid infinite loops and off-by-one errors:\n"
                + "```java\n"
                + "int left = 0, right = nums.length - 1;\n"
                + "while (left <= right) {\n"
                + "    int mid = left + (right - left) / 2; // prevent integer overflow\n"
                + "    if (nums[mid] == target) return mid;\n"
                + "    else if (nums[mid] < target) left = mid + 1;\n"
                + "    else right = mid - 1;\n"
                + "}\n"
                + "return -1; // not found\n"
                + "```\n"
                + "**Binary Search on Answer:**\n"
                + "If a predicate function `check(k)` is monotonic (e.g. `FFFFTTTT`), you can binary search for the first valid threshold!";
    }

    private String dynamicProgrammingFrameworkGuide() {
        return headerBanner("Dynamic Programming — 5-Step Mastery Framework")
                + "1. **State Representation:** What parameters uniquely define a subproblem? (e.g., `dp[i]` or `dp[i][j]`).\n"
                + "2. **Recurrence Relation:** How does the current state depend on smaller subproblems?\n"
                + "3. **Base Cases:** Smallest trivial inputs (e.g., empty string, 0 capacity).\n"
                + "4. **Order of Computation:** Ensure dependencies are computed before the current state (Top-down Memoization vs Bottom-up Tabulation).\n"
                + "5. **Space Optimization:** If `dp[i]` only depends on `dp[i-1]`, collapse the array to 2 variables or 1D array.";
    }

    private String treeTraversalGuide() {
        return headerBanner("Binary Tree Traversals — BFS vs DFS")
                + "- **DFS Pre-order (Root, Left, Right):** Great for cloning/serializing trees.\n"
                + "- **DFS In-order (Left, Root, Right):** Yields sorted order for Binary Search Trees (BST).\n"
                + "- **DFS Post-order (Left, Right, Root):** Bottom-up computation (e.g. maximum depth, diameter, LCA).\n"
                + "- **BFS Level-Order:** Queue-based traversal, finds shortest path in unweighted graphs/trees.";
    }

    private String graphGuide() {
        return headerBanner("Graph Algorithms — Cheat Sheet")
                + "- **BFS (Queue):** Shortest path in unweighted graph. Time: $O(V + E)$.\n"
                + "- **DFS (Recursion/Stack):** Cycle detection, connected components, path finding.\n"
                + "- **Dijkstra (Min-Heap):** Single-source shortest path with non-negative edge weights. Time: $O((V + E) \\log V)$.\n"
                + "- **Topological Sort (Kahn's / In-degree):** Dependency resolution in Directed Acyclic Graphs (DAGs). Course Schedule.\n"
                + "- **Union-Find (DSU):** Dynamic connectivity, Kruskal's MST. Near $O(1)$ with path compression and rank.";
    }

    private String heapGuide() {
        return headerBanner("Heap / Priority Queue Patterns")
                + "- **Top K Elements:** Use a Min-Heap of size $K$ to find the $K$ largest elements in $O(N \\log K)$ time.\n"
                + "- **Median of Stream:** Two heaps (Max-heap for lower half, Min-heap for upper half).\n"
                + "- In Java: `PriorityQueue<Integer> minHeap = new PriorityQueue<>();`\n"
                + "  `PriorityQueue<Integer> maxHeap = new PriorityQueue<>(Collections.reverseOrder());`";
    }

    private String complexityAnalysisGuide() {
        return headerBanner("Big-O Complexity Quick Reference")
                + "| Complexity | Practical Constraint ($10^7$ ops/sec budget) |\n"
                + "|---|---|\n"
                + "| **$O(1)$** | Any size (Hash Map, Math) |\n"
                + "| **$O(\\log N)$** | $N \\le 10^{18}$ (Binary Search) |\n"
                + "| **$O(N)$** | $N \\le 10^7$ (Two Pointers, Sliding Window, Hash Table) |\n"
                + "| **$O(N \\log N)$** | $N \\le 10^6$ (Sorting, Heaps, Divide & Conquer) |\n"
                + "| **$O(N^2)$** | $N \\le 5000$ (Nested loops, 2D DP) |\n"
                + "| **$O(2^N)$** | $N \\le 20$ (Subsets, Recursion) |\n"
                + "| **$O(N!)$** | $N \\le 11$ (Permutations) |\n\n"
                + "**Auxiliary Space:** Memory used by the algorithm excluding the input itself.";
    }

    private String interviewStrategyGuide() {
        return headerBanner("4-Step Technical Interview Framework")
                + "1. **Clarify (2-3 min):** Ask about constraints, scale ($N$), data types, null/empty cases.\n"
                + "2. **Explore & State Baseline (3-5 min):** Outline the brute force approach, state its complexity ($O(N^2)$), and explain where the bottleneck is.\n"
                + "3. **Propose Optimal Solution (3-5 min):** Explain the intuition before coding. Walk through a small sample input with your interviewer.\n"
                + "4. **Code & Dry-Run (15-20 min):** Write clean, modular code. Trace line-by-line with edge cases (empty list, single element, duplicates).";
    }

    private String contextualDsaGuide(String query) {
        return headerBanner("Algorithmic Breakdown & Solution Blueprint")
                + "**Your Query:** *\"" + query + "\"*\n\n"
                + "**1. Recommended Problem-Solving Steps:**\n"
                + "- **Clarify the Constraints:** Look at the size of $N$. If $N \\le 10^5$, aim for an $O(N)$ or $O(N \\log N)$ solution.\n"
                + "- **Data Structure Matching:**\n"
                + "  - Need fast lookups? Use a **Hash Map / Set** ($O(1)$ average).\n"
                + "  - Sorted input or finding bounds? Consider **Two Pointers** or **Binary Search**.\n"
                + "  - Overlapping subproblems with optimal substructure? Formulate a **Dynamic Programming** state.\n"
                + "  - Searching levels or shortest paths? Use a **Breadth-First Search (Queue)**.\n\n"
                + "**2. Implementation Blueprint:**\n"
                + "```java\n"
                + "// 1. Validate inputs and edge cases\n"
                + "if (input == null || input.isEmpty()) return defaultValue;\n"
                + "\n"
                + "// 2. Apply optimal pattern\n"
                + "// Process elements efficiently in single pass or sorted traversal\n"
                + "\n"
                + "// 3. Return target result with verified invariants\n"
                + "```\n\n"
                + "**3. Next Steps:**\n"
                + "Tell me the specific inputs and constraints, and I will write out the full optimal solution with a line-by-line dry run!";
    }
}
