'use client';

import { UserProvider } from '@/context/UserContext';
import { useEffect } from 'react';
import Navigation from '@/components/Navigation';
import SessionGuard from '@/components/SessionGuard';
import { usePathname } from 'next/navigation';

import NotificationListener from '@/components/NotificationListener';

function InnerWrapper({ children }) {
  const pathname = usePathname();

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw.js')
        .then((reg) => console.log('SW registered'))
        .catch((err) => console.log('SW error', err));
    }
  }, []);

  const isLogin = pathname === '/login';
  // Páginas que necesitan salir de borde a borde (sin padding lateral del wrapper)
  const isFullWidth = pathname.startsWith('/admin/');

  return (
    <SessionGuard>
      <NotificationListener>
        <main style={
          isLogin
            ? { minHeight: '100dvh' }
            : isFullWidth
              ? { maxWidth: '680px', marginLeft: 'auto', marginRight: 'auto', paddingBottom: '90px' }
              : { maxWidth: '600px', marginLeft: 'auto', marginRight: 'auto', paddingTop: '20px', paddingLeft: '20px', paddingRight: '20px', paddingBottom: '90px' }
        }>
          {children}
        </main>
        <Navigation />
      </NotificationListener>
    </SessionGuard>
  );
}

export default function ClientWrapper({ children }) {
  return (
    <UserProvider>
      <InnerWrapper>{children}</InnerWrapper>
    </UserProvider>
  );
}
