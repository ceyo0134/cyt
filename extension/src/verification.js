// Read-only verification policy. HTTP acceptance is never GIF evidence.
(() => {
  const validId = id => typeof id === 'string' && /^[A-Za-z0-9_.-]{8,200}$/.test(id);
  function target(result, editing, knownId) {
    const replyId = validId(result.commentId) ? result.commentId : '';
    const selectedId = editing && validId(knownId) ? knownId : '';
    if (replyId && selectedId && replyId !== selectedId) return '';
    if (result.state === 'accepted') return replyId || selectedId;
    // Some native update replies omit actionResult. Read the exact existing
    // comment without treating that reply as success or resending the edit.
    if (editing && result.state === 'unknown' && result.http >= 200 && result.http < 300
        && result.status === 'MISSING_ACTION_RESULT') return replyId || selectedId;
    return '';
  }
  function verdict(value = {}, editing = false) {
    if (!value) return 'public_unknown';
    if (value.checked !== true || value.commentVisible !== true) return 'public_unknown';
    // A Tenor link in the text, an avatar, or the old GIF on an edited comment
    // cannot prove that the requested animated attachment was saved.
    if (value.gifAttachmentVisible !== true) return 'gif_missing';
    if (editing && value.selectedAttachmentVisible !== true) return 'selected_gif_unverified';
    return value.attributionVisible === true ? 'verified_public' : 'public_unknown';
  }
  globalThis.CanDemirVerification = Object.freeze({target, verdict});
})();
