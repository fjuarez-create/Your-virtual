import type { Metadata, Viewport } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'banango — tu buscador de compras con IA',
  description:
    'Busca en lenguaje natural en las 20 grandes tiendas online de España y compra en la tienda oficial.',
  // La versión estática (unikdi.com/bng) no debe indexarse: lleva su propio
  // noindex, independiente del robots.txt del sitio que la aloje.
  ...(process.env.NEXT_PUBLIC_STATIC === '1'
    ? { robots: { index: false, follow: false } }
    : {}),
};

export const viewport: Viewport = {
  themeColor: '#eef0f6',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="aurora" aria-hidden>
          <div className="blob blob-banana" />
          <div className="blob blob-peach" />
          <div className="blob blob-pink" />
          <div className="blob blob-sky" />
          <div className="blob blob-mint" />
        </div>
        {children}
      </body>
    </html>
  );
}
