# First-Order Samples & Displays (Distru Skill)

Add the standard first-order sample package to a new customer's first PICC order in Distru. Built for the PICC sales team: a rep runs it on a store's first order, reviews the plan, and confirms before anything is written.

Runs on the Distru MCP (`distru-*` tools). The canonical copy of this skill lives in the Picc-web-app repo under `skills/` (see `skills/README.md` there); piccnewyork.org implements it, and the Rep Copilot Space mirrors it exactly.

## When this applies

- The store is a **first-time customer**: the order being worked is part of their first purchase with PICC. If the store has any order from an earlier purchase, stop and report that it is not a first order. Do not add samples.
- A first purchase can be **split into two orders**, one COD and one Net 30 (two invoices for the same purchase). Split orders from the same first purchase count as one first order, not two purchases.
- **Default target: the Net 30 order** when the first purchase is split. Samples go on the Net 30 order unless the rep picks the COD order instead. When there is only one order, that is the target.
- The skill suggests the target order and the rep confirms it is the right one before any write. Tell COD from Net 30 by the order's `dueDate` (also visible on the linked invoices via `includeInvoices`): a Net 30 order's due date falls ~30 days after the order date; a COD order is due on delivery. If neither split order shows a later due date, do not guess: present both and let the rep name the target.

## What gets added

Every added line is a sample line in Distru: `isSample: true`, `priceBase: 0.01`, fixed quantities as below. Never full price, never $0: samples are priced at $0.01 in Distru as a standing requirement (confirmed by Laura, 2026-11-25).

### 1. Brand pre-roll samples — up to 5 units per carried brand

For each of these brands **present on the order**, add 1G pre-roll samples of the actual strains/SKUs the store ordered:

