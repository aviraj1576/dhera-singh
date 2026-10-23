// src/components/LeadsTab.tsx
"use client";

import { useState, useEffect } from "react";
import {
  Search, Filter, Download, Phone, Mail, MapPin, User, AlertCircle,
  ChevronDown, ChevronRight, MoreVertical, Trash2, Edit2, Eye,
  X, CheckCircle2
} from "lucide-react";

interface Lead {
  id: string;
  platform: string;
  platform_user_id: string;
  username: string | null;
  instagram_name: string | null;
  name: string | null;
  phone_e164: string | null;
  phone_raw: string | null;
  capture_stage: string;
  contact_status: string;
  needs_human: boolean;
  bot_paused_until: string | null;
  entry_point: string | null;
  source_reel_code: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_user_message_at: string | null;
  assigned_to: string | null;
  notes: string | null;
  city: string | null;
  occasion: string | null;
  budget: string | null;
}

interface LeadDetail {
  lead: Lead;
  interests: Array<{
    reel_code: string;
    product_id: string | null;
    source: string;
    shown_at: string;
    selected_at: string | null;
    product: {
      id: string;
      name: string;
      label: string | null;
      purity: string | null;
      weight_grams: number | null;
      calculated_price: number | null;
    } | null;
  }>;
  conversations: Array<{
    id: string;
    platform: string;
    human_message: string;
    ai_response: string | null;
    status: string;
    created_at: string;
  }>;
}

