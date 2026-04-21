'use client';

import { useState, useEffect, use } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { editarPedido } from '@/app/actions/order_actions';

export default function EditarPedido({ params }) {
  const unwrappedParams = use(params);
  const orderId = unwrappedParams.id;
  
  const { user } = useUser();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [toast, setToast] = useState(null);
  
  const [clienteNombre, setClienteNombre] = useState('');
  const [items, setItems] = useState([]);
  const [observaciones, setObservaciones] = useState('');

  const showToast = (msg, ok = true) => {
    setToast({ msg, ok });
    setTimeout(() => setToast(null), 3500);
  };

  useEffect(() => {
    async function fetchOrder() {
      if (!user) return;
      setLoading(true);
      setError(null);

      const { data, error: fetchErr } = await supabase
        .from('orders')
        .select(`
          id, estado, vendedor_id, cliente_nombre, observaciones,
          order_items(id, medicamento_nombre, cantidad)
        `)
        .eq('id', orderId)
        .single();

      if (fetchErr || !data) {
        setError('Pedido no encontrado o ya no existe.');
        setLoading(false);
        return;
      }

      if (data.vendedor_id !== user.id) {
        setError('Acceso denegado. No tienes permiso para editar este pedido.');
        setLoading(false);
        return;
      }

      if (data.estado !== 'pendiente') {
        setError('El pedido ya ha sido procesado. Solo se pueden editar pedidos en estado Pendiente.');
        setLoading(false);
        return;
      }

      setClienteNombre(data.cliente_nombre);
      setObservaciones(data.observaciones || '');
      setItems(data.order_items.map(i => ({ nombre: i.medicamento_nombre, cantidad: i.cantidad })));
      setLoading(false);
    }
    fetchOrder();
  }, [orderId, user]);

  const agregarItem = () => setItems([...items, { nombre: '', cantidad: 1 }]);
  const quitarItem = (idx) => setItems(items.filter((_, i) => i !== idx));
  const actualizarItem = (idx, campo, valor) => {
    const nuevos = [...items];
    nuevos[idx][campo] = valor;
    setItems(nuevos);
  };

  const handleGuardar = async () => {
    const validos = items.filter(i => i.nombre.trim());
    if (validos.length === 0) {
      showToast('Debes agregar al menos un medicamento válido', false);
      return;
    }

    setSubmitting(true);
    const res = await editarPedido(orderId, {
      items: validos.map(i => ({ medicamento_nombre: i.nombre, cantidad: i.cantidad })),
      observaciones,
      vendedorId: user.id
    });
    setSubmitting(false);

    if (res.success) {
      showToast('Cambios guardados con éxito');
      setTimeout(() => router.push('/pedidos'), 1000);
    } else {
      showToast(res.error || 'Error al guardar los cambios', false);
    }
  };

  if (!user || loading) {
    return (
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', minHeight:'60vh', gap:16 }}>
         <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid rgba(15,110,86,0.15)', borderTopColor:'var(--brand)', animation:'spin .8s linear infinite' }}/>
         <p style={{ color:'var(--text-muted)', fontSize:16, fontWeight:600 }}>Cargando información del pedido...</p>
         <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 40, textAlign: 'center', maxWidth:400, margin:'0 auto' }}>
        <div style={{ fontSize:64, marginBottom:20 }}>🛑</div>
        <h2 style={{ fontSize:22, color:'var(--brand-dark)', margin:'0 0 10px' }}>Acción no permitida</h2>
        <p style={{ color: '#ef4444', fontWeight: 600, fontSize:15, marginBottom:24 }}>{error}</p>
        <button onClick={() => router.push('/pedidos')} style={{ background:'var(--brand)', color:'white', border:'none', padding:'14px 24px', borderRadius:16, fontSize:15, fontWeight:800, cursor:'pointer', width:'100%', boxShadow:'0 8px 16px rgba(15,110,86,0.3)' }}>
          Volver a Mis Pedidos
        </button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f8fafc', paddingBottom: 100 }}>
      {/* ── HEADER MAGISTRAL ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
        padding:'32px 20px 40px', borderRadius:'0 0 40px 40px',
        position:'relative', overflow:'hidden'
      }}>
        <div style={{ position:'relative', zIndex:1, display:'flex', alignItems:'center', gap:16 }}>
          <button onClick={() => router.back()} style={{ background: 'rgba(255,255,255,0.1)', border: 'none', width: 44, height: 44, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color:'white', flexShrink:0 }}>
             <span style={{ fontSize: 24, fontWeight:400, transform:'translateX(-2px)' }}>←</span>
          </button>
          <div>
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'white' }}>Editar Pedido</h1>
            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#94a3b8', fontWeight:500 }}>
              Cliente: <strong style={{color:'white'}}>{clienteNombre}</strong>
            </p>
          </div>
        </div>
      </div>

      <div style={{ padding: '0 16px', marginTop: -20, flex: 1, display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Medicamentos */}
        <div style={{ background: 'white', padding: 24, borderRadius: 28, boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
               <h2 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: 'var(--brand-dark)' }}>💊 Medicamentos</h2>
               <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: 0 }}>Ajusta los productos a entregar</p>
            </div>
            <button type="button" onClick={agregarItem} style={{ background: 'rgba(15,110,86,0.1)', color: 'var(--brand)', border: 'none', width:40, height:40, borderRadius: 14, fontSize: 22, fontWeight: 800, cursor: 'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
              +
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {items.map((item, idx) => (
              <div key={idx} style={{ display: 'flex', gap: 10, alignItems: 'center', animation: 'slideUp 0.3s cubic-bezier(.34,1.2,.64,1)', background:'#f8fafc', padding:12, borderRadius:20, border:'1px solid #e2e8f0' }}>
                <input
                  type="text" placeholder="Aspirina 100mg" value={item.nombre} onChange={e => actualizarItem(idx, 'nombre', e.target.value)}
                  style={{ flex: 1, padding: '14px', border: 'none', background:'white', borderRadius: 14, outline: 'none', fontSize: 15, fontWeight:600, color:'var(--brand-dark)', fontFamily: 'inherit', boxShadow:'0 2px 8px rgba(0,0,0,0.02)' }}
                />
                
                <div style={{ background:'white', borderRadius:14, padding:'4px', display:'flex', alignItems:'center', gap:4, boxShadow:'0 2px 8px rgba(0,0,0,0.02)' }}>
                   <p style={{ margin:'0 4px 0 8px', fontSize:12, fontWeight:800, color:'#cbd5e1' }}>X</p>
                   <input
                     type="number" min="1" value={item.cantidad} onChange={e => actualizarItem(idx, 'cantidad', parseInt(e.target.value) || 1)}
                     style={{ width: 44, padding: '10px', border: 'none', background:'transparent', outline: 'none', fontSize: 16, fontWeight:800, color:'var(--brand)', fontFamily: 'inherit', textAlign: 'center' }}
                   />
                </div>
                
                <button
                  onClick={() => quitarItem(idx)}
                  style={{ background: '#fef2f2', color: '#ef4444', border: '1px solid #fecaca', width: 48, height: 48, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, cursor: 'pointer', flexShrink: 0 }}
                >
                  🗑️
                </button>
              </div>
            ))}
            
            {items.length === 0 && (
              <div style={{ textAlign:'center', padding:'30px 20px', background:'#f8fafc', borderRadius:20, border:'2px dashed #cbd5e1' }}>
                 <p style={{ color: '#ef4444', fontSize: 14, fontWeight:700, margin: 0 }}>Debes agregar al menos un medicamento.</p>
              </div>
            )}
          </div>
        </div>

        {/* Observaciones */}
        <div style={{ background: 'white', padding: 24, borderRadius: 28, boxShadow: '0 10px 30px rgba(0,0,0,0.04)', border:'1px solid #f1f5f9' }}>
          <label style={{ display: 'block', fontSize: 16, fontWeight: 800, color: 'var(--brand-dark)', marginBottom: 12 }}>
            📝 Observaciones
          </label>
          <textarea
            value={observaciones} onChange={e => setObservaciones(e.target.value)}
            placeholder="Alguna nota extra para el pedido..." rows={3}
            style={{ width: '100%', boxSizing: 'border-box', border: '2px solid #e2e8f0', borderRadius: 16, padding: '16px', fontSize: 15, fontWeight:500, outline: 'none', fontFamily: 'inherit', resize: 'none', transition:'border-color .2s' }}
            onFocus={e => e.target.style.borderColor = 'var(--brand)'}
            onBlur={e => e.target.style.borderColor = '#e2e8f0'}
          />
        </div>

        {/* Acciones Grandes */}
        <div style={{ marginTop: 10, display: 'flex', gap: 12 }}>
          <button
            onClick={() => router.back()}
            disabled={submitting}
            style={{
              flex: 1, padding: 18, borderRadius: 20, border: 'none',
              background: '#e2e8f0', fontSize: 15, fontWeight: 800,
              color: '#475569', cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancelar
          </button>
          <button
            onClick={handleGuardar}
            disabled={submitting}
            style={{
              flex: 2, padding: 18, borderRadius: 20, border: 'none',
              background: submitting ? '#6b9e8f' : '#0F6E56',
              color: 'white', fontSize: 15, fontWeight: 800,
              cursor: submitting ? 'not-allowed' : 'pointer',
              boxShadow: submitting ? 'none' : '0 10px 24px rgba(15,110,86,0.4)',
              display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 10,
              transition: 'background .2s',
            }}
          >
            {submitting
              ? <><div style={{ width:18, height:18, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', animation:'spin .7s linear infinite' }}/> Guardando...</>
              : <><span>💾</span> Confirmar Cambios</>
            }
          </button>
        </div>
      </div>
      
      {/* Toast Notifier */}
      {toast && (
        <div style={{
          position:'fixed', bottom:40, left:'50%', transform:'translateX(-50%)', zIndex:9999,
          background: toast.ok ? '#10b981' : '#dc2626', color:'white', padding:'16px 24px',
          borderRadius:100, fontSize:15, fontWeight:800, boxShadow:'0 10px 30px rgba(0,0,0,0.2)',
          display:'flex', alignItems:'center', gap:10, animation:'slideUpPop .4s cubic-bezier(.34,1.2,.64,1)', width:'max-content'
        }}>
          <span>{toast.ok ? '✅' : '⚠️'}</span> {toast.msg}
        </div>
      )}

      <style>{`
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUpPop { 0% { opacity:0; transform:translate(-50%, 20px); } 100% { opacity:1; transform:translate(-50%, 0); } }
      `}</style>
    </div>
  );
}
