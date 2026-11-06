# saviora-platform

Saviora healthcare platform — main application repository.

Doctors sign up to Saviora to educate their patients. Saviora supplies a library of
ready-made content that every doctor can assign, and doctors can add their own on top.
Patients only ever touch WhatsApp and a video page; doctors only ever touch the website.

## The journey

1. A doctor adds a patient — name, WhatsApp number, language.
2. They assign content from Saviora's library, their own, or both.
3. The patient gets a private link and watches or reads what they were given. How far
   they actually got is recorded.
4. They ask questions on WhatsApp. The assistant answers only from material that doctor
   approved, with a citation, or hands the question to the doctor.
5. They photograph a lab report. The values are read back in their language, they
   confirm, and anything dangerous reaches the doctor the same minute.
6. Before the appointment the doctor opens one screen: what was watched, asked,
   escalated and measured.

## Running it

```bash
npm install
cp .env.example .env.local                       # then fill it in
npm run db:migrate                               # create the schema
npm run db:seed                                  # Saviora's written material
npx tsx scripts/seed-videos.ts                   # the "What is CKD?" course
npx tsx scripts/create-doctor.ts you@clinic.test "Your Name" Nephrology
npm run dev
```

`create-doctor.ts` prints a generated password once and never again. Without
`seed-videos.ts` there is nothing for a patient to watch, and without
`db:seed` the assistant has nothing approved to answer from — it will pass
every clinical question to the doctor, correctly and uselessly.

Then, for something to look at:

```bash
npx tsx scripts/demo.ts "Rajesh Kumar"   # a patient with a history, and their link
```

### Changing the schema

```bash
npm run db:generate    # writes a migration into drizzle/ from lib/schema.ts
npm run db:migrate     # applies it locally
```

Commit the generated file. Production applies migrations during the build
(`vercel-build` in package.json), so a deploy fails rather than shipping code
its database cannot serve — a schema change once reached production without its
tables and every page that touched them returned 500.

| variable | needed for |
|---|---|
| `DATABASE_URL` | Postgres — local or Neon, same driver either way |
| `SESSION_SECRET` | signing the doctor's session cookie |
| `ANTHROPIC_API_KEY` | answering questions and reading reports |
| `PUBLIC_BASE_URL` | building the patient's link |
| `BLOB_READ_WRITE_TOKEN` | uploads: doctors' own videos, and our copy of documents |
| `WHATSAPP_PUBLIC_NUMBER` | the number the patient's page invites them to write to |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET` | WhatsApp; without them the bot runs on the simulator |

## Shape of it

One Next.js app. One level under `lib/`, one file per concern — understanding an
endpoint means opening the route and the one `lib` file it calls.

| | |
|---|---|
| `lib/bot.ts` | the conversation loop, identical for WhatsApp and the simulator |
| `lib/claude.ts` | grounded answers with citations, and report extraction |
| `lib/redflags.ts` | the emergency screen — deterministic, runs before any model |
| `lib/panels.ts` | lab panels, aliases, units, thresholds |
| `lib/labs.ts` | report intake, read-back, confirmation |
| `lib/content.ts` | the ownership rule, assignment, derived progress |
| `lib/summary.ts` | what the doctor reads before the visit |

`content.owner_doctor_id IS NULL OR = :me` is the one visibility rule: NULL means
Saviora authored it and every doctor sees it. The same column governs documents.

Progress is an append-only event log, so how far a patient got can never drift from
what they actually did.

## Testing the bot without WhatsApp

```bash
curl -X POST localhost:3000/api/dev/simulate \
  -H 'content-type: application/json' \
  -d '{"address":"919820000002","text":"can I eat bananas?"}'
```

## Verification

```bash
npx tsx scripts/verify.ts
```

One pass over the whole journey against the real database and the real model: token
resolution, the emergency rail, a grounded answer with citations, an escalation, the
read-back gate, a critical result, the summary, and the shared-number rule. `KEEP=1`
leaves the rows behind for inspection when something fails.
