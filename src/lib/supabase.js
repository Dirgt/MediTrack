import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ── Limpiar sesiones antiguas de localStorage (migración a sessionStorage) ──
// Las versiones anteriores del cliente guardaban la sesión en localStorage,
// lo que causaba que todas las pestañas compartieran la misma sesión.
// Este bloque elimina esas claves antiguas UNA SOLA VEZ al cargar la app.
if (typeof window !== 'undefined') {
  const keysToRemove = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    // Supabase guarda sus tokens con el prefijo 'sb-' o 'supabase'
    if (key && (key.startsWith('sb-') || key.startsWith('supabase-auth'))) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => window.localStorage.removeItem(key));
}

// ── Adaptador sessionStorage: sesión aislada por pestaña ──
// Cada pestaña del navegador tendrá su propia sesión independiente,
// permitiendo múltiples usuarios autenticados simultáneamente.
const sessionStorageAdapter = typeof window !== 'undefined' ? {
  getItem: (key) => window.sessionStorage.getItem(key),
  setItem: (key, value) => window.sessionStorage.setItem(key, value),
  removeItem: (key) => window.sessionStorage.removeItem(key),
} : undefined;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: sessionStorageAdapter,
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});
