import { Check } from "lucide-react";

export interface StepItem {
  id: string;
  label: string;
  description?: string;
  timestamp?: string;
}

interface StepperProps {
  steps: StepItem[];
  currentIndex: number;
}

export function Stepper({ steps, currentIndex }: StepperProps) {
  return (
    <ol className="flex w-full items-center justify-between gap-2 overflow-x-auto py-1">
      {steps.map((step, idx) => {
        const done = idx < currentIndex;
        const active = idx === currentIndex;
        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                done
                  ? "bg-emerald-600 text-white"
                  : active
                    ? "bg-[#F5B301] text-[#07152B]"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {done ? <Check className="h-4 w-4" /> : idx + 1}
            </div>
            <span
              className={`truncate text-xs font-semibold ${
                active ? "text-[#0B1F3A]" : done ? "text-emerald-700" : "text-slate-400"
              }`}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export function Timeline({ items }: { items: StepItem[] }) {
  return (
    <div className="space-y-4">
      {items.map((item, idx) => (
        <div key={item.id} className="relative flex gap-3 pl-1">
          {idx < items.length - 1 && (
            <span className="absolute left-[11px] top-6 h-[calc(100%-6px)] w-0.5 bg-slate-200" />
          )}
          <span className="mt-1 h-3 w-3 shrink-0 rounded-full border-2 border-[#0B1F3A] bg-[#F5B301]" />
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-[#0B1F3A]">{item.label}</p>
              {item.timestamp && (
                <span className="text-xs text-slate-400">{item.timestamp}</span>
              )}
            </div>
            {item.description && (
              <p className="mt-0.5 text-xs text-slate-600">{item.description}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
