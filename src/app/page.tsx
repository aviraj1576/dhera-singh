// src/app/page.tsx
"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, LogOut } from "lucide-react";
import DashboardTab  from "@/components/DashboardTab";
import AutomationTab from "@/components/AutomationTab";
import UpdatePriceTab from "@/components/UpdatePriceTab";
import TipsTab       from "@/components/TipsTab";
import LeadsTab      from "@/components/LeadsTab";
import StaffTab      from "@/components/StaffTab";

const BASE_TABS = ["Dashboard", "Automation", "Update price", "Leads", "tips"] as const;
type Tab = (typeof BASE_TABS)[number] | "Staff";

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>("Dashboard");
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [role, setRole] = useState<"admin" | "agent" | null>(null);
  const router = useRouter();

  useEffect(() => setMounted(true), []);

  // Only used to show/hide the Staff tab; the API enforces admin-only itself.
  useEffect(() => {
    fetch("/api/me", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((me) => { if (me?.role) setRole(me.role); })
      .catch(() => {});
  }, []);

  if (!mounted) return null;

  const tabs: readonly Tab[] = role === "admin" ? [...BASE_TABS, "Staff"] : BASE_TABS;

  async function handleSignOut() {
    setSigningOut(true);
    try {
      // Revokes the session server-side and clears the cookie.
      await fetch("/api/auth/logout", { method: "POST" });
    } finally {
      // Go to the login page even if the request failed; the proxy will
      // bounce us back here if the cookie is somehow still valid.
      router.push("/login");
      router.refresh();
    }
  }

  return (
    <div className="min-h-screen bg-[#FCFDFD] text-[#2A2A2A] font-sans relative overflow-hidden selection:bg-[#D4AF37]/20 selection:text-[#967520]">

      {/* Ambient background orbs */}
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-[#EADDCD]/30 blur-[120px] pointer-events-none" />
      <div className="absolute top-[40%] right-[-10%] w-[40%] h-[50%] rounded-full bg-[#D4AF37]/5 blur-[100px] pointer-events-none" />

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-2xl border-b border-[#EADDCD]/60">
        {/* Row 1: brand + status/sign-out. Row 2: tabs (own row so adding tabs never overflows). */}
        <div className="max-w-6xl mx-auto px-6 py-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-4">

          {/* Brand */}
          <div className="flex items-center gap-4">
            <div className="relative flex items-center justify-center w-12 h-12 rounded-full border border-[#D4AF37]/30 bg-gradient-to-br from-white to-[#FDFBF7] shadow-[0_4px_20px_rgba(212,175,55,0.15)]">
              <Sparkles className="text-[#CFA052] w-5 h-5" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col">
              <h1 className="text-2xl font-serif text-[#1A1A1A] tracking-wide">Dhera Singh</h1>
              <span className="text-[0.65rem] uppercase tracking-[0.3em] text-[#CFA052] font-semibold mt-0.5">
                Jewellers
              </span>
            </div>
          </div>

          {/* Navigation pills */}
          <div className="order-last w-full flex justify-center">
            <nav className="flex items-center max-w-full bg-[#F8F7F5] p-1.5 rounded-full border border-[#EADDCD]/60 shadow-inner overflow-x-auto custom-scrollbar">
              {tabs.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative px-6 py-2.5 text-xs uppercase tracking-[0.15em] transition-all duration-500 rounded-full whitespace-nowrap ${
                    activeTab === tab
                      ? "text-white font-medium bg-[#2A2A2A] shadow-[0_4px_15px_rgba(0,0,0,0.1)]"
                      : "text-[#8A8A8A] hover:text-[#2A2A2A] hover:bg-white/50"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </nav>
          </div>

          {/* Live indicator + sign out */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-3 px-5 py-2 rounded-full border border-[#D4AF37]/30 bg-white shadow-sm">
              <div className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#CFA052] opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#CFA052]" />
              </div>
              <span className="text-xs uppercase tracking-[0.15em] text-[#8A8A8A] font-medium">
                Agent Active
              </span>
            </div>

            <button
              onClick={handleSignOut}
              disabled={signingOut}
              aria-label="Sign out"
              className="flex items-center gap-2 px-4 py-2 rounded-full border border-[#EADDCD] bg-white text-xs uppercase tracking-[0.15em] text-[#8A8A8A] font-medium shadow-sm transition-colors hover:text-[#2A2A2A] hover:border-[#D4AF37]/50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <LogOut className="w-3.5 h-3.5" strokeWidth={1.5} />
              <span className="hidden sm:inline">{signingOut ? "Signing out…" : "Sign out"}</span>
            </button>
          </div>

        </div>
      </header>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <main className="max-w-6xl mx-auto px-6 py-12 pb-24 relative z-10">
        {activeTab === "Dashboard"    && <DashboardTab />}
        {activeTab === "Automation"   && <AutomationTab />}
        {activeTab === "Update price" && <UpdatePriceTab />}
        {activeTab === "Leads"        && <LeadsTab />}
        {activeTab === "tips"         && <TipsTab />}
        {activeTab === "Staff" && role === "admin" && <StaffTab />}
      </main>

    </div>
  );
}