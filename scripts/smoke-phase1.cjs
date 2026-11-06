// Source-level contract smoke checks (not a browser or production build test).
const fs=require('fs');const path=require('path');const assert=require('assert');
function read(p){const f=path.join(process.cwd(),p);assert(fs.existsSync(f),`Missing ${p}`);return fs.readFileSync(f,'utf8');}
const shell=read('components/frontend/DoctorShell.tsx');
const items=["label:'AI Assistant'","label:'Clinical Workspace'","label:'Patients'","label:'Library'","label:'Updates'"];
let previous=-1;for(const s of items){const at=shell.indexOf(s);assert(at>previous,`Doctor nav missing or order wrong: ${s}`);previous=at;}assert(shell.includes('href="/settings"'),'Settings link missing');
const store=read('components/frontend/demo-store.tsx');for(const v of ['addPatient','addAppointment','saveNote','addAdmission','addCapture','assignEducation','replyQuestion','outcome','reset'])assert(store.includes(v),`State method missing: ${v}`);
const screens=['app/(doctor)/page.tsx','app/(doctor)/patients/page.tsx','app/(doctor)/patients/add/page.tsx','app/(doctor)/patients/[id]/page.tsx','app/(doctor)/clinical-workspace/page.tsx','app/(doctor)/opd/[id]/page.tsx','app/(doctor)/ipd/[id]/page.tsx','app/(doctor)/discharge/[id]/page.tsx','app/(doctor)/reports/page.tsx','app/(doctor)/capture/page.tsx','app/(doctor)/library/page.tsx','app/(doctor)/education/send/page.tsx','app/(doctor)/engagement/page.tsx','app/(doctor)/updates/page.tsx','app/(doctor)/settings/page.tsx','app/patient/page.tsx','app/patient/assistant/page.tsx','app/patient/doctor/page.tsx','app/patient/education/page.tsx','app/patient/records/page.tsx','app/receptionist/page.tsx','app/rmo/[token]/page.tsx'];
for(const s of screens){const text=read(s);assert(text.includes('export default'),`Invalid page export: ${s}`);}
const sections=read('components/frontend/demo-store.tsx');assert((sections.match(/'Diagnosis \/ Background History'/g)||[]).length>0,'OPD required fields missing');assert((sections.match(/'Management Plan'/g)||[]).length>0,'IPD progress fields missing');
const settings=read('app/(doctor)/settings/page.tsx');for(const s of ['My Hospitals & Clinics','Clinical Templates & Workflows','My AI Preferences','My Profile & Specialty','My Team & Access','Subscription & Usage','Security & Privacy'])assert(settings.includes(s),`Missing Settings group: ${s}`);
assert(read('app/patient/assistant/page.tsx').includes('Ask Your Doctor’s Assistant'),'Patient AI name wrong');
console.log(`PASS: Doctor 5-menu order, 7 settings, ${screens.length} key screens, state methods and approved wording.`);
