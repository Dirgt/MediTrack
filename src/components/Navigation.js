'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState, useRef, useCallback } from 'react';
import { useUser } from '@/context/UserContext';
import ProfileSheet from '@/components/ProfileSheet';
import { supabase } from '@/lib/supabase';

export default function Navigation() {
  const pathname = usePathname();
  const router = useRouter();
  const { profile } = useUser();
  const [showProfile, setShowProfile] = useState(false);
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notificaciones, setNotificaciones] = useState([]);
  const [loadingNotifs, setLoadingNotifs] = useState(false);
  const drawerRef = useRef(null);

  const esRepartidor = profile?.role === 'repartidor';

  // Fetch unread count for badge
  useEffect(() => {
    if (!profile?.id) return;

    const fetchUnread = async () => {
      let query = supabase
        .from('notificaciones')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', profile.id)
        .eq('leida', false);
      // Repartidores solo ven notificaciones de asignación de reparto
      if (esRepartidor) query = query.eq('tipo', 'asignacion_reparto');
      const { count } = await query;
      setUnreadCount(count || 0);
    };

    fetchUnread();

    const channel = supabase.channel(`nav_notif_${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${profile.id}` }, (payload) => {
        // Repartidores solo procesan notificaciones de asignación
        if (esRepartidor && payload.new.tipo !== 'asignacion_reparto') return;

        setUnreadCount(c => c + 1);
        setNotificaciones(prev => [payload.new, ...prev]);
        
        // 🔊 Play sound alert
        try {
          const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
          audio.play().catch(e => console.log("Notification sound blocked by browser:", e));
        } catch (err) {
          console.error("Audio error:", err);
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${profile.id}` }, payload => {
        if (payload.new.leida) {
          // Repartidores solo procesan sus notificaciones relevantes
          if (esRepartidor && payload.new.tipo !== 'asignacion_reparto') return;
          setUnreadCount(c => Math.max(0, c - 1));
          setNotificaciones(prev => prev.map(n => n.id === payload.new.id ? payload.new : n));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [profile?.id, esRepartidor]);

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
    let query = supabase
      .from('notificaciones')
      .select('*')
      .eq('user_id', profile.id);
    // Repartidores solo ven notificaciones de asignación de reparto
    if (esRepartidor) query = query.eq('tipo', 'asignacion_reparto');
    const { data } = await query
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

  const isRepartidor = profile?.role === 'repartidor';
  const isAdmin = profile?.role === 'admin';

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
                          // Repartidores van a /reparto, los demás a /pedidos
                          if (isRepartidor) {
                            router.push('/reparto');
                          } else {
                            router.push(`/pedidos/${notif.order_id}`);
                          }
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

      <nav className="bottom-nav" style={{
        position: 'fixed',
        bottom: 0, left: 0, right: 0,
        background: 'rgba(255, 255, 255, 0.92)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(0,0,0,0.06)',
        display: 'flex',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        alignItems: 'center',
        padding: '10px 16px max(16px, env(safe-area-inset-bottom))',
        zIndex: 900,
        boxShadow: '0 -2px 20px rgba(0,0,0,0.06)',
        scrollbarWidth: 'none', /* Firefox */
        msOverflowStyle: 'none', /* IE and Edge */
      }}>

        {/* 1. Mi Cuenta — visible para todos */}
        <button
          onClick={() => setShowProfile(true)}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
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

        {/* 2. Dashboard (Solo Admin) */}
        {isAdmin && (
          <Link
            href="/admin/dashboard"
            style={{
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
              gap: 4, padding: '4px 10px', borderRadius: 12,
              background: pathname === '/admin/dashboard' ? 'rgba(15,110,86,0.08)' : 'transparent',
              transition: 'background 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: 22,
              filter: pathname === '/admin/dashboard' ? 'none' : 'grayscale(100%) opacity(45%)',
              transition: 'filter 0.2s',
              lineHeight: 1,
              display: 'block'
            }}>
              📊
            </span>
            <span style={{
              fontSize: 10, fontWeight: pathname === '/admin/dashboard' ? 700 : 500,
              color: pathname === '/admin/dashboard' ? 'var(--brand)' : '#9ca3af',
              lineHeight: 1, marginTop: 4
            }}>
              Dashboard
            </span>
          </Link>
        )}

        {/* 3. Crear — Solo admin y vendedor */}
        {!isRepartidor && (
          <Link
            href="/"
            style={{
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
              gap: 4, padding: '4px 10px', borderRadius: 12,
              background: pathname === '/' ? 'rgba(15,110,86,0.08)' : 'transparent',
              transition: 'background 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: 22,
              filter: pathname === '/' ? 'none' : 'grayscale(100%) opacity(45%)',
              transition: 'filter 0.2s',
              lineHeight: 1,
              display: 'block'
            }}>
              ➕
            </span>
            <span style={{
              fontSize: 10, fontWeight: pathname === '/' ? 700 : 500,
              color: pathname === '/' ? 'var(--brand)' : '#9ca3af',
              lineHeight: 1, marginTop: 4
            }}>
              Crear
            </span>
          </Link>
        )}

        {/* 4. Ver Pedido — Solo admin y vendedor */}
        {!isRepartidor && (
          <Link
            href="/pedidos"
            style={{
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
              gap: 4, padding: '4px 10px', borderRadius: 12,
              background: pathname === '/pedidos' ? 'rgba(15,110,86,0.08)' : 'transparent',
              transition: 'background 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: 22,
              filter: pathname === '/pedidos' ? 'none' : 'grayscale(100%) opacity(45%)',
              transition: 'filter 0.2s',
              lineHeight: 1,
              display: 'block'
            }}>
              📦
            </span>
            <span style={{
              fontSize: 10, fontWeight: pathname === '/pedidos' ? 700 : 500,
              color: pathname === '/pedidos' ? 'var(--brand)' : '#9ca3af',
              lineHeight: 1, marginTop: 4
            }}>
              Ver Pedido
            </span>
          </Link>
        )}

        {/* 4.5. Calendario — Solo admin y vendedor */}
        {!isRepartidor && (
          <Link
            href="/calendario"
            style={{
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
              gap: 4, padding: '4px 10px', borderRadius: 12,
              background: pathname === '/calendario' ? 'rgba(15,110,86,0.08)' : 'transparent',
              transition: 'background 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: 22,
              filter: pathname === '/calendario' ? 'none' : 'grayscale(100%) opacity(45%)',
              transition: 'filter 0.2s',
              lineHeight: 1,
              display: 'block'
            }}>
              📅
            </span>
            <span style={{
              fontSize: 10, fontWeight: pathname === '/calendario' ? 700 : 500,
              color: pathname === '/calendario' ? 'var(--brand)' : '#9ca3af',
              lineHeight: 1, marginTop: 4
            }}>
              Calendario
            </span>
          </Link>
        )}

        {/* 5. Reparto — Repartidores y Admin */}
        {(isRepartidor || isAdmin) && (
          <Link
            href="/reparto"
            style={{
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
              gap: 4, padding: '4px 10px', borderRadius: 12,
              background: pathname === '/reparto' ? 'rgba(13,148,136,0.12)' : 'transparent',
              transition: 'background 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: 22,
              filter: pathname === '/reparto' ? 'none' : 'grayscale(100%) opacity(45%)',
              transition: 'filter 0.2s',
              lineHeight: 1,
              display: 'block'
            }}>
              🚚
            </span>
            <span style={{
              fontSize: 10, fontWeight: pathname === '/reparto' ? 700 : 500,
              color: pathname === '/reparto' ? '#0d9488' : '#9ca3af',
              lineHeight: 1, marginTop: 4
            }}>
              Reparto
            </span>
          </Link>
        )}

        {/* 6. Notificación — visible para todos */}
        <button
          onClick={openNotifDrawer}
          style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
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
            {unreadCount > 0 && (
              <span style={{
                position: 'absolute',
                top: -4, right: -8,
                background: '#ef4444', color: 'white',
                fontSize: '10px', fontWeight: 'bold',
                padding: '2px 5px', borderRadius: '10px',
                lineHeight: 1, border: '2px solid white',
                animation: 'pulse 2s infinite',
                minWidth: 16, textAlign: 'center',
              }}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </div>
          <span style={{
            fontSize: 10, fontWeight: showNotifDrawer ? 700 : 500,
            color: showNotifDrawer ? 'var(--brand)' : '#9ca3af',
            lineHeight: 1, marginTop: 4
          }}>
            Notificación
          </span>
        </button>

        {/* 7. Configuración (Solo Admin) */}
        {isAdmin && (
          <Link
            href="/admin/configuracion"
            style={{
              textDecoration: 'none',
              display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0,
              gap: 4, padding: '4px 10px', borderRadius: 12,
              background: pathname === '/admin/configuracion' ? 'rgba(15,110,86,0.08)' : 'transparent',
              transition: 'background 0.15s',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            <span style={{
              fontSize: 22,
              filter: pathname === '/admin/configuracion' ? 'none' : 'grayscale(100%) opacity(45%)',
              transition: 'filter 0.2s',
              lineHeight: 1,
              display: 'block'
            }}>
              ⚙️
            </span>
            <span style={{
              fontSize: 10, fontWeight: pathname === '/admin/configuracion' ? 700 : 500,
              color: pathname === '/admin/configuracion' ? 'var(--brand)' : '#9ca3af',
              lineHeight: 1, marginTop: 4
            }}>
              Configuración
            </span>
          </Link>
        )}
      </nav>

      {/* Profile sheet */}
      {showProfile && <ProfileSheet onClose={() => setShowProfile(false)} />}

      <style>{`
        .bottom-nav {
          max-width: 600px;
          margin: 0 auto;
          justify-content: space-around;
        }
        @media (max-width: 480px) {
          .bottom-nav {
            justify-content: flex-start;
            gap: 12px;
          }
        }
        .bottom-nav::-webkit-scrollbar { display: none; }
        @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn  { from { opacity: 0 } to { opacity: 1 } }
        @keyframes pulse   { 0%,100% { transform: scale(1) } 50% { transform: scale(1.15) } }
      `}</style>
    </>
  );
}
