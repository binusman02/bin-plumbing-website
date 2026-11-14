"use client";

import { Search, User } from "lucide-react";
import { MessageReceiptTick } from "@/components/chat/ChatAttachment";
import { formatDateTime } from "@/lib/currency";
import {
  type ChatContactItem,
  getInitials,
  UNASSIGNED_CHAT_ID,
} from "@/components/admin/communications/chat-helpers";

interface ChatContactSidebarProps {
  contacts: ChatContactItem[];
  selectedPlumberId: string | null;
  search: string;
  onSearchChange: (val: string) => void;
  onSelect: (id: string) => void;
  onlinePlumberIds: string[];
  plumberOnline: boolean;
  customerOnline: boolean;
}

export function ChatContactSidebar({
  contacts,
  selectedPlumberId,
  search,
  onSearchChange,
  onSelect,
  onlinePlumberIds,
  plumberOnline,
  customerOnline,
}: ChatContactSidebarProps) {
  return (
    <aside
      className={`${
        selectedPlumberId ? "hidden md:flex" : "flex"
      } w-full shrink-0 flex-col border-r border-slate-200/80 bg-white md:w-80 lg:w-[340px]`}
    >
      <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold tracking-tight text-[#0B1F3A]">Conversations</h2>
          <span className="rounded-full bg-[#0B1F3A]/10 px-2.5 py-0.5 text-xs font-semibold text-[#0B1F3A]">
            {contacts.length}
          </span>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Search plumber, customer, ticket..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#F5B301] focus:outline-none focus:ring-2 focus:ring-[#F5B301]/20"
          />
        </div>
      </div>

      <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
        {contacts.length === 0 ? (
          <div className="p-8 text-center text-sm text-slate-500">
            No matching plumbers or conversations found.
          </div>
        ) : (
          contacts.map((contact) => {
            const isSelected = contact.id === selectedPlumberId;
            return (
              <button
                key={contact.id}
                type="button"
                onClick={() => onSelect(contact.id)}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-all ${
                  isSelected
                    ? "border-l-4 border-l-[#F5B301] bg-[#0B1F3A]/[0.04]"
                    : "hover:bg-slate-50/80"
                }`}
              >
                <div className="relative shrink-0">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-full text-sm font-bold shadow-xs ${
                      contact.id === UNASSIGNED_CHAT_ID
                        ? "bg-amber-100 text-amber-800"
                        : "bg-gradient-to-br from-[#0B1F3A] to-[#173561] text-[#F5B301]"
                    }`}
                  >
                    {contact.id === UNASSIGNED_CHAT_ID ? (
                      <User className="h-5 w-5" />
                    ) : (
                      getInitials(contact.name)
                    )}
                  </div>
                  {contact.id !== UNASSIGNED_CHAT_ID &&
                    onlinePlumberIds.includes(contact.id) && (
                      <span
                        title="Online"
                        className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white bg-emerald-500"
                      />
                    )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-bold text-[#0B1F3A]">{contact.name}</p>
                    {contact.lastAt && (
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {formatDateTime(contact.lastAt).split(",")[0]}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[11px] font-medium text-slate-500">
                    {contact.subtitle}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="truncate text-xs text-slate-600">{contact.lastMessage}</p>
                    {contact.unrepliedCount > 0 ? (
                      <span className="inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full bg-[#F5B301] px-1.5 text-[11px] font-bold text-[#0B1F3A] shadow-xs">
                        {contact.unrepliedCount}
                      </span>
                    ) : contact.hasMessages ? (
                      <MessageReceiptTick
                        isRead={contact.lastReadByRecipient}
                        isRecipientOnline={
                          contact.id === UNASSIGNED_CHAT_ID
                            ? customerOnline
                            : onlinePlumberIds.includes(contact.id) || plumberOnline
                        }
                      />
                    ) : null}
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}
