// src/app/login/page.tsx
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserClient } from "@supabase/ssr";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(errorParam === "unauthorized" ? "Please sign in to continue" : "");
  const [loading, setLoading] = useState(false);

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      setError(signInError.message);
      setLoading(false);
      return;
    }

    router.push(redirect);
    router.refresh();
  }

  async function handleMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/login`,
      },
    });

    if (error) {
      setError(error.message);
    } else {
      setError("Magic link sent! Check your email.");
    }
    setLoading(false);
  }

  return (
    <div style={{ 
      minHeight: "100vh", 
      display: "flex", 
      alignItems: "center", 
      justifyContent: "center", 
      backgroundColor: "#EADDCD",
      padding: "1rem"
    }}>
      <div style={{ 
        width: "100%", 
        maxWidth: "400px", 
        backgroundColor: "#FFFFFF", 
        borderRadius: "1rem", 
        boxShadow: "0 20px 40px rgba(0,0,0,0.1)",
        padding: "2rem"
      }}>
        <div style={{ textAlign: "center", marginBottom: "2rem" }}>
          <h1 style={{ 
            fontSize: "1.5rem", 
            fontFamily: "Georgia, serif", 
            color: "#967520", 
            fontWeight: "bold" 
          }}>
            Dhera Singh Jewellers
          </h1>
          <p style={{ color: "#6B7280", marginTop: "0.5rem" }}>Staff Dashboard Login</p>
        </div>

        {error && (
          <div style={{ 
            marginBottom: "1.5rem", 
            padding: "1rem", 
            backgroundColor: "#FEF2F2", 
            border: "1px solid #FECACA", 
            color: "#B91C1C", 
            borderRadius: "0.5rem", 
            fontSize: "0.875rem" 
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", color: "#374151", marginBottom: "0.25rem" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #D1D5DB",
                borderRadius: "0.5rem",
                fontSize: "1rem",
                color: "#1F2937",
                outline: "none",
                boxSizing: "border-box",
              }}
              placeholder="asingh41_be24@thapar.edu"
              disabled={loading}
            />
          </div>

          <div>
            <label style={{ display: "block", fontSize: "0.875rem", fontWeight: "500", color: "#374151", marginBottom: "0.25rem" }}>
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: "100%",
                padding: "0.75rem 1rem",
                border: "1px solid #D1D5DB",
                borderRadius: "0.5rem",
                fontSize: "1rem",
                color: "#1F2937",
                outline: "none",
                boxSizing: "border-box",
              }}
              placeholder="••••••••"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "0.75rem",
              backgroundColor: "#CFA052",
              color: "#FFFFFF",
              fontWeight: "500",
              borderRadius: "0.5rem",
              border: "none",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading ? 0.5 : 1,
              fontSize: "1rem",
              transition: "background-color 0.2s",
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = "#967520"; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = "#CFA052"; }}
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>

        <div style={{ marginTop: "1.5rem", textAlign: "center" }}>
          <button
            type="button"
            onClick={handleMagicLink}
            disabled={loading || !email}
            style={{
              padding: "0.5rem 1rem",
              backgroundColor: "transparent",
              color: "#CFA052",
              border: "1px solid #CFA052",
              borderRadius: "0.5rem",
              fontSize: "0.875rem",
              cursor: loading || !email ? "not-allowed" : "pointer",
              opacity: loading || !email ? 0.5 : 1,
            }}
          >
            Send Magic Link Instead
          </button>
        </div>

        <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "#9CA3AF" }}>
          No sign-up available. Contact admin for access.
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div style={{ 
        minHeight: "100vh", 
        display: "flex", 
        alignItems: "center", 
        justifyContent: "center", 
        backgroundColor: "#EADDCD" 
      }}>
        <div style={{ 
          width: "48px", 
          height: "48px", 
          borderRadius: "50%", 
          border: "2px solid #CFA052", 
          borderTopColor: "transparent", 
          animation: "spin 1s linear infinite" 
        }} />
      </div>
    }>
      <LoginForm />
    </Suspense>
  );
}