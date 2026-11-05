import { z } from 'zod';

const productSchema = z.object({
  productId: z.string().min(1), name: z.string().min(1), brand: z.string().min(1), sku: z.string().nullable().optional(),
  unitsPerCase: z.number().int().positive(), unitPriceCents: z.number().int().nonnegative(),
  availableUnits: z.number().nonnegative().nullable().optional(),
  paymentTerms: z.string().optional().default(''), thcLabel: z.string().nullable().optional(), typeLabel: z.string().nullable().optional(),
  codOnly: z.boolean().optional(), requiresConfirmation: z.boolean().optional(), confirmationReason: z.string().nullable().optional(),
});
const lineSchema = productSchema.extend({
  cases: z.number().int().positive(), discountBps: z.number().int().min(0).max(10000), confirmed: z.boolean().optional(),
});
const proposalSchema = z.object({
  id: z.string(), accountId: z.string(), storeName: z.string(), address: z.string().nullable().optional(),
  orderNumber: z.string().nullable().optional(), revision: z.number().int().nonnegative(), updatedAt: z.string().nullable().optional(),
  terms: z.string().default(''), notes: z.string().default(''), lines: z.array(lineSchema),
});
const responseSchema = z.object({ proposal: proposalSchema, catalog: z.array(productSchema) });
export type ProposalLine = z.infer<typeof lineSchema>;
export type ProposalProduct = z.infer<typeof productSchema>;
export type DistruProposal = z.infer<typeof proposalSchema>;
export type ProposalResponse = z.infer<typeof responseSchema>;

export function parseProposalResponse(value: unknown): ProposalResponse {
  const result = responseSchema.safeParse(value);
  if (!result.success) throw new Error('Proposal data is incomplete. Reload and try again.');
  summarizeProposal(result.data.proposal.lines);
  return result.data;
}

export function decimalInputToInteger(value: string): number {
  if (!/^\d+(\.\d{0,2})?$/.test(value.trim())) return NaN;
  const [whole, fraction = ''] = value.trim().split('.');
  const number = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(number) ? number : NaN;
}

function safeNumber(value: bigint): number {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Proposal amount exceeds the supported range.');
  return Number(value);
}

export function proposalLineAmounts(line: ProposalLine) {
  const fields = [line.cases, line.unitsPerCase, line.unitPriceCents, line.discountBps];
  if (fields.some(value => !Number.isSafeInteger(value) || value < 0) || line.discountBps > 10000) throw new Error('Proposal amount exceeds the supported range.');
  const units = BigInt(line.cases) * BigInt(line.unitsPerCase);
  const regular = units * BigInt(line.unitPriceCents);
  const savings = (regular * BigInt(line.discountBps) + 5000n) / 10000n;
  return { units: safeNumber(units), regularCents: safeNumber(regular), savingsCents: safeNumber(savings), netCents: safeNumber(regular - savings) };
}

export function summarizeProposal(lines: ProposalLine[]) {
  let cases = 0n, units = 0n, regular = 0n, savings = 0n, net = 0n;
  for (const line of lines) {
    const value = proposalLineAmounts(line);
    cases += BigInt(line.cases); units += BigInt(value.units); regular += BigInt(value.regularCents);
    savings += BigInt(value.savingsCents); net += BigInt(value.netCents);
  }
  return { products: lines.length, cases: safeNumber(cases), units: safeNumber(units), regularCents: safeNumber(regular), savingsCents: safeNumber(savings), netCents: safeNumber(net) };
}

export function validateProposal(lines: ProposalLine[]): string[] {
  const errors: string[] = [], ids = new Set<string>();
  if (!lines.length) errors.push('Add at least one product.');
  for (const line of lines) {
    if (ids.has(line.productId)) errors.push(`Duplicate product: ${line.name}.`);
    ids.add(line.productId);
    if (!Number.isSafeInteger(line.cases) || line.cases < 1) errors.push(`Enter whole cases for ${line.name}.`);
    if (!Number.isSafeInteger(line.unitsPerCase) || line.unitsPerCase < 1) errors.push(`Case size is missing for ${line.name}.`);
    if (!Number.isSafeInteger(line.unitPriceCents) || line.unitPriceCents < 0) errors.push(`Enter a valid price for ${line.name}.`);
    if (!Number.isSafeInteger(line.discountBps) || line.discountBps < 0 || line.discountBps > 10000) errors.push(`Discount must be 0–100% for ${line.name}.`);
    if (!line.paymentTerms?.trim()) errors.push(`Choose payment terms for ${line.name}.`);
    if (line.codOnly && line.paymentTerms !== 'COD') errors.push(`${line.name} is COD only.`);
    if (line.requiresConfirmation && !line.confirmed) errors.push(`Confirm ${line.name} before saving.`);
  }
  if (!errors.length) {
    try { summarizeProposal(lines); } catch (error) { errors.push(error instanceof Error ? error.message : 'Invalid proposal totals.'); }
  }
  return errors;
}

export function proposalFingerprint(input: { lines: ProposalLine[]; terms: string; notes: string }): string {
  return JSON.stringify({
    terms: input.terms, notes: input.notes,
    lines: input.lines.map(line => ({
      productId: line.productId, cases: line.cases, unitsPerCase: line.unitsPerCase,
      unitPriceCents: line.unitPriceCents, discountBps: line.discountBps, paymentTerms: line.paymentTerms,
      confirmed: Boolean(line.confirmed),
    })).sort((left, right) => left.productId.localeCompare(right.productId)),
  });
}
