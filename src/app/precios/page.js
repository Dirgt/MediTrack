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
  const [activeTab, setActiveTab] = useState('catalogo');
  const [kardex, setKardex] = useState([]);
  
  const [compraProd, setCompraProd] = useState('');
  const [compraCant, setCompraCant] = useState('');
  const [compraCosto, setCompraCosto] = useState('');
  const [savingCompra, setSavingCompra] = useState(false);

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

    if (isAdmin) {
      try {
        const { data: kData } = await supabase
          .from('inventario_movimientos')
          .select('*')
          .order('creado_en', { ascending: false })
          .limit(50);
        if (kData) setKardex(kData);
      } catch (e) {
        console.log('Kardex table does not exist yet');
      }
    }
    
    setLoading(false);
  }, [isAdmin]);

  useEffect(() => {
    if (!user || isRepartidor) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPrecios();
  }, [user, isRepartidor, fetchPrecios]);

  const filteredProductos = useMemo(() => {
    if (!searchTerm) return productos;
    return productos.filter(p => 
      (p.producto || '').toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [productos, searchTerm]);

  // Al cambiar la búsqueda, reiniciar la cantidad visible
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    if (!precio || isNaN(precio)) return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(0);
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
          return [
            p.producto,
            p.marca || '--',
            formatearPrecio(p.precio_normal),
            p.precio_descuento ? formatearPrecio(p.precio_descuento) : '--',
            p.agotado ? 'Agotado' : 'Disponible'
          ];
        });

        autoTable(doc, {
          startY: 28,
          head: [['Producto', 'Marca', 'Crédito', 'Contado', 'Estado']],
          body: tableData,
          theme: 'grid',
          headStyles: { fillColor: [15, 110, 86] },
          styles: { fontSize: 9, cellPadding: 4 },
        });

        doc.save('Catalogo_Precios.pdf');
      });
    });
  };

  const handleRegistrarCompra = async () => {
    if (!compraProd || !compraCant || !compraCosto) return;
    const cant = parseInt(compraCant);
    const costoT = parseFloat(compraCosto);
    if (isNaN(cant) || cant <= 0 || isNaN(costoT) || costoT <= 0) return;

    setSavingCompra(true);
    const p = productos.find(x => x.id === compraProd);

    try {
      // 1. Aumentar stock y actualizar precio de costo promedio
      const nuevoStock = (p.stock || 0) + cant;
      const nuevoCostoU = costoT / cant;
      
      const { error: eStock } = await supabase.from('lista_precios').update({
        stock: nuevoStock,
        precio_costo: nuevoCostoU // Opcional: promedio ponderado
      }).eq('id', p.id);
      if (eStock) throw eStock;

      // 2. Registrar Kardex
      await supabase.from('inventario_movimientos').insert({
        producto_id: p.id,
        producto_nombre: p.producto,
        cantidad_cambio: cant,
        tipo: 'compra',
        creado_por: user.id
      });

      // 3. Registrar Egreso (Caja)
      await supabase.from('transactions').insert({
        tipo: 'egreso',
        monto: costoT,
        metodo_pago: 'efectivo',
        concepto: `COMPRA INVENTARIO - ${p.producto}`,
        detalles: { categoria: 'proveedores' },
        creado_por: user.id
      });

      alert(`¡Compra de ${cant} ${p.producto} registrada correctamente!`);
      setCompraProd('');
      setCompraCant('');
      setCompraCosto('');
      fetchPrecios();
    } catch (err) {
      alert("Error registrando compra: " + err.message);
    }
    setSavingCompra(false);
  };

  const inventarioStats = useMemo(() => {
    let capital = 0;
    let potencial = 0;
    let items = 0;

    productos.forEach(p => {
      const s = parseInt(p.stock) || 0;
      if (s > 0) {
        capital += s * (parseFloat(p.precio_costo) || 0);
        potencial += s * (parseFloat(p.precio_normal) || 0);
        items += s;
      }
    });

    return { capital, potencial, items, ganancia: potencial - capital };
  }, [productos]);

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

      {/* ══ VALORACIÓN DE INVENTARIO (Solo Admin) ══ */}
      {isAdmin && (
        <div style={{ padding: '0 20px', marginTop: -24, position: 'relative', zIndex: 11 }}>
          <div style={{ 
            background: 'white', 
            borderRadius: 20, 
            padding: '20px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
            border: '1px solid #e2e8f0',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 16
          }}>
            {/* Capital Invertido */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: 16, borderLeft: '4px solid #64748b' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Capital en Bodega</p>
              <p style={{ margin: '4px 0 0', fontSize: 18, color: '#0f172a', fontWeight: 900 }}>
                {formatearPrecio(inventarioStats.capital)}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>{inventarioStats.items} unidades físicas</p>
            </div>

            {/* Potencial de Venta */}
            <div style={{ background: '#f8fafc', padding: '16px', borderRadius: 16, borderLeft: '4px solid #3b82f6' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#64748b', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Venta Potencial</p>
              <p style={{ margin: '4px 0 0', fontSize: 18, color: '#1d4ed8', fontWeight: 900 }}>
                {formatearPrecio(inventarioStats.potencial)}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#94a3b8' }}>Vendiendo a precio normal</p>
            </div>

            {/* Ganancia Latente */}
            <div style={{ background: '#f0fdf4', padding: '16px', borderRadius: 16, borderLeft: '4px solid #10b981' }}>
              <p style={{ margin: 0, fontSize: 11, color: '#047857', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ganancia Latente</p>
              <p style={{ margin: '4px 0 0', fontSize: 18, color: '#047857', fontWeight: 900 }}>
                {formatearPrecio(inventarioStats.ganancia)}
              </p>
              <p style={{ margin: '4px 0 0', fontSize: 11, color: '#059669' }}>Utilidad bruta esperada</p>
            </div>
          </div>
        </div>
      )}

      {/* ══ TABS (Solo Admin) ══ */}
      {isAdmin && (
        <div style={{ padding: '0 20px', marginTop: 16, position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', background: 'white', borderRadius: 20, padding: 6, boxShadow: '0 10px 40px rgba(0,0,0,0.08)', overflowX: 'auto', border: '1px solid rgba(226,232,240,0.8)' }}>
            <button onClick={() => setActiveTab('catalogo')} style={{ flex: 1, minWidth: 120, padding: '14px 10px', border: 'none', borderRadius: 16, background: activeTab === 'catalogo' ? 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)' : 'transparent', color: activeTab === 'catalogo' ? 'white' : '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: activeTab === 'catalogo' ? '0 4px 15px rgba(15,110,86,0.25)' : 'none' }}>
              📚 Catálogo
            </button>
            <button onClick={() => setActiveTab('compras')} style={{ flex: 1, minWidth: 120, padding: '14px 10px', border: 'none', borderRadius: 16, background: activeTab === 'compras' ? 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)' : 'transparent', color: activeTab === 'compras' ? 'white' : '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: activeTab === 'compras' ? '0 4px 15px rgba(15,110,86,0.25)' : 'none' }}>
              🛒 Ingresar Compras
            </button>
            <button onClick={() => setActiveTab('kardex')} style={{ flex: 1, minWidth: 120, padding: '14px 10px', border: 'none', borderRadius: 16, background: activeTab === 'kardex' ? 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)' : 'transparent', color: activeTab === 'kardex' ? 'white' : '#64748b', fontWeight: 800, fontSize: 13, cursor: 'pointer', transition: 'all 0.3s ease', whiteSpace: 'nowrap', boxShadow: activeTab === 'kardex' ? '0 4px 15px rgba(15,110,86,0.25)' : 'none' }}>
              🕵️ Kardex
            </button>
          </div>
        </div>
      )}

      {/* ══ CONTENIDO TABS ══ */}
      {(!isAdmin || activeTab === 'catalogo') && (
        <>
          {/* ══ BUSCADOR ══ */}
          <div style={{ padding: '0 20px', marginTop: isAdmin ? 16 : -24, position: 'relative', zIndex: 10 }}>
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
                {isAdmin && <th style={{ padding: '12px 10px', textAlign: 'center', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Stock</th>}
                {isAdmin && <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Costo</th>}
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Crédito</th>
                <th style={{ padding: '12px 10px', textAlign: 'right', fontSize: 11, fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Contado</th>
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
                    background: (isAdmin && prod.stock <= 5) ? 'rgba(239,68,68,0.03)' : 'transparent',
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
                    {isAdmin && (
                      <td style={{ padding: '16px 10px', textAlign: 'center', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 13, fontWeight: 800, color: prod.stock <= 5 ? '#ef4444' : '#10b981', background: prod.stock <= 5 ? '#fef2f2' : '#f0fdf4', padding: '4px 8px', borderRadius: 8 }}>{prod.stock || 0}</span>
                      </td>
                    )}
                    {isAdmin && (
                      <td style={{ padding: '16px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#94a3b8' }}>{formatearPrecio(prod.precio_costo)}</span>
                      </td>
                    )}
                    <td style={{ padding: '16px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#64748b' }}>{formatearPrecio(prod.precio_normal)}</span>
                    </td>
                    <td style={{ padding: '16px 10px', textAlign: 'right', verticalAlign: 'middle' }}>
                      {prod.precio_descuento ? (
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
      </>
      )}

      {isAdmin && activeTab === 'compras' && (
        <div style={{ padding: '20px' }}>
          <div style={{ background: 'white', borderRadius: 24, padding: 24, boxShadow: '0 8px 30px rgba(0,0,0,0.04)', border: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 900, color: '#0f172a', letterSpacing: '-0.5px' }}>Registrar Compra a Proveedor</h3>
              <button onClick={() => handleOpenModal()} style={{ background: '#e0e7ff', color: '#4f46e5', border: 'none', borderRadius: 12, padding: '8px 14px', fontSize: 12, fontWeight: 800, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                ✨ Crear Producto Nuevo
              </button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 20 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Producto (Inventario Actual)</label>
                <select value={compraProd} onChange={e => setCompraProd(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 700, outline: 'none', background: '#f8fafc', color: '#334155' }}>
                  <option value="">-- Seleccionar o Buscar --</option>
                  {productos.map(p => (
                    <option key={p.id} value={p.id}>{p.producto} (Stock: {p.stock || 0})</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Cantidad que Compraste</label>
                <input type="number" value={compraCant} onChange={e => setCompraCant(e.target.value)} placeholder="0" style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 800, outline: 'none' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Total Pagado ($)</label>
                <input type="number" value={compraCosto} onChange={e => setCompraCosto(e.target.value)} placeholder="0" style={{ width: '100%', boxSizing: 'border-box', padding: '12px', borderRadius: 12, border: '2px solid #e2e8f0', fontSize: 14, fontWeight: 800, outline: 'none' }} />
              </div>
            </div>
            
            {compraProd && (() => {
              const p = productos.find(x => x.id === compraProd);
              if (!p) return null;
              
              const cant = parseInt(compraCant) || 0;
              const costoTotal = parseFloat(compraCosto) || 0;
              const nuevoCostoU = cant > 0 ? (costoTotal / cant) : 0;
              const alertaMargen = nuevoCostoU > p.precio_descuento; // 10% lógica o descuento actual
              
              return (
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: 16, borderRadius: 16, marginBottom: 20 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600 }}>Costo Unitario Calculado:</p>
                      <p style={{ margin: '4px 0 0', fontSize: 18, color: '#0f172a', fontWeight: 900 }}>{nuevoCostoU > 0 ? formatearPrecio(nuevoCostoU) : '--'}</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600 }}>Precio de Venta (Contado):</p>
                      <p style={{ margin: '4px 0 0', fontSize: 18, color: '#0F6E56', fontWeight: 900 }}>{formatearPrecio(p.precio_descuento)}</p>
                    </div>
                    <div>
                      <p style={{ margin: 0, fontSize: 12, color: '#64748b', fontWeight: 600 }}>Margen Actual:</p>
                      <p style={{ margin: '4px 0 0', fontSize: 18, color: alertaMargen ? '#ef4444' : '#10b981', fontWeight: 900 }}>
                        {nuevoCostoU > 0 ? `${(((p.precio_descuento - nuevoCostoU) / p.precio_descuento) * 100).toFixed(1)}%` : '--'}
                      </p>
                    </div>
                  </div>
                  
                  {alertaMargen && (
                    <div style={{ marginTop: 12, padding: 12, background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <p style={{ margin: 0, fontSize: 12, color: '#b91c1c', fontWeight: 600 }}>
                        ⚠️ ¡Atención! El nuevo costo es mayor que tu precio de venta actual de contado. Perderás dinero.
                      </p>
                      <button onClick={() => handleOpenModal(p)} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 800, cursor: 'pointer' }}>
                        Ajustar Precios (10%)
                      </button>
                    </div>
                  )}
                  <p style={{ margin: '16px 0 0', fontSize: 12, color: '#64748b', fontWeight: 600, borderTop: '1px dashed #cbd5e1', paddingTop: 10 }}>
                    <strong>Automático:</strong> Esto sumará el stock, registrará en el Kardex y generará el Egreso en Caja automáticamente.
                  </p>
                </div>
              );
            })()}

            <button 
              onClick={handleRegistrarCompra}
              disabled={savingCompra || !compraProd}
              style={{ width: '100%', padding: '16px', background: 'linear-gradient(135deg, #0F6E56 0%, #0c5643 100%)', border: 'none', borderRadius: 14, color: 'white', fontWeight: 800, fontSize: 15, cursor: (savingCompra || !compraProd) ? 'not-allowed' : 'pointer', boxShadow: '0 8px 20px rgba(15,110,86,0.25)', transition: 'all 0.3s ease', textTransform: 'uppercase', letterSpacing: 0.5 }}
            >
              {savingCompra ? 'Procesando...' : 'Confirmar Compra'}
            </button>
          </div>
        </div>
      )}

      {isAdmin && activeTab === 'kardex' && (
        <div style={{ padding: '20px' }}>
          <h3 style={{ fontSize: 13, fontWeight: 900, color: '#64748b', margin: '0 0 16px 8px', textTransform: 'uppercase', letterSpacing: 1 }}>Auditoría de Movimientos</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {kardex.length === 0 ? (
              <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 13, padding: 20, background: 'white', borderRadius: 20 }}>No hay movimientos registrados.</p>
            ) : kardex.map(k => (
              <div key={k.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: 'white', borderRadius: 20, boxShadow: '0 4px 15px rgba(0,0,0,0.02)', border: '1px solid #f8fafc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 16, background: k.tipo === 'compra' ? '#d1fae5' : (k.tipo === 'venta' ? '#fee2e2' : '#e0e7ff'), color: k.tipo === 'compra' ? '#10b981' : (k.tipo === 'venta' ? '#ef4444' : '#6366f1'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
                    {k.tipo === 'compra' ? '📦' : (k.tipo === 'venta' ? '🛍️' : '🔧')}
                  </div>
                  <div>
                    <p style={{ margin: 0, fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{k.producto_nombre}</p>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b', fontWeight: 500 }}>
                      {new Date(k.creado_en).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} • {k.tipo.toUpperCase()}
                    </p>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ margin: 0, fontSize: 18, fontWeight: 900, color: k.cantidad_cambio >= 0 ? '#10b981' : '#ef4444' }}>
                    {k.cantidad_cambio >= 0 ? '+' : ''}{k.cantidad_cambio}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Botón Cargar Más */}
      {(!isAdmin || activeTab === 'catalogo') && visibleCount < filteredProductos.length && (
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
  const [stock, setStock] = useState(productoBase?.stock || 0);
  const [precioCosto, setPrecioCosto] = useState(productoBase?.precio_costo || 0);
  const [agotado, setAgotado] = useState(productoBase?.agotado || false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const isEdit = !!productoBase;

  const handlePrecioContadoChange = (e) => {
    const val = e.target.value;
    setPrecioDescuento(val);
    if (val && !isNaN(val)) {
      const numVal = parseFloat(val);
      const creditoVal = Math.round(numVal / 0.9);
      setPrecioNormal(creditoVal.toString());
    } else {
      setPrecioNormal('');
    }
  };

  const handleSave = async () => {
    if (!nombre.trim() || !precioDescuento || !precioNormal) {
      setError('Nombre, Precio de Contado y Precio a Crédito son obligatorios');
      return;
    }
    setSaving(true);
    setError('');

    const payload = {
      producto: nombre.trim(),
      marca: marca.trim() || null,
      precio_normal: parseFloat(precioNormal),
      precio_descuento: parseFloat(precioDescuento),
      stock: parseInt(stock) || 0,
      precio_costo: parseFloat(precioCosto) || 0,
      agotado
    };

    let res;
    if (isEdit) {
      res = await supabase.from('lista_precios').update(payload).eq('id', productoBase.id);
      
      const diff = (parseInt(stock) || 0) - (productoBase?.stock || 0);
      if (diff !== 0 && !res.error) {
        await supabase.from('inventory_movements').insert({
          producto_id: productoBase.id,
          cantidad: diff,
          tipo: 'ajuste'
        });
      }
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
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#10b981', marginBottom: 6, textTransform: 'uppercase' }}>Precio de Contado</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#10b981', fontWeight: 800 }}>$</span>
                <input type="number" value={precioDescuento} onChange={handlePrecioContadoChange} placeholder="Obligatorio" style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 30px', borderRadius: 14, border: '2px solid #ecfdf5', background: '#f0fdf4', color: '#059669', fontSize: 15, fontWeight: 700, outline: 'none' }} />
              </div>
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: 'var(--brand-dark)', marginBottom: 6, textTransform: 'uppercase' }}>Precio a Crédito</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--brand)', fontWeight: 800 }}>$</span>
                <input type="number" value={precioNormal} readOnly style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 30px', borderRadius: 14, border: '2px solid rgba(15,110,86,0.15)', background: 'rgba(15,110,86,0.03)', fontSize: 15, fontWeight: 700, outline: 'none', color: 'var(--brand-dark)', cursor: 'not-allowed' }} title="Calculado automáticamente" />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#3b82f6', marginBottom: 6, textTransform: 'uppercase' }}>Stock (Inventario)</label>
              <input type="number" value={stock} onChange={e => setStock(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px', borderRadius: 14, border: '2px solid rgba(59,130,246,0.15)', background: 'rgba(59,130,246,0.03)', fontSize: 15, fontWeight: 700, outline: 'none', color: '#1e293b' }} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 800, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>Costo Compra</label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: '#64748b', fontWeight: 800 }}>$</span>
                <input type="number" value={precioCosto} onChange={e => setPrecioCosto(e.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '14px 16px 14px 30px', borderRadius: 14, border: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 15, fontWeight: 700, outline: 'none', color: '#475569' }} />
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
