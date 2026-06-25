"use client";

import { useState, useEffect } from "react";
import { Activity, Sparkles, CheckCircle2 } from "lucide-react";

const KARATS = ["24K", "22K", "18K", "16K", "14K", "Silver"] as const;
type Karat = (typeof KARATS)[number];

export default function UpdatePriceTab() {
  const [prices,       setPrices]       = useState<Partial<Record<Karat, string>>>({});
  const [lastUpdated,  setLastUpdated]  = useState<string | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [error,        setError]        = useState("");

  // Load current prices on mount
  useEffect(() => {
    const load = async () => {
      try {
        const res  = await fetch("/api/dashboard-stats");
        const data = await res.json();
        if (data.metalPrices?.length) {
          const map: Partial<Record<Karat, string>> = {};
          data.metalPrices.forEach((mp: { karat_label: Karat; price_per_gram: number; updated_at: string }) => {
            map[mp.karat_label] = mp.price_per_gram > 0 ? String(mp.price_per_gram) : "";
            if (mp.updated_at) setLastUpdated(new Date(mp.updated_at).toLocaleString("en-IN"));
          });
          setPrices(map);
        }
      } catch (e) {
        console.error("Failed to load metal prices:", e);
      }
    };
    load();
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const priceMap: Record<string, number> = {};
      KARATS.forEach((k) => {
        const val = prices[k];
        if (val && val.trim() !== "") {
          const num = parseFloat(val);
          if (!isNaN(num) && num > 0) priceMap[k] = num;
        }
      });

      if (Object.keys(priceMap).length === 0) {
        setError("Please enter at least one price before syncing.");
        setLoading(false);
        return;
      }

      const res  = await fetch("/api/update-prices", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ prices: priceMap }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);

      setSuccess(true);
      setLastUpdated(new Date().toLocaleString("en-IN"));
      setTimeout(() => setSuccess(false), 5000);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update prices");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4 animate-in">

      {/* Header */}
      <div className="mb-20 text-center relative">
        <div className="inline-flex items-center justify-center gap-3 mb-6">
          <span className="h-[1px] w-16 bg-gradient-to-r from-transparent to-[#D4AF37]/80" />
          <span className="text-[#CFA052] font-semibold text-xs uppercase tracking-[0.3em]">Live Matrix</span>
          <span className="h-[1px] w-16 bg-gradient-to-l from-transparent to-[#D4AF37]/80" />
        </div>
        <h2 className="text-4xl md:text-6xl font-serif text-[#1A1A1A] tracking-wide mb-6">
          Market Price Configuration
        </h2>
        <p className="text-[#8A8A8A] font-light text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Update the global baseline prices for precious metals. These values instantly sync with the AI concierge for real-time quotation logic.
        </p>
        {lastUpdated && (
          <p className="text-xs text-[#8A8A8A] mt-4">
            Last synced: <span className="text-[#CFA052] font-medium">{lastUpdated}</span>
          </p>
        )}
      </div>

      {/* Price input grid */}
      <div className="relative">
        <div className="absolute left-[24px] lg:left-1/3 top-0 bottom-0 w-[1px] bg-gradient-to-b from-transparent via-[#CFA052] to-transparent lg:-translate-x-1/2" />

        <div className="relative flex flex-col lg:flex-row items-start lg:justify-between group">
          <div className="hidden lg:block lg:w-[30%] text-right pr-16 relative mt-10">
            <span className="absolute -right-12 top-1/2 -translate-y-1/2 text-[140px] font-serif text-[#F8F7F5] font-bold z-0 pointer-events-none select-none">₹</span>
            <h3 className="text-3xl font-serif text-[#1A1A1A] relative z-10 mb-2">Base Rates</h3>
            <p className="text-sm text-[#8A8A8A] tracking-[0.1em] uppercase">Per Gram Pricing</p>
          </div>

          <div className="absolute left-0 lg:left-1/3 w-12 h-12 rounded-full bg-white border border-[#CFA052] shadow-[0_0_30px_rgba(212,175,55,0.3)] lg:-translate-x-1/2 flex items-center justify-center z-10 mt-10">
            <Activity className="text-[#CFA052] w-5 h-5" strokeWidth={1.5} />
          </div>

          <div className="w-full pl-20 lg:pl-0 lg:w-[60%]">
            <div className="bg-white p-8 md:p-12 rounded-[2rem] border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_60px_rgba(212,175,55,0.08)] transition-all duration-500 group-hover:border-[#CFA052]/40">

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                {KARATS.map((karat) => (
                  <div key={karat} className="flex flex-col gap-2 group/input">
                    <label className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-bold group-focus-within/input:text-[#CFA052] transition-colors flex items-center gap-2">
                      {karat !== "Silver"
                        ? <Sparkles size={10} className="text-[#CFA052]" />
                        : <Activity size={10} className="text-gray-400" />
                      }
                      Update {karat} {karat !== "Silver" ? "Gold" : ""} Price
                    </label>
                    <div className="relative border-b-2 border-[#EADDCD] transition-all duration-300 group-focus-within/input:border-[#CFA052] pb-2">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="₹ 0.00"
                        value={prices[karat] ?? ""}
                        onChange={(e) =>
                          setPrices((prev) => ({ ...prev, [karat]: e.target.value }))
                        }
                        className="w-full bg-transparent text-xl font-serif text-[#1A1A1A] focus:outline-none placeholder:text-[#D1D1D1] tracking-wide"
                      />
                      <span className="absolute right-0 bottom-3 text-xs text-[#8A8A8A] font-medium uppercase tracking-wider">
                        / gm
                      </span>
                    </div>
                  </div>
                ))}
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* Feedback */}
      {error && (
        <p className="mt-8 text-red-600 text-sm text-center font-medium">{error}</p>
      )}
      {success && (
        <div className="mt-8 flex items-center justify-center gap-2 text-green-600 font-medium">
          <CheckCircle2 size={18} />
          All product prices have been recalculated and updated!
        </div>
      )}

      {/* Submit button */}
      <div className="mt-24 flex justify-center">
        <button
          onClick={handleSubmit}
          disabled={loading}
          className="group relative px-12 py-5 bg-[#2A2A2A] text-white rounded-full overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.2)] hover:shadow-[0_20px_50px_rgba(212,175,55,0.4)] transition-all duration-500 hover:-translate-y-1 disabled:opacity-50"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#CFA052] to-[#D4AF37] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="relative z-10 flex items-center gap-3 text-sm uppercase tracking-[0.2em] font-medium">
            <Activity size={18} />
            {loading ? "Syncing Prices..." : "Sync Live Prices"}
          </span>
        </button>
      </div>

    </div>
  );
}
```

### 10g. Tips Tab — `src/components/TipsTab.tsx`

```typescript
// src/components/TipsTab.tsx
"use client";

