import { describe, expect, it } from 'vitest';
import { buildMicrobarSampleEmailDraft, selectLatestNabisOrderForEmail } from '@/lib/nabis/microbar-sample-email';

describe('Microbar Nabis sample email draft', () => {
  it('selects the latest cached Nabis order by created date', () => {
    const latest = selectLatestNabisOrderForEmail([
      {
        orderNumber: 'NY100',
        createdDate: '2026-05-01T12:00:00.000Z',
      },
      {
        orderNumber: 'NY200',
        createdDate: '2026-05-05T12:00:00.000Z',
      },
      {
        orderNumber: 'NY150',
        createdDate: '2026-05-03T12:00:00.000Z',
      },
    ]);

    expect(latest?.orderNumber).toBe('NY200');
  });

  it('builds the exact Nabis Microbar sample request email', () => {
    const draft = buildMicrobarSampleEmailDraft({
      storeName: 'Queens Elevated',
      orderNumber: 'NY924522',
    });

    expect(draft.to).toBe('helpny@nabis.com');
    expect(draft.subject).toBe('Edits to Order NY924522 - Queens Elevated - Microbar Samples Requested');
    expect(draft.body).toBe(`Hi Nabis,

Can you please add the following units from Microbar's Marketplace to Order NY924522 for Queens Elevated as a sample?

1 Unit of Microbar - 1g - Blackberry Slush - Sativa
1 Unit of Microbar - 1g - Lemon Diesel - Sativa
1 Unit of Microbar - 1g - Rocket Popz - Indica
1 Unit of Microbar - 1g - Melon Bar Quickstrike - Sativa
1 Unit of Microbar - 1g - Strawberry Fields - Indica
1 Unit of Microbar - 1g - Golden Dragon Fruit - Hybrid
1 Unit of Microbar - 1g - Peach Driver - Hybrid
1 Unit of Microbar - 1g - Zhirley Temple - Hybrid

Best,`);
    expect(draft.mailtoHref).toContain('mailto:helpny%40nabis.com');
    expect(decodeURIComponent(draft.mailtoHref)).toContain(draft.subject);
    expect(decodeURIComponent(draft.mailtoHref)).toContain(draft.body);
  });
});
