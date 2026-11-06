'use client';

/** Frontend-only state. Synthetic demo data ONLY. No backend, auth, OTP, messaging or encryption. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { patients as seedPatients, educationModules } from './mock';

export type Person = { id:string; name:string; age:number; gender:string; language:string; phone:string; caregiver:string; tags:string[]; status:string; lastVisit:string };
export type Appointment = { id:string; patientId:string; place:string; kind:'OPD'|'IPD'; date:string; time:string; status:'Scheduled'|'Checked in'|'Waiting'|'Cancelled'|'Completed'|'Round due'|'Note pending'; note:string };
export type Admission = { id:string; patientId:string; hospital:string; ward:string; bed:string; status:'Active'|'Discharged'|'Death'; roundStatus:string; outcomeType?:string; outcomeRoute?:string };
export type ClinicalNote = { id:string; patientId:string; kind:'OPD'|'IPD'|'Discharge'; sections:Record<string,string>; status:'Draft'|'Approved'|'Handoff'; template:string; updatedAt:string; location:string; version:number };
export type Education = { id:string; patientId:string; moduleId:string; language:string; timing:string; status:'Assigned'|'Queued'|'Delivered'|'In progress'|'Completed'; progress:number; createdAt:string };
export type Question = { id:string; patientId:string; text:string; reply:string; status:'Pending review'|'Urgent'|'Approved and sent'|'AI handled'; createdAt:string; source:'Patient'|'Doctor'|'Receptionist'|'RMO' };
export type CaptureFile = { id:string; patientId:string; fileName:string; kind:string; size:number; source:string; createdAt:string; verified:boolean; notes:string };
export type Module = { id:string; title:string; language:string; type:string; duration:string; category:string; owner:'Saviora approved'|'Doctor custom'; body:string };
export type Bundle = { id:string; name:string; ids:string[] };
export type AuditEvent = { id:string; date:string; action:string; patientId:string; actor:string; channel:string };
export type Access = { id:string; name:string; role:'Receptionist'|'RMO'; active:boolean };
export type Settings = { name:string; specialty:string; location:string; facilities:string[]; voice:string; preferredLanguage:string; defaultTemplate:string; notifications:boolean; verified:boolean; consent:boolean };
export type DemoState = { activePatientId:string; demoVerified:boolean; patients:Person[]; appointments:Appointment[]; admissions:Admission[]; notes:ClinicalNote[]; educations:Education[]; questions:Question[]; files:CaptureFile[]; modules:Module[]; bundles:Bundle[]; audits:AuditEvent[]; access:Access[]; settings:Settings; updatesRead:string[]; shares:{id:string;label:string;enabled:boolean}[] };

const demoDay = () => new Date().toISOString().slice(0,10);
const uid = (label:string) => `${label}-${typeof crypto!=='undefined'&&'randomUUID' in crypto?crypto.randomUUID().slice(0,10):Math.random().toString(36).slice(2,12)}`;
const stamp = () => new Date().toISOString();
const OPD_FIELDS = [
  'Diagnosis / Background History', 'Chief Complaints / Subjective Assessment', 'Examination / Objective Assessment', 'Assessment and Plan', 'Medications / Prescription', 'Advice and Instructions', 'Follow-up Instructions and Tests', 'Important Explanations and Education Given',
];
const IPD_FIELDS = ['Diagnosis','Interval Events','Clinical Trends / Reports / Output','Examination','Assessment','Management Plan'];
export { OPD_FIELDS, IPD_FIELDS };

function initialState():DemoState {
 const patients:Person[] = seedPatients.map((p,i)=>({...p,language:i%3===0?'Hindi':i%3===1?'Marathi':'English',caregiver:'',status:p.status,tags:[...p.tags]}));
 const modules:Module[] = educationModules.map((m,i)=>({id:`module-${i+1}`,title:m.title,language:m.language,type:m.type,duration:m.duration,category:i<2?'CKD':i===2?'Dialysis':'Transplant',owner:'Saviora approved',body:`Educational overview: ${m.title}. This example is placeholder content; only clinically approved material should be published.`}));
 return {
  activePatientId:'rahul-sharma',demoVerified:false,
  patients,
  appointments:[
   {id:'apt-1',patientId:'rahul-sharma',place:'Kharghar Clinic',kind:'OPD',date:demoDay(),time:'09:00',status:'Checked in',note:'CKD follow-up'},
   {id:'apt-2',patientId:'priya-patil',place:'Kharghar Clinic',kind:'OPD',date:demoDay(),time:'09:40',status:'Waiting',note:'New consultation'},
   {id:'apt-3',patientId:'meera-joshi',place:'Apollo Hospital',kind:'IPD',date:demoDay(),time:'11:30',status:'Round due',note:'Ward 5B · Bed 12'},
   {id:'apt-4',patientId:'suresh-kale',place:'Fortis Hospital',kind:'IPD',date:demoDay(),time:'13:15',status:'Note pending',note:'Ward 2A · Bed 04'},
   {id:'apt-5',patientId:'vikram-shah',place:'Kharghar Clinic',kind:'OPD',date:demoDay(),time:'16:00',status:'Scheduled',note:'Post-transplant review'},
  ],
  admissions:[
   {id:'adm-1',patientId:'meera-joshi',hospital:'Apollo Hospital',ward:'5B',bed:'12',status:'Active',roundStatus:'Round due'},
   {id:'adm-2',patientId:'suresh-kale',hospital:'Fortis Hospital',ward:'2A',bed:'04',status:'Active',roundStatus:'Note pending'},
  ],
  notes:[], educations:[{id:'edu-start',patientId:'rahul-sharma',moduleId:'module-1',language:'Hindi',timing:'Send now',status:'In progress',progress:40,createdAt:'2026-10-20T08:30:00.000Z'}],
  questions:[
   {id:'q-1',patientId:'rahul-sharma',text:'I am feeling very breathless and swelling has increased today.',reply:'Please seek urgent medical assessment for severe or worsening symptoms. A doctor must review this message.',status:'Urgent',createdAt:'2026-10-20T08:35:00.000Z',source:'Patient'},
   {id:'q-2',patientId:'meera-joshi',text:'Can I stop the evening tablet?',reply:'Please do not change prescribed medication without checking with your doctor. This question is queued for review.',status:'Pending review',createdAt:'2026-10-20T08:36:00.000Z',source:'Patient'},
  ],
  files:[], modules, bundles:[{id:'bundle-ckd',name:'CKD Starter Pack',ids:['module-1','module-2']}],audits:[],
  access:[{id:'team-receptionist',name:'Riya Patil',role:'Receptionist',active:true}],
  settings:{name:'Dr. Sachin Naik',specialty:'Nephrology',location:'Mumbai',facilities:['Kharghar Clinic','Apollo Hospital','Fortis Hospital'],voice:'Concise',preferredLanguage:'English',defaultTemplate:'My Nephrology OPD Template',notifications:true,verified:true,consent:false},
  updatesRead:[],shares:[{id:'share-1',label:'Dr. Sachin Naik • care records',enabled:true},{id:'share-2',label:'Caregiver • education and appointments',enabled:true}],
 };
}

type DemoContext = {
  state:DemoState; ready:boolean; reset:()=>void;
  update:(fn:(old:DemoState)=>DemoState)=>void;
  audit:(action:string,patientId?:string,actor?:string,channel?:string)=>void;
  addPatient:(person:Omit<Person,'id'|'tags'|'status'|'lastVisit'>)=>{ok:boolean;id?:string;error?:string};
  setPatient:(id:string,patch:Partial<Person>)=>void;
  addAppointment:(data:Omit<Appointment,'id'>)=>{ok:boolean;error?:string};
  changeAppointment:(id:string,patch:Partial<Appointment>)=>{ok:boolean;error?:string};
  addAdmission:(patientId:string,hospital:string,ward:string,bed:string)=>boolean;
  saveNote:(data:Omit<ClinicalNote,'id'|'updatedAt'|'version'>)=>ClinicalNote;
  addCapture:(item:Omit<CaptureFile,'id'|'createdAt'>)=>void;
  verifyCapture:(id:string)=>void;
  assignEducation:(patientIds:string[],moduleId:string,language:string,timing:string)=>number;
  setEducation:(id:string,progress:number)=>void;
  addQuestion:(patientId:string,text:string,status?:Question['status'],source?:Question['source'])=>void;
  replyQuestion:(id:string,reply:string)=>void;
  markRead:(id:string)=>void;
  addModule:(mod:Omit<Module,'id'|'owner'>)=>void;
  saveBundle:(name:string,ids:string[])=>void;
  updateSettings:(patch:Partial<Settings>)=>void;
  outcome:(patientId:string,route:string,result:'Discharged'|'Death')=>void;
};
const Context = createContext<DemoContext|null>(null);
const STORAGE_KEY='saviora-phase1-demo-v2';
export function DemoProvider({children}:{children:ReactNode}) {
 const [state,setState] = useState<DemoState>(initialState);
 const [ready,setReady] = useState(false);
 useEffect(()=>{try { const raw=window.localStorage.getItem(STORAGE_KEY); if(raw){ const parsed=JSON.parse(raw) as Partial<DemoState>; const seed=initialState(); setState({...seed,...parsed,settings:{...seed.settings,...parsed.settings},patients:Array.isArray(parsed.patients)?parsed.patients:seed.patients,files:Array.isArray(parsed.files)?parsed.files:[]}); } }catch{ /* corrupted storage = demo defaults */ }setReady(true);},[]);
 useEffect(()=>{if(ready)try{window.localStorage.setItem(STORAGE_KEY,JSON.stringify(state));}catch{/* storage unavailable; in-memory session still works */}},[ready,state]);
 const update=useCallback((fn:(old:DemoState)=>DemoState)=>setState(fn),[]);
 const audit=useCallback((action:string,patientId='',actor='Doctor',channel='Demo UI')=>setState(s=>({...s,audits:[{id:uid('audit'),date:stamp(),action,patientId,actor,channel},...s.audits].slice(0,150)})),[]);
 const addPatient=(person:Omit<Person,'id'|'tags'|'status'|'lastVisit'>)=>{
  const name=person.name.trim(), phone=person.phone.replace(/\D/g,'');
  if(name.length<2||!Number.isFinite(person.age)||person.age<0||person.age>125||!person.gender)return {ok:false,error:'Please enter valid name, age and gender.'};
  const duplicate=state.patients.find(p=>(phone.length>=10&&p.phone.replace(/\D/g,'').slice(-10)===phone.slice(-10))||(p.name.toLowerCase()===name.toLowerCase()&&p.age===person.age));
  if(duplicate)return {ok:false,error:`Possible duplicate: ${duplicate.name}. Open the existing patient instead of creating a second identity.`};
  const id=uid('patient');const p:Person={...person,id,name,tags:[],status:'Active',lastVisit:'New'};
  setState(s=>({...s,patients:[p,...s.patients],audits:[{id:uid('audit'),date:stamp(),action:'Registered patient',patientId:id,actor:'Doctor',channel:'Demo UI'},...s.audits]}));return {ok:true,id};
 };
 const setPatient=(id:string,patch:Partial<Person>)=>update(s=>({...s,patients:s.patients.map(p=>p.id===id?{...p,...patch}:p)}));
 const addAppointment=(data:Omit<Appointment,'id'>)=>{
  if(!data.patientId||!data.date||!data.time||!data.place)return {ok:false,error:'Choose patient, date, time and facility.'};
  if(state.appointments.some(a=>a.date===data.date&&a.time===data.time&&a.place===data.place&&a.status!=='Cancelled'))return {ok:false,error:'This facility and time already has a booking. Choose another slot.'};
  setState(s=>({...s,appointments:[...s.appointments,{...data,id:uid('apt')}]})); audit('Appointment scheduled',data.patientId);return {ok:true};
 };
 const changeAppointment=(id:string,patch:Partial<Appointment>)=>{
  const a=state.appointments.find(x=>x.id===id);if(!a)return {ok:false,error:'Appointment not found'};
  const n={...a,...patch};if(state.appointments.some(x=>x.id!==id&&x.date===n.date&&x.time===n.time&&x.place===n.place&&x.status!=='Cancelled')&&n.status!=='Cancelled')return {ok:false,error:'Another appointment already occupies this slot.'};
  update(s=>({...s,appointments:s.appointments.map(x=>x.id===id?n:x)}));audit(`Appointment ${n.status==='Cancelled'?'cancelled':'updated'}`,n.patientId);return {ok:true};
 };
 const addAdmission=(patientId:string,hospital:string,ward:string,bed:string)=>{if(state.admissions.some(a=>a.patientId===patientId&&a.status==='Active'))return false;update(s=>({...s,admissions:[...s.admissions,{id:uid('adm'),patientId,hospital,ward,bed,status:'Active',roundStatus:'Round due'}]}));audit('IPD admission created',patientId);return true;};
 const saveNote=(data:Omit<ClinicalNote,'id'|'updatedAt'|'version'>)=>{
  const prev=state.notes.filter(n=>n.patientId===data.patientId&&n.kind===data.kind).at(-1);
  const note:ClinicalNote={...data,id:uid('note'),updatedAt:stamp(),version:(prev?.version||0)+1};
  update(s=>({...s,notes:[...s.notes,note],admissions:data.kind==='IPD'&&data.status==='Approved'?s.admissions.map(a=>a.patientId===data.patientId&&a.status==='Active'?{...a,roundStatus:'Reviewed'}:a):s.admissions,appointments:data.kind==='OPD'&&data.status==='Approved'?s.appointments.map(a=>a.patientId===data.patientId&&a.status!=='Cancelled'?{...a,status:'Completed' as const}:a):s.appointments,educations:data.kind==='OPD'&&data.status==='Approved'?s.educations.map(e=>e.patientId===data.patientId&&e.status==='Queued'?{...e,status:'Assigned' as const}:e):s.educations}));
  audit(`${data.kind} note ${data.status.toLowerCase()} v${note.version}`,data.patientId);return note;
 };
 const addCapture=(item:Omit<CaptureFile,'id'|'createdAt'>)=>{update(s=>({...s,files:[{...item,id:uid('file'),createdAt:stamp()},...s.files]}));audit('Document metadata captured',item.patientId);};
 const verifyCapture=(id:string)=>{const item=state.files.find(f=>f.id===id);update(s=>({...s,files:s.files.map(f=>f.id===id?{...f,verified:true}:f)}));if(item)audit('Capture marked verified',item.patientId);};
 const assignEducation=(patientIds:string[],moduleId:string,language:string,timing:string)=>{const count=patientIds.filter(patientId=>!state.educations.some(e=>e.patientId===patientId&&e.moduleId===moduleId&&e.status!=='Completed')).length;update(s=>{const additions:Education[]=[];patientIds.forEach(patientId=>{if(!s.educations.some(e=>e.patientId===patientId&&e.moduleId===moduleId&&e.status!=='Completed')){additions.push({id:uid('edu'),patientId,moduleId,language,timing,status:timing==='Queue with OPD finalization'?'Queued':'Assigned',progress:0,createdAt:stamp()});}});return {...s,educations:[...additions,...s.educations]};});audit(`Education assigned to ${patientIds.length} recipient(s)`);return count;};
 const setEducation=(id:string,progress:number)=>update(s=>({...s,educations:s.educations.map(e=>e.id===id?{...e,progress,status:progress>=100?'Completed':progress>0?'In progress':'Assigned'}:e)}));
 const addQuestion=(patientId:string,text:string,status:Question['status']='Pending review',source:Question['source']='Patient')=>{update(s=>({...s,questions:[{id:uid('q'),patientId,text:text.trim(),reply:'',status,createdAt:stamp(),source},...s.questions]}));audit(source==='Patient'?'Patient question queued':`${source} update queued`,patientId,source,source==='Patient'?'Patient portal':'Scoped staff demo');};
 const replyQuestion=(id:string,reply:string)=>{const p=state.questions.find(q=>q.id===id);update(s=>({...s,questions:s.questions.map(q=>q.id===id?{...q,reply,status:'Approved and sent'}:q)}));if(p)audit('Doctor approved response',p.patientId);};
 const markRead=(id:string)=>update(s=>({...s,updatesRead:[...new Set([...s.updatesRead,id])]}));
 const addModule=(mod:Omit<Module,'id'|'owner'>)=>{update(s=>({...s,modules:[...s.modules,{...mod,id:uid('module'),owner:'Doctor custom'}]}));audit('Custom education content created');};
 const saveBundle=(name:string,ids:string[])=>{update(s=>({...s,bundles:[...s.bundles,{id:uid('bundle'),name,ids}]}));audit('Education bundle created');};
 const updateSettings=(patch:Partial<Settings>)=>{update(s=>({...s,settings:{...s.settings,...patch}}));audit('Preferences updated');};
 const outcome=(patientId:string,route:string,result:'Discharged'|'Death')=>{update(s=>({...s,admissions:s.admissions.map(a=>a.patientId===patientId&&a.status==='Active'?{...a,status:result,outcomeType:result,outcomeRoute:route}:a)}));audit(`Admission outcome confirmed: ${result}`,patientId);};
 const reset=()=>{setState(initialState());try{localStorage.removeItem(STORAGE_KEY);}catch{}};
 const value=useMemo<DemoContext>(()=>({state,ready,reset,update,audit,addPatient,setPatient,addAppointment,changeAppointment,addAdmission,saveNote,addCapture,verifyCapture,assignEducation,setEducation,addQuestion,replyQuestion,markRead,addModule,saveBundle,updateSettings,outcome}),[state,ready,update,audit]);
 return <Context.Provider value={value}>{children}</Context.Provider>;
}
export function useDemo(){const c=useContext(Context);if(!c)throw new Error('DemoProvider missing');return c;}
export function patientName(state:DemoState,id:string){return state.patients.find(p=>p.id===id)?.name||'Unknown patient';}
export function checkPhone(value:string){return !value||/^\+?\d[\d\s-]{8,16}$/.test(value);}
