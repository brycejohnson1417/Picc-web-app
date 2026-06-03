import { ActivityLog, Channel } from '@prisma/client';
import { format } from 'date-fns';
import { Mail, MessageSquare, Phone, Smartphone, StickyNote } from 'lucide-react';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

type TimelineItem = ActivityLog & {
  account?: { name: string } | null;
};

function channelIcon(channel: Channel | null) {
  switch (channel) {
    case 'EMAIL':
      return <Mail className="h-4 w-4 text-blue-500" />;
    case 'SMS':
      return <MessageSquare className="h-4 w-4 text-green-500" />;
    case 'PHONE_CALL':
      return <Phone className="h-4 w-4 text-purple-500" />;
    case 'WHATSAPP':
      return <Smartphone className="h-4 w-4 text-emerald-500" />;
    default:
      return <StickyNote className="h-4 w-4 text-slate-500" />;
  }
}

export function ActivityTimeline({ items }: { items: TimelineItem[] }) {
  const grouped = items.reduce<Record<string, TimelineItem[]>>((acc, item) => {
    const key = format(item.createdAt, 'yyyy-MM-dd');
    if (!acc[key]) acc[key] = [];
    acc[key].push(item);
    return acc;
  }, {});

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Activity Timeline</CardTitle>
        <Button variant="outline" size="sm">Filter by channel/date</Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {Object.entries(grouped).length === 0 && (
          <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">
            No activity yet. Use Quick Log to add your first timeline entry.
          </div>
        )}
        {Object.entries(grouped).map(([day, logs]) => (
          <div key={day}>
            <h4 className="mb-3 text-sm font-semibold text-slate-500">{format(new Date(day), 'EEEE, MMM d')}</h4>
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 rounded-xl border p-3 hover:bg-slate-50 dark:hover:bg-slate-900">
                  <div className="mt-1 flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                    {channelIcon(log.channel)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{log.title}</p>
                      <Badge variant="secondary">{log.type}</Badge>
                    </div>
                    <p className="text-sm text-slate-500">{log.description || 'No additional details.'}</p>
                    <p className="mt-1 text-xs text-slate-400">{format(log.createdAt, 'p')}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
