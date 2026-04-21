'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { usePathname } from 'next/navigation';

// ── Configuración de tiempos ──
const SESSION_DURATION_MS   = 12 * 60 * 60 * 1000;  // 12 horas
const WARNING_BEFORE_MS     = 10 * 60 * 1000;        // Avisar 10 minutos antes
const CHECK_INTERVAL_MS     = 30 * 1000;              // Verificar cada 30 segundos

export default function SessionGuard({ children }) {
  const pathname = usePathname();
  const [minutesLeft, setMinutesLeft] = useState(null);
  const [showWarning, setShowWarning] = useState(false);
  const [expired, setExpired] = useState(false);

  const handleLogout = useCallback(async () => {
    sessionStorage.removeItem('meditrack_session_start');
    await supabase.auth.signOut();
    window.location.href = '/login';
  }, []);

  useEffect(() => {
    // No monitorear en la página de login
    if (pathname === '/login') return;

    function checkSession() {
      const startStr = sessionStorage.getItem('meditrack_session_start');

      // Si no hay marca de inicio (recarga vieja, sesión legacy), la creamos ahora
      if (!startStr) {
        sessionStorage.setItem('meditrack_session_start', Date.now().toString());
        return;
      }

      const start = parseInt(startStr, 10);
      const now = Date.now();
      const elapsed = now - start;
      const remaining = SESSION_DURATION_MS - elapsed;

      if (remaining <= 0) {
        // Sesión expirada — cerrar sesión
        setExpired(true);
        setShowWarning(false);
        handleLogout();
        return;
      }

      const minsLeft = Math.ceil(remaining / 60000);

      if (remaining <= WARNING_BEFORE_MS) {
        // Estamos en la ventana de advertencia (últimos 10 min)
        setMinutesLeft(minsLeft);
        setShowWarning(true);
      } else {
        setShowWarning(false);
      }
    }

    // Chequear inmediatamente y luego en intervalos
    checkSession();
    const interval = setInterval(checkSession, CHECK_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [pathname, handleLogout]);

  // En login no renderizamos nada del guard
  if (pathname === '/login') return children;

  return (
    <>
      {children}

      {/* ── Banner de Advertencia ── */}
      {showWarning && !expired && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0,
          zIndex: 9999,
          background: 'linear-gradient(90deg, #f59e0b, #d97706)',
          color: 'white',
          padding: '12px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          boxShadow: '0 4px 20px rgba(217,119,6,0.4)',
          animation: 'slideDown 0.3s ease',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span style={{ fontSize: 22, lineHeight: 1 }}>⚠️</span>
            <div>
              <p style={{ margin: 0, fontWeight: 700, fontSize: 14 }}>
                Tu sesión expira en {minutesLeft} {minutesLeft === 1 ? 'minuto' : 'minutos'}
              </p>
              <p style={{ margin: 0, fontSize: 12, opacity: 0.9 }}>
                Guarda tus cambios. Serás redirigido al login automáticamente.
              </p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              padding: '6px 14px', borderRadius: 8,
              background: 'rgba(255,255,255,0.25)', border: '1px solid rgba(255,255,255,0.4)',
              color: 'white', fontSize: 12, fontWeight: 700,
              cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
            }}
          >
            Salir ahora
          </button>
        </div>
      )}

      {/* ── Modal de Sesión Expirada ── */}
      {expired && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 10000,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}>
          <div style={{
            background: 'white',
            borderRadius: 24,
            padding: '36px 28px',
            maxWidth: 360,
            width: '100%',
            textAlign: 'center',
            boxShadow: '0 20px 60px rgba(0,0,0,0.2)',
            animation: 'slideUp 0.3s ease',
          }}>
            <div style={{ fontSize: 52, marginBottom: 16 }}>🔒</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: 'var(--brand-dark)' }}>
              Sesión Expirada
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: '0 0 20px', lineHeight: 1.5 }}>
              Tu sesión de 12 horas ha finalizado por seguridad. Inicia sesión nuevamente para continuar.
            </p>
            <button
              onClick={() => window.location.href = '/login'}
              className="btn-primary"
              style={{ fontSize: 15 }}
            >
              🔑 Iniciar Sesión
            </button>
          </div>
        </div>
      )}
    </>
  );
}
