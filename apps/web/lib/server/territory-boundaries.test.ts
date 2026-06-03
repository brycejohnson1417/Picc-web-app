import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $executeRaw: vi.fn(),
    territory: {
      create: vi.fn(),
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/db/prisma';
import { createTerritoryBoundary, updateTerritoryBoundary } from '@/lib/server/territory-boundaries';

const mockedExecuteRaw = vi.mocked(prisma.$executeRaw);
const mockedFindFirst = vi.mocked(prisma.territory.findFirst as unknown as ReturnType<typeof vi.fn>);
const mockedUpdateMany = vi.mocked(prisma.territory.updateMany as unknown as ReturnType<typeof vi.fn>);

const savedBoundaryRow = {
  id: 'boundary_1',
  name: 'Brooklyn',
  description: null,
  color: '#16a34a',
  borderWidth: 3,
  isVisibleByDefault: true,
  geojson: {
    type: 'Polygon',
    coordinates: [
      [
        [-73.99, 40.7],
        [-73.94, 40.7],
        [-73.94, 40.73],
        [-73.99, 40.7],
      ],
    ],
  },
  createdByEmail: 'admin@piccplatform.com',
  updatedByEmail: 'admin@piccplatform.com',
  createdAt: new Date('2026-05-31T12:00:00.000Z'),
  updatedAt: new Date('2026-05-31T12:00:00.000Z'),
};

function sqlText(value: unknown) {
  const sql = value as { strings?: string[] };
  return Array.isArray(sql.strings) ? sql.strings.join(' ') : String(value);
}

describe('territory boundaries persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedExecuteRaw.mockResolvedValue(1);
    mockedFindFirst.mockResolvedValue(savedBoundaryRow);
    mockedUpdateMany.mockResolvedValue({ count: 1 });
  });

  it('creates boundaries without writing the removed geometry column', async () => {
    const boundary = await createTerritoryBoundary({
      orgId: 'org_picc',
      name: 'Brooklyn',
      color: '#16A34A',
      borderWidth: 3,
      actorEmail: 'ADMIN@PICCPLATFORM.COM',
      coordinates: [
        [-73.99, 40.7],
        [-73.94, 40.7],
        [-73.94, 40.73],
      ],
    });

    expect(boundary).toMatchObject({
      id: 'boundary_1',
      name: 'Brooklyn',
      color: '#16a34a',
      coordinates: [
        [-73.99, 40.7],
        [-73.94, 40.7],
        [-73.94, 40.73],
      ],
    });
    expect(mockedExecuteRaw).toHaveBeenCalledTimes(1);
    expect(sqlText(mockedExecuteRaw.mock.calls[0]?.[0])).not.toContain('"geometry"');
  });

  it('updates boundary coordinates without writing the removed geometry column', async () => {
    await updateTerritoryBoundary({
      orgId: 'org_picc',
      boundaryId: 'boundary_1',
      actorEmail: 'admin@piccplatform.com',
      coordinates: [
        [-73.99, 40.7],
        [-73.94, 40.7],
        [-73.94, 40.73],
      ],
    });

    expect(mockedExecuteRaw).toHaveBeenCalledTimes(1);
    expect(sqlText(mockedExecuteRaw.mock.calls[0]?.[0])).not.toContain('"geometry"');
  });
});
