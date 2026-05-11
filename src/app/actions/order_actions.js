'use server';

import { createClient } from '@supabase/supabase-js';

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('SUPABASE_SERVICE_ROLE_KEY no configurada en .env.local');
  return createClient(url, key, { auth: { persistSession: false } });
}

// ── Máximo de intentos de entrega permitidos ──
const MAX_INTENTOS = 2;

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

// ── Etiquetas legibles por estado ──
const ESTADO_LABEL = {
  pendiente:            'Pendiente ⏳',
  alistando:            'En alistamiento 📦',
  facturando:           'En facturación 🧾',
  en_camino:            'En camino 🚚',
  entregado:            '¡Entregado! ✅',
  rechazado_puerta:     'Rechazado en puerta 🚫',
  programado_reintento: 'Reintento programado 🔄',
  cerrado_sin_entrega:  'Cerrado sin entrega 🔒',
  cancelado:            'Cancelado ❌',
};

// Nota: Las notificaciones son manejadas automáticamente por el trigger
// de base de datos 'order_notifications_trigger' → handle_order_notifications()
// No se insertan manualmente aquí para evitar duplicados.


/**
 * Avanza el estado de un pedido.
 */
export async function cambiarEstadoPedido(orderId, nuevoEstado, opciones = {}) {
  try {
    const supabase = getAdminClient();

    const { data: order, error: fetchErr } = await supabase
      .from('orders')
      .select('id, estado, intentos_entrega, vendedor_id, cliente_nombre')
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
      const nuevosIntentos = (order.intentos_entrega || 0) + 1;
      update.intentos_entrega = nuevosIntentos;

      // #5: Si se alcanza el límite de intentos, cerrar automáticamente
      if (nuevosIntentos >= MAX_INTENTOS) {
        update.estado = 'cerrado_sin_entrega';
        update.motivo_rechazo = `${opciones.motivo_rechazo || 'Sin motivo'} (Cierre automático — ${MAX_INTENTOS} intentos alcanzados)`;
        // Registrar en historial el cierre automático
        await supabase.from('order_history').insert({
          order_id:        orderId,
          estado_anterior: 'rechazado_puerta',
          estado_nuevo:    'cerrado_sin_entrega',
          nota_interna:    `Cierre automático tras ${MAX_INTENTOS} intentos de entrega fallidos.`,
          cambiado_por:    opciones.adminId || null,
        });
        const { error: closeErr } = await supabase.from('orders').update(update).eq('id', orderId);
        if (closeErr) return { success: false, error: closeErr.message };
        return { success: true, autoClosed: true, mensaje: `Pedido cerrado automáticamente tras ${MAX_INTENTOS} intentos fallidos.` };
      }
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

    // 0. Obtener items actuales para auditoría (#14)
    const { data: oldItems } = await supabase.from('order_items').select('medicamento_nombre, cantidad').eq('order_id', orderId);

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

    // 3. Registrar auditoría de cambios en items
    if (oldItems) {
      const auditParts = [];
      
      // Encontrar eliminados o cambiados
      oldItems.forEach(oi => {
        const matching = nuevosItems.find(ni => ni.medicamento_nombre === oi.medicamento_nombre);
        if (!matching) {
          auditParts.push(`Quita: ${oi.medicamento_nombre} (x${oi.cantidad})`);
        } else if (matching.cantidad !== oi.cantidad) {
          auditParts.push(`Cambia: ${oi.medicamento_nombre} (${oi.cantidad} → ${matching.cantidad})`);
        }
      });

      // Encontrar nuevos
      nuevosItems.forEach(ni => {
        const isNew = !oldItems.some(oi => oi.medicamento_nombre === ni.medicamento_nombre);
        if (isNew) auditParts.push(`Añade: ${ni.medicamento_nombre} (x${ni.cantidad})`);
      });

      if (auditParts.length > 0 || order.observaciones !== observaciones) {
        await supabase.from('order_history').insert({
          order_id: orderId,
          estado_anterior: 'pendiente',
          estado_nuevo: 'pendiente',
          nota_interna: auditParts.length > 0 ? `Edición de ítems: ${auditParts.join(', ')}` : 'Edición de observaciones',
          cambiado_por: vendedorId
        });
      }
    }

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
      .select('id, estado, vendedor_id, cliente_nombre')
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
