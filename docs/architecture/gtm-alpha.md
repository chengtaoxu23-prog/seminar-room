# GTM alpha architecture

- **State machine:** `gtm-state.ts` owns five business phases and lifecycle transitions. `rebuttal_verifying` belongs to phase four. Existing request/repair caps remain shared.
- **Protocol:** `src/shared/gtm.ts` and `gtm-schema.ts` define strict stage outputs. A Claim carries citations with Source ID, revision, paragraph ID and continuous quote; unknown data is not a license to fabricate facts.
- **Verifier:** `gtm-sources.ts` checks original substrings, then fixed normalization; `gtm-execution.ts` validates semantic reviews and derives classifications on the server. Citation existence is distinct from semantic support and commercial risk.
- **Ledger:** `gtm-budget.ts` estimates whole-material and complete-request budgets; reserves each request before dispatch, settles actual usage or records unavailable values, and enforces shared limits. No calibrated token counts or financial claims.
- **Persistence:** `gtm-repository.ts` retains atomic primary/backup persistence and its existing process-local serialization. Started source snapshots, context and selection cannot change. Provider identity is stored without credentials. Human decisions are separate from sealed machine results.
- **Executor:** `gtm-engine.ts` is the only executor. The API checks start preconditions and sends explicit cancel commands; GET and refresh never dispatch calls. Convergence/report generation stays deterministic TypeScript.
- **Providers:** `gtm-runtime.ts` validates explicit configuration; `gtm-provider.ts` handles OpenAI-compatible HTTP responses, timeout, transport failures, truncation and usage. Real mode never falls back. `gtm-mock.ts` stays a labelled offline protocol demo.
- **Delivery:** React consumes server authority. A real start requires informed consent. Report export adds independent human notes without replacing machine records. Legacy SeminarRoom entry point is retained separately.

See the retained P0/P1 design documents in this directory for original protocol decisions. These notes describe implementation, not proof of commercial benefit.
