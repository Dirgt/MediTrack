'use client';

import { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser]       = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true; // flag local al closure — no se comparte entre montajes

    async function fetchProfile(userId) {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (active) setProfile(data || null);
      } catch {
        // error al cargar perfil — no bloquear
      } finally {
        if (active) setLoading(false);
      }
    }

    // onAuthStateChange dispara INITIAL_SESSION al instalar → cubre el caso
    // de verificar sesión inicial Y de escuchar cambios futuros con un solo listener.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!active) return;

        if (session?.user) {
          setUser(session.user);
          await fetchProfile(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setLoading(false);
          // Redirigir a login solo si no estamos ya ahí
          if (typeof window !== 'undefined' &&
              !window.location.pathname.startsWith('/login')) {
            window.location.href = '/login';
          }
        }
      }
    );

    // Safety net: si después de 8s loading sigue en true, forzamos false
    // para evitar pantalla de carga infinita por errores de red / config
    const safetyTimer = setTimeout(() => {
      if (active) setLoading(false);
    }, 8000);

    return () => {
      active = false;
      subscription.unsubscribe();
      clearTimeout(safetyTimer);
    };
  }, []); // sin dependencias → un solo montaje

  return (
    <UserContext.Provider value={{ user, profile, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}

