# Development discussion simulator

Site-specific development mode is enabled only by `?demo=1`. Normal visitors load only real Firestore comments. No per-comment demo labels are rendered in the development view. Never silently enable this mode on production pages.

- Real posts/comments are untouched. Generated discussion plans and full provider responses are AES-GCM encrypted in the existing cloud state. Every published test record retains `demo:true`.
- Documentation-only TEST-NET IPs; simulated region separately weighted ~95% mainland with greater weights for large/developed provinces. These are not actual IP geolocations.
- Each approved article has 2–60 generated entries including replies. One low-cost `qwen-plus` request handles up to 120 entries across several articles, using only titles/summaries/takeaways, no search and no thinking. Turbo returned HTTP429 on initial cloud verification; switched explicitly to the still-cheap Plus model. No Max fallback.
- Article workflow pre-generates the discussion batch. A second schedule at Beijing 05:00 releases all due test entries in one Hosting deployment, never future timestamps. Initial old notes are queued by that job too.
- Dates are 1–7 calendar days after the article, 01:00–04:00 Beijing, released by the 05:00 batch. Parent precedes its reply. No per-comment requests. GH schedules can be delayed.
- Public released file: `/development/comments.json`, noindex/no-store, only due entries. Full future plans stay encrypted. Normal view never fetches it.
- Count/token/output/attempt caps, cached plans prevent repeated charges. Interrupted or malformed paid responses require inspection, not blind rewriting. Access denied disables the cheap model; no Max fallback.
- Rules for article writing remain unchanged: test questions/opinions must not fabricate purchase or usage experience, efficacy, medical advice or endorsements.

The actual model tariff is recorded per request; list-price estimate is not provider invoice. Hosting stays Spark, no billing account or paid Functions.

2026-11-05 endpoint diagnosis: GEO provider account has a dedicated compatible API base, now copied as Actions Secret DASHSCOPE_BASE_URL and validated before use. Both Plus and Flash were actually rejected with access_denied there too; Turbo returned model_not_found. User explicitly chose cheap models only, no Max fallback. After user fixes Plus permissions, dispatch comments with recheck_comments=true once; this clears disabled state and retains previous receipts. Failed model probes stay encrypted in the shared ledger.
