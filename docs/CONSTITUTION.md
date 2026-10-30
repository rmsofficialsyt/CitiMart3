# CITIMART Daily Operations — Engineering Constitution (CONSTITUTION)

**Preamble:** This constitution sets forth the core engineering bylaws governing the CITIMART Daily Operations platform.

---

## 1. The Core Commandments

1. **Law of Store Sovereignty:** A store manager must never have access to read or mutate another store's figures. IDOR checks are absolute.
2. **Law of Administrative Authority:** Sales targets and executive directives can only be authored or mutated by the Administrator (`ADMINISTRATOR`).
3. **Law of Secret Secrecy:** Real passwords, Atlas URIs, JWT secrets, and AI keys must never be committed to source control.
4. **Law of Metric Consistency:** Daily calculations must match the analytical master formulas in `src/kpi_engine.py`.
5. **Law of High Availability:** Background workers (Keep-Alive, Midnight Finalizer) must never crash the main FastAPI server thread.
6. **Law of Automated Verification:** Code changes must prove zero regression by running and passing the entire 162-test pytest suite.
