// src/components/DashboardTab.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Bot, User, Clock, BarChart3, Activity, CheckCircle2, ExternalLink,
} from "lucide-react";
import {
  BarChart, Bar, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis, CartesianGrid, AreaChart, Area,
} from "recharts";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Conversation {
  id: string;
  platform: string;
  sender_id: string;
  instagram_post_link: string | null;
  human_message: string;
  ai_response: string | null;
  status: "ai_answered" | "human_needed" | "human_replied";
  human_reply: string | null;
  response_latency_ms: number | null;
  created_at: string;
}

interface DashboardStats {
  aiAnswered: number;
  humanPending: number;
  avgLatency: string;
  recent: Conversation[];
  volumeData: { day: string; queries: number }[];
  metalPrices: { karat_label: string; price_per_gram: number; updated_at: string }[];
}

// ─── Custom Tooltip for Recharts ──────────────────────────────────────────────
function CustomTooltip({ active, payload, label }: {
  active?: boolean;
  payload?: { value: number; name: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white p-3 border border-[#EADDCD] shadow-lg rounded-xl">
      <p className="text-[10px] text-[#8A8A8A] uppercase tracking-wider mb-1">{label}</p>
      <p className="text-sm text-[#CFA052] font-bold">
        {payload[0].value} {payload[0].name === "latency" ? "sec" : "queries"}
      </p>
    </div>
  );
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({
  title, value, icon, alert = false,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  alert?: boolean;
}) {
  return (
    <div
      className={`relative p-6 md:p-8 rounded-3xl border shadow-sm overflow-hidden transition-all duration-500 hover:-translate-y-1 ${alert
          ? "bg-gradient-to-br from-white to-red-50/40 border-red-100 hover:border-red-200 hover:shadow-[0_10px_30px_rgba(217,83,79,0.1)]"
          : "bg-gradient-to-br from-white to-[#F8F7F5] border-[#EADDCD]/60 hover:border-[#CFA052]/40 hover:shadow-[0_10px_30px_rgba(212,175,55,0.08)]"
        }`}
    >
      <div className="flex justify-between items-start mb-8 relative z-10">
        <div className={`p-3 rounded-2xl border shadow-sm ${alert ? "bg-red-50 border-red-100" : "bg-white border-[#EADDCD]"}`}>
          {icon}
        </div>
        {alert && (
          <span className="text-[9px] uppercase tracking-widest text-red-600 bg-red-50 border border-red-100 px-3 py-1.5 rounded-full font-bold animate-pulse">
            Attention Needed
          </span>
        )}
      </div>
      <div className="relative z-10">
        <span className="text-4xl md:text-5xl font-serif text-[#1A1A1A]">{value}</span>
        <h4 className="text-[#8A8A8A] font-medium text-[10px] md:text-xs uppercase tracking-[0.2em] mt-3">
          {title}
        </h4>
      </div>
    </div>
  );
}

// ─── Human Reply Modal ────────────────────────────────────────────────────────
function ReplyModal({
  conversation,
  onClose,
  onSuccess,
}: {
  conversation: Conversation;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSend = async () => {
    if (!text.trim()) return;
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/human-reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_KEY ?? "",
        },
        body: JSON.stringify({
          conversation_id: conversation.id,
          reply_text: text.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to send reply");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl p-8 max-w-lg w-full shadow-2xl">
        <h3 className="font-serif text-xl text-[#1A1A1A] mb-2">Reply to Customer</h3>
        <p className="text-[#8A8A8A] text-sm mb-6 italic">"{conversation.human_message}"</p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Type your reply..."
          className="w-full border border-[#EADDCD] rounded-xl p-4 text-sm focus:outline-none focus:border-[#CFA052] resize-none mb-4"
        />
        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}
        <div className="flex gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm text-[#8A8A8A] border border-[#EADDCD] rounded-full hover:bg-[#F8F7F5] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSend}
            disabled={loading || !text.trim()}
            className="px-5 py-2 text-sm text-white bg-[#2A2A2A] rounded-full hover:bg-[#CFA052] transition-colors disabled:opacity-50"
          >
            {loading ? "Sending..." : "Send Reply"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function DashboardTab() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyTarget, setReplyTarget] = useState<Conversation | null>(null);

  const loadStats = async () => {
    try {
      const res = await fetch("/api/dashboard-stats", {
        headers: {
          "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_KEY ?? "",
        },
      });
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error("Failed to load dashboard stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    const interval = setInterval(loadStats, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-[#CFA052] border-t-transparent animate-spin" />
      </div>
    );
  }

  // Static latency chart for visual until we have enough data points
  const latencyData = [
    { time: "9 AM", latency: 1.2 },
    { time: "12 PM", latency: 1.5 },
    { time: "3 PM", latency: 0.8 },
    { time: "6 PM", latency: 1.4 },
    { time: "Now", latency: parseFloat(stats?.avgLatency ?? "1.0") || 1.0 },
  ];

  return (
    <div className="space-y-12 animate-in">

      {/* ── Metric Cards ──────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="AI Answered Questions"
          value={(stats?.aiAnswered ?? 0).toLocaleString("en-IN")}
          icon={<Bot size={22} className="text-[#CFA052]" strokeWidth={1.5} />}
        />
        <StatCard
          title="Pending Human Interactions"
          value={String(stats?.humanPending ?? 0).padStart(2, "0")}
          icon={<User size={22} className="text-[#D9534F]" strokeWidth={1.5} />}
          alert
        />
        <StatCard
          title="Average Answering Time"
          value={stats?.avgLatency ?? "—"}
          icon={<Clock size={22} className="text-[#CFA052]" strokeWidth={1.5} />}
        />
      </div>

      {/* ── Charts ────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">

        {/* Bar chart — query volume */}
        <div className="lg:col-span-2 bg-gradient-to-b from-white to-[#FDFBF7] rounded-3xl p-8 border border-[#EADDCD]/60 shadow-sm flex flex-col">
          <h3 className="text-sm uppercase tracking-[0.2em] text-[#8A8A8A] font-medium flex items-center gap-3 mb-6">
            <BarChart3 size={16} className="text-[#CFA052]" /> Query Volume
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={stats?.volumeData ?? []}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EBE1" />
                <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8A8A8A" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8A8A8A" }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "#F8F7F5", radius: 4 }} />
                <Bar dataKey="queries" radius={[4, 4, 0, 0]} maxBarSize={40}>
                  {(stats?.volumeData ?? []).map((_, i, arr) => (
                    <Cell
                      key={`cell-${i}`}
                      fill={i === arr.length - 1 ? "#D4AF37" : "#EADDCD"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Area chart — response latency */}
        <div className="lg:col-span-3 bg-gradient-to-b from-white to-[#FDFBF7] rounded-3xl p-8 border border-[#EADDCD]/60 shadow-sm flex flex-col">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm uppercase tracking-[0.2em] text-[#8A8A8A] font-medium flex items-center gap-3">
              <Activity size={16} className="text-[#CFA052]" /> Response Latency
            </h3>
            <span className="text-[10px] uppercase tracking-widest text-[#2A2A2A] border border-[#EADDCD] bg-white px-4 py-1.5 rounded-full font-medium shadow-sm">
              Real-time
            </span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={latencyData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorLatency" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#CFA052" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#CFA052" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F0EBE1" />
                <XAxis dataKey="time" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8A8A8A" }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#8A8A8A" }} />
                <Tooltip content={<CustomTooltip />} />
                <Area
                  type="monotone"
                  dataKey="latency"
                  stroke="#CFA052"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorLatency)"
                  activeDot={{ r: 6, fill: "#CFA052", stroke: "#fff", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>

      {/* ── Live Activity Feed ────────────────────────────────────────────── */}
      <div className="bg-white rounded-3xl border border-[#EADDCD]/60 shadow-[0_15px_50px_rgba(0,0,0,0.02)] p-8 md:p-12 relative overflow-hidden">

        <div className="absolute -right-10 -top-10 text-[150px] font-serif text-[#F8F7F5] font-bold pointer-events-none select-none">
          Log
        </div>

        <h3 className="text-2xl font-serif text-[#1A1A1A] flex items-center gap-4 mb-12 relative z-10">
          <span className="w-10 h-[1px] bg-[#CFA052]" />
          Live Activity Feed
        </h3>

        {(!stats?.recent || stats.recent.length === 0) ? (
          <p className="text-[#8A8A8A] text-center py-16 font-light">
            No conversations yet. Once Instagram and WhatsApp are connected, all customer messages appear here.
          </p>
        ) : (
          <div className="pl-6 md:pl-10 border-l-2 border-[#EADDCD]/50 space-y-14 relative z-10">
            {stats.recent.map((log) => (
              <div key={log.id} className="relative">
                <div className="absolute -left-[31px] md:-left-[47px] top-1 w-4 h-4 rounded-full bg-white border-[3px] border-[#CFA052] shadow-[0_0_12px_rgba(212,175,55,0.3)]" />

                <div className="flex flex-col gap-5">

                  {/* Customer query */}
                  <div className="bg-[#FBFBFA] border border-[#EADDCD] p-6 md:p-7 rounded-2xl rounded-tl-none shadow-sm hover:border-[#CFA052]/40 transition-colors">
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#2A2A2A] flex items-center justify-center shadow-md">
                          <User size={18} className="text-white" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-[#2A2A2A] uppercase tracking-wider">
                            Customer
                          </span>
                          <span className="block text-[11px] text-[#8A8A8A] mt-0.5">
                            {new Date(log.created_at).toLocaleTimeString("en-IN")} · {log.platform}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {log.instagram_post_link && (
                          <a
                            href={log.instagram_post_link}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[10px] text-[#CFA052] underline flex items-center gap-1"
                          >
                            View Post <ExternalLink size={10} />
                          </a>
                        )}
                        <span className="text-[10px] uppercase tracking-widest text-[#8A8A8A] bg-white border border-[#EADDCD] px-3 py-1.5 rounded-full font-semibold shadow-sm">
                          Query
                        </span>
                      </div>
                    </div>
                    <p className="text-[#1A1A1A] font-serif text-lg md:text-xl leading-relaxed">
                      "{log.human_message}"
                    </p>
                  </div>

                  {/* AI / Human reply */}
                  <div
                    className={`border p-6 md:p-7 rounded-2xl rounded-bl-none ml-4 md:ml-12 shadow-sm transition-colors ${log.status === "human_needed"
                        ? "border-red-200 bg-red-50/50"
                        : "border-[#CFA052]/30 bg-gradient-to-br from-white to-[#FDFBF7]"
                      }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center shadow-md ${log.status === "human_needed"
                              ? "bg-red-100"
                              : "bg-gradient-to-br from-[#D4AF37] to-[#CFA052]"
                            }`}
                        >
                          <Bot size={18} className={log.status === "human_needed" ? "text-red-500" : "text-white"} />
                        </div>
                        <span className="block text-xs font-bold text-[#CFA052] uppercase tracking-wider">
                          {log.status === "human_needed" ? "⚠️ Human Intervention Needed" : "AI Agent"}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        {log.status === "ai_answered" && (
                          <span className="text-[10px] uppercase tracking-widest text-[#10B981] bg-[#10B981]/10 border border-[#10B981]/20 px-3 py-1.5 rounded-full font-bold flex items-center gap-1.5">
                            <CheckCircle2 size={12} strokeWidth={2.5} /> Answered
                          </span>
                        )}
                        {log.status === "human_needed" && (
                          <button
                            onClick={() => setReplyTarget(log)}
                            className="text-[10px] uppercase tracking-widest text-white bg-red-500 px-3 py-1.5 rounded-full font-bold hover:bg-red-600 transition-colors"
                          >
                            Reply Now
                          </button>
                        )}
                        {log.status === "human_replied" && (
                          <span className="text-[10px] uppercase tracking-widest text-blue-600 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-full font-bold">
                            Replied by Team
                          </span>
                        )}
                      </div>
                    </div>

                    <p className="text-[#4A4A4A] font-light text-base md:text-lg leading-relaxed">
                      {log.status === "human_replied"
                        ? log.human_reply
                        : log.ai_response ?? "Awaiting reply..."}
                    </p>

                    {log.response_latency_ms && (
                      <p className="text-[11px] text-[#8A8A8A] mt-3">
                        Response time: {(log.response_latency_ms / 1000).toFixed(1)}s
                      </p>
                    )}
                  </div>

                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reply modal */}
      {replyTarget && (
        <ReplyModal
          conversation={replyTarget}
          onClose={() => setReplyTarget(null)}
          onSuccess={() => {
            setReplyTarget(null);
            loadStats();
          }}
        />
      )}

    </div>
  );
}