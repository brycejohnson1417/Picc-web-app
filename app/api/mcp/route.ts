// Rep Copilot MCP server (docs/PRD-REP-COPILOT-MCP.md, issue #224).
//
// POST /api/mcp — MCP over Streamable HTTP with plain JSON responses
// (stateless; no session handshake required beyond initialize). This route
// is a thin transport: auth, JSON-RPC framing, and dispatch into
// lib/server/rep-copilot. All business logic lives in the server modules.
//
// Auth: per-agent bearer tokens from the MCP_AGENT_TOKENS env var
// (comma-separated, rotatable). The endpoint fails closed: with no tokens
// configured, every request is rejected. This is an approval-lane surface
// under AGENTS.md; do not merge without the approval recorded on the PR.

import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { createDistruBoundary } from '@/lib/server/rep-copilot/distru';
import { createRepCopilotService } from '@/lib/server/rep-copilot/service';
import { createProductionProviders } from '@/lib/server/rep-copilot/sources';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const SUPPORTED_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26'];
const DEFAULT_PROTOCOL_VERSION = '2025-03-26';

function configuredTokens(): string[] {
  return (process.env.MCP_AGENT_TOKENS ?? '')
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean);
}

function isAuthorized(request: Request): boolean {
  const tokens = configuredTokens();
  if (tokens.length === 0) return false;
  const header = request.headers.get('authorization') ?? '';
  const presented = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!presented) return false;
  const presentedBuffer = Buffer.from(presented);
  return tokens.some((token) => {
    const tokenBuffer = Buffer.from(token);
    return tokenBuffer.length === presentedBuffer.length && timingSafeEqual(tokenBuffer, presentedBuffer);
  });
}

const TOOLS = [
  {
    name: 'store_report',
    title: 'Store Report',
    description:
      'The fixed-format store report for one dispensary: credit and payment status, open invoices when payment is required, PPP and Headset status, last order and sample, the product lines the store does NOT carry, displays present and missing, and a rules-based action plan. Every field carries its source.',
    inputSchema: {
      type: 'object',
      properties: { store_query: { type: 'string', description: 'Store name or partial name' } },
      required: ['store_query'],
    },
  },
  {
    name: 'attack_list',
    title: 'Attack List',
    description:
      'Ranked list of stores to go after in an area: dormant previous buyers first, good credit up, COD down, recent samples and engagement up. Difficult accounts (Do Not Target) are excluded unless include_difficult is true.',
    inputSchema: {
      type: 'object',
      properties: {
        area: { type: 'string', description: 'Neighborhood, borough, or city' },
        limit: { type: 'number', default: 10 },
        offset: { type: 'number', default: 0 },
        filters: {
          type: 'object',
          properties: {
            sampled_within_days: { type: 'number' },
            sampled_sort: { type: 'string', enum: ['earliest_first', 'latest_first'] },
            sampled_not_closed: { type: 'boolean' },
            not_carrying_pcc: { type: 'boolean' },
            include_difficult: { type: 'boolean', default: false },
          },
        },
      },
      required: ['area'],
    },
  },
  {
    name: 'route_top10',
    title: 'Route Me',
    description:
      'The attack-list top stores for an area, ordered into a driving route from the given origin, with a Google Maps directions URL for every leg.',
    inputSchema: {
      type: 'object',
      properties: {
        origin: { type: 'string', description: 'Starting address or "lat,lng"' },
        area: { type: 'string' },
        limit: { type: 'number', default: 10 },
      },
      required: ['origin'],
    },
  },
  {
    name: 'order_history',
    title: 'Order History (deep dive)',
    description:
      'Monthly order totals and counts for one store plus its RFM segment. Deep-dive tool: call only when the rep explicitly asks for history or trajectory.',
    inputSchema: {
      type: 'object',
      properties: {
        store_query: { type: 'string' },
        months: { type: 'number', default: 12 },
      },
      required: ['store_query'],
    },
  },
  {
    name: 'create_checkin',
    title: 'Create Check-In (disabled in v1)',
    description:
      'Phase 2 stub. Writes are disabled in v1 behind MCP_ENABLE_WRITES; calls return a disabled error and never write.',
    inputSchema: {
      type: 'object',
      properties: {
        store_query: { type: 'string' },
        note: { type: 'string' },
        sample_requests: { type: 'array', items: { type: 'string' } },
        follow_up_date: { type: 'string' },
      },
      required: ['store_query', 'note'],
    },
  },
] as const;

