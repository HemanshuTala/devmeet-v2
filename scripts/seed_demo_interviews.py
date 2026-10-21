"""
================================================================================
DEVMEET DEMO INTERVIEWS SEEDER
================================================================================
Seeds 3 realistic, high-scoring demo interview sessions into PostgreSQL:
  1. DSA Coding Track: Two Sum (LeetCode #1) with full Python code, test results,
     and 96% score report.
  2. Behavioral Track: Production Outage Incident Response using the STAR method
     (Situation, Task, Action, Result) with 93% score report.
  3. System Design Track: Distributed URL Shortener (100M writes/month, Base62,
     Cassandra + Redis cache tier) with 94% score report.

Associates the demo sessions with the user 'hemansutala@gmail.com' and all
recent candidate accounts so they appear in History and Dashboard immediately.
================================================================================
"""

import json
import uuid
import psycopg2
from psycopg2.extras import Json

DB_URL = "postgresql://devmeet:devmeet_password@localhost:5432/devmeet"


def get_target_users(cur):
    """Fetches user IDs that should receive the demo interviews."""
    users = []
    # Always include Hemanshu Tala
    cur.execute("SELECT id, email, display_name FROM user_profiles WHERE email = 'hemansutala@gmail.com';")
    h = cur.fetchall()
    users.extend(h)

    # Also include the 5 most recent accounts
    cur.execute("""
        SELECT id, email, display_name 
        FROM user_profiles 
        WHERE email != 'hemansutala@gmail.com'
        ORDER BY created_at DESC 
        LIMIT 5;
    """)
    users.extend(cur.fetchall())
    return users


