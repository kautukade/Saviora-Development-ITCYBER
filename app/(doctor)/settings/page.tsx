'use client';
import { Bot,Building2,FileCog,Lock,ReceiptIndianRupee,UserRoundCog,Users } from 'lucide-react';
import { Card,CardTitle,Page,SectionLink } from '@/components/frontend/ui';
const groups=[
 ['My Hospitals & Clinics','Locations, defaults and schedules',Building2,'/settings/hospitals'],
 ['Clinical Templates & Workflows','Default OPD/IPD formats and shortcuts',FileCog,'/settings/templates'],
 ['My AI Preferences','Voice style, language and controlled formatting',Bot,'/settings/ai'],
 ['My Profile & Specialty','Professional details and specialty verification',UserRoundCog,'/settings/profile'],
 ['My Team & Access','Receptionist permissions and RMO links',Users,'/settings/team'],
 ['Subscription & Usage','Plan and example usage — backend billing pending',ReceiptIndianRupee,'/settings/subscription'],
 ['Security & Privacy','Local demo audit, permissions and consent',Lock,'/settings/security-audit'],
] as const;
export default function SettingsPage(){return <Page title="Settings" eyebrow="Seven approved groups"><div className="sv-grid sv-grid-2"><Card><CardTitle title="Practice Workflow"/><div className="sv-callout green">Doctor's first three workflow groups are most prominent.</div>{groups.slice(0,3).map(([t,d,Icon,h])=><SectionLink key={t} href={h} title={t} description={d}/>)}</Card><Card><CardTitle title="Account, Team & Security"/>{groups.slice(3).map(([t,d,Icon,h])=><SectionLink key={t} href={h} title={t} description={d}/>)}</Card></div></Page>}
