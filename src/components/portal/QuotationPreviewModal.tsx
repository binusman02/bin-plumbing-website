"use client";

import Image from "next/image";
import { Printer, X } from "lucide-react";
import { formatDateTime, formatNGN } from "@/lib/currency";
import type { QuotationLineItem } from "@/lib/quotation-items";

export interface QuotationPreviewData {
  id?: string;
  ticketNumber: string;
  revisionNumber?: number;
  createdAt?: string;
  status?: "pending" | "approved" | "rejected";
  plumberName: string;
  customerName?: string;
  customerPhone?: string;
  customerAddress?: string;
  serviceCategory?: string;
  labourCharge: number;
  materialsCost: number;
  transportCharge: number;
  otherCharges: number;
  totalAmount: number;
  items?: QuotationLineItem[];
  notes?: string;
  isDraftPreview?: boolean;
}

interface QuotationPreviewModalProps {
  quote: QuotationPreviewData | null;
  onClose: () => void;
}

function escapeHtml(value: string): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function QuotationPreviewModal({ quote, onClose }: QuotationPreviewModalProps) {
  if (!quote) return null;

  const items = (quote.items || []).filter((it) => it.name.trim().length > 0);
  const statusBadge = quote.isDraftPreview
    ? { label: "Draft", className: "bg-amber-100 text-amber-800" }
    : quote.status === "approved"
      ? { label: "Approved", className: "bg-emerald-100 text-emerald-800" }
      : quote.status === "rejected"
        ? { label: "Declined", className: "bg-red-100 text-red-700" }
        : { label: "Pending", className: "bg-amber-100 text-amber-800" };

  const handlePrint = () => {
    if (typeof window === "undefined") return;
    const node = document.getElementById("bp-printable-quote");
    if (!node) {
      window.print();
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    if (!doc) {
      document.body.removeChild(iframe);
      window.print();
      return;
    }

    const itemRowsHtml =
      items.length > 0
        ? items
            .map((item) => {
              const qty = Math.max(1, Number(item.quantity) || 1);
              const unit = Math.max(0, Number(item.unitPrice) || 0);
              return `<tr>
                <td>${escapeHtml(item.name)}</td>
                <td class="c">${qty}</td>
                <td class="r">${escapeHtml(formatNGN(unit))}</td>
                <td class="r b">${escapeHtml(formatNGN(qty * unit))}</td>
              </tr>`;
            })
            .join("")
        : quote.materialsCost > 0
          ? `<tr>
              <td>Materials &amp; Plumbing Supplies</td>
              <td class="c">1</td>
              <td class="r">${escapeHtml(formatNGN(quote.materialsCost))}</td>
              <td class="r b">${escapeHtml(formatNGN(quote.materialsCost))}</td>
            </tr>`
          : "";

    const origin = window.location.origin;
    const dateStr = quote.createdAt
      ? formatDateTime(quote.createdAt)
      : formatDateTime(new Date().toISOString());

    doc.open();
    doc.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Quotation ${escapeHtml(quote.ticketNumber)} - FlowGuard</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
    body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0B1F3A; background: #fff; font-size: 12px; line-height: 1.45; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; border-bottom: 2px solid #0B1F3A; padding-bottom: 14px; }
    .brand { display: flex; align-items: center; gap: 12px; }
    .logo { width: 48px; height: 48px; border-radius: 999px; border: 2px solid #F5B301; object-fit: cover; }
    .brand h1 { margin: 0; font-size: 16px; font-weight: 800; color: #0B1F3A; }
    .brand p { margin: 2px 0 0; font-size: 11px; color: #64748b; }
    .meta-r { text-align: right; }
    .doc-label { margin: 0; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #94a3b8; }
    .ticket { margin: 2px 0 0; font-family: monospace; font-size: 13px; font-weight: 700; color: #0B1F3A; }
    .date { margin: 2px 0 6px; font-size: 11px; color: #64748b; }
    .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; background: #FEF3C7; color: #92400E; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 16px; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #f8fafc; }
    .grid-r { text-align: right; }
    .lbl { margin: 0 0 4px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #94a3b8; }
    .val-b { margin: 0 0 2px; font-size: 13px; font-weight: 700; color: #0B1F3A; }
    .val { margin: 0 0 2px; color: #475569; }
    table { width: 100%; border-collapse: collapse; margin-top: 18px; border: 1px solid #e2e8f0; }
    thead tr { background: #0B1F3A; color: #fff; }
    th { padding: 9px 12px; font-size: 11px; font-weight: 700; text-align: left; }
    td { padding: 8px 12px; border-top: 1px solid #f1f5f9; }
    .c { text-align: center; }
    .r { text-align: right; }
    .b { font-weight: 700; }
    .sub { background: #f8fafc; }
    tfoot tr { border-top: 2px solid #0B1F3A; background: #FFFBEB; }
    tfoot td { padding: 10px 12px; font-weight: 800; font-size: 14px; color: #0B1F3A; }
    .notes { margin-top: 14px; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc; }
    .notes-t { margin: 0 0 4px; font-weight: 700; color: #0B1F3A; }
    .footer { margin-top: 22px; padding-top: 10px; border-top: 1px solid #e2e8f0; text-align: center; font-size: 10px; color: #94a3b8; }
  </style>
</head>
<body>
  <div class="header">
    <div class="brand">
      <img class="logo" src="${origin}/images/logo/flowguard-icon.jpg" alt="FlowGuard" />
      <h1>FlowGuard Plumbing</h1>
    </div>
    <div class="meta-r">
      <p class="doc-label">QUOTATION</p>
      <p class="ticket">#${escapeHtml(quote.ticketNumber)}</p>
      <span class="badge">${escapeHtml(statusBadge.label)}</span>
    </div>
  </div>

  <div class="grid">
    <div>
      <p class="lbl">Customer</p>
      <p class="val-b">${escapeHtml(quote.customerName || "Valued Customer")}</p>
      ${quote.customerPhone ? `<p class="val">${escapeHtml(quote.customerPhone)}</p>` : ""}
      ${quote.customerAddress ? `<p class="val">${escapeHtml(quote.customerAddress)}</p>` : ""}
    </div>
    <div class="grid-r">
      <p class="lbl">Service &amp; Technician</p>
      <p class="val-b">${escapeHtml(quote.serviceCategory || "Plumbing Service")}</p>
      <p class="val">Plumber: ${escapeHtml(quote.plumberName)}</p>
      <p class="val">${escapeHtml(dateStr)} • Rev #${quote.revisionNumber || 1}</p>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Item / Description</th>
        <th class="c">Qty</th>
        <th class="r">Unit Price</th>
        <th class="r">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${itemRowsHtml}
      <tr class="sub">
        <td class="b">Labour / Workmanship</td>
        <td class="c">1</td>
        <td class="r">${escapeHtml(formatNGN(quote.labourCharge))}</td>
        <td class="r b">${escapeHtml(formatNGN(quote.labourCharge))}</td>
      </tr>
      ${
        quote.transportCharge > 0
          ? `<tr class="sub">
              <td>Transport / Logistics</td>
              <td class="c">1</td>
              <td class="r">${escapeHtml(formatNGN(quote.transportCharge))}</td>
              <td class="r b">${escapeHtml(formatNGN(quote.transportCharge))}</td>
            </tr>`
          : ""
      }
      ${
        quote.otherCharges > 0
          ? `<tr class="sub">
              <td>Other Charges</td>
              <td class="c">1</td>
              <td class="r">${escapeHtml(formatNGN(quote.otherCharges))}</td>
              <td class="r b">${escapeHtml(formatNGN(quote.otherCharges))}</td>
            </tr>`
          : ""
      }
    </tbody>
    <tfoot>
      <tr>
        <td colspan="3" class="r">Total Quotation Amount</td>
        <td class="r">${escapeHtml(formatNGN(quote.totalAmount))}</td>
      </tr>
    </tfoot>
  </table>

  ${
    quote.notes
      ? `<div class="notes"><p class="notes-t">Work Scope &amp; Notes</p><p style="margin:0;white-space:pre-wrap;">${escapeHtml(quote.notes)}</p></div>`
      : ""
  }

  <div class="footer">FlowGuard Plumbing Enterprises • Generated for Ticket ${escapeHtml(quote.ticketNumber)}</div>
</body>
</html>`);
    doc.close();

    setTimeout(() => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } finally {
        setTimeout(() => {
          if (iframe.parentNode) document.body.removeChild(iframe);
        }, 1500);
      }
    }, 250);
  };

  return (
    <>
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #bp-printable-quote,
          #bp-printable-quote * {
            visibility: visible !important;
          }
          #bp-printable-quote {
            position: fixed !important;
            inset: 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            margin: 0 !important;
            padding: 24px !important;
            background: #ffffff !important;
            box-shadow: none !important;
            border: none !important;
            overflow: visible !important;
            z-index: 99999 !important;
          }
        }
      `}</style>

      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/60 p-3 sm:p-6">
        <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          {/* Top Action Bar (Hidden when printing) */}
          <div className="flex items-center justify-between border-b border-slate-200 bg-[#0B1F3A] px-5 py-3 text-white print:hidden">
            <div>
              <h3 className="text-sm font-bold">
                {quote.isDraftPreview ? "Quotation Preview (Before Submitting)" : "Itemised Quotation"}
              </h3>
              <p className="text-[11px] text-slate-300">
                {quote.ticketNumber} • Rev #{quote.revisionNumber || 1}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handlePrint}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F5B301] px-3.5 text-xs font-bold text-[#07152B] hover:bg-[#e5a700]"
              >
                <Printer className="h-3.5 w-3.5 shrink-0" /> Print
              </button>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close quotation preview"
                className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/15 bg-white/10 text-white hover:bg-white/20"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Printable Quotation Sheet */}
          <div id="bp-printable-quote" className="flex-1 overflow-y-auto bg-white p-6 sm:p-8">
            {/* Branded Letterhead */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#0B1F3A] pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#F5B301] bg-white">
                  <Image
                    src="/images/logo/flowguard-icon.jpg"
                    alt="FlowGuard Plumbing"
                    width={44}
                    height={44}
                    className="h-full w-full scale-[1.08] object-cover"
                  />
                </div>
                <h2 className="text-base font-extrabold tracking-wide text-[#0B1F3A]">
                  FlowGuard Plumbing
                </h2>
              </div>
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  QUOTATION
                </p>
                <p className="font-mono text-sm font-bold text-[#0B1F3A]">
                  #{quote.ticketNumber}
                </p>
                <span
                  className={`mt-1 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </span>
              </div>
            </div>

            {/* Client & Job Metadata */}
            <div className="mt-4 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Customer
                </p>
                <p className="text-sm font-bold text-[#0B1F3A]">
                  {quote.customerName || "Valued Customer"}
                </p>
                {quote.customerPhone && <p className="text-slate-600">{quote.customerPhone}</p>}
                {quote.customerAddress && <p className="text-slate-600">{quote.customerAddress}</p>}
              </div>
              <div className="space-y-1 sm:text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Service & Technician
                </p>
                <p className="text-sm font-bold text-[#0B1F3A]">
                  {quote.serviceCategory || "Plumbing Service"}
                </p>
                <p className="text-slate-600">Plumber: {quote.plumberName}</p>
                <p className="text-[11px] text-slate-500">
                  {(quote.createdAt ? formatDateTime(quote.createdAt) : formatDateTime(new Date().toISOString()))} • Rev #{quote.revisionNumber || 1}
                </p>
              </div>
            </div>

            {/* Itemised Table */}
            <div className="mt-6 overflow-hidden rounded-xl border border-slate-200">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-[#0B1F3A] text-white">
                    <th className="px-4 py-2.5 font-semibold">Item / Description</th>
                    <th className="px-3 py-2.5 text-center font-semibold">Qty</th>
                    <th className="px-3 py-2.5 text-right font-semibold">Unit Price</th>
                    <th className="px-4 py-2.5 text-right font-semibold">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {items.length > 0 ? (
                    items.map((item, idx) => {
                      const qty = Math.max(1, Number(item.quantity) || 1);
                      const unit = Math.max(0, Number(item.unitPrice) || 0);
                      return (
                        <tr key={item.id || idx} className="bg-white">
                          <td className="px-4 py-2.5 font-medium text-slate-800">{item.name}</td>
                          <td className="px-3 py-2.5 text-center text-slate-600">{qty}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">
                            {formatNGN(unit)}
                          </td>
                          <td className="px-4 py-2.5 text-right font-semibold text-[#0B1F3A]">
                            {formatNGN(qty * unit)}
                          </td>
                        </tr>
                      );
                    })
                  ) : quote.materialsCost > 0 ? (
                    <tr className="bg-white">
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        Materials & Plumbing Supplies
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600">1</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {formatNGN(quote.materialsCost)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#0B1F3A]">
                        {formatNGN(quote.materialsCost)}
                      </td>
                    </tr>
                  ) : null}

                  <tr className="bg-slate-50/60">
                    <td className="px-4 py-2.5 font-semibold text-[#0B1F3A]">
                      Labour / Workmanship
                    </td>
                    <td className="px-3 py-2.5 text-center text-slate-600">1</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">
                      {formatNGN(quote.labourCharge)}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold text-[#0B1F3A]">
                      {formatNGN(quote.labourCharge)}
                    </td>
                  </tr>

                  {quote.transportCharge > 0 && (
                    <tr className="bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-800">
                        Transport / Logistics
                      </td>
                      <td className="px-3 py-2.5 text-center text-slate-600">1</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {formatNGN(quote.transportCharge)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#0B1F3A]">
                        {formatNGN(quote.transportCharge)}
                      </td>
                    </tr>
                  )}

                  {quote.otherCharges > 0 && (
                    <tr className="bg-slate-50/60">
                      <td className="px-4 py-2.5 font-medium text-slate-800">Other Charges</td>
                      <td className="px-3 py-2.5 text-center text-slate-600">1</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">
                        {formatNGN(quote.otherCharges)}
                      </td>
                      <td className="px-4 py-2.5 text-right font-semibold text-[#0B1F3A]">
                        {formatNGN(quote.otherCharges)}
                      </td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[#0B1F3A] bg-amber-50/70">
                    <td colSpan={3} className="px-4 py-3 text-right text-sm font-bold text-[#0B1F3A]">
                      Total Quotation Amount
                    </td>
                    <td className="px-4 py-3 text-right text-base font-extrabold text-[#0B1F3A]">
                      {formatNGN(quote.totalAmount)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {quote.notes && (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                <p className="font-bold text-[#0B1F3A]">Work Scope & Notes</p>
                <p className="mt-1 whitespace-pre-wrap text-slate-700">{quote.notes}</p>
              </div>
            )}

            <p className="mt-6 border-t border-slate-200 pt-3 text-center text-[11px] text-slate-400">
              FlowGuard Plumbing Enterprises • Generated for Ticket {quote.ticketNumber}
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
