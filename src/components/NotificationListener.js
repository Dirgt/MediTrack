'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';

const TIPO_CFG = {
  nuevo_pedido:  { emoji: '🆕', borderColor: 'var(--brand)' },
  cambio_estado: { emoji: '🔄', borderColor: '#f59e0b'      },
  cancelado:     { emoji: '❌', borderColor: '#ef4444'      },
};

export default function NotificationListener({ children }) {
  const { profile } = useUser();
  const router = useRouter();
  const [toasts, setToasts] = useState([]);
  const audioCtxRef = useRef(null);

  // Initialize Audio Context gracefully on first user interaction
  useEffect(() => {
    const initAudio = () => {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) audioCtxRef.current = new AudioContext();
      }
      if (audioCtxRef.current?.state === 'suspended') audioCtxRef.current.resume();
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
    window.addEventListener('click', initAudio);
    window.addEventListener('touchstart', initAudio);
    return () => {
      window.removeEventListener('click', initAudio);
      window.removeEventListener('touchstart', initAudio);
    };
  }, []);

  const playNotificationSound = useCallback(() => {
    try {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        audioCtxRef.current = new AudioContext();
      }
      const audioCtx = audioCtxRef.current;
      if (audioCtx.state === 'suspended') audioCtx.resume();

      const oscillator = audioCtx.createOscillator();
      const gainNode   = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime);
      oscillator.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.05);
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.02);
      gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      oscillator.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      oscillator.start(audioCtx.currentTime);
      oscillator.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.warn('Audio bloqueado', e);
    }
  }, []);

  useEffect(() => {
    if (!profile?.id) return;

    const channel = supabase
      .channel(`notif_${profile.id}`)
      .on('postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notificaciones', filter: `user_id=eq.${profile.id}` },
        (payload) => {
          const newNotif = payload.new;
          playNotificationSound();

          const toastId = Date.now();
          setToasts(current => [...current, { ...newNotif, _id: toastId }]);
          setTimeout(() => {
            setToasts(current => current.filter(t => t._id !== toastId));
          }, 5000);
        }
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [profile?.id, playNotificationSound]);

  const handleToastClick = (toast) => {
    setToasts(current => current.filter(t => t._id !== toast._id));
    if (toast.order_id) router.push(`/pedidos/${toast.order_id}`);
  };

  const getCfg = (tipo) => TIPO_CFG[tipo] || { emoji: '🔔', borderColor: '#6b7280' };

  return (
    <>
      {children}

      {/* Toast Container */}
      <div style={{
        position: 'fixed',
        top: '16px',
        right: '16px',
        left: '16px',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        pointerEvents: 'none',
        maxWidth: 340,
        margin: '0 auto',
      }}>
        {toasts.map((toast) => {
          const cfg = getCfg(toast.tipo);
          return (
            <div
              key={toast._id}
              onClick={() => handleToastClick(toast)}
              style={{
                pointerEvents: 'auto',
                background: 'rgba(255,255,255,0.97)',
                backdropFilter: 'blur(16px)',
                WebkitBackdropFilter: 'blur(16px)',
                padding: '12px 16px',
                borderRadius: '16px',
                boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                borderLeft: `4px solid ${cfg.borderColor}`,
                animation: 'slideDownToast 0.35s cubic-bezier(0.34,1.2,0.64,1)',
                cursor: toast.order_id ? 'pointer' : 'default',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <span style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>{cfg.emoji}</span>
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, color: '#084032', lineHeight: 1.4, fontWeight: 600 }}>
                  {toast.mensaje}
                </p>
                {toast.order_id && (
                  <p style={{ margin: '3px 0 0', fontSize: 11, color: '#0F6E56', fontWeight: 700 }}>
                    Ver pedido →
                  </p>
                )}
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); setToasts(c => c.filter(t => t._id !== toast._id)); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 18, opacity: .4, lineHeight: 1, flexShrink: 0, padding: 0 }}
              >
                ×
              </button>
            </div>
          );
        })}
      </div>

      <style>{`
        @keyframes slideDownToast {
          from { opacity: 0; transform: translateY(-14px) scale(0.96); }
          to   { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
    </>
  );
}
