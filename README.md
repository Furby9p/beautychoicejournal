# Beauty Choice Journal

Chinese beauty notebook community hosted on Firebase Spark with no linked billing.

GitHub Actions runs on the standard free public-repository Linux runner at 18:00 UTC (02:00 Asia/Shanghai), independent of Codex and any local computer. The schedule can be delayed by GitHub. Each run selects two remaining question-bank topics, searches original sources with Qwen, writes both in one request, checks source quotations and scope, then publishes both in one Hosting release. Either draft failing blocks the pair.

Secrets remain in repository Actions Secrets; Firebase uses short-lived OIDC credentials scoped to this main-branch workflow. No long-lived Google key. Per-call tokens, list-price fee estimates, failures, and response caches are AES-GCM encrypted in automation-state/runtime.enc.json. Actual provider bill amounts remain unknown unless reconciled.

Inputs and outputs are bounded. No larger runner, paid artifact storage, Firebase paid functions, or Cloud Billing link. User submissions/comments persist in Firestore and are not modified by the job.

Skill snapshot: editorial/skill.md. Build: node scripts/build.mjs. Manual workflow audit deploys existing content, checks one small Qwen request if not yet verified, and audits crawler access; it does not create articles.
