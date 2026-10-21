/**
 * @file dsaProblems.ts
 * @description Curated DSA Problem Registry & Dynamic Test Case Generator.
 * Provides realistic LeetCode / Google interview starter code and test cases
 * matching the active problem topic.
 */

export interface DSATestCase {
  id: number;
  name: string;
  input: string;
  expected: string;
  description?: string;
  is_hidden?: boolean;
}

export interface DSAProblem {
  id: string;
  title: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
  functionName: string;
  starterCode: {
    python: string;
    javascript: string;
    typescript: string;
    java: string;
    cpp: string;
    go: string;
  };
  solutions?: {
    python?: string;
    javascript?: string;
    typescript?: string;
    java?: string;
    cpp?: string;
    go?: string;
  };
  testCases: DSATestCase[];
}

export const DSA_PROBLEM_REGISTRY: Record<string, DSAProblem> = {
  'gas-station': {
    id: 'gas-station',
    title: 'Gas Station',
    difficulty: 'Medium',
    functionName: 'canCompleteCircuit',
    starterCode: {
      python: `def canCompleteCircuit(gas: list[int], cost: list[int]) -> int:
    # Write your solution here
    pass
`,
      javascript: `/**
 * @param {number[]} gas
 * @param {number[]} cost
 * @return {number}
 */
function canCompleteCircuit(gas, cost) {
    // Write your solution here
    return -1;
}
`,
      typescript: `function canCompleteCircuit(gas: number[], cost: number[]): number {
    // Write your solution here
    return -1;
}
`,
      java: `class Solution {
    public int canCompleteCircuit(int[] gas, int[] cost) {
        // Write your solution here
        return -1;
    }
}
`,
      cpp: `#include <vector>
using namespace std;

class Solution {
public:
    int canCompleteCircuit(vector<int>& gas, vector<int>& cost) {
        // Write your solution here
        return -1;
    }
};
`,
      go: `package main

func canCompleteCircuit(gas []int, cost []int) int {
    // Write your solution here
    return -1;
}
`,
    },
    testCases: [
      {
        id: 1,
        name: 'Case 1',
        input: 'gas = [1,2,3,4,5]\ncost = [3,4,5,1,2]',
        expected: '3',
        description: 'Complete circuit starting at station 3',
        is_hidden: false,
      },
      {
        id: 2,
        name: 'Case 2',
        input: 'gas = [2,3,4]\ncost = [3,4,3]',
        expected: '-1',
        description: 'Total gas < total cost, impossible to complete circuit',
        is_hidden: false,
      },
      {
        id: 3,
        name: 'Case 3',
        input: 'gas = [5,1,2,3,4]\ncost = [4,4,1,5,1]',
        expected: '4',
        description: 'Complete circuit starting at station 4',
        is_hidden: false,
      },
    ],
  },

  'two-sum': {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'Easy',
    functionName: 'twoSum',
    starterCode: {
      python: `def twoSum(nums: list[int], target: int) -> list[int]:
    # Write your solution here
    pass
`,
      javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
function twoSum(nums, target) {
    // Write your solution here
    return [];
}
`,
      typescript: `function twoSum(nums: number[], target: number): number[] {
    // Write your solution here
    return [];
}
`,
      java: `class Solution {
    public int[] twoSum(int[] nums, int target) {
        // Write your solution here
        return new int[]{};
    }
}
`,
      cpp: `#include <vector>
using namespace std;

class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        // Write your solution here
        return {};
    }
};
`,
      go: `package main

func twoSum(nums []int, target int) []int {
    // Write your solution here
    return []int{}
}
`,
    },
    solutions: {
      python: `def twoSum(nums: list[int], target: int) -> list[int]:
    # Hash map for O(n) time and O(n) space complexity
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return [seen[diff], i]
        seen[num] = i
    return []
`,
      javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
function twoSum(nums, target) {
    // Hash map for O(n) time and O(n) space complexity
    const seen = new Map();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (seen.has(diff)) {
            return [seen.get(diff), i];
        }
        seen.set(nums[i], i);
    }
    return [];
}
`,
      typescript: `function twoSum(nums: number[], target: number): number[] {
    // Hash map for O(n) time and O(n) space complexity
    const seen = new Map<number, number>();
    for (let i = 0; i < nums.length; i++) {
        const diff = target - nums[i];
        if (seen.has(diff)) {
            return [seen.get(diff)!, i];
        }
        seen.set(nums[i], i);
    }
    return [];
}
`,
    },
    testCases: [
      {
        id: 1,
        name: 'Case 1',
        input: 'nums = [2,7,11,15]\ntarget = 9',
        expected: '[0, 1]',
        description: 'nums[0] + nums[1] == 9, return [0, 1]',
        is_hidden: false,
      },
      {
        id: 2,
        name: 'Case 2',
        input: 'nums = [3,2,4]\ntarget = 6',
        expected: '[1, 2]',
        description: 'nums[1] + nums[2] == 6, return [1, 2]',
        is_hidden: false,
      },
      {
        id: 3,
        name: 'Case 3',
        input: 'nums = [3,3]\ntarget = 6',
        expected: '[0, 1]',
        description: 'Duplicate values summing to target',
        is_hidden: false,
      },
    ],
  },

  'word-break': {
    id: 'word-break',
    title: 'Word Break',
    difficulty: 'Medium',
    functionName: 'wordBreak',
    starterCode: {
      python: `def wordBreak(s: str, wordDict: list[str]) -> bool:
    # Write your solution here
    pass
`,
      javascript: `/**
 * @param {string} s
 * @param {string[]} wordDict
 * @return {boolean}
 */
function wordBreak(s, wordDict) {
    // Write your solution here
    return false;
}
`,
      typescript: `function wordBreak(s: string, wordDict: string[]): boolean {
    // Write your solution here
    return false;
}
`,
      java: `import java.util.List;

class Solution {
    public boolean wordBreak(String s, List<String> wordDict) {
        // Write your solution here
        return false;
    }
}
`,
      cpp: `#include <string>
#include <vector>
using namespace std;

class Solution {
public:
    bool wordBreak(string s, vector<string>& wordDict) {
        // Write your solution here
        return false;
    }
};
`,
      go: `package main

func wordBreak(s string, wordDict []string) bool {
    // Write your solution here
    return false
}
`,
    },
    testCases: [
      {
        id: 1,
        name: 'Case 1',
        input: 's = "leetcode"\nwordDict = ["leet", "code"]',
        expected: 'true',
        description: '"leetcode" can be segmented as "leet" + "code"',
        is_hidden: false,
      },
      {
        id: 2,
        name: 'Case 2',
        input: 's = "applepenapple"\nwordDict = ["apple", "pen"]',
        expected: 'true',
        description: 'Reusable dictionary words: "apple" + "pen" + "apple"',
        is_hidden: false,
      },
      {
        id: 3,
        name: 'Case 3',
        input: 's = "catsandog"\nwordDict = ["cats", "dog", "sand", "and", "cat"]',
        expected: 'false',
        description: 'Cannot be segmented into dictionary words',
        is_hidden: false,
      },
    ],
  },

  'longest-substring': {
    id: 'longest-substring',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'Medium',
    functionName: 'lengthOfLongestSubstring',
    starterCode: {
      python: `def lengthOfLongestSubstring(s: str) -> int:
    # Write your solution here
    pass
`,
      javascript: `/**
 * @param {string} s
 * @return {number}
 */
function lengthOfLongestSubstring(s) {
    // Write your solution here
    return 0;
}
`,
      typescript: `function lengthOfLongestSubstring(s: string): number {
    // Write your solution here
    return 0;
}
`,
      java: `class Solution {
    public int lengthOfLongestSubstring(String s) {
        // Write your solution here
        return 0;
    }
}
`,
      cpp: `#include <string>
using namespace std;

class Solution {
public:
    int lengthOfLongestSubstring(string s) {
        // Write your solution here
        return 0;
    }
};
`,
      go: `package main

func lengthOfLongestSubstring(s string) int {
    // Write your solution here
    return 0
}
`,
    },
    testCases: [
      {
        id: 1,
        name: 'Case 1',
        input: 's = "abcabcbb"',
        expected: '3',
        description: 'The answer is "abc", with the length of 3',
        is_hidden: false,
      },
      {
        id: 2,
        name: 'Case 2',
        input: 's = "bbbbb"',
        expected: '1',
        description: 'The answer is "b", with the length of 1',
        is_hidden: false,
      },
      {
        id: 3,
        name: 'Case 3',
        input: 's = "pwwkew"',
        expected: '3',
        description: 'The answer is "wke", with the length of 3',
        is_hidden: false,
      },
    ],
  },

  'valid-parentheses': {
    id: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'Easy',
    functionName: 'isValid',
    starterCode: {
      python: `def isValid(s: str) -> bool:
    # Write your solution here
    pass
`,
      javascript: `/**
 * @param {string} s
 * @return {boolean}
 */
function isValid(s) {
    // Write your solution here
    return false;
}
`,
      typescript: `function isValid(s: string): boolean {
    // Write your solution here
    return false;
}
`,
      java: `class Solution {
    public boolean isValid(String s) {
        // Write your solution here
        return false;
    }
}
`,
      cpp: `#include <string>
using namespace std;

class Solution {
public:
    bool isValid(string s) {
        // Write your solution here
        return false;
    }
};
`,
      go: `package main

func isValid(s string) bool {
    // Write your solution here
    return false
}
`,
    },
    testCases: [
      {
        id: 1,
        name: 'Case 1',
        input: 's = "()"',
        expected: 'true',
        description: 'Simple matching parentheses',
        is_hidden: false,
      },
      {
        id: 2,
        name: 'Case 2',
        input: 's = "()[]{}"',
        expected: 'true',
        description: 'Multiple matching brackets in order',
        is_hidden: false,
      },
      {
        id: 3,
        name: 'Case 3',
        input: 's = "(]"',
        expected: 'false',
        description: 'Mismatched closing bracket',
        is_hidden: false,
      },
    ],
  },

  'binary-search': {
    id: 'binary-search',
    title: 'Binary Search',
    difficulty: 'Easy',
    functionName: 'search',
    starterCode: {
      python: `def search(nums: list[int], target: int) -> int:
    # Write your solution here
    pass
`,
      javascript: `/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number}
 */
function search(nums, target) {
    // Write your solution here
    return -1;
}
`,
      typescript: `function search(nums: number[], target: number): number {
    // Write your solution here
    return -1;
}
`,
      java: `class Solution {
    public int search(int[] nums, int target) {
        // Write your solution here
        return -1;
    }
}
`,
      cpp: `#include <vector>
using namespace std;

class Solution {
public:
    int search(vector<int>& nums, int target) {
        // Write your solution here
        return -1;
    }
};
`,
      go: `package main

func search(nums []int, target int) int {
    // Write your solution here
    return -1
}
`,
    },
    testCases: [
      {
        id: 1,
        name: 'Case 1',
        input: 'nums = [-1,0,3,5,9,12]\ntarget = 9',
        expected: '4',
        description: 'Target 9 exists in nums and its index is 4',
        is_hidden: false,
      },
      {
        id: 2,
        name: 'Case 2',
        input: 'nums = [-1,0,3,5,9,12]\ntarget = 2',
        expected: '-1',
        description: 'Target 2 does not exist in nums so return -1',
        is_hidden: false,
      },
    ],
  },

  'maximum-subarray': {
    id: 'maximum-subarray',
    title: 'Maximum Subarray',
    difficulty: 'Medium',
    functionName: 'maxSubArray',
    starterCode: {
      python: `def maxSubArray(nums: list[int]) -> int:
    # Write your solution here
    pass
`,
      javascript: `/**
 * @param {number[]} nums
 * @return {number}
 */
function maxSubArray(nums) {
    // Write your solution here
    return 0;
}
`,
      typescript: `function maxSubArray(nums: number[]): number {
    // Write your solution here
    return 0;
}
`,
      java: `class Solution {
    public int maxSubArray(int[] nums) {
        // Write your solution here
        return 0;
    }
}
`,
      cpp: `#include <vector>
using namespace std;

class Solution {
public:
    int maxSubArray(vector<int>& nums) {
        // Write your solution here
        return 0;
    }
};
`,
      go: `package main

func maxSubArray(nums []int) int {
    // Write your solution here
    return 0
}
`,
    },
    testCases: [
      {
        id: 1,
        name: 'Case 1',
        input: 'nums = [-2,1,-3,4,-1,2,1,-5,4]',
        expected: '6',
        description: 'The subarray [4,-1,2,1] has the largest sum 6',
        is_hidden: false,
      },
      {
        id: 2,
        name: 'Case 2',
        input: 'nums = [1]',
        expected: '1',
        description: 'Single element array',
        is_hidden: false,
      },
      {
        id: 3,
        name: 'Case 3',
        input: 'nums = [5,4,-1,7,8]',
        expected: '23',
        description: 'All positive elements sum to 23',
        is_hidden: false,
      },
    ],
  },
};

