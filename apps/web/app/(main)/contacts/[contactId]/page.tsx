import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { loadLiveNotionContacts } from '@/lib/server/notion-live-crm';

function normalizeId(value: string) {
  return value.replace(/-/g, '').trim().toLowerCase();
}

export default async function ContactDetailPage({ params }: { params: Promise<{ contactId: string }> }) {
  const { contactId } = await params;
  const rows = await loadLiveNotionContacts();
  const normalizedTargetId = normalizeId(contactId);
  const contact = rows.find((row) => normalizeId(row.id) === normalizedTargetId);

  if (!contact) {
    notFound();
  }

  const notionUrl = `https://www.notion.so/${contact.id.replace(/-/g, '')}`;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <Link href="/contacts" className="text-sm text-slate-500 hover:text-slate-700">
          ← Back to Contacts
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-3xl font-bold">{contact.name}</h1>
          <Badge variant={contact.status === 'ACTIVE' ? 'success' : 'secondary'}>{contact.status}</Badge>
        </div>
        <p className="text-sm text-slate-500">{contact.roleTitle || 'No role title'}</p>
      </header>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Contact Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <span className="font-semibold text-slate-700">Dispensary:</span> {contact.accountName}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Email:</span> {contact.email}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Phone:</span> {contact.phone}
            </p>
            <p>
              <span className="font-semibold text-slate-700">Linked Work:</span> {contact.linkedWork}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Actions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Button asChild>
              <a href={notionUrl} target="_blank" rel="noreferrer">
                Open In Notion
              </a>
            </Button>
            {contact.email !== '—' ? (
              <Button asChild variant="secondary">
                <a href={`mailto:${contact.email}`}>Email Contact</a>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
