'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';

export default function NotificationListener({ children }) {
  const { profile } = useUser();
  const [toasts, setToasts] = useState([]);
  const audioCtxRef = useRef(null);

  // Initialize Audio Context gracefully on first user interaction to bypass autoplay rules
  useEffect(() => {
    const initAudio = () => {
      if (!audioCtxRef.current) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          audioCtxRef.current = new AudioContext();
        }
      }
      if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
      }
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
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      
      const oscillator = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();

      oscillator.type = 'sine';
      // Tonos más amigables (tipo gota/pop)
      oscillator.frequency.setValueAtTime(800, audioCtx.currentTime); 
      oscillator.frequency.exponentialRampToValueAtTime(1400, audioCtx.currentTime + 0.05);

      gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
      gainNode.gain.linearRampToValueAtTime(0.1, audioCtx.currentTime + 0.02); // Volumen bajo para que no moleste
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

          // Add to toast
          const toastId = Date.now();
          setToasts(current => [...current, { ...newNotif, _id: toastId }]);

          // Auto-remove after 4s
          setTimeout(() => {
            setToasts(current => current.filter(t => t._id !== toastId));
          }, 4000);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [profile?.id, playNotificationSound]);

  return (
    <>
      {children}
      
      {/* Toast Container - Reducido */}
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
        maxWidth: 320, // Más estrecho
        margin: '0 auto'
      }}>
        {toasts.map((toast) => (
          <div key={toast._id} 
               onClick={() => {
                 setToasts(current => current.filter(t => t._id !== toast._id));
               }}
               style={{
                 pointerEvents: 'auto',
                 background: 'var(--glass-bg, rgba(255, 255, 255, 0.95))',
                 backdropFilter: 'blur(12px)',
                 WebkitBackdropFilter: 'blur(12px)',
                 padding: '10px 14px', // padding reducido
                 borderRadius: '12px',
                 boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                 borderLeft: `3px solid ${toast.tipo === 'nuevo_pedido' ? 'var(--brand)' : '#f59e0b'}`,
                 animation: 'slideDown 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                 cursor: 'pointer',
                 display: 'flex',
                 alignItems: 'center',
                 gap: '10px'
               }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>
              {toast.tipo === 'nuevo_pedido' ? '🆕' : '🔄'}
            </span>
            <div style={{ flex: 1 }}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--text-main)', lineHeight: 1.3, fontWeight: 500 }}>
                {toast.mensaje}
              </p>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
