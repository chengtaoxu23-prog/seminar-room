# GTM-RedTeam

**A Persistent Evidence Ledger for Go-to-Market Decisions.**

GTM-RedTeam is a continuous evidence-driven research workspace for early-stage AI and SaaS founders making overseas market, customer, pricing and growth decisions. Commercial hypotheses, source evidence, independent challenges and human decisions remain connected over time.

## v0.4 alpha: local research workspace

- Create a project and import PDF, DOCX, XLSX, CSV, TXT, Markdown or public HTML/URLs. Originals, file hashes, parser revisions and source locations are retained.
- Research Planner drafts 3–5 Hypothesis Contracts. Edit criteria, market, customer segment, validation window and threshold; explicitly lock. Locked contracts can only be revised into new versions.
- Eight independently prompted and recorded roles use the configured real provider: Planner, Market, Competitor, Customer, Business Model, Red-Team, Evidence Verifier and Decision Analyst. These are distinct executions on the same model, not independent models.
- Exact citation matching and the existing server-side claim classifications remain mandatory. Verifier separately checks quote-to-claim semantics and claim-to-contract relevance. A quotation does not prove a customer hypothesis.
- Add sources and run Evidence Delta. Only unassessed source revisions enter incremental requests; previous evidence is passed as traceable records. Supporting, contradicting, contextual, neutral, duplicate and insufficient-evidence outcomes remain distinguishable.
- AI proposes; a human accepts, rejects, modifies or requests further research. Every event preserves the contract version, previous/new status, evidence IDs, reason and actor in the existing hash-chain Decision Ledger.
- Export Markdown and JSON. Reports are assembled by code and retain baseline research, later deltas, source citations and human decisions.

## Run locally

Requires **Node.js 22.13+** (validated on Node 24) and a configured DeepSeek account/API balance.

```powershell
npm ci
# Copy .env.example to .env.gtm.local and fill the key locally.
# Reuse existing local configuration; never print or commit it.
npm run check:gtm-config
npm run build
npm start
```

Open [the local workspace](http://127.0.0.1:4317/). The server binds to loopback. Invalid real configuration stops startup; research never falls back to mock. Historical audit screens remain available via `?screen=projects`; the v0.3 fixture board is explicitly an offline demonstration.

**Overview → import sources → AI draft → edit and lock Contracts → real research → inspect evidence → add a source / Delta → human decision → Reports.** Execution requires the material-transmission checkbox. Runs survive page refresh. Restart marks in-flight requests interrupted with usage unknown; explicit resume is required.

## Budgets and source coverage

Each plan/research/delta run has a **16-request total hard cap**, including failures, repairs and explicit resume. A failed role has one automatic repair; further explicit retries consume the same remaining cap. Completed roles are reused. Truncated or structurally invalid output never becomes a successful checkpoint.

The workspace sends identified source windows (up to 20 windows / 48,000 characters), selected by lexical relevance, source diversity and nearby context. **Full originals remain available, but omitted units are not assessed.** Coverage is visible in the UI/report. Inspect or retrieve other source locations in Evidence Ledger. This is bounded source research, not an exhaustive-review claim.

Estimated tokens and provider-returned actual usage are separate. DeepSeek workspace JSON requests explicitly use `thinking: {type: "disabled"}` so the required structured result can fit the output budget. Settings are recorded per request; historical audit defaults are unchanged. See [DeepSeek thinking mode](https://api-docs.deepseek.com/guides/thinking_mode/) and [JSON output](https://api-docs.deepseek.com/guides/json_mode/).

## Input boundaries

| Input | Preserved location / boundary |
|---|---|
| PDF | Page / extracted paragraph; text layer required. No OCR or chart interpretation. |
| DOCX | Body heading/paragraph and table/row/cell. Headers, footnotes and floating shapes outside parser scope. |
| XLSX | Sheet/cell, raw value, formula and cached value separately. No recalculation; inspect original for display styles, charts and shared/array formula dependencies. |
| CSV | Original field value, row and column, including multiline quoted fields. |
| TXT / MD | Paragraphs; long text split with explicit character ranges. |
| HTML / URL | Text, title, URL, original HTML, acquisition time and publisher-declared date when present. No JavaScript execution; page furniture excluded. |

Limits: 20 MB uploads, 8 MB public fetches, 4 million extracted characters, bounded separate parser processes. Invalid/encrypted/unsupported documents fail explicitly; failed uploaded raw bytes are retained outside the evidence registry.

Public fetching rejects URL credentials, nonstandard ports, internal/reserved addresses and unsafe redirects. Validated DNS addresses are pinned. TUN fake-IP networks use a fixed public DNS-over-HTTPS resolver to obtain and validate actual public addresses. Sources are untrusted data, never executable instructions. Search has a replaceable provider interface but **no configured search provider**; only supplied files/URLs are researched.

## Validation and public case

```powershell
npm test
npm run typecheck
npm run build
npm run check:release
```

Automated model-behavior tests use isolated HTTP stubs and do not establish actual model quality. An explicitly authorized real public-source case used Fathom/Fireflies official pricing, the European Commission AI Act page and a Eurostat PDF. It completed planning, all eight roles and a separate PDF delta in **16 real requests total** (1 + 12 + 3), including four retained failed requests. The user explicitly approved all five hypotheses as `needs_research` because public sources did not meet the criteria. This is independent public-source analysis, not a company engagement or validated demand finding. Runtime/private source records are excluded from Git.

To deliberately run another paid public-source case after starting the real server:

```powershell
npm run test:e2e:v04 -- --real-public-case
# Resume the same interrupted case and reuse its saved work:
npm run test:e2e:v04 -- --real-public-case --resume-project=PROJECT_UUID
```

The script labels its own public-case Contract locks as assistant operations. **It never invents human approval.** Final decisions must be made in the UI or explicitly authorized separately.

This is a local, single-user alpha for founder-led research, not a public multi-tenant service. Read [customer data handling](docs/customer-data-v04.md) before private pilots. The original P0–P1-B engine and audit histories remain intact; the [previous README](docs/history/README-v0.2.md) is archived.

MIT. See [third-party notices](THIRD_PARTY_NOTICES.md).
