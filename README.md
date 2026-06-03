# AI Peer Journaling App

An AI-mediated peer journaling platform for the study **"From Private
Reflection to AI-Mediated Disclosure."** It is being adapted from a usability
prototype into an instrumented field-study platform: a 3-week within-subjects
crossover (private / manual-sharing / AI-mediated conditions), with a matched
daily writing-prompt schedule, entry-linked behavioral logging, rotating
anonymous peers, and in-app survey instruments.

The original design is available at https://www.figma.com/design/mj7ZIx9vwfWfna1kjj7HZQ/AI-Peer-Journaling-App.

## Study platform: build status

The platform is being rebuilt in phases.

**Phase 6 (AI freezing & full mediation logging)** is in place:

- **Frozen AI instrument** (`server/study/ai-config.ts`) — a single documented
  source of truth for the AI condition: model + version, decoding parameters
  (temperature, top-p, max output tokens), the exact mediator and validator
  prompts, and the allowed/disallowed transformations, each carrying a version
  identifier. Decoding settings are applied on every call, and the frozen config
  is viewable in the admin dashboard and shipped with every export.
- **Full mediation I/O log** (`ai_mediations`) — one row per model call, including
  **regenerated and rejected** suggestions, with the input excerpt, suggested
  text, explanation, warning, validator result, disposition (generated /
  regenerated / accepted / edited / canceled), final text, and the config/prompt
  version stamp. The analysis tier exposes the de-identified version (lengths,
  dispositions, suggestion→final edit distance — no text); the raw tier keeps the
  full text.

This completes every deliverable.

**Phase 5 (data export & de-identification)** is in place:

- **Two de-identified export tiers** from the admin dashboard (per-table CSV and a
  JSON bundle):
  - **Analysis bundle** — pseudonymous participant IDs, entry metadata + behavioral
    metrics, the event log, peer-exchange timing, and survey responses (long
    format with reverse-coding flags). No raw journal text.
  - **Blinded coding export** — original journal entries for reflection-quality
    coding, with condition labels and timestamps stripped and entries shuffled so
    coders stay blind to condition.
- **De-identification** maps PINs to stable pseudonymous IDs (P01, P02, …),
  scrubs PINs from logged event payloads, and runs an automated PII-redaction
  pass (emails, phones, URLs, @handles) over exported text. Automated redaction
  is a safety net — human review is still required before sharing externally.

This completes every deliverable except the intentionally-deferred AI prompt/
model freezing.

**Phase 4 (in-app surveys)** is in place:

- **Three instruments**, with items transcribed verbatim from the study survey
  documents and presented on a 5-point Likert scale:
  - **Entry experience check** — condition-specific (private/manual/AI), fires
    after writing and the privacy/sharing decision, before any peer response.
  - **Peer response check** — social conditions only, fires when the writer
    reads the peer response to their own entry.
  - **End-of-condition survey** — C-items always; S-items in the social
    conditions; AI-mediator items in the AI condition only.
- **Right-moment gating** via the Today flow, and one response row per item
  stored in `survey_responses` with a `survey_submitted` event.
- Legacy `/menu` and `/review` screens removed; the guided Today flow is the
  single participant hub.

**Phase 3 (rotating dyad routing)** is in place:

- **Rotating anonymous peers** — each shared entry is routed to a single
  different responder, drawn from a pool keyed by condition + entry index. The
  assignment honors the no-repeat-pairing rule (§5): the same two participants
  are never paired twice within a condition, so peers rotate across entries.
- **Structured peer response** — the three-part template (what I heard / am
  wondering / suggest, with a "No suggestion" option) with lightweight minimum
  lengths.
- **Read + social reflection** — the writer reads the peer's response to their
  own entry (recording the read timestamp) and then reflects.
- **Missed-response handling** — real peers only, no AI backup: if no response
  arrives by the read day the task is marked missing; writer data is retained.
- **Timing logs** — assigned responder, response timestamp, read timestamp, and
  missed/delayed flags are all logged for analysis.

**Phase 2 (condition workflows & session orchestration)** is in place:

- **Guided "Today" session** — after login, participants land on a daily task
  checklist (`/today`) that gates each task by status (available / done / locked)
  and surfaces later-phase tasks (peer exchange, surveys) as upcoming.
- **Condition-parallel sharing** — the manual and AI social conditions share an
  identical workflow (intention → select/edit excerpt → preview exactly what the
  peer sees → approve / edit / cancel). The **AI condition adds only** a mediation
  review step: an §8-aligned suggested/redacted version, an oversharing warning,
  an explanation of changes, and a regenerate option. Nothing is shared without
  explicit approval.
- **Behavioral disclosure logging** — share/no-share, excerpt length, percentage
  shared, time-to-share, edit distance (excerpt→final and AI→final), canceled
  share, AI action, and regeneration count, all recorded to the event log.
- **Private-condition delayed reflection** — reflect on a prior entry with no peer.

*Deferred to Phase 3* (need a real peer): responding to a peer's entry, reading
the peer's response to your own entry, and the social reflection-after-response.
*Phase 4*: the three in-app survey instruments. *Deferred*: AI prompt/model
freezing. The legacy `/menu` and `/review` screens remain for now.

**Phase 1 (foundations)** is in place:

- **Counterbalanced enrollment** — each participant is assigned one of the six
  condition orders in round-robin order at creation.
- **Admin-advanced study day** — the cadence is driven by an admin control
  (`current_study_day`, 0–15) rather than the real clock, for deterministic
  piloting; real timestamps are still logged.
- **Matched prompt schedule** — the three Appendix-A writing prompts, served per
  entry/condition day.
- **Real entry authoring** — participants write and save their own entries
  (sample-entry seeding removed); each entry is linked to its condition,
  condition order, study day, entry index, prompt, and write start/complete
  times (§7 data linkage).
- **Event-log spine** — an append-only `events` table records enrollment,
  session starts, study-day changes, and entry creation/deletion.

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
