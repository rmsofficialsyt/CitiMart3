import { Clock } from "lucide-react";
import { useEffect, useState } from "react";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface TimePicker12HourProps {
  value: string; // HH:MM string in 24hr format (e.g. "10:30", "14:15")
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  size?: "default" | "sm";
}

const HOUR_12_OPTIONS = [
  { label: "10 AM", hour24: 10 },
  { label: "11 AM", hour24: 11 },
  { label: "12 PM", hour24: 12 },
  { label: "01 PM", hour24: 13 },
  { label: "02 PM", hour24: 14 },
  { label: "03 PM", hour24: 15 },
  { label: "04 PM", hour24: 16 },
  { label: "05 PM", hour24: 17 },
  { label: "06 PM", hour24: 18 },
  { label: "07 PM", hour24: 19 },
  { label: "08 PM", hour24: 20 },
  { label: "09 PM", hour24: 21 },
  { label: "10 PM", hour24: 22 },
  { label: "11 PM", hour24: 23 },
];

// Complete MM 00 to 59
const ALL_MINUTES_00_TO_59 = Array.from({ length: 60 }, (_, i) => (i < 10 ? `0${i}` : `${i}`));

export function TimePicker12Hour({
  value,
  onChange,
  disabled = false,
  className = "",
  size = "default",
}: TimePicker12HourProps) {
  const parseVal = (val: string) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(val || "10:30");
    if (match) {
      let h = parseInt(match[1], 10);
      let m = parseInt(match[2], 10);
      if (h < 10 || (h === 10 && m < 30)) {
        h = 10;
        m = 30;
      }
      if (h > 23) {
        h = 23;
        m = 59;
      }
      return {
        hour24: h,
        minuteStr: m < 10 ? `0${m}` : `${m}`,
      };
    }
    return { hour24: 10, minuteStr: "30" };
  };

  const parsed = parseVal(value);
  const [selectedHour, setSelectedHour] = useState<number>(parsed.hour24);
  const [selectedMinute, setSelectedMinute] = useState<string>(parsed.minuteStr);

  useEffect(() => {
    const p = parseVal(value);
    setSelectedHour(p.hour24);
    setSelectedMinute(p.minuteStr);
  }, [value]);

  const handleHourChange = (hStr: string) => {
    const h = parseInt(hStr, 10);
    let m = selectedMinute;
    if (h === 10 && parseInt(m, 10) < 30) {
      m = "30";
      setSelectedMinute("30");
    }
    setSelectedHour(h);
    const hh = h < 10 ? `0${h}` : `${h}`;
    onChange(`${hh}:${m}`);
  };

  const handleMinuteChange = (m: string) => {
    let finalM = m;
    if (selectedHour === 10 && parseInt(m, 10) < 30) {
      finalM = "30";
    }
    setSelectedMinute(finalM);
    const hh = selectedHour < 10 ? `0${selectedHour}` : `${selectedHour}`;
    onChange(`${hh}:${finalM}`);
  };

  // Filter minute options for 10 AM (store opens at 10:30 AM)
  const availableMinutes =
    selectedHour === 10
      ? ALL_MINUTES_00_TO_59.filter((m) => parseInt(m, 10) >= 30)
      : ALL_MINUTES_00_TO_59;

  if (size === "sm") {
    return (
      <div className={`flex items-center gap-1.5 ${className}`}>
        <Select disabled={disabled} value={String(selectedHour)} onValueChange={handleHourChange}>
          <SelectTrigger className="h-8 w-24 text-xs font-semibold bg-background">
            <SelectValue placeholder="HH" />
          </SelectTrigger>
          <SelectContent className="max-h-56">
            {HOUR_12_OPTIONS.map((opt) => (
              <SelectItem key={opt.hour24} value={String(opt.hour24)} className="text-xs">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs font-bold text-muted-foreground">:</span>
        <Select disabled={disabled} value={selectedMinute} onValueChange={handleMinuteChange}>
          <SelectTrigger className="h-8 w-18 text-xs font-semibold bg-background">
            <SelectValue placeholder="MM" />
          </SelectTrigger>
          <SelectContent className="max-h-56">
            {availableMinutes.map((m) => (
              <SelectItem key={m} value={m} className="text-xs">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {/* HH Selector */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-muted-foreground">HH-</span>
        <Select disabled={disabled} value={String(selectedHour)} onValueChange={handleHourChange}>
          <SelectTrigger className="h-9 w-26 text-xs font-semibold bg-background shadow-xs">
            <Clock className="h-3.5 w-3.5 mr-1 text-primary shrink-0" />
            <SelectValue placeholder="HH" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {HOUR_12_OPTIONS.map((opt) => (
              <SelectItem key={opt.hour24} value={String(opt.hour24)} className="text-xs font-medium">
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* MM Selector (00 to 59) */}
      <div className="flex items-center gap-1">
        <span className="text-xs font-bold text-muted-foreground">MM-</span>
        <Select disabled={disabled} value={selectedMinute} onValueChange={handleMinuteChange}>
          <SelectTrigger className="h-9 w-20 text-xs font-semibold bg-background shadow-xs">
            <SelectValue placeholder="MM" />
          </SelectTrigger>
          <SelectContent className="max-h-60">
            {availableMinutes.map((m) => (
              <SelectItem key={m} value={m} className="text-xs font-medium">
                {m}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}


