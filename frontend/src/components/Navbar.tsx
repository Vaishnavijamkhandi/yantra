import { Link, useLocation } from "react-router-dom";

export default function Navbar() {
  const { pathname } = useLocation();

  const navLink = (to: string, label: string) => (
    <Link
      to={to}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        pathname === to
          ? "bg-blue-700 text-white"
          : "text-blue-100 hover:bg-blue-700 hover:text-white"
      }`}
    >
      {label}
    </Link>
  );

  return (
    <nav className="bg-blue-800 text-white shadow-md">
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">🏥 YantraX</span>
          <span className="text-blue-300 text-sm hidden sm:block">
            Hospital Asset Management
          </span>
        </div>
        <div className="flex gap-2">
          {navLink("/", "Dashboard")}
          {navLink("/assets", "Assets")}
        </div>
      </div>
    </nav>
  );
}
