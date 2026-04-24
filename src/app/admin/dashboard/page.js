'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';

const ESTADO_CFG = {
  pendiente:            { label:'Pendiente',          emoji:'⏳', color:'#0F6E56' },
  alistando:            { label:'Alistando',           emoji:'📦', color:'#16a34a' },
  facturando:           { label:'Facturando',          emoji:'🧾', color:'#059669' },
  en_camino:            { label:'En camino',           emoji:'🚚', color:'#0d9488' },
  entregado:            { label:'Entregado',           emoji:'✅', color:'#10b981' },
  rechazado_puerta:     { label:'Rechazado',           emoji:'🚫', color:'#ef4444' },
  programado_reintento: { label:'Reintento',           emoji:'🔄', color:'#f97316' },
  cerrado_sin_entrega:  { label:'Cerrado',             emoji:'🔒', color:'#6b7280' },
  cancelado:            { label:'Cancelado',            emoji:'❌', color:'#dc2626' },
};

export default function DashboardAdmin() {
  const { profile, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalPedidos: 0,
    pedidosHoy: 0,
    totalClientes: 0,
    tasaEntrega: 0,
    porEstado: {},
    topVendedores: [],
    pedidosRecientes: [],
  });

  const fetchStats = useCallback(async () => {
    setLoading(true);

    // Rango de "hoy"
    const now = new Date();
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    // 1. Todos los pedidos con su vendedor
    const { data: pedidos } = await supabase
      .from('orders')
      .select('id, estado, creado_en, cliente_nombre, vendedor_id, localidad, profiles!orders_vendedor_id_fkey(nombre_completo)')
      .order('creado_en', { ascending: false });

    // 2. Total clientes
    const { count: totalClientes } = await supabase
      .from('clientes')
      .select('*', { count: 'exact', head: true });

    if (!pedidos) { setLoading(false); return; }

    const totalPedidos = pedidos.length;
    const pedidosHoy = pedidos.filter(p => p.creado_en >= hoy).length;
    const entregados = pedidos.filter(p => p.estado === 'entregado').length;
    const tasaEntrega = totalPedidos > 0 ? Math.round((entregados / totalPedidos) * 100) : 0;

    // Por estado
    const porEstado = {};
    pedidos.forEach(p => {
      porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
    });

    // Top vendedores (por cantidad de pedidos)
    const vendedorMap = {};
    pedidos.forEach(p => {
      const name = p.profiles?.nombre_completo || 'Sin asignar';
      if (!vendedorMap[name]) vendedorMap[name] = { nombre: name, total: 0, entregados: 0 };
      vendedorMap[name].total += 1;
      if (p.estado === 'entregado') vendedorMap[name].entregados += 1;
    });
    const topVendedores = Object.values(vendedorMap).sort((a, b) => b.total - a.total).slice(0, 5);

    // Por localidad
    const porLocalidad = {};
    pedidos.forEach(p => {
      const loc = p.localidad || 'Sin asignar';
      porLocalidad[loc] = (porLocalidad[loc] || 0) + 1;
    });

    // Pedidos recientes (últimos 5)
    const pedidosRecientes = pedidos.slice(0, 5);

    setStats({ 
      totalPedidos, 
      pedidosHoy, 
      totalClientes: totalClientes || 0, 
      tasaEntrega, 
      porEstado, 
      topVendedores, 
      pedidosRecientes,
      porLocalidad 
    });
    setLoading(false);
  }, []);

  useEffect(() => {
    if (profile?.role === 'admin') {
      fetchStats();
      const channel = supabase.channel('dashboard_rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => fetchStats())
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [profile, fetchStats]);

  if (userLoading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(15,110,86,0.15)', borderTopColor: '#0F6E56', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Cargando...</p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') return (
    <div style={{ padding: 24, maxWidth: 400, margin: '48px auto', textAlign: 'center' }}>
      <div style={{ background: 'white', borderRadius: 24, padding: 32, boxShadow: '0 8px 24px rgba(0,0,0,0.06)' }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: '#dc2626', marginBottom: 8, fontSize: 18 }}>Acceso Restringido</h2>
        <p style={{ color: '#94a3b8', fontSize: 14 }}>Solo los administradores pueden acceder al dashboard.</p>
      </div>
    </div>
  );

  const totalPaginas = Math.max(1, stats.totalPedidos);
  const estadoEntries = Object.entries(stats.porEstado).sort((a, b) => b[1] - a[1]);

  return (
    <div style={{ paddingBottom: 90 }}>

      {/* ══ HERO HEADER ══ */}
      <div style={{
        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 55%, #1a9b78 100%)',
        padding: '32px 20px 48px',
        borderRadius: '0 0 32px 32px',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(8,64,50,0.15)'
      }}>
        <div style={{ position:'absolute', top:-40, right:-40, width:200, height:200, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }}/>
        <div style={{ position:'absolute', bottom:-20, left:-30, width:150, height:150, borderRadius:'50%', background:'rgba(255,255,255,0.03)' }}/>
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
            <span style={{ 
              background:'rgba(255,255,255,0.18)', color:'white', fontSize:10, fontWeight:900, 
              padding:'4px 14px', borderRadius:100, letterSpacing:1.5, backdropFilter:'blur(8px)',
              border: '1px solid rgba(255,255,255,0.2)', textTransform: 'uppercase'
            }}>ADMINISTRADOR</span>
            <div style={{ width:4, height:4, borderRadius:'50%', background:'rgba(255,255,255,0.4)' }} />
            <p style={{ color:'rgba(255,255,255,0.85)', fontSize:13, fontWeight:700, margin:0 }}>{profile?.nombre_completo}</p>
          </div>
          <h1 style={{ color:'white', fontSize:26, fontWeight:900, margin:0, lineHeight:1, letterSpacing: '-0.5px' }}>
            Dashboard
          </h1>
          <p style={{ color:'rgba(255,255,255,0.65)', fontSize:13, margin:'8px 0 0', fontWeight:500 }}>
            Visualización operativa y logística
          </p>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: -20, position: 'relative', zIndex: 10, display: 'flex', flexDirection: 'column', gap: 20 }}>

        {loading ? (
          <div style={{ textAlign:'center', padding:'40px 0', color:'#94a3b8', fontWeight:600 }}>Cargando dashboard...</div>
        ) : (
          <>
            {/* ── KPI Cards ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              {[
                { label: 'Total Pedidos', value: stats.totalPedidos, icon: '📦', sub: `${stats.pedidosHoy} hoy` },
                { label: 'Pedidos Hoy', value: stats.pedidosHoy, icon: '📅', sub: 'últimas 24h' },
                { label: 'Clientes', value: stats.totalClientes, icon: '🏪', sub: 'registrados' },
                { label: 'Tasa Entrega', value: `${stats.tasaEntrega}%`, icon: '✅', sub: 'eficiencia' },
              ].map(kpi => (
                <div key={kpi.label} style={{
                  background: 'white', borderRadius: 24, padding: '20px 16px',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9',
                  display: 'flex', flexDirection: 'column', gap: 6,
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 24 }}>{kpi.icon}</span>
                    <span style={{ fontSize: 10, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>{kpi.sub}</span>
                  </div>
                  <div style={{ fontSize: 24, fontWeight: 900, color: '#084032', lineHeight: 1.1 }}>{kpi.value}</div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b' }}>{kpi.label}</div>
                </div>
              ))}
            </div>

            {/* ── Quick Actions ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
              <button 
                onClick={() => router.push('/')}
                style={{
                  background: 'linear-gradient(135deg, #0F6E56 0%, #084032 100%)',
                  borderRadius: 20, padding: '16px', border: 'none', color: 'white',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  cursor: 'pointer', boxShadow: '0 8px 20px rgba(15,110,86,0.2)',
                  transition: 'transform 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-4px)'}
                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <span style={{ fontSize: 24 }}>➕</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>Nuevo Pedido</span>
              </button>
              <button 
                onClick={() => router.push('/admin/configuracion?tab=clientes')}
                style={{
                  background: 'white', borderRadius: 20, padding: '16px', 
                  border: '2px solid #0F6E56', color: '#0F6E56',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
                  cursor: 'pointer', boxShadow: '0 8px 20px rgba(0,0,0,0.05)',
                  transition: 'transform 0.2s'
                }}
                onMouseOver={e => e.currentTarget.style.transform = 'translateY(-4px)'}
                onMouseOut={e => e.currentTarget.style.transform = 'translateY(0)'}
              >
                <span style={{ fontSize: 24 }}>🏪</span>
                <span style={{ fontSize: 13, fontWeight: 800 }}>Crear Cliente</span>
              </button>
            </div>

            {/* ── Pedidos por Estado ── */}
            <div style={{ background: 'white', borderRadius: 24, padding: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
              <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                Distribución por Estado
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {estadoEntries.map(([estado, count]) => {
                  const cfg = ESTADO_CFG[estado] || { label: estado, emoji: '❓', color: '#6b7280' };
                  const pct = totalPaginas > 0 ? Math.round((count / totalPaginas) * 100) : 0;
                  return (
                    <div key={estado}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#084032', display: 'flex', alignItems: 'center', gap: 6 }}>
                          {cfg.emoji} {cfg.label}
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 800, color: cfg.color }}>{count} ({pct}%)</span>
                      </div>
                      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, background: cfg.color,
                          borderRadius: 8, transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Pedidos por Localidad ── */}
            <div style={{ background: 'white', borderRadius: 24, padding: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
              <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                📍 Cobertura por Localidad
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {Object.entries(stats.porLocalidad || {}).sort((a,b) => b[1] - a[1]).map(([loc, count]) => {
                  const pct = stats.totalPedidos > 0 ? Math.round((count / stats.totalPedidos) * 100) : 0;
                  return (
                    <div key={loc}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#084032' }}>{loc}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#0F6E56' }}>{count}</span>
                      </div>
                      <div style={{ height: 6, background: '#f1f5f9', borderRadius: 8, overflow: 'hidden' }}>
                        <div style={{
                          height: '100%', width: `${pct}%`, background: 'var(--brand)',
                          borderRadius: 8, transition: 'width 0.5s ease',
                        }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── Top Vendedores ── */}
            <div style={{ background: 'white', borderRadius: 24, padding: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
              <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                🏆 Ranking de Vendedores
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.topVendedores.map((v, idx) => (
                  <div key={v.nombre} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    background: idx === 0 ? 'rgba(15,110,86,0.06)' : '#f8fafc',
                    padding: '14px 16px', borderRadius: 16,
                    border: idx === 0 ? '1px solid rgba(15,110,86,0.15)' : '1px solid #f1f5f9',
                  }}>
                    <div style={{
                      width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                      background: idx === 0 ? '#0F6E56' : idx === 1 ? '#16a34a' : '#94a3b8',
                      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 14, fontWeight: 900,
                    }}>
                      {idx + 1}
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: '#084032' }}>{v.nombre}</p>
                      <p style={{ margin: '2px 0 0', fontSize: 12, color: '#64748b' }}>
                        {v.entregados} entregados de {v.total} totales
                      </p>
                    </div>
                    <div style={{
                      background: 'rgba(15,110,86,0.1)', color: '#0F6E56',
                      fontWeight: 800, fontSize: 16, padding: '6px 14px', borderRadius: 12,
                    }}>
                      {v.total}
                    </div>
                  </div>
                ))}
                {stats.topVendedores.length === 0 && (
                  <div style={{ textAlign: 'center', padding: '20px 0', color: '#94a3b8', fontSize: 14 }}>
                    Sin datos de vendedores aún
                  </div>
                )}
              </div>
            </div>

            {/* ── Últimos Pedidos ── */}
            <div style={{ background: 'white', borderRadius: 24, padding: '20px', boxShadow: '0 8px 24px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
              <p style={{ margin: '0 0 16px', fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1 }}>
                📋 Últimos Pedidos
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {stats.pedidosRecientes.map(p => {
                  const cfg = ESTADO_CFG[p.estado] || { label: p.estado, emoji: '❓', color: '#6b7280' };
                  return (
                    <div key={p.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '12px 14px', background: '#f8fafc', borderRadius: 16,
                      border: '1px solid #f1f5f9',
                    }}>
                      <div style={{ position: 'relative' }}>
                        <div style={{ width: 4, height: '100%', position: 'absolute', left: -14, top: 0, bottom: 0, borderRadius: 4, background: cfg.color }} />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#084032', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nombre}</p>
                          {p.localidad && (
                            <span style={{ fontSize: 9, fontWeight: 800, color: '#0F6E56', background: 'rgba(15,110,86,0.1)', padding: '2px 6px', borderRadius: 6, textTransform: 'uppercase' }}>
                              {p.localidad}
                            </span>
                          )}
                        </div>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {p.profiles?.nombre_completo} · {new Date(p.creado_en).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <span style={{
                        background: `${cfg.color}18`, color: cfg.color,
                        fontWeight: 800, fontSize: 11, padding: '5px 10px', borderRadius: 10,
                        display: 'flex', alignItems: 'center', gap: 4,
                      }}>
                        {cfg.emoji} {cfg.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
