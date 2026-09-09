// Hand-mirrored from config/auth_users.py (the backend is the source of truth,
// same no-codegen convention as lib/types.ts). Four fixed accounts; usernames
// never change.

export type Role = "admin" | "manager";
export type StoreCode = "NM" | "HB" | "CHW";

export interface AccountOption {
  username: string;
  label: string; // what the login <Select> shows
  role: Role;
  storeCode: StoreCode | null;
}

export const ADMIN_USERNAME = "ADMINISTRATOR";

// Must match config.settings.STORE_CODE_TO_NAME exactly.
export const STORE_NAME_BY_CODE: Record<StoreCode, string> = {
  NM: "CITIMART - NEW MARKET",
  HB: "CITIMART - HATIBAGAN",
  CHW: "CITIMART - CHOWRINGHEE",
};

export const ACCOUNT_OPTIONS: AccountOption[] = [
  { username: ADMIN_USERNAME, label: "Administrator", role: "admin", storeCode: null },
  { username: STORE_NAME_BY_CODE.NM, label: "New Market — Store Manager", role: "manager", storeCode: "NM" },
  { username: STORE_NAME_BY_CODE.HB, label: "Hatibagan — Store Manager", role: "manager", storeCode: "HB" },
  { username: STORE_NAME_BY_CODE.CHW, label: "Chowringhee — Store Manager", role: "manager", storeCode: "CHW" },
];

// Grid of sign-in choices shown on the Landing page and the Login page (in place
// of the old account <Select>). One entry per account in ACCOUNT_OPTIONS; each
// links to /login?account=<username>.
export interface SignInOption {
  username: string;
  title: string;
  sub: string;
}

export const SIGN_IN_OPTIONS: SignInOption[] = [
  { username: ADMIN_USERNAME, title: "CITIMART — Admin (All)", sub: "All stores · targets & summary" },
  { username: STORE_NAME_BY_CODE.NM, title: "CITIMART — New Market", sub: "Store manager" },
  { username: STORE_NAME_BY_CODE.HB, title: "CITIMART — Hatibagan", sub: "Store manager" },
  { username: STORE_NAME_BY_CODE.CHW, title: "CITIMART — Chowringhee", sub: "Store manager" },
];

// NM -> "nm" etc., to line up with App.tsx's DAILY_STORES ids.
export const DAILY_STORE_ID_BY_CODE: Record<StoreCode, "nm" | "hb" | "chw"> = {
  NM: "nm",
  HB: "hb",
  CHW: "chw",
};

export function accountForUsername(username: string): AccountOption | undefined {
  return ACCOUNT_OPTIONS.find((a) => a.username === username);
}
