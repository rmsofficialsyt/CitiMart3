import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A single-choice set (2-7 options) rendered as chip-styled native radios
 * inside a <fieldset>/<legend> (modern-web-guidance "forms": 2-5 exclusive
 * options -> visible radio buttons). The old <button> rows exposed no
 * selected state to assistive tech and weren't one Tab stop; native radios
 * give a group name, arrow-key movement and a checked state for free. The
 * selected chip also shows a check mark so the choice isn't signalled by
 * colour alone.
 */
export interface ChoiceOption<T extends string> {
  value: T;
  label: string;
  /** Classes for the selected state (defaults to indigo). */
  activeClass?: string;
}

interface ChoiceChipsProps<T extends string> {
  legend: string;
  /** Visually hide the legend (it is still read out), e.g. inside a table row. */
  legendHidden?: boolean;
  name: string;
  value: T | undefined;
  options: ChoiceOption<T>[];
  onChange: (value: T) => void;
  className?: string;
}

export function ChoiceChips<T extends string>({
  legend,
  legendHidden = false,
  name,
  value,
  options,
  onChange,
  className,
}: ChoiceChipsProps<T>) {
  return (
    <fieldset className={cn("min-w-0", className)}>
      <legend className={legendHidden ? "sr-only" : "mb-1.5 text-xs font-semibold text-foreground"}>{legend}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <label
              key={opt.value}
              className={cn(
                "inline-flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1 text-[11px] font-bold transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-ring",
                selected
                  ? opt.activeClass ?? "border-indigo-600 bg-indigo-600 text-white shadow-sm"
                  : "border-border bg-background text-muted-foreground hover:text-foreground",
              )}
            >
              <input
                type="radio"
                className="sr-only"
                name={name}
                value={opt.value}
                checked={selected}
                onChange={() => onChange(opt.value)}
              />
              {selected && <Check className="h-3 w-3" aria-hidden="true" />}
              {opt.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
