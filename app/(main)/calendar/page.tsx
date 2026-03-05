import { requireWorkspaceContext } from '@/lib/auth/workspace';
import { prisma } from '@/lib/db/prisma';
import { CalendarClient } from '@/components/calendar/calendar-client';

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string }>;
}) {
  const { orgId } = await requireWorkspaceContext();
  const params = await searchParams;

  const [appointments, vendorDays, accounts] = await Promise.all([
    prisma.appointment.findMany({
      where: { orgId },
      include: {
        account: { select: { id: true, name: true } },
        contact: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: { startsAt: 'asc' },
      take: 500,
    }),
    prisma.vendorDayEvent.findMany({
      where: { orgId },
      include: { account: { select: { id: true, name: true } } },
      orderBy: { eventDate: 'asc' },
      take: 300,
    }),
    prisma.account.findMany({
      where: { orgId },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
      take: 400,
    }),
  ]);

  return (
    <CalendarClient
      initialAppointments={appointments.map((appointment) => ({
        ...appointment,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt.toISOString(),
      }))}
      initialVendorDays={vendorDays.map((event) => ({
        ...event,
        eventDate: event.eventDate.toISOString(),
      }))}
      accounts={accounts}
      autoOpenCreate={params.new === '1'}
    />
  );
}
