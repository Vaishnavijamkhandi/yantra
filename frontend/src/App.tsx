import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Infrastructure from "./pages/Infrastructure";
import AssetDetail from "./pages/AssetDetail";
import InfrastructureGaps from "./pages/InfrastructureGaps";
import Assessment from "./pages/Assessment";
import Remediation from "./pages/Remediation";
import Reports from "./pages/Reports";
import Settings from "./pages/Settings";
import ChatBot from "./components/ChatBot";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-[#fbf9f5] text-stone-900 flex flex-col font-sans selection:bg-[#800020] selection:text-white">
        <Routes>
          {/* Public Authentication Route */}
          <Route path="/login" element={<Login />} />

          {/* Protected Application Routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <div className="flex flex-col min-h-screen">
                  <Navbar />
                  <main className="flex-1">
                    <Routes>
                      {/* 1. Overview */}
                      <Route path="/" element={<Dashboard />} />
                      <Route path="/overview" element={<Navigate to="/" replace />} />

                      {/* 2. Infrastructure (Inventory, CSV Validation, Topology) */}
                      <Route path="/infrastructure" element={<Infrastructure />} />
                      <Route path="/assets/:id" element={<AssetDetail />} />
                      <Route path="/assets" element={<Navigate to="/infrastructure?tab=inventory" replace />} />

                      {/* 3. Gap Analysis */}
                      <Route path="/gaps" element={<InfrastructureGaps />} />

                      {/* 4. Assessments */}
                      <Route path="/assessments" element={<Assessment />} />
                      <Route path="/assessment" element={<Navigate to="/assessments" replace />} />

                      {/* 5. Risk & Remediation */}
                      <Route path="/remediation" element={<Remediation />} />

                      {/* 6. Reports */}
                      <Route path="/reports" element={<Reports />} />

                      {/* 7. Settings */}
                      <Route path="/settings" element={<Settings />} />

                      {/* Fallback */}
                      <Route path="*" element={<Navigate to="/" replace />} />
                    </Routes>
                  </main>
                  <ChatBot />
                </div>
              </ProtectedRoute>
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