type ToolName = (typeof TOOLS)[number]['name'];

let serviceSingleton: ReturnType<typeof createRepCopilotService> | null = null;
function getService() {
  if (!serviceSingleton) {
    serviceSingleton = createRepCopilotService(
      createProductionProviders({ distru: createDistruBoundary(), now: () => new Date() }),
    );
  }
  return serviceSingleton;
}

interface JsonRpcRequest {
  jsonrpc?: string;
  id?: string | number | null;
  method?: string;
  params?: Record<string, unknown>;
}

function rpcResult(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: '2.0', id, result }, { headers: { 'Cache-Control': 'no-store' } });
}

function rpcError(id: string | number | null, code: number, message: string, status = 200) {
  return NextResponse.json(
    { jsonrpc: '2.0', id, error: { code, message } },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}

function toolContent(payload: unknown, isError = false) {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
    structuredContent: payload as Record<string, unknown>,
    isError,
  };
}

async function callTool(name: ToolName, args: Record<string, unknown>) {
  const service = getService();
  switch (name) {
    case 'store_report': {
      const result = await service.storeReport({ store_query: String(args.store_query ?? '') });
      return toolContent(result, !result.found);
    }
    case 'attack_list': {
      const result = await service.attackList({
        area: String(args.area ?? ''),
        limit: typeof args.limit === 'number' ? args.limit : undefined,
        offset: typeof args.offset === 'number' ? args.offset : undefined,
        filters: (args.filters as Record<string, unknown> | undefined) ?? {},
      });
      return toolContent(result);
    }
    case 'route_top10': {
      const result = await service.routeTop10({
        origin: String(args.origin ?? ''),
        area: typeof args.area === 'string' ? args.area : undefined,
        limit: typeof args.limit === 'number' ? args.limit : undefined,
      });
      return toolContent(result);
    }
    case 'order_history': {
      const result = await service.orderHistory({
        store_query: String(args.store_query ?? ''),
        months: typeof args.months === 'number' ? args.months : undefined,
      });
      return toolContent(result, !result.found);
    }
    case 'create_checkin': {
      const result = await service.createCheckin({
        store_query: String(args.store_query ?? ''),
        note: String(args.note ?? ''),
      });
      return toolContent(result, true);
    }
  }
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { jsonrpc: '2.0', id: null, error: { code: -32001, message: 'Unauthorized: a valid MCP agent bearer token is required' } },
      { status: 401, headers: { 'WWW-Authenticate': 'Bearer', 'Cache-Control': 'no-store' } },
    );
  }

  let body: JsonRpcRequest;
  try {
    body = (await request.json()) as JsonRpcRequest;
  } catch {
    return rpcError(null, -32700, 'Parse error: request body must be a JSON-RPC object', 400);
  }

  const id = body.id ?? null;
  const method = body.method ?? '';

  // Notifications (no id) get an empty 202 per the Streamable HTTP transport.
  if (body.id === undefined || body.id === null) {
    return new NextResponse(null, { status: 202 });
  }

  try {
    switch (method) {
      case 'initialize': {
        const requested = typeof body.params?.protocolVersion === 'string' ? body.params.protocolVersion : '';
        const protocolVersion = SUPPORTED_PROTOCOL_VERSIONS.includes(requested) ? requested : DEFAULT_PROTOCOL_VERSION;
        return rpcResult(id, {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: { name: 'picc-rep-copilot', version: '1.0.0' },
        });
      }
      case 'ping':
        return rpcResult(id, {});
      case 'tools/list':
        return rpcResult(id, { tools: TOOLS });
      case 'tools/call': {
        const name = String(body.params?.name ?? '') as ToolName;
        if (!TOOLS.some((tool) => tool.name === name)) {
          return rpcError(id, -32602, `Unknown tool: ${name}`);
        }
        const args = (body.params?.arguments as Record<string, unknown> | undefined) ?? {};
        return rpcResult(id, await callTool(name, args));
      }
      default:
        return rpcError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    console.error('[rep-copilot] MCP tool call failed', error);
    return rpcError(id, -32603, 'Internal error while running the tool');
  }
}

export async function GET() {
  // This server is stateless and does not offer a server-initiated SSE
  // stream; per the Streamable HTTP spec the endpoint answers 405.
  return NextResponse.json(
    { jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Method Not Allowed: this MCP server is stateless; POST JSON-RPC requests' } },
    { status: 405, headers: { Allow: 'POST', 'Cache-Control': 'no-store' } },
  );
}