def seed_demo_sessions():
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()

    users = get_target_users(cur)
    if not users:
        print("[ERROR] No user profiles found in database to attach demo interviews to.")
        return

    print(f"Found {len(users)} target candidate accounts:")
    for u in users:
        print(f"  - {u[1]} ({u[0]})")

    # Define the 3 demo tracks
    demos = [
        {
            "track": "dsa",
            "difficulty": "easy",
            "target_company": "Google",
            "focus_area": "Two Sum",
            "title": "Two Sum Algorithm",
            "overall_score": 96,
            "problem_solving": 98,
            "code_quality": 95,
            "time_complexity": 100,
            "communication": 94,
            "behavioral": 90,
            "hiring_rec": "strong_yes",
            "turns": [
                {
                    "role": "interviewer",
                    "content": (
                        "Hi Hemanshu! Welcome to your Google technical interview. Let's dive straight into our coding portion.\n\n"
                        "### Problem: Two Sum (LeetCode #1)\n"
                        "Given an array of integers `nums` and an integer `target`, return the **indices** of the two numbers such that they add up to `target`.\n\n"
                        "You may assume each input has exactly one solution, and you may not use the same element twice.\n\n"
                        "**Example:**\n"
                        "- Input: `nums = [2, 7, 11, 15]`, `target = 9`\n"
                        "- Output: `[0, 1]` (because `nums[0] + nums[1] == 9`)\n\n"
                        "Before jumping into code, walk me through your initial algorithmic approach and time complexity."
                    )
                },
                {
                    "role": "candidate",
                    "content": (
                        "I can solve Two Sum in O(n) time using a hash map. For each element num at index i, "
                        "we calculate its complement (target - num). If the complement is already in our dictionary, "
                        "we return [seen[complement], i]. Otherwise, we store seen[num] = i. "
                        "This avoids the O(n^2) brute force nested loops and achieves O(n) linear time and O(n) auxiliary space."
                    )
                },
                {
                    "role": "interviewer",
                    "content": (
                        "That is an optimal approach! A single pass hash map is the gold standard for this problem. "
                        "Go ahead and implement this in the editor, and run the test cases to verify."
                    )
                },
                {
                    "role": "candidate",
                    "content": (
                        "```python\n"
                        "def twoSum(nums: list[int], target: int) -> list[int]:\n"
                        "    seen = {}\n"
                        "    for i, num in enumerate(nums):\n"
                        "        diff = target - num\n"
                        "        if diff in seen:\n"
                        "            return [seen[diff], i]\n"
                        "        seen[num] = i\n"
                        "    return []\n"
                        "```\n"
                        "Submitted solution. Ran test suite: Case 1 PASSED [0, 1], Case 2 PASSED [1, 2], Case 3 PASSED [0, 1]. All 3 tests passed (100%)."
                    )
                },
                {
                    "role": "interviewer",
                    "content": (
                        "Outstanding! Your solution passed all test cases with 100% accuracy. "
                        "Your algorithmic reasoning, complexity analysis, and code quality are exceptional. "
                        "That concludes our technical challenge."
                    )
                }
            ],
            "strengths": [
                "Identified the optimal O(n) hash map approach immediately instead of settling for brute force O(n^2).",
                "Clean, idiomatic code with descriptive variable naming (`seen`, `diff`, `num`).",
                "Articulated time and space trade-offs clearly before writing code.",
                "100% test case pass rate with sub-second execution."
            ],
            "weaknesses": [
                "Could explicitly comment on behavior when no matching pair exists (returns empty list).",
                "Could discuss 32-bit integer overflow protections for statically-typed languages like Java or C++."
            ],
            "recommendations": [
                "Continue practicing Two-Pointer variations like Two Sum II (sorted array) and 3Sum.",
                "Practice writing explicit type hints and docstrings for production-grade libraries."
            ],
            "code_improvements": [
                "Add explicit function docstring summarizing Big-O complexity for maintainability.",
                "Consider using `dict.get()` or `in` operator explicitly for pythonic readability."
            ],
            "question_scores": [
                {
                    "turn": 1,
                    "question_summary": "Two Sum Intuition & Algorithm Design",
                    "score": 10,
                    "feedback": "Flawlessly explained hash map complement lookup and contrasted with O(n^2) nested loops."
                },
                {
                    "turn": 2,
                    "question_summary": "Code Implementation & Test Suite Execution",
                    "score": 9.5,
                    "feedback": "Clean implementation that passed all 3 test cases on first run."
                }
            ],
            "percentile": 96,
            "percentile_msg": "Scored in the top 4% of candidates practicing Easy/Medium algorithmic challenges."
        },
        {
            "track": "behavioral",
            "difficulty": "medium",
            "target_company": "Meta",
            "focus_area": "STAR Method Incident Response",
            "title": "Production Outage & Leadership",
            "overall_score": 93,
            "problem_solving": 92,
            "code_quality": 88,
            "time_complexity": 90,
            "communication": 96,
            "behavioral": 95,
            "hiring_rec": "strong_yes",
            "turns": [
                {
                    "role": "interviewer",
                    "content": (
                        "Welcome to your Meta behavioral interview! Today we evaluate engineering leadership and problem-solving using the STAR method.\n\n"
                        "Can you tell me about a time when you encountered a critical technical roadblock or production outage under tight deadline pressure? "
                        "Walk me through what happened, your role, the actions you took, and the eventual outcome."
                    )
                },
                {
                    "role": "candidate",
                    "content": (
                        "Situation: During a Black Friday flash sale, our payment processing gateway began failing with a 35% error spike due to partner timeouts.\n\n"
                        "Task: As senior engineer on call, I had to prevent customer checkout abandonment and restore transaction reliability within 15 minutes.\n\n"
                        "Action: I declared a P0 incident, enabled dynamic circuit-breaker fallbacks to our secondary Stripe processor via feature flags, and deployed an async worker queue to buffer stalled transactions with idempotency keys.\n\n"
                        "Result: Payment success returned to 99.8% in under 9 minutes with zero duplicate billings, saving an estimated $85,000 in checkout revenue."
                    )
                },
                {
                    "role": "interviewer",
                    "content": (
                        "That is a textbook STAR answer! The situation was urgent, your technical interventions were decisive, and your business metrics were clear. "
                        "How did you prevent similar third-party gateway timeouts in subsequent product launches?"
                    )
                },
                {
                    "role": "candidate",
                    "content": (
                        "We implemented three preventive safeguards: First, an automated multi-gateway load balancer with health-check circuit breaking so traffic reroutes automatically in under 5 seconds. "
                        "Second, simulated chaos engineering drills in staging. Third, updated partner SLAs with real-time latency alerting."
                    )
                },
                {
                    "role": "interviewer",
                    "content": (
                        "Excellent post-mortem culture and engineering leadership. Thank you for walking through that experience."
                    )
                }
            ],
            "strengths": [
                "Exceptional adherence to the STAR framework (Situation, Task, Action, Result) with precise technical details.",
                "Demonstrated composure under P0 incident pressure and decisive risk mitigation.",
                "Quantified business and engineering impact ($85,000 revenue saved, 9-minute MTTR, 99.8% recovery).",
                "Strong post-incident preventive mindset (chaos testing, automated health checks)."
            ],
            "weaknesses": [
                "Could briefly touch upon post-incident customer communication or support team coordination.",
                "Could mention how the team retrospectives were facilitated."
            ],
            "recommendations": [
                "Emphasize team coaching and mentorship when leading junior engineers through post-mortems.",
                "Continue using quantified metrics in executive stakeholder presentations."
            ],
            "code_improvements": [],
            "question_scores": [
                {
                    "turn": 1,
                    "question_summary": "P0 Production Outage Resolution (STAR)",
                    "score": 9.5,
                    "feedback": "Concise, structured, and impactful explanation of incident leadership."
                },
                {
                    "turn": 2,
                    "question_summary": "Long-Term Prevention & Architectural Safeguards",
                    "score": 9.2,
                    "feedback": "Showcased mature engineering practices with chaos engineering and automated circuit breakers."
                }
            ],
            "percentile": 93,
            "percentile_msg": "Scored in the top 7% of candidates evaluated on STAR behavioral competencies."
        },
        {
            "track": "system_design",
            "difficulty": "hard",
            "target_company": "Uber",
            "focus_area": "Scalable URL Shortener",
            "title": "Distributed URL Shortener",
            "overall_score": 94,
            "problem_solving": 95,
            "code_quality": 90,
            "time_complexity": 94,
            "communication": 94,
            "behavioral": 90,
            "hiring_rec": "strong_yes",
            "turns": [
                {
                    "role": "interviewer",
                    "content": (
                        "Welcome to your Uber System Design interview! Let's tackle a high-scale distributed systems problem:\n\n"
                        "### Challenge: Scalable URL Shortener (e.g. Bit.ly)\n"
                        "Design a globally distributed service that generates short URLs (e.g. `dev.mt/xyz123`) and redirects users with sub-10ms latency at 100M writes/month.\n\n"
                        "To start, outline: 1. Functional & non-functional requirements, 2. API contracts, 3. High-level architecture and unique key generation."
                    )
                },
                {
                    "role": "candidate",
                    "content": (
                        "1. Requirements: 100M writes/month (~40 writes/sec), 10B reads/month (~4,000 reads/sec, 100:1 read-heavy). 99.99% availability, sub-10ms redirect latency.\n\n"
                        "2. API Contracts: `POST /api/v1/shorten` accepts `{original_url}` returns `{short_url}`; `GET /{short_code}` returns HTTP 302 Redirect with Location header.\n\n"
                        "3. Storage & Hashing: 64-bit Snowflake ID encoded in Base62 (7 characters yielding 3.5 trillion unique URLs). Distributed NoSQL key-value store (Cassandra/DynamoDB) partitioned by hash prefix. Redis cluster caching top 20% hot links with LRU eviction."
                    )
                },
                {
                    "role": "interviewer",
                    "content": (
                        "Great foundation. Now suppose traffic surges to 50,000 requests per second during a viral breaking news event. "
                        "How do you ensure the service doesn't collapse, and how do you handle hot key cache thundering herd problems?"
                    )
                },
                {
                    "role": "candidate",
                    "content": (
                        "To handle 50,000 QPS: 1. Cloudflare CDN edge caching absorbs 80% of viral redirect traffic before hitting origin. "
                        "2. For remaining cache misses, we use Redis read replicas behind consistent hashing. "
                        "3. To prevent thundering herds, we employ distributed mutex locking (SingleFlight pattern) so only 1 worker fetches from Cassandra while others wait on cache."
                    )
                },
                {
                    "role": "interviewer",
                    "content": (
                        "The SingleFlight pattern and CDN edge caching are exact industry-standard solutions. Excellent design!"
                    )
                }
            ],
            "strengths": [
                "Clear back-of-the-envelope estimation identifying 100:1 read-to-write skew.",
                "Correctly chose Base62 encoding over MD5/SHA256 to avoid collisions.",
                "Applied SingleFlight mutex pattern to prevent cache stampedes on viral URLs.",
                "Leveraged CDN edge caching for global sub-10ms redirect latency."
            ],
            "weaknesses": [
                "Could elaborate on database replication lag between write masters and read replicas.",
                "Could discuss telemetry metrics for 404 links and link expiration cleanup workers."
            ],
            "recommendations": [
                "Review TTL expiration strategies using Redis passive expiration vs background cleanup workers.",
                "Practice sketching geo-distributed multi-region active-active database failover."
            ],
            "code_improvements": [],
            "question_scores": [
                {
                    "turn": 1,
                    "question_summary": "Requirements, Capacity Math, & Base62 Key Generation",
                    "score": 9.6,
                    "feedback": "Accurate traffic estimates and optimal Base62 encoding strategy."
                },
                {
                    "turn": 2,
                    "question_summary": "50K QPS Scaling & Thundering Herd Protection",
                    "score": 9.2,
                    "feedback": "Demonstrated deep distributed systems expertise with SingleFlight and CDN edge caching."
                }
            ],
            "percentile": 94,
            "percentile_msg": "Scored in the top 6% of candidates on Distributed Systems Architecture."
        }
    ]

    for user in users:
        user_id = user[0]
        user_name = user[2]
        print(f"\nSeeding demo interviews for {user[1]} ({user_name})...")

        for demo in demos:
            # Check if this demo session already exists
            cur.execute("""
                SELECT id FROM sessions 
                WHERE user_id = %s AND focus_area = %s AND status = 'completed';
            """, (user_id, demo["focus_area"]))
            existing = cur.fetchone()
            if existing:
                print(f"  [EXISTS] {demo['title']} (session {existing[0]})")
                session_id = existing[0]
            else:
                session_id = str(uuid.uuid4())
                cur.execute("""
                    INSERT INTO sessions (
                        id, user_id, interview_type, difficulty, target_company, 
                        focus_area, duration_minutes, status, elapsed_seconds, 
                        started_at, completed_at, created_at, updated_at
                    ) VALUES (
                        %s, %s, %s, %s, %s, 
                        %s, 30, 'completed', 840, 
                        NOW() - INTERVAL '1 hour', NOW(), NOW(), NOW()
                    );
                """, (
                    session_id, user_id, demo["track"], demo["difficulty"], 
                    demo["target_company"], demo["focus_area"]
                ))
                print(f"  [CREATED] {demo['title']} -> Session ID: {session_id}")

                # Insert turns
                for idx, turn in enumerate(demo["turns"], start=1):
                    cur.execute("""
                        INSERT INTO conversation_turns (
                            id, session_id, role, content, turn_number, created_at
                        ) VALUES (
                            gen_random_uuid(), %s, %s, %s, %s, NOW()
                        );
                    """, (session_id, turn["role"], turn["content"], idx))

            # Upsert feedback report
            detailed_json = {
                "strengths": demo["strengths"],
                "weaknesses": demo["weaknesses"],
                "recommendations": demo["recommendations"],
                "code_improvements": demo["code_improvements"],
                "question_scores": demo["question_scores"],
                "hiring_recommendation": demo["hiring_rec"],
                "percentile": {
                    "percentile": demo["percentile"],
                    "message": demo["percentile_msg"]
                }
            }

            cur.execute("""
                INSERT INTO feedback_reports (
                    id, session_id, overall_score, communication_score,
                    problem_solving_score, code_quality_score, time_complexity_score,
                    behavioral_score, detailed_feedback, pdf_url, created_at, updated_at
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, NOW(), NOW()
                )
                ON CONFLICT (session_id) DO UPDATE SET
                    overall_score = EXCLUDED.overall_score,
                    communication_score = EXCLUDED.communication_score,
                    problem_solving_score = EXCLUDED.problem_solving_score,
                    code_quality_score = EXCLUDED.code_quality_score,
                    time_complexity_score = EXCLUDED.time_complexity_score,
                    behavioral_score = EXCLUDED.behavioral_score,
                    detailed_feedback = EXCLUDED.detailed_feedback,
                    updated_at = NOW();
            """, (
                session_id, demo["overall_score"], demo["communication"],
                demo["problem_solving"], demo["code_quality"], demo["time_complexity"],
                demo["behavioral"], Json(detailed_json),
                f"http://localhost:8000/api/v1/feedback/{session_id}/pdf"
            ))
            print(f"    Feedback Report saved: Score {demo['overall_score']}% ({demo['hiring_rec']})")

    conn.commit()
    cur.close()
    conn.close()
    print("\n[SUCCESS] All demo interviews and feedback reports successfully seeded into PostgreSQL!")


if __name__ == "__main__":
    seed_demo_sessions()
