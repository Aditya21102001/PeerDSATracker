# Fresher & Contributor Onboarding Guide

Welcome to **PeerDSATracker**! 🎉

This guide is written specifically for newcomers, freshers, and junior developers joining this codebase. By the end of this guide, you will understand:
1. What this project does and who uses it.
2. The high-level architecture and how requests flow across the system.
3. How to set up and run the full stack locally on your computer.
4. Where each file and feature lives.
5. How each core feature works in the code (with real examples).
6. Crucial design patterns, rules, and common mistakes to avoid.

---

## 1. What is PeerDSATracker?

Preparing for software engineering technical interviews is famously tough. Candidates typically struggle with three major issues:
1. **Lack of Structure**: There are thousands of LeetCode problems; knowing which ones actually matter is overwhelming.
2. **Forgetting Solutions**: You solve a problem today, but three weeks later you have completely forgotten the optimal pattern.
3. **Isolation & Lack of Motivation**: Practicing alone without streaks, milestones, or peers often leads to burnout.

**PeerDSATracker** solves this by providing an all-in-one preparation engine:
- **474 Curated Problems**: The complete, celebrated Striver A2Z sheet arranged across 18 progressive topics (from Arrays to Dynamic Programming and Tries).
- **Spaced Repetition Review Deck**: Automatically schedules tricky problems on a scientifically proven interval ladder (1, 3, 7, 16, 35, 90 days) so you retain patterns forever.
- **In-Browser Code Editor & Sandboxes**: Write code in Java, Python, C++, JavaScript, or Go, and run it with instant automated test case evaluation.
- **AI Mock Technical Interviews**: Real-time voice-interactive mock interviews across Java/Spring, DSA, System Design, Angular, and Behavioral tracks with rubric evaluation.
- **Anti-Cheat Proctored Assessments**: Timed coding exams with tab-switch tracking, copy-paste monitoring, and integrity scoring.
- **Video Hub & Playlists**: YouTube search engine with embedded video player and synchronized timestamped study notes.
- **Naukri-Grade Career Matchmaker**: ATS profile analysis that calculates job compatibility based on your resume and your actual PeerDSATracker problem solves.

---

## 2. System Architecture: The 3-Tier Mental Model

PeerDSATracker is divided into **three services**. Keeping their responsibilities strictly separated is what keeps the codebase clean, scalable, and easy to maintain.

```
                           ┌────────────────────────────┐
                           │    User Web Browser        │
                           └─────────────┬──────────────┘
                                         │ HTTPS (Same Origin)
                                         ▼
                           ┌────────────────────────────┐
                           │   Frontend (Angular 22)    │
                           │   Hosted on Vercel Edge    │
                           └─────────────┬──────────────┘
                                         │ /api/* rewrite proxy
                                         ▼
                           ┌────────────────────────────┐
                           │  Backend (Spring Boot 4)   │  ← Sole writer to database!
                           │  Hosted on Render (Docker) │
                           └─────────────┬──────────────┘
                                         │
                 ┌───────────────────────┴─────────────────────────┐
                 ▼                                                 ▼
     ┌────────────────────────┐                       ┌────────────────────────┐
     │  PostgreSQL Database   │                       │  Analytics / Sandboxes │
     │  Hosted on Neon Cloud  │                       │  Python 3.13 + FastAPI │
     └────────────────────────┘                       └────────────┬───────────┘
                                                                   │
                                                      ┌────────────┴───────────┐
                                                      ▼                        ▼
                                                 LeetCode API           Codeforces API
                                                 (unofficial)             (official)
```

### Why Three Services?
1. **Frontend (Angular 22)**:
   - Client-side Single Page Application (SPA).
   - Fast, reactive UI using Angular Signals and Standalone components.
   - Deployed on Vercel CDN for instantaneous global loading.
   - Forwards all `/api/*` network requests to the Spring Boot backend.

2. **Backend (Spring Boot 4 / Java 17)**:
   - **The ONLY service permitted to read and write from PostgreSQL.**
   - Handles authentication, JWT tokens, problem status updates, XP, streaks, user profiles, peer messages, and leaderboards.
   - By having only ONE database writer, we completely eliminate database race conditions and transaction conflicts.

3. **Analytics Microservice (Python 3.13 + FastAPI)**:
   - **Stateless & Database-less.** It does not even have a database password!
   - Specializes in tasks where Python excels: fetching LeetCode/Codeforces statistics, data science weakness calculations, and proxying code execution to Piston sandboxes.
   - If this service goes down, the core website keeps working smoothly (the backend returns graceful fallbacks).

---

## 3. Local Development Setup (Step-by-Step)

### Prerequisites Check
Open your terminal (PowerShell, Command Prompt, or Bash) and verify that you have these tools installed:

```bash
# Check Java (Must be 17 or higher)
java -version

# Check Maven (Must be 3.8+)
mvn -v

# Check Node.js (Must be 20.19+ or 22+)
node -v

# Check Python (Must be 3.10+)
python --version
```

---

