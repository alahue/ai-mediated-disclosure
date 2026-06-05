# AI Peer Journaling App

An AI-mediated peer journaling platform for the study **"From Private
Reflection to AI-Mediated Disclosure."** It runs a 3-week within-subjects
crossover field study comparing three journaling conditions — private, manual
peer sharing, and AI-mediated peer sharing — with a matched daily prompt
schedule, entry-linked behavioral logging, rotating anonymous peers, in-app
survey instruments, a frozen AI mediator, and de-identified data export.

## What it does

The platform runs a **3-week within-subjects crossover** field study in which
every participant completes three journaling conditions — **private**, **manual
peer sharing**, and **AI-mediated peer sharing** — one per week, in one of six
fully counterbalanced orders. Each condition has five daily sessions (15 study
days total) with three focal writing entries, and all measurement is linked to
entries rather than calendar days.

### Enrollment & scheduling
- Participants log in with a 4-digit PIN; the admin assigns a counterbalanced
  condition order automatically at creation.
- The daily cadence runs on an **admin-advanced "study day" (0–15)** for
  deterministic piloting; real timestamps are still recorded.
- Each login opens a guided **Today** screen — a daily task checklist that gates
  each task (available / done / locked / waiting / missed) and links to the right
  action.

### Writing & prompts
- Participants write and save their own entries against a **matched daily prompt
  schedule** (the same three prompt types each week, in the same order).
- Each entry is linked to its condition, condition order, study day, entry index,
  prompt, and write start/complete times.

### Conditions & sharing (procedural parity)
- The two social conditions share an **identical workflow** — choose a sharing
  intention, select/edit the excerpt, preview exactly what the peer will see,
  then approve / edit / cancel.
- The **AI condition adds only** a disclosure-mediation step: a suggested/redacted
  version, an explanation of changes, an oversharing warning, and a regenerate
  option. The AI never shares autonomously; nothing is sent without explicit
  approval.
- The **private condition** writes only, with a delayed private reflection.

### Rotating anonymous peers
- Each shared entry is routed to a single **different anonymous responder** via a
  **deterministic rotation** within each condition: participants form a ring
  (ordered by participant number), and for entry _s_ each reviews the peer _s_
  positions ahead (wrapping). Every entry gets exactly one reviewer, no one is
  stranded, and across the three entries each participant reviews each of the
  other peers without repeats.
- Peers reply with a **structured three-part response** ("what I heard / am
  wondering / suggest"). The writer later reads the response and writes a
  reflection.
- **Missed responses** are handled (real peers only): if none arrives by the read
  day, the task is marked missing and the writer's own data is retained.

### In-app surveys
- **Entry experience check** (condition-specific) after the write/share decision;
  **peer response check** when reading a peer reply (social conditions only); and
  an **end-of-condition survey** at the end of each week (with social- and
  AI-specific item blocks). Items are 5-point Likert, transcribed verbatim from
  the study instruments.

### Behavioral & AI logging
- An append-only **event log** records the behavioral disclosure measures —
  share/no-share, excerpt length, percentage shared, time-to-share, edit distance,
  cancellations, AI action, and regenerations — plus enrollment, sessions, peer
  assignment/response/read timing, and survey submissions.
- The **AI mediator is a frozen, versioned instrument**: model + version, decoding
  parameters, explicit safety thresholds, and the exact mediator/validator prompts
  are pinned and stamped onto every call. The **full mediation I/O** (every
  suggestion, including regenerated and rejected ones) is persisted.

### Privacy, de-identification & export
- Data are isolated by PIN; peers appear only as anonymous pseudonyms; nothing is
  shared without preview and approval.
- The admin dashboard exports three tiers: a **de-identified analysis bundle**
  (pseudonymous IDs, metadata, behavioral metrics, surveys — no raw text), a
  **blinded coding export** (entries, peer responses, reflections —
  condition-stripped, shuffled, PII-redacted), and an access-controlled **raw
  tier** (full text plus the PIN↔ID mapping for re-linking). Both shareable tiers
  run an automated PII-redaction pass; human review is still required before
  sharing externally.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **AI:** Google Gemini 3 Flash Preview API (disclosure mediator + validator, used in the AI condition)

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the project root:

```
GEMINI_API_KEY=your-gemini-api-key-here
ADMIN_PASSWORD=your-admin-password
PORT=3001
```

### 3. Run the app

```bash
npm run dev:full
```

This starts both the Vite frontend dev server and the Express backend concurrently. The frontend proxies `/api/*` requests to the backend.

You can also run them separately:

```bash
npm run dev       # Frontend only (Vite)
npm run server    # Backend only (Express)
```

## Usage

### Admin setup

1. Navigate to `/admin` and log in with the admin password from `.env`.
2. Create participant accounts by entering 4-digit PINs. Each participant is automatically assigned one of the six counterbalanced condition orders (round-robin) and starts on study day 0 (not started).
3. Drive the study cadence with the per-participant day control (the study runs on an admin-advanced "study day" 0–15, not the real clock). Use **View History** to inspect a participant's data, and the **Data Export** panel for de-identified analysis and blinded coding exports.

### Participant flow (guided "Today")

After logging in with their PIN, participants land on **Today**, a daily checklist that gates each task by status and links to:

1. **Write** — respond to the day's matched prompt; the entry is saved and linked to its condition, study day, entry index, and prompt.
2. **Share / Mediate & share** (social conditions) — choose a sharing intention, select/edit the excerpt, preview exactly what the peer sees, and approve / edit / cancel. The AI condition adds a mediation review step (suggested/redacted text, explanation, oversharing warning, regenerate).
3. **Respond to a peer's entry** — a rotating anonymous peer's entry, answered with the three-part template.
4. **Read your peer's response** and **reflect** on your own entry.
5. **Surveys** — the entry experience check, peer response check, and end-of-condition survey fire at their scheduled moments.

## AI Pipeline (AI condition)

### Mediator Model

The disclosure mediator prepares a participant's selected excerpt for optional peer sharing while preserving their control, meaning, and voice (per the study's mediator spec):

