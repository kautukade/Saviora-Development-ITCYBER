'use client';
import Link from 'next/link';
import { Bot, ClipboardPlus, GraduationCap, Paperclip, Search, Stethoscope, Users, Volume2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge, Card, CardTitle, Page } from '@/components/frontend/ui';
import { useDemo } from '@/components/frontend/demo-store';
import { FilePicker, Flash, VoiceInput } from '@/components/frontend/widgets';

export default function DoctorHome(){
 const {state}=useDemo();const router=useRouter();const [input,setInput]=useState('');const [message,setMessage]=useState('');
 const urgent=state.questions.filter(q=>q.status==='Urgent');
 const go=(q=input)=>{
  const text=q.trim().toLowerCase();if(!text)return;
  const matching=state.patients.find(p=>text.includes(p.name.toLowerCase())||text.includes(p.name.split(' ')[0].toLowerCase()));
  if(text.includes('patient')||matching){router.push(matching?`/patients/${matching.id}`:`/patients?q=${encodeURIComponent(q)}`);return;}
  if(text.includes('round')||text.includes('ipd')){router.push('/ipd');return;}
  if(text.includes('report')||text.includes('update')){router.push(text.includes('report')?'/reports':'/updates');return;}
  if(text.includes('education')||text.includes('learn')){router.push('/education/send');return;}
  if(text.includes('appointment')||text.includes('schedule')||text.includes('note')){router.push('/clinical-workspace');return;}
  setMessage('Demo assistant supports command routing: find a patient, appointment, rounds, reports, education, or updates. No clinical AI model is connected.');
 };
 return <Page title="AI Assistant" eyebrow="Saviora Doctor Workspace">
 <div className="sv-hero"><div className="sv-doc-header"><div><h1>Hello, {state.settings.name}</h1><p>What can I do for you today?</p></div><Link href="/updates"><Badge tone={urgent.length?'red':'green'}>Urgent Review · {urgent.length}</Badge></Link></div>
  <form className="sv-command" onSubmit={e=>{e.preventDefault();go();}}><Bot size={21} color="#1268d8"/><input aria-label="Ask anything" placeholder="Ask anything… (try 'find Rahul' or 'open rounds')" value={input} onChange={e=>setInput(e.target.value)}/><FilePicker accept=".pdf,image/*" label="Attach" multiple={false} onFiles={()=>router.push('/capture')}/><VoiceInput label="Speak" onResult={t=>{setInput(t);go(t);}}/><button className="sv-btn" type="submit">Go</button></form><Flash message={message} error/>
  <div className="sv-quick" style={{marginTop:16}}>
   <Link href="/patients"><span className="sv-iconbox"><Users size={19}/></span><div><strong>Add / Find a patient</strong><p>Search or create patient record</p></div></Link>
   <Link href="/clinical-workspace"><span className="sv-iconbox green"><ClipboardPlus size={19}/></span><div><strong>Create clinical note</strong><p>Start OPD, IPD or capture workflow</p></div></Link>
   <Link href="/education/send"><span className="sv-iconbox purple"><GraduationCap size={19}/></span><div><strong>Send Education</strong><p>Select patient, module and language</p></div></Link>
   <Link href="/updates"><span className="sv-iconbox amber"><Stethoscope size={19}/></span><div><strong>Review Patient Updates</strong><p>Urgent and actionable work</p></div></Link>
  </div>
  <Link href="/capture?type=voice" className="sv-btn" style={{marginTop:16,width:'100%'}}><Volume2 size={18}/> Start Ambient Scribe (capture demo)</Link>
 </div>
 <div className="sv-grid sv-grid-2" style={{marginTop:16}}>
 <Card><CardTitle title="Recent Patients" aside={<Link className="sv-link" href="/patients">View all</Link>}/>{state.patients.slice(0,5).map(p=><Link href={`/patients/${p.id}`} className="sv-row" key={p.id}><div className="sv-person-avatar">{p.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div className="sv-row-main"><strong>{p.name}</strong><span>{p.age} yrs · {p.gender} · {p.tags.join(' · ')||'New'}</span></div><Badge tone={p.status==='Follow-up'?'amber':'green'}>{p.status}</Badge></Link>)}</Card>
 <Card><CardTitle title="Suggested Commands"/>{[['Find a patient','/patients'],['Review patient questions','/engagement'],['Start today’s IPD rounds','/ipd'],['Prepare CKD education','/education/send'],['Review lab reports','/reports']].map(([t,h])=><Link key={t} href={h} className="sv-section-link"><div><strong>{t}</strong><p>Interactive Phase 1 demo workflow</p></div><Search size={17}/></Link>)}</Card>
 </div>
 </Page>;
}
