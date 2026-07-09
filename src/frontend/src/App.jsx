import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CommunityProvider } from './context/CommunityContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import Expensas from './pages/Expensas';
import Anuncios from './pages/Anuncios';
import Tickets from './pages/Tickets';
import InviteResidente from './pages/InviteResidente';
import Audit from './pages/Audit';
import Amenities from './pages/Amenities';
import Documents from './pages/Documents';
import HierarchyEditor from './pages/HierarchyEditor';
import AccessLogs from './pages/AccessLogs';

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
              <Route path="/expensas" element={<ProtectedRoute roles={['admin', 'residente']}><Expensas /></ProtectedRoute>} />
              <Route path="/anuncios" element={<ProtectedRoute roles={['admin', 'residente']}><Anuncios /></ProtectedRoute>} />
              <Route path="/tickets" element={<ProtectedRoute roles={['admin', 'residente']}><Tickets /></ProtectedRoute>} />
              <Route path="/invite" element={<ProtectedRoute roles={['admin']}><InviteResidente /></ProtectedRoute>} />
              <Route path="/audit" element={<ProtectedRoute roles={['admin']}><Audit /></ProtectedRoute>} />
              <Route path="/amenities" element={<ProtectedRoute roles={['admin', 'residente']}><Amenities /></ProtectedRoute>} />
              <Route path="/documents" element={<ProtectedRoute roles={['admin', 'residente']}><Documents /></ProtectedRoute>} />
              <Route path="/estructura" element={<ProtectedRoute roles={['admin']}><HierarchyEditor /></ProtectedRoute>} />
              <Route path="/accesos" element={<ProtectedRoute roles={['admin', 'access_operator']}><AccessLogs /></ProtectedRoute>} />
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
