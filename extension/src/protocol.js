// Android adaptation, 2026-10-12. GPL-3.0. Shared conservative response checks.
(() => {
  const MARKER = /\[\[gif:(\d{1,20}):([a-z0-9]{8,32})\]\]/;
  function walk(value, visit, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 60) return;
    visit(value);
    for (const child of Object.values(value)) walk(child, visit, depth + 1);
  }
  function gifMatches(value, id) {
    if (!/^\d{1,20}$/.test(id)) return false;
    let found = false;
    walk(value, node => {
      if (String(node.tenorId || '') === id) found = true;
      for (const val of Object.values(node)) {
        if (typeof val !== 'string') continue;
        if (/^https:\/\/(www\.)?tenor\.com\//.test(val) && val.split(/[?#]/)[0].endsWith('-' + id)) found = true;
        if (!/^https:\/\/media\d*\.tenor\.com\//.test(val)) continue;
        const encoded = val.split('/').find(p => /^[A-Za-z0-9_-]{16}$/.test(p));
        if (encoded) {
          try {
            const bin = atob(encoded.slice(0, 11).replace(/-/g, '+').replace(/_/g, '/') + '=');
            let n = 0n;
            for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(bin.charCodeAt(i));
            if (n.toString() === id) found = true;
          } catch (_) { /* not evidence */ }
        }
      }
    });
    return found;
  }
  function comments(json) {
    const results = new Map(), entities = new Map(), references = new Map();
    walk(json, node => {
      if (typeof node.key === 'string' && node.key.length < 1000) entities.set(node.key, node);
      // Both classic commentRenderer and current entity mutations are supported.
      const id = node.commentId || (node.properties && node.properties.commentId);
      if (typeof id === 'string' && /^[A-Za-z0-9_.-]{8,200}$/.test(id)) {
        const old = results.get(id);
        results.set(id, old ? [old, node] : node);
        for (const name of ['commentKey', 'commentSurfaceKey']) {
          const key = node[name];
          if (typeof key === 'string' && key.length < 1000) {
            if (!references.has(id)) references.set(id, new Set());
            references.get(id).add(key);
          }
        }
      }
    });
    // Current watch-page comments keep text and image attachments in separate
    // entities. Join only the exact keys referenced by this comment renderer.
    for (const [id, keys] of references) for (const key of keys) {
      const entity = entities.get(key);
      if (entity && (!entity.properties?.commentId || entity.properties.commentId === id)) results.set(id, [results.get(id), entity]);
    }
    return results;
  }
  function youtubeGifAttachment(value, commentId, tenorId = '') {
    let found = false;
    walk(value, node => {
      const attachment = node.commentImageAttachmentViewModel;
      if (!attachment || attachment.image?.imageFormatHint !== 'IMAGE_FORMAT_ANIMATED_WEBP'
          || typeof attachment.externalImageId !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(attachment.externalImageId)) return;
      for (const source of attachment.image.sources || []) {
        try {
          const u = new URL(source.url);
          if (u.protocol === 'https:' && u.hostname === 'i.ytimg.com' && !u.username && !u.password && !u.port
              && u.pathname === '/c_exp/' + commentId + '/' + attachment.externalImageId + '_webp_animated_original_aspect_ratio.webp'
              && (!tenorId || gifMatches(attachment, tenorId))) found = true;
        } catch (_) { /* not evidence */ }
      }
    });
    return found;
  }
  function attributionMatches(value) {
    let found = false;
    walk(value, node => {
      const text = typeof node.content === 'string' ? node.content : typeof node.text === 'string' ? node.text : '';
      if (text.includes('cyt ile gönderildi')) found = true;
      if (Array.isArray(node.runs) && node.runs.map(r => r.text || '').join('').includes('cyt ile gönderildi')) found = true;
    });
    return found;
  }
  function inspect(json, http, tenorId) {
    if (!http) return { state: 'unknown', http: 0, status: 'NO_HTTP_RESPONSE', commentId: '' };
    if (!json || typeof json !== 'object') return { state: 'unknown', http, status: 'UNREADABLE_RESPONSE', commentId: '' };
    const actionStatus = json.actionResult && json.actionResult.status || '';
    const apiStatus = /^[A-Z_]{1,60}$/.test(json.error?.status || '') ? json.error.status : '';
    let showError = false;
    const messages = [];
    const textOf = value => typeof value === 'string' ? value : value?.simpleText || value?.content
      || (Array.isArray(value?.runs) ? value.runs.map(r => typeof r.text === 'string' ? r.text : '').join('') : '');
    const visitActions = (actions, depth = 0) => {
      if (!Array.isArray(actions) || depth > 10) return;
      for (const action of actions) {
        if (action?.showErrorAction) {
          showError = true;
          const error = action.showErrorAction.errorMessage;
          messages.push(textOf(error?.messageRenderer?.text) || textOf(error));
        }
        visitActions(action?.commandExecutorCommand?.commands, depth + 1);
      }
    };
    for (const name of ['actions', 'onResponseReceivedActions', 'onResponseReceivedEndpoints']) visitActions(json[name]);
    messages.push(textOf(json.error?.message), textOf(json.actionResult?.feedbackText));
    const serverMessage = [...new Set(messages.filter(s => typeof s === 'string' && s.trim()))].join(' ').replace(/[\u0000-\u001f\u007f]/g, ' ').slice(0, 240);
    const details = { apiStatus, actionStatus, serverMessage };
    const status = http === 400 && apiStatus === 'INVALID_ARGUMENT' ? 'YOUTUBE_INVALID_ARGUMENT'
      : showError ? 'YOUTUBE_GIF_REJECTED' : apiStatus || actionStatus || 'MISSING_ACTION_RESULT';
    if (http < 200 || http >= 300 || json.error || showError || /FAILED|REJECTED|DENIED/.test(status)) {
      return { state: 'rejected', http, status, commentId: '', ...details };
    }
    const candidates = comments(json);
    const withGif = [...candidates].filter(([, value]) => gifMatches(value, tenorId));
    const commentId = withGif.length === 1 ? withGif[0][0] : candidates.size === 1 ? [...candidates.keys()][0] : '';
    if (status !== 'STATUS_SUCCEEDED') return { state: 'unknown', http, status, commentId, ...details };
    return { state: 'accepted', http, status, commentId, responseGifPresent: withGif.length === 1, ...details };
  }
  function evidence(json, commentId, tenorId) {
    const comment = comments(json).get(commentId);
    return { commentVisible: !!comment, gifVisible: !!comment && gifMatches(comment, tenorId),
      gifAttachmentVisible: !!comment && youtubeGifAttachment(comment, commentId),
      selectedAttachmentVisible: !!comment && !!tenorId && youtubeGifAttachment(comment, commentId, tenorId),
      attributionVisible: !!comment && attributionMatches(comment) };
  }
  function rewrite(text, url, armed) {
    const match = text.match(MARKER);
    if (!match) return null;
    const [, id, nonce] = match;
    const entry = armed.get(nonce);
    armed.delete(nonce); // each marker can trigger at most one submission
    let body;
    try { body = JSON.parse(text); } catch (_) { throw new Error('INVALID_JSON'); }
    const route = new URL(url, location.href).pathname;
    const textField = route.endsWith('/update_comment_reply') ? 'replyText' : 'commentText';
    const full = typeof body[textField] === 'string' ? body[textField].trimEnd() : '';
    // The user may keep editing after staging. Remove exactly the armed token,
    // wherever it moved in the text; preserve all other text and mentions.
    const ownText = full.includes(match[0]) ? full.replace(match[0], '') : null;
    if (!/\/youtubei\/v1\/comment\/(create|update)_comment(_reply)?$/.test(route)
      || ownText === null || MARKER.test(ownText) || !entry || entry.activated === false || entry.id !== id || entry.expires < Date.now()) {
      const error = new Error('MARKER_BLOCKED'); error.nonce = nonce; throw error;
    }
    if (!ownText.includes('cyt ile gönderildi')) {
      const error = new Error('ATTRIBUTION_REQUIRED'); error.nonce = nonce; throw error;
    }
    if (globalThis.CanDemirAvailability?.gifPosting !== true) {
      const error = new Error(globalThis.CanDemirAvailability?.reason || 'HOOK_UNAVAILABLE'); error.nonce = nonce; throw error;
    }
    if (ownText.trim()) body[textField] = ownText; else delete body[textField];
    body.tenorId = id;
    return { payload: JSON.stringify(body), id, nonce };
  }
  globalThis.DesktopGifProtocol = { walk, inspect, evidence, rewrite, MARKER };
})();
