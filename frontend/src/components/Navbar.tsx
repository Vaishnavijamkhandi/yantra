import { Link, useLocation, useNavigate } from "react-router-dom";
import { getStoredUser, logout } from "../services/api";

export default function Navbar() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const user = getStoredUser();

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const navLink = (to: string, label: string, icon: string) => {
    const isActive = pathname === to || (to !== "/" && pathname.startsWith(to));
    return (
      <Link
        to={to}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 ${
          isActive
            ? "bg-[#800020] text-white shadow-xs font-bold"
            : "text-stone-700 hover:text-[#800020] hover:bg-[#f5f0e6]"
        }`}
      >
        <span>{icon}</span>
        <span>{label}</span>
      </Link>
    );
  };

  return (
    <nav className="bg-white/95 backdrop-blur-md border-b border-[#e5ded0] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2.5 flex items-center justify-between">
        {/* Brand */}
        <Link to="/" className="flex items-center gap-2.5 hover:opacity-95 transition-opacity">
          <div className="w-8 h-8 rounded-lg bg-[#800020] border border-[#66001a] text-white flex items-center justify-center font-bold text-sm shadow-xs">
            🛡️
          </div>

          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-tight text-[#800020] font-mono">
                CyberSentra
              </span>
              <span className="text-stone-400 font-mono text-xs">/</span>
              <span className="text-[11px] font-bold text-stone-700 font-mono uppercase tracking-wider">
                Enterprise Command
              </span>
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" title="System Operational" />
            </div>
            <span className="text-[9px] text-stone-500 font-medium tracking-wide uppercase">
              Critical Infrastructure Cyber-Risk Prioritization
            </span>
          </div>
        </Link>

        {/* 7 Locked Navigation Sections */}
        <div className="hidden lg:flex items-center gap-1">
          {navLink("/", "Overview", "📊")}
          {navLink("/infrastructure", "Infrastructure", "🖥️")}
          {navLink("/gaps", "Gap Analysis", "🔍")}
          {navLink("/assessments", "Assessments", "⚡")}
          {navLink("/remediation", "Risk & Remediation", "🛡️")}
          {navLink("/reports", "Reports", "📑")}
          {navLink("/settings", "Settings", "⚙️")}
        </div>

        {/* User Session Profile & Logout */}
        <div className="flex items-center gap-3">
          {user && (
            <div className="hidden sm:flex items-center gap-2 bg-[#faf7f2] border border-[#d6ccbe] rounded-lg px-2.5 py-1 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#800020]" />
              <span className="text-stone-800 font-medium text-[11px] truncate max-w-[120px]">
                {user.email}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold uppercase ${
                  user.role === "admin"
                    ? "bg-[#800020]/10 text-[#800020] border border-[#800020]/20"
                    : "bg-blue-50 text-blue-700 border border-blue-200"
                }`}
              >
                {user.role}
              </span>
            </div>
          )}

          <button
            onClick={handleLogout}
            title="Sign Out"
            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-stone-600 hover:text-[#800020] hover:bg-red-50 border border-[#d6ccbe] hover:border-red-200 transition cursor-pointer"
          >
            Sign Out ⎋
          </button>
        </div>
      </div>

      {/* Mobile nav row */}
      <div className="flex lg:hidden overflow-x-auto px-4 py-1.5 border-t border-[#e5ded0] gap-1 bg-[#faf7f2]">
        {navLink("/", "Overview", "📊")}
        {navLink("/infrastructure", "Infrastructure", "🖥️")}
        {navLink("/gaps", "Gaps", "🔍")}
        {navLink("/assessments", "Assessments", "⚡")}
        {navLink("/remediation", "Remediation", "🛡️")}
        {navLink("/reports", "Reports", "📑")}
        {navLink("/settings", "Settings", "⚙️")}
      </div>
    </nav>
  );
}
