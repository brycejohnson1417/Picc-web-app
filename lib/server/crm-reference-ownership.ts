import { prisma } from '@/lib/db/prisma';

export const INVALID_CRM_REFERENCE = 'A linked record is unavailable or does not belong to this account.';

type References = {
  accountId: string;
  contactId?: string | null;
  opportunityId?: string | null;
  pipelineId?: string;
  stageId?: string;
};

function unavailable(): never { throw new Error(INVALID_CRM_REFERENCE); }

export async function requireCrmReferences(orgId: string, input: References) {
  const account = await prisma.account.findFirst({ where: { id: input.accountId, orgId }, select: { id: true } });
  if (!account) unavailable();

  if (input.contactId) {
    const contact = await prisma.contact.findFirst({ where: { id: input.contactId, orgId }, select: { accountId: true } });
    if (!contact || contact.accountId !== input.accountId) unavailable();
  }
  if (input.opportunityId) {
    const opportunity = await prisma.opportunity.findFirst({ where: { id: input.opportunityId, orgId }, select: { accountId: true, contactId: true } });
    if (!opportunity || opportunity.accountId !== input.accountId ||
      (input.contactId && opportunity.contactId && opportunity.contactId !== input.contactId)) unavailable();
  }
  if (input.pipelineId) {
    const pipeline = await prisma.pipeline.findFirst({ where: { id: input.pipelineId, orgId }, select: { id: true } });
    if (!pipeline) unavailable();
  }
  if (input.stageId) {
    const stage = await prisma.stage.findFirst({ where: { id: input.stageId, orgId }, select: { pipelineId: true } });
    if (!stage || stage.pipelineId !== input.pipelineId) unavailable();
  }
}

export async function requireNotionAccountOwnership(orgId: string, pageId: string) {
  const compact = pageId.replace(/-/g, '').toLowerCase();
  const dashed = compact.length === 32
    ? `${compact.slice(0, 8)}-${compact.slice(8, 12)}-${compact.slice(12, 16)}-${compact.slice(16, 20)}-${compact.slice(20)}`
    : pageId;
  const account = await prisma.territoryStoreReadModel.findFirst({
    where: { orgId, notionPageId: { in: [...new Set([pageId, compact, dashed])] } },
    select: { id: true },
  });
  if (!account) unavailable();
}
