"use client";

import React from "react";

/**
 * Renders chat text cleanly without raw markdown artifacts (`**`, `##`, `*`, `` ` ``).
 * Converts inline **bold** and `code` into clean styled spans and formats
 * bullet/numbered lines into tidy, scannable rows.
 */
function renderInline(text: string): React.ReactNode[] {
  // Strip stray triple backticks or heading hashes if any slipped through
  const cleaned = text.replace(/```[\w]*\n?/g, "").replace(/```/g, "");
  const parts = cleaned.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold text-inherit">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <span key={idx} className="font-medium underline decoration-current/25 underline-offset-2">
          {part.slice(1, -1)}
        </span>
      );
    }
    // Strip any leftover single asterisks used as italic markers
    return <React.Fragment key={idx}>{part.replace(/(?<!\w)\*|\*(?!\w)/g, "")}</React.Fragment>;
  });
}

export function ChatMessageText({
  content,
  isUser = false,
}: {
  content: string;
  isUser?: boolean;
}) {
  const lines = content.replace(/\r\n/g, "\n").split("\n");

  return (
    <div className="space-y-1.5 text-[13px] leading-[1.55]">
      {lines.map((rawLine, idx) => {
        const line = rawLine.trim();
        if (!line) {
          return <div key={idx} className="h-1" />;
        }

        // Convert markdown headings (#, ##, ###) into clean emphasized lines
        const headingMatch = line.match(/^#{1,4}\s+(.+)$/);
        if (headingMatch) {
          return (
            <p
              key={idx}
              className={`pt-1 text-[12.5px] font-bold ${
                isUser ? "text-white" : "text-[#0B1F3A]"
              }`}
            >
              {renderInline(headingMatch[1])}
            </p>
          );
        }

        // Convert markdown bullets (-, *, •) into clean aligned bullets
        const bulletMatch = line.match(/^(?:[-*•])\s+(.+)$/);
        if (bulletMatch) {
          return (
            <div key={idx} className="flex items-start gap-2 pl-0.5">
              <span
                className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${
                  isUser ? "bg-[#F5B301]" : "bg-[#0B1F3A]/45"
                }`}
              />
              <span className="min-w-0 flex-1">{renderInline(bulletMatch[1])}</span>
            </div>
          );
        }

        // Convert numbered items (1., 2.) cleanly
        const numMatch = line.match(/^(\d+\.)\s+(.+)$/);
        if (numMatch) {
          return (
            <div key={idx} className="flex items-start gap-1.5 pl-0.5">
              <span
                className={`shrink-0 font-semibold ${
                  isUser ? "text-[#F5B301]" : "text-[#0B1F3A]"
                }`}
              >
                {numMatch[1]}
              </span>
              <span className="min-w-0 flex-1">{renderInline(numMatch[2])}</span>
            </div>
          );
        }

        return <p key={idx}>{renderInline(line)}</p>;
      })}
    </div>
  );
}
