'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, BookOpen, Bot, ClipboardPlus, Hospital, Inbox, Search, Settings, Users } from 'lucide-react';
import { SavioraLogo } from './SavioraLogo';
import { DemoBanner } from './widgets';
import { useDemo } from './demo-store';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';

const nav = [
  { href:'/', label:'AI Assistant', icon: Bot },
  { href:'/clinical-workspace', label:'Clinical Workspace', icon: Hospital },
  { href:'/patients', label:'Patients', icon: Users },
  { href:'/library', label:'Library', icon: BookOpen },
  { href:'/updates', label:'Updates', icon: Inbox },
];

function active(path:string, href:string){ return href==='/' ? path==='/' : path.startsWith(href); }

export function DoctorShell({ children }: { children: ReactNode }){
  const path = usePathname();
  const router=useRouter();
  const {state}=useDemo();
  const [search,setSearch]=useState('');
  const urgent=state.questions.filter(q=>q.status==='Urgent').length;
  const display=state.settings.name;
  return <div className="sv-shell">
    <aside className="sv-sidebar">
      <SavioraLogo />
      <nav className="sv-nav">
        {nav.map(({href,label,icon:Icon}) => <Link key={href} href={href} aria-current={active(path,href)?'page':undefined}><Icon size={19}/><span>{label}</span></Link>)}
      </nav>
      <div className="sv-nav-bottom sv-nav">
        <Link href="/settings" aria-current={path.startsWith('/settings')?'page':undefined}><Settings size={19}/><span>Settings</span></Link>
      </div>
      <div className="sv-side-meta"><strong>{display}</strong>{state.settings.specialty} • {state.settings.location}</div>
    </aside>
    <div className="sv-main">
      <header className="sv-mobile-head"><SavioraLogo compact/><div className="sv-topbar-right"><Link href="/updates" aria-label="Open urgent updates"><Bell size={19}/>{urgent>0&&<span className="sv-mini-count">{urgent}</span>}</Link><Link href="/settings" aria-label="Open Settings" className="sv-avatar">SN</Link></div></header>
      <header className="sv-topbar">
        <div className="sv-topbar-search"><Search size={17} style={{position:'absolute',left:14,top:13,color:'#7690a6'}}/><input value={search} onChange={e=>setSearch(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){router.push(`/patients?q=${encodeURIComponent(search)}`);}}} placeholder="Search patients, reports, education or commands…"/><ClipboardPlus size={17} style={{position:'absolute',right:14,top:13,color:'#7690a6'}}/></div>
        <div className="sv-topbar-right"><Link href="/updates" aria-label="Review updates"><Bell size={20}/>{urgent>0&&<span className="sv-mini-count">{urgent}</span>}</Link><Link href="/settings" aria-label="Open Settings" className="sv-avatar">SN</Link><div style={{fontSize:12}}><strong style={{display:'block'}}>{display}</strong><span style={{color:'#71879b'}}>{state.settings.specialty}</span></div></div>
      </header>
      <DemoBanner/>
      {children}
      <nav className="sv-bottom-mobile">
        {nav.map(({href,label,icon:Icon}) => <Link key={href} href={href} aria-current={active(path,href)?'page':undefined}><Icon size={20}/><span>{label.replace('Clinical ','')}</span></Link>)}
      </nav>
    </div>
  </div>
}
