# Provider configuration and smoke-test gate

Status: Mock/stub engineering tests and one live DeepSeek synthetic workflow passed. The [2026-11-12 validation record](validation/deepseek-live-smoke-2026-11-12.md) documents six requests and 38,634 actual tokens. The [first failed run](deepseek-smoke-2026-11-12.md) remains separate. No real commercial-quality or benchmark claim follows.

## Configuration

Use the GTM variables in `.env.example`, copied to `.env.gtm.local`. Keep the filled file on the server only. `GTM_PROVIDER=mock` is offline. `openai-compatible` requires HTTPS endpoint (loopback HTTP allowed), model and key. No implicit fallback or legacy-key reuse. `npm run check:gtm-config` validates locally without HTTP. Construction, startup and GET do not send model requests.

## DeepSeek example

```dotenv
GTM_PROVIDER=openai-compatible
GTM_BASE_URL=https://api.deepseek.com
GTM_MODEL=deepseek-flash
GTM_API_KEY=fill-locally
GTM_MAX_CALLS=8
GTM_TIMEOUT_MS=60000
```

The adapter appends `/chat/completions` to the official base URL, requests `json_object`, reads content/finish reason and records supplier input/output/total usage. It does not use DeepSeek's account billing API. Missing usage stays unavailable. `length` is rejected even if the JSON appears complete. DeepSeek may use thinking tokens within output limits; this alpha has not calibrated per-supplier token budgets. A returned semantic judgement is not a verified commercial outcome.

The smoke script forces a total cap of eight; the template also uses eight. An omitted total still defaults to five in real runtime configuration for backward compatibility. Existing process environment variables take precedence over the file; check them locally without printing credential values. Do not reuse an earlier authorization or silently rerun a failed audit.

## Real execution entry points

1. UI: create a new audit bound to the configured mode/model, choose complete sources, review estimates, then explicitly agree to sending the business context and selected sources and click Start.
2. Approval-gated smoke CLI: `npm run smoke -- --approve-real-smoke`. Do not run until the user approves. It uses a built-in synthetic case, a separate new audit, and a ledger limit of eight calls including repairs; a new run requires fresh authorization. Never rerun automatically after a partial failure.

Request limits: complete input estimate <=49,152 tokens; output maxima by stage 4,096 / 16,384 / 8,192 / 12,288 / 8,192; timeout 60,000 ms by default (up to 300,000). Material estimate <=24,576. Estimates are not calibrated provider counts. The omitted-variable real-audit default is five calls; the supplied template uses eight; configurable max ten. The smoke CLI uses eight; completed-run authorization does not authorize another run. At least four calls must remain before the first rebuttal generation, covering both generation and semantic review with their repair slots.

Expected stages: Blue Proposal, Red Challenge, Red Verifier, Blue Rebuttal, rebuttal Verifier (within business phase four); deterministic convergence makes no request. Skips or repair may mean fewer than five stages receive calls, or the cap may stop the run. Success is not guaranteed.

## Before asking for live approval

- Validate config without sending; user supplies key locally, never through chat.
- Confirm only synthetic or explicitly approved material is selected and the endpoint/model are intended.
- Show total/per-request limits, expected phases and local persistence behavior.
- Obtain fresh explicit approval for at most eight requests. An implementation approval is not a request-execution approval.

After approval, validate connection, returned structured JSON, citation integrity, workflow/report production and actual usage. Missing usage stays unavailable. Record partial failures, truncation, unknown results and actual request count. No quality claims, GPT comparison, calibration or benchmark conclusions follow from this smoke.

## API boundary

`/api/gtm/config` exposes mode, model and limits only. Audit create/list/detail, materials add/delete, selection, start/cancel, reviews and report/export reuse the P2 routes. Real `POST /api/gtm/audits/:id/start` requires `{ "consentToSend": true }`; Mock accepts an empty object. Audit/provider mismatch requires a new audit. All material mutation is draft-only. A stored historical Mock audit continues to be labelled Mock after server configuration changes.

Failures remain explicit: invalid configuration blocks startup; HTTP/timeout/transport failures stop the audit; invalid model JSON uses the existing one-repair policy; invalid citations use the existing verifier/repair policy. No keys, raw provider error bodies or business material are logged. Prompt/material snapshots do exist in private local audit records.
