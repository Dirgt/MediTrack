'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { useUser } from '@/context/UserContext';

const ROLE_LABELS = {
  admin: { label: 'Administrador', emoji: '🛡️', color: '#8b5cf6' },
  vendedor: { label: 'Vendedor Ejecutivo', emoji: '🤝', color: '#0F6E56' },
};

export default function ProfileSheet({ onClose }) {
  const { user, profile } = useUser();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [stats, setStats] = useState({ pedidos: '—', clientes: '—' });

  useEffect(() => {
    if (profile?.role !== 'vendedor' || !profile?.id) return;
    const fetchStats = async () => {
      const [{ count: pedidos }, { count: clientes }] = await Promise.all([
        supabase
          .from('pedidos')
          .select('*', { count: 'exact', head: true })
          .eq('vendedor_id', profile.id),
        supabase
          .from('clientes')
          .select('*', { count: 'exact', head: true })
          .eq('vendedor_id', profile.id),
      ]);
      setStats({
        pedidos: pedidos ?? 0,
        clientes: clientes ?? 0,
      });
    };
    fetchStats();
  }, [profile?.id, profile?.role]);

  const handleLogout = async () => {
    setLoggingOut(true);
    sessionStorage.removeItem('meditrack_session_start');
    await supabase.auth.signOut();
    onClose();
    router.push('/login');
  };

  const roleInfo = ROLE_LABELS[profile?.role] || ROLE_LABELS.vendedor;
  const initials = (profile?.nombre_completo || 'U')
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)',
          zIndex: 998, backdropFilter: 'blur(2px)',
          animation: 'fadeIn 0.2s ease',
        }}
      />

      {/* Sheet */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderRadius: '24px 24px 0 0',
        zIndex: 999, padding: '12px 0 32px',
        boxShadow: '0 -8px 40px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.3s cubic-bezier(0.34,1.2,0.64,1)',
        maxWidth: 600, margin: '0 auto',
      }}>
        {/* Handle bar */}
        <div style={{
          width: 40, height: 4, borderRadius: 4,
          background: '#e5e7eb', margin: '0 auto 20px',
        }} />

        {/* Profile header */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          padding: '0 24px 24px', borderBottom: '1px solid #f3f4f6',
        }}>
          {/* Avatar */}
          <div style={{
            width: 70, height: 70, borderRadius: '50%',
            background: `linear-gradient(135deg, ${roleInfo.color}, ${roleInfo.color}99)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, fontWeight: 800, color: 'white',
            boxShadow: `0 6px 20px ${roleInfo.color}44`,
            marginBottom: 14,
          }}>
            {initials}
          </div>

          <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--brand-dark)' }}>
            {profile?.nombre_completo || 'Usuario'}
          </h3>
          <p style={{ margin: '4px 0 10px', fontSize: 13, color: 'var(--text-muted)' }}>
            {user?.email}
          </p>

          {/* Role badge */}
          <span style={{
            padding: '5px 14px', borderRadius: 20,
            background: `${roleInfo.color}15`,
            color: roleInfo.color,
            fontSize: 12, fontWeight: 700,
            border: `1px solid ${roleInfo.color}30`,
          }}>
            {roleInfo.emoji} {roleInfo.label}
          </span>
        </div>

        {/* Stats row (vendedores) */}
        {profile?.role === 'vendedor' && (
          <div style={{
            display: 'flex', gap: 0,
            borderBottom: '1px solid #f3f4f6',
          }}>
            {[
              { label: 'Mis Pedidos', value: stats.pedidos, icon: '📦' },
              { label: 'Mis Clientes', value: stats.clientes, icon: '🤝' },
            ].map((stat, i) => (
              <div key={stat.label} style={{
                flex: 1, textAlign: 'center', padding: '16px 8px',
                borderRight: i === 0 ? '1px solid #f3f4f6' : 'none',
              }}>
                <div style={{ fontSize: 20, marginBottom: 4 }}>{stat.icon}</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: 'var(--brand)' }}>{stat.value}</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Actions */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            style={{
              width: '100%', padding: '16px', borderRadius: 16, border: 'none',
              background: loggingOut ? '#fee2e2' : 'rgba(239,68,68,0.08)',
              color: '#dc2626', fontSize: 16, fontWeight: 700, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              transition: 'all 0.2s',
              border: '1px solid rgba(239,68,68,0.2)',
            }}
          >
            {loggingOut ? (
              <>
                <div style={{
                  width: 18, height: 18, borderRadius: '50%',
                  border: '2px solid rgba(220,38,38,0.3)', borderTopColor: '#dc2626',
                  animation: 'spin 0.7s linear infinite'
                }} />
                Cerrando sesión...
              </>
            ) : (
              <>🚪 Cerrar Sesión</>
            )}
          </button>

          <button onClick={onClose} style={{
            width: '100%', padding: '14px', borderRadius: 16, border: '1.5px solid #e5e7eb',
            background: 'transparent', color: 'var(--text-muted)', fontSize: 15,
            fontWeight: 600, cursor: 'pointer',
          }}>
            Cancelar
          </button>
        </div>
      </div>

      <style jsx>{`
        @keyframes fadeIn { from { opacity: 0 } to { opacity: 1 } }
        @keyframes slideUp { from { transform: translateY(100%) } to { transform: translateY(0) } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </>
  );
}
