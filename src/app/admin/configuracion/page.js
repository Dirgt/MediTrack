'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { useUser } from '@/context/UserContext';
import { createStaffAccount, updateStaffAccount, unassignClient, assignClientToSeller, changeUserPassword, createNewClient, updateClient, deleteClient } from '@/app/actions/user_actions';

const ROLE_CONFIG = {
  admin:    { label: 'Administrador',      emoji: '🛡️', color: '#8b5cf6', bg: 'rgba(139,92,246,0.1)',  border: 'rgba(139,92,246,0.25)' },
  vendedor: { label: 'Vendedor Ejecutivo', emoji: '🤝', color: '#0F6E56', bg: 'rgba(15,110,86,0.1)',   border: 'rgba(15,110,86,0.25)'  },
};
const EMPTY_FORM = { email: '', password: '', full_name: '', role_type: 'vendedor' };

export default function ConfiguracionAdmin() {
  const { profile, loading } = useUser();
  const [activeTab, setActiveTab]         = useState('usuarios');
  const [users, setUsers]                 = useState([]);
  const [fetching, setFetching]           = useState(true);
  const [showForm, setShowForm]           = useState(false);
  const [formData, setFormData]           = useState(EMPTY_FORM);
  const [isSubmitting, setIsSubmitting]   = useState(false);
  const [feedback, setFeedback]           = useState(null);
  const [showPassword, setShowPassword]   = useState(false);

  // Estado para el panel de detalle de usuario
  const [expandedUserId, setExpandedUserId] = useState(null);
  const [editForm, setEditForm]             = useState({});
  const [isSavingEdit, setIsSavingEdit]     = useState(false);
  const [userClientes, setUserClientes]     = useState([]);
  const [clientesLibres, setClientesLibres] = useState([]);
  const [clienteSearch, setClienteSearch]   = useState('');
  const [showClientePicker, setShowClientePicker] = useState(false);
  const [clientesFeedback, setClientesFeedback]   = useState(null);
  const [loadingClientes, setLoadingClientes]     = useState(false);
  const pickerRef = useRef(null);

  // Paginación
  const [porPagina, setPorPagina]           = useState(10);
  const [usersPagina, setUsersPagina]       = useState(1);
  const [clientsPagina, setClientsPagina]   = useState(1);

  // Estado cambio de contraseña
  const [pwdForm, setPwdForm]             = useState({ nueva: '', confirmar: '' });
  const [showPwd, setShowPwd]             = useState(false);
  const [isSavingPwd, setIsSavingPwd]     = useState(false);
  const [pwdFeedback, setPwdFeedback]     = useState(null);
  const [showPwdSection, setShowPwdSection] = useState(false);

  // Estado para CRUD de clientes
  const [allClientes, setAllClientes] = useState([]);
  const [fetchingClients, setFetchingClients] = useState(false);
  const [showClientForm, setShowClientForm] = useState(false);
  const [clientFormData, setClientFormData] = useState({ nombre: '', telefono: '', ciudad: '', vendedor_id: '' });
  const [editingClientId, setEditingClientId] = useState(null);
  const [isSubmittingClient, setIsSubmittingClient] = useState(false);
  const [clientFeedback, setClientFeedback] = useState(null);
  const [clientSearch, setClientSearch] = useState('');
  const [vendedoresList, setVendedoresList] = useState([]);

  useEffect(() => { fetchUsers(); }, []);

  useEffect(() => {
    if (activeTab === 'clientes' && allClientes.length === 0) {
      fetchAllClientes();
    }
  }, [activeTab, allClientes.length]);

  // Cerrar picker al click fuera
  useEffect(() => {
    const handler = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowClientePicker(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  async function fetchUsers() {
    setFetching(true);
    const { data } = await supabase.from('profiles').select('*').order('creado_en', { ascending: false });
    if (data) {
      setUsers(data);
      setVendedoresList(data.filter(u => u.role === 'vendedor'));
    }
    setFetching(false);
  }

  async function fetchAllClientes() {
    setFetchingClients(true);
    const { data } = await supabase.from('clientes').select('*, profiles!clientes_vendedor_id_fkey(nombre_completo)').eq('activo', true).order('nombre');
    if (data) setAllClientes(data);
    setFetchingClients(false);
  }

  async function handleSaveClient(e) {
    e.preventDefault();
    setIsSubmittingClient(true);
    setClientFeedback(null);
    if (editingClientId) {
      const res = await updateClient(editingClientId, clientFormData);
      if (res.success) {
        setClientFeedback({ type: 'success', message: 'Cliente actualizado correctamente.' });
        setEditingClientId(null);
        setShowClientForm(false);
        setClientFormData({ nombre: '', telefono: '', ciudad: '', vendedor_id: '' });
        fetchAllClientes();
      } else {
        setClientFeedback({ type: 'error', message: res.error });
      }
    } else {
      const res = await createNewClient(clientFormData);
      if (res.success) {
        setClientFeedback({ type: 'success', message: `"${clientFormData.nombre}" fue creado exitosamente.` });
        setShowClientForm(false);
        setClientFormData({ nombre: '', telefono: '', ciudad: '', vendedor_id: '' });
        fetchAllClientes();
      } else {
        setClientFeedback({ type: 'error', message: res.error });
      }
    }
    setIsSubmittingClient(false);
    setTimeout(() => setClientFeedback(null), 4000);
  }

  async function handleDeleteClient(cliente) {
    if (!confirm(`¿Desactivar al cliente "${cliente.nombre}"? Ya no aparecerá en las listas.`)) return;
    const res = await deleteClient(cliente.id);
    if (res.success) {
      setClientFeedback({ type: 'success', message: `"${cliente.nombre}" fue desactivado.` });
      fetchAllClientes();
    } else {
      setClientFeedback({ type: 'error', message: res.error });
    }
    setTimeout(() => setClientFeedback(null), 4000);
  }

  function startEditClient(c) {
    setEditingClientId(c.id);
    setClientFormData({ nombre: c.nombre || '', telefono: c.telefono || '', ciudad: c.ciudad || '', vendedor_id: c.vendedor_id || '' });
    setShowClientForm(true);
  }

  // Expandir / Colapsar un usuario
  async function toggleExpand(user) {
    if (expandedUserId === user.id) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(user.id);
    setEditForm({
      nombre_completo: user.nombre_completo || '',
      role: user.role || 'vendedor',
    });
    setClientesFeedback(null);
    setClienteSearch('');
    setShowClientePicker(false);
    setPwdForm({ nueva: '', confirmar: '' });
    setPwdFeedback(null);
    setShowPwd(false);
    setShowPwdSection(false);
    await fetchClientesDeUsuario(user.id);
  }

  async function fetchClientesDeUsuario(vendedorId) {
    setLoadingClientes(true);
    // Clientes del vendedor
    const { data: propios } = await supabase.from('clientes').select('*').eq('vendedor_id', vendedorId).order('nombre');
    if (propios) setUserClientes(propios);

    // Clientes libres (vendedor_id IS NULL)
    const { data: libres } = await supabase.from('clientes').select('*').is('vendedor_id', null).order('nombre');
    if (libres) setClientesLibres(libres);
    setLoadingClientes(false);
  }

  // Guardar edición del perfil
  async function handleSaveEdit(e) {
    e.preventDefault();
    setIsSavingEdit(true);
    const result = await updateStaffAccount(expandedUserId, editForm);
    if (result.success) {
      setFeedback({ type: 'success', message: 'Perfil actualizado correctamente.' });
      fetchUsers();
    } else {
      setFeedback({ type: 'error', message: result.error });
    }
    setIsSavingEdit(false);
    setTimeout(() => setFeedback(null), 4000);
  }

  // Desasociar cliente
  async function handleUnassign(cliente) {
    setClientesFeedback(null);
    const res = await unassignClient(cliente.id);
    if (res.success) {
      setClientesFeedback({ type: 'success', message: `"${cliente.nombre}" quedó libre.` });
      await fetchClientesDeUsuario(expandedUserId);
    } else {
      setClientesFeedback({ type: 'error', message: res.error });
    }
  }

  // Asociar cliente libre
  async function handleAssign(cliente) {
    setClientesFeedback(null);
    const res = await assignClientToSeller(cliente.id, expandedUserId);
    if (res.success) {
      setClientesFeedback({ type: 'success', message: `"${cliente.nombre}" asignado correctamente.` });
      setShowClientePicker(false);
      setClienteSearch('');
      await fetchClientesDeUsuario(expandedUserId);
    } else {
      setClientesFeedback({ type: 'error', message: res.error });
    }
  }

  // Cambiar contraseña
  async function handleChangePassword(e) {
    e.preventDefault();
    setPwdFeedback(null);
    if (pwdForm.nueva !== pwdForm.confirmar) {
      setPwdFeedback({ type: 'error', message: 'Las contraseñas no coinciden.' });
      return;
    }
    setIsSavingPwd(true);
    const res = await changeUserPassword(expandedUserId, pwdForm.nueva);
    if (res.success) {
      setPwdFeedback({ type: 'success', message: 'Contraseña actualizada correctamente.' });
      setPwdForm({ nueva: '', confirmar: '' });
      setTimeout(() => setPwdFeedback(null), 4000);
    } else {
      setPwdFeedback({ type: 'error', message: res.error });
    }
    setIsSavingPwd(false);
  }

  const handleChange = (e) => setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setIsSubmitting(true);
    setFeedback(null);
    const result = await createStaffAccount(formData);
    if (result.success) {
      setFeedback({ type: 'success', message: `${formData.full_name} fue registrado exitosamente.` });
      setFormData(EMPTY_FORM);
      setShowForm(false);
      fetchUsers();
    } else {
      setFeedback({ type: 'error', message: result.error || 'Error al crear. Revisa tu SUPABASE_SERVICE_ROLE_KEY.' });
    }
    setIsSubmitting(false);
  };

  const clientesFiltrados = clientesLibres.filter(c =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase())
  );

  /* ── GUARDS ── */
  if (loading) return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(15,110,86,0.15)', borderTopColor: 'var(--brand)', animation: 'spin .8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Cargando...</p>
      </div>
    </div>
  );

  if (profile?.role !== 'admin') return (
    <div style={{ padding: 24, maxWidth: 400, margin: '48px auto', textAlign: 'center' }}>
      <div className="glass-panel" style={{ padding: 32 }}>
        <div style={{ fontSize: 52, marginBottom: 12 }}>🔒</div>
        <h2 style={{ color: '#dc2626', marginBottom: 8, fontSize: 18 }}>Acceso Restringido</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>Solo los administradores pueden acceder a este módulo.</p>
      </div>
    </div>
  );

  const admins    = users.filter(u => u.role === 'admin');
  const vendedores = users.filter(u => u.role === 'vendedor');

  return (
    <div style={{ paddingBottom: 90 }}>

      {/* ══ HERO HEADER ══ */}
      <div style={{
        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 55%, #1a9b78 100%)',
        padding: '28px 20px 24px',
        borderRadius: '0 0 28px 28px',
        position: 'relative', overflow: 'hidden', marginBottom: 20,
      }}>
        <div style={{ position:'absolute', top:-50, right:-50, width:180, height:180, borderRadius:'50%', background:'rgba(255,255,255,0.05)' }} />
        <div style={{ position:'absolute', bottom:-30, left:20, width:100, height:100, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
        <div style={{ position: 'relative', zIndex: 1 }}>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:4 }}>
            <span style={{ fontSize:26 }}>⚙️</span>
            <h1 style={{ color:'white', fontSize:21, fontWeight:800, margin:0, letterSpacing:'-0.3px' }}>Configuración</h1>
          </div>
          <p style={{ color:'rgba(255,255,255,0.7)', fontSize:13, margin:0 }}>Administración central de la plataforma</p>
          {/* TABS */}
          <div style={{ 
            display:'flex', 
            background:'rgba(255,255,255,0.12)', 
            padding:5, 
            borderRadius:22, 
            gap:6, 
            marginTop:20,
            backdropFilter:'blur(10px)',
            boxShadow:'inset 0 1px 4px rgba(0,0,0,0.1)'
          }}>
            {[ 
              { id:'usuarios', label:'Personal', icon:'👥' }, 
              { id:'clientes', label:'Clientes', icon:'🏪' },
              { id:'general',  label:'Sistema',  icon:'🔧' }
            ].map(tab => (
              <button 
                key={tab.id} 
                onClick={() => setActiveTab(tab.id)}
                style={{ 
                  flex:1,
                  padding:'10px 14px', 
                  borderRadius:18, 
                  border:'none', 
                  cursor:'pointer', 
                  fontSize:13, 
                  fontWeight:800, 
                  transition:'all .3s cubic-bezier(0.16, 1, 0.3, 1)',
                  display:'flex',
                  alignItems:'center',
                  justifyContent:'center',
                  gap:6,
                  background: activeTab === tab.id ? 'white' : 'transparent',
                  color:      activeTab === tab.id ? '#0F6E56' : 'rgba(255,255,255,0.9)',
                  boxShadow:  activeTab === tab.id ? '0 6px 12px rgba(0,0,0,0.12)' : 'none',
                  transform:  activeTab === tab.id ? 'scale(1.02)' : 'scale(1)',
                }}
              >
                <span style={{ fontSize:16 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ══ CONTENT ══ */}
      <div style={{ paddingLeft:16, paddingRight:16 }}>

        {/* ─── TAB: USUARIOS ─── */}
        {activeTab === 'usuarios' && (
          <div>
            {/* Feedback global */}
            {feedback && (
              <div style={{
                padding:'14px 16px', borderRadius:14, marginBottom:16, fontSize:14, fontWeight:500,
                display:'flex', alignItems:'center', gap:10, animation:'slideDown .25s ease',
                background: feedback.type==='success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${feedback.type==='success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
                color:  feedback.type==='success' ? '#065f46' : '#991b1b',
              }}>
                <span>{feedback.type==='success' ? '✅' : '❌'}</span>
                <span style={{flex:1}}>{feedback.message}</span>
                <button onClick={() => setFeedback(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, opacity:.5 }}>×</button>
              </div>
            )}

            {/* Stats row */}
            <div style={{ display:'flex', gap:10, marginBottom:18 }}>
              {[
                { label:'Total',      value:users.length,       icon:'👥', color:'#0F6E56' },
                { label:'Vendedores', value:vendedores.length,  icon:'🤝', color:'#0F6E56' },
                { label:'Admins',     value:admins.length,      icon:'🛡️', color:'#8b5cf6' },
              ].map(s => (
                <div key={s.label} className="glass-panel" style={{ flex:1, padding:'14px 10px', textAlign:'center', borderRadius:16 }}>
                  <div style={{ fontSize:20, marginBottom:4 }}>{s.icon}</div>
                  <div style={{ fontSize:22, fontWeight:800, color:s.color, lineHeight:1 }}>{s.value}</div>
                  <div style={{ fontSize:10, color:'var(--text-muted)', fontWeight:600, marginTop:4, textTransform:'uppercase', letterSpacing:'.5px' }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* CTA crear usuario */}
            {!showForm ? (
              <button onClick={() => setShowForm(true)} className="btn-primary" style={{
                marginBottom:24, borderRadius:20, display:'flex', alignItems:'center', justifyContent:'center', gap:10, fontSize:16, height:58,
                boxShadow:'0 10px 25px rgba(15,110,86,0.2)'
              }}>
                <span style={{ fontSize:24, lineHeight:1 }}>＋</span> Registrar Nuevo Personal
              </button>
            ) : (
              <div style={{ marginBottom:32, borderRadius:28, overflow:'hidden', boxShadow:'0 12px 40px rgba(15,110,86,0.15)', border:'1px solid rgba(255,255,255,0.4)', animation:'popIn .4s ease' }}>
                <div style={{ background:'linear-gradient(135deg, #084032 0%, #0F6E56 100%)', padding:'24px 28px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <div style={{ width: 44, height: 44, borderRadius: 14, background: 'rgba(255,255,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>👤</div>
                    <div>
                      <p style={{ color:'white', fontWeight:900, fontSize:19, margin:0, letterSpacing:'-0.4px' }}>Registrar Personal</p>
                      <p style={{ color:'rgba(255,255,255,0.75)', fontSize:12, margin:'2px 0 0', fontWeight:500 }}>Configura el acceso para un nuevo miembro</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowForm(false); setFeedback(null); }} style={{
                    width:36, height:36, borderRadius:'12px', background:'rgba(255,255,255,0.1)',
                    border:'1px solid rgba(255,255,255,0.2)', color:'white', cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s'
                  }}>×</button>
                </div>
                <form onSubmit={handleCreateUser} style={{ background:'rgba(255,255,255,0.9)', backdropFilter:'blur(20px)', padding:'32px' }}>
                  <div style={{ marginBottom: 28 }}>
                    <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1.2, marginBottom:16 }}>1. Rol en el Sistema</p>
                    <div style={{ display:'flex', gap:14 }}>
                      {Object.entries(ROLE_CONFIG).map(([role, cfg]) => {
                        const active = formData.role_type === role;
                        return (
                          <button type="button" key={role} onClick={() => setFormData(p => ({ ...p, role_type: role }))} style={{
                            flex:1, padding:'18px 12px', borderRadius:20,
                            border:`2.5px solid ${active ? cfg.color : 'rgba(0,0,0,0.03)'}`,
                            background: active ? 'white' : 'rgba(248,250,252,0.4)',
                            boxShadow: active ? `0 10px 20px ${cfg.bg}` : 'none',
                            cursor:'pointer', transition:'all .3s cubic-bezier(0.4, 0, 0.2, 1)',
                            display:'flex', flexDirection:'column', alignItems:'center', gap:8,
                            transform: active ? 'translateY(-2px)' : 'none'
                          }}>
                            <div style={{ 
                              width:44, height:44, borderRadius:14, background: cfg.bg, 
                              display:'flex', alignItems:'center', justifyContent:'center', fontSize:24,
                              transform: active ? 'scale(1.1)' : 'scale(1)', transition:'transform .3s'
                            }}>
                              {cfg.emoji}
                            </div>
                            <span style={{ fontSize:13, fontWeight:800, color: active ? cfg.color : '#94a3b8' }}>{cfg.label}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <p style={{ fontSize:11, fontWeight:800, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1.2, marginBottom:16 }}>2. Credenciales de Acceso</p>
                  <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:24 }}>
                      <div>
                        <label style={{...labelStyle, color:'#0F6E56', fontSize:12}}>Nombre Completo</label>
                        <div style={{ position:'relative' }}>
                          <input required type="text" name="full_name" value={formData.full_name} onChange={handleChange}
                            placeholder="Ej: María González" 
                            style={{ width:'100%', padding:'16px 16px 16px 48px', borderRadius:16, border:'2px solid #e2e8f0', background:'#f8fafc', fontSize:15, color:'#1e293b', outline:'none', transition:'all 0.3s', fontFamily:'system-ui, sans-serif', boxSizing:'border-box' }}
                            onFocus={e => { e.target.style.borderColor='#0F6E56'; e.target.style.background='white'; e.target.style.boxShadow='0 0 0 4px rgba(15,110,86,0.1)'; }}
                            onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; e.target.style.boxShadow='none'; }}
                          />
                          <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:20, opacity:.5, pointerEvents:'none' }}>👤</span>
                        </div>
                      </div>
                      <div>
                        <label style={{...labelStyle, color:'#0F6E56', fontSize:12}}>Correo Electrónico</label>
                        <div style={{ position:'relative' }}>
                          <input required type="email" name="email" value={formData.email} onChange={handleChange}
                            placeholder="correo@meditrack.com" 
                            style={{ width:'100%', padding:'16px 16px 16px 48px', borderRadius:16, border:'2px solid #e2e8f0', background:'#f8fafc', fontSize:15, color:'#1e293b', outline:'none', transition:'all 0.3s', fontFamily:'system-ui, sans-serif', boxSizing:'border-box' }}
                            onFocus={e => { e.target.style.borderColor='#0F6E56'; e.target.style.background='white'; e.target.style.boxShadow='0 0 0 4px rgba(15,110,86,0.1)'; }}
                            onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; e.target.style.boxShadow='none'; }}
                          />
                          <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:20, opacity:.5, pointerEvents:'none' }}>📧</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={{...labelStyle, color:'#0F6E56', fontSize:12}}>Contraseña de Acceso</label>
                      <div style={{ position:'relative' }}>
                        <input required type={showPassword ? 'text' : 'password'} name="password" minLength={6}
                          value={formData.password} onChange={handleChange}
                          placeholder="Mínimo 6 caracteres"
                          style={{ width:'100%', padding:'16px 56px 16px 48px', borderRadius:16, border:'2px solid #e2e8f0', background:'#f8fafc', fontSize:15, color:'#1e293b', outline:'none', transition:'all 0.3s', fontFamily:'system-ui, sans-serif', boxSizing:'border-box' }}
                          onFocus={e => { e.target.style.borderColor='#0F6E56'; e.target.style.background='white'; e.target.style.boxShadow='0 0 0 4px rgba(15,110,86,0.1)'; }}
                          onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; e.target.style.boxShadow='none'; }}
                        />
                        <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:20, opacity:.5, pointerEvents:'none' }}>🔐</span>
                        <button type="button" onClick={() => setShowPassword(p => !p)} style={{
                          position:'absolute', right:12, top:'50%', transform:'translateY(-50%)',
                          background:'rgba(15,110,86,0.08)', borderRadius:'10px', width:36, height:36, border:'none', cursor:'pointer', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center', transition:'all 0.2s'
                        }} onMouseOver={e=>e.currentTarget.style.background='rgba(15,110,86,0.15)'} onMouseOut={e=>e.currentTarget.style.background='rgba(15,110,86,0.08)'}>
                          {showPassword ? '🙈' : '👁️'}
                        </button>
                      </div>
                    </div>

                    <button type="submit" disabled={isSubmitting} style={{
                      width:'100%', borderRadius:16, height:64, fontSize:16, fontWeight:800, marginTop:8,
                      display:'flex', alignItems:'center', justifyContent:'center', gap:12,
                      boxShadow:'0 8px 20px rgba(15,110,86,0.2)',
                      background: 'linear-gradient(135deg, #084032 0%, #0F6E56 100%)',
                      color:'white', border:'none', cursor:'pointer', transition:'all 0.3s',
                      fontFamily:'system-ui, sans-serif', letterSpacing:'0.3px'
                    }}
                    onMouseOver={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 12px 24px rgba(15,110,86,0.3)'; }}
                    onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 8px 20px rgba(15,110,86,0.2)'; }}
                    >
                      {isSubmitting ? (
                        <>
                          <div style={{ width:24, height:24, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.3)', borderTopColor:'white', animation:'spin .8s linear infinite' }}/>
                          Creando Cuenta...
                        </>
                      ) : (
                        <>
                          <span>Completar Registro de Personal</span>
                          <span style={{ background:'rgba(255,255,255,0.2)', padding:'4px 8px', borderRadius:8, fontSize:14 }}>➔</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* ── Lista de usuarios ── */}
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h3 style={{ fontSize:12, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'.8px', margin:0 }}>
                Personal Registrado ({users.length})
              </h3>
              <button onClick={fetchUsers} style={{
                background:'none', border:'1px solid rgba(15,110,86,0.3)', borderRadius:8,
                color:'var(--brand)', fontSize:12, padding:'4px 12px', cursor:'pointer', fontWeight:700
              }}>↺ Actualizar</button>
            </div>

            {fetching ? (
              <div style={{ textAlign:'center', padding:'32px 0' }}>
                <div style={{ width:30, height:30, borderRadius:'50%', border:'3px solid rgba(15,110,86,0.15)', borderTopColor:'var(--brand)', animation:'spin .8s linear infinite', margin:'0 auto 10px' }}/>
                <p style={{ color:'var(--text-muted)', fontSize:13 }}>Obteniendo personal...</p>
              </div>
            ) : users.length === 0 ? (
              <div className="glass-panel" style={{ textAlign:'center', padding:32, borderRadius:18 }}>
                <div style={{ fontSize:40, marginBottom:10 }}>👥</div>
                <p style={{ color:'var(--text-muted)', fontSize:14 }}>Aún no hay usuarios. Crea el primero.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {users
                  .slice((usersPagina - 1) * porPagina, usersPagina * porPagina)
                  .map((u, idx) => {
                  const cfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.vendedor;
                  const initials = (u.nombre_completo || 'NN').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
                  const isExpanded = expandedUserId === u.id;
                  return (
                    <div key={u.id} style={{
                      background:'rgba(255,255,255,0.92)', backdropFilter:'blur(12px)',
                      borderTop:`1px solid ${isExpanded ? cfg.color : cfg.border}`,
                      borderRight:`1px solid ${isExpanded ? cfg.color : cfg.border}`,
                      borderBottom:`1px solid ${isExpanded ? cfg.color : cfg.border}`,
                      borderLeft:`4px solid ${cfg.color}`,
                      borderRadius:18,
                      boxShadow: isExpanded ? `0 8px 28px ${cfg.color}22` : '0 4px 16px rgba(0,0,0,0.05)',
                      overflow:'hidden',
                      animation:`slideUp .3s ease ${idx * 0.06}s both`,
                      transition:'box-shadow 0.2s',
                    }}>
                      {/* Header de la tarjeta - clickeable */}
                      <button
                        onClick={() => toggleExpand(u)}
                        style={{
                          width:'100%', display:'flex', alignItems:'center', gap:14,
                          padding:'14px 16px', background:'none', border:'none', cursor:'pointer',
                          textAlign:'left', WebkitTapHighlightColor:'transparent',
                        }}
                      >
                        {/* Avatar */}
                        <div style={{
                          width:46, height:46, borderRadius:'50%', flexShrink:0,
                          background:`linear-gradient(135deg, ${cfg.color}, ${cfg.color}bb)`,
                          display:'flex', alignItems:'center', justifyContent:'center',
                          fontSize:15, fontWeight:800, color:'white',
                          boxShadow:`0 4px 12px ${cfg.color}44`,
                        }}>{initials}</div>

                        {/* Info */}
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontWeight:700, color:'var(--brand-dark)', fontSize:15, margin:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {u.nombre_completo || 'Sin nombre'}
                          </p>
                          <span style={{
                            display:'inline-block', marginTop:4, padding:'2px 10px', borderRadius:20,
                            fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'.5px',
                            background:cfg.bg, color:cfg.color
                          }}>{cfg.emoji} {cfg.label}</span>
                        </div>

                        {/* Derecha */}
                        <div style={{ display:'flex', alignItems:'center', flexShrink:0, gap:12 }}>
                          <span style={{
                            fontSize:18, color: isExpanded ? cfg.color : 'var(--text-muted)',
                            transition:'transform 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
                            display:'block',
                            background: isExpanded ? cfg.bg : 'rgba(0,0,0,0.03)',
                            width:32, height:32, borderRadius:'50%',
                            display:'flex', alignItems:'center', justifyContent:'center'
                          }}>▾</span>
                        </div>
                      </button>

                      {/* ── PANEL EXPANDIDO ── */}
                      {isExpanded && (
                        <div style={{ borderTop:`1px solid ${cfg.border}`, background:'rgba(249,250,251,0.8)' }}>

                          {/* ── Edición de perfil ── */}
                          <div style={{ padding:'16px 16px 0' }}>
                            <p style={{ fontSize:11, fontWeight:700, color:cfg.color, textTransform:'uppercase', letterSpacing:'.6px', marginBottom:12 }}>
                              ✏️ Editar Perfil
                            </p>
                            <form onSubmit={handleSaveEdit} style={{ display:'flex', flexDirection:'column', gap:10 }}>
                              <div>
                                <label style={labelStyle}>👤 Nombre Completo</label>
                                <input className="input-glass" value={editForm.nombre_completo}
                                  onChange={e => setEditForm(p => ({ ...p, nombre_completo: e.target.value }))}
                                  placeholder="Nombre completo" required
                                  style={{ fontSize:14, padding:'10px 12px' }} />
                              </div>
                              <div>
                                <label style={labelStyle}>🎭 Rol</label>
                                <select className="input-glass" value={editForm.role}
                                  onChange={e => setEditForm(p => ({ ...p, role: e.target.value }))}
                                  style={{ fontSize:14, padding:'10px 12px' }}>
                                  {Object.entries(ROLE_CONFIG).map(([r, c]) => (
                                    <option key={r} value={r}>{c.emoji} {c.label}</option>
                                  ))}
                                </select>
                              </div>
                              {/* Se eliminaron los campos de meta y comisión por solicitud del usuario */}
                              <button type="submit" disabled={isSavingEdit} style={{
                                padding:'10px 18px', borderRadius:12, border:'none', cursor:'pointer',
                                background: cfg.color, color:'white', fontSize:13, fontWeight:700,
                                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                                opacity: isSavingEdit ? 0.7 : 1,
                              }}>
                                {isSavingEdit ? (
                                  <><div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', animation:'spin .7s linear infinite' }}/> Guardando...</>
                                ) : '💾 Guardar Cambios'}
                              </button>
                            </form>
                          </div>

                          {/* ── Cambiar Contraseña (acordeOn) ── */}
                          <div style={{ padding:'0 16px 16px' }}>
                            <button
                              type="button"
                              onClick={() => setShowPwdSection(p => !p)}
                              style={{
                                width:'100%', display:'flex', alignItems:'center', justifyContent:'space-between',
                                background:'rgba(220,38,38,0.06)', border:'1px solid rgba(220,38,38,0.2)',
                                borderRadius:10, padding:'10px 14px', cursor:'pointer', marginTop:4,
                              }}
                            >
                              <span style={{ fontSize:12, fontWeight:700, color:'#dc2626', textTransform:'uppercase', letterSpacing:'.6px' }}>
                                🔑 Cambiar Contraseña
                              </span>
                              <span style={{ fontSize:14, color:'#dc2626', transform: showPwdSection ? 'rotate(180deg)' : 'none', transition:'transform 0.2s' }}>▾</span>
                            </button>

                            {showPwdSection && (
                              <div style={{ marginTop:10, display:'flex', flexDirection:'column', gap:10, animation:'slideDown .2s ease' }}>
                                {pwdFeedback && (
                                  <div style={{
                                    padding:'10px 14px', borderRadius:10, fontSize:13, fontWeight:500,
                                    display:'flex', alignItems:'center', gap:8,
                                    background: pwdFeedback.type==='success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                                    border: `1px solid ${pwdFeedback.type==='success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
                                    color: pwdFeedback.type==='success' ? '#065f46' : '#991b1b',
                                  }}>
                                    {pwdFeedback.type==='success' ? '✅' : '❌'} {pwdFeedback.message}
                                  </div>
                                )}

                                <form onSubmit={handleChangePassword} style={{ display:'flex', flexDirection:'column', gap:10 }}>
                                  <div style={{ position:'relative' }}>
                                    <label style={labelStyle}>🔒 Nueva Contraseña</label>
                                    <input
                                      type={showPwd ? 'text' : 'password'}
                                      minLength={6} required
                                      value={pwdForm.nueva}
                                      onChange={e => setPwdForm(p => ({ ...p, nueva: e.target.value }))}
                                      className="input-glass"
                                      placeholder="Mínimo 6 caracteres"
                                      style={{ fontSize:14, padding:'10px 44px 10px 12px' }}
                                    />
                                    <button type="button" onClick={() => setShowPwd(p => !p)} style={{
                                      position:'absolute', right:12, bottom:11, background:'none', border:'none',
                                      cursor:'pointer', fontSize:16, opacity:.5, lineHeight:1
                                    }}>{showPwd ? '🙈' : '👁️'}</button>
                                  </div>
                                  <div>
                                    <label style={labelStyle}>🔒 Confirmar Contraseña</label>
                                    <input
                                      type={showPwd ? 'text' : 'password'}
                                      minLength={6} required
                                      value={pwdForm.confirmar}
                                      onChange={e => setPwdForm(p => ({ ...p, confirmar: e.target.value }))}
                                      className="input-glass"
                                      placeholder="Repite la nueva contraseña"
                                      style={{ fontSize:14, padding:'10px 12px' }}
                                    />
                                  </div>
                                  <button type="submit" disabled={isSavingPwd} style={{
                                    padding:'10px 18px', borderRadius:12, border:'none', cursor:'pointer',
                                    background: '#dc2626', color:'white', fontSize:13, fontWeight:700,
                                    display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                                    opacity: isSavingPwd ? 0.7 : 1,
                                  }}>
                                    {isSavingPwd ? (
                                      <><div style={{ width:14, height:14, borderRadius:'50%', border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'white', animation:'spin .7s linear infinite' }}/> Actualizando...</>
                                    ) : '🔑 Actualizar Contraseña'}
                                  </button>
                                </form>
                              </div>
                            )}
                          </div>

                          {/* ── Gestión de Clientes (solo para vendedores) ── */}
                          {u.role === 'vendedor' && (
                            <div style={{ padding:'16px' }}>
                              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                                <p style={{ fontSize:11, fontWeight:700, color:cfg.color, textTransform:'uppercase', letterSpacing:'.6px', margin:0 }}>
                                  🏪 Clientes Asignados ({userClientes.length})
                                </p>
                              </div>

                              {/* Feedback de clientes */}
                              {clientesFeedback && (
                                <div style={{
                                  padding:'10px 14px', borderRadius:10, marginBottom:10, fontSize:13, fontWeight:500,
                                  display:'flex', alignItems:'center', gap:8,
                                  background: clientesFeedback.type==='success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                                  border: `1px solid ${clientesFeedback.type==='success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
                                  color:  clientesFeedback.type==='success' ? '#065f46' : '#991b1b',
                                }}>
                                  {clientesFeedback.type==='success' ? '✅' : '❌'} {clientesFeedback.message}
                                </div>
                              )}

                              {loadingClientes ? (
                                <div style={{ textAlign:'center', padding:16 }}>
                                  <div style={{ width:22, height:22, borderRadius:'50%', border:'2.5px solid rgba(15,110,86,0.15)', borderTopColor:cfg.color, animation:'spin .7s linear infinite', margin:'0 auto' }}/>
                                </div>
                              ) : (
                                <>
                                  {/* Lista de clientes actuales */}
                                  {userClientes.length === 0 ? (
                                    <div style={{ textAlign:'center', padding:'16px 0', color:'var(--text-muted)', fontSize:13 }}>
                                      📭 Sin clientes asignados
                                    </div>
                                  ) : (
                                    <div style={{ display:'flex', flexDirection:'column', gap:6, marginBottom:10 }}>
                                      {userClientes.map(c => (
                                        <div key={c.id} style={{
                                          display:'flex', alignItems:'center', gap:10,
                                          background:'white', borderRadius:10,
                                          border:'1px solid rgba(15,110,86,0.12)',
                                          padding:'10px 12px',
                                        }}>
                                          <span style={{ fontSize:18 }}>🏪</span>
                                          <div style={{ flex:1, minWidth:0 }}>
                                            <p style={{ margin:0, fontWeight:600, fontSize:14, color:'var(--brand-dark)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                              {c.nombre}
                                            </p>
                                            {c.ciudad && <p style={{ margin:0, fontSize:11, color:'var(--text-muted)' }}>📍 {c.ciudad}</p>}
                                          </div>
                                          <button
                                            onClick={() => handleUnassign(c)}
                                            title={`Liberar a ${c.nombre}`}
                                            style={{
                                              width:32, height:32, borderRadius:8, border:'1px solid rgba(220,38,38,0.3)',
                                              background:'rgba(220,38,38,0.06)', color:'#dc2626',
                                              cursor:'pointer', fontSize:16, flexShrink:0,
                                              display:'flex', alignItems:'center', justifyContent:'center',
                                            }}
                                          >🗑️</button>
                                        </div>
                                      ))}
                                    </div>
                                  )}

                                  {/* Botón y picker para asociar cliente libre */}
                                  <div ref={pickerRef} style={{ position:'relative' }}>
                                    <button
                                      onClick={() => { setShowClientePicker(p => !p); setClienteSearch(''); }}
                                      style={{
                                        width:'100%', padding:'10px 14px', borderRadius:12,
                                        border:`2px dashed ${cfg.color}88`,
                                        background:'transparent', color:cfg.color,
                                        cursor:'pointer', fontWeight:700, fontSize:13,
                                        display:'flex', alignItems:'center', justifyContent:'center', gap:6,
                                        transition:'background 0.2s',
                                      }}
                                    >
                                      ＋ Asociar Cliente Disponible
                                    </button>

                                    {showClientePicker && (
                                      <div style={{
                                        position:'absolute', bottom:'calc(100% + 8px)', left:0, right:0, zIndex:100,
                                        background:'white', borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,0.15)',
                                        border:'1px solid rgba(15,110,86,0.2)',
                                        overflow:'hidden', animation:'slideDown .2s ease',
                                      }}>
                                        {/* Buscador */}
                                        <div style={{ padding:'10px 12px', borderBottom:'1px solid rgba(0,0,0,0.06)' }}>
                                          <input
                                            autoFocus
                                            type="text"
                                            value={clienteSearch}
                                            onChange={e => setClienteSearch(e.target.value)}
                                            placeholder="🔍 Buscar cliente libre..."
                                            style={{
                                              width:'100%', padding:'8px 12px', borderRadius:8,
                                              border:'1px solid rgba(0,0,0,0.1)', fontSize:14,
                                              outline:'none', fontFamily:'inherit', boxSizing:'border-box',
                                            }}
                                          />
                                        </div>

                                        {/* Lista */}
                                        <div style={{ maxHeight:200, overflowY:'auto' }}>
                                          {clientesFiltrados.length === 0 ? (
                                            <div style={{ padding:'16px 14px', textAlign:'center', color:'var(--text-muted)', fontSize:13 }}>
                                              {clienteSearch ? 'Sin resultados' : '✅ No hay clientes libres disponibles'}
                                            </div>
                                          ) : clientesFiltrados.map(c => (
                                            <button
                                              key={c.id}
                                              onClick={() => handleAssign(c)}
                                              style={{
                                                width:'100%', padding:'10px 14px', background:'none', border:'none',
                                                cursor:'pointer', textAlign:'left', display:'flex', alignItems:'center', gap:10,
                                                borderBottom:'1px solid rgba(0,0,0,0.04)',
                                                transition:'background 0.15s',
                                              }}
                                              onMouseEnter={e => e.currentTarget.style.background='rgba(15,110,86,0.06)'}
                                              onMouseLeave={e => e.currentTarget.style.background='none'}
                                            >
                                              <span style={{ fontSize:18 }}>🏪</span>
                                              <div style={{ flex:1 }}>
                                                <p style={{ margin:0, fontWeight:600, fontSize:14, color:'var(--brand-dark)' }}>{c.nombre}</p>
                                                {c.ciudad && <p style={{ margin:0, fontSize:11, color:'var(--text-muted)' }}>📍 {c.ciudad}</p>}
                                              </div>
                                              <span style={{ fontSize:18, color:cfg.color }}>＋</span>
                                            </button>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Paginación Personal */}
                {users.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '16px 20px', borderRadius: 24, boxShadow: '0 8px 24px rgba(0,0,0,0.04)', marginTop: 12, gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#64748b' }}>Mostrar:</span>
                      <div style={{ background: '#f1f5f9', borderRadius: 12, position:'relative' }}>
                        <select 
                          value={porPagina} 
                          onChange={e => { setPorPagina(Number(e.target.value)); setUsersPagina(1); setClientsPagina(1); }}
                          style={{ padding: '8px 32px 8px 12px', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 900, color: '#084032', outline: 'none', appearance: 'none', cursor: 'pointer' }}
                        >
                          {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', fontSize:10 }}>▼</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button 
                        onClick={() => setUsersPagina(p => Math.max(1, p - 1))} 
                        disabled={usersPagina === 1}
                        style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: usersPagina === 1 ? '#f8fafc' : '#0F6E56', color: usersPagina === 1 ? '#cbd5e1' : 'white', fontWeight: 800, cursor: usersPagina === 1 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                      >Anterior</button>
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#084032', minWidth: 80, textAlign: 'center' }}>
                        Pág {usersPagina}
                      </span>
                      <button 
                        onClick={() => setUsersPagina(p => p + 1)} 
                        disabled={usersPagina >= Math.ceil(users.length / porPagina)}
                        style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: usersPagina >= Math.ceil(users.length / porPagina) ? '#f8fafc' : '#0F6E56', color: usersPagina >= Math.ceil(users.length / porPagina) ? '#cbd5e1' : 'white', fontWeight: 800, cursor: usersPagina >= Math.ceil(users.length / porPagina) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                      >Siguiente</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: SISTEMA ─── */}
        {/* ─── TAB: CLIENTES ─── */}
        {activeTab === 'clientes' && (
          <div>
            {/* Feedback */}
            {clientFeedback && (
              <div style={{
                padding:'14px 16px', borderRadius:14, marginBottom:16, fontSize:14, fontWeight:500,
                display:'flex', alignItems:'center', gap:10, animation:'slideDown .25s ease',
                background: clientFeedback.type==='success' ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.08)',
                border: `1px solid ${clientFeedback.type==='success' ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.25)'}`,
                color: clientFeedback.type==='success' ? '#065f46' : '#991b1b',
              }}>
                <span>{clientFeedback.type==='success' ? '✅' : '❌'}</span>
                <span style={{flex:1}}>{clientFeedback.message}</span>
                <button onClick={() => setClientFeedback(null)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, opacity:.5 }}>×</button>
              </div>
            )}

            {/* Buscador + botón crear */}
            <div style={{ display:'flex', gap:10, marginBottom:16 }}>
              <div style={{ flex:1, position:'relative' }}>
                <input
                  type="text" placeholder="Buscar cliente..."
                  value={clientSearch} onChange={(e) => { setClientSearch(e.target.value); if (!allClientes.length) fetchAllClientes(); }}
                  onFocus={() => { if (!allClientes.length) fetchAllClientes(); }}
                  className="input-glass"
                  style={{ paddingLeft:38, margin:0 }}
                />
                <span style={{ position:'absolute', left:12, top:'50%', transform:'translateY(-50%)', fontSize:16, opacity:.5 }}>🔍</span>
              </div>
              <button onClick={() => { setShowClientForm(true); setEditingClientId(null); setClientFormData({ nombre:'', telefono:'', ciudad:'', vendedor_id:'' }); }} className="btn-primary" style={{
                borderRadius:14, padding:'0 18px', fontSize:14, fontWeight:700, whiteSpace:'nowrap', display:'flex', alignItems:'center', gap:6,
              }}>
                <span style={{ fontSize:18, lineHeight:1 }}>＋</span> Nuevo
              </button>
            </div>

            {/* Form crear/editar cliente */}
            {showClientForm && (
              <div style={{ marginBottom:32, borderRadius:24, overflow:'hidden', boxShadow:'0 20px 40px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.05)', background:'white', animation:'popIn .4s cubic-bezier(0.16, 1, 0.3, 1)', border:'1px solid rgba(15,110,86,0.1)' }}>
                <div style={{ background:'linear-gradient(135deg, #084032 0%, #0F6E56 100%)', padding:'28px 32px', display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative', overflow:'hidden' }}>
                  <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, position:'relative', zIndex:1 }}>
                    <div style={{ width: 48, height: 48, borderRadius: 16, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, boxShadow:'0 4px 12px rgba(0,0,0,0.1)' }}>🏪</div>
                    <div>
                      <h2 style={{ color:'white', fontWeight:800, fontSize:22, margin:0, letterSpacing:'-0.5px' }}>
                        {editingClientId ? 'Editar Cliente' : 'Nuevo Punto de Venta'}
                      </h2>
                      <p style={{ color:'rgba(255,255,255,0.8)', fontSize:13, margin:'4px 0 0', fontWeight:500 }}>
                        {editingClientId ? 'Modifica la información del cliente' : 'Registra un nuevo establecimiento en el sistema'}
                      </p>
                    </div>
                  </div>
                  <button onClick={() => { setShowClientForm(false); setEditingClientId(null); }} style={{
                    width:36, height:36, borderRadius:'12px', background:'rgba(255,255,255,0.15)',
                    border:'none', color:'white', cursor:'pointer', fontSize:20, display:'flex', alignItems:'center', justifyContent:'center', transition:'all .2s', position:'relative', zIndex:1
                  }} onMouseOver={e => e.currentTarget.style.background='rgba(255,255,255,0.25)'} onMouseOut={e => e.currentTarget.style.background='rgba(255,255,255,0.15)'}>×</button>
                </div>
                <form onSubmit={handleSaveClient} style={{ padding:'32px' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:24 }}>
                    <div>
                      <label style={{...labelStyle, color:'#0F6E56', fontSize:12}}>Nombre del Establecimiento</label>
                      <div style={{ position:'relative' }}>
                        <input required type="text" value={clientFormData.nombre}
                          onChange={(e) => setClientFormData(p => ({...p, nombre: e.target.value}))}
                          placeholder="Ej: Farmacia Central" 
                          style={{ width:'100%', padding:'16px 16px 16px 48px', borderRadius:16, border:'2px solid #e2e8f0', background:'#f8fafc', fontSize:15, color:'#1e293b', outline:'none', transition:'all 0.3s', fontFamily:'system-ui, sans-serif', boxSizing:'border-box' }}
                          onFocus={e => { e.target.style.borderColor='#0F6E56'; e.target.style.background='white'; e.target.style.boxShadow='0 0 0 4px rgba(15,110,86,0.1)'; }}
                          onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; e.target.style.boxShadow='none'; }}
                        />
                        <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:20, opacity:.5, pointerEvents:'none' }}>🏪</span>
                      </div>
                    </div>

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:24 }}>
                      <div>
                        <label style={{...labelStyle, color:'#0F6E56', fontSize:12}}>Teléfono de Contacto</label>
                        <div style={{ position:'relative' }}>
                          <input type="text" value={clientFormData.telefono}
                            onChange={(e) => setClientFormData(p => ({...p, telefono: e.target.value}))}
                            placeholder="Ej: 300 123 4567" 
                            style={{ width:'100%', padding:'16px 16px 16px 48px', borderRadius:16, border:'2px solid #e2e8f0', background:'#f8fafc', fontSize:15, color:'#1e293b', outline:'none', transition:'all 0.3s', fontFamily:'system-ui, sans-serif', boxSizing:'border-box' }}
                            onFocus={e => { e.target.style.borderColor='#0F6E56'; e.target.style.background='white'; e.target.style.boxShadow='0 0 0 4px rgba(15,110,86,0.1)'; }}
                            onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; e.target.style.boxShadow='none'; }}
                          />
                          <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:20, opacity:.5, pointerEvents:'none' }}>📞</span>
                        </div>
                      </div>
                      <div>
                        <label style={{...labelStyle, color:'#0F6E56', fontSize:12}}>Ciudad / Ubicación</label>
                        <div style={{ position:'relative' }}>
                          <input type="text" value={clientFormData.ciudad}
                            onChange={(e) => setClientFormData(p => ({...p, ciudad: e.target.value}))}
                            placeholder="Ej: Bogotá" 
                            style={{ width:'100%', padding:'16px 16px 16px 48px', borderRadius:16, border:'2px solid #e2e8f0', background:'#f8fafc', fontSize:15, color:'#1e293b', outline:'none', transition:'all 0.3s', fontFamily:'system-ui, sans-serif', boxSizing:'border-box' }}
                            onFocus={e => { e.target.style.borderColor='#0F6E56'; e.target.style.background='white'; e.target.style.boxShadow='0 0 0 4px rgba(15,110,86,0.1)'; }}
                            onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; e.target.style.boxShadow='none'; }}
                          />
                          <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:20, opacity:.5, pointerEvents:'none' }}>📍</span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <label style={{...labelStyle, color:'#0F6E56', fontSize:12}}>Asignar a Vendedor</label>
                      <div style={{ position:'relative' }}>
                        <select value={clientFormData.vendedor_id}
                          onChange={(e) => setClientFormData(p => ({...p, vendedor_id: e.target.value}))}
                          style={{ width:'100%', padding:'16px 48px', borderRadius:16, border:'2px solid #e2e8f0', background:'#f8fafc', fontSize:15, color:'#1e293b', outline:'none', transition:'all 0.3s', fontFamily:'system-ui, sans-serif', appearance:'none', cursor:'pointer', boxSizing:'border-box' }}
                          onFocus={e => { e.target.style.borderColor='#0F6E56'; e.target.style.background='white'; e.target.style.boxShadow='0 0 0 4px rgba(15,110,86,0.1)'; }}
                          onBlur={e => { e.target.style.borderColor='#e2e8f0'; e.target.style.background='#f8fafc'; e.target.style.boxShadow='none'; }}
                        >
                          <option value="" style={{ color:'#64748b' }}>👤 Dejar como Punto Libre</option>
                          {vendedoresList.map(v => (
                            <option key={v.id} value={v.id}>{v.nombre_completo}</option>
                          ))}
                        </select>
                        <span style={{ position:'absolute', left:18, top:'50%', transform:'translateY(-50%)', fontSize:20, opacity:.5, pointerEvents:'none' }}>🤝</span>
                        <div style={{ position:'absolute', right:20, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', fontSize:14, color:'#64748b', background:'#f1f5f9', width:28, height:28, borderRadius:'50%', display:'flex', alignItems:'center', justifyContent:'center' }}>▼</div>
                      </div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      <button type="submit" disabled={isSubmittingClient} style={{ 
                        width:'100%', borderRadius:16, height:64, fontSize:16, fontWeight:800,
                        display:'flex', alignItems:'center', justifyContent:'center', gap:12,
                        boxShadow:'0 8px 20px rgba(15,110,86,0.2)',
                        background: 'linear-gradient(135deg, #084032 0%, #0F6E56 100%)',
                        color:'white', border:'none', cursor:'pointer', transition:'all 0.3s',
                        fontFamily:'system-ui, sans-serif', letterSpacing:'0.3px'
                      }}
                      onMouseOver={e => { e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow='0 12px 24px rgba(15,110,86,0.3)'; }}
                      onMouseOut={e => { e.currentTarget.style.transform='translateY(0)'; e.currentTarget.style.boxShadow='0 8px 20px rgba(15,110,86,0.2)'; }}
                      >
                        {isSubmittingClient ? (
                          <>
                            <div style={{ width:24, height:24, borderRadius:'50%', border:'3px solid rgba(255,255,255,0.3)', borderTopColor:'white', animation:'spin .8s linear infinite' }}/>
                            Procesando registro...
                          </>
                        ) : (
                          <>
                            <span>{editingClientId ? 'Guardar Cambios del Cliente' : 'Confirmar Registro del Cliente'}</span>
                            <span style={{ background:'rgba(255,255,255,0.2)', padding:'4px 8px', borderRadius:8, fontSize:14 }}>➔</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              </div>
            )}

            {/* Lista de clientes */}
            {fetchingClients ? (
              <div style={{ textAlign:'center', padding:'48px 0' }}>
                <div style={{ width:36, height:36, borderRadius:'50%', border:'3.5px solid rgba(15,110,86,0.1)', borderTopColor:'var(--brand)', animation:'spin .8s linear infinite', margin:'0 auto 16px' }} />
                <p style={{ color:'var(--text-muted)', fontSize:14, fontWeight:600 }}>Sincronizando clientes...</p>
              </div>
            ) : allClientes.length === 0 ? (
              <div style={{ textAlign:'center', padding:'60px 20px', background:'rgba(255,255,255,0.5)', borderRadius:28, border:'2px dashed rgba(0,0,0,0.05)' }}>
                <span style={{ fontSize:56, display:'block', marginBottom:16 }}>🏪</span>
                <p style={{ color:'var(--text-muted)', fontSize:16, fontWeight:600, margin:0 }}>No hay clientes registrados.</p>
                <p style={{ color:'#94a3b8', fontSize:13, marginTop:6 }}>Agrega tu primer cliente con el botón 'Nuevo' arriba.</p>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {allClientes
                  .filter(c => c.nombre.toLowerCase().includes(clientSearch.toLowerCase()))
                  .slice((clientsPagina - 1) * porPagina, clientsPagina * porPagina)
                  .map((c, idx) => (
                  <div key={c.id} style={{
                    background:'rgba(255,255,255,0.95)', backdropFilter:'blur(16px)', 
                    borderRadius:24, padding:'18px 20px',
                    border:'1px solid rgba(255,255,255,0.5)', 
                    boxShadow:'0 6px 20px rgba(0,0,0,0.04)',
                    display:'flex', alignItems:'center', gap:18,
                    animation:`slideUp .4s ease ${idx * 0.05}s both`,
                    transition:'transform 0.2s, box-shadow 0.2s',
                  }}>
                    <div style={{ 
                      width:52, height:52, borderRadius:18, 
                      background:'linear-gradient(135deg, #084032, #0F6E56)', 
                      display:'flex', alignItems:'center', justifyContent:'center', 
                      fontSize:26, flexShrink:0, color:'white',
                      boxShadow:'0 6px 14px rgba(15,110,86,0.2)'
                    }}>
                      🏪
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <p style={{ margin:0, fontSize:17, fontWeight:900, color:'#084032', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', letterSpacing:'-0.3px' }}>
                        {c.nombre}
                      </p>
                      <div style={{ display:'flex', alignItems:'center', gap:10, marginTop:6, flexWrap:'wrap' }}>
                        <span style={{ fontSize:12, color:'#64748b', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                          📍 {c.ciudad || 'No definida'}
                        </span>
                        <span style={{ fontSize:12, color:'#cbd5e1' }}>•</span>
                        <span style={{ fontSize:12, color:'#64748b', fontWeight:600, display:'flex', alignItems:'center', gap:4 }}>
                          📞 {c.telefono || 'Sin tel.'}
                        </span>
                        {c.profiles?.nombre_completo && (
                          <>
                            <span style={{ fontSize:12, color:'#cbd5e1' }}>•</span>
                            <span style={{ 
                              fontSize:11, fontWeight:900, padding:'3px 12px', borderRadius:100,
                              background:'rgba(15,110,86,0.08)', color:'var(--brand)', textTransform:'uppercase', letterSpacing:'0.5px'
                            }}>
                              👤 {c.profiles.nombre_completo}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:10, flexShrink:0 }}>
                      <button onClick={() => startEditClient(c)} style={{
                        width:42, height:42, borderRadius:14, background:'rgba(15,110,86,0.05)',
                        border:'1px solid rgba(15,110,86,0.1)', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center',
                        transition:'all .2s',
                      }} onMouseOver={e => { e.currentTarget.style.background='rgba(15,110,86,0.1)'; e.currentTarget.style.transform='scale(1.05)'; }} onMouseOut={e => { e.currentTarget.style.background='rgba(15,110,86,0.05)'; e.currentTarget.style.transform='scale(1)'; }} title="Editar">✏️</button>
                      <button onClick={() => handleDeleteClient(c)} style={{
                        width:42, height:42, borderRadius:14, background:'rgba(239,68,68,0.05)',
                        border:'1px solid rgba(239,68,68,0.1)', cursor:'pointer', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center',
                        transition:'all .2s',
                      }} onMouseOver={e => { e.currentTarget.style.background='rgba(239,68,68,0.1)'; e.currentTarget.style.transform='scale(1.05)'; }} onMouseOut={e => { e.currentTarget.style.background='rgba(239,68,68,0.05)'; e.currentTarget.style.transform='scale(1)'; }} title="Eliminar">🗑️</button>
                    </div>
                  </div>
                ))}

                {/* Paginación Clientes */}
                {allClientes.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '16px 20px', borderRadius: 24, boxShadow: '0 8px 24px rgba(0,0,0,0.04)', marginTop: 12, gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#64748b' }}>Mostrar:</span>
                      <div style={{ background: '#f1f5f9', borderRadius: 12, position:'relative' }}>
                        <select 
                          value={porPagina} 
                          onChange={e => { setPorPagina(Number(e.target.value)); setClientsPagina(1); }}
                          style={{ padding: '8px 32px 8px 12px', border: 'none', background: 'transparent', fontSize: 14, fontWeight: 900, color: '#084032', outline: 'none', appearance: 'none', cursor: 'pointer' }}
                        >
                          {[10, 20, 30, 50].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                        <div style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', pointerEvents:'none', fontSize:10 }}>▼</div>
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button 
                        onClick={() => setClientsPagina(p => Math.max(1, p - 1))} 
                        disabled={clientsPagina === 1}
                        style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: clientsPagina === 1 ? '#f8fafc' : '#0F6E56', color: clientsPagina === 1 ? '#cbd5e1' : 'white', fontWeight: 800, cursor: clientsPagina === 1 ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                      >Anterior</button>
                      <span style={{ fontSize: 14, fontWeight: 900, color: '#084032', minWidth: 80, textAlign: 'center' }}>
                        Pág {clientsPagina}
                      </span>
                      <button 
                        onClick={() => setClientsPagina(p => p + 1)} 
                        disabled={clientsPagina >= Math.ceil(allClientes.length / porPagina)}
                        style={{ padding: '10px 18px', borderRadius: 14, border: 'none', background: clientsPagina >= Math.ceil(allClientes.length / porPagina) ? '#f8fafc' : '#0F6E56', color: clientsPagina >= Math.ceil(allClientes.length / porPagina) ? '#cbd5e1' : 'white', fontWeight: 800, cursor: clientsPagina >= Math.ceil(allClientes.length / porPagina) ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
                      >Siguiente</button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── TAB: SISTEMA ─── */}
        {activeTab === 'general' && (
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            {[
              { icon:'📧', label:'Confirmación de correo', value:'Desactivada · Activación automática', ok:true },
              { icon:'🔐', label:'Seguridad RLS',          value:'Habilitada en todas las tablas',       ok:true },
              { icon:'🌐', label:'Base de datos',          value:'Supabase PostgreSQL',                  ok:true },
              { icon:'📱', label:'Modo de aplicación',     value:'PWA — Mobile First',                   ok:true },
              { icon:'🔑', label:'Service Role Key',       value:'Configurar en .env.local',             ok:false },
            ].map(item => (
              <div key={item.label} style={{
                background:'rgba(255,255,255,0.88)', backdropFilter:'blur(12px)',
                border:'1px solid rgba(255,255,255,0.4)',
                borderRadius:16, padding:'16px 18px',
                display:'flex', alignItems:'center', gap:14,
                boxShadow:'0 4px 12px rgba(0,0,0,0.04)',
              }}>
                <div style={{ width:42, height:42, borderRadius:12, background:'rgba(15,110,86,0.08)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>
                  {item.icon}
                </div>
                <div style={{ flex:1 }}>
                  <p style={{ fontWeight:700, fontSize:14, margin:0, color:'var(--brand-dark)' }}>{item.label}</p>
                  <p style={{ fontSize:12, color:'var(--text-muted)', margin:'2px 0 0' }}>{item.value}</p>
                </div>
                <div style={{
                  width:10, height:10, borderRadius:'50%',
                  background: item.ok ? '#10b981' : '#f59e0b',
                  boxShadow: item.ok ? '0 0 8px rgba(16,185,129,0.6)' : '0 0 8px rgba(245,158,11,0.6)'
                }}/>
              </div>
            ))}
            <div style={{ background:'linear-gradient(135deg, rgba(15,110,86,0.06), rgba(15,110,86,0.02))', borderRadius:16, padding:'20px', textAlign:'center', border:'1px solid rgba(15,110,86,0.1)', marginTop:4 }}>
              <p style={{ fontSize:13, color:'var(--brand)', fontWeight:600 }}>MediTrack v1.0</p>
              <p style={{ fontSize:11, color:'var(--text-muted)', marginTop:3 }}>Distribuidora de Medicamentos · Todos los derechos reservados</p>
            </div>
          </div>
        )}
      </div>

      <style jsx>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
        @keyframes slideDown { from { opacity:0; transform:translateY(-8px); } to { opacity:1; transform:translateY(0); } }
      `}</style>
    </div>
  );
}

const labelStyle = {
  display:'block', fontSize:11, fontWeight:700,
  color:'var(--text-muted)', textTransform:'uppercase',
  letterSpacing:'.7px', marginBottom:6,
};
