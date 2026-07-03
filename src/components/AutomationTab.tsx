// src/components/AutomationTab.tsx
"use client";

import { useState } from "react";
import { Sparkles, Database, MessageSquare, Link as LinkIcon, ArrowRight, CheckCircle2 } from "lucide-react";

// ─── Reusable input component ─────────────────────────────────────────────────
function ClassyInput({
  label,
  placeholder,
  type = "text",
  value,
  onChange,
}: {
  label: string;
  placeholder: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-2 group/input">
      <label className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-semibold group-focus-within/input:text-[#CFA052] transition-colors pl-1">
        {label}
      </label>
      <div className="relative bg-[#FBFBFA] rounded-xl border border-[#EADDCD] overflow-hidden transition-all duration-300 group-focus-within/input:border-[#CFA052] group-focus-within/input:shadow-[0_0_0_2px_rgba(212,175,55,0.1)] group-hover/input:border-[#CFA052]/50">
        <input
          type={type}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full bg-transparent p-3 text-sm text-[#2A2A2A] focus:outline-none placeholder:text-[#D1D1D1] font-medium"
        />
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function AutomationTab() {
  // Context fields (Step 01 + 02)
  const [keywords, setKeywords] = useState("");
  const [explanation, setExplanation] = useState("");

  // Product fields (Step 03)
  const [instagramLink, setInstagramLink] = useState("");
  const [productId, setProductId] = useState("");
  const [weight, setWeight] = useState("");
  const [purity, setPurity] = useState("");
  const [price, setPrice] = useState("");
  const [makingCharges, setMakingCharges] = useState("");
  const [stoneValue, setStoneValue] = useState("");
  const [diamondValue, setDiamondValue] = useState("");
  const [polkiValue, setPolkiValue] = useState("");

  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [error, setError] = useState("");

  const showMessage = (msg: string, isError = false) => {
    if (isError) setError(msg);
    else setSuccess(msg);
    setTimeout(() => { setSuccess(""); setError(""); }, 5000);
  };

  // ── Submit context (Step 01 + 02) ─────────────────────────────────────────
  const handleContextSubmit = async () => {
    if (!keywords.trim() || !explanation.trim()) {
      showMessage("Please fill in both the keywords and the explanation fields.", true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/add-context", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_KEY ?? "",
        },
        body: JSON.stringify({ keywords, explanation }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setKeywords("");
      setExplanation("");
      showMessage("Context successfully added to AI knowledge base!");
    } catch (e: unknown) {
      showMessage(e instanceof Error ? e.message : "Failed to add context", true);
    } finally {
      setLoading(false);
    }
  };

  // ── Submit product (Step 03) ──────────────────────────────────────────────
  const handleProductSubmit = async () => {
    if (!productId.trim()) {
      showMessage("Product ID is required.", true);
      return;
    }
    if (!instagramLink.trim()) {
      showMessage("Instagram link is required for the AI to match comments to products.", true);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/add-product", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-admin-key": process.env.NEXT_PUBLIC_ADMIN_KEY ?? "",
        },
        body: JSON.stringify({
          product_id: productId,
          name: productId,       // default name to product ID, owner can edit in Supabase later
          instagram_link: instagramLink,
          weight_grams: weight,
          purity,
          making_charges_percent: makingCharges,
          stone_value: stoneValue,
          diamond_value: diamondValue,
          polki_value: polkiValue,
          fixed_price: price,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Reset product fields
      setInstagramLink(""); setProductId(""); setWeight(""); setPurity("");
      setPrice(""); setMakingCharges(""); setStoneValue(""); setDiamondValue(""); setPolkiValue("");
      showMessage(`Product "${data.product?.product_id}" saved and prices recalculated!`);
    } catch (e: unknown) {
      showMessage(e instanceof Error ? e.message : "Failed to save product", true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-4 animate-in">

      {/* Header */}
      <div className="mb-24 text-center relative">
        <div className="inline-flex items-center justify-center gap-3 mb-6">
          <span className="h-[1px] w-16 bg-gradient-to-r from-transparent to-[#D4AF37]/80" />
          <span className="text-[#CFA052] font-semibold text-xs uppercase tracking-[0.3em]">Knowledge Base</span>
          <span className="h-[1px] w-16 bg-gradient-to-l from-transparent to-[#D4AF37]/80" />
        </div>
        <h2 className="text-4xl md:text-6xl font-serif text-[#1A1A1A] tracking-wide mb-6">
          Automated Agent Training
        </h2>
        <p className="text-[#8A8A8A] font-light text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
          Seamlessly integrate new collections, keywords, and metadata into your AI concierge's active memory bank.
        </p>
      </div>

      {/* Pipeline layout */}
      <div className="relative">
        <div className="absolute left-[24px] lg:left-1/3 top-0 bottom-0 w-[1px] bg-gradient-to-b from-[#EADDCD] via-[#CFA052] to-transparent lg:-translate-x-1/2" />

        <div className="space-y-20">

          {/* ── Step 01: Add Context Keywords ─────────────────────────────── */}
          <div className="relative flex flex-col lg:flex-row items-center lg:justify-between group">
            <div className="hidden lg:block lg:w-[30%] text-right pr-16 relative">
              <span className="absolute -right-12 top-1/2 -translate-y-1/2 text-[140px] font-serif text-[#F8F7F5] font-bold z-0 pointer-events-none select-none transition-transform duration-700 group-hover:scale-105">01</span>
              <h3 className="text-3xl font-serif text-[#1A1A1A] relative z-10 mb-2">Add Context</h3>
              <p className="text-sm text-[#8A8A8A] tracking-[0.1em] uppercase">Define semantic triggers</p>
            </div>

            <div className="absolute left-0 lg:left-1/3 w-12 h-12 rounded-full bg-white border border-[#CFA052] shadow-[0_0_30px_rgba(212,175,55,0.3)] lg:-translate-x-1/2 flex items-center justify-center z-10 transition-transform duration-500 group-hover:scale-110">
              <Database className="text-[#CFA052] w-5 h-5" strokeWidth={1.5} />
            </div>

            <div className="w-full pl-20 lg:pl-0 lg:w-[60%]">
              <div className="bg-white p-8 rounded-[2rem] border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_60px_rgba(212,175,55,0.08)] transition-all duration-500 group-hover:border-[#CFA052]/40">
                <label className="block text-xs uppercase tracking-[0.2em] text-[#CFA052] mb-5 font-bold">Target Keywords</label>
                <div className="relative bg-[#FBFBFA] rounded-xl border border-[#EADDCD] p-2 flex items-center focus-within:border-[#CFA052] focus-within:ring-1 focus-within:ring-[#CFA052]/30 transition-all">
                  <span className="pl-4 text-[#8A8A8A] font-light italic shrink-0">Add context about:</span>
                  <input
                    type="text"
                    placeholder="e.g. Polki, Choker, Bridal..."
                    value={keywords}
                    onChange={(e) => setKeywords(e.target.value)}
                    className="w-full bg-transparent p-3 text-[#2A2A2A] focus:outline-none placeholder:text-[#D1D1D1] font-medium"
                  />
                  <ArrowRight className="text-[#D1D1D1] mr-3 shrink-0" size={20} strokeWidth={1.5} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 02: Contextual Explanation ───────────────────────────── */}
          <div className="relative flex flex-col lg:flex-row items-center lg:justify-between group">
            <div className="hidden lg:block lg:w-[30%] text-right pr-16 relative">
              <span className="absolute -right-12 top-1/2 -translate-y-1/2 text-[140px] font-serif text-[#F8F7F5] font-bold z-0 pointer-events-none select-none">02</span>
              <h3 className="text-3xl font-serif text-[#1A1A1A] relative z-10 mb-2">Explain Addition</h3>
              <p className="text-sm text-[#8A8A8A] tracking-[0.1em] uppercase">Provide AI reasoning</p>
            </div>

            <div className="absolute left-0 lg:left-1/3 w-12 h-12 rounded-full bg-white border border-[#CFA052] shadow-[0_0_30px_rgba(212,175,55,0.3)] lg:-translate-x-1/2 flex items-center justify-center z-10 transition-transform duration-500 group-hover:scale-110">
              <MessageSquare className="text-[#CFA052] w-5 h-5" strokeWidth={1.5} />
            </div>

            <div className="w-full pl-20 lg:pl-0 lg:w-[60%]">
              <div className="bg-white p-8 rounded-[2rem] border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_60px_rgba(212,175,55,0.08)] transition-all duration-500 group-hover:border-[#CFA052]/40">
                <label className="block text-xs uppercase tracking-[0.2em] text-[#CFA052] mb-5 font-bold">Contextual Prompt</label>
                <textarea
                  placeholder="Type your explanation here to train the agent on how to use these keywords..."
                  rows={4}
                  value={explanation}
                  onChange={(e) => setExplanation(e.target.value)}
                  className="w-full bg-[#FBFBFA] border border-[#EADDCD] rounded-2xl p-5 text-[#2A2A2A] focus:outline-none focus:border-[#CFA052] focus:ring-1 focus:ring-[#CFA052]/30 placeholder:text-[#D1D1D1] font-light resize-none transition-all shadow-inner leading-relaxed"
                />
              </div>
            </div>
          </div>

          {/* Context save button */}
          <div className="flex justify-center lg:justify-end lg:pr-0 lg:w-full">
            <button
              onClick={handleContextSubmit}
              disabled={loading}
              className="group relative px-10 py-4 bg-[#CFA052] text-white rounded-full overflow-hidden shadow-lg hover:shadow-xl transition-all duration-500 hover:-translate-y-1 disabled:opacity-50 text-sm uppercase tracking-[0.2em] font-medium"
            >
              {loading ? "Saving..." : "Save Context to AI"}
            </button>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-6">
            <div className="flex-1 h-[1px] bg-[#EADDCD]" />
            <span className="text-[#8A8A8A] text-xs uppercase tracking-widest font-semibold">or</span>
            <div className="flex-1 h-[1px] bg-[#EADDCD]" />
          </div>

          {/* ── Step 03: Product Sync ──────────────────────────────────────── */}
          <div className="relative flex flex-col lg:flex-row items-start lg:justify-between group">
            <div className="hidden lg:block lg:w-[30%] text-right pr-16 relative mt-10">
              <span className="absolute -right-12 top-1/2 -translate-y-1/2 text-[140px] font-serif text-[#F8F7F5] font-bold z-0 pointer-events-none select-none">03</span>
              <h3 className="text-3xl font-serif text-[#1A1A1A] relative z-10 mb-2">Product Sync</h3>
              <p className="text-sm text-[#8A8A8A] tracking-[0.1em] uppercase">Link rich metadata</p>
            </div>

            <div className="absolute left-0 lg:left-1/3 w-12 h-12 rounded-full bg-[#2A2A2A] border border-[#2A2A2A] shadow-[0_0_30px_rgba(0,0,0,0.3)] lg:-translate-x-1/2 flex items-center justify-center z-10 mt-10 transition-transform duration-500 group-hover:scale-110">
              <LinkIcon className="text-white w-5 h-5" strokeWidth={1.5} />
            </div>

            <div className="w-full pl-20 lg:pl-0 lg:w-[60%]">
              <div className="bg-white p-8 md:p-10 rounded-[2rem] border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)] hover:shadow-[0_20px_60px_rgba(212,175,55,0.08)] transition-all duration-500 group-hover:border-[#2A2A2A]/40">
                <div className="flex items-center justify-between mb-8">
                  <label className="block text-xs uppercase tracking-[0.2em] text-[#2A2A2A] font-bold">Metadata Matrix</label>
                  <span className="text-[10px] uppercase tracking-widest text-[#8A8A8A] bg-[#F8F7F5] border border-[#EADDCD] px-3 py-1 rounded-full">9 Parameters</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div className="md:col-span-2 lg:col-span-3">
                    <ClassyInput label="Instagram Hyperlink" placeholder="https://instagram.com/p/..." type="url" value={instagramLink} onChange={setInstagramLink} />
                  </div>
                  <ClassyInput label="Product ID" placeholder="e.g. SKU-1049" value={productId} onChange={setProductId} />
                  <ClassyInput label="Weight (grams)" placeholder="0.00 gm" value={weight} onChange={setWeight} />
                  <ClassyInput label="Purity" placeholder="e.g. 22K" value={purity} onChange={setPurity} />
                  <ClassyInput label="Price (Optional)" placeholder="₹ 0.00" value={price} onChange={setPrice} />
                  <ClassyInput label="Making Charges (%)" placeholder="0%" value={makingCharges} onChange={setMakingCharges} />
                  <ClassyInput label="Stone + Wax Value" placeholder="₹ 0.00" value={stoneValue} onChange={setStoneValue} />
                  <ClassyInput label="Diamond Value" placeholder="₹ 0.00" value={diamondValue} onChange={setDiamondValue} />
                  <ClassyInput label="Polki Value" placeholder="₹ 0.00" value={polkiValue} onChange={setPolkiValue} />
                </div>
              </div>
            </div>
          </div>

        </div>
      </div>

      {/* Feedback messages */}
      {(success || error) && (
        <div className={`mt-8 flex items-center justify-center gap-2 text-sm font-medium ${error ? "text-red-600" : "text-green-600"}`}>
          {!error && <CheckCircle2 size={18} />} {success || error}
        </div>
      )}

      {/* Final submit button */}
      <div className="mt-16 flex justify-center">
        <button
          onClick={handleProductSubmit}
          disabled={loading}
          className="group relative px-12 py-5 bg-[#2A2A2A] text-white rounded-full overflow-hidden shadow-[0_15px_40px_rgba(0,0,0,0.2)] hover:shadow-[0_20px_50px_rgba(212,175,55,0.4)] transition-all duration-500 hover:-translate-y-1 disabled:opacity-50"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#CFA052] to-[#D4AF37] opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <span className="relative z-10 flex items-center gap-3 text-sm uppercase tracking-[0.2em] font-medium">
            <Sparkles size={18} /> {loading ? "Syncing..." : "Update Knowledge Base"}
          </span>
        </button>
      </div>

    </div>
  );
}