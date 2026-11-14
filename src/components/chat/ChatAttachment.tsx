"use client";

import Image from "next/image";
import { Check, CheckCheck, Download, FileText, Paperclip, X } from "lucide-react";
import type { ChatAttachment } from "@/lib/marketplace";

export interface ChatPresenceState {
  adminOnline: boolean;
  plumberOnline: boolean;
  customerOnline: boolean;
  onlinePlumberIds: string[];
  onlineCustomerIds: string[];
  lastSeenMap?: Record<string, string>;
}

export function MessageReceiptTick({
  status,
  isRead = false,
  isDelivered = false,
  light = false,
}: {
  status?: "sent" | "delivered" | "read";
  isRead?: boolean;
  isDelivered?: boolean;
  isRecipientOnline?: boolean;
  light?: boolean;
}) {
  const resolved = status || (isRead ? "read" : isDelivered ? "delivered" : "sent");
  if (resolved === "read") {
    return (
      <span title="Read" aria-label="Read" className="inline-flex items-center">
        <CheckCheck className="h-3.5 w-3.5 text-sky-400" />
      </span>
    );
  }
  if (resolved === "delivered") {
    return (
      <span title="Delivered" aria-label="Delivered" className="inline-flex items-center">
        <CheckCheck
          className={`h-3.5 w-3.5 ${light ? "text-slate-300" : "text-slate-400"}`}
        />
      </span>
    );
  }
  return (
    <span title="Sent" aria-label="Sent" className="inline-flex items-center">
      <Check
        className={`h-3.5 w-3.5 ${light ? "text-slate-300" : "text-slate-400"}`}
      />
    </span>
  );
}

export const MAX_CHAT_FILE_BYTES = 20 * 1024 * 1024; // 20 MB

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export async function uploadChatFile(
  file: File,
  ticketNumber?: string,
  role?: "admin" | "customer" | "plumber"
): Promise<ChatAttachment> {
  if (file.size > MAX_CHAT_FILE_BYTES) {
    throw new Error("File size must not exceed 20 MB.");
  }
  const formData = new FormData();
  formData.append("file", file);
  if (ticketNumber) formData.append("ticketNumber", ticketNumber);
  if (role) formData.append("role", role);

  const res = await fetch("/api/chat/upload", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || "Could not upload file.");
  }

  return data as ChatAttachment;
}

export function PendingAttachmentPill({
  file,
  onRemove,
}: {
  file: File;
  onRemove: () => void;
}) {
  return (
    <div className="inline-flex max-w-full items-center gap-2 rounded-xl border border-[#0B1F3A]/15 bg-[#F4F6F9] px-3 py-1.5 text-xs text-[#0B1F3A]">
      <Paperclip className="h-3.5 w-3.5 shrink-0 text-[#0B1F3A]" />
      <span className="truncate font-semibold max-w-[200px]">{file.name}</span>
      <span className="shrink-0 text-slate-500">({formatFileSize(file.size)})</span>
      <button
        type="button"
        onClick={onRemove}
        aria-label="Remove attachment"
        className="ml-1 rounded-full p-0.5 text-slate-500 hover:bg-slate-200 hover:text-slate-800"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ChatAttachmentBubble({
  attachment,
  isDark = false,
}: {
  attachment: ChatAttachment;
  isDark?: boolean;
}) {
  const isImage = attachment.mimeType?.startsWith("image/");

  if (isImage) {
    return (
      <a
        href={attachment.url}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1.5 block overflow-hidden rounded-xl border border-black/10"
      >
        <Image
          src={attachment.url}
          alt={attachment.name}
          width={400}
          height={240}
          unoptimized
          className="max-h-56 w-full object-cover"
        />
        <div
          className={`flex items-center justify-between gap-2 px-2.5 py-1.5 text-[11px] ${
            isDark ? "bg-white/10 text-slate-200" : "bg-slate-100 text-slate-700"
          }`}
        >
          <span className="truncate font-medium">{attachment.name}</span>
          <span className="shrink-0 opacity-75">{formatFileSize(attachment.size)}</span>
        </div>
      </a>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noopener noreferrer"
      className={`mt-1.5 flex items-center gap-2.5 rounded-xl border px-3 py-2 text-xs transition ${
        isDark
          ? "border-white/15 bg-white/10 text-white hover:bg-white/15"
          : "border-slate-200 bg-slate-50 text-[#0B1F3A] hover:bg-slate-100"
      }`}
    >
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          isDark ? "bg-white/15 text-[#F5B301]" : "bg-[#0B1F3A]/10 text-[#0B1F3A]"
        }`}
      >
        <FileText className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{attachment.name}</p>
        <p className={`text-[11px] ${isDark ? "text-slate-300" : "text-slate-500"}`}>
          {formatFileSize(attachment.size)}
        </p>
      </div>
      <Download className="h-4 w-4 shrink-0 opacity-75" />
    </a>
  );
}
