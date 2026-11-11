# Release safety and provenance

Preserve MIT LICENSE and predecessor copyright. Historical SeminarRoom docs, synthetic examples, tests and screenshots remain as historical records, not GTM commercial results. Current release screenshots use only synthetic materials.

Before staging: review tracked/untracked paths, run `npm run check:release`, inspect history and archive metadata, inspect every image selected for publication, and confirm `.gitignore` excludes filled environments, data, work, logs, backups and caches. No `git add -A` shortcut. Review staged diff explicitly. Scans print file paths and risk types only, never credentials or matched values. A known synthetic canary in tests is allowed only at its documented location and marker.

If a possible real secret or private historical material is found, stop commits and report locations/types. Do not rewrite history or replace MIT without user authorization. Exclude disposable archives/working output from release while retaining the local originals. Pattern scanning does not authenticate document provenance or guarantee that no sensitive information exists. Existing historical screenshots need human visual review as well as synthetic-data labels.

Push requires separate final user approval. Do not merge, force-push, tag, release, deploy, rename the remote, or change main. Check the current remote branch before any approved Push. A clean local release candidate is not evidence of live-model or commercial validation.
