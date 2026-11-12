# DeepSeek live smoke validation — 2026-11-12

**Result: one synthetic end-to-end smoke passed. This is limited workflow validation, not commercial-quality validation.** No model calls were made while preparing this publication record.

## Environment and case

- Provider: official DeepSeek OpenAI-compatible Chat Completions API.
- Requested and returned Model ID: `deepseek-flash`.
- Date: 2026-11-12. Audit: `f77a63cb-070d-4000-963d-4a7ef43f7fbd`.
- Case: five synthetic interviews, no purchase commitments; CAC, LTV and willingness to pay not measured. No real business material.
- Maximum: eight total requests including repairs. Actual: six requests, one new audit, no ping or whole-audit retry, no Mock fallback.
- Blue output cap: 4096 tokens. The fourth-stage preflight retained four requests for rebuttal generation/repair and semantic verification/repair.

## Per-request supplier usage

| Request | Stage / attempt | Result | Input | Output | Total |
| --- | --- | --- | ---: | ---: | ---: |
| 1 | blue_proposal / attempt 1 | Schema-valid output | 608 | 565 | 1173 |
| 2 | red_challenge / attempt 1 | Schema-valid output | 1064 | 5630 | 6694 |
| 3 | red_verifier / attempt 1 | Truncated (length); rejected | 2209 | 8192 | 10401 |
| 4 | red_verifier / attempt 2 | Schema-valid output | 2223 | 5602 | 7825 |
| 5 | blue_rebuttal / attempt 1 | Schema-valid output | 3956 | 2895 | 6851 |
| 6 | rebuttal_verifier / attempt 1 | Schema-valid output | 1805 | 3885 | 5690 |

All numbers are actual usage returned by the supplier, not engineering estimates. Input **11,865**, output **26,769**, total **38,634** tokens; no missing usage. Per-call sums match the persisted ledger. No supplier account billing API was used to independently reconcile charges; no monetary cost is claimed. The unused request allocation is not authorization for more calls.

## Five business phases

1. Blue Proposal completed on its first attempt.
2. Red Challenge completed.
3. Verifier: the first output reached `length` and was rejected; one shared-budget repair completed.
4. Blue Rebuttal: one round completed; rebuttal semantic verification completed, not skipped.
5. Deterministic Convergence: TypeScript assembled the final report; no model call or model tokens.

Final state: `completed / convergence / assembled`. All five model checkpoints are sealed, with none skipped. The report passed the existing aggregate validation, including derived classification and deterministic report checks. Exported Markdown matches the persisted Markdown exactly.

## Evidence chain

Red: 12 Claims, 13 passing citation-check entries, zero failed entries. Server classifications: material_fact 4, inference 6, hypothesis 2.

Blue: 12 Claims, 13 passing citation-check entries, zero failed entries. Server classifications: material_fact 3, inference 6, hypothesis 3.

Citation checks cover frozen source ID/revision/paragraph correspondence and quote integrity. Semantic reviews exist for all 24 Claims; the model marked their relations supported. Classification was derived by server rules, not rewritten to obtain a pass. A supported semantic relation does not certify objective commercial risk. Citation counts describe check entries and are not a claim of 26 distinct source passages.

## Separate prior failure

The [first run](../deepseek-smoke-2026-11-12.md) remains unchanged: a five-call budget, Blue truncation/repair, stopped before rebuttal semantic verification, no final report, actual usage 27,492 tokens. P1-C tightened Blue prompting, applied a 4096-token runtime Blue cap, added four-request fourth-stage preflight, and exposed budget failure details. This successful second run was a separately approved new audit, not a continuation of the first. Existing audit primary files matched their pre-run hashes. The two runs are not combined into one successful record.

## Validation boundary

Only one synthetic case completed. Real commercial analysis quality, risk accuracy/recall, analyst usefulness and willingness to pay remain unverified. The live invalid-Citation and insufficient_evidence branches were not exercised. Semantic Review remains model judgement, even when the quote exists. No GPT comparison, formal multi-case Benchmark, independently measured human-time savings, cost savings or ROI has been established. HTTP-stub and Mock engineering tests are separate evidence.

Only this reviewed Markdown summary is published. Private source/prompt snapshots, filled environment files and runtime storage remain excluded. The raw local audit and local report are not uploaded.
