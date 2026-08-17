import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
  title: {
    default: 'UMAIA',
    template: '%s · UMAIA',
  },
  description:
    'Plataforma de financiación participativa inmobiliaria. Proyecto UMAIA, Telde, Gran Canaria.',
};

export default function RootLayout({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
