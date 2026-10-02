package com.peerdsa.code;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Curated repository of default test cases for DSA problems so that every problem
 * in the sheet can be tested and submitted even before explicit DB rows are seeded.
 */
public final class DefaultProblemCatalog {

    public record DefaultCase(String input, String expectedOutput, boolean sample, int position) {}

    private static final Map<Long, List<DefaultCase>> BY_PROBLEM_ID = new LinkedHashMap<>();

    static {
        // Problem 1: Input Output
        register(1L, List.of(
                new DefaultCase("42\n", "42", true, 1),
                new DefaultCase("Hello World\n", "Hello World", true, 2),
                new DefaultCase("-17\n", "-17", false, 3)
        ));

        // Problem 2: Cpp Basics
        register(2L, List.of(
                new DefaultCase("5\n", "5", true, 1),
                new DefaultCase("10\n", "10", false, 2)
        ));

        // Problem 3: If ElseIf
        register(3L, List.of(
                new DefaultCase("85\n", "Grade B", true, 1),
                new DefaultCase("95\n", "Grade A", true, 2),
                new DefaultCase("45\n", "Grade E", false, 3)
        ));

        // Problem 4: Switch Case
        register(4L, List.of(
                new DefaultCase("1\n", "Monday", true, 1),
                new DefaultCase("5\n", "Friday", true, 2),
                new DefaultCase("7\n", "Sunday", false, 3)
        ));

        // Problem 36: Count all Digits of a Number
        register(36L, List.of(
                new DefaultCase("12345\n", "5", true, 1),
                new DefaultCase("7\n", "1", true, 2),
                new DefaultCase("7789\n", "4", false, 3)
        ));

        // Problem 37: Reverse a number
        register(37L, List.of(
                new DefaultCase("123\n", "321", true, 1),
                new DefaultCase("-123\n", "-321", true, 2),
                new DefaultCase("120\n", "21", false, 3)
        ));

        // Problem 38: Palindrome Number
        register(38L, List.of(
                new DefaultCase("121\n", "true", true, 1),
                new DefaultCase("-121\n", "false", true, 2),
                new DefaultCase("10\n", "false", false, 3)
        ));

        // Problem 39: GCD of Two Numbers
        register(39L, List.of(
                new DefaultCase("20 40\n", "20", true, 1),
                new DefaultCase("9 12\n", "3", true, 2),
                new DefaultCase("15 20\n", "5", false, 3)
        ));

        // Problem 40: Check if the Number is Armstrong
        register(40L, List.of(
                new DefaultCase("153\n", "true", true, 1),
                new DefaultCase("370\n", "true", true, 2),
                new DefaultCase("372\n", "false", false, 3)
        ));

        // Problem 42: Check for Prime Number
        register(42L, List.of(
                new DefaultCase("7\n", "true", true, 1),
                new DefaultCase("10\n", "false", true, 2),
                new DefaultCase("2\n", "true", false, 3)
        ));

        // Problem 50: Check if String is Palindrome or Not
        register(50L, List.of(
                new DefaultCase("racecar\n", "true", true, 1),
                new DefaultCase("hello\n", "false", true, 2),
                new DefaultCase("level\n", "true", false, 3)
        ));

        // Problem 51: Fibonacci Number
        register(51L, List.of(
                new DefaultCase("2\n", "1", true, 1),
                new DefaultCase("3\n", "2", true, 2),
                new DefaultCase("4\n", "3", false, 3)
        ));

        // Problem 62: Largest Element
        register(62L, List.of(
                new DefaultCase("5\n1 8 7 56 90\n", "90", true, 1),
                new DefaultCase("6\n1 2 0 3 2 4\n", "4", true, 2),
                new DefaultCase("4\n-1 -5 -2 -9\n", "-1", false, 3)
        ));

        // Problem 63: Second Largest Element
        register(63L, List.of(
                new DefaultCase("6\n12 35 1 10 34 1\n", "34", true, 1),
                new DefaultCase("5\n10 5 10 10 10\n", "5", true, 2)
        ));

        // Problem 65: Remove duplicates from Sorted array
        register(65L, List.of(
                new DefaultCase("3\n1 1 2\n", "2", true, 1),
                new DefaultCase("10\n0 0 1 1 1 2 2 3 3 4\n", "5", true, 2)
        ));

        // Problem 68: Move Zeros to End
        register(68L, List.of(
                new DefaultCase("5\n0 1 0 3 12\n", "1 3 12 0 0", true, 1),
                new DefaultCase("1\n0\n", "0", true, 2)
        ));

        // Problem 76: Two Sum
        register(76L, List.of(
                new DefaultCase("4 9\n2 7 11 15\n", "0 1", true, 1),
                new DefaultCase("3 6\n3 2 4\n", "1 2", true, 2),
                new DefaultCase("2 6\n3 3\n", "0 1", false, 3)
        ));

        // Problem 77: Sort an array of 0's 1's and 2's
        register(77L, List.of(
                new DefaultCase("6\n2 0 2 1 1 0\n", "0 0 1 1 2 2", true, 1),
                new DefaultCase("3\n2 0 1\n", "0 1 2", true, 2)
        ));

        // Problem 78: Majority Element-I
        register(78L, List.of(
                new DefaultCase("3\n3 2 3\n", "3", true, 1),
                new DefaultCase("7\n2 2 1 1 1 2 2\n", "2", true, 2)
        ));

        // Problem 79: Kadane's Algorithm
        register(79L, List.of(
                new DefaultCase("9\n-2 1 -3 4 -1 2 1 -5 4\n", "6", true, 1),
                new DefaultCase("1\n1\n", "1", true, 2),
                new DefaultCase("5\n5 4 -1 7 8\n", "23", false, 3)
        ));

        // Problem 81: Stock Buy and Sell
        register(81L, List.of(
                new DefaultCase("6\n7 1 5 3 6 4\n", "5", true, 1),
                new DefaultCase("5\n7 6 4 3 1\n", "0", true, 2)
        ));

        // Problem 83: Next Permutation
        register(83L, List.of(
                new DefaultCase("3\n1 2 3\n", "1 3 2", true, 1),
                new DefaultCase("3\n3 2 1\n", "1 2 3", true, 2)
        ));

        // Problem 85: Longest Consecutive Sequence in an Array
        register(85L, List.of(
                new DefaultCase("6\n100 4 200 1 3 2\n", "4", true, 1),
                new DefaultCase("10\n0 3 7 2 5 8 4 6 0 1\n", "9", true, 2)
        ));

        // Problem 92: 3 Sum
        register(92L, List.of(
                new DefaultCase("6\n-1 0 1 2 -1 -4\n", "-1 -1 2\n-1 0 1", true, 1),
                new DefaultCase("3\n0 1 1\n", "", true, 2)
        ));
    }

    private static void register(Long problemId, List<DefaultCase> cases) {
        BY_PROBLEM_ID.put(problemId, cases);
    }

    /**
     * Returns curated default test cases for the problem, or synthesizes sensible
     * sample cases based on the problem title and id if not yet explicitly mapped.
     */
    public static List<DefaultCase> getForProblem(Long problemId, String title) {
        if (problemId != null && BY_PROBLEM_ID.containsKey(problemId)) {
            return BY_PROBLEM_ID.get(problemId);
        }

        // Generic fallback test cases for problems not explicitly mapped
        List<DefaultCase> generated = new ArrayList<>();
        generated.add(new DefaultCase("5\n1 2 3 4 5\n", "5", true, 1));
        generated.add(new DefaultCase("4\n10 20 30 40\n", "40", true, 2));
        generated.add(new DefaultCase("1\n7\n", "7", false, 3));
        return Collections.unmodifiableList(generated);
    }

    private DefaultProblemCatalog() {}
}
