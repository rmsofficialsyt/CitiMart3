import { useId, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Users,
  UserCheck,
  UserX,
  Clock,
  Plus,
  Search,
  Calendar,
  Save,
  RefreshCw,
  Phone,
  Edit2,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { ChoiceChips, type ChoiceOption } from "@/components/ChoiceChips";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { ModalDialog } from "@/components/ModalDialog";
import { PageUserGuide } from "@/components/PageUserGuide";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useUserInvalidAria } from "@/hooks/useUserInvalidAria";
import { addDaysISO, fmtDateIndian, todayLocalDate } from "@/lib/format";

interface StaffManagementPageProps {
  initialStoreCode: string;
}

/** Managers may edit attendance for today and this many days back
 * (docs/specs/ops-modules-hardening/spec.md US-T2 -- the server enforces it
 * once that spec's backend half lands; this clamps the picker meanwhile). */
const ATTENDANCE_EDIT_WINDOW_DAYS = 3;

type AttendanceStatus = "PRESENT" | "HALF_DAY" | "ABSENT" | "PAID_LEAVE" | "WEEK_OFF" | "ON_LEAVE";

const STATUS_OPTIONS: ChoiceOption<AttendanceStatus>[] = [
  { value: "PRESENT", label: "Present", activeClass: "border-emerald-600 bg-emerald-600 text-white shadow-sm" },
  { value: "HALF_DAY", label: "Half Day", activeClass: "border-amber-600 bg-amber-600 text-white shadow-sm" },
  { value: "ABSENT", label: "Absent", activeClass: "border-rose-600 bg-rose-600 text-white shadow-sm" },
  { value: "PAID_LEAVE", label: "Leave", activeClass: "border-indigo-600 bg-indigo-600 text-white shadow-sm" },
  { value: "WEEK_OFF", label: "Week Off", activeClass: "border-slate-600 bg-slate-600 text-white shadow-sm" },
];

/** Statuses where the person isn't on the floor, so check-in/out must be blank.
 * staffing.py turns check-in/out into staff-per-slot for the Advisor, so a
 * time on an absent row would count a ghost on the floor. */
const OFF_FLOOR: ReadonlySet<string> = new Set(["ABSENT", "PAID_LEAVE", "WEEK_OFF", "ON_LEAVE"]);

const BASE_ROLES = [
  "Cashier",
  "Floor Associate",
  "Department Supervisor",
  "Inventory Clerk",
  "Security",
  "Housekeeping",
] as const;

interface AttendanceRow {
  staff_id: string;
  name: string;
  role: string;
  department: string;
  status: string;
  shift: string;
  check_in_time: string;
  check_out_time: string;
  remarks: string;
  is_logged: boolean;
}

interface StaffFormState {
  name: string;
  role: string;
  department: string;
  phone: string;
  email: string;
  shift_preference: string;
  joining_date: string;
  status: string;
}

const emptyStaffForm = (): StaffFormState => ({
  name: "",
  role: "Floor Associate",
  department: "",
  phone: "",
  email: "",
  shift_preference: "General",
  joining_date: todayLocalDate(),
  status: "ACTIVE",
});

