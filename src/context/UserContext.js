'use client';

import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';

const UserContext = createContext();

export function UserProvider({ children }) {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const mountedRef = useRef(true);

  async function fetchProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (mountedRef.current) {
        setProfile(data || null);
      }
    } catch {
      // Si falla el fetch del perfil, no bloquear la carga
    } finally {
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }

  function handleNoSession() {
    if (!mountedRef.current) return;
    setUser(null);
    setProfile(null);
    setLoading(false);
    // Redirigir solo si NO estamos ya en /login (sin depender de router/pathname)
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
  }

  useEffect(() => {
    mountedRef.current = true;

    // 1. Verificar sesión inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!mountedRef.current) return;
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        handleNoSession();
      }
    });

    // 2. Escuchar cambios de autenticación (login / logout / refresh)
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mountedRef.current) return;
      if (session?.user) {
        setUser(session.user);
        fetchProfile(session.user.id);
      } else {
        handleNoSession();
      }
    });

    return () => {
      mountedRef.current = false;
      authListener.subscription.unsubscribe();
    };
  }, []); // ← Sin dependencias: solo se ejecuta UNA vez al montar

  return (
    <UserContext.Provider value={{ user, profile, loading }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
