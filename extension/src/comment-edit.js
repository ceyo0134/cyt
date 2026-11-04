// Keep YouTube's own edit dialog/Save handler. This file never sends a request.
(() => {
  const ownerSelector = 'ytd-comment-view-model, ytd-comment-renderer';
  let selectedOwner = null, selectedAt = 0, generation = 0;
  const forwarded = new WeakSet();
  const visible = el => !!el?.isConnected && el.getClientRects().length > 0;
  const editorOf = owner => [...owner.querySelectorAll('#edit-dialog [contenteditable="true"], ytd-comment-dialog-renderer [contenteditable="true"], ytd-comment-reply-dialog-renderer [contenteditable="true"]')].find(visible);
  const announce = (owner, message) => {
    window.postMessage({gcfy:'edit-status'}, location.origin);
    owner.querySelector('.gcfy-edit-status')?.remove();
    const status = document.createElement('p'); status.className = 'gcfy-edit-status';
    status.setAttribute('role','status'); status.textContent = message;
    owner.append(status); setTimeout(() => status.remove(), 8000);
  };
  document.addEventListener('click', event => {
    if (!event.isTrusted) return;
    const path = event.composedPath();
    if (path.some(el => el?.matches?.('#cancel-button, #submit-button, ytd-commentbox'))) generation++;
    const menu = path.find(el => el?.matches?.('ytd-menu-renderer, #action-menu'));
    const owner = menu?.closest(ownerSelector);
    if (owner) { generation++; selectedOwner = owner; selectedAt = Date.now(); }
  }, true);
  document.addEventListener('yt-navigate', event => {
    if (forwarded.has(event)) return;
    const endpoint = event.detail?.endpoint;
    if (!endpoint?.updateCommentDialogEndpoint?.dialog && !endpoint?.updateCommentReplyDialogEndpoint?.dialog) return;
    const pathOwner = event.composedPath().find(el => el?.matches?.(ownerSelector));
    const owner = pathOwner || (Date.now() - selectedAt < 15000 ? selectedOwner : null);
    if (!owner?.isConnected) return;
    window.postMessage({gcfy:'edit-status'}, location.origin);
    const token = ++generation;
    const reveal = () => {
      if (token !== generation || !owner.isConnected) return true;
      const editor = editorOf(owner);
      if (!editor) return false;
      // Preserve only the public permalink ID of this exact edited comment.
      // Never guess from comment text, account data or another comment.
      editor.removeAttribute('data-cdg-edit-comment-id');
      const permalink = owner.querySelector('a#published-time-text[href], #published-time-text a[href]');
      if (permalink?.href) {
        try {
          const url = new URL(permalink.href, location.href), id = url.searchParams.get('lc');
          if (url.origin === location.origin && url.pathname === '/watch' && /^[A-Za-z0-9_.-]{8,200}$/.test(id || ''))
            editor.setAttribute('data-cdg-edit-comment-id', id);
        } catch (_) { /* no exact target: leave verification unresolved */ }
      }
      editor.closest('ytd-commentbox')?.classList.add('gcfy-edit-commentbox');
      if (document.activeElement !== editor) {
        editor.scrollIntoView({block:'center', inline:'nearest', behavior:'auto'});
        editor.focus({preventScroll:true});
      }
      announce(owner, 'Yorum düzenleme açık • Değişiklikleri YouTube’un Kaydet düğmesiyle kaydet');
      return true;
    };
    // A detached popup can lose the comment's yt-navigate listener. Allow the
    // original event to finish first, then relay only this UI command once.
    setTimeout(() => {
      if (reveal()) return;
      const retry = new CustomEvent('yt-navigate', {bubbles:true, composed:true, cancelable:true, detail:event.detail});
      forwarded.add(retry); owner.dispatchEvent(retry);
      setTimeout(() => {
        if (!reveal()) announce(owner, 'Yorum düzenleyicisi açılamadı. Sayfayı yenileyip Düzenle’ye tekrar dokun.');
      }, 800);
    }, 800);
  }, true);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') generation++; }, true);
  window.addEventListener('yt-navigate-start', () => { generation++; selectedOwner = null; });
})();
