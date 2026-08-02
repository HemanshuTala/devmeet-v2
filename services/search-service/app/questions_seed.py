import uuid

def make_id():
    return str(uuid.uuid4())

SEED_QUESTIONS = [
    # ─── 12 DSA Questions ─────────────────────────────────────────────────────────
    {
        "id": "dsa-01-two-sum",
        "title": "Two Sum",
        "description": "Given an array of integers nums and an integer target, return indices of the two numbers such that they add up to target. You may assume that each input would have exactly one solution, and you may not use the same element twice.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["arrays", "hash-table"],
        "company_tags": ["Google", "Amazon", "Apple", "Meta"],
        "hints": [
            "A brute force approach would check all pairs, taking O(N^2) time.",
            "Can we use a hash map to look up the complement (target - nums[i]) in O(1) time?",
            "Store elements and their indices in a dictionary as you iterate."
        ]
    },
    {
        "id": "dsa-02-longest-substring",
        "title": "Longest Substring Without Repeating Characters",
        "description": "Given a string s, find the length of the longest substring without repeating characters. A substring is a contiguous sequence of characters within a string.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["strings", "sliding-window", "hash-table"],
        "company_tags": ["Google", "Microsoft", "Amazon"],
        "hints": [
            "Use a sliding window defined by two pointers representing the current substring bounds.",
            "As you expand the right pointer, check if the character is already in your window.",
            "If it is, shrink the left pointer to exclude the repeat."
        ]
    },
    {
        "id": "dsa-03-binary-search",
        "title": "Binary Search",
        "description": "Given an array of integers nums which is sorted in ascending order, and an integer target, write a function to search target in nums. If target exists, then return its index. Otherwise, return -1.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["algorithms", "searching"],
        "company_tags": ["Google", "Meta", "Netflix"],
        "hints": [
            "Since the array is sorted, we can divide the search space in half each step.",
            "Find the middle index, and compare it with the target.",
            "Adjust the low or high pointers based on the comparison."
        ]
    },
    {
        "id": "dsa-04-merge-sort",
        "title": "Merge Sorted Array",
        "description": "You are given two integer arrays nums1 and nums2, sorted in non-decreasing order, and two integers m and n. Merge nums1 and nums2 into a single array sorted in non-decreasing order. The merge should be done in-place inside nums1.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["arrays", "two-pointers"],
        "company_tags": ["Microsoft", "Oracle", "Uber"],
        "hints": [
            "To avoid overwriting elements in nums1, start merging from the back (largest elements first).",
            "Keep three pointers: one for the end of nums1 elements, one for the end of nums2, and one for the write destination.",
            "Don't forget to copy remaining elements of nums2 if nums1 is exhausted first."
        ]
    },
    {
        "id": "dsa-05-linked-list-cycle",
        "title": "Linked List Cycle",
        "description": "Given head, the head of a linked list, determine if the linked list has a cycle in it. There is a cycle in a linked list if there is some node in the list that can be reached again by continuously following the next pointer.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["linked-lists", "two-pointers"],
        "company_tags": ["Amazon", "Microsoft", "Bloomberg"],
        "hints": [
            "We can keep track of visited nodes using a Hash Set. What is the space complexity?",
            "To achieve O(1) space, use Floyd's Cycle Finding Algorithm (two pointers moving at different speeds).",
            "If there is a cycle, the fast pointer will eventually catch up to the slow pointer."
        ]
    },
    {
        "id": "dsa-06-max-subarray",
        "title": "Maximum Subarray",
        "description": "Given an integer array nums, find the subarray with the largest sum, and return its sum. A subarray is a contiguous part of an array.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "dynamic-programming"],
        "company_tags": ["Google", "Apple", "LinkedIn"],
        "hints": [
            "Kadane's Algorithm computes the maximum subarray ending at each index.",
            "For each element, decide whether to add it to the existing subarray or start a new subarray from it.",
            "Keep a global maximum sum variable updated at each step."
        ]
    },
    {
        "id": "dsa-07-valid-parentheses",
        "title": "Valid Parentheses",
        "description": "Given a string s containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid. Open brackets must be closed by the same type of brackets, and in the correct order.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["strings", "stacks"],
        "company_tags": ["Meta", "Amazon", "Google"],
        "hints": [
            "Use a stack data structure to keep track of open brackets.",
            "When encountering a closing bracket, check if it matches the bracket at the top of the stack.",
            "At the end of processing, the stack must be empty for the string to be valid."
        ]
    },
    {
        "id": "dsa-08-lru-cache",
        "title": "LRU Cache",
        "description": "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement get and put operations in O(1) time complexity.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["design", "doubly-linked-list", "hash-table"],
        "company_tags": ["Amazon", "Bloomberg", "Salesforce"],
        "hints": [
            "A hash map provides O(1) lookups but doesn't maintain access order.",
            "A doubly linked list provides O(1) node removal and insertion if we have references to nodes.",
            "Combine a hash map with a doubly linked list to achieve O(1) for both operations."
        ]
    },
    {
        "id": "dsa-09-word-search",
        "title": "Word Search",
        "description": "Given an m x n grid of characters board and a string word, return true if word exists in the grid. The word can be constructed from letters of sequentially adjacent cells, where adjacent cells are horizontally or vertically neighboring.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["backtracking", "graphs"],
        "company_tags": ["Meta", "Amazon", "Twitter"],
        "hints": [
            "Use Depth-First Search (DFS) starting from every cell matching the first letter.",
            "Mark cells as visited temporarily during the recursive path to avoid reusing them.",
            "Backtrack (restore the cell status) if the current path doesn't lead to the solution."
        ]
    },
    {
        "id": "dsa-10-number-of-islands",
        "title": "Number of Islands",
        "description": "Given an m x n 2D binary grid grid which represents a map of '1's (land) and '0's (water), return the number of islands. An island is surrounded by water and is formed by connecting adjacent lands horizontally or vertically.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["graphs", "dfs", "bfs"],
        "company_tags": ["Amazon", "Microsoft", "Google"],
        "hints": [
            "This can be modeled as finding connected components in a grid-graph.",
            "Iterate through each cell. When you hit land ('1'), start a DFS or BFS to visit and sink ('0') the entire island.",
            "Increment your island count for each starting land node you discover."
        ]
    },
    {
        "id": "dsa-11-coin-change",
        "title": "Coin Change",
        "description": "You are given an integer array coins representing coins of different denominations and an integer amount representing a total amount of money. Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["dynamic-programming"],
        "company_tags": ["Amazon", "Google", "Goldman Sachs"],
        "hints": [
            "Solve the subproblems: what is the minimum coins needed for amounts from 1 to target?",
            "Use an array dp of size amount + 1 initialized to infinity, with dp[0] = 0.",
            "For each coin and amount, update dp[i] = min(dp[i], dp[i - coin] + 1)."
        ]
    },
    {
        "id": "dsa-12-trapping-rain-water",
        "title": "Trapping Rain Water",
        "description": "Given n non-negative integers representing an elevation map where the width of each bar is 1, compute how much water it can trap after raining.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["arrays", "two-pointers", "stacks"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "At any index, the amount of water trapped is determined by the minimum of the maximum height to its left and right, minus its own height.",
            "We can precompute left_max and right_max arrays, or use a two-pointer approach starting from left and right boundaries.",
            "With two pointers, move the pointer that has the smaller boundary height inward, accumulating trapped water relative to the boundary max."
        ]
    },
    {
        "id": "dsa-13-merge-intervals",
        "title": "Merge Intervals",
        "description": "Given an array of intervals where intervals[i] = [start_i, end_i], merge all overlapping intervals and return an array of the non-overlapping intervals that cover all the intervals in the input.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "sorting"],
        "company_tags": ["Google", "Microsoft", "LinkedIn"],
        "hints": [
            "Sort the intervals by their start time to make overlapping detection easier.",
            "Iterate through sorted intervals, merging when current interval overlaps with the previous one.",
            "Track the merged interval's end time as the maximum of both intervals' end times."
        ]
    },
    {
        "id": "dsa-14-product-of-array",
        "title": "Product of Array Except Self",
        "description": "Given an integer array nums, return an array answer such that answer[i] is equal to the product of all the elements of nums except nums[i]. Solve it without division and in O(n) time.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "prefix-product"],
        "company_tags": ["Amazon", "Google", "Meta"],
        "hints": [
            "Compute prefix products (product of all elements before index i) and suffix products (product of all elements after index i).",
            "The answer for each index is prefix[i] * suffix[i].",
            "Optimize space by using the output array to store prefix products, then multiply with suffix products in a second pass."
        ]
    },
    {
        "id": "dsa-15-rotated-sorted-array",
        "title": "Search in Rotated Sorted Array",
        "description": "There is an integer array nums sorted in ascending order with distinct values. Given the array nums after the possible rotation and an integer target, return the index of target if it is in nums, or -1 if it is not in nums.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "binary-search"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "The array is rotated, but each half is still sorted. Use modified binary search.",
            "Determine which half is sorted by comparing mid with left or right boundaries.",
            "Check if target lies in the sorted half, then narrow search accordingly."
        ]
    },
    {
        "id": "dsa-16-valid-anagram",
        "title": "Valid Anagram",
        "description": "Given two strings s and t, return true if t is an anagram of s, and false otherwise. An anagram is a word or phrase formed by rearranging the letters of a different word or phrase.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["strings", "hash-table"],
        "company_tags": ["Meta", "Amazon", "Google"],
        "hints": [
            "If both strings have different lengths, they cannot be anagrams.",
            "Use a hash map to count character frequencies in both strings.",
            "Compare the frequency counts - they should be identical for anagrams."
        ]
    },
    {
        "id": "dsa-17-climbing-stairs",
        "title": "Climbing Stairs",
        "description": "You are climbing a staircase. It takes n steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["dynamic-programming"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "This is essentially the Fibonacci sequence: ways(n) = ways(n-1) + ways(n-2).",
            "Use dynamic programming with O(n) time and O(1) space by keeping only the last two values.",
            "Base cases: ways(1) = 1, ways(2) = 2."
        ]
    },
    {
        "id": "dsa-18-best-time-buy-sell",
        "title": "Best Time to Buy and Sell Stock",
        "description": "You are given an array prices where prices[i] is the price of a given stock on the ith day. You want to maximize your profit by choosing a single day to buy one stock and choosing a different day in the future to sell that stock. Return the maximum profit.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["arrays", "greedy"],
        "company_tags": ["Amazon", "Google", "Meta"],
        "hints": [
            "Track the minimum price seen so far as you iterate through the array.",
            "Calculate potential profit at each day: current price - minimum price seen so far.",
            "Keep track of the maximum profit encountered."
        ]
    },
    {
        "id": "dsa-19-reverse-linked-list",
        "title": "Reverse Linked List",
        "description": "Given the head of a singly linked list, reverse the list, and return the reversed list.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["linked-lists"],
        "company_tags": ["Amazon", "Microsoft", "Google"],
        "hints": [
            "Use three pointers: prev, current, and next to reverse the links iteratively.",
            "For each node, store next, reverse the link to point to prev, then move prev and current forward.",
            "Handle edge cases: empty list or single node list."
        ]
    },
    {
        "id": "dsa-20-invert-binary-tree",
        "title": "Invert Binary Tree",
        "description": "Given the root of a binary tree, invert the tree, and return its root. Inverting means swapping left and right children for every node.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["trees", "recursion"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "Use recursion: invert left subtree, invert right subtree, then swap left and right children.",
            "Base case: if node is null, return null.",
            "Can also be solved iteratively using a queue for level-order traversal."
        ]
    },
    {
        "id": "dsa-21-diameter-of-binary-tree",
        "title": "Diameter of Binary Tree",
        "description": "Given the root of a binary tree, return the length of the diameter of the tree. The diameter is the length of the longest path between any two nodes in a tree. This path may or may not pass through the root.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["trees", "recursion"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "For each node, compute the height of left and right subtrees.",
            "The diameter passing through this node is left_height + right_height.",
            "Track the maximum diameter encountered during the recursive traversal."
        ]
    },
    {
        "id": "dsa-22-subsets",
        "title": "Subsets",
        "description": "Given an integer array nums of unique elements, return all possible subsets (the power set). The solution set must not contain duplicate subsets.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["backtracking", "arrays"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Use backtracking: at each step, decide whether to include or exclude the current element.",
            "Start with an empty subset and build up subsets by adding elements one by one.",
            "The time complexity is O(2^n) since there are 2^n possible subsets."
        ]
    },
    {
        "id": "dsa-23-kth-largest-element",
        "title": "Kth Largest Element in an Array",
        "description": "Given an integer array nums and an integer k, return the kth largest element in the array. Note that it is the kth largest element in the sorted order, not the kth distinct element.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "heap", "quickselect"],
        "company_tags": ["Amazon", "Google", "Microsoft"],
        "hints": [
            "Simple approach: sort the array and return the kth largest element. Time: O(n log n).",
            "Optimized approach: use a min-heap of size k to track the k largest elements. Time: O(n log k).",
            "Most optimized: use Quickselect algorithm (partition-based selection). Average time: O(n)."
        ]
    },
    {
        "id": "dsa-24-validate-bst",
        "title": "Validate Binary Search Tree",
        "description": "Given the root of a binary tree, determine if it is a valid binary search tree (BST). A BST is defined as: left subtree contains only nodes with keys less than the node's key, right subtree contains only nodes with keys greater than the node's key, and both subtrees must also be binary search trees.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["trees", "recursion"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use recursion with min and max bounds that narrow as you traverse down.",
            "For left child, update max bound to current node's value. For right child, update min bound.",
            "Check if current node's value violates the bounds at each step."
        ]
    },
    {
        "id": "dsa-25-course-schedule",
        "title": "Course Schedule",
        "description": "There are a total of numCourses courses you have to take, labeled from 0 to numCourses - 1. You are given an array prerequisites where prerequisites[i] = [ai, bi] indicates that you must take course bi first if you want to take course ai. Return true if you can finish all courses, otherwise return false.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["graphs", "topological-sort"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "Model this as a directed graph where edges represent prerequisites.",
            "Use topological sort: if you can successfully topologically sort all nodes, no cycle exists.",
            "Alternatively, use DFS cycle detection or Kahn's algorithm (BFS-based topological sort)."
        ]
    },
    {
        "id": "dsa-26-gas-station",
        "title": "Gas Station",
        "description": "There are n gas stations along a circular route. Given two integer arrays gas and cost where gas[i] is the amount of gas at the ith station and cost[i] is the cost to travel from the ith station to the (i + 1)th station, return the starting gas station's index if you can travel around the circuit once in the clockwise direction, otherwise return -1.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "greedy"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "If total gas is less than total cost, it's impossible to complete the circuit.",
            "Use a greedy approach: track the current tank and start index, reset when tank goes negative.",
            "The solution is guaranteed to be unique if one exists."
        ]
    },
    {
        "id": "dsa-27-word-break",
        "title": "Word Break",
        "description": "Given a string s and a dictionary of strings wordDict, return true if s can be segmented into a space-separated sequence of one or more dictionary words.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["dynamic-programming", "strings"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Use dynamic programming: dp[i] = true if s[0:i] can be segmented.",
            "For each position i, check all possible word endings that match s[j:i].",
            "Optimize by using a trie for the dictionary to speed up prefix checks."
        ]
    },
    {
        "id": "dsa-28-serialize-binary-tree",
        "title": "Serialize and Deserialize Binary Tree",
        "description": "Design an algorithm to serialize and deserialize a binary tree. Serialization converts a data structure into a sequence of bits. Deserialization reconstructs the data structure from the sequence.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["trees", "serialization"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use level-order traversal (BFS) for serialization, marking null nodes with a special character.",
            "For deserialization, reconstruct the tree level by level using the serialized string.",
            "Alternative: use preorder traversal with null markers for a more compact representation."
        ]
    },
    {
        "id": "dsa-29-median-of-two-sorted-arrays",
        "title": "Median of Two Sorted Arrays",
        "description": "Given two sorted arrays nums1 and nums2 of size m and n respectively, return the median of the two sorted arrays. The overall run time complexity should be O(log (m+n)).",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["arrays", "binary-search"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "Use binary search on the smaller array to find the correct partition point.",
            "The partition should divide both arrays such that all elements on the left are less than all elements on the right.",
            "The median is calculated based on the maximum of left partition and minimum of right partition."
        ]
    },
    {
        "id": "dsa-30-palindromic-substrings",
        "title": "Longest Palindromic Substring",
        "description": "Given a string s, return the longest palindromic substring in s.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["strings", "dynamic-programming"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Expand around center: for each character, expand outward to find palindromes.",
            "Handle both odd-length (single center) and even-length (two centers) palindromes.",
            "Alternative: use dynamic programming with O(n^2) time and space."
        ]
    },
    {
        "id": "dsa-31-group-anagrams",
        "title": "Group Anagrams",
        "description": "Given an array of strings strs, group the anagrams together. You can return the answer in any order.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["strings", "hash-table"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "For each string, sort its characters to create a key that all anagrams share.",
            "Use a hash map to group strings by their sorted-character key.",
            "Optimization: use character count tuples as keys instead of sorting (O(n) vs O(n log n))."
        ]
    },
    {
        "id": "dsa-32-rotate-image",
        "title": "Rotate Image",
        "description": "You are given an n x n 2D matrix representing an image, rotate the image by 90 degrees (clockwise). You have to rotate the image in-place, which means you have to modify the input 2D matrix directly.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "matrix"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Approach 1: Transpose the matrix, then reverse each row.",
            "Approach 2: Rotate layer by layer, swapping four elements at a time.",
            "Both approaches are O(n^2) time and O(1) space."
        ]
    },
    {
        "id": "dsa-33-min-stack",
        "title": "Min Stack",
        "description": "Design a stack that supports push, pop, top, and retrieving the minimum element in constant time. Implement the MinStack class.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["stacks", "design"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "Use two stacks: one for all elements, one for minimums.",
            "When pushing, push the current minimum to the min stack.",
            "When popping, pop from both stacks to maintain consistency."
        ]
    },
    {
        "id": "dsa-34-unique-paths",
        "title": "Unique Paths",
        "description": "There is a robot on an m x n grid. The robot is initially located at the top-left corner. The robot tries to move to the bottom-right corner. The robot can only move either down or right at any point in time. How many possible unique paths are there?",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["dynamic-programming", "combinatorics"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use dynamic programming: dp[i][j] = dp[i-1][j] + dp[i][j-1].",
            "Base case: dp[0][j] = 1 and dp[i][0] = 1 (only one way to reach edges).",
            "Optimize space to O(n) by using a single array and updating in place."
        ]
    },
    {
        "id": "dsa-35-spiral-matrix",
        "title": "Spiral Matrix",
        "description": "Given an m x n matrix, return all elements of the matrix in spiral order.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "matrix"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use four boundaries: top, bottom, left, right.",
            "Traverse right, down, left, up, shrinking boundaries after each direction.",
            "Handle edge cases when the matrix is not square."
        ]
    },
    {
        "id": "dsa-36-jump-game",
        "title": "Jump Game",
        "description": "You are given an integer array nums. You are initially positioned at the first index and each element in the array represents your maximum jump length at that position. Return true if you can reach the last index, or false otherwise.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["arrays", "greedy"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "Greedy approach: track the farthest reachable index as you iterate.",
            "If current index exceeds farthest reachable, return false.",
            "If farthest reachable reaches or exceeds last index, return true."
        ]
    },
    {
        "id": "dsa-37-house-robber",
        "title": "House Robber",
        "description": "You are a professional robber planning to rob houses along a street. Each house has a certain amount of money stashed, the only constraint stopping you from robbing each of them is that adjacent houses have security systems connected. Return the maximum amount of money you can rob tonight without alerting the police.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["dynamic-programming"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "DP approach: dp[i] = max(dp[i-1], dp[i-2] + nums[i]).",
            "At each house, decide whether to rob it (skip previous) or skip it (take previous max).",
            "Optimize space to O(1) by keeping only the last two values."
        ]
    },
    {
        "id": "dsa-38-maximum-depth-binary-tree",
        "title": "Maximum Depth of Binary Tree",
        "description": "Given the root of a binary tree, return its maximum depth. A binary tree's maximum depth is the number of nodes along the longest path from the root node down to the farthest leaf node.",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["trees", "recursion"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Recursive approach: depth = 1 + max(depth(left), depth(right)).",
            "Base case: if node is null, return 0.",
            "Iterative approach: use BFS level-order traversal and count levels."
        ]
    },
    {
        "id": "dsa-39-symmetric-tree",
        "title": "Symmetric Tree",
        "description": "Given the root of a binary tree, check whether it is a mirror of itself (i.e., symmetric around its center).",
        "interview_type": "dsa",
        "difficulty": "easy",
        "tags": ["trees", "recursion"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Recursive approach: check if left subtree is mirror of right subtree.",
            "Two trees are mirrors if their roots are equal and left of tree1 equals right of tree2.",
            "Iterative approach: use a queue to compare nodes in pairs."
        ]
    },
    {
        "id": "dsa-40-level-order",
        "title": "Binary Tree Level Order Traversal",
        "description": "Given the root of a binary tree, return the level order traversal of its nodes' values (i.e., from left to right, level by level).",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["trees", "bfs"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use BFS with a queue: process all nodes at current level before moving to next.",
            "Track level size to know when to start a new level in the result.",
            "Alternative: use DFS with depth parameter to build level lists."
        ]
    },
    {
        "id": "dsa-41-lowest-common-ancestor",
        "title": "Lowest Common Ancestor of a Binary Tree",
        "description": "Given a binary tree, find the lowest common ancestor (LCA) of two given nodes in the tree. The LCA is the lowest node that has both nodes as descendants.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["trees", "recursion"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Recursive approach: if current node is p or q, return it. Search left and right subtrees.",
            "If both left and right return non-null, current node is LCA.",
            "If only one side returns non-null, that's the LCA (propagate up)."
        ]
    },
    {
        "id": "dsa-42-construct-binary-tree",
        "title": "Construct Binary Tree from Preorder and Inorder Traversal",
        "description": "Given two integer arrays preorder and inorder where preorder is the preorder traversal of a binary tree and inorder is the inorder traversal of the same tree, construct and return the binary tree.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["trees", "recursion"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "First element in preorder is always the root. Find it in inorder to split left and right subtrees.",
            "Recursively build left subtree using left portion of inorder and corresponding preorder.",
            "Recursively build right subtree using right portion of inorder and corresponding preorder."
        ]
    },
    {
        "id": "dsa-43-word-search-ii",
        "title": "Word Search II",
        "description": "Given an m x n board of characters and a list of words, return all words on the board. Each word must be constructed from letters of sequentially adjacent cells, where adjacent cells are horizontally or vertically neighboring.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["backtracking", "trie"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "Build a trie from the dictionary to efficiently search for words.",
            "For each cell, perform DFS while traversing the trie simultaneously.",
            "Prune the search when no words in the trie start with the current prefix."
        ]
    },
    {
        "id": "dsa-44-sudoku-solver",
        "title": "Sudoku Solver",
        "description": "Write a program to solve a Sudoku puzzle by filling the empty cells. A sudoku solution must satisfy all of the following rules: each row contains digits 1-9 without repetition, each column contains digits 1-9 without repetition, each of the nine 3 x 3 sub-boxes contains digits 1-9 without repetition.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["backtracking", "matrix"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use backtracking: try each valid number (1-9) in empty cells.",
            "Optimize by choosing the cell with fewest possible valid numbers (most constrained).",
            "Use sets or bitmasks to quickly check row, column, and box constraints."
        ]
    },
    {
        "id": "dsa-45-n-queens",
        "title": "N-Queens",
        "description": "The n-queens puzzle is the problem of placing n queens on an n x n chessboard such that no two queens attack each other. Given an integer n, return all distinct solutions to the n-queens puzzle.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["backtracking", "recursion"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use backtracking: place queens row by row, checking column and diagonal conflicts.",
            "Track used columns and diagonals with sets or arrays for O(1) conflict checking.",
            "Optimization: use bitmask representation for columns and diagonals."
        ]
    },
    {
        "id": "dsa-46-edit-distance",
        "title": "Edit Distance",
        "description": "Given two strings word1 and word2, return the minimum number of operations required to convert word1 to word2. You have the following three operations permitted: insert a character, delete a character, or replace a character.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["dynamic-programming", "strings"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use DP: dp[i][j] = min operations to convert word1[0:i] to word2[0:j].",
            "If characters match, dp[i][j] = dp[i-1][j-1]. Otherwise, dp[i][j] = 1 + min(insert, delete, replace).",
            "Optimize space to O(min(m,n)) by using only two rows."
        ]
    },
    {
        "id": "dsa-47-regular-expression",
        "title": "Regular Expression Matching",
        "description": "Given an input string s and a pattern p, implement regular expression matching with support for '.' and '*' where '.' matches any single character and '*' matches zero or more of the preceding element.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["dynamic-programming", "strings"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use DP: dp[i][j] = true if s[0:i] matches p[0:j].",
            "Handle '*' by either skipping the character (zero matches) or matching one more character.",
            "Handle '.' by treating it as matching any single character."
        ]
    },
    {
        "id": "dsa-48-lru-cache-implementation",
        "title": "LRU Cache Implementation",
        "description": "Design a data structure that follows the constraints of a Least Recently Used (LRU) cache. Implement the LRUCache class with get and put operations in O(1) time complexity.",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["design", "doubly-linked-list", "hash-table"],
        "company_tags": ["Amazon", "Google", "Meta"],
        "hints": [
            "Use a hash map for O(1) access to nodes by key.",
            "Use a doubly linked list to maintain access order (most recently used at head).",
            "On get: move node to head. On put: add to head, remove from tail if at capacity."
        ]
    },
    {
        "id": "dsa-49-graph-valid-tree",
        "title": "Graph Valid Tree",
        "description": "Given n nodes labeled from 0 to n - 1 and a list of undirected edges, write a function to check whether these edges make up a valid tree. A valid tree has exactly n - 1 edges and is fully connected with no cycles.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["graphs", "union-find"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Check if number of edges equals n - 1 (necessary but not sufficient).",
            "Use Union-Find to detect cycles while building the graph.",
            "Alternatively, use BFS/DFS to check connectivity and count visited nodes."
        ]
    },
    {
        "id": "dsa-50-reconstruct-itinerary",
        "title": "Reconstruct Itinerary",
        "description": "You are given a list of airline tickets where tickets[i] = [from_i, to_i] represent the departure and arrival airports of one flight. Reconstruct the itinerary in order and return it. All of the tickets belong to a man who departs from \"JFK\", thus the itinerary must begin with \"JFK\".",
        "interview_type": "dsa",
        "difficulty": "hard",
        "tags": ["graphs", "eulerian-path"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Model as a directed graph and find an Eulerian path (uses all edges exactly once).",
            "Use Hierholzer's algorithm: DFS and add nodes to result in post-order.",
            "Sort destinations lexicographically and use a multiset for edge management."
        ]
    },

    # ─── 10 Behavioral Questions ──────────────────────────────────────────────────
    {
        "id": "behavioral-01-introduce",
        "title": "Tell me about yourself / Walk me through your resume",
        "description": "Provide a high-level summary of your career journey, major technical milestones, and why you are interested in this position.",
        "interview_type": "behavioral",
        "difficulty": "easy",
        "tags": ["introduction", "communication"],
        "company_tags": ["General"],
        "hints": [
            "Structure your answer chronologically: Past (your background/experience), Present (recent achievements), and Future (why this role matches your growth).",
            "Keep it under 2-3 minutes. Highlight 1-2 key accomplishments that align with the job description.",
            "Avoid listing every bullet point from your resume; instead, tell a cohesive story about your engineering passion."
        ]
    },
    {
        "id": "behavioral-02-conflict",
        "title": "Describe a conflict you had with a coworker and how you resolved it",
        "description": "Tell me about a time when you disagreed with a colleague (product manager, engineer, designer) on a project, and how you worked together to resolve it.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["collaboration", "conflict-resolution"],
        "company_tags": ["Amazon", "Google"],
        "hints": [
            "Use the STAR method: describe the Situation, the Task, the Action you took, and the Result.",
            "Focus on the professional disagreement, not personal clashes. Keep the tone collaborative and objective.",
            "Highlight active listening, compromise, or looking at data/metrics to make the final decision."
        ]
    },
    {
        "id": "behavioral-03-failure",
        "title": "Tell me about your biggest professional failure",
        "description": "Share an instance where you made a mistake, missed a deadline, or introduced a bug, and what you learned from the experience.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["growth-mindset", "ownership"],
        "company_tags": ["Meta", "Netflix"],
        "hints": [
            "Pick a real failure, but ensure it is one that you successfully resolved or learned a valuable lesson from.",
            "Take full responsibility. Do not blame other team members or external factors.",
            "Devote 60% of your response to the lessons learned and how you changed your practices or processes afterward to prevent it."
        ]
    },
    {
        "id": "behavioral-04-leadership",
        "title": "Share an example of a time you took initiative or led a project",
        "description": "Describe a situation where you identified a problem, proposed a solution, and led the effort to implement it, even if you were not the official lead.",
        "interview_type": "behavioral",
        "difficulty": "easy",
        "tags": ["leadership", "initiative"],
        "company_tags": ["Google", "Salesforce"],
        "hints": [
            "Clarify why the problem mattered to the business or engineering team (e.g., poor developer velocity, high latency).",
            "Detail how you influenced others and gathered buy-in without formal authority.",
            "Highlight the final outcomes in terms of performance metrics, time saved, or costs reduced."
        ]
    },
    {
        "id": "behavioral-05-ambiguity",
        "title": "Tell me about a time you handled a highly ambiguous project",
        "description": "Describe a project that had vague requirements or undefined scopes, and how you approached structuring and delivering it.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["ambiguity", "problem-solving"],
        "company_tags": ["Meta", "Uber"],
        "hints": [
            "Start by explaining how you clarified requirements (asking stakeholders, writing specs, creating POCs).",
            "Break down the problem into smaller milestones and establish a feedback loop.",
            "Conclude with how the project stabilized and what process improvements you established for future ambiguity."
        ]
    },
    {
        "id": "behavioral-06-deadlines",
        "title": "Describe a time you had to meet a tight deadline under pressure",
        "description": "Tell me about a situation where you had a critical deliverable with insufficient time, and how you managed resources and scope to deliver.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["prioritization", "execution"],
        "company_tags": ["Apple", "Stripe"],
        "hints": [
            "Explain the trade-offs you evaluated (e.g. descoping non-critical features, working asynchronously).",
            "Emphasize communication: how did you update stakeholders on risks and progress?",
            "Explain how you ensured quality was not compromised, or how you managed technical debt afterwards."
        ]
    },
    {
        "id": "behavioral-07-mentoring",
        "title": "Tell me about a time you mentored or helped a junior engineer grow",
        "description": "Discuss your approach to helping another developer improve their skills, onboard onto the team, or overcome a career roadblock.",
        "interview_type": "behavioral",
        "difficulty": "easy",
        "tags": ["mentorship", "empathy"],
        "company_tags": ["LinkedIn", "Google"],
        "hints": [
            "Show empathy and tailoring: how did you adapt your mentoring style to their specific learning style?",
            "Provide concrete examples: code reviews, pair programming sessions, or setting up learning plans.",
            "Discuss the positive outcome of their growth (e.g., they shipped a major feature, became independent)."
        ]
    },
    {
        "id": "behavioral-08-customer-obsession",
        "title": "Describe a time when you went above and beyond for a customer",
        "description": "Tell me about a time you dug deep to solve a customer issue or prioritized user experience over engineering convenience.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["customer-obsession", "product-mindset"],
        "company_tags": ["Amazon", "Stripe"],
        "hints": [
            "Explain the customer's problem and the business impact of their issue.",
            "Describe the extra effort or creative solution you implemented to resolve it.",
            "How did this build long-term trust, or change how the product handles similar cases?"
        ]
    },
    {
        "id": "behavioral-09-innovation",
        "title": "Describe a creative solution you proposed to a complex technical problem",
        "description": "Tell me about a time you thought outside the box to solve a bottleneck or issue that traditional approaches couldn't address.",
        "interview_type": "behavioral",
        "difficulty": "hard",
        "tags": ["creativity", "innovation"],
        "company_tags": ["Netflix", "Meta"],
        "hints": [
            "What was the constraint that made traditional solutions fail?",
            "Explain the technical details of your creative approach and how you proved it was viable.",
            "Quantify the results (e.g., resource usage, cost, latency reduction)."
        ]
    },
    {
        "id": "behavioral-10-influence",
        "title": "Tell me about a time you convinced your team to adopt a new technology or practice",
        "description": "Explain how you gathered arguments, onboarded teammates, and successfully migrated or introduced a new tool, language, or system design pattern.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["influence", "collaboration"],
        "company_tags": ["Microsoft", "Google"],
        "hints": [
            "What was the status quo, and why was it insufficient?",
            "Explain how you reduced friction (e.g., building a small prototype, holding a presentation, writing docs).",
            "Show the long-term impact on velocity, developer happiness, or service stability."
        ]
    },
    {
        "id": "behavioral-11-teamwork",
        "title": "Describe a time you worked effectively in a diverse team",
        "description": "Share an experience working with team members from different backgrounds, time zones, or with varying levels of expertise. How did you ensure effective collaboration?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["teamwork", "communication"],
        "company_tags": ["Google", "Meta", "Microsoft"],
        "hints": [
            "Highlight how you adapted your communication style to different team members.",
            "Discuss any cultural or timezone challenges and how you overcame them.",
            "Emphasize the importance of inclusivity and creating an environment where everyone could contribute."
        ]
    },
    {
        "id": "behavioral-12-learning",
        "title": "Tell me about a time you had to learn a new technology quickly",
        "description": "Describe a situation where you needed to pick up a new language, framework, or tool under time pressure. How did you approach the learning process?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["learning", "adaptability"],
        "company_tags": ["Amazon", "Google", "Netflix"],
        "hints": [
            "Explain your learning strategy: documentation, tutorials, mentorship, hands-on practice.",
            "Discuss how you balanced learning with delivering on project commitments.",
            "Share the outcome and how this experience improved your ability to learn new technologies."
        ]
    },
    {
        "id": "behavioral-13-prioritization",
        "title": "Describe how you prioritize tasks when everything seems urgent",
        "description": "Explain your framework for deciding what to work on first when faced with competing deadlines and stakeholder demands.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["prioritization", "decision-making"],
        "company_tags": ["Apple", "Stripe", "Google"],
        "hints": [
            "Discuss how you assess business impact, user value, and technical dependencies.",
            "Explain how you communicate trade-offs to stakeholders and manage expectations.",
            "Share a specific example where your prioritization led to successful outcomes."
        ]
    },
    {
        "id": "behavioral-14-feedback",
        "title": "Tell me about a time you received difficult feedback and how you handled it",
        "description": "Share an experience where you received constructive criticism or negative feedback. How did you process it and what changes did you make?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["growth-mindset", "self-awareness"],
        "company_tags": ["Meta", "Google", "Amazon"],
        "hints": [
            "Focus on your emotional reaction and how you maintained professionalism.",
            "Explain the specific actions you took to address the feedback.",
            "Discuss the positive outcome and how this experience helped you grow."
        ]
    },
    {
        "id": "behavioral-15-delegation",
        "title": "Describe a time you had to delegate work effectively",
        "description": "Explain how you assigned tasks to team members, considering their skills, workload, and development goals while ensuring project success.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["leadership", "delegation"],
        "company_tags": ["Microsoft", "Amazon", "Google"],
        "hints": [
            "Discuss how you assessed team members' capabilities and matched tasks to their strengths.",
            "Explain how you provided clear expectations and support without micromanaging.",
            "Share how you handled challenges and ensured accountability while maintaining team morale."
        ]
    },
    {
        "id": "behavioral-16-stakeholder-management",
        "title": "Describe a time you managed conflicting stakeholder expectations",
        "description": "Share an experience where different stakeholders (product, engineering, business) had competing priorities or requirements. How did you align them?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["communication", "stakeholder-management"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain how you identified the root cause of conflicting expectations.",
            "Discuss your approach to facilitating dialogue and finding common ground.",
            "Share the outcome and how you built better alignment processes for the future."
        ]
    },
    {
        "id": "behavioral-17-technical-debt",
        "title": "Tell me about a time you had to address technical debt",
        "description": "Describe a situation where you identified significant technical debt and convinced stakeholders to allocate time for refactoring or architectural improvements.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["technical-leadership", "prioritization"],
        "company_tags": ["Netflix", "Google", "Meta"],
        "hints": [
            "Explain how you quantified the impact of technical debt on velocity or reliability.",
            "Discuss your strategy for presenting the business case to non-technical stakeholders.",
            "Share how you balanced addressing debt with delivering new features."
        ]
    },
    {
        "id": "behavioral-18-crisis-management",
        "title": "Describe a time you handled a production incident or crisis",
        "description": "Share an experience where a critical system failed or a major bug was discovered. How did you lead the response and communicate with stakeholders?",
        "interview_type": "behavioral",
        "difficulty": "hard",
        "tags": ["crisis-management", "leadership"],
        "company_tags": ["Google", "Amazon", "Netflix"],
        "hints": [
            "Explain your immediate actions to stabilize the situation and minimize impact.",
            "Discuss how you coordinated the team and communicated with stakeholders during the incident.",
            "Share the post-incident analysis and improvements you implemented."
        ]
    },
    {
        "id": "behavioral-19-cross-functional",
        "title": "Describe a time you worked with non-engineering teams",
        "description": "Share an experience collaborating with product, design, marketing, or sales teams. How did you bridge technical and business perspectives?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["collaboration", "communication"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Explain how you adapted your communication style for different audiences.",
            "Discuss how you balanced technical constraints with business requirements.",
            "Share the outcome and how the collaboration improved the final product."
        ]
    },
    {
        "id": "behavioral-20-work-life-balance",
        "title": "How do you maintain work-life balance during crunch periods?",
        "description": "Describe your approach to managing personal well-being while meeting demanding deadlines or handling high-pressure situations.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["self-management", "resilience"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Share specific strategies you use to maintain perspective and avoid burnout.",
            "Discuss how you communicate boundaries while still being a reliable team member.",
            "Explain how you recover after intense periods and maintain long-term sustainability."
        ]
    },
    {
        "id": "behavioral-21-contract-work",
        "title": "Describe a time you had to work with a difficult contractor or vendor",
        "description": "Share an experience managing external dependencies where the vendor was underperforming or difficult to work with. How did you handle the situation?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["vendor-management", "negotiation"],
        "company_tags": ["Amazon", "Microsoft", "Google"],
        "hints": [
            "Explain how you established clear expectations and SLAs from the beginning.",
            "Discuss how you addressed performance issues while maintaining the relationship.",
            "Share what you learned about vendor selection and management for future projects."
        ]
    },
    {
        "id": "behavioral-22-data-driven",
        "title": "Tell me about a time you used data to drive a decision",
        "description": "Describe a situation where you gathered and analyzed data to make a technical or product decision. How did you convince others?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["data-analysis", "decision-making"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Explain the problem and why data was necessary for the decision.",
            "Discuss your data collection methodology and analysis approach.",
            "Share how you presented the data to stakeholders and influenced the outcome."
        ]
    },
    {
        "id": "behavioral-23-remote-work",
        "title": "Describe how you maintain productivity and collaboration while working remotely",
        "description": "Share your strategies for effective communication, collaboration, and productivity in a distributed or remote work environment.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["remote-work", "communication"],
        "company_tags": ["GitLab", "Twitter", "Meta"],
        "hints": [
            "Discuss specific tools and processes you use to stay aligned with your team.",
            "Explain how you maintain visibility and accountability without being intrusive.",
            "Share how you build relationships and culture in a remote setting."
        ]
    },
    {
        "id": "behavioral-24-code-review",
        "title": "Describe your approach to giving and receiving code reviews",
        "description": "Explain how you provide constructive feedback on code and how you handle feedback on your own code. Share a specific example.",
        "interview_type": "behavioral",
        "difficulty": "easy",
        "tags": ["collaboration", "code-quality"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Discuss your philosophy on code reviews: quality vs speed, learning vs policing.",
            "Share how you deliver feedback constructively and handle disagreements.",
            "Explain how you use code reviews as a learning opportunity for the team."
        ]
    },
    {
        "id": "behavioral-25-documentation",
        "title": "Tell me about a time you improved documentation or knowledge sharing",
        "description": "Describe a situation where you identified a gap in documentation or knowledge sharing and took action to improve it.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["documentation", "knowledge-sharing"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain how you identified the documentation gap and its impact on the team.",
            "Discuss your approach to creating or improving documentation.",
            "Share how you encouraged adoption and maintained the documentation over time."
        ]
    },
    {
        "id": "behavioral-26-refactoring",
        "title": "Describe a time you refactored legacy code",
        "description": "Share an experience where you improved existing code without breaking functionality. How did you ensure safety and convince stakeholders?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["technical-excellence", "risk-management"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain how you assessed the risks and planned the refactoring approach.",
            "Discuss your testing strategy and how you ensured backward compatibility.",
            "Share how you communicated the benefits and managed stakeholder concerns."
        ]
    },
    {
        "id": "behavioral-27-performance-review",
        "title": "Describe a time you received a performance review you disagreed with",
        "description": "Share an experience where you received feedback you felt was unfair or inaccurate. How did you handle the conversation?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["self-awareness", "communication"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Explain your initial emotional reaction and how you managed it professionally.",
            "Discuss how you sought clarification and provided your perspective.",
            "Share the outcome and what you learned from the experience."
        ]
    },
    {
        "id": "behavioral-28-onboarding",
        "title": "Describe how you onboard new team members",
        "description": "Explain your approach to helping new engineers or team members get up to speed and become productive quickly.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["mentorship", "onboarding"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Discuss your structured approach to onboarding: documentation, pairing, gradual responsibility.",
            "Explain how you tailor onboarding to the individual's experience level and learning style.",
            "Share how you measure onboarding success and iterate on the process."
        ]
    },
    {
        "id": "behavioral-29-estimation",
        "title": "Describe your approach to project estimation",
        "description": "Explain how you estimate work and handle situations where estimates turn out to be wrong. Share a specific example.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["planning", "estimation"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Discuss your methodology: breaking down work, considering uncertainty, adding buffers.",
            "Share how you communicate estimates and their confidence levels to stakeholders.",
            "Explain how you handle overruns and adjust estimates based on learnings."
        ]
    },
    {
        "id": "behavioral-30-testing",
        "title": "Describe your philosophy on testing and quality assurance",
        "description": "Explain your approach to writing tests, ensuring code quality, and balancing speed with thoroughness.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["quality", "testing"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Discuss your testing strategy: unit tests, integration tests, E2E tests.",
            "Explain how you decide what level of testing is appropriate for different contexts.",
            "Share how you advocate for quality when facing pressure to ship quickly."
        ]
    },
    {
        "id": "behavioral-31-security",
        "title": "Describe a time you identified or addressed a security vulnerability",
        "description": "Share an experience where you found a security issue or implemented security improvements. How did you prioritize and communicate it?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["security", "risk-management"],
        "company_tags": ["Google", "Amazon", "Meta"],
        "hints": [
            "Explain how you discovered the vulnerability and assessed its severity.",
            "Discuss how you communicated the risk to stakeholders and prioritized the fix.",
            "Share what you learned about security best practices and prevention."
        ]
    },
    {
        "id": "behavioral-32-scaling",
        "title": "Describe a time you scaled a system or process",
        "description": "Share an experience where you successfully scaled a technical system or team process to handle increased load or complexity.",
        "interview_type": "behavioral",
        "difficulty": "hard",
        "tags": ["scalability", "architecture"],
        "company_tags": ["Google", "Amazon", "Netflix"],
        "hints": [
            "Explain the scaling challenge and the constraints you faced.",
            "Discuss your approach: architectural changes, process improvements, team scaling.",
            "Share the metrics that demonstrated success and lessons learned."
        ]
    },
    {
        "id": "behavioral-33-open-source",
        "title": "Describe your experience with open source contributions",
        "description": "Share your experience contributing to or maintaining open source projects. How do you handle community dynamics and code review?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["open-source", "collaboration"],
        "company_tags": ["Google", "Meta", "Microsoft"],
        "hints": [
            "Discuss your contributions: bug fixes, features, documentation, community support.",
            "Explain how you navigate community guidelines and maintainers' expectations.",
            "Share how open source experience has improved your engineering skills."
        ]
    },
    {
        "id": "behavioral-34-mentoring-junior",
        "title": "Describe how you help junior engineers grow",
        "description": "Explain your approach to mentoring less experienced engineers. Share specific examples of how you've helped someone develop.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["mentorship", "leadership"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Discuss your mentoring philosophy: hands-on vs guidance, setting goals, providing feedback.",
            "Share a specific example of a junior engineer you helped develop.",
            "Explain how you balance mentoring with your own responsibilities."
        ]
    },
    {
        "id": "behavioral-35-innovation-culture",
        "title": "Describe how you foster innovation in your team",
        "description": "Explain how you encourage creative problem-solving and experimentation within your team or organization.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["innovation", "leadership"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Discuss how you create psychological safety for trying new approaches.",
            "Explain processes you've implemented: hackathons, innovation time, idea sharing.",
            "Share examples of innovations that emerged from this culture."
        ]
    },
    {
        "id": "behavioral-36-cross-team-projects",
        "title": "Describe a time you led a cross-team project",
        "description": "Share an experience where you coordinated work across multiple teams or organizations. How did you align priorities and ensure success?",
        "interview_type": "behavioral",
        "difficulty": "hard",
        "tags": ["leadership", "coordination"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain the project scope and the different teams involved.",
            "Discuss how you established shared goals and communication channels.",
            "Share how you handled conflicts and kept everyone aligned."
        ]
    },
    {
        "id": "behavioral-37-budget-management",
        "title": "Describe a time you managed a budget or resources",
        "description": "Share an experience where you had financial responsibility or managed limited resources. How did you make trade-off decisions?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["resource-management", "decision-making"],
        "company_tags": ["Amazon", "Google", "Microsoft"],
        "hints": [
            "Explain the constraints and priorities you had to balance.",
            "Discuss your decision-making framework for allocating resources.",
            "Share the outcome and how you communicated trade-offs to stakeholders."
        ]
    },
    {
        "id": "behavioral-38-customer-feedback",
        "title": "Describe a time you acted on customer feedback",
        "description": "Share an experience where customer feedback led you to change direction or prioritize differently. How did you validate and implement the change?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["customer-focus", "adaptability"],
        "company_tags": ["Amazon", "Google", "Meta"],
        "hints": [
            "Explain how you collected and validated the customer feedback.",
            "Discuss how you convinced stakeholders to change priorities based on feedback.",
            "Share the impact of the change on customer satisfaction and business metrics."
        ]
    },
    {
        "id": "behavioral-39-failure-postmortem",
        "title": "Describe a postmortem you conducted after a failure",
        "description": "Share an experience where you led or participated in a postmortem analysis. How did you ensure it was blameless and actionable?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["learning", "process-improvement"],
        "company_tags": ["Google", "Amazon", "Netflix"],
        "hints": [
            "Explain how you structured the postmortem to be blameless and focused on systems.",
            "Discuss the root cause analysis and actionable improvements that emerged.",
            "Share how you ensured the improvements were implemented and prevented recurrence."
        ]
    },
    {
        "id": "behavioral-40-technical-writing",
        "title": "Describe your approach to technical writing and documentation",
        "description": "Explain how you write technical documentation, design docs, or RFCs. Share an example of effective technical communication.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["communication", "documentation"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Discuss your writing process: understanding audience, structuring content, iterating.",
            "Share an example of a document you wrote and its impact on the team or project.",
            "Explain how you balance technical depth with accessibility for different audiences."
        ]
    },
    {
        "id": "behavioral-41-continuous-learning",
        "title": "How do you stay current with technology trends?",
        "description": "Describe your approach to continuous learning and professional development. Share specific resources or habits you maintain.",
        "interview_type": "behavioral",
        "difficulty": "easy",
        "tags": ["learning", "growth-mindset"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Discuss specific resources: blogs, conferences, courses, communities.",
            "Explain how you balance learning with work responsibilities.",
            "Share how you apply new knowledge to your work or share it with your team."
        ]
    },
    {
        "id": "behavioral-42-team-culture",
        "title": "Describe how you contribute to team culture",
        "description": "Explain your approach to building and maintaining a positive team culture. Share specific actions you've taken.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["team-building", "culture"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Discuss your philosophy on what makes a good team culture.",
            "Share specific actions: organizing events, mentoring, giving feedback, celebrating wins.",
            "Explain how you handle toxic behavior or cultural challenges."
        ]
    },
    {
        "id": "behavioral-43-negotiation",
        "title": "Describe a time you negotiated a technical decision",
        "description": "Share an experience where you had to negotiate with stakeholders to reach a technical decision. How did you find common ground?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["negotiation", "influence"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain the conflicting perspectives and constraints involved.",
            "Discuss your approach to understanding each side's needs and finding compromise.",
            "Share the outcome and how the decision worked out for the project."
        ]
    },
    {
        "id": "behavioral-44-time-management",
        "title": "Describe how you manage your time and priorities",
        "description": "Explain your approach to time management, handling interruptions, and staying focused on important work.",
        "interview_type": "behavioral",
        "difficulty": "easy",
        "tags": ["time-management", "productivity"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Discuss specific techniques: time blocking, prioritization frameworks, managing notifications.",
            "Explain how you handle context switching and maintain deep work time.",
            "Share how you adapt your approach during different types of work periods."
        ]
    },
    {
        "id": "behavioral-45-contract-negotiation",
        "title": "Describe a time you negotiated a contract or agreement",
        "description": "Share an experience where you negotiated terms with a vendor, partner, or customer. How did you ensure a fair outcome?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["negotiation", "business-acumen"],
        "company_tags": ["Amazon", "Google", "Microsoft"],
        "hints": [
            "Explain your preparation: understanding needs, researching alternatives, setting targets.",
            "Discuss the negotiation process and how you built rapport and found win-win solutions.",
            "Share the outcome and what you learned about negotiation strategy."
        ]
    },
    {
        "id": "behavioral-46-diversity-inclusion",
        "title": "Describe how you promote diversity and inclusion",
        "description": "Explain your approach to creating an inclusive environment and supporting diverse perspectives in your team or organization.",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["diversity", "inclusion"],
        "company_tags": ["Google", "Meta", "Amazon"],
        "hints": [
            "Discuss specific actions: inclusive hiring practices, supporting ERGs, creating safe spaces.",
            "Share examples of how you've handled bias or microaggressions when you witnessed them.",
            "Explain how you measure the impact of D&I initiatives."
        ]
    },
    {
        "id": "behavioral-47-research",
        "title": "Describe a time you conducted technical research",
        "description": "Share an experience where you had to research and evaluate technologies or approaches to solve a problem. How did you make your decision?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["research", "decision-making"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain your research methodology: criteria, sources, prototyping, benchmarking.",
            "Discuss how you evaluated trade-offs and made your final recommendation.",
            "Share how you communicated your findings and convinced stakeholders."
        ]
    },
    {
        "id": "behavioral-48-presentation",
        "title": "Describe a time you presented to executives or leadership",
        "description": "Share an experience where you presented technical information to non-technical leadership. How did you tailor your message?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["communication", "presentation"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain how you adapted your content for the audience's level of technical understanding.",
            "Discuss how you focused on business impact rather than technical details.",
            "Share the outcome and how you handled questions or pushback."
        ]
    },
    {
        "id": "behavioral-49-project-recovery",
        "title": "Describe a time you helped turn around a failing project",
        "description": "Share an experience where you stepped into a project that was off track and helped recover it. What did you do?",
        "interview_type": "behavioral",
        "difficulty": "hard",
        "tags": ["leadership", "problem-solving"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain how you assessed the situation and identified root causes of failure.",
            "Discuss your recovery plan: quick wins, stakeholder alignment, team motivation.",
            "Share the outcome and what you learned about project recovery."
        ]
    },
    {
        "id": "behavioral-50-ethical-decision",
        "title": "Describe a time you faced an ethical dilemma",
        "description": "Share an experience where you had to make a difficult ethical decision in a professional context. How did you approach it?",
        "interview_type": "behavioral",
        "difficulty": "hard",
        "tags": ["ethics", "decision-making"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Explain the ethical conflict and the stakeholders involved.",
            "Discuss your decision-making process and how you sought guidance.",
            "Share the outcome and how it aligned with your values and professional standards."
        ]
    },

    # ─── 8 System Design Questions ────────────────────────────────────────────────
    {
        "id": "sys-01-url-shortener",
        "title": "Design a URL Shortener (e.g., Bit.ly)",
        "description": "Design a service that takes a long URL and generates a short alias. The alias should redirect clients to the original long URL. The system needs to support high read QPS and low latency redirection.",
        "interview_type": "system_design",
        "difficulty": "easy",
        "tags": ["hashing", "caching", "sql-vs-nosql"],
        "company_tags": ["Google", "Twitter", "Amazon"],
        "hints": [
            "Estimate write vs read QPS. Redirections (reads) will typically outnumber creations (writes) by 100:1.",
            "Use Base62 encoding on an auto-incrementing ID to generate short keys (e.g. 6 chars give 56B combinations).",
            "Read performance is critical; employ aggressive caching (Redis) for hot keys and split database reads/writes."
        ]
    },
    {
        "id": "sys-02-twitter",
        "title": "Design Twitter / X Timeline",
        "description": "Design the feed and timeline generation system for a social media application like Twitter. Users should be able to post tweets, follow others, and view a feed of combined tweets sorted chronologically.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["fanout", "caching", "pubsub"],
        "company_tags": ["Twitter", "Meta", "Netflix"],
        "hints": [
            "Distinguish between home timeline (viewing tweets from followed people) and user timeline (viewing own tweets).",
            "Compare push (fanout on write) vs pull (fanout on read) models. Push is fast for regular users, but fails for celebrities (high follower counts).",
            "Implement a hybrid model: push tweets for non-celebrities, and merge celebrity feeds dynamically on pull."
        ]
    },
    {
        "id": "sys-03-whatsapp",
        "title": "Design a Chat System (e.g., WhatsApp / Slack)",
        "description": "Design a real-time, secure instant messaging system. It must support 1-on-1 chats, group chats, message delivery status (sent, delivered, read), and offline message storage.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["websockets", "nosql", "scalability"],
        "company_tags": ["Meta", "Telegram", "Discord"],
        "hints": [
            "Use persistent WebSocket or HTTP long polling connections to deliver real-time messages.",
            "Use a gateway manager/session registry to track which server holds the active socket connection for each user.",
            "Choose an appropriate NoSQL database (like Cassandra or HBase) to handle high-write append-only chat histories efficiently."
        ]
    },
    {
        "id": "sys-04-youtube",
        "title": "Design a Video Streaming Platform (e.g., YouTube)",
        "description": "Design a scalable video sharing and streaming system. Users can upload videos (up to several GBs), search, and stream videos in different resolutions with minimal buffering.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["cdn", "transcoding", "object-storage"],
        "company_tags": ["Google", "Netflix", "Amazon"],
        "hints": [
            "Decompose video uploading: upload raw file, run async chunk-based transcoding (HLS, DASH) into multiple resolutions.",
            "Distribute video playback via Content Delivery Networks (CDNs) located at edge locations near users.",
            "Use object storage (e.g. S3) for transcoded chunks, metadata databases for video catalog, and caches for popular recommendations."
        ]
    },
    {
        "id": "sys-05-rate-limiter",
        "title": "Design an API Rate Limiter",
        "description": "Design a high-throughput, low-latency rate limiter that protects downstream APIs from abuse. It must support multiple rate-limiting algorithms and tenant configurations.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["algorithms", "caching", "redis"],
        "company_tags": ["Stripe", "Google", "Uber"],
        "hints": [
            "Compare rate-limiting algorithms: Token Bucket, Leaky Bucket, Fixed Window, Sliding Window Log, Sliding Window Counter.",
            "Use Redis for maintaining request counters at scale, utilizing pipeline commands to minimize round-trips.",
            "Discuss placement: API Gateway level vs client middleware vs service-side filter."
        ]
    },
    {
        "id": "sys-06-distributed-cache",
        "title": "Design a Distributed Cache (e.g., Memcached)",
        "description": "Design a cluster-based in-memory caching system. It must support O(1) read/write operations, data eviction strategies (LRU), and balance keys across multiple cache servers.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["distributed-systems", "consistent-hashing", "cache-eviction"],
        "company_tags": ["Amazon", "Google", "Facebook"],
        "hints": [
            "Use Consistent Hashing with virtual nodes to distribute keys evenly and prevent massive cache misses during node additions/removals.",
            "Implement O(1) local evictions using a Hash Map combined with a Doubly Linked List.",
            "Address node failure: replicate keys across peers, or use a master-replica setup with automatic failover."
        ]
    },
    {
        "id": "sys-07-search-autocomplete",
        "title": "Design Search Autocomplete / Typeahead Suggestion",
        "description": "Design a system that returns the top 5 most popular query suggestions in real time as the user types in a search box. Latency must be under 10-20ms.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["trie", "mapreduce", "caching"],
        "company_tags": ["Google", "Microsoft", "Amazon"],
        "hints": [
            "Use a Trie (Prefix Tree) data structure to find matching prefixes and retrieve popular suffixes.",
            "To speed up lookups, precompute and store the top 5 query results at each Trie node, updated via an offline MapReduce/Spark aggregator.",
            "Cache suggestions at the client browser, CDN, and a Redis cluster for highly frequent prefixes."
        ]
    },
    {
        "id": "sys-08-ride-sharing",
        "title": "Design a Ride-Sharing System (e.g., Uber / Lyft)",
        "description": "Design a platform that matches drivers with riders in real time. It must track driver locations, handle geofenced queries, and calculate optimal route matches.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["geospatial", "websockets", "pubsub"],
        "company_tags": ["Uber", "Lyft", "Grab"],
        "hints": [
            "Use geospatial indexing systems like GeoHash or Uber's H3 grid to segment locations into cells.",
            "Drivers send location updates (latitude, longitude) every 3-5 seconds via WebSockets. Update the location index in Redis.",
            "Query matching: search drivers within adjacent H3 index cells and run a match algorithm based on distance, rating, and ETA."
        ]
    },
    {
        "id": "sys-09-file-storage",
        "title": "Design a File Storage System (e.g., Dropbox / Google Drive)",
        "description": "Design a cloud-based file storage and synchronization service. Users can upload files, sync across devices, share files with others, and access previous file versions.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["storage", "sync", "versioning"],
        "company_tags": ["Google", "Dropbox", "Microsoft"],
        "hints": [
            "Use a block-based storage approach where files are split into chunks and deduplicated to save space.",
            "Implement a notification service to push file changes to connected clients in real-time.",
            "Use a metadata database to track file versions, permissions, and sync status across devices."
        ]
    },
    {
        "id": "sys-10-notification-system",
        "title": "Design a Push Notification System",
        "description": "Design a scalable push notification service that can send millions of notifications per second to mobile devices. It must support scheduling, batching, and delivery tracking.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["pubsub", "queue", "scalability"],
        "company_tags": ["Google", "Apple", "Meta"],
        "hints": [
            "Use a message queue (Kafka, RabbitMQ) to decouple notification generation from delivery.",
            "Batch notifications to reduce API calls to push service providers (FCM, APNs).",
            "Implement exponential backoff for failed deliveries and track delivery status for analytics."
        ]
    },
    {
        "id": "sys-11-shopping-cart",
        "title": "Design a Shopping Cart Service",
        "description": "Design a shopping cart system for an e-commerce platform. It must handle high concurrency during flash sales, support cart persistence across sessions, and integrate with inventory and checkout services.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["caching", "consistency", "microservices"],
        "company_tags": ["Amazon", "eBay", "Shopify"],
        "hints": [
            "Use Redis for fast cart operations with persistence to a database for durability.",
            "Implement optimistic locking or versioning to handle concurrent cart modifications.",
            "Design for eventual consistency with inventory service - validate stock at checkout time."
        ]
    },
    {
        "id": "sys-12-key-value-store",
        "title": "Design a Distributed Key-Value Store (e.g., DynamoDB / Cassandra)",
        "description": "Design a distributed key-value store that provides low-latency reads/writes, automatic sharding, replication for fault tolerance, and tunable consistency levels.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["distributed-systems", "consistency", "sharding"],
        "company_tags": ["Amazon", "Facebook", "Google"],
        "hints": [
            "Use consistent hashing for data distribution across nodes with virtual nodes for load balancing.",
            "Implement replication with a quorum-based approach for tunable consistency (strong vs eventual).",
            "Handle node failures with automatic rebalancing and use Merkle trees for data synchronization."
        ]
    },
    {
        "id": "sys-13-web-crawler",
        "title": "Design a Web Crawler (e.g., Google Search)",
        "description": "Design a scalable web crawler that can efficiently discover, fetch, and index billions of web pages. It must handle politeness policies, duplicate detection, and incremental updates.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["distributed-systems", "hashing", "queue"],
        "company_tags": ["Google", "Bing", "Baidu"],
        "hints": [
            "Use a URL frontier queue with priority based on page importance and freshness requirements.",
            "Implement distributed crawling with multiple workers sharing the frontier via a message queue.",
            "Use fingerprinting (SimHash, Bloom filters) for efficient duplicate content detection."
        ]
    },
    {
        "id": "sys-14-real-time-analytics",
        "title": "Design a Real-Time Analytics System",
        "description": "Design a system that processes and analyzes streaming data in real-time, providing dashboards with sub-second latency. It must handle millions of events per second and support complex aggregations.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["streaming", "aggregation", "caching"],
        "company_tags": ["Netflix", "Uber", "Meta"],
        "hints": [
            "Use stream processing frameworks like Kafka Streams, Flink, or Spark Streaming for real-time processing.",
            "Pre-compute common aggregations and store in time-series databases for fast dashboard queries.",
            "Implement a lambda architecture: real-time layer for speed, batch layer for accuracy and historical analysis."
        ]
    },
    {
        "id": "sys-15-unique-id-generator",
        "title": "Design a Unique ID Generator (e.g., Snowflake)",
        "description": "Design a distributed unique ID generation service that produces globally unique IDs across multiple data centers. IDs must be sortable by time and have no collisions.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["distributed-systems", "clock-sync", "coordination"],
        "company_tags": ["Twitter", "Google", "Amazon"],
        "hints": [
            "Use a combination of timestamp, datacenter ID, worker ID, and sequence number (like Twitter's Snowflake).",
            "Synchronize clocks across data centers using NTP and handle clock skew gracefully.",
            "Ensure sequence numbers roll over safely and handle edge cases during high concurrency."
        ]
    },
    {
        "id": "sys-16-pastebin",
        "title": "Design a Pastebin Service (e.g., Pastebin, Gist)",
        "description": "Design a service that allows users to store and share text snippets. Features should include expiration times, privacy settings, and syntax highlighting.",
        "interview_type": "system_design",
        "difficulty": "easy",
        "tags": ["storage", "caching", "database"],
        "company_tags": ["GitHub", "GitLab", "Bitbucket"],
        "hints": [
            "Use a relational database for metadata and object storage for the actual content.",
            "Implement caching for frequently accessed pastes to reduce database load.",
            "Handle expiration with TTL in cache and scheduled cleanup jobs for database."
        ]
    },
    {
        "id": "sys-17-instagram",
        "title": "Design Instagram",
        "description": "Design a photo and video sharing social media platform. Features include uploading media, following users, liking/commenting, and a feed of posts from followed users.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["storage", "feed-generation", "cdn"],
        "company_tags": ["Meta", "Twitter", "Pinterest"],
        "hints": [
            "Use object storage (S3) for media files with CDN for fast delivery.",
            "Implement a hybrid feed generation: fanout-on-write for regular users, pull-on-read for celebrities.",
            "Use Redis for caching hot content and user session data."
        ]
    },
    {
        "id": "sys-18-design-cassandra",
        "title": "Design a NoSQL Database (e.g., Cassandra)",
        "description": "Design a distributed NoSQL database that provides high availability, partition tolerance, and tunable consistency. Support for large-scale write-heavy workloads.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["distributed-systems", "consistency", "replication"],
        "company_tags": ["Facebook", "Netflix", "Apple"],
        "hints": [
            "Use consistent hashing with virtual nodes for data distribution and load balancing.",
            "Implement tunable consistency with quorum-based reads and writes.",
            "Use a gossip protocol for cluster membership and failure detection."
        ]
    },
    {
        "id": "sys-19-design-kafka",
        "title": "Design a Distributed Message Queue (e.g., Kafka)",
        "description": "Design a distributed messaging system that provides high throughput, fault tolerance, and durable message storage. Support for multiple consumer groups with offset tracking.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["distributed-systems", "messaging", "storage"],
        "company_tags": ["LinkedIn", "Uber", "Netflix"],
        "hints": [
            "Use partitioned log architecture for parallel processing and scalability.",
            "Implement replication for fault tolerance and data durability.",
            "Support consumer groups with offset tracking for exactly-once semantics."
        ]
    },
    {
        "id": "sys-20-design-redis",
        "title": "Design an In-Memory Cache (e.g., Redis)",
        "description": "Design a high-performance in-memory data structure store. Support for various data types, persistence options, and replication.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["caching", "persistence", "replication"],
        "company_tags": ["Redis Labs", "Amazon", "Google"],
        "hints": [
            "Use efficient data structures: hash tables, skip lists, radix trees for different use cases.",
            "Implement persistence with RDB snapshots and AOF logs for durability.",
            "Support replication with master-slave configuration for read scaling."
        ]
    },
    {
        "id": "sys-21-design-elasticsearch",
        "title": "Design a Search Engine (e.g., Elasticsearch)",
        "description": "Design a distributed search and analytics engine. Support for full-text search, aggregations, and real-time indexing.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["search", "distributed-systems", "indexing"],
        "company_tags": ["Elastic", "Amazon", "Google"],
        "hints": [
            "Use inverted index for efficient full-text search with term frequencies.",
            "Implement sharding for horizontal scaling and replication for fault tolerance.",
            "Support near real-time indexing with segment merging and refresh intervals."
        ]
    },
    {
        "id": "sys-22-design-mongodb",
        "title": "Design a Document Database (e.g., MongoDB)",
        "description": "Design a document-oriented NoSQL database. Support for flexible schema, rich queries, and horizontal scaling.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["database", "sharding", "replication"],
        "company_tags": ["MongoDB", "Amazon", "Google"],
        "hints": [
            "Use BSON format for flexible document storage with nested structures.",
            "Implement sharding based on shard keys for horizontal scaling.",
            "Support replica sets for high availability and automatic failover."
        ]
    },
    {
        "id": "sys-23-design-consul",
        "title": "Design a Service Discovery System (e.g., Consul)",
        "description": "Design a service discovery and configuration system. Support for health checking, key-value storage, and service registration.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["microservices", "discovery", "consensus"],
        "company_tags": ["HashiCorp", "Google", "Netflix"],
        "hints": [
            "Use gossip protocol for cluster membership and failure detection.",
            "Implement Raft consensus for strong consistency of configuration data.",
            "Support health checking with configurable intervals and failure thresholds."
        ]
    },
    {
        "id": "sys-24-design-prometheus",
        "title": "Design a Monitoring System (e.g., Prometheus)",
        "description": "Design a time-series database and monitoring system. Support for metrics collection, alerting, and visualization.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["monitoring", "time-series", "storage"],
        "company_tags": ["Prometheus", "Google", "Amazon"],
        "hints": [
            "Use efficient time-series compression for storage optimization.",
            "Implement pull-based metric collection with service discovery.",
            "Support alerting with rule evaluation and notification routing."
        ]
    },
    {
        "id": "sys-25-design-grafana",
        "title": "Design a Visualization Dashboard (e.g., Grafana)",
        "description": "Design a visualization and analytics dashboard platform. Support for multiple data sources, customizable panels, and real-time updates.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["visualization", "real-time", "api"],
        "company_tags": ["Grafana", "Google", "Amazon"],
        "hints": [
            "Implement a plugin architecture for different data source integrations.",
            "Use WebSocket for real-time updates and live data streaming.",
            "Support flexible panel layouts with drag-and-drop configuration."
        ]
    },
    {
        "id": "sys-26-design-tracing",
        "title": "Design a Distributed Tracing System (e.g., Jaeger)",
        "description": "Design a distributed tracing system for microservices. Support for request tracing, performance analysis, and service dependency mapping.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["microservices", "tracing", "analytics"],
        "company_tags": ["Uber", "Google", "Amazon"],
        "hints": [
            "Use unique trace IDs propagated across service boundaries.",
            "Implement span collection with sampling strategies for production.",
            "Support service dependency graph generation and performance analysis."
        ]
    },
    {
        "id": "sys-27-design-logging",
        "title": "Design a Centralized Logging System (e.g., ELK Stack)",
        "description": "Design a centralized logging system for distributed applications. Support for log aggregation, search, and analysis.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["logging", "search", "analytics"],
        "company_tags": ["Elastic", "Google", "Amazon"],
        "hints": [
            "Use log shippers (Filebeat, Fluentd) to collect logs from services.",
            "Implement log parsing and enrichment with field extraction.",
            "Use Elasticsearch for storage and Kibana for visualization."
        ]
    },
    {
        "id": "sys-28-design-api-gateway",
        "title": "Design an API Gateway",
        "description": "Design an API gateway for microservices. Support for routing, rate limiting, authentication, and request/response transformation.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["microservices", "routing", "security"],
        "company_tags": ["Amazon", "Google", "Netflix"],
        "hints": [
            "Implement dynamic routing based on path, header, or service discovery.",
            "Use token bucket or leaky bucket algorithms for rate limiting.",
            "Support authentication/authorization with JWT validation and OAuth."
        ]
    },
    {
        "id": "sys-29-design-config-server",
        "title": "Design a Configuration Management System",
        "description": "Design a centralized configuration management system for distributed applications. Support for versioning, environment-specific configs, and dynamic updates.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["configuration", "versioning", "caching"],
        "company_tags": ["Netflix", "Google", "Amazon"],
        "hints": [
            "Implement version control for configuration changes with rollback capability.",
            "Support environment-specific configurations (dev, staging, prod).",
            "Use push or pull mechanisms for dynamic configuration updates."
        ]
    },
    {
        "id": "sys-30-design-cron",
        "title": "Design a Distributed Cron System (e.g., Kubernetes Cron)",
        "description": "Design a distributed job scheduling system. Support for cron-like scheduling, fault tolerance, and job execution tracking.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["scheduling", "distributed-systems", "coordination"],
        "company_tags": ["Google", "Amazon", "Netflix"],
        "hints": [
            "Use distributed locking to prevent duplicate job execution.",
            "Implement job queues with priority and retry mechanisms.",
            "Support job execution history and monitoring."
        ]
    },
    {
        "id": "sys-31-design-event-sourcing",
        "title": "Design an Event Sourcing System",
        "description": "Design a system based on event sourcing architecture. Support for event storage, event replay, and projection generation.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["event-sourcing", "cqrs", "storage"],
        "company_tags": ["Netflix", "Uber", "LinkedIn"],
        "hints": [
            "Use append-only event log for immutable event storage.",
            "Implement event replay for rebuilding state from events.",
            "Support CQRS with separate read and write models."
        ]
    },
    {
        "id": "sys-32-design-cqrs",
        "title": "Design a CQRS System",
        "description": "Design a system using Command Query Responsibility Segregation pattern. Separate models for read and write operations with eventual consistency.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["cqrs", "event-sourcing", "scalability"],
        "company_tags": ["Netflix", "Uber", "LinkedIn"],
        "hints": [
            "Separate command handlers for write operations and query handlers for reads.",
            "Use event bus to propagate changes from write to read models.",
            "Implement eventual consistency with conflict resolution strategies."
        ]
    },
    {
        "id": "sys-33-design-saga",
        "title": "Design a Distributed Transaction System (Saga Pattern)",
        "description": "Design a system for managing distributed transactions across multiple services using the Saga pattern for eventual consistency.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["distributed-transactions", "saga", "consistency"],
        "company_tags": ["Netflix", "Uber", "Amazon"],
        "hints": [
            "Implement choreography-based saga with event-driven coordination.",
            "Or use orchestration-based saga with central coordinator.",
            "Support compensating transactions for rollback scenarios."
        ]
    },
    {
        "id": "sys-34-design-circuit-breaker",
        "title": "Design a Circuit Breaker System",
        "description": "Design a circuit breaker pattern implementation for fault tolerance in distributed systems. Support for configurable thresholds and automatic recovery.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["fault-tolerance", "resilience", "patterns"],
        "company_tags": ["Netflix", "Google", "Amazon"],
        "hints": [
            "Implement states: closed, open, half-open with configurable thresholds.",
            "Use sliding window or exponential moving average for failure rate calculation.",
            "Support automatic recovery with health checks."
        ]
    },
    {
        "id": "sys-35-design-bulkhead",
        "title": "Design a Bulkhead Pattern Implementation",
        "description": "Design a bulkhead pattern for resource isolation in distributed systems. Prevent cascading failures by limiting resource usage per service.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["fault-tolerance", "resilience", "patterns"],
        "company_tags": ["Netflix", "Google", "Amazon"],
        "hints": [
            "Implement thread pool or semaphore-based resource limiting.",
            "Support per-service or per-endpoint resource quotas.",
            "Monitor resource usage and dynamically adjust limits."
        ]
    },
    {
        "id": "sys-36-design-sidecar",
        "title": "Design a Service Mesh (Sidecar Pattern)",
        "description": "Design a service mesh architecture using sidecar proxies. Support for traffic management, security, and observability.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["service-mesh", "microservices", "networking"],
        "company_tags": ["Google", "Istio", "Linkerd"],
        "hints": [
            "Deploy sidecar proxies alongside each service instance.",
            "Implement mTLS for service-to-service encryption.",
            "Support traffic routing, load balancing, and retry policies."
        ]
    },
    {
        "id": "sys-37-design-ambassador",
        "title": "Design an Ambassador Proxy",
        "description": "Design an ambassador proxy pattern for external client communication. Handle protocol translation, authentication, and rate limiting at the edge.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["proxy", "security", "networking"],
        "company_tags": ["Google", "Amazon", "Netflix"],
        "hints": [
            "Deploy ambassador proxies at service boundaries for external clients.",
            "Implement protocol translation (HTTP to gRPC, etc.).",
            "Handle authentication, rate limiting, and request routing."
        ]
    },
    {
        "id": "sys-38-design-strangler-fig",
        "title": "Design a Strangler Fig Pattern for Legacy Migration",
        "description": "Design a strangler fig pattern for gradually replacing a legacy system. Support for incremental migration and coexistence of old and new systems.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["migration", "architecture", "patterns"],
        "company_tags": ["Netflix", "Amazon", "Microsoft"],
        "hints": [
            "Implement a facade router to direct traffic between old and new systems.",
            "Support incremental feature migration with feature flags.",
            "Maintain data consistency during migration period."
        ]
    },
    {
        "id": "sys-39-design-event-driven",
        "title": "Design an Event-Driven Architecture",
        "description": "Design an event-driven architecture for loose coupling between services. Support for event publishing, subscription, and processing.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["event-driven", "messaging", "architecture"],
        "company_tags": ["Netflix", "Uber", "LinkedIn"],
        "hints": [
            "Use message brokers (Kafka, RabbitMQ) for event streaming.",
            "Implement event schemas and versioning for compatibility.",
            "Support dead letter queues for failed event processing."
        ]
    },
    {
        "id": "sys-40-design-cqrs-es",
        "title": "Design a CQRS with Event Sourcing System",
        "description": "Design a system combining CQRS and Event Sourcing patterns. Separate read/write models with event-based state management.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["cqrs", "event-sourcing", "architecture"],
        "company_tags": ["Netflix", "Uber", "LinkedIn"],
        "hints": [
            "Use event store for write model with append-only events.",
            "Build read models from event projections.",
            "Support event replay for rebuilding read models."
        ]
    },
    {
        "id": "sys-41-design-graphql",
        "title": "Design a GraphQL Gateway",
        "description": "Design a GraphQL gateway that aggregates data from multiple microservices. Support for schema stitching, caching, and query optimization.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["graphql", "api", "aggregation"],
        "company_tags": ["Facebook", "Apollo", "Netflix"],
        "hints": [
            "Implement schema stitching to combine multiple service schemas.",
            "Use DataLoader for batching and caching to prevent N+1 queries.",
            "Support query optimization and execution planning."
        ]
    },
    {
        "id": "sys-42-design-webhook",
        "title": "Design a Webhook Delivery System",
        "description": "Design a webhook delivery system for event notifications. Support for retry logic, dead letter queues, and webhook management.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["webhooks", "notifications", "reliability"],
        "company_tags": ["Stripe", "GitHub", "Slack"],
        "hints": [
            "Implement exponential backoff for retry logic.",
            "Use dead letter queues for failed webhook deliveries.",
            "Support webhook verification and signature validation."
        ]
    },
    {
        "id": "sys-43-design-pubsub",
        "title": "Design a Pub/Sub System (e.g., Google Pub/Sub)",
        "description": "Design a publish-subscribe messaging system. Support for topic-based subscriptions, message ordering, and at-least-once delivery.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["messaging", "pubsub", "scalability"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Use topic-based routing for message distribution.",
            "Implement message ordering with sequence numbers.",
            "Support at-least-once delivery with acknowledgments."
        ]
    },
    {
        "id": "sys-44-design-workflow",
        "title": "Design a Workflow Engine (e.g., Airflow)",
        "description": "Design a workflow orchestration system for data pipelines. Support for DAG definitions, task scheduling, and dependency management.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["workflow", "orchestration", "dag"],
        "company_tags": ["Airbnb", "Google", "Netflix"],
        "hints": [
            "Implement DAG (Directed Acyclic Graph) for workflow definitions.",
            "Support task scheduling with cron expressions.",
            "Handle task dependencies and failure retry logic."
        ]
    },
    {
        "id": "sys-45-design-feature-flag",
        "title": "Design a Feature Flag System",
        "description": "Design a feature flag management system. Support for dynamic configuration, user targeting, and A/B testing.",
        "interview_type": "system_design",
        "difficulty": "medium",
        "tags": ["feature-flags", "configuration", "a-b-testing"],
        "company_tags": ["LaunchDarkly", "Google", "Netflix"],
        "hints": [
            "Implement real-time flag evaluation with low latency.",
            "Support user targeting with segmentation rules.",
            "Provide analytics for flag usage and A/B test results."
        ]
    },
    {
        "id": "sys-46-design-a-b-testing",
        "title": "Design an A/B Testing Platform",
        "description": "Design an A/B testing platform for product experimentation. Support for experiment configuration, user assignment, and statistical analysis.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["a-b-testing", "analytics", "statistics"],
        "company_tags": ["Google", "Netflix", "Amazon"],
        "hints": [
            "Implement consistent user assignment with hashing.",
            "Support statistical significance calculation.",
            "Provide real-time experiment monitoring and results."
        ]
    },
    {
        "id": "sys-47-design-personalization",
        "title": "Design a Personalization Engine",
        "description": "Design a recommendation and personalization system. Support for user profiling, content ranking, and real-time personalization.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["recommendation", "machine-learning", "real-time"],
        "company_tags": ["Netflix", "Amazon", "Spotify"],
        "hints": [
            "Implement user profiling with behavioral and contextual data.",
            "Use machine learning models for content ranking.",
            "Support real-time personalization with low latency."
        ]
    },
    {
        "id": "sys-48-design-search-ranking",
        "title": "Design a Search Ranking System",
        "description": "Design a search ranking system with relevance scoring. Support for multiple ranking signals, learning to rank, and A/B testing.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["search", "ranking", "machine-learning"],
        "company_tags": ["Google", "Amazon", "Microsoft"],
        "hints": [
            "Implement multiple ranking signals (text relevance, freshness, popularity).",
            "Use machine learning for learning to rank models.",
            "Support A/B testing for ranking algorithm improvements."
        ]
    },
    {
        "id": "sys-49-design-spam-detection",
        "title": "Design a Spam Detection System",
        "description": "Design a spam detection and filtering system. Support for real-time classification, user feedback, and model retraining.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["machine-learning", "classification", "real-time"],
        "company_tags": ["Google", "Microsoft", "Meta"],
        "hints": [
            "Use machine learning models for spam classification.",
            "Implement real-time classification with low latency.",
            "Support user feedback loop for model improvement."
        ]
    },
    {
        "id": "sys-50-design-fraud-detection",
        "title": "Design a Fraud Detection System",
        "description": "Design a real-time fraud detection system for financial transactions. Support for pattern recognition, anomaly detection, and manual review workflow.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["fraud-detection", "machine-learning", "real-time"],
        "company_tags": ["Stripe", "PayPal", "Square"],
        "hints": [
            "Use machine learning for fraud pattern recognition.",
            "Implement real-time scoring with rule-based fallbacks.",
            "Support manual review workflow for flagged transactions."
        ]
    },
    {
        "id": "dsa-51-word-search",
        "title": "Word Search",
        "description": "Given an m x n grid of characters board and a string word, return true if word exists in the grid. The word can be constructed from letters of sequentially adjacent cells, where adjacent cells are horizontally or vertically neighboring. The same letter cell may not be used more than once.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["backtracking", "matrix", "dfs"],
        "company_tags": ["Amazon", "Google", "Facebook"],
        "hints": [
            "Use depth-first search (DFS) and backtracking starting from every cell in the board.",
            "Mark the current cell as visited (e.g. modify it temporarily to a placeholder character) during DFS.",
            "Be sure to restore the original character when backtracking."
        ]
    },
    {
        "id": "dsa-52-kth-largest",
        "title": "Kth Largest Element in an Array",
        "description": "Given an integer array nums and an integer k, return the kth largest element in the array. Note that it is the kth largest element in the sorted order, not the kth distinct element.",
        "interview_type": "dsa",
        "difficulty": "medium",
        "tags": ["heap", "divide-and-conquer", "quickselect"],
        "company_tags": ["Meta", "Amazon", "Apple", "Google"],
        "hints": [
            "We can sort the array, but that takes O(N log N) time.",
            "A min-heap of size k takes O(N log K) time and O(K) space.",
            "To achieve O(N) average time complexity, use the Quickselect algorithm."
        ]
    },
    {
        "id": "beh-51-disagree-architect",
        "title": "Handling a Disagreement with a Technical Architect",
        "description": "Tell me about a time you disagreed with a technical decision made by a principal engineer or architect. How did you present your counter-arguments, and what was the outcome?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["conflict-resolution", "communication", "leadership"],
        "company_tags": ["Microsoft", "Google", "Amazon"],
        "hints": [
            "Focus on a collaborative, data-driven approach rather than personal conflict.",
            "Explain how you gathered metrics, created a prototype, or documented trade-offs to support your view.",
            "Demonstrate commitment to the final decision even if it wasn't the one you originally advocated for."
        ]
    },
    {
        "id": "beh-52-critical-feedback",
        "title": "Delivering Critical Feedback to a Team Member",
        "description": "Describe a scenario where you had to deliver critical, difficult feedback to a peer or direct report. How did you prepare for the conversation, how did they receive it, and what followed?",
        "interview_type": "behavioral",
        "difficulty": "medium",
        "tags": ["feedback", "empathy", "mentorship"],
        "company_tags": ["Netflix", "Meta", "Salesforce"],
        "hints": [
            "Use the SBI (Situation-Behavior-Impact) model to structure constructive feedback.",
            "Focus on facts and observed behaviors rather than subjective labels.",
            "Show how you collaborated with the person to design an action plan for improvement."
        ]
    },
    {
        "id": "sys-51-design-uber",
        "title": "Design a Ride-Sharing Platform (Uber/Lyft)",
        "description": "Design a high-scale ride-sharing service. The system should support driver location updates, match-making between riders and drivers, routing, and real-time mapping.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["geospatial", "websockets", "routing"],
        "company_tags": ["Uber", "Lyft", "Grab"],
        "hints": [
            "Use geospatial indexing (like H3, S2, or Geohash) to store and query active driver locations efficiently.",
            "Design a driver location service that accepts high-frequency location pings via WebSockets or UDP.",
            "Use an asynchronous match-making engine that pairs riders with nearby drivers based on ETA and routes."
        ]
    },
    {
        "id": "sys-52-design-google-docs",
        "title": "Design a Collaborative Document Editor (Google Docs)",
        "description": "Design a real-time collaborative document editing system. Multiple users should be able to edit the same document concurrently with low latency and automatic conflict resolution.",
        "interview_type": "system_design",
        "difficulty": "hard",
        "tags": ["concurrency", "websockets", "conflict-resolution"],
        "company_tags": ["Google", "Atlassian", "Figma"],
        "hints": [
            "Study Operational Transformation (OT) and Conflict-free Replicated Data Types (CRDTs) for concurrent editing conflict resolution.",
            "Use WebSockets for real-time document change broadcast and state sync.",
            "Implement a document memory store (like Redis) and backup write-through database system to handle active sessions."
        ]
    }
]
