import { useState, useRef, useEffect } from 'react';
import { chatService } from '../services/chat';

export default function ChatWidget() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e) {
    e?.preventDefault();
    const msg = input.trim();
    if (!msg || loading) return;

    setMessages((prev) => [...prev, { role: 'user', content: msg }]);
    setInput('');
    setLoading(true);

    try {
      const { data } = await chatService.send(msg);
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Error al comunicarse con el asistente. Intentá de nuevo.' }]);
    } finally {
      setLoading(false);
    }
  }

  function renderContent(text) {
    // Convertir URLs en links clickeables
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const parts = text.split(urlRegex);
    return parts.map((part, i) => {
      if (urlRegex.test(part)) {
        return (
          <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: '#0d6efd', wordBreak: 'break-all' }}>
            {part.length > 50 ? part.slice(0, 50) + '...' : part}
          </a>
        );
      }
      return <span key={i}>{part}</span>;
    });
  }

  return (
    <>
      {open && (
        <div style={s.panel}>
          <div style={s.header}>
            <span style={s.headerTitle}>Asistente Virtual</span>
            <button onClick={() => setOpen(false)} style={s.closeBtn}>✕</button>
          </div>
          <div style={s.body}>
            {messages.length === 0 && (
              <p style={s.hint}>
                ¡Hola! Soy tu asistente virtual. Preguntame sobre tus expensas, saldo, pagos, amenities o anuncios.
              </p>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ ...s.bubble, alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start', background: m.role === 'user' ? '#0d6efd' : '#e9ecef', color: m.role === 'user' ? '#fff' : '#2c3e50' }}>
                {renderContent(m.content)}
              </div>
            ))}
            {loading && (
              <div style={{ ...s.bubble, alignSelf: 'flex-start', background: '#e9ecef' }}>
                <span style={s.typing}>Escribiendo...</span>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
          <form onSubmit={handleSend} style={s.footer}>
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribí tu consulta..."
              style={s.input}
              disabled={loading}
            />
            <button type="submit" disabled={loading || !input.trim()} style={s.sendBtn}>Enviar</button>
          </form>
        </div>
      )}

      <button onClick={() => setOpen(!open)} style={s.fab}>
        {open ? '✕' : '💬'}
      </button>
    </>
  );
}

const s = {
  panel: {
    position: 'fixed', bottom: '80px', right: '20px', width: '360px', maxWidth: 'calc(100vw - 40px)', height: '480px', maxHeight: 'calc(100vh - 120px)',
    background: '#fff', borderRadius: '12px', boxShadow: '0 8px 30px rgba(0,0,0,0.2)', display: 'flex', flexDirection: 'column', zIndex: 200,
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', background: '#0d6efd', color: '#fff', borderRadius: '12px 12px 0 0' },
  headerTitle: { fontWeight: 600, fontSize: '0.95rem' },
  closeBtn: { background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer', lineHeight: 1 },
  body: { flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' },
  hint: { color: '#6c757d', fontSize: '0.85rem', textAlign: 'center', padding: '2rem 0' },
  bubble: { padding: '0.5rem 0.75rem', borderRadius: '12px', maxWidth: '80%', fontSize: '0.85rem', lineHeight: 1.4, wordBreak: 'break-word' },
  typing: { fontSize: '0.8rem', color: '#6c757d', fontStyle: 'italic' },
  footer: { display: 'flex', gap: '0.4rem', padding: '0.6rem', borderTop: '1px solid #e9ecef' },
  input: { flex: 1, padding: '0.5rem 0.6rem', border: '1px solid #ced4da', borderRadius: '8px', fontSize: '0.85rem', outline: 'none' },
  sendBtn: { padding: '0.5rem 0.85rem', background: '#0d6efd', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600, minHeight: '40px' },
  fab: {
    position: 'fixed', bottom: '20px', right: '20px', width: '56px', height: '56px', borderRadius: '50%',
    background: '#0d6efd', color: '#fff', border: 'none', fontSize: '1.5rem', cursor: 'pointer',
    boxShadow: '0 4px 16px rgba(13,110,253,0.35)', zIndex: 199, display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
};
