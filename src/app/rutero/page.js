'use client';

import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { useEffect, useState, useCallback, useRef } from 'react';
import styles from './page.module.css';

// ── Icons (Heroicons solid & outline) ──
const AlertIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} width="24" height="24">
    <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
  </svg>
);

const MapPinIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} width="24" height="24">
    <path fillRule="evenodd" d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
  </svg>
);

const PhoneIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} width="24" height="24">
    <path fillRule="evenodd" d="M1.5 4.5a3 3 0 013-3h1.372c.86 0 1.61.586 1.819 1.42l1.105 4.423a1.875 1.875 0 01-.694 1.955l-1.293.97c-.135.101-.164.249-.126.352a11.285 11.285 0 006.697 6.697c.103.038.25.009.352-.126l.97-1.293a1.875 1.875 0 011.955-.694l4.423 1.105c.834.209 1.42.959 1.42 1.82V19.5a3 3 0 01-3 3h-2.25C8.552 22.5 1.5 15.448 1.5 6.75V4.5z" clipRule="evenodd" />
  </svg>
);

const CheckCircleIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} width="24" height="24">
    <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
  </svg>
);

const XCircleIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className={className} width="24" height="24">
    <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zm-1.72 6.97a.75.75 0 10-1.06 1.06L10.94 12l-1.72 1.72a.75.75 0 101.06 1.06L12 13.06l1.72 1.72a.75.75 0 101.06-1.06L13.06 12l1.72-1.72a.75.75 0 10-1.06-1.06L12 10.94l-1.72-1.72z" clipRule="evenodd" />
  </svg>
);

const MapIcon = ({ className = "w-6 h-6" }) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className={className} width="24" height="24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 6.75V15m6-6v8.25m.503 3.498l4.875-2.437c.381-.19.622-.58.622-1.006V4.82c0-.836-.88-1.38-1.628-1.006l-3.869 1.934c-.317.159-.69.159-1.006 0L9.503 3.252a1.125 1.125 0 00-1.006 0L3.622 5.689C3.24 5.88 3 6.27 3 6.695V19.18c0 .836.88 1.38 1.628 1.006l3.869-1.934c.317-.159.69-.159 1.006 0l4.994 2.497c.317.158.69.158 1.006 0z" />
  </svg>
);

// ── Haversine: distancia entre dos coordenadas en metros ──
function haversineMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radio de la tierra en metros
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

