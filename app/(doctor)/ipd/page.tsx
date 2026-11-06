'use client';
import Link from 'next/link';import { useState } from 'react';import { BedDouble } from 'lucide-react';
import { Badge, Card, CardTitle, Page } from '@/components/frontend/ui';
import { useDemo, patientName } from '@/components/frontend/demo-store';
import { Flash, PatientSelect } from '@/components/frontend/widgets';
export default function IPD(){
 const {state,addAdmission}=useDemo();const [filter,setFilter]=useState('All Hospitals');const [show,setShow]=useState(false);const [patient,setPatient]=useState('');const [hospital,setHospital]=useState('Apollo Hospital');const [ward,setWard]=useState('');const [bed,setBed]=useState('');const [message,setMessage]=useState('');
 const active=state.admissions.filter(a=>a.status==='Active').filter(a=>filter==='All Hospitals'||filter==='Round Due'&&a.roundStatus!=='Reviewed'||a.hospital.includes(filter));
 return <Page title="IPD Dashboard" eyebrow="Current admitted patients across connected hospitals" actions={<button className="sv-btn" onClick={()=>setShow(!show)}>{show?'Close':'New Admission'}</button>}>
 {show&&<Card><CardTitle title="Create Admission"/><form className="sv-form" onSubmit={e=>{e.preventDefault();const ok=addAdmission(patient,hospital,ward,bed);setMessage(ok?'Admission created.':'This patient already has an active admission; check before creating another.');if(ok)setShow(false);}}><div className="sv-form-row"><label>Patient<PatientSelect value={patient} onChange={setPatient}/></label><label>Hospital<select className="sv-input" value={hospital} onChange={e=>setHospital(e.target.value)}>{state.settings.facilities.filter(x=>x.toLowerCase().includes('hospital')).map(x=><option key={x}>{x}</option>)}</select></label><label>Ward<input className="sv-input" required value={ward} onChange={e=>setWard(e.target.value)}/></label><label>Bed<input className="sv-input" required value={bed} onChange={e=>setBed(e.target.value)}/></label></div><button type="submit" className="sv-btn">Create Admission</button></form></Card>}
 <Flash message={message} error={message.startsWith('This')}/>
 <Card><div className="sv-filter-row">{['All Hospitals','Apollo','Fortis','Round Due'].map(x=><button key={x} className={`sv-filter ${filter===x?'active':''}`} onClick={()=>setFilter(x)}>{x}</button>)}</div>
 {active.length===0&&<div className="sv-empty">No active admissions match this filter.</div>}
 {active.map(a=><Link href={`/ipd/${a.patientId}`} className="sv-row" key={a.id}><span className="sv-iconbox purple"><BedDouble size={18}/></span><div className="sv-row-main"><strong>{patientName(state,a.patientId)}</strong><span>{a.hospital} · Ward {a.ward} / Bed {a.bed}</span></div><Badge tone={a.roundStatus==='Reviewed'?'green':'amber'}>{a.roundStatus}</Badge></Link>)}
 </Card><div className="sv-callout" style={{marginTop:16}}>Active admissions remain listed until an explicit authorized outcome is confirmed. A new daily progress note never creates a duplicate admission.</div>
 </Page>;
}
