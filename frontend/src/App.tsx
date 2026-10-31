import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import AssetInventory from "./pages/AssetInventory";
import AssetDetail from "./pages/AssetDetail";
import Vulnerabilities from "./pages/Vulnerabilities";
import Assessment from "./pages/Assessment";
import InfrastructureMap from "./pages/InfrastructureMap";
import MLInsights from "./pages/MLInsights";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/assets" element={<AssetInventory />} />
            <Route path="/assets/:id" element={<AssetDetail />} />
            <Route path="/vulnerabilities" element={<Vulnerabilities />} />
            <Route path="/assessment" element={<Assessment />} />
            <Route path="/infrastructure" element={<InfrastructureMap />} />
            <Route path="/ml" element={<MLInsights />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
