'use client';
import { useRef, useState } from 'react';
import { Mic, Paperclip, CheckCircle2, AlertCircle, Copy } from 'lucide-react';
import { useDemo, checkPhone } from './demo-store';

export function Flash({message,error=false}:{message:string;error?:boolean}){return message?<div role="status" className={`sv-callout ${error?'red':'green'}`} style={{margin:'12px 0'}}>{error?<AlertCircle size={16}/>:<CheckCircle2 size={16}/>} {message}</div>:null;}
export function DemoBanner(){return <div className="sv-demo-banner"><strong>Phase 1 • Interactive frontend demo</strong> — Synthetic sample data stored in this browser only. No real login, OTP, AI, medical record storage, WhatsApp, file upload or clinical delivery. Do not enter real patient information.</div>}
export function VoiceInput({onResult,label='Dictate',className='sv-btn sv-btn-secondary'}:{onResult:(text:string)=>void;label?:string;className?:string}){
 const [error,setError]=useState('');const [listening,setListening]=useState(false);
 const start=()=>{
  type SR= new()=>{lang:string;continuous:boolean;interimResults:boolean;onresult:((event:{results: ArrayLike<ArrayLike<{transcript:string}>>})=>void)|null;onerror:((event:{error:string})=>void)|null;onend:(()=>void)|null;start:()=>void};
  const browser=window as Window & {SpeechRecognition?:SR;webkitSpeechRecognition?:SR};const Engine=browser.SpeechRecognition||browser.webkitSpeechRecognition;
  if(!Engine){setError('Speech recognition is not supported on this browser. Please type instead.');return;}
  setError('');const recognition=new Engine();recognition.lang='en-IN';recognition.continuous=false;recognition.interimResults=false;
  recognition.onresult=e=>onResult(Array.from(e.results).map(row=>row[0]?.transcript||'').join(' '));recognition.onerror=e=>{setError(`Microphone unavailable: ${e.error}`);setListening(false);};recognition.onend=()=>setListening(false);
  try{recognition.start();setListening(true);}catch{setError('Microphone access failed. Please type instead.');}
 };
 return <span className="sv-voice-wrapper"><button type="button" className={className} onClick={start}><Mic size={16}/>{listening?'Listening…':label}</button>{error&&<small role="status" style={{display:'block',color:'#ad3232'}}>{error}</small>}</span>;
}
export function FilePicker({onFiles,accept='.pdf,image/*,video/*,.doc,.docx',label='Choose files',multiple=true}:{onFiles:(files:File[])=>void;accept?:string;label?:string;multiple?:boolean}){
 const input=useRef<HTMLInputElement>(null);
 return <><input ref={input} type="file" multiple={multiple} accept={accept} hidden onChange={e=>{const items=Array.from(e.target.files||[]) as File[];if(items.length)onFiles(items);e.target.value='';}}/><button type="button" className="sv-btn sv-btn-secondary" onClick={()=>input.current?.click()}><Paperclip size={16}/> {label}</button></>;
}
export function PatientSelect({value,onChange,includeBlank=true}:{value:string;onChange:(id:string)=>void;includeBlank?:boolean}){const {state}=useDemo();return <select className="sv-input" value={value} onChange={e=>onChange(e.target.value)} required>{includeBlank&&<option value="">Select patient</option>}{state.patients.map(p=><option key={p.id} value={p.id}>{p.name} · {p.age} yrs</option>)}</select>}
export function CopyButton({value,label='Copy link'}:{value:string;label?:string}){const [copied,setCopied]=useState(false);return <button type="button" className="sv-btn sv-btn-secondary" onClick={async()=>{try{await navigator.clipboard.writeText(value);setCopied(true);setTimeout(()=>setCopied(false),2500);}catch{setCopied(false);}}}><Copy size={16}/>{copied?'Copied':label}</button>}
export function ValidPhone({value}:{value:string}){return !checkPhone(value)?<small style={{color:'#a33737'}}>Use a valid phone number or leave blank.</small>:null;}
