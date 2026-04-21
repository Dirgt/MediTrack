'use server';

import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada en .env.local');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Transiciones válidas ──
const TRANSICIONES_VALIDAS = {
  pendiente:            ['alistando', 'cancelado'],
  alistando:            ['facturando', 'cancelado'],
  facturando:           ['en_camino', 'cancelado'],
  en_camino:            ['entregado', 'rechazado_puerta', 'cancelado'],
  rechazado_puerta:     ['programado_reintento', 'cerrado_sin_entrega', 'cancelado'],
  programado_reintento: ['en_camino', 'cancelado'],
  entregado:            [],
  cerrado_sin_entrega:  [],
  cancelado:            [],
};

/**
 * Avanza el estado de un pedido.
 */
export async function cambiarEstadoPedido(orderId, nuevoEstado, opciones = {}) {
  try {
    const supabase = getAdminClient();

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, estado, intentos_entrega')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) return { success: false, error: 'Pedido no encontrado' };

    const permitidos = TRANSICIONES_VALIDAS[order.estado] || [];
    if (!permitidos.includes(nuevoEstado)) {
      return { success: false, error: `Transición inválida: ${order.estado} → ${nuevoEstado}` };
    }

    const update = {
      estado: nuevoEstado,
      actualizado_en: new Date().toISOString(),
    };

    if (nuevoEstado === 'rechazado_puerta') {
      update.motivo_rechazo   = opciones.motivo_rechazo || null;
      update.intentos_entrega = (order.intentos_entrega || 0) + 1;
    }
    if (nuevoEstado === 'programado_reintento') {
      update.nota_reintento  = opciones.nota_reintento || null;
      update.fecha_reintento = opciones.fecha_reintento || null;
    }
    if (nuevoEstado === 'entregado') {
      update.pagado = true;
    }
    if (nuevoEstado === 'cancelado') {
      update.motivo_rechazo = opciones.motivo_cancelacion || null;
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update(update)
      .eq('id', orderId);

    if (updateErr) return { success: false, error: updateErr.message };

    await supabase.from('order_history').insert({
      order_id:        orderId,
      estado_anterior: order.estado,
      estado_nuevo:    nuevoEstado,
      nota_interna:    opciones.notas || opciones.motivo_rechazo || opciones.nota_reintento || opciones.motivo_cancelacion || null,
      cambiado_por:    opciones.adminId || null,
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Edita los items y observaciones de un pedido en estado 'pendiente'.
 * Solo el vendedor dueño puede llamar esto.
 */
export async function editarPedido(orderId, { items, observaciones, vendedorId }) {
  try {
    const supabase = getAdminClient();

    // Verificar que el pedido existe, es del vendedor, y está en pendiente
    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, estado, vendedor_id')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) return { success: false, error: 'Pedido no encontrado' };
    if (order.vendedor_id !== vendedorId) return { success: false, error: 'Sin permiso para editar este pedido' };
    if (order.estado !== 'pendiente') return { success: false, error: 'Solo se pueden editar pedidos en estado Pendiente' };

    // Validar items
    const itemsValidos = (items || []).filter(i => i.medicamento_nombre?.trim());
    if (itemsValidos.length === 0) return { success: false, error: 'Debes incluir al menos un medicamento' };

    // 1. Actualizar el pedido
    const { error: updateErr } = await supabase
      .from('orders')
      .update({ observaciones: observaciones || null, actualizado_en: new Date().toISOString() })
      .eq('id', orderId);

    if (updateErr) return { success: false, error: updateErr.message };

    // 2. Borrar items anteriores e insertar los nuevos
    await supabase.from('order_items').delete().eq('order_id', orderId);

    const nuevosItems = itemsValidos.map(i => ({
      order_id: orderId,
      medicamento_nombre: i.medicamento_nombre.trim(),
      cantidad: parseInt(i.cantidad) || 1,
    }));

    const { error: itemsErr } = await supabase.from('order_items').insert(nuevosItems);
    if (itemsErr) return { success: false, error: itemsErr.message };

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Cancela un pedido (solo admin puede cancelar desde cualquier estado; vendedor solo desde pendiente).
 */
export async function cancelarPedido(orderId, { motivo, usuarioId, esAdmin }) {
  try {
    const supabase = getAdminClient();

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, estado, vendedor_id')
      .eq('id', orderId)
      .single();

    if (fetchErr || !order) return { success: false, error: 'Pedido no encontrado' };

    const estadosTerminales = ['entregado', 'cerrado_sin_entrega', 'cancelado'];
    if (estadosTerminales.includes(order.estado)) {
      return { success: false, error: 'Este pedido ya no puede cancelarse' };
    }

    if (!esAdmin && order.vendedor_id !== usuarioId) {
      return { success: false, error: 'Sin permiso' };
    }
    if (!esAdmin && order.estado !== 'pendiente') {
      return { success: false, error: 'Solo puedes cancelar pedidos en estado Pendiente' };
    }

    const { error: updateErr } = await supabase
      .from('orders')
      .update({ estado: 'cancelado', motivo_rechazo: motivo || null, actualizado_en: new Date().toISOString() })
      .eq('id', orderId);

    if (updateErr) return { success: false, error: updateErr.message };

    await supabase.from('order_history').insert({
      order_id:        orderId,
      estado_anterior: order.estado,
      estado_nuevo:    'cancelado',
      nota_interna:    motivo || 'Pedido cancelado',
      cambiado_por:    usuarioId,
    });

    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
