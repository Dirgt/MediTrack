'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { useRouter } from 'next/navigation';

export default function AlistamientoBodega() {
  const { user, profile, loading: authLoading } = useUser();
  const router = useRouter();
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || profile?.role !== 'admin')) {
      router.replace('/');
    }
  }, [user, profile, authLoading, router]);

  const fetchPedidos = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('orders')
      .select(`
        id, 
        estado,
        cliente_nombre,
        order_items (
          medicamento_nombre,
          cantidad
        )
      `)
      .eq('estado', 'pendiente');
      
    if (data) setPedidos(data);
    setLoading(false);
  };

  useEffect(() => {
    if (user && profile?.role === 'admin') {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchPedidos();
      
      const channel = supabase.channel('alistamiento_rt')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => {
          fetchPedidos();
        })
        .subscribe();
      return () => supabase.removeChannel(channel);
    }
  }, [user, profile]);

  // Consolidar inventario (Batch Picking)
  const consolidated = pedidos.reduce((acc, pedido) => {
    pedido.order_items?.forEach(item => {
      const name = item.medicamento_nombre?.trim();
      if (!name) return;
      if (!acc[name]) {
        acc[name] = { cantidadTotal: 0, pedidosAsociados: new Set() };
      }
      acc[name].cantidadTotal += item.cantidad;
      acc[name].pedidosAsociados.add(pedido.cliente_nombre);
    });
    return acc;
  }, {});

  const listaAlistamiento = Object.entries(consolidated)
    .map(([nombre, datos]) => ({
      nombre,
      cantidad: datos.cantidadTotal,
      clientes: Array.from(datos.pedidosAsociados).join(', ')
    }))
    .sort((a, b) => b.cantidad - a.cantidad); // Ordenar por mayor cantidad primero

  if (authLoading || loading) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Cargando consola de alistamiento...</div>;
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1000px', margin: '0 auto', fontFamily: 'inherit' }}>
      <button
        onClick={() => router.back()}
        style={{ background: 'transparent', border: 'none', color: '#64748b', fontWeight: 700, fontSize: 14, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6, padding: 0 }}
        className="btn-volver-print"
      >
        <span style={{ fontSize: 18 }}>←</span> Volver
      </button>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, flexWrap: 'wrap', gap: 16 }}>
        <div>
          <h1 style={{ margin: '0 0 8px', color: '#0f172a', fontSize: 28, fontWeight: 800 }}>Consola de Alistamiento 📦</h1>
          <p style={{ margin: 0, color: '#64748b', fontSize: 15 }}>
            Consolidado de <strong>{pedidos.length}</strong> pedidos en estado Pendiente.
          </p>
        </div>
        <button 
          onClick={() => window.print()}
          style={{ background: '#0F6E56', color: 'white', border: 'none', padding: '12px 24px', borderRadius: 12, fontWeight: 700, cursor: 'pointer', fontSize: 15, boxShadow: '0 4px 12px rgba(15,110,86,0.2)' }}
        >
          🖨️ Imprimir Tirilla
        </button>
      </div>

      {pedidos.length === 0 ? (
        <div style={{ background: 'white', borderRadius: 20, padding: 40, textAlign: 'center', border: '1px solid #e2e8f0' }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>✅</div>
          <h3 style={{ margin: '0 0 8px', color: '#334155' }}>No hay pedidos pendientes</h3>
          <p style={{ margin: 0, color: '#94a3b8' }}>Todo el alistamiento está al día.</p>
        </div>
      ) : (
        <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 10px 25px rgba(0,0,0,0.02)' }}>
          <div style={{ padding: '16px 20px', background: '#f8fafc', borderBottom: '1px solid #e2e8f0', display: 'flex', gap: 16, fontWeight: 700, color: '#475569', fontSize: 14 }}>
            <div style={{ flex: 3 }}>Medicamento / Producto</div>
            <div style={{ flex: 1, textAlign: 'center' }}>Total a Sacar</div>
            <div style={{ flex: 4, display: 'none' }} className="print-clientes">Destinos (Clientes)</div>
          </div>
          
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {listaAlistamiento.map((item, idx) => (
              <div key={idx} style={{ padding: '16px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', gap: 16, alignItems: 'center', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'} onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                <div style={{ flex: 3, fontWeight: 700, color: '#0f172a', fontSize: 16 }}>
                  {item.nombre}
                </div>
                <div style={{ flex: 1, textAlign: 'center' }}>
                  <span style={{ background: '#0F6E56', color: 'white', padding: '6px 12px', borderRadius: 12, fontWeight: 800, fontSize: 18 }}>
                    {item.cantidad}
                  </span>
                </div>
                <div style={{ flex: 4, fontSize: 13, color: '#64748b' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Para:</span>
                  {item.clientes}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Estilos para impresión (Oculta botones y menús laterales, muestra solo la lista) */}
      <style dangerouslySetInnerHTML={{__html: `
        @media print {
          body * { visibility: hidden; }
          .print-clientes { display: block !important; }
          div[style*="max-width: 1000px"] * { visibility: visible; }
          div[style*="max-width: 1000px"] { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          button { display: none !important; }
          .btn-volver-print { display: none !important; }
        }
      `}} />
    </div>
  );
}
