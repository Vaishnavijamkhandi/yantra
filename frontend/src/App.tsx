import { BrowserRouter, Routes, Route } from "react-router-dom";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import AssetInventory from "./pages/AssetInventory";
import AssetDetail from "./pages/AssetDetail";
import Vulnerabilities from "./pages/Vulnerabilities";
import Assessment from "./pages/Assessment";

function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <Navbar />
        <main className="flex-1">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/assets" element={<AssetInventory />} />
            <Route path="/assets/:id" element={<AssetDetail />} />
            <Route path="/vulnerabilities" element={<Vulnerabilities />} />
            <Route path="/assessment" element={<Assessment />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
