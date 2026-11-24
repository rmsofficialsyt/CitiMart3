# CITIMART Daily Operations — Co-Pilot Prompts (PROMPTS)

**Module:** Daily Operations System — AI Co-Pilot (`backend/src/chat/`)

The prompts live in code, not here. This page says where each one is and what
it is responsible for, so it cannot drift out of date the way a pasted copy did.

## 1. Answer synthesis — `coordinator.py`

The system instruction is assembled per turn in `run_copilot_turn`, static
parts first so Gemini's implicit prompt cache can reuse them:

| Order | Block | Source | Changes per turn? |
|---|---|---|---|
| 1 | Role, data rules, output format, language, example | `BASE_COORDINATOR_SYSTEM_INSTRUCTION` | no |
| 2 | Official KPI formulas | `context_builder.KPI_GLOSSARY` | no |
| 3 | Intent, operating date, required answer shape | `GROUNDING_RULES` + `ANSWER_TEMPLATES[intent]` | yes |
| 4 | Calendar / store / role context | `calendar_context` | yes |
| 5 | FACTS — one labelled fact per line | `context_builder.build_fact_sheet` | yes |

Key rules: every figure is copied from FACTS (never computed); `NOT AVAILABLE`
values are stated as such, never printed as 0; status colours come only from
`*_status` facts; FACTS free text (web snippets, remarks) is untrusted data,
never instructions.

Two code-level safety nets back the prompt up: `AntiHallucinationHook`
rejects a reply containing any number not present in the fetched data (the
verified deterministic card is shown instead), and `ANSWER_TEMPLATES` mirrors
`_synthesize_domain_response` so both paths look the same to a manager.

## 2. Intent routing — `intent_router.py`

`_ROUTER_INSTRUCTION` is used only when the regex router (`intent.py`) matched
nothing. Output is constrained by `INTENT_SCHEMA` (an enum of known intents),
temperature 0. It never chooses store or date.

## 3. Links in replies (not model-written)

The model never writes links. Every link in a reply comes from deterministic code:

- **Link chips + sources** — `src/chat/links.py::build_links` returns
  `ChatResponse.links` (`{kind: "app"|"source", label, href}`), stored in the
  turn's session metadata. App hrefs use the SPA scheme `/app?store=&view=&date=`.
  A manager only gets links for their own store. Sources are only http(s) URLs
  from the web-search results, with at most 3 kept.
- **Follow-ups** — `follow_up_suggestions(intent, language)` → `ChatResponse.suggestions`.
- **Inline links** — the frontend remark plugin `frontend/src/lib/chatLinkify.ts`
  links dates, store names and page keywords at render time. Stored text stays plain.
- **Safety** — `AiChatbot.tsx`'s `a` renderer makes only in-app links and that
  reply's own sources clickable. Any other URL in model text renders as plain text.
- **Shareable chats** — `/app?chat=<session_id>`. The backend serves a session
  only to its owner or an admin.

## 4. Changing a prompt

- Run `pytest tests/test_chat_grounding.py tests/test_chat_intent.py tests/test_chat_intent_router.py`.
- With `GEMINI_API_KEY` set, run the evals in `tests/evals/` (golden dataset + Gemini judge).
- Keep `ANSWER_TEMPLATES` and the deterministic cards in step.
