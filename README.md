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

Later phases (not yet built): the three condition workflows with manual/AI
procedural parity, rotating real-peer routing, the three in-app survey
instruments (entry experience check, peer response check, end-of-condition
survey), and de-identified data export. AI prompt/model freezing is deferred.

The legacy Share/Review screens still run on the new schema and will be reworked
in the condition-workflow phase.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite + Tailwind CSS + shadcn/ui
- **Backend:** Node.js + Express
- **Database:** SQLite (via better-sqlite3)
- **AI:** Google Gemini 3 Flash Preview API (mediator + validator + simulated peer response)

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

### Admin Setup

1. Navigate to `/admin` in your browser.
2. Log in with the admin password set in `.env`.
3. Create participant accounts by entering 4-digit PINs. Each new user is automatically seeded with a sample journal entry and a sample peer entry for the usability study.
4. Use the admin dashboard to view user history or manage accounts.

### Participant Flow (Usability Study)

1. **Login** — Enter your 4-digit PIN at the home page.
2. **History** — Click on the sample journal entry to read it.
3. **Share** — Select a sharing intention (Support, Accountability, or Perspective), select the sample journal entry, and click "Generate Sharing Preview."
4. **Review AI Output** — The preview dialog shows three sections:
   - **Polished Entry** (editable) — The AI-cleaned version with PII redacted and tone polished.
   - **Explanation of Changes** (read-only) — What the AI changed and why.
   - **Warning** (read-only, conditional) — Shown if the original content was too revealing.
5. **Edit & Approve/Deny** — Edit the polished entry if desired, then approve to send or deny to stop.
6. **Review Peer Entry** — Navigate to the Review tab. Read the sample peer entry and respond using the three-part format: "What I heard," "What I'm wondering," "What I suggest."
7. **Reflection Addendum** — Switch to the Reflection Addendums tab. Review the AI-generated simulated peer response to your shared entry, then write a reflection.

## AI Pipeline

### Mediator Model

The mediator processes journal entries before sharing with peers:

- Flags and removes potentially harmful or abusive language
- Detects and redacts personal identifiers (names, phone numbers, addresses, emails)
- Polishes the entry without changing its meaning
- Tailors the polish based on the selected sharing intention

The mediator returns structured output: a polished entry, an explanation of changes, and an optional warning.

### Validator Model

The validator is a second-pass safety check. It receives only the polished entry (not the explanation or warning) and verifies it is free of harmful language and personal identifiers. If validation fails, issues are surfaced to the user for manual correction.

### Simulated Peer Response

After a user approves sharing, the backend generates a simulated peer response using the AI. This response follows the same three-part format used by human peers and is available when the user reaches the Reflection Addendum tab.

## API Routes

| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/login` | None | Validate 4-digit PIN |
| POST | `/api/auth/logout` | None | End session |
| GET | `/api/entries` | PIN | List user's journal entries |
| POST | `/api/entries` | PIN | Create journal entry |
| PUT | `/api/entries/:id` | PIN | Update journal entry |
| DELETE | `/api/entries/:id` | PIN | Delete journal entry |
| POST | `/api/sharing/mediate` | PIN | Run AI mediator + validator pipeline |
| POST | `/api/sharing/approve` | PIN | Approve sharing, trigger simulated peer response |
| POST | `/api/sharing/deny` | PIN | Deny sharing |
| GET | `/api/peers` | PIN | Get peer entries awaiting response |
| POST | `/api/peers/:id/respond` | PIN | Submit peer response |
| GET | `/api/reflections/pending` | PIN | Get entries awaiting reflection |
| POST | `/api/reflections` | PIN | Submit reflection addendum |
| POST | `/api/admin/login` | None | Admin login |
| GET | `/api/admin/users` | Admin | List all users |
| POST | `/api/admin/users` | Admin | Create user + seed data |
| DELETE | `/api/admin/users/:pin` | Admin | Delete user and all data |
| GET | `/api/admin/users/:pin/history` | Admin | View user's full history |
| DELETE | `/api/admin/entries/:id` | Admin | Delete specific entry |

## Project Structure

```
peer-journaling/
├── server/                    # Express backend
│   ├── index.ts               # Server entry point
│   ├── db.ts                  # SQLite schema, seed data
│   ├── types.ts               # Shared TypeScript types
│   ├── middleware/
│   │   ├── auth.ts            # PIN-based user auth
│   │   └── admin-auth.ts      # Admin token auth
│   ├── routes/
│   │   ├── auth.ts            # Login/logout
│   │   ├── entries.ts         # Journal entry CRUD
│   │   ├── sharing.ts         # AI mediation pipeline
│   │   ├── peers.ts           # Peer entries + responses
│   │   ├── reflections.ts     # Reflection addendums
│   │   └── admin.ts           # Admin dashboard API
│   └── services/
│       ├── gemini.ts          # Gemini API client
│       ├── mediator.ts        # Mediator model service
│       ├── validator.ts       # Validator model service
│       └── peer-response.ts   # Simulated peer response
├── src/                       # React frontend
│   ├── app/
│   │   ├── components/
│   │   │   ├── Login.tsx      # PIN login
│   │   │   ├── MainMenu.tsx   # Navigation hub
│   │   │   ├── Write.tsx      # Journal entry creation
│   │   │   ├── History.tsx    # Entry history view
│   │   │   ├── Share.tsx      # AI-mediated sharing
│   │   │   ├── Review.tsx     # Peer review + reflection
│   │   │   ├── Admin.tsx      # Admin dashboard
│   │   │   └── ui/            # shadcn/ui components
│   │   ├── context/
│   │   │   └── AppContext.tsx  # API-backed global state
│   │   ├── utils/
│   │   │   └── api.ts         # Frontend API client
│   │   ├── App.tsx
│   │   └── routes.ts
│   └── styles/
├── .env                       # API keys (not committed)
├── package.json
└── vite.config.ts             # Vite config with API proxy
```

## Data Isolation

Each user's data is keyed by their 4-digit PIN. The backend middleware validates the PIN on every request and scopes all database queries to that user. Users cannot see other users' data. The admin dashboard has a separate authentication system using a password-based token.
