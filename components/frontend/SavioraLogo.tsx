import Image from 'next/image';
export function SavioraLogo({ compact=false }: { compact?: boolean }) {
  return <div className="sv-logo"><Image src="/logo.png" width={54} height={44} alt="Saviora"/><div className={compact ? 'sv-logo-copy sv-logo-copy-compact':'sv-logo-copy'}><strong>Saviora</strong>{!compact && <span>Empowering Doctors. Educating Patients.</span>}</div></div>;
}
