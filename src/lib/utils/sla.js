/**
 * SLA ENGINE — MediTrack
 * Calcula la prioridad y estado operativo de un pedido
 * basándose en la fecha de entrega y el horario laboral (8am-6pm).
 *
 * Escenarios cubiertos:
 *  - Pedido Express (creado y entregado el mismo día)
 *  - Pedido Estándar (de un día para otro)
 *  - Pedido Programado (2+ días)
 *  - Pedido Vencido (fecha de entrega pasada, sin entregar)
 *  - Pedidos terminales (entregado, cancelado, cerrado)
 */

// ── Configuración del horario laboral ──────────────────────────────────────
const HORA_INICIO       = 8;   // 8:00 AM
const HORA_FIN          = 18;  // 6:00 PM
const HORA_ALISTAMIENTO = 12;  // Antes del mediodía: alistamiento normal
const HORA_LIMITE_BOD   = 15;  // 3:00 PM: cierre ventana de despacho

// ── Estados que son terminales (no generan alertas SLA) ────────────────────
const ESTADOS_TERMINALES = ['entregado', 'cancelado', 'cerrado_sin_entrega'];

// ── Definición de niveles de urgencia ──────────────────────────────────────
export const SLA_NIVELES = {
  TERMINAL:    0, // Pedido finalizado — sin alerta
  FUTURO:      1, // Entrega en 2+ días — en cola de espera
  PROGRAMADO:  2, // Entrega mañana — alistamiento hoy
  ALISTANDO:   3, // Entrega mañana y ya es mediodía — revisar progreso
  EXPRESS:     4, // Entrega hoy — ventana apretada
  URGENTE:     5, // Entrega hoy y ya son las 3pm — debe salir YA
  CRITICO:     6, // Vencido (fecha de entrega pasó, sin entregar)
};

/**
 * Compara solo la parte de fecha (sin hora) de dos objetos Date.
 * @returns {number} -1 si a < b, 0 si iguales, 1 si a > b
 */
function compararFechas(a, b) {
  const fa = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const fb = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  if (fa < fb) return -1;
  if (fa > fb) return  1;
  return 0;
}

/**
 * Calcula la diferencia en días calendario entre dos fechas (ignorando horas).
 */
function difEnDias(fechaRef, ahora) {
  const ref = new Date(fechaRef.getFullYear(), fechaRef.getMonth(), fechaRef.getDate());
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  return Math.round((ref - hoy) / 86400000);
}

/**
 * Formatea la fecha de entrega de forma legible.
 */
function formatearFechaEntrega(fecha) {
  return fecha.toLocaleDateString('es-CO', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Calcula el tiempo transcurrido desde el último cambio de estado,
 * SOLO contando horas laborales (8am-6pm).
 * @param {Date} desde - Fecha del último cambio de estado
 * @param {Date} ahora - Fecha actual
 * @returns {string} Texto como "2h 30min laborales"
 */
export function calcularTiempoLaboralTranscurrido(desde, ahora) {
  if (!desde) return null;
  let minutosLaborales = 0;
  const inicio = new Date(desde);
  const fin    = new Date(ahora);

  // Iterar día por día para contar solo horas laborales
  const cursor = new Date(inicio);
  while (cursor < fin) {
    const h = cursor.getHours();
    const m = cursor.getMinutes();
    // Solo contar si estamos en horario laboral
    if (h >= HORA_INICIO && h < HORA_FIN) {
      minutosLaborales++;
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
    // Optimización: si ya son medianoche y la diferencia es grande,
    // saltar al inicio del próximo día laboral
    if (cursor.getHours() === 0 && cursor.getMinutes() === 0) {
      const fin24 = new Date(fin.getFullYear(), fin.getMonth(), fin.getDate());
      const cur24 = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
      const diasRestantes = Math.floor((fin24 - cur24) / 86400000);
      if (diasRestantes > 1) {
        // Sumar días completos de trabajo directo (sin iterar minuto a minuto)
        minutosLaborales += (diasRestantes - 1) * (HORA_FIN - HORA_INICIO) * 60;
        cursor.setDate(cursor.getDate() + (diasRestantes - 1));
      }
    }
  }

  const horas = Math.floor(minutosLaborales / 60);
  const mins  = minutosLaborales % 60;
  if (horas === 0) return `${mins}min`;
  if (mins  === 0) return `${horas}h`;
  return `${horas}h ${mins}min`;
}

/**
 * FUNCIÓN PRINCIPAL
 * Evalúa un pedido y retorna su nivel de urgencia + mensajes para UI.
 *
 * @param {object} pedido - Objeto del pedido con { estado, fecha_entrega, actualizado_en, creado_en }
 * @param {Date}   [ahora=new Date()] - Fecha de referencia (inyectable para tests)
 * @returns {object} { nivel, titulo, subtitulo, color, bg, border, icono, pulso, diasRestantes }
 */
export function calcularSLA(pedido, ahora = new Date()) {
  const { estado, fecha_entrega, actualizado_en } = pedido;

  // ── 1. Estados terminales — sin alerta SLA ─────────────────────────────
  if (ESTADOS_TERMINALES.includes(estado)) {
    const esEntregado = estado === 'entregado';
    return {
      nivel:     SLA_NIVELES.TERMINAL,
      titulo:    esEntregado ? 'Entregado' : estado === 'cancelado' ? 'Cancelado' : 'Cerrado',
      subtitulo: esEntregado ? 'Ciclo completado exitosamente' : 'Sin acción requerida',
      color:     esEntregado ? '#10b981' : '#6b7280',
      bg:        esEntregado ? 'rgba(16,185,129,0.08)' : 'rgba(107,114,128,0.08)',
      border:    esEntregado ? 'rgba(16,185,129,0.25)' : 'rgba(107,114,128,0.2)',
      icono:     esEntregado ? '✅' : '🔒',
      pulso:     false,
      diasRestantes: null,
    };
  }

  // ── 2. Sin fecha de entrega — no se puede calcular SLA ─────────────────
  if (!fecha_entrega) {
    return {
      nivel:     SLA_NIVELES.FUTURO,
      titulo:    'Sin Fecha Asignada',
      subtitulo: 'El vendedor no ingresó fecha de entrega',
      color:     '#94a3b8',
      bg:        'rgba(148,163,184,0.08)',
      border:    'rgba(148,163,184,0.2)',
      icono:     '📅',
      pulso:     false,
      diasRestantes: null,
    };
  }

  // ── 3. Calcular diferencia de días ─────────────────────────────────────
  // Parsear fecha_entrega como fecha local (sin conversión UTC)
  const [y, m, d] = fecha_entrega.split('-').map(Number);
  const fechaObj  = new Date(y, m - 1, d);
  const dias      = difEnDias(fechaObj, ahora);
  const horaActual = ahora.getHours() + ahora.getMinutes() / 60;
  const esDiasHabil = ahora.getDay() >= 1 && ahora.getDay() <= 6; // Lun-Sab
  const tiempoEnEstado = actualizado_en
    ? calcularTiempoLaboralTranscurrido(new Date(actualizado_en), ahora)
    : null;

  // ── 4. VENCIDO ─────────────────────────────────────────────────────────
  if (dias < 0) {
    const diasVencido = Math.abs(dias);
    return {
      nivel:     SLA_NIVELES.CRITICO,
      titulo:    'PEDIDO VENCIDO',
      subtitulo: `${diasVencido} ${diasVencido === 1 ? 'día' : 'días'} de retraso — ¡Atención inmediata!`,
      color:     '#dc2626',
      bg:        'rgba(220,38,38,0.1)',
      border:    'rgba(220,38,38,0.4)',
      icono:     '🚫',
      pulso:     true,
      diasRestantes: dias,
    };
  }

  // ── 5. ENTREGA HOY ─────────────────────────────────────────────────────
  if (dias === 0) {
    // ¿Era un pedido creado hoy mismo? (Express de mismo día)
    const [cy, cm, cd] = (pedido.creado_en || '').split('T')[0].split('-').map(Number);
    const creadoHoy = cy === ahora.getFullYear() && cm === (ahora.getMonth() + 1) && cd === ahora.getDate();

    // Después de la hora límite de despacho (3pm)
    if (horaActual >= HORA_LIMITE_BOD) {
      return {
        nivel:     SLA_NIVELES.URGENTE,
        titulo:    'CRÍTICO: Retraso de Salida',
        subtitulo: `Debió salir a ruta hace ${tiempoEnEstado ? `(en ${estado} hace ${tiempoEnEstado})` : 'tiempo'}. Despachar ahora.`,
        color:     '#dc2626',
        bg:        'rgba(220,38,38,0.08)',
        border:    'rgba(220,38,38,0.35)',
        icono:     '⚠️',
        pulso:     true,
        diasRestantes: 0,
      };
    }

    // Express dentro de horario laboral, antes del límite
    if (creadoHoy) {
      return {
        nivel:     SLA_NIVELES.EXPRESS,
        titulo:    'Pedido Express (Hoy)',
        subtitulo: `Despachar en la ruta de esta tarde — Ventana cierra a las ${HORA_LIMITE_BOD}:00 PM`,
        color:     '#f97316',
        bg:        'rgba(249,115,22,0.08)',
        border:    'rgba(249,115,22,0.3)',
        icono:     '🚀',
        pulso:     false,
        diasRestantes: 0,
      };
    }

    // Pedido de ayer para hoy, aún dentro de horario
    return {
      nivel:     SLA_NIVELES.URGENTE,
      titulo:    'Prioridad de Despacho',
      subtitulo: `Ventana de salida cierra a las ${HORA_LIMITE_BOD}:00 PM${tiempoEnEstado ? ` — En ${estado} hace ${tiempoEnEstado}` : ''}`,
      color:     '#f97316',
      bg:        'rgba(249,115,22,0.08)',
      border:    'rgba(249,115,22,0.3)',
      icono:     '⚡',
      pulso:     horaActual >= 14, // Pulsa después de las 2pm
      diasRestantes: 0,
    };
  }

  // ── 6. ENTREGA MAÑANA ──────────────────────────────────────────────────
  if (dias === 1) {
    // Tarde del día anterior (después del mediodía): advertir que hay que alistar
    if (horaActual >= HORA_ALISTAMIENTO) {
      return {
        nivel:     SLA_NIVELES.ALISTANDO,
        titulo:    'En Alistamiento AM',
        subtitulo: `Debe estar listo para despacho mañana después de las ${HORA_LIMITE_BOD}:00 PM${tiempoEnEstado ? ` — En ${estado} hace ${tiempoEnEstado}` : ''}`,
        color:     '#0d9488',
        bg:        'rgba(13,148,136,0.08)',
        border:    'rgba(13,148,136,0.25)',
        icono:     '🕒',
        pulso:     false,
        diasRestantes: 1,
      };
    }
    // Mañana del día anterior: recién recibido, preparar
    return {
      nivel:     SLA_NIVELES.PROGRAMADO,
      titulo:    'Recibido Correctamente',
      subtitulo: `Entrega mañana (${formatearFechaEntrega(fechaObj)}) — Preparar carga para despacho`,
      color:     '#0F6E56',
      bg:        'rgba(15,110,86,0.07)',
      border:    'rgba(15,110,86,0.2)',
      icono:     '📦',
      pulso:     false,
      diasRestantes: 1,
    };
  }

  // ── 7. ENTREGA EN 2+ DÍAS ──────────────────────────────────────────────
  return {
    nivel:     SLA_NIVELES.FUTURO,
    titulo:    'En Cola de Espera',
    subtitulo: `Programado para ${formatearFechaEntrega(fechaObj)} — Faltan ${dias} días`,
    color:     '#64748b',
    bg:        'rgba(100,116,132,0.06)',
    border:    'rgba(100,116,132,0.18)',
    icono:     '🗓️',
    pulso:     false,
    diasRestantes: dias,
  };
}
