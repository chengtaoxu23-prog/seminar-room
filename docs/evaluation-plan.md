# Future evaluation plan — no results yet

**Not a completed experiment.** No GPT comparison, efficiency claim or commercial benchmark is established by this alpha.

## Conditions

A: one model with a strong professional GTM-audit prompt. B: the same model in fixed-round free Blue/Red dialogue. C: GTM-RedTeam's fixed workflow. Freeze model ID/version, supplier, decoding settings, source files/revisions and information cutoff for every condition. No browsing or privileged sources for one condition only. Freeze B at one challenge/rebuttal cycle; record actual calls and input/output usage for all conditions. Do not silently normalize away workflow overhead.

## Cases (minimum five)

Use five distinct, fully documented cases: subscription SaaS entering a new market; consumer hardware launch; cross-border distribution; a regulated category; a price-sensitive service with missing unit economics. Humane AI Pin may replace the hardware candidate only if public source rights, cutoff and material completeness are reviewed. Do not assume its outcome is a known risk label or invent case results. Synthetic and real/public cases must be labelled separately.

Before any runs, two human domain reviewers freeze a critical-risk register with acceptable evidence anchors, uncertainty labels, severity rationale and adjudication rules. Freeze source versions and a hash of the label set. Keep the register unavailable to the model. Resolve reviewer disagreements before outcomes are revealed. Record why a true risk may be unknowable from the given corpus.

## Blinding and measurement

Randomize case/condition order; strip condition/model branding; use neutral output IDs and a common presentation format without adding evidence absent from an output. At least two independent reviewers score each result blindly and disclose expertise/conflicts. Report disagreements and adjudication. Keep all outputs, failures, source revisions and scripts for reproducibility, subject to privacy rights.

Measure: (1) exact quote/revision/paragraph validity; (2) evidence support for each claim and risk argument; (3) precision/recall against frozen critical risks, with partial and unknown categories; (4) fabricated operating data; (5) unresolved evidence gaps; (6) actual human verification time measured with a timer, including correcting citations and finding missing support; (7) actual usage/call count, provider-billed cost only if available, otherwise unavailable; (8) failure rate including timeouts, truncation and exhausted repair budgets. Count every dispatched request. Never substitute estimated tokens for usage.

## Preregistered gates to confirm before data collection

Proposed safety gate: zero fabricated CAC/LTV values presented as observed facts; zero invalid quotes promoted as verified evidence. Any violation fails that release's reliability gate pending correction. Proposed utility gate: at least 80% support precision for promoted risk inferences and at least 80% recall for corpus-answerable critical risks; report raw numerators/denominators by case and reviewer. These are proposed thresholds, not achieved results.

For workflow adoption, require median measured verification time <=A and no material decline in critical-risk recall compared with A. B is a comparison condition, not an assumed baseline win. Failure to meet gates means revise or drop the commercial claim; do not relabel uncertain outcomes as passes. With only five cases, conclusions are exploratory; show uncertainty and avoid broad superiority claims. Freeze final gates, case list, prompts, analysis and stop rules before running; further cases cannot be selected after seeing favorable outcomes.

Separate post-release work: analyst willingness to use, usefulness, ease of verification versus direct GPT, actual time saved, and willingness to pay. Interview enthusiasm alone is not payment evidence.
