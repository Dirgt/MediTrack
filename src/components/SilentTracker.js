'use client';

import { useEffect, useCallback, useRef } from 'react';
import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';
import { usePathname } from 'next/navigation';

export default function SilentTracker() {
  const { user, profile } = useUser();
  const pathname = usePathname();
  const lastUpdateRef = useRef(0);

  // Función para capturar y enviar ubicación con throttle
  const captureAndSendLocation = useCallback((force = false) => {
    if (!user) return;
    if (typeof window === 'undefined' || !navigator.geolocation) return;

    const now = Date.now();

    // Throttle dinámico: 3 minutos para repartidor, 15 min para otros
    const throttleTime = profile?.role === 'repartidor' ? 180000 : 900000;

    if (!force && lastUpdateRef.current && now - lastUpdateRef.current < throttleTime) {
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const { latitude, longitude } = position.coords;

        // Actualizar Supabase de forma silenciosa
        await supabase
          .from('profiles')
          .update({
            latitud: latitude,
            longitud: longitude,
            ultima_actualizacion: new Date().toISOString()
          })
          .eq('id', user.id);

        lastUpdateRef.current = now;
      },
      () => {
        // GPS denegado o falló — no hacemos nada, la app sigue funcionando
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  }, [user, profile]);

  // 1. Intentar captura silenciosa al montar y cada vez que cambia de ruta
  useEffect(() => {
    if (user && pathname !== '/login') {
      captureAndSendLocation();
    }
  }, [pathname, user, captureAndSendLocation]);

  // 2. Escuchar eventos manuales para forzar actualización (login, logout, crear pedido, etc.)
  useEffect(() => {
    const handleForceUpdate = () => {
      if (user) {
        captureAndSendLocation(true);
      }
    };
    window.addEventListener('force_gps_update', handleForceUpdate);
    return () => window.removeEventListener('force_gps_update', handleForceUpdate);
  }, [user, captureAndSendLocation]);

  // 3. Timer para actualizar GPS automáticamente en segundo plano
  useEffect(() => {
    if (!user || !profile) return;
    if (pathname === '/login') return;

    // 3 minutos para repartidores (están en movimiento), 15 minutos para otros (estáticos)
    const intervalTime = profile.role === 'repartidor' ? 180000 : 900000;

    const intervalId = setInterval(() => {
      captureAndSendLocation(true);
    }, intervalTime);

    return () => clearInterval(intervalId);
  }, [user, profile, pathname, captureAndSendLocation]);

  // Este componente ya no renderiza nada — es puramente lógica en segundo plano
  return null;
}