### Step 1: Clone Repository & Create `.env`

In your terminal:
```bash
git clone https://github.com/Aditya21102001/PeerDSATracker.git
cd PeerDSATracker

# Copy example environment configuration
cp .env.example .env
```

Open the newly created `.env` file in your editor (e.g. VS Code or IntelliJ IDEA). You will see database environment variables:
- `NEON_UNPOOLED_URL`: Used by Flyway database migrations (direct PostgreSQL connection).
- `NEON_POOLED_URL`: Used by the running Spring Boot application (PgBouncer pooled connection).
- `JWT_SECRET`: A secure random secret key for signing tokens.

*(If you are practicing locally, you can connect to your own local PostgreSQL instance or a free Neon database project).*

---

### Step 2: Run the Spring Boot Backend

Open Terminal 1:
```bash
cd backend
mvn spring-boot:run
```
- **What happens on startup**: Spring Boot boots on `http://localhost:8081`. Flyway scans the `src/main/resources/db/migration/` directory and automatically applies all database migrations in order, seeding all 474 problems and tables!
- **Health check URL**: Open `http://localhost:8081/actuator/health` in your browser. It should respond `{"status":"UP"}`.

---

### Step 3: Run the Angular Frontend

Open Terminal 2:
```bash
cd frontend
npm install
npm start
```
- **What happens**: The Angular development server starts on `http://localhost:4300`.
- Notice `proxy.conf.json` in the frontend: It automatically routes any network call starting with `/api` to `http://localhost:8081`. This means you **never encounter CORS errors** while developing locally!
- Open your browser to `http://localhost:4300`.

---

### Step 4 (Optional): Run the Python Analytics Microservice

Open Terminal 3:
```bash
cd analytics
python -m venv .venv

# On Windows:
.\.venv\Scripts\pip install -r requirements.txt
.\.venv\Scripts\uvicorn app.main:app --reload --port 8000

# On Mac/Linux:
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
- The service will run on `http://localhost:8000`.

---

## 4. Codebase Directory Map

### Frontend (`frontend/src/app/`)
- **`core/`**: Singletons and infrastructure used everywhere:
  - `services/auth.store.ts`: Central authentication store managing JWT access tokens, active user profile, and login/logout state.
  - `services/backend-status.ts`: Probes whether the backend is awake or waking from Render cold sleep.
  - `guards/auth.guard.ts`: `authGuard` (protects private pages like Dashboard and Sheet) and `guestGuard` (protects Sign-in/Sign-up).
  - `interceptors/auth.interceptor.ts`: Attaches `Authorization: Bearer <token>` to outgoing HTTP requests and automatically refreshes expired tokens.
