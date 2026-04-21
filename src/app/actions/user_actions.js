'use server';

import { createClient } from '@supabase/supabase-js';

// Usamos el Service Role para acciones administrativas que esquiven RLS y la sesión activa de quien la ejecuta.
// De esta forma un Administrador puede crear usuarios sin perder su propia sesión.
function getAdminSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseServiceKey) {
    throw new Error('Supabase Service Role Key no configurada en las variables de entorno (.env.local)');
  }

  return createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
}

// Acción de creación de usuario
export async function createStaffAccount(data) {
  try {
    const supabaseAdmin = getAdminSupabaseClient();
    const { email, password, full_name, role_type, meta_mensual, porcentaje_comision } = data;

    // 1. Crear el usuario en la tabla interna de Supabase Auth
    // Gracias al Trigger insertado, `email_confirmed_at` se marcará automáticamente
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true, // Esto ayuda a forzar la bandera en Auth de forma explícita
      user_metadata: {
        full_name,
        role_type
      }
    });

    if (authError) {
      console.error('Error al crear usuario en Auth:', authError.message);
      return { success: false, error: authError.message };
    }

    const userId = authData.user.id;

    // 2. El usuario es autogenerado en la tabla 'profiles' por el TRIGGER ya existente.
    // Nosotros entraremos al perfil como Administrador para completar detalles como meta mensual y porcentaje,
    // ya que el trigger no extrae eso de user_metadata, solo toma full_name.
    
    // Actualizamos el perfil usando el bypass RLS de service_role.
    const { error: profileError } = await supabaseAdmin
      .from('profiles')
      .update({
        role: role_type,
        nombre_completo: full_name,
        meta_mensual: meta_mensual || 0,
        porcentaje_comision: porcentaje_comision || 0
      })
      .eq('id', userId);

    if (profileError) {
      console.error('Error al configurar perfil adicional:', profileError.message);
      return { success: false, error: profileError.message };
    }

    return { 
      success: true, 
      user: { 
        id: userId, 
        email: authData.user.email 
      } 
    };
  } catch (error) {
    console.error('Error general de la acción:', error.message);
    return { success: false, error: error.message };
  }
}

// ── Actualizar perfil de un usuario existente ──
export async function updateStaffAccount(userId, data) {
  try {
    const supabaseAdmin = getAdminSupabaseClient();
    const { nombre_completo, role, meta_mensual, porcentaje_comision } = data;

    const { error } = await supabaseAdmin
      .from('profiles')
      .update({
        nombre_completo,
        role,
        meta_mensual: meta_mensual || 0,
        porcentaje_comision: porcentaje_comision || 0,
      })
      .eq('id', userId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── Liberar un cliente (quitar su vendedor_id) ──
export async function unassignClient(clientId) {
  try {
    const supabaseAdmin = getAdminSupabaseClient();

    const { error } = await supabaseAdmin
      .from('clientes')
      .update({ vendedor_id: null })
      .eq('id', clientId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── Asociar un cliente libre a un vendedor ──
// Solo se puede asociar si el cliente no tiene vendedor (vendedor_id IS NULL)
export async function assignClientToSeller(clientId, vendedorId) {
  try {
    const supabaseAdmin = getAdminSupabaseClient();

    // Verificar que el cliente esté libre antes de asignarlo
    const { data: cliente, error: fetchError } = await supabaseAdmin
      .from('clientes')
      .select('vendedor_id, nombre')
      .eq('id', clientId)
      .single();

    if (fetchError) return { success: false, error: fetchError.message };

    if (cliente.vendedor_id !== null) {
      return {
        success: false,
        error: `El cliente "${cliente.nombre}" ya está asignado a otro vendedor. Debes desasociarlo primero.`,
      };
    }

    const { error } = await supabaseAdmin
      .from('clientes')
      .update({ vendedor_id: vendedorId })
      .eq('id', clientId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── Cambiar contraseña de un usuario (como administrador) ──
export async function changeUserPassword(userId, newPassword) {
  try {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
    }
    const supabaseAdmin = getAdminSupabaseClient();
    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });
    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── Crear un cliente nuevo (como administrador) ──
export async function createNewClient(data) {
  try {
    const supabaseAdmin = getAdminSupabaseClient();
    const { nombre, telefono, ciudad, vendedor_id } = data;

    if (!nombre || !nombre.trim()) {
      return { success: false, error: 'El nombre del cliente es obligatorio.' };
    }

    const insertData = {
      nombre: nombre.trim(),
      telefono: telefono?.trim() || null,
      ciudad: ciudad?.trim() || null,
      vendedor_id: vendedor_id || null,
      activo: true,
    };

    const { data: newClient, error } = await supabaseAdmin
      .from('clientes')
      .insert(insertData)
      .select()
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, client: newClient };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── Actualizar un cliente existente ──
export async function updateClient(clientId, data) {
  try {
    const supabaseAdmin = getAdminSupabaseClient();
    const { nombre, telefono, ciudad, vendedor_id } = data;

    const updateData = {
      nombre: nombre?.trim(),
      telefono: telefono?.trim() || null,
      ciudad: ciudad?.trim() || null,
    };

    // Solo actualizar vendedor_id si se proporcionó explícitamente
    if (vendedor_id !== undefined) {
      updateData.vendedor_id = vendedor_id || null;
    }

    const { error } = await supabaseAdmin
      .from('clientes')
      .update(updateData)
      .eq('id', clientId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ── Eliminar (desactivar) un cliente ──
export async function deleteClient(clientId) {
  try {
    const supabaseAdmin = getAdminSupabaseClient();

    const { error } = await supabaseAdmin
      .from('clientes')
      .update({ activo: false })
      .eq('id', clientId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
