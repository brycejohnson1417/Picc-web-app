import { Badge, Button, Card, CardContent } from '@/components/ui';

type Props = {
  title: string;
  subtitle: string;
  status: 'ACTIVE' | 'INACTIVE';
  onQuickLogHref?: string;
};

export function AccountHero({ title, subtitle, status, onQuickLogHref = '#' }: Props) {
  return (
    <Card className="mb-6">
      <CardContent className="flex flex-col gap-4 p-6 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="mb-2 flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
            <Badge variant={status === 'ACTIVE' ? 'success' : 'secondary'}>{status}</Badge>
          </div>
          <p className="text-sm text-slate-500">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <a href={onQuickLogHref}>Quick Log</a>
          </Button>
          <Button variant="secondary">New Task</Button>
          <Button variant="outline">Schedule Appointment</Button>
          <Button variant="outline">More</Button>
        </div>
      </CardContent>
    </Card>
  );
}
