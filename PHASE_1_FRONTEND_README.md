# Saviora — Phase 1: Functional Frontend (ITCYBER Technologies)

## Project scope

Built on the **existing Saviora Next.js 16 / React 19 codebase**, not a static click-through prototype. The principal doctor, patient, receptionist and scoped RMO workflows now have interactive controls, input validation, navigation, and **client-side simulated state**. The original server/API/database modules are retained for Phase 2 integration; none of the Phase 1 workflows represent a real authenticated medical deployment.

**IMPORTANT: Not HIPAA-compliant, not ready for real patient health data.** This is a UI integration development build with synthetic demonstration data. Browser localStorage is not encrypted or access controlled. Frontend role selection and OTP code `000000` are demonstration-only, not real identity proof or authorization. Files are NOT uploaded or saved; their metadata is simulated locally. No external AI, WhatsApp, SMS, payment, prescription, or clinical notification takes place.

## Start locally

Prerequisites: Node.js 20.9+ (Node 22 LTS recommended), internet access to install dependencies.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000/demo-login` to choose an experience. Doctor workspace starts at `/`; for the patient portal, test OTP is `000000`. If working in the original `SavioraHealth/saviora-platform` repository, merge these files into `itcyber-development` without replacing its `.git` directory or unrelated backend code.

Recommended verification before review:

```bash
npx tsc --noEmit
npm run lint
npm run build
```

Do not run DB migrations (`npm run vercel-build`) or deploy with real data just to preview the frontend.

## Functional workflows implemented

| Role / flow | UI interactions wired in Phase 1 |
|---|---|
| Doctor AI-first home | Search and command routing to patients, rounds, appointments, reports, education and updates; browser speech input when supported. No clinical AI generated. |
| Patients | Instant query/filter, recent five and View More; add patient with validation and duplicate detection; tags editable after creation; Patient 360 context and doctor actions. |
| Clinical Workspace | Add and filter appointments by location, kind and date; detect duplicate time/facility; change status; open patient-specific OPD/IPD. |
| OPD / Quick Follow-up | Eight approved note fields, field-targeted browser dictation, undo, template and facility, save draft, doctor confirmation and approval, version history, reuse of prior approved note with interval changes. |
| IPD | Active admissions, filters, admission creation with active-admission check; six-field daily round, private unsaved notes, dictation, draft and approval, round status update. |
| Discharge | Three approved route selections, consultant-authored fields, document metadata, approval confirmation, explicit Discharged/Death and admission closure. No hospital-signed PDF generated. |
| Unified Capture | Select patient before associating file metadata, source type, dictation text, verified/unverified markers. No actual file bytes are stored or transmitted. |
| Reports | Synthetic sample layout explicitly labeled; list captured source references, verify after clinician check, filter by patient. No fabricated lab extraction. |
| Education | Filter modules, preview approved vs custom content, create custom modules and reusable bundles, choose recipients/language and queue vs assign, patient progress simulation. |
| Patient engagement | Queue clinical questions; priority urgent labeling; doctor edits and approves response (demo queue only). No real message delivery. |
| Updates | Urgent-first filter and mark read; compact doctor-home urgent count. |
| Doctor settings | Exactly seven groups with separate working pages for locations, templates, AI preferences, profile, team, subscription placeholder and audit. |
| Patient web | Four primary tiles, selected synthetic identity, education progression, records and approved notes view, educational assistant routing, doctor questions, appointments, sharing toggles. |
| Registration / OTP | Minimal doctor and patient onboarding forms and mock OTP flow; all prominently marked non-secure. |
| Receptionist / RMO | Operational appointments and report reference uploads; RMO upload + scoped text only; no doctor clinical approval in UI. |
| Browser demo audit | Local events, CSV export, reset synthetic data. **Not tamper-evident** and not a production audit. |

## Important boundaries / next work (Phase 2)

1. Real authentication, registration, specialty verification, OTP, encrypted session management, authorization and multi-doctor/caregiver consent.
2. Server-persisted patient identities, deduplication, locations, encounters, staff roles and permissions, audit/version trails.
3. Protected original file storage, selective extraction/OCR/clinical unit checking, document previews, real date-series trends, genuine hospital templates and signed discharge PDFs.
4. AI agent, ambient transcription (only with explicit consent), medical safety routing with human sign-off, clinical source provenance, scheduled appointments and controlled e-prescription integration.
5. WhatsApp Business notification, inbound report intake and delivery status, patient consent/OTP page links and approved clinical communication.
6. Billing/AI credits and usage limits, testing and security review; integration against client server and real branch.

## Review and test checklist

- [ ] `npm ci` succeeds with a fresh install and `npm run build` passes.
- [ ] Onboarding/demo-login renders, doctor five-menu is exactly AI Assistant → Clinical Workspace → Patients → Library → Updates, and Settings separate.
- [ ] Add a synthetic patient, reject same name + age, search and open new Patient 360.
- [ ] Schedule appointment, reject duplicate facility/time, change status; test filters.
- [ ] Save OPD draft, undo field edit, approve with confirmation, inspect version history in Patient 360.
- [ ] Create quick follow-up from approved note and review all eight fields.
- [ ] Create IPD admission and round, approve, select a discharge route, approve outcome; verify admission disappears from active list.
- [ ] Capture a file reference, verify it explicitly, inspect report list.
- [ ] Create custom module/bundle, assign education, verify patient side progression and delayed queue behavior.
- [ ] Send question from patient demo, approve from doctor engagement, inspect returned patient question status.
- [ ] Edit seven settings groups, test team revoke, share revoke, CSV export, local data reset.
- [ ] Test width 360px, 768px, 1440px; keyboard-only navigation; unsupported microphone/browser permissions.
- [ ] Production integration hardening: security, privacy, clinical sign-off, original upload, consent and accessibility.

### How state persists

Key: `saviora-phase1-demo-v2` in **browser localStorage**. The initial records are fictional and reinitialized when local state is reset. This architecture is deliberately a placeholder for a future repository-backed API/data-access layer. **Do not enter or import real patient details** while using this frontend-only build.
