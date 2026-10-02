import { Injectable } from '@angular/core';
import { Problem } from '../models/api.models';

export interface ProblemExample {
  input: string;
  output: string;
  explanation?: string;
}

export interface ProblemSpec {
  statement: string;
  examples: ProblemExample[];
  constraints: string[];
  followUp?: string;
  defaultTestCases: { input: string; expectedOutput: string; sample: boolean }[];
}

@Injectable({ providedIn: 'root' })
export class ProblemCatalogService {
  private readonly catalog: Record<number, ProblemSpec> = {
    1: {
      statement:
        'Given an input value from standard input, read it and print it back to standard output.',
      examples: [
        { input: '42', output: '42' },
        { input: 'Hello World', output: 'Hello World' },
      ],
      constraints: ['Input length <= 100 characters', 'Supports integers, floating point numbers, and strings'],
      defaultTestCases: [
        { input: '42\n', expectedOutput: '42', sample: true },
        { input: 'Hello World\n', expectedOutput: 'Hello World', sample: true },
        { input: '-17\n', expectedOutput: '-17', sample: false },
      ],
    },
    2: {
      statement: 'Read an integer N from standard input and print the value of N.',
      examples: [
        { input: '5', output: '5' },
        { input: '10', output: '10' },
      ],
      constraints: ['-10^9 <= N <= 10^9'],
      defaultTestCases: [
        { input: '5\n', expectedOutput: '5', sample: true },
        { input: '10\n', expectedOutput: '10', sample: false },
      ],
    },
    3: {
      statement:
        'Given the total marks of a student out of 100, determine and print their grade according to standard thresholds:\n\n- Marks >= 90: Grade A\n- Marks >= 80 and < 90: Grade B\n- Marks >= 70 and < 80: Grade C\n- Marks >= 60 and < 70: Grade D\n- Marks < 60: Grade E',
      examples: [
        { input: '85', output: 'Grade B', explanation: '85 falls in the range [80, 90).' },
        { input: '95', output: 'Grade A', explanation: '95 is >= 90.' },
      ],
      constraints: ['0 <= Marks <= 100'],
      defaultTestCases: [
        { input: '85\n', expectedOutput: 'Grade B', sample: true },
        { input: '95\n', expectedOutput: 'Grade A', sample: true },
        { input: '45\n', expectedOutput: 'Grade E', sample: false },
      ],
    },
    4: {
      statement:
        'Given an integer day number (1 to 7), print the corresponding day name using a switch-case statement.\n\n1: Monday, 2: Tuesday, 3: Wednesday, 4: Thursday, 5: Friday, 6: Saturday, 7: Sunday.',
      examples: [
        { input: '1', output: 'Monday' },
        { input: '5', output: 'Friday' },
      ],
      constraints: ['1 <= day <= 7'],
      defaultTestCases: [
        { input: '1\n', expectedOutput: 'Monday', sample: true },
        { input: '5\n', expectedOutput: 'Friday', sample: true },
        { input: '7\n', expectedOutput: 'Sunday', sample: false },
      ],
    },
    36: {
      statement: 'Given an integer N, count and print the total number of digits in N.',
      examples: [
        { input: '12345', output: '5', explanation: '12345 has 5 digits.' },
        { input: '7', output: '1', explanation: '7 has 1 digit.' },
      ],
      constraints: ['1 <= N <= 10^9', 'Time Complexity: O(log10(N))', 'Space Complexity: O(1)'],
      defaultTestCases: [
        { input: '12345\n', expectedOutput: '5', sample: true },
        { input: '7\n', expectedOutput: '1', sample: true },
        { input: '7789\n', expectedOutput: '4', sample: false },
      ],
    },
    37: {
      statement:
        'Given a 32-bit signed integer x, reverse digits of x. If reversing x causes the value to go outside the signed 32-bit integer range [-2^31, 2^31 - 1], return 0.',
      examples: [
        { input: '123', output: '321' },
        { input: '-123', output: '-321' },
        { input: '120', output: '21' },
      ],
      constraints: ['-2^31 <= x <= 2^31 - 1', 'Assume 32-bit integer environment'],
      defaultTestCases: [
        { input: '123\n', expectedOutput: '321', sample: true },
        { input: '-123\n', expectedOutput: '-321', sample: true },
        { input: '120\n', expectedOutput: '21', sample: false },
      ],
    },
    38: {
      statement:
        'Given an integer x, return true if x is a palindrome, and false otherwise. An integer is a palindrome when it reads the same forward and backward.',
      examples: [
        { input: '121', output: 'true', explanation: '121 reads as 121 from left to right and from right to left.' },
        { input: '-121', output: 'false', explanation: 'From left to right it reads -121. From right to left it becomes 121-.' },
        { input: '10', output: 'false', explanation: 'Reads 01 from right to left.' },
      ],
      constraints: ['-2^31 <= x <= 2^31 - 1'],
      followUp: 'Could you solve it without converting the integer to a string?',
      defaultTestCases: [
        { input: '121\n', expectedOutput: 'true', sample: true },
        { input: '-121\n', expectedOutput: 'false', sample: true },
        { input: '10\n', expectedOutput: 'false', sample: false },
      ],
    },
    39: {
      statement:
        'Given two positive integers a and b, find their Greatest Common Divisor (GCD) / Highest Common Factor (HCF) using the Euclidean algorithm.',
      examples: [
        { input: '20 40', output: '20' },
        { input: '9 12', output: '3' },
      ],
      constraints: ['1 <= a, b <= 10^9', 'Time Complexity: O(log(min(a, b)))'],
      defaultTestCases: [
        { input: '20 40\n', expectedOutput: '20', sample: true },
        { input: '9 12\n', expectedOutput: '3', sample: true },
        { input: '15 20\n', expectedOutput: '5', sample: false },
      ],
    },
    40: {
      statement:
        'An Armstrong number is an n-digit number that is equal to the sum of the nth powers of its individual digits. Given N, print true if N is an Armstrong number, otherwise false.',
      examples: [
        { input: '153', output: 'true', explanation: '1^3 + 5^3 + 3^3 = 1 + 125 + 27 = 153.' },
        { input: '372', output: 'false', explanation: '3^3 + 7^3 + 2^3 = 27 + 343 + 8 = 378 != 372.' },
      ],
      constraints: ['1 <= N <= 10^9'],
      defaultTestCases: [
        { input: '153\n', expectedOutput: 'true', sample: true },
        { input: '370\n', expectedOutput: 'true', sample: true },
        { input: '372\n', expectedOutput: 'false', sample: false },
      ],
    },
    42: {
      statement: 'Given an integer N, check whether N is a prime number. Print true if prime, else false.',
      examples: [
        { input: '7', output: 'true', explanation: '7 has only two factors: 1 and 7.' },
        { input: '10', output: 'false', explanation: '10 is divisible by 2 and 5.' },
      ],
      constraints: ['1 <= N <= 10^9', 'Optimal Time: O(sqrt(N))'],
      defaultTestCases: [
        { input: '7\n', expectedOutput: 'true', sample: true },
        { input: '10\n', expectedOutput: 'false', sample: true },
        { input: '2\n', expectedOutput: 'true', sample: false },
      ],
    },
    50: {
      statement:
        'A phrase is a palindrome if, after converting all uppercase letters into lowercase letters and removing all non-alphanumeric characters, it reads the same forward and backward. Given a string s, print true if it is a palindrome, or false otherwise.',
      examples: [
        { input: 'racecar', output: 'true' },
        { input: 'hello', output: 'false' },
      ],
      constraints: ['1 <= s.length <= 2 * 10^5', 's consists only of printable ASCII characters.'],
      defaultTestCases: [
        { input: 'racecar\n', expectedOutput: 'true', sample: true },
        { input: 'hello\n', expectedOutput: 'false', sample: true },
        { input: 'level\n', expectedOutput: 'true', sample: false },
      ],
    },
    51: {
      statement:
        'The Fibonacci numbers, commonly denoted F(n) form a sequence called the Fibonacci sequence, such that each number is the sum of the two preceding ones, starting from 0 and 1:\n\nF(0) = 0, F(1) = 1\nF(n) = F(n - 1) + F(n - 2), for n > 1.\n\nGiven n, calculate F(n).',
      examples: [
        { input: '2', output: '1', explanation: 'F(2) = F(1) + F(0) = 1 + 0 = 1.' },
        { input: '3', output: '2', explanation: 'F(3) = F(2) + F(1) = 1 + 1 = 2.' },
        { input: '4', output: '3', explanation: 'F(4) = F(3) + F(2) = 2 + 1 = 3.' },
      ],
      constraints: ['0 <= n <= 30'],
      defaultTestCases: [
        { input: '2\n', expectedOutput: '1', sample: true },
        { input: '3\n', expectedOutput: '2', sample: true },
        { input: '4\n', expectedOutput: '3', sample: false },
      ],
    },
    62: {
      statement: 'Given an array of integers nums of size n, find and print the largest element in the array.',
      examples: [
        { input: '5\n1 8 7 56 90', output: '90' },
        { input: '6\n1 2 0 3 2 4', output: '4' },
      ],
      constraints: ['1 <= n <= 10^5', '-10^9 <= nums[i] <= 10^9', 'Time Complexity: O(N)'],
      defaultTestCases: [
        { input: '5\n1 8 7 56 90\n', expectedOutput: '90', sample: true },
        { input: '6\n1 2 0 3 2 4\n', expectedOutput: '4', sample: true },
        { input: '4\n-1 -5 -2 -9\n', expectedOutput: '-1', sample: false },
      ],
    },
    63: {
      statement:
        'Given an array of positive integers nums of size n, find and print the second largest element in the array without sorting. If no second largest exists, print -1.',
      examples: [
        { input: '6\n12 35 1 10 34 1', output: '34' },
        { input: '5\n10 5 10 10 10', output: '5' },
      ],
      constraints: ['2 <= n <= 10^5', '1 <= nums[i] <= 10^9', 'Time Complexity: O(N)', 'Space Complexity: O(1)'],
      defaultTestCases: [
        { input: '6\n12 35 1 10 34 1\n', expectedOutput: '34', sample: true },
        { input: '5\n10 5 10 10 10\n', expectedOutput: '5', sample: true },
      ],
    },
    65: {
      statement:
        'Given an integer array nums sorted in non-decreasing order, remove the duplicates in-place such that each unique element appears only once. Print the number of unique elements k.',
      examples: [
        { input: '3\n1 1 2', output: '2', explanation: 'The first two elements are 1 and 2.' },
        { input: '10\n0 0 1 1 1 2 2 3 3 4', output: '5', explanation: 'Unique elements are 0, 1, 2, 3, 4.' },
      ],
      constraints: ['1 <= nums.length <= 3 * 10^4', '-100 <= nums[i] <= 100', 'nums is sorted in non-decreasing order.'],
      defaultTestCases: [
        { input: '3\n1 1 2\n', expectedOutput: '2', sample: true },
        { input: '10\n0 0 1 1 1 2 2 3 3 4\n', expectedOutput: '5', sample: true },
      ],
    },
    68: {
      statement:
        'Given an integer array nums, move all 0\'s to the end of it while maintaining the relative order of the non-zero elements. You must do this in-place without making a copy of the array.',
      examples: [
        { input: '5\n0 1 0 3 12', output: '1 3 12 0 0' },
        { input: '1\n0', output: '0' },
      ],
      constraints: ['1 <= nums.length <= 10^4', '-2^31 <= nums[i] <= 2^31 - 1'],
      defaultTestCases: [
        { input: '5\n0 1 0 3 12\n', expectedOutput: '1 3 12 0 0', sample: true },
        { input: '1\n0\n', expectedOutput: '0', sample: true },
      ],
    },
    76: {
      statement:
        'Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target.\n\nYou may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order (print the 0-indexed positions separated by space).',
      examples: [
        {
          input: '4 9\n2 7 11 15',
          output: '0 1',
          explanation: 'Because nums[0] + nums[1] == 2 + 7 == 9, we return 0 1.',
        },
        {
          input: '3 6\n3 2 4',
          output: '1 2',
          explanation: 'nums[1] + nums[2] == 2 + 4 == 6, we return 1 2.',
        },
      ],
      constraints: [
        '2 <= nums.length <= 10^4',
        '-10^9 <= nums[i] <= 10^9',
        '-10^9 <= target <= 10^9',
        'Only one valid answer exists.',
      ],
      followUp: 'Can you come up with an algorithm that is less than O(n^2) time complexity?',
      defaultTestCases: [
        { input: '4 9\n2 7 11 15\n', expectedOutput: '0 1', sample: true },
        { input: '3 6\n3 2 4\n', expectedOutput: '1 2', sample: true },
        { input: '2 6\n3 3\n', expectedOutput: '0 1', sample: false },
      ],
    },
    77: {
      statement:
        'Given an array nums with n objects colored red, white, or blue, sort them in-place so that objects of the same color are adjacent, with the colors in the order red, white, and blue.\n\nWe will use the integers 0, 1, and 2 to represent the color red, white, and blue, respectively. You must solve this problem without using the library\'s sort function (Dutch National Flag Algorithm).',
      examples: [
        { input: '6\n2 0 2 1 1 0', output: '0 0 1 1 2 2' },
        { input: '3\n2 0 1', output: '0 1 2' },
      ],
      constraints: ['n == nums.length', '1 <= n <= 300', 'nums[i] is either 0, 1, or 2.'],
      followUp: 'Could you come up with a one-pass algorithm using only constant extra space?',
      defaultTestCases: [
        { input: '6\n2 0 2 1 1 0\n', expectedOutput: '0 0 1 1 2 2', sample: true },
        { input: '3\n2 0 1\n', expectedOutput: '0 1 2', sample: true },
      ],
    },
    78: {
      statement:
        'Given an array nums of size n, return the majority element. The majority element is the element that appears more than ⌊n / 2⌋ times.\n\nYou may assume that the majority element always exists in the array (Moore\'s Voting Algorithm).',
      examples: [
        { input: '3\n3 2 3', output: '3' },
        { input: '7\n2 2 1 1 1 2 2', output: '2' },
      ],
      constraints: ['n == nums.length', '1 <= n <= 5 * 10^4', '-10^9 <= nums[i] <= 10^9'],
      followUp: 'Could you solve the problem in linear time and in O(1) space?',
      defaultTestCases: [
        { input: '3\n3 2 3\n', expectedOutput: '3', sample: true },
        { input: '7\n2 2 1 1 1 2 2\n', expectedOutput: '2', sample: true },
      ],
    },
    79: {
      statement:
        'Given an integer array nums, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum (Kadane\'s Algorithm).',
      examples: [
        {
          input: '9\n-2 1 -3 4 -1 2 1 -5 4',
          output: '6',
          explanation: 'The subarray [4, -1, 2, 1] has the largest sum 6.',
        },
        { input: '1\n1', output: '1' },
        { input: '5\n5 4 -1 7 8', output: '23' },
      ],
      constraints: ['1 <= nums.length <= 10^5', '-10^4 <= nums[i] <= 10^4'],
      followUp: 'If you have figured out the O(n) solution, try coding another solution using the divide and conquer approach, which is more subtle.',
      defaultTestCases: [
        { input: '9\n-2 1 -3 4 -1 2 1 -5 4\n', expectedOutput: '6', sample: true },
        { input: '1\n1\n', expectedOutput: '1', sample: true },
        { input: '5\n5 4 -1 7 8\n', expectedOutput: '23', sample: false },
      ],
    },
    81: {
      statement:
        'You are given an array prices where prices[i] is the price of a given stock on the ith day.\n\nYou want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock.\n\nReturn the maximum profit you can achieve from this transaction. If you cannot achieve any profit, return 0.',
      examples: [
        {
          input: '6\n7 1 5 3 6 4',
          output: '5',
          explanation: 'Buy on day 2 (price = 1) and sell on day 5 (price = 6), profit = 6 - 1 = 5.',
        },
        {
          input: '5\n7 6 4 3 1',
          output: '0',
          explanation: 'In this case, no transactions are done and the max profit = 0.',
        },
      ],
      constraints: ['1 <= prices.length <= 10^5', '0 <= prices[i] <= 10^4'],
      defaultTestCases: [
        { input: '6\n7 1 5 3 6 4\n', expectedOutput: '5', sample: true },
        { input: '5\n7 6 4 3 1\n', expectedOutput: '0', sample: true },
      ],
    },
    83: {
      statement:
        'A permutation of an array of integers is an arrangement of its members into a sequence or linear order. The next permutation of an array of integers is the next lexicographically greater permutation of its integer. Given an array of integers nums, find the next permutation of nums in-place.',
      examples: [
        { input: '3\n1 2 3', output: '1 3 2' },
        { input: '3\n3 2 1', output: '1 2 3' },
        { input: '3\n1 1 5', output: '1 5 1' },
      ],
      constraints: ['1 <= nums.length <= 100', '0 <= nums[i] <= 100'],
      defaultTestCases: [
        { input: '3\n1 2 3\n', expectedOutput: '1 3 2', sample: true },
        { input: '3\n3 2 1\n', expectedOutput: '1 2 3', sample: true },
      ],
    },
    85: {
      statement:
        'Given an unsorted array of integers nums, return the length of the longest consecutive elements sequence. You must write an algorithm that runs in O(n) time.',
      examples: [
        {
          input: '6\n100 4 200 1 3 2',
          output: '4',
          explanation: 'The longest consecutive elements sequence is [1, 2, 3, 4]. Therefore its length is 4.',
        },
        { input: '10\n0 3 7 2 5 8 4 6 0 1', output: '9' },
      ],
      constraints: ['0 <= nums.length <= 10^5', '-10^9 <= nums[i] <= 10^9'],
      defaultTestCases: [
        { input: '6\n100 4 200 1 3 2\n', expectedOutput: '4', sample: true },
        { input: '10\n0 3 7 2 5 8 4 6 0 1\n', expectedOutput: '9', sample: true },
      ],
    },
    92: {
      statement:
        'Given an integer array nums, return all the unique triplets [nums[i], nums[j], nums[k]] such that i != j, i != k, and j != k, and nums[i] + nums[j] + nums[k] == 0. Notice that the solution set must not contain duplicate triplets.',
      examples: [
        {
          input: '6\n-1 0 1 2 -1 -4',
          output: '-1 -1 2\n-1 0 1',
          explanation: 'nums[0] + nums[1] + nums[2] = (-1) + 0 + 1 = 0. The distinct triplets are [-1,0,1] and [-1,-1,2].',
        },
        { input: '3\n0 1 1', output: '' },
      ],
      constraints: ['3 <= nums.length <= 3000', '-10^5 <= nums[i] <= 10^5'],
      defaultTestCases: [
        { input: '6\n-1 0 1 2 -1 -4\n', expectedOutput: '-1 -1 2\n-1 0 1', sample: true },
        { input: '3\n0 1 1\n', expectedOutput: '', sample: true },
      ],
    },
  };

