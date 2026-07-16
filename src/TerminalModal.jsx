import React from 'react';

export default function TerminalModal({ open, title = 'Terminal', content = '', onClose = () => {}, finished = false }) {
  if (!open) return null;
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
      <div style={{ width: '90%', maxWidth: 900, maxHeight: '80%', background: '#0b0b0b', color: '#eee', borderRadius: 8, boxShadow: '0 8px 30px rgba(0,0,0,0.6)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <strong>{title}</strong>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} disabled={!finished} style={{ background: finished ? 'var(--accent)' : '#444', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 6, cursor: finished ? 'pointer' : 'not-allowed' }}>{finished ? 'Close' : 'Waiting...'}</button>
          </div>
        </div>
        <div style={{ padding: 12, overflow: 'auto', fontFamily: 'monospace', fontSize: 13, lineHeight: 1.35, whiteSpace: 'pre-wrap', background: '#000', color: '#9fd' }}>
          {content}
        </div>
      </div>
    </div>
  );
}
