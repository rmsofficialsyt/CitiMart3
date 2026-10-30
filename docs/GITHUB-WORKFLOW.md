# CITIMART — GitHub Workflow Progress Specification (GITHUB-WORKFLOW)

> **Mandate:** This document specifies the mandatory end-to-end Git and GitHub workflow for all features, updates, and bugfixes across CITIMART projects. Every contributor and AI agent must strictly follow this lifecycle from initial repository binding to branch cleanup.

---

## 1. Lifecycle Overview Diagram

```
+-------------------------------------------------------------------------------+
|                        PHASE 1: ONE-TIME LOCAL SETUP                          |
|  git init -> git config -> git remote add origin -> git branch -M main       |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|                       PHASE 2: PRE-DEVELOPMENT SYNC                           |
|  git checkout main -> git pull origin main -> git checkout -b "features/X"    |
|  (Where X is the descriptive name from the feature or /rename command)        |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|             PHASE 3: DEVELOPMENT QUALITY GATES (HOLD GIT COMMITS)             |
|  [Gate 1: Task]     Implement strictly against PRD / Spec requirements        |
|  [Gate 2: Build]    Verify frontend (Vite/TS) and backend import stability    |
|  [Gate 3: Validate] Check Production Security Spec (AUTH, IDOR, SEC, INP, WEB)|
|  [Gate 4: Test]     Full pytest suite execution (100% pass, zero regressions) |
|  [Gate 5: Review]   Self-audit against docs/CODE-REVIEW.md checklist          |
+-------------------------------------------------------------------------------+
                                       | All Gates Passed
                                       v
+-------------------------------------------------------------------------------+
|                     PHASE 4: STAGING & CONVENTIONAL COMMITS                   |
|  git status -> git add . -> git status -> git commit -m "feat/fix(...): ..."  |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|             PHASE 5: HUMAN-IN-THE-LOOP PUSH CONFIRMATION GATE                 |
|  [MANDATORY] Ask user confirmation before pushing to remote repository        |
|  git push origin "features/X"                                                 |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|                     PHASE 6: GITHUB PULL REQUEST & MERGE                      |
|  Create PR (features/X -> main) -> CI Check -> Admin/Lead Review & Merge      |
+-------------------------------------------------------------------------------+
                                       |
                                       v
+-------------------------------------------------------------------------------+
|                    PHASE 7: LOCAL SYNC & BRANCH CLEANUP                       |
|  git checkout main -> git pull origin main                                    |
|  [MANDATORY] Ask user confirmation before deleting local branch               |
|  git branch -d "features/X"                                                   |
+-------------------------------------------------------------------------------+
```

---

## 2. Phase 1: One-Time Setup & Remote Binding

When initializing a new workspace or connecting an existing folder to a GitHub repository:

```bash
# 1. Initialize local Git repository (if not cloned via git clone)
git init

# 2. Configure global (or local) identity
git config user.name "Your Name or Agent ID"
git config user.email "your.email@citimart.local"

# 3. Connect to GitHub remote origin
git remote add origin "https://github.com/rmsofficialsyt/CitiMart3.git"

# 4. Normalize the default branch name to 'main'
git branch -M main
```

---

## 3. Phase 2: Pre-Development Sync & Feature Branch Creation

Before writing any new code, modifying features, or applying bugfixes:

```bash
# 1. Switch to local main branch
git checkout main

# 2. Pull the latest upstream commits from GitHub
git pull origin main

# 3. Verify clean working tree
git status

# 4. Create and switch to an isolated feature branch
git checkout -b "features/X"
```

> **Naming Rule for `"X"`:**
> `X` represents the concise, descriptive feature, update, or bugfix slug matching the `/rename` slash command or feature title (lowercase, hyphen-separated).
> - *Feature Examples:* `features/production-security-spec`, `features/rate-limiter`, `features/ai-copilot-presets`
> - *Bugfix Examples:* `fix/timeslot-boundary`, `fix/excel-upload-parsing`, `fix/gauge-visual-scaling`
> - *Documentation Examples:* `docs/github-workflow-spec`, `docs/code-review-guide`

---

## 4. Phase 3: The 5 Development Quality Gates (Hold Git Operations)

> [!CAUTION]
> **DEVELOPMENT FREEZE:** Git commit and push operations must remain on hold while implementing features. No code should be committed until all 5 Quality Gates have passed with verifiable evidence.

```
+------------+     +-------------+     +----------------+     +-------------+     +--------------+
| 1. TASK    | --> |  2. BUILD   | --> |  3. VALIDATE   | --> |   4. TEST   | --> |  5. REVIEW   |
| Scope &    |     | Frontend &  |     | Security Spec  |     | Pytest 100% |     | Code Review  |
| Code Work  |     | Backend Run |     | Adherence      |     | Pass Rate   |     | Checklist    |
+------------+     +-------------+     +----------------+     +-------------+     +--------------+
```

