// src/app/terms/page.tsx
"use client";

import { Shield, Mail, Phone, Clock, Building, Gavel, Globe, Lock, FileText, AlertCircle } from "lucide-react";

export default function TermsPage() {
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
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center gap-3 mb-6">
            <span className="h-[1px] w-16 bg-gradient-to-r from-transparent to-[#D4AF37]/80" />
            <span className="text-[#CFA052] font-semibold text-xs uppercase tracking-[0.3em]">Terms of Service</span>
            <span className="h-[1px] w-16 bg-gradient-to-l from-transparent to-[#D4AF37]/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-[#1A1A1A] tracking-wide mb-4">
            {shop.name}
          </h1>
          <p className="text-sm text-[#CFA052] mt-4 font-medium">Last updated: {lastUpdated}</p>
        </div>

        <div className="space-y-10 text-[#2A2A2A] leading-relaxed">
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">1. Acceptance of Terms</h2>
            </div>
            <p>By interacting with Dhera Singh Jewellers on Instagram, WhatsApp, or our website, you agree to these Terms of Service. If you do not agree, please do not use our services.</p>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Building className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">2. Our Services</h2>
            </div>
            <p>We provide automated jewellery price information and customer support via:</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li>Instagram Direct Messages</li>
              <li>Instagram Comments (with private DM replies)</li>
              <li>WhatsApp Business (where available)</li>
              <li>Our website dashboard (for staff only)</li>
            </ul>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">3. Automated Assistant</h2>
            </div>
            <p>Our automated assistant uses AI (Anthropic Claude) to answer general questions about our shop. For product-specific prices, weights, and purities, we use our live database. The assistant may not always be accurate. For important decisions, please confirm with our human team.</p>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Lock className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">4. Prices & Availability</h2>
            </div>
            <p>All prices shown are indicative and based on live gold rates at the time of enquiry. Final price may vary based on:</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li>Current gold rate at time of purchase</li>
              <li>Making charges, stone, diamond, polki values</li>
              <li>Weight variations</li>
              <li>Availability of the specific piece</li>
            </ul>
            <p className="mt-2">Please visit our shop or contact our team for confirmed pricing before purchase.</p>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Mail className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">5. Your Responsibilities</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li>Provide accurate information when sharing your name or phone number</li>
              <li>Do not use our service for spam, fraud, or illegal activities</li>
              <li>Respect our staff and other customers</li>
              <li>Do not attempt to reverse-engineer or misuse our automated systems</li>
            </ul>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Gavel className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">6. Intellectual Property</h2>
            </div>
            <p>All content, branding, product designs, and pricing algorithms are the property of Dhera Singh Jewellers. You may not copy, reproduce, or distribute our content without written permission.</p>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">7. Limitation of Liability</h2>
            </div>
            <p>We provide our services "as is." We are not liable for:</p>
            <ul className="list-disc list-inside space-y-2 mt-2">
              <li>Errors in automated price calculations</li>
              <li>Message delivery failures (Meta platform issues)</li>
              <li>Decisions made based on our automated responses</li>
              <li>Third-party platform outages (Instagram, WhatsApp, Vercel, Supabase)</li>
            </ul>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">8. Termination</h2>
            </div>
            <p>We may suspend or terminate your access to our automated services if you violate these terms. You may stop using our services at any time by sending <strong>STOP</strong> or <strong>DELETE</strong> in chat.</p>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Gavel className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">9. Governing Law & Disputes</h2>
            </div>
            <p>These terms are governed by the laws of India. Any disputes shall be subject to the exclusive jurisdiction of courts in <strong>Patiala, Punjab</strong>.</p>
          </section>

          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Phone className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">10. Contact</h2>
            </div>
            <div className="space-y-2">
              <p><strong>Dhera Singh Jewellers</strong></p>
              <p>Adalat Bazaar, near AC Market, Patiala, Punjab 147004</p>
              <p>📞 9876297973 &nbsp; | &nbsp; ✉️ dherasinghjewellers@gmail.com</p>
              <p>🕐 10:00 AM – 9:00 PM (Closed on National Holidays)</p>
            </div>
          </section>

          <p className="text-center text-sm text-[#8A8A8A] mt-8">
            Last updated: 21 October 2026
          </p>
        </div>
      </div>
    </div>
  );
}