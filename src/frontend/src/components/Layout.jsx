import { useState, useEffect } from 'react';
import { Outlet, Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCommunity } from '../context/CommunityContext';
import { notificationService } from '../services/comunicacion';
import ChatWidget from './ChatWidget';
import WhatsAppButton from './WhatsAppButton';
import ScopeSelector from './ScopeSelector';

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const handle = () => setWidth(window.innerWidth);
    window.addEventListener('resize', handle);
    return () => window.removeEventListener('resize', handle);
  }, []);
  return width;
}

export default function Layout() {
  const { user, logout } = useAuth();
  const { complexes, selectedId, setSelectedId, fetchComplexes } = useCommunity();
  const location = useLocation();
  const width = useWindowWidth();
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [menuOpen, setMenuOpen] = useState(false);

  const isAdmin = user?.role === 'admin';
  const isMobile = width < 640;

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30000);
    return () => clearInterval(interval);
  }, [isAdmin, selectedId]);

  useEffect(() => {
    if (isAdmin) fetchComplexes();
  }, [isAdmin]);

  async function fetchCount() {
    try {
      const { data } = await notificationService.count();
      setUnreadCount(data.count);
    } catch {}
  }

  async function toggleNotifications() {
    if (!notifOpen) {
      try {
        const { data } = await notificationService.list();
        setNotifications(data);
      } catch {}
    }
    setNotifOpen(!notifOpen);
    setMenuOpen(false);
  }

  async function handleMarkRead(id) {
    await notificationService.markRead(id);
    fetchCount();
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
  }

  async function handleMarkAll() {
    await notificationService.markAllRead();
    fetchCount();
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  }

  const links = [
    { to: '/dashboard', label: 'Dashboard' },
    { to: '/expensas', label: 'Expensas' },
    { to: '/anuncios', label: 'Anuncios' },
    { to: '/tickets', label: 'Tickets' },
    ...(isAdmin ? [{ to: '/accesos', label: 'Accesos' }, { to: '/invite', label: 'Invitar' }, { to: '/estructura', label: 'Estructura' }, { to: '/audit', label: 'Historial' }] : []),
    { to: '/amenities', label: 'Amenities' },
    { to: '/documents', label: 'Documentos' },
  ];

  const linkStyle = (to) => ({
    textDecoration: 'none',
    color: '#FFFFFF',
    opacity: location.pathname === to ? 1 : 0.75,
    fontSize: isMobile ? '1rem' : '0.8rem',
    fontWeight: location.pathname === to ? 700 : 500,
    padding: isMobile ? '0.6rem 1rem' : '0.3rem 0.6rem',
    display: 'block',
    borderBottom: isMobile ? '1px solid #E9ECEF' : location.pathname === to ? '2px solid #1ABC9C' : '2px solid transparent',
    borderRadius: !isMobile ? '2px' : 0,
    transition: 'opacity 0.15s, border-color 0.15s',
  });

  return (
    <div>
      <header style={styles.header}>
        {isMobile ? (
          <>
            <button onClick={() => { setMenuOpen(!menuOpen); setNotifOpen(false); }} style={styles.hamburger}>
              {menuOpen ? '✕' : '☰'}
            </button>
            <span style={{ fontWeight: 600, fontSize: '0.9rem', flex: 1, textAlign: 'center' }}>
              {location.pathname.slice(1) || 'dashboard'}
            </span>
          </>
        ) : (
          <nav style={styles.nav}>
            {links.map((link) => (
              <Link key={link.to} to={link.to} style={linkStyle(link.to)}>
                {link.label}
              </Link>
            ))}
            {isAdmin && complexes.length > 0 && (
              <ScopeSelector
                complexes={complexes}
                selectedId={selectedId}
                onChange={setSelectedId}
              />
            )}
          </nav>
        )}

        <div style={styles.user}>
          <div style={styles.notifWrap} onClick={toggleNotifications}>
            <span style={styles.bell}>&#128276;</span>
            {unreadCount > 0 && <span style={styles.badge}>{unreadCount > 9 ? '9+' : unreadCount}</span>}
          </div>
          {!isMobile && (
            <>
              <strong>{user?.email}</strong>
              <span style={styles.roleBadge}>{user?.role}</span>
            </>
          )}
          <button onClick={logout} style={styles.logoutBtn}>Salir</button>
        </div>
      </header>

      {isMobile && menuOpen && (
        <div style={styles.mobileMenu}>
          <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #e9ecef', fontSize: '0.8rem', color: '#6c757d' }}>
            {user?.email}
          </div>
          {links.map((link) => (
            <Link key={link.to} to={link.to} style={linkStyle(link.to)} onClick={() => setMenuOpen(false)}>
              {link.label}
            </Link>
          ))}
          {isAdmin && complexes.length > 0 && (
            <div style={{ padding: '0.5rem 1rem' }}>
              <ScopeSelector
                complexes={complexes}
                selectedId={selectedId}
                onChange={(id) => { setSelectedId(id); setMenuOpen(false); }}
                variant="light"
                compact
              />
            </div>
          )}
        </div>
      )}

      {notifOpen && (
        <div style={{ ...styles.notifDropdown, right: isMobile ? '0.5rem' : '1.5rem', width: isMobile ? 'calc(100% - 1rem)' : '380px' }}>
          <div style={styles.notifHeader}>
            <strong>Notificaciones</strong>
            {unreadCount > 0 && <button onClick={handleMarkAll} style={styles.markAllBtn}>Marcar todas leídas</button>}
          </div>
          {notifications.length === 0 ? (
            <p style={styles.notifEmpty}>Sin notificaciones</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} style={{ ...styles.notifItem, opacity: n.is_read ? 0.6 : 1 }}>
                <div>
                  <strong style={styles.notifTitle}>{n.title}</strong>
                  <p style={styles.notifMsg}>{n.message}</p>
                  <small style={styles.notifDate}>{new Date(n.created_at).toLocaleString('es-AR')}</small>
                </div>
                {!n.is_read && <button onClick={() => handleMarkRead(n.id)} style={styles.notifReadBtn}>Leída</button>}
              </div>
            ))
          )}
        </div>
      )}

      <main>
        <Outlet key={selectedId} />
      </main>

      <ChatWidget />
      <WhatsAppButton />
    </div>
  );
}

