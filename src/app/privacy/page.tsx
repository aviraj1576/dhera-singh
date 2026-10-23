// src/app/privacy/page.tsx
"use client";

import { Shield, Mail, Phone, Clock, Building, Gavel, Globe, Lock, FileText, AlertCircle } from "lucide-react";

export default function PrivacyPage() {
  const shop = {
    name: "Dhera Singh Jewellers",
    address: "Adalat Bazaar, near AC Market, Patiala, Punjab 147004",
    phone: "9876297973",
    email: "dherasinghjewellers@gmail.com",
    hours: "10:00 AM – 9:00 PM (Closed on National Holidays)",
    grievanceOfficer: "Angad Singh",
  };

  const lastUpdated = "21 October 2026";

  return (
    <div className="min-h-screen bg-cream py-12 px-4">
      <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)] p-8 md:p-12 animate-in">
        {/* Header */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center gap-3 mb-6">
            <span className="h-[1px] w-16 bg-gradient-to-r from-transparent to-[#D4AF37]/80" />
            <span className="text-[#CFA052] font-semibold text-xs uppercase tracking-[0.3em]">Privacy Policy</span>
            <span className="h-[1px] w-16 bg-gradient-to-l from-transparent to-[#D4AF37]/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-[#1A1A1A] tracking-wide mb-4">
            {shop.name}
          </h1>
          <p className="text-[#8A8A8A] font-light text-lg max-w-2xl mx-auto leading-relaxed">
            Your privacy matters to us. This policy explains how we collect, use, and protect your information.
          </p>
          <p className="text-sm text-[#CFA052] mt-4 font-medium">Last updated: {lastUpdated}</p>
        </div>

        {/* Sections */}
        <div className="space-y-10 text-[#2A2A2A] leading-relaxed">
          {/* 1. Data Controller */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Building className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">1. Data Controller</h2>
            </div>
            <p><strong>{shop.name}</strong> ("we", "us", "our") is the data controller for your personal information.</p>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li><strong>Address:</strong> {shop.address}</li>
              <li><strong>Phone:</strong> {shop.phone}</li>
              <li><strong>Email:</strong> {shop.email}</li>
              <li><strong>Grievance Officer:</strong> {shop.grievanceOfficer} ({shop.email})</li>
            </ul>
          </section>

          {/* 2. Data Collected */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">2. Data We Collect</h2>
            </div>
            <p>We collect the following when you interact with our Instagram DM, comments, or ice breakers:</p>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li><strong>Instagram ID (IGSID):</strong> Unique identifier assigned by Meta</li>
              <li><strong>Username:</strong> Your public Instagram handle</li>
              <li><strong>Display Name:</strong> Your Instagram profile name (if you message us or tap an ice breaker)</li>
              <li><strong>Messages:</strong> Text, images, links, and attachments you send</li>
              <li><strong>Products Asked About:</strong> Reels/posts you comment on or share</li>
              <li><strong>Name & Phone:</strong> Only if you voluntarily provide them during chat</li>
              <li><strong>Metadata:</strong> Timestamps, message IDs, platform, conversation context</li>
            </ul>
          </section>

          {/* 3. Purpose */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">3. Purpose of Processing</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li>Reply to your product enquiries (price, weight, purity, details)</li>
              <li>Send jewellery prices calculated from live gold rates</li>
              <li>Connect you with our human team for complex queries</li>
              <li>Improve our automated assistant using AI (Anthropic Claude)</li>
              <li>Contact you if you request a callback or share your number</li>
              <li>Comply with legal obligations (DPDP Act 2023, Meta platform policies)</li>
            </ul>
          </section>

          {/* 4. AI Processing */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">4. AI Processing (Anthropic Claude)</h2>
            </div>
            <p className="mb-2">For general shop questions (location, hours, policies), we use Anthropic's Claude model.</p>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li>Your message is sent to Anthropic with a strict system prompt</li>
              <li>We <strong>never</strong> send prices, weights, or purities to AI — those come from our database only</li>
              <li>Phone numbers are <strong>redacted</strong> before any AI processing</li>
              <li>Anthropic does not use your data to train their models (per their API policy)</li>
            </ul>
          </section>

          {/* 5. Hosting & Sub-processors */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Globe className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">5. Hosting & Sub-processors</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li><strong>Vercel:</strong> Application hosting (US/EU regions)</li>
              <li><strong>Supabase (PostgreSQL):</strong> Database & authentication (US/EU regions)</li>
              <li><strong>Anthropic:</strong> AI model inference (US)</li>
              <li><strong>Meta (Instagram/WhatsApp):</strong> Message delivery platform</li>
            </ul>
          </section>

          {/* 6. Retention */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">6. Retention</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li>Conversation logs: 12 months from last activity</li>
              <li>Lead data (name, phone, interests): 12 months from last activity, or until you request deletion</li>
              <li>Anonymised analytics: Indefinitely (no personal identifiers)</li>
              <li>You can request immediate deletion by sending <strong>DELETE</strong> in chat</li>
            </ul>
          </section>

          {/* 7. Your Rights (DPDP Act 2023) */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Gavel className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">7. Your Rights (Digital Personal Data Protection Act 2023)</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li><strong>Access:</strong> Request a copy of your data</li>
              <li><strong>Correction:</strong> Update inaccurate information</li>
              <li><strong>Deletion:</strong> Send <strong>DELETE</strong> in chat or email us</li>
              <li><strong>Grievance Redressal:</strong> Contact our Grievance Officer</li>
              <li><strong>Withdraw Consent:</strong> Send <strong>STOP</strong> to stop marketing messages</li>
            </ul>
            <p className="mt-3 text-sm">We respond to all requests within 30 days as per DPDP Act 2023.</p>
          </section>

          {/* 8. Data Security */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">8. Data Security</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li>All data encrypted in transit (TLS 1.2+) and at rest (AES-256)</li>
              <li>Row Level Security on all database tables</li>
              <li>Staff access via Supabase Auth with role-based permissions</li>
              <li>No data sold to third parties — ever</li>
              <li>Children under 18: We do not knowingly collect data from minors</li>
            </ul>
          </section>

          {/* 9. Contact */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Phone className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">9. Contact Us</h2>
            </div>
            <div className="space-y-2 text-sm">
              <p><strong>Dhera Singh Jewellers</strong></p>
              <p>{shop.address}</p>
              <p>📞 {shop.phone} &nbsp; | &nbsp; ✉️ {shop.email}</p>
              <p>🕐 {shop.hours}</p>
              <p className="mt-2"><strong>Grievance Officer:</strong> {shop.grievanceOfficer} — {shop.email}</p>
            </div>
          </section>

          {/* 10. Governing Law */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">10. Governing Law</h2>
            </div>
            <p className="text-sm">
              This policy is governed by the laws of India. Disputes are subject to the exclusive jurisdiction of courts in <strong>Patiala, Punjab</strong>.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}