const hasClerkLivePublishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_live_') ?? false;
const hasClerkLiveSecret = process.env.CLERK_SECRET_KEY?.startsWith('sk_live_') ?? false;
const hasClerkTestPublishable = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.startsWith('pk_test_') ?? false;
const hasClerkTestSecret = process.env.CLERK_SECRET_KEY?.startsWith('sk_test_') ?? false;
const isProduction = process.env.NODE_ENV === 'production';

export const DEMO_MODE = process.env.DEMO_MODE === 'true' && !(hasClerkLivePublishable && hasClerkLiveSecret);
export const CLERK_TEST_IN_PRODUCTION = isProduction && hasClerkTestPublishable && hasClerkTestSecret;
export const AUTH_BYPASS_MODE = DEMO_MODE || CLERK_TEST_IN_PRODUCTION;
export const DEMO_ORG_ID = process.env.DEMO_ORG_ID ?? 'org_picc_demo';
export const DEMO_USER_ID = process.env.DEMO_USER_ID ?? 'demo_user';
