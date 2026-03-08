// content.js — Provides page text content for content-based rule matching

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "GET_PAGE_CONTENT") {
    const content = document.body ? document.body.innerText : "";
    sendResponse({ content });
  }
});
