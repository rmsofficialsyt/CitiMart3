import { Check, ChevronDown, ChevronRight, Layers, Plus, Search, X } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { RequisitionLineOption } from "@/lib/types";

interface SearchableRequisitionLineDropdownProps {
  label?: string;
  subLabel?: string;
  placeholder?: string;
  selectedDivision: string;
  selectedSection: string;
  selectedDepartment: string;
  isCustom: boolean;
  customValue: string;
  options: RequisitionLineOption[];
  onSelectLine: (line: { division: string; section: string; department: string }) => void;
  onCustomToggle: (isCustom: boolean) => void;
  onCustomChange: (val: string) => void;
  required?: boolean;
}

export function SearchableRequisitionLineDropdown({
  label = "PRODUCT REQUISITION HIERARCHY",
  subLabel = "Select from 700+ predefined Excel lines (<DIVISION> ➔ <SECTION> ➔ <DEPARTMENT>)",
  placeholder = "-- Select / Search Unified Product Line (e.g. Accoessories ➔ Gift & Novelties ➔ Books) --",
  selectedDivision,
  selectedSection,
  selectedDepartment,
  isCustom,
  customValue,
  options,
  onSelectLine,
  onCustomToggle,
  onCustomChange,
  required = true,
}: SearchableRequisitionLineDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close when clicking outside
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

  const hasSelection = Boolean(selectedDivision && selectedSection && selectedDepartment);

  // Filter options based on search query (matches across division, section, or department)
  const filteredOptions = useMemo(() => {
    if (!searchTerm.trim()) return options;
    const tokens = searchTerm.toLowerCase().trim().split(/\s+/);
    return options.filter((opt) => {
      const combined = `${opt.division} ${opt.section} ${opt.department} ${opt.label}`.toLowerCase();
      return tokens.every((token) => combined.includes(token));
    });
  }, [options, searchTerm]);

  const handleSelect = (opt: RequisitionLineOption) => {
    onSelectLine({
      division: opt.division,
      section: opt.section,
      department: opt.department,
    });
    setIsOpen(false);
    setSearchTerm("");
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectLine({ division: "", section: "", department: "" });
  };

  return (
    <div className="space-y-1.5 relative" ref={containerRef}>
      {/* Label and Mode Toggle */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Label className="text-xs font-bold text-foreground tracking-wide flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-blue-500" />
            {label} {required && <span className="text-rose-500">*</span>}
          </Label>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 font-mono hidden sm:inline-block">
            {options.length || 713} unique lines
          </span>
        </div>

        <button
          type="button"
          onClick={() => {
            onCustomToggle(!isCustom);
            setIsOpen(false);
          }}
          className="text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline shrink-0"
        >
          {isCustom ? "← Unified Dropdown List" : "+ Custom / Manual Hierarchy"}
        </button>
      </div>

      {subLabel && <p className="text-[11px] text-muted-foreground -mt-0.5">{subLabel}</p>}

      {/* Mode 1: Custom Text Input */}
      {isCustom ? (
        <div className="relative">
          <Input
            placeholder="e.g. Men's Wear -> Casual Wear -> Printed Shirts"
            value={customValue}
            onChange={(e) => onCustomChange(e.target.value)}
            className="h-10 text-xs pr-8 font-mono border-blue-500/60 focus:ring-blue-500"
            required={required}
            autoFocus
          />
          {customValue && (
            <button
              type="button"
              onClick={() => onCustomChange("")}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ) : (
        /* Mode 2: Unified Searchable Dropdown */
        <div className="relative">
          <button
            type="button"
            onClick={() => setIsOpen((prev) => !prev)}
            className={`w-full min-h-[42px] py-1.5 px-3 rounded-xl border bg-background text-xs text-left transition hover:bg-slate-500/5 focus:outline-none focus:ring-2 ${
              isOpen ? "border-blue-500 ring-2 ring-blue-500/30" : "border-input"
            } flex items-center justify-between gap-2`}
          >
            {hasSelection ? (
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-[11px] border border-blue-500/20">
                  {selectedDivision}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-[11px] border border-indigo-500/20">
                  {selectedSection}
                </span>
                <ChevronRight className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-extrabold text-[11px] border border-emerald-500/20">
                  {selectedDepartment}
                </span>
              </div>
            ) : (
              <span className="text-muted-foreground text-xs truncate">{placeholder}</span>
            )}

            <div className="flex items-center gap-1 shrink-0 ml-1">
              {hasSelection && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="p-1 rounded-full hover:bg-slate-500/20 text-muted-foreground hover:text-foreground transition"
                  title="Clear line selection"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${
                  isOpen ? "rotate-180 text-foreground" : ""
                }`}
              />
            </div>
          </button>

          {/* Dropdown Menu Container */}
          {isOpen && (
            <div className="absolute z-50 left-0 right-0 top-full mt-1.5 rounded-2xl border border-border/90 bg-card shadow-2xl backdrop-blur-md overflow-hidden animate-in fade-in zoom-in-95 duration-100 min-w-[320px]">
              {/* Search Box */}
              <div className="p-2.5 border-b border-border/60 bg-slate-500/5 flex items-center gap-2">
                <Search className="h-4 w-4 text-muted-foreground shrink-0" />
                <input
                  ref={searchInputRef}
                  type="text"
                  placeholder={`Type to search across ${options.length || 713} lines (e.g., 'kurti', 'baby', 'staples')...`}
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
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Options List with full 713 items visible on scroll */}
              <div className="max-h-80 overflow-y-auto p-1.5 pb-6 divide-y divide-border/15 text-xs overscroll-contain">
                {filteredOptions.length === 0 ? (
                  <div className="p-4 text-center text-muted-foreground space-y-2">
                    <p className="text-xs">No matching line for "{searchTerm}".</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        onCustomToggle(true);
                        onCustomChange(searchTerm);
                        setIsOpen(false);
                      }}
                      className="h-8 text-xs font-bold w-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30"
                    >
                      <Plus className="h-3.5 w-3.5 mr-1" />
                      Add "{searchTerm}" as Custom Line
                    </Button>
                  </div>
                ) : (
                  filteredOptions.map((opt, i) => {
                    const isSelected =
                      selectedDivision === opt.division &&
                      selectedSection === opt.section &&
                      selectedDepartment === opt.department;

                    return (
                      <button
                        key={`${opt.division}-${opt.section}-${opt.department}-${i}`}
                        type="button"
                        onClick={() => handleSelect(opt)}
                        className={`w-full px-3 py-2 rounded-xl text-left flex items-center justify-between gap-2 transition hover:bg-blue-500/10 hover:text-blue-600 dark:hover:text-blue-400 ${
                          isSelected
                            ? "bg-blue-500/15 text-blue-600 dark:text-blue-400 font-bold"
                            : "text-foreground"
                        }`}
                      >
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          <span className="text-[10px] font-mono font-semibold text-muted-foreground w-9 shrink-0 text-right pr-1 select-none">
                            {i + 1}.
                          </span>
                          <span className="text-[11px] font-semibold text-blue-600 dark:text-blue-400">
                            {opt.division}
                          </span>
                          <span className="text-muted-foreground text-[10px]">➔</span>
                          <span className="text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
                            {opt.section}
                          </span>
                          <span className="text-muted-foreground text-[10px]">➔</span>
                          <span className="text-[11px] font-bold text-foreground">
                            {opt.department}
                          </span>
                        </div>

                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Bottom footer bar */}
              <div className="p-2 px-3 bg-slate-500/10 border-t border-border/60 flex items-center justify-between gap-2">
                <span className="text-[10px] text-muted-foreground font-mono">
                  Showing {filteredOptions.length} of {options.length} unique lines
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
                  Type Custom Line
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
