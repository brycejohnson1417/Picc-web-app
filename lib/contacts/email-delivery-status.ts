export type ContactEmailDeliveryFields = {
  emailPermission?: string | null;
  emailQuality?: string | null;
  marketingSuppressed?: boolean | null;
};

export function getContactEmailDeliveryStatus(contact: ContactEmailDeliveryFields) {
  const permission = contact.emailPermission?.trim() || '';
  const quality = contact.emailQuality?.trim() || '';
  const blocked = permission.toLowerCase() === 'do not contact' || [
    'permanent bounce', 'existing suppression', 'malformed or combined',
  ].includes(quality.toLowerCase());
  const labels = [permission, quality].filter(Boolean);
  if (contact.marketingSuppressed && !blocked) labels.push('Marketing suppressed');
  return { blocked, labels };
}
