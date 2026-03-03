import { CalendarMobile } from '@/components/mobile/calendar-mobile';
import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { prisma } from '@/lib/db/prisma';

export default async function CalendarPage() {
  const { orgId } = await requireWorkspaceContext();

  const appointments = await prisma.appointment.findMany({
    where: { orgId },
    include: { account: true, contact: true },
    orderBy: { startsAt: 'asc' },
    take: 120,
  });

  return (
    <>
      <div className="md:hidden">
        <CalendarMobile />
      </div>

      <div className="hidden space-y-6 md:block">
        <header>
          <h1 className="text-3xl font-bold">Calendar</h1>
          <p className="text-sm text-slate-500">Month/week/day planning with account-linked appointments and reminders.</p>
        </header>

        <Card>
          <CardHeader>
            <CardTitle>Upcoming Appointments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {appointments.map((appt) => (
              <div key={appt.id} className="rounded-lg border p-3">
                <p className="font-semibold">{appt.title}</p>
                <p className="text-sm text-slate-500">
                  {new Date(appt.startsAt).toLocaleString()} - {new Date(appt.endsAt).toLocaleTimeString()} · {appt.account.name}
                </p>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
