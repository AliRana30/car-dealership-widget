# Front Desk — AI Voice and Website Intelligence Platform

Front Desk is an enterprise AI voice and chat widget platform featuring autonomous website knowledge extraction, multi-provider real-time telephony, and multi-channel platform connectors. Built with Next.js 16, PostgreSQL (pgvector), Crawl4AI, Retell AI, and Vapi AI.

---

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Phased Implementation Roadmap](#phased-implementation-roadmap)
   - [Phase 0 — Headless Crawler Infrastructure](#phase-0--headless-crawler-infrastructure)
   - [Phase 1 — Customizer UI and Deployment](#phase-1--customizer-ui-and-deployment)
   - [Phase 2 — Knowledge Schema and Vector Embeddings](#phase-2--knowledge-schema-and-vector-embeddings)
   - [Phase 3 — Ingestion Engine and Anti-Bot Detection](#phase-3--ingestion-engine-and-anti-bot-detection)
   - [Phase 4 — Platform Connectors and Precedence Merging](#phase-4--platform-connectors-and-precedence-merging)
   - [Phase 5 — Synchronization, Hashing, and Webhooks](#phase-5--synchronization-hashing-and-webhooks)
3. [Database Schema](#database-schema)
4. [API Reference](#api-reference)
5. [Platform Connectors and Webhook Specifications](#platform-connectors-and-webhook-specifications)
6. [Security, Cryptography, and Verification](#security-cryptography-and-verification)
7. [Environment Configuration](#environment-configuration)
8. [Local Development and Testing](#local-development-and-testing)

---

## System Architecture

```
                               Client Website
                +------------------------------------------+
                | <script src="/widget.js"                 |
                |         data-widget-id="UUID">           |
                +--------------------+---------------------+
                                     |
                                     v
                       Widget Bridge (public/widget.js)
                +--------------------+---------------------+
                | Secure Iframe Lifecycle & PostMessage    |
                +--------------------+---------------------+
                                     |
                                     v
                          Embed Route (/embed/[id])
                +--------------------+---------------------+
                | React Customizer Context & Audio Pipeline|
                | Voice (Retell/Vapi) <-> Chat (Stream)    |
                +--------------------+---------------------+
                                     |
      +------------------------------+------------------------------+
      |                                                             |
      v                                                             v
Supabase PostgreSQL                                     Intelligence Ingestion Engine
- widget_configurations                                 +--------------------------------+
- websites & widget_secrets                             | Crawl4AI Docker (AsyncUrlSeeder|
- website_data (pgvector 1536-dim)                      |   + Anti-Bot/WAF Escalation)   |
- crawl_jobs                                            | Connectors (Shopify/Woo/Feeds) |
                                                        | Webhooks (HMAC SHA-256)        |
                                                        +--------------------------------+
```

---

## Phased Implementation Roadmap

### Phase 0 — Headless Crawler Infrastructure
- **Phase 0.1**: Deployed Crawl4AI as an independent headless microservice (`docker-compose.yml`) exposing REST endpoints for URL seeding (`/seed`) and batch browser crawling (`/crawl`). Created strongly-typed TypeScript client wrapper (`src/lib/crawl4ai/client.ts`).

### Phase 1 — Customizer UI and Deployment
- **Phase 1.1**: Integrated the Crawler Management block directly into the customizer sidebar (`src/components/widget-customizer/CrawlerSection.tsx`), providing unified control over domains, platforms, scan depths, and automated synchronization.
- **Phase 1.2**: Resolved server-side hydration mismatches in the visual embed snippet and fixed CSS layout boundaries.

### Phase 2 — Knowledge Schema and Vector Embeddings
- **Phase 2.1**: Defined a unified, domain-agnostic `Entity` schema (`src/lib/crawler/types.ts`) supporting products, services, FAQs, and general documentation without rigid UI coupling.
- **Phase 2.2**: Executed Supabase `pgvector` migration creating 1536-dimensional vector columns and HNSW cosine distance indexes. Built automated batch embedding pipeline (`src/lib/embeddings.ts`) with idempotent backfill tooling (`scripts/backfill-embeddings.ts`).

### Phase 3 — Ingestion Engine and Anti-Bot Detection
- **Phase 3.1**: Implemented `AsyncUrlSeeder` with Quick Scan (15-page limit) and Master Scan (150-page limit) modes.
- **Phase 3.2**: Configured structured `LLMExtractionStrategy` to pull clean entity metadata, short descriptions, and schema attributes.
- **Phase 3.3**: Created fast-path `JsonCssExtractionStrategy` bypassing LLM execution when custom CSS selectors are defined.
- **Phase 3.4**: Added multi-tier anti-bot and WAF challenge detection. Blocked pages are counted and excluded from database insertion; crawl jobs exceeding 50% block rates are assigned `blocked` status.
- **Phase 3.5**: Implemented responsive image resolution (`srcset` and `<picture>` parsing) to select maximum resolution assets (`2048w`) and detect CDN origins.

### Phase 4 — Platform Connectors and Precedence Merging
- **Phase 4.1**: Created passive platform auto-detection (`src/lib/crawler/platform-detect.ts`) identifying Shopify, WooCommerce, and generic static sites via fast HTTP probes.
- **Phase 4.2**: Built native Shopify connector (`src/lib/connectors/shopify.ts`) pulling structured data directly from public `/products.json`.
- **Phase 4.3**: Built authenticated WooCommerce connector (`src/lib/connectors/woocommerce.ts`) using AES-256-GCM encrypted credentials and lightweight live connection testing.
- **Phase 4.4**: Created universal feed importer (`src/lib/connectors/feed.ts`) parsing CSV, JSON, RSS, and Google Merchant XML.
- **Phase 4.5**: Built manual CSV and JSON file upload fallback with per-row validation and rejection reporting.
- **Phase 4.6**: Implemented precedence merging (`src/lib/crawler/merge.ts`) to prevent web crawler extractions from overwriting authoritative connector-sourced records.

### Phase 5 — Synchronization, Hashing, and Webhooks
- **Phase 5.1**: Implemented configurable recurring sync intervals (`weekly`, `daily`, `twice_daily`, `three_times_daily`, `off`) with an automated cron Route Handler (`/api/cron/recrawl`), concurrency protection, and `vercel.json` scheduler.
- **Phase 5.2**: Added incremental crawl optimization using SHA-256 content hashing (`computeContentHash`). Unchanged pages skip LLM extraction and re-embedding, updating only `last_checked_at`.
- **Phase 5.3**: Built real-time webhook endpoints (`/api/webhooks/shopify` and `/api/webhooks/woocommerce`) with HMAC-SHA256 verification and automatic webhook registration during platform connection.

---

## Database Schema

```sql
-- Core websites table
CREATE TABLE websites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id),
    name TEXT NOT NULL,
    allowed_domains TEXT[] NOT NULL DEFAULT '{}',
    css_selector_schema JSONB,
    detected_platform TEXT DEFAULT 'unknown' CHECK (detected_platform IN ('shopify', 'woocommerce', 'unknown')),
    sync_frequency TEXT DEFAULT 'off' NOT NULL CHECK (sync_frequency IN ('off', 'weekly', 'daily', 'twice_daily', 'three_times_daily')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Encrypted connector credentials
CREATE TABLE widget_secrets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    secret_type TEXT NOT NULL,
    consumer_key TEXT NOT NULL,
    consumer_secret TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Centralized entity storage with pgvector embeddings
CREATE TABLE website_data (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    widget_id UUID NOT NULL REFERENCES widgets(id) ON DELETE CASCADE,
    source_url TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    entity_type TEXT NOT NULL DEFAULT 'text',
    metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
    short_description TEXT,
    image_urls JSONB NOT NULL DEFAULT '[]'::jsonb,
    data_type TEXT NOT NULL DEFAULT 'crawl',
    category_path TEXT[] DEFAULT '{}'::text[],
    content_hash TEXT,
    last_checked_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    embedding vector(1536),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Background crawl execution logs
CREATE TABLE crawl_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    website_id UUID NOT NULL REFERENCES websites(id) ON DELETE CASCADE,
    start_url TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'blocked')),
    scan_mode TEXT DEFAULT 'master',
    pages_visited INTEGER DEFAULT 0,
    entities_found INTEGER DEFAULT 0,
    blocked_pages INTEGER DEFAULT 0 NOT NULL,
    error_message TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE
);
```

---

## API Reference

### Website Management
- `GET /api/websites`: Lists all connected websites for the authenticated user.
- `POST /api/websites`: Connects a new domain, triggers platform auto-detection, and provisions default crawler records.
- `PUT /api/websites/[websiteId]`: Updates website metadata, CSS extraction schemas, detected platform, or sync frequency.
- `DELETE /api/websites/[websiteId]`: Removes a connected website and cascading intelligence records.

### Ingestion and Connectors
- `POST /api/websites/[websiteId]/crawl`: Dispatches a background crawl job (`quick` or `master` mode).
- `POST /api/websites/[websiteId]/connect-platform`: Verifies WooCommerce credentials via live probe, encrypts keys, and provisions product webhooks.
- `POST /api/websites/[websiteId]/import-feed`: Fetches and normalizes remote product feeds (CSV, JSON, RSS, XML).
- `POST /api/websites/[websiteId]/upload-inventory`: Processes multipart CSV or JSON inventory uploads with row validation.

### Automation and Webhooks
- `GET / POST /api/cron/recrawl`: Evaluates scheduled websites, skips active jobs, and executes due syncs.
- `POST /api/webhooks/shopify`: Receives and verifies Shopify product lifecycle events (`X-Shopify-Hmac-Sha256`).
- `POST /api/webhooks/woocommerce`: Receives and verifies WooCommerce product events (`X-WC-Webhook-Signature`).

---

## Platform Connectors and Webhook Specifications

### Shopify Webhooks
- **Header**: `X-Shopify-Hmac-Sha256`
- **Algorithm**: `HMAC-SHA256(raw_request_body, SHOPIFY_WEBHOOK_SECRET)` encoded as Base64.
- **Topics**: `products/create`, `products/update`, `products/delete`.
- **Payload Handling**: Single-entity update mapped to `Entity` shape with vector re-embedding.

### WooCommerce Webhooks
- **Header**: `X-WC-Webhook-Signature`
- **Algorithm**: `HMAC-SHA256(raw_request_body, consumer_secret)` encoded as Base64.
- **Topics**: `product.created`, `product.updated`, `product.deleted`.
- **Auto-Registration**: Automatically registered at `/wp-json/wc/v3/webhooks` upon platform connection.

---

## Security, Cryptography, and Verification

- **Credential Encryption**: All consumer keys and secrets stored in `widget_secrets` are encrypted at rest using AES-256-GCM (`src/lib/encryption.ts`).
- **Fail-Closed Webhook Verification**: Unsigned or invalid webhook payloads are rejected immediately with HTTP 401 Unauthorized without database access.
- **Timing Safe Comparisons**: Signatures are evaluated using `crypto.timingSafeEqual` to eliminate timing side-channel attacks.
- **Anti-Bot Isolation**: WAF challenges and block pages are prevented from entering the vector database.

---

## Environment Configuration

Create a `.env.local` file with the following variables:

```ini
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Vector Embeddings
OPENAI_API_KEY=sk-...
# or GROQ_API_KEY=gsk-...

# Crawl4AI Microservice
CRAWL4AI_BASE_URL=http://localhost:11235
CRAWL4AI_API_KEY=

# Cryptography and Webhooks
ENCRYPTION_KEY=your-32-byte-hex-encryption-key
SHOPIFY_WEBHOOK_SECRET=your-shopify-secret
CRON_SECRET=your-cron-secret
```

---

## Local Development and Testing

```bash
# Install dependencies
npm install

# Start Crawl4AI microservice
docker-compose up -d

# Run local development server
npm run dev

# Run TypeScript compilation check
npx tsc --noEmit

# Run automated test suites
npx tsx scratch/test-all-phases-0-to-4.ts
npx tsx scratch/test-sync-schedule.ts
npx tsx scratch/test-content-hashing.ts
npx tsx scratch/test-webhooks.ts
```
