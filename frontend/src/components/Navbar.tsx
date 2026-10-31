import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const navLink = (to: string, label: string) => {
    const isActive = pathname === to || (to !== "/" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
          isActive
            ? "bg-blue-900 text-white shadow-sm"
            : "text-blue-100 hover:bg-blue-700 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="bg-blue-800 text-white shadow-md sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <span className="text-xl font-bold tracking-tight">🏥 YantraX</span>
          <span className="text-blue-300 text-xs px-2 py-0.5 rounded bg-blue-900/60 font-medium">
            Phase 1–4 + ML
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          {navLink("/", "Dashboard")}
          {navLink("/assets", "Assets")}
          {navLink("/vulnerabilities", "CVE Database")}
          {navLink("/assessment", "Assessment")}
          {navLink("/infrastructure", "Infrastructure Map")}
          {navLink("/ml", "ML Insights")}
        </div>
      </div>
    </nav>
  );
}
