'use client';

import { useState, useRef, useEffect } from 'react';
import { guardarUbicacionCliente } from '@/app/actions/location_actions';

export default function GuardarUbicacionModal({ cliente, usuarioId, onClose, onSaved }) {
  const [pos, setPos] = useState({ lat: cliente.latitud || 4.62699, lng: cliente.longitud || -74.13852 });
  const [loading, setLoading] = useState(false);
  const [direccionBusqueda, setDireccionBusqueda] = useState(cliente.direccion || '');
  const [buscandoDireccion, setBuscandoDireccion] = useState(false);
  const iframeRef = useRef(null);

  useEffect(() => {
    const handleMessage = (e) => {
      if (e.data.type === 'PICKER_MOVE') {
        setPos({ lat: e.data.lat, lng: e.data.lng });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const initMap = () => {
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage({
        type: 'INIT_PICKER',
        lat: pos.lat,
        lng: pos.lng
      }, '*');
    }
  };

  const buscarDireccion = async () => {
    if (!direccionBusqueda) return;
    setBuscandoDireccion(true);
    try {
      // Usamos Nominatim de OpenStreetMap (Gratis y sin API Key)
      // Añadimos "Colombia" para filtrar mejor los resultados
      const query = encodeURIComponent(`${direccionBusqueda}, Colombia`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&limit=1`);
      const data = await res.json();

      if (data && data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        
        // Enviamos la nueva posición al mapa del iframe
        iframeRef.current.contentWindow.postMessage({
          type: 'MOVE_TO',
          lat: newLat,
          lng: newLng
        }, '*');
        
        setPos({ lat: newLat, lng: newLng });
      } else {
        alert('No se encontró esa dirección. Intenta ser más específico.');
      }
    } catch (error) {
      console.error('Error buscando dirección:', error);
    } finally {
      setBuscandoDireccion(false);
    }
  };

  const handleConfirmar = async () => {
    setLoading(true);
    const res = await guardarUbicacionCliente(cliente.id || cliente.nombre, pos.lat, pos.lng, direccionBusqueda, usuarioId);
    if (res.success) {
      onSaved(res.cliente);
    } else {
      alert('Error al guardar: ' + res.error);
    }
    setLoading(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ background: '#fff', width: '100%', maxWidth: 500, borderTopLeftRadius: 32, borderTopRightRadius: 32, padding: '24px', boxShadow: '0 -10px 40px rgba(0,0,0,0.2)', animation: 'slideUp 0.3s ease-out' }}>
        
        <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }}></div>
        
        <div style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 24 }}>📍</span> {cliente.nombre}
          </h2>
          <p style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>Escribe la dirección o ajusta el pin en el mapa</p>
        </div>

        {/* BUSCADOR DE DIRECCIÓN */}
        <div style={{ marginBottom: 16, display: 'flex', gap: 8 }}>
          <input 
            type="text" 
            placeholder="Ej: Carrera 72 # 3-50, Bogotá"
            value={direccionBusqueda}
            onChange={(e) => setDireccionBusqueda(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && buscarDireccion()}
            style={{ 
              flex: 1, padding: '12px 16px', borderRadius: 14, border: '2px solid #e2e8f0', 
              fontSize: 14, outline: 'none'
            }}
          />
          <button 
            onClick={buscarDireccion}
            disabled={buscandoDireccion}
            style={{ 
              padding: '0 20px', borderRadius: 14, background: '#0f172a', color: '#fff', 
              border: 'none', fontWeight: 700, fontSize: 13, cursor: 'pointer',
              opacity: buscandoDireccion ? 0.7 : 1
            }}
          >
            {buscandoDireccion ? '...' : 'Buscar'}
          </button>
        </div>

        {/* MAPA PICKER */}
        <div style={{ height: 260, borderRadius: 24, overflow: 'hidden', border: '1px solid #e2e8f0', background: '#f1f5f9', marginBottom: 20 }}>
          <iframe 
            ref={iframeRef} 
            src="/picker.html" 
            style={{ width: '100%', height: '100%', border: 'none' }}
            onLoad={initMap}
          />
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            onClick={onClose}
            style={{ flex: 1, padding: '16px', borderRadius: 16, border: '1px solid #e2e8f0', background: '#fff', fontWeight: 700, cursor: 'pointer' }}
          >
            Cancelar
          </button>
          <button 
            onClick={handleConfirmar}
            disabled={loading}
            style={{ flex: 2, padding: '16px', borderRadius: 16, border: 'none', background: '#0d9488', color: '#fff', fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}
          >
            {loading ? 'Guardando...' : '✅ Confirmar Ubicación'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
      `}</style>
    </div>
  );
}
