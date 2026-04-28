'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
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
  const router = useRouter();
  const { profile, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  
  // Dynamic State
  const [allPedidos, setAllPedidos] = useState([]);
  const [clientesCount, setClientesCount] = useState(0);
  const [timeFilter, setTimeFilter] = useState('7d'); // 'today', '7d', '30d', 'all'
  const [statusFilter, setStatusFilter] = useState(null);
  
  // Computed Stats
  const [stats, setStats] = useState({
    totalPedidos: 0,
    pedidosHoy: 0,
    tasaEntrega: 0,
    porEstado: {},
    topVendedores: [],
    pedidosRecientes: [],
    tendencia: [],
    maxTrend: 0,
    criticos: 0,
    porLocalidad: {}
  });

  const fetchStats = useCallback(async () => {
    const [{ data: pedidos }, { count: totalClientes }] = await Promise.all([
      supabase.from('orders').select('id, estado, creado_en, cliente_nombre, vendedor_id, localidad, profiles!orders_vendedor_id_fkey(nombre_completo)').order('creado_en', { ascending: false }),
      supabase.from('clientes').select('*', { count: 'exact', head: true })
    ]);

    if (pedidos) setAllPedidos(pedidos);
    if (totalClientes) setClientesCount(totalClientes);
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

  useEffect(() => {
    if (!allPedidos) return;

    const now = new Date();
    const hoy = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    
    // Filtro de fecha
    let filteredPedidos = allPedidos;
    if (timeFilter !== 'all') {
      const limitDate = new Date();
      if (timeFilter === 'today') limitDate.setHours(0,0,0,0);
      else if (timeFilter === '7d') limitDate.setDate(limitDate.getDate() - 7);
      else if (timeFilter === '30d') limitDate.setDate(limitDate.getDate() - 30);
      
      const limitISO = limitDate.toISOString();
      filteredPedidos = allPedidos.filter(p => p.creado_en >= limitISO);
    }

    // Filtro de estado adicional
    let finalFilteredPedidos = filteredPedidos;
    if (statusFilter) {
      if (statusFilter === 'novedades') {
        finalFilteredPedidos = filteredPedidos.filter(p => ['rechazado_puerta', 'programado_reintento', 'cancelado'].includes(p.estado));
      } else {
        finalFilteredPedidos = filteredPedidos.filter(p => p.estado === statusFilter);
      }
    }

    const totalPedidos = filteredPedidos.length;
    const filteredCount = finalFilteredPedidos.length;
    const pedidosHoy = allPedidos.filter(p => p.creado_en >= hoy).length;
    const entregadosTotal = filteredPedidos.filter(p => p.estado === 'entregado').length;
    const tasaEntrega = totalPedidos > 0 ? Math.round((entregadosTotal / totalPedidos) * 100) : 0;

    const porEstado = {};
    const vendedorMap = {};
    const porLocalidad = {};
    let criticos = 0;

    // Calculamos porEstado sobre el base filtered (tiempo) para que los contadores de las tarjetas siempre se vean
    filteredPedidos.forEach(p => {
      porEstado[p.estado] = (porEstado[p.estado] || 0) + 1;
      if (['rechazado_puerta', 'programado_reintento', 'cancelado'].includes(p.estado)) criticos++;
    });

    // Calculamos el resto sobre el finalFiltered (tiempo + estado)
    finalFilteredPedidos.forEach(p => {
      // Vendedores
      const name = p.profiles?.nombre_completo || 'Sin asignar';
      if (!vendedorMap[name]) vendedorMap[name] = { nombre: name, total: 0, entregados: 0 };
      vendedorMap[name].total += 1;
      if (p.estado === 'entregado') vendedorMap[name].entregados += 1;
      
      // Localidad
      const loc = p.localidad || 'Sin asignar';
      porLocalidad[loc] = (porLocalidad[loc] || 0) + 1;
    });

    const topVendedores = Object.values(vendedorMap).sort((a, b) => b.total - a.total).slice(0, 5);
    const pedidosRecientes = finalFilteredPedidos.slice(0, 5);

    // Tendencia 7 días (siempre muestra 7 días independientemente del filtro para contexto)
    const tendencia = [];
    let maxTrend = 0;
    for (let i=6; i>=0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const start = new Date(d.setHours(0,0,0,0)).toISOString();
      const end = new Date(d.setHours(23,59,59,999)).toISOString();
      const count = allPedidos.filter(p => p.creado_en >= start && p.creado_en <= end).length;
      if (count > maxTrend) maxTrend = count;
      tendencia.push({ dia: d.toLocaleDateString('es-CO', { weekday:'short' }).replace('.',''), count });
    }

    setStats({
      totalPedidos, filteredCount, pedidosHoy, tasaEntrega, porEstado, topVendedores, pedidosRecientes, tendencia, maxTrend, criticos, porLocalidad
    });

  }, [allPedidos, timeFilter, statusFilter]);

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

  // Cálculos visuales
  const pendientes = stats.porEstado['pendiente'] || 0;
  const alistando = stats.porEstado['alistando'] || 0;
  const facturando = stats.porEstado['facturando'] || 0;
  const enCamino = stats.porEstado['en_camino'] || 0;
  const entregados = stats.porEstado['entregado'] || 0;

  const filters = [
    { id: 'today', label: 'Hoy' },
    { id: '7d', label: '7 Días' },
    { id: '30d', label: '30 Días' },
    { id: 'all', label: 'Todos' },
  ];

  return (
    <div style={{ background: '#f8fafc', minHeight: '100vh', paddingBottom: 110, fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* ══ HEADER LIGHT PREMIUM ══ */}
      <div style={{
        background: 'white',
        padding: '40px 20px 24px',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 4px 20px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <h1 style={{ color: '#0F6E56', fontSize: 26, fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>
              Dashboard
            </h1>
            <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0', fontWeight: 500 }}>
              Panel logístico y comercial
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#ecfdf5', padding: '6px 12px', borderRadius: 20, border: '1px solid #d1fae5' }}>
            <div style={{ width: 8, height: 8, background: '#10b981', borderRadius: '50%', animation: 'pulse 2s infinite' }} />
            <span style={{ fontSize: 11, fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: 1 }}>Live</span>
          </div>
        </div>

        {/* Dynamic Filter Tabs */}
        <div style={{ display: 'flex', background: '#f1f5f9', padding: 4, borderRadius: 16, overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          {filters.map(f => (
            <button
              key={f.id}
              onClick={() => setTimeFilter(f.id)}
              style={{
                flex: 1, whiteSpace: 'nowrap',
                padding: '10px 16px', border: 'none', borderRadius: 12,
                fontSize: 13, fontWeight: 800, cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                background: timeFilter === f.id ? 'white' : 'transparent',
                color: timeFilter === f.id ? '#0F6E56' : '#64748b',
                boxShadow: timeFilter === f.id ? '0 4px 12px rgba(0,0,0,0.05)' : 'none'
              }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ padding: '24px 16px 0', display: 'flex', flexDirection: 'column', gap: 20 }}>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '40px 0', color: '#94a3b8', fontWeight: 600 }}>Cargando métricas...</div>
        ) : (
          <>
            {/* ── 1. MONITOR OPERATIVO EN VIVO ── */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, paddingLeft: 4 }}>
                <h3 style={{ fontSize: 13, fontWeight: 900, color: '#0F6E56', margin: 0, textTransform: 'uppercase', letterSpacing: 1 }}>Monitor de Operación</h3>
                <span style={{ fontSize: 11, fontWeight: 800, color: statusFilter ? '#0F6E56' : '#64748b', background: 'white', padding: '4px 10px', borderRadius: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
                  {statusFilter ? `Filtrando: ${stats.filteredCount}` : `${stats.totalPedidos}`} Pedidos
                </span>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                {/* Pendiente */}
                <div 
                  onClick={() => setStatusFilter(statusFilter === 'pendiente' ? null : 'pendiente')}
                  style={{ cursor: 'pointer', background: 'white', borderRadius: 20, padding: 16, border: statusFilter === 'pendiente' ? '2px solid #0F6E56' : '1px solid #f1f5f9', boxShadow: statusFilter === 'pendiente' ? '0 8px 25px rgba(15,110,86,0.15)' : '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', transform: statusFilter === 'pendiente' ? 'scale(1.02)' : 'none', transition: 'all 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#0F6E56' }} />
                  <span style={{ fontSize: 20, marginBottom: 8 }}>⏳</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{pendientes}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4, textTransform: 'uppercase' }}>Pendiente</span>
                </div>

                {/* Alistando */}
                <div 
                  onClick={() => setStatusFilter(statusFilter === 'alistando' ? null : 'alistando')}
                  style={{ cursor: 'pointer', background: 'white', borderRadius: 20, padding: 16, border: statusFilter === 'alistando' ? '2px solid #16a34a' : '1px solid #f1f5f9', boxShadow: statusFilter === 'alistando' ? '0 8px 25px rgba(22,163,74,0.15)' : '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', transform: statusFilter === 'alistando' ? 'scale(1.02)' : 'none', transition: 'all 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#16a34a' }} />
                  <span style={{ fontSize: 20, marginBottom: 8 }}>📦</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{stats.porEstado['alistando'] || 0}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4, textTransform: 'uppercase' }}>Alistando</span>
                </div>

                {/* Facturando */}
                <div 
                  onClick={() => setStatusFilter(statusFilter === 'facturando' ? null : 'facturando')}
                  style={{ cursor: 'pointer', background: 'white', borderRadius: 20, padding: 16, border: statusFilter === 'facturando' ? '2px solid #059669' : '1px solid #f1f5f9', boxShadow: statusFilter === 'facturando' ? '0 8px 25px rgba(5,150,105,0.15)' : '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', transform: statusFilter === 'facturando' ? 'scale(1.02)' : 'none', transition: 'all 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#059669' }} />
                  <span style={{ fontSize: 20, marginBottom: 8 }}>🧾</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{stats.porEstado['facturando'] || 0}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4, textTransform: 'uppercase' }}>Facturando</span>
                </div>

                {/* En Camino */}
                <div 
                  onClick={() => setStatusFilter(statusFilter === 'en_camino' ? null : 'en_camino')}
                  style={{ cursor: 'pointer', background: 'white', borderRadius: 20, padding: 16, border: statusFilter === 'en_camino' ? '2px solid #0d9488' : '1px solid #f1f5f9', boxShadow: statusFilter === 'en_camino' ? '0 8px 25px rgba(13,148,136,0.15)' : '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', transform: statusFilter === 'en_camino' ? 'scale(1.02)' : 'none', transition: 'all 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#0d9488' }} />
                  <span style={{ fontSize: 20, marginBottom: 8 }}>🚚</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{stats.porEstado['en_camino'] || 0}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4, textTransform: 'uppercase' }}>En Camino</span>
                </div>

                {/* Entregado */}
                <div 
                  onClick={() => setStatusFilter(statusFilter === 'entregado' ? null : 'entregado')}
                  style={{ cursor: 'pointer', background: 'white', borderRadius: 20, padding: 16, border: statusFilter === 'entregado' ? '2px solid #10b981' : '1px solid #f1f5f9', boxShadow: statusFilter === 'entregado' ? '0 8px 25px rgba(16,185,129,0.15)' : '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', transform: statusFilter === 'entregado' ? 'scale(1.02)' : 'none', transition: 'all 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#10b981' }} />
                  <span style={{ fontSize: 20, marginBottom: 8 }}>✅</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{entregados}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginTop: 4, textTransform: 'uppercase' }}>Entregado</span>
                </div>

                {/* Novedades */}
                <div 
                  onClick={() => setStatusFilter(statusFilter === 'novedades' ? null : 'novedades')}
                  style={{ cursor: 'pointer', background: statusFilter === 'novedades' ? '#fef2f2' : 'white', borderRadius: 20, padding: 16, border: statusFilter === 'novedades' ? '2px solid #ef4444' : '1px solid #f1f5f9', boxShadow: statusFilter === 'novedades' ? '0 8px 25px rgba(239,68,68,0.15)' : '0 4px 15px rgba(0,0,0,0.02)', display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', transform: statusFilter === 'novedades' ? 'scale(1.02)' : 'none', transition: 'all 0.2s' }}
                >
                  <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#ef4444' }} />
                  <span style={{ fontSize: 20, marginBottom: 8 }}>⚠️</span>
                  <span style={{ fontSize: 24, fontWeight: 900, color: stats.criticos > 0 || statusFilter === 'novedades' ? '#ef4444' : '#0f172a', lineHeight: 1 }}>{stats.criticos}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: stats.criticos > 0 || statusFilter === 'novedades' ? '#b91c1c' : '#64748b', marginTop: 4, textTransform: 'uppercase' }}>Novedades</span>
                </div>
              </div>
            </div>

            {/* ── 2. METRICS GRID ── */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
              
              {/* Gauge Eficiencia Light */}
              <div style={{ background: 'white', borderRadius: 28, padding: '24px 16px', boxShadow: '0 8px 30px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                 <div style={{ width: 86, height: 86, borderRadius: '50%', background: `conic-gradient(#0F6E56 ${stats.tasaEntrega}%, #f1f5f9 0)`, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
                    <div style={{ width: 70, height: 70, background: 'white', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                       <span style={{ fontSize: 18, fontWeight: 900, color: '#0F6E56', letterSpacing: '-0.5px' }}>{stats.tasaEntrega}%</span>
                    </div>
                 </div>
                 <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b', marginTop: 16, textTransform: 'uppercase', letterSpacing: 1, textAlign: 'center' }}>Tasa de<br/>Entrega</span>
              </div>

              {/* Alertas & Acción Light */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                 <div style={{ flex: 1, background: stats.criticos > 0 ? '#fef2f2' : 'white', borderRadius: 24, padding: 16, boxShadow: '0 8px 30px rgba(0,0,0,0.03)', border: stats.criticos > 0 ? '1px solid #fca5a5' : '1px solid #f1f5f9', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                   <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                     <span style={{ fontSize: 24 }}>{stats.criticos > 0 ? '🚨' : '🛡️'}</span>
                     <span style={{ fontSize: 28, fontWeight: 900, color: stats.criticos > 0 ? '#ef4444' : '#10b981', lineHeight: 1 }}>{stats.criticos}</span>
                   </div>
                   <div>
                     <div style={{ fontSize: 13, fontWeight: 800, color: stats.criticos > 0 ? '#991b1b' : '#0f172a' }}>Atención</div>
                     <div style={{ fontSize: 11, fontWeight: 600, color: stats.criticos > 0 ? '#ef4444' : '#94a3b8', marginTop: 2 }}>{stats.criticos > 0 ? 'Rechazos o cancelados' : 'Todo en orden'}</div>
                   </div>
                 </div>
                 
                 <button onClick={() => router.push('/')} style={{ background: '#0F6E56', color: 'white', border: 'none', borderRadius: 20, padding: '16px', fontWeight: 800, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', boxShadow: '0 8px 20px rgba(15,110,86,0.25)', transition: 'transform 0.2s' }}>
                    <span>➕</span> Nuevo Pedido
                 </button>
              </div>
            </div>

            {/* ── 3. DIAGNÓSTICO DE SALUD OPERATIVA ── */}
            <div style={{ background: 'white', borderRadius: 28, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
                <h3 style={{ fontSize: 13, fontWeight: 900, margin: 0, textTransform: 'uppercase', letterSpacing: 1, color: '#0F6E56' }}>Salud de la Operación</h3>
              </div>
              
              {stats.totalPedidos > 0 ? (
                <>
                  {/* Stacked Bar */}
                  <div style={{ width: '100%', height: 16, display: 'flex', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
                    <div style={{ width: `${(entregados / stats.totalPedidos) * 100}%`, background: '#10b981', transition: 'width 0.5s' }} />
                    <div style={{ width: `${(enCamino / stats.totalPedidos) * 100}%`, background: '#0d9488', transition: 'width 0.5s' }} />
                    <div style={{ width: `${(facturando / stats.totalPedidos) * 100}%`, background: '#059669', transition: 'width 0.5s' }} />
                    <div style={{ width: `${(alistando / stats.totalPedidos) * 100}%`, background: '#16a34a', transition: 'width 0.5s' }} />
                    <div style={{ width: `${(pendientes / stats.totalPedidos) * 100}%`, background: '#0F6E56', transition: 'width 0.5s' }} />
                    <div style={{ width: `${(stats.criticos / stats.totalPedidos) * 100}%`, background: '#ef4444', transition: 'width 0.5s' }} />
                  </div>

                  {/* Leyenda */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#10b981' }} />
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{Math.round((entregados / stats.totalPedidos) * 100)}% Entregado</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0d9488' }} />
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{Math.round((enCamino / stats.totalPedidos) * 100)}% En Camino</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#059669' }} />
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{Math.round((facturando / stats.totalPedidos) * 100)}% Facturando</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#16a34a' }} />
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{Math.round((alistando / stats.totalPedidos) * 100)}% Alistando</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#0F6E56' }} />
                      <span style={{ fontSize: 12, color: '#475569', fontWeight: 600 }}>{Math.round((pendientes / stats.totalPedidos) * 100)}% Pendiente</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#ef4444' }} />
                      <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>{Math.round((stats.criticos / stats.totalPedidos) * 100)}% Novedades</span>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: '20px 0' }}>No hay suficientes datos para analizar.</div>
              )}
            </div>

            {/* ── 4. MAPA DE CALOR (Localidades) ── */}
            <div style={{ background: 'white', borderRadius: 28, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 13, fontWeight: 900, color: '#0F6E56', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: 1 }}>Zonas Calientes</h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {Object.entries(stats.porLocalidad || {}).sort((a,b) => b[1] - a[1]).slice(0, 8).map(([loc, count], idx) => {
                  const isTop = idx === 0;
                  return (
                    <div key={loc} style={{ background: isTop ? '#0F6E56' : '#f8fafc', color: isTop ? 'white' : '#475569', padding: '8px 14px', borderRadius: 20, fontSize: 12, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6, border: isTop ? 'none' : '1px solid #e2e8f0' }}>
                      {loc} <span style={{ opacity: isTop ? 0.9 : 0.6, fontSize: 10, background: isTop ? 'rgba(255,255,255,0.2)' : '#e2e8f0', padding: '2px 6px', borderRadius: 10 }}>{count}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── 5. TOP VENDEDORES (Podio) ── */}
            <div style={{ background: 'white', borderRadius: 28, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.03)', border: '1px solid #f1f5f9' }}>
              <h3 style={{ fontSize: 13, fontWeight: 900, color: '#0F6E56', margin: '0 0 20px', textTransform: 'uppercase', letterSpacing: 1 }}>Fuerza de Ventas</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                 {stats.topVendedores.map((v, i) => (
                    <div key={v.nombre} style={{ display: 'flex', alignItems: 'center', gap: 16, background: i === 0 ? '#ecfdf5' : 'white', padding: '12px 14px', borderRadius: 16, border: i === 0 ? '1px solid #d1fae5' : '1px solid #f1f5f9', transition: 'transform 0.2s' }}>
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: i===0 ? '#10b981' : '#f1f5f9', color: i===0 ? 'white' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 14 }}>{i+1}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{v.nombre}</div>
                        <div style={{ fontSize: 11, color: '#64748b', fontWeight: 600, marginTop: 2 }}>{v.entregados} exitosos de {v.total}</div>
                      </div>
                      <div style={{ background: i === 0 ? '#0F6E56' : '#f8fafc', padding: '6px 12px', borderRadius: 12, fontSize: 15, fontWeight: 900, color: i === 0 ? 'white' : '#0f172a' }}>
                        {v.total}
                      </div>
                    </div>
                 ))}
                 {stats.topVendedores.length === 0 && (
                    <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, margin: '20px 0' }}>No hay ventas en este periodo</p>
                 )}
              </div>
            </div>

            {/* ── 6. ÚLTIMA ACTIVIDAD ── */}
            <div style={{ paddingBottom: 24 }}>
              <h3 style={{ fontSize: 13, fontWeight: 900, color: '#64748b', margin: '24px 0 16px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Pedidos Recientes</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {stats.pedidosRecientes.map(p => {
                  const cfg = ESTADO_CFG[p.estado] || { label: p.estado, emoji: '❓', color: '#6b7280' };
                  return (
                    <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: 'white', borderRadius: 20, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #f8fafc' }}>
                      <div style={{ width: 44, height: 44, borderRadius: 16, background: `${cfg.color}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                        {cfg.emoji}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.cliente_nombre}</p>
                        </div>
                        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                          {new Date(p.creado_en).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })} • {p.profiles?.nombre_completo.split(' ')[0] || 'App'}
                        </p>
                      </div>
                      <div style={{ fontSize: 10, fontWeight: 800, color: cfg.color, background: `${cfg.color}10`, padding: '4px 10px', borderRadius: 12, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        {cfg.label}
                      </div>
                    </div>
                  );
                })}
                {stats.pedidosRecientes.length === 0 && (
                   <div style={{ textAlign: 'center', background: 'white', padding: 30, borderRadius: 20 }}>
                     <p style={{ margin: 0, color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>No hay pedidos en este periodo</p>
                   </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.4); } 70% { box-shadow: 0 0 0 6px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
      `}</style>
    </div>
  );
}
