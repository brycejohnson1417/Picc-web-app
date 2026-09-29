const hasClerkLivePublishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_') ?? false;
const hasClerkLiveSecret = process.env.CLERK_SECRET_KEY?.startsWith('sk_live_') ?? false;
const isProduction = process.env.NODE_ENV === 'production';

export const PRODUCTION_AUTH_MISCONFIGURED = isProduction && !(hasClerkLivePublishable && hasClerkLiveSecret);
export const AUTH_CONFIGURATION_MESSAGE = 'Authentication is temporarily unavailable. Contact your administrator.';
export const DEMO_MODE = !isProduction && process.env.DEMO_MODE === 'true' && !(hasClerkLivePublishable && hasClerkLiveSecret);
export const AUTH_BYPASS_MODE = DEMO_MODE;
export const DEMO_ORG_ID = process.env.DEMO_ORG_ID ?? 'org_picc_demo';
export const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo_user';
