'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });

    if (authError) {
      const errorMessages = {
        'Invalid login credentials': 'Correo o contraseña incorrectos.',
        'Email not confirmed': 'El correo no ha sido confirmado.',
        'Too many requests': 'Demasiados intentos. Espera un momento.',
      };
      setError(errorMessages[authError.message] || 'Error al iniciar sesión. Intenta de nuevo.');
      setLoading(false);
    } else {
      // Guardar marca de inicio de sesión para controlar la expiración (12h)
      sessionStorage.setItem('meditrack_session_start', Date.now().toString());
      router.push('/');
    }
  };

  return (
    <div style={{
      minHeight: '100dvh',
      display: 'flex',
      flexDirection: 'column',
      background: '#FAFAFA',
      position: 'relative',
      overflow: 'hidden'
    }}>
      {/* Decorative Orbs inside background */}
      <div style={{ position: 'absolute', top: '-10%', left: '-10%', width: '60vw', height: '60vw', background: 'radial-gradient(circle, rgba(15,110,86,0.15) 0%, rgba(15,110,86,0) 70%)', borderRadius: '50%', filter: 'blur(40px)', zIndex: 0 }} />
      <div style={{ position: 'absolute', bottom: '-15%', right: '-10%', width: '70vw', height: '70vw', background: 'radial-gradient(circle, rgba(15,110,86,0.1) 0%, rgba(15,110,86,0) 70%)', borderRadius: '50%', filter: 'blur(50px)', zIndex: 0 }} />

      <div style={{ flex: 1, zIndex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px' }}>
        
        {/* LOGO */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 32, animation: 'slideDown 0.6s cubic-bezier(0.16, 1, 0.3, 1)' }}>
          <div style={{
            width: 80, height: 80, borderRadius: 24,
            background: 'linear-gradient(135deg, var(--brand), var(--brand-light))',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 40, boxShadow: '0 12px 32px rgba(15,110,86,0.3)',
            border: '2px solid rgba(255,255,255,0.2)'
          }}>
            💊
          </div>
        </div>

        {/* CONTAINER */}
        <div style={{
          width: '100%',
          maxWidth: 400,
          margin: '0 auto',
          background: 'rgba(255, 255, 255, 0.9)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          borderRadius: 32,
          padding: '36px 24px',
          boxShadow: '0 8px 40px rgba(0,0,0,0.06)',
          border: '1px solid rgba(255,255,255,1)',
          animation: 'slideUp 0.6s cubic-bezier(0.16, 1, 0.3, 1) 0.1s both'
        }}>
          <div style={{ textAlign: 'center', marginBottom: 32 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, color: 'var(--brand-dark)', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
              MediTrack
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, fontWeight: 500 }}>
              Ingresa tus credenciales para continuar
            </p>
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.08)',
              border: '1px solid rgba(239,68,68,0.25)',
              borderRadius: 16, padding: '12px 16px',
              marginBottom: 20, display: 'flex', alignItems: 'center', gap: 10,
              animation: 'shake 0.4s ease-in-out'
            }}>
              <span style={{ fontSize: 18 }}>⚠️</span>
              <p style={{ fontSize: 13, color: '#991b1b', margin: 0, fontWeight: 600 }}>{error}</p>
            </div>
          )}

          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            
            {/* EMAIL */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, paddingLeft: 4 }}>
                Correo Electrónico
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.8, pointerEvents: 'none' }}>📧</span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="correo@empresa.com"
                  required
                  autoComplete="email"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '16px 16px 16px 46px',
                    borderRadius: 16, border: '2px solid rgba(0,0,0,0.08)',
                    background: 'rgba(249,250,251,1)', fontSize: 15, fontWeight: 500,
                    outline: 'none', color: 'var(--brand-dark)', fontFamily: 'inherit',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--brand)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                />
              </div>
            </div>

            {/* PASSWORD */}
            <div>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 8, paddingLeft: 4 }}>
                Contraseña
              </label>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', fontSize: 18, opacity: 0.8, pointerEvents: 'none' }}>🔑</span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                  style={{
                    width: '100%', boxSizing: 'border-box', padding: '16px 46px',
                    borderRadius: 16, border: '2px solid rgba(0,0,0,0.08)',
                    background: 'rgba(249,250,251,1)', fontSize: 15, fontWeight: 500,
                    outline: 'none', color: 'var(--brand-dark)', fontFamily: 'inherit',
                    transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--brand)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.08)'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(p => !p)}
                  style={{
                    position: 'absolute', right: 16, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer', fontSize: 18,
                    opacity: 0.6, padding: 4, transition: 'opacity 0.2s'
                  }}
                >
                  {showPassword ? '🙈' : '👁️'}
                </button>
              </div>
            </div>

            {/* SUBMIT */}
            <button
              type="submit"
              className="btn-primary"
              disabled={loading}
              style={{
                marginTop: 12, height: 56, fontSize: 16, fontWeight: 800,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: loading ? 'not-allowed' : 'pointer',
              }}
            >
              {loading ? (
                <>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    border: '2.5px solid rgba(255,255,255,0.3)',
                    borderTopColor: 'white', animation: 'spin 0.8s linear infinite'
                  }} />
                  Ingresando...
                </>
              ) : (
                <>Ingresar al sistema ➔</>
              )}
            </button>
          </form>
        </div>

        <p style={{ textAlign: 'center', marginTop: 32, fontSize: 12, color: '#9ca3af', fontWeight: 600, animation: 'fadeIn 1s ease both 0.4s' }}>
          MediTrack v1.0 • Acceso Autorizado
        </p>

      </div>

      <style jsx>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes slideUp { from { transform: translateY(40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes slideDown { from { transform: translateY(-40px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-4px); }
          50% { transform: translateX(4px); }
          75% { transform: translateX(-4px); }
        }
      `}</style>
    </div>
  );
}
