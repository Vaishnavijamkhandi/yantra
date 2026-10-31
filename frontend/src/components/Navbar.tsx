import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const navLink = (to: string, label: string) => {
    const isActive = pathname === to || (to !== "/" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all duration-200 ${
          isActive
            ? "bg-indigo-50 text-indigo-700 shadow-xs border border-indigo-200/80"
            : "text-slate-600 hover:text-slate-900 hover:bg-slate-100/80"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="bg-white/95 border-b border-slate-200 text-slate-800 sticky top-0 z-50 backdrop-blur-md shadow-xs">
      <div className="max-w-7xl mx-auto px-6 py-2.5 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-95 transition-opacity">
          <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-500 text-white flex items-center justify-center font-black text-xs shadow-sm ring-2 ring-indigo-500/20">
            CS
          </div>
          <div className="flex flex-col">
            <span className="text-sm font-extrabold tracking-tight text-slate-900 font-sans leading-none flex items-center gap-1.5">
              <span>CyberSaathi</span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-500/20" title="System Operational" />
            </span>
            <span className="text-[10px] text-slate-400 font-medium tracking-tight mt-0.5">
              Cyber-Risk &amp; Vulnerability Platform
            </span>
          </div>
        </Link>
        <div className="flex items-center gap-1 sm:gap-1.5">
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
