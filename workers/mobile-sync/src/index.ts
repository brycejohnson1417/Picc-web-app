export interface MobileCheckInQueueItem {
  id: string;
  storeId: string;
  noteText: string;
  happenedAt: string;
}

export async function replayOfflineCheckIns(items: MobileCheckInQueueItem[], apiBase: string) {
  const results: Array<{ id: string; ok: boolean; status: number }> = [];

  for (const item of items) {
    const response = await fetch(`${apiBase}/api/territory/check-in`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        store: {
          id: item.storeId,
          notionPageId: item.storeId,
          name: item.storeId,
        },
        mode: 'written',
        noteText: item.noteText,
      }),
    }).catch(() => null);

    results.push({
      id: item.id,
      ok: Boolean(response?.ok),
      status: response?.status ?? 0,
    });
  }

  return results;
}
