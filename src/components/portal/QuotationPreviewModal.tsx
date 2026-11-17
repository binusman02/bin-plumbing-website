"use client";

import Image from "next/image";
import { Printer, X } from "lucide-react";
import { formatDateTime, formatNGN } from "@/lib/currency";
import type { QuotationLineItem } from "@/lib/quotation-items";
import { getStatusMeta } from "@/lib/status-styles";

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

export function QuotationPreviewModal({ quote, onClose }: QuotationPreviewModalProps) {
  if (!quote) return null;

  const items = (quote.items || []).filter((it) => it.name.trim().length > 0);
  const statusBadge = quote.isDraftPreview
    ? { label: "Draft Preview", className: "bg-amber-100 text-amber-800" }
    : getStatusMeta(quote.status || "pending");

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
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
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#F5B301] px-3.5 text-xs font-bold text-[#07152B] hover:bg-[#e5a700]"
              >
                <Printer className="h-3.5 w-3.5" /> Print / Save PDF
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
            <div className="flex flex-wrap items-start justify-between gap-4 border-b-2 border-[#0B1F3A] pb-5">
              <div className="flex items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-[#F5B301] bg-white">
                  <Image
                    src="/images/logo/bin-plumbing-logo.jpg"
                    alt="FlowGuard Plumbing Enterprises"
                    width={48}
                    height={48}
                    className="h-full w-full scale-[1.08] object-cover"
                  />
                </div>
                <div>
                  <h2 className="text-base font-extrabold tracking-wide text-[#0B1F3A]">
                    FlowGuard Plumbing Enterprises
                  </h2>
                  <p className="text-xs text-slate-500">
                    Professional Plumbing & Water Systems Engineering
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Official Quotation
                </p>
                <p className="font-mono text-sm font-bold text-[#0B1F3A]">
                  {quote.ticketNumber} • Rev #{quote.revisionNumber || 1}
                </p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {quote.createdAt ? formatDateTime(quote.createdAt) : formatDateTime(new Date().toISOString())}
                </p>
                <span
                  className={`mt-1.5 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${statusBadge.className}`}
                >
                  {statusBadge.label}
                </span>
              </div>
            </div>

            {/* Client & Job Metadata */}
            <div className="mt-5 grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs sm:grid-cols-2">
              <div className="space-y-1">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Prepared For
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
                <p className="text-slate-600">Assigned Plumber: {quote.plumberName}</p>
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
