export const DEFAULT_NABIS_DASHBOARD_ORG_ID = 'picc_company_workspace';

type DashboardOrgEnv = Record<string, string | undefined>;

function cleanOrgId(value: string | undefined) {
  const trimmed = value?.trim();
  return trimmed || null;
}

export function resolveNabisDashboardOrgId(env: DashboardOrgEnv = process.env) {
  return cleanOrgId(env.NABIS_DASHBOARD_ORG_ID) || cleanOrgId(env.PICC_NABIS_ORG_ID) || DEFAULT_NABIS_DASHBOARD_ORG_ID;
}
