import { Channel } from '@prisma/client';

export const mockThreadTemplates = [
  {
    channel: Channel.EMAIL,
    subject: 'Weekly order check-in',
    messages: [
      'Hi team — can you confirm your Friday reorder window?',
      'Yes, we can place by 2pm. Please include State of Mind displays.',
    ],
  },
  {
    channel: Channel.SMS,
    subject: null,
    messages: ['Vendor day reminder for tomorrow at 1pm.', 'Confirmed, we are set.'],
  },
  {
    channel: Channel.PHONE_CALL,
    subject: 'Call recap',
    messages: ['Spoke with buyer. They need payment term update before ordering.'],
  },
];
