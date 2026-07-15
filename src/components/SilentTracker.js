'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';
import { usePathname } from 'next/navigation';

export default function SilentTracker() {
  const { user, profile } = useUser();
  const pathname = usePathname();
  const [needsPrompt, setNeedsPrompt] = useState(false); 

  // Función para capturar y enviar ubicación con throttle
  const captureAndSendLocation = () => {
    if (!user) return;
    
    const lastUpdate = localStorage.getItem('last_gps_update');
    const now = new Date().getTime();
    
    // Throttle de 10 minutos (600,000 ms)
    if (lastUpdate && now - parseInt(lastUpdate) < 600000) {
      return; 
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          
          // Guardamos que ya tiene permiso
          localStorage.setItem('gps_granted', 'true');
          setNeedsPrompt(false);
          
          // Actualizar Supabase de forma silenciosa
          await supabase
            .from('profiles')
            .update({ 
              latitud: latitude, 
              longitud: longitude, 
              ultima_actualizacion: new Date().toISOString() 
            })
            .eq('id', user.id);
            
          localStorage.setItem('last_gps_update', now.toString());
        },
        (error) => {
          console.error("Error obteniendo GPS silencioso:", error);
          if (error.code === 1) { // 1 = PERMISSION_DENIED
             localStorage.setItem('gps_denied', 'true');
             setNeedsPrompt(false);
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      );
    }
  };

  // 1. Revisar estado de permisos al montar
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const isGranted = localStorage.getItem('gps_granted') === 'true';
    const isDenied = localStorage.getItem('gps_denied') === 'true';
    
    if (isGranted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNeedsPrompt(false);
    } else if (!isDenied) {
      // Verificamos si la API de permisos está disponible (Safari no la soporta completamente para GPS a veces)
      try {
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'geolocation' }).then((result) => {
            if (result.state === 'granted') {
              localStorage.setItem('gps_granted', 'true');
              setNeedsPrompt(false);
            } else if (result.state === 'prompt') {
              setNeedsPrompt(true);
            } else {
              localStorage.setItem('gps_denied', 'true');
            }
          }).catch(() => {
            setNeedsPrompt(true);
          });
        } else {
          setNeedsPrompt(true);
        }
      } catch (e) {
        // Fallback si lanza error síncrono
        setNeedsPrompt(true);
      }
    }
  }, []);

  // 2. Ejecutar captura silenciosa cada vez que cambia de ruta o da clics
  useEffect(() => {
    const isGranted = localStorage.getItem('gps_granted') === 'true';
    if (isGranted && user) {
      captureAndSendLocation();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, user]);

  // Global click listener to track user interactions
  useEffect(() => {
    const handleClick = () => {
      const isGranted = localStorage.getItem('gps_granted') === 'true';
      if (isGranted && user) {
        captureAndSendLocation();
      }
    };
    
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  if (!needsPrompt || !profile) return null;
  if (pathname === '/login') return null;

  // Si requiere prompt, mostramos el mensaje personalizado por rol
  let mensaje = "";
  let textoBoton = "";

  if (profile.role === 'vendedor') {
    mensaje = "Para mostrarte las droguerías y clientes más cercanos a tu posición actual y facilitar tu toma de pedidos, necesitamos tu ubicación.";
    textoBoton = "🔍 Buscar Droguerías Cercanas";
  } else if (profile.role === 'repartidor') {
    mensaje = "MediTrack necesita acceso a tu ubicación para calcular tu ruta óptima de reparto y estimar el orden de tus entregas.";
    textoBoton = "🗺️ Iniciar Ruta de Reparto";
  } else if (profile.role === 'admin') {
    mensaje = "Para centrar el mapa logístico y mostrar la distancia con respecto a tu posición, activa la ubicación.";
    textoBoton = "📍 Centrar Mapa";
  } else {
    return null;
  }

  const requestPermission = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          localStorage.setItem('gps_granted', 'true');
          setNeedsPrompt(false);
          captureAndSendLocation();
          
          // Si es vendedor, forzamos recarga suave o emitimos evento para que se ordene la lista
          if (profile.role === 'vendedor') {
            window.dispatchEvent(new Event('gps_activated'));
          }
        },
        (err) => {
          if (err.code === 1) { // 1 = PERMISSION_DENIED
             localStorage.setItem('gps_denied', 'true');
             setNeedsPrompt(false);
          }
        }
      );
    }
  };

  return (
    <div style={{
      background: '#fffbeb', border: '1px solid #fde68a', borderRadius: '16px', 
      padding: '16px', margin: '16px auto', maxWidth: '600px',
      display: 'flex', flexDirection: 'column', gap: '12px',
      boxShadow: '0 4px 15px rgba(217, 119, 6, 0.1)',
      zIndex: 100, position: 'relative'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span style={{ fontSize: '24px', lineHeight: 1 }}>📍</span>
        <p style={{ margin: 0, fontSize: '13px', color: '#92400e', fontWeight: '600', lineHeight: 1.4 }}>
          {mensaje}
        </p>
      </div>
      <button 
        onClick={requestPermission}
        style={{
          background: '#d97706', color: 'white', border: 'none', 
          padding: '12px', borderRadius: '12px', fontWeight: '800', 
          fontSize: '14px', cursor: 'pointer',
          boxShadow: '0 4px 10px rgba(217, 119, 6, 0.3)'
        }}
      >
        {textoBoton}
      </button>
    </div>
  );
}
