'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

export default function ProductSearch({ products, value, onChange, placeholder = 'Buscar producto...' }) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState(value || '');
  const containerRef = useRef(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(value || '');
  }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.toLowerCase();
    return products
      .filter(p => !p.agotado && p.producto?.toLowerCase().includes(q))
      .slice(0, 15); // Limitado a 15 para máximo rendimiento de pintado DOM
  }, [products, search]);

  const handleSelect = (productName) => {
    setSearch(productName);
    setIsOpen(false);
    onChange(productName);
  };

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%' }}>
      <input
        type="text"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setIsOpen(true);
          onChange(e.target.value); 
        }}
        onFocus={() => setIsOpen(true)}
        placeholder={placeholder}
        style={{ width: '100%', boxSizing: 'border-box', border: '2px solid #e2e8f0', borderRadius: 12, padding: '14px', fontSize: 15, outline: 'none', transition: 'border-color 0.2s', fontFamily: 'inherit' }}
        onFocusCapture={(e) => e.target.style.borderColor = '#0F6E56'}
        onBlurCapture={(e) => e.target.style.borderColor = '#e2e8f0'}
      />
      
      {isOpen && search.trim() && filtered.length > 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', marginTop: 8, maxHeight: 260, overflowY: 'auto' }}>
          <div style={{ padding: '8px', display: 'flex', flexDirection: 'column', gap: 4 }}>
            {filtered.map(p => (
              <div
                key={p.id}
                onClick={() => handleSelect(p.producto)}
                style={{ padding: '12px 14px', borderRadius: 10, cursor: 'pointer', transition: 'background 0.2s', fontSize: 14, color: '#084032', fontWeight: 600, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                onMouseEnter={(e) => e.target.style.background = '#f1f5f9'}
                onMouseLeave={(e) => e.target.style.background = 'transparent'}
              >
                <span>{p.producto}</span>
                {p.marca && <span style={{ color: '#0d9488', fontSize: 11, fontWeight: 800, background: 'rgba(13,148,136,0.1)', padding: '2px 8px', borderRadius: 8 }}>{p.marca}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
      {isOpen && search.trim() && filtered.length === 0 && (
        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 1000, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', boxShadow: '0 20px 40px rgba(0,0,0,0.15)', marginTop: 8, padding: '20px', fontSize: 14, color: '#94a3b8', textAlign: 'center', fontWeight: 500 }}>
          No se encontró &quot;{search}&quot; o está agotado.
        </div>
      )}
    </div>
  );
}