  /**
   * Retrieves the full problem specification, statement, examples, constraints, and default test cases.
   * If a problem is not explicitly indexed, dynamically synthesizes a realistic LeetCode specification.
   */
  getProblemSpec(p: Problem): ProblemSpec {
    if (this.catalog[p.id]) {
      return this.catalog[p.id];
    }

    // Dynamic synthesizer for problems without bespoke entries
    return {
      statement: `Given the input according to the problem **${p.title}** (from ${p.stepTitle} - ${p.subStepTitle}), solve the problem adhering to the optimal time and space complexity constraints. Write your complete solution on the right panel and test it against sample cases.`,
      examples: [
        {
          input: '5\n1 2 3 4 5',
          output: '5',
          explanation: `Demonstration for ${p.title} with n = 5 elements.`,
        },
        {
          input: '4\n10 20 30 40',
          output: '40',
        },
      ],
      constraints: [
        '1 <= n <= 10^5',
        '-10^9 <= nums[i] <= 10^9',
        `Difficulty: ${p.difficulty}`,
        'Time Complexity: Target O(N) or O(N log N)',
        'Space Complexity: O(1) auxiliary space preferred',
      ],
      followUp: 'Can you optimize the solution to avoid extra memory allocation and handle boundary corner cases?',
      defaultTestCases: [
        { input: '5\n1 2 3 4 5\n', expectedOutput: '5', sample: true },
        { input: '4\n10 20 30 40\n', expectedOutput: '40', sample: true },
        { input: '1\n7\n', expectedOutput: '7', sample: false },
      ],
    };
  }
}
