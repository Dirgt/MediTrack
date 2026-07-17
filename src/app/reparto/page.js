'use client';

import { useState, useEffect, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { registrarEntregaRepartidor } from '@/app/actions/order_actions';
import GuardarUbicacionModal from '@/components/GuardarUbicacionModal';

const MapaReparto = dynamic(() => import('@/components/MapaReparto'), { 
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>
      <div style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(13,148,136,0.15)', borderTopColor: '#0d9488', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
      <p>Cargando mapa...</p>
    </div>
  )
});



export default function VistaReparto() {
  const { user, profile, loading: authLoading } = useUser();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalEntrega, setModalEntrega] = useState(null);
  const [clienteParaUbicar, setClienteParaUbicar] = useState(null);
  const [toast, setToast] = useState(null);
  const [activeTab, setActiveTab] = useState('lista');
  const [isClient, setIsClient] = useState(false);
  const [ordenRuta, setOrdenRuta] = useState([]);

  useEffect(() => { 
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIsClient(true); 
  }, []);

  // fetchPedidos como useCallback para que el useEffect capture la referencia estable
  // y el canal de Realtime no use un closure obsoleto al reactivarse
  const fetchPedidos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      // 1. Cargar pedidos
      let query = supabase
        .from('orders')
        .select('id, cliente_nombre, localidad, tipo_pago, estado, actualizado_en, fecha_entrega, observaciones, order_items(medicamento_nombre, cantidad)')
        .eq('estado', 'en_camino')
        .order('actualizado_en', { ascending: false });

      if (profile?.role !== 'admin') {
        query = query.eq('repartidor_id', user.id);
      }

      const { data: ordersData, error: ordersError } = await query;

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
  }, [user, profile]);

  useEffect(() => {
    if (!user) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPedidos();

    // Canal de Realtime — usa fetchPedidos estable (useCallback) para evitar closure viejo
    const channel = supabase.channel('reparto_rt')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'orders',
        filter: `repartidor_id=eq.${user.id}` 
      }, (payload) => {
        if (payload.eventType === 'UPDATE') {
          if (payload.new.estado !== 'en_camino') {
            // El pedido ya no está en ruta, sacarlo de la RAM
            setPedidos(prev => prev.filter(p => p.id !== payload.new.id));
          } else {
            // Sigue en ruta, actualizamos en RAM o descargamos si es nuevo
            setPedidos(prev => {
              const exists = prev.find(p => p.id === payload.new.id);
              if (exists) {
                return prev.map(p => p.id === payload.new.id ? { ...p, ...payload.new } : p);
              } else {
                fetchPedidos(); // Descargar para traer relaciones (items, cliente lat/lng)
                return prev;
              }
            });
          }
        } else {
          // INSERT o DELETE, hacer full fetch
          fetchPedidos();
        }
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
      window.dispatchEvent(new Event('force_gps_update'));
      showToast('Entrega registrada con éxito');
      setModalEntrega(null);
      fetchPedidos();
    } else {
      showToast(res.error, false);
    }
  };

  // Esperar a que la sesión se cargue antes de verificar el rol
  if (authLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12 }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(13,148,136,0.15)', borderTopColor: '#0d9488', animation: 'spin 0.8s linear infinite' }} />
        <p style={{ color: '#94a3b8', fontSize: 14, fontWeight: 600 }}>Cargando sesión...</p>
        <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      </div>
    );
  }

  if (!user || (profile?.role !== 'repartidor' && profile?.role !== 'admin')) {
    return <div style={{ padding: 40, textAlign: 'center' }}>Acceso restringido para repartidores.</div>;
  }

  const handleUbicacionGuardada = () => {
    fetchPedidos(); // Refrescar para actualizar ubicaciones
  };

  // Recibe el orden óptimo calculado por OSRM desde MapaReparto
  const handleOrdenCalculado = (orderedClientIds = []) => {
    setOrdenRuta(orderedClientIds);
  };

  // Ordena los pedidos según el orden de ruta calculado
  const pedidosOrdenados = [...pedidos].sort((a, b) => {
    const ia = ordenRuta.indexOf(a.cliente_id);
    const ib = ordenRuta.indexOf(b.cliente_id);
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });

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
      {/* Admin ve modo gestión (todos los clientes + buscador + filtros).  */}
      {/* Repartidor ve modo ruta con sus pedidos activos.                  */}
      {activeTab === 'mapa' && isClient && (
        <MapaReparto
          pedidos={pedidos}
          usuarioId={user.id}
          onUbicacionGuardada={handleUbicacionGuardada}
          onOrdenCalculado={profile?.role !== 'admin' ? handleOrdenCalculado : undefined}
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
          {pedidosOrdenados.map(p => {
            const posRuta = ordenRuta.indexOf(p.cliente_id);
            const numRuta = posRuta !== -1 ? posRuta + 1 : null;
            return (
            <div key={p.id} style={{ 
              background: 'white', borderRadius: 24, padding: 20, 
              boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0' 
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {numRuta && (
                    <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg,#3b82f6,#1d4ed8)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 900, flexShrink: 0, boxShadow: '0 4px 10px rgba(59,130,246,0.4)' }}>
                      {numRuta}
                    </div>
                  )}
                  <div>
                    <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: '#084032' }}>{p.cliente_nombre}</h3>
                    <p style={{ margin: '4px 0 0', fontSize: 13, color: '#0d9488', fontWeight: 700 }}>📍 {p.localidad || 'Sin localidad'}</p>
                  </div>
                </div>
                <span style={{ 
                  background: 'rgba(13,148,136,0.1)', color: '#0d9488', 
                  fontSize: 11, fontWeight: 800, padding: '4px 10px', borderRadius: 10, flexShrink: 0 
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

              {/* Observaciones del pedido */}
              {p.observaciones && (
                <div style={{ background: '#fffbeb', borderRadius: 16, padding: 12, marginBottom: 12, border: '1px solid #fde68a' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 800, color: '#b45309', textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 4 }}>⚠️ Observaciones</p>
                  <p style={{ margin: 0, fontSize: 14, color: '#92400e', fontWeight: 600, lineHeight: 1.4 }}>{p.observaciones}</p>
                </div>
              )}

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
          );
          })}
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const esContado = pedido.tipo_pago === 'contado';

  const handleFinal = async () => {
    const valorNum = parseFloat(valor) || 0;
    
    // Si es contado y no hay dinero, debe haber observación
    if (esContado && valorNum <= 0 && !observacion.trim()) {
      return alert('Este pedido es de CONTADO y no has registrado dinero. Por favor, escribe una observación explicando por qué no se recibió el pago.');
    }
    
    setIsSubmitting(true);
    await onConfirm(metodo, Math.max(0, valorNum), observacion);
    setIsSubmitting(false);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(6px)', padding: '0' }}>
      <div style={{
        width: '100%', maxWidth: 480,
        background: 'white',
        borderRadius: '28px 28px 0 0',
        boxShadow: '0 -10px 40px rgba(0,0,0,0.2)',
        animation: 'slideUp 0.3s ease',
        display: 'flex',
        flexDirection: 'column',
        maxHeight: '92dvh',
        overflow: 'hidden',
      }}>
        {/* ── Drag handle decorativo ── */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 0 4px' }}>
          <div style={{ width: 40, height: 4, borderRadius: 100, background: '#e2e8f0' }} />
        </div>

        {/* ── Cabecera fija ── */}
        <div style={{ padding: '4px 24px 12px', borderBottom: '1px solid #f1f5f9', flexShrink: 0 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: '#084032', textAlign: 'center' }}>Finalizar Entrega</h3>
          <p style={{ margin: 0, fontSize: 14, color: '#64748b', textAlign: 'center' }}>{pedido.cliente_nombre}</p>
        </div>

        {/* ── Cuerpo scrollable ── */}
        <div style={{ overflowY: 'auto', flex: 1, padding: '16px 24px', WebkitOverflowScrolling: 'touch' }}>

          {/* Productos del pedido */}
          {pedido.order_items?.length > 0 && (
            <div style={{ background: '#f0fdf4', borderRadius: 14, padding: '12px 14px', marginBottom: 16, border: '1px solid #bbf7d0' }}>
              <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 900, color: '#15803d', textTransform: 'uppercase' }}>📦 Productos a entregar</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {pedido.order_items.map((item, idx) => (
                  <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#084032' }}>• {item.medicamento_nombre}</span>
                    <span style={{ fontSize: 13, fontWeight: 900, color: '#0F6E56', background: 'rgba(15,110,86,0.08)', padding: '2px 10px', borderRadius: 8 }}>x{item.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

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
                type="number" min="0" step="any" value={valor} onChange={e => setValor(e.target.value)}
                disabled={metodo === 'pendiente' || isSubmitting}
                placeholder={metodo === 'pendiente' ? 'Sin recaudo' : (esContado ? 'Valor obligatorio' : 'Opcional')}
                style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 32px', borderRadius: 16, border: '2px solid #f1f5f9', fontSize: 16, fontWeight: 700, outline: 'none', background: metodo === 'pendiente' ? '#f8fafc' : 'white' }}
              />
            </div>
          </div>

          <div style={{ marginBottom: 8 }}>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: '#084032', marginBottom: 8 }}>Observaciones / Justificación</label>
            <textarea
              value={observacion}
              onChange={e => setObservacion(e.target.value)}
              placeholder="Escribe aquí si hubo algún problema o el pago quedó pendiente..."
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 16, border: '2px solid #f1f5f9', fontSize: 14, minHeight: 80, resize: 'none', outline: 'none', fontFamily: 'inherit' }}
            />
          </div>
        </div>

        {/* ── Botones siempre visibles al fondo ── */}
        <div style={{
          padding: '12px 24px 28px',
          borderTop: '1px solid #f1f5f9',
          display: 'flex', gap: 10,
          flexShrink: 0,
          background: 'white',
        }}>
          <button onClick={onCancel} disabled={isSubmitting} style={{ flex: 1, padding: '14px', borderRadius: 16, border: '1px solid #e2e8f0', background: 'white', fontWeight: 700, cursor: isSubmitting ? 'not-allowed' : 'pointer', fontSize: 15, opacity: isSubmitting ? 0.6 : 1 }}>Cancelar</button>
          <button onClick={handleFinal} disabled={isSubmitting} style={{ flex: 2, padding: '14px', borderRadius: 16, border: 'none', background: '#0F6E56', color: 'white', fontWeight: 800, cursor: isSubmitting ? 'not-allowed' : 'pointer', boxShadow: isSubmitting ? 'none' : '0 6px 16px rgba(15,110,86,0.2)', fontSize: 15, opacity: isSubmitting ? 0.7 : 1 }}>
            {isSubmitting ? 'Procesando...' : 'Finalizar Entrega ✅'}
          </button>
        </div>
      </div>
      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
