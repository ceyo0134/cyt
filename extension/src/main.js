// Based on rayytor/desktop_gifs main.js (GPL-3.0), modified 2026-10-12.
// Runs before YouTube. YouTube supplies its own auth, context and attestation.
(() => {
  if (window.__desktopGifsHook) return;
  window.__desktopGifsHook = true;
  const protocol = globalThis.DesktopGifProtocol;
  const armed = new Map();
  const toContent = msg => window.postMessage({ gcfy: 'to-content', ...msg }, location.origin);
  const watched = raw => {
    try { const url = new URL(raw, location.href); return url.origin === location.origin && /^\/youtubei\/v1\/(comment|backstage)\//.test(url.pathname); }
    catch (_) { return false; }
  };
  function activate(nonce) { const entry = armed.get(nonce); if (entry) entry.activated = true; }
  if (typeof document !== 'undefined') document.addEventListener('desktop-gifs-submit-intent', e => {
    if (typeof e.detail === 'string') activate(e.detail);
  });
  window.addEventListener('message', e => {
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.gcfy !== 'to-main') return;
    const msg = e.data;
    for (const [nonce, entry] of armed) if (entry.expires < Date.now()) armed.delete(nonce);
    if (msg.type === 'arm' && /^\d{1,20}$/.test(msg.id) && /^[a-z0-9]{8,32}$/.test(msg.nonce)) {
      if (globalThis.CanDemirAvailability?.gifPosting !== true) {
        toContent({ type:'result', nonce:msg.nonce, state:'blocked', status:globalThis.CanDemirAvailability?.reason || 'HOOK_UNAVAILABLE', http:0, attempts:0 });
        return;
      }
      armed.set(msg.nonce, { id: msg.id, activated: false, ratedG: msg.ratedG === true,
        expires: Date.now() + 180000 });
      toContent({ type: 'armed', nonce: msg.nonce });
    } else if (msg.type === 'activate') activate(msg.nonce);
    else if (msg.type === 'disarm') armed.delete(msg.nonce);
  });
  function unreadable() {
    // Fail closed while a GIF is armed: never publish a marker as plain text.
    for (const [nonce] of armed) toContent({ type: 'result', nonce, state: 'blocked', status: 'BODY_UNREADABLE', http: 0 });
    armed.clear();
    throw new TypeError('GIF request body unavailable; submission blocked');
  }
  function rewrite(text, url) {
    try {
      const match = text.match(protocol.MARKER), entry = match && armed.get(match[2]);
      const info = protocol.rewrite(text, url, armed);
      if (info) info.ratedG = entry?.ratedG === true;
      if (!info && /\/comment\/(create|update)_comment(_reply)?$/.test(new URL(url, location.href).pathname)) {
        // A user activated the chosen editor, but YouTube serialized stale text.
        // Do not silently publish a text-only comment instead of the selected GIF.
        for (const [nonce, entry] of armed) if (entry.activated) {
          armed.delete(nonce);
          toContent({ type: 'result', nonce, state: 'blocked', status: 'EDITOR_STATE_NOT_SERIALIZED', http: 0 });
          throw new TypeError('Prepared GIF missing from YouTube editor state');
        }
      }
      return info;
    }
    catch (error) {
      const nonce = error.nonce || (text.match(protocol.MARKER) || [])[2];
      if (nonce) toContent({ type: 'result', nonce, state: 'blocked', status: error.message, http: 0 });
      throw new TypeError('GIF marker blocked');
    }
  }
  async function readResult(response, info) {
    let json;
    try { json = await response.clone().json(); } catch (_) { json = null; }
    return { json, verdict: protocol.inspect(json, response.status, info.id) };
  }
  const originalFetch = window.fetch.bind(window);
  window.fetch = function(input, init) {
    const url = typeof input === 'string' ? input : input instanceof Request ? input.url : String(input);
    if (!watched(url)) return originalFetch.apply(this, arguments);
    return handleFetch(input, init, url, this);
  };
  async function handleFetch(input, init, url, receiver) {
    let request, text;
    try {
      // Request + init overrides must be applied before reading headers/body.
      request = new Request(input instanceof Request ? input.clone() : new URL(url, location.href), init);
      const bytes = await request.clone().arrayBuffer();
      text = request.headers.get('content-encoding') === 'gzip'
        ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
        : new TextDecoder().decode(bytes);
    } catch (_) {
      if (armed.size) return unreadable();
      return originalFetch.call(receiver, input, init);
    }
    const info = rewrite(text, url);
    if (!info) return originalFetch.call(receiver, input, init);
    const requestDetails={transport:'fetch',endpoint:new URL(url,location.href).pathname};
    const headers = new Headers(request.headers);
    headers.delete('content-encoding');
    headers.delete('content-length');
    let wireRequest;
    if (globalThis.CanDemirAvailability?.binaryTest) {
      try {
        const key='cdg-binary-test-20261016-used';
        {const last=Number(localStorage.getItem(key))||0;if(Date.now()-last<30000)throw Error('BINARY_COOLDOWN');}
        const wire=globalThis.CanDemirBinaryTest.prepare(info.payload,request.url,headers,location.href);
        Object.assign(requestDetails,{pageVideoId:wire.pageVideoId,requestVideoId:wire.requestVideoId,parameterTargetKnown:wire.parameterTargetKnown});
        wireRequest=new Request(wire.url,new Request(request,{body:wire.body,headers:wire.headers}));
        // This installation's experiment cannot automatically fall back to
        // JSON, replay an uncertain request, or test another GIF after failure.
        localStorage.setItem(key,String(Date.now()));
      } catch(error) {
        const code=/^(BINARY_[A-Z_]+|ATTRIBUTION_REQUIRED)$/.test(error.message)?error.message:'BINARY_PREFLIGHT';
        toContent({type:'result',nonce:info.nonce,...requestDetails,state:'blocked',status:code,http:0,attempts:0,
          pageVideoId:error.pageVideoId||'',requestVideoId:error.requestVideoId||'',parameterTargetKnown:error.parameterTargetKnown===true,
          schemaFields:typeof error.schemaFields==='string'?error.schemaFields.slice(0,1500):''});
        // Resolve the caller with an explicitly LOCAL failure so YouTube can
        // leave its loading state. This is not an upstream HTTP response: the
        // diagnostic stays HTTP 0 / attempts 0 and no success is synthesized.
        return new Response(JSON.stringify({error:{code:412,status:'FAILED_PRECONDITION',message:'cyt: İstek yerel kontrolde durduruldu; YouTube’a gönderilmedi.'},canDemirLocalBlock:code}),
          {status:412,headers:{'content-type':'application/json','x-can-demir-local-block':'1'}});
      }
    }
    let response, result, attempts = 0;
    try {
      if (request.signal.aborted) throw new DOMException('Request aborted','AbortError');
      attempts = 1;
      toContent({type:'seen',nonce:info.nonce,...requestDetails});
      response = await originalFetch.call(receiver, wireRequest || new Request(request, { body: info.payload, headers }));
      result = await readResult(response, info);
    }
    catch (error) {
      // Server may have received it. Do not claim nothing was published.
      toContent({ type: 'result', nonce: info.nonce, state: 'unknown', status: request.signal.aborted ? 'FETCH_ABORTED' : 'FETCH_NETWORK_ERROR', errorName: String(error.name || 'Error').slice(0, 40), attempts, http: 0 });
      throw error;
    }
    toContent({ type:'result', nonce:info.nonce, ...result.verdict, attempts });
    return response;
  }

  // Some YouTube variants send comments via XMLHttpRequest rather than fetch.
  const xp = XMLHttpRequest.prototype;
  const originalOpen = xp.open, originalHeader = xp.setRequestHeader, originalSend = xp.send;
  const requests = new WeakMap();
  xp.open = function(method, url, async = true, ...rest) {
    requests.set(this, { url: String(url), watched: watched(url), headers: new Headers(), async });
    return originalOpen.call(this, method, url, async, ...rest);
  };
  xp.setRequestHeader = function(name, value) {
    const entry = requests.get(this);
    if (entry && entry.watched) { entry.headers.append(name, value); return; }
    return originalHeader.call(this, name, value);
  };
  xp.send = function(body) {
    const entry = requests.get(this);
    if (!entry || !entry.watched) return originalSend.call(this, body);
    const xhr = this;
    const transmit = (payload, headers, info) => {
      if(info && globalThis.CanDemirAvailability?.binaryTest) {
        toContent({type:'result',nonce:info.nonce,state:'blocked',status:'BINARY_FETCH_ONLY',http:0,attempts:0});
        throw new TypeError('BINARY_FETCH_ONLY');
      }
      try { for (const [name, value] of headers) originalHeader.call(xhr, name, value); }
      catch (error) {
        if (info) toContent({ type: 'result', nonce: info.nonce, state: 'blocked', status: 'XHR_HEADERS_ERROR', errorName: String(error.name || 'Error').slice(0, 40), http: 0 });
        throw error;
      }
      if (info) {
        toContent({ type: 'seen', nonce: info.nonce, transport: 'xhr', endpoint: new URL(entry.url, location.href).pathname });
        let failure = 'NO_HTTP_RESPONSE';
        for (const event of ['error', 'timeout', 'abort']) xhr.addEventListener(event, () => { failure = 'XHR_' + event.toUpperCase(); }, { once: true });
        xhr.addEventListener('loadend', () => {
          let json = null;
          try { json = xhr.responseType === 'json' ? xhr.response : JSON.parse(xhr.responseText); } catch (_) { /* unknown */ }
          const result = protocol.inspect(json, xhr.status, info.id);
          if (!xhr.status) result.status = failure;
          toContent({ type: 'result', nonce: info.nonce, ...result });
        }, { once: true });
      }
      try { originalSend.call(xhr, payload); }
      catch (error) {
        if (info) toContent({ type: 'result', nonce: info.nonce, state: 'unknown', status: 'XHR_SEND_ERROR', errorName: String(error.name || 'Error').slice(0, 40), http: 0 });
        throw error;
      }
    };
    if (typeof body === 'string' && entry.headers.get('content-encoding') !== 'gzip') {
      const info = rewrite(body, entry.url);
      transmit(info ? info.payload : body, entry.headers, info);
      return;
    }
    // Even a disarmed/expired binary marker must not pass through unchanged.
    if (!entry.async) return unreadable();
    (async () => {
      try {
        const bytes = await new Response(body).arrayBuffer();
        const text = entry.headers.get('content-encoding') === 'gzip'
          ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
          : new TextDecoder().decode(bytes);
        const info = rewrite(text, entry.url);
        if (info) { entry.headers.delete('content-encoding'); entry.headers.delete('content-length'); }
        transmit(info ? info.payload : body, entry.headers, info);
      } catch (_) {
        if (armed.size) { try { unreadable(); } catch (_) { /* already reported */ } }
        xhr.abort();
      }
    })();
  };
})();
