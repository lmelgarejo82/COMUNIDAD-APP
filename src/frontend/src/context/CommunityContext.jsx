import { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const CommunityContext = createContext(null);

export function CommunityProvider({ children }) {
  const [complexes, setComplexes] = useState([]);
  const [selectedId, setSelectedId] = useState(() => {
    const stored = localStorage.getItem('selectedComplex');
    return stored ? parseInt(stored) : null;
  });

  async function fetchComplexes() {
    try {
      const { data } = await api.get('/hierarchy/admin/complexes');
      setComplexes(data);
      if (!selectedId && data.length > 0) {
        setSelectedId(data[0].id);
      }
    } catch {
      // Fallback legacy: try /admin/communities
      try {
        const { data } = await api.get('/admin/communities');
        const mapped = data.map(c => ({ id: c.id, name: c.name, address: c.address }));
        setComplexes(mapped);
        if (!selectedId && mapped.length > 0) {
          setSelectedId(mapped[0].id);
        }
      } catch {
        /* no communities available */
      }
    }
  }

  useEffect(() => {
    if (selectedId) {
      localStorage.setItem('selectedComplex', String(selectedId));
    }
  }, [selectedId]);

  return (
    <CommunityContext.Provider value={{ complexes, selectedId, setSelectedId, fetchComplexes }}>
      {children}
    </CommunityContext.Provider>
  );
}

export function useCommunity() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error('useCommunity must be used within CommunityProvider');
  return ctx;
}
