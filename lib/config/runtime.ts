const demoModeRequested = process.env.DEMO_MODE === 'true';
const runningInProduction = process.env.NODE_ENV === 'production';

export const DEMO_MODE = demoModeRequested && !runningInProduction;
export const DEMO_ORG_ID = process.env.DEMO_ORG_ID ?? 'org_picc_demo';
export const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo_user';
