"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export interface ClassicSelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface ClassicSelectProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (value: string) => void;
  options: ClassicSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  size?: "sm" | "md";
  variant?: "light" | "dark";
  className?: string;
  ariaLabel?: string;
}

export function ClassicSelect({
  id,
  name,
  value,
  onChange,
  options,
  placeholder = "Select an option",
  disabled = false,
  required = false,
  size = "md",
  variant = "light",
  className = "",
  ariaLabel,
}: ClassicSelectProps) {
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState<number>(-1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const listId = useId();

  const selectedOption = options.find((opt) => opt.value === value);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const handleToggle = () => {
    if (disabled) return;
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        const idx = options.findIndex((o) => o.value === value);
        setHighlightedIdx(idx >= 0 ? idx : 0);
      }
      return next;
    });
  };

  const handleTriggerKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        const idx = options.findIndex((o) => o.value === value);
        setHighlightedIdx(idx >= 0 ? idx : 0);
        setOpen(true);
        return;
      }
      const step = e.key === "ArrowDown" ? 1 : -1;
      setHighlightedIdx((prev) => {
        if (options.length === 0) return -1;
        let next = (prev + step + options.length) % options.length;
        let guard = 0;
        while (options[next]?.disabled && guard < options.length) {
          next = (next + step + options.length) % options.length;
          guard += 1;
        }
        return next;
      });
    } else if (e.key === "Enter" || e.key === " ") {
      if (open && highlightedIdx >= 0 && options[highlightedIdx] && !options[highlightedIdx].disabled) {
        e.preventDefault();
        onChange(options[highlightedIdx].value);
        setOpen(false);
      }
    }
  };

  const sizeClass =
    size === "sm"
      ? "h-9 px-3 text-xs rounded-lg"
      : "h-10 px-3.5 text-sm rounded-xl";

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value}
          required={required}
        />
      )}
      <button
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-label={ariaLabel}
        onClick={handleToggle}
        onKeyDown={handleTriggerKeyDown}
        className={`flex w-full items-center justify-between gap-2 border text-left font-medium transition-colors focus:outline-none ${sizeClass} ${
          variant === "dark"
            ? open
              ? "border-[#F5B301] bg-white/10 text-white ring-2 ring-[#F5B301]/25"
              : "border-white/20 bg-white/10 text-white hover:border-white/35 focus:border-[#F5B301] focus:ring-2 focus:ring-[#F5B301]/25"
            : open
              ? "border-[#0B1F3A] bg-white text-[#0B1F3A] ring-2 ring-[#0B1F3A]/15"
              : "border-slate-300 bg-white text-[#0B1F3A] hover:border-slate-400 focus:border-[#0B1F3A] focus:ring-2 focus:ring-[#0B1F3A]/15"
        } ${disabled ? "cursor-not-allowed bg-slate-100 text-slate-400" : "cursor-pointer"}`}
      >
        <span
          className={`truncate ${
            variant === "dark"
              ? selectedOption
                ? "text-white"
                : "text-slate-300"
              : selectedOption
                ? "text-[#0B1F3A]"
                : "text-slate-400"
          }`}
        >
          {selectedOption ? selectedOption.label : placeholder}
        </span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 transition-transform duration-150 ${
            variant === "dark" ? "text-slate-300" : "text-slate-500"
          } ${open ? (variant === "dark" ? "rotate-180 text-[#F5B301]" : "rotate-180 text-[#0B1F3A]") : ""}`}
        />
      </button>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-[80] mt-1.5 max-h-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-[0_12px_32px_rgba(11,31,58,0.14)] ring-1 ring-black/5"
        >
          {options.map((opt, idx) => {
            const isSelected = opt.value === value;
            const isHighlighted = idx === highlightedIdx;
            return (
              <li
                key={`${opt.value}-${idx}`}
                role="option"
                aria-selected={isSelected}
                aria-disabled={opt.disabled}
                onMouseEnter={() => {
                  if (!opt.disabled) setHighlightedIdx(idx);
                }}
                onClick={() => {
                  if (opt.disabled) return;
                  onChange(opt.value);
                  setOpen(false);
                }}
                className={`flex items-center justify-between gap-2 rounded-lg px-3 py-2 text-sm transition-colors ${
                  opt.disabled
                    ? "cursor-not-allowed text-slate-300"
                    : isSelected
                      ? "cursor-pointer bg-[#0B1F3A] font-semibold text-white"
                      : isHighlighted
                        ? "cursor-pointer bg-[#F5B301]/15 font-medium text-[#0B1F3A]"
                        : "cursor-pointer text-slate-700 hover:bg-[#F5B301]/15 hover:text-[#0B1F3A]"
                }`}
              >
                <span className="truncate">{opt.label}</span>
                {isSelected && <Check className="h-4 w-4 shrink-0 text-[#F5B301]" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
