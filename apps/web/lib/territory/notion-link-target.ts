export const NOTION_CRM_TAB_TARGET = 'picc-notion-crm';

type OpenWindow = (url?: string | URL, target?: string, features?: string) => Window | null;

export function openNotionCrmTab(notionPageUrl: string, openWindow?: OpenWindow) {
  const openFn = openWindow ?? globalThis.window?.open?.bind(globalThis.window);
  if (!openFn) return null;

  const notionWindow = openFn(notionPageUrl, NOTION_CRM_TAB_TARGET);
  if (notionWindow) {
    notionWindow.opener = null;
    notionWindow.focus();
  }

  return notionWindow;
}
