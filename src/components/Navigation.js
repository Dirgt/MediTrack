'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useUser } from '@/context/UserContext';
import ProfileSheet from '@/components/ProfileSheet';
import { supabase } from '@/lib/supabase';

export default function Navigation() {
  const pathname = usePathname();
  const { profile } = useUser();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificaciones, setNotificaciones] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const drawerRef = useRef(null);

  // Fetch unread count for badge
  useEffect(() => {
    if (!profile?.id) return;

    const fetchUnread = async () => {
      const { count } = await supabase
        .from('notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('leida', false);
      setUnreadCount(count || 0);
    };

    fetchUnread();

    const channel = supabase.channel(`nav_notif_${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${profile.id}` }, (payload) => {
        setUnreadCount(c => c + 1);
        // Prepend new notification to drawer list if it's open
        setNotificaciones(prev => [payload.new, ...prev]);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${profile.id}` }, payload => {
        if (payload.new.leida) {
          setUnreadCount(c => Math.max(0, c - 1));
          setNotificaciones(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id]);

  // Close drawer when clicking outside
  useEffect(() => {
    if (!showNotifDrawer) return;
    const handleClickOutside = (e) => {
      if (drawerRef.current && !drawerRef.current.contains(e.target)) {
        setShowNotifDrawer(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [showNotifDrawer]);

  const openNotifDrawer = useCallback(async () => {
    setShowNotifDrawer(v => !v);
    if (showNotifDrawer) return; // closing

    setLoadingNotifs(true);
    const { data } = await supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', profile.id)
      .order('creado_en', { ascending: false })
      .limit(20);

    setNotificaciones(data || []);
    setLoadingNotifs(false);

    // Mark all as read
    const unreadIds = (data || []).filter(n => !n.leida).map(n => n.id);
    if (unreadIds.length > 0) {
      await supabase.from('notificaciones').update({ leida: true }).in('id', unreadIds);
      setUnreadCount(0);
    }
  }, [showNotifDrawer, profile?.id]);

  if (pathname === '/login') return null;

  const navItems = [
    ...(profile?.role === 'admin'
      ? [{ href: '/admin/dashboard', emoji: '📊', label: 'Dashboard' }]
      : []),
    { href: '/', emoji: '➕', label: 'Crear' },
    { href: '/pedidos', emoji: '📦', label: 'Pedidos' },
  ];

  const adminItems = [
    ...(profile?.role === 'admin'
      ? [{ href: '/admin/configuracion', emoji: '⚙️', label: 'Configuración' }]
      : []),
  ];

  return (
    <>
      {/* Notification Drawer — popover above nav */}
      {showNotifDrawer && (
        <>
          {/* Backdrop (semi-transparent, closes drawer) */}
          <div
            onClick={() => setShowNotifDrawer(false)}
            style={{
              position: 'fixed', inset: 0,
              background: 'rgba(0,0,0,0.25)',
              zIndex: 850,
              backdropFilter: 'blur(2px)',
              WebkitBackdropFilter: 'blur(2px)',
              animation: 'fadeIn 0.15s ease',
            }}
          />

          {/* Drawer Panel */}
          <div
            ref={drawerRef}
            style={{
              position: 'fixed',
              bottom: 72, // just above nav bar
              left: 12,
              right: 12,
              maxWidth: 420,
              margin: '0 auto',
              background: 'white',
              borderRadius: 20,
              boxShadow: '0 -4px 40px rgba(0,0,0,0.18)',
              zIndex: 860,
              overflow: 'hidden',
              animation: 'slideUp 0.25s cubic-bezier(0.34,1.2,0.64,1)',
              maxHeight: '65vh',
              display: 'flex',
              flexDirection: 'column',
            }}
          >
            {/* Header */}
            <div style={{
              padding: '16px 18px 12px',
              borderBottom: '1px solid #f3f4f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18 }}>🔔</span>
                <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--brand-dark)' }}>
                  Notificaciones
                </span>
              </div>
              <button
                onClick={() => setShowNotifDrawer(false)}
                style={{
                  background: '#f3f4f6', border: 'none', borderRadius: 8,
                  width: 28, height: 28, display: 'flex', alignItems: 'center',
                  justifyContent: 'center', cursor: 'pointer', fontSize: 14,
                  color: '#6b7280',
                }}
              >
                ✕
              </button>
            </div>

            {/* Notifications List */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {loadingNotifs ? (
                <div style={{ padding: '32px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  Cargando...
                </div>
              ) : notificaciones.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center' }}>
                  <span style={{ fontSize: 36, display: 'block', marginBottom: 8 }}>📭</span>
                  <span style={{ color: '#9ca3af', fontSize: 13 }}>Sin notificaciones recientes</span>
                </div>
              ) : (
                notificaciones.map((notif, idx) => (
                  <div
                    key={notif.id}
                    onClick={async () => {
                      if (notif.order_id) {
                        setShowNotifDrawer(false);
                        // marcar como leída si no lo está
                        if (!notif.leida) {
                          await supabase.from('notificaciones').update({ leida: true }).eq('id', notif.id);
                        }
                        window.location.href = `/pedidos/${notif.order_id}`;
                      }
                    }}
                    style={{
                      padding: '12px 16px',
                      borderBottom: idx < notificaciones.length - 1 ? '1px solid #f9fafb' : 'none',
                      display: 'flex',
                      gap: 10,
                      alignItems: 'flex-start',
                      background: notif.leida ? 'white' : 'rgba(15,110,86,0.04)',
                      transition: 'background 0.2s',
                      cursor: notif.order_id ? 'pointer' : 'default',
                    }}
                  >
                    {/* Left accent bar */}
                    <div style={{
                      width: 3, borderRadius: 4, flexShrink: 0, alignSelf: 'stretch',
                      background: notif.tipo === 'nuevo_pedido' ? 'var(--brand)' : notif.tipo === 'cambio_estado' ? '#f59e0b' : '#ef4444',
                      opacity: notif.leida ? 0.35 : 1,
                    }} />

                    <span style={{ fontSize: 16, lineHeight: 1, marginTop: 2, flexShrink: 0 }}>
                      {notif.tipo === 'nuevo_pedido' ? '🆕' : notif.tipo === 'cambio_estado' ? '🔄' : '❌'}
                    </span>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        margin: '0 0 3px', fontSize: 13, lineHeight: 1.35,
                        fontWeight: notif.leida ? 500 : 700,
                        color: 'var(--text-main)',
                      }}>
                        {notif.mensaje}
                      </p>
                      <span style={{ fontSize: 11, color: '#9ca3af' }}>
                        {new Date(notif.creado_en).toLocaleString('es-CO', {
                          month: 'short', day: 'numeric',
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>

                    {/* Unread dot */}
                    {!notif.leida && (
                      <div style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: 'var(--brand)', flexShrink: 0, marginTop: 5,
                      }} />
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}

      <nav style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        justifyContent: 'space-around',
        alignItems: 'center',
        padding: '10px 0 max(16px, env(safe-area-inset-bottom))',
        zIndex: 900,
        boxShadow: '0 -2px 20px rgba(0,0,0,0.06)',
        maxWidth: 600,
        margin: '0 auto',
      }}>

        {/* Perfil */}
        <button
          onClick={() => setShowProfile(true)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, background: 'none', border: 'none', cursor: 'pointer',
            padding: '4px 10px', borderRadius: 12,
            transition: 'background 0.15s',
            WebkitTapHighlightColor: 'transparent',
          }}
        >
          <span style={{ fontSize: 22, lineHeight: 1 }}>👤</span>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--brand)', lineHeight: 1, marginTop: 4 }}>
            Mi Cuenta
          </span>
        </button>

        {/* Navegación principal */}
        {navItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textDecoration: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4, padding: '4px 10px', borderRadius: 12,
                background: isActive ? 'rgba(15,110,86,0.08)' : 'transparent',
                transition: 'background 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                fontSize: 22,
                filter: isActive ? 'none' : 'grayscale(100%) opacity(45%)',
                transition: 'filter 0.2s',
                lineHeight: 1,
                display: 'block'
              }}>
                {item.emoji}
              </span>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--brand)' : '#9ca3af',
                lineHeight: 1, marginTop: 4
              }}>
                {item.label}
              </span>
            </Link>
          );
        })}

        {/* Botón Campana — abre drawer */}
        <button
          onClick={openNotifDrawer}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, background: showNotifDrawer ? 'rgba(15,110,86,0.08)' : 'none',
            border: 'none', cursor: 'pointer',
            padding: '4px 10px', borderRadius: 12,
            transition: 'background 0.15s',
            WebkitTapHighlightColor: 'transparent',
            position: 'relative',
          }}
        >
          <div style={{ position: 'relative' }}>
            <span style={{
              fontSize: 22, lineHeight: 1, display: 'block',
              filter: showNotifDrawer ? 'none' : 'grayscale(40%) opacity(75%)',
              transition: 'filter 0.2s',
            }}>
              🔔
            </span>

            {/* Badge */}
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -4, right: -8,
                background: '#ef4444',
                color: 'white',
                fontSize: '10px',
                fontWeight: 'bold',
                padding: '2px 5px',
                borderRadius: '10px',
                lineHeight: 1,
                border: '2px solid white',
                animation: 'pulse 2s infinite',
                minWidth: 16,
                textAlign: 'center',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span style={{
            fontSize: 10,
            fontWeight: showNotifDrawer ? 700 : 500,
            color: showNotifDrawer ? 'var(--brand)' : '#9ca3af',
            lineHeight: 1, marginTop: 4
          }}>
            Notificación
          </span>
        </button>

        {/* Items Administrativos (Config) */}
        {adminItems.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              style={{
                textDecoration: 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: 4, padding: '4px 10px', borderRadius: 12,
                background: isActive ? 'rgba(15,110,86,0.08)' : 'transparent',
                transition: 'background 0.15s',
                WebkitTapHighlightColor: 'transparent',
              }}
            >
              <span style={{
                fontSize: 22,
                filter: isActive ? 'none' : 'grayscale(100%) opacity(45%)',
                transition: 'filter 0.2s',
                lineHeight: 1,
                display: 'block'
              }}>
                {item.emoji}
              </span>
              <span style={{
                fontSize: 10, fontWeight: isActive ? 700 : 500,
                color: isActive ? 'var(--brand)' : '#9ca3af',
                lineHeight: 1, marginTop: 4
              }}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Profile sheet */}
      {showProfile && <ProfileSheet onClose={() => setShowProfile(false)} />}

      <style>{`
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pulse   { 0%,100% { transform: scale(1) } 50% { transform: scale(1.15) } }
      `}</style>
    </>
  );
}
