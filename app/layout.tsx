import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { DemoProvider } from '@/components/frontend/demo-store';

export const metadata: Metadata = {
  title: 'Saviora',
  description: 'AI-first clinical workspace, patient education and doctor-linked engagement.',
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="en"><body><DemoProvider>{children}</DemoProvider></body></html>;
}