- Redacts direct identifiers and specific contextual clues
- Makes clarity-preserving edits without changing stance, emotion, or voice
- Never adds facts, advice, diagnoses, or judgments
- Returns a suggested shared version, a plain-language explanation of changes, and an optional oversharing warning

Nothing is shared without the participant's explicit approval, and the participant can edit, regenerate, or cancel.

### Validator Model

The validator is a second-pass safety check on the suggested shared version, verifying it is free of harmful language and personal identifiers. If validation fails, the issues are surfaced to the participant.

## API Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/login` | None | Validate 4-digit PIN |
| POST | `/api/auth/logout` | None | End session |
| GET | `/api/study/today` | PIN | Current study day plan + gated tasks |
| GET | `/api/entries` | PIN | List the participant's entries |
| POST | `/api/entries` | PIN | Create the day's focal entry (study-aware) |
| PUT | `/api/entries/:id` | PIN | Update journal entry |
| DELETE | `/api/entries/:id` | PIN | Delete journal entry |
| POST | `/api/sharing/mediate` | PIN | AI mediation of an excerpt (AI condition) |
| POST | `/api/sharing/approve` | PIN | Approve sharing; logs disclosure + creates peer exchange |
| POST | `/api/sharing/cancel` | PIN | Cancel sharing (logged as a canceled share) |
| POST | `/api/exchanges/claim` | PIN | Claim a rotating peer entry to respond to |
| POST | `/api/exchanges/:id/respond` | PIN | Submit the structured peer response |
| GET | `/api/exchanges/for-entry/:entryId` | PIN | Read the peer response to your own entry |
| POST | `/api/reflections` | PIN | Submit a reflection addendum |
| GET | `/api/surveys/definition` | PIN | Items for a survey, scoped to the condition |
| POST | `/api/surveys/submit` | PIN | Submit survey responses |
| POST | `/api/admin/login` | None | Admin login |
| GET | `/api/admin/users` | Admin | List participants with study status |
| POST | `/api/admin/users` | Admin | Create participant (assigns condition order) |
| POST | `/api/admin/users/:pin/study-day` | Admin | Set/advance a participant's study day |
| DELETE | `/api/admin/users/:pin` | Admin | Delete participant and all data |
| GET | `/api/admin/users/:pin/history` | Admin | View a participant's full history |
| GET | `/api/admin/export` | Admin | De-identified analysis / coding export (JSON or CSV) |
| DELETE | `/api/admin/entries/:id` | Admin | Delete specific entry |

## Project Structure

```
peer-journaling/
├── server/                    # Express backend
│   ├── index.ts               # Server entry point
│   ├── db.ts                  # SQLite schema + migrations
│   ├── types.ts               # Shared TypeScript types
│   ├── study/
│   │   ├── config.ts          # Conditions, orders, prompts, day-plan/tasks
│   │   └── surveys.ts         # The three survey instruments
│   ├── middleware/
│   │   ├── auth.ts            # PIN-based participant auth
│   │   └── admin-auth.ts      # Admin token auth
│   ├── routes/
│   │   ├── auth.ts            # Login/logout
│   │   ├── study.ts           # /study/today day plan + task status
│   │   ├── entries.ts         # Study-aware entry authoring
│   │   ├── sharing.ts         # Sharing workflow + behavioral logging
│   │   ├── exchanges.ts       # Rotating peer assignment + responses
│   │   ├── reflections.ts     # Reflection addendums
│   │   ├── surveys.ts         # Survey definitions + submission
│   │   └── admin.ts           # Admin dashboard + data export
│   └── services/
│       ├── gemini.ts          # Gemini API client
│       ├── mediator.ts        # Disclosure mediator
│       ├── validator.ts       # Validator (second-pass check)
│       ├── events.ts          # Append-only event logging
│       ├── text-metrics.ts    # Edit distance / disclosure metrics
│       ├── deidentify.ts      # Pseudonymization + PII redaction
│       ├── export.ts          # Analysis / coding export builders
│       └── csv.ts             # CSV serialization
├── src/                       # React frontend
│   ├── app/
│   │   ├── components/
│   │   │   ├── Login.tsx       # PIN login
│   │   │   ├── Today.tsx       # Guided daily task hub
│   │   │   ├── Write.tsx       # Prompted entry composer
│   │   │   ├── Share.tsx       # Condition-parallel sharing flow
│   │   │   ├── Respond.tsx     # Respond to a rotating peer
│   │   │   ├── ReadResponse.tsx # Read the peer's response
│   │   │   ├── Survey.tsx      # Likert survey form
│   │   │   ├── History.tsx     # Entry history view
│   │   │   ├── Admin.tsx       # Admin dashboard + export
│   │   │   └── ui/             # shadcn/ui components
│   │   ├── context/
│   │   │   └── AppContext.tsx  # API-backed global state
│   │   ├── utils/
│   │   │   └── api.ts          # Frontend API client
│   │   ├── App.tsx
│   │   └── routes.ts
│   └── styles/
├── .env                       # API keys (not committed)
├── package.json
└── vite.config.ts             # Vite config with API proxy
```

## Data isolation & privacy

Each participant's data is keyed by their 4-digit PIN; the auth middleware validates the PIN on every request and scopes all queries to that participant. The admin dashboard uses a separate password-based token. Peers are shown only as anonymous pseudonyms, and all data leaves the system through the de-identified export (pseudonymous IDs + PII redaction), never as raw PIN-linked records.
