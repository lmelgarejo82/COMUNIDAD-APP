import { useAuth } from '../context/AuthContext';
import DashboardAdmin from './DashboardAdmin';
import DashboardResidente from './DashboardResidente';

export default function Dashboard() {
  const { user } = useAuth();

  return (
    <div>
      {user.role === 'admin' ? <DashboardAdmin /> : <DashboardResidente />}
    </div>
  );
}
