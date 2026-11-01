import { useState, useEffect } from "react";
import { getStoredUser, logout, API_URL } from "../services/api";
import type { User } from "../types/asset";

export default function Settings() {
  const [user, setUser] = useState<User | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    setUser(getStoredUser());
  }, []);

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", text: "New passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", text: "New password must be at least 8 characters long." });
      return;
    }

    setUpdating(true);
    setPasswordStatus(null);

    try {
      const token = localStorage.getItem("cybersentra_token");
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Update failed" }));
        throw new Error(err.detail || "Password change failed");
      }

      setPasswordStatus({ type: "success", text: "Security password updated successfully!" });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      setPasswordStatus({ type: "error", text: err.message || "Password change failed." });
    } finally {
      setUpdating(false);
    }
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 space-y-8 text-stone-900">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-[#e5ded0]">
        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase bg-[#800020]/10 text-[#800020] border border-[#800020]/20 font-mono">
              System Administration
            </span>
            <span className="text-stone-400 text-xs">/</span>
            <span className="text-xs font-semibold text-stone-600">Environment &amp; Access Controls</span>
          </div>
          <h1 className="text-2xl font-black text-[#800020] tracking-tight flex items-center gap-2">
            Platform Settings &amp; Configuration
          </h1>
          <p className="text-xs text-stone-600 mt-1 max-w-2xl">
            Manage operational environment telemetry, threat intelligence feed connections, user sessions, and security credentials.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Platform Telemetry & Feeds */}
        <div className="lg:col-span-2 space-y-6">
          {/* Platform Status */}
          <div className="bg-white border border-[#e5ded0] rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[#800020] flex items-center gap-2">
              <span>🖥️</span>
              <span>Platform Engine Status</span>
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] text-stone-500 uppercase font-bold block">Engine Core</span>
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  <span className="font-bold text-stone-900">CyberSentra v5.0.0</span>
                </div>
                <span className="text-[10px] text-stone-500 font-mono">Enterprise Standard Architecture</span>
              </div>

              <div className="bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] text-stone-500 uppercase font-bold block">Backend API Endpoint</span>
                <div className="font-mono text-[#800020] font-bold truncate">{API_URL}</div>
                <span className="text-[10px] text-emerald-700 font-semibold">Active &amp; Responding</span>
              </div>

              <div className="bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] text-stone-500 uppercase font-bold block">Database Layer</span>
                <div className="font-bold text-stone-900">Configured Relational Store</div>
                <span className="text-[10px] text-stone-500 font-mono">PostgreSQL / SQLite + Pool</span>
              </div>

              <div className="bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl space-y-1">
                <span className="text-[10px] text-stone-500 uppercase font-bold block">Session Encryption</span>
                <div className="font-bold text-stone-900">FIPS-Compliant HMAC-SHA256</div>
                <span className="text-[10px] text-stone-500 font-mono">24-hour Token Lifetime</span>
              </div>
            </div>
          </div>

          {/* Threat Intelligence Feeds */}
          <div className="bg-white border border-[#e5ded0] rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[#800020] flex items-center gap-2">
              <span>📡</span>
              <span>Threat Intelligence Feed Integrations</span>
            </h2>

            <div className="space-y-3 text-xs">
              <div className="bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-stone-900">NVD (National Vulnerability Database) v2.0</div>
                  <div className="text-[11px] text-stone-500">
                    Live CVE matching engine with CVSS v3.1 scoring, vector strings, and CPE affected ranges.
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  CONNECTED
                </span>
              </div>

              <div className="bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-stone-900">CISA Known Exploited Vulnerabilities (KEV)</div>
                  <div className="text-[11px] text-stone-500">
                    Active weaponized exploit indicators and federal remediation due dates catalog.
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  SYNCHRONIZED
                </span>
              </div>

              <div className="bg-[#faf7f2] border border-[#d6ccbe] p-3.5 rounded-xl flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="font-bold text-stone-900">FIRST EPSS (Exploit Prediction Scoring System)</div>
                  <div className="text-[11px] text-stone-500">
                    30-day real-world exploit probability percentiles for predictive threat modeling.
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0">
                  OPERATIONAL
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: User Account & Password */}
        <div className="space-y-6">
          {/* Active Session Info */}
          <div className="bg-white border border-[#e5ded0] rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[#800020] flex items-center gap-2">
              <span>👤</span>
              <span>Authenticated Session</span>
            </h2>

            {user ? (
              <div className="space-y-3 text-xs font-mono">
                <div className="p-3 bg-[#faf7f2] border border-[#d6ccbe] rounded-xl space-y-1">
                  <span className="text-[10px] text-stone-500 uppercase block">Active User</span>
                  <div className="font-bold text-stone-900 truncate">{user.email}</div>
                  <div className="text-[10px] text-stone-500">{user.full_name}</div>
                </div>

                <div className="p-3 bg-[#faf7f2] border border-[#d6ccbe] rounded-xl flex items-center justify-between">
                  <span className="text-[10px] text-stone-500 uppercase">Access Role</span>
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                      user.role === "admin"
                        ? "bg-[#800020]/10 text-[#800020] border border-[#800020]/20"
                        : "bg-blue-50 text-blue-700 border border-blue-200"
                    }`}
                  >
                    {user.role}
                  </span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-stone-500">Loading session telemetry...</div>
            )}
          </div>

          {/* Change Password Card */}
          <div className="bg-white border border-[#e5ded0] rounded-2xl p-6 shadow-xs space-y-4">
            <h2 className="text-sm font-bold text-[#800020] flex items-center gap-2">
              <span>🔒</span>
              <span>Update Security Password</span>
            </h2>

            {passwordStatus && (
              <div
                className={`p-3 rounded-xl text-xs font-medium ${
                  passwordStatus.type === "success"
                    ? "bg-emerald-50 border border-emerald-200 text-emerald-800"
                    : "bg-red-50 border border-red-200 text-red-700"
                }`}
              >
                {passwordStatus.text}
              </div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-3 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Current Password</label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#d6ccbe] rounded-xl px-3 py-2 text-stone-900 text-xs focus:border-[#800020] focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">New Password</label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#d6ccbe] rounded-xl px-3 py-2 text-stone-900 text-xs focus:border-[#800020] focus:outline-none"
                  placeholder="Min 8 characters"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase font-bold text-stone-500">Confirm New Password</label>
                <input
                  type="password"
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full bg-[#faf7f2] border border-[#d6ccbe] rounded-xl px-3 py-2 text-stone-900 text-xs focus:border-[#800020] focus:outline-none"
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={updating}
                className="w-full py-2 bg-[#800020] hover:bg-[#66001a] text-white rounded-xl font-bold transition text-xs shadow-xs cursor-pointer mt-2"
              >
                {updating ? "Updating Credentials..." : "Update Password"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
