// src/app/login/page.tsx
"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirect = searchParams.get("redirect") || "/";
  const errorParam = searchParams.get("error");

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(
    errorParam === "unauthorized" 
      ? "Invalid credentials or unauthorized access" 
      : errorParam === "session_expired" 
        ? "Session expired. Please sign in again." 
        : ""
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Login failed");
        setLoading(false);
        return;
      }

      // Cookie is set by server, just redirect
      router.push(redirect);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
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
              Email / Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
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

        <p style={{ marginTop: "1.5rem", textAlign: "center", fontSize: "0.875rem", color: "#9CA3AF" }}>
          Contact admin if you need access.
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