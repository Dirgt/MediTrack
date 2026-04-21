'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { useRouter } from 'next/navigation';

export default function Notificaciones() {
  const { profile } = useUser();
  const [notificaciones, setNotificaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!profile) return;

    const fetchNotificaciones = async () => {
      // 1. Cargar las notificaciones del usuario
      const { data, error } = await supabase
        .from('notificaciones')
        .select('*')
        .eq('user_id', profile.id)
        .order('creado_en', { ascending: false })
        .limit(50); // Traemos las últimas 50
      
      if (error) {
        console.error('Error fetching notifications:', error);
      } else {
        setNotificaciones(data || []);

        // 2. Marcar como leídas las que no lo estén
        const unreadIds = data?.filter(n => !n.leida).map(n => n.id) || [];
        if (unreadIds.length > 0) {
          await supabase
            .from('notificaciones')
            .update({ leida: true })
            .in('id', unreadIds);
        }
      }
      setLoading(false);
    };

    fetchNotificaciones();
  }, [profile]);

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Cargando notificaciones...
      </div>
    );
  }

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ padding: '24px 24px 16px', background: 'var(--brand)', color: 'white', borderRadius: '0 0 24px 24px', marginBottom: '24px' }}>
        <h1 style={{ margin: 0, fontSize: 28, color: 'white' }}>Notificaciones</h1>
        <p style={{ margin: '4px 0 0', opacity: 0.8, fontSize: 14 }}>
          Tus alertas más recientes.
        </p>
      </div>

      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {notificaciones.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: 'var(--text-muted)' }}>
            <span style={{ fontSize: 40, display: 'block', marginBottom: 12 }}>📭</span>
            No tienes notificaciones en este momento.
          </div>
        ) : (
          notificaciones.map((notif) => (
            <div 
              key={notif.id} 
              style={{
                background: 'white',
                padding: '16px',
                borderRadius: '16px',
                boxShadow: '0 2px 10px rgba(0,0,0,0.03)',
                borderLeft: `4px solid ${notif.tipo === 'nuevo_pedido' ? 'var(--brand)' : '#f59e0b'}`,
                opacity: notif.leida ? 0.7 : 1, // Visualmente atenuadas si ya estaban leídas
                transition: 'opacity 0.2s',
                display: 'flex',
                gap: '12px'
              }}
            >
              <div style={{ fontSize: 24, lineHeight: 1, marginTop: 4 }}>
                {notif.tipo === 'nuevo_pedido' ? '🆕' : '🔄'}
              </div>
              <div style={{ flex: 1 }}>
                <p style={{ 
                  margin: '0 0 6px', 
                  fontSize: 14, 
                  fontWeight: notif.leida ? 600 : 700,
                  color: 'var(--text-main)' 
                }}>
                  {notif.mensaje}
                </p>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {new Date(notif.creado_en).toLocaleString('es-CO', { 
                    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' 
                  })}
                </span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
