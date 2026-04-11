<div align="center">

# ⚡ Open Agent CRM

### The Open-Source WhatsApp AI CRM — Built for Real Businesses

**Self-hosted · AI-powered · WhatsApp-native · Multi-agent**

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg?style=flat-square)](LICENSE)
[![Stars](https://img.shields.io/github/stars/Sapheron/Open-Agent-CRM?style=flat-square&color=yellow)](https://github.com/Sapheron/Open-Agent-CRM/stargazers)
[![Forks](https://img.shields.io/github/forks/Sapheron/Open-Agent-CRM?style=flat-square)](https://github.com/Sapheron/Open-Agent-CRM/network)
[![Issues](https://img.shields.io/github/issues/Sapheron/Open-Agent-CRM?style=flat-square&color=red)](https://github.com/Sapheron/Open-Agent-CRM/issues)
[![Last Commit](https://img.shields.io/github/last-commit/Sapheron/Open-Agent-CRM?style=flat-square)](https://github.com/Sapheron/Open-Agent-CRM/commits/main)
[![Top Language](https://img.shields.io/github/languages/top/Sapheron/Open-Agent-CRM?style=flat-square)](https://github.com/Sapheron/Open-Agent-CRM)
[![Repo Size](https://img.shields.io/github/repo-size/Sapheron/Open-Agent-CRM?style=flat-square)](https://github.com/Sapheron/Open-Agent-CRM)

---

**A Sapheron Project** · Powered by **TechnoTaLim Platform and Services LLP**

Developed by **[ASHIK K I](https://github.com/ashik-k-i)**

---

[🚀 Install](#one-command-install) · [✨ Features](#features) · [🏗 Architecture](#architecture) · [🛠 Tech Stack](#tech-stack) · [🚦 Roadmap](#roadmap) · [🤝 Contributing](#contributing)

</div>

---

## What is Open Agent CRM?

Open Agent CRM is a **production-ready, self-hosted WhatsApp CRM** that puts an AI agent at the center of every customer conversation.

Instead of manually replying to hundreds of WhatsApp messages, your AI agent handles inquiries, qualifies leads, creates deals, generates payment links, runs drip sequences, and escalates to a human agent when needed — all automatically, all from a single dashboard you control. Configure 15 AI providers, 5 payment gateways, and any number of WhatsApp accounts from the dashboard — no `.env` editing required for credentials.

---

## One-Command Install

**Mac / Linux:**
```bash
curl -fsSL https://openagentcrm.sapheron.com/install.sh | bash
```

**Windows:**
```powershell
powershell -c "irm https://openagentcrm.sapheron.com/install.ps1 | iex"
```

The installer is **fully idempotent** — re-run it anytime to update or repair. Each step checks if it's already done and asks to skip.

> **Requirements:** Docker, 2 GB RAM, any Linux VPS or local machine.
>
> **SSL & reverse proxy are NOT set up automatically.** The installer prints nginx and Caddy snippets at the end so you can use whatever you already have.

---

## Features

### 📲 WhatsApp Integration
- Connect multiple WhatsApp numbers via QR scan — no phone needed 24/7
- Baileys 6.17 (WhatsApp Web protocol) with auto-reconnect and session isolation
- Real-time delivery, read receipts, and status tracking
- Media support — images, video, audio, documents stored in MinIO
- **Warmup scheduler** — 6-stage daily-limit progression to keep accounts alive
- Outbound queue with rate limiting and retry

### 🤖 AI Agent & Admin Chat
- Fully autonomous agent loop with tool calling — handles WhatsApp replies AND a separate admin chat that drives the entire CRM
- **~169 registered admin tools** across every module; **~55 always-exposed core tools** with the rest callable on demand to keep the prompt small
- **15 AI providers** — all configured from the dashboard, keys encrypted with AES-256-GCM in the database

  | Group | Providers |
  |---|---|
  | **Hosted** | Anthropic Claude · OpenAI · Google Gemini · Groq · DeepSeek · xAI · Mistral · Together · Moonshot · GLM · Qwen · StepFun |
  | **Local** | Ollama (llama3, mistral, phi4, gemma3, deepseek-r1, qwen2.5, …) |
  | **Aggregator** | OpenRouter (200+ models) · Custom OpenAI-compatible endpoint |

- Live **provider test** button in settings — swap models without restart
- Circuit breaker (Opossum) — auto-fallback if a provider goes down
- Token-aware context builder with smart pruning
- Conversation FSM with 7 states:
  ```
  OPEN → AI_HANDLING → WAITING_HUMAN → HUMAN_HANDLING → RESOLVED → CLOSED
                                                                  ↘ SPAM
  ```
- **Tool catalog page** at `/docs` in the dashboard — every tool grouped by domain so admins can see exactly what the AI can do

### 🧠 Memory & RAG (OpenClaw-style)
Two memory layers, both queryable from the AI agent:

| Layer | What it stores | How it's used |
|---|---|---|
| **Vector RAG** (`memory` module) | `MemoryFile` → `MemoryChunk` with **pgvector** embeddings + Postgres `tsvector` | Hybrid (vector + keyword) search; the AI calls `memory_search` to recall relevant snippets at runtime |
| **Categorical** (`ai-memory` module) | `AiMemory` rows tagged by category | Injected verbatim into the system prompt for facts you want the AI to never forget |

A **memory dreaming** worker (`apps/worker/src/jobs/memory-dreaming.processor.ts`) runs every 6 hours, scores hot recall entries by frequency / relevance / diversity / recency, and promotes the top patterns into the long-term `MEMORY.md` file that ships with every system prompt.

### 🔁 Sequences & Templates
- **Drip campaigns** with full lifecycle: `DRAFT → ACTIVE → PAUSED → ARCHIVED`, plus per-enrollment `ACTIVE → PAUSED → COMPLETED / STOPPED / CANCELLED`
- Step types: `send_message`, `send_email`, `wait`, `add_tag`, `remove_tag`, `webhook`, `ai_task` — with hour-level delays and JSON conditions
- **Bulk enroll / pause / stop** from the dashboard or via the AI agent
- **Templates** module with `{{variable}}` substitution, default values, preview, draft / active / archived status, and a "send template" tool
- Worker processor advances enrollments every minute; failures retry with exponential backoff (1 h → 2 h → 4 h, then `STOPPED`)

### 🧾 CRM Modules
| Module | Capabilities |
|---|---|
| **Contacts** | Full-text search, tags, opt-out, phone normalization, custom fields, lifecycle stages, timeline |
| **Leads** | Status pipeline (NEW → WON / LOST), source tracking, scoring with decay, estimated value, table + kanban views |
| **Deals** | Multi-pipeline kanban, custom stages, line items, won/lost tracking, forecast |
| **Tasks** | Priority, due dates, reminders, recurrence, watchers, comments, time logs |
| **Pipelines** | Custom sales pipelines with reorderable stages |
| **Products** | Catalog, variants, stock adjustments, low-stock alerts |
| **Quotes & Invoices** | Line-item builder, status tracking |
| **Payments** | AI-generated payment links, webhook reconciliation, auto deal-won |
| **Broadcasts** | Tag-based targeting, scheduled sends, warmup-aware delivery, recipient tracking |
| **Campaigns** | Marketing campaigns tied to forms and workflows |
| **Forms** | Lead-capture forms with submission storage |
| **Workflows** | Trigger / condition / action automations with execution history |
| **Tickets** | Support tickets with comments and SLA policies |
| **Knowledge Base** | Internal articles searchable by the AI |
| **Documents** | File storage with signature requests |
| **Analytics & Reports** | KPI dashboard, deal funnel, lead sources, agent performance, custom + scheduled reports |

### 📬 Lead Intake & API Keys
- **Custom webhook endpoint** — `POST /api/webhooks/leads/custom` accepts JSON from Tally, Typeform, Webflow, your own forms, anything that can speak HTTP
- **Meta Ads connector** (`lead-intake` module) auto-creates leads when someone fills your Facebook / Instagram lead form, gated by a public-URL eligibility check
- **API Keys** module — SHA-256 hashed keys with scopes (`leads:write`, `leads:read`, `webhooks:meta`), shown once on creation, dedicated `/leads/api-keys` and `/leads/api-docs` dashboard pages
- App secret + page access token are encrypted at rest with AES-256-GCM; Meta webhook payloads verified with HMAC-SHA256

### 👥 Team Inbox
- Multi-agent real-time inbox with WebSocket push
- Conversation assignment, claim, and escalation
- AI / Human toggle per conversation
- Role-based access: Super Admin → Admin → Manager → Agent
- Team invite with role assignment

### 💳 Payment Gateways
All configured from the dashboard — keys encrypted in the database, never in `.env`:

| Gateway | Countries | Features |
|---|---|---|
| **Razorpay** | India | Payment links, webhooks, auto deal-won |
| **Stripe** | Global | Payment links, webhooks, auto deal-won |
| **Cashfree** | India | Payment links, webhooks |
| **PhonePe** | India | UPI payment pages |
| **PayU** | India | Payment pages, webhooks |

### 📊 Observability
- **Prometheus** — metrics scraping for API, Worker, Redis, Postgres
- **Grafana** — pre-provisioned dashboards and datasources
- **Loki** — centralized log aggregation
- **Health endpoint** — `/api/health` for Docker and uptime monitoring

### 🔒 Security
- JWT auth with 15-minute access tokens + 7-day refresh-token rotation
- SHA-256 refresh-token hashing — old token invalidated on use
- **AES-256-GCM encryption** for every AI / payment / Meta credential in the database
- **API keys** SHA-256 hashed at rest, raw value shown once
- Company-scoped multi-tenancy — `CompanyScopeGuard` on every request
- Rate limiting via Throttler
- **Audit log** for all sensitive actions with before / after values
- GDPR-friendly: soft delete, opt-out, hard purge via cleanup processor

### 🐳 Self-Hosted & Open Source
- Single `docker compose up -d` deploys everything
- Optional Traefik reverse proxy with auto Let's Encrypt SSL
- PgBouncer connection pooling
- Nightly PostgreSQL backups with configurable retention
- MIT licensed — fork it, customize it, run it yourself

---

## Architecture

```
                         ┌──────────────────────────────────┐
                         │          Dashboard (Next.js)      │
                         │   Inbox · CRM · Settings · Setup  │
                         └────────────┬─────────────────────┘
                                      │ HTTPS + WebSocket
                         ┌────────────▼─────────────────────┐
                         │           API (NestJS)            │
                         │  REST · WS Gateway · Guards       │
                         │  34 modules · 169 AI tools        │
                         └──┬──────────────┬────────────────┘
                            │              │
              ┌─────────────▼──┐    ┌──────▼──────────────┐
              │  WhatsApp Svc  │    │   Worker (BullMQ)    │
              │  (Baileys)     │    │   AI Agent Loop      │
              │  QR · Sessions │    │   12 job processors  │
              │  Media Upload  │    │   Memory Dreaming    │
              │  Outbound Sub  │    │   Sequences · Warmup │
              └───────┬────────┘    └──────┬───────────────┘
                      │                   │
              ┌───────▼───────────────────▼───────┐
              │           Redis (BullMQ + Pub/Sub) │
              └───────────────────────────────────┘
              ┌───────────────────────────────────┐
              │  PostgreSQL 16 + pgvector         │
              │  (72 Prisma models · PgBouncer)   │
              └───────────────────────────────────┘
              ┌───────────────────────────────────┐
              │     MinIO (Media Storage)         │
              └───────────────────────────────────┘
```

### Monorepo Structure

```
Open-Agent-CRM/
├── apps/
│   ├── api/             # NestJS — REST API + WebSocket gateway (34 modules)
│   ├── dashboard/       # Next.js 16 — App Router dashboard (27 routes)
│   ├── whatsapp/        # Baileys service — sessions, inbound, outbound
│   └── worker/          # BullMQ — AI agent loop + 12 background processors
├── packages/
│   ├── database/        # Prisma schema (72 models), migrations, seed
│   └── shared/          # FSM, crypto utils, queue names, WS event types
├── deploy/
│   ├── docker-compose.yml        # Production stack
│   ├── docker-compose.dev.yml    # Local dev (postgres + redis + minio)
│   ├── install.sh                # Mac/Linux one-command installer
│   ├── install.ps1               # Windows one-command installer
│   ├── nginx-installer.conf      # Reverse proxy config template
│   ├── traefik/                  # Traefik reverse proxy config
│   ├── prometheus/               # Prometheus scrape config
│   ├── grafana/                  # Grafana provisioning
│   └── loki/                     # Loki log aggregation config
└── .github/workflows/
    └── ci.yml                    # Lint → Type-check → Test → Build → Docker push
```

---

## Tech Stack

<table>
<tr>
<td valign="top" width="33%">

**Backend**
- NestJS 11.1 · TypeScript 6.0
- Prisma 7.7 + PostgreSQL 16 + pgvector
- Redis 7 + BullMQ 5.73
- Socket.io 4.8 WebSockets
- Baileys 6.17 (WhatsApp Web)
- Passport.js + JWT
- Opossum 9 (circuit breaker)

</td>
<td valign="top" width="33%">

**Frontend**
- Next.js 16.2 (App Router)
- React 19.2
- Tailwind CSS 3.4
- Zustand 5 (state)
- TanStack Query 5.97
- Recharts 3.8 (charts)
- dnd-kit 6.3 (kanban)
- Socket.io client 4.8

</td>
<td valign="top" width="33%">

**Infrastructure**
- Docker + Docker Compose
- Traefik (reverse proxy + SSL)
- PgBouncer (connection pool)
- MinIO (S3-compatible storage)
- Prometheus + Grafana
- Loki (log aggregation)
- GitHub Actions CI/CD
- Node 22 · pnpm 10.33 · Turbo 2.9

</td>
</tr>
</table>

---

## Getting Started (Development)

### Prerequisites
- Node.js 22+
- pnpm 10.33+
- Docker + Docker Compose

### 1. Clone

```bash
git clone https://github.com/Sapheron/Open-Agent-CRM.git
cd Open-Agent-CRM
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Start infrastructure

```bash
docker compose -f deploy/docker-compose.dev.yml up -d
```

### 4. Set up environment

```bash
cp .env.example .env
# Edit .env — only infra config goes here.
# AI keys, payment keys, and WhatsApp accounts are set from the dashboard.
```

### 5. Run migrations & seed

```bash
pnpm db:generate
pnpm db:migrate
pnpm db:seed
```

### 6. Start development servers

```bash
pnpm dev
```

| Service | URL |
|---|---|
| Dashboard | http://localhost:3001 |
| API | http://localhost:3000/api |
| API Docs (Swagger) | http://localhost:3000/api/docs |
| Grafana | http://localhost:3002 |
| MinIO Console | http://localhost:9001 |

---

## Configuration

Only **infrastructure** goes in `.env`. AI providers, payment gateways, and WhatsApp accounts are all configured from the dashboard and stored encrypted in the database.

```env
# Infrastructure only — see .env.example for the full list
DATABASE_URL=postgresql://crm:password@pgbouncer:5432/wacrm
REDIS_URL=redis://redis:6379
JWT_SECRET=<generated>
ENCRYPTION_KEY=<32-byte hex — used to encrypt AI/payment keys in DB>
MINIO_ENDPOINT=minio
```

> **AI providers, payment gateways, and WhatsApp accounts are all configured from the dashboard Setup Wizard after first login.**

---

## Production Deployment

### One command (recommended)

```bash
curl -fsSL https://openagentcrm.sapheron.com/install.sh | bash
```

The installer will:
1. Detect your OS and install Docker if needed
2. Clone the repo to `/opt/openagentcrm`
3. Interactively generate your `.env` (admin email, password, auto-generated secrets)
4. Pull and build Docker images
5. Start infrastructure (postgres, redis, minio, pgbouncer)
6. Run database migrations + seed admin user
7. Start all services on localhost ports

Then **print nginx and Caddy config** so you can set up your own reverse proxy + SSL.

### Manual deployment

```bash
git clone https://github.com/Sapheron/Open-Agent-CRM.git /opt/openagentcrm
cd /opt/openagentcrm
cp .env.example .env     # fill in your values
docker compose -f deploy/docker-compose.yml up -d
```

---

## Roadmap

### Shipped
The full WhatsApp + AI CRM stack is production-ready: 34 NestJS modules covering contacts, leads, deals, tasks, sequences, templates, broadcasts, campaigns, forms, workflows, tickets, knowledge base, documents, payments, quotes, invoices, products, pipelines, analytics, and reports — backed by a 72-model Prisma schema, 12 worker processors, 15 configurable AI providers, an OpenClaw-style memory + RAG system with dreaming-based long-term promotion, an admin AI chat with ~169 callable tools, a Meta Ads + custom-webhook lead intake pipeline, multi-tenant team inbox with role-based access, AES-256-GCM credential encryption, full Prometheus / Grafana / Loki observability, and an idempotent one-command installer for Linux / macOS / Windows.

### Planned / Next
- [ ] Email notifications for task reminders
- [ ] WhatsApp Cloud API fallback (alongside Baileys)
- [ ] Mobile app (React Native)
- [ ] Plugin / external webhook system
- [ ] White-label theming
- [ ] Multi-language AI replies

---

## Security

Open Agent CRM is built with security-first principles:

- **Encrypted credentials** — AI provider keys, payment gateway keys, and Meta tokens are encrypted with AES-256-GCM before storing in the database. The encryption key never leaves your `.env`.
- **JWT hardening** — 15-minute access tokens, 7-day refresh tokens. Refresh tokens are stored as SHA-256 hashes and invalidated on every rotation.
- **Hashed API keys** — external integration keys (custom webhook, Meta) are SHA-256 hashed at rest; the raw value is shown only once at creation time.
- **Multi-tenancy isolation** — `CompanyScopeGuard` injects `companyId` from the JWT into every request. Cross-company data access is impossible.
- **Webhook verification** — Meta lead webhooks are validated with HMAC-SHA256 against the signed body.
- **Rate limiting** — Throttler on all API endpoints.
- **Audit log** — every sensitive action (login, key updates, permission changes) is recorded with before / after values.
- **GDPR** — soft delete for contacts, opt-out support, scheduled hard purge via the cleanup processor.

---

## Contributing

Contributions are welcome and appreciated.

```bash
# Fork → clone → branch → PR
git checkout -b feature/your-feature
git commit -m "feat: your feature"
git push origin feature/your-feature
# Open a Pull Request on GitHub
```

Before opening a PR, please run:

```bash
pnpm turbo lint type-check test
```

---

## Disclaimer

Open Agent CRM is an **independent open-source project** and is **not affiliated with, endorsed by, or sponsored by WhatsApp, Meta, OpenAI, Google, Anthropic, Stripe, Razorpay, Cashfree, PhonePe, PayU, or any other third-party provider**.

Users are solely responsible for complying with:
- WhatsApp Terms of Service and Business Policy
- Applicable local laws and data protection regulations (GDPR, PDPA, IT Act, etc.)
- AI provider usage policies
- Payment provider terms of service

---

## License

This project is licensed under the **[MIT License](LICENSE)**.

---

<div align="center">

## Built by

<table>
<tr>
<td align="center" width="200">
<br/>
<b>ASHIK K I</b><br/>
<sub>Creator & Lead Developer</sub><br/>
<a href="https://github.com/ashik-k-i">@ashik-k-i</a>
<br/>
</td>
<td align="center" width="200">
<br/>
<b>SANWEER K T</b><br/>
<sub>Contributor</sub><br/>
<a href="https://github.com/listenermedia">@listenermedia</a>
<br/>
</td>
</tr>
</table>

<br/>

**A [Sapheron](https://sapheron.com) Project**

*Sapheron is a software brand under*

**TechnoTaLim Platform and Services LLP**

*"Engineering the Future"*

<br/>

[![GitHub](https://img.shields.io/badge/GitHub-Sapheron%2FOpen--Agent--CRM-181717?style=flat-square&logo=github)](https://github.com/Sapheron/Open-Agent-CRM)
[![Website](https://img.shields.io/badge/Website-openagentcrm.sapheron.com-blue?style=flat-square)](https://openagentcrm.sapheron.com)

<br/>

---

*If this project helped you, please consider giving it a ⭐ — it helps others discover it.*

[![Star History Chart](https://api.star-history.com/svg?repos=Sapheron/Open-Agent-CRM&type=Date)](https://star-history.com/#Sapheron/Open-Agent-CRM&Date)

<br/>

<p>
  <a href="https://github.com/Sapheron/Open-Agent-CRM/issues">🐛 Report Bug</a> ·
  <a href="https://github.com/Sapheron/Open-Agent-CRM/issues">💡 Request Feature</a> ·
  <a href="https://github.com/Sapheron/Open-Agent-CRM/discussions">💬 Discussions</a> ·
  <a href="https://openagentcrm.sapheron.com/install.sh">📦 Install Script</a>
</p>

<br/>

<sub>© 2026 TechnoTaLim Platform and Services LLP · MIT License</sub>

</div>
