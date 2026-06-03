export const MICROBAR_NABIS_HELP_EMAIL = 'helpny@nabis.com';

export const MICROBAR_SAMPLE_UNITS = [
  '1 Unit of Microbar - 1g - Blackberry Slush - Sativa',
  '1 Unit of Microbar - 1g - Lemon Diesel - Sativa',
  '1 Unit of Microbar - 1g - Rocket Popz - Indica',
  '1 Unit of Microbar - 1g - Melon Bar Quickstrike - Sativa',
  '1 Unit of Microbar - 1g - Strawberry Fields - Indica',
  '1 Unit of Microbar - 1g - Golden Dragon Fruit - Hybrid',
  '1 Unit of Microbar - 1g - Peach Driver - Hybrid',
  '1 Unit of Microbar - 1g - Zhirley Temple - Hybrid',
] as const;

export type NabisOrderForMicrobarEmail = {
  orderNumber: string | null;
  createdDate: string | null;
  deliveryDate?: string | null;
};

export type MicrobarSampleEmailDraft = {
  to: string;
  subject: string;
  body: string;
  mailtoHref: string;
};

export function selectLatestNabisOrderForEmail<T extends NabisOrderForMicrobarEmail>(orders: T[]) {
  return (
    [...orders]
      .filter((order) => Boolean(order.orderNumber))
      .sort((left, right) => {
        const leftTime = orderTime(left);
        const rightTime = orderTime(right);
        return rightTime - leftTime;
      })[0] ?? null
  );
}

export function buildMicrobarSampleEmailDraft({
  storeName,
  orderNumber,
}: {
  storeName: string;
  orderNumber: string;
}): MicrobarSampleEmailDraft {
  const cleanStoreName = storeName.trim();
  const cleanOrderNumber = orderNumber.trim();
  const subject = `Edits to Order ${cleanOrderNumber} - ${cleanStoreName} - Microbar Samples Requested`;
  const body = [
    'Hi Nabis,',
    '',
    `Can you please add the following units from Microbar's Marketplace to Order ${cleanOrderNumber} for ${cleanStoreName} as a sample?`,
    '',
    ...MICROBAR_SAMPLE_UNITS,
    '',
    'Best,',
  ].join('\n');

  return {
    to: MICROBAR_NABIS_HELP_EMAIL,
    subject,
    body,
    mailtoHref: `mailto:${encodeURIComponent(MICROBAR_NABIS_HELP_EMAIL)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
  };
}

function orderTime(order: NabisOrderForMicrobarEmail) {
  const primary = order.createdDate ? new Date(order.createdDate).getTime() : Number.NaN;
  if (Number.isFinite(primary)) return primary;
  const fallback = order.deliveryDate ? new Date(order.deliveryDate).getTime() : Number.NaN;
  return Number.isFinite(fallback) ? fallback : 0;
}
