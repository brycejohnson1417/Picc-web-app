import { PrismaClient, type Prisma } from '@prisma/client';

declare global {
  var prisma: PrismaClient | undefined;
}

const prismaLog: Prisma.PrismaClientOptions['log'] =
  process.env.PRISMA_QUERY_LOG === '1'
    ? ['query', 'warn', 'error']
    : process.env.NODE_ENV === 'production'
      ? ['error']
      : ['warn', 'error'];

export const prisma =
  global.prisma ||
  new PrismaClient({
    log: prismaLog,
  });

if (process.env.NODE_ENV !== 'production') {
  global.prisma = prisma;
}
