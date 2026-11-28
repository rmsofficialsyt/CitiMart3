import type { RequisitionStatus } from "@/lib/types";

/**
 * Allowed requisition status moves -- the client mirror of the transition
 * table in docs/specs/ops-modules-hardening/spec.md (US-R1). The status
 * dialog offers only these, so a Fulfilled slip can't be dragged back to
 * Pending by a mis-click. The server is meant to be authoritative; until the
 * backend half of that spec lands, this is the only guard.
 */
export const REQUISITION_TRANSITIONS: Record<RequisitionStatus, RequisitionStatus[]> = {
  Pending: ["In Review", "Approved", "Rejected"],
  "In Review": ["Approved", "Rejected", "Pending"],
  Approved: ["In Transit", "Fulfilled", "Rejected"],
  "In Transit": ["Fulfilled"],
  Fulfilled: [],
  Rejected: [],
};

export function nextStatuses(current: RequisitionStatus): RequisitionStatus[] {
  return REQUISITION_TRANSITIONS[current] ?? [];
}

export function isTerminalStatus(status: RequisitionStatus): boolean {
  return nextStatuses(status).length === 0;
}
