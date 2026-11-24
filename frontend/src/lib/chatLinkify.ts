// Remark plugin: turns dates, store names and page keywords in a Co-Pilot reply
// into in-app links (/app?store=&view=&date=). Runs at render time only, so the
// stored reply text stays plain, and the model never authors these links.
//
// A manager only ever gets links for their own store; the "Sales Target" page
// link is admin-only. App.tsx enforces the same rules again when a link opens.
import type { DailyStoreSel, DailyView } from "@/components/NavigationSidebar";
import { appHref, isIsoDate, storeSelForCode } from "@/lib/appLinks";

interface MdNode {
  type: string;
  value?: string;
  url?: string;
  title?: string | null;
  children?: MdNode[];
}

export interface ChatLinkContext {
  /** Store code the reply is about ("NM" | "HB" | "CHW" | "ALL"). */
  storeCode: string;
  isAdmin: boolean;
  /** The signed-in manager's own store code; ignored for an admin. */
  userStoreCode?: string | null;
}

// Never rewrite text that is already a link or code.
const SKIP = new Set(["link", "linkReference", "code", "inlineCode", "definition", "html"]);

const STORE_BY_NAME: Record<string, string> = {
  "new market": "NM",
  hatibagan: "HB",
  chowringhee: "CHW",
  "নিউ মার্কেট": "NM",
  "হাতিবাগান": "HB",
  "চৌরঙ্গী": "CHW",
  "न्यू मार्केट": "NM",
  "हाथीबागान": "HB",
  "हातीबागान": "HB",
  "चौरंगी": "CHW",
};

// Groups: 1 date, 2 latin store name, 3 bn/hi store name, 4 store code,
// 5 requisition, 6 stock, 7 staff, 8 sales target.
const TOKEN = new RegExp(
  [
    String.raw`(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)`,
    String.raw`\b(new market|hatibagan|chowringhee)\b`,
    "(নিউ মার্কেট|হাতিবাগান|চৌরঙ্গী|न्यू मार्केट|हाथीबागान|हातीबागान|चौरंगी)",
    String.raw`\b(NM|HB|CHW)\b`,
    String.raw`\b(requisitions?)\b`,
    String.raw`\b(stocks?)\b`,
    String.raw`\b(staff|attendance)\b`,
    String.raw`\b(sales target)\b`,
  ].join("|"),
  "giu",
);

function storeAllowed(code: string, ctx: ChatLinkContext): boolean {
  return ctx.isAdmin || code === (ctx.userStoreCode || "").toUpperCase();
}

/** The store a date / keyword link should open, respecting the manager clamp. */
function contextStore(ctx: ChatLinkContext): DailyStoreSel | undefined {
  const code = ctx.isAdmin ? ctx.storeCode : ctx.userStoreCode || ctx.storeCode;
  return storeSelForCode(code);
}

function hrefFor(m: RegExpExecArray, ctx: ChatLinkContext): string | null {
  const [, date, latinName, localName, code, req, stock, staff, target] = m;
  const page = (view: DailyView, extra?: { date?: string }) => {
    const store = contextStore(ctx);
    return store ? appHref({ store, view, ...extra }) : null;
  };

  if (date) return isIsoDate(date) ? page("history", { date }) : null;

  const storeCode =
    (latinName && STORE_BY_NAME[latinName.toLowerCase()]) ||
    (localName && STORE_BY_NAME[localName]) ||
    (code && code === code.toUpperCase() ? code : undefined);
  if (latinName || localName || code) {
    if (!storeCode || !storeAllowed(storeCode, ctx)) return null;
    const store = storeSelForCode(storeCode);
    return store ? appHref({ store, view: "dashboard" }) : null;
  }

  if (req) return page("requisition");
  if (stock) return page("stocks");
  if (staff) return page("staff");
  if (target) return ctx.isAdmin && ctx.storeCode.toUpperCase() !== "ALL" ? page("target") : null;
  return null;
}

function splitText(node: MdNode, ctx: ChatLinkContext): MdNode[] {
  const text = node.value ?? "";
  const out: MdNode[] = [];
  let last = 0;
  TOKEN.lastIndex = 0;
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    const href = hrefFor(m, ctx);
    if (!href) continue;
    if (m.index > last) out.push({ type: "text", value: text.slice(last, m.index) });
    out.push({ type: "link", url: href, title: null, children: [{ type: "text", value: m[0] }] });
    last = m.index + m[0].length;
  }
  if (last === 0) return [node];
  if (last < text.length) out.push({ type: "text", value: text.slice(last) });
  return out;
}

function visit(node: MdNode, ctx: ChatLinkContext): void {
  if (!node.children || SKIP.has(node.type)) return;
  node.children = node.children.flatMap((child) => {
    if (child.type === "text") return splitText(child, ctx);
    visit(child, ctx);
    return [child];
  });
}

export function remarkChatLinks(ctx: ChatLinkContext) {
  return (tree: MdNode) => visit(tree, ctx);
}