// ── Obtener lunes de la semana actual (UTC) ──
function getStartOfWeekISO() {
  const now = new Date();
  const day = now.getDay(); // 0=dom, 1=lun, ...
  const diff = day === 0 ? 6 : day - 1; // distancia al lunes
  const monday = new Date(now);
  monday.setDate(now.getDate() - diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString();
}

function getDayName() {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export default function RuteroPage() {
  const { user, profile } = useUser();
  const isAdmin = profile?.role === 'admin';

  // ── Admin Supervisor State ──
  const [vendedores, setVendedores] = useState([]);
  const [selectedVendedorId, setSelectedVendedorId] = useState('');

  // ── Data state ──
  const [weeklyProgress, setWeeklyProgress] = useState(0);
  const [alerts, setAlerts] = useState([]);
  const [todayClients, setTodayClients] = useState([]);
  const [allClients, setAllClients] = useState([]);
  const [loading, setLoading] = useState(true);

  // ── Map state ──
  const [showMap, setShowMap] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const mapIframeRef = useRef(null);
  const [routeInfo, setRouteInfo] = useState(null);

  // ── CheckIn modal state ──
  const [checkInModal, setCheckInModal] = useState({
    show: false,
    client: null,
    distance: null,
    userPos: null,
    gpsLoading: false,
    gpsError: '',
  });
  const [checkInObs, setCheckInObs] = useState('');
  const [checkInJustificacion, setCheckInJustificacion] = useState('');
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);

  // ── External visit modal state ──
  const [extModal, setExtModal] = useState({ show: false });
  const [extClientId, setExtClientId] = useState('');
  const [extObs, setExtObs] = useState('');
  const [extSubmitting, setExtSubmitting] = useState(false);

  const GOAL = 60;

  // ════════════════════════════════════════════════════
  //  DATA LOADING
  // ════════════════════════════════════════════════════
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let targetVendedorId = user.id;

      if (isAdmin) {
        if (vendedores.length === 0) {
          const { data: vends } = await supabase
            .from('profiles')
            .select('id, nombre_completo')
            .eq('role', 'vendedor')
            .order('nombre_completo');
          
          if (vends && vends.length > 0) {
            setVendedores(vends);
            if (!selectedVendedorId) {
              targetVendedorId = vends[0].id;
              setSelectedVendedorId(vends[0].id);
            } else {
              targetVendedorId = selectedVendedorId;
            }
          }
        } else {
          targetVendedorId = selectedVendedorId || vendedores[0]?.id || user.id;
        }
      }

      const startOfWeek = getStartOfWeekISO();

      // 1. Progreso semanal
      const { count } = await supabase
        .from('visitas')
        .select('*', { count: 'exact', head: true })
        .eq('vendedor_id', targetVendedorId)
        .eq('estado', 'completada')
        .gte('creado_en', startOfWeek);
      setWeeklyProgress(count || 0);

      // 2. Alertas (>7 días sin visita)
      const { data: alertData } = await supabase
        .from('alertas_visitas_atrasadas')
        .select('*')
        .eq('vendedor_id', targetVendedorId);
      setAlerts(alertData || []);

      // 3. Ruta de hoy
      const { data: todayData } = await supabase
        .from('rutero_hoy')
        .select('*')
        .eq('vendedor_id', targetVendedorId);
      setTodayClients(todayData || []);

      // 4. Todos los clientes (para llamada externa)
      const { data: clientsData } = await supabase
        .from('clientes')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      setAllClients(clientsData || []);
    } catch (err) {
      console.error('Error cargando datos del rutero:', err);
    } finally {
      setLoading(false);
    }
  }, [user, isAdmin, selectedVendedorId, vendedores, vendedores.length]);

  useEffect(() => {
    // Evitar la ejecución síncrona que lanza la advertencia de React (set-state-in-effect)
    const timer = setTimeout(() => {
      loadData();
    }, 0);
    return () => clearTimeout(timer);
  }, [loadData]);

  // ════════════════════════════════════════════════════
  //  MAP COMMUNICATION (reutiliza mapa.html + OSRM)
  // ════════════════════════════════════════════════════
  useEffect(() => {
    function onMessage(event) {
      if (!event.data?.type) return;
      if (event.data.type === 'MAP_READY') setMapReady(true);
      if (event.data.type === 'ROUTE_INFO') setRouteInfo(event.data);
    }
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Enviar marcadores al mapa cuando esté listo
  useEffect(() => {
    if (!showMap || !mapReady || !mapIframeRef.current?.contentWindow) return;
    const clientesConGPS = todayClients.filter((c) => c.latitud && c.longitud);
    if (clientesConGPS.length === 0) return;

    mapIframeRef.current.contentWindow.postMessage(
      { type: 'SET_MARKERS', clientes: clientesConGPS, userPos: null, fitBounds: true },
      '*'
    );
  }, [showMap, mapReady, todayClients]);

  const handleRouteRequest = () => {
    if (!mapIframeRef.current?.contentWindow) return;
    if (!navigator.geolocation) {
      alert('Activa el GPS para calcular la ruta.');
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        mapIframeRef.current.contentWindow.postMessage(
          {
            type: 'CALCULATE_ROUTE',
            clientes: todayClients.filter((c) => c.latitud && c.longitud),
            userPos: { lat: pos.coords.latitude, lng: pos.coords.longitude },
          },
          '*'
        );
      },
      () => alert('No se pudo obtener el GPS.')
    );
  };

  // ════════════════════════════════════════════════════
  //  CHECK-IN (visita presencial)
  // ════════════════════════════════════════════════════
  const openCheckIn = (client) => {
    setCheckInObs('');
    setCheckInJustificacion('');
    setCheckInModal({
      show: true,
      client,
      distance: null,
      userPos: null,
      gpsLoading: true,
      gpsError: '',
      proxima_visita: '',
    });

    if (!navigator.geolocation) {
      setCheckInModal((prev) => ({
        ...prev,
        gpsLoading: false,
        gpsError: 'Geolocalización no soportada por el navegador.',
      }));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        let distance = null;

        if (client.latitud && client.longitud) {
          distance = haversineMeters(
            userLat,
            userLng,
            parseFloat(client.latitud),
            parseFloat(client.longitud)
          );
        }

        setCheckInModal((prev) => ({
          ...prev,
          userPos: { lat: userLat, lng: userLng },
          distance,
          gpsLoading: false,
          gpsError: '',
        }));
      },
      () => {
        setCheckInModal((prev) => ({
          ...prev,
          gpsLoading: false,
          gpsError: 'No se pudo obtener la ubicación. Verifica los permisos del GPS.',
        }));
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  };

  const closeCheckIn = () => {
    setCheckInModal({ show: false, client: null, distance: null, userPos: null, gpsLoading: false, gpsError: '', proxima_visita: '' });
    setCheckInObs('');
    setCheckInJustificacion('');
  };

  const isFarAway = checkInModal.distance !== null && checkInModal.distance >= 100;
  const isNoGPSClient = checkInModal.distance === null && !checkInModal.gpsLoading && !checkInModal.gpsError;

  const submitCheckIn = async () => {
    const { client, distance, userPos } = checkInModal;

    if (isFarAway && !checkInJustificacion.trim()) {
      alert('Debe justificar por qué visitó fuera de las instalaciones.');
      return;
    }

    if (isNoGPSClient && !checkInJustificacion.trim()) {
      alert('El cliente no tiene ubicación registrada. Justifique la visita.');
      return;
    }

    setCheckInSubmitting(true);
    try {
      const payload = {
        cliente_id: client.id,
        vendedor_id: user.id,
        tipo_visita: 'presencial',
        estado: 'completada',
        lat_checkin: userPos?.lat || null,
        lng_checkin: userPos?.lng || null,
        distancia_metros: distance,
        justificacion_lejania: isFarAway || isNoGPSClient ? checkInJustificacion : null,
        observaciones: checkInObs || null,
        proxima_visita_agendada: checkInModal.proxima_visita || null,
      };

      const { error } = await supabase.from('visitas').insert(payload);
      if (error) throw error;

      setTodayClients((prev) => prev.filter((c) => c.id !== client.id));
      setWeeklyProgress((prev) => prev + 1);
      closeCheckIn();
    } catch (err) {
      console.error('Error registrando visita:', err);
      alert('Error al registrar la visita. Intenta de nuevo.');
    } finally {
      setCheckInSubmitting(false);
    }
  };

  // ════════════════════════════════════════════════════
  //  LLAMADA EXTERNA
  // ════════════════════════════════════════════════════
  const openExtModal = () => {
    setExtClientId('');
    setExtObs('');
    setExtModal({ show: true, proxima_visita: '' });
  };

  const closeExtModal = () => {
    setExtModal({ show: false, proxima_visita: '' });
    setExtClientId('');
    setExtObs('');
  };

  const submitExternalVisit = async () => {
    if (!extClientId) return;
    setExtSubmitting(true);
    try {
      const { error } = await supabase.from('visitas').insert({
        cliente_id: extClientId,
        vendedor_id: user.id,
        tipo_visita: 'llamada_externa',
        estado: 'completada',
        observaciones: extObs || null,
        proxima_visita_agendada: extModal.proxima_visita || null,
      });
      if (error) throw error;

      setWeeklyProgress((prev) => prev + 1);
      closeExtModal();
    } catch (err) {
      console.error('Error registrando llamada:', err);
      alert('Error al registrar la llamada. Intenta de nuevo.');
    } finally {
      setExtSubmitting(false);
    }
  };

  // ════════════════════════════════════════════════════
  //  RENDER
  // ════════════════════════════════════════════════════
  if (!user) return null;

  const pct = Math.min(100, Math.round((weeklyProgress / GOAL) * 100));
  const strokeColor = pct > 75 ? '#10b981' : pct > 40 ? '#f59e0b' : '#ef4444';
  const circumference = 2 * Math.PI * 40;

  return (
    <div className={styles.page}>
      {/* ── Hero ── */}
      <header className={styles.hero}>
        <div className={styles.circles}>
          <div className={styles.circle1} />
          <div className={styles.circle2} />
        </div>
        <div className={styles.heroContent}>
          <p className={styles.heroSubtitle}>{getDayName()}</p>
          <h1 className={styles.heroTitle}>Mi Rutero</h1>
          <p style={{ margin: 0, opacity: 0.9 }}>
            Hola, {profile?.nombre_completo || 'Vendedor'}
          </p>
        </div>
      </header>

      <main className={styles.content}>
        {/* ── Admin Selector ── */}
        {isAdmin && vendedores.length > 0 && (
          <div className={styles.section} style={{ marginBottom: '8px' }}>
            <label className={styles.formLabel} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>👁️</span> Modo Supervisor: Viendo a
            </label>
            <select
              className={styles.select}
              value={selectedVendedorId}
              onChange={(e) => setSelectedVendedorId(e.target.value)}
              style={{ border: '2px solid var(--brand)', fontWeight: 600, background: 'white' }}
            >
              {vendedores.map(v => (
                <option key={v.id} value={v.id}>{v.nombre_completo}</option>
              ))}
            </select>
          </div>
        )}

        {/* ── Progreso Semanal ── */}
        <div className={styles.progressContainer}>
          <div className={styles.progressRing}>
            <svg width="100" height="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="8" />
              <circle
                className={styles.progressRingCircle}
                cx="50" cy="50" r="40" fill="none"
                stroke={strokeColor}
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference - (circumference * pct) / 100}
              />
            </svg>
            <div className={styles.progressCenter}>
              <span className={styles.progressPct}>{pct}%</span>
            </div>
          </div>
          <div className={styles.progressInfo}>
            <p className={styles.progressTitle}>Progreso Semanal</p>
            <p className={styles.progressText}>
              {weeklyProgress} <span style={{ fontWeight: 400, fontSize: '1rem', color: 'var(--text-muted)' }}>/ {GOAL}</span>
            </p>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>visitas completadas</span>
          </div>
        </div>

        {/* ── Alertas ── */}
        {alerts.length > 0 && (
          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>
              <AlertIcon className={styles.iconWarning} /> Clientes sin visitar (+7 días)
            </h2>
            <div className={styles.alertList}>
              {alerts.map((a) => (
                <div key={a.id} className={styles.alertCard}>
                  <div className={styles.alertIcon}><AlertIcon /></div>
                  <div className={styles.alertContent}>
                    <h4>{a.nombre}</h4>
                    <p>
                      Hace {a.dias_sin_visita > 1000 ? 'mucho tiempo' : `${a.dias_sin_visita} días`}
                      {a.direccion ? ` — ${a.direccion}` : ''}
                    </p>
                    {a.dia_ruta && (
                      <span className={styles.badgeSmall}>📅 {a.dia_ruta}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Rutero Grid (Mapa a la izquierda, Clientes a la derecha) ── */}
        <div className={styles.splitLayout}>
          
          {/* Columna Izquierda: MAPA */}
          <div className={styles.leftColumn}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <MapIcon className={styles.iconPrimary} /> Mapa de Ruta
              </h2>
            </div>
            
            <div className={styles.mapWrapper}>
              <div className={styles.mapContainer}>
                <iframe
                  ref={mapIframeRef}
                  src="/mapa.html"
                  className={styles.mapFrame}
                  title="Mapa Rutero"
                />
              </div>
              <button className={styles.btnRouteCalc} onClick={handleRouteRequest}>
                🧭 Calcular Ruta Óptima
              </button>
              {routeInfo && (
                <div className={styles.routeInfoBar}>
                  <span>📏 {(routeInfo.distance / 1000).toFixed(1)} km</span>
                  <span>⏱️ {Math.round(routeInfo.duration / 60)} min</span>
                  {routeInfo.wazeUrl && (
                    <a href={routeInfo.wazeUrl} target="_blank" rel="noopener noreferrer" className={styles.navLink}>
                      🧭 Waze
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Columna Derecha: LISTA DE CLIENTES */}
          <div className={styles.rightColumn}>
            <div className={styles.sectionHeader}>
              <h2 className={styles.sectionTitle}>
                <MapPinIcon className={styles.iconPrimary} /> Por visitar hoy
              </h2>
            </div>

            {loading ? (
              <div className={styles.emptyState}>
                <div className={styles.spinner} />
                <p>Cargando rutero...</p>
              </div>
            ) : todayClients.length === 0 ? (
              <div className={styles.emptyState}>
                <CheckCircleIcon className={styles.iconSuccess} style={{ width: 64, height: 64, opacity: 0.8 }} />
                <p>No hay clientes programados para hoy, o ya completaste tu ruta.</p>
              </div>
            ) : (
              <div className={styles.clientList}>
                {todayClients.map((client, i) => (
                  <div key={client.id} className={styles.clientCard} style={{ animationDelay: `${i * 0.06}s` }}>
                    <div className={styles.clientHeader}>
                      <h3 className={styles.clientName}>{client.nombre}</h3>
                      {client.ultima_visita ? (
                        <span className={`${styles.badge} ${styles.badgeSuccess}`}>Visitado</span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeWarning}`}>Sin visitas</span>
                      )}
                    </div>
                    {client.direccion && (
                      <div className={styles.clientDetail}>
                        <MapPinIcon className={styles.iconSmall} /> {client.direccion}{client.ciudad ? `, ${client.ciudad}` : ''}
                      </div>
                    )}
                    {client.telefono && (
                      <div className={styles.clientDetail}>
                        <a href={`tel:${client.telefono}`} className={styles.phoneLink}>
                          <PhoneIcon className={styles.iconSmall} /> {client.telefono}
                        </a>
                      </div>
                    )}
                    <button 
                      className={styles.btnCheckin} 
                      onClick={() => openCheckIn(client)}
                      style={{ opacity: isAdmin ? 0.5 : 1, cursor: isAdmin ? 'not-allowed' : 'pointer' }}
                      disabled={isAdmin}
                      title={isAdmin ? "Solo lectura en modo supervisor" : ""}
                    >
                      <CheckCircleIcon className={styles.iconBtn} /> Registrar Visita
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
          
        </div>
      </main>

      {/* ── FAB: Llamada Externa ── */}
      {!isAdmin && (
        <button className={styles.fab} onClick={openExtModal} title="Registrar llamada externa">
          <PhoneIcon />
        </button>
      )}

      {/* ═══════ MODAL: CHECK-IN ═══════ */}
      {checkInModal.show && (
        <div className={styles.modalBackdrop} onClick={closeCheckIn}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHandle} />
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <MapPinIcon className={styles.iconPrimary} /> Registrar Visita
              </h3>
              <p>{checkInModal.client?.nombre}</p>
            </div>

            {checkInModal.gpsLoading && (
              <div className={styles.gpsLoadingBox}>
                <div className={styles.spinner} />
                <p>Obteniendo ubicación GPS...</p>
              </div>
            )}

            {checkInModal.gpsError && (
              <div className={styles.distanceWarning} style={{ borderLeftColor: '#ef4444' }}>
                <XCircleIcon className={styles.iconError} />
                <div>
                  <p style={{ fontWeight: 'bold' }}>{checkInModal.gpsError}</p>
                  <p>Puedes registrar la visita justificando el motivo.</p>
                </div>
              </div>
            )}

            {!checkInModal.gpsLoading && !checkInModal.gpsError && (
              <>
                {checkInModal.distance !== null && checkInModal.distance < 100 && (
                  <div className={styles.distanceSuccess}>
                    <CheckCircleIcon className={styles.iconSuccess} />
                    <div>
                      <p style={{ fontWeight: 'bold' }}>Estás a {checkInModal.distance}m del cliente.</p>
                      <p>Ubicación verificada correctamente.</p>
                    </div>
                  </div>
                )}

                {isFarAway && (
                  <div className={styles.distanceWarning}>
                    <AlertIcon className={styles.iconWarning} />
                    <div>
                      <p style={{ fontWeight: 'bold' }}>Estás a {checkInModal.distance}m del cliente.</p>
                      <p>Parece que estás fuera de las instalaciones.</p>
                    </div>
                  </div>
                )}

                {isNoGPSClient && (
                  <div className={styles.distanceWarning}>
                    <MapPinIcon className={styles.iconWarning} />
                    <div>
                      <p style={{ fontWeight: 'bold' }}>El cliente no tiene ubicación GPS registrada.</p>
                      <p>Debes justificar la visita.</p>
                    </div>
                  </div>
                )}

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Observaciones (opcional)</label>
                  <textarea
                    className={styles.textarea}
                    value={checkInObs}
                    onChange={(e) => setCheckInObs(e.target.value)}
                    placeholder="Detalles de la visita..."
                    rows={3}
                  />
                </div>

                <div className={styles.formGroup}>
                  <label className={styles.formLabel}>Agendar próxima visita (opcional)</label>
                  <input
                    type="date"
                    className={styles.input}
                    value={checkInModal.proxima_visita || ''}
                    onChange={(e) => setCheckInModal(p => ({ ...p, proxima_visita: e.target.value }))}
                  />
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>Si eliges una fecha, el cliente volverá a aparecer en la ruta ese día de forma prioritaria.</p>
                </div>

                {(isFarAway || isNoGPSClient) && (
                  <div className={styles.formGroup}>
                    <label className={styles.formLabel}>
                      ¿Por qué visitó fuera de las instalaciones? <span style={{ color: '#ef4444' }}>*</span>
                    </label>
                    <textarea
                      className={styles.textarea}
                      value={checkInJustificacion}
                      onChange={(e) => setCheckInJustificacion(e.target.value)}
                      placeholder="Justificación requerida..."
                      rows={3}
                      style={{ borderColor: !checkInJustificacion.trim() ? '#f59e0b' : '#d1d5db' }}
                    />
                  </div>
                )}
              </>
            )}

            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={closeCheckIn}>
                Cancelar
              </button>
              <button
                className={styles.btnPrimary}
                onClick={submitCheckIn}
                disabled={checkInSubmitting || checkInModal.gpsLoading}
              >
                {checkInSubmitting ? 'Guardando...' : <><CheckCircleIcon className={styles.iconBtn} /> Confirmar Visita</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: LLAMADA EXTERNA ═══════ */}
      {extModal.show && (
        <div className={styles.modalBackdrop} onClick={closeExtModal}>
          <div className={styles.modalContainer} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHandle} />
            <div className={styles.modalHeader}>
              <h3 className={styles.modalTitle}>
                <PhoneIcon className={styles.iconPrimary} /> Llamada Externa
              </h3>
              <p>Registra una llamada o contacto remoto</p>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Cliente</label>
              <select
                className={styles.select}
                value={extClientId}
                onChange={(e) => setExtClientId(e.target.value)}
              >
                <option value="">Seleccione un cliente...</option>
                {allClients.map((c) => (
                  <option key={c.id} value={c.id}>{c.nombre}</option>
                ))}
              </select>
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Observaciones</label>
              <textarea
                className={styles.textarea}
                value={extObs}
                onChange={(e) => setExtObs(e.target.value)}
                placeholder="Detalles de la llamada..."
                rows={3}
              />
            </div>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Agendar próxima llamada/visita (opcional)</label>
              <input
                type="date"
                className={styles.input}
                value={extModal.proxima_visita || ''}
                onChange={(e) => setExtModal(p => ({ ...p, proxima_visita: e.target.value }))}
              />
            </div>

            <div className={styles.modalFooter}>
              <button className={styles.btnSecondary} onClick={closeExtModal}>
                Cancelar
              </button>
              <button
                className={styles.btnPrimary}
                onClick={submitExternalVisit}
                disabled={extSubmitting || !extClientId}
              >
                {extSubmitting ? 'Guardando...' : <><PhoneIcon className={styles.iconBtn} /> Registrar Llamada</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
