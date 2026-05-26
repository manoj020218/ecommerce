# Search Module Regression Checklist (Phase 5)

1. Public `/api/search?q=` works without login.
2. Exact SKU or title query ranks expected product first.
3. Synonym mapping improves recall for alternate terms.
4. Buyer phrase mapping (Hindi/Hinglish/English phrase) boosts mapped products.
5. Search click tracking updates ranking signals.
6. Logged-in customer search history is private and retrievable only for same user.
7. Logged-in customer recently viewed list tracks correctly.
8. Zero-result queries are visible in admin zero-result endpoint.
9. Search redirects apply exact query redirect rules.
10. Reindex endpoint updates metadata and logs activity.
