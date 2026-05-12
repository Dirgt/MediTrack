'use server';

import { createClient } from '@supabase/supabase-js';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Guardar o actualizar la ubicación GPS de un cliente (droguería).
 * Puede ser llamado por admin, vendedor o repartidor.
 */
export async function guardarUbicacionCliente(idOReferencia, latitud, longitud, direccionTexto, usuarioId, nombreSiNuevo = null) {
  try {
    if (!idOReferencia || !latitud || !longitud || !usuarioId) {
      return { success: false, error: 'Faltan datos requeridos.' };
    }

    const updateData = {
      latitud: parseFloat(latitud),
      longitud: parseFloat(longitud),
      direccion_verificada: true,
      ubicacion_guardada_por: usuarioId,
      ubicacion_guardada_en: new Date().toISOString(),
      activo: true
    };

    if (direccionTexto && direccionTexto.trim()) {
      updateData.direccion = direccionTexto.trim();
    }

    // Verificar si es un ID (UUID) o un nombre para crear uno nuevo
    const esUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOReferencia);

    if (esUUID) {
      const { error } = await supabaseAdmin.from('clientes').update(updateData).eq('id', idOReferencia);
      if (error) throw error;
    } else {
      // Es un nombre, crear cliente nuevo
      const insertData = {
        ...updateData,
        nombre: nombreSiNuevo || idOReferencia,
        ciudad: direccionTexto?.split(',').pop()?.trim() || ''
      };
      const { error } = await supabaseAdmin.from('clientes').insert([insertData]);
      if (error) throw error;
    }

    return { success: true };
  } catch (err) {
    console.error('guardarUbicacionCliente error:', err);
    return { success: false, error: err.message || 'Error al guardar ubicación.' };
  }
}

/**
 * Obtener clientes con ubicación para mostrar en el mapa.
 * Filtra por los clientes que tienen coordenadas guardadas.
 */
export async function obtenerClientesConUbicacion() {
  try {
    const { data, error } = await supabaseAdmin
      .from('clientes')
      .select('id, nombre, telefono, direccion, ciudad, latitud, longitud, direccion_verificada')
      .not('latitud', 'is', null)
      .not('longitud', 'is', null)
      .eq('activo', true);

    if (error) {
      console.error('Error al obtener clientes con ubicación:', error);
      return { success: false, error: 'Error al cargar ubicaciones.', data: [] };
    }

    return { success: true, data: data || [] };
  } catch (err) {
    console.error('obtenerClientesConUbicacion error:', err);
    return { success: false, error: 'Error inesperado.', data: [] };
  }
}