const styles = {
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '0 1.2rem', height: '52px',
    background: '#0F3B5E', color: '#FFFFFF',
    position: 'relative', zIndex: 99,
    boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
  },
  hamburger: {
    background: 'none', border: 'none', fontSize: '1.4rem', cursor: 'pointer',
    padding: '0.3rem', color: '#FFFFFF', lineHeight: 1,
  },
  mobileMenu: {
    position: 'fixed', top: '52px', left: 0, right: 0, bottom: 0,
    background: '#FFFFFF', zIndex: 98, overflowY: 'auto', paddingBottom: '4rem',
  },
  nav: { display: 'flex', gap: '0.2rem', alignItems: 'center' },
  user: { display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.82rem', color: '#FFFFFF' },
  roleBadge: { padding: '0.1rem 0.5rem', background: 'rgba(255,255,255,0.15)', borderRadius: '4px', fontSize: '0.68rem', textTransform: 'uppercase', color: '#FFFFFF' },
  logoutBtn: { padding: '0.35rem 0.8rem', background: 'transparent', color: '#E74C3C', border: '1px solid #E74C3C', borderRadius: '4px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 600 },
  notifWrap: { position: 'relative', cursor: 'pointer', marginRight: '0.25rem' },
  bell: { fontSize: '1.1rem', filter: 'brightness(0) invert(1)' },
  badge: {
    position: 'absolute', top: '-6px', right: '-8px',
    background: '#E74C3C', color: '#FFFFFF', borderRadius: '50%',
    width: '18px', height: '18px', fontSize: '0.65rem', fontWeight: 700,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  notifDropdown: {
    position: 'fixed', top: '52px', maxHeight: '450px',
    background: '#FFFFFF', borderRadius: '10px', boxShadow: '0 8px 30px rgba(0,0,0,0.18)',
    overflowY: 'auto', zIndex: 100, border: '1px solid #E9ECEF',
  },
  notifHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1rem', borderBottom: '1px solid #E9ECEF' },
  markAllBtn: { background: 'none', border: 'none', color: '#0F3B5E', fontSize: '0.8rem', cursor: 'pointer', fontWeight: 600 },
  notifEmpty: { padding: '1.5rem', textAlign: 'center', color: '#6C757D' },
  notifItem: { padding: '0.75rem 1rem', borderBottom: '1px solid #E9ECEF', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' },
  notifTitle: { fontSize: '0.85rem', color: '#212529' },
  notifMsg: { fontSize: '0.8rem', color: '#6C757D', margin: '0.15rem 0' },
  notifDate: { fontSize: '0.7rem', color: '#ADB5BD' },
  notifReadBtn: { padding: '0.15rem 0.5rem', background: '#E9ECEF', border: 'none', borderRadius: '4px', fontSize: '0.7rem', cursor: 'pointer', whiteSpace: 'nowrap', color: '#212529' },
};
