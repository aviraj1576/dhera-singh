"use client";

import { useState, useEffect } from "react";
import { UserPlus, Users, Wand2, Eye, EyeOff, Copy, CheckCircle2, ShieldCheck, User } from "lucide-react";

interface StaffMember {
  user_id: string;
  username: string | null;
  display_name: string;
  role: "admin" | "agent";
  active: boolean;
  last_login: string | null;
  created_at: string;
}

interface CreatedAccount {
  name: string;
  email: string;
  password: string;
}

// Unambiguous characters only (no 0/O, 1/l/I) so it can be read out or retyped.
const PASSWORD_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";

function generatePassword(length = 16): string {
  const limit = 256 - (256 % PASSWORD_ALPHABET.length); // rejection sampling: no modulo bias
  const out: string[] = [];
  while (out.length < length) {
    const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
    for (const b of bytes) {
      if (b < limit && out.length < length) out.push(PASSWORD_ALPHABET[b % PASSWORD_ALPHABET.length]);
    }
  }
  return out.join("");
}

async function fetchStaff(): Promise<StaffMember[]> {
  const res = await fetch("/api/staff", { credentials: "include" });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Could not load staff");
  return data.staff;
}

const inputClass =
  "w-full px-4 py-3 rounded-xl border border-[#EADDCD] bg-white text-[#1A1A1A] placeholder:text-[#D1D1D1] focus:outline-none focus:border-[#CFA052] transition-colors";
const labelClass = "block text-[10px] uppercase tracking-widest text-[#8A8A8A] font-bold mb-2";

