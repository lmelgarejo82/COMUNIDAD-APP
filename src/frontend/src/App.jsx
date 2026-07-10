import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CommunityProvider } from './context/CommunityContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';

const Expensas = lazy(() => import('./pages/Expensas'));
const Anuncios = lazy(() => import('./pages/Anuncios'));
const Tickets = lazy(() => import('./pages/Tickets'));
const InviteResidente = lazy(() => import('./pages/InviteResidente'));
const Audit = lazy(() => import('./pages/Audit'));
const Amenities = lazy(() => import('./pages/Amenities'));
const Documents = lazy(() => import('./pages/Documents'));
const HierarchyEditor = lazy(() => import('./pages/HierarchyEditor'));
const AccessLogs = lazy(() => import('./pages/AccessLogs'));

function ModuleFallback() {
  return (
    <div style={{
      maxWidth: '1024px',
      margin: '0 auto',
      padding: '1.5rem 1.25rem',
      fontFamily: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
      color: '#6C757D',
      fontSize: '0.9rem',
    }}>
      Cargando módulo...
    </div>
  );
}

function LazyModule({ children }) {
  return <Suspense fallback={<ModuleFallback />}>{children}</Suspense>;
}

function App() {
  return (
    <AuthProvider>
      <CommunityProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route path="/dashboard" element={<ProtectedRoute roles={['admin', 'residente']}><Dashboard /></ProtectedRoute>} />
              <Route path="/expensas" element={<ProtectedRoute roles={['admin', 'residente']}><LazyModule><Expensas /></LazyModule></ProtectedRoute>} />
              <Route path="/anuncios" element={<ProtectedRoute roles={['admin', 'residente']}><LazyModule><Anuncios /></LazyModule></ProtectedRoute>} />
              <Route path="/tickets" element={<ProtectedRoute roles={['admin', 'residente']}><LazyModule><Tickets /></LazyModule></ProtectedRoute>} />
              <Route path="/invite" element={<ProtectedRoute roles={['admin']}><LazyModule><InviteResidente /></LazyModule></ProtectedRoute>} />
              <Route path="/audit" element={<ProtectedRoute roles={['admin']}><LazyModule><Audit /></LazyModule></ProtectedRoute>} />
              <Route path="/amenities" element={<ProtectedRoute roles={['admin', 'residente']}><LazyModule><Amenities /></LazyModule></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute roles={['admin', 'residente']}><LazyModule><Documents /></LazyModule></ProtectedRoute>} />
              <Route path="/estructura" element={<ProtectedRoute roles={['admin']}><LazyModule><HierarchyEditor /></LazyModule></ProtectedRoute>} />
              <Route path="/accesos" element={<ProtectedRoute roles={['admin', 'access_operator']}><LazyModule><AccessLogs /></LazyModule></ProtectedRoute>} />
              <Route path="/admin/estructura" element={<Navigate to="/estructura" replace />} />
              <Route path="/unidades" element={<Navigate to="/estructura" replace />} />
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </BrowserRouter>
      </CommunityProvider>
    </AuthProvider>
  );
}

export default App;
