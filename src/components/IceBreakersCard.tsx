// src/components/IceBreakersCard.tsx
"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, Check, Pencil, RefreshCw, RotateCcw, Trash2, X } from "lucide-react";
import {
  DEFAULT_ICE_BREAKER_QUESTIONS,
  ICE_BREAKER_MAX_QUESTION_LENGTH,
  type IceBreakerQuestion,
} from "@/lib/webhook/ice-breakers";

// What each starter question does when a customer taps it (fixed by the payload, not editable).
const BEHAVIOUR: Record<string, string> = {
  ICE_GOLD_RATE: "Shows live 24K/22K/18K rates",
  ICE_REEL_PRICE: "Asks for the reel link",
  ICE_STORE_INFO: "Shows Patiala location & hours",
  ICE_CALLBACK: "Starts lead capture",
};

interface LiveQuestion {
  payload: string;
  question: string;
}

type Busy = "save" | "sync" | "remove" | null;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? `Request failed (${res.status})`);
  return data as T;
}

const fetchLive = () => api<{ ice_breakers?: LiveQuestion[] }>("/api/ice-breakers").then((d) => d.ice_breakers ?? []);
const fetchSaved = () => api<{ questions: IceBreakerQuestion[] }>("/api/ice-breakers/config").then((d) => d.questions);

const secondaryBtn =
  "flex items-center gap-2 px-6 py-3 rounded-full border border-[#EADDCD] bg-white text-xs uppercase tracking-[0.15em] text-[#4A4A4A] font-medium transition-all duration-300 hover:border-[#CFA052]/60 hover:text-[#2A2A2A] disabled:opacity-40 disabled:cursor-not-allowed";