export function StaffManagementPage({ initialStoreCode }: StaffManagementPageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const effectiveStore = isAdmin && initialStoreCode === "ALL" ? "NM" : user?.storeCode || initialStoreCode || "NM";

  // IST "today" -- not toISOString(), which is UTC and reads yesterday until 05:30 IST.
  const today = todayLocalDate();
  const minDate = isAdmin ? undefined : addDaysISO(today, -ATTENDANCE_EDIT_WINDOW_DAYS);

  const [activeTab, setActiveTab] = useState<"attendance" | "directory">("attendance");
  const [selectedDate, setSelectedDate] = useState(today);
  const [pendingDate, setPendingDate] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearch = useDebouncedValue(searchTerm.trim());

  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [editStaff, setEditStaff] = useState<(StaffFormState & { staff_id: string }) | null>(null);
  const [staffForm, setStaffForm] = useState<StaffFormState>(emptyStaffForm);

  // Unsaved roster edits for `selectedDate` only -- cleared whenever the date
  // changes, so an edit made on one day can never be saved onto another.
  const [attendanceEdits, setAttendanceEdits] = useState<Record<string, AttendanceRow>>({});
  const dirty = Object.keys(attendanceEdits).length > 0;
  useUnsavedChangesGuard(dirty);

  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["staff-summary", effectiveStore, selectedDate],
    queryFn: () => api.getStaffSummary(effectiveStore, selectedDate),
  });

  const { data: attendanceData, isLoading: attLoading, refetch: refetchAtt } = useQuery({
    queryKey: ["staff-attendance", effectiveStore, selectedDate],
    queryFn: () => api.getDailyAttendance(effectiveStore, selectedDate),
  });

  const { data: staffList, isLoading: staffLoading, refetch: refetchStaff } = useQuery({
    queryKey: ["staff-members", effectiveStore, debouncedSearch],
    queryFn: () =>
      api.listStaff({
        store_code: effectiveStore,
        search: debouncedSearch || undefined,
      }),
  });

  const createStaffMutation = useMutation({
    mutationFn: (data: StaffFormState) =>
      api.createStaffMember({
        store_code: effectiveStore.toUpperCase(),
        name: data.name.trim(),
        role: data.role,
        department: data.department.trim(),
        phone: data.phone.trim(),
        email: data.email.trim() || undefined,
        shift_preference: data.shift_preference,
        joining_date: data.joining_date,
      }),
    onSuccess: () => {
      toast.success("New staff member registered!");
      setAddStaffOpen(false);
      setStaffForm(emptyStaffForm()); // the next "Add" must not re-submit the same person
      queryClient.invalidateQueries({ queryKey: ["staff-members"] });
      queryClient.invalidateQueries({ queryKey: ["staff-summary"] });
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to add staff member"),
  });

  const updateStaffMutation = useMutation({
    mutationFn: (data: StaffFormState & { staff_id: string }) =>
      api.updateStaffMember(data.staff_id, effectiveStore.toUpperCase(), {
        name: data.name.trim(),
        role: data.role,
        department: data.department.trim(),
        phone: data.phone.trim(),
        email: data.email.trim(),
        shift_preference: data.shift_preference,
        status: data.status,
      }),
    onSuccess: () => {
      toast.success("Staff profile updated!");
      setEditStaff(null);
      queryClient.invalidateQueries({ queryKey: ["staff-members"] });
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["staff-summary"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to update profile"),
  });

  const saveBatchAttendanceMutation = useMutation({
    mutationFn: (records: Omit<AttendanceRow, "name" | "role" | "department" | "is_logged">[]) =>
      api.saveBatchAttendance({
        store_code: effectiveStore.toUpperCase(),
        date: selectedDate,
        records,
      }),
    onSuccess: (res: { saved_count?: number }) => {
      toast.success(`Attendance saved for ${res?.saved_count ?? "all marked"} staff.`);
      setAttendanceEdits({});
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["staff-summary"] });
    },
    onError: (err: Error) => toast.error(err.message || "Failed to save attendance"),
  });

  const patchRow = (base: AttendanceRow, patch: Partial<AttendanceRow>) => {
    setAttendanceEdits((prev) => {
      const current = prev[base.staff_id] ?? base;
      const next = { ...current, ...patch };
      if (OFF_FLOOR.has(next.status)) {
        next.check_in_time = "";
        next.check_out_time = "";
      }
      return { ...prev, [base.staff_id]: next };
    });
  };

  const requestDateChange = (value: string) => {
    if (!value || value === selectedDate) return;
    if (dirty) setPendingDate(value);
    else setSelectedDate(value);
  };

  const confirmDateChange = () => {
    if (pendingDate) {
      setAttendanceEdits({});
      setSelectedDate(pendingDate);
    }
    setPendingDate(null);
  };

  const handleSaveAll = () => {
    const rows: AttendanceRow[] = attendanceData?.records ?? [];
    // Only rows someone actually marked: an edited row, or one already on the
    // server. The old handler sent every row and silently turned UNMARKED into
    // PRESENT, so one Save click marked the whole roster present.
    const toSave = rows
      .map((r) => attendanceEdits[r.staff_id] ?? (r.is_logged ? r : null))
      .filter((r): r is AttendanceRow => r !== null);

    if (!Object.keys(attendanceEdits).length) {
      toast.info("No attendance changes to save.");
      return;
    }
    const unmarked = toSave.filter((r) => r.status === "UNMARKED");
    if (unmarked.length) {
      toast.error(`Pick a status for: ${unmarked.map((r) => r.name).join(", ")}`);
      return;
    }
    const badTimes = toSave.filter((r) => r.check_in_time && r.check_out_time && r.check_out_time <= r.check_in_time);
    if (badTimes.length) {
      toast.error(`Check-out must be after check-in for: ${badTimes.map((r) => r.name).join(", ")}`);
      return;
    }

    saveBatchAttendanceMutation.mutate(
      toSave.map((r) => ({
        staff_id: r.staff_id,
        status: r.status,
        shift: r.shift || "General",
        check_in_time: r.check_in_time || "",
        check_out_time: r.check_out_time || "",
        remarks: r.remarks || "",
      })),
    );
  };

  const roleOptions = (current?: string): string[] => {
    const roles: string[] = [...BASE_ROLES];
    if (isAdmin) roles.push("Store Manager");
    // Keep an existing out-of-list role visible instead of the <select> silently
    // showing its first option while still holding the real value.
    if (current && !roles.includes(current)) roles.push(current);
    return roles;
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {!isAdmin && (
        <PageUserGuide
          className="mb-0"
          title="Manager Manual Guide — Staff Management"
          subtitle="How to mark daily floor attendance, save shifts, and maintain the staff directory"
          steps={[
            {
              icon: Calendar,
              colorClass: "text-blue-400",
              title: "Step 1 · Select Date",
              header: "Pick Operating Date",
              description: `Choose the attendance date in the top bar (defaults to today). You can correct the last ${ATTENDANCE_EDIT_WINDOW_DAYS} days; older days are locked.`,
            },
            {
              icon: UserCheck,
              colorClass: "text-indigo-400",
              title: "Step 2 · Mark Attendance",
              header: "Set Status, Shift & Times",
              bullets: [
                "Mark each employee Present, Half Day, Absent, Leave or Week Off.",
                "Enter actual check-in/out times — they feed the floor-coverage advice.",
              ],
            },
            {
              icon: Save,
              colorClass: "text-amber-400",
              title: "Step 3 · Batch Save",
              header: "Commit Daily Roster",
              description:
                "Click Save Attendance. Only the rows you marked are saved — anyone left unmarked stays unmarked.",
            },
            {
              icon: Users,
              colorClass: "text-emerald-400",
              title: "Step 4 · Staff Directory",
              header: "Add or Edit Profiles",
              description:
                "Use Add Staff Member or switch to Staff Directory to register new hires (Role, Department, Phone, Shift) or update profiles.",
              safetyNote: "Log daily attendance early so floor coverage alerts stay clear.",
            },
          ]}
          faqs={[
            {
              title: "Forgot to save?",
              description:
                "Rows you changed are marked “Unsaved” until you click Save Attendance. Switching date or leaving the page asks first.",
            },
            {
              title: "New joiners:",
              description:
                "Add new employees in Staff Directory first so they appear in the Daily Attendance grid.",
            },
          ]}
        />
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Users className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black tracking-tight text-foreground flex items-center gap-2">
              <span>Staff & Workforce Management</span>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                {effectiveStore}
              </span>
            </h1>
            <p className="text-xs text-muted-foreground">
              Daily floor shift roster, attendance marking, employee profiles, and staff presence KPIs.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <label className="flex items-center gap-1.5 bg-card border border-border px-2.5 py-1.5 rounded-xl text-xs font-semibold">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Attendance date</span>
            <input
              type="date"
              value={selectedDate}
              min={minDate}
              max={today}
              onChange={(e) => requestDateChange(e.target.value)}
              className="bg-transparent text-foreground font-mono focus-visible:outline-2 focus-visible:outline-ring"
            />
          </label>

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetchSummary();
              refetchAtt();
              refetchStaff();
            }}
            className="gap-1.5 text-xs font-semibold"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setAddStaffOpen(true)}
            className="gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span>Add Staff Member</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Staff</span>
            <Users className="h-4 w-4 text-indigo-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{summary?.total_staff ?? 0}</span>
            <span className="text-xs text-muted-foreground">registered</span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Present {selectedDate === today ? "Today" : "That Day"}
            </span>
            <UserCheck className="h-4 w-4 text-emerald-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-emerald-600 dark:text-emerald-300">
              {summary?.present_today ?? 0}
            </span>
            <span className="text-xs text-emerald-600/70 dark:text-emerald-400/70">on duty</span>
          </div>
        </div>

        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">
              Absent / Leave
            </span>
            <UserX className="h-4 w-4 text-rose-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-rose-600 dark:text-rose-300">
              {(summary?.absent_today ?? 0) + (summary?.leave_today ?? 0)}
            </span>
            <span className="text-xs text-rose-600/70 dark:text-rose-400/70">absent/leave</span>
          </div>
        </div>

        <div className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-sky-600 dark:text-sky-400 uppercase tracking-wider">
              Shift Coverage
            </span>
            <Clock className="h-4 w-4 text-sky-500" aria-hidden="true" />
          </div>
          <div className="mt-2 flex items-baseline gap-3 text-xs font-bold">
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Sun className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Morning: {summary?.morning_shift_count ?? 0}</span>
            </div>
            <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
              <Moon className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Evening: {summary?.evening_shift_count ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Real tablist/tab/tabpanel semantics, arrow-key movement and a
          non-colour (underline) selected indicator via Radix Tabs. */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as "attendance" | "directory")}>
        <TabsList variant="line" aria-label="Staff management views" className="border-b border-border/40 pb-1">
          <TabsTrigger value="attendance" className="text-xs font-bold">
            Daily Shift Attendance Roster
          </TabsTrigger>
          <TabsTrigger value="directory" className="text-xs font-bold">
            Staff Directory & Profiles
          </TabsTrigger>
        </TabsList>

        {/* Tab 1: Attendance Grid */}
        <TabsContent value="attendance" className="space-y-4 pt-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-muted-foreground font-medium" role="status">
              Attendance for <span className="font-bold text-foreground font-mono">{fmtDateIndian(selectedDate)}</span>{" "}
              (Store: <span className="font-bold text-indigo-600">{effectiveStore}</span>)
              {dirty && (
                <span className="ml-2 font-bold text-amber-600">
                  · {Object.keys(attendanceEdits).length} unsaved change(s)
                </span>
              )}
            </div>
            <Button
              size="sm"
              onClick={handleSaveAll}
              disabled={saveBatchAttendanceMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow"
            >
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
              <span>{saveBatchAttendanceMutation.isPending ? "Saving..." : "Save Attendance"}</span>
            </Button>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <caption className="sr-only">Attendance roster for {fmtDateIndian(selectedDate)}</caption>
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th scope="col" className="py-3 px-4">Staff Member</th>
                    <th scope="col" className="py-3 px-4">Role & Dept</th>
                    <th scope="col" className="py-3 px-4">Status</th>
                    <th scope="col" className="py-3 px-4 text-center">Shift</th>
                    <th scope="col" className="py-3 px-4 text-center">Check-In</th>
                    <th scope="col" className="py-3 px-4 text-center">Check-Out</th>
                    <th scope="col" className="py-3 px-4">Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {attLoading ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        Loading roster...
                      </td>
                    </tr>
                  ) : !attendanceData?.records?.length ? (
                    <tr>
                      <td colSpan={7} className="py-8 text-center text-muted-foreground">
                        No staff members found for store {effectiveStore}. Click "Add Staff Member" to populate.
                      </td>
                    </tr>
                  ) : (
                    (attendanceData.records as AttendanceRow[]).map((r) => {
                      const current = attendanceEdits[r.staff_id] ?? r;
                      const isDirty = r.staff_id in attendanceEdits;
                      const offFloor = OFF_FLOOR.has(current.status);
                      const statusOptions =
                        current.status === "ON_LEAVE"
                          ? [...STATUS_OPTIONS, { value: "ON_LEAVE" as const, label: "On Leave" }]
                          : STATUS_OPTIONS;
                      return (
                        <tr key={r.staff_id} className={isDirty ? "bg-amber-500/5" : "hover:bg-muted/20 transition"}>
                          <th scope="row" className="py-3 px-4 text-left font-normal">
                            <div className="font-bold text-foreground">{r.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{r.staff_id}</div>
                            {isDirty ? (
                              <div className="text-[10px] font-bold text-amber-600">Unsaved</div>
                            ) : (
                              !r.is_logged && <div className="text-[10px] font-semibold text-muted-foreground">Not marked</div>
                            )}
                          </th>
                          <td className="py-3 px-4">
                            <span className="font-medium text-foreground">{r.role}</span>
                            <div className="text-[10px] text-muted-foreground">{r.department}</div>
                          </td>
                          <td className="py-3 px-4">
                            <ChoiceChips
                              legend={`Attendance status for ${r.name}`}
                              legendHidden
                              name={`status-${r.staff_id}`}
                              value={current.status === "UNMARKED" ? undefined : (current.status as AttendanceStatus)}
                              options={statusOptions}
                              onChange={(st) => patchRow(r, { status: st })}
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              aria-label={`Shift for ${r.name}`}
                              value={current.shift || "General"}
                              onChange={(e) => patchRow(r, { shift: e.target.value })}
                              className="px-2 py-1 rounded-lg border border-border bg-card text-xs font-semibold focus-visible:outline-2 focus-visible:outline-ring"
                            >
                              <option value="Morning">Morning</option>
                              <option value="Evening">Evening</option>
                              <option value="Full Day">Full Day</option>
                              <option value="General">General</option>
                            </select>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="time"
                              aria-label={`Check-in time for ${r.name}`}
                              disabled={offFloor}
                              value={current.check_in_time || ""}
                              onChange={(e) => patchRow(r, { check_in_time: e.target.value })}
                              className="px-2 py-1 rounded-lg border border-border bg-card text-xs font-mono disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="time"
                              aria-label={`Check-out time for ${r.name}`}
                              disabled={offFloor}
                              min={current.check_in_time || undefined}
                              value={current.check_out_time || ""}
                              onChange={(e) => patchRow(r, { check_out_time: e.target.value })}
                              className="px-2 py-1 rounded-lg border border-border bg-card text-xs font-mono disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              aria-label={`Remarks for ${r.name}`}
                              maxLength={200}
                              placeholder="Notes..."
                              value={current.remarks || ""}
                              onChange={(e) => patchRow(r, { remarks: e.target.value })}
                              className="w-full px-2 py-1 rounded-lg border border-border bg-card text-xs focus-visible:outline-2 focus-visible:outline-ring"
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </TabsContent>

        {/* Tab 2: Staff Directory */}
        <TabsContent value="directory" className="space-y-4 pt-2">
          <div role="search" className="relative flex-1 max-w-md">
            <label htmlFor="staff-search" className="sr-only">
              Search staff
            </label>
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
            <input
              id="staff-search"
              type="search"
              placeholder="Search staff by Name, Role, Phone, ID..."
              autoComplete="off"
              spellCheck={false}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 rounded-xl bg-card border border-border text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
            {staffLoading ? (
              <div className="col-span-full py-8 text-center text-muted-foreground text-xs">Loading directory...</div>
            ) : !staffList?.items?.length ? (
              <div className="col-span-full py-8 text-center text-muted-foreground text-xs">
                No staff members found matching query.
              </div>
            ) : (
              staffList.items.map((staff: any) => (
                <article
                  key={staff.staff_id}
                  aria-labelledby={`staff-${staff.staff_id}`}
                  className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm space-y-3"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h2 id={`staff-${staff.staff_id}`} className="font-bold text-sm text-foreground">
                        {staff.name}
                      </h2>
                      <div className="text-[11px] font-mono text-muted-foreground">{staff.staff_id}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        staff.status === "ACTIVE"
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                          : "bg-muted text-muted-foreground border-border"
                      }`}
                    >
                      {staff.status}
                    </span>
                  </div>

                  <dl className="space-y-1.5 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
                    <div className="flex items-center justify-between">
                      <dt className="font-medium">Role:</dt>
                      <dd className="font-bold text-foreground">{staff.role}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="font-medium">Department:</dt>
                      <dd className="font-semibold text-foreground">{staff.department}</dd>
                    </div>
                    <div className="flex items-center justify-between">
                      <dt className="font-medium">Shift Pref:</dt>
                      <dd className="font-medium">{staff.shift_preference || "General"}</dd>
                    </div>
                    {staff.phone && (
                      <div className="flex items-center gap-1.5 pt-1 text-[11px] font-mono text-foreground">
                        <dt>
                          <Phone className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
                          <span className="sr-only">Phone</span>
                        </dt>
                        <dd>{staff.phone}</dd>
                      </div>
                    )}
                  </dl>

                  <div className="pt-2 border-t border-border/40 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        let full = staff;
                        if (typeof staff.phone === "string" && staff.phone.includes("•")) {
                          try {
                            full = await api.getStaffMember(staff.staff_id, effectiveStore.toUpperCase());
                          } catch {
                            full = staff;
                          }
                        }
                        setEditStaff({
                          staff_id: full.staff_id,
                          name: full.name ?? "",
                          role: full.role ?? "Floor Associate",
                          department: full.department ?? "",
                          phone: full.phone ?? "",
                          email: full.email ?? "",
                          shift_preference: full.shift_preference ?? "General",
                          joining_date: full.joining_date ?? "",
                          status: full.status ?? "ACTIVE",
                        });
                      }}
                      className="text-xs h-7 gap-1"
                    >
                      <Edit2 className="h-3 w-3" aria-hidden="true" />
                      <span>
                        Edit Profile<span className="sr-only"> for {staff.name}</span>
                      </span>
                    </Button>
                  </div>
                </article>
              ))
            )}
          </div>
        </TabsContent>
      </Tabs>

      <ModalDialog open={addStaffOpen} onClose={() => setAddStaffOpen(false)} title="Add New Staff Member">
        <StaffForm
          mode="create"
          value={staffForm}
          onChange={setStaffForm}
          roles={roleOptions(staffForm.role)}
          maxJoiningDate={today}
          pending={createStaffMutation.isPending}
          onCancel={() => setAddStaffOpen(false)}
          onSubmit={() => createStaffMutation.mutate(staffForm)}
        />
      </ModalDialog>

      <ModalDialog open={editStaff !== null} onClose={() => setEditStaff(null)} title="Edit Staff Profile">
        {editStaff && (
          <StaffForm
            mode="edit"
            value={editStaff}
            onChange={(v) => setEditStaff({ ...editStaff, ...v })}
            roles={roleOptions(editStaff.role)}
            pending={updateStaffMutation.isPending}
            onCancel={() => setEditStaff(null)}
            onSubmit={() => updateStaffMutation.mutate(editStaff)}
          />
        )}
      </ModalDialog>

      <ConfirmDialog
        open={pendingDate !== null}
        title="Discard unsaved attendance?"
        description={`You have ${Object.keys(attendanceEdits).length} unsaved change(s) for ${fmtDateIndian(
          selectedDate,
        )}. Switching to ${pendingDate ? fmtDateIndian(pendingDate) : "another date"} discards them.`}
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        tone="danger"
        onConfirm={confirmDateChange}
        onCancel={() => setPendingDate(null)}
      />
    </div>
  );
}

interface StaffFormProps {
  mode: "create" | "edit";
  value: StaffFormState;
  onChange: (value: StaffFormState) => void;
  roles: string[];
  maxJoiningDate?: string;
  pending: boolean;
  onCancel: () => void;
  onSubmit: () => void;
}

/** One real <form> for add + edit: labels tied to inputs, native constraints
 * (`required`, `pattern`, `maxLength`) checked on submit, errors shown only
 * after interaction. The old version was loose divs with a disabled Save, so
 * Enter did nothing and nobody was told *why* Save was greyed out. */
function StaffForm({ mode, value, onChange, roles, maxJoiningDate, pending, onCancel, onSubmit }: StaffFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const id = useId();
  useUserInvalidAria(formRef);
  const set = (patch: Partial<StaffFormState>) => onChange({ ...value, ...patch });
  const field = "field flex flex-col gap-1";
  const control = "w-full p-2 rounded-xl bg-background border border-border text-xs focus-visible:outline-2 focus-visible:outline-ring";
  const errorCls = "field-error items-center gap-1 text-[11px] font-semibold text-destructive";

  return (
    <form
      ref={formRef}
      className="validated space-y-3 text-xs"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending) onSubmit();
      }}
    >
      <div className={field}>
        <label htmlFor={`${id}-name`} className="font-semibold text-muted-foreground">
          Full Name <span aria-hidden="true">*</span>
        </label>
        <input
          id={`${id}-name`}
          name="name"
          type="text"
          required
          minLength={2}
          maxLength={100}
          autoComplete="off"
          data-autofocus
          placeholder="e.g. Ramesh Chandra"
          value={value.name}
          onChange={(e) => set({ name: e.target.value })}
          data-error={`${id}-name-error`}
          className={control}
        />
        <span id={`${id}-name-error`} className={errorCls}>
          <span role="img" aria-label="Error">⚠</span> Enter the staff member's name (at least 2 characters).
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={field}>
          <label htmlFor={`${id}-role`} className="font-semibold text-muted-foreground">
            Role <span aria-hidden="true">*</span>
          </label>
          <select
            id={`${id}-role`}
            name="role"
            required
            value={value.role}
            onChange={(e) => set({ role: e.target.value })}
            className={control}
          >
            {roles.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className={field}>
          <label htmlFor={`${id}-dept`} className="font-semibold text-muted-foreground">
            Department <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${id}-dept`}
            name="department"
            type="text"
            required
            minLength={2}
            maxLength={80}
            autoComplete="off"
            placeholder="e.g. Menswear"
            value={value.department}
            onChange={(e) => set({ department: e.target.value })}
            data-error={`${id}-dept-error`}
            className={control}
          />
          <span id={`${id}-dept-error`} className={errorCls}>
            <span role="img" aria-label="Error">⚠</span> Enter a department.
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className={field}>
          <label htmlFor={`${id}-phone`} className="font-semibold text-muted-foreground">
            Phone Number <span aria-hidden="true">*</span>
          </label>
          <span id={`${id}-phone-hint`} className="text-[10px] text-muted-foreground">
            10–13 digits, optional leading +
          </span>
          <input
            id={`${id}-phone`}
            name="phone"
            type="tel"
            inputMode="tel"
            required
            pattern="\+?\d{10,13}"
            maxLength={14}
            // The staff member's number, not the signed-in manager's: no autofill.
            autoComplete="off"
            placeholder="9830012345"
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value.replace(/[\s-]/g, "") })}
            aria-describedby={`${id}-phone-hint`}
            data-error={`${id}-phone-error`}
            className={`${control} font-mono`}
          />
          <span id={`${id}-phone-error`} className={errorCls}>
            <span role="img" aria-label="Error">⚠</span> Enter 10–13 digits, e.g. 9830012345.
          </span>
        </div>

        <div className={field}>
          <label htmlFor={`${id}-shift`} className="font-semibold text-muted-foreground">
            Shift Preference
          </label>
          <select
            id={`${id}-shift`}
            name="shift_preference"
            value={value.shift_preference}
            onChange={(e) => set({ shift_preference: e.target.value })}
            className={control}
          >
            <option value="Morning">Morning</option>
            <option value="Evening">Evening</option>
            <option value="General">General</option>
          </select>
        </div>
      </div>

      <div className={field}>
        <label htmlFor={`${id}-email`} className="font-semibold text-muted-foreground">
          Email (Optional)
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          maxLength={100}
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          placeholder="ramesh@citimart.in"
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          data-error={`${id}-email-error`}
          className={control}
        />
        <span id={`${id}-email-error`} className={errorCls}>
          <span role="img" aria-label="Error">⚠</span> Enter an email in the format name@example.com, or leave it blank.
        </span>
      </div>

      {mode === "create" ? (
        <div className={field}>
          <label htmlFor={`${id}-joined`} className="font-semibold text-muted-foreground">
            Joining Date
          </label>
          <input
            id={`${id}-joined`}
            name="joining_date"
            type="date"
            max={maxJoiningDate}
            value={value.joining_date}
            onChange={(e) => set({ joining_date: e.target.value })}
            className={control}
          />
        </div>
      ) : (
        <div className={field}>
          <label htmlFor={`${id}-status`} className="font-semibold text-muted-foreground">
            Employment Status
          </label>
          <select
            id={`${id}-status`}
            name="status"
            value={value.status}
            onChange={(e) => set({ status: e.target.value })}
            className={control}
          >
            <option value="ACTIVE">Active</option>
            <option value="ON_LEAVE">On Leave</option>
            <option value="INACTIVE">Inactive (left)</option>
          </select>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-3 border-t border-border/40">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {/* Not disabled for validation -- submitting shows what's wrong. Disabled
            only while a save is in flight, to stop a double post. */}
        <Button type="submit" size="sm" disabled={pending} className="bg-indigo-600 hover:bg-indigo-700 text-white">
          {pending ? "Saving..." : mode === "create" ? "Save Staff" : "Update Profile"}
        </Button>
      </div>
    </form>
  );
}
