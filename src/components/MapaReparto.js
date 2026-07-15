'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import GuardarUbicacionModal from '@/components/GuardarUbicacionModal';
import { useUser } from '@/context/UserContext';

const STORAGE_KEY = 'meditrack_ruta';

export default function MapaReparto({ pedidos, usuarioId, onUbicacionGuardada, onOrdenCalculado }) {
  const iframeRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [clienteParaUbicar, setClienteParaUbicar] = useState(null);
  const [clientesData, setClientesData] = useState([]);
  const [usuariosData, setUsuariosData] = useState([]);
  const [loading, setLoading] = useState(true);

  const { profile } = useUser();
  const isAdmin = profile?.role === 'admin';

  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [filtroVista, setFiltroVista] = useState('sin_ubicar');

  // ── Estado de Ruta ──
  const [rutaActiva, setRutaActiva] = useState(false);
  const [rutaInfo, setRutaInfo] = useState(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState(null);
  const [totalInicial, setTotalInicial] = useState(null);
  const rutaActivaRef = useRef(false); // Espejo de rutaActiva sin causar cambio de tamaño en dep arrays
  const hasFittedBoundsRef = useRef(false); // Evitar que el mapa salte cada vez que entra un GPS

  // Modo de operación: si le pasan la prop 'pedidos' (incluso vacía), es 'reparto'.
  // Si no se la pasan (es undefined), es 'gestion' (admin de ubicaciones).
  const modoReparto = pedidos !== undefined;
  const safePedidos = useMemo(() => pedidos || [], [pedidos]);

  const fetchTodosLosClientes = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('clientes')
      .select('*')
      .eq('activo', true)
      .order('nombre', { ascending: true });

    if (data) setClientesData(data);
    setLoading(false);
  }, []);

  const fetchTodosLosUsuarios = useCallback(async () => {
    // Solo omitimos fetch si estamos en modo reparto y NO somos administradores
    if (modoReparto && !isAdmin) return; 

    const { data } = await supabase
      .from('profiles')
      .select('id, role, nombre_completo, latitud, longitud, ultima_actualizacion');

    if (data) {
       const twelveHoursAgo = new Date(Date.now() - 12 * 60 * 60 * 1000);
       const validos = data.filter(u => u.latitud && u.longitud && new Date(u.ultima_actualizacion) > twelveHoursAgo);
       setUsuariosData(validos);
    }
  }, [modoReparto, isAdmin]);

  // Cargar todos los clientes siempre
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchTodosLosClientes();
    fetchTodosLosUsuarios();
  }, [fetchTodosLosClientes, fetchTodosLosUsuarios]);

  // Escuchar cambios realtime en profiles (GPS)
  useEffect(() => {
    if (modoReparto && !isAdmin) return;
    const subscription = supabase
      .channel('public:profiles_gps')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'profiles' }, () => {
         fetchTodosLosUsuarios();
      })
      .subscribe();
    return () => { supabase.removeChannel(subscription); };
  }, [modoReparto, isAdmin, fetchTodosLosUsuarios]);

  // Restaurar ruta previa desde localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setRutaInfo(parsed);
        setRutaActiva(true);
      }
    } catch (_) {}
  }, []);

  // Obtener GPS del repartidor/admin constantemente
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    
    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setRouteError(null); // Limpiar error si llega el GPS
      },
      (err) => {
        console.error('Error obteniendo GPS en MapaReparto:', err);
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Escuchar mensajes del iframe (mapa)
  useEffect(() => {
    function onMessage(event) {
      if (!event.data || !event.data.type) return;

      if (event.data.type === 'MAP_READY') setMapReady(true);

      if (event.data.type === 'UPDATE_LOCATION') {
        // Modo gestión: abrir modal para ubicar cliente
        const fuente = modoReparto ? safePedidos : clientesData;
        const c = fuente.find(x => x.id === event.data.clienteId || x.cliente_id === event.data.clienteId);
        if (c) setClienteParaUbicar(c);
      }

      if (event.data.type === 'ROUTE_INFO') {
        const info = {
          distance: event.data.distance,
          duration: event.data.duration,
          googleMapsUrl: event.data.googleMapsUrl,
          wazeUrl: event.data.wazeUrl,
          nextClientName: event.data.nextClientName,
          orderedClientIds: event.data.orderedClientIds,
        };
        setRutaInfo(info);
        setRutaActiva(true);
        rutaActivaRef.current = true;
        setRouteError(null);
        // Persistir en localStorage
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(info)); } catch (_) {}
        // Notificar al padre el nuevo orden para sincronizar la lista
        onOrdenCalculado?.(event.data.orderedClientIds || []);
      }

      if (event.data.type === 'ROUTE_LOADING') {
        setRouteLoading(event.data.loading);
      }

      if (event.data.type === 'ROUTE_ERROR') {
        setRouteError(event.data.message);
        setRouteLoading(false);
      }
    }

    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clientesData, safePedidos, modoReparto, onOrdenCalculado]);

  // Enviar markers al mapa (todos los clientes) — solo cuando NO hay ruta activa calculada
  useEffect(() => {
    if (!mapReady || !iframeRef.current?.contentWindow) return;
    if (rutaActivaRef.current) return;
    
    const shouldFitBounds = !hasFittedBoundsRef.current;
    if (clientesData.length > 0 || usuariosData.length > 0) {
      hasFittedBoundsRef.current = true;
    }

    iframeRef.current.contentWindow.postMessage({
      type: 'SET_MARKERS',
      clientes: clientesData.filter(c => c.latitud && c.longitud),
      usuarios: usuariosData,
      userPos,
      fitBounds: shouldFitBounds
    }, '*');
  }, [mapReady, clientesData, usuariosData, userPos]);

  // Hook vacío para mantener la cantidad de hooks
  useEffect(() => {}, []);

  // ── Función principal: calcular ruta óptima ──
  const calcularRutaOptima = useCallback(() => {
    if (!mapReady || !iframeRef.current?.contentWindow) return;
    if (!userPos) {
      setRouteError('Activa el GPS para calcular la ruta.');
      return;
    }

    const clientesParaRuta = modoReparto
      ? safePedidos.filter(p => p.latitud && p.longitud)
      : clientesData.filter(c => c.latitud && c.longitud);

    if (clientesParaRuta.length === 0) {
      setRouteError('No hay clientes con GPS para calcular la ruta.');
      return;
    }

    // Guardar el total inicial (solo la primera vez)
    setTotalInicial(prev => {
      if (prev === null) return modoReparto ? safePedidos.length : clientesParaRuta.length;
      return prev;
    });

    setRouteError(null);
    iframeRef.current.contentWindow.postMessage({
      type: 'CALCULATE_ROUTE',
      clientes: clientesParaRuta,
      userPos,
    }, '*');
  }, [mapReady, userPos, modoReparto, safePedidos, clientesData]);

  // ── Auto-recálculo cuando la lista de pedidos cambia (Realtime) ──
  useEffect(() => {
    if (!rutaActiva || !mapReady || !modoReparto) return;
    if (safePedidos.length === 0) {
      // Jornada completa: limpiar localStorage
      try { localStorage.removeItem(STORAGE_KEY); } catch (_) {}
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRutaActiva(false);
      rutaActivaRef.current = false;
      setRutaInfo(null);
      setTotalInicial(null);
      return;
    }
    calcularRutaOptima();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [safePedidos]);

  const handleSaved = (c) => {
    setClienteParaUbicar(null);
    setTextoBusqueda('');
    if (!modoReparto) {
      fetchTodosLosClientes();
    }
    onUbicacionGuardada?.(c);
  };

  // ── Datos derivados ──
  const clientesBase = clientesData;
  const ubicadas = clientesBase.filter(c => c.latitud && c.longitud);
  const sinUbicar = clientesBase.filter(c => !c.latitud || !c.longitud);

  // Datos específicos de los pedidos del repartidor actual (para alertas y rutas)
  const pedidosUbicados = safePedidos.filter(p => p.latitud && p.longitud);
  const pedidosSinUbicar = safePedidos.filter(p => !p.latitud || !p.longitud);

  const fuenteBusqueda = clientesData;

  const sugerencias = textoBusqueda.length > 0
    ? fuenteBusqueda.filter(c => c.nombre && c.nombre.toLowerCase().includes(textoBusqueda.toLowerCase())).slice(0, 8)
    : [];

  // Progreso de jornada
  const total = totalInicial;
  const rawCompletadas = total !== null ? total - safePedidos.length : 0;
  const completadas = Math.max(0, rawCompletadas);
  const progresoPct = total ? Math.min(100, Math.max(0, Math.round((completadas / total) * 100))) : 0;

  return (
    <div style={{ position: 'relative', fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b' }}>

      {/* ── BUSCADOR (Visible en todos los modos) ── */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔍 Buscar por nombre:</p>
        <div style={{ position: 'relative' }}>
          <input
            type="text"
            placeholder="Escribe el nombre de la droguería..."
            value={textoBusqueda}
            onChange={(e) => { setTextoBusqueda(e.target.value); setMostrarSugerencias(true); }}
            onFocus={() => setMostrarSugerencias(true)}
            style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: '1px solid #e2e8f0', fontSize: 14, background: '#fff', outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)' }}
          />
          {mostrarSugerencias && sugerencias.length > 0 && (
            <div style={{ position: 'absolute', top: '105%', left: 0, right: 0, background: '#fff', borderRadius: 14, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #f1f5f9', zIndex: 1000, overflow: 'hidden' }}>
              {sugerencias.map(c => (
                <div key={c.id} onClick={() => { setClienteParaUbicar(c); setMostrarSugerencias(false); setTextoBusqueda(''); }}
                  style={{ padding: '12px 16px', borderBottom: '1px solid #f8fafc', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                  onMouseEnter={(e) => e.currentTarget.style.background = '#f0fdfa'}
                  onMouseLeave={(e) => e.currentTarget.style.background = '#fff'}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{c.nombre}</div>
                    <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.ciudad || 'Sin ciudad'}</div>
                  </div>
                  <div style={{ fontSize: 9, fontWeight: 800, color: c.latitud ? '#10b981' : '#f59e0b', padding: '4px 8px', borderRadius: 6, background: c.latitud ? '#ecfdf5' : '#fff7ed' }}>
                    {c.latitud ? 'REGISTRADA' : 'UBICAR'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Filtros (Visibles en ambos modos) ── */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button onClick={() => setFiltroVista('sin_ubicar')} style={{ flex: 1, padding: '12px', borderRadius: 16, border: filtroVista === 'sin_ubicar' ? '2px solid #ef4444' : '2px solid #f1f5f9', background: filtroVista === 'sin_ubicar' ? '#fff1f2' : '#f8fafc', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 64 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: filtroVista === 'sin_ubicar' ? '#b91c1c' : '#64748b' }}>{sinUbicar.length}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: filtroVista === 'sin_ubicar' ? '#b91c1c' : '#94a3b8' }}>❌ SIN UBICAR</div>
        </button>
        <button onClick={() => setFiltroVista('ubicadas')} style={{ flex: 1, padding: '12px', borderRadius: 16, border: filtroVista === 'ubicadas' ? '2px solid #22c55e' : '2px solid #f1f5f9', background: filtroVista === 'ubicadas' ? '#f0fdf4' : '#f8fafc', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 64 }}>
          <div style={{ fontSize: 18, fontWeight: 900, color: filtroVista === 'ubicadas' ? '#15803d' : '#64748b' }}>{ubicadas.length}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: filtroVista === 'ubicadas' ? '#15803d' : '#94a3b8' }}>✅ UBICADAS</div>
        </button>
      </div>

      {/* ── MODO REPARTO: Banner de Próxima Entrega ── */}
      {modoReparto && rutaActiva && rutaInfo?.nextClientName && (
        <div style={{ marginBottom: 12, padding: '12px 16px', borderRadius: 16, background: 'linear-gradient(135deg,#0f172a,#1e293b)', color: '#fff', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>➡️</span>
          <div>
            <div style={{ fontSize: 10, fontWeight: 800, color: '#64748b', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Próxima entrega</div>
            <div style={{ fontSize: 15, fontWeight: 900 }}>{rutaInfo.nextClientName}</div>
          </div>
        </div>
      )}

      {/* ══ MODO REPARTO: Alerta de pedidos sin GPS ══ */}
      {modoReparto && pedidosSinUbicar.length > 0 && safePedidos.length > 0 && (
        <div style={{ marginBottom: 12, padding: '14px 16px', borderRadius: 16, background: '#fffbeb', border: '1px solid #fde68a', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ fontSize: 20, flexShrink: 0 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 900, color: '#92400e', marginBottom: 4 }}>
              {pedidosUbicados.length === 0
                ? 'No se puede iniciar la ruta: ningún cliente asignado está ubicado'
                : `${pedidosSinUbicar.length} pedido${pedidosSinUbicar.length > 1 ? 's' : ''} sin ubicación registrada — no se incluirá${pedidosSinUbicar.length > 1 ? 'n' : ''} en la ruta`
              }
            </div>
            <div style={{ fontSize: 11, color: '#b45309', marginBottom: 6 }}>
              {pedidosSinUbicar.map(p => p.cliente_nombre || p.nombre).join(', ')}
            </div>
            <div style={{ fontSize: 11, color: '#92400e', fontWeight: 700, background: 'rgba(146,64,14,0.08)', padding: '6px 10px', borderRadius: 8 }}>
              📞 Usa el buscador o comunícate con el administrador para registrar la ubicación de {pedidosSinUbicar.length > 1 ? 'estos clientes' : 'este cliente'}.
            </div>
          </div>
        </div>
      )}

      {/* ── MODO REPARTO: Barra de progreso ── */}
      {modoReparto && rutaActiva && total > 0 && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Progreso de la jornada</span>
            <span style={{ fontSize: 12, fontWeight: 900, color: '#0d9488' }}>✅ {completadas} de {total}</span>
          </div>
          <div style={{ height: 8, borderRadius: 100, background: '#e2e8f0', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: progresoPct + '%', borderRadius: 100, background: 'linear-gradient(90deg,#10b981,#0d9488)', transition: 'width 0.6s ease' }} />
          </div>
        </div>
      )}

      {/* ── Error de ruta ── */}
      {routeError && (
        <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 14, background: '#fef2f2', border: '1px solid #fecaca', fontSize: 12, fontWeight: 700, color: '#dc2626' }}>
          ❌ {routeError}
        </div>
      )}

      {/* ── MAPA + CONTROLES FLOTANTES ── */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <div style={{ width: '100%', height: 460, borderRadius: 24, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(0,0,0,0.08)' }}>
          <iframe
            ref={iframeRef}
            src="/mapa.html"
            style={{ width: '100%', height: '100%', border: 'none' }}
            allow="geolocation"
          />
        </div>

        {/* Controles flotantes — visibles en modo reparto para todos los roles */}
        {modoReparto && (
          <div style={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, zIndex: 10, width: '92%' }}>

            {/* Badge km/tiempo */}
            {rutaInfo && (
              <div style={{ background: '#0f172a', color: '#fff', padding: '8px 18px', borderRadius: 100, fontSize: 13, fontWeight: 800, boxShadow: '0 8px 20px rgba(0,0,0,0.3)', display: 'flex', alignItems: 'center', gap: 10 }}>
                <span>🚗 {(rutaInfo.distance / 1000).toFixed(1)} km</span>
                <span style={{ color: '#475569' }}>|</span>
                <span>⏱️ {Math.round(rutaInfo.duration / 60)} min</span>
              </div>
            )}

            {/* Botones de navegación externa */}
            {rutaInfo && (rutaInfo.wazeUrl || rutaInfo.googleMapsUrl) && (
              <div style={{ display: 'flex', gap: 8, width: '100%' }}>
                {rutaInfo.wazeUrl && (
                  <a href={rutaInfo.wazeUrl} target="_blank" rel="noopener noreferrer"
                    style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 14, background: '#33ccff', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 800, boxShadow: '0 4px 12px rgba(51,204,255,0.4)' }}>
                    🧭 Waze
                  </a>
                )}
                {rutaInfo.googleMapsUrl && (
                  <a href={rutaInfo.googleMapsUrl} target="_blank" rel="noopener noreferrer"
                    style={{ flex: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '11px', borderRadius: 14, background: '#4285f4', color: '#fff', textDecoration: 'none', fontSize: 13, fontWeight: 800, boxShadow: '0 4px 12px rgba(66,133,244,0.4)' }}>
                    📍 Maps Completo
                  </a>
                )}
              </div>
            )}

            {/* Botón principal */}
            <button
              id="btn-iniciar-ruta"
              onClick={calcularRutaOptima}
              disabled={routeLoading || pedidosUbicados.length === 0}
              style={{
                width: '100%', padding: '14px', borderRadius: 100, border: 'none',
                background: routeLoading || pedidosUbicados.length === 0 ? '#94a3b8' : 'linear-gradient(135deg,#1d4ed8,#2563eb)',
                color: '#fff', fontSize: 15, fontWeight: 900,
                cursor: routeLoading || pedidosUbicados.length === 0 ? 'not-allowed' : 'pointer',
                boxShadow: pedidosUbicados.length > 0 ? '0 8px 25px rgba(37,99,235,0.4)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s ease'
              }}
            >
              {routeLoading
                ? '⏳ Calculando ruta óptima...'
                : rutaActiva
                  ? '🔄 Recalcular Ruta'
                  : '🗺️ Iniciar Ruta Óptima'}
            </button>
            {/* Mensaje de ayuda cuando el botón está bloqueado */}
            {!routeLoading && pedidosUbicados.length === 0 && (
              <div style={{ textAlign: 'center', fontSize: 12, fontWeight: 700, color: '#64748b', marginTop: 4, padding: '0 10px' }}>
                {safePedidos.length === 0
                  ? 'No tienes pedidos asignados para entregar.'
                  : 'El botón se activará cuando tus pedidos tengan ubicación registrada.'}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Listado de clientes debajo (Visible en ambos modos) ── */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.05em' }}>
          {filtroVista === 'sin_ubicar' ? '📍 Pendientes de ubicación' : '📌 Clientes en mapa'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(filtroVista === 'sin_ubicar' ? sinUbicar : ubicadas).slice(0, 8).map((c) => (
            <div key={c.id} style={{ padding: '12px 16px', borderRadius: 16, background: '#fff', border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{c.nombre || c.cliente_nombre}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.ciudad || c.localidad || 'Sin ciudad'}</div>
              </div>
              <button onClick={() => setClienteParaUbicar(c)} style={{ padding: '8px 16px', borderRadius: 10, background: c.latitud ? '#f1f5f9' : '#0d9488', color: c.latitud ? '#64748b' : '#fff', border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                {c.latitud ? 'Ajustar' : 'Ubicar'}
              </button>
            </div>
          ))}
          {!loading && (filtroVista === 'sin_ubicar' ? sinUbicar : ubicadas).length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>No hay clientes en esta categoría.</div>
          )}
        </div>
      </div>

      {/* Modal de captura de ubicación */}
      {clienteParaUbicar && (
        <GuardarUbicacionModal
          cliente={clienteParaUbicar}
          usuarioId={usuarioId}
          onClose={() => setClienteParaUbicar(null)}
          onSaved={handleSaved}
        />
      )}
    </div>
  );
}
