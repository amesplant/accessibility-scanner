import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { ReportDetail } from './pages/ReportDetail';
import { Projects } from './pages/Projects';
import { ProjectDetail } from './pages/ProjectDetail';
import { ViolationDetail } from './pages/ViolationDetail';
import { PageDetail } from './pages/PageDetail';
import { ViolationWindow } from './pages/ViolationWindow';
import { PageWindow } from './pages/PageWindow';
import { Layout } from './components/Layout';
import { CurrentReportProvider } from './context/CurrentReportContext';
import { ScanProvider } from './context/ScanContext';

function App() {
  return (
    <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <CurrentReportProvider>
        <ScanProvider>
          <Layout>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/projects/:id" element={<ProjectDetail />} />
              <Route path="/reports/:id" element={<ReportDetail />} />
              <Route path="/reports/:id/violation/:violationId" element={<ViolationWindow />} />
              <Route path="/reports/:id/page/:pageId" element={<PageWindow />} />
              <Route path="/violation" element={<ViolationDetail />} />
              <Route path="/page" element={<PageDetail />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Layout>
        </ScanProvider>
      </CurrentReportProvider>
    </Router>
  );
}

export default App;
