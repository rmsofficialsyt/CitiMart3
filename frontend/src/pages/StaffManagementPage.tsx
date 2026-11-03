import { useState } from "react";
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
  X,
  Sun,
  Moon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/api/client";
import { useAuth } from "@/auth/AuthProvider";
import { Button } from "@/components/ui/button";

interface StaffManagementPageProps {
  initialStoreCode: string;
}

export function StaffManagementPage({ initialStoreCode }: StaffManagementPageProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "admin";
  const effectiveStore = isAdmin && initialStoreCode === "ALL" ? "NM" : user?.storeCode || initialStoreCode || "NM";

  const [activeTab, setActiveTab] = useState<"attendance" | "directory">("attendance");
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [searchTerm, setSearchTerm] = useState("");

  // Modals
  const [addStaffOpen, setAddStaffOpen] = useState(false);
  const [editStaffOpen, setEditStaffOpen] = useState(false);
  const [selectedStaffForEdit, setSelectedStaffForEdit] = useState<any>(null);

  // Add staff form
  const [staffForm, setStaffForm] = useState({
    name: "",
    role: "Floor Associate",
    department: "Menswear",
    phone: "",
    email: "",
    shift_preference: "Morning",
    joining_date: new Date().toISOString().split("T")[0],
  });

  // Local state for attendance grid before batch save
  const [attendanceEdits, setAttendanceEdits] = useState<Record<string, any>>({});

  // Queries
  const { data: summary, refetch: refetchSummary } = useQuery({
    queryKey: ["staff-summary", effectiveStore, selectedDate],
    queryFn: () => api.getStaffSummary(effectiveStore, selectedDate),
  });

  const { data: attendanceData, isLoading: attLoading, refetch: refetchAtt } = useQuery({
    queryKey: ["staff-attendance", effectiveStore, selectedDate],
    queryFn: () => api.getDailyAttendance(effectiveStore, selectedDate),
  });

  const { data: staffList, isLoading: staffLoading, refetch: refetchStaff } = useQuery({
    queryKey: ["staff-members", effectiveStore, searchTerm],
    queryFn: () =>
      api.listStaff({
        store_code: effectiveStore,
        search: searchTerm || undefined,
      }),
  });

  // Mutations
  const createStaffMutation = useMutation({
    mutationFn: (data: any) =>
      api.createStaffMember({
        store_code: effectiveStore.toUpperCase(),
        ...data,
      }),
    onSuccess: () => {
      toast.success("New staff member registered!");
      setAddStaffOpen(false);
      queryClient.invalidateQueries({ queryKey: ["staff-members"] });
      queryClient.invalidateQueries({ queryKey: ["staff-summary"] });
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to add staff member"),
  });

  const updateStaffMutation = useMutation({
    mutationFn: (data: any) =>
      api.updateStaffMember(selectedStaffForEdit.staff_id, effectiveStore.toUpperCase(), data),
    onSuccess: () => {
      toast.success("Staff profile updated!");
      setEditStaffOpen(false);
      queryClient.invalidateQueries({ queryKey: ["staff-members"] });
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to update profile"),
  });

  const saveBatchAttendanceMutation = useMutation({
    mutationFn: (records: any[]) =>
      api.saveBatchAttendance({
        store_code: effectiveStore.toUpperCase(),
        date: selectedDate,
        records,
      }),
    onSuccess: () => {
      toast.success("Daily attendance saved successfully!");
      setAttendanceEdits({});
      queryClient.invalidateQueries({ queryKey: ["staff-attendance"] });
      queryClient.invalidateQueries({ queryKey: ["staff-summary"] });
    },
    onError: (err: any) => toast.error(err.message || "Failed to save attendance"),
  });

  const handleStatusChange = (staffId: string, baseRecord: any, newStatus: string) => {
    const current = attendanceEdits[staffId] || baseRecord;
    setAttendanceEdits({
      ...attendanceEdits,
      [staffId]: {
        ...current,
        staff_id: staffId,
        status: newStatus,
        check_in_time: newStatus === "PRESENT" && !current.check_in_time ? "09:30" : current.check_in_time,
        check_out_time: newStatus === "PRESENT" && !current.check_out_time ? "18:30" : current.check_out_time,
      },
    });
  };

  const handleShiftChange = (staffId: string, baseRecord: any, newShift: string) => {
    const current = attendanceEdits[staffId] || baseRecord;
    setAttendanceEdits({
      ...attendanceEdits,
      [staffId]: {
        ...current,
        staff_id: staffId,
        shift: newShift,
      },
    });
  };

  const handleTimeChange = (staffId: string, baseRecord: any, field: "check_in_time" | "check_out_time", val: string) => {
    const current = attendanceEdits[staffId] || baseRecord;
    setAttendanceEdits({
      ...attendanceEdits,
      [staffId]: {
        ...current,
        staff_id: staffId,
        [field]: val,
      },
    });
  };

  const handleSaveAll = () => {
    if (!attendanceData?.records) return;
    const recordsToSave = attendanceData.records.map((r: any) => {
      const edit = attendanceEdits[r.staff_id];
      if (edit) {
        return {
          staff_id: r.staff_id,
          status: edit.status === "UNMARKED" ? "PRESENT" : edit.status,
          shift: edit.shift || "General",
          check_in_time: edit.check_in_time || "",
          check_out_time: edit.check_out_time || "",
          remarks: edit.remarks || "",
        };
      }
      return {
        staff_id: r.staff_id,
        status: r.status === "UNMARKED" ? "PRESENT" : r.status,
        shift: r.shift || "General",
        check_in_time: r.check_in_time || "",
        check_out_time: r.check_out_time || "",
        remarks: r.remarks || "",
      };
    });

    saveBatchAttendanceMutation.mutate(recordsToSave);
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/40">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <Users className="h-6 w-6" />
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
          <div className="flex items-center gap-1.5 bg-card border border-border px-2.5 py-1.5 rounded-xl text-xs font-semibold">
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-transparent focus:outline-none text-foreground font-mono"
            />
          </div>

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
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Refresh</span>
          </Button>

          <Button
            size="sm"
            onClick={() => setAddStaffOpen(true)}
            className="gap-1.5 text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow"
          >
            <Plus className="h-4 w-4" />
            <span>Add Staff Member</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Total Staff</span>
            <Users className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-black text-foreground">{summary?.total_staff ?? 0}</span>
            <span className="text-xs text-muted-foreground">registered</span>
          </div>
        </div>

        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
              Present Today
            </span>
            <UserCheck className="h-4 w-4 text-emerald-500" />
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
            <UserX className="h-4 w-4 text-rose-500" />
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
            <Clock className="h-4 w-4 text-sky-500" />
          </div>
          <div className="mt-2 flex items-baseline gap-3 text-xs font-bold">
            <div className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <Sun className="h-3.5 w-3.5" />
              <span>Morning: {summary?.morning_shift_count ?? 0}</span>
            </div>
            <div className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
              <Moon className="h-3.5 w-3.5" />
              <span>Evening: {summary?.evening_shift_count ?? 0}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-border/40 pb-2">
        <button
          type="button"
          onClick={() => setActiveTab("attendance")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "attendance"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Daily Shift Attendance Roster
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("directory")}
          className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
            activeTab === "directory"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          }`}
        >
          Staff Directory & Profiles
        </button>
      </div>

      {/* Tab 1: Attendance Grid */}
      {activeTab === "attendance" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-xs text-muted-foreground font-medium">
              Attendance for <span className="font-bold text-foreground font-mono">{selectedDate}</span> (Store:{" "}
              <span className="font-bold text-indigo-600">{effectiveStore}</span>)
            </div>
            <Button
              size="sm"
              onClick={handleSaveAll}
              disabled={saveBatchAttendanceMutation.isPending}
              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold gap-1.5 shadow"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{saveBatchAttendanceMutation.isPending ? "Saving..." : "Save All Attendance"}</span>
            </Button>
          </div>

          <div className="rounded-2xl border border-border/60 bg-card overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/40 text-muted-foreground border-b border-border/60 font-semibold">
                  <tr>
                    <th className="py-3 px-4">Staff Member</th>
                    <th className="py-3 px-4">Role & Dept</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-center">Shift</th>
                    <th className="py-3 px-4 text-center">Check-In</th>
                    <th className="py-3 px-4 text-center">Check-Out</th>
                    <th className="py-3 px-4">Remarks</th>
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
                    attendanceData.records.map((r: any) => {
                      const current = attendanceEdits[r.staff_id] || r;
                      return (
                        <tr key={r.staff_id} className="hover:bg-muted/20 transition">
                          <td className="py-3 px-4">
                            <div className="font-bold text-foreground">{r.name}</div>
                            <div className="text-[10px] font-mono text-muted-foreground">{r.staff_id}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="font-medium text-foreground">{r.role}</span>
                            <div className="text-[10px] text-muted-foreground">{r.department}</div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
                              {(["PRESENT", "ABSENT", "HALF_DAY", "PAID_LEAVE"] as const).map((st) => {
                                const active = current.status === st;
                                return (
                                  <button
                                    key={st}
                                    type="button"
                                    onClick={() => handleStatusChange(r.staff_id, r, st)}
                                    className={`px-2 py-1 rounded-md text-[10px] font-bold cursor-pointer transition ${
                                      active
                                        ? st === "PRESENT"
                                          ? "bg-emerald-600 text-white shadow-sm"
                                          : st === "ABSENT"
                                          ? "bg-rose-600 text-white shadow-sm"
                                          : st === "HALF_DAY"
                                          ? "bg-amber-600 text-white shadow-sm"
                                          : "bg-indigo-600 text-white shadow-sm"
                                        : "text-muted-foreground hover:text-foreground"
                                    }`}
                                  >
                                    {st === "PRESENT"
                                      ? "Present"
                                      : st === "ABSENT"
                                      ? "Absent"
                                      : st === "HALF_DAY"
                                      ? "Half Day"
                                      : "Leave"}
                                  </button>
                                );
                              })}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <select
                              value={current.shift || "General"}
                              onChange={(e) => handleShiftChange(r.staff_id, r, e.target.value)}
                              className="px-2 py-1 rounded-lg border border-border bg-card text-xs font-semibold focus:outline-none"
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
                              value={current.check_in_time || ""}
                              onChange={(e) => handleTimeChange(r.staff_id, r, "check_in_time", e.target.value)}
                              className="px-2 py-1 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none"
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <input
                              type="time"
                              value={current.check_out_time || ""}
                              onChange={(e) => handleTimeChange(r.staff_id, r, "check_out_time", e.target.value)}
                              className="px-2 py-1 rounded-lg border border-border bg-card text-xs font-mono focus:outline-none"
                            />
                          </td>
                          <td className="py-3 px-4">
                            <input
                              type="text"
                              placeholder="Notes..."
                              value={current.remarks || ""}
                              onChange={(e) => {
                                const curr = attendanceEdits[r.staff_id] || r;
                                setAttendanceEdits({
                                  ...attendanceEdits,
                                  [r.staff_id]: { ...curr, staff_id: r.staff_id, remarks: e.target.value },
                                });
                              }}
                              className="w-full px-2 py-1 rounded-lg border border-border bg-card text-xs focus:outline-none"
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
        </div>
      )}

      {/* Tab 2: Staff Directory */}
      {activeTab === "directory" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search staff by Name, Role, Phone, ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-card border border-border text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
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
                <div key={staff.staff_id} className="rounded-2xl border border-border/60 bg-card p-4 shadow-sm space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-bold text-sm text-foreground">{staff.name}</h4>
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

                  <div className="space-y-1.5 text-xs text-muted-foreground border-t border-border/40 pt-2.5">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Role:</span>
                      <span className="font-bold text-foreground">{staff.role}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Department:</span>
                      <span className="font-semibold text-foreground">{staff.department}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="font-medium">Shift Pref:</span>
                      <span className="font-medium">{staff.shift_preference || "General"}</span>
                    </div>
                    {staff.phone && (
                      <div className="flex items-center gap-1.5 pt-1 text-[11px] font-mono text-foreground">
                        <Phone className="h-3 w-3 text-muted-foreground" />
                        <span>{staff.phone}</span>
                      </div>
                    )}
                  </div>

                  <div className="pt-2 border-t border-border/40 flex justify-end">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedStaffForEdit(staff);
                        setEditStaffOpen(true);
                      }}
                      className="text-xs h-7 gap-1"
                    >
                      <Edit2 className="h-3 w-3" />
                      <span>Edit Profile</span>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* Add Staff Modal */}
      {addStaffOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-bold text-foreground">Add New Staff Member</h3>
              <button
                type="button"
                onClick={() => setAddStaffOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Chandra"
                  value={staffForm.name}
                  onChange={(e) => setStaffForm({ ...staffForm, name: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground">Role *</label>
                  <select
                    value={staffForm.role}
                    onChange={(e) => setStaffForm({ ...staffForm, role: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  >
                    <option value="Cashier">Cashier</option>
                    <option value="Floor Associate">Floor Associate</option>
                    <option value="Department Supervisor">Department Supervisor</option>
                    <option value="Inventory Clerk">Inventory Clerk</option>
                    <option value="Security">Security</option>
                    <option value="Housekeeping">Housekeeping</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground">Department *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Menswear"
                    value={staffForm.department}
                    onChange={(e) => setStaffForm({ ...staffForm, department: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground">Phone Number *</label>
                  <input
                    type="tel"
                    required
                    placeholder="9830012345"
                    value={staffForm.phone}
                    onChange={(e) => setStaffForm({ ...staffForm, phone: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground">Shift Preference</label>
                  <select
                    value={staffForm.shift_preference}
                    onChange={(e) => setStaffForm({ ...staffForm, shift_preference: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  >
                    <option value="Morning">Morning</option>
                    <option value="Evening">Evening</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="font-semibold text-muted-foreground">Email (Optional)</label>
                <input
                  type="email"
                  placeholder="ramesh@citimart.in"
                  value={staffForm.email}
                  onChange={(e) => setStaffForm({ ...staffForm, email: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => setAddStaffOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => createStaffMutation.mutate(staffForm)}
                disabled={createStaffMutation.isPending || !staffForm.name || !staffForm.phone}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {createStaffMutation.isPending ? "Adding..." : "Save Staff"}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Staff Modal */}
      {editStaffOpen && selectedStaffForEdit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <h3 className="text-base font-bold text-foreground">Edit Staff Profile</h3>
              <button
                type="button"
                onClick={() => setEditStaffOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-muted-foreground">Full Name</label>
                <input
                  type="text"
                  value={selectedStaffForEdit.name}
                  onChange={(e) => setSelectedStaffForEdit({ ...selectedStaffForEdit, name: e.target.value })}
                  className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground">Role</label>
                  <select
                    value={selectedStaffForEdit.role}
                    onChange={(e) => setSelectedStaffForEdit({ ...selectedStaffForEdit, role: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  >
                    <option value="Cashier">Cashier</option>
                    <option value="Floor Associate">Floor Associate</option>
                    <option value="Department Supervisor">Department Supervisor</option>
                    <option value="Inventory Clerk">Inventory Clerk</option>
                    <option value="Security">Security</option>
                    <option value="Housekeeping">Housekeeping</option>
                  </select>
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground">Status</label>
                  <select
                    value={selectedStaffForEdit.status}
                    onChange={(e) => setSelectedStaffForEdit({ ...selectedStaffForEdit, status: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="ON_LEAVE">ON_LEAVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-muted-foreground">Department</label>
                  <input
                    type="text"
                    value={selectedStaffForEdit.department}
                    onChange={(e) => setSelectedStaffForEdit({ ...selectedStaffForEdit, department: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  />
                </div>

                <div>
                  <label className="font-semibold text-muted-foreground">Phone</label>
                  <input
                    type="tel"
                    value={selectedStaffForEdit.phone}
                    onChange={(e) => setSelectedStaffForEdit({ ...selectedStaffForEdit, phone: e.target.value })}
                    className="mt-1 w-full p-2 rounded-xl bg-background border border-border text-xs"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
              <Button variant="outline" size="sm" onClick={() => setEditStaffOpen(false)}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() =>
                  updateStaffMutation.mutate({
                    name: selectedStaffForEdit.name,
                    role: selectedStaffForEdit.role,
                    department: selectedStaffForEdit.department,
                    phone: selectedStaffForEdit.phone,
                    status: selectedStaffForEdit.status,
                  })
                }
                disabled={updateStaffMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700 text-white"
              >
                {updateStaffMutation.isPending ? "Updating..." : "Update Profile"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

