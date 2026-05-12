'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import GuardarUbicacionModal from '@/components/GuardarUbicacionModal';

export default function MapaReparto({ pedidos = [], usuarioId, onUbicacionGuardada }) {
  const iframeRef = useRef(null);
  const [mapReady, setMapReady] = useState(false);
  const [userPos, setUserPos] = useState(null);
  const [clienteParaUbicar, setClienteParaUbicar] = useState(null);
  const [clientesData, setClientesData] = useState([]);
  const [loading, setLoading] = useState(true);
  
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [mostrarSugerencias, setMostrarSugerencias] = useState(false);
  const [filtroVista, setFiltroVista] = useState('sin_ubicar');

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

  useEffect(() => { fetchTodosLosClientes(); }, [fetchTodosLosClientes]);

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (p) => setUserPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true }
    );
  }, []);

  useEffect(() => {
    function onMessage(event) {
      if (!event.data || !event.data.type) return;
      if (event.data.type === 'MAP_READY') setMapReady(true);
      if (event.data.type === 'UPDATE_LOCATION') {
        const c = clientesData.find(x => x.id === event.data.clienteId);
        if (c) setClienteParaUbicar(c);
      }
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [clientesData]);

  useEffect(() => {
    if (!mapReady || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({
      type: 'SET_MARKERS',
      clientes: clientesData.filter(c => c.latitud && c.longitud),
      userPos: userPos,
    }, '*');
  }, [mapReady, clientesData, userPos]);

  const handleSaved = (c) => {
    setClienteParaUbicar(null);
    setTextoBusqueda('');
    fetchTodosLosClientes();
    onUbicacionGuardada?.(c);
  };

  const ubicadas = clientesData.filter(c => c.latitud && c.longitud);
  const sinUbicar = clientesData.filter(c => !c.latitud || !c.longitud);

  const sugerencias = textoBusqueda.length > 0 
    ? clientesData.filter(c => c.nombre.toLowerCase().includes(textoBusqueda.toLowerCase())).slice(0, 8)
    : [];

  return (
    <div style={{ position: 'relative', fontFamily: 'Inter, system-ui, sans-serif', color: '#1e293b' }}>
      
      {/* 1. BUSCADOR COMPACTO */}
      <div style={{ marginBottom: 16, position: 'relative' }}>
        <p style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>🔍 Buscar por nombre:</p>
        <div style={{ position: 'relative' }}>
          <input 
            type="text"
            placeholder="Escribe el nombre de la droguería..."
            value={textoBusqueda}
            onChange={(e) => {
              setTextoBusqueda(e.target.value);
              setMostrarSugerencias(true);
            }}
            onFocus={() => setMostrarSugerencias(true)}
            style={{ 
              width: '100%', padding: '12px 16px', borderRadius: 14, border: '1px solid #e2e8f0',
              fontSize: 14, background: '#fff', outline: 'none', boxShadow: '0 2px 4px rgba(0,0,0,0.02)'
            }}
          />
          
          {mostrarSugerencias && sugerencias.length > 0 && (
            <div style={{ 
              position: 'absolute', top: '105%', left: 0, right: 0, background: '#fff', 
              borderRadius: 14, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', border: '1px solid #f1f5f9', 
              zIndex: 1000, overflow: 'hidden'
            }}>
              {sugerencias.map(c => (
                <div 
                  key={c.id}
                  onClick={() => {
                    setClienteParaUbicar(c);
                    setMostrarSugerencias(false);
                    setTextoBusqueda('');
                  }}
                  style={{ 
                    padding: '12px 16px', borderBottom: '1px solid #f8fafc', cursor: 'pointer',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                  }}
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

      {/* 2. BOTONES DE ESTADO UNIFORMES */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <button 
          onClick={() => setFiltroVista('sin_ubicar')}
          style={{ 
            flex: 1, padding: '12px', borderRadius: 16, border: 'none',
            background: filtroVista === 'sin_ubicar' ? '#fff1f2' : '#f8fafc',
            border: filtroVista === 'sin_ubicar' ? '2px solid #ef4444' : '2px solid #f1f5f9',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 64
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900, color: filtroVista === 'sin_ubicar' ? '#b91c1c' : '#64748b' }}>{sinUbicar.length}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: filtroVista === 'sin_ubicar' ? '#b91c1c' : '#94a3b8' }}>❌ SIN UBICAR</div>
        </button>

        <button 
          onClick={() => setFiltroVista('ubicadas')}
          style={{ 
            flex: 1, padding: '12px', borderRadius: 16, border: 'none',
            background: filtroVista === 'ubicadas' ? '#f0fdf4' : '#f8fafc',
            border: filtroVista === 'ubicadas' ? '2px solid #22c55e' : '2px solid #f1f5f9',
            cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: 64
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900, color: filtroVista === 'ubicadas' ? '#15803d' : '#64748b' }}>{ubicadas.length}</div>
          <div style={{ fontSize: 10, fontWeight: 800, color: filtroVista === 'ubicadas' ? '#15803d' : '#94a3b8' }}>✅ UBICADAS</div>
        </button>
      </div>

      {/* 3. MAPA GRANDE */}
      <div style={{ width: '100%', height: 500, borderRadius: 24, overflow: 'hidden', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(0,0,0,0.08)', marginBottom: 20 }}>
        <iframe ref={iframeRef} src="/mapa.html" style={{ width: '100%', height: '100%', border: 'none' }} allow="geolocation" />
      </div>

      {/* 4. LISTADO DEBAJO */}
      <div>
        <p style={{ fontSize: 10, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 10, letterSpacing: '0.05em' }}>
           {filtroVista === 'sin_ubicar' ? '📍 Pendientes de ubicación' : '📌 Clientes en mapa'}
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {(filtroVista === 'sin_ubicar' ? sinUbicar : ubicadas).slice(0, 8).map((c) => (
            <div 
              key={c.id} 
              style={{ 
                padding: '12px 16px', borderRadius: 16, background: '#fff', 
                border: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center'
              }}
            >
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: 13, color: '#0f172a' }}>{c.nombre}</div>
                <div style={{ fontSize: 10, color: '#94a3b8' }}>{c.ciudad || 'Sin ciudad'}</div>
              </div>
              <button 
                onClick={() => setClienteParaUbicar(c)}
                style={{ 
                  padding: '8px 16px', borderRadius: 10, 
                  background: c.latitud ? '#f1f5f9' : '#0d9488', 
                  color: c.latitud ? '#64748b' : '#fff', 
                  border: 'none', fontSize: 11, fontWeight: 800, cursor: 'pointer' 
                }}
              >
                {c.latitud ? 'Ajustar' : 'Ubicar'}
              </button>
            </div>
          ))}
          {!loading && (filtroVista === 'sin_ubicar' ? sinUbicar : ubicadas).length === 0 && (
            <div style={{ textAlign: 'center', padding: 20, color: '#94a3b8', fontSize: 13 }}>No hay clientes en esta categoría.</div>
          )}
        </div>
      </div>

      {/* Modal de captura */}
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
