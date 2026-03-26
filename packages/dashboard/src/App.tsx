import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { ReportDetail } from './pages/ReportDetail';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { ViolationDetail } from './pages/ViolationDetail';
import { PageDetail } from './pages/PageDetail';
import { ViolationWindow } from './pages/ViolationWindow';
import { PageWindow } from './pages/PageWindow';
import { Login } from './pages/Login';
import { Layout } from './components/Layout';
import { CurrentReportProvider } from './context/CurrentReportContext';
import { ScanProvider } from './context/ScanContext';
import { AuthProvider, useAuth } from './context/AuthContext';

function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="m-8 text-center text-sm text-zinc-500">
        Checking sign-in status...
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AuthProvider>
        <CurrentReportProvider>
          <ScanProvider>
            <Routes>
              <Route path="/login" element={<Login />} />

              <Route
                path="/*"
                element={
                  <AuthGuard>
                    <Layout>
                      <Routes>
                        <Route path="/" element={<Dashboard />} />
                        <Route path="/projects" element={<Projects />} />
                        <Route path="/projects/:id" element={<ProjectDetail />} />
                        <Route path="/reports/:id" element={<ReportDetail />} />
                        <Route path="/reports/:id/violation/:violationId" element={<ViolationWindow />} />
                        <Route path="/reports/:id/page/:pageId" element={<PageWindow />} />
                        {/* Legacy state-based routes kept for backwards compatibility */}
                        <Route path="/violation" element={<ViolationDetail />} />
                        <Route path="/page" element={<PageDetail />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Layout>
                  </AuthGuard>
                }
              />
            </Routes>
          </ScanProvider>
        </CurrentReportProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
