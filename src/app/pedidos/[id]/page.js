'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import SLAIndicator from '@/components/SLAIndicator';

const ESTADO = {
  pendiente:            { label:'Pendiente',          emoji:'⏳', color:'#0F6E56', bg:'rgba(15,110,86,0.1)'   },
  alistando:            { label:'Alistando',           emoji:'📦', color:'#16a34a', bg:'rgba(22,163,74,0.1)'   },
  facturando:           { label:'Facturando',          emoji:'🧾', color:'#059669', bg:'rgba(5,150,105,0.1)'   },
  en_camino:            { label:'En camino',           emoji:'🚚', color:'#0d9488', bg:'rgba(13,148,136,0.1)'  },
  entregado:            { label:'Entregado',           emoji:'✅', color:'#10b981', bg:'rgba(16,185,129,0.1)'  },
  rechazado_puerta:     { label:'Rechazado en Puerta', emoji:'🚫', color:'#ef4444', bg:'rgba(239,68,68,0.12)' },
  programado_reintento: { label:'Reintento Prog.',     emoji:'🔄', color:'#f97316', bg:'rgba(249,115,22,0.12)' },
  cerrado_sin_entrega:  { label:'Cerrado s/Entrega',   emoji:'🔒', color:'#6b7280', bg:'rgba(107,114,128,0.12)'},
  cancelado:            { label:'Cancelado',            emoji:'❌', color:'#dc2626', bg:'rgba(220,38,38,0.08)' },
};

const FLUJO = ['pendiente','alistando','facturando','en_camino','entregado'];

function BarraProgreso({ estado }) {
  const idx = FLUJO.indexOf(estado);
  const esRechazo = ['rechazado_puerta','programado_reintento','cerrado_sin_entrega','cancelado'].includes(estado);
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'8px 0', gap:0 }}>
      {FLUJO.map((e, i) => {
        const done   = idx > i || estado === 'entregado';
        const active = idx === i && !esRechazo;
        const cfg    = ESTADO[e];
        return (
          <div key={e} style={{ flex:1, display:'flex', alignItems:'center' }}>
            <div style={{
              width:38, height:38, borderRadius:'50%', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: done ? '#10b981' : active ? cfg.color : '#f3f4f6',
              color: (done||active) ? 'white' : '#9ca3af',
              fontSize: done ? 16 : 18, fontWeight:800, transition:'all .3s',
              boxShadow: active ? `0 0 0 4px ${cfg.color}33` : 'none',
            }}>
              {done ? '✓' : cfg.emoji}
            </div>
            {i < FLUJO.length - 1 && (
              <div style={{ flex:1, height:6, background: done ? '#10b981' : '#f3f4f6', borderRadius:3, margin:'0 -2px', transition:'background .3s' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function DetallePedido({ params }) {
  const { id: orderId } = use(params);
  const { user, profile, loading: ctxLoading } = useUser();
  const router = useRouter();

  const [pedido, setPedido]   = useState(null);
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    // Esperar que el contexto haya terminado de cargar usuario Y perfil
    if (ctxLoading) return;
    if (!user) return;

    async function fetchAll() {
      setLoading(true);

      const { data, error: err } = await supabase
        .from('orders')
        .select(`
          id, cliente_nombre, estado, creado_en, actualizado_en,
          observaciones, motivo_rechazo, nota_reintento, fecha_reintento,
          intentos_entrega, pagado, fecha_entrega, tipo_factura, tipo_pago, vendedor_id,
          order_items(id, medicamento_nombre, cantidad),
          profiles!orders_vendedor_id_fkey(id, nombre_completo)
        `)
        .eq('id', orderId)
        .single();

      if (err || !data) { setError('Pedido no encontrado.'); setLoading(false); return; }

      // Admin puede ver cualquier pedido; vendedor solo los suyos
      const esAdmin = profile?.role === 'admin';
      if (!esAdmin && data.vendedor_id !== user.id) {
        setError('No tienes permiso para ver este pedido.');
        setLoading(false);
        return;
      }

      setPedido(data);

      const { data: hist } = await supabase
        .from('order_history')
        .select('*, profiles(nombre_completo)')
        .eq('order_id', orderId)
        .order('creado_en', { ascending: true });

      setHistorial(hist || []);
      setLoading(false);
    }

    fetchAll();

    // Realtime: actualizar si el pedido cambia
    const ch = supabase.channel(`detail_${orderId}`)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', filter: `id=eq.${orderId}` }, () => fetchAll())
      .subscribe();
    return () => supabase.removeChannel(ch);
  }, [orderId, user, profile, ctxLoading]);

  if (ctxLoading || loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'60vh', flexDirection:'column', gap:12 }}>
      <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid rgba(15,110,86,0.15)', borderTopColor:'#0F6E56', animation:'spin .8s linear infinite' }} />
      <p style={{ color:'#94a3b8', fontSize:14 }}>Cargando pedido...</p>
      <style>{`@keyframes spin { to { transform:rotate(360deg); } }`}</style>
    </div>
  );

  if (error) return (
    <div style={{ padding:40, textAlign:'center', maxWidth:400, margin:'0 auto' }}>
      <div style={{ fontSize:64, marginBottom:16 }}>🛑</div>
      <h2 style={{ color:'#084032', margin:'0 0 8px' }}>Acceso no permitido</h2>
      <p style={{ color:'#ef4444', fontWeight:600, marginBottom:24 }}>{error}</p>
      <button onClick={() => router.push('/pedidos')} style={{ background:'#0F6E56', color:'white', border:'none', padding:'14px 28px', borderRadius:16, fontSize:15, fontWeight:800, cursor:'pointer', width:'100%' }}>
        Volver a Pedidos
      </button>
    </div>
  );

  const cfg   = ESTADO[pedido.estado] || ESTADO.pendiente;
  const items = pedido.order_items || [];
  const totalUds = items.reduce((a, i) => a + (parseInt(i.cantidad) || 0), 0);
  const isAdmin = profile?.role === 'admin';
  const puedeEditar = !isAdmin && pedido.estado === 'pendiente';

  return (
    <div style={{ paddingBottom:100 }}>
      {/* ── HERO ── */}
      <div style={{
        background:'linear-gradient(135deg, #084032 0%, #0F6E56 100%)',
        padding:'32px 20px 80px', borderRadius:'0 0 40px 40px',
        position:'relative', overflow:'hidden', marginBottom:-56,
      }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
        <div style={{ position:'relative', zIndex:1 }}>
          <button onClick={() => router.push('/pedidos')} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:'50%', width:40, height:40, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', color:'white', fontSize:20, marginBottom:16, backdropFilter:'blur(8px)' }}>
            ←
          </button>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
            <span style={{ background: cfg.bg, color: cfg.color, fontWeight:800, fontSize:12, padding:'5px 12px', borderRadius:20, display:'flex', alignItems:'center', gap:5, backdropFilter:'blur(4px)' }}>
              {cfg.emoji} {cfg.label}
            </span>
          </div>
          <h1 style={{ color:'white', fontSize:26, fontWeight:900, margin:'0 0 4px', lineHeight:1.2 }}>{pedido.cliente_nombre}</h1>
          <p style={{ color:'rgba(255,255,255,0.65)', fontSize:13, margin:0 }}>
            📅 {new Date(pedido.creado_en).toLocaleDateString('es-CO', { weekday:'long', year:'numeric', month:'long', day:'numeric' })}
          </p>
        </div>
      </div>

      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:16 }}>

        {/* SLA — Estado Operativo */}
        {!['entregado','cancelado','cerrado_sin_entrega'].includes(pedido.estado) && (
          <SLAIndicator pedido={pedido} compact={false} />
        )}

        {/* Progreso */}
        <div style={{ background:'white', borderRadius:24, padding:'20px', boxShadow:'0 8px 24px rgba(0,0,0,0.05)', border:'1px solid #f1f5f9' }}>
          <p style={{ margin:'0 0 14px', fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>
            Progreso del Pedido
          </p>
          <BarraProgreso estado={pedido.estado} />
          {['rechazado_puerta','programado_reintento','cerrado_sin_entrega','cancelado'].includes(pedido.estado) && (
            <div style={{ marginTop:12, padding:'10px 14px', background: cfg.bg, borderRadius:12, display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:18 }}>{cfg.emoji}</span>
              <span style={{ fontSize:13, fontWeight:700, color:cfg.color }}>{cfg.label}</span>
            </div>
          )}
        </div>

        {/* Info general */}
        <div style={{ background:'white', borderRadius:24, padding:'20px', boxShadow:'0 8px 24px rgba(0,0,0,0.05)', border:'1px solid #f1f5f9' }}>
          <p style={{ margin:'0 0 14px', fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>Detalles</p>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
            {[
              { label:'Tipo Factura',  value: pedido.tipo_factura === 'factura_electronica' ? '📄 Electrónica' : '🧾 Remisión' },
              { label:'Tipo Pago',     value: pedido.tipo_pago === 'credito' ? '💳 Crédito' : '💵 Contado' },
              { label:'Fecha Entrega', value: pedido.fecha_entrega ? new Date(pedido.fecha_entrega + 'T12:00:00').toLocaleDateString('es-CO', { month:'short', day:'numeric' }) : '—' },
              { label:'Intentos',      value: pedido.intentos_entrega || 0 },
              { label:'Vendedor',      value: pedido.profiles?.nombre_completo || '—' },
              { label:'Pagado',        value: pedido.pagado ? '✅ Sí' : '⏳ Pendiente' },
            ].map(d => (
              <div key={d.label} style={{ background:'#f8fafc', borderRadius:16, padding:'12px 14px' }}>
                <p style={{ margin:'0 0 2px', fontSize:10, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:.8 }}>{d.label}</p>
                <p style={{ margin:0, fontSize:14, fontWeight:700, color:'#084032' }}>{d.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Medicamentos */}
        <div style={{ background:'white', borderRadius:24, padding:'20px', boxShadow:'0 8px 24px rgba(0,0,0,0.05)', border:'1px solid #f1f5f9' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
            <p style={{ margin:0, fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>💊 Medicamentos</p>
            <span style={{ background:'rgba(15,110,86,0.1)', color:'#0F6E56', fontSize:12, fontWeight:800, padding:'4px 10px', borderRadius:10 }}>
              {items.length} prod · {totalUds} uds
            </span>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'#f8fafc', padding:'12px 16px', borderRadius:16, border:'1px solid #e2e8f0' }}>
                <span style={{ fontSize:15, fontWeight:600, color:'#084032' }}>{it.medicamento_nombre}</span>
                <span style={{ fontSize:15, fontWeight:800, color:'#0F6E56', background:'rgba(15,110,86,0.1)', padding:'3px 12px', borderRadius:10 }}>×{it.cantidad}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Observaciones / alertas */}
        {(pedido.observaciones || pedido.motivo_rechazo || pedido.nota_reintento) && (
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            {pedido.observaciones && (
              <div style={{ background:'#fffbeb', border:'1px solid #fde68a', borderRadius:20, padding:'16px 18px' }}>
                <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:800, color:'#d97706', textTransform:'uppercase', letterSpacing:.8 }}>📝 Observaciones</p>
                <p style={{ margin:0, fontSize:14, color:'#92400e', fontWeight:500 }}>{pedido.observaciones}</p>
              </div>
            )}
            {pedido.motivo_rechazo && (
              <div style={{ background:'#fef2f2', border:'1px solid #fecaca', borderRadius:20, padding:'16px 18px' }}>
                <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:800, color:'#dc2626', textTransform:'uppercase', letterSpacing:.8 }}>🚫 Motivo Rechazo/Cancelación</p>
                <p style={{ margin:0, fontSize:14, color:'#b91c1c', fontWeight:500 }}>{pedido.motivo_rechazo}</p>
              </div>
            )}
            {pedido.nota_reintento && (
              <div style={{ background:'#fff7ed', border:'1px solid #fed7aa', borderRadius:20, padding:'16px 18px' }}>
                <p style={{ margin:'0 0 4px', fontSize:11, fontWeight:800, color:'#f97316', textTransform:'uppercase', letterSpacing:.8 }}>🔄 Nota Reintento</p>
                <p style={{ margin:0, fontSize:14, color:'#c2410c', fontWeight:500 }}>{pedido.nota_reintento}</p>
                {pedido.fecha_reintento && (
                  <p style={{ margin:'6px 0 0', fontSize:12, color:'#ea580c', fontWeight:700 }}>
                    📅 {new Date(pedido.fecha_reintento).toLocaleString('es-CO', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Historial de cambios */}
        {historial.length > 0 && (
          <div style={{ background:'white', borderRadius:24, padding:'20px', boxShadow:'0 8px 24px rgba(0,0,0,0.05)', border:'1px solid #f1f5f9' }}>
            <p style={{ margin:'0 0 16px', fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>🕐 Historial de Cambios</p>
            <div style={{ display:'flex', flexDirection:'column', gap:0 }}>
              {historial.map((h, idx) => {
                const cfgN = ESTADO[h.estado_nuevo] || { color:'#6b7280', emoji:'❓' };
                return (
                  <div key={h.id} style={{ display:'flex', gap:12, paddingBottom: idx < historial.length-1 ? 16 : 0, position:'relative' }}>
                    {idx < historial.length - 1 && (
                      <div style={{ position:'absolute', left:17, top:38, bottom:0, width:2, background:'#f1f5f9' }} />
                    )}
                    <div style={{ width:36, height:36, borderRadius:'50%', flexShrink:0, background: cfgN.bg || 'rgba(107,114,128,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, zIndex:1 }}>
                      {cfgN.emoji}
                    </div>
                    <div style={{ flex:1, paddingTop:4 }}>
                      <p style={{ margin:'0 0 2px', fontSize:13, fontWeight:700, color:'#084032' }}>
                        {ESTADO[h.estado_anterior]?.label || h.estado_anterior} → <span style={{ color: cfgN.color }}>{ESTADO[h.estado_nuevo]?.label || h.estado_nuevo}</span>
                      </p>
                      {h.nota_interna && <p style={{ margin:'0 0 2px', fontSize:12, color:'#64748b' }}>"{h.nota_interna}"</p>}
                      <p style={{ margin:0, fontSize:11, color:'#9ca3af' }}>
                        {h.profiles?.nombre_completo && `${h.profiles.nombre_completo} · `}
                        {new Date(h.creado_en).toLocaleString('es-CO', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Acciones */}
        {puedeEditar && (
          <button
            onClick={() => router.push(`/pedidos/${orderId}/editar`)}
            style={{ width:'100%', padding:'18px', borderRadius:20, border:'none', background:'#0F6E56', color:'white', fontSize:16, fontWeight:800, cursor:'pointer', boxShadow:'0 8px 24px rgba(15,110,86,0.35)', display:'flex', alignItems:'center', justifyContent:'center', gap:10 }}
          >
            ✏️ Editar este Pedido
          </button>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform:rotate(360deg); } }
      `}</style>
    </div>
  );
}
