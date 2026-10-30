# CITIMART Daily Operations — Lifecycles & Event Hooks (HOOKS)

---

## 1. Asynchronous Application Lifespan Hooks

Defined in `Daily Operations/backend/app.py`:

```python
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Hook 1: Enforce production secret presence
    assert_production_secrets()

    app.state.background_tasks = []

    # Hook 2: Render Keep-Alive self-ping (every 10 minutes)
    async def _keep_alive():
        ...

    # Hook 3: Warmup DB pool, seed initial accounts, and launch midnight job
    async def _warmup():
        await asyncio.to_thread(warmup_database)
        await asyncio.to_thread(_seed_accounts_best_effort)
        app.state.background_tasks.append(asyncio.create_task(run_midnight_finalizer()))
        app.state.background_tasks.append(asyncio.create_task(_keep_alive()))

    app.state.background_tasks.append(asyncio.create_task(_warmup()))
    yield

    # Hook 4: Graceful shutdown and background task cancellation
    for task in app.state.background_tasks:
        task.cancel()
```

---

## 2. Frontend React Hooks

In `Daily Operations/frontend/src/`:
- `useAuth`: Exposes `token`, `user`, `role`, `storeCode`, `isSwitched`, `login()`, and `logout()`.
- `useDailyData`: Real-time query hook fetching live store KPIs and weather context.
- `useMediaQuery`: Dynamic responsive breakpoint detector for 1366x768 and wide screens.
