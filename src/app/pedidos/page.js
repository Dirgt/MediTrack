'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { cambiarEstadoPedido, cancelarPedido } from '@/app/actions/order_actions';

// ── Config visual de estados ──
const ESTADO = {
  pendiente:            { label:'Pendiente',          emoji:'⏳', color:'#0F6E56', bg:'rgba(15,110,86,0.1)',   border:'rgba(15,110,86,0.3)'   },
  alistando:            { label:'Alistando',           emoji:'📦', color:'#16a34a', bg:'rgba(22,163,74,0.1)',   border:'rgba(22,163,74,0.3)'   },
  facturando:           { label:'Facturando',          emoji:'🧾', color:'#059669', bg:'rgba(5,150,105,0.1)',   border:'rgba(5,150,105,0.3)'   },
  en_camino:            { label:'En camino',           emoji:'🚚', color:'#0d9488', bg:'rgba(13,148,136,0.1)',  border:'rgba(13,148,136,0.3)'  },
  entregado:            { label:'Entregado',           emoji:'✅', color:'#10b981', bg:'rgba(16,185,129,0.1)',  border:'rgba(16,185,129,0.3)'  },
  rechazado_puerta:     { label:'Rechazado en Puerta', emoji:'🚫', color:'#ef4444', bg:'rgba(239,68,68,0.12)',  border:'rgba(239,68,68,0.3)'   },
  programado_reintento: { label:'Reintento Prog.',     emoji:'🔄', color:'#f97316', bg:'rgba(249,115,22,0.12)', border:'rgba(249,115,22,0.3)'  },
  cerrado_sin_entrega:  { label:'Cerrado s/Entrega',   emoji:'🔒', color:'#6b7280', bg:'rgba(107,114,128,0.12)',border:'rgba(107,114,128,0.3)' },
  cancelado:            { label:'Cancelado',            emoji:'❌', color:'#dc2626', bg:'rgba(220,38,38,0.08)', border:'rgba(220,38,38,0.25)'  },
};

const ACCIONES_ADMIN = {
  pendiente:            [{ a:'alistando',            label:'✅ Iniciar Alistamiento',   color:'#16a34a', icon:'📦' }],
  alistando:            [{ a:'facturando',           label:'🧾 Pasar a Facturación',    color:'#059669', icon:'🧾' }],
  facturando:           [{ a:'en_camino',            label:'🚚 Enviar a Despacho',      color:'#0d9488', icon:'🚚' }],
  en_camino:            [{ a:'entregado',            label:'✅ Confirmar Entrega',      color:'#10b981', icon:'✅' },
                         { a:'rechazado_puerta',     label:'🚫 Reportar Rechazo',       color:'#ef4444', icon:'🚫' }],
  rechazado_puerta:     [{ a:'programado_reintento', label:'🔄 Programar Reintento',    color:'#f97316', icon:'🔄' },
                         { a:'cerrado_sin_entrega',  label:'🔒 Cerrar Definitivamente', color:'#6b7280', icon:'🔒' }],
  programado_reintento: [{ a:'en_camino',            label:'🚚 Volver a Despachar',     color:'#0d9488', icon:'🚚' }],
  entregado:            [],
  cerrado_sin_entrega:  [],
  cancelado:            [],
};

const FLUJO = ['pendiente','alistando','facturando','en_camino','entregado'];

// Rango de fechas helper
function getRangoFecha(rango) {
  const now = new Date();
  const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (rango === 'hoy')    return { desde: hoy };
  if (rango === 'semana') return { desde: new Date(hoy.getTime() - 6 * 86400000) };
  if (rango === 'mes')    return { desde: new Date(now.getFullYear(), now.getMonth(), 1) };
  return null;
}

