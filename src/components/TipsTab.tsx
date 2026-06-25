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
