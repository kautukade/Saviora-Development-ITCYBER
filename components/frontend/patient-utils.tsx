'use client';
import Link from 'next/link';import { useDemo } from './demo-store';
export function usePatient(){const d=useDemo();return {...d,person:d.state.patients.find(p=>p.id===d.state.activePatientId)||d.state.patients[0]};}
export function PatientNavigation(){return <nav className="sv-inline" style={{marginBottom:16}}><Link className="sv-btn sv-btn-secondary" href="/patient">Dashboard</Link><Link className="sv-btn sv-btn-secondary" href="/patient/education">Education</Link><Link className="sv-btn sv-btn-secondary" href="/patient/records">Records</Link><Link className="sv-btn sv-btn-secondary" href="/patient/doctors">My Doctors</Link><Link className="sv-btn sv-btn-secondary" href="/patient/privacy">Sharing</Link></nav>}