export default function StaffTab() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadError, setLoadError] = useState("");
  const [loadingList, setLoadingList] = useState(true);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"agent" | "admin">("agent");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");
  const [created, setCreated] = useState<CreatedAccount | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchStaff()
      .then((list) => {
        if (cancelled) return;
        setStaff(list);
        setLoadError("");
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : "Could not load staff");
      })
      .finally(() => {
        if (!cancelled) setLoadingList(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError("");
    setCreated(null);
    setCopied(false);
    setSubmitting(true);

    try {
      const res = await fetch("/api/staff", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: name, email, role, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not add staff member");

      // Shown once so the admin can hand the login details over.
      setCreated({ name: data.staff.display_name, email: data.staff.username, password });
      setName("");
      setEmail("");
      setRole("agent");
      setPassword("");
      setShowPassword(false);
      try {
        setStaff(await fetchStaff());
      } catch {
        // The account was created; a failed refresh shouldn't look like a failure.
      }
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Could not add staff member");
    } finally {
      setSubmitting(false);
    }
  }

  async function copyDetails() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(
        `Sign in at ${window.location.origin}/login\nEmail: ${created.email}\nPassword: ${created.password}`
      );
      setCopied(true);
    } catch {
      setFormError("Couldn't copy automatically — select and copy the details manually.");
    }
  }

  return (
    <div className="max-w-6xl mx-auto py-4 animate-in">
      {/* Header */}
      <div className="mb-16 text-center">
        <div className="inline-flex items-center justify-center gap-3 mb-6">
          <span className="h-[1px] w-16 bg-gradient-to-r from-transparent to-[#D4AF37]/80" />
          <span className="text-[#CFA052] font-semibold text-xs uppercase tracking-[0.3em]">Team Access</span>
          <span className="h-[1px] w-16 bg-gradient-to-l from-transparent to-[#D4AF37]/80" />
        </div>
        <h2 className="text-4xl md:text-5xl font-serif text-[#1A1A1A] tracking-wide mb-6">Staff Accounts</h2>
        <p className="text-[#8A8A8A] font-light text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Add people who can sign in to this dashboard. Agents can handle conversations and leads; admins can also
          change prices, products and staff.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
        {/* ── Add form ───────────────────────────────────────────────────── */}
        <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 mb-8">
            <UserPlus className="text-[#CFA052] w-5 h-5" strokeWidth={1.5} />
            <h3 className="text-2xl font-serif text-[#1A1A1A]">Add staff member</h3>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-6">
            <div>
              <label htmlFor="staff-name" className={labelClass}>Full name</label>
              <input
                id="staff-name"
                type="text"
                required
                maxLength={80}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Simran Kaur"
                className={inputClass}
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="staff-email" className={labelClass}>Email (their login)</label>
              <input
                id="staff-email"
                type="email"
                required
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                className={inputClass}
                disabled={submitting}
              />
            </div>

            <div>
              <label htmlFor="staff-role" className={labelClass}>Role</label>
              <select
                id="staff-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "agent" | "admin")}
                className={inputClass}
                disabled={submitting}
              >
                <option value="agent">Agent — conversations, leads, dashboard</option>
                <option value="admin">Admin — everything, including prices, products and staff</option>
              </select>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label htmlFor="staff-password" className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-bold">
                  Password (min 12 characters)
                </label>
                <button
                  type="button"
                  onClick={() => {
                    setPassword(generatePassword());
                    setShowPassword(true);
                  }}
                  disabled={submitting}
                  className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-[#CFA052] font-bold hover:text-[#967520] transition-colors disabled:opacity-50"
                >
                  <Wand2 size={12} /> Generate
                </button>
              </div>
              <div className="relative">
                <input
                  id="staff-password"
                  type={showPassword ? "text" : "password"}
                  required
                  minLength={12}
                  maxLength={72}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} pr-12 ${showPassword ? "font-mono" : ""}`}
                  disabled={submitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((s) => !s)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#8A8A8A] hover:text-[#2A2A2A] transition-colors"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>

            {formError && <p className="text-red-600 text-sm font-medium">{formError}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="mt-2 px-8 py-4 bg-[#2A2A2A] text-white rounded-full text-sm uppercase tracking-[0.2em] font-medium shadow-[0_10px_30px_rgba(0,0,0,0.15)] hover:bg-[#CFA052] transition-colors duration-500 disabled:opacity-50"
            >
              {submitting ? "Creating account..." : "Create account"}
            </button>
          </form>

          {/* One-time credentials */}
          {created && (
            <div className="mt-8 p-6 rounded-2xl border border-green-200 bg-green-50">
              <div className="flex items-center gap-2 text-green-700 font-medium mb-3">
                <CheckCircle2 size={18} />
                {created.name} can now sign in
              </div>
              <dl className="text-sm text-[#2A2A2A] grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
                <dt className="text-[#8A8A8A]">Email</dt>
                <dd className="break-all">{created.email}</dd>
                <dt className="text-[#8A8A8A]">Password</dt>
                <dd className="font-mono break-all">{created.password}</dd>
              </dl>
              <p className="text-xs text-[#8A8A8A] mt-3">
                This is the only time the password is shown. Share it securely.
              </p>
              <button
                type="button"
                onClick={copyDetails}
                className="mt-3 flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-green-700 hover:text-green-900 transition-colors"
              >
                <Copy size={14} /> {copied ? "Copied" : "Copy login details"}
              </button>
            </div>
          )}
        </div>

        {/* ── Team list ──────────────────────────────────────────────────── */}
        <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)]">
          <div className="flex items-center gap-3 mb-8">
            <Users className="text-[#CFA052] w-5 h-5" strokeWidth={1.5} />
            <h3 className="text-2xl font-serif text-[#1A1A1A]">Team</h3>
          </div>

          {loadingList && <p className="text-[#8A8A8A] text-sm">Loading...</p>}
          {loadError && <p className="text-red-600 text-sm font-medium">{loadError}</p>}

          <ul className="divide-y divide-[#EADDCD]/60">
            {staff.map((s) => (
              <li key={s.user_id} className="py-4 flex items-center gap-4">
                <div className="w-10 h-10 shrink-0 rounded-full border border-[#D4AF37]/30 bg-[#FDFBF7] flex items-center justify-center text-[#CFA052]">
                  {s.role === "admin" ? <ShieldCheck size={18} strokeWidth={1.5} /> : <User size={18} strokeWidth={1.5} />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[#1A1A1A] font-medium truncate">{s.display_name}</p>
                  <p className="text-xs text-[#8A8A8A] truncate">{s.username ?? "no login email"}</p>
                  <p className="text-xs text-[#8A8A8A]">
                    Last sign-in: {s.last_login ? new Date(s.last_login).toLocaleString("en-IN") : "never"}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="px-3 py-1 rounded-full text-[10px] uppercase tracking-widest font-bold bg-[#F8F7F5] text-[#8A8A8A] border border-[#EADDCD]">
                    {s.role}
                  </span>
                  {!s.active && (
                    <span className="text-[10px] uppercase tracking-widest font-bold text-red-600">Disabled</span>
                  )}
                </div>
              </li>
            ))}
          </ul>

          <p className="text-xs text-[#8A8A8A] mt-6 leading-relaxed">
            To disable someone or reset a password, ask a developer — the SQL for it is in{" "}
            <span className="font-mono">src/sql/auth-schema.sql</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
