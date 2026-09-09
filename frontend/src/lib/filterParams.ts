import { FILTER_HIERARCHY, type FilterState } from "@/lib/types";

/** Builds the same query-param shape api/deps.py's parse_filter_state expects. */
export function toSearchParams(state: FilterState, extra: Record<string, string | number | undefined> = {}): URLSearchParams {
  const params = new URLSearchParams();
  if (state.stores.length) params.set("stores", state.stores.join(","));
  if (state.start) params.set("start", state.start);
  if (state.end) params.set("end", state.end);
  if (state.time_slot.length) params.set("time_slot", state.time_slot.join(","));
  for (const field of FILTER_HIERARCHY) {
    const values = state[field];
    if (values.length) params.set(field, values.join(","));
  }
  for (const [key, value] of Object.entries(extra)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  return params;
}

/** A stable, serialisable cache key for react-query -- same filters => same key. */
export function filterQueryKey(state: FilterState, extra: Record<string, unknown> = {}) {
  return [
    state.stores.slice().sort(),
    state.start,
    state.end,
    state.time_slot.slice().sort(),
    ...FILTER_HIERARCHY.map((f) => state[f].slice().sort()),
    extra,
  ];
}

export function emptyFilterState(): FilterState {
  return {
    stores: [],
    start: "",
    end: "",
    time_slot: [],
    division: [],
    section: [],
    department: [],
    product_design_no: [],
    product_style: [],
    product_type: [],
    product_size: [],
    vendors: [],
  };
}