export default function IceBreakersCard() {
  const [saved, setSaved] = useState<IceBreakerQuestion[]>(DEFAULT_ICE_BREAKER_QUESTIONS);
  const [live, setLive] = useState<LiveQuestion[] | null>(null); // null = not known yet
  const [liveError, setLiveError] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchSaved()
      .then((q) => { if (!cancelled) setSaved(q); })
      .catch(() => {});
    fetchLive()
      .then((l) => { if (!cancelled) setLive(l); })
      .catch(() => { if (!cancelled) setLiveError(true); });
    return () => { cancelled = true; };
  }, []);

  const isLive = !!live && live.length > 0;
  const outOfDate =
    isLive && saved.some((s) => live.find((l) => l.payload === s.payload)?.question !== s.question);

  const run = async (kind: Exclude<Busy, null>, action: () => Promise<string>) => {
    setBusy(kind);
    setNotice(null);
    try {
      setNotice({ text: await action(), error: false });
    } catch (e: unknown) {
      setNotice({ text: e instanceof Error ? e.message : "Something went wrong", error: true });
    } finally {
      setBusy(null);
    }
  };

  const startEditing = () => {
    setDraft(Object.fromEntries(saved.map((q) => [q.payload, q.question])));
    setNotice(null);
    setEditing(true);
  };

  const resetDraft = () =>
    setDraft(Object.fromEntries(DEFAULT_ICE_BREAKER_QUESTIONS.map((q) => [q.payload, q.question])));

  const handleSave = () =>
    run("save", async () => {
      const questions = saved.map((q) => ({ payload: q.payload, question: (draft[q.payload] ?? "").trim() }));
      if (questions.some((q) => !q.question)) throw new Error("Every question needs some text.");
      const data = await api<{ questions: IceBreakerQuestion[] }>("/api/ice-breakers/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ questions }),
      });
      setSaved(data.questions);
      setEditing(false);
      return isLive
        ? "Saved. Instagram still shows the old wording until you click Sync."
        : "Saved. Nothing is showing on Instagram yet. Click Sync when you want these to appear.";
    });

  const handleSync = () =>
    run("sync", async () => {
      const data = await api<{ live: LiveQuestion[] | null }>("/api/ice-breakers/sync", { method: "POST" });
      setLive(data.live ?? (await fetchLive().catch(() => null)));
      setLiveError(false);
      return "Ice breakers are live on Instagram. New chats can take a few minutes to show them.";
    });

  const handleRemove = () => {
    if (!window.confirm("Remove the ice breakers from Instagram? Your saved questions are kept and you can Sync them back any time.")) return;
    void run("remove", async () => {
      await api("/api/ice-breakers", { method: "DELETE" });
      setLive([]);
      setLiveError(false);
      return "Removed from Instagram. Your saved questions are kept; click Sync to bring them back.";
    });
  };

  const status = liveError
    ? { text: "Couldn't check Instagram", cls: "text-red-600 bg-red-50 border-red-200" }
    : live === null
      ? { text: "Checking…", cls: "text-[#8A8A8A] bg-[#F8F7F5] border-[#EADDCD]" }
      : isLive
        ? { text: "Live on Instagram", cls: "text-green-700 bg-green-50 border-green-200" }
        : { text: "Not showing on Instagram", cls: "text-[#8A8A8A] bg-[#F8F7F5] border-[#EADDCD]" };

  return (
    <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_60px_rgba(212,175,55,0.08)] transition-all duration-500 group-hover:border-[#CFA052]/40">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <label className="block text-xs uppercase tracking-[0.2em] text-[#CFA052] font-bold">Starter Questions</label>
        <span className={`text-[10px] uppercase tracking-widest border px-3 py-1 rounded-full ${status.cls}`}>
          {status.text}
        </span>
      </div>

      {/* Questions: read-only list, or one text box per question while editing */}
      <div className="space-y-4 mb-6 text-sm text-[#4A4A4A] font-light leading-relaxed">
        {saved.map((q, i) => (
          <div key={q.payload} className="flex items-start gap-3">
            <span className="mt-0.5 w-6 h-6 shrink-0 rounded-full bg-[#CFA052]/10 flex items-center justify-center text-[#CFA052] text-xs font-bold">
              {i + 1}
            </span>
            {editing ? (
              <div className="flex-1 min-w-0">
                <input
                  type="text"
                  value={draft[q.payload] ?? ""}
                  maxLength={ICE_BREAKER_MAX_QUESTION_LENGTH}
                  onChange={(e) => setDraft((d) => ({ ...d, [q.payload]: e.target.value }))}
                  aria-label={`Question ${i + 1}`}
                  className="w-full bg-[#FBFBFA] rounded-xl border border-[#EADDCD] p-3 text-sm text-[#2A2A2A] font-medium focus:outline-none focus:border-[#CFA052] focus:shadow-[0_0_0_2px_rgba(212,175,55,0.1)]"
                />
                <div className="mt-1 flex justify-between gap-3 text-[11px] text-[#8A8A8A]">
                  <span>{BEHAVIOUR[q.payload]}</span>
                  <span>{[...(draft[q.payload] ?? "")].length}/{ICE_BREAKER_MAX_QUESTION_LENGTH}</span>
                </div>
              </div>
            ) : (
              <p className="min-w-0">
                <strong className="font-semibold break-words">{q.question}</strong>
                <span className="text-[#8A8A8A]"> — {BEHAVIOUR[q.payload]}</span>
              </p>
            )}
          </div>
        ))}
      </div>

      {outOfDate && !editing && (
        <p className="mb-5 text-xs text-[#967520] bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-xl px-4 py-3">
          Instagram is showing older wording than what&apos;s saved here. Click Sync to update it.
        </p>
      )}

      <div className="flex flex-wrap justify-center gap-3">
        {editing ? (
          <>
            <button onClick={handleSave} disabled={busy !== null} className="flex items-center gap-2 px-8 py-3 rounded-full bg-[#2A2A2A] text-white text-xs uppercase tracking-[0.15em] font-medium shadow-lg transition-all duration-300 hover:-translate-y-0.5 disabled:opacity-50">
              <Check className="w-4 h-4" strokeWidth={1.5} />
              {busy === "save" ? "Saving…" : "Save questions"}
            </button>
            <button onClick={() => setEditing(false)} disabled={busy !== null} className={secondaryBtn}>
              <X className="w-4 h-4" strokeWidth={1.5} /> Cancel
            </button>
            <button onClick={resetDraft} disabled={busy !== null} className={secondaryBtn}>
              <RotateCcw className="w-4 h-4" strokeWidth={1.5} /> Reset to defaults
            </button>
          </>
        ) : (
          <>
            <button
              onClick={handleSync}
              disabled={busy !== null}
              className="flex items-center gap-2 px-8 py-3 rounded-full bg-[#CFA052] text-white text-xs uppercase tracking-[0.15em] font-medium shadow-lg transition-all duration-300 hover:shadow-xl hover:-translate-y-0.5 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${busy === "sync" ? "animate-spin" : ""}`} strokeWidth={1.5} />
              {busy === "sync" ? "Syncing…" : "Sync Ice Breakers to Instagram"}
            </button>
            <button onClick={startEditing} disabled={busy !== null} className={secondaryBtn}>
              <Pencil className="w-4 h-4" strokeWidth={1.5} /> Edit questions
            </button>
            <button
              onClick={handleRemove}
              disabled={busy !== null || (live !== null && live.length === 0)}
              title={live !== null && live.length === 0 ? "Nothing is showing on Instagram right now" : undefined}
              className={secondaryBtn}
            >
              <Trash2 className="w-4 h-4" strokeWidth={1.5} />
              {busy === "remove" ? "Removing…" : "Remove from Instagram"}
            </button>
          </>
        )}
      </div>

      {notice && (
        <div role="status" className={`mt-4 flex items-center justify-center gap-2 text-sm font-medium text-center ${notice.error ? "text-red-600" : "text-green-600"}`}>
          {!notice.error && <CheckCircle2 size={18} className="shrink-0" />} {notice.text}
        </div>
      )}
    </div>
  );
}
