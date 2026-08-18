# Front Desk — AI Voice Agent Platform

> A production-ready, white-label AI voice & chat widget platform with multi-provider support, visual customization, and real-time Website Intelligence. Built with **Next.js 16**, **Supabase**, **Retell AI**, and **Vapi AI**.

---

## Table of Contents

1. [Overview](#overview)
2. [Features](#features)
3. [Architecture](#architecture)
4. [Pages & Routes](#pages--routes)
5. [API Reference](#api-reference)
6. [Configuration System](#configuration-system)
7. [Website Intelligence Pipeline](#website-intelligence-pipeline)
8. [E-Commerce / Product AI Agent](#e-commerce--product-ai-agent)
9. [Widget Embedding (Client Integration)](#widget-embedding-client-integration)
10. [Voice & Chat Modes](#voice--chat-modes)
11. [Visual Customizer](#visual-customizer)
12. [Database Schema](#database-schema)
13. [Environment Variables](#environment-variables)
14. [Local Development](#local-development)
15. [Deployment](#deployment)

---

## Overview

**Front Desk** is an embeddable AI voice/chat widget engine. Businesses connect their website URL and instantly get an AI agent that knows their products, services, pricing, and content — ready to assist customers via voice or text, embedded anywhere with a single `<script>` tag.

Key capabilities:
- 🎙️ **Voice calls** via Retell AI or Vapi AI (WebRTC)
- 💬 **Text chat** with streaming AI responses
- 🧠 **Website Intelligence** — crawls any website and teaches the AI its content
- 🛍️ **E-commerce mode** — shows product cards with images, prices, ratings
- 🎨 **Visual Customizer** — live-preview no-code widget configuration
- 🏷️ **White-label ready** — fully brandable per-client

---

## Features

### Core Widget
| Feature | Details |
|---|---|
| **Dual Provider Support** | Retell AI (server-side token) + Vapi AI (client-safe public key) |
| **Voice Mode** | Real-time WebRTC calls with speaking indicators, mute, duration timer |
| **Text Chat Mode** | Streaming chat with AI, chat history, typing indicator |
| **Tab Switching** | Voice ↔ Text tabs with configurable default |
| **Transcript Display** | Live voice transcript with partial speech shown in real time |
| **Intelligence Cards** | Inline product/service cards injected into chat and transcript |
| **Floating / Inline** | Floating launcher (bottom corner) or fully inline mode |
| **Rate Limiting** | Server-side IP rate limiting on call creation (15 req/min) |
| **Telemetry** | Optional call-start/end/error event logging |

### Website Intelligence
| Feature | Details |
|---|---|
| **Automatic Crawl** | Connect any URL; background crawler extracts text, products, metadata |
| **JSON-LD Parsing** | Extracts structured product data: name, price, rating, images, availability |
| **Real-Time Context** | Crawled content injected into agent's `{{website_context}}` on every call |
| **Dynamic Search API** | `GET /api/widgets/[id]/search?query=...` for live product lookups |
| **Voice Card Enrichment** | Transcript messages auto-searched; product cards shown during live calls |
| **Re-crawl Trigger** | One-click re-crawl from the customizer when site content changes |
| **Crawl Status Monitor** | Live polling of crawl status: pending → running → completed / failed |

### Visual Customizer (`/widget-customizer`)
| Section | Controls |
|---|---|
| **Identity / Deploy** | Widget name, ID slug, AI provider, Agent ID, API key |
| **Branding** | Business name, tagline, welcome message, avatar, logo |
| **Colors / Theme** | Primary, background, text, bubble colors with `@jaames/iro` color picker |
| **Typography** | Font family, sizes (sm/md/lg/xl), line height, font weights |
| **Launcher** | Button shape (icon/pill/label), size, corner position, z-index |
| **Panel** | Width, max-height, border radius, shadow, positioning |
| **Behavior** | Default tab, telemetry on/off, allowed domains, installation type |
| **Responsive** | Fullscreen on mobile toggle |

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Client Website                               │
│  <script src="https://your-domain.com/widget.js"                    │
│          data-widget-id="my-widget">                                │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ Loads widget.js
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    Widget Loader (public/widget.js)                 │
│   Reads data-widget-id → creates <iframe src="/embed/[id]">         │
│   Bridges postMessage: open/close/config-update                     │
└───────────────────────┬─────────────────────────────────────────────┘
                        │ Iframe loads
                        ▼
┌─────────────────────────────────────────────────────────────────────┐
│              /embed/[widgetId]  (Next.js page)                      │
│   Fetches widget config → renders <VoiceAgentWidget config={...} /> │
└───────────────────────┬─────────────────────────────────────────────┘
                        │
          ┌─────────────┼──────────────┐
          ▼             ▼              ▼
   Voice Call        Text Chat      Search
   POST /api/        POST /api/     GET /api/
   widgets/          retell/chat    widgets/
   create-call                      [id]/search
          │             │              │
          ▼             ▼              ▼
   Retell / Vapi    Supabase DB    Supabase DB
   WebRTC Session   (chat_msgs)    (website_data)
```

### Data Flow: Website Intelligence
```
User connects URL
      │
      ▼
POST /api/websites          ← Creates website record
      │
      ▼ (background, non-blocking)
crawlWebsite(url)           ← Fetches pages, parses HTML
      │
      ├── JSON-LD extraction  → price, rating, images, availability
      ├── Open Graph tags     → title, description, image
      ├── Meta tags           → description, keywords
      └── Body text           → raw content (max 3,000 chars)
      │
      ▼
INSERT website_data rows    ← Stored in Supabase per page
      │
      ▼
On Voice Call Start:
  getWebsiteContextSummary() → joined text → injected as {{website_context}}

On Each Voice/Chat Turn:
  getRelevantWebsiteRecords() → top 3 matching records → IntelligenceResultCard UI
```

---

## Pages & Routes

### App Pages

| Route | Description |
|---|---|
| `/` | **Widget Fleet Dashboard** — lists all widgets, their status, and quick-actions |
| `/widget-customizer?id=[slug]` | **Visual Customizer** — full no-code editor with live preview panel |
| `/embed/[widgetId]` | **Iframe Embed Route** — renders the widget for embedding in iframes |

### API Routes

| Method | Route | Description |
|---|---|---|
| `GET` | `/api/widgets` | List all widgets |
| `POST` | `/api/widgets` | Create or update a widget configuration |
| `GET` | `/api/widgets/[id]` | Get single widget (public-safe, no secrets) |
| `POST` | `/api/widgets/create-call` | Create Retell/Vapi call session, injects `website_context` |
| `GET` | `/api/widgets/[id]/search` | Search website intelligence records for a query |
| `POST` | `/api/retell/chat` | Send a text chat message; returns AI reply + intelligence results |
| `POST` | `/api/retell/log` | Log telemetry events (call_start, call_end, call_error) |
| `GET` | `/api/websites` | List all connected websites |
| `POST` | `/api/websites` | Create a website & trigger background crawl |
| `PUT` | `/api/websites/[websiteId]` | Update website name or domain |
| `DELETE` | `/api/websites/[websiteId]` | Delete a website record |
| `GET` | `/api/websites/[websiteId]/crawl` | Get latest crawl job status |
| `POST` | `/api/websites/[websiteId]/crawl` | Trigger a new crawl job |
| `GET` | `/api/websites/[websiteId]/data` | Raw JSON of all indexed website_data rows |

---

## API Reference

### `POST /api/widgets/create-call`
Creates a voice call session and injects the website context into the agent.

**Request body:**
```json
{
  "widgetId": "my-widget",
  "metadata": {},
  "retell_llm_dynamic_variables": {
    "user_name": "John"
  }
}
```

**Response:**
```json
{
  "accessToken": "...",
  "callId": "call_xxx",
  "sessionId": "uuid"
}
```

The server automatically appends `website_context` to `retell_llm_dynamic_variables`. No client-side secret exposure.

---

### `POST /api/retell/chat`
Send a text chat message. Returns the AI's response with optional intelligence result cards.

**Request body:**
```json
{
  "chatId": "optional-existing-chat-id",
  "content": "What are your Nike joggers?",
  "widgetId": "my-widget"
}
```

**Response:**
```json
{
  "chatId": "chat_xxx",
  "messages": [
    {
      "role": "agent",
      "content": "We have the Nike Air Jogger for $89...",
      "results": [
        {
          "title": "Nike Air Jogger",
          "description": "Lightweight running shoe...",
          "price": 89,
          "currency": "USD",
          "rating": 4.7,
          "reviews": 312,
          "images": ["https://..."],
          "availability": "In Stock",
          "sourceUrl": "https://store.com/products/air-jogger"
        }
      ]
    }
  ]
}
```

---

### `GET /api/widgets/[widgetId]/search?query=nike+joggers`
Returns top matching website intelligence records for the query.

**Response:** Array of `WebsiteDataResult` objects (same shape as `results` above).

---

### `POST /api/websites`
Creates a website record and triggers the background crawler.

**Request body:**
```json
{
  "name": "My Shoe Store",
  "domain": "https://myshoestore.com",
  "triggerCrawl": true
}
```

**Response:**
```json
{
  "website": { "id": "uuid", "name": "My Shoe Store", "allowed_domains": ["myshoestore.com"] },
  "crawlJobId": "job_uuid",
  "message": "Website created. Crawl job started..."
}
```

---

## Configuration System

All widget visual and behavioral settings are managed via `src/config/voiceWidget/`:

### Files
| File | Purpose |
|---|---|
| `types.ts` | TypeScript interfaces for the complete `VoiceWidgetConfig` |
| `default.ts` | Full default config with all tokens; `deepMerge()` utility |
| `clients/` | Per-client preset files (e.g. `darkSaaS.ts`, `clinicA.ts`) |

### Config Structure
```typescript
VoiceWidgetConfig {
  mode: 'floating' | 'inline'
  provider: { provider, agentId, retellApiKey | vapiPublicKey }
  branding: { businessName, tagline, welcomeMessage, agentName, avatarUrl, logoUrl, ... }
  theme: { primaryColor, backgroundColor, textColor, bubbleColor, ... }
  typography: { fontFamily, fontSizeSm/Md/Lg/Xl, lineHeight, fontWeightBody/Heading }
  launcher: { variant, size, position, offsetX/Y, zIndex }
  panel: { width, maxHeight, borderRadius, shadow, position }
  behavior: { defaultTab, telemetryEnabled, installationType, allowedDomains }
  responsive: { fullscreenOnMobile }
  call: { ... }
  chat: { ... }
}
```

### How Config Merges
```
defaultVoiceWidgetConfig
    ↓ deepMerge
clientConfig (from DB or static presets)
    ↓ deepMerge
overrides (page-level runtime overrides)
    =
mergedConfig (passed to VoiceAgentWidget)
```

All CSS is derived from config and injected as CSS custom properties (`--voice-widget-primary`, etc.) so children never need inline styles that break inheritance.

---

## Website Intelligence Pipeline

### How it Works
1. **Connect** — Enter a URL in the Widget Customizer Deploy panel → `POST /api/websites`
2. **Crawl** — Background job fetches up to 20 pages with redirects, extracts:
   - JSON-LD structured data (products, articles, organizations)
   - Open Graph meta tags
   - Body text (cleaned, deduped)
   - Images from `<img>` and JSON-LD
3. **Index** — Each page saved as a `website_data` row with `metadata` JSONB
4. **Inject** — On call start, `getWebsiteContextSummary()` builds a text blob injected as `{{website_context}}` into the agent's dynamic variables
5. **Search** — Each user message/turn triggers `GET /api/widgets/[id]/search` for matching records → displays rich UI cards

### Crawl Status Monitoring
The customizer polls `GET /api/websites/[id]/crawl` every 4 seconds and shows:
- 🟡 **Pending** — job queued
- 🔵 **Running** — actively crawling with spinner
- ✅ **Completed** — pages analyzed + knowledge records count
- 🔴 **Failed** — error with re-crawl option

### Re-crawl / Edit
- **Re-crawl** button triggers a new crawl job for updated content
- **Edit name** pencil icon allows inline renaming via `PUT /api/websites/[id]`
- **Disconnect** button clears the website association
- **View Data** button opens raw JSON of all indexed records

---

## E-Commerce / Product AI Agent

The system prompt in `prompt.md` defines a **Shoe Retail E-Commerce Assistant** persona that:

1. **Uses `{{website_context}}`** — all product names, prices, ratings, and availability come from the live crawled data, never from model knowledge
2. **Answers product queries** — "Do you have Nike joggers?" → searches context, responds with price + rating
3. **Recommends top products** — "What are your best shoes?" → finds highest-rated items from reviews and sales data
4. **Stays within inventory** — if a product isn't in the crawled context, politely says so and offers alternatives
5. **Shows visual cards** — alongside voice/text response, the UI injects `IntelligenceResultCard` components showing:
   - Product image gallery (with thumbnail strip)
   - Price badge
   - Star rating + review count
   - Availability badge (In Stock / Limited / Out of Stock)
   - Product attributes (size, color, material)
   - Source URL link

### Customizing the Agent
To adapt for a different vertical (clinic, car dealer, SaaS), edit `prompt.md`. The `{{website_context}}` and `{{business_name}}` variables are injected at runtime from the widget config and crawled data.

---

## Widget Embedding (Client Integration)

After saving a widget in the customizer, copy the embed snippet from the **Deploy** tab:

### JavaScript / HTML
```html
<!-- Voice Agent Widget -->
<script
  src="https://your-domain.com/widget.js"
  data-widget-id="your-widget-id"
  defer
></script>
```
Paste before `</body>`. The floating launcher appears automatically.

### React
```jsx
import { useEffect } from 'react';

export default function VoiceWidget() {
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://your-domain.com/widget.js';
    script.setAttribute('data-widget-id', 'your-widget-id');
    script.defer = true;
    document.body.appendChild(script);
    return () => {
      document.body.removeChild(script);
      document.getElementById('voice-agent-widget-container')?.remove();
    };
  }, []);
  return null;
}
```

### Next.js
```jsx
import Script from 'next/script';

export default function VoiceWidget() {
  return (
    <Script
      src="https://your-domain.com/widget.js"
      data-widget-id="your-widget-id"
      strategy="lazyOnload"
    />
  );
}
```

### Vue
```vue
<script>
export default {
  mounted() {
    this.script = document.createElement('script');
    this.script.src = 'https://your-domain.com/widget.js';
    this.script.setAttribute('data-widget-id', 'your-widget-id');
    document.body.appendChild(this.script);
  },
  beforeUnmount() {
    document.body.removeChild(this.script);
    document.getElementById('voice-agent-widget-container')?.remove();
  }
}
</script>
```

### Angular
```typescript
import { Component, OnInit, OnDestroy } from '@angular/core';
@Component({ selector: 'app-voice-widget', template: '' })
export class VoiceWidgetComponent implements OnInit, OnDestroy {
  private script: HTMLScriptElement | null = null;
  ngOnInit() {
    this.script = document.createElement('script');
    this.script.src = 'https://your-domain.com/widget.js';
    this.script.setAttribute('data-widget-id', 'your-widget-id');
    document.body.appendChild(this.script);
  }
  ngOnDestroy() {
    document.body.removeChild(this.script!);
    document.getElementById('voice-agent-widget-container')?.remove();
  }
}
```

### WordPress Plugin
```php
<?php
function enqueue_voice_widget() {
    wp_enqueue_script('front-desk-voice-widget', 'https://your-domain.com/widget.js', [], '1.0', true);
    wp_script_add_data('front-desk-voice-widget', 'data-widget-id', 'your-widget-id');
}
add_action('wp_enqueue_scripts', 'enqueue_voice_widget');
```

### iframe (Inline)
```html
<iframe
  src="https://your-domain.com/embed/your-widget-id"
  width="100%"
  height="600px"
  style="border:none;border-radius:12px;"
  allow="microphone"
></iframe>
```
> ⚠️ The `allow="microphone"` attribute is **required** for voice calls inside iframes.

---

## Voice & Chat Modes

### Voice Mode
- **Start Call** → `POST /api/widgets/create-call` → returns `accessToken` + `callId`
- Retell: `RetellWebClient.startCall({ accessToken })`
- Vapi: `vapi.start(assistantId, { publicKey })`
- Live events:
  - `agent_start_talking` / `agent_stop_talking` — speaking indicator animations
  - `user_start_talking` / `user_stop_talking` — user activity indicator
  - `update` — live transcript partial updates
  - `call_ended` — automatic state reset
- **Mute** toggle disables microphone without ending the call
- **Duration timer** counts seconds from connection
- **Voice Transcript** — shown in the Voice tab; intelligence cards injected per-message when matching products are found

### Text Chat Mode
- Sends messages to `POST /api/retell/chat`
- Returns `messages[]` array including `results[]` for product cards
- Typing indicator shown during AI response
- Chat history persisted in component state across turns (session-scoped)
- Supports `chatId` for multi-turn context continuity

---

## Visual Customizer

Access at `/widget-customizer?id=[widget-slug]`.

### Three-Panel Layout
```
┌───────────────┬───────────────────────────────┬────────────────────┐
│  Nav Sidebar  │      Live Preview Center       │  Property Editor   │
│               │                                │                    │
│  • Identity   │  ┌────────────────────────┐   │  [Color Picker]    │
│  • Branding   │  │   Widget Preview        │   │  [Text Input]      │
│  • Colors     │  │   (real VoiceAgent      │   │  [Select]          │
│  • Typography │  │    component)           │   │  [Toggle]          │
│  • Launcher   │  └────────────────────────┘   │                    │
│  • Panel      │                                │                    │
│  • Behavior   │  [Desktop / Mobile toggle]     │                    │
│  • Responsive │                                │                    │
└───────────────┴───────────────────────────────┴────────────────────┘
```

### Color Picker Engine
Uses [`@jaames/iro`](https://github.com/jaames/iro.js) for a circular HSL color picker. Colors are applied instantly as CSS custom properties:
- `--voice-widget-primary`
- `--voice-widget-bg`
- `--voice-widget-text`
- `--voice-widget-bubble-agent`
- `--voice-widget-bubble-user`
- `--voice-widget-wave-user`

### Save & Deploy
1. Edit any property in the editor
2. Live preview updates instantly (no page reload)
3. Click **Save Widget** → `POST /api/widgets` persists to Supabase
4. Copy embed snippet from **Deploy** tab
5. Paste in client website

---

## Database Schema

### Tables

| Table | Purpose |
|---|---|
| `organizations` | Multi-tenant root (default: `00000000-0000-0000-0000-000000000000`) |
| `websites` | Connected websites; `allowed_domains[]` for crawling scope |
| `widget_secrets` | Isolated API keys (Retell / Vapi); **never** returned to browser |
| `agents` | Agent definitions (provider + external_agent_id) |
| `widgets` | Complete widget records including `config` JSONB blob |
| `widget_configurations` | Extended config broken into per-section JSONB columns |
| `website_data` | Crawled page records with `content`, `metadata` (price/images/rating), `data_type` |
| `crawl_jobs` | Per-job status tracking (pending → running → completed/failed) |

### Key Relationships
```
organizations
    └── websites
            └── website_data (crawled content)
            └── crawl_jobs
    └── widgets
            └── agents
            └── widget_secrets
            └── widget_configurations
```

All tables have **Row Level Security (RLS)** enabled with service-role policies for server-side access only.

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...         # Server-side only

# CORS (comma-separated)
ALLOWED_ORIGINS=https://yoursite.com,https://client.com

# Widget base URL (for embed script generation)
NEXT_PUBLIC_BASE_URL=https://your-domain.vercel.app

# Optional: default Retell credentials (can also be per-widget in DB)
RETELL_API_KEY=key_...

# Crawl4AI Service (Private REST API backend)
CRAWL4AI_BASE_URL=http://127.0.0.1:11235
```

> **Security note:** `SUPABASE_SERVICE_ROLE_KEY`, `RETELL_API_KEY`, and `CRAWL4AI_BASE_URL` are **never** exposed to the browser. The `create-call` endpoint resolves the API key server-side and returns only the short-lived `accessToken`.

---

## Local Development

### Prerequisites
- Node.js 18+
- A [Supabase](https://supabase.com) project with the schema applied
- A [Retell AI](https://retell.ai) account and/or [Vapi AI](https://vapi.ai) account

### Setup

```bash
# 1. Clone and install
git clone https://github.com/your-org/front-desk.git
cd front-desk
npm install

# 2. Configure environment
cp .env.example .env
# Edit .env with your keys

# 3. Apply database schema
# Open Supabase SQL editor → paste supabase_schema.sql → Run
# (also apply supabase_crawl_jobs_migration.sql if upgrading)

# 4. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Key Dev URLs
| URL | Description |
|---|---|
| `http://localhost:3000/` | Widget Fleet Dashboard |
| `http://localhost:3000/widget-customizer` | Create new widget |
| `http://localhost:3000/widget-customizer?id=my-widget` | Edit existing widget |
| `http://localhost:3000/embed/my-widget` | Live widget iframe preview |

---

## Deployment

### Vercel (Recommended)

```bash
# Deploy
npx vercel --prod

# Set environment variables in Vercel Dashboard:
# NEXT_PUBLIC_SUPABASE_URL
# NEXT_PUBLIC_SUPABASE_ANON_KEY
# SUPABASE_SERVICE_ROLE_KEY
# ALLOWED_ORIGINS
# NEXT_PUBLIC_BASE_URL   ← Set to your Vercel URL
```

### CORS Configuration
The `create-call` and search endpoints enforce CORS. Add your client domains to `ALLOWED_ORIGINS`:

```
ALLOWED_ORIGINS=https://client1.com,https://client2.com
```

In development, all origins are allowed automatically.

---

## Component Architecture

```
src/
├── app/
│   ├── page.tsx                          # Widget Fleet Dashboard
│   ├── widget-customizer/page.tsx        # Visual Customizer page
│   ├── embed/[widgetId]/page.tsx         # Iframe embed route
│   └── api/
│       ├── widgets/
│       │   ├── route.ts                  # CRUD widgets
│       │   ├── create-call/route.ts      # Voice call session creation
│       │   └── [widgetId]/
│       │       └── search/route.ts       # Website intelligence search
│       ├── retell/
│       │   ├── chat/route.ts             # Text chat endpoint
│       │   └── log/route.ts              # Telemetry logging
│       └── websites/
│           ├── route.ts                  # List/create websites
│           └── [websiteId]/
│               ├── route.ts              # Update/delete website
│               ├── crawl/route.ts        # Crawl status & trigger
│               ├── data/route.ts         # Raw data export
│               └── search/route.ts       # Per-website search
├── components/
│   ├── voice-agent/
│   │   ├── VoiceAgentWidget.tsx          # Root widget + call logic
│   │   ├── VoiceAgentPanel.tsx           # Panel shell (tabs, header, footer)
│   │   ├── VoiceAgentHeader.tsx          # Branding header
│   │   ├── VoiceAgentLauncher.tsx        # Floating launcher button
│   │   ├── VoiceAgentTranscript.tsx      # Voice + chat message display
│   │   ├── IntelligenceResultCard.tsx    # Product card UI component
│   │   └── VoiceAgentFooter.tsx          # Control bar
│   └── widget-customizer/
│       ├── DeploySection.tsx             # Identity, provider, embedding
│       ├── BrandingSection.tsx           # Name, tagline, avatar
│       ├── ColorsSection.tsx             # Color picker integration
│       ├── TypographySection.tsx         # Font settings
│       ├── LauncherSection.tsx           # Button shape/position
│       ├── PanelSection.tsx              # Panel dimensions
│       ├── BehaviorSection.tsx           # Tabs, telemetry, domains
│       └── ResponsiveSection.tsx         # Mobile settings
├── config/
│   └── voiceWidget/
│       ├── types.ts                      # TypeScript interfaces
│       ├── default.ts                    # Default config + deepMerge
│       └── clients/                      # Per-client presets
├── config/widgetsDb.ts                   # Supabase DB helpers
└── lib/
    └── crawler/
        ├── index.ts                      # crawlWebsite() orchestrator
        └── extractor.ts                  # HTML parser, JSON-LD extractor
```

---

## Known Limitations & Roadmap

| Limitation | Mitigation / Roadmap |
|---|---|
| Crawls only publicly accessible pages | Add auth header support for protected pages |
| Static HTML crawl (no JS execution) | Add optional Puppeteer/Playwright layer for SPAs |
| In-memory rate limiting | Replace with Redis for multi-instance deployments |
| No real-time stock sync | Add webhook endpoint for inventory push updates |
| Single organization (default UUID) | Add multi-tenant auth with Supabase Auth |
| Chat history is session-only | Persist `chatId` to localStorage for cross-session history |
