'use client';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Save, Undo2 } from 'lucide-react';
import { Badge, ButtonLink, Card, CardTitle, Page } from '@/components/frontend/ui';
import { OPD_FIELDS, useDemo } from '@/components/frontend/demo-store';
import { Flash, VoiceInput } from '@/components/frontend/widgets';
const empty=()=>Object.fromEntries(OPD_FIELDS.map(f=>[f,''])) as Record<string,string>;
export default function OPD(){
 const {id}=useParams<{id:string}>();const router=useRouter();const {state,saveNote}=useDemo();const p=state.patients.find(x=>x.id===id);const [sections,setSections]=useState<Record<string,string>>(empty());const [template,setTemplate]=useState('My Nephrology OPD Template');const [location,setLocation]=useState('Kharghar Clinic');const [selected,setSelected]=useState(OPD_FIELDS[0]);const [history,setHistory]=useState<Record<string,string>[]>([]);const [message,setMessage]=useState('');const [confirm,setConfirm]=useState(false);
 const existing=state.notes.filter(n=>n.patientId===id&&n.kind==='OPD').at(-1);
 useEffect(()=>{if(existing){setSections({...empty(),...existing.sections});setTemplate(existing.template);setLocation(existing.location)}},[existing?.id]);
 if(!p)return <Page title="Patient not found" actions={<ButtonLink href="/patients" secondary>Patients</ButtonLink>}>Invalid patient identifier.</Page>;
 const change=(f:string,value:string)=>{setHistory(h=>[sections,...h].slice(-20));setSections(s=>({...s,[f]:value}));};
 const save=(status:'Draft'|'Approved')=>{
  if(status==='Approved'&&(!sections['Diagnosis / Background History']?.trim()||!sections['Assessment and Plan']?.trim())){setMessage('Diagnosis/background and assessment/plan must be completed before approval.');return;}
  if(status==='Approved'&&!confirm){setMessage('Confirm doctor sign-off before approving this note.');return;}
  saveNote({patientId:id,kind:'OPD',sections,status,template,location});setMessage(status==='Approved'?'Consultation approved in demo state. Queued education moved to assigned; external sending is not connected.':'Draft saved to browser storage.');
  if(status==='Approved')setConfirm(false);
 };
 return <Page title="OPD Consultation" eyebrow={`${p.name} · ${location}`} actions={<><ButtonLink href={`/patients/${id}`} secondary>Patient 360°</ButtonLink><button className="sv-btn" onClick={()=>save('Draft')}><Save size={16}/> Save Draft</button></>}>
 <div className="sv-grid sv-grid-3"><Card><CardTitle title="Before Visit Summary"/><p>{p.tags.join(' · ')||'New patient'} · {state.files.filter(f=>f.patientId===id).length} captured files</p><ButtonLink href={`/patients/${id}/summary`} secondary>Expand Summary</ButtonLink></Card>
 <Card><CardTitle title="Consultation Capture"/><p>Voice dictation appends only to the selected field. Ambient medical transcription requires a backend.</p><VoiceInput label="Dictate selected field" onResult={t=>change(selected,(sections[selected]||'')+(sections[selected]?' ':'')+t)}/><ButtonLink href={`/capture?patient=${id}`} secondary>Capture Reports</ButtonLink></Card>
 <Card><CardTitle title="Template & Location"/><label>Template<select className="sv-input" value={template} onChange={e=>setTemplate(e.target.value)}><option>My Nephrology OPD Template</option><option>Saviora Standard</option><option>Hospital Template</option></select></label><label>Facility<select className="sv-input" value={location} onChange={e=>setLocation(e.target.value)}>{state.settings.facilities.map(x=><option key={x}>{x}</option>)}</select></label><Badge tone="blue">Doctor editable</Badge></Card></div>
 <div className="sv-grid sv-grid-2" style={{marginTop:16}}><div className="sv-note-editor"><div className="sv-note-toolbar"><button className="sv-btn sv-btn-secondary" disabled={!history.length} onClick={()=>{const last=history.at(-1);if(last){setSections(last);setHistory(h=>h.slice(0,-1));}}}><Undo2 size={16}/> Undo</button><VoiceInput label="Voice edit selected" onResult={t=>change(selected,t)}/><Badge tone="blue">Select a field before dictation</Badge></div>
 {OPD_FIELDS.map(f=><div className="sv-note-section" key={f}><label htmlFor={f}>{f}{selected===f?' • selected':''}</label><textarea id={f} value={sections[f]||''} onFocus={()=>setSelected(f)} onChange={e=>change(f,e.target.value)} placeholder={`Enter doctor-reviewed ${f.toLowerCase()}…`} rows={3}/></div>)}</div>
 <div className="sv-grid"><Card><CardTitle title="Shortcuts"/><div className="sv-two-actions"><ButtonLink href={`/reports?patient=${id}`} secondary>Reports & Updates</ButtonLink><ButtonLink href={`/education/send?patient=${id}`} secondary>Select / Send Education</ButtonLink><ButtonLink href="/engagement" secondary>Patient Engagement</ButtonLink></div></Card>
 <Card><CardTitle title="Medication Reconciliation"/><div className="sv-callout amber">Enter a complete verified current medication list, including strength, dose, route, frequency, duration and instructions. Never use “continue same” alone.</div><p>Editable medication field is in the eight-section note.</p></Card>
 <Card><CardTitle title="Finalize & Queue"/><label className="sv-option"><input type="checkbox" checked={confirm} onChange={e=>setConfirm(e.target.checked)}/> I am the approving clinician and have reviewed all required fields.</label><div className="sv-two-actions"><button className="sv-btn" disabled={!confirm} onClick={()=>save('Approved')}>Approve Consultation</button><button className="sv-btn sv-btn-secondary" onClick={()=>save('Draft')}>Save Draft</button></div><Flash message={message} error={message.startsWith('Confirm')||message.startsWith('Diagnosis')}/><p>Approved consultation is recorded locally for review. Real PDF generation, WhatsApp delivery, identity authorization and audit security require backend integration.</p></Card>
 <Card><CardTitle title="Version History"/>{state.notes.filter(n=>n.patientId===id&&n.kind==='OPD').reverse().slice(0,5).map(n=><div className="sv-row" key={n.id}><div className="sv-row-main"><strong>Version {n.version}</strong><span>{new Date(n.updatedAt).toLocaleString()}</span></div><Badge tone={n.status==='Approved'?'green':'amber'}>{n.status}</Badge></div>)}{!existing&&<p>No earlier version.</p>}</Card></div></div>
 </Page>;
}
