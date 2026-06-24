import { useEffect, useMemo, useState } from 'react';
import Layout from './components/Layout.jsx';
import Loading from './components/Loading.jsx';
import { AuthProvider, useAuth } from './contexts/AuthContext.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import DeliveriesPage from './pages/DeliveriesPage.jsx';
import EmployeeQuickPage from './pages/EmployeeQuickPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import NotificationsPage from './pages/NotificationsPage.jsx';
import StockPage from './pages/StockPage.jsx';
import UsersPage from './pages/UsersPage.jsx';
import VehiclesPage from './pages/VehiclesPage.jsx';

export default function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

function AppShell() {
  const { user, loading, isOwner } = useAuth();
  const [page, setPage] = useState('quick');

  useEffect(() => {
    if (!user) return;
    setPage(isOwner ? 'dashboard' : 'quick');
  }, [isOwner, user?.id]);

  const pages = useMemo(() => {
    if (!isOwner) {
      return {
        quick: <EmployeeQuickPage />,
        deliveries: <DeliveriesPage />,
      };
    }
    return {
      dashboard: <DashboardPage setPage={setPage} />,
      quick: <EmployeeQuickPage />,
      deliveries: <DeliveriesPage />,
      stocks: <StockPage />,
      users: <UsersPage />,
      vehicles: <VehiclesPage />,
      notifications: <NotificationsPage />,
    };
  }, [isOwner]);

  if (loading) return <Loading />;
  if (!user) return <LoginPage />;

  const safePage = pages[page] ? page : (isOwner ? 'dashboard' : 'quick');

  return (
    <Layout page={safePage} setPage={setPage}>
      {pages[safePage]}
    </Layout>
  );
}
