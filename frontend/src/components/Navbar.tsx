import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const navLink = (to: string, label: string) => {
    const isActive = pathname === to || (to !== "/" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
          isActive
            ? "bg-[#800020] text-white shadow-xs"
            : "text-stone-700 hover:text-[#800020] hover:bg-[#ede5d8]"
        }`}
      >
        {label}
      </Link>
    );
  };

  return (
    <nav className="bg-[#f5f0e6] border-b border-[#e5ded0] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3 hover:opacity-95 transition-opacity">
          {/* Maroon Emblem */}
          <div className="w-8 h-8 rounded-lg bg-[#800020] text-white flex items-center justify-center font-bold text-sm shadow-xs">
            🛡️
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-[#800020] font-mono">
                CyberSentra
              </span>
              <span className="text-stone-400 font-mono text-xs">/</span>
              <span className="text-xs font-bold text-stone-800">
                Risk Platform
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-600" title="Active Platform Telemetry" />
            </div>
            <span className="text-[10px] text-stone-500 font-medium tracking-wide uppercase">
              Critical Infrastructure Assessment &amp; Remediation
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-1 sm:gap-2">
          {navLink("/", "Dashboard")}
          {navLink("/assets", "Assets")}
          {navLink("/gaps", "Gap Analysis")}
          {navLink("/vulnerabilities", "CVE Intel")}
          {navLink("/assessment", "Assessment")}
          {navLink("/infrastructure", "Infrastructure Map")}
          {navLink("/ml", "Risk Prediction")}
        </div>
      </div>
    </nav>
  );
}