- **`features/`**: Routed feature screens (each loaded lazily via Angular's `loadComponent`):
  - `welcome/`: Public landing page with the 474-problem syllabus explorer and study guides.
  - `sheet/`: The interactive 474 Striver A2Z problem tracker table.
  - `code/`: In-browser CodeMirror editor with multi-language execution and test case runner.
  - `study-guides/`: Interactive reference guides for DSA, Java/JVM, Spring Boot, and Angular.
  - `interview/`: Voice-interactive AI mock interview simulator.
  - `proctor/`: Anti-cheat proctored coding assessment simulator.
  - `hire/`: Naukri-grade career portal with 1-click application tracking and resume parser.
  - `videos/`: YouTube Video Hub and custom playlist manager with live timestamped note-taking.
  - `dashboard/`: User progress stats, XP level progress bar, and GitHub-style daily activity heatmap.
  - `peers/` & `messages/`: Peer study circles, follow system, and direct messaging.
- **`shared/`**: Reusable UI components (Modals, Spinners, Navbar, Cold-Start notices, CodeMirror wrappers).

### Backend (`backend/src/main/java/com/peerdsa/`)
- **`auth/`**: Authentication controllers, JWT generator, password hashing, and Google OAuth auto-provisioning.
- **`sheet/`**: Problem entity, repository, and catalog endpoints for the 474 Striver problems.
- **`progress/`**: Problem solve status transitions (`ProgressService.java`), solve history, and XP awarding.
- **`code/`**: Code execution manager (`CodeService.java`), Wandbox runner, and submission verdicts.
- **`hire/`**: Career portal services (`HireService.java`), candidate profiles, and job application pipeline.
- **`interview/`**: AI mock interview engine and proctored assessment evaluator (`InterviewService.java`).
- **`video/`**: Custom video playlist management and timestamped note persistence.
- **`gamification/`**: Streak tracking, level milestone calculations, and 13 collectible achievement badges.
- **`resources/db/migration/`**: Versioned SQL scripts (`V1` to `V19`). Every table structure change is tracked here.

---

## 5. How the Core Features Actually Work

### Feature A: Marking a Problem Solved (The Golden Path)
When a user clicks the solve checkbox next to a problem:
1. `sheet-page.ts` calls `progressStore.toggleSolved(problemId)`. The UI updates **optimistically** (instant response without waiting for network lag).
2. An HTTP `PUT /api/status/problems/{id}` request is sent with the JWT token.
3. In `ProgressService.java`, the method `applySolveTransition()` executes inside a database transaction (`@Transactional`):
   - It updates the problem's status to `SOLVED`.
   - It calculates the XP earned (10 XP for Easy, 20 XP for Medium, 40 XP for Hard).
   - It updates the user's `total_solved` count and adds that day's entry to the `daily_activity` table.
   - It checks whether this solve extends the user's daily streak or unlocks a new achievement badge.
   - All of this happens atomically: if anything fails, the entire database transaction rolls back, guaranteeing data integrity!

### Feature B: Code Execution & Multi-Engine Sandboxes
When a user clicks "Run Code" in the Code Editor:
1. `CodeService.java` first tries the Piston execution sandbox through the FastAPI service.
2. If Piston is unavailable, it immediately falls back to the **Wandbox Online Engine** (`https://wandbox.org`), which compiles and runs real Java (OpenJDK 21), C++, Python 3.12, Node.js, and Go!
3. If the external sandboxes fail or are unreachable, it falls back to an AI execution simulator or local process execution.
4. Output (stdout, stderr, compile error, execution time) is returned to the user's editor in real-time.

### Feature C: Career Matchmaker & 1-Click Apply
When a user uploads a resume or pastes resume text:
1. `HireService.java` extracts skills, experience, and role information using LLM analysis (or smart domain regex heuristics).
2. The system compares the candidate against curated tech jobs using a multi-factor formula:
   $$\text{Score} = (\text{Skills Overlap} \times 60\%) + (\text{Experience Match} \times 25\%) + (\text{PeerDSA Solves Bonus} \times 15\%)$$
3. When the user clicks **1-Click Apply**:
   - The application is recorded in the PostgreSQL `job_applications` table.
   - It is tracked in the user's personal ATS pipeline (`APPLIED` $\rightarrow$ `UNDER REVIEW` $\rightarrow$ `SHORTLISTED` $\rightarrow$ `INTERVIEW` $\rightarrow$ `OFFERED`).
   - The job details modal provides direct links to the official corporate career page (e.g. Amazon.jobs) so candidates can complete corporate portal submissions when required.

### Feature D: Anti-Cheat Proctored Assessments
During a timed assessment on `/proctor`:
1. The browser monitors tab switches via `document.addEventListener('visibilitychange')` and `window.addEventListener('blur')`.
2. It detects copy-paste attempts via `document.addEventListener('paste')`.
3. If violations occur, the trust integrity score decreases (starting from 100%).
4. When submitted, the backend evaluates the MCQ answers against an answer key and validates the coding problem using static algorithmic pattern matching, producing an official scorecard and proctoring verdict (`CLEARED`, `FLAGGED_FOR_REVIEW`, or `DISQUALIFIED`).

---

## 6. Ten Golden Rules for Developing in this Codebase

If you remember nothing else, keep these 10 rules in mind:

1. **Angular 22 is Zoneless by Default**: Do not import or rely on `zone.js`. Use Angular Signals (`signal()`, `computed()`) for UI state.
2. **Never Write to the Database from Python**: The Spring Boot backend is the sole authority on the PostgreSQL database.
3. **Never Commit Secrets**: Never put API keys, passwords, or tokens in git. Use `.env` locally and environment variables in deployment.
4. **Use Database Migrations for Schema Changes**: Never modify an existing migration script that has already run in production. Always create a new file like `V20__add_my_table.sql`.
5. **Always Test Accessibility (WCAG 2.1 AA)**: Every routed screen has an automated `axe-core` accessibility audit in `a11y.spec.ts`. All interactive controls must have accessible names, proper labels, and keyboard focus states.
6. **Protect Against Cold Starts**: The backend runs on a free-tier cloud container that spins down after 15 minutes of inactivity. Keep public exploration pages accessible without blocking on backend responses.
7. **Single-Flight JWT Refreshes**: In `auth.store.ts`, concurrent 401 errors share a single refresh token exchange to prevent token theft revocation loops.
8. **Keep DTOs Immutable**: Use Java `record` for DTOs in Spring Boot and TypeScript `interface` or `type` in Angular.
9. **Never Block Angular App Initializers**: Never use `firstValueFrom` on long-running HTTP calls inside `provideAppInitializer`. Bootstrap the UI instantly and perform background syncs.
10. **Write Meaningful Comments**: Explain the *why*, the architecture decisions, and non-obvious edge cases, not just restating what the code syntax does.

---

## 7. How to Run Tests

Before submitting a pull request or pushing code, always verify that all tests pass:

```bash
# Run Frontend Unit & Accessibility Tests
cd frontend
npm run test:ci

# Run Production Frontend Build Check
npm run build

# Run Backend Unit Tests
cd ../backend
mvn test
```

Happy coding! If you ever get stuck, refer to the other documents in the `docs/` folder or inspect the unit tests in `src/app/**/*.spec.ts` for real usage examples.
