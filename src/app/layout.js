export const metadata = {
  title: 'MediTrack - Vendedores',
  description: 'PWA para gestión de pedidos de medicamentos',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'MediTrack',
  },
};

export const viewport = {
  themeColor: '#0F6E56',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

import ClientWrapper from '@/components/ClientWrapper';

export default function RootLayout({ children }) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head />
      <body>
        <ClientWrapper>
          {children}
        </ClientWrapper>
      </body>
    </html>
  );
}
