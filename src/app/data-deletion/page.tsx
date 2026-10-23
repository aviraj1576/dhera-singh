// src/app/data-deletion/page.tsx
"use client";

import { Shield, Mail, Phone, Clock, Building, Gavel, Globe, Lock, FileText, AlertCircle, CheckCircle2, Trash2 } from "lucide-react";

export default function DataDeletionPage() {
  const shop = {
    name: "Dhera Singh Jewellers",
    address: "Adalat Bazaar, near AC Market, Patiala, Punjab 147004",
    phone: "9876297973",
    email: "dherasinghjewellers@gmail.com",
    hours: "10:00 AM – 9:00 PM (Closed on National Holidays)",
    grievanceOfficer: "Angad Singh",
  };

  return (
    <div className="min-h-screen bg-cream py-12 px-4">
      <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-[#EADDCD] shadow-[0_15px_50px_rgba(0,0,0,0.03)] p-8 md:p-12 animate-in">
        <div className="text-center mb-12">
          <div className="inline-flex items-center justify-center gap-3 mb-6">
            <span className="h-[1px] w-16 bg-gradient-to-r from-transparent to-[#D4AF37]/80" />
            <span className="text-[#CFA052] font-semibold text-xs uppercase tracking-[0.3em]">Data Deletion</span>
            <span className="h-[1px] w-16 bg-gradient-to-l from-transparent to-[#D4AF37]/80" />
          </div>
          <h1 className="text-4xl md:text-5xl font-serif text-[#1A1A1A] tracking-wide mb-4">
            {shop.name}
          </h1>
          <p className="text-[#8A8A8A] font-light text-lg max-w-2xl mx-auto leading-relaxed">
            Request deletion of your personal data
          </p>
        </div>

        <div className="space-y-8 text-[#2A2A2A] leading-relaxed">
          {/* Quick Actions */}
          <section className="bg-[#FDFBF7] border border-[#EADDCD] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Trash2 className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">Quick Deletion Options</h2>
            </div>
            <div className="space-y-4">
              <div className="p-4 bg-white border border-[#EADDCD] rounded-xl">
                <h3 className="font-semibold text-[#1A1A1A] mb-2">Option 1: Send "DELETE" in Chat</h3>
                <p className="text-sm text-[#8A8A8A] mb-3">Fastest method — works on Instagram DM or WhatsApp</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-[#8A8A8A]">
                  <li>Send <strong>DELETE</strong> in any conversation with us</li>
                  <li>All your data removed immediately</li>
                  <li>Confirmation sent back in chat</li>
                </ul>
              </div>
              <div className="p-4 bg-white border border-[#EADDCD] rounded-xl">
                <h3 className="font-semibold text-[#1A1A1A] mb-2">Option 2: Email Request</h3>
                <p className="text-sm text-[#8A8A8A] mb-3">For formal requests or if chat is unavailable</p>
                <ul className="list-disc list-inside space-y-1 text-sm text-[#8A8A8A]">
                  <li>Email: <a href={`mailto:${shop.email}?subject=Data%20Deletion%20Request`} className="text-[#CFA052] underline">{shop.email}</a></li>
                  <li>Subject: "Data Deletion Request"</li>
                  <li>Include your Instagram username</li>
                </ul>
              </div>
            </div>
          </section>

          {/* What Gets Deleted */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Shield className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">What Gets Deleted</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li>Instagram ID (IGSID) and username</li>
              <li>Display name (if collected)</li>
              <li>Name and phone number (if provided)</li>
              <li>All conversation history and messages</li>
              <li>Product interests and reel context</li>
              <li>Lead record and consent timestamps</li>
            </ul>
            <p className="mt-3 text-sm text-[#8A8A8A]">Anonymised analytics (no personal identifiers) are retained for business insights.</p>
          </section>

          {/* Timeline */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Clock className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">Deletion Timeline</h2>
            </div>
            <div className="space-y-3 mt-4">
              <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] border border-[#EADDCD] rounded-xl">
                <div className="w-8 h-8 rounded-full bg-[#CFA052] text-white flex items-center justify-center text-sm font-bold">1</div>
                <div>
                  <p className="font-semibold">Request Received</p>
                  <p className="text-sm text-[#8A8A8A]">Immediate acknowledgment in chat or email</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] border border-[#EADDCD] rounded-xl">
                <div className="w-8 h-8 rounded-full bg-[#CFA052] text-white flex items-center justify-center text-sm font-bold">2</div>
                <div>
                  <p className="font-semibold">Processing</p>
                  <p className="text-sm text-[#8A8A8A]">All data removed from live database within 24 hours</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] border border-[#EADDCD] rounded-xl">
                <div className="w-8 h-8 rounded-full bg-[#CFA052] text-white flex items-center justify-center text-sm font-bold">3</div>
                <div>
                  <p className="font-semibold">Confirmation</p>
                  <p className="text-sm text-[#8A8A8A]">Deletion confirmation sent via chat or email</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] border border-[#EADDCD] rounded-xl">
                <div className="w-8 h-8 rounded-full bg-[#CFA052] text-white flex items-center justify-center text-sm font-bold">4</div>
                <div>
                  <p className="font-semibold">Backup Purge</p>
                  <p className="text-sm text-[#8A8A8A]">Removed from backups within 30 days (standard backup cycle)</p>
                </div>
              </div>
            </div>
          </section>

          {/* What We Keep */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">What We Keep (Anonymised)</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li>Aggregated conversation counts (no IDs)</li>
              <li>Product popularity statistics</li>
              <li>Response time metrics</li>
              <li>All personal identifiers removed</li>
            </ul>
            <p className="mt-3 text-sm text-[#8A8A8A]">This data cannot be linked back to you.</p>
          </section>

          {/* Legal Basis */}
          <section className="border-l-4 border-[#CFA052] pl-6">
            <div className="flex items-center gap-3 mb-4">
              <Gavel className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">Legal Basis (DPDP Act 2023)</h2>
            </div>
            <ul className="list-disc list-inside space-y-2 mt-2 text-sm">
              <li><strong>Section 12:</strong> Right to erasure — you can request deletion at any time</li>
              <li><strong>Section 8:</strong> Consent withdrawal — consent can be withdrawn as easily as given</li>
              <li><strong>Section 18:</strong> Grievance redressal — 30-day response timeline</li>
            </ul>
          </section>

          {/* Contact */}
          <section className="bg-[#FDFBF7] border border-[#EADDCD] rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <Phone className="text-[#CFA052] w-6 h-6" />
              <h2 className="text-2xl font-serif text-[#1A1A1A]">Need Help?</h2>
            </div>
            <div className="space-y-2">
              <p><strong>Dhera Singh Jewellers</strong></p>
              <p>Adalat Bazaar, near AC Market, Patiala, Punjab 147004</p>
              <p>📞 9876297973 &nbsp; | &nbsp; ✉️ dherasinghjewellers@gmail.com</p>
              <p>🕐 10:00 AM – 9:00 PM (Closed on National Holidays)</p>
              <p className="mt-2"><strong>Grievance Officer:</strong> Angad Singh — dherasinghjewellers@gmail.com</p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}