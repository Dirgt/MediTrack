'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { useRouter } from 'next/navigation';

export default function CarteraYLiquidacion() {
  const { user, profile } = useUser();
  const router = useRouter();
  
  const [activeTab, setActiveTab] = useState('repartidores'); // 'repartidores' | 'creditos' | 'movimientos'
  const [loading, setLoading] = useState(true);
  
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });
  
  const [entregasPendientes, setEntregasPendientes] = useState([]);
  const [creditosPendientes, setCreditosPendientes] = useState([]);
  const [movimientos, setMovimientos] = useState([]);
  const [cierres, setCierres] = useState([]);
  const [savingCierre, setSavingCierre] = useState(false);
  
  // States for new egreso
  const [egresoCat, setEgresoCat] = useState('proveedores');
  const [egresoConcepto, setEgresoConcepto] = useState('');
  const [egresoMonto, setEgresoMonto] = useState('');
  const [savingEgreso, setSavingEgreso] = useState(false);
  
  // States for Liquidacion Modal
  const [modalData, setModalData] = useState(null); // { type: 'repartidor' | 'credito', pedido, defaultValor, maxValor, cliente }
  const [modalValor, setModalValor] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const isAdmin = profile?.role === 'admin';

  useEffect(() => {
    if (profile && !isAdmin) router.replace('/');
  }, [profile, isAdmin, router]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    
    // 1. Entregas de Contado sin liquidar (Dinero en bolsillo del repartidor)
    let entregasQuery = supabase
      .from('orders')
      .select('id, numero_pedido, cliente_nombre, recaudo_valor, recaudo_metodo, repartidor_id, profiles!orders_repartidor_id_fkey(nombre_completo)')
      .eq('estado', 'entregado')
      .eq('tipo_pago', 'contado')
      .eq('liquidado_admin', false)
      .order('numero_pedido', { ascending: false });
      
    // 2. Pedidos a Crédito sin liquidar (Cartera en la calle)
    let creditosQuery = supabase
      .from('orders')
      .select('*, per_vendedor:profiles!orders_vendedor_id_fkey(nombre_completo), items:order_items(cantidad, precio_venta_historico)')
      .eq('estado', 'entregado')
      .eq('tipo_pago', 'credito')
      .eq('pagado', false)
      .eq('liquidado_admin', false)
      .order('fecha_entrega', { ascending: true });

    // 3. Movimientos (Transacciones ERP)
    let txsQuery = supabase
      .from('transactions')
      .select('*')
      .order('creado_en', { ascending: false })
      .limit(50);

    if (selectedMonth !== 'todos') {
      entregasQuery = entregasQuery.eq('mes', selectedMonth);
      creditosQuery = creditosQuery.eq('mes', selectedMonth);
      txsQuery = txsQuery.eq('mes', selectedMonth);
    }

    const { data: entregas } = await entregasQuery;
    if (entregas) setEntregasPendientes(entregas);

    const { data: creditos } = await creditosQuery;

    // Sumar totales para los créditos
    const creditosConTotal = (creditos || []).map(c => {
      const total = c.items ? c.items.reduce((acc, it) => acc + (it.cantidad * (it.precio_venta_historico || 0)), 0) : 0;
      const abonado = c.monto_abonado || 0;
      return { ...c, total_deuda: total, abonado, saldo_pendiente: total - abonado };
    });

    setCreditosPendientes(creditosConTotal);

    const { data: txs } = await txsQuery;
    if (txs) setMovimientos(txs);

    // 4. Cierres Z
    // Envolvemos en try-catch por si el usuario no ha corrido la migración SQL aún
    try {
      const { data: cData } = await supabase
        .from('caja_cierres')
        .select('*')
        .order('fecha_cierre', { ascending: false })
        .limit(20);
      if (cData) setCierres(cData);
    } catch (e) {
      console.log('Tabla caja_cierres no existe aún.');
    }

    setLoading(false);
  }, [selectedMonth]);

  useEffect(() => {
    if (!isAdmin) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [isAdmin, fetchData]);

  const formatearDinero = (num) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(num || 0);

  const handleConfirmModal = async () => {
    if (!modalValor || isNaN(parseFloat(modalValor)) || parseFloat(modalValor) <= 0) {
      alert("Por favor ingresa un valor numérico válido mayor a 0");
      return;
    }

    const valor = parseFloat(modalValor);

    if (modalData.type === 'credito' && valor > modalData.maxValor) {
      alert(`No puedes ingresar un valor mayor al esperado (${formatearDinero(modalData.maxValor)})`);
      return;
    }

    setIsSubmitting(true);

    try {
      if (modalData.type === 'repartidor') {
        const pedidoId = modalData.pedido.id;
        const metodo = modalData.pedido.recaudo_metodo;
        
        // 1. Marcar pedido y actualizar el valor real recaudado (por si el repartidor puso 0 o 1 por error)
        await supabase.from('orders').update({ 
          liquidado_admin: true,
          recaudo_valor: valor 
        }).eq('id', pedidoId);
        
        // 2. Registrar ingreso en ERP
        await supabase.from('transactions').insert({
          tipo: 'ingreso',
          monto: valor,
          metodo_pago: metodo || 'efectivo',
          concepto: 'Liquidación de entrega',
          referencia_id: pedidoId,
          creado_por: user.id
        });
      } else if (modalData.type === 'credito') {
        const pedido = modalData.pedido;
        const nuevoAbonado = pedido.abonado + valor;
        const pagadoCompletamente = (nuevoAbonado >= pedido.total_deuda);
        
        const updatePayload = {};
        if (pedido.hasOwnProperty('monto_abonado')) {
          updatePayload.monto_abonado = nuevoAbonado;
        }
        if (pagadoCompletamente) {
          updatePayload.liquidado_admin = true;
          updatePayload.pagado = true;
        }
        
        await supabase.from('orders').update(updatePayload).eq('id', pedido.id);
        
        await supabase.from('transactions').insert({
          tipo: 'ingreso',
          monto: valor,
          metodo_pago: 'efectivo',
          concepto: pagadoCompletamente ? 'Pago Total de Cartera' : 'Abono Parcial a Cartera',
          referencia_id: pedido.id,
          creado_por: user.id
        });
      }

      setModalData(null);
      setModalValor('');
      fetchData();
    } catch (e) {
      alert("Ocurrió un error al procesar el pago");
      console.error(e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegistrarEgreso = async () => {
    if (!egresoMonto || parseFloat(egresoMonto) <= 0) return;
    setSavingEgreso(true);
    
    let finalConcepto = egresoCat.toUpperCase();
    if (egresoConcepto.trim()) finalConcepto += ` - ${egresoConcepto.trim()}`;

    await supabase.from('transactions').insert({
      tipo: 'egreso',
      monto: parseFloat(egresoMonto),
      metodo_pago: 'efectivo',
      concepto: finalConcepto,
      detalles: { categoria: egresoCat },
      creado_por: user.id
    });
    
    setEgresoMonto('');
    setEgresoConcepto('');
    setSavingEgreso(false);
    fetchData();
  };

  const handleCerrarCaja = async () => {
    if (!confirm('¿Estás seguro de cerrar la caja ahora? Se sumarán todas las transacciones sin cerrar.')) return;
    setSavingCierre(true);

    try {
      // Obtener transacciones sin cerrar
      const { data: txsSinCerrar } = await supabase
        .from('transactions')
        .select('id, monto, tipo')
        .is('cierre_id', null);

      if (!txsSinCerrar || txsSinCerrar.length === 0) {
        alert('No hay transacciones pendientes por cerrar.');
        setSavingCierre(false);
        return;
      }

      let tIngresos = 0;
      let tEgresos = 0;
      txsSinCerrar.forEach(tx => {
        if (tx.tipo === 'ingreso') tIngresos += parseFloat(tx.monto);
        else if (tx.tipo === 'egreso') tEgresos += parseFloat(tx.monto);
      });

      const saldo = tIngresos - tEgresos;

      // Crear el cierre
      const { data: nuevoCierre, error: errorCierre } = await supabase
        .from('caja_cierres')
        .insert({
          total_ingresos: tIngresos,
          total_egresos: tEgresos,
          saldo_final: saldo,
          creado_por: user.id
        })
        .select()
        .single();

      if (errorCierre) throw errorCierre;

      // Vincular transacciones
      const ids = txsSinCerrar.map(t => t.id);
      await supabase
        .from('transactions')
        .update({ cierre_id: nuevoCierre.id })
        .in('id', ids);

      alert(`Caja cerrada con éxito. Saldo: ${formatearDinero(saldo)}`);
      fetchData();
    } catch (error) {
      alert('Error cerrando caja: ' + error.message);
    }

    setSavingCierre(false);
  };

  if (!isAdmin) return null;

  return (
    <div style={{ paddingBottom: 100, minHeight: '100vh', background: '#f8fafc' }}>
      {/* ══ HEADER ══ */}
      <div style={{
        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 100%)',
        padding: '30px 20px 40px',
        borderRadius: '0 0 36px 36px',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(15,110,86,0.2)'
      }}>
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <span style={{ fontSize: 32, display: 'block', marginBottom: 4 }}>💵</span>
          <h1 style={{ color: 'white', fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>Caja y Cartera</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 }}>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: 0, fontWeight: 500 }}>Recepción de dinero y cobros ERP</p>
            
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: 'white', fontSize: 13, fontWeight: 700 }}>Mes:</span>
              <select 
                value={selectedMonth} 
                onChange={e => setSelectedMonth(e.target.value)}
                style={{ 
                  background: 'rgba(255,255,255,0.1)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', 
                  borderRadius: 12, padding: '6px 12px', fontSize: 13, fontWeight: 600, outline: 'none', cursor: 'pointer' 
                }}
              >
                <option value="todos" style={{ color: '#0f172a' }}>Todos</option>
                {Array.from({length: 12}).map((_, i) => {
                  const d = new Date();
                  d.setMonth(d.getMonth() - i);
                  const val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                  const label = d.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
                  return <option key={val} value={val} style={{ color: '#0f172a' }}>{label.charAt(0).toUpperCase() + label.slice(1)}</option>
                })}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 20px', marginTop: -24, position: 'relative', zIndex: 10 }}>
        <div style={{ display: 'flex', background: 'white', borderRadius: 20, padding: 6, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', overflowX: 'auto', border: '1px solid rgba(226,232,240,0.8)' }}>
          <button onClick={() => setActiveTab('repartidores')} style={{ flex: 1, minWidth: 130, padding: '14px 10px', border: 'none', borderRadius: 16, background: activeTab === 'repartidores' ? 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)' : 'transparent', color: activeTab === 'repartidores' ? 'white' : '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: activeTab === 'repartidores' ? '0 4px 15px rgba(15,110,86,0.25)' : 'none' }}>
            🛵 Repartidores
          </button>
          <button onClick={() => setActiveTab('creditos')} style={{ flex: 1, minWidth: 130, padding: '14px 10px', border: 'none', borderRadius: 16, background: activeTab === 'creditos' ? 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)' : 'transparent', color: activeTab === 'creditos' ? 'white' : '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: activeTab === 'creditos' ? '0 4px 15px rgba(15,110,86,0.25)' : 'none' }}>
            📓 Por Cobrar
          </button>
          <button onClick={() => setActiveTab('movimientos')} style={{ flex: 1, minWidth: 130, padding: '14px 10px', border: 'none', borderRadius: 16, background: activeTab === 'movimientos' ? 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)' : 'transparent', color: activeTab === 'movimientos' ? 'white' : '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: activeTab === 'movimientos' ? '0 4px 15px rgba(15,110,86,0.25)' : 'none' }}>
            📉 Movimientos
          </button>
          <button onClick={() => setActiveTab('cierres')} style={{ flex: 1, minWidth: 130, padding: '14px 10px', border: 'none', borderRadius: 16, background: activeTab === 'cierres' ? 'linear-gradient(135deg, #084032 0%, #052920 100%)' : 'transparent', color: activeTab === 'cierres' ? 'white' : '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: activeTab === 'cierres' ? '0 4px 15px rgba(8,64,50,0.25)' : 'none' }}>
            🔒 Cierres Z
          </button>
        </div>
      </div>

      <div style={{ padding: '20px' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(15,110,86,0.15)', borderTopColor: '#0F6E56', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
            <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Cargando caja...</p>
          </div>
        ) : activeTab === 'repartidores' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {entregasPendientes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 24, border: '2px dashed #e2e8f0' }}>
                <p style={{ color: '#64748b', fontSize: 15, fontWeight: 800, margin: 0 }}>Caja al día</p>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>Los repartidores no deben dinero.</p>
              </div>
            ) : entregasPendientes.map(p => (
              <div key={p.id} style={{ background: 'white', borderRadius: 24, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, background: '#f1f5f9', color: '#64748b', padding: '4px 8px', borderRadius: 8 }}>#{p.numero_pedido}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#0F6E56', textTransform: 'uppercase' }}>{p.profiles?.nombre_completo}</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{p.cliente_nombre}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 900, color: '#10b981' }}>{formatearDinero(p.recaudo_valor)}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>{p.recaudo_metodo}</p>
                </div>
                <button 
                  onClick={() => {
                    setModalData({
                      type: 'repartidor',
                      pedido: p,
                      defaultValor: p.recaudo_valor,
                      maxValor: p.recaudo_valor,
                      cliente: p.cliente_nombre
                    });
                    setModalValor(p.recaudo_valor);
                  }}
                  style={{ background: '#f0fdf4', color: '#16a34a', border: 'none', padding: '12px 20px', borderRadius: 16, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 10px rgba(22,163,74,0.1)' }}
                >
                  Recibir Plata
                </button>
              </div>
            ))}
          </div>
        ) : activeTab === 'creditos' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {creditosPendientes.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 24, border: '2px dashed #e2e8f0' }}>
                <p style={{ color: '#64748b', fontSize: 15, fontWeight: 800, margin: 0 }}>Cartera sana</p>
                <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>No hay facturas a crédito pendientes por cobrar.</p>
              </div>
            ) : creditosPendientes.map(p => (
              <div key={p.id} style={{ background: 'white', borderRadius: 24, padding: 20, boxShadow: '0 4px 12px rgba(0,0,0,0.05)', border: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <span style={{ fontSize: 11, fontWeight: 800, background: '#fef2f2', color: '#ef4444', padding: '4px 8px', borderRadius: 8 }}>CRÉDITO</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: '#64748b' }}>#{p.numero_pedido}</span>
                  </div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: '#1e293b' }}>{p.cliente_nombre}</h3>
                  <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>Vendió: {p.per_vendedor?.nombre_completo}</p>
                  <p style={{ margin: '4px 0 0', fontSize: 20, fontWeight: 900, color: '#ef4444' }}>- {formatearDinero(p.total_deuda)}</p>
                </div>
                <button 
                  onClick={() => {
                    setModalData({
                      type: 'credito',
                      pedido: p,
                      defaultValor: p.saldo_pendiente,
                      maxValor: p.saldo_pendiente,
                      cliente: p.cliente_nombre
                    });
                    setModalValor(p.saldo_pendiente);
                  }}
                  style={{ background: '#0F6E56', color: 'white', border: 'none', padding: '12px 20px', borderRadius: 16, fontWeight: 800, fontSize: 14, cursor: 'pointer', boxShadow: '0 4px 10px rgba(15,110,86,0.3)' }}
                >
                  Cobrar Físico
                </button>
              </div>
            ))}
          </div>
        ) : activeTab === 'movimientos' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Formulario rápido de Egreso */}
            <div style={{ background: 'white', borderRadius: 24, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
              <h3 style={{ margin: '0 0 20px', fontSize: 18, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>Registrar Gasto</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 20 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Categoría</label>
                  <select value={egresoCat} onChange={e => setEgresoCat(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 700, outline: 'none', background: '#f8fafc', color: '#334155' }}>
                    <option value="proveedores">📦 Proveedores (Inventario)</option>
                    <option value="nomina">👥 Nómina / Sueldos</option>
                    <option value="arriendo">🏢 Arriendo</option>
                    <option value="servicios">💡 Servicios Públicos</option>
                    <option value="transporte">🚚 Transporte / Gasolina</option>
                    <option value="creditos">🏦 Pago de Créditos</option>
                    <option value="otros">🔧 Otros Gastos</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Detalle (Opcional)</label>
                  <input type="text" value={egresoConcepto} onChange={e => setEgresoConcepto(e.target.value)} placeholder="Ej: Recibo luz, Coca-Cola..." style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 600, outline: 'none' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Valor ($)</label>
                  <input type="number" value={egresoMonto} onChange={e => setEgresoMonto(e.target.value)} placeholder="0" style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 800, outline: 'none' }} />
                </div>
              </div>
              <button 
                onClick={handleRegistrarEgreso}
                disabled={savingEgreso}
                style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)', border: 'none', borderRadius: 14, color: 'white', fontWeight: 800, fontSize: 15, cursor: savingEgreso ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px rgba(239,68,68,0.25)', transition: 'all 0.3s ease', textTransform: 'uppercase', letterSpacing: 0.5 }}
              >
                {savingEgreso ? 'Registrando...' : 'Registrar Gasto'}
              </button>
            </div>

            {/* Lista de Movimientos */}
            <div>
              <h3 style={{ fontSize: 13, fontWeight: 900, color: '#64748b', margin: '0 0 16px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Últimos 50 Movimientos</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {movimientos.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>No hay movimientos registrados.</p>
                ) : movimientos.map(tx => (
                  <div key={tx.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px', background: 'white', borderRadius: 20, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #f8fafc' }}>
                    <div style={{ width: 44, height: 44, borderRadius: 16, background: tx.tipo === 'ingreso' ? '#d1fae5' : '#fee2e2', color: tx.tipo === 'ingreso' ? '#10b981' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                      {tx.tipo === 'ingreso' ? '⬇️' : '⬆️'}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: '#0f172a', wordBreak: 'break-word', lineHeight: 1.2 }}>
                        {tx.concepto || (tx.detalles?.concepto) || (tx.tipo === 'ingreso' ? 'Ingreso' : 'Egreso')}
                      </p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                        {new Date(tx.creado_en).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} • {tx.metodo_pago.toUpperCase()}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: 16, fontWeight: 900, color: tx.tipo === 'ingreso' ? '#10b981' : '#ef4444' }}>
                        {tx.tipo === 'ingreso' ? '+' : '-'}{formatearDinero(tx.monto)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : activeTab === 'cierres' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <div style={{ background: 'white', borderRadius: 24, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9', textAlign: 'center' }}>
              <div style={{ fontSize: 40, marginBottom: 16 }}>🔒</div>
              <h3 style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 900, color: '#0f172a' }}>Cierre Z (Arqueo Diario)</h3>
              <p style={{ color: '#64748b', fontSize: 14, marginBottom: 24, maxWidth: 400, margin: '0 auto 24px' }}>
                Esto sumará todos los ingresos y egresos que no hayan sido cerrados y reiniciará la caja a cero.
              </p>
              <button 
                onClick={handleCerrarCaja}
                disabled={savingCierre}
                style={{ background: 'linear-gradient(135deg, #084032 0%, #052920 100%)', border: 'none', borderRadius: 16, padding: '16px 32px', color: 'white', fontWeight: 800, fontSize: 15, cursor: savingCierre ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px rgba(8,64,50,0.25)', transition: 'all 0.3s ease' }}
              >
                {savingCierre ? 'Procesando Cierre...' : 'Ejecutar Cierre Z Ahora'}
              </button>
            </div>

            <div>
              <h3 style={{ fontSize: 13, fontWeight: 900, color: '#64748b', margin: '0 0 16px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Historial de Cierres</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {cierres.length === 0 ? (
                  <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20 }}>No hay cierres registrados aún.</p>
                ) : cierres.map(c => (
                  <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'white', borderRadius: 20, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #f8fafc' }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>Cierre Z</p>
                      <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                        {new Date(c.fecha_cierre).toLocaleDateString('es-CO', { weekday: 'long', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: c.saldo_final >= 0 ? '#10b981' : '#ef4444' }}>
                        {formatearDinero(c.saldo_final)}
                      </p>
                      <p style={{ margin: '2px 0 0', fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>
                        I: {formatearDinero(c.total_ingresos)} | E: {formatearDinero(c.total_egresos)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      {/* ── MODAL DE LIQUIDACION ── */}
      {modalData && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(15, 23, 42, 0.6)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 20 }}>
          <div style={{ background: 'white', borderRadius: 24, padding: 32, width: '100%', maxWidth: 420, boxShadow: '0 20px 40px rgba(0,0,0,0.15)', animation: 'slideUp 0.3s ease' }}>
            <div style={{ textAlign: 'center', marginBottom: 24 }}>
              <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#d1fae5', color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 32, margin: '0 auto 16px' }}>
                💰
              </div>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>
                {modalData.type === 'repartidor' ? 'Liquidar Repartidor' : 'Abono a Crédito'}
              </h2>
              <p style={{ margin: '8px 0 0', color: '#64748b', fontSize: 14 }}>
                Cliente: <span style={{ fontWeight: 800, color: '#1e293b' }}>{modalData.cliente}</span>
              </p>
              <p style={{ margin: '4px 0 0', color: '#64748b', fontSize: 13 }}>
                Valor esperado: <span style={{ fontWeight: 700, color: '#10b981' }}>{formatearDinero(modalData.maxValor)}</span>
              </p>
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 8, textTransform: 'uppercase' }}>Valor Físico Recibido</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8', fontSize: 18, fontWeight: 700 }}>$</span>
                <input 
                  type="number" 
                  value={modalValor} 
                  onChange={e => setModalValor(e.target.value)}
                  placeholder="0"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '16px 16px 16px 40px', borderRadius: 16, border: '2px solid #e2e8f0', fontSize: 18, fontWeight: 800, color: '#0f172a', outline: 'none' }}
                  autoFocus
                />
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>
                Modifica el valor si te entregaron una cantidad diferente.
              </p>
            </div>

            <div style={{ display: 'flex', gap: 12 }}>
              <button 
                onClick={() => setModalData(null)}
                style={{ flex: 1, padding: '16px', background: '#f1f5f9', border: 'none', borderRadius: 16, color: '#64748b', fontWeight: 800, fontSize: 15, cursor: 'pointer' }}
              >
                Cancelar
              </button>
              <button 
                onClick={handleConfirmModal}
                disabled={isSubmitting}
                style={{ flex: 1, padding: '16px', background: 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)', border: 'none', borderRadius: 16, color: 'white', fontWeight: 800, fontSize: 15, cursor: isSubmitting ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px rgba(15,110,86,0.3)' }}
              >
                {isSubmitting ? 'Guardando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