- Ichi Roll
- Juan Roll (#Juan Roll)
- Sushi Hash
- State of Mind
- O-Yeah
- Smack
- Chopsticks

Rules:
- Per brand, the sample total is **up to 5 units**, drawn from the brand's 1G single SKUs that appear on the order. One ordered SKU: 5 units of that SKU. Several ordered SKUs: split across them (e.g. 3 + 2), never more than 5 per brand in total.
- **Chopsticks exception:** the Chopsticks unit is two 0.5g joints, which is their 1G equivalent. It counts as the brand's 1G SKU for samples, same as every other brand's 1G single.
- **No multipacks, ever.** Sample only from single-unit SKUs. A brand's 4-pack, 5-pack, or any other multi-unit pack is never added as a sample, even when it is the SKU the store ordered; sample from the brand's 1G singles on the order instead, and if the store ordered only multipacks of a brand, skip that brand's pre-roll samples and say so in the plan.
- Base samples only on SKUs actually ordered. Never substitute a strain the store did not buy.
- Cap by live stock: if `quantityAvailable` for a SKU is below the planned quantity, add only what is in stock and name the shortfall in the plan.
- **Champs is excluded entirely.** No Champs samples, ever, even if Champs is on the order.

### 2. Nom Nom gummies — 2 units total

- **1 unit of Nom Nom Hash Rosin Infused Gummies.** Current flavors: Pomberry Lemonade (NNEC-PL-R), Peach Melba (NNEC-PM-R), Mango Passionfruit (NNEC-MP-R). When more than one rosin flavor is in stock, default to the flavor with the largest `quantityAvailable`; the rep can pick another flavor at confirmation.
- **1 unit of a mood-based Nom Nom pack**, chosen as the SKU with the **largest number of in-stock units** (`quantityAvailable`) among the mood lines:
  - Energy | 2:1 THC:CBG | Citrus Blast (NNEC-CB)
  - Balance | 1:1 THC:CBD | Banana Berry Blast (NNEC-BBB)
  - Sleep | 2:1 THC:CBN | Black Cherry Bliss (NNEC-BCB)
- Nom Nom is added on every first order, whether or not the store ordered Nom Nom.
- Do **not** add the Nom Nom Uninfused Sample Packs SKU (NNEC-Sample 3-Packs). It is a different program and not part of this package.

### 3. Display units — per carried brand, when in stock

For each carried brand, check the brand's display SKUs in Distru and add the in-stock display units at `priceBase: 0.01` with `isSample: true`, 1 unit per display SKU.

- Prefer the brand's "Display" SKU over its "Tube Dummy/Display" SKU. Adding **both** is fine when both are in stock: the Display SKU is the priority, the Tube Dummy is the add-on.
- If a brand's displays are all out of stock (`quantityAvailable` 0), skip that brand's displays and name them in the report as not added.
- Skip a display the store already has: check the store's orders for an existing line with that display SKU before adding it again.
- **Champs displays are included** (unlike Champs samples): if the store ordered Champs and does not already have a Champs display, add the in-stock Champs display the same way.

## Workflow

1. **Find the store's orders.** `distru-search-sales-orders` with the store's customer id, sorted by order date.
2. **Verify first purchase.** Group the orders into purchases: orders from the same first purchase (including a COD / Net 30 split) are one purchase. If any order predates the purchase being worked, stop: not a first order. Report the order count and the earliest order date.
3. **Suggest the order.** Present the first purchase's order(s). Default to the **Net 30** order when the purchase is split COD / Net 30; say which one is the default and why. The rep confirms the target before any write. Never write before this confirmation.
4. **Read the order.** `distru-get-sales-order` with line items and invoices included, on the target order and on its split sibling if there is one. Identify which of the seven sample brands are on the order and which 1G SKUs/strains were ordered per brand. Also inventory what is already there: every existing sample line (`isSample: true`) and every display SKU on any of the store's orders. That inventory drives the duplicate check.
5. **Check stock.** `distru-search-products` for the sample SKUs, the Nom Nom SKUs, and the display SKUs. Use live `quantityAvailable`; never plan from a stale catalog copy.
6. **Present the plan.** One list: every line to be added (brand, SKU, strain, quantity, $0.01, sample), plus anything skipped and why (out of stock, brand not carried, already on the order). The rep confirms or edits.
7. **Write.** `distru-mutate-sales-order` on the confirmed order, adding one row per sample/display line with `priceBase: 0.01` and `isSample: true`.
   - Stock handling: a product-only row holds no stock and is filled by the company's auto-fulfill at PROCESSING. For a SKU whose `inventoryTrackingMethod` is PACKAGE (Nom Nom is package-tracked), attach an in-stock package at the order's location via `distru-search-packages`; for BATCH-tracked SKUs use `distru-search-batches` if the order requires a batch. A package row sells the whole package, so never pass a quantity on a package row.
   - Do not change, reprice, or remove any existing line on the order. Additions only.
8. **Put the samples on the invoice.** Samples belong on the invoice, not just the order. Adding lines to an order does not update an invoice that already exists, and Distru has no invoice-edit tool: invoice edits are UI-only, so through the MCP an invoice is rebuilt, not patched.
   - **No invoice on the order yet:** nothing to do. The invoice created later from the order bills every line on it, samples included.
   - **Invoice exists, unpaid, and not yet sent to the customer:** with the rep's confirmation, rebuild it: `distru-delete-invoice` on the existing invoice, then `distru-create-invoice` on the order. The new invoice bills every line on the order (samples included) with the order's charges, dates, and terms, and queues a fresh QuickBooks/POS sync. The invoice number changes; the old number is gone.
   - **Invoice exists with payments on it, or already sent to the customer:** do not rebuild. Deleting would delete its payments and renumber a document the customer already has. Report that a person must overwrite the invoice from the order in the Distru UI, which keeps the invoice number.
9. **Verify and report.** Re-read the order with `distru-get-sales-order` and confirm every planned line is present with quantity, $0.01 price, and the sample flag set. If the invoice was rebuilt, read it back with `distru-get-invoice` and confirm the sample lines are on it. Report added lines, skipped items, and the invoice outcome to the rep from those re-reads, not from the write responses.

## Guardrails

- Additions only. This skill never edits or deletes existing order lines, never changes order status, and never creates a new order.
- **No duplicates, ever.** Before writing, compare every planned line against the live contents of the target order and its split sibling. A product already present as a sample line is skipped, and a display SKU already on any of the store's orders is skipped; skipped duplicates are named in the plan and the report. If everything planned is already on the order, add nothing and report that the package is already there. Re-running the skill on the same order is safe: it only ever adds what is missing.
- Confirmation before write, always. The plan in step 6 is the approval surface for team use. Rebuilding an invoice (step 8) needs its own confirmation in the plan: deleting an invoice is permanent and deletes any payments on it.
- Champs: no product samples, ever. Champs displays are allowed under the display rules above.

## Canonical home

This file, in the Picc-web-app repo under `skills/`, is the single source of truth for this workflow. The app code implements what is written here; where code and this file disagree, this file is right and the code gets fixed. Changes are made here first, by pull request, and the Rep Copilot Space's copy is updated to match in the same piece of work. The skill carries no account names, order numbers, or stock snapshots: every run reads stock and order contents live, so the same file works for any rep on any day.
