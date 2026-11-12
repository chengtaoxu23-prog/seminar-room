# GTM-RedTeam v0.1.0-alpha

This branch is a local single-user evidence-backed GTM risk-audit alpha, derived from the MIT-licensed SeminarRoom project. This document describes a source release, not a GitHub Release object or hosted deployment.

## Included

Fixed Blue Proposal → Red Challenge → Verifier → one Blue Rebuttal → deterministic convergence; frozen source revisions and whole-source budgets; exact/normalized quote checks; semantic review and server-derived Claim classification; separate Human Review; Markdown export. P1-C applies a concise Blue prompt and runtime 4096 output cap, four-request rebuttal preflight, and safe public error details while keeping the shared ledger and two-attempt stage limits.

## Validation

Mock/stub and legacy regression coverage remains separate from live results. On 2026-11-12, one separately approved DeepSeek `deepseek-flash` synthetic case completed all phases with six requests within an eight-call cap, including one Verifier truncation repair. Supplier-reported usage: 11,865 input + 26,769 output = 38,634 tokens. Final report and export matched; citation/semantic/classification records were complete. See the [formal validation record](validation/deepseek-live-smoke-2026-11-12.md). The [earlier five-call failed run](deepseek-smoke-2026-11-12.md) remains unchanged and separate.

## Limits

Only one synthetic case. No live invalid-citation or insufficient-evidence branch coverage, GPT comparison, multi-case Benchmark, real-customer or paid-demand validation. Semantic Review remains model judgement; no accuracy, savings or ROI is established. TXT/MD/pasted text only; no PDF/DOCX, external research, accounts or multi-user service. Token estimates are uncalibrated. Runtime data is local and unencrypted. No model requests were made during final publication checks.

MIT and third-party notices retained. Filled environment, audit data, local outputs, logs and backups are excluded. Starting additional live execution always requires a new explicit decision by the user.
