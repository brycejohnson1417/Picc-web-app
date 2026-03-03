import { IntegrationModuleKey } from '../integrations/types';
import { Dispensary } from '../types';
import { normalizeDispensaries, parseSheetRows } from '../integrations/sheetsAdapter';

interface ApiError {
  message: string;
}

interface JsonResult<T> {
  data?: T;
  error?: ApiError;
}

export interface IntegrationWorkspace {
  id: string;
  slug: string;
  displayName: string;
}

export interface IntegrationSource {
  id: string;
  type: 'notion' | 'sheets';
  module: IntegrationModuleKey;
  name: string;
  targetId: string | null;
  settings: Record<string, unknown>;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IntegrationMapping {
  id: string;
  sourceId: string;
  module: IntegrationModuleKey;
  fieldMap: Record<string, string>;
  transformRules: Record<string, unknown>;
  isActive: boolean;
}

export interface SyncCheckpoint {
  id: string;
  sourceId: string;
  module: IntegrationModuleKey;
  cursor: string | null;
  checksum: string | null;
  lastSyncedAt: string | null;
  lastSyncStatus: 'idle' | 'running' | 'success' | 'error' | 'backoff';
  meta: Record<string, unknown>;
}

export interface IntegrationConfigResponse {
  workspace: IntegrationWorkspace;
  sources: IntegrationSource[];
  mappings: IntegrationMapping[];
  checkpoints: SyncCheckpoint[];
}

export interface SyncStatusResponse {
  sourceId: string;
  module: IntegrationModuleKey;
  sourceType: 'notion' | 'sheets';
  sourceName: string;
  lastCheckpoint: SyncCheckpoint | null;
  activeJobs: Array<{
    id: string;
    status: 'idle' | 'running' | 'success' | 'error' | 'backoff';
    startedAt: string;
    endedAt: string | null;
    message: string | null;
  }>;
}

interface CachedPayload<T> {
  ttlSeconds: number;
  value: T;
  fetchedAt: number;
}

interface RequestOptions<T = unknown> {
  method?: 'GET' | 'POST' | 'PATCH';
  body?: T;
  headers?: Record<string, string>;
}

const parseJson = async <T>(response: Response): Promise<JsonResult<T>> => {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return { data: JSON.parse(text) as T };
  } catch {
    return { error: { message: text } };
  }
};

const apiFetch = async <T = unknown>(path: string, options: RequestOptions = {}): Promise<T> => {
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  });

  const payload = await parseJson<T>(response);
  if (!response.ok) {
    const message = payload.error?.message || response.statusText || 'Request failed';
    throw new Error(message);
  }

  if (!payload.data) {
    return {} as T;
  }

  return payload.data as T;
};

const memoCache = new Map<string, CachedPayload<unknown>>();
const setCached = (key: string, value: unknown, ttlSeconds: number) => {
  memoCache.set(key, {
    ttlSeconds,
    value,
    fetchedAt: Date.now()
  });
};
const getCached = <T>(key: string): T | null => {
  const cached = memoCache.get(key);
  if (!cached) {
    return null;
  }
  if ((Date.now() - cached.fetchedAt) / 1000 > cached.ttlSeconds) {
    memoCache.delete(key);
    return null;
  }
  return cached.value as T;
};

export const integrationService = {
  async getConfig(force = false): Promise<IntegrationConfigResponse> {
    const cacheKey = 'integration-config';
    if (!force) {
      const cached = getCached<IntegrationConfigResponse>(cacheKey);
      if (cached) {
        return cached;
      }
    }
    const response = await apiFetch<IntegrationConfigResponse>('/api/integrations/config');
    setCached(cacheKey, response, 30);
    return response;
  },

  async patchSource(sourceId: string, payload: Partial<IntegrationSource>): Promise<IntegrationSource> {
    const source = await apiFetch<IntegrationSource>(`/api/integrations/config/sources/${sourceId}`, {
      method: 'PATCH',
      body: payload
    });
    memoCache.delete('integration-config');
    return source;
  },

  async updateSourceMapping(sourceId: string, module: IntegrationModuleKey, payload: Partial<IntegrationMapping>): Promise<IntegrationMapping> {
    const response = await apiFetch<IntegrationMapping>(`/api/integrations/config/sources/${sourceId}`, {
      method: 'PATCH',
      body: {
        module,
        fieldMap: payload.fieldMap,
        transformRules: payload.transformRules,
        mappingIsActive: payload.isActive
      }
    });
    memoCache.delete('integration-config');
    return response;
  },

  async getSyncStatus(sourceId: string): Promise<SyncStatusResponse> {
    return apiFetch<SyncStatusResponse>(`/api/integrations/sync/${sourceId}/status`);
  },

  async runSync(sourceId: string, force = false): Promise<{ sourceId: string; jobId?: string; message: string }> {
    return apiFetch(`/api/integrations/sync/${sourceId}/run`, {
      method: 'POST',
      body: { force }
    });
  },

  async notionValidate(sourceId: string): Promise<{ name: string; workspaceName?: string; icon?: string }> {
    return apiFetch(`/api/integrations/notion/${sourceId}/query?action=validate`);
  },

  async notionListDatabases(
    sourceId: string
  ): Promise<{ id: string; title: string; url: string; lastEdited?: string }[]> {
    return apiFetch(`/api/integrations/notion/${sourceId}/query?action=databases`);
  },

  async notionQuery(
    sourceId: string,
    params: {
      page_size?: number;
      start_cursor?: string;
      filterAfter?: string;
      module?: IntegrationModuleKey;
    } = {}
  ) {
    const query = new URLSearchParams();
    query.set('action', 'query');
    if (params.module) {
      query.set('module', params.module);
    }
    if (params.page_size) {
      query.set('page_size', String(params.page_size));
    }
    if (params.start_cursor) {
      query.set('start_cursor', params.start_cursor);
    }
    if (params.filterAfter) {
      query.set('filter_after', params.filterAfter);
    }
    return apiFetch<{
      sourceId: string;
      module: IntegrationModuleKey;
      results: Array<{
        id: string;
        title: string;
        category: string;
        tags: string[];
        content: string;
        notionUrl: string;
        lastEdited: string;
      }>;
      hasMore: boolean;
      nextCursor: string | null;
      sourceVersion?: string;
    }>(`/api/integrations/notion/${sourceId}/query?${query.toString()}`);
  },

  async notionCreatePage(sourceId: string, module: IntegrationModuleKey, payload: Record<string, unknown>, requestId: string) {
    return apiFetch(`/api/integrations/notion/${sourceId}/pages`, {
      method: 'POST',
      body: {
        module,
        requestId,
        payload
      }
    });
  },

  async notionUpdatePage(sourceId: string, pageId: string, module: IntegrationModuleKey, payload: Record<string, unknown>, requestId: string) {
    return apiFetch(`/api/integrations/notion/${sourceId}/pages/${pageId}`, {
      method: 'PATCH',
      body: {
        module,
        requestId,
        payload
      }
    });
  },

  async getSheetRange(sourceId: string, range?: string, force = false): Promise<{
    sourceId: string;
    range: string;
    values: string[][];
    checksum?: string;
  }> {
    const params = new URLSearchParams();
    params.set('module', 'ppp_onboarding');
    if (range) {
      params.set('range', range);
    }
    if (force) {
      params.set('force', 'true');
    }
    return apiFetch(`/api/integrations/sheets/${sourceId}/range?${params.toString()}`);
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async normalizeByModule(module: IntegrationModuleKey, _sourceId: string): Promise<{
    source: IntegrationSource;
    mappings: IntegrationMapping[];
    checkpoints: SyncCheckpoint[];
  }> {
    const config = await this.getConfig();
    const source = config.sources.find((item) => item.module === module && item.isActive) || config.sources[0];
    if (!source) {
      throw new Error(`No integration source configured for module ${module}`);
    }
    const mappings = config.mappings.filter((mapping) => mapping.sourceId === source.id && mapping.isActive);
    const checkpoints = config.checkpoints.filter((checkpoint) => checkpoint.sourceId === source.id);
    return { source, mappings, checkpoints };
  },

  async getSourceForModule(module: IntegrationModuleKey): Promise<IntegrationSource | null> {
    const config = await this.getConfig();
    return config.sources.find((source) => source.module === module && source.isActive) || null;
  },

  async getSourceMappings(sourceId: string): Promise<IntegrationMapping[]> {
    const config = await this.getConfig();
    return config.mappings.filter((mapping) => mapping.sourceId === sourceId);
  },

  async getNotionModulesFromConfig(module: IntegrationModuleKey): Promise<IntegrationSource[]> {
    const config = await this.getConfig();
    return config.sources.filter((source) => source.type === 'notion' && source.module === module && source.isActive);
  },

  async getPrimaryDispensariesFromSheets(): Promise<Dispensary[]> {
    const source = await this.getSourceForModule('ppp_onboarding');
    if (!source || source.type !== 'sheets' || !source.targetId) {
      return [];
    }
    const payload = await this.getSheetRange(source.id);
    const values = payload.values || [];
    if (!values.length) {
      return [];
    }
    const sourceMappings = await this.getSourceMappings(source.id);
    const mapping = sourceMappings.find((entry) => entry.module === source.module) || {
      id: 'fallback',
      sourceId: source.id,
      module: source.module,
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
      transformRules: {},
      isActive: true
    } as IntegrationMapping;

    if (!mapping) {
      return [];
    }

    const parsed = parseSheetRows('ppp_onboarding', values, mapping.fieldMap, mapping.transformRules as Record<string, unknown>);
    return normalizeDispensaries(parsed);
  }
};
