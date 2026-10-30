# CITIMART Daily Operations — Agent Guidelines & Instructions (AGENTS)

Follow [Production-grade-Security-checks-spec-check.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Production-grade-Security-checks-spec-check.md) for every security review and every new feature.

## Critical Instructions for AI Agents
1. **Never Bypass `_guard` or Store Scoping:**
   - Any new endpoint handling store data must enforce `require_store_access(store, user)`.
   - Never allow a store manager to view or update another store's records.
2. **Never Add Secrets to Code:**
   - Always load database URIs, JWT secrets, and AI API keys via `config.env.env` or `os.getenv()`.
3. **Preserve Stateless JWT Verification:**
   - In request dependencies, trust claims in the verified JWT. Do not query MongoDB on every read endpoint unless writing or querying specific collections.
4. **Mandatory Test Verification:**
   - Always run `pytest` from `Daily Operations/backend/` before reporting completion. Ensure all 162 tests pass.
5. **Git & GitHub Workflow Lifecycle:**
   - Follow [docs/GITHUB-WORKFLOW.md](file:///d:/Project%20CITIMART%20Sales%20Analysis/Daily%20Operations/docs/GITHUB-WORKFLOW.md).
   - Branch from updated main: `git checkout -b "features/X"` (where `X` is the feature or `/rename` slug).
   - Hold commits during development until all 5 Quality Gates pass (*Task -> Build -> Validate -> Test -> Review*).
   - **MANDATORY:** Always ask for explicit user approval before executing `git push`.
   - **MANDATORY:** Always ask for explicit user approval before deleting local branches (`git branch -d`).
