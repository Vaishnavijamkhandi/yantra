import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const navLink = (to: string, label: string) => {
    const isActive = pathname === to || (to !== "/" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
          isActive
            ? "bg-slate-800 text-white shadow-xs"
            : "text-slate-300 hover:bg-slate-800/60 hover:text-white"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="bg-slate-900 border-b border-slate-800 text-white sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-90 transition-opacity">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 ring-4 ring-indigo-500/20" />
            <span className="text-base font-bold tracking-tight text-white">CyberSentra</span>
          </div>
          <span className="hidden sm:inline-block text-slate-400 text-[11px] px-2 py-0.5 rounded bg-slate-800 border border-slate-700 font-medium">
            Enterprise Cyber-Risk &amp; Vulnerability Platform
          </span>
        </Link>
        <div className="flex items-center gap-1 sm:gap-1.5">
          {navLink("/", "Dashboard")}
          {navLink("/assets", "Assets")}
          {navLink("/vulnerabilities", "CVE Database")}
          {navLink("/assessment", "Assessment & Actions")}
          {navLink("/infrastructure", "Infrastructure Map")}
          {navLink("/ml", "ML Insights")}
        </div>
      </div>
    </nav>
  );
}
