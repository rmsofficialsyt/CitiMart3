# CITIMART Daily Operations — Master Documentation Index

> **Authoritative Technical Documentation, Architecture Specifications, and Operational Governance**  
> This directory houses the complete specification suite governing the CITIMART Daily Operations platform, from platform constitutional bylaws to store security gates and testing protocols.

---

## 📑 Specification Catalog

```
Daily Operations/docs/
├── 🏛️ Core Governance & Product Bylaws
│   ├── CONSTITUTION.md               # Immutable platform engineering bylaws & architectural boundaries
│   ├── PRODUCT.md                    # Product vision, store personas, and functional requirements
│   ├── PRD.md                        # Product Requirements Document for retail operations
│   └── PHASES.md                     # Roadmap phases, milestones, and release gates
│
├── 🏗️ Architecture, Design & Tech Stack
│   ├── ARCHITECTURE.md               # End-to-end system topology, decoupling & data flow
│   ├── DESIGN.md                     # UI/UX design specifications, colors & glanceable hierarchy
│   ├── TECH-STACKS.md                # Technology choices, trade-offs, and dependency rationales
│   └── PLAN.md                       # Implementation and execution rollout plan
│
├── 🔒 Security & Multi-Tenant Access Control
│   ├── SECURITY.md                   # Platform security baseline & OWASP Top 10 countermeasures
│   ├── AUTH.md                       # Authentication architecture, JWT HS256 & cookie refresh
│   └── AUTHENTICATION-SECURITY.md    # Deep dive into session tracking, Redis store & brute force
│
├── 🗄️ Database & Schema Specifications
│   └── DATABASE.md                   # MongoDB Atlas collections, schemas & compound ESR indexes
│
├── 📡 API Contracts & Schemas
│   ├── SPEC.md                       # SPEC-01: Live Daily Operations Portal specifications
│   └── APIS.md                       # Exhaustive REST API contract catalog & request/response schemas
│
├── 🧪 Quality Assurance & Error Tracking
│   ├── TESTING.md                    # Test engineering standards, fixtures & coverage gates
│   ├── CODE-REVIEW.md                # Multi-dimensional code quality & security checklist
│   └── ERROR-HANDLING-TRACKER.md     # Error code registry, incident tracker & failure responses
│
├── 🔄 Workflow, Lifecycles & Agent Guidelines
│   ├── GITHUB-WORKFLOW.md            # Mandatory 7-phase Git lifecycle, conventional commits & push rules
│   ├── RULES.md                      # Operational engineering disciplines & non-negotiables
│   ├── AGENTS.md                     # AI agent instructions, tool usage & quality gates
│   ├── SKILLS.md                     # Agent skill catalog & runtime invocation patterns
│   ├── PROMPTS.md                    # System prompt templates & trilingual copilot prompts
│   ├── HOOKS.md                      # Git pre-commit, pre-push, and runtime lifecycle hooks
│   ├── MEMORY.md                     # Cross-session memory persistence protocol
│   └── TASKS.md                      # Spec-Driven Development task progress tracking
│
└── 📖 Operational Manuals & Reference Artifacts
    ├── reference-artifacts/README.md # Visual layouts, credential standards & timeslot specs
    └── ../MANUAL_DATA_ENTRY_GUIDE.md # Layman's operating manual for retail floor store managers
```

---

## 🧭 Document Navigation Matrix

| Topic / Responsibility | Authoritative Document | Key Highlights |
|:---|:---|:---|
| **System Rules & Laws** | [`CONSTITUTION.md`](./CONSTITUTION.md) | Sub-10ms hot-path, multi-tenant boundaries, zero secret commits |
| **Store Security & BOLA** | [`SECURITY.md`](./SECURITY.md) & [`AUTH.md`](./AUTH.md) | Store isolation, `require_store_access`, JWT + Redis session registry |
| **API Reference** | [`APIS.md`](./APIS.md) & [`SPEC.md`](./SPEC.md) | REST routes, Pydantic schemas, error status codes |
| **MongoDB Atlas Indexes** | [`DATABASE.md`](./DATABASE.md) | ESR rule (`Equality -> Sort -> Range`), collection schemas |
| **Git & Release Gates** | [`GITHUB-WORKFLOW.md`](./GITHUB-WORKFLOW.md) | 5 Quality Gates, conventional commits, human push confirmation |
| **Floor Manager Guide** | [`../MANUAL_DATA_ENTRY_GUIDE.md`](../MANUAL_DATA_ENTRY_GUIDE.md) | Hourly billing, footfall, NOB entry, and operating hours |
| **Code Review Standards** | [`CODE-REVIEW.md`](./CODE-REVIEW.md) | OWASP verification, ESR audit, anti-slop frontend standards |

---

## 📝 Governance & Updates

Whenever modifying or introducing new endpoints, database collections, or UI workflows:
1. Update the corresponding specification file in `docs/` first.
2. Synchronize contracts between `Daily Operations` and `Analytics and Forecasting` where applicable.
3. Verify that all changes comply with [CONSTITUTION.md](./CONSTITUTION.md).