/**
 * Resolves a DSA problem matching the interview focus area or question context.
 *
 * @param topic - Focus area from session (e.g. 'Gas Station', 'Word Break')
 * @param questionText - Message content text from AI Interviewer
 */
export function resolveDSAProblem(topic?: string, questionText?: string): DSAProblem {
  const normalizedTopic = (topic || '').toLowerCase().replace(/[^a-z0-9]/g, '');

  // 1. Direct registry key search
  for (const [key, prob] of Object.entries(DSA_PROBLEM_REGISTRY)) {
    const keyNorm = key.replace(/[^a-z0-9]/g, '');
    const titleNorm = prob.title.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (normalizedTopic.includes(keyNorm) || keyNorm.includes(normalizedTopic) || normalizedTopic.includes(titleNorm)) {
      return prob;
    }
  }

  // 2. Scan questionText for registered problem titles
  if (questionText) {
    const lowerQ = questionText.toLowerCase();
    for (const prob of Object.values(DSA_PROBLEM_REGISTRY)) {
      if (lowerQ.includes(prob.title.toLowerCase())) {
        return prob;
      }
    }
  }

  // 3. Fallback to Gas Station if topic matches gas/fuel/circuit
  if (normalizedTopic.includes('gas') || normalizedTopic.includes('station') || normalizedTopic.includes('circuit')) {
    return DSA_PROBLEM_REGISTRY['gas-station'];
  }

  // 4. Default fallback: Dynamic problem with user topic
  const fallbackTitle = topic || 'Algorithm Challenge';
  return {
    id: 'custom-dsa-problem',
    title: fallbackTitle,
    difficulty: 'Medium',
    functionName: 'solution',
    starterCode: {
      python: `def solution(*args):\n    # Write your solution here\n    pass\n`,
      javascript: `function solution(...args) {\n    // Write your solution here\n}\n`,
      typescript: `function solution(...args: any[]): any {\n    // Write your solution here\n}\n`,
      java: `class Solution {\n    public static void main(String[] args) {\n        // Write your solution here\n    }\n}\n`,
      cpp: `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // Write your solution here\n    return 0;\n}\n`,
      go: `package main\n\nfunc main() {\n    // Write your solution here\n}\n`,
    },
    testCases: [
      { id: 1, name: 'Case 1', input: 'input1 = 1', expected: '1', description: 'Standard input case' },
      { id: 2, name: 'Case 2', input: 'input2 = 2', expected: '2', description: 'Edge input case' },
    ],
  };
}
