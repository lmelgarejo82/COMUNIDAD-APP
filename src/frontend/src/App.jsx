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
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/expensas" element={<Expensas />} />
              <Route path="/anuncios" element={<Anuncios />} />
              <Route path="/tickets" element={<Tickets />} />
              <Route path="/invite" element={<InviteResidente />} />
              <Route path="/audit" element={<Audit />} />
              <Route path="/amenities" element={<Amenities />} />
              <Route path="/documents" element={<Documents />} />
              <Route path="/estructura" element={<HierarchyEditor />} />
              <Route path="/accesos" element={<AccessLogs />} />
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