// ── Barra de progreso (Mejorada visualmente) ──
function BarraProgreso({ estado }) {
  const idx = FLUJO.indexOf(estado);
  const esRechazo = ['rechazado_puerta','programado_reintento','cerrado_sin_entrega','cancelado'].includes(estado);
  
  return (
    <div style={{ display:'flex', alignItems:'center', padding:'16px 4px 8px', overflowX:'auto' }}>
      {FLUJO.map((e, i) => {
        const done   = idx > i || estado === 'entregado';
        const active = idx === i && !esRechazo;
        const subcfg = ESTADO[e];
        return (
          <div key={e} style={{ flex:1, display:'flex', alignItems:'center', minWidth: esRechazo ? 50 : 80 }}>
            {/* Círculo */}
            <div style={{
              width:36, height:36, borderRadius:'50%', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: done ? '#10b981' : active ? subcfg.color : '#f3f4f6',
              color: (done||active) ? 'white' : '#9ca3af',
              fontSize: done ? 16 : 18, fontWeight:800, transition:'all .3s',
              boxShadow: active ? `0 0 0 4px ${subcfg.color}33` : 'none',
              zIndex: 2, position:'relative'
            }}>
              {done ? '✓' : subcfg.emoji}
            </div>
            
            {/* Icono + Etiqueta para el estado actual o completado */}
            {i < FLUJO.length-1 && (
              <div style={{ flex:1, height:6, background: done ? '#10b981' : '#f3f4f6', transition:'background .3s', margin:'0 -4px', zIndex: 1, borderRadius: 3 }}/>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Modales (Mismo diseño de confirmación optimizado) ──
// (El componente modal sigue manteniendo su estilo funcional pero con mejor padding y colores)
function ModalAccion({ accion, pedido, adminId, onConfirm, onCancel }) {
  const [motivo, setMotivo]   = useState('');
  const [nota, setNota]       = useState('');
  const [fecha, setFecha]     = useState('');
  const [loading, setLoading] = useState(false);

  const esRechazo   = accion.a === 'rechazado_puerta';
  const esReintento = accion.a === 'programado_reintento';

  const handleConfirm = async () => {
    if (esRechazo && !motivo.trim()) return alert('El motivo del rechazo es obligatorio');
    setLoading(true);
    await onConfirm({
      motivo_rechazo: esRechazo ? motivo : null,
      nota_reintento: esReintento ? nota : null,
      fecha_reintento: fecha ? new Date(fecha).toISOString() : null,
      notas: (!esRechazo && !esReintento) ? nota : null,
      adminId,
    });
    setLoading(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)', padding: 20 }}
      onClick={e => e.target === e.currentTarget && onCancel()}>
      <div style={{ width:'100%', maxWidth:420, background:'white', borderRadius:28, padding:'24px', animation:'popIn .3s cubic-bezier(.34,1.2,.64,1)', boxShadow: '0 20px 40px rgba(0,0,0,0.2)' }}>
        
        <div style={{ textAlign:'center', marginBottom:20 }}>
          <div style={{ width:64, height:64, borderRadius:'50%', background: accion.color+'15', color: accion.color, fontSize:32, display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px' }}>
            {accion.icon}
          </div>
          <h3 style={{ margin:'0 0 4px', fontSize:20, fontWeight:800, color:'#084032' }}>{accion.label}</h3>
          <p style={{ margin:0, fontSize:14, color:'#6b7280' }}>Cliente: <strong>{pedido.cliente_nombre}</strong></p>
        </div>

        {esRechazo && (
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#084032', marginBottom:8 }}>
              📋 Razón del Rechazo <span style={{color:'#ef4444'}}>*</span>
            </label>
            <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={3}
              placeholder="Ej: El cliente no tenía dinero, dirección incorrecta..."
              style={{ width:'100%', boxSizing:'border-box', border:'2px solid #e5e7eb', borderRadius:16, padding:'14px', fontSize:15, outline:'none', fontFamily:'inherit', resize:'none', transition: 'border-color .2s' }}
              onFocus={e => e.target.style.borderColor = accion.color}
              onBlur={e => e.target.style.borderColor = '#e5e7eb'}
            />
          </div>
        )}

        {esReintento && (
          <div style={{ display:'flex', flexDirection:'column', gap:16, marginBottom:20 }}>
            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#084032', marginBottom:8 }}>📅 Fecha para reintentar</label>
              <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                style={{ width:'100%', boxSizing:'border-box', padding:'14px', borderRadius:16, border:'2px solid #e5e7eb', fontSize:15, outline:'none', fontFamily:'inherit' }}/>
            </div>
            <div>
              <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#084032', marginBottom:8 }}>📝 Instrucciones para el conductor (Opcional)</label>
              <input type="text" value={nota} onChange={e => setNota(e.target.value)}
                placeholder="Llamar antes de llegar..."
                style={{ width:'100%', boxSizing:'border-box', border:'2px solid #e5e7eb', borderRadius:16, padding:'14px', fontSize:15, outline:'none', fontFamily:'inherit' }}/>
            </div>
          </div>
        )}

        {(!esRechazo && !esReintento) && (
          <div style={{ marginBottom:20 }}>
            <label style={{ display:'block', fontSize:13, fontWeight:700, color:'#084032', marginBottom:8 }}>📝 Nota Interna (Opcional)</label>
            <input type="text" value={nota} onChange={e => setNota(e.target.value)}
              placeholder="Ej: Todo en orden, caja sellada..."
              style={{ width:'100%', boxSizing:'border-box', border:'2px solid #e5e7eb', borderRadius:16, padding:'14px', fontSize:15, outline:'none', fontFamily:'inherit' }}/>
          </div>
        )}

        <div style={{ display:'flex', gap:12 }}>
          <button onClick={onCancel} style={{ flex:1, height:50, borderRadius:16, border:'2px solid #e5e7eb', background:'transparent', fontSize:15, fontWeight:700, cursor:'pointer', color:'#6b7280' }}>
            Cancelar
          </button>
          <button onClick={handleConfirm} disabled={loading} style={{
            flex:1, height:50, borderRadius:16, border:'none',
            background: accion.color, color:'white', fontSize:15, fontWeight:800, cursor:'pointer',
            display:'flex', alignItems:'center', justifyContent:'center', gap:8,
            opacity: loading ? .7 : 1,
            boxShadow: `0 8px 16px ${accion.color}40`,
          }}>
            {loading ? <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', animation:'spin .7s linear infinite' }}/> : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principal ──
export default function MisPedidos() {
  const { user, profile } = useUser();
  const router = useRouter();
  const isAdmin = profile?.role === 'admin';

  const [pedidos, setPedidos]         = useState([]);
  const [loading, setLoading]         = useState(true);
  const [expanded, setExpanded]       = useState(null);
  
  const [filtroEstado, setFiltro]     = useState('todos');
  const [filtroRango, setFiltroRango] = useState('todos');
  const [filtroVendedor, setFiltroVendedor] = useState('todos');
  const [filtroCliente, setFiltroCliente]   = useState('todos'); // NUEVO: Select de Cliente
  
  const [vendedores, setVendedores]   = useState([]);
  
  const [modalData, setModalData]     = useState(null);
  const [modalCancelar, setModalCancelar] = useState(null);
  const [historial, setHistorial]     = useState({});
  const [loadingAction, setLoadingAction] = useState(null);
  const [toast, setToast]             = useState(null);
  
  // Paginación
  const [pagina, setPagina]           = useState(1);
  const [porPagina, setPorPagina]     = useState(10);
  const [totalRegistros, setTotalRegistros] = useState(0);

  const [clientesUnicos, setClientesUnicos] = useState([]);

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  // ── Fetch pedidos ──
  const fetchPedidos = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from('orders')
      .select(`id, cliente_nombre, estado, total_recaudo, creado_en, actualizado_en,
               observaciones, motivo_rechazo, nota_reintento, fecha_reintento,
               intentos_entrega, pagado, fecha_entrega, tipo_factura, tipo_pago, vendedor_id,
               order_items(medicamento_nombre, cantidad),
               profiles!orders_vendedor_id_fkey(id, nombre_completo)`, { count: 'exact' })
      .order('creado_en', { ascending: false });

    // Filtros
    if (!isAdmin) {
      q = q.eq('vendedor_id', user.id);
    } else if (filtroVendedor !== 'todos') {
      q = q.eq('vendedor_id', filtroVendedor);
    }

    if (filtroEstado === 'rechazos') {
      q = q.in('estado', ['rechazado_puerta', 'cerrado_sin_entrega']);
    } else if (filtroEstado !== 'todos') {
      q = q.eq('estado', filtroEstado);
    }

    if (filtroCliente !== 'todos') {
      q = q.eq('cliente_nombre', filtroCliente);
    }

    const rango = getRangoFecha(filtroRango);
    if (rango) {
      q = q.gte('creado_en', rango.desde.toISOString());
    }

    // Paginación
    const from = (pagina - 1) * porPagina;
    const to = from + porPagina - 1;
    q = q.range(from, to);

    const { data, count } = await q;
    if (data) {
      setPedidos(data);
      setTotalRegistros(count || 0);
    }
    setLoading(false);
  }, [user, isAdmin, filtroEstado, filtroRango, filtroVendedor, filtroCliente, pagina, porPagina]);

  const fetchClientes = useCallback(async () => {
    if (!user) return;
    let q = supabase.from('orders').select('cliente_nombre');
    if (!isAdmin) q = q.eq('vendedor_id', user.id);
    const { data } = await q;
    if (data) {
      const nombres = data.map(d => d.cliente_nombre).filter(n => n?.trim());
      setClientesUnicos([...new Set(nombres)].sort());
    }
  }, [user, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from('profiles').select('id, nombre_completo').eq('role', 'vendedor').then(({ data }) => {
      if (data) setVendedores(data);
    });
  }, [isAdmin]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  useEffect(() => {
    if (!user) { setLoading(false); return; }
    fetchPedidos();
    const channel = supabase.channel('pedidos_rt_v4')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchPedidos();
        fetchClientes();
      })
      .subscribe();
    return () => supabase.removeChannel(channel);
  }, [user, fetchPedidos, fetchClientes]);

  // ── Modificar Filtros Visuales ──
  const FILTROS_ESTADO = [
    { id:'todos',      label:'Todos'       },
    { id:'pendiente',  label:'Pendientes', icon: '⏳' },
    { id:'alistando',  label:'Alistando',  icon: '📦' },
    { id:'en_camino',  label:'En Camino',  icon: '🚚' },
    { id:'entregado',  label:'Entregados', icon: '✅' },
    { id:'rechazos',   label:'Rechazos',   icon: '🚫' },
    { id:'cancelado',  label:'Cancelados', icon: '❌' },
  ];

  // Acciones
  const fetchHistorial = async (orderId) => {
    if (historial[orderId]) return;
    const { data } = await supabase.from('order_history').select('*').eq('order_id', orderId).order('creado_en', { ascending: true });
    if (data) setHistorial(p => ({ ...p, [orderId]: data }));
  };

  const ejecutarAccion = async (pedido, accion, opciones) => {
    setLoadingAction(pedido.id + accion.a);
    const res = await cambiarEstadoPedido(pedido.id, accion.a, { ...opciones, adminId: user?.id });
    setLoadingAction(null);
    setModalData(null);
    if (res.success) showToast(`Pedido pasado a ${ESTADO[accion.a]?.label}`);
    else showToast(res.error, false);
  };

  const ejecutarCancelar = async (pedido, motivo) => {
    const res = await cancelarPedido(pedido.id, { motivo, usuarioId: user?.id, esAdmin: isAdmin });
    setModalCancelar(null);
    if (res.success) showToast('Pedido cancelado');
    else showToast(res.error, false);
  };

  if (!user) return <div style={{textAlign:'center', marginTop:100}}>Cargando...</div>;

  // Calcular stats rápidas (deben ser locales a la página para no complicar, o desde totalRegistros)
  // Como ahora "pedidos" solo tiene los filtrados de esta página, las stats rápidas las mantenemos ocultas 
  // o las mostramos basadas en los de esta página. Mejor dejamos las que tenemos para dar feedback inmediato de la página
  const pendientes   = pedidos.filter(p => p.estado === 'pendiente').length;
  const enRuta       = pedidos.filter(p => p.estado === 'en_camino').length;
  const entregados   = pedidos.filter(p => p.estado === 'entregado').length;

  return (
    <div style={{ paddingBottom:40 }}>
      {/* ══ HERO CON ESTADÍSTICAS ══ */}
      <div style={{
        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 100%)',
        padding:'32px 20px 100px', borderRadius:'0 0 40px 40px',
        position:'relative', overflow:'hidden', marginBottom:-72,
      }}>
        {/* Decoración fondo */}
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>
        <div style={{ position:'absolute', bottom:-20, left:-30, width:150, height:150, borderRadius:'50%', background:'rgba(255,255,255,0.03)' }}/>

        <div style={{ position:'relative', zIndex:1 }}>
          <div style={{ marginBottom:20 }}>
            <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
              {isAdmin && <span style={{ background:'rgba(255,255,255,0.15)', color:'white', fontSize:11, fontWeight:800, padding:'4px 12px', borderRadius:20, letterSpacing:1, backdropFilter:'blur(4px)' }}>👑 ADMIN</span>}
              <p style={{ color:'rgba(255,255,255,0.7)', fontSize:14, fontWeight:600, margin:0 }}>{profile?.nombre_completo}</p>
            </div>
            <h1 style={{ color:'white', fontSize:28, fontWeight:900, margin:0, lineHeight:1.2 }}>
              {isAdmin ? '📋 Gestión de Pedidos' : '🛍️ Mis Pedidos'}
            </h1>
          </div>

          {/* Stats rápidas */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(4, 1fr)', gap:10 }}>
            {[
              { label:'Total Búsqueda', value: totalRegistros, icon:'📦' },
              { label:'Pendiente', value: pendientes, icon:'⏳' },
              { label:'En Ruta',   value: enRuta,    icon:'🚚' },
              { label:'Entregado', value: entregados, icon:'✅' },
            ].map(s => (
              <div key={s.label} style={{ background:'rgba(255,255,255,0.22)', borderRadius:20, padding:'14px 8px', textAlign:'center', backdropFilter:'blur(12px)', border:'1px solid rgba(255,255,255,0.2)' }}>
                <div style={{ fontSize:20, marginBottom:2 }}>{s.icon}</div>
                <div style={{ color:'white', fontSize:22, fontWeight:900 }}>{s.value}</div>
                <div style={{ color:'white', fontSize:10, fontWeight:800, opacity:0.9 }}>{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ padding:'0 16px', display:'flex', flexDirection:'column', gap:20 }}>

        {/* ── SEGUNDA BARRA (FILTROS DE LOS SELECTS) ── */}
        <div style={{ display:'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap:12, position: 'relative', zIndex: 10 }}>
          {/* Cliente Select */}
          <div className="custom-select-wrapper" style={{ background:'white', padding:4, borderRadius:20, boxShadow:'0 8px 24px rgba(0,0,0,0.08)' }}>
            <select
              value={filtroCliente} onChange={e => { setFiltroCliente(e.target.value); setPagina(1); }}
              style={{ width:'100%', padding:'12px 16px', border:'none', background:'transparent', fontSize:15, fontWeight:600, color:'#084032', outline:'none', appearance:'none', cursor:'pointer' }}
            >
              <option value="todos">👥 Todos los Clientes</option>
              {clientesUnicos.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Vendedor Select (Solo admin) */}
          {isAdmin && (
            <div className="custom-select-wrapper" style={{ background:'white', padding:4, borderRadius:20, boxShadow:'0 8px 24px rgba(0,0,0,0.08)' }}>
              <select
                value={filtroVendedor} onChange={e => { setFiltroVendedor(e.target.value); setPagina(1); }}
                style={{ width:'100%', padding:'12px 16px', border:'none', background:'transparent', fontSize:15, fontWeight:600, color:'#084032', outline:'none', appearance:'none', cursor:'pointer' }}
              >
                <option value="todos">👤 Todos los Vendedores</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.nombre_completo}</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Fecha Rango Select */}
        <div style={{ display:'flex', gap:8, overflowX:'auto', paddingBottom:4 }}>
          {[ {id:'todos', l:'Siempre'}, {id:'hoy', l:'Hoy'}, {id:'semana', l:'Esta Semana'}, {id:'mes', l:'Este Mes'} ].map(r => (
            <button key={r.id} onClick={()=>{ setFiltroRango(r.id); setPagina(1); }} style={{
              flexShrink:0, padding:'10px 16px', borderRadius:16, border:'none', cursor:'pointer', fontSize:14, fontWeight:700,
              background: filtroRango === r.id ? '#084032' : '#f1f5f9',
              color: filtroRango === r.id ? 'white' : '#64748b', transition:'all .2s'
            }}>{r.l}</button>
          ))}
        </div>

        {/* Chips de Estados Generales */}
        <div style={{ display:'flex', gap:10, overflowX:'auto', paddingBottom:8, marginTop:-4 }}>
          {FILTROS_ESTADO.map(f => {
             const isSel = filtroEstado === f.id;
             return (
               <button key={f.id} onClick={()=>{ setFiltro(f.id); setPagina(1); }} style={{
                 display:'flex', alignItems:'center', gap:6, flexShrink:0,
                 padding:'10px 16px', borderRadius:20, border: isSel ? '2px solid #0F6E56' : '2px solid transparent',
                 background: isSel ? 'rgba(15,110,86,0.15)' : '#ffffff',
                 boxShadow: '0 4px 10px rgba(0,0,0,0.04)', color: isSel ? '#0F6E56' : '#64748b',
                 fontSize:14, fontWeight:800, transition:'all .2s', cursor:'pointer'
               }}>
                 {f.icon && <span>{f.icon}</span>}
                 {f.label}
               </button>
             );
          })}
        </div>

        {/* LISTA DE PEDIDOS */}
        {loading ? (
             <div style={{textAlign:'center', padding:'40px 0', color:'#94a3b8', fontWeight:600}}>Cargando pedidos...</div>
        ) : pedidos.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 20px', background:'white', borderRadius:32, boxShadow:'0 10px 30px rgba(0,0,0,0.03)' }}>
            <span style={{ fontSize:64, display:'block', marginBottom:16 }}>📭</span>
            <h3 style={{ fontSize:20, color:'#084032', margin:'0 0 8px' }}>Ningún pedido coincide</h3>
            <p style={{ color:'#6b7280', fontSize:15, margin:0 }}>Prueba ajustando los filtros de cliente o estado.</p>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {pedidos.map((pedido) => {
              const cfg    = ESTADO[pedido.estado] || ESTADO.pendiente;
              const isOpen = expanded === pedido.id;
              const items  = pedido.order_items || [];
              const uds    = items.reduce((a,i) => a + (parseInt(i.cantidad)||0), 0);
              
              const accs   = isAdmin ? (ACCIONES_ADMIN[pedido.estado] || []) : [];
              const puedeEvVendor = !isAdmin && pedido.estado === 'pendiente';
              
              return (
                <div key={pedido.id} style={{
                  background:'white', borderRadius:28, overflow:'hidden',
                  boxShadow: isOpen ? '0 12px 32px rgba(0,0,0,0.08)' : '0 4px 12px rgba(0,0,0,0.04)',
                  border: `1px solid ${isOpen ? cfg.border : '#f1f5f9'}`,
                  transition: 'all .3s cubic-bezier(.4,0,.2,1)'
                }}>
                  
                  {/* Tarjeta Resumen */}
                  <div onClick={() => {
                      const next = isOpen ? null : pedido.id;
                      setExpanded(next);
                      if (next) fetchHistorial(next);
                    }}
                    style={{ padding:'20px', cursor:'pointer', position:'relative' }}>
                    
                    <div style={{ position:'absolute', left:0, top:20, bottom:20, width:6, borderRadius:'0 6px 6px 0', background: cfg.color }}/>
                    
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', paddingLeft:14 }}>
                      <div>
                        {isAdmin && (
                          <div style={{ fontSize:12, fontWeight:700, color:'#64748b', marginBottom:4, display:'flex', alignItems:'center', gap:4 }}>
                            👤 {pedido.profiles?.nombre_completo}
                          </div>
                        )}
                        <h3 style={{ margin:'0 0 6px', fontSize:18, fontWeight:800, color:'#084032' }}>{pedido.cliente_nombre}</h3>
                        
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                           <span style={{ fontSize:13, fontWeight:600, color:'#64748b', background:'#f1f5f9', padding:'4px 10px', borderRadius:10 }}>
                             📦 {items.length} prods ({uds} uds)
                           </span>
                           <span style={{ fontSize:13, color:'#94a3b8', fontWeight:500 }}>
                             {new Date(pedido.creado_en).toLocaleDateString('es-CO', {month:'short', day:'numeric'})}
                           </span>
                        </div>
                      </div>
                      
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end' }}>
                         <span style={{ background: cfg.bg, color: cfg.color, fontWeight:800, fontSize:12, padding:'6px 12px', borderRadius:12, display:'flex', alignItems:'center', gap:6 }}>
                           {cfg.emoji} {cfg.label}
                         </span>
                      </div>
                    </div>
                  </div>

                  {/* Detalle Desplegable */}
                  {isOpen && (
                    <div style={{ background:'#f8fafc', borderTop:'1px solid #f1f5f9', animation:'slideDown .3s ease' }}>
                      
                      <div style={{ padding:'16px 20px 4px' }}>
                         <p style={{ margin:'0 0 8px', fontSize:12, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>Progreso del Pedido</p>
                         <BarraProgreso estado={pedido.estado}/>
                      </div>

                      <div style={{ padding:'20px' }}>
                        <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>Medicamentos Solicitados</p>
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {items.map((it, idx)=>(
                            <div key={idx} style={{ display:'flex', justifyContent:'space-between', background:'white', padding:'12px 16px', borderRadius:16, border:'1px solid #e2e8f0' }}>
                              <span style={{ fontSize:15, fontWeight:600, color:'#084032' }}>{it.medicamento_nombre}</span>
                              <span style={{ fontSize:15, fontWeight:800, color:'#0F6E56', background:'rgba(15,110,86,0.1)', padding:'2px 12px', borderRadius:12 }}>×{it.cantidad}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {(pedido.observaciones || pedido.motivo_rechazo) && (
                        <div style={{ padding:'0 20px 20px', display:'flex', flexDirection:'column', gap:10 }}>
                          {pedido.observaciones && (
                            <div style={{ padding:16, background:'#fffbeb', border:'1px solid #fde68a', borderRadius:16 }}>
                              <strong style={{ display:'block', fontSize:12, color:'#d97706', textTransform:'uppercase', marginBottom:4 }}>📝 Observaciones del Vendedor</strong>
                              <span style={{ fontSize:14, color:'#b45309', fontWeight:500 }}>{pedido.observaciones}</span>
                            </div>
                          )}
                          {pedido.motivo_rechazo && (
                            <div style={{ padding:16, background:'#fef2f2', border:'1px solid #fecaca', borderRadius:16 }}>
                              <strong style={{ display:'block', fontSize:12, color:'#dc2626', textTransform:'uppercase', marginBottom:4 }}>🚫 Motivo Cancelación/Rechazo</strong>
                              <span style={{ fontSize:14, color:'#b91c1c', fontWeight:500 }}>{pedido.motivo_rechazo}</span>
                            </div>
                          )}
                        </div>
                      )}

                      <div style={{ padding:'20px', background:'white', borderTop:'1px solid #e2e8f0', display:'flex', flexDirection:'column', gap:12 }}>
                        
                        {isAdmin && accs.length > 0 && (
                          <>
                             <p style={{ margin:0, fontSize:12, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>Gestionar Estado</p>
                             <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:10 }}>
                               {accs.map(acc => (
                                 <button key={acc.a} onClick={()=>setModalData({pedido, accion:acc})} style={{
                                   background:acc.color, color:'white', border:'none', padding:'16px', borderRadius:16,
                                   fontSize:15, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:10,
                                   boxShadow:`0 6px 16px ${acc.color}40`, transition:'transform .2s'
                                 }}>
                                   <span style={{ fontSize:18 }}>{acc.icon}</span> {acc.label}
                                 </button>
                               ))}
                             </div>
                             
                             {!['entregado','cerrado_sin_entrega','cancelado'].includes(pedido.estado) && (
                                <button onClick={()=>setModalCancelar(pedido)} style={{
                                   marginTop:10, background:'transparent', color:'#dc2626', border:'2px solid #fecaca', padding:'14px', borderRadius:16,
                                   fontSize:14, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8
                                 }}>
                                   ❌ Cancelar Pedido Completamente
                                 </button>
                             )}
                          </>
                        )}

                        {puedeEvVendor && (
                          <div>
                            <button onClick={()=>router.push(`/pedidos/${pedido.id}/editar`)} style={{
                              width: '100%', background:'#0F6E56', color:'white', border:'none', padding:'16px', borderRadius:16,
                              fontSize:15, fontWeight:800, cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                              boxShadow:'0 6px 16px rgba(15,110,86,0.3)'
                            }}>
                              ✏️ Editar Compra
                            </button>
                          </div>
                        )}

                        {['entregado','cerrado_sin_entrega','cancelado'].includes(pedido.estado) && (
                          <div style={{ textAlign:'center', padding:'10px', background:'#f8fafc', borderRadius:12 }}>
                            <span style={{ fontSize:14, fontWeight:600, color:'#64748b' }}>Este pedido ha finalizado su ciclo.</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Paginación UI (Nuevo estilo verde premium) */}
            {totalRegistros > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '16px 20px', borderRadius: 24, boxShadow: '0 8px 24px rgba(0,0,0,0.04)', marginTop: 8, gap: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 14, fontWeight: 700, color: '#64748b' }}>Mostrar:</span>
                  <div className="custom-select-wrapper" style={{ background: '#f1f5f9', padding: '0 4px', borderRadius: 12 }}>
                    <select 
                      value={porPagina} 
                      onChange={e => { setPorPagina(Number(e.target.value)); setPagina(1); }}
                      style={{ padding: '8px 30px 8px 12px', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 800, color: '#084032', outline: 'none', appearance: 'none', cursor: 'pointer' }}
                    >
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={30}>30</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button 
                    onClick={() => setPagina(p => Math.max(1, p - 1))} 
                    disabled={pagina === 1}
                    style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: pagina === 1 ? '#f1f5f9' : '#0F6E56', color: pagina === 1 ? '#94a3b8' : 'white', fontWeight: 800, cursor: pagina === 1 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                  >
                    Anterior
                  </button>
                  <span style={{ fontSize: 14, fontWeight: 800, color: '#084032', minWidth: 80, textAlign: 'center' }}>
                    Pág {pagina} de {Math.ceil(totalRegistros / porPagina) || 1}
                  </span>
                  <button 
                    onClick={() => setPagina(p => p + 1)} 
                    disabled={pagina >= Math.ceil(totalRegistros / porPagina)}
                    style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: pagina >= Math.ceil(totalRegistros / porPagina) ? '#f1f5f9' : '#0F6E56', color: pagina >= Math.ceil(totalRegistros / porPagina) ? '#94a3b8' : 'white', fontWeight: 800, cursor: pagina >= Math.ceil(totalRegistros / porPagina) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                  >
                    Siguiente
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* TOAST SYSTEM (Notificación pop-up) */}
      {toast && (
        <div style={{
          position:'fixed', bottom:100, left:'50%', transform:'translateX(-50%)', zIndex:9999,
          background: toast.ok ? '#10b981' : '#dc2626', color:'white', padding:'16px 24px',
          borderRadius:100, fontSize:15, fontWeight:800, boxShadow:'0 10px 30px rgba(0,0,0,0.2)',
          display:'flex', alignItems:'center', gap:10, animation:'slideUpPop .4s cubic-bezier(.34,1.2,.64,1)'
        }}>
          <span>{toast.ok ? '✅' : '⚠️'}</span> {toast.msg}
        </div>
      )}

      {/* Modal cambio de estado */}
      {modalData && (
        <ModalAccion
          accion={modalData.accion} pedido={modalData.pedido} adminId={user?.id}
          onConfirm={(opts) => ejecutarAccion(modalData.pedido, modalData.accion, opts)}
          onCancel={() => setModalData(null)}
        />
      )}

      {/* Modal Cancelación */}
      {modalCancelar && (
        <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', backdropFilter:'blur(4px)', padding: 20 }}>
          <div style={{ width:'100%', maxWidth:400, background:'white', borderRadius:28, padding:24, animation:'popIn .3s cubic-bezier(.34,1.2,.64,1)' }}>
            <h3 style={{ color:'#dc2626', fontSize:22, fontWeight:800, margin:'0 0 8px', textAlign:'center' }}>❌ Anular Pedido</h3>
            <p style={{ color:'#6b7280', fontSize:15, textAlign:'center', marginBottom:20 }}>{modalCancelar.cliente_nombre}</p>
            
            <textarea id="motivoCancel" rows={3} placeholder="¿Cuál es el motivo de la cancelación?"
              style={{ width:'100%', boxSizing:'border-box', border:'2px solid #fecaca', borderRadius:16, padding:14, fontSize:15, outline:'none', fontFamily:'inherit', resize:'none', marginBottom:20 }} />
            
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={()=>setModalCancelar(null)} style={{ flex:1, padding:16, background:'#f1f5f9', border:'none', borderRadius:16, color:'#64748b', fontWeight:800, fontSize:15 }}>Volver</button>
              <button onClick={()=>{
                const m = document.getElementById('motivoCancel').value;
                ejecutarCancelar(modalCancelar, m);
              }} style={{ flex:1, padding:16, background:'#dc2626', border:'none', borderRadius:16, color:'white', fontWeight:800, fontSize:15, boxShadow:'0 8px 16px rgba(220,38,38,0.3)' }}>Anular Ahora</button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
        @keyframes popIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        @keyframes slideUpPop { 0% { opacity:0; transform:translate(-50%, 20px); } 100% { opacity:1; transform:translate(-50%, 0); } }
        
        .custom-select-wrapper { position: relative; }
        .custom-select-wrapper::after { content:'▾'; position:absolute; right:16px; top:50%; transform:translateY(-50%); font-size:20px; color:#94a3b8; pointer-events:none; }
      `}</style>
    </div>
  );
}
