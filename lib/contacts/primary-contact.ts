export type PrimaryContactValues = { name: string; email: string | null; phone: string | null; position: string | null };
export type PrimaryContactSnapshot = PrimaryContactValues & { revision: string };
export type PrimaryContactPreview = { before: PrimaryContactSnapshot; after: PrimaryContactValues };

export function samePrimaryContact(a: PrimaryContactSnapshot, b: PrimaryContactSnapshot) {
  return a.name === b.name && a.email === b.email && a.phone === b.phone && a.position === b.position && a.revision === b.revision;
}

export function readPrimaryContact(page: { last_edited_time?: string; properties?: Record<string, unknown> }): PrimaryContactSnapshot {
  const properties = page.properties ?? {};
  function property(name: string, type: string) {
    const value = properties[name] as Record<string, unknown> | undefined;
    if (!value || value.type !== type) throw new Error('Primary contact fields are not configured. Save as associated contact instead.');
    return value;
  }
  function text(value: unknown) {
    if (!Array.isArray(value)) throw new Error('Primary contact text is unavailable. Save as associated contact instead.');
    return value.map((part) => part.plain_text ?? part.text?.content ?? '').join('');
  }
  const position = properties['Contact Position'] as Record<string, unknown> | undefined;
  if (position && position.type !== 'rich_text') throw new Error('Primary contact position has an unsupported type. Save as associated contact instead.');
  if (!page.last_edited_time) throw new Error('Primary contact revision is unavailable. Save as associated contact instead.');
  return {
    name: text(property('Contact', 'rich_text').rich_text),
    email: property('Contact Email', 'email').email as string | null,
    phone: property('Contact Phone', 'phone_number').phone_number as string | null,
    position: position ? text(position.rich_text) : null,
    revision: page.last_edited_time,
  };
}

export function primaryContactPatch(values: PrimaryContactValues) {
  const richText = (value: string) => ({ rich_text: value ? [{ text: { content: value } }] : [] });
  return {
    Contact: richText(values.name),
    'Contact Email': { email: values.email },
    'Contact Phone': { phone_number: values.phone },
    ...(values.position !== null ? { 'Contact Position': richText(values.position) } : {}),
  };
}

export class PrimaryContactChangedError extends Error {
  constructor(readonly preview: PrimaryContactPreview) {
    super('Primary contact changed since preview. Review the updated values before replacing.');
  }
}
