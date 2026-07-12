import { HashRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Welcome from './screens/Welcome';
import Login from './screens/Login';
import Register from './screens/Register';
import Dashboard from './screens/Dashboard';
import Activity from './screens/Activity';
import Transfer from './screens/Transfer';
import Cards from './screens/Cards';
import Loans from './screens/Loans';
import Profile from './screens/Profile';
import Notifications from './screens/Notifications';
import CableTv from './screens/CableTv';

function Private({ children }) {
  const { token } = useAuth();
  return token ? children : <Navigate to="/login" replace />;
}

function Public({ children }) {
  const { token } = useAuth();
  return token ? <Navigate to="/home" replace /> : children;
}

export default function App() {
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<Public><Welcome /></Public>} />
          <Route path="/login" element={<Public><Login /></Public>} />
          <Route path="/register" element={<Public><Register /></Public>} />
          <Route path="/home" element={<Private><Dashboard /></Private>} />
          <Route path="/activity" element={<Private><Activity /></Private>} />
          <Route path="/transfer" element={<Private><Transfer /></Private>} />
          <Route path="/cards" element={<Private><Cards /></Private>} />
          <Route path="/loans" element={<Private><Loans /></Private>} />
          <Route path="/profile" element={<Private><Profile /></Private>} />
          <Route path="/notifications" element={<Private><Notifications /></Private>} />
          <Route path="/cabletv" element={<Private><CableTv /></Private>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