### Gate 1: Task Execution
- Implement code strictly following [PRD.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/PRD.md) and [SPEC.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/SPEC.md).
- Keep changes modular, maintain separation of concerns (`api/`, `src/`, `db/`).

### Gate 2: Build & Import Verification
- Verify backend imports cleanly without runtime syntax or cyclic dependency errors:
  ```powershell
  & "../.venv/Scripts/python.exe" -c "import app; print('App syntax OK')"
  ```
- If frontend files were modified, verify compilation builds cleanly:
  ```powershell
  cd frontend; npm run build
  ```

### Gate 3: Security Spec Validation
- Verify compliance against [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md):
  - **AUTH:** All `/api/*` routes (except health/login) gated by `Depends(get_current_user)`.
  - **IDOR:** Store routes protected by `require_store_access(store, user)`.
  - **SEC:** Zero secrets in code (`.env` and credentials files git-ignored).
  - **INP:** Pydantic validation on payloads; 10MB upload ceiling (`MAX_EXCEL_UPLOAD_BYTES`).
  - **WEB:** Security headers present (`X-Frame-Options`, `X-Content-Type-Options`).

### Gate 4: Automated Test Execution
- Run the full test suite. Every test must pass with **zero regressions**:
  ```powershell
  & "../.venv/Scripts/python.exe" -m pytest
  ```

### Gate 5: Review
- Perform self-audit against the review criteria in [`docs/CODE-REVIEW.md`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CODE-REVIEW.md).

---

## 5. Phase 4: Staging & Conventional Commit Authoring

Once all 5 Quality Gates have passed, proceed with Git staging:

```bash
# 1. Inspect modified and untracked files
git status

# 2. Stage verified files (confirm .env and credentials are NOT staged)
git add .

# 3. Re-verify staged diff
git status
```

### Commit Message Standards (Conventional Commits)
Write semantic, descriptive commit messages specifying intent and subsystem scope:

```text
<type>(<scope>): <short imperative description>
```

#### Allowed Types:
- `feat`: New user-facing feature or architectural subsystem.
- `fix`: Bug fix, error resolution, or regression patch.
- `docs`: Documentation creation, guides, or specifications.
- `test`: Adding or refactoring automated unit/integration tests.
- `refactor`: Code restructuring without functional behavior changes.
- `chore`: Tooling, build config, dependency, or `.gitignore` updates.

#### Approved Examples:
```bash
# Feature commit
git commit -m "feat: production-grade SDD architecture with auth, security, and spec subsystems"

# Scoped bugfix commit
git commit -m "fix(daily-ops): audit & fix benchmark engine, secure AI API headers, and streamline dashboard layout"

# Scoped feature commit
git commit -m "feat(daily-ops): implement sliding window rate limiter and security headers middleware"

# Documentation commit
git commit -m "docs: add CODE-REVIEW.md, TESTING.md, and TASKS.md guides"
```

---

## 6. Phase 5: Push Protocol & Human-in-the-Loop Confirmation Gate

> [!IMPORTANT]
> **MANDATORY CONFIRMATION:** AI agents and automated scripts **MUST NEVER** execute `git push` autonomously without asking for explicit user approval first.

### Push Protocol Steps:
1. Review the commit hash and staged summary:
   ```bash
   git status
   git log -n 1 --oneline
   ```
2. **Ask the user for confirmation:**
   > *"All 5 Quality Gates have passed (tests: 162/162 passing). Commit `[hash]` is ready on branch `features/X`. Would you like me to push `features/X` to GitHub origin?"*
3. Upon receiving explicit user approval, execute:
   ```bash
   git push origin "features/X"
   ```

---

## 7. Phase 6: GitHub Pull Request (PR) & Merging

1. **Open Pull Request:** Navigate to the GitHub repository and open a Pull Request from `features/X` targeting `main`.
2. **Review & Validation:**
   - Review the automated CI pipeline checks.
   - Lead developer or admin performs peer review using [`docs/CODE-REVIEW.md`](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/CODE-REVIEW.md).
3. **Merge:**
   - Confirm merge to `main` (Squash & Merge or Standard Merge).

---

## 8. Phase 7: Local Synchronization & Branch Cleanup

Once the PR has been merged into `main` on GitHub:

```bash
# 1. Switch local working directory back to main
git checkout main

# 2. Pull the newly merged code into local main
git pull origin main
```

### Local Branch Deletion Protocol

> [!WARNING]
> **MANDATORY CONFIRMATION:** Always verify that the branch is merged and ask the user for confirmation before deleting the local feature branch.

1. **Ask user confirmation:**
   > *"The changes from `features/X` have been merged into `main` and pulled locally. May I delete the local `features/X` branch?"*
2. **Upon approval, delete local branch:**
   ```bash
   # Safe deletion (verifies merge with upstream main)
   git branch -d "features/X"

   # Force deletion (use only if squash-merged and git branch -d warns about unmerged commits)
   git branch -D "features/X"
   ```

*(Note: Never use `git checkout -d`, which is an invalid flag; branch deletion is strictly handled by `git branch -d`.)*
