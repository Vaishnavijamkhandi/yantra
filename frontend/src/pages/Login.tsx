import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { login } from "../services/api";

export default function Login() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password.trim()) {
      setError("Please provide both email and password.");
      return;
    }
    setError(null);
    setLoading(true);

    try {
      await login(email.trim(), password);
      navigate("/");
    } catch (err: any) {
      setError(err.message || "Authentication failed. Check your credentials.");
    } finally {
      setLoading(false);
    }
  }

  function handleQuickRoleSelect(role: "admin" | "analyst") {
    if (role === "admin") {
      setEmail("admin@cybersentra.io");
      setPassword("CyberSentra@Admin2026!");
    } else {
      setEmail("analyst@cybersentra.io");
      setPassword("CyberSentra@Analyst2026!");
    }
    setError(null);
  }

  return (
    <div className="min-h-screen bg-[#fbf9f5] text-stone-900 flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden">
      {/* Subtle background cybersecurity grid */}
      <div className="absolute inset-0 bg-[radial-gradient(#d6ccbe_1.5px,transparent_1.5px)] [background-size:24px_24px] opacity-40 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[300px] bg-[#800020]/5 blur-[120px] rounded-full pointer-events-none" />

      <div className="max-w-md w-full relative z-10 space-y-6">
        {/* Brand Emblem */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#800020] border border-[#66001a] shadow-md shadow-[#800020]/20 mb-2 text-white">
            <span className="text-2xl">🛡️</span>
          </div>
          <h1 className="text-3xl font-black tracking-tight text-[#800020] font-mono">
            CyberSentra
          </h1>
          <p className="text-xs uppercase font-bold tracking-widest text-stone-600 font-mono">
            Critical Infrastructure Cyber-Risk Platform
          </p>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#800020]/10 border border-[#800020]/20 text-[11px] font-mono font-bold text-[#800020]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Enterprise Production Environment Locked</span>
          </div>
        </div>

        {/* Login Card */}
        <div className="bg-white border-2 border-[#d6ccbe] rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-bold text-stone-900">Sign in to console</h2>
            <p className="text-xs text-stone-500 mt-0.5">
              Role-based authenticated access for critical infrastructure operators.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <span className="font-bold">✕</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4 text-xs">
            <div className="space-y-1.5">
              <label className="block text-[11px] font-mono uppercase font-bold text-stone-600">
                Authorized Email
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="operator@cybersentra.io"
                className="w-full bg-[#faf7f2] border border-[#d6ccbe] rounded-xl px-3.5 py-2.5 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#800020] transition"
              />
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="block text-[11px] font-mono uppercase font-bold text-stone-600">
                  Password
                </label>
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="text-[11px] text-stone-500 hover:text-[#800020] cursor-pointer"
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full bg-[#faf7f2] border border-[#d6ccbe] rounded-xl px-3.5 py-2.5 text-xs text-stone-900 placeholder-stone-400 focus:outline-none focus:border-[#800020] transition pr-10"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={`w-full py-2.5 rounded-xl font-bold text-xs text-white shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer ${
                loading
                  ? "bg-[#800020]/60 cursor-not-allowed"
                  : "bg-[#800020] hover:bg-[#66001a] active:scale-[0.99]"
              }`}
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <span>Authenticate &amp; Enter Platform →</span>
              )}
            </button>
          </form>

          {/* Quick Evaluator Role Selector */}
          <div className="pt-4 border-t border-[#e5ded0] space-y-2">
            <span className="text-[10px] font-mono uppercase font-bold text-stone-500 block text-center">
              Evaluator Quick Access Credentials
            </span>
            <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
              <button
                type="button"
                onClick={() => handleQuickRoleSelect("admin")}
                className="p-2.5 rounded-xl bg-[#faf7f2] border border-[#d6ccbe] hover:border-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold text-[#800020]">Administrator</div>
                <div className="text-[10px] text-stone-500 truncate">admin@cybersentra.io</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickRoleSelect("analyst")}
                className="p-2.5 rounded-xl bg-[#faf7f2] border border-[#d6ccbe] hover:border-[#800020] text-left transition cursor-pointer"
              >
                <div className="font-bold text-blue-700">Analyst</div>
                <div className="text-[10px] text-stone-500 truncate">analyst@cybersentra.io</div>
              </button>
            </div>
          </div>
        </div>

        {/* Security Disclaimers */}
        <div className="text-center space-y-1 text-[11px] text-stone-500">
          <div>Protected Critical Infrastructure Information (PCII)</div>
          <div>FIPS-Compliant PBKDF2 Password Verification &bull; Signed HMAC Session Bearer</div>
        </div>
      </div>
    </div>
  );
}
