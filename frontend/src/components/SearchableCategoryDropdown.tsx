import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SearchableCategoryDropdownProps {
  label: string;
  subLabel?: string;
  placeholder: string;
  value: string;
  options: string[];
  isCustom: boolean;
  customValue: string;
  onSelect: (val: string) => void;
  onCustomToggle: (isCustom: boolean) => void;
  onCustomChange: (val: string) => void;
  colorTheme?: "blue" | "indigo" | "emerald" | "purple" | "amber";
  badgeText?: string;
  required?: boolean;
}

export function SearchableCategoryDropdown({
  label,
  subLabel,
  placeholder,
  value,
  options,
  isCustom,
  customValue,
  onSelect,
  onCustomToggle,
  onCustomChange,
  colorTheme = "blue",
  badgeText,
  required = true,
}: SearchableCategoryDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Auto-focus search input when opening
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchTerm("");
    }
  }, [isOpen]);

  // Filtered options based on search input
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const lower = searchTerm.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(lower));
  }, [options, searchTerm]);

  // Color styles
  const themeStyles = {
    blue: {
      accent: "text-blue-500",
      bgSelected: "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold",
      borderActive: "border-blue-500 focus:ring-blue-500",
      badge: "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30",
    },
    indigo: {
      accent: "text-indigo-500",
      bgSelected: "bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 font-bold",
      borderActive: "border-indigo-500 focus:ring-indigo-500",
      badge: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border-indigo-500/30",
    },
    emerald: {
      accent: "text-emerald-500",
      bgSelected: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold",
      borderActive: "border-emerald-500 focus:ring-emerald-500",
      badge: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
    },
    purple: {
      accent: "text-purple-500",
      bgSelected: "bg-purple-500/15 text-purple-600 dark:text-purple-400 font-bold",
      borderActive: "border-purple-500 focus:ring-purple-500",
      badge: "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/30",
    },
    amber: {
      accent: "text-amber-500",
      bgSelected: "bg-amber-500/15 text-amber-600 dark:text-amber-400 font-bold",
      borderActive: "border-amber-500 focus:ring-amber-500",
      badge: "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30",
    },
  }[colorTheme];

  const handleSelectOption = (opt: string) => {
    onSelect(opt);
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelect("");
  };

  return (
    <div className="space-y-1.5 relative" ref={containerRef}>
      {/* Header with Label and Mode Toggle */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex items-center gap-1.5 min-w-0">
          <Label className="text-xs font-bold text-foreground tracking-wide truncate">
            {label} {required && <span className="text-rose-500">*</span>}
          </Label>
          {badgeText && (
            <span
              className={`text-[10px] font-semibold px-1.5 py-0.2 rounded border ${themeStyles.badge} hidden sm:inline-block`}
            >
              {badgeText}
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            onCustomToggle(!isCustom);
            setIsOpen(false);
          }}
          className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline shrink-0"
        >
          {isCustom ? "← Dropdown List" : "+ Custom Text"}
        </button>
      </div>

      {subLabel && <p className="text-[10px] text-muted-foreground -mt-0.5">{subLabel}</p>}

      {/* Mode 1: Custom Text Input */}
      {isCustom ? (
        <div className="relative">
          <Input
            placeholder={`Enter custom ${label.toLowerCase()}...`}
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            className={`h-9 text-xs pr-8 font-medium ${themeStyles.borderActive}`}
            required={required}
            autoFocus
          />
          {customValue && (
            <button
              type="button"
              onClick={() => onCustomChange("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ) : (
        /* Mode 2: Searchable Separate Dropdown */
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`w-full h-9 px-3 rounded-lg border bg-background text-xs text-left font-medium flex items-center justify-between gap-2 transition hover:bg-slate-500/5 focus:outline-none focus:ring-2 ${
              isOpen
                ? `${themeStyles.borderActive} ring-2 ring-blue-500/30`
                : "border-input"
            } ${value ? "text-foreground font-semibold" : "text-muted-foreground"}`}
          >
            <span className="truncate">{value || placeholder}</span>
            <div className="flex items-center gap-1 shrink-0">
              {value && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-0.5 rounded-full hover:bg-slate-500/20 text-muted-foreground hover:text-foreground transition"
                  title="Clear selection"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
              <ChevronDown
                className={`h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-foreground" : ""
                }`}
              />
            </div>
          </button>

          {/* Dropdown Menu Container */}
          {isOpen && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1 rounded-xl border border-border/90 bg-card shadow-2xl backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-100 min-w-[240px]">
              {/* Search Bar inside dropdown */}
              <div className="p-2 border-b border-border/60 bg-slate-500/5 flex items-center gap-2">
                <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={`Search in ${options.length} ${label.toLowerCase()}s...`}
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground focus:outline-none font-medium"
                />
                {searchTerm && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm("")}
                    className="text-muted-foreground hover:text-foreground p-0.5"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>

              {/* Options List */}
              <div className="max-h-56 overflow-y-auto p-1 divide-y divide-border/20 text-xs">
                {filteredOptions.length === 0 ? (
                  <div className="p-3 text-center text-muted-foreground space-y-2">
                    <p className="text-xs">No "{searchTerm}" found.</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onCustomToggle(true);
                        onCustomChange(searchTerm);
                        setIsOpen(false);
                      }}
                      className="h-7 text-[11px] font-bold w-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add "{searchTerm}" as Custom
                    </Button>
                  </div>
                ) : (
                  filteredOptions.slice(0, 150).map((opt) => {
                    const isSelected = value === opt;
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => handleSelectOption(opt)}
                        className={`w-full px-2.5 py-1.5 rounded-md text-left flex items-center justify-between gap-2 transition hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 ${
                          isSelected ? themeStyles.bgSelected : "text-foreground"
                        }`}
                      >
                        <span className="truncate">{opt}</span>
                        {isSelected && <Check className="h-3.5 w-3.5 shrink-0 text-blue-600 dark:text-blue-400" />}
                      </button>
                    );
                  })
                )}
                {filteredOptions.length > 150 && (
                  <div className="p-2 text-center text-[10px] text-muted-foreground bg-slate-500/5">
                    Showing 150 of {filteredOptions.length} matching options. Type to narrow search.
                  </div>
                )}
              </div>

              {/* Bottom bar with Quick Custom Switch */}
              <div className="p-2 bg-slate-500/10 border-t border-border/60 flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">
                  {options.length} {label.toLowerCase()} options
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onCustomToggle(true);
                    setIsOpen(false);
                  }}
                  className="text-[11px] font-bold text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                >
                  <Plus className="h-3 w-3" />
                  Type New Option
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
