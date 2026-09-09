// Derives a plain {columns, rows} table straight out of a Plotly figure's
// own `data` traces (no extra backend endpoint/API round-trip needed) --
// used to power the "View Table" toggle that sits alongside every chart and
// gauge. Handles the trace shapes actually produced by src/charts.py: plain
// bar/scatter/waterfall (shared x, one column per trace), horizontal bar
// (top products/brands), funnel, sunburst, and indicator (gauge).
export interface DerivedTable {
  columns: string[];
  rows: Record<string, unknown>[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTrace = any;

const TYPED_ARRAY_CTORS: Record<string, new (buf: ArrayBuffer) => ArrayLike<number>> = {
  i1: Int8Array,
  u1: Uint8Array,
  i2: Int16Array,
  u2: Uint16Array,
  i4: Int32Array,
  u4: Uint32Array,
  f4: Float32Array,
  f8: Float64Array,
};

// Plotly 6 can serialise numeric arrays as a base64-packed typed-array spec
// (`{dtype, bdata}`) instead of a plain JSON array -- a perf optimisation
// Plotly.js decodes transparently when rendering the chart itself. Since
// this module reads trace arrays directly (bypassing Plotly.js), it has to
// decode that spec the same way, or a plain array is returned unchanged.
function decodeArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && "bdata" in value && "dtype" in value) {
    const { bdata, dtype } = value as { bdata: string; dtype: string };
    const Ctor = TYPED_ARRAY_CTORS[dtype];
    if (!Ctor) return [];
    const binary = atob(bdata);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return Array.from(new Ctor(bytes.buffer));
  }
  return [];
}

function axisTitle(axis: AnyTrace, fallback: string): string {
  const t = axis?.title;
  if (!t) return fallback;
  return typeof t === "string" ? t : (t.text ?? fallback);
}

export function deriveTableFromFigure(data: AnyTrace[] | undefined, layout: AnyTrace | undefined): DerivedTable | null {
  if (!data || data.length === 0) return null;
  const first = data[0];

  if (data.length === 1 && first.type === "indicator") {
    const rows: Record<string, unknown>[] = [{ Metric: first.title?.text ?? "Value", Value: first.value ?? null }];
    if (first.delta?.reference !== undefined && first.delta?.reference !== null) {
      rows[0]["Target"] = first.delta.reference;
    }
    return { columns: Object.keys(rows[0]), rows };
  }

  if (data.length === 1 && first.type === "funnel") {
    const stages = decodeArray(first.y);
    const values = decodeArray(first.x) as number[];
    return { columns: ["Stage", "Value"], rows: stages.map((stage, i) => ({ Stage: stage, Value: values[i] ?? null })) };
  }

  // Pie comes from the chart-type switcher (charts.apply_chart_type) collapsing
  // a bar/line chart to its primary series.
  if (data.length === 1 && first.type === "pie") {
    const labels = decodeArray(first.labels);
    const values = decodeArray(first.values) as number[];
    return { columns: ["Category", "Value"], rows: labels.map((label, i) => ({ Category: label, Value: values[i] ?? null })) };
  }

  // 3D bar (mesh3d cuboids) carries no tabular x/y — its sections have their
  // own <DataTable> companion, so there's nothing to derive here.
  if (first.type === "mesh3d" || first.type === "scatter3d") return null;

  if (data.length === 1 && first.type === "sunburst") {
    const labels = decodeArray(first.labels) as string[];
    const parents = decodeArray(first.parents) as string[];
    const values = decodeArray(first.values) as number[];
    return {
      columns: ["Label", "Parent", "Value"],
      rows: labels.map((label, i) => ({ Label: label, Parent: parents[i] || "—", Value: values[i] ?? null })),
    };
  }

  if (first.orientation === "h" && first.y && first.x) {
    const catKey = axisTitle(layout?.yaxis, "Category");
    const valKey = axisTitle(layout?.xaxis, "Value");
    const categories = decodeArray(first.y);
    const values = decodeArray(first.x) as number[];
    return { columns: [catKey, valKey], rows: categories.map((c, i) => ({ [catKey]: c, [valKey]: values[i] ?? null })) };
  }

  if (first.x) {
    const catKey = axisTitle(layout?.xaxis, "Category");
    const categories = decodeArray(first.x);
    const rows: Record<string, unknown>[] = categories.map((c) => ({ [catKey]: c }));
    const columns = [catKey];
    data.forEach((trace: AnyTrace, ti: number) => {
      if (!trace.y) return;
      const colName: string = trace.name || (data.length === 1 ? axisTitle(layout?.yaxis, "Value") : `Series ${ti + 1}`);
      columns.push(colName);
      decodeArray(trace.y).forEach((y, i) => {
        if (rows[i]) rows[i][colName] = y;
      });
    });
    return { columns, rows };
  }

  return null;
}
