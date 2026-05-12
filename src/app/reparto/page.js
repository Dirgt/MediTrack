'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { registrarEntregaRepartidor } from '@/app/actions/order_actions';
import MapaReparto from '@/components/MapaReparto';
import GuardarUbicacionModal from '@/components/GuardarUbicacionModal';



export default function VistaReparto() {
  const { user, profile } = useUser();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalEntrega, setModalEntrega] = useState(null);
  const [clienteParaUbicar, setClienteParaUbicar] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('lista');
  const [isClient, setIsClient] = useState(false);

  useEffect(() => { setIsClient(true); }, []);

  // fetchPedidos como useCallback para que el useEffect capture la referencia estable
  // y el canal de Realtime no use un closure obsoleto al reactivarse
  const fetchPedidos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Cargar pedidos
      const { data: ordersData, error: ordersError } = await supabase
        .from('orders')
        .select('id, cliente_nombre, localidad, tipo_pago, estado, actualizado_en, fecha_entrega, order_items(medicamento_nombre, cantidad)')
        .eq('repartidor_id', user.id)
        .eq('estado', 'en_camino')
        .order('actualizado_en', { ascending: false });

      if (ordersError) throw ordersError;

      // 2. Cargar ubicaciones de esos clientes
      const nombres = [...new Set(ordersData.map(o => o.cliente_nombre))];
      const { data: clientesData } = await supabase
        .from('clientes')
        .select('id, nombre, latitud, longitud')
        .in('nombre', nombres);

      // 3. Enriquecer pedidos con lat/lng
      const enriched = (ordersData || []).map(o => {
        const c = clientesData?.find(x => x.nombre === o.cliente_nombre);
        return {
          ...o,
          cliente_id: c?.id,
          latitud: c?.latitud,
          longitud: c?.longitud
        };
      });

      setPedidos(enriched);
    } catch (err) {
      console.error('Error cargando pedidos de reparto:', err.message);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user) return;
    fetchPedidos();

    // Canal de Realtime — usa fetchPedidos estable (useCallback) para evitar closure viejo
    const channel = supabase.channel('reparto_rt')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `repartidor_id=eq.${user.id}` 
      }, () => {
        fetchPedidos();
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, fetchPedidos]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3000);
  };

  const handleFinalizar = async (metodo, valor, observacion) => {
    const res = await registrarEntregaRepartidor(modalEntrega.id, {
      metodo,
      valor: parseFloat(valor) || 0,
      observacion,
      usuarioId: user.id
    });

    if (res.success) {
      showToast('Entrega registrada con éxito');
      setModalEntrega(null);
      fetchPedidos();
    } else {
      showToast(res.error, false);
    }
  };

  if (!user || (profile?.role !== 'repartidor' && profile?.role !== 'admin')) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Acceso restringido para repartidores.</div>;
  }

  const handleUbicacionGuardada = () => {
    fetchPedidos(); // Refrescar para actualizar ubicaciones
  };

  return (
    <div style={{ padding: '20px', paddingBottom: 100, minHeight: '100vh', background: '#f8fafc' }}>
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 900, color: '#084032', margin: 0 }}>🚚 Mis Entregas</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '4px 0 0' }}>Hola, {profile.nombre_completo}</p>
      </header>

      {/* Tabs: Lista / Mapa */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 18, background: '#f1f5f9', borderRadius: 16, padding: 4 }}>
        {[
          { key: 'lista', label: '📋 Lista', count: pedidos.length },
          { key: 'mapa', label: '🗺️ Mapa' },
        ].map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              flex: 1, padding: '12px 16px', borderRadius: 12,
              border: 'none',
              background: activeTab === tab.key ? 'white' : 'transparent',
              boxShadow: activeTab === tab.key ? '0 2px 8px rgba(0,0,0,0.08)' : 'none',
              color: activeTab === tab.key ? '#084032' : '#94a3b8',
              fontWeight: 800, fontSize: 14,
              cursor: 'pointer', transition: 'all 0.2s ease',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span style={{
                background: activeTab === tab.key ? 'rgba(13,148,136,0.1)' : 'rgba(0,0,0,0.05)',
                color: activeTab === tab.key ? '#0d9488' : '#94a3b8',
                padding: '2px 8px', borderRadius: 8,
                fontSize: 12, fontWeight: 800,
              }}>{tab.count}</span>
            )}
          </button>
        ))}
      </div>

      {/* TAB: Mapa */}
      {activeTab === 'mapa' && isClient && (
        <MapaReparto
          pedidos={pedidos}
          usuarioId={user.id}
          onUbicacionGuardada={handleUbicacionGuardada}
        />
      )}

      {/* TAB: Lista */}
      {activeTab === 'lista' && loading ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(13,148,136,0.15)', borderTopColor: '#0d9488', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
          <p style={{ color: '#94a3b8', fontSize: 13 }}>Cargando ruta...</p>
        </div>
      ) : activeTab === 'lista' && pedidos.length === 0 ? (
        <div style={{ 
          textAlign: 'center', padding: '60px 20px', background: 'white', borderRadius: 24, 
          border: '2px dashed #e2e8f0', color: '#94a3b8' 
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🏡</div>
          <p style={{ fontWeight: 700, margin: 0 }}>No tienes pedidos en ruta por ahora.</p>
          <p style={{ fontSize: 13, margin: '4px 0 0' }}>Te avisaremos cuando se te asigne un despacho.</p>
        </div>
      ) : activeTab === 'lista' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {pedidos.map(p => (
            <div key={p.id} style={{ 
              background: 'white', borderRadius: 24, padding: 20, 
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#084032' }}>{p.cliente_nombre}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 13, color: '#0d9488', fontWeight: 700 }}>📍 {p.localidad || 'Sin localidad'}</p>
                </div>
                <span style={{ 
                  background: 'rgba(13,148,136,0.1)', color: '#0d9488', 
                  fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 10 
                }}>EN RUTA</span>
              </div>

              <div style={{ background: '#f8fafc', borderRadius: 16, padding: 12, marginBottom: 12 }}>
                <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>Productos</p>
                {p.order_items?.map((item, idx) => (
                  <div key={idx} style={{ fontSize: 14, color: '#084032', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
                    <span>• {item.medicamento_nombre}</span>
                    <span>x{item.cantidad}</span>
                  </div>
                ))}
              </div>

              {/* Botones de Navegación y Ubicación */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {p.latitud && p.longitud ? (
                  <>
                    <a href={`https://waze.com/ul?ll=${p.latitud},${p.longitud}&navigate=yes`} target="_blank" rel="noopener"
                       style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px', borderRadius: 12, background: '#33ccff', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                      🧭 Waze
                    </a>
                    <a href={`https://www.google.com/maps/dir/?api=1&destination=${p.latitud},${p.longitud}`} target="_blank" rel="noopener"
                       style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '10px', borderRadius: 12, background: '#4285f4', color: 'white', textDecoration: 'none', fontSize: 13, fontWeight: 700 }}>
                      📍 Maps
                    </a>
                  </>
                ) : (
                  <button 
                    onClick={() => setClienteParaUbicar({ id: p.cliente_id, nombre: p.cliente_nombre })}
                    style={{ 
                      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '10px', 
                      borderRadius: 12, background: 'rgba(239,68,68,0.06)', 
                      color: '#dc2626', border: '1px solid #fee2e2',
                      fontSize: 13, fontWeight: 700, cursor: 'pointer'
                    }}>
                    📌 No ubicado. Ubicar ahora
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <div style={{ flex: 1, background: p.tipo_pago === 'contado' ? '#fef2f2' : '#f0fdf4', padding: '10px', borderRadius: 12, textAlign: 'center' }}>
                  <p style={{ margin: 0, fontSize: 10, fontWeight: 800, color: p.tipo_pago === 'contado' ? '#dc2626' : '#16a34a', textTransform: 'uppercase' }}>Tipo de Negocio</p>
                  <p style={{ margin: 0, fontSize: 15, fontWeight: 900, color: p.tipo_pago === 'contado' ? '#dc2626' : '#16a34a' }}>{p.tipo_pago?.toUpperCase()}</p>
                </div>
                <button 
                  onClick={() => setModalEntrega(p)}
                  style={{ 
                    flex: 2, background: '#0F6E56', color: 'white', border: 'none', 
                    borderRadius: 16, fontWeight: 800, fontSize: 15, cursor: 'pointer',
                    boxShadow: '0 6px 16px rgba(15,110,86,0.3)'
                  }}
                >
                  Finalizar Entrega ✅
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {/* Modal de Ubicación */}
      {clienteParaUbicar && (
        <GuardarUbicacionModal
          cliente={clienteParaUbicar}
          usuarioId={user.id}
          onClose={() => setClienteParaUbicar(null)}
          onSaved={() => {
            setClienteParaUbicar(null);
            fetchPedidos();
          }}
        />
      )}

      {/* Modal de Finalización con Recaudo */}
      {modalEntrega && (
        <ModalRecaudo 
          pedido={modalEntrega} 
          onConfirm={handleFinalizar} 
          onCancel={() => setModalEntrega(null)} 
        />
      )}

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: 40, left: '50%', transform: 'translateX(-50%)',
          background: toast.ok ? '#10b981' : '#dc2626', color: 'white', padding: '12px 24px',
          borderRadius: 100, fontSize: 14, fontWeight: 800, boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
          zIndex: 10000, animation: 'slideUpPop .4s ease'
        }}>
          {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes slideUpPop { from { opacity:0; transform:translate(-50%, 20px); } to { opacity:1; transform:translate(-50%, 0); } }
        @keyframes spin { to { transform: rotate(360deg) } }
      `}</style>
    </div>
  );
}

function ModalRecaudo({ pedido, onConfirm, onCancel }) {
  const [metodo, setMetodo] = useState('efectivo');
  const [valor, setValor] = useState('');
  const [observacion, setObservacion] = useState('');
  const esContado = pedido.tipo_pago === 'contado';

  const handleFinal = () => {
    const valorNum = parseFloat(valor) || 0;
    
    // Si es contado y no hay dinero, debe haber observación
    if (esContado && valorNum <= 0 && !observacion.trim()) {
      return alert('Este pedido es de CONTADO y no has registrado dinero. Por favor, escribe una observación explicando por qué no se recibió el pago.');
    }
    
    onConfirm(metodo, valor, observacion);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 28, padding: 24, boxShadow: '0 20px 40px rgba(0,0,0,0.2)', animation: 'fadeIn 0.3s' }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800, color: '#084032', textAlign: 'center' }}>Finalizar Entrega</h3>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: '#64748b', textAlign: 'center' }}>{pedido.cliente_nombre}</p>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#084032', marginBottom: 8 }}>Método de Pago</label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {['efectivo', 'transferencia', 'pendiente'].map(m => (
              <button key={m} onClick={() => setMetodo(m)} style={{
                padding: '10px 4px', borderRadius: 12, border: metodo === m ? '2px solid #0F6E56' : '2px solid #f1f5f9',
                background: metodo === m ? 'rgba(15,110,86,0.05)' : 'white', color: metodo === m ? '#0F6E56' : '#94a3b8',
                fontWeight: 800, fontSize: 11, cursor: 'pointer', textTransform: 'uppercase'
              }}>{m}</button>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#084032', marginBottom: 8 }}>
            Valor Recaudado {esContado && metodo !== 'pendiente' && <span style={{ color: '#ef4444' }}>*</span>}
          </label>
          <div style={{ position: 'relative' }}>
            <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontWeight: 800, color: '#94a3b8' }}>$</span>
            <input 
              type="number" value={valor} onChange={e => setValor(e.target.value)}
              disabled={metodo === 'pendiente'}
              placeholder={metodo === 'pendiente' ? 'Sin recaudo' : (esContado ? 'Valor obligatorio' : 'Opcional')}
              style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 32px', borderRadius: 16, border: '2px solid #f1f5f9', fontSize: 16, fontWeight: 700, outline: 'none', background: metodo === 'pendiente' ? '#f8fafc' : 'white' }}
            />
          </div>
        </div>

        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#084032', marginBottom: 8 }}>Observaciones / Justificación</label>
          <textarea 
            value={observacion} 
            onChange={e => setObservacion(e.target.value)}
            placeholder="Escribe aquí si hubo algún problema o el pago quedó pendiente..."
            style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 16, border: '2px solid #f1f5f9', fontSize: 14, minHeight: 80, resize: 'none', outline: 'none', fontFamily: 'inherit' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={onCancel} style={{ flex: 1, padding: '14px', borderRadius: 16, border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleFinal} style={{ flex: 2, padding: '14px', borderRadius: 16, border: 'none', background: '#0F6E56', color: 'white', fontWeight: 800, cursor: 'pointer', boxShadow: '0 6px 16px rgba(15,110,86,0.2)' }}>Finalizar Entrega ✅</button>
        </div>
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
      `}</style>
    </div>
  );
}
