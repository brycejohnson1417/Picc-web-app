export const AppRoles = {
  ADMIN: 'ADMIN',
  OPS_TEAM: 'OPS_TEAM',
  SALES_REP: 'SALES_REP',
  FINANCE: 'FINANCE',
  BRAND_AMBASSADOR: 'BRAND_AMBASSADOR',
  GUEST_VIEWER: 'GUEST_VIEWER',
} as const;

export type AppRole = (typeof AppRoles)[keyof typeof AppRoles];

export const WriteEnabledRoles: AppRole[] = [
  AppRoles.ADMIN,
  AppRoles.OPS_TEAM,
  AppRoles.SALES_REP,
  AppRoles.FINANCE,
  AppRoles.BRAND_AMBASSADOR,
];

export const RoleDisplayNames: Record<AppRole, string> = {
  ADMIN: 'Admin',
  OPS_TEAM: 'Ops',
  SALES_REP: 'Sales Rep',
  FINANCE: 'Finance',
  BRAND_AMBASSADOR: 'Brand Ambassador',
  GUEST_VIEWER: 'Read Only',
};
