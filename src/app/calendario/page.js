'use client';

import { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';

const ESTADO = {
  pendiente:            { label:'Pendiente',          emoji:'⏳', color:'#0F6E56', bg:'rgba(15,110,86,0.1)' },
  alistando:            { label:'Alistando',           emoji:'📦', color:'#16a34a', bg:'rgba(22,163,74,0.1)' },
  facturando:           { label:'Facturando',          emoji:'🧾', color:'#059669', bg:'rgba(5,150,105,0.1)' },
  en_camino:            { label:'En camino',           emoji:'🚚', color:'#0d9488', bg:'rgba(13,148,136,0.1)' },
  entregado:            { label:'Entregado',           emoji:'✅', color:'#10b981', bg:'rgba(16,185,129,0.1)' },
  rechazado_puerta:     { label:'Rechazado en Puerta', emoji:'🚫', color:'#ef4444', bg:'rgba(239,68,68,0.12)' },
  programado_reintento: { label:'Reintento Prog.',     emoji:'🔄', color:'#f97316', bg:'rgba(249,115,22,0.12)' },
  cerrado_sin_entrega:  { label:'Cerrado s/Entrega',   emoji:'🔒', color:'#6b7280', bg:'rgba(107,114,128,0.12)'},
  cancelado:            { label:'Cancelado',            emoji:'❌', color:'#dc2626', bg:'rgba(220,38,38,0.08)' },
};

export default function Calendario() {
  const { user, profile } = useUser();
  const router = useRouter();
  const [currentDate, setCurrentDate] = useState(new Date());
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedPedido, setSelectedPedido] = useState(null);
  const [selectedItems, setSelectedItems] = useState([]);
  const [selectedHistory, setSelectedHistory] = useState([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const fetchMes = async (date) => {
    if (!profile) return;
    setLoading(true);
    const primerDia = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
    const ultimoDia = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59).toISOString();

    let q = supabase
      .from('orders')
      .select('id, numero_pedido, cliente_nombre, estado, fecha_entrega, localidad, creado_en, profiles!orders_vendedor_id_fkey(nombre_completo)')
      .not('fecha_entrega', 'is', null)
      .gte('fecha_entrega', primerDia)
      .lte('fecha_entrega', ultimoDia);
    
    if (profile.role !== 'admin') {
      q = q.eq('vendedor_id', profile.id);
    }

    const { data } = await q;
    
    setPedidos(data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (!user || !profile) return;
    fetchMes(currentDate);

    const channel = supabase.channel('calendario_rt')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
        fetchMes(currentDate);
      })
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [user, profile, currentDate]);

  useEffect(() => {
    const fetchDetails = async () => {
      if (!selectedPedido) {
        setSelectedItems([]);
        setSelectedHistory([]);
        return;
      }
      setLoadingDetails(true);
      
      // Fetch items
      const { data: items } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', selectedPedido.id);
      if (items) setSelectedItems(items);

      // Fetch history
      const { data: history } = await supabase
        .from('order_history')
        .select(`
          id, estado_anterior, estado_nuevo, motivo_rechazo, nota_interna, creado_en,
          profiles!order_history_cambiado_por_fkey(nombre_completo)
        `)
        .eq('order_id', selectedPedido.id)
        .order('creado_en', { ascending: true });
      if (history) setSelectedHistory(history);
      
      setLoadingDetails(false);
    };
    fetchDetails();
  }, [selectedPedido]);

  const nextMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  const prevMonth = () => setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  const goToday = () => setCurrentDate(new Date());

  const diasDelMes = useMemo(() => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    // Ajustar para que Lunes sea 0 y Domingo 6
    const startOffset = firstDay === 0 ? 6 : firstDay - 1;
    
    const days = [];
    for (let i = 0; i < startOffset; i++) {
      days.push(null); // padding start
    }
    for (let d = 1; d <= daysInMonth; d++) {
      days.push(new Date(year, month, d));
    }
    return days;
  }, [currentDate]);

  const pedidosPorDia = useMemo(() => {
    const map = {};
    pedidos.forEach(p => {
      if (searchTerm && !p.cliente_nombre.toLowerCase().includes(searchTerm.toLowerCase())) return;

      // asumiendo YYYY-MM-DD
      const dateKey = p.fecha_entrega.split('T')[0];
      if (!map[dateKey]) map[dateKey] = [];
      map[dateKey].push(p);
    });
    return map;
  }, [pedidos, searchTerm]);

  if (!user || !profile) return <div style={{textAlign:'center', marginTop:100}}>Cargando...</div>;

  const monthName = currentDate.toLocaleString('es-CO', { month: 'long', year: 'numeric' });

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* HEADER HERO */}
      <div style={{
        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 100%)',
        padding:'32px 20px 40px', borderRadius:'0 0 30px 30px',
        position:'relative', overflow:'hidden', color:'white'
      }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
          <span style={{ background:'rgba(255,255,255,0.15)', fontSize:11, fontWeight:800, padding:'4px 12px', borderRadius:20 }}>📅 LOGÍSTICA</span>
        </div>
        <h1 style={{ fontSize:28, fontWeight:900, margin:'0 0 20px' }}>Calendario de Entregas</h1>

        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', background:'rgba(255,255,255,0.1)', padding:'8px', borderRadius:20, backdropFilter:'blur(10px)' }}>
          <button onClick={prevMonth} style={{ width:40, height:40, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.2)', color:'white', fontSize:18, cursor:'pointer' }}>◀</button>
          <span style={{ fontSize:18, fontWeight:700, textTransform:'capitalize' }}>{monthName}</span>
          <button onClick={nextMonth} style={{ width:40, height:40, borderRadius:'50%', border:'none', background:'rgba(255,255,255,0.2)', color:'white', fontSize:18, cursor:'pointer' }}>▶</button>
        </div>
        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <button onClick={goToday} style={{ border:'none', background:'transparent', color:'white', textDecoration:'underline', cursor:'pointer', fontWeight:600 }}>Volver a Hoy</button>
        </div>

        <div style={{ marginTop: 20 }}>
          <input 
            type="text" 
            placeholder="🔍 Filtrar por nombre de cliente..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%', padding: '12px 16px', borderRadius: 16, border: 'none',
              background: 'rgba(255,255,255,0.15)', color: 'white', outline: 'none',
              fontWeight: 500, fontSize: 14, backdropFilter: 'blur(10px)'
            }}
          />
        </div>
      </div>

      {/* GRID CALENDARIO */}
      <div style={{ padding: '20px 16px' }}>
        {loading ? (
          <div style={{ textAlign:'center', color:'#94a3b8', fontWeight:600, padding:'40px 0' }}>Cargando calendario...</div>
        ) : (
          <div style={{ background:'white', borderRadius:24, boxShadow:'0 10px 40px rgba(0,0,0,0.06)', overflow:'hidden' }}>
            
            {/* Headers Dias */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', background:'#f8fafc', borderBottom:'1px solid #e2e8f0' }}>
              {['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'].map(d => (
                <div key={d} style={{ padding:'12px 4px', textAlign:'center', fontSize:12, fontWeight:800, color:'#64748b' }}>{d}</div>
              ))}
            </div>

            {/* Grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)' }}>
              {diasDelMes.map((date, i) => {
                if (!date) return <div key={`empty-${i}`} style={{ background:'#fcfcfd', borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9', minHeight:100 }} />;
                
                // Formato local YYYY-MM-DD
                const yyyy = date.getFullYear();
                const mm = String(date.getMonth() + 1).padStart(2, '0');
                const dd = String(date.getDate()).padStart(2, '0');
                const dateKey = `${yyyy}-${mm}-${dd}`;
                
                const pedidosDelDia = pedidosPorDia[dateKey] || [];
                const isToday = new Date().toDateString() === date.toDateString();
                
                // Calcular estado general del dia
                const total = pedidosDelDia.length;
                const completados = pedidosDelDia.filter(p => p.estado === 'entregado').length;
                let bgDay = 'transparent';
                if (total > 0) {
                  if (completados === total) bgDay = 'rgba(16,185,129,0.08)'; // Verde si todos entregados
                  else bgDay = 'rgba(245,158,11,0.08)'; // Naranja si hay pendientes
                }

                return (
                  <div key={dateKey} style={{ 
                    borderRight:'1px solid #f1f5f9', borderBottom:'1px solid #f1f5f9', minHeight:100, 
                    padding:'6px', background: bgDay, display:'flex', flexDirection:'column'
                  }}>
                    <div style={{ 
                      fontSize:12, fontWeight:800, textAlign:'center', marginBottom:6,
                      color: isToday ? 'white' : '#64748b',
                      background: isToday ? '#0F6E56' : 'transparent',
                      width: 24, height: 24, lineHeight:'24px', borderRadius:'50%', margin:'0 auto 6px'
                    }}>
                      {date.getDate()}
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:4, flex:1 }}>
                      {pedidosDelDia.map(p => {
                        const est = ESTADO[p.estado] || ESTADO.pendiente;
                        return (
                          <div 
                            key={p.id}
                            onClick={() => setSelectedPedido(p)}
                            style={{
                              background: est.bg, border:`1px solid ${est.color}40`, borderRadius:4, padding:'4px',
                              fontSize:9, fontWeight:700, color: est.color, cursor:'pointer',
                              whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis',
                              boxShadow:'0 1px 2px rgba(0,0,0,0.05)'
                            }}
                            title={`${p.cliente_nombre} - ${p.localidad}`}
                          >
                            {est.emoji} #{p.numero_pedido} {p.cliente_nombre}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>

      {/* MODAL DETALLE COMPLETO (Sincronizado con Gestión) */}
      {selectedPedido && (
        <div style={{ position:'fixed', inset:0, zIndex:999, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(8px)' }} onClick={() => setSelectedPedido(null)} />
          <div style={{ 
            background:'white', borderRadius:32, width:'100%', maxWidth:500, position:'relative', 
            boxShadow:'0 25px 60px rgba(0,0,0,0.3)', maxHeight:'90vh', overflowY:'auto',
            animation: 'popIn .3s cubic-bezier(0.34, 1.56, 0.64, 1)'
          }}>
            
            {/* Header Visual */}
            <div style={{ 
              background: 'linear-gradient(135deg, #084032 0%, #0F6E56 100%)', 
              padding: '30px 24px', position: 'relative', color: 'white' 
            }}>
              <div style={{ fontSize:12, fontWeight:800, textTransform:'uppercase', letterSpacing:1.5, opacity:0.8, marginBottom:4 }}>Resumen de Entrega</div>
              <h3 style={{ margin:0, fontSize:24, fontWeight:900 }}>Pedido #{selectedPedido.numero_pedido}</h3>
              <p style={{ margin:'4px 0 0', color:'rgba(255,255,255,0.9)', fontSize:15, fontWeight:600 }}>{selectedPedido.cliente_nombre}</p>
            </div>

            <div style={{ padding:24 }}>
              {/* Info Rápida */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:24 }}>
                <div style={{ background:'#f8fafc', padding:12, borderRadius:16, border:'1px solid #f1f5f9' }}>
                   <div style={{ fontSize:11, color:'#64748b', fontWeight:800, textTransform:'uppercase', marginBottom:4 }}>Estado Actual</div>
                   <div style={{ fontWeight:800, color: ESTADO[selectedPedido.estado]?.color, fontSize:14 }}>
                      {ESTADO[selectedPedido.estado]?.emoji} {ESTADO[selectedPedido.estado]?.label}
                   </div>
                </div>
                <div style={{ background:'#f8fafc', padding:12, borderRadius:16, border:'1px solid #f1f5f9' }}>
                   <div style={{ fontSize:11, color:'#64748b', fontWeight:800, textTransform:'uppercase', marginBottom:4 }}>Localidad</div>
                   <div style={{ fontWeight:800, color: '#084032', fontSize:14 }}>
                      📍 {selectedPedido.localidad || 'N/A'}
                   </div>
                </div>
              </div>

              {/* Items */}
              <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>Medicamentos Solicitados</p>
              <div style={{ display:'flex', flexDirection:'column', gap:8, marginBottom:24 }}>
                {loadingDetails ? (
                  <div style={{ textAlign:'center', padding:10, color:'#94a3b8', fontSize:13 }}>Cargando productos...</div>
                ) : selectedItems.length > 0 ? (
                  selectedItems.map((it, idx)=>(
                    <div key={idx} style={{ display:'flex', justifyContent:'space-between', background:'#f8fafc', padding:'12px 16px', borderRadius:16, border:'1px solid #e2e8f0' }}>
                      <span style={{ fontSize:14, fontWeight:600, color:'#084032' }}>{it.medicamento_nombre}</span>
                      <span style={{ fontSize:14, fontWeight:800, color:'#0F6E56', background:'rgba(15,110,86,0.1)', padding:'2px 10px', borderRadius:12 }}>×{it.cantidad}</span>
                    </div>
                  ))
                ) : (
                  <div style={{ color:'#94a3b8', fontSize:13 }}>No hay items registrados.</div>
                )}
              </div>

              {/* Historial / Trazabilidad */}
              <p style={{ margin:'0 0 12px', fontSize:12, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1 }}>Trazabilidad del Pedido</p>
              <div style={{ background:'#f8fafc', borderRadius:20, padding:16, marginBottom:24, border:'1px solid #f1f5f9' }}>
                 <div style={{ fontSize:13, color:'#084032', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:16 }}>🆕</span>
                      <strong>Creado</strong>
                    </div>
                    <span style={{ fontSize:12, color:'#94a3b8' }}>{new Date(selectedPedido.creado_en).toLocaleDateString()}</span>
                 </div>
                 
                 {loadingDetails ? null : selectedHistory.map(h => (
                   <div key={h.id} style={{ fontSize:13, color:'#084032', marginTop:10, paddingTop:10, borderTop:'1px solid #e2e8f0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                        <span style={{ fontSize:16 }}>{ESTADO[h.estado_nuevo]?.emoji || '🔄'}</span>
                        <span style={{ fontWeight:600 }}>{ESTADO[h.estado_nuevo]?.label}</span>
                      </div>
                      <span style={{ fontSize:12, color:'#94a3b8' }}>
                        {new Date(h.creado_en).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}
                      </span>
                   </div>
                 ))}
              </div>

              <div style={{ display:'flex', gap:10 }}>
                <button 
                  onClick={() => setSelectedPedido(null)}
                  style={{ flex:1, padding:16, borderRadius:16, background:'#f1f5f9', color:'#64748b', border:'none', fontSize:15, fontWeight:700, cursor:'pointer' }}
                >
                  Cerrar Vista
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
