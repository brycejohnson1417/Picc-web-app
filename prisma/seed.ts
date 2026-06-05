import {
  ActivityType,
  Channel,
  OpportunityStatus,
  PrismaClient,
  RecordStatus,
  Role,
  TaskPriority,
  TaskStatus,
  WorkflowStatus,
} from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  await prisma.exportJob.deleteMany();
  await prisma.importJob.deleteMany();
  await prisma.syncRun.deleteMany();
  await prisma.syncCheckpoint.deleteMany();
  await prisma.externalRecordMap.deleteMany();
  await prisma.integrationConnection.deleteMany();
  await prisma.nabisOrderLine.deleteMany();
  await prisma.nabisOrder.deleteMany();
  await prisma.sampleBoxRequest.deleteMany();
  await prisma.pennyBundleCreditSubmission.deleteMany();
  await prisma.vendorDayEvent.deleteMany();
  await prisma.overdueSnapshot.deleteMany();
  await prisma.referralRecord.deleteMany();
  await prisma.editSuggestion.deleteMany();
  await prisma.template.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.savedView.deleteMany();
  await prisma.activityLog.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.appointment.deleteMany();
  await prisma.task.deleteMany();
  await prisma.opportunity.deleteMany();
  await prisma.stage.deleteMany();
  await prisma.pipeline.deleteMany();
  await prisma.contactCustomFieldValue.deleteMany();
  await prisma.accountCustomFieldValue.deleteMany();
  await prisma.customFieldOption.deleteMany();
  await prisma.customFieldDefinition.deleteMany();
  await prisma.contactTag.deleteMany();
  await prisma.accountTag.deleteMany();
  await prisma.tag.deleteMany();
  await prisma.contact.deleteMany();
  await prisma.account.deleteMany();
  await prisma.membership.deleteMany();
  await prisma.organizationWorkspace.deleteMany();

  const org = await prisma.organizationWorkspace.create({
    data: {
      id: 'org_picc_demo',
      clerkOrgId: 'org_picc_demo',
      name: 'PICC Platform',
    },
  });

  const users = [
    { clerkUserId: 'user_admin', role: Role.ADMIN },
    { clerkUserId: 'user_ops', role: Role.OPS_TEAM },
    { clerkUserId: 'user_sales_1', role: Role.SALES_REP },
    { clerkUserId: 'user_sales_2', role: Role.SALES_REP },
    { clerkUserId: 'user_finance', role: Role.FINANCE },
    { clerkUserId: 'user_ba', role: Role.BRAND_AMBASSADOR },
  ];

  await prisma.membership.createMany({
    data: users.map((u) => ({ ...u, orgId: org.id })),
  });

  const [dispensaryTag, overdueTag, referralTag, pppTag, vendorTag] = await Promise.all([
    prisma.tag.create({ data: { orgId: org.id, name: 'Dispensary', color: '#3b82f6' } }),
    prisma.tag.create({ data: { orgId: org.id, name: 'Overdue', color: '#dc2626' } }),
    prisma.tag.create({ data: { orgId: org.id, name: 'Referral', color: '#16a34a' } }),
    prisma.tag.create({ data: { orgId: org.id, name: 'PPP', color: '#f59e0b' } }),
    prisma.tag.create({ data: { orgId: org.id, name: 'Vendor Day', color: '#8b5cf6' } }),
  ]);

  const accountCf = await prisma.customFieldDefinition.create({
    data: {
      orgId: org.id,
      entityType: 'ACCOUNT',
      key: 'region',
      label: 'Region',
      dataType: 'select',
    },
  });

  await prisma.customFieldOption.createMany({
    data: [
      { orgId: org.id, definitionId: accountCf.id, value: 'NYC', label: 'NYC', sortOrder: 1 },
      { orgId: org.id, definitionId: accountCf.id, value: 'Upstate', label: 'Upstate', sortOrder: 2 },
      { orgId: org.id, definitionId: accountCf.id, value: 'Central', label: 'Central Region', sortOrder: 3 },
    ],
  });

  const accountsData = [
    ['Urban Green Bronx', 'OCM-AUCC-24-000101', '3551 Boston Rd', 'Bronx', 'NY', '10469'],
    ['Flowery Manhattan', 'OCM-AUCC-24-000102', '356 W 40th St', 'New York', 'NY', '10018'],
    ['Brooklyn Garden House', 'OCM-AUCC-24-000103', '1077 Atlantic Ave', 'Brooklyn', 'NY', '11238'],
    ['Capital Roots Dispensary', 'OCM-AUCC-24-000104', '25 N Pearl St', 'Albany', 'NY', '12207'],
    ['Rochester Lifted', 'OCM-AUCC-24-000105', '360 W Ridge Rd', 'Rochester', 'NY', '14615'],
    ['Buffalo Peak Wellness', 'OCM-AUCC-24-000106', '5100 Genesee St', 'Buffalo', 'NY', '14225'],
    ['Queens Elevated', 'OCM-AUCC-24-000107', '63-54 108th St', 'Forest Hills', 'NY', '11375'],
    ['Staten High Point', 'OCM-AUCC-24-000108', '3022 Veterans Rd W', 'Staten Island', 'NY', '10309'],
    ['Hudson Valley Organics', 'OCM-AUCC-24-000109', '939 Central Ave', 'Peekskill', 'NY', '10566'],
    ['Syracuse Smoke & Co', 'OCM-AUCC-24-000110', '500 Fayette St', 'Syracuse', 'NY', '13202'],
    ['Niagara Bloom', 'OCM-AUCC-24-000111', '334 Main St', 'Niagara Falls', 'NY', '14301'],
    ['Ithaca Herb Works', 'OCM-AUCC-24-000112', '121 Green St', 'Ithaca', 'NY', '14850'],
    ['Westchester Reserve', 'OCM-AUCC-24-000113', '696 Locust St', 'Mount Vernon', 'NY', '10552'],
    ['Queens Village Collective', 'OCM-AUCC-24-000114', '212-11 Hillside Ave', 'Queens Village', 'NY', '11427'],
    ['Utica Corner Cannabis', 'OCM-AUCC-24-000115', '185 Genesee St', 'Utica', 'NY', '13501'],
  ];

  const accounts = [] as Awaited<ReturnType<typeof prisma.account.create>>[];
  for (const [idx, [name, licenseNumber, address1, city, state, zipcode]] of accountsData.entries()) {
    const account = await prisma.account.create({
      data: {
        orgId: org.id,
        name,
        licenseNumber,
        address1,
        city,
        state,
        zipcode,
        phone: '(212) 555-0100',
        status: RecordStatus.ACTIVE,
      },
    });

    accounts.push(account);

    const tags = [
      { accountId: account.id, tagId: dispensaryTag.id },
      { accountId: account.id, tagId: referralTag.id },
      ...(idx % 2 === 0 ? [{ accountId: account.id, tagId: overdueTag.id }] : []),
      ...(idx % 3 === 0 ? [{ accountId: account.id, tagId: pppTag.id }] : []),
      ...(idx % 4 === 0 ? [{ accountId: account.id, tagId: vendorTag.id }] : []),
    ];

    await prisma.accountTag.createMany({ data: tags, skipDuplicates: true });
  }

  const contacts = [] as Awaited<ReturnType<typeof prisma.contact.create>>[];
  for (const [idx, account] of accounts.entries()) {
    const buyer = await prisma.contact.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        firstName: `Buyer${idx + 1}`,
        lastName: 'PICC',
        roleTitle: 'Buyer',
        email: `buyer${idx + 1}@example.com`,
        phone: `(917) 555-01${String(idx + 10).slice(-2)}`,
        status: RecordStatus.ACTIVE,
      },
    });

    const manager = await prisma.contact.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        firstName: `Manager${idx + 1}`,
        lastName: 'PICC',
        roleTitle: 'Manager',
        email: `manager${idx + 1}@example.com`,
        phone: `(917) 555-02${String(idx + 10).slice(-2)}`,
        status: idx % 5 === 0 ? RecordStatus.INACTIVE : RecordStatus.ACTIVE,
      },
    });

    contacts.push(buyer, manager);
  }

  const pipeline = await prisma.pipeline.create({
    data: {
      orgId: org.id,
      name: 'Dispensary Sales Pipeline',
      description: 'Primary pipeline for referral-driven account growth.',
    },
  });

  const stages = await Promise.all([
    prisma.stage.create({ data: { orgId: org.id, pipelineId: pipeline.id, name: 'Lead - Hot', color: '#f59e0b', probability: 20, sortOrder: 1 } }),
    prisma.stage.create({ data: { orgId: org.id, pipelineId: pipeline.id, name: 'In progress', color: '#3b82f6', probability: 45, sortOrder: 2 } }),
    prisma.stage.create({ data: { orgId: org.id, pipelineId: pipeline.id, name: 'Proposal Sent', color: '#8b5cf6', probability: 65, sortOrder: 3 } }),
    prisma.stage.create({ data: { orgId: org.id, pipelineId: pipeline.id, name: 'Customer', color: '#16a34a', probability: 100, sortOrder: 4 } }),
  ]);

  const opportunities = [] as Awaited<ReturnType<typeof prisma.opportunity.create>>[];
  for (let i = 0; i < 18; i += 1) {
    const account = accounts[i % accounts.length];
    const contact = contacts[i % contacts.length];
    const stage = stages[i % stages.length];

    const opp = await prisma.opportunity.create({
      data: {
        orgId: org.id,
        pipelineId: pipeline.id,
        stageId: stage.id,
        accountId: account.id,
        contactId: contact.id,
        ownerClerkUserId: i % 2 === 0 ? 'user_sales_1' : 'user_sales_2',
        name: `${account.name} - Q${(i % 4) + 1} Placement`,
        value: 3500 + i * 450,
        status: i % 7 === 0 ? OpportunityStatus.WON : OpportunityStatus.OPEN,
        probability: stage.probability,
        expectedCloseDate: new Date(Date.now() + (i + 5) * 86400000),
      },
    });
    opportunities.push(opp);
  }

  for (let i = 0; i < 35; i += 1) {
    const account = accounts[i % accounts.length];
    const contact = contacts[i % contacts.length];
    const opp = opportunities[i % opportunities.length];

    await prisma.task.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        contactId: contact.id,
        opportunityId: opp.id,
        assignedToUserId: i % 4 === 0 ? 'user_ops' : 'user_sales_1',
        title: i % 2 === 0 ? 'Follow up on referral status' : 'Collect payment terms confirmation',
        description: 'Automated seed task for CRM workflow testing.',
        dueDate: new Date(Date.now() + (i % 10) * 86400000),
        status: i % 5 === 0 ? TaskStatus.DONE : TaskStatus.OPEN,
        priority: i % 3 === 0 ? TaskPriority.HIGH : TaskPriority.MEDIUM,
      },
    });
  }

  for (let i = 0; i < 12; i += 1) {
    const account = accounts[i % accounts.length];
    const contact = contacts[i % contacts.length];
    await prisma.appointment.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        contactId: contact.id,
        title: 'Vendor day scheduling call',
        startsAt: new Date(Date.now() + (i + 1) * 86400000),
        endsAt: new Date(Date.now() + (i + 1) * 86400000 + 3600000),
        reminderMinutes: 60,
        createdByUserId: 'user_ops',
      },
    });
  }

  for (let i = 0; i < 20; i += 1) {
    const account = accounts[i % accounts.length];

    const convo = await prisma.conversation.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        contactId: contacts[i % contacts.length].id,
        channel: i % 3 === 0 ? Channel.EMAIL : i % 3 === 1 ? Channel.SMS : Channel.PHONE_CALL,
        subject: `Conversation thread ${i + 1}`,
        assignedToUserId: 'user_sales_1',
        unreadCount: i % 4,
        lastMessageAt: new Date(Date.now() - i * 3600000),
        isMock: true,
      },
    });

    for (let j = 0; j < 3; j += 1) {
      const channel = convo.channel;
      const direction = j % 2 === 0 ? 'INBOUND' : 'OUTBOUND';

      const msg = await prisma.message.create({
        data: {
          orgId: org.id,
          conversationId: convo.id,
          accountId: account.id,
          contactId: contacts[i % contacts.length].id,
          channel,
          direction,
          subject: channel === Channel.EMAIL ? 'Order update' : null,
          body: `Mock ${channel.toLowerCase()} message ${j + 1} for ${account.name}`,
          isMock: true,
          sentAt: new Date(Date.now() - i * 3600000 - j * 600000),
          createdByUserId: direction === 'OUTBOUND' ? 'user_sales_1' : null,
        },
      });

      await prisma.activityLog.create({
        data: {
          orgId: org.id,
          accountId: account.id,
          contactId: contacts[i % contacts.length].id,
          messageId: msg.id,
          actorClerkUserId: direction === 'OUTBOUND' ? 'user_sales_1' : 'user_ba',
          type: direction === 'OUTBOUND' ? ActivityType.MESSAGE_SENT : ActivityType.MESSAGE_RECEIVED,
          title: `${direction === 'OUTBOUND' ? 'Sent' : 'Received'} ${channel.toLowerCase()} message`,
          description: msg.body,
          channel,
        },
      });
    }
  }

  for (let i = 0; i < 18; i += 1) {
    const account = accounts[i % accounts.length];

    const vendorDay = await prisma.vendorDayEvent.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        eventDate: new Date(Date.now() + (i + 2) * 86400000),
        status: i % 5 === 0 ? WorkflowStatus.COMPLETED : WorkflowStatus.SUBMITTED,
        repName: i % 2 === 0 ? 'Benjamin Rosenthal' : 'Bryce Johnson',
        ambassadorName: 'Avry Aviles',
        vdContact: `Store Contact ${i + 1}`,
        vdContactEmail: `vd${i + 1}@example.com`,
        vdContactPhone: `(646) 555-30${String(i).padStart(2, '0')}`,
        promoStatus: i % 3 === 0 ? 'Accepted' : 'Offered',
        createdBy: 'user_ops',
      },
    });

    await prisma.pennyBundleCreditSubmission.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        vendorDayEventId: vendorDay.id,
        orderNumber: `90${1000 + i}`,
        creditMemo: `CM-${500 + i}`,
        creditAmount: 250 + i * 20,
        status: i % 4 === 0 ? WorkflowStatus.IN_REVIEW : WorkflowStatus.SUBMITTED,
        requestedBy: 'user_ba',
      },
    });

    await prisma.sampleBoxRequest.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        contactId: contacts[i % contacts.length].id,
        requestedBy: 'user_sales_1',
        status: i % 3 === 0 ? WorkflowStatus.APPROVED : WorkflowStatus.SUBMITTED,
        requestReason: 'Lead requested sample box before first non-sample PO.',
      },
    });

    await prisma.referralRecord.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        opportunityId: opportunities[i % opportunities.length].id,
        source: i % 2 === 0 ? 'Ben Rosenthal' : 'Bryce',
        referredBy: i % 2 === 0 ? 'Ben Rosenthal' : 'Bryce Johnson',
        orderNumber: `90${2000 + i}`,
        orderTotal: 1800 + i * 90,
        status: i % 4 === 0 ? WorkflowStatus.COMPLETED : WorkflowStatus.SUBMITTED,
      },
    });

    await prisma.overdueSnapshot.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        sourceLicenseId: `lic-${i + 1}`,
        creditStatus: i % 4 === 0 ? 'Payment Required' : 'Send/Good',
        overdueOrders: i % 5,
        daysOverdue1: i % 2 === 0 ? 0 : 7 + i,
        daysOverdue2: i % 3 === 0 ? 15 + i : 0,
        daysOverdue3: i % 6 === 0 ? 31 + i : 0,
        amountOverdue: i % 2 === 0 ? 0 : 350 + i * 50,
      },
    });

    await prisma.activityLog.create({
      data: {
        orgId: org.id,
        accountId: account.id,
        actorClerkUserId: 'user_ops',
        type: ActivityType.QUICK_LOG,
        title: 'Vendor day workflow updated',
        description: 'Vendor day event, penny bundle submission, and sample box workflow synced.',
      },
    });
  }

  const sheetsConnection = await prisma.integrationConnection.create({
    data: {
      orgId: org.id,
      provider: 'GOOGLE_SHEETS',
      name: 'Nabis Master Sheet',
      config: {
        workbookPath: process.env.NABIS_MASTER_SHEET_PATH || '/path/to/local/nabis-export.xlsx',
        requiredTabs: [
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
        ],
      },
      enabled: true,
      status: 'SUCCESS',
      lastSyncedAt: new Date(),
    },
  });

  await prisma.integrationConnection.create({
    data: {
      orgId: org.id,
      provider: 'NOTION',
      name: 'Notion CRM Workspace',
      config: { mode: 'bi-directional' },
      enabled: true,
      status: 'IDLE',
    },
  });

  await prisma.integrationConnection.create({
    data: {
      orgId: org.id,
      provider: 'GMAIL',
      name: 'PICC GSuite Mailbox',
      config: { fromAddress: 'ops@piccplatform.com' },
      enabled: true,
      status: 'IDLE',
    },
  });

  const nabisConnection = await prisma.integrationConnection.create({
    data: {
      orgId: org.id,
      provider: 'NABIS',
      name: 'Nabis NY V2 API',
      config: { market: 'NY', mode: 'local-seed' },
      enabled: true,
      status: 'SUCCESS',
      lastSyncedAt: new Date(),
    },
  });

  const nabisOrders = [
    {
      externalOrderId: 'NY924483',
      orderNumber: 'NY924483',
      account: accounts[2],
      licensedLocationId: 'LIC-NY-924483',
      licensedLocationName: 'The Emerald - Brooklyn',
      orderCreatedDate: new Date('2026-05-08T15:30:00.000Z'),
      status: 'DELIVERED',
      orderTotal: '2478.96',
      salesRep: 'Bryce Johnson',
      lines: [
        { productName: 'PICC AIO Hybrid 1g', quantity: '120', unitPrice: '12.50', itemCategory: 'Vape' },
        { productName: 'PICC Gummies 10pk', quantity: '80', unitPrice: '8.12', itemCategory: 'Edible' },
        { productName: 'PICC Flower Eighth', quantity: '20', unitPrice: '16.52', itemCategory: 'Flower' },
      ],
    },
    {
      externalOrderId: 'NY924501',
      orderNumber: 'NY924501',
      account: accounts[1],
      licensedLocationId: 'LIC-NY-924501',
      licensedLocationName: accounts[1].name,
      orderCreatedDate: new Date('2026-05-07T18:15:00.000Z'),
      status: 'DELIVERED',
      orderTotal: '1840.25',
      salesRep: 'Benjamin Rosenthal',
      lines: [
        { productName: 'PICC Mini Preroll 10pk', quantity: '100', unitPrice: '10.75', itemCategory: 'Preroll' },
        { productName: 'PICC Live Resin AIO', quantity: '45', unitPrice: '17.00', itemCategory: 'Vape' },
      ],
    },
    {
      externalOrderId: 'NY924522',
      orderNumber: 'NY924522',
      account: accounts[6],
      licensedLocationId: 'LIC-NY-924522',
      licensedLocationName: accounts[6].name,
      orderCreatedDate: new Date('2026-05-05T14:45:00.000Z'),
      status: 'DELIVERED',
      orderTotal: '3265.40',
      salesRep: 'Bryce Johnson',
      lines: [
        { productName: 'PICC Flower Quarter', quantity: '70', unitPrice: '23.00', itemCategory: 'Flower' },
        { productName: 'PICC Solventless Rosin', quantity: '60', unitPrice: '27.59', itemCategory: 'Concentrate' },
      ],
    },
    {
      externalOrderId: 'NY924566',
      orderNumber: 'NY924566',
      account: accounts[0],
      licensedLocationId: 'LIC-NY-924566',
      licensedLocationName: accounts[0].name,
      orderCreatedDate: new Date('2026-05-02T16:20:00.000Z'),
      status: 'DELIVERED',
      orderTotal: '1295.00',
      salesRep: 'Avry Aviles',
      lines: [
        { productName: 'PICC Gummies 10pk', quantity: '120', unitPrice: '7.25', itemCategory: 'Edible' },
        { productName: 'PICC Infused Preroll', quantity: '50', unitPrice: '8.50', itemCategory: 'Preroll' },
      ],
    },
  ];

  for (const order of nabisOrders) {
    const created = await prisma.nabisOrder.create({
      data: {
        orgId: org.id,
        accountId: order.account.id,
        externalOrderId: order.externalOrderId,
        orderNumber: order.orderNumber,
        licensedLocationId: order.licensedLocationId,
        licensedLocationName: order.licensedLocationName,
        orderCreatedDate: order.orderCreatedDate,
        status: order.status,
        orderTotal: order.orderTotal,
        paymentStatus: 'PAID',
        deliveryDate: order.orderCreatedDate,
        salesRep: order.salesRep,
      },
    });

    await prisma.nabisOrderLine.createMany({
      data: order.lines.map((line) => ({
        orgId: org.id,
        nabisOrderId: created.id,
        externalOrderId: order.externalOrderId,
        productName: line.productName,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        itemCategory: line.itemCategory,
      })),
    });
  }

  await prisma.syncCheckpoint.create({
    data: {
      orgId: org.id,
      integrationId: sheetsConnection.id,
      module: 'orders',
      status: 'SUCCESS',
      cursor: 'seed-cursor',
      checksum: 'seed-checksum',
      metadata: { rows: 863 },
    },
  });

  const syncMetadata = { lastSuccessfulSyncAt: new Date().toISOString(), source: 'local-seed' };

  await prisma.syncCheckpoint.createMany({
    data: [
      {
        orgId: org.id,
        integrationId: nabisConnection.id,
        module: 'orders',
        status: 'SUCCESS',
        cursor: 'seed-orders-cursor',
        checksum: 'seed-orders-checksum',
        metadata: syncMetadata,
      },
      {
        orgId: org.id,
        integrationId: nabisConnection.id,
        module: 'retailers',
        status: 'SUCCESS',
        cursor: 'seed-retailers-cursor',
        checksum: 'seed-retailers-checksum',
        metadata: syncMetadata,
      },
      {
        orgId: org.id,
        integrationId: nabisConnection.id,
        module: 'orders_reconcile',
        status: 'SUCCESS',
        cursor: 'seed-reconcile-cursor',
        checksum: 'seed-reconcile-checksum',
        metadata: syncMetadata,
      },
    ],
  });

  console.log('Seed complete');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
