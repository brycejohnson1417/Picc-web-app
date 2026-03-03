import React, { useCallback, useEffect, useState } from 'react';
import {
  Check,
  FileSpreadsheet,
  RefreshCw,
  ShieldCheck,
  Play,
  XCircle
} from 'lucide-react';
import { NotionBot, NotionDatabase } from '../types';
import { validateNotionToken, searchDatabases } from '../services/notionService';
import {
  IntegrationMapping,
  IntegrationSource,
  SyncStatusResponse,
  integrationService
} from '../services/integrationService';

const toDateTime = (value: string | null): string => {
  if (!value) {
    return 'not synced';
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString();
};

export const Settings: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'notion' | 'sheets'>('notion');
  const [step, setStep] = useState<1 | 2>(1);

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

  const [isLoadingStatus, setIsLoadingStatus] = useState(false);
  const [notionSource, setNotionSource] = useState<IntegrationSource | null>(null);
  const [sheetSource, setSheetSource] = useState<IntegrationSource | null>(null);
  const [notionMappings, setNotionMappings] = useState<IntegrationMapping[]>([]);
  const [sheetMappings, setSheetMappings] = useState<IntegrationMapping[]>([]);

  const [notionBot, setNotionBot] = useState<NotionBot | null>(null);
  const [notionDatabases, setNotionDatabases] = useState<NotionDatabase[]>([]);
  const [notionDbId, setNotionDbId] = useState('');

  const [sheetId, setSheetId] = useState('');
  const [sheetRange, setSheetRange] = useState('A1:H1000');
  const [notionStatus, setNotionStatus] = useState<SyncStatusResponse | null>(null);
  const [sheetStatus, setSheetStatus] = useState<SyncStatusResponse | null>(null);

  const loadConfig = useCallback(async () => {
    setIsLoading(true);
    try {
      const config = await integrationService.getConfig(true);
      const notion = config.sources.find((entry) => entry.type === 'notion' && entry.isActive && entry.module === 'wiki') || null;
      const sheet = config.sources.find((entry) => entry.type === 'sheets' && entry.isActive && entry.module === 'ppp_onboarding') || null;

      setNotionSource(notion);
      setSheetSource(sheet);
      setNotionMappings(config.mappings.filter((item) => item.sourceId === notion?.id));
      setSheetMappings(config.mappings.filter((item) => item.sourceId === sheet?.id));
      setNotionDbId(notion?.targetId || '');
      setSheetId(sheet?.targetId || '');
      setSheetRange(typeof sheet?.settings?.range === 'string' ? sheet.settings.range : 'A1:H1000');

      const statusRequests: Promise<SyncStatusResponse | null>[] = [];
      if (notion?.id) {
        statusRequests.push(integrationService.getSyncStatus(notion.id));
      } else {
        statusRequests.push(Promise.resolve(null));
      }

      if (sheet?.id) {
        statusRequests.push(integrationService.getSyncStatus(sheet.id));
      } else {
        statusRequests.push(Promise.resolve(null));
      }

      const [notionSyncStatus, sheetSyncStatus] = await Promise.all(statusRequests);
      setNotionStatus(notionSyncStatus);
      setSheetStatus(sheetSyncStatus);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const refreshSyncStatus = useCallback(async () => {
    if (!notionSource?.id && !sheetSource?.id) {
      return;
    }
    setIsLoadingStatus(true);
    try {
      const statuses = await Promise.all([
        notionSource?.id ? integrationService.getSyncStatus(notionSource.id) : Promise.resolve(null),
        sheetSource?.id ? integrationService.getSyncStatus(sheetSource.id) : Promise.resolve(null)
      ]);
      setNotionStatus(statuses[0]);
      setSheetStatus(statuses[1]);
    } catch (error) {
      console.error('Unable to refresh integration status', error);
    } finally {
      setIsLoadingStatus(false);
    }
  }, [notionSource?.id, sheetSource?.id]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!isLoadingStatus) {
        void refreshSyncStatus();
      }
    }, 120000);
    return () => clearInterval(timer);
  }, [refreshSyncStatus, isLoadingStatus]);

  const renderSyncCard = (status: SyncStatusResponse | null, label: string) => {
    if (!status) {
      return (
        <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-slate-50 text-sm text-slate-500">
          {label}: no status yet
        </div>
      );
    }

    const lastRun = status.lastCheckpoint?.lastSyncedAt || null;
    const lastState = status.lastCheckpoint?.lastSyncStatus || 'idle';
    const latestMessage = status.activeJobs[0]?.message || 'No active job';
    const statusTone =
      lastState === 'success'
        ? 'bg-emerald-100 text-emerald-700'
        : lastState === 'error'
          ? 'bg-red-100 text-red-700'
          : lastState === 'running'
            ? 'bg-blue-100 text-blue-700'
            : 'bg-slate-100 text-slate-600';

    return (
      <div className="mt-4 p-4 border border-slate-200 rounded-lg bg-white text-sm">
        <div className="flex items-center justify-between">
          <div className="font-semibold text-slate-700">{label}</div>
          <span className={`px-2 py-1 rounded-full text-xs ${statusTone}`}>{lastState}</span>
        </div>
        <div className="mt-2 text-slate-500">Last run: {toDateTime(lastRun)}</div>
        <div className="text-slate-500 text-xs mt-1">Latest event: {latestMessage}</div>
      </div>
    );
  };

  const handleConnectNotion = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const bot = await validateNotionToken();
      if (!bot) {
        setError('Could not validate server-side Notion connection. Check NOTION_API_KEY in environment.');
        setIsLoading(false);
        return;
      }
      setNotionBot(bot);
      setNotionDatabases(await searchDatabases());
      setStep(2);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshDatabases = async () => {
    setIsLoading(true);
    setError(null);
    try {
      setNotionDatabases(await searchDatabases());
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectNotionDatabase = (id: string) => {
    setNotionDbId(id);
  };

  const handleRunSync = async (sourceId: string | undefined) => {
    if (!sourceId) {
      return;
    }
    try {
      await integrationService.runSync(sourceId, true);
      await refreshSyncStatus();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleSaveNotionSource = async () => {
    if (!notionSource || !notionDbId) {
      setError('Select a Notion database to save.');
      return;
    }
    setSaveStatus('saving');
    try {
      const updated = await integrationService.patchSource(notionSource.id, {
        targetId: notionDbId,
        module: 'wiki',
        isActive: true,
        name: notionSource.name || 'Notion Source',
        settings: notionSource.settings || {}
      });

      if (!notionMappings.some((mapping) => mapping.sourceId === updated.id && mapping.module === 'wiki')) {
        await integrationService.updateSourceMapping(updated.id, 'wiki', {
          fieldMap: {
            id: 'id',
            title: 'Name',
            category: 'Category',
            tags: 'Tags',
            content: 'Content',
            notionUrl: 'notionUrl',
            lastEdited: 'lastEdited'
          },
          transformRules: {},
          isActive: true
        });
      }

      setNotionSource(updated);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      await refreshSyncStatus();
    } catch (err) {
      setError((err as Error).message);
      setSaveStatus('idle');
    }
  };

  const handleSaveSheetsSource = async () => {
    if (!sheetSource || !sheetId) {
      setError('Set a Google Sheet ID to continue.');
      return;
    }
    setSaveStatus('saving');
    try {
      const updated = await integrationService.patchSource(sheetSource.id, {
        targetId: sheetId,
        module: 'ppp_onboarding',
        isActive: true,
        settings: { ...sheetSource.settings, range: sheetRange || 'A1:H1000' }
      });

      if (!sheetMappings.some((mapping) => mapping.sourceId === updated.id && mapping.module === 'ppp_onboarding')) {
        await integrationService.updateSourceMapping(updated.id, 'ppp_onboarding', {
          fieldMap: {
            name: 'name',
            pppStatus: 'pppStatus',
            location: 'location',
            contactPerson: 'contactPerson',
            licenseNumber: 'licenseNumber',
            totalOrders: 'totalOrders',
            totalOrderedAmount: 'totalOrderedAmount',
            lastOrderDate: 'lastOrderDate'
          },
          transformRules: {
            headerRow: 0,
            fallbackSourceColumns: ['Name', 'PPP Status', 'Location', 'Contact', 'License', 'Total Orders', 'Total Ordered', 'Last Order Date']
          },
          isActive: true
        });
      }

      setSheetSource(updated);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
      await handleRunSync(updated.id);
    } catch (err) {
      setError((err as Error).message);
      setSaveStatus('idle');
    }
  };

  const resetFlow = () => {
    setStep(1);
    setError(null);
    setNotionDatabases([]);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h2 className="text-2xl font-bold text-slate-800">Integration Setup</h2>
        <p className="text-slate-500">Configure organization sources for each managed module.</p>
      </div>

      <div className="flex space-x-4 border-b border-slate-200">
        <button
          onClick={() => setActiveTab('notion')}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'notion' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Notion Knowledge Base
        </button>
        <button
          onClick={() => setActiveTab('sheets')}
          className={`pb-3 px-2 text-sm font-medium transition-colors border-b-2 ${activeTab === 'sheets' ? 'border-green-600 text-green-600' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
          Google Sheets Data
        </button>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden min-h-[500px]">
        {activeTab === 'notion' && (
          <>
            {step === 1 && (
              <div className="p-8">
                <div className="flex items-start gap-6 mb-8">
                  <div className="w-16 h-16 bg-slate-100 rounded-xl flex items-center justify-center text-4xl shadow-sm border border-slate-200">
                    N
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Connect to Notion</h3>
                    <p className="text-slate-500 text-sm mt-1 max-w-xl leading-relaxed">
                      Notion access is now sourced from server configuration. Verify the API connection, then assign the shared database for the wiki module.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 max-w-lg">
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
                    <p><strong>Configuration Note:</strong> The Notion API key is managed by environment variables.</p>
                    <p className="mt-1">Ensure <code>NOTION_API_KEY</code> is set in the Vercel project.</p>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                      <XCircle size={16} /> {error}
                    </div>
                  )}

                  <button
                    onClick={handleConnectNotion}
                    disabled={isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all mt-4"
                  >
                    {isLoading ? <RefreshCw className="animate-spin" size={18} /> : <ShieldCheck size={18} />}
                    {isLoading ? 'Verifying Connection...' : 'Verify Server Connection'}
                  </button>
                </div>

                {renderSyncCard(notionStatus, 'Notion Sync')}
              </div>
            )}

            {step === 2 && (
              <>
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    {notionBot?.icon && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={notionBot.icon} alt="Bot" className="w-10 h-10 rounded-full border border-slate-200 bg-white" onError={(event) => (event.currentTarget.style.display = 'none')} />
                    )}
                    <div>
                      <div className="text-sm font-bold text-slate-800 flex items-center gap-2">
                        Connected as {notionBot?.name || 'Notion workspace'}
                        <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] rounded-full uppercase tracking-wider">Active</span>
                      </div>
                      <div className="text-xs text-slate-500">{notionBot?.workspaceName || 'Unknown workspace'}</div>
                    </div>
                  </div>
                  <button onClick={resetFlow} className="text-slate-400 hover:text-slate-600 text-sm underline">
                    Reconnect
                  </button>
                </div>
                <div className="p-8">
                  <h3 className="text-lg font-bold text-slate-900 mb-2">Select Primary Database</h3>
                  {notionDatabases.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                      {notionDatabases.map((db) => (
                        <button
                          type="button"
                          key={db.id}
                          onClick={() => handleSelectNotionDatabase(db.id)}
                          className={`p-4 rounded-xl border-2 cursor-pointer transition-all flex items-start gap-4 text-left ${
                            notionDbId === db.id ? 'border-indigo-600 bg-indigo-50 shadow-sm' : 'border-slate-200 hover:border-indigo-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="text-2xl">{db.icon || '🗂️'}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className={`font-semibold truncate ${notionDbId === db.id ? 'text-indigo-900' : 'text-slate-700'}`}>
                              {db.title || db.id}
                            </h4>
                            <div className="text-xs text-slate-400 mt-1 truncate">ID: {db.id}</div>
                            <div className="text-[11px] text-slate-400 mt-1 truncate">Last edit: {toDateTime(db.lastEdited)} </div>
                            {notionDbId === db.id && (
                              <div className="mt-2 text-[11px] text-emerald-700 font-medium flex items-center gap-1">
                                <Check size={12} /> Selected
                              </div>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 text-center mb-6">
                      <p className="text-sm text-amber-800">No databases returned. Verify Notion connectivity and permissions.</p>
                    </div>
                  )}

                  <div className="flex justify-between items-center border-t border-slate-100 pt-6">
                    <button onClick={handleRefreshDatabases} className="flex items-center gap-2 text-indigo-600 hover:text-indigo-800 text-sm font-medium">
                      <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} /> Refresh List
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleRunSync.bind(null, notionSource?.id)}
                        disabled={!notionSource?.id}
                        className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-medium border border-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:border-slate-200 disabled:text-slate-300"
                      >
                        <Play size={14} />
                        {isLoadingStatus ? 'Checking...' : 'Run Sync'}
                      </button>
                      <button
                        onClick={handleSaveNotionSource}
                        disabled={!notionDbId}
                        className="flex items-center gap-2 px-8 py-3 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:bg-slate-300"
                      >
                        {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? <><Check size={18} /> Saved</> : 'Save Configuration'}
                      </button>
                    </div>
                  </div>
                  {renderSyncCard(notionStatus, 'Notion Sync')}
                </div>
              </>
            )}
          </>
        )}

        {activeTab === 'sheets' && (
          <div className="p-8">
            <div className="flex items-start gap-6 mb-8">
              <div className="w-16 h-16 bg-green-50 rounded-xl flex items-center justify-center text-green-600 shadow-sm border border-green-100">
                <FileSpreadsheet size={32} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Google Sheets Source</h3>
                <p className="text-slate-500 text-sm mt-1 max-w-xl leading-relaxed">
                  Configure the live sheet source for onboarding data.
                  Sheet reads use a server-side service account and remain read-only from the UI.
                </p>
              </div>
            </div>

            <div className="space-y-6 max-w-lg">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Google Sheet ID</label>
                <div className="text-[10px] text-slate-400 mb-2">
                  Found in URL: docs.google.com/spreadsheets/d/<b>[ID]</b>/edit
                </div>
                <input
                  type="text"
                  value={sheetId}
                  onChange={(event) => setSheetId(event.target.value)}
                  placeholder="1BxiMvs0XRA5nFMdKvBdBZjgmUUqptlbs74dg_EgyJo4"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all font-mono text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Default Range</label>
                <input
                  type="text"
                  value={sheetRange}
                  onChange={(event) => setSheetRange(event.target.value)}
                  placeholder="A1:H1000"
                  className="w-full px-4 py-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-green-500 transition-all font-mono text-sm"
                />
                <div className="text-xs text-slate-500 mt-1">Used for on-demand reads and sync checkpoints.</div>
              </div>

              <div className="bg-slate-50 p-4 rounded-lg border border-slate-100 text-xs text-slate-600 space-y-2">
                <p className="font-semibold">Service Account Setup Required:</p>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Share the sheet with your service account email (found in GOOGLE_SERVICE_ACCOUNT_JSON).</li>
                  <li>Grant reader access to the sheet.</li>
                  <li>Set <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> in the environment.</li>
                </ol>
              </div>

              {error && (
                <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg border border-red-100">
                  <XCircle size={16} /> {error}
                </div>
              )}

              <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
                <button
                  onClick={handleRunSync.bind(null, sheetSource?.id)}
                  disabled={!sheetSource?.id}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg font-medium border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:border-slate-200 disabled:text-slate-300"
                >
                  <Play size={14} />
                  {isLoadingStatus ? 'Checking...' : 'Run Sync'}
                </button>
                <button
                  onClick={handleSaveSheetsSource}
                  disabled={!sheetId}
                  className={`px-8 py-3 rounded-lg font-medium text-white transition-all shadow-md ${saveStatus === 'saved' ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-green-600 hover:bg-green-700'}`}
                >
                  {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? <><Check size={18} /> Saved</> : 'Save Sheet Source'}
                </button>
              </div>
            </div>
            {renderSyncCard(sheetStatus, 'Sheets Sync')}
          </div>
        )}
      </div>
    </div>
  );
};
