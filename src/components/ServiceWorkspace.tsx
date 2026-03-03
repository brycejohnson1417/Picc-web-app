import React, { useEffect, useMemo, useState } from 'react';
import { AlertCircle, ExternalLink, Loader2 } from 'lucide-react';
import type { UserRole, WorkOrder } from '../types';
import { loadServiceCenterData } from '../services/moduleDataService';

interface ServiceWorkspaceProps {
  currentUserRole: UserRole;
}

export const ServiceWorkspace: React.FC<ServiceWorkspaceProps> = ({ currentUserRole }) => {
  const [rows, setRows] = useState<WorkOrder[]>([]);
  const [warning, setWarning] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [lastRefreshed, setLastRefreshed] = useState(new Date().toISOString());
  const [search, setSearch] = useState('');
  const [laneFilter, setLaneFilter] = useState<'all' | 'followUps' | 'workOrders' | 'awaitingSignOff' | 'myQueue'>('all');
  const [statusFilter, setStatusFilter] = useState('all');

  const refresh = async (): Promise<void> => {
    setLoading(true);
    const data = await loadServiceCenterData();
    setRows(data.rows);
    setWarning(data.warning);
    setLastRefreshed(data.lastRefreshed);
    setLoading(false);
  };

  useEffect(() => {
    void refresh();
  }, []);

  const now = useMemo(() => new Date(), [lastRefreshed]); // eslint-disable-line react-hooks/exhaustive-deps

  const toTimestamp = (raw?: string): number | null => {
    if (!raw) return null;
    const parsed = new Date(raw).getTime();
    return Number.isNaN(parsed) ? null : parsed;
  };

  const isClosed = (status: WorkOrder['status']): boolean => status === 'Completed' || status === 'Archived';

  const isFollowUp = (row: WorkOrder): boolean => {
    if (row.followUpReason) return true;
    const text = `${row.title} ${row.description} ${row.status}`.toLowerCase();
    return text.includes('follow up') || text.includes('follow-up');
  };

  const isAwaitingSignOff = (row: WorkOrder): boolean => Boolean(row.requiresSignOff) && !row.signedOff;

  const isMine = (row: WorkOrder): boolean => {
    if (row.assignee === currentUserRole) return true;
    if (!row.assigneeName) return false;
    return row.assigneeName.toLowerCase().includes(currentUserRole.toLowerCase());
  };

  const priorityWeight: Record<WorkOrder['priority'], number> = {
    High: 3,
    Medium: 2,
    Low: 1,
  };

  const urgencyScore = (row: WorkOrder): number => {
    let score = priorityWeight[row.priority];
    if (!isClosed(row.status)) score += 1;
    if (isFollowUp(row)) score += 2;
    if (isAwaitingSignOff(row)) score += 4;

    const dueTs = toTimestamp(row.dueDate);
    if (dueTs !== null) {
      const dayDelta = Math.floor((dueTs - now.getTime()) / (1000 * 60 * 60 * 24));
      if (dayDelta < 0) score += 6;
      else if (dayDelta === 0) score += 4;
      else if (dayDelta <= 2) score += 2;
    }

    return score;
  };

  const dueLabel = (row: WorkOrder): { label: string; tone: string } => {
    const dueTs = toTimestamp(row.dueDate);
    if (dueTs === null) return { label: 'No due date', tone: 'bg-slate-100 text-slate-700 border-slate-200' };

    const dayDelta = Math.floor((dueTs - now.getTime()) / (1000 * 60 * 60 * 24));
    if (dayDelta < 0) return { label: `Overdue ${Math.abs(dayDelta)}d`, tone: 'bg-rose-50 text-rose-700 border-rose-200' };
    if (dayDelta === 0) return { label: 'Due today', tone: 'bg-amber-50 text-amber-700 border-amber-200' };
    if (dayDelta <= 2) return { label: `Due in ${dayDelta}d`, tone: 'bg-blue-50 text-blue-700 border-blue-200' };
    return { label: `Due ${new Date(dueTs).toLocaleDateString()}`, tone: 'bg-slate-100 text-slate-700 border-slate-200' };
  };

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    const openRows = rows.filter((row) => !isClosed(row.status));

    const laneFiltered = openRows.filter((row) => {
      if (laneFilter === 'followUps') return isFollowUp(row);
      if (laneFilter === 'workOrders') return !isFollowUp(row);
      if (laneFilter === 'awaitingSignOff') return isAwaitingSignOff(row);
      if (laneFilter === 'myQueue') return isMine(row);
      return true;
    });

    return laneFiltered
      .filter((row) => {
        const matchesQuery =
          !q ||
          row.title.toLowerCase().includes(q) ||
          row.requesterName.toLowerCase().includes(q) ||
          row.ticketNumber.toLowerCase().includes(q) ||
          (row.dispensaryName || '').toLowerCase().includes(q) ||
          (row.followUpReason || '').toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || row.status === statusFilter;
        return matchesQuery && matchesStatus;
      })
      .sort((a, b) => {
        const urgencyDiff = urgencyScore(b) - urgencyScore(a);
        if (urgencyDiff !== 0) return urgencyDiff;
        const dueA = toTimestamp(a.dueDate) ?? Number.MAX_SAFE_INTEGER;
        const dueB = toTimestamp(b.dueDate) ?? Number.MAX_SAFE_INTEGER;
        if (dueA !== dueB) return dueA - dueB;
        return (toTimestamp(b.dateCreated) ?? 0) - (toTimestamp(a.dateCreated) ?? 0);
      });
  }, [rows, search, statusFilter, laneFilter, now]); // eslint-disable-line react-hooks/exhaustive-deps

  const statuses = useMemo(() => Array.from(new Set(rows.filter((row) => !isClosed(row.status)).map((row) => row.status))), [rows]);

  const openRows = useMemo(() => rows.filter((row) => !isClosed(row.status)), [rows]);
  const followUpsDue = useMemo(
    () =>
      openRows.filter((row) => {
        if (!isFollowUp(row)) return false;
        const dueTs = toTimestamp(row.dueDate);
        if (dueTs === null) return false;
        return dueTs <= now.getTime();
      }).length,
    [openRows, now],
  );
  const awaitingSignOffCount = useMemo(() => openRows.filter((row) => isAwaitingSignOff(row)).length, [openRows]);
  const myQueueCount = useMemo(() => openRows.filter((row) => isMine(row)).length, [openRows, currentUserRole]); // eslint-disable-line react-hooks/exhaustive-deps

  const laneCounts = useMemo(
    () => ({
      all: openRows.length,
      followUps: openRows.filter((row) => isFollowUp(row)).length,
      workOrders: openRows.filter((row) => !isFollowUp(row)).length,
      awaitingSignOff: openRows.filter((row) => isAwaitingSignOff(row)).length,
      myQueue: openRows.filter((row) => isMine(row)).length,
    }),
    [openRows, currentUserRole], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const lanes: Array<{ key: typeof laneFilter; label: string; count: number }> = [
    { key: 'all', label: 'All Active', count: laneCounts.all },
    { key: 'followUps', label: 'Follow-Ups', count: laneCounts.followUps },
    { key: 'workOrders', label: 'Work Orders', count: laneCounts.workOrders },
    { key: 'awaitingSignOff', label: 'Awaiting Sign-Off', count: laneCounts.awaitingSignOff },
    { key: 'myQueue', label: 'My Queue', count: laneCounts.myQueue },
  ];

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Service Center</h2>
          <p className="text-sm text-slate-500">Operational command surface for work orders, follow-ups, and closure for {currentUserRole}.</p>
        </div>
        <div className="text-right text-xs text-slate-500">
          <div>Last refreshed: {new Date(lastRefreshed).toLocaleString()}</div>
          <button onClick={refresh} className="text-indigo-600 hover:text-indigo-800 text-sm mt-1">Refresh</button>
        </div>
      </div>

      {warning && !loading && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <AlertCircle size={16} /> {warning}
        </div>
      )}

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs uppercase tracking-wide text-slate-500">Open Work Orders</div>
          <div className="text-2xl font-semibold text-slate-900 mt-1">{openRows.length}</div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
          <div className="text-xs uppercase tracking-wide text-amber-700">Follow-Ups Due</div>
          <div className="text-2xl font-semibold text-amber-900 mt-1">{followUpsDue}</div>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-4">
          <div className="text-xs uppercase tracking-wide text-rose-700">Awaiting Sign-Off</div>
          <div className="text-2xl font-semibold text-rose-900 mt-1">{awaitingSignOffCount}</div>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
          <div className="text-xs uppercase tracking-wide text-indigo-700">My Queue</div>
          <div className="text-2xl font-semibold text-indigo-900 mt-1">{myQueueCount}</div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col md:flex-row gap-3 md:items-center md:justify-between">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search ticket, dispensary, requester, follow-up reason..."
          className="w-full md:w-80 border border-slate-300 rounded-lg px-3 py-2"
        />
        <div className="flex flex-wrap gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
            <option value="all">All workflow states</option>
            {statuses.map((status) => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {lanes.map((lane) => (
          <button
            key={lane.key}
            onClick={() => setLaneFilter(lane.key)}
            className={`px-3 py-1.5 rounded-full text-xs border ${
              laneFilter === lane.key ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
          >
            {lane.label} ({lane.count})
          </button>
        ))}
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-6 text-slate-500 text-sm flex items-center gap-2"><Loader2 className="animate-spin" size={16} /> Loading operational work queue...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-slate-500">No active items match current filters. Confirm Work Orders mapping in Settings if this looks wrong.</div>
        ) : (
          <div className="p-4 space-y-3">
            {filtered.map((row) => {
              const due = dueLabel(row);
              const signOffText = row.requiresSignOff
                ? row.signedOff
                  ? `Signed off${row.signOffBy ? ` by ${row.signOffBy}` : ''}`
                  : 'Awaiting sign-off'
                : 'No sign-off required';

              return (
                <div key={row.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-slate-500 font-mono">{row.ticketNumber}</div>
                      <h3 className="text-base font-semibold text-slate-900">{row.title}</h3>
                      <div className="text-xs text-slate-500 mt-0.5">{row.type} • {row.status}</div>
                    </div>
                    <div className={`text-xs border rounded-full px-2 py-1 ${due.tone}`}>{due.label}</div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm mt-3">
                    <div><span className="text-slate-500">Dispensary:</span> <span className="text-slate-800">{row.dispensaryName || row.dispensaryId || '—'}</span></div>
                    <div><span className="text-slate-500">Requester:</span> <span className="text-slate-800">{row.requesterName || 'Unknown'}</span></div>
                    <div><span className="text-slate-500">Due date:</span> <span className="text-slate-800">{row.dueDate ? new Date(row.dueDate).toLocaleDateString() : '—'}</span></div>
                    <div><span className="text-slate-500">Created:</span> <span className="text-slate-800">{row.dateCreated ? new Date(row.dateCreated).toLocaleDateString() : '—'}</span></div>
                    <div className="md:col-span-2"><span className="text-slate-500">Follow-up reason:</span> <span className="text-slate-800">{row.followUpReason || 'Not specified'}</span></div>
                    <div className="md:col-span-2"><span className="text-slate-500">Sign-off:</span> <span className="text-slate-800">{signOffText}</span></div>
                  </div>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className={`text-xs rounded-full px-2 py-1 border ${row.priority === 'High' ? 'bg-rose-50 text-rose-700 border-rose-200' : row.priority === 'Low' ? 'bg-slate-50 text-slate-700 border-slate-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                      {row.priority} Priority
                    </span>
                    <span className="text-xs rounded-full px-2 py-1 border bg-slate-50 text-slate-700 border-slate-200">
                      {row.assigneeName || row.assignee || 'Unassigned'}
                    </span>
                    {row.notionUrl && (
                      <a
                        href={row.notionUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto inline-flex items-center gap-1 text-xs px-2 py-1 border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50"
                      >
                        Open in Notion <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
