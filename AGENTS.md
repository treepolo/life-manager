# Repository development rules

## Scope

The active product is the simplified life-manager defined in `docs/PRODUCT_REQUIREMENTS.md`. Historical product areas such as social analytics, investments, deadlines, generic metrics, events, provider integrations, and the old task/finance models are retired unless the user explicitly reintroduces them.

## Non-negotiable infrastructure

Preserve Cloudflare Worker/D1/Access, IndexedDB offline storage, outbox synchronization, conflict handling, PWA safe updates, and zero-cost operational guardrails unless the user explicitly changes those requirements.

## Database

- Never edit a migration that may already have been applied. `0001` through `0010` are immutable history.
- Additive simplified product schema starts at `0011_simple_core.sql`.
- Do not create or apply a migration that drops legacy production tables until all device outboxes are confirmed empty, a remote D1 backup exists, and staging has passed migration/smoke/sync verification.
- User-visible deletes use synchronized tombstones unless a later cleanup migration is explicitly authorized.

## Code boundaries

- Product-domain code belongs under `src/modules/simple` and the three active pages.
- Generic CRUD and synchronization must remain product-agnostic.
- Do not add new universal metadata, tags, priorities, schedules, dashboards, or provider abstractions without an explicit product requirement.
- Financial current values are derived from history; do not introduce duplicate current-value storage.

## Verification

Before considering a code change verified, run the repository verification gate: lint, TypeScript, unit tests, Worker/D1 tests, client build, Playwright E2E, production placeholder/secret scan, and requirement coverage.

Do not weaken assertions, skip tests, clear IndexedDB as a workaround, or bypass migrations to make the gate pass. Update `docs/IMPLEMENTATION_STATUS.md` only from actual evidence.
