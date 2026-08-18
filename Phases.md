# Complete Website Intelligence + Agent Integration — Antigravity Prompts (Consolidated)

This is the full, non-fragmented package covering everything worked through
this session: Crawl4AI as the actual crawl engine (not a hand-rolled
crawler), platform connectors, sync scheduling, image handling, pgvector
retrieval, the generic vertical-agnostic Entity shape, the Retell/Vapi
function-calling layer, and inline card rendering. Earlier partial prompt
sets from this conversation are superseded by this file — use this one.

Organized in 8 phases. Do them in order — each phase's acceptance criteria
assume prior phases are done. Every prompt is self-contained enough to paste
into Antigravity on its own.

---

# PHASE 0 — Infrastructure: deploy Crawl4AI

## 0.1 Deploy Crawl4AI as its own service

**Prompt:**

> Context: The platform needs a real crawling/extraction engine that handles
> JS-rendered sites, sitemap-based discovery, deep nested-page crawling, and
> anti-bot/WAF detection — capabilities the current hand-rolled crawler
> lacks (verified live: it only reaches a site's homepage, has no
> JS-rendering fallback, and silently indexed a firewall block page as real
> content on a real test site). Crawl4AI (https://github.com/unclecode/crawl4ai)
> is an open-source Python/Playwright crawler that provides all of this out
> of the box, deployable as a Docker service with a REST API.
>
> Task:
> 1. Add a `crawl4ai` service to the project's deployment config (Docker
>    Compose for local dev if one exists, plus whatever the project's actual
>    hosting target is — Railway/Fly/a VM — check `README.md`'s Deployment
>    section for the existing hosting approach before choosing where this
>    runs). Use the official `unclecode/crawl4ai:latest` image.
> 2. Expose its REST API port (11235 by default) only to the Next.js
>    backend's network, not publicly — this service should never be directly
>    reachable from the internet or from any client widget.
> 3. Add `CRAWL4AI_BASE_URL` to the environment variables list (alongside the
>    existing Supabase/Retell env vars documented in the README), pointing at
>    wherever this service is reachable from the Next.js backend.
> 4. Create `lib/crawl4ai/client.ts` — a thin wrapper around the Crawl4AI
>    REST API (`POST {CRAWL4AI_BASE_URL}/crawl`) with typed request/response
>    shapes, a reasonable timeout, and retry-on-transient-failure (not
>    retry-on-block, that's handled differently in Phase 3).
>
> Constraints:
> - This is infra + a thin client only — no extraction logic in this prompt.
> - Do not expose this service's port publicly under any circumstance; it has
>   no auth of its own by default and running a full browser engine, so
>   public exposure is a real security risk, not just a style preference.
>
> Acceptance criteria:
> - The Crawl4AI service starts successfully in the project's dev environment
>   and responds to a basic `POST /crawl` call against a test URL from
>   `lib/crawl4ai/client.ts`.
> - The service is not reachable from outside the backend's own network.

---

# PHASE 1 — Customizer UI restructuring

## 1.1 Add "Crawler" section, move Website Intelligence out of Deploy

**Prompt:**

> Context: The customizer's "Customize Settings" tab has a Sections sidebar
> (Branding, Colors, Typography, Launcher, Panel, Behavior, Responsive,
> Deploy), each showing its own panel. "Website Intelligence" currently lives
> inside Deploy, mixed with agent provider config and the embed snippet.
>
> Task:
> 1. Create `src/components/widget-customizer/CrawlerSection.tsx`, matching
>    the existing section components' structural pattern exactly (same panel
>    header style as "COLORS"/"BRANDING", same config read/write pattern).
> 2. Add "Crawler" to the Sections list with an icon matching the existing
>    icons' style/weight, positioned between "Responsive" and "Deploy".
> 3. Move the entire Website Intelligence block (connect inputs, status card,
>    re-crawl/view-data/disconnect actions) out of `DeploySection.tsx` into
>    `CrawlerSection.tsx` as-is — pure relocation, no behavior changes here.
> 4. Confirm whatever state/data-fetching backs this block still works
>    correctly after the move (trace it, don't assume).
>
> Acceptance criteria:
> - "Crawler" appears in the Sections list, styled consistently with every
>   other entry.
> - Website Intelligence works identically to before, just relocated.
> - Deploy contains only identity, agent/provider config, and the embed
>   snippet afterward.

## 1.2 Fix the embed-snippet hydration mismatch

**Prompt:**

> Context: Deploy's embed-snippet preview shows a real Next.js dev warning
> ("A tree hydrated but some attributes of the server rendered HTML didn't
> match the client properties"), visibly corrupting the snippet preview (CSS
> color values bleeding into the script tag text).
>
> Task: Find the component rendering the snippet preview. Look for a
> `typeof window !== 'undefined'` render-time branch, or any value computed
> differently on server vs. client (random ID, `Date.now()`, a client-only
> store read before hydration). Fix by moving client-only-dependent output
> into `useEffect` + state (stable placeholder on first paint, swap after
> mount) rather than branching on `window` in the render body.
>
> Constraints: fix the actual mismatch, don't suppress the warning.
>
> Acceptance criteria: no hydration warning in dev console when opening
> Deploy; snippet preview renders clean, uncorrupted code.

---

# PHASE 2 — Generic data foundation

## 2.1 Define the generic Entity shape

**Prompt:**

> Context: The platform serves multiple verticals through one widget engine.
> Data needs a universal core (works for a car, a clinic service, or a
> product) plus a flexible vertical-specific extension, so nothing downstream
> branches on vertical.
>
> Task: Define in `types.ts`:
> ```typescript
> interface Entity {
>   id: string
>   widgetId: string
>   title: string
>   shortDescription?: string
>   imageUrls: string[]
>   sourceUrl?: string
>   entityType: string          // informational label, e.g. "vehicle" | "service" | "product" — never a UI branch condition
>   metadata: Record<string, unknown>
>   dataType: 'crawl' | 'shopify' | 'woocommerce' | 'feed' | 'manual'
>   categoryPath?: string[]
>   embedding?: number[]
>   contentHash?: string
>   createdAt: string
>   updatedAt: string
> }
> ```
> Migrate `website_data` to this shape (rename/add columns: `title`,
> `short_description`, `image_urls` as a JSON array, `entity_type`,
> `metadata` JSONB, `data_type`, `category_path` as a text array,
> `content_hash`).
>
> Constraints: vertical-specific fields live in `metadata` only — never add
> a vertical-specific top-level column.
>
> Acceptance criteria: table matches this shape; a car's `metadata` might
> hold `{mileage, vin, trim}`, a clinic service's `{durationMinutes,
> provider}`, both as valid rows of the identical top-level structure.

## 2.2 Enable pgvector and embed every Entity

**Prompt:**

> Context: Retrieval needs to be semantic, not keyword-matched, to scale
> across widgets and catalog sizes.
>
> Task:
> 1. Enable the `pgvector` extension in Supabase; add `embedding
>    vector(1536)` to `website_data` if not already present from 2.1.
> 2. Add `embedText(text: string): Promise<number[]>` in a shared lib
>    location (reuse an existing embeddings client if the codebase already
>    has one for anything else — don't create a second one).
> 3. Centralize the Entity-insert/update path (in whatever DB helper module
>    already centralizes writes, e.g. `config/widgetsDb.ts`) so every
>    ingestion source (Phase 3 crawl, Phase 4 connectors) automatically gets
>    an embedding computed from `title + shortDescription` on insert/update,
>    without each ingestion path needing to remember to call it separately.
> 4. Batch embedding calls where the source naturally batches (e.g. a
>    Shopify product-list ingestion of 200 items should not make 200
>    sequential calls if the embedding API supports batching).
> 5. Write `scripts/backfill-embeddings.ts` as a one-off script for existing
>    rows, safely re-runnable (skips rows that already have an embedding).
>
> Acceptance criteria: every new Entity row has a non-null embedding after
> insert regardless of which ingestion path created it; the backfill script
> completes without error and is idempotent.

---

# PHASE 3 — Crawl4AI-powered ingestion (replaces the hand-rolled crawler)

## 3.1 Sitemap-driven discovery via Crawl4AI's URL seeder

**Prompt:**

> Context: Replace hand-rolled link-following with Crawl4AI's built-in
> `AsyncUrlSeeder` (`source="sitemap+cc"`), which handles sitemap.xml
> discovery and Common Crawl index fallback natively.
>
> Task: In the crawl orchestration code (replacing the old
> `lib/crawler/index.ts` discovery logic), call Crawl4AI's seeder via the
> `lib/crawl4ai/client.ts` wrapper from Phase 0 to get the candidate URL list
> for a connected website, instead of any custom sitemap-parsing or
> recursive-link code. Support a Quick Scan (low page cap, homepage-adjacent
> only) vs. Master Scan (full sitemap-driven, higher cap) toggle in the
> Crawler section's Connection sub-block, both caps as named constants.
>
> Acceptance criteria: Master Scan against a real sitemap discovers pages
> beyond the homepage; Quick Scan stays capped low; both use the seeder, no
> parallel hand-rolled discovery code remains.

## 3.2 Generic structured extraction via LLMExtractionStrategy

**Prompt:**

> Context: Different clients have completely different page structures.
> Crawl4AI's `LLMExtractionStrategy` maps arbitrary page content into a
> defined schema via an LLM call, which is the actual mechanism for "works
> on any website" without per-client scraper code.
>
> Task:
> 1. Define a Pydantic-equivalent extraction schema (implemented on the
>    Crawl4AI/Python side, invoked via the `/crawl` API's extraction-strategy
>    parameters) matching the `Entity` shape from Phase 2: title,
>    shortDescription, imageUrls, sourceUrl, entityType, and a metadata dict.
>    Keep the schema generic — do not create separate hardcoded schemas per
>    vertical; use one schema with a flexible metadata dict, matching the
>    Entity type exactly.
> 2. Wire the widget/website config to pass this schema on every Crawl4AI
>    `/crawl` call made for that website via `lib/crawl4ai/client.ts`.
> 3. Map Crawl4AI's returned structured result directly into `Entity` rows
>    via the centralized write path from Phase 2.2 (so embedding happens
>    automatically).
>
> Constraints: no vertical-specific extraction code paths — one schema,
> metadata absorbs the variation.
>
> Acceptance criteria: crawling a services site and a product catalog through
> the same code path both produce correctly shaped `Entity` rows with
> meaningful `metadata`, no per-vertical branching in this code.

## 3.3 CSS-based extraction for known repeating patterns (optional fast path)

**Prompt:**

> Context: For pages with a clear, consistent repeating pattern (a product
> grid, a listing page), Crawl4AI's `JsonCssExtractionStrategy` is much
> cheaper than LLM extraction — no LLM cost, faster, deterministic.
>
> Task: Add an optional CSS-selector-schema field, settable per connected
> website in the Crawler section's Advanced sub-block (from earlier UI
> scoping — add it there if that sub-block doesn't exist yet), letting an
> admin/power user define a `baseSelector` + field selectors for a specific
> site's repeating listing pattern. When set, Crawl4AI uses
> `JsonCssExtractionStrategy` with that schema for matching pages instead of
> the LLM strategy from 3.2; when unset, LLM extraction (3.2) remains the
> default fallback for every site.
>
> Constraints: this is an advanced/optional path, not required for the core
> "connect and it works" flow — LLM extraction must remain fully functional
> and be the default with zero configuration.
>
> Acceptance criteria: a site with a defined CSS schema extracts via the
> faster CSS path; a site without one still works correctly via LLM
> extraction with no configuration needed.

## 3.4 Anti-bot/blocked-page detection using Crawl4AI's built-in handling

**Prompt:**

> Context: A real test against a live dealer site showed the old crawler
> indexing a WAF firewall block page as legitimate content, silently marking
> the crawl "Complete." Crawl4AI has built-in 3-tier anti-bot detection
> (known vendors, generic block indicators, structural integrity checks) and
> proxy escalation — use that instead of hand-writing block-page signature
> matching.
>
> Task:
> 1. Configure Crawl4AI calls (via `lib/crawl4ai/client.ts`) to use its
>    anti-bot detection and retry/escalation options.
> 2. When Crawl4AI reports a page as blocked even after escalation, do not
>    insert an `Entity` row for it; increment a `blocked_pages` counter on
>    `crawl_jobs` (add the column if missing).
> 3. If a meaningful fraction of a crawl job's attempted pages come back
>    blocked (threshold as a named constant, e.g. >50%), set
>    `crawl_jobs.status = 'blocked'` (distinct from `completed`/`failed`) and
>    surface this clearly and distinctly in the Crawler section's Scan
>    Status UI — this must never visually resemble a successful crawl.
>
> Acceptance criteria: a site that blocks automated requests results in
> `blocked_pages > 0` and/or `status = 'blocked'`, visibly flagged in the UI,
> never silently reported as a successful "Complete" scan with fabricated
> content.

## 3.5 Image extraction: srcset/picture-aware, into Entity.imageUrls

**Prompt:**

> Context: Crawl4AI extracts `<img>`, `srcset`, and `<picture>` responsive
> variants natively. Ensure the highest-resolution source is what actually
> lands in `Entity.imageUrls`, and that CDN source is recorded.
>
> Task:
> 1. Ensure the extraction schema/mapping from 3.2 selects the
>    highest-resolution URL available when `srcset` provides multiple sizes,
>    not a low-res placeholder.
> 2. Store the original image URL(s) as-is in `imageUrls` — no re-hosting or
>    downloading in this prompt.
> 3. Add a small hostname-pattern lookup (Cloudinary, Shopify CDN, Bunny,
>    ImageKit, etc.) recording a `metadata.imageSource` label when
>    recognizable — informational only.
>
> Constraints: do not proxy or re-download images through your own
> infrastructure by default — that multiplies storage cost for no benefit
> when the source is already CDN-served.
>
> Acceptance criteria: a page using `srcset` with multiple resolutions yields
> the highest-resolution URL in `imageUrls`; `metadata.imageSource` correctly
> identifies at least Cloudinary and Shopify CDN patterns when present.

---

# PHASE 4 — Platform connectors (structured data, skip crawling entirely)

## 4.1 Platform auto-detection

**Prompt:**

> Context: For Shopify/WooCommerce sites, pulling structured data directly
> beats crawling rendered pages — more reliable, cheaper, supports webhooks.
>
> Task: Create `lib/crawler/platform-detect.ts` with
> `detectPlatform(domain): Promise<'shopify'|'woocommerce'|'unknown'>` —
> check `{domain}/products.json` for Shopify, `{domain}/wp-json/` +
> WooCommerce REST discovery for WooCommerce, fall back to a meta-generator
> tag check, default `unknown`. Store the result on the `websites` row
> (`detected_platform` column, migration as needed). Call this when a website
> is connected, before/alongside triggering a crawl. All requests
> short-timeout (2-3s); any failure resolves to `unknown`, never blocks
> website creation.
>
> Acceptance criteria: correctly identifies a live Shopify store, a live
> WooCommerce store, and returns `unknown` for a generic static site, without
> ever failing website creation.

## 4.2 Shopify connector

**Prompt:**

> Context: Structured, real-time-accurate product data straight from
> Shopify's public `products.json`, mapped into the Entity shape.
>
> Task: Create `lib/connectors/shopify.ts` with
> `ingestShopifyProducts(website): Promise<{count: number}>` — paginate
> `{domain}/products.json`, map each product into `Entity` (title,
> imageUrls, shortDescription, sourceUrl, metadata: {price, currency,
> availability, variants}, entityType: "product", dataType: "shopify"),
> write via the centralized Phase 2.2 path (auto-embeds), upsert on a stable
> key (Shopify product ID + widgetId) to avoid duplicates on re-run. On
> `detected_platform === 'shopify'`, call this instead of the Phase 3 crawl
> for product pages, but still run a light crawl (or LLM extraction) for
> non-product pages (About, FAQ, policies) since `products.json` only covers
> products.
>
> Acceptance criteria: real Shopify store data ingests correctly into
> `Entity` rows that render properly in `IntelligenceResultCard` (Phase 7)
> with zero frontend changes; re-running updates existing rows, no
> duplicates.

## 4.3 WooCommerce connector

**Prompt:**

> Context: Same as 4.2 for WooCommerce, which requires authenticated API
> access.
>
> Task: Create `lib/connectors/woocommerce.ts` with
> `ingestWooCommerceProducts(website, credentials)` using the WooCommerce
> REST API (`/wp-json/wc/v3/products`) with Basic Auth. Store
> consumer key/secret in `widget_secrets` (never client-readable). Add
> `POST /api/websites/[websiteId]/connect-platform` accepting `{platform:
> 'woocommerce', consumerKey, consumerSecret}`, validating credentials with a
> single test request before saving (clear 401-style error if invalid), then
> triggering ingestion. Map to the identical `Entity` shape as the Shopify
> connector.
>
> Acceptance criteria: valid credentials ingest correctly; invalid
> credentials are rejected at save time, never silently stored; the secret
> never appears in any GET response.

## 4.4 Generic feed importer (CSV / JSON / RSS)

**Prompt:**

> Context: For platforms without a dedicated connector but with an available
> product feed (Google Merchant XML, plain CSV/JSON export).
>
> Task: Create `lib/connectors/feed.ts` with `ingestFeed(website, feedUrl)` —
> detect format from Content-Type/content-sniffing, parse each format down to
> a plain array of key/value objects, then run a single shared field-mapping
> function (common name variants: name/title, price/Price, image/image_link,
> availability/stock) into the `Entity` shape. Cap feed size (named
> constant). Add a "Product feed URL" input to the Crawler section's Advanced
> sub-block, wired to a new `POST /api/websites/[websiteId]/import-feed`
> endpoint.
>
> Acceptance criteria: a sample CSV, JSON array, and Google Merchant XML
> feed all produce equivalent `Entity` rows via the same mapping code; an
> oversized feed is rejected cleanly.

## 4.5 Manual CSV/JSON upload fallback

**Prompt:**

> Context: For sites with no feed, no supported platform, and poor markup —
> the last-resort path for full coverage.
>
> Task: Add an "Upload inventory" control to the Crawler section's Advanced
> sub-block, client-side-parsed CSV/JSON, posted to
> `POST /api/websites/[websiteId]/import`, reusing the field-mapping function
> from 4.4 (don't write a second mapper). Insert with `dataType: 'manual'`.
> Cap upload size; report per-row failures clearly (e.g. "12 of 150 rows
> skipped — missing title") rather than silent partial import.
>
> Acceptance criteria: a well-formed upload produces correct `manual`-typed
> `Entity` rows; malformed rows are reported individually, valid rows still
> import.

## 4.6 JSON-LD / connector precedence merge

**Prompt:**

> Context: A site might have both a connector (4.2/4.3) and its own JSON-LD
> markup for the same items — avoid conflicting overwrites.
>
> Task: In the JSON-LD/crawl extraction path, when a matching Entity already
> exists with `dataType` of `shopify`/`woocommerce`/`feed` (matched by
> `sourceUrl` or an external ID in the JSON-LD), only fill in fields that are
> null/missing on the existing row — never overwrite a connector-sourced
> field with a crawled one. Implement as one shared `mergeEntity()` function,
> not inline conditionals duplicated per ingestion path.
>
> Acceptance criteria: a connector-sourced entity missing a rating gets it
> filled from JSON-LD without any connector-sourced field being overwritten.

---

# PHASE 5 — Freshness at scale

## 5.1 Sync schedule (recurring crawl)

**Prompt:**

> Context: Product brief requires configurable recurring sync: weekly,
> daily, 2x/day, 3x/day.
>
> Task: Add `sync_frequency` to `websites` (`weekly`|`daily`|`twice_daily`|
> `three_times_daily`|`off`, default `off`). Add the selector to the
> Crawler section's Sync Schedule sub-block. Create
> `app/api/cron/recrawl/route.ts`: compute due websites from
> `sync_frequency` + last `crawl_jobs` completion, trigger the same
> ingestion function the manual re-crawl button already calls (Crawl4AI for
> crawled sites, the appropriate connector for platform-connected sites), skip
> any site with an already-`pending`/`running` job. Register in the hosting
> platform's cron config on a frequency fine enough to serve the shortest
> interval (e.g. every 4 hours).
>
> Acceptance criteria: "Daily" sites re-crawl roughly every 24h (verified via
> `crawl_jobs` timestamps); "Off" sites are never touched; no duplicate
> concurrent jobs for the same site.

## 5.2 Incremental re-crawl via content hashing

**Prompt:**

> Context: Avoid reprocessing unchanged pages on every scheduled sync.
>
> Task: Use the `content_hash` column from Phase 2.1. Before re-extracting a
> page during a Crawl4AI-driven re-crawl, compute a hash of the fetched raw
> content; if it matches the existing Entity row's `content_hash`, skip
> re-extraction/re-embedding for that page, just update a `lastCheckedAt`
> timestamp (add the column if missing).
>
> Constraints: connectors (4.2/4.3) already have natural change detection via
> upsert-on-ID; this hash-skip applies to the crawl path only.
>
> Acceptance criteria: re-crawling a site with zero changes does zero
> extraction/embedding work for unchanged pages (verify via a
> skipped-vs-processed log counter); changed pages are still fully
> reprocessed.

## 5.3 Webhooks for instant updates (Shopify/WooCommerce)

**Prompt:**

> Context: Scheduled sync still leaves staleness between runs. Both
> platforms support product-change webhooks for near-instant updates.
>
> Task: Add `app/api/webhooks/shopify/route.ts` and
> `app/api/webhooks/woocommerce/route.ts` — verify each platform's
> signature (reject unverified requests with 401, fail closed on any
> verification error), map the single changed product through the shared
> Entity mapping from 4.2/4.3, upsert just that one row. When a
> Shopify/WooCommerce connector is first connected (4.2/4.3), automatically
> register the relevant webhook pointing at these endpoints via that
> platform's API — no manual step for the client.
>
> Acceptance criteria: unsigned/badly-signed requests are rejected with no DB
> change; a valid webhook payload updates the corresponding Entity within
> the same request; connecting a new Shopify store auto-registers its
> webhook.

---

# PHASE 6 — Agent integration (the missing link to Retell/Vapi)

## 6.1 Generic search/lookup functions

**Prompt:**

> Context: Nothing built so far lets the live agent query crawled/connector
> data mid-conversation. This builds that layer, generically.
>
> Task:
> 1. `app/api/widgets/[widgetId]/entities/search/route.ts` — `{query,
>    limit?}`, embeds the query, runs a pgvector similarity search scoped to
>    that widget's `Entity` rows, returns matches in full `Entity` shape.
> 2. `app/api/widgets/[widgetId]/entities/[entityId]/route.ts` — single-entity
>    lookup by ID for confirming live details before quoting them.
> 3. Register both as callable tools on the widget's Retell or Vapi agent
>    when the widget is saved — add this to (or create) the
>    agent-provisioning step; verify `widgetId` is actually present in the
>    function-call webhook payload your platform receives from Retell/Vapi,
>    since these endpoints must scope correctly per widget.
>
> Acceptance criteria: a live test widget's question about something specific
> triggers a real `search_entities` call (verified via logs), not just an
> answer from the static context blob; results are correctly scoped to that
> widget's own data only.

## 6.2 Vertical-agnostic system prompt template

**Prompt:**

> Context: The base system-prompt template used when creating a widget needs
> to instruct correct tool use, generically.
>
> Task: Update the base prompt template(s) to include: use
> `{{website_context}}` for general/overview questions; call
> `search_entities` when the visitor describes something specific or the
> static context doesn't have a confident match; call `get_entity_details`
> to confirm current details before quoting specifics; never state a
> specific price/availability/detail without confirming it via a call in the
> current conversation. Keep this language vertical-neutral — no
> car/clinic/product-specific wording in the base template (per-vertical
> customization, if any, layers on top separately, not by rewriting the
> base).
>
> Acceptance criteria: the same base template works correctly, unmodified,
> for widgets configured for at least two different verticals.

---

# PHASE 7 — Inline rendering (the actual visible payoff)

## 7.1 Wire IntelligenceResultCard to live search results

**Prompt:**

> Context: This is the piece that makes "ask about something, see it inline"
> real, replacing the Ottawa/Seny-style full-page-redirect pattern with an
> in-chat card.
>
> Task:
> 1. In the transcript/chat component, when `search_entities` or
>    `get_entity_details` resolves during a live conversation, render the
>    result(s) as `IntelligenceResultCard` inline in the transcript, right
>    after the agent's message referencing them.
> 2. The card renders from universal `Entity` fields (`title`,
>    `imageUrls[0]`, `shortDescription`) plus a generic details list built
>    from whatever `metadata` keys exist, using a label-mapping dictionary
>    (`durationMinutes` → "Duration", `mileage` → "Mileage") rather than
>    hardcoded per-field JSX.
> 3. Add a "View full details" link using `sourceUrl` when present, opening
>    in a new tab — never navigating the current tab away from the widget.
> 4. Handle empty `imageUrls` gracefully — clean text-only card, no broken
>    image icon, no layout shift.
>
> Constraints: no vertical-specific rendering branches; no full-page
> navigation anywhere in this flow.
>
> Acceptance criteria: asking a live widget about something specific
> produces an inline card with a real image and no navigation, tested against
> at least two verticals through the same component; entities without images
> render cleanly; "View full details" opens in a new tab without disrupting
> the conversation.

---

# PHASE 9 — Agent-initiated navigation (Ottawa/Seny-style, as a secondary capability)

This phase is deliberately separate from Phase 7. Phase 7's inline card is
the default, always-on experience. This phase adds full-page navigation as an
*optional*, per-widget, agent-triggered capability on top of it — for cases
where a client wants visitors sent to a real page (a financing calculator, a
"reserve this" button, more images than the card shows), not as a replacement
for the card.

## 9.1 Per-widget "Allow navigation" toggle

**Prompt:**

> Context: Agent-initiated navigation should never be on by default — it's a
> real UX decision (interrupting/redirecting a visitor's browser) that each
> client should opt into, not something the platform silently enables.
>
> Task: Add an `allowAgentNavigation` boolean to the widget config
> (`behavior` section of `VoiceWidgetConfig`), default `false`. Add a toggle
> for it in the Behavior customizer section, clearly labeled (e.g. "Let the
> agent open pages on your site during a conversation"), with a short
> explanation that this is optional and off by default.
>
> Acceptance criteria: a widget with this off never navigates regardless of
> what the agent does; a widget with it on can use the functions built in
> 9.2–9.4.

## 9.2 Session-scoped realtime channel

**Prompt:**

> Context: When a Retell/Vapi function call happens mid-conversation, it hits
> your backend as a webhook — it never touches the visitor's actual browser
> tab. To make the agent's decision to navigate actually move the browser,
> the backend needs a way to push an event to that specific browser session
> in real time. Since the project is already on Supabase, Supabase Realtime
> is the natural fit over polling.
>
> Task:
> 1. When a voice call or chat session starts (`POST
>    /api/widgets/create-call` or the chat equivalent), generate/reuse a
>    `sessionId` and have the widget frontend subscribe to a Supabase
>    Realtime channel scoped to that `sessionId` (e.g. channel name
>    `widget-session:{sessionId}`) for the duration of the conversation.
> 2. Ensure this subscription is torn down cleanly when the call/chat ends or
>    the widget closes — no lingering open channels.
>
> Constraints: this channel is purely for navigation/UI-action events (this
> phase's purpose) — do not repurpose it for chat message delivery, which
> already has its own path.
>
> Acceptance criteria: a test message broadcast on a session's channel from
> the backend is received by that session's widget frontend in real time,
> and the subscription cleans up when the session ends.

## 9.3 `navigate_to_entity` function

**Prompt:**

> Context: The actual agent-callable function that triggers navigation,
> gated by the Phase 9.1 toggle and using the Phase 9.2 channel.
>
> Task:
> 1. Add a `navigate_to_entity` function to the same tool registration step
>    from Phase 6.1, registered on a widget's agent **only when
>    `allowAgentNavigation` is true** for that widget — do not register it
>    otherwise, so the agent literally cannot call a tool that doesn't exist
>    for widgets that haven't opted in.
> 2. The function handler: looks up the `Entity` by ID, requires
>    `sourceUrl` to be present (if an entity has no `sourceUrl`, return an
>    error result telling the agent to fall back to describing the item via
>    the card instead — never navigate to a URL that doesn't exist), appends
>    a `?widget_resume={sessionId}` query param to `sourceUrl`, and
>    broadcasts a `{type: 'navigate', url: <that url>}` event on the
>    session's Phase 9.2 channel. Returns a short confirmation string to the
>    LLM (e.g. "Navigated to the listing.") so it can self-narrate
>    ("I've opened that for you — you should see it on your screen now"),
>    matching the transparency pattern observed in the live Seny testing.
> 3. Update the base system-prompt template (extending Phase 6.2, still
>    vertical-neutral) with guidance: prefer showing the inline card by
>    default; only call `navigate_to_entity` when the visitor explicitly asks
>    to see the full page/listing, or when the card's info genuinely isn't
>    enough (e.g. a request for more photos than the card shows) — mirror the
>    "ask before navigating when the intent is ambiguous, don't ask when it's
>    explicit" behavior difference observed between the two live Seny
>    instances tested this session.
>
> Constraints: this function must never be the default path for "show me X"
> — Phase 7's inline card remains that default; this is only for an explicit
> or card-insufficient request, and only on widgets that opted in via 9.1.
>
> Acceptance criteria: on a widget with navigation enabled, an explicit
> "take me to the full listing" request triggers a real navigate event
> received by the frontend; on a widget with navigation disabled, the same
> request never triggers navigation because the tool isn't registered at
> all; an entity with no `sourceUrl` never produces a broken navigation
> attempt.

## 9.4 Frontend: postMessage bridge + resume-on-navigate

**Prompt:**

> Context: The widget itself lives in an iframe (per `widget.js`'s embed
> architecture) — it cannot navigate the host page directly. The iframe needs
> to ask the parent page to do it, and the conversation needs to survive the
> navigation.
>
> Task:
> 1. In the widget's iframe-side code, listen for the Phase 9.2 realtime
>    `navigate` event and, on receipt, `postMessage` a `{type:
>    'voice-agent-navigate', url}` message to the parent window.
> 2. In `public/widget.js` (the loader running in the host page, not the
>    iframe), listen for that `postMessage` and perform
>    `window.location.href = url` on the host page — this is the only place
>    an actual top-level navigation happens.
> 3. On the widget's initial load, check for a `widget_resume` query param
>    (set by 9.3) in the current URL. If present, use it to resume the same
>    `sessionId`'s conversation state/transcript rather than starting fresh —
>    this directly fixes the weakness observed live in the Ottawa/Seny
>    widgets, where closing/reopening after a navigation lost the
>    conversation entirely despite a resume token being present in the URL.
>    Resumption should restore the visible transcript, not just the backend
>    session.
>
> Constraints: only `widget.js` (parent-page context) ever sets
> `window.location` — the iframe must never attempt this directly, since it
> can't and shouldn't try to escape its frame.
>
> Acceptance criteria: triggering 9.3 on a real embedded widget actually
> navigates the host page's browser tab; after navigating, the widget
> reloads with the prior conversation's transcript visible, not a blank
> state — a real improvement over the Ottawa/Seny behavior observed live,
> where reopening after navigation lost history entirely.

---

# PHASE 8 — Visibility and ops

## 8.1 Data viewer: source, category, and blocked-page visibility

**Prompt:**

> Context: With multiple ingestion sources and nested category data now
> existing, the raw "View Data" viewer needs to show this.
>
> Task: In the component rendering `GET /api/websites/[websiteId]/data`, add
> a `dataType` badge per row with a filter dropdown, show `categoryPath` as a
> breadcrumb label when present, and show a `blocked_pages` warning banner at
> the top when the most recent crawl job had any.
>
> Acceptance criteria: source type is visible and filterable per row;
> category breadcrumbs show when present; a crawl job with blocked pages
> shows a clear warning in the viewer, not just buried in Scan Status.

---

## Suggested execution order

0.1 → 1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 3.4 → 3.5 → (3.3 optional, anytime
after 3.2) → 4.1 → 4.2 → 4.3 → 4.4 → 4.5 → 4.6 → 5.1 → 5.2 → 5.3 → 6.1 → 6.2
→ 7.1 → 8.1 → (9.1 → 9.2 → 9.3 → 9.4, optional, only if agent-initiated
navigation is wanted alongside the inline card).

Nothing in Phase 6–7 (the actual agent-facing payoff) is meaningful until
Phases 2–4 exist and produce real Entity rows with images. Don't let
Antigravity jump ahead to 6–7 before the data foundation is real. Phase 9 is
additive and optional — Phase 7's inline card is a complete, working
experience on its own without it.