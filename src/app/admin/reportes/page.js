'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function ReportesDashboard() {
  const router = useRouter();
  const { profile, loading: userLoading } = useUser();
  const [loading, setLoading] = useState(true);
  
  const [timeFilter, setTimeFilter] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  // States
  const [kpis, setKpis] = useState({
    ingresos: 0,
    costos: 0,
    utilidad: 0,
    margen: 0,
    egresos: 0,
    flujoCaja: 0
  });
  
  const [vendedores, setVendedores] = useState([]);
  const [trend, setTrend] = useState([]);
  const [ruteroStats, setRuteroStats] = useState([]);

  const fetchRuteroStats = useCallback(async () => {
    try {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      monday.setHours(0, 0, 0, 0);
      const startOfWeek = monday.toISOString();

      const startOfDay = new Date();
      startOfDay.setHours(0,0,0,0);
      const startOfDayISO = startOfDay.toISOString();

      const { data: vends } = await supabase.from('profiles').select('id, nombre_completo').eq('role', 'vendedor');
      if (!vends) return;

      const { data: weekVisits } = await supabase.from('visitas').select('vendedor_id, creado_en').eq('estado', 'completada').gte('creado_en', startOfWeek);
      const { data: allAlerts } = await supabase.from('alertas_visitas_atrasadas').select('vendedor_id');

      const stats = vends.map(v => {
        const vVisits = weekVisits?.filter(vis => vis.vendedor_id === v.id) || [];
        const visitasSemana = vVisits.length;
        const visitasHoy = vVisits.filter(vis => vis.creado_en >= startOfDayISO).length;
        const clientesAlerta = allAlerts?.filter(a => a.vendedor_id === v.id).length || 0;
        const efectividad = Math.min(100, Math.round((visitasSemana / 60) * 100));

        return {
          id: v.id,
          nombre: v.nombre_completo || 'Sin Nombre',
          visitasSemana,
          visitasHoy,
          clientesAlerta,
          efectividad
        };
      });

      setRuteroStats(stats.sort((a,b) => b.efectividad - a.efectividad));
    } catch(e) {
      console.error(e);
    }
  }, []);

  const fetchReportes = useCallback(async () => {
    try {
      let txsQuery = supabase.from('transactions').select('monto, tipo, creado_en, referencia_id');
      
      if (timeFilter !== 'todos') {
        txsQuery = txsQuery.eq('mes', timeFilter);
      } else {
        const limitDate = new Date();
        limitDate.setFullYear(2020);
        txsQuery = txsQuery.gte('creado_en', limitDate.toISOString());
      }
      
      // 1. Obtener Transacciones de CAJA REAL
      const { data: txs } = await txsQuery;
        
      if (!txs) return;

      let ingresosReales = 0;
      let egresosReales = 0;
      const refIds = [];

      const trendMap = {};

      txs.forEach(t => {
        const val = Number(t.monto);
        if (t.tipo === 'ingreso') {
          ingresosReales += val;
          if (t.referencia_id) refIds.push(t.referencia_id);
        }
        if (t.tipo === 'egreso') egresosReales += val;

        const d = new Date(t.creado_en);
        const day = d.toLocaleDateString('es-CO', { month: 'short', day: 'numeric' });
        const timestamp = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
        
        if(!trendMap[day]) trendMap[day] = { name: day, ingresos: 0, utilidades: 0, timestamp };
        if (t.tipo === 'ingreso') trendMap[day].ingresos += val;
      });

      // 2. Para esos ingresos, calcular cuánto costó la mercancía (Rentabilidad Real)
      let costosAsociados = 0;
      let vendedoresMap = {};

      if (refIds.length > 0) {
        // Obtenemos el catálogo
        const { data: catalog } = await supabase.from('lista_precios').select('producto, precio_costo');
        const catalogoMap = {};
        if (catalog) {
          catalog.forEach(c => {
            if (c.producto) catalogoMap[c.producto] = parseFloat(c.precio_costo) || 0;
          });
        }

        // Chunking the refIds to avoid PostgREST URI limits and massive DB locks
        const chunkSize = 150;
        let orders = [];
        for (let i = 0; i < refIds.length; i += chunkSize) {
          const chunk = refIds.slice(i, i + chunkSize);
          const { data: chunkOrders } = await supabase
            .from('orders')
            .select(`
              id,
              vendedor_id,
              profiles!orders_vendedor_id_fkey(nombre_completo),
              order_items(cantidad, precio_costo, precio_venta_historico, medicamento_nombre)
            `)
            .in('id', chunk);
          
          if (chunkOrders) {
            orders = orders.concat(chunkOrders);
          }
        }

        if (orders) {
          orders.forEach(o => {
            let orderCost = 0;
            let orderRevenue = 0;
            
            o.order_items?.forEach(it => {
              const q = parseInt(it.cantidad) || 0;
              let itemCosto = parseFloat(it.precio_costo) || 0;
              
              // Fallback: si es un pedido antiguo sin costo guardado, usar el del catálogo
              if (itemCosto === 0 && it.medicamento_nombre && catalogoMap[it.medicamento_nombre]) {
                itemCosto = catalogoMap[it.medicamento_nombre];
              }

              orderCost += itemCosto * q;
              orderRevenue += (parseFloat(it.precio_venta_historico) || 0) * q;
            });

            costosAsociados += orderCost;

            // Atribuir venta al vendedor (basado en lo que cobró, no en lo que generó en pedido)
            if (o.vendedor_id) {
              const vName = o.profiles?.nombre_completo || 'Vendedor sin nombre';
              if (!vendedoresMap[vName]) vendedoresMap[vName] = { nombre: vName, recaudo: 0 };
              vendedoresMap[vName].recaudo += orderRevenue;
            }
          });
        }
      }

      const utilidadBruta = ingresosReales - costosAsociados;
      const flujoCaja = ingresosReales - egresosReales;
      const margen = ingresosReales > 0 ? ((utilidadBruta / ingresosReales) * 100).toFixed(1) : 0;

      setKpis({
        ingresos: ingresosReales,
        costos: costosAsociados,
        utilidad: utilidadBruta,
        margen,
        egresos: egresosReales,
        flujoCaja
      });

      setVendedores(Object.values(vendedoresMap).sort((a,b) => b.recaudo - a.recaudo));
      setTrend(Object.values(trendMap).sort((a,b) => a.timestamp - b.timestamp));
      
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [timeFilter]);

  useEffect(() => {
    if (profile?.role === 'admin') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchReportes();
      fetchRuteroStats();
    }
  }, [profile, fetchReportes, fetchRuteroStats]);

  const formatearDinero = (val) => new Intl.NumberFormat('es-CO', { style:'currency', currency:'COP', maximumFractionDigits:0 }).format(val);

  if (userLoading || loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ width: 40, height: 40, borderRadius: '50%', border: '4px solid #f1f5f9', borderTopColor: '#0F6E56', animation: 'spin 1s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (profile?.role !== 'admin') return null;

  return (
    <div style={{ paddingBottom: 100, minHeight: '100vh', background: '#eef2f6', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      
      {/* ── HEADER TIPO ERP (STRICT) ── */}
      <div style={{ background: '#084032', padding: '24px 20px', borderBottom: '4px solid #0F6E56', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 style={{ color: 'white', fontSize: 24, fontWeight: 700, margin: 0, letterSpacing: '0.5px' }}>MÓDULO DE INTELIGENCIA FINANCIERA</h1>
          <p style={{ color: '#94a3b8', fontSize: 12, margin: '4px 0 0', textTransform: 'uppercase', letterSpacing: 1 }}>Cifras Basadas en Flujo de Caja Real</p>
        </div>
        
        {/* ── FILTROS (STRICT) ── */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ color: 'white', fontSize: 13, fontWeight: 700, textTransform: 'uppercase' }}>Filtrar Mes:</span>
          <select 
            value={timeFilter} 
            onChange={e => setTimeFilter(e.target.value)}
            style={{ 
              background: 'rgba(0,0,0,0.2)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', 
              borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer' 
            }}
          >
            <option value="todos" style={{ color: '#0f172a' }}>HISTÓRICO (TODOS)</option>
            {Array.from({length: 12}).map((_, i) => {
              const d = new Date();
              d.setMonth(d.getMonth() - i);
              const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
              const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
              return <option key={val} value={val} style={{ color: '#0f172a' }}>{label.toUpperCase()}</option>
            })}
          </select>
        </div>
      </div>

      <div style={{ padding: '20px' }}>

        {/* ── ESTADO DE RESULTADOS (TABULAR) ── */}
        <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: 20, overflow: 'hidden' }}>
          <div style={{ background: '#f8fafc', borderBottom: '2px solid #0F6E56', padding: '12px 16px' }}>
            <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase', letterSpacing: 1 }}>Estado de Resultados (Flujo de Caja)</h3>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {/* Fila 1 */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>(+) Ingresos Operacionales (Recaudo)</span>
                <span style={{ fontSize: 14, color: '#10b981', fontWeight: 700 }}>{formatearDinero(kpis.ingresos)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>
                Dinero físico que entró a caja en este periodo (Pedidos de contado liquidados y créditos pagados). No incluye cuentas por cobrar.
              </p>
            </div>
            
            {/* Fila 2 */}
            <div style={{ padding: '12px 16px', borderBottom: '2px solid #cbd5e1', background: '#f8fafc' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>(-) Costo de Mercancía Vendida</span>
                <span style={{ fontSize: 14, color: '#ef4444', fontWeight: 700 }}>{formatearDinero(kpis.costos)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>
                Lo que te costó comprar a tus proveedores los medicamentos exactos que generaron el ingreso de arriba.
              </p>
            </div>
            
            {/* Fila 3 (Bruta) */}
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', background: 'rgba(15,110,86,0.05)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <span style={{ fontSize: 13, color: '#0F6E56', fontWeight: 800, display: 'block', marginBottom: 2 }}>(=) UTILIDAD BRUTA</span>
                  <p style={{ margin: 0, fontSize: 11, color: '#084032', opacity: 0.8, lineHeight: 1.3, maxWidth: 220 }}>
                    Tu ganancia directa por la venta de medicamentos, antes de pagar gastos del negocio.
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <span style={{ fontSize: 15, color: '#0F6E56', fontWeight: 800, display: 'block' }}>{formatearDinero(kpis.utilidad)}</span>
                  <span style={{ fontSize: 10, color: '#084032', fontWeight: 700 }}>Margen: {kpis.margen}%</span>
                </div>
              </div>
            </div>
            
            {/* Fila 4 */}
            <div style={{ padding: '12px 16px', borderBottom: '2px solid #cbd5e1' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, color: '#475569', fontWeight: 500 }}>(-) Gastos Operacionales (Egresos)</span>
                <span style={{ fontSize: 14, color: '#ef4444', fontWeight: 700 }}>{formatearDinero(kpis.egresos)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#94a3b8', lineHeight: 1.3 }}>
                Todos los gastos registrados manualmente en el módulo de Caja (nómina, arriendos, domicilios, etc).
              </p>
            </div>
            
            {/* Fila 5 (Neta) */}
            <div style={{ padding: '16px', background: '#084032', color: 'white' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 14, fontWeight: 800 }}>(=) FLUJO LÍQUIDO (UTILIDAD NETA)</span>
                <span style={{ fontSize: 18, fontWeight: 800 }}>{formatearDinero(kpis.flujoCaja)}</span>
              </div>
              <p style={{ margin: 0, fontSize: 11, color: '#6ee7b7', opacity: 0.9, lineHeight: 1.3 }}>
                El dinero real que te queda 100% libre en el bolsillo después de pagar la mercancía y todos los gastos operativos.
              </p>
            </div>
          </div>
        </div>

        {/* ── GRAFICO ERP ── */}
        {trend.length > 0 && (
          <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: 20 }}>
            <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 16px' }}>
              <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>Evolución de Recaudo Diario</h3>
            </div>
            <div style={{ padding: '16px', height: 240, width: '100%' }}>
              <ResponsiveContainer>
                <AreaChart data={trend} margin={{ top:5, right:0, left:-20, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748b' }} tickFormatter={(v) => `$${v/1000}k`} />
                  <Tooltip 
                    contentStyle={{ borderRadius: 4, border: '1px solid #0F6E56', boxShadow: '0 4px 6px rgba(0,0,0,0.1)', fontWeight: 600, fontSize: 12 }}
                    itemStyle={{ fontSize: 13, color: '#0F6E56' }}
                    formatter={(value) => formatearDinero(value)}
                  />
                  <Area type="monotone" dataKey="ingresos" stroke="#0F6E56" strokeWidth={2} fillOpacity={0.15} fill="#0F6E56" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* ── RANKING TABULAR ── */}
        <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 16px' }}>
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>Rendimiento Comercial (Vendedores)</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>
              Muestra a tus vendedores ordenados por la cantidad de dinero REAL que le han hecho ingresar a la empresa. Solo cuenta pedidos que ya fueron cobrados/liquidados.
            </p>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead style={{ background: '#f1f5f9', fontSize: 11, color: '#475569', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1', width: 40 }}>#</th>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1' }}>Vendedor</th>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1', textAlign: 'right' }}>Venta Recaudada</th>
              </tr>
            </thead>
            <tbody>
              {vendedores.map((v, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? 'white' : '#f8fafc', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12, fontWeight: 600, color: '#64748b' }}>{i + 1}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#0f172a' }}>{v.nombre}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 700, color: '#0F6E56', textAlign: 'right' }}>
                    {formatearDinero(v.recaudo)}
                  </td>
                </tr>
              ))}
              {vendedores.length === 0 && (
                <tr>
                  <td colSpan={3} style={{ padding: '20px', textAlign: 'center', fontSize: 12, color: '#94a3b8' }}>
                    Sin datos en este periodo
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* ── RENDIMIENTO DE RUTAS (RUTERO) ── */}
        <div style={{ background: 'white', border: '1px solid #cbd5e1', borderRadius: 8, boxShadow: '0 2px 4px rgba(0,0,0,0.05)', overflow: 'hidden', marginTop: 20 }}>
          <div style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', padding: '12px 16px' }}>
            <h3 style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#0f172a', textTransform: 'uppercase' }}>🗺️ Rendimiento de Rutas (Esta Semana)</h3>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: '#64748b', lineHeight: 1.3 }}>
              Supervisa el cumplimiento de la meta de visitas de cada vendedor y la cantidad de clientes en alerta roja.
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', minWidth: 600 }}>
            <thead style={{ background: '#f1f5f9', fontSize: 11, color: '#475569', textTransform: 'uppercase' }}>
              <tr>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1' }}>Vendedor</th>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }}>Efectividad</th>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }}>Visitas Semana</th>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }}>Visitas Hoy</th>
                <th style={{ padding: '10px 16px', borderBottom: '1px solid #cbd5e1', textAlign: 'center' }}>Clientes en Alerta</th>
              </tr>
            </thead>
            <tbody>
              {ruteroStats.map(rs => (
                <tr key={rs.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#1e293b' }}>
                    {rs.nombre}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    <span style={{ 
                      fontSize: 12, fontWeight: 700, 
                      color: rs.efectividad >= 80 ? '#059669' : rs.efectividad >= 50 ? '#d97706' : '#dc2626',
                      background: rs.efectividad >= 80 ? '#d1fae5' : rs.efectividad >= 50 ? '#fef3c7' : '#fee2e2',
                      padding: '4px 8px', borderRadius: 12
                    }}>
                      {rs.efectividad}%
                    </span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                    {rs.visitasSemana} <span style={{ fontSize: 11, color: '#9ca3af' }}>/ 60</span>
                  </td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#475569', textAlign: 'center' }}>
                    {rs.visitasHoy}
                  </td>
                  <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                    {rs.clientesAlerta > 0 ? (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#dc2626', background: '#fee2e2', padding: '4px 8px', borderRadius: 12 }}>
                        ⚠️ {rs.clientesAlerta}
                      </span>
                    ) : (
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#059669' }}>
                        ✓ 0
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {ruteroStats.length === 0 && (
                <tr>
                  <td colSpan={5} style={{ padding: '20px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                    No hay vendedores registrados
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          </div>
        </div>

      </div>
    </div>
  );
}
