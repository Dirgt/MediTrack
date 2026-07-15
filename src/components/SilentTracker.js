'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@/context/UserContext';
import { supabase } from '@/lib/supabase';
import { usePathname } from 'next/navigation';

export default function SilentTracker() {
  const { user, profile } = useUser();
  const pathname = usePathname();
  const [needsPrompt, setNeedsPrompt] = useState(false); 
  const [permisoDenegado, setPermisoDenegado] = useState(false);

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
          setPermisoDenegado(false);
          
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
             setPermisoDenegado(true);
             setNeedsPrompt(true);
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
    
    if (isGranted) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNeedsPrompt(false);
    } else {
      // Siempre obligamos a pedirlo si no está concedido
      try {
        if (navigator.permissions && navigator.permissions.query) {
          navigator.permissions.query({ name: 'geolocation' }).then((result) => {
            if (result.state === 'granted') {
              localStorage.setItem('gps_granted', 'true');
              setNeedsPrompt(false);
            } else if (result.state === 'denied') {
              setPermisoDenegado(true);
              setNeedsPrompt(true);
            } else {
              setNeedsPrompt(true);
            }
          }).catch(() => {
            setNeedsPrompt(true);
          });
        } else {
          setNeedsPrompt(true);
        }
      } catch (e) {
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
    mensaje = "Para mostrarte las droguerías más cercanas y facilitar tu toma de pedidos, necesitamos obligatoriamente tu ubicación.";
    textoBoton = "🔍 Activar GPS";
  } else if (profile.role === 'repartidor') {
    mensaje = "MediTrack necesita obligatoriamente acceso a tu ubicación para calcular tus rutas óptimas de reparto.";
    textoBoton = "🗺️ Iniciar GPS de Ruta";
  } else if (profile.role === 'admin') {
    mensaje = "Para usar el panel de logística y monitorear a los conductores, debes activar la ubicación.";
    textoBoton = "📍 Permitir Ubicación";
  } else {
    return null;
  }

  const requestPermission = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        () => {
          localStorage.setItem('gps_granted', 'true');
          setNeedsPrompt(false);
          setPermisoDenegado(false);
          captureAndSendLocation();
          
          if (profile.role === 'vendedor') {
            window.dispatchEvent(new Event('gps_activated'));
          }
        },
        (err) => {
          if (err.code === 1) { // 1 = PERMISSION_DENIED
             setPermisoDenegado(true);
             setNeedsPrompt(true);
          }
        }
      );
    } else {
      alert("Tu navegador no soporta geolocalización.");
    }
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 999999, background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(10px)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px'
    }}>
      <div style={{
        background: '#fffbeb', border: '2px solid #f59e0b', borderRadius: '32px', 
        padding: '40px 30px', maxWidth: '400px', width: '100%',
        display: 'flex', flexDirection: 'column', gap: '24px',
        boxShadow: '0 25px 60px rgba(217, 119, 6, 0.25)',
        textAlign: 'center',
        animation: 'popIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)'
      }}>
        <div style={{ fontSize: '56px', lineHeight: 1, margin: '0 auto', background: 'white', width: 90, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%', boxShadow: '0 10px 25px rgba(217, 119, 6, 0.15)' }}>📍</div>
        <div>
          <h2 style={{ fontSize: '22px', fontWeight: '900', color: '#92400e', margin: '0 0 12px', letterSpacing: '-0.5px' }}>
            Ubicación Obligatoria
          </h2>
          <p style={{ margin: 0, fontSize: '15px', color: '#b45309', fontWeight: '600', lineHeight: 1.5 }}>
            {permisoDenegado 
               ? "Has denegado el acceso a la ubicación. Para usar MediTrack, debes ir a la configuración de tu navegador (el ícono del candado arriba 🔒), permitir la ubicación y volver a intentarlo."
               : mensaje}
          </p>
        </div>
        <button 
          onClick={requestPermission}
          style={{
            background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: 'white', border: 'none', 
            padding: '16px', borderRadius: '18px', fontWeight: '900', 
            fontSize: '15px', cursor: 'pointer',
            boxShadow: '0 10px 25px rgba(217, 119, 6, 0.35)',
            transition: 'all 0.2s ease',
            textTransform: 'uppercase', letterSpacing: '0.5px'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          {permisoDenegado ? '🔄 Ya lo activé, Reintentar' : textoBoton}
        </button>
      </div>
      <style>{`
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.9) translateY(20px); }
          100% { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
