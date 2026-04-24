'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';

export default function CrearPedido() {
  const { user, profile } = useUser();

  // ── Clientes ──
  const [clientes, setClientes] = useState([]);
  const [clienteId, setClienteId] = useState('');
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteDrop, setShowClienteDrop] = useState(false);
  const [loadingClientes, setLoadingClientes] = useState(true);
  const [showNewCliente, setShowNewCliente] = useState(false);
  const [nuevoCliente, setNuevoCliente] = useState({ nombre: '', telefono: '', ciudad: '' });

  // ── Pedido ──
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [tipoFactura, setTipoFactura] = useState('');
  const [tipoPago, setTipoPago] = useState('');
  const [localidad, setLocalidad] = useState('');
  const [observaciones, setObservaciones] = useState('');
  const [items, setItems] = useState([{ medicamento_nombre: '', cantidad: 1 }]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);

  const clienteRef = useRef(null);

  /* ── Cargar clientes filtrados por vendedor (admin ve todos) ── */
  useEffect(() => {
    if (!user) return;
    async function fetchClientes() {
      setLoadingClientes(true);
      let query = supabase.from('clientes').select('*').eq('activo', true).order('nombre');
      if (profile?.role !== 'admin') {
        query = query.eq('vendedor_id', user.id);
      }
      const { data } = await query;
      if (data) setClientes(data);
      setLoadingClientes(false);
    }
    fetchClientes();
  }, [user, profile]);

  /* ── Cerrar dropdown al click fuera ── */
  useEffect(() => {
    const handler = (e) => { if (clienteRef.current && !clienteRef.current.contains(e.target)) setShowClienteDrop(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* ── Items ── */
  const addItem = () => setItems(p => [...p, { medicamento_nombre: '', cantidad: 1 }]);
  const removeItem = (i) => items.length > 1 && setItems(p => p.filter((_, idx) => idx !== i));
  const changeItem = (i, f, v) => setItems(p => p.map((it, idx) => idx === i ? { ...it, [f]: v } : it));
  const stepQty = (i, delta) => changeItem(i, 'cantidad', Math.max(1, (parseInt(items[i].cantidad) || 1) + delta));

  /* ── Crear cliente nuevo ── */
  const handleCrearCliente = async () => {
    if (!nuevoCliente.nombre.trim()) return;
    const { data, error: e } = await supabase.from('clientes').insert({
      vendedor_id: user.id,
      nombre: nuevoCliente.nombre.trim(),
      telefono: nuevoCliente.telefono || null,
      ciudad: nuevoCliente.ciudad || null,
    }).select().single();
    if (data) {
      setClientes(p => [...p, data].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setClienteId(data.id);
      setClienteSearch(data.nombre);
      setShowNewCliente(false);
      setNuevoCliente({ nombre: '', telefono: '', ciudad: '' });
    } else {
      setError(e?.message);
    }
  };

  /* ── Submit ── */
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!user || !clienteId) { setError('Selecciona un cliente para continuar.'); return; }
    if (!fechaEntrega) { setError('Selecciona la fecha de entrega (es obligatoria).'); return; }
    if (!tipoFactura) { setError('Selecciona el tipo de factura (es obligatorio).'); return; }
    if (!tipoPago) { setError('Selecciona el tipo de pago (es obligatorio).'); return; }
    if (!localidad) { setError('Selecciona la localidad (es obligatoria).'); return; }

    // Check medicamentos
    const itemsValidos = items.every(it => it.medicamento_nombre.trim() !== '');
    if (!itemsValidos) { setError('Asegúrate de escribir el nombre de todos los medicamentos.'); return; }

    setIsSubmitting(true);
    setError(null);

    const clienteSeleccionado = clientes.find(c => c.id === clienteId);

    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert({
        vendedor_id: user.id,
        cliente_nombre: clienteSeleccionado?.nombre || clienteSearch,
        observaciones: observaciones || null,
        estado: 'pendiente',
        fecha_entrega: fechaEntrega || null,
        tipo_factura: tipoFactura,
        tipo_pago: tipoPago,
        localidad: localidad
      })
      .select().single();

    if (orderErr) { setError(orderErr.message); setIsSubmitting(false); return; }

    const { error: itemsErr } = await supabase.from('order_items').insert(
      items.map(it => ({ order_id: order.id, medicamento_nombre: it.medicamento_nombre, cantidad: parseInt(it.cantidad) }))
    );

    setIsSubmitting(false);
    if (itemsErr) { setError(itemsErr.message); return; }

    // ── FEEDBACK DE ÉXITO ──
    try {
      // Sonido (confirmación local inmediata)
      const audio = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');
      audio.play().catch(e => console.log("Audio play error:", e));
      
      // NOTA: Las notificaciones ahora se generan automáticamente vía Trigger en la DB
    } catch (err) {
      console.error("Error generating local feedback:", err);
    }

    setSuccess(true);
    setClienteId('');
    setClienteSearch('');
    setObservaciones('');
    setFechaEntrega('');
    setTipoFactura('');
    setTipoPago('');
    setLocalidad('');
    setItems([{ medicamento_nombre: '', cantidad: 1 }]);
    setTimeout(() => setSuccess(false), 5000);
  };

  const clientesFiltrados = clientes.filter(c =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase())
  );
  const clienteSeleccionado = clientes.find(c => c.id === clienteId);
  const totalItems = items.reduce((acc, it) => acc + (parseInt(it.cantidad) || 0), 0);

  return (
    <div style={{ paddingBottom: 20 }}>

      {/* ══ HERO HEADER ══ */}
      <div style={{
        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 55%, #1a9b78 100%)',
        padding: '28px 20px 80px',
        borderRadius: '0 0 36px 36px',
        position: 'relative', overflow: 'hidden', marginBottom: -54,
        zIndex: 1 // Lower than success message
      }}>
        <div style={{ position: 'absolute', top: -60, right: -60, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -20, width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <p style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, fontWeight: 600, margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '1px' }}>
            {profile?.nombre_completo || 'Vendedor'}
          </p>
          <h1 style={{ color: 'white', fontSize: 26, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>Nuevo Pedido</h1>
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '6px 0 0' }}>Selecciona un cliente y registra rápidamente</p>
        </div>
      </div>

      {/* ══ CARDS ══ */}
      <div style={{ paddingLeft: 16, paddingRight: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>

        {/* Success */}
        {success && (
          <div style={{ 
            position: 'relative',
            zIndex: 100, // Ensure it's above the header
            background: 'white', // More contrast
            border: '2px solid #10b981',
            borderRadius: 18, 
            padding: '18px 20px', 
            display: 'flex', 
            alignItems: 'center', 
            gap: 14, 
            animation: 'slideDown .35s cubic-bezier(.34,1.2,.64,1)',
            boxShadow: '0 15px 30px rgba(0,0,0,0.1)'
          }}>
            <div style={{ width: 46, height: 46, borderRadius: '50%', background: 'rgba(16,185,129,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎉</div>
            <div>
              <p style={{ fontWeight: 800, color: '#065f46', margin: 0, fontSize: 15 }}>¡Pedido enviado!</p>
              <p style={{ color: '#047857', fontSize: 13, margin: '2px 0 0' }}>El equipo de despacho ya tiene tu solicitud.</p>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.07)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 18, padding: '14px 18px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <p style={{ color: '#991b1b', fontSize: 13, fontWeight: 500, margin: 0, flex: 1 }}>{error}</p>
            <button onClick={() => setError(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, opacity: .4, lineHeight: 1 }}>×</button>
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* ─ CARD: Cliente ─ */}
          <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 22, boxShadow: '0 8px 32px rgba(15,110,86,0.08)', overflow: 'visible', position: 'relative', zIndex: 50 }}>

            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(15,110,86,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>🏪</div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.8px', display: 'block' }}>Cliente / Farmacia</span>
                  {profile?.role === 'admin' && <span style={{ fontSize: 10, color: 'var(--brand)', fontWeight: 600 }}>Vista administrador — todos los clientes</span>}
                </div>
              </div>

              {/* Selector con búsqueda */}
              <div ref={clienteRef} style={{ position: 'relative' }}>
                <div
                  onClick={() => { setShowClienteDrop(true); setShowNewCliente(false); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '12px 14px', borderRadius: 14,
                    border: `2px solid ${clienteId ? 'var(--brand)' : 'rgba(0,0,0,0.1)'}`,
                    background: clienteId ? 'rgba(15,110,86,0.04)' : 'rgba(249,250,251,1)',
                    cursor: 'pointer', transition: 'all .2s',
                  }}
                >
                  {clienteSeleccionado ? (
                    <>
                      <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand), #1a9b78)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white', fontWeight: 800, flexShrink: 0 }}>
                        {clienteSeleccionado.nombre[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1 }}>
                        <p style={{ fontWeight: 700, color: 'var(--brand-dark)', margin: 0, fontSize: 15 }}>{clienteSeleccionado.nombre}</p>
                        {clienteSeleccionado.ciudad && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{clienteSeleccionado.ciudad}</p>}
                      </div>
                      <button type="button" onClick={e => { e.stopPropagation(); setClienteId(''); setClienteSearch(''); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', fontSize: 18, lineHeight: 1 }}>×</button>
                    </>
                  ) : (
                    <>
                      <span style={{ fontSize: 18, opacity: .4 }}>🔍</span>
                      <input
                        value={clienteSearch}
                        onChange={e => { setClienteSearch(e.target.value); setShowClienteDrop(true); }}
                        onClick={e => { e.stopPropagation(); setShowClienteDrop(true); }}
                        placeholder={loadingClientes ? 'Cargando clientes...' : 'Buscar cliente o farmacia...'}
                        style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontSize: 15, fontFamily: 'inherit', color: 'var(--brand-dark)' }}
                      />
                      <span style={{ fontSize: 14, color: '#9ca3af' }}>▾</span>
                    </>
                  )}
                </div>

                {/* Dropdown */}
                {showClienteDrop && !clienteId && (
                  <div style={{
                    position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 50,
                    background: 'white', borderRadius: 16, boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
                    border: '1px solid rgba(0,0,0,0.08)', overflow: 'hidden', maxHeight: 280, overflowY: 'auto',
                  }}>
                    {clientesFiltrados.length === 0 ? (
                      <div style={{ padding: '16px 18px', textAlign: 'center' }}>
                        <p style={{ color: 'var(--text-muted)', fontSize: 14, margin: 0 }}>
                          {clienteSearch ? `Sin resultados para "${clienteSearch}"` : 'No tienes clientes aún'}
                        </p>
                      </div>
                    ) : clientesFiltrados.map((c, idx) => (
                      <div key={c.id} onClick={() => { setClienteId(c.id); setClienteSearch(c.nombre); setShowClienteDrop(false); }}
                        style={{
                          padding: '12px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12,
                          borderBottom: idx < clientesFiltrados.length - 1 ? '1px solid rgba(0,0,0,0.05)' : 'none',
                          transition: 'background .15s',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,110,86,0.05)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, var(--brand), #1a9b78)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, color: 'white', fontWeight: 800, flexShrink: 0 }}>
                          {c.nombre[0].toUpperCase()}
                        </div>
                        <div>
                          <p style={{ fontWeight: 600, color: 'var(--brand-dark)', margin: 0, fontSize: 14 }}>{c.nombre}</p>
                          {c.ciudad && <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>{c.ciudad}</p>}
                        </div>
                      </div>
                    ))}

                    {/* Opción crear nuevo */}
                    <div onClick={() => { setShowClienteDrop(false); setShowNewCliente(true); }}
                      style={{ padding: '12px 18px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(15,110,86,0.04)', borderTop: '2px solid rgba(15,110,86,0.1)' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'rgba(15,110,86,0.1)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'rgba(15,110,86,0.04)'}
                    >
                      <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--brand)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: 'white', flexShrink: 0 }}>＋</div>
                      <div>
                        <p style={{ fontWeight: 700, color: 'var(--brand)', margin: 0, fontSize: 14 }}>Agregar nuevo cliente</p>
                        <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: 0 }}>Registrar cliente o farmacia nueva</p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Formulario de nuevo cliente (inline) */}
              {showNewCliente && (
                <div style={{
                  marginTop: 16,
                  background: 'rgba(15,110,86,0.06)',
                  backdropFilter: 'blur(10px)',
                  border: '1px solid rgba(15,110,86,0.15)',
                  borderRadius: 24,
                  padding: 20,
                  animation: 'slideDown .3s cubic-bezier(0.16, 1, 0.3, 1)'
                }}>
                  <p style={{ fontSize: 12, fontWeight: 800, color: '#0F6E56', margin: '0 0 16px', textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>➕</span> Nuevo Cliente
                  </p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    <div className="form-group" style={{ marginBottom: 12 }}>
                      <label className="form-label-premium">Nombre o Farmacia</label>
                      <input type="text" placeholder="Ej: Farmacia Central"
                        value={nuevoCliente.nombre} onChange={e => setNuevoCliente(p => ({ ...p, nombre: e.target.value }))}
                        className="form-input-premium" />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
                      <div>
                        <label className="form-label-premium">Teléfono</label>
                        <input type="text" placeholder="300..."
                          value={nuevoCliente.telefono} onChange={e => setNuevoCliente(p => ({ ...p, telefono: e.target.value }))}
                          className="form-input-premium" />
                      </div>
                      <div>
                        <label className="form-label-premium">Ciudad</label>
                        <input type="text" placeholder="Ej: Cali"
                          value={nuevoCliente.ciudad} onChange={e => setNuevoCliente(p => ({ ...p, ciudad: e.target.value }))}
                          className="form-input-premium" />
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button type="button" onClick={handleCrearCliente} className="form-btn-premium" style={{ flex: 1, height: '54px', fontSize: 14 }}>
                        Guardar Cliente
                      </button>
                      <button type="button" onClick={() => setShowNewCliente(false)}
                        style={{ padding: '0 20px', height: '54px', borderRadius: 16, border: '2px solid #e2e8f0', background: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer', color: '#64748b' }}>
                        Cancelar
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ─ CARD: Detalles del Pedido ─ */}
          <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 22, boxShadow: '0 8px 32px rgba(15,110,86,0.08)', overflow: 'visible', position: 'relative', zIndex: 15 }}>
            <div style={{ padding: '14px 18px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(15,110,86,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📅</div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.8px', display: 'block' }}>Detalles de Negociación</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Fecha de Entrega */}
                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label-premium">Fecha de Entrega <span style={{ color: '#ef4444' }}>*</span></label>
                  <input
                    type="date"
                    className="form-input-premium"
                    onClick={(e) => {
                      if (e.target.showPicker) e.target.showPicker();
                    }}
                    value={fechaEntrega}
                    onChange={e => setFechaEntrega(e.target.value)}
                    style={{ cursor: 'pointer', padding: '14px 16px' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                  {/* Tipo de Factura */}
                  <div>
                    <label className="form-label-premium">Tipo de Factura <span style={{ color: '#ef4444' }}>*</span></label>
                    <div style={{ display: 'flex', background: 'white', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', padding: 4, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                      <button type="button" className="btn-dynamic" onClick={() => setTipoFactura('remision')} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 12, backgroundColor: tipoFactura === 'remision' ? '#0F6E56' : 'transparent', color: tipoFactura === 'remision' ? 'white' : '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>Remisión</button>
                      <button type="button" className="btn-dynamic" onClick={() => setTipoFactura('factura_electronica')} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 12, backgroundColor: tipoFactura === 'factura_electronica' ? '#0F6E56' : 'transparent', color: tipoFactura === 'factura_electronica' ? 'white' : '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>Electrónica</button>
                    </div>
                  </div>

                  {/* Tipo de Pago */}
                  <div>
                    <label className="form-label-premium">Tipo de Pago <span style={{ color: '#ef4444' }}>*</span></label>
                    <div style={{ display: 'flex', background: 'white', borderRadius: 16, border: '1px solid rgba(0,0,0,0.08)', padding: 4, boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
                      <button type="button" className="btn-dynamic" onClick={() => setTipoPago('contado')} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 12, backgroundColor: tipoPago === 'contado' ? '#0F6E56' : 'transparent', color: tipoPago === 'contado' ? 'white' : '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>Contado</button>
                      <button type="button" className="btn-dynamic" onClick={() => setTipoPago('credito')} style={{ flex: 1, padding: '10px 0', border: 'none', borderRadius: 12, backgroundColor: tipoPago === 'credito' ? '#0F6E56' : 'transparent', color: tipoPago === 'credito' ? 'white' : '#64748b', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s' }}>Crédito</button>
                    </div>
                  </div>
                </div>

                {/* Localidad Segmented Control */}
                <div className="form-group" style={{ marginBottom: 4 }}>
                  <label className="form-label-premium">Localidad <span style={{ color: '#ef4444' }}>*</span></label>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: 'repeat(2, 1fr)', 
                    gap: 8, 
                    background: 'rgba(249,250,251,0.5)', 
                    borderRadius: 20, 
                    border: '1px solid rgba(0,0,0,0.08)', 
                    padding: 6,
                    boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
                  }}>
                    {['Engativá', 'Kennedy', 'Bosa', 'Soacha'].map(loc => (
                      <button
                        key={loc}
                        type="button"
                        className="btn-dynamic"
                        onClick={() => setLocalidad(loc)}
                        style={{
                          padding: '12px 0',
                          border: 'none',
                          borderRadius: 14,
                          backgroundColor: localidad === loc ? '#0F6E56' : 'white',
                          color: localidad === loc ? 'white' : '#64748b',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          boxShadow: localidad === loc ? '0 4px 12px rgba(15,110,86,0.2)' : '0 1px 2px rgba(0,0,0,0.05)',
                          transition: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 6
                        }}
                      >
                        <span style={{ fontSize: 14, opacity: localidad === loc ? 1 : 0.4 }}>📍</span>
                        {loc}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ─ CARD: Medicamentos ─ */}
          <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 22, boxShadow: '0 8px 32px rgba(15,110,86,0.08)' }}>
            {/* Header */}
            <div style={{ padding: '14px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(15,110,86,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>💊</div>
                <div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.8px', display: 'block' }}>Medicamentos</span>
                  <span style={{ fontSize: 11, color: 'var(--brand)', fontWeight: 600 }}>{items.length} producto{items.length !== 1 ? 's' : ''} · {totalItems} unidad{totalItems !== 1 ? 'es' : ''}</span>
                </div>
              </div>
              {/* Botón agregar — ahora claramente etiquetado */}
              <button type="button" onClick={addItem} style={{
                background: '#0F6E56', border: '2px solid #0F6E56', borderRadius: 12,
                color: '#ffffff', padding: '8px 14px', cursor: 'pointer',
                fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', gap: 6,
                boxShadow: '0 4px 14px rgba(15,110,86,0.35)', flexShrink: 0,
              }}>
                <span style={{ fontSize: 16, lineHeight: 1, color: '#ffffff' }}>＋</span>
                <span style={{ color: '#ffffff' }}>Añadir medicamento</span>
              </button>
            </div>

            {/* Filas de items */}
            <div style={{ padding: '8px 12px 12px' }}>
              {items.map((item, idx) => (
                <div key={idx} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px', borderRadius: 14,
                  background: idx % 2 === 0 ? 'rgba(15,110,86,0.03)' : 'transparent',
                  marginBottom: idx < items.length - 1 ? 4 : 0,
                }}>
                  {/* Número */}
                  <div style={{ width: 26, height: 26, borderRadius: '50%', flexShrink: 0, background: 'linear-gradient(135deg, var(--brand), #1a9b78)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white' }}>
                    {idx + 1}
                  </div>
                  {/* Input nombre */}
                  <input
                    type="text"
                    value={item.medicamento_nombre}
                    onChange={e => changeItem(idx, 'medicamento_nombre', e.target.value)}
                    required
                    placeholder="Nombre del medicamento..."
                    style={{ flex: 1, border: 'none', borderBottom: '1.5px solid rgba(0,0,0,0.08)', outline: 'none', fontSize: 14, padding: '4px 0 6px', background: 'transparent', fontFamily: 'inherit', color: 'var(--brand-dark)', fontWeight: item.medicamento_nombre ? 600 : 400 }}
                  />
                  {/* Stepper cantidad */}
                  <div style={{ display: 'flex', alignItems: 'center', background: 'rgba(15,110,86,0.08)', borderRadius: 10, border: '1px solid rgba(15,110,86,0.15)', overflow: 'hidden' }}>
                    <button type="button" className="btn-dynamic" onClick={() => stepQty(idx, -1)} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                    <input
                      type="number"
                      value={item.cantidad || ''}
                      onChange={e => changeItem(idx, 'cantidad', parseInt(e.target.value) || 0)}
                      onBlur={e => { if (!e.target.value || parseInt(e.target.value) < 1) changeItem(idx, 'cantidad', 1); }}
                      style={{ width: 36, textAlign: 'center', fontWeight: 800, fontSize: 14, color: 'var(--brand-dark)', border: 'none', background: 'transparent', outline: 'none', MozAppearance: 'textfield' }}
                    />
                    <button type="button" className="btn-dynamic" onClick={() => stepQty(idx, +1)} style={{ width: 28, height: 28, border: 'none', background: 'none', cursor: 'pointer', color: 'var(--brand)', fontSize: 16, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>＋</button>
                  </div>
                  {/* Eliminar */}
                  {items.length > 1 && (
                    <button type="button" className="btn-dynamic" onClick={() => removeItem(idx)} style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, border: 'none', background: 'rgba(239,68,68,0.1)', color: '#ef4444', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700 }}>✕</button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* ─ CARD: Observaciones ─ */}
          <div style={{ background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 22, boxShadow: '0 8px 32px rgba(15,110,86,0.08)', padding: '14px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(15,110,86,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>📝</div>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.8px' }}>
                Observaciones <span style={{ fontWeight: 400, textTransform: 'none' }}>(opcional)</span>
              </span>
            </div>
            <textarea
              rows="3" value={observaciones} onChange={e => setObservaciones(e.target.value)}
              placeholder="Indicaciones de entrega, urgencias, referencias especiales..."
              style={{ width: '100%', border: 'none', outline: 'none', resize: 'none', fontSize: 14, color: 'var(--brand-dark)', background: 'transparent', fontFamily: 'inherit', lineHeight: 1.6 }}
            />
          </div>

          {/* ─ Resumen + Submit ─ */}
          <div style={{ background: 'linear-gradient(135deg, #084032, #0F6E56)', borderRadius: 22, padding: '20px', boxShadow: '0 8px 32px rgba(15,110,86,0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-around', marginBottom: 18 }}>
              {[
                { label: 'Cliente', value: clienteSeleccionado ? clienteSeleccionado.nombre.split(' ')[0] : '—' },
                { label: 'Productos', value: items.length },
                { label: 'Unidades', value: totalItems },
              ].map(s => (
                <div key={s.label} style={{ textAlign: 'center' }}>
                  <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.6px', margin: '0 0 2px' }}>{s.label}</p>
                  <p style={{ color: 'white', fontWeight: 800, fontSize: 18, margin: 0 }}>{s.value}</p>
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: 'rgba(255,255,255,0.1)', marginBottom: 18 }} />

            <button type="submit" className="btn-dynamic" disabled={isSubmitting || !clienteId} style={{
              width: '100%', height: 56, border: 'none', borderRadius: 16,
              background: (!clienteId || isSubmitting) ? 'rgba(255,255,255,0.2)' : 'white',
              color: (!clienteId || isSubmitting) ? 'rgba(255,255,255,0.5)' : 'var(--brand)',
              fontSize: 16, fontWeight: 800, cursor: (!clienteId || isSubmitting) ? 'not-allowed' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: (!clienteId || isSubmitting) ? 'none' : '0 4px 20px rgba(255,255,255,0.2)',
              transition: 'all .2s',
            }}>
              {isSubmitting ? (
                <><div style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid rgba(15,110,86,0.3)', borderTopColor: 'var(--brand)', animation: 'spin .7s linear infinite' }} /> Enviando...</>
              ) : '📦 Enviar Pedido'}
            </button>

            {!clienteId && (
              <p style={{ textAlign: 'center', color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '10px 0 0' }}>
                Selecciona un cliente para habilitar el envío
              </p>
            )}
          </div>
        </form>
      </div>

      <style jsx>{`
        @keyframes spin     { to { transform:rotate(360deg); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-10px); } to { opacity:1; transform:translateY(0); } }
        .btn-dynamic {
          transition: transform 0.1s cubic-bezier(0.4, 0, 0.2, 1), filter 0.2s ease, box-shadow 0.2s ease;
        }
        .btn-dynamic:hover:not(:disabled) {
          transform: translateY(-2px);
          filter: brightness(1.05);
          box-shadow: 0 8px 20px rgba(0,0,0,0.12);
        }
        .btn-dynamic:active:not(:disabled) {
          transform: translateY(1px) scale(0.97);
        }
        .date-input-clickable::-webkit-calendar-picker-indicator {
          cursor: pointer;
          opacity: 0.6;
        }
        .date-input-clickable::-webkit-calendar-picker-indicator:hover {
          opacity: 1;
        }
      `}</style>
    </div>
  );
}
