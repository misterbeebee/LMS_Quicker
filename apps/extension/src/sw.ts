/**
 * MV3 Background Service Worker for Velm.
 * Clicking the toolbar icon opens (or focuses) the full local Velm dashboard tab.
 */
chrome.action.onClicked.addListener(async () => {
  const dashboardUrl = chrome.runtime.getURL('index.html');
  const existingTabs = await chrome.tabs.query({ url: dashboardUrl });
  const firstTab = existingTabs[0];
  if (firstTab?.id !== undefined) {
    await chrome.tabs.update(firstTab.id, { active: true });
    if (firstTab.windowId !== undefined) {
      await chrome.windows.update(firstTab.windowId, { focused: true });
    }
    return;
  }
  await chrome.tabs.create({ url: dashboardUrl });
});
