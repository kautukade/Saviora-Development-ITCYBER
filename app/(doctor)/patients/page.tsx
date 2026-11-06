'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { Search, UserRoundPlus } from 'lucide-react';
import { Badge, ButtonLink, Card, Page } from '@/components/frontend/ui';
import { useDemo } from '@/components/frontend/demo-store';
import { VoiceInput } from '@/components/frontend/widgets';
function PatientsContent(){
 const {state}=useDemo();const params=useSearchParams();const [query,setQuery]=useState(params.get('q')||'');const [filter,setFilter]=useState('Recent 5');const [more,setMore]=useState(false);
 const result=state.patients.filter(p=>{const match=[p.name,p.gender,p.status,...p.tags,p.language,p.phone].join(' ').toLowerCase().includes(query.toLowerCase());const pass=filter==='Follow-up'?p.status==='Follow-up':filter==='CKD'?p.tags.some(t=>t.toLowerCase().includes('ckd')):filter==='Transplant'?p.tags.some(t=>t.toLowerCase().includes('transplant')):filter==='Needs review'?state.questions.some(q=>q.patientId===p.id&&['Urgent','Pending review'].includes(q.status)):true;return match&&pass;});
 const shown=filter==='Recent 5'&&!more&&!query?result.slice(0,5):result;
 return <Page title="Patients" eyebrow="Patient Directory" actions={<ButtonLink href="/patients/add"><UserRoundPlus size={17}/> Add Patient</ButtonLink>}>
 <Card><div className="sv-search"><div style={{position:'relative',flex:1}}><Search size={17} style={{position:'absolute',left:13,top:13,color:'#7890a5'}}/><input className="sv-input" style={{paddingLeft:40}} value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search patient, tag, diagnosis or follow-up…"/></div><VoiceInput label="Voice search" onResult={setQuery}/></div>
 <div className="sv-filter-row">{['Recent 5','Follow-up','CKD','Transplant','Needs review'].map(x=><button type="button" key={x} className={`sv-filter ${filter===x?'active':''}`} onClick={()=>{setFilter(x);setMore(false);}}>{x}</button>)}</div>
 {shown.length===0&&<div className="sv-empty">No matching patients. Try another search or add patient.</div>}
 {shown.map(p=><Link href={`/patients/${p.id}`} className="sv-row" key={p.id}><div className="sv-person-avatar">{p.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div className="sv-row-main"><strong>{p.name}</strong><span>{p.age} yrs · {p.gender} · {p.tags.join(' · ')||'No tags'} · {p.lastVisit}</span></div><Badge tone={p.status==='Follow-up'?'amber':'green'}>{p.status}</Badge></Link>)}
 {result.length>5&&filter==='Recent 5'&&!query&&<div style={{textAlign:'center',paddingTop:14}}><button className="sv-btn sv-btn-secondary" onClick={()=>setMore(!more)}>{more?'Show Recent 5':`View More Patients (${result.length-5} more)`}</button></div>}
 </Card>
 <div className="sv-callout" style={{marginTop:16}}>Search and filters work instantly. Opening a patient leads to their longitudinal record. All entries shown are fictional demo data.</div>
 </Page>;
}

export default function PageWithSearchParams(){return <Suspense fallback={<div className="sv-page">Loading…</div>}><PatientsContent /></Suspense>;}