import { Sparkles } from "lucide-react";

export default function TipsTab() {
  return (
    <div className="max-w-5xl mx-auto h-[80vh] flex flex-col relative z-10">
      <div className="flex-1 bg-white rounded-[2rem] border border-[#EADDCD] flex flex-col overflow-hidden relative shadow-[0_30px_60px_rgba(0,0,0,0.05)]">

        {/* "Coming Soon" blur overlay */}
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center backdrop-blur-md bg-white/70 rounded-[2rem] pointer-events-auto">
          <div className="text-center p-8 max-w-md">
            <div className="w-14 h-14 rounded-full bg-[#F8F7F5] border border-[#EADDCD] flex items-center justify-center mx-auto mb-6 shadow-sm">
              <Sparkles className="text-[#CFA052]" size={24} strokeWidth={1.5} />
            </div>
            <p className="text-[#CFA052] text-[10px] uppercase tracking-[0.4em] mb-4 font-bold">Version 2</p>
            <h2 className="text-4xl font-serif text-[#1A1A1A] tracking-wide mb-4">
              Coming Soon
            </h2>
            <p className="text-[#8A8A8A] font-light leading-relaxed text-sm">
              The AI Marketing Concierge will write Instagram captions, suggest trending hashtags, recommend posting times, and craft reels scripts — all tailored to your jewellery and your audience.
            </p>
          </div>
        </div>

        {/* Blurred preview content behind the overlay */}
        <div className="p-10 opacity-20 pointer-events-none select-none blur-sm">
          <div className="flex items-center gap-4 mb-8">
            <div className="w-12 h-12 bg-[#EADDCD] rounded-full" />
            <div>
              <div className="h-4 w-40 bg-[#EADDCD] rounded mb-2" />
              <div className="h-3 w-20 bg-[#F8F7F5] rounded" />
            </div>
          </div>
          <div className="h-20 w-3/4 bg-[#F8F7F5] rounded-2xl mb-4" />
          <div className="h-20 w-full ml-auto bg-[#2A2A2A] rounded-2xl mb-4" />
          <div className="h-20 w-2/3 bg-[#F8F7F5] rounded-2xl" />
        </div>

      </div>
    </div>
  );
}