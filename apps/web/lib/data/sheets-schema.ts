export const REQUIRED_NABIS_TABS = [
  'orders',
  'details',
  'Master Sales Sheet - By Store',
  'Synced Master Sales Sheet',
  'Payment History',
  'Referral Orders (POSO)',
  'Credits',
  'Samples',
  'Missing Stores (New Orders)',
  'Re-Orders',
] as const;

export const NABIS_SCHEMA_MAPPING = {
  orders: {
    target: 'NabisOrder',
    keys: [
      'Order ID',
      'Order Number',
      'Licensed Location ID',
      'Licensed Location Name',
      'Order Total',
      'Order Payment Status',
      'Delivery Date',
      'Sales Rep',
      'PO/SO number',
    ],
  },
  details: {
    target: 'NabisOrderLine',
    keys: [
      'Order ID',
      'Line item product name',
      'Line item quantity',
      'Line item price per unit',
      'Line item is sample',
      'Item strain',
      'Item inventory category',
      'Item inventory class',
    ],
  },
  'Payment History': {
    target: 'OverdueSnapshot',
    keys: ['License Location ID', 'Dispensary Name', 'Credit Status', 'Overdue Orders', 'Days Overdue'],
  },
  'Referral Orders (POSO)': {
    target: 'ReferralRecord',
    keys: ['Retail Store', 'Order Number', 'Order Total', 'Order Created Date', 'PO/SO'],
  },
  Credits: {
    target: 'PennyBundleCreditSubmission',
    keys: ['Retail Store', 'Order Number', 'Order Total', 'Credit Memo', 'Rep'],
  },
  Samples: {
    target: 'SampleBoxRequest',
    keys: ['Retail Store', 'Order Number', 'Delivery Date', 'Rep', 'Number of Samples'],
  },
  'Master Sales Sheet - By Store': {
    target: 'AccountMetricsCache',
    keys: ['License Location ID', 'Dispensary Name', 'Rep Listed on Latest Order', 'Total Ordered (Amount)', 'Last Order Amount Above 1$'],
  },
  'Synced Master Sales Sheet': {
    target: 'AccountMetricsCache',
    keys: ['License Location ID', 'Dispensary Name', 'Total Ordered (Amount)', 'Last Order Amount Above 1$'],
  },
  'Missing Stores (New Orders)': {
    target: 'OpsQueueMissingStore',
    keys: ['License Location ID', 'Store Name'],
  },
  'Re-Orders': {
    target: 'OpsQueueReorder',
    keys: ['Rep', 'Store Name', 'License Location ID (Nabis)', 'Last Order Total', 'Created Date'],
  },
} as const;
