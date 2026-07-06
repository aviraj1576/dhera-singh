# Dhera Singh Jewellers — Customer Service AI & Dashboard

An intelligent automated customer service agent and management dashboard built for **Dhera Singh Jewellers**, Punjab, India. This system handles incoming customer inquiries from Instagram Comments, Instagram DMs, and WhatsApp Business, automatically replying with real-time gold/metal price calculations, or escalating to human staff when needed.

---

## 🚀 Key Features

* **Multi-Platform Support:** Unified webhook handler for Instagram DMs, Instagram Comments, and WhatsApp Business.
* **Intelligent Intent Detection:** Uses rule-based semantic filtering and Anthropic's Claude model to determine customer query intent (price, purity, weight, phone number sharing, etc.).
* **Dynamic Pricing Engine:** Calculates jewelry prices dynamically using current metal prices (fetched from Supabase) and jewelry characteristics (weight, purity, making charges, stone value, etc.).
* **Private Comment Replies:** Automatically replies to public Instagram comments indicating a DM was sent, and directly sends the price via a private message.
* **Human-in-the-Loop Escalation:** Automatically transfers thread control to human agents (and marks conversation as `human_needed` on the dashboard) for complex queries.
* **Admin Dashboard:** Next.js dashboard containing real-time statistics, message monitoring, and manual automation overrides.

---

## 🛠️ Tech Stack

* **Frontend Framework:** Next.js (App Router), React, TailwindCSS, Lucide Icons, Recharts
* **Backend Runtime:** Next.js Serverless Routes
* **Database & Auth:** Supabase (PostgreSQL)
* **AI Model:** Anthropic API (Claude 3.5 Sonnet)
* **Integrations:** Meta Graph API (Instagram & WhatsApp Webhooks)

---

## 📁 Repository Structure

```text
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── add-product/      # Add a new jewelry product to inventory
│   │   │   ├── dashboard-stats/  # Fetch stats for admin panel
│   │   │   ├── human-reply/      # Store manual agent replies
│   │   │   ├── update-prices/    # Trigger metal price recalculations
│   │   │   └── webhook/          # Meta Webhook endpoint (Instagram & WhatsApp)
│   │   └── page.tsx              # Main dashboard view
│   ├── components/
│   │   ├── AutomationTab.tsx     # Toggle automations, configure metal rates
│   │   └── DashboardTab.tsx      # View chats, analytics, and manage follow-ups
│   └── lib/
│       ├── anthropic.ts          # Intent parsing & LLM generation logic
│       ├── price-calculator.ts   # Live gold/jewellery price calculator
│       └── supabase.ts           # Supabase client setup
```

---

## ⚙️ Environment Variables Setup

Create a `.env.local` file in the root folder with the following variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Anthropic Claude API Key
ANTHROPIC_API_KEY=your_anthropic_api_key

# Instagram & Meta API Configuration
INSTAGRAM_PAGE_ID=your_instagram_page_id
INSTAGRAM_ACCESS_TOKEN=your_instagram_access_token
INSTAGRAM_APP_SECRET=your_instagram_app_secret
INSTAGRAM_VERIFY_TOKEN=your_verify_token

# WhatsApp Configuration
WHATSAPP_VERIFY_TOKEN=your_whatsapp_verify_token
```

---

## 🛠️ Running Locally

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000) to access the Admin Dashboard.

3. **Production Build & Type Check:**
   ```bash
   npm run build
   ```
