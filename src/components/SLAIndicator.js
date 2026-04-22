'use client';

import { useState, useEffect } from 'react';
import { calcularSLA, SLA_NIVELES } from '@/lib/utils/sla';

/**
 * SLAIndicator — Componente Premium de Estado Operativo
 * Muestra el nivel de urgencia de un pedido con animaciones y tooltips.
 *
 * Props:
 *  - pedido: objeto con { estado, fecha_entrega, actualizado_en, creado_en }
 *  - compact: boolean — versión pequeña para la tarjeta de lista
 */
export default function SLAIndicator({ pedido, compact = false }) {
  const [ahora, setAhora] = useState(() => new Date());

  // Actualizar el tiempo cada 60 segundos para que los contadores sean vivos
  useEffect(() => {
    const interval = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  const sla = calcularSLA(pedido, ahora);

  // Terminales o sin fecha: no mostrar nada en modo compact
  if (compact && sla.nivel === SLA_NIVELES.TERMINAL) return null;

  // ── Estilos base ──────────────────────────────────────────────────────
  const badgeStyle = {
    display:       'inline-flex',
    alignItems:    'center',
    gap:           compact ? 4 : 6,
    padding:       compact ? '3px 8px' : '6px 12px',
    borderRadius:  compact ? 8 : 12,
    border:        `1px solid ${sla.border}`,
    background:    sla.bg,
    color:         sla.color,
    fontSize:      compact ? 11 : 12,
    fontWeight:    800,
    cursor:        'default',
    position:      'relative',
    userSelect:    'none',
    transition:    'all .2s ease',
    animation:     sla.pulso ? 'slaPulse 1.6s ease-in-out infinite' : 'none',
  };

  const puntoDot = {
    width:       compact ? 6 : 8,
    height:      compact ? 6 : 8,
    borderRadius:'50%',
    background:  sla.color,
    flexShrink:  0,
    animation:   sla.pulso ? 'dotBlink 1.2s ease-in-out infinite' : 'none',
  };

  // ── Vista COMPACT (para tarjetas de la lista) ─────────────────────────
  if (compact) {
    return (
      <>
        <div style={{
          display:      'flex',
          alignItems:   'flex-start',
          gap:          8,
          padding:      '8px 10px',
          borderRadius: 12,
          border:       `1px solid ${sla.border}`,
          background:   sla.bg,
          animation:    sla.pulso ? 'slaPulse 1.6s ease-in-out infinite' : 'none',
        }}>
          {/* Dot indicador */}
          <div style={{
            ...puntoDot,
            marginTop: 3,
            flexShrink: 0,
          }} />

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* Título siempre visible */}
            <p style={{
              margin:     0,
              fontSize:   12,
              fontWeight: 800,
              color:      sla.color,
              lineHeight: 1.3,
              display:    'flex',
              alignItems: 'center',
              gap:        4,
            }}>
              {sla.icono} {sla.titulo}
            </p>
            {/* Subtítulo siempre visible */}
            <p style={{
              margin:     '2px 0 0',
              fontSize:   11,
              fontWeight: 500,
              color:      '#64748b',
              lineHeight: 1.4,
              whiteSpace: 'normal',
            }}>
              {sla.subtitulo}
            </p>
          </div>
        </div>

        <SLAStyles />
      </>
    );
  }

  // ── Vista FULL (para la página de detalle del pedido) ─────────────────
  return (
    <div style={{
      background:   sla.bg,
      border:       `1.5px solid ${sla.border}`,
      borderRadius: 20,
      padding:      '16px 18px',
      display:      'flex',
      alignItems:   'flex-start',
      gap:          14,
      animation:    sla.pulso ? 'slaPulse 1.6s ease-in-out infinite' : 'none',
    }}>
      {/* Icono grande */}
      <div style={{
        width:         44,
        height:        44,
        borderRadius:  '50%',
        background:    sla.color + '18',
        display:       'flex',
        alignItems:    'center',
        justifyContent:'center',
        fontSize:      22,
        flexShrink:    0,
        border:        `1.5px solid ${sla.border}`,
      }}>
        {sla.icono}
      </div>

      {/* Texto */}
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          {sla.pulso && <div style={{ ...puntoDot, width: 10, height: 10 }} />}
          <p style={{
            margin:     0,
            fontSize:   15,
            fontWeight: 900,
            color:      sla.color,
            letterSpacing: '.2px',
          }}>
            {sla.titulo}
          </p>
        </div>
        <p style={{
          margin:     0,
          fontSize:   13,
          fontWeight: 600,
          color:      '#64748b',
          lineHeight: 1.5,
        }}>
          {sla.subtitulo}
        </p>

        {/* Barra de temperatura visual */}
        {sla.nivel > SLA_NIVELES.TERMINAL && (
          <div style={{
            marginTop:    10,
            height:       4,
            borderRadius: 4,
            background:   'rgba(0,0,0,0.06)',
            overflow:     'hidden',
          }}>
            <div style={{
              height:     '100%',
              width:      `${Math.min(100, (sla.nivel / 6) * 100)}%`,
              background: `linear-gradient(90deg, #10b981, ${sla.color})`,
              borderRadius: 4,
              transition: 'width .5s ease',
            }} />
          </div>
        )}
      </div>

      <SLAStyles />
    </div>
  );
}

// ── Keyframes compartidos ─────────────────────────────────────────────────
function SLAStyles() {
  return (
    <style>{`
      @keyframes slaPulse {
        0%, 100% { box-shadow: 0 0 0 0 transparent; }
        50%       { box-shadow: 0 0 0 6px rgba(220,38,38,0.15); }
      }
      @keyframes dotBlink {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%       { opacity: .4; transform: scale(.7); }
      }
    `}</style>
  );
}
