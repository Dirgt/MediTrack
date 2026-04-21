'use client';

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useUser } from '@/context/UserContext';

export default function AdminLayout({ children }) {
  const { profile, loading } = useUser();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    // Si terminó de cargar y no hay perfil o no es admin
    if (!loading) {
      if (!profile) {
        // No hay sesión
        router.replace('/login');
      } else if (profile.role !== 'admin') {
        // No autorizado
        router.replace('/');
      }
    }
  }, [profile, loading, router, pathname]);

  // Mostrar un loading state mientras verifica
  if (loading || !profile || profile.role !== 'admin') {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ width: 40, height: 40, borderRadius: '50%', border: '3px solid rgba(15,110,86,0.15)', borderTopColor: 'var(--brand)', animation: 'spin .8s linear infinite', margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-muted)', fontSize: 14, fontWeight: 500 }}>Verificando acceso de administrador...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
