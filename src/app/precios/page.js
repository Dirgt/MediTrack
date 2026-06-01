'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { useRouter } from 'next/navigation';

export default function ListaPrecios() {
  const { user, profile } = useUser();
  const router = useRouter();
  
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [visibleCount, setVisibleCount] = useState(50); // Para renderizado optimizado
  
  const [showModal, setShowModal] = useState(false);
  const [editProduct, setEditProduct] = useState(null);
  
  const isAdmin = profile?.role === 'admin';
  const isRepartidor = profile?.role === 'repartidor';

  // Redirigir repartidores (no tienen acceso a precios)
  useEffect(() => {
    if (isRepartidor) {
      router.replace('/reparto');
    }
  }, [isRepartidor, router]);

  const fetchPrecios = useCallback(async () => {
    setLoading(true);
    let query = supabase.from('lista_precios').select('*').order('producto', { ascending: true });
    
    // Vendedores solo ven lo que no está agotado
    if (!isAdmin) {
      query = query.eq('agotado', false);
    }
    
    const { data, error } = await query;
    if (data) setProductos(data);
    else console.error(error);
    
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!user || isRepartidor) return;
    fetchPrecios();
  }, [user, isRepartidor, fetchPrecios]);

  const filteredProductos = useMemo(() => {
    if (!searchTerm) return productos;
    return productos.filter(p => 
      p.producto.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [productos, searchTerm]);

  // Al cambiar la búsqueda, reiniciar la cantidad visible
  useEffect(() => {
    setVisibleCount(50);
  }, [searchTerm]);

  const displayedProductos = useMemo(() => {
    return filteredProductos.slice(0, visibleCount);
  }, [filteredProductos, visibleCount]);

  // Funciones de Admin
  const handleToggleAgotado = async (id, currentStatus) => {
    const { error } = await supabase.from('lista_precios').update({ agotado: !currentStatus }).eq('id', id);
    if (!error) fetchPrecios();
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Estás seguro de eliminar este producto?')) return;
    const { error } = await supabase.from('lista_precios').delete().eq('id', id);
    if (!error) fetchPrecios();
  };

  const handleOpenModal = (prod = null) => {
    setEditProduct(prod);
    setShowModal(true);
  };

  const formatearPrecio = (precio) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(precio);
  };

  const exportToPDF = () => {
    import('jspdf').then(({ default: jsPDF }) => {
      import('jspdf-autotable').then(({ default: autoTable }) => {
        const doc = new jsPDF();
        
        doc.setFontSize(16);
        doc.setTextColor(15, 110, 86);
        doc.text("Catálogo de Precios - MediTrack", 14, 15);
        
        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Generado el: ${new Date().toLocaleDateString()} a las ${new Date().toLocaleTimeString()}`, 14, 22);

        const tableData = filteredProductos.map(p => {
          const tieneDesc = p.precio_descuento > 0 && p.precio_descuento < p.precio_normal;
          return [
            p.producto,
            p.marca || '--',
            formatearPrecio(p.precio_normal),
            tieneDesc ? formatearPrecio(p.precio_descuento) : '--',
            p.agotado ? 'Agotado' : 'Disponible'
          ];
        });

        autoTable(doc, {
          startY: 28,
          head: [['Producto', 'Marca', 'Sin Descuento', 'Con Descuento', 'Estado']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [15, 110, 86] },
          styles: { fontSize: 9, cellPadding: 4 },
        });

        doc.save('Catalogo_Precios.pdf');
      });
    });
  };

  if (isRepartidor) return null;

  return (
    <div style={{ paddingBottom: 100, minHeight: '100vh', background: '#f8fafc' }}>
      
      {/* ══ HEADER ══ */}
      <div style={{
        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 55%, #1a9b78 100%)',
        padding: '30px 20px 40px',
        borderRadius: '0 0 36px 36px',
        position: 'relative', overflow: 'hidden',
        boxShadow: '0 10px 30px rgba(15,110,86,0.2)'
      }}>
        {/* Elementos decorativos */}
        <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(255,255,255,0.04)' }} />
        
        <div style={{ position: 'relative', zIndex: 1, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <span style={{ fontSize: 32, display: 'block', marginBottom: 4 }}>💲</span>
            <h1 style={{ color: 'white', fontSize: 28, fontWeight: 900, margin: 0, letterSpacing: '-0.5px' }}>Precios</h1>
            <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, margin: '6px 0 0', fontWeight: 500 }}>Consulta el catálogo actualizado</p>
          </div>
          <div style={{ display: 'flex', gap: 10, flexDirection: 'column', alignItems: 'flex-end' }}>
            {isAdmin && (
              <button onClick={() => handleOpenModal()} style={{
                background: 'white', border: 'none', borderRadius: 14,
                color: '#0F6E56', padding: '10px 16px', fontSize: 13, fontWeight: 800, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                transition: 'transform 0.2s',
              }}>
                <span style={{ fontSize: 16 }}>➕</span> Nuevo
              </button>
            )}
            <button onClick={exportToPDF} style={{
              background: 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.3)', borderRadius: 14,
              color: 'white', padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
              backdropFilter: 'blur(5px)'
            }}>
              <span style={{ fontSize: 14 }}>📄</span> PDF
            </button>
          </div>
        </div>
      </div>

      {/* ══ BUSCADOR ══ */}
      <div style={{ padding: '0 20px', marginTop: -24, position: 'relative', zIndex: 10 }}>
        <div style={{ 
          background: 'white', borderRadius: 20, display: 'flex', alignItems: 'center', padding: '12px 18px',
          boxShadow: '0 8px 25px rgba(0,0,0,0.06)', border: '1px solid #f1f5f9'
        }}>
          <span style={{ fontSize: 18, color: '#94a3b8', marginRight: 10 }}>🔍</span>
          <input 
            type="text" 
            placeholder="Buscar producto por nombre..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{ border: 'none', outline: 'none', width: '100%', fontSize: 15, fontWeight: 600, color: '#1e293b' }}
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm('')} style={{ background: 'none', border: 'none', fontSize: 18, color: '#cbd5e1', cursor: 'pointer' }}>✕</button>
          )}
        </div>
      </div>

      {/* ══ LISTADO DENSO OPTIMIZADO (TABLA) ══ */}
      <div style={{ padding: '20px', background: 'white', borderRadius: 24, margin: '16px 20px 0', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', overflowX: 'auto' }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <div style={{ width: 30, height: 30, borderRadius: '50%', border: '3px solid rgba(15,110,86,0.15)', borderTopColor: '#0F6E56', animation: 'spin 0.8s linear infinite', margin: '0 auto 10px' }} />
            <p style={{ color: '#94a3b8', fontSize: 13, fontWeight: 600 }}>Cargando precios...</p>
          </div>
        ) : filteredProductos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 20px', background: 'white', borderRadius: 24, border: '2px dashed #e2e8f0' }}>
            <span style={{ fontSize: 40, display: 'block', marginBottom: 10 }}>📦</span>
            <p style={{ color: '#64748b', fontSize: 15, fontWeight: 800, margin: 0 }}>No hay productos</p>
            <p style={{ color: '#94a3b8', fontSize: 13, margin: '4px 0 0' }}>{searchTerm ? 'Intenta con otro término de búsqueda.' : 'El catálogo está vacío actualmente.'}</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 600 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0' }}>
                <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Producto</th>
                <th style={{ padding: '12px 10px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Marca</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Sin Descuento</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Con Descuento</th>
                {isAdmin && <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {displayedProductos.map((prod) => {
                const tieneDescuento = prod.precio_descuento > 0 && prod.precio_descuento < prod.precio_normal;
                
                return (
                  <tr key={prod.id} style={{ 
                    borderBottom: '1px solid #f1f5f9',
                    opacity: prod.agotado ? 0.6 : 1, transition: 'all 0.2s',
                  }}>
                    <td style={{ padding: '16px 10px', verticalAlign: 'middle' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {prod.agotado && <span style={{ background: '#fef2f2', color: '#ef4444', fontSize: 9, fontWeight: 900, padding: '2px 6px', borderRadius: 4, textTransform: 'uppercase' }}>Agotado</span>}
                        <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--brand-dark)' }}>{prod.producto}</span>
                      </div>
                    </td>
                    <td style={{ padding: '16px 10px', textAlign: 'left', verticalAlign: 'middle' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#64748b' }}>{prod.marca || '--'}</span>
                    </td>
                    <td style={{ padding: '16px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: tieneDescuento ? '#64748b' : 'var(--brand-dark)' }}>{formatearPrecio(prod.precio_normal)}</span>
                    </td>
                    <td style={{ padding: '16px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {tieneDescuento ? (
                        <span style={{ fontSize: 15, fontWeight: 900, color: '#0F6E56', background: 'rgba(15,110,86,0.06)', padding: '6px 10px', borderRadius: 8 }}>{formatearPrecio(prod.precio_descuento)}</span>
                      ) : (
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1' }}>--</span>
                      )}
                    </td>
                    {isAdmin && (
                      <td style={{ padding: '16px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                          <button onClick={() => handleOpenModal(prod)} style={{ padding: '6px 10px', background: 'rgba(15,110,86,0.06)', border: 'none', borderRadius: 8, color: '#0F6E56', fontSize: 11, fontWeight: 800, cursor: 'pointer' }} title="Editar">✏️</button>
                          <button onClick={() => handleToggleAgotado(prod.id, prod.agotado)} style={{ padding: '6px 10px', background: prod.agotado ? '#f0fdf4' : '#fff7ed', border: 'none', borderRadius: 8, color: prod.agotado ? '#16a34a' : '#ea580c', fontSize: 11, fontWeight: 800, cursor: 'pointer' }} title={prod.agotado ? "Reactivar" : "Agotar"}>
                            {prod.agotado ? '✅' : '🚫'}
                          </button>
                          <button onClick={() => handleDelete(prod.id)} style={{ padding: '6px 10px', background: '#fef2f2', border: 'none', borderRadius: 8, color: '#ef4444', fontSize: 11, fontWeight: 800, cursor: 'pointer' }} title="Eliminar">🗑️</button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Botón Cargar Más */}
      {visibleCount < filteredProductos.length && (
        <div style={{ textAlign: 'center', padding: '20px' }}>
          <button 
            onClick={() => setVisibleCount(v => v + 50)}
            style={{
              background: 'white', border: '2px solid rgba(15,110,86,0.15)', borderRadius: 14,
              color: '#0F6E56', padding: '12px 24px', fontSize: 14, fontWeight: 800, cursor: 'pointer',
              boxShadow: '0 4px 10px rgba(0,0,0,0.02)'
            }}
          >
            Ver más resultados ({filteredProductos.length - visibleCount} restantes)
          </button>
        </div>
      )}

      {/* Modal Admin */}
      {showModal && isAdmin && (
        <ModalPrecio 
          productoBase={editProduct} 
          onClose={() => setShowModal(false)}
          onSuccess={() => { setShowModal(false); fetchPrecios(); }}
        />
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}

function ModalPrecio({ productoBase, onClose, onSuccess }) {
  const [nombre, setNombre] = useState(productoBase?.producto || '');
  const [marca, setMarca] = useState(productoBase?.marca || '');
  const [precioNormal, setPrecioNormal] = useState(productoBase?.precio_normal || '');
  const [precioDescuento, setPrecioDescuento] = useState(productoBase?.precio_descuento || '');
  const [agotado, setAgotado] = useState(productoBase?.agotado || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!productoBase;

  const handleSave = async () => {
    if (!nombre.trim() || !precioNormal) {
      setError('Nombre y Precio Sin Descuento son obligatorios');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      producto: nombre.trim(),
      marca: marca.trim() || null,
      precio_normal: parseFloat(precioNormal),
      precio_descuento: precioDescuento ? parseFloat(precioDescuento) : null,
      agotado
    };

    let res;
    if (isEdit) {
      res = await supabase.from('lista_precios').update(payload).eq('id', productoBase.id);
    } else {
      res = await supabase.from('lista_precios').insert(payload);
    }

    setSaving(false);
    if (res.error) setError(res.error.message);
    else onSuccess();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: '100%', maxWidth: 400, background: 'white', borderRadius: 28, padding: 24, boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)', animation: 'slideUp 0.3s cubic-bezier(0.16,1,0.3,1)' }}>
        <h3 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 900, color: '#0f172a' }}>
          {isEdit ? 'Editar Precio' : 'Nuevo Precio'}
        </h3>
        
        {error && <div style={{ background: '#fef2f2', color: '#ef4444', padding: 12, borderRadius: 12, fontSize: 13, fontWeight: 600, marginBottom: 16 }}>{error}</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--brand-dark)', marginBottom: 6, textTransform: 'uppercase' }}>Nombre del Producto</label>
            <input type="text" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Dolex Forte Tabletas" style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 14, border: '2px solid rgba(15,110,86,0.15)', background: 'rgba(15,110,86,0.03)', fontSize: 15, fontWeight: 600, outline: 'none', color: 'var(--brand-dark)' }} />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--brand-dark)', marginBottom: 6, textTransform: 'uppercase' }}>Marca</label>
            <input type="text" value={marca} onChange={e => setMarca(e.target.value)} placeholder="Ej: Bayer" style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 14, border: '2px solid rgba(15,110,86,0.15)', background: 'rgba(15,110,86,0.03)', fontSize: 15, fontWeight: 600, outline: 'none', color: 'var(--brand-dark)' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--brand-dark)', marginBottom: 6, textTransform: 'uppercase' }}>Precio Sin Descuento</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand)', fontWeight: 800 }}>$</span>
                <input type="number" value={precioNormal} onChange={e => setPrecioNormal(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 30px', borderRadius: 14, border: '2px solid rgba(15,110,86,0.15)', background: 'rgba(15,110,86,0.03)', fontSize: 15, fontWeight: 700, outline: 'none', color: 'var(--brand-dark)' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#10b981', marginBottom: 6, textTransform: 'uppercase' }}>Precio Con Descuento</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#10b981', fontWeight: 800 }}>$</span>
                <input type="number" value={precioDescuento} onChange={e => setPrecioDescuento(e.target.value)} placeholder="Opcional" style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 30px', borderRadius: 14, border: '2px solid #ecfdf5', background: '#f0fdf4', color: '#059669', fontSize: 15, fontWeight: 700, outline: 'none' }} />
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '12px 16px', background: agotado ? '#fef2f2' : '#f8fafc', borderRadius: 14, border: agotado ? '2px solid #fecaca' : '2px solid #f1f5f9', transition: 'all 0.2s' }}>
            <input type="checkbox" checked={agotado} onChange={e => setAgotado(e.target.checked)} style={{ width: 18, height: 18, accentColor: '#ef4444' }} />
            <span style={{ fontSize: 14, fontWeight: 700, color: agotado ? '#dc2626' : '#64748b' }}>Marcar como Agotado</span>
          </label>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button onClick={onClose} style={{ flex: 1, padding: 14, background: 'white', border: '2px solid #e2e8f0', borderRadius: 14, color: '#64748b', fontWeight: 800, cursor: 'pointer' }}>Cancelar</button>
          <button onClick={handleSave} disabled={saving} style={{ flex: 2, padding: 14, background: 'linear-gradient(135deg, #084032, #0F6E56)', border: 'none', borderRadius: 14, color: 'white', fontWeight: 800, cursor: saving ? 'not-allowed' : 'pointer', boxShadow: '0 4px 12px rgba(15,110,86,0.3)' }}>
            {saving ? 'Guardando...' : (isEdit ? 'Actualizar' : 'Crear Precio')}
          </button>
        </div>
      </div>
      <style>{`@keyframes slideUp { from { opacity: 0; transform: translateY(20px) scale(0.95); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
    </div>
  );
}
