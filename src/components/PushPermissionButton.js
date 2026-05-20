'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export default function PushPermissionButton() {
  const { user } = useUser();
  const [permissionState, setPermissionState] = useState('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPermissionState('unsupported');
      setLoading(false);
      return;
    }

    setPermissionState(Notification.permission);
    
    // Check if already subscribed
    navigator.serviceWorker.ready.then(registration => {
      registration.pushManager.getSubscription().then(subscription => {
        setIsSubscribed(!!subscription);
        setLoading(false);
      });
    });
  }, []);

  const subscribeUser = async () => {
    if (!user) return;
    setLoading(true);
    
    try {
      const permission = await Notification.requestPermission();
      setPermissionState(permission);

      if (permission !== 'granted') {
        throw new Error('Permiso de notificaciones denegado');
      }

      const registration = await navigator.serviceWorker.ready;
      
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        throw new Error('VAPID public key no configurada en .env.local');
      }

      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      const subJson = subscription.toJSON();

      // Guardar en Supabase
      const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
          user_id: user.id,
          endpoint: subJson.endpoint,
          p256dh: subJson.keys.p256dh,
          auth: subJson.keys.auth
        }, { onConflict: 'endpoint' });

      if (error) throw error;
      
      setIsSubscribed(true);
      alert('¡Notificaciones activadas exitosamente!');
    } catch (error) {
      console.error('Error al suscribir push:', error);
      alert('No se pudo activar las notificaciones. Intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  if (loading || permissionState === 'unsupported' || (permissionState === 'granted' && isSubscribed)) {
    return null; // Ocultar si está cargando, no soportado o ya suscrito
  }

  return (
    <div style={{
      margin: '16px 20px',
      padding: '16px',
      background: 'linear-gradient(135deg, #eff6ff 0%, #dbeafe 100%)',
      border: '1px solid #bfdbfe',
      borderRadius: '16px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 16
    }}>
      <div style={{ flex: 1 }}>
        <p style={{ margin: '0 0 4px', fontWeight: 700, fontSize: 14, color: '#1e3a8a' }}>
          🔔 ¡No te pierdas de nada!
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#1e40af', opacity: 0.9 }}>
          Activa las alertas para recibir avisos urgentes incluso cuando tengas la pantalla apagada.
        </p>
      </div>
      <button
        onClick={subscribeUser}
        style={{
          background: '#2563eb',
          color: 'white',
          border: 'none',
          padding: '8px 16px',
          borderRadius: '24px',
          fontWeight: 700,
          fontSize: 13,
          cursor: 'pointer',
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 14px rgba(37,99,235,0.3)'
        }}
      >
        Activar
      </button>
    </div>
  );
}
