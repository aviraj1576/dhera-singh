// src/app/privacy/page.tsx
import React from "react";

export const metadata = {
  title: "Privacy Policy | Dhera Singh Jewellers",
  description: "Privacy Policy and Data Deletion Instructions for Dhera Singh Jewellers Customer Assistant.",
};

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center p-6 sm:p-12 relative overflow-hidden font-sans">
      {/* Background ambient glows */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] rounded-full bg-amber-500/10 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] rounded-full bg-yellow-500/10 blur-[120px] pointer-events-none" />

      <main className="relative z-10 w-full max-w-3xl bg-slate-900/60 backdrop-blur-xl border border-slate-800 rounded-2xl p-8 sm:p-12 shadow-2xl">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-2xl font-bold mb-4">
            DS
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-amber-200 via-yellow-400 to-amber-200 bg-clip-text text-transparent">
            Privacy Policy
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            Last Updated: June 27, 2026
          </p>
        </div>

        {/* Content Sections */}
        <div className="space-y-8 text-slate-300 leading-relaxed text-sm sm:text-base">
          <section className="border-b border-slate-800 pb-6">
            <h2 className="text-lg font-semibold text-amber-300 mb-3">1. Introduction</h2>
            <p>
              At <strong>Dhera Singh Jewellers</strong>, we value your trust and are committed to protecting your personal data. This Privacy Policy describes how our automated messaging application handles your personal information when you interact with us via Instagram Direct Messages (DMs), comments, or WhatsApp.
            </p>
          </section>

          <section className="border-b border-slate-800 pb-6">
            <h2 className="text-lg font-semibold text-amber-300 mb-3">2. Data We Collect</h2>
            <p className="mb-2">
              When you send a message, comment on our posts, or contact us, we may collect:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>Your public social media handle, profile name, and platform identifier (e.g., Instagram User ID or WhatsApp phone number).</li>
              <li>The text contents, links, or media attachments of your inquiries.</li>
              <li>Optional contact details (such as phone numbers or email addresses) that you choose to share with us during conversations.</li>
            </ul>
          </section>

          <section className="border-b border-slate-800 pb-6">
            <h2 className="text-lg font-semibold text-amber-300 mb-3">3. How We Use Your Data</h2>
            <p className="mb-2">
              We process this information solely to:
            </p>
            <ul className="list-disc pl-5 space-y-2 text-slate-400">
              <li>Automatically answer questions about product prices, weights, and purity.</li>
              <li>Connect you with our human sales representatives for bespoke inquiries and custom orders.</li>
              <li>Improve our customer service flow and catalog systems.</li>
            </ul>
            <p className="mt-2 text-slate-400">
              We do <strong>not</strong> sell, lease, or distribute your personal data to any third-party marketing companies.
            </p>
          </section>

          <section className="border-b border-slate-800 pb-6">
            <h2 className="text-lg font-semibold text-amber-300 mb-3">4. Data Deletion Instructions (Meta Compliant)</h2>
            <p className="mb-3">
              We respect your rights to control your data. If you want us to remove all logs of your messages, comments, or contact details from our internal support databases:
            </p>
            <div className="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4 text-slate-400">
              <p className="mb-2 font-medium text-slate-300">To request data deletion, simply:</p>
              <ol className="list-decimal pl-5 space-y-1">
                <li>Send an email to <span className="text-amber-400 font-mono">aviraj1576@gmail.com</span>.</li>
                <li>State "Data Deletion Request" in the subject line.</li>
                <li>Provide your platform handle (e.g., Instagram Username or WhatsApp phone number).</li>
              </ol>
              <p className="mt-3 text-xs italic text-slate-500">
                We will permanently delete your records from our systems within 48 hours of receiving the request.
              </p>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-amber-300 mb-3">5. Contact Us</h2>
            <p>
              For any questions regarding this Privacy Policy or our data practices, please contact us at:
            </p>
            <div className="mt-2 text-slate-400 font-mono text-xs sm:text-sm space-y-1">
              <p>📍 Dhera Singh Jewellers, Punjab, India</p>
              <p>✉️ aviraj1576@gmail.com</p>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="mt-12 pt-6 border-t border-slate-800 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} Dhera Singh Jewellers. All rights reserved.
        </div>
      </main>
    </div>
  );
}
