import { describe, expect, it, vi } from 'vitest';
import { NOTION_CRM_TAB_TARGET, openNotionCrmTab } from '@/lib/territory/notion-link-target';

describe('territory Notion link target', () => {
  it('reuses the same Notion CRM tab instead of opening a blank tab for each click', () => {
    expect(NOTION_CRM_TAB_TARGET).toBe('picc-notion-crm');
    expect(NOTION_CRM_TAB_TARGET).not.toBe('_blank');
  });

  it('opens Notion in the named tab and clears opener access', () => {
    const openedWindow = {
      opener: { location: 'app' },
      focus: vi.fn(),
    } as unknown as Window;
    const openWindow = vi.fn(() => openedWindow);

    const result = openNotionCrmTab('https://www.notion.so/page-id', openWindow);

    expect(result).toBe(openedWindow);
    expect(openWindow).toHaveBeenCalledWith('https://www.notion.so/page-id', NOTION_CRM_TAB_TARGET);
    expect(openedWindow.opener).toBeNull();
    expect(openedWindow.focus).toHaveBeenCalled();
  });
});
