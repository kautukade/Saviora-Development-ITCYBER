# Saviora Frontend-First Implementation

This workspace contains the frontend implementation aligned to Dr. Sachin Naik's approved UI/UX change document dated 24 October 2026.

## Scope implemented

1. Clean professional Saviora visual identity using the official `/public/logo.png`.
2. Simplified doctor onboarding + specialty verification.
3. Doctor sidebar fixed to exactly: AI Assistant, Clinical Workspace, Patients, Library, Updates; Settings separate.
4. AI-first doctor home with Ask Anything, attachment/mic, four quick actions, Ambient Scribe and compact urgent count.
5. Unified Clinical Workspace across OPD/IPD/facilities.
6. Compact patient directory + Add Patient + QR registration route.
7. Patient 360° + Before Visit Summary + patient-scoped AI.
8. Unified Capture for photos/PDF/video/voice/authorized WhatsApp intake.
9. OPD consultation with template choice, Ambient Scribe/Dictate, eight approved note sections, targeted edits, medication reconciliation and education shortcuts.
10. Smart Quick Follow-up + specialty template suggestions + preference memory boundaries.
11. Compact IPD dashboard, daily round workflow, six-section short progress note and targeted voice editing.
12. Discharge: direct final summary, RMO handoff, or upload existing hospital summary.
13. Reports & Trends with 4–6 preferred metrics, original source and validation status.
14. Education Library, custom content and reusable Education Bundles.
15. Assign/send/track education with secure OTP portal behavior.
16. Patient Engagement with AI-handled routine questions, doctor review drafts and urgent priority.
17. Concise Updates inbox.
18. Seven Settings groups, team access and Security/Privacy/Audit screens.
19. Receptionist role and restricted RMO OTP upload/update screen.
20. Patient dashboard, report submission, longitudinal journey, linked doctors, caregiver/privacy controls.
21. Patient-facing “Ask Your Doctor’s Assistant” and separate “Ask My Doctor” workflow.

## Frontend-only phase

The screens use demo/static data intentionally. Existing backend libraries are kept in the repository for the next phase, but these new UI flows are designed to be wired to APIs only after frontend approval.

## Core routes

- `/login`, `/onboarding`, `/verification`
- `/` AI Assistant
- `/clinical-workspace`
- `/patients`, `/patients/add`, `/patients/[id]`, `/patients/[id]/summary`
- `/capture`
- `/opd/[id]`, `/quick-followup/[id]`
- `/ipd`, `/ipd/[id]`, `/discharge/[id]`
- `/reports`
- `/library`, `/education/send`
- `/engagement`, `/updates`
- `/settings`, `/settings/team`, `/settings/security-audit`
- `/receptionist`
- `/rmo/[token]`
- `/patient/register`, `/patient/otp`, `/patient`, `/patient/assistant`, `/patient/doctor`, `/patient/doctors`, `/patient/privacy`

## Backend integration rule

Clinical AI output is always a draft. Diagnosis/treatment/prescribing/final clinical documentation remain doctor-approved actions. External/private links must be authenticated, scoped, expiring and revocable.
