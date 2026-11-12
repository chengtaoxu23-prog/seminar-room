# DeepSeek live smoke — 2026-11-12

Status: **FAILED / INCOMPLETE. Not a passed real workflow acceptance.**

One synthetic case; model `deepseek-flash`; five total real requests, no external ping and no whole-audit rerun. Source: five synthetic interviews, no purchase commitments; CAC/LTV and willingness to pay not measured. No real user business material used.

| Request | Stage | Result |
| --- | --- | --- |
| 1 | Blue Proposal | Truncated (`finish_reason=length`, output_truncated) |
| 2 | Blue Proposal repair | Valid structured output |
| 3 | Red Challenge | Valid structured output |
| 4 | Red Verifier | Valid structured output |
| 5 | Blue Rebuttal | Valid structured output; single round |

The shared five-call budget then blocked rebuttal semantic verification before a sixth request. Stored lifecycle is failed at `blue_rebuttal/rebuttal_verifying`; outward error code is generic `engine_error`, not a precise budget-exhausted code. Final deterministic convergence and report generation did not run. No budget or schema relaxation was made.

Actual usage returned for all five calls: input 8,965; output 18,527; total 27,492 tokens. No missing usage calls. This is supplier-reported usage, not an estimate or cost claim.

The engine checked Red and Blue citation integrity with zero recorded citation failures. Red has 14 verified Claim records with model semantic reviews and server-derived material_fact/inference classifications. This does not independently establish that commercial risk is true. The invalid-evidence live branch was not exercised. Blue semantic verification and derived rebuttal records are incomplete, so no supported Blue rebuttal may be claimed. The final report and full live execution chain remain unverified.

Real connectivity, structured responses in the listed successful stages, citation checks and usage capture received limited live validation. Existing Mock verification is separate. Formal benchmark, GPT comparison, analytical accuracy and commercial benefit remain unverified.

Execution stopped on the failed run. No whole-audit rerun, extra requests, post-pass release checks, commit or Push. Any further live request requires a new explicit authorization; the five-call allocation for this run is exhausted. The prior Mock/test results are historical and not substituted for current release acceptance.