export default function LeadsTab() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLead, setSelectedLead] = useState<LeadDetail | null>(null);
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({
    needsHuman: false,
    hasPhone: false,
    status: "",
    dateFrom: "",
    dateTo: "",
  });
  const [exportLoading, setExportLoading] = useState(false);

  const loadLeads = async () => {
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filters.needsHuman) params.set("needsHuman", "true");
      if (filters.hasPhone) params.set("hasPhone", "true");
      if (filters.status) params.set("status", filters.status);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);

      const res = await fetch(`/api/leads?${params.toString()}`, {
        credentials: "include",
      });
      const data = await res.json();
      setLeads(data.leads ?? []);
    } catch (e) {
      console.error("Failed to load leads:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLeads();
  }, [search, filters]);

  const loadLeadDetail = async (leadId: string) => {
    try {
      const res = await fetch(`/api/leads/${leadId}`, {
        credentials: "include",
      });
      const data = await res.json();
      setSelectedLead(data);
    } catch (e) {
      console.error("Failed to load lead detail:", e);
    }
  };

  const handleRowClick = (lead: Lead) => {
    loadLeadDetail(lead.id);
  };

  const handleExport = async () => {
    setExportLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      if (filters.needsHuman) params.set("needsHuman", "true");
      if (filters.hasPhone) params.set("hasPhone", "true");
      if (filters.status) params.set("status", filters.status);
      if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
      if (filters.dateTo) params.set("dateTo", filters.dateTo);
      params.set("export", "true");

      const res = await fetch(`/api/leads?${params.toString()}`, {
        credentials: "include",
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `leads-${new Date().toISOString().split("T")[0]}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export failed:", e);
      alert("Export failed. Please try again.");
    } finally {
      setExportLoading(false);
    }
  };

  const getStatusBadge = (lead: Lead) => {
    if (lead.needs_human) return (
      <span className="px-2 py-1 text-[10px] uppercase tracking-widest text-white bg-red-500 rounded-full font-bold">Needs Human</span>
    );
    if (lead.bot_paused_until && new Date(lead.bot_paused_until) > new Date()) return (
      <span className="px-2 py-1 text-[10px] uppercase tracking-widest text-white bg-amber-500 rounded-full font-bold">Bot Paused</span>
    );
    if (lead.capture_stage === "complete") return (
      <span className="px-2 py-1 text-[10px] uppercase tracking-widest text-white bg-green-500 rounded-full font-bold">Contact Ready</span>
    );
    if (lead.capture_stage === "declined") return (
      <span className="px-2 py-1 text-[10px] uppercase tracking-widest text-white bg-gray-500 rounded-full font-bold">Declined</span>
    );
    return (
      <span className="px-2 py-1 text-[10px] uppercase tracking-widest text-white bg-[#CFA052] rounded-full font-bold">New</span>
    );
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const filteredLeads = leads.filter((lead) => {
    if (search) {
      const s = search.toLowerCase();
      const match = 
        lead.name?.toLowerCase().includes(s) ||
        lead.username?.toLowerCase().includes(s) ||
        lead.instagram_name?.toLowerCase().includes(s) ||
        lead.phone_e164?.includes(s) ||
        lead.platform_user_id.includes(s);
      if (!match) return false;
    }
    if (filters.needsHuman && !lead.needs_human) return false;
    if (filters.hasPhone && !lead.phone_e164) return false;
    if (filters.status && lead.contact_status !== filters.status) return false;
    if (filters.dateFrom && lead.last_seen_at < filters.dateFrom) return false;
    if (filters.dateTo && lead.last_seen_at > filters.dateTo) return false;
    return true;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 rounded-full border-2 border-[#CFA052] border-t-transparent animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in">
      {/* Header & Actions */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif text-[#1A1A1A]">Leads</h2>
          <p className="text-[#8A8A8A] mt-1">{filteredLeads.length} leads</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="px-5 py-2.5 bg-[#2A2A2A] text-white rounded-full text-sm font-medium hover:bg-[#CFA052] transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            <Download size={16} /> {exportLoading ? "Exporting..." : "Export CSV"}
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-2xl border border-[#EADDCD] p-6 shadow-sm">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1 min-w-[250px]">
            <label className="block text-xs uppercase tracking-widest text-[#8A8A8A] font-bold mb-1">Search</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-[#D1D1D1] w-5 h-5" />
              <input
                type="text"
                placeholder="Name, username, phone, IG ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-[#FBFBFA] border border-[#EADDCD] rounded-xl focus:outline-none focus:border-[#CFA052] focus:ring-1 focus:ring-[#CFA052]/30"
              />
            </div>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs uppercase tracking-widest text-[#8A8A8A] font-bold mb-1">Needs Human</label>
            <select
              value={filters.needsHuman ? "true" : "false"}
              onChange={(e) => setFilters({ ...filters, needsHuman: e.target.value === "true" })}
              className="w-full px-4 py-3 bg-[#FBFBFA] border border-[#EADDCD] rounded-xl focus:outline-none focus:border-[#CFA052]"
            >
              <option value="false">All</option>
              <option value="true">Yes</option>
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs uppercase tracking-widest text-[#8A8A8A] font-bold mb-1">Has Phone</label>
            <select
              value={filters.hasPhone ? "true" : "false"}
              onChange={(e) => setFilters({ ...filters, hasPhone: e.target.value === "true" })}
              className="w-full px-4 py-3 bg-[#FBFBFA] border border-[#EADDCD] rounded-xl focus:outline-none focus:border-[#CFA052]"
            >
              <option value="false">All</option>
              <option value="true">Yes</option>
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs uppercase tracking-widest text-[#8A8A8A] font-bold mb-1">Status</label>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="w-full px-4 py-3 bg-[#FBFBFA] border border-[#EADDCD] rounded-xl focus:outline-none focus:border-[#CFA052]"
            >
              <option value="">All</option>
              <option value="new">New</option>
              <option value="contact_requested">Contact Requested</option>
              <option value="stopped">Stopped</option>
            </select>
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs uppercase tracking-widest text-[#8A8A8A] font-bold mb-1">From</label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              className="w-full px-4 py-3 bg-[#FBFBFA] border border-[#EADDCD] rounded-xl focus:outline-none focus:border-[#CFA052]"
            />
          </div>

          <div className="min-w-[180px]">
            <label className="block text-xs uppercase tracking-widest text-[#8A8A8A] font-bold mb-1">To</label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              className="w-full px-4 py-3 bg-[#FBFBFA] border border-[#EADDCD] rounded-xl focus:outline-none focus:border-[#CFA052]"
            />
          </div>
        </div>
      </div>

      {/* Leads Table */}
      <div className="bg-white rounded-2xl border border-[#EADDCD] shadow-sm overflow-hidden">
        {filteredLeads.length === 0 ? (
          <div className="p-12 text-center">
            <User className="w-12 h-12 mx-auto text-[#D1D1D1] mb-4" />
            <p className="text-[#8A8A8A] font-light">No leads found matching your filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#FDFBF7] border-b border-[#EADDCD]">
                <tr>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[#8A8A8A] font-bold">Lead</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[#8A8A8A] font-bold">Contact</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[#8A8A8A] font-bold">Products Asked</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[#8A8A8A] font-bold">Source</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[#8A8A8A] font-bold">Status</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[#8A8A8A] font-bold">Last Message</th>
                  <th className="px-4 py-3 text-left text-xs uppercase tracking-widest text-[#8A8A8A] font-bold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EADDCD]/50">
                {filteredLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    onClick={() => handleRowClick(lead)}
                    className="cursor-pointer hover:bg-[#FDFBF7] transition-colors"
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-[#2A2A2A] flex items-center justify-center">
                          <User className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <p className="font-medium text-[#1A1A1A]">
                            {lead.name ?? lead.instagram_name ?? lead.username ?? "Unknown"}
                          </p>
                          <p className="text-[11px] text-[#8A8A8A] font-mono">
                            IG: {lead.platform_user_id.slice(0, 12)}...
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="space-y-1 text-sm">
                        {lead.phone_e164 && (
                          <div className="flex items-center gap-2 text-[#1A1A1A]">
                            <Phone className="w-4 h-4 text-[#CFA052]" />
                            <span className="font-mono">{lead.phone_e164}</span>
                          </div>
                        )}
                        {lead.instagram_name && (
                          <div className="flex items-center gap-2 text-[#8A8A8A]">
                            <User className="w-4 h-4" />
                            <span>@{(lead.username ?? lead.instagram_name)}</span>
                          </div>
                        )}
                        {lead.city && (
                          <div className="flex items-center gap-2 text-[#8A8A8A]">
                            <MapPin className="w-4 h-4" />
                            <span>{lead.city}</span>
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-[#8A8A8A] max-w-xs truncate">
                      {lead.source_reel_code ? `Reel: ${lead.source_reel_code}` : "—"}
                    </td>
                    <td className="px-4 py-4 text-sm">
                      <span className="px-2 py-1 text-[9px] uppercase tracking-widest text-white bg-[#2A2A2A] rounded-full font-bold">
                        {lead.entry_point?.replace("_", " ") ?? "—"}
                      </span>
                    </td>
                    <td className="px-4 py-4">
                      {getStatusBadge(lead)}
                    </td>
                    <td className="px-4 py-4 text-sm text-[#8A8A8A] font-mono">
                      {formatDate(lead.last_user_message_at ?? lead.last_seen_at)}
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleRowClick(lead); }}
                          className="p-2 text-[#8A8A8A] hover:text-[#CFA052] hover:bg-[#FDFBF7] rounded-xl transition-colors"
                          title="View Details"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {lead.needs_human && (
                          <button
                            onClick={(e) => { e.stopPropagation(); alert("Assign to staff - feature coming"); }}
                            className="p-2 text-[#8A8A8A] hover:text-red-500 hover:bg-[#FDFBF7] rounded-xl transition-colors"
                            title="Assign"
                          >
                            <User className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Detail Drawer */}
        {selectedLead && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
            <div className="bg-white rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
              {/* Header */}
              <div className="p-6 border-b border-[#EADDCD] flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-[#2A2A2A] flex items-center justify-center">
                    <User className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-serif text-[#1A1A1A]">
                      {selectedLead.lead.name ?? selectedLead.lead.instagram_name ?? selectedLead.lead.username ?? "Unknown"}
                    </h3>
                    <p className="text-sm text-[#8A8A8A] font-mono">
                      IG: {selectedLead.lead.platform_user_id}
                    </p>
                  </div>
                  {getStatusBadge(selectedLead.lead)}
                </div>
                <button
                  onClick={() => setSelectedLead(null)}
                  className="p-2 text-[#8A8A8A] hover:text-[#1A1A1A] hover:bg-[#FDFBF7] rounded-xl transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Content */}
              <div className="flex-1 overflow-y-auto p-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left: Contact Info */}
                  <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white border border-[#EADDCD] rounded-2xl p-5">
                      <h4 className="text-sm uppercase tracking-widest text-[#8A8A8A] font-bold mb-4">Contact</h4>
                      <div className="space-y-3">
                        {selectedLead.lead.phone_e164 && (
                          <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] rounded-xl">
                            <Phone className="w-5 h-5 text-[#CFA052]" />
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A]">Phone</p>
                              <p className="font-mono text-[#1A1A1A]">{selectedLead.lead.phone_e164}</p>
                            </div>
                          </div>
                        )}
                        {selectedLead.lead.instagram_name && (
                          <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] rounded-xl">
                            <User className="w-5 h-5 text-[#CFA052]" />
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A]">Instagram</p>
                              <p className="font-medium text-[#1A1A1A]">@{selectedLead.lead.username ?? selectedLead.lead.instagram_name}</p>
                            </div>
                          </div>
                        )}
                        {selectedLead.lead.city && (
                          <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] rounded-xl">
                            <MapPin className="w-5 h-5 text-[#CFA052]" />
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A]">City</p>
                              <p className="font-medium text-[#1A1A1A]">{selectedLead.lead.city}</p>
                            </div>
                          </div>
                        )}
                        {selectedLead.lead.occasion && (
                          <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] rounded-xl">
                            <Mail className="w-5 h-5 text-[#CFA052]" />
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A]">Occasion</p>
                              <p className="font-medium text-[#1A1A1A]">{selectedLead.lead.occasion}</p>
                            </div>
                          </div>
                        )}
                        {selectedLead.lead.budget && (
                          <div className="flex items-center gap-3 p-3 bg-[#FDFBF7] rounded-xl">
                            <Phone className="w-5 h-5 text-[#CFA052]" />
                            <div>
                              <p className="text-[10px] uppercase tracking-widest text-[#8A8A8A]">Budget</p>
                              <p className="font-medium text-[#1A1A1A]">{selectedLead.lead.budget}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Right: Products & Conversation */}
                    <div className="lg:col-span-2 space-y-6">
                      {/* Products */}
                      <div className="bg-white border border-[#EADDCD] rounded-2xl p-5">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-sm uppercase tracking-widest text-[#8A8A8A] font-bold">Products Asked About</h4>
                          <span className="px-2 py-1 text-[10px] uppercase tracking-widest text-white bg-[#CFA052] rounded-full font-bold">
                            {selectedLead.interests.length}
                          </span>
                        </div>
                        {selectedLead.interests.length === 0 ? (
                          <p className="text-[#8A8A8A] text-center py-8">No products recorded</p>
                        ) : (
                          <div className="space-y-3 max-h-80 overflow-y-auto">
                            {selectedLead.interests.map((interest, i) => (
                              <div key={i} className="p-3 bg-[#FDFBF7] border border-[#EADDCD] rounded-xl">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <span className="w-6 h-6 rounded-full bg-[#CFA052]/10 flex items-center justify-center text-[#CFA052] text-sm font-bold">
                                      {i + 1}
                                    </span>
                                    <div>
                                      <p className="font-medium text-[#1A1A1A]">
                                        {interest.product?.label ?? interest.product?.name ?? "Product"}
                                      </p>
                                      <p className="text-sm text-[#8A8A8A]">
                                        {interest.product?.purity} • {interest.product?.weight_grams ? `${interest.product.weight_grams}g` : "—"}
                                        {interest.product?.calculated_price ? ` • ₹${Number(interest.product.calculated_price).toLocaleString("en-IN")}` : ""}
                                      </p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {interest.selected_at && (
                                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                                    )}
                                    <span className="text-[10px] uppercase tracking-widest text-[#8A8A8A]">
                                      {interest.source}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Conversation */}
                      <div className="bg-white border border-[#EADDCD] rounded-2xl p-5">
                        <h4 className="text-sm uppercase tracking-widest text-[#8A8A8A] font-bold mb-4">Conversation History</h4>
                        {selectedLead.conversations.length === 0 ? (
                          <p className="text-[#8A8A8A] text-center py-8">No messages yet</p>
                        ) : (
                          <div className="space-y-4 max-h-96 overflow-y-auto">
                            {selectedLead.conversations.map((msg) => (
                              <div key={msg.id} className={`p-3 rounded-xl ${
                                msg.status === "human_needed" ? "bg-red-50 border border-red-100" :
                                msg.platform === "instagram_comment" ? "bg-[#FDFBF7] border border-[#EADDCD]" :
                                "bg-white border border-[#EADDCD]"
                              }`}>
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-[10px] uppercase tracking-widest text-[#8A8A8A] font-bold">
                                    {msg.platform === "instagram_comment" ? "Comment" : "DM"}
                                  </span>
                                  <span className="text-[10px] text-[#8A8A8A] font-mono">
                                    {new Date(msg.created_at).toLocaleTimeString("en-IN")}
                                  </span>
                                </div>
                                <p className="text-sm text-[#1A1A1A]">"{msg.human_message}"</p>
                                {msg.ai_response && (
                                  <p className="text-sm text-[#8A8A8A] mt-1 italic">→ "{msg.ai_response.slice(0, 100)}..."</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}