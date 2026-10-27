/**
 * Antigravity Workflow Kit - Auto Accept Script Bundle
 * Bundled version of auto-accept logic for injection into webviews
 * @module providers/auto-accept-bundle
 */

// This is a BUNDLED script that will be injected into the webview context
// It contains all the auto-accept logic from the old extension

export const AUTO_ACCEPT_SCRIPT = `
(function() {
  // Prevent double initialization
  if (window.__workflowKitAutoAccept) return;
  window.__workflowKitAutoAccept = true;
  
  // ========== State ==========
  window.__autoAcceptState = window.__autoAcceptState || {
    isRunning: false,
    sessionID: 0,
    tabNames: [],
    completionStatus: {}
  };
  
  // ========== Utils ==========
  function getDocuments(root = document) {
    let docs = [root];
    try {
      const iframes = root.querySelectorAll('iframe, frame');
      for (const iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow?.document;
          if (iframeDoc) {
            docs.push(...getDocuments(iframeDoc));
          }
        } catch (e) {}
      }
    } catch (e) {}
    return docs;
  }
  
  function queryAll(selector) {
    const docs = getDocuments();
    let results = [];
    for (const doc of docs) {
      results.push(...Array.from(doc.querySelectorAll(selector)));
    }
    return results;
  }
  
  // ========== Button Detection ==========
  const ACCEPT_PATTERNS = [
    { pattern: 'accept', exact: false },
    { pattern: 'accept all', exact: false },
    { pattern: 'acceptalt', exact: false },
    { pattern: 'run command', exact: false },
    { pattern: 'run', exact: false },
    { pattern: 'apply', exact: true },
    { pattern: 'execute', exact: true },
    { pattern: 'retry', exact: true },
    { pattern: 'try again', exact: false },
    { pattern: 'confirm', exact: false },
    { pattern: 'Allow Once', exact: true }
  ];
  
  const REJECT_PATTERNS = ['skip', 'reject', 'cancel', 'discard', 'deny', 'close', 'refine', 'other'];
  
  function isAcceptButton(el) {
    if (!el || !el.textContent) return false;
    
    const text = el.textContent.trim().toLowerCase();
    if (text.length === 0 || text.length > 50) return false;
    
    // Check if matches accept pattern
    const matched = ACCEPT_PATTERNS.some(p => p.exact ? text === p.pattern : text.includes(p.pattern));
    if (!matched) return false;
    
    // Reject if matches negative pattern
    if (REJECT_PATTERNS.some(p => text.includes(p))) return false;
    
    // Check visibility
    const win = el.ownerDocument.defaultView || window;
    const style = win.getComputedStyle(el);
    const rect = el.getBoundingClientRect();
    
    const visible = style.display !== 'none' && 
                    style.visibility !== 'hidden' && 
                    parseFloat(style.opacity) > 0.1 &&
                    rect.width > 0 && rect.height > 0;
    
    const clickable = style.pointerEvents !== 'none' && !el.disabled;
    
    return visible && clickable;
  }
  
  // ========== Click Functions ==========
  function clickAcceptButtons() {
    const docs = getDocuments();
    let clicked = 0;
    
    // Find all buttons
    for (const doc of docs) {
      // Antigravity specific selectors
      const buttons = doc.querySelectorAll('.bg-ide-button-background, button');
      
      buttons.forEach(btn => {
        if (isAcceptButton(btn)) {
          btn.click();
          clicked++;
        }
      });
    }
    
    return clicked;
  }
  
  // ========== Polling Loop ==========
  let pollTimer = null;
  
  window.__autoAllStart = function(config) {
    if (window.__autoAcceptState.isRunning) return;
    
    window.__autoAcceptState.isRunning = true;
    window.__autoAcceptState.sessionID++;
    
    const interval = config?.pollInterval || 1000;
    const sid = window.__autoAcceptState.sessionID;
    
    function poll() {
      if (!window.__autoAcceptState.isRunning || window.__autoAcceptState.sessionID !== sid) {
        return;
      }
      
      const clicked = clickAcceptButtons();
      if (clicked > 0) {
        console.log('[Workflow Kit] Clicked ' + clicked + ' accept button(s)');
      }
      
      pollTimer = setTimeout(poll, interval);
    }
    
    poll();
    console.log('[Workflow Kit] Auto-accept started');
  };
  
  window.__autoAllStop = function() {
    window.__autoAcceptState.isRunning = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
    console.log('[Workflow Kit] Auto-accept stopped');
  };
  
  window.__autoAcceptOnce = function() {
    return clickAcceptButtons();
  };
  
  console.log('[Workflow Kit] Auto-accept script loaded');
})();
`;

/**
 * Get the minified version of the script (for smaller payload)
 */
export function getAutoAcceptScript(): string {
    return AUTO_ACCEPT_SCRIPT;
}
