// Based on rayytor/desktop_gifs sw.js, GPL-3.0. Modified 2026-10-12.
// Background script: the only part that talks to tenor.com. It reads the result
// data Tenor embeds in its own pages and hands the content script a short list
// of { id, title, preview, width, height }.

const TENOR = 'https://tenor.com';
const TENOR_API = 'https://tenor.googleapis.com/v2';
let tenorKeys;
const CACHE_TTL_MS = 10 * 60 * 1000;
const MAX_RESULTS = 50;

// url -> { time, value }
const cache = new Map();
let youtubeTabId, navigationPort, navigationRetry, lastPublicTarget, lastSendReport;
function connectNavigation(refresh=false){
 if(typeof browser.runtime.connectNative!=='function')return;
 if(navigationPort&&!refresh)return;
 clearTimeout(navigationRetry);
 const previous=navigationPort;navigationPort=null;if(previous)try{previous.disconnect();}catch{}
 try{const port=browser.runtime.connectNative('desktopgifs');navigationPort=port;port.onDisconnect.addListener(()=>{if(navigationPort!==port)return;navigationPort=null;navigationRetry=setTimeout(connectNavigation,1500);});port.onMessage.addListener(async msg=>{
  if(msg?.type==='dismiss-picker'){try{await browser.tabs.sendMessage(youtubeTabId,{type:'dismiss-picker'});}catch{}return;}
  if(msg?.type==='recheck-public'){
   let target=lastPublicTarget;
   try{const url=new URL(msg.url);if(url.origin==='https://www.youtube.com'&&url.pathname==='/watch'&&url.searchParams.has('lc'))target={videoId:url.searchParams.get('v'),commentId:url.searchParams.get('lc'),tenorId:lastPublicTarget?.commentId===url.searchParams.get('lc')?lastPublicTarget.tenorId:'',editing:lastPublicTarget?.commentId===url.searchParams.get('lc')&&lastPublicTarget.editing===true};}catch{}
   if(!target){navigationPort?.postMessage({message:'Gönderilmiş yorumun bağlantısını (?v=…&lc=…) açın veya önce bir GIF yorumu gönderin.'});return;}
   const base=lastPublicTarget?.commentId===target.commentId&&lastSendReport?lastSendReport:{type:'diagnostic',http:0,status:'PUBLIC_READ_ONLY',commentId:target.commentId,nativeTapped:false};
   await browser.runtime.sendNativeMessage('desktopgifs',{...base,stage:'checking_public'}).catch(()=>null);
   const result=await safeVerifyPublic(target);
   // A pasted link after restart has no saved operation identity. Reading an
   // existing attachment cannot verify that this user's last edit saved it.
   const knownOperation=lastPublicTarget?.commentId===target.commentId&&lastPublicTarget?.videoId===target.videoId;
   const stage=knownOperation?CanDemirVerification.verdict(result,target.editing===true):'public_unknown';
   const status=stage==='gif_missing'?'PUBLIC_GIF_ATTACHMENT_MISSING':stage==='selected_gif_unverified'?'PUBLIC_SELECTED_GIF_UNVERIFIED':'PUBLIC_READ_ONLY';
   await browser.runtime.sendNativeMessage('desktopgifs',{...base,status,editing:target.editing===true,stage,
    publicCommentVerified:result.commentVisible,publicGifVerified:result.selectedAttachmentVisible,publicGifAttachmentVerified:result.gifAttachmentVisible,publicAttributionVerified:result.attributionVisible,
    verificationChecked:result.checked,verificationReason:result.reason||'',verificationRequests:result.requests||0,verificationReadHttp:result.readHttp||0}).catch(()=>null);
   return;
  }
  if(msg?.type!=='open-comments')return;
  navigationPort?.postMessage({message:'YouTube yorumları yükleniyor…'});
  try{const result=await browser.tabs.sendMessage(youtubeTabId,{type:'open-comments'});navigationPort?.postMessage({message:String(result?.message||'Yorum alanı açılamadı.').slice(0,180)});}catch{navigationPort?.postMessage({message:'YouTube videosunu açıp sayfanın yüklenmesini bekleyin.'});}
 });}catch{navigationRetry=setTimeout(connectNavigation,1500);}
}
connectNavigation();

browser.runtime.onMessage.addListener((msg, sender) => {
  if (sender.id !== browser.runtime.id || !/^https:\/\/(www|m)\.youtube\.com\//.test(sender.url || '')) return;
  if (['library-get','library-favorite','library-use'].includes(msg?.type)) return globalThis.CanDemirLibrary.handle(msg);
  if (['native-youtube-capabilities','native-youtube-open'].includes(msg?.type)) {
    if (typeof browser.runtime.sendNativeMessage !== 'function') return Promise.resolve({enabled:false,status:'NATIVE_HOST_UNAVAILABLE'});
    const request={type:msg.type};
    if(msg.type==='native-youtube-open'){
      if(!/^[A-Za-z0-9_-]{11}$/.test(msg.videoId||''))return Promise.resolve({enabled:true,opened:false,status:'VIDEO_REQUIRED'});
      request.videoId=msg.videoId;
    }
    return browser.runtime.sendNativeMessage('desktopgifs',request).catch(()=>({enabled:false,opened:false,status:'NATIVE_HOST_UNAVAILABLE'}));
  }
  if (msg?.type==='ui-state') return typeof browser.runtime.sendNativeMessage==='function' ? browser.runtime.sendNativeMessage('desktopgifs',{type:'ui-state',pickerOpen:msg.pickerOpen===true,draftOpen:msg.draftOpen===true,hideKeyboard:msg.hideKeyboard===true}).catch(()=>null) : Promise.resolve(null);
  if (msg.type === 'page-ready') { youtubeTabId=sender.tab?.id; connectNavigation(true); return Promise.resolve({ok:true}); }
  if (msg.type === 'verify') { lastPublicTarget={videoId:msg.videoId,commentId:msg.commentId,tenorId:msg.tenorId,editing:msg.editing===true};return safeVerifyPublic(lastPublicTarget); }
  if (msg.type === 'diagnostic') {
    const report = { type: 'diagnostic', stage: /^[a-z_]{1,60}$/.test(msg.stage||'')?msg.stage:'unknown', http: Math.min(599,Math.max(0,Math.trunc(Number(msg.http)||0))),
      status: /^[A-Z0-9_]{1,80}$/.test(msg.status||'')?msg.status:'UNKNOWN', transport: ['fetch', 'xhr'].includes(msg.transport) ? msg.transport : '',
      endpoint: /^\/youtubei\/v1\/(comment|backstage)\/[a-z_]+$/.test(msg.endpoint || '') ? msg.endpoint : '',
      nativeTapped: msg.nativeTapped === true, errorName: /^[A-Za-z]+$/.test(msg.errorName || '') ? msg.errorName.slice(0, 40) : '',
      commentId: /^[A-Za-z0-9_.-]{8,200}$/.test(msg.commentId||'')?msg.commentId:'', publicGifVerified: msg.publicGifVerified === true };
    report.publicCommentVerified = msg.publicCommentVerified === true;
    report.editing = msg.editing === true;
    report.publicGifAttachmentVerified = msg.publicGifAttachmentVerified === true;
    report.publicAttributionVerified = msg.publicAttributionVerified === true;
    report.verificationChecked = msg.verificationChecked === true;
    report.verificationReason = /^[A-Z_]{1,60}$/.test(msg.verificationReason||'')?msg.verificationReason:'';
    report.verificationRequests = Math.min(8,Math.max(0,Number(msg.verificationRequests)||0));
    report.verificationReadHttp=Math.min(599,Math.max(0,Number(msg.verificationReadHttp)||0));
    report.tenorId=/^\d{1,20}$/.test(msg.tenorId||'')?msg.tenorId:'';
    report.contentRating=/^[A-Z0-9-]{1,12}$/.test(msg.contentRating||'')?msg.contentRating:'';
    report.ratingChecked=msg.ratingChecked===true;
      report.pageVideoId=/^[A-Za-z0-9_-]{11}$/.test(msg.pageVideoId||'')?msg.pageVideoId:'';
      report.requestVideoId=/^[A-Za-z0-9_-]{11}$/.test(msg.requestVideoId||'')?msg.requestVideoId:'';
      report.parameterTargetKnown=msg.parameterTargetKnown===true;
    // Field names only; never serialize values, auth, opaque params or comments.
    report.schemaFields=typeof msg.schemaFields==='string'?msg.schemaFields.split(', ').slice(0,8).filter(p=>p==='[unrecognized-key]'||(/^(?:[A-Za-z][A-Za-z0-9_]{0,63}\.){0,5}[A-Za-z][A-Za-z0-9_]{0,63}$/.test(p)&&p.length<=180)).join(', '):'';
    report.attempts=Math.min(1,Math.max(0,Math.trunc(Number(msg.attempts)||0)));
    report.correlationId=/^[a-f0-9]{24}$/.test(msg.correlationId||'')?msg.correlationId:'';
    report.category=globalThis.CanDemirAvailability.category(report.status,report.http);
    report.recommendation=globalThis.CanDemirAvailability.recommendation(report.status,report.http);
    report.platform=typeof browser.runtime.connectNative==='function'?'ANDROID_GECKO':'DESKTOP_EXTENSION';
    report.appVersion=browser.runtime.getManifest?.().version || '';
    report.apiStatus=/^[A-Z_]{1,60}$/.test(msg.apiStatus||'')?msg.apiStatus:'';
    report.actionStatus=/^[A-Z_]{1,60}$/.test(msg.actionStatus||'')?msg.actionStatus:'';
    report.serverMessage=globalThis.CanDemirAvailability.safeMessage(msg.serverMessage||'');
    if(msg.commentId)lastSendReport=report;
    if(typeof browser.runtime.sendNativeMessage==='function')return browser.runtime.sendNativeMessage('desktopgifs', report).catch(() => null);
    // PC has no native host; keep one safe local report, never send telemetry.
    return browser.storage.local.set({lastDiagnostic:report}).then(()=>({ok:true}));
  }
  return handle(msg).then(gifs => ({ ok: true, gifs }), e => ({ ok: false, error: String(e.message || e) }));
});

async function handle(msg) {
  if (!msg || typeof msg !== 'object') throw new Error('Bad request.');
  if (msg.type === 'featured') return featured();
  if (msg.type === 'search' && typeof msg.query === 'string') return search(msg.query);
  if (msg.type === 'resolve' && typeof msg.input === 'string') return resolve(msg.input);
  if (msg.type === 'check' && /^\d{1,20}$/.test(msg.id || '')) return checkGif(msg.id);
  throw new Error('Bad request.');
}

async function fetchStore(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.time < CACHE_TTL_MS) return hit.value;
  const res = await fetch(url, { credentials: 'omit', redirect: 'follow', signal: AbortSignal.timeout(15000), referrerPolicy: 'no-referrer' });
  if (!res.ok) throw new Error(res.status === 404 ? 'Tenor could not find that GIF.' : `Tenor returned HTTP ${res.status}.`);
  if (new URL(res.url).origin !== TENOR) throw new Error('Tenor redirected somewhere unexpected.');
  const html = await res.text();
  if (html.length > 3000000) throw new Error('Tenor yanıtı çok büyük.');
  const settings = html.match(/<script id="data" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/);
  try {
    const data = JSON.parse(atob(settings[1].trim()));
    if (typeof data.API_V2_KEY === 'string' && typeof data.API_V2_CLIENT_KEY === 'string') tenorKeys={key:data.API_V2_KEY,client_key:data.API_V2_CLIENT_KEY};
  } catch (_) { /* A page list remains usable if public settings are absent. */ }
  const m = html.match(/<script id="store-cache" type="text\/x-cache"[^>]*>([\s\S]*?)<\/script>/);
  if (!m) throw new Error('Tenor changed its page format; search is unavailable.');
  const value = JSON.parse(m[1]);
  cache.set(url, { time: Date.now(), value });
  if (cache.size > 40) cache.delete(cache.keys().next().value);
  return value;
}

async function fetchTenorApi(path, params) {
  if (!tenorKeys) await fetchStore(TENOR + '/');
  if (!tenorKeys) throw new Error('GIF içerik derecesi şu anda kontrol edilemiyor.');
  const query = new URLSearchParams({...tenorKeys,contentfilter:'high',media_filter:'tinygif,tinywebp,gif',...params});
  const res = await fetch(TENOR_API + path + '?' + query, {credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(5000)});
  if (!res.ok) { if ([400,401,403].includes(res.status)) {tenorKeys=null;cache.delete(TENOR+'/');}throw new Error('Tenor GIF kontrolüne yanıt vermedi (HTTP ' + res.status + ').'); }
  const text=await res.text();if(text.length>1000000)throw new Error('Tenor kontrol yanıtı çok büyük.');
  const results=JSON.parse(text).results;if(!Array.isArray(results))throw new Error('Tenor kontrol yanıtı okunamadı.');return results;
}

const ratedG = r => typeof r?.content_rating !== 'string' || r.content_rating === 'G';
async function checkGif(id) {
  const results=await fetchTenorApi('/posts',{ids:id,contentfilter:'off'});
  const current=results.find(r=>String(r.id)===id);
  if(current)return[toGif(current)].filter(Boolean);
  // Older Tenor links/favorites can name an alias; the page supplies the
  // canonical ID. Never silently replace the selected animation with another.
  const store=await fetchStore(TENOR+'/view/x-gif-'+id);
  const gifs=toGifs(Object.values(store.gifs?.byId||{}).flatMap(e=>e?.results||[]).slice(0,1));
  if(!gifs.length)return[];
  const canonical=await fetchTenorApi('/posts',{ids:gifs[0].id,contentfilter:'off'});
  const post=canonical.find(r=>String(r.id)===gifs[0].id);return post?[toGif(post)].filter(Boolean):[];
}

// Read-only, cookie-free confirmation. Never creates a second comment or guesses
// that an accepted response means the GIF is publicly visible.
function embeddedJson(html, pattern) {
  const match = pattern.exec(html);
  if (!match) return null;
  const start = html.indexOf('{', match.index + match[0].length);
  if (start < 0) return null;
  let depth = 0, inString = false, escaped = false;
  for (let i = start; i < html.length; i++) {
    const c = html[i];
    if (inString) {
      if (escaped) escaped = false; else if (c === '\\') escaped = true; else if (c === '"') inString = false;
    } else if (c === '"') inString = true;
    else if (c === '{') depth++;
    else if (c === '}' && --depth === 0) {
      try { return JSON.parse(html.slice(start, i + 1)); } catch (_) { return null; }
    }
  }
  return null;
}
function commentContinuations(json) {
  const tokens = new Set();
  const collect = value => DesktopGifProtocol.walk(value, node => {
    const token = node.continuationCommand && node.continuationCommand.token;
    if (typeof token === 'string' && token.length < 20000) tokens.add(token);
  });
  DesktopGifProtocol.walk(json, node => {
    if (node.itemSectionRenderer && /comment/i.test(node.itemSectionRenderer.sectionIdentifier || node.itemSectionRenderer.targetId || '')) collect(node);
    if (node.commentsHeaderRenderer || node.commentsSectionRenderer || node.commentsEntryPointHeaderRenderer) collect(node);
    if ((node.appendContinuationItemsAction || node.reloadContinuationItemsCommand)) {
      const action = node.appendContinuationItemsAction || node.reloadContinuationItemsCommand;
      if (/comment/i.test(action.targetId || '')) collect(action);
    }
  });
  return [...tokens];
}
async function safeVerifyPublic(msg){
 try{return await verifyPublic(msg);}catch(error){return{commentVisible:false,gifVisible:false,gifAttachmentVisible:false,attributionVisible:false,checked:false,
 reason:/^[A-Z_]{1,60}$/.test(error.message)?error.message:/(Timeout|Abort)/.test(error.name)?'PUBLIC_TIMEOUT':'PUBLIC_NETWORK_ERROR'};}
}
async function publicRead(request){
 let timer;const raw=await Promise.race([browser.runtime.sendNativeMessage('desktopgifs',{type:'public-read',...request}),new Promise(resolve=>{timer=setTimeout(()=>resolve({error:'PUBLIC_TIMEOUT'}),request.timeoutMs+2000);})]).finally(()=>clearTimeout(timer));
 const response=typeof raw==='string'?JSON.parse(raw):raw;
 if(!response||response.error)throw new Error(response?.error||'PUBLIC_NETWORK_ERROR');
 return{ok:response.http>=200&&response.http<300,status:response.http,text:async()=>response.text,json:async()=>JSON.parse(response.text)};
}
async function verifyPublic(msg) {
  if (!/^[A-Za-z0-9_-]{11}$/.test(msg.videoId) || !/^[A-Za-z0-9_.-]{8,200}$/.test(msg.commentId) || !(msg.tenorId===''||/^\d{1,20}$/.test(msg.tenorId))) {
    throw new Error('INVALID_PUBLIC_TARGET');
  }
  const deadline=Date.now()+25000;
  const res=await publicRead({kind:'watch',videoId:msg.videoId,commentId:msg.commentId,timeoutMs:7000});
  if (!res.ok) return{commentVisible:false,gifVisible:false,gifAttachmentVisible:false,attributionVisible:false,checked:false,reason:'PUBLIC_READ_UNAVAILABLE',requests:1,readHttp:res.status};
  const html = await res.text();
  const initial = embeddedJson(html, /(?:var\s+)?ytInitialData\s*=\s*/);
  if (!initial) throw new Error('PUBLIC_PAGE_DATA_MISSING');
  let result = DesktopGifProtocol.evidence(initial, msg.commentId, msg.tenorId);
  const verified = value => CanDemirVerification.verdict({...value,checked:true},msg.editing===true)==='verified_public';
  if (verified(result)) return { ...result, checked: true, reason:'PUBLIC_VERIFIED',requests:1,readHttp:200 };
  let context, publicConfig;
  const configs = /ytcfg\.set\(\s*/g;
  let match;
  while ((match = configs.exec(html))) {
    const config = embeddedJson(html.slice(match.index), /^ytcfg\.set\(\s*/);
    if (config && config.INNERTUBE_CONTEXT) { context = config.INNERTUBE_CONTEXT; publicConfig=config; break; }
  }
  if (!context) return { ...result, checked: false, reason:'PUBLIC_CONTEXT_MISSING',requests:1 };
  // Strip any user-specific configuration. Context came from an anonymous page.
  const publicContext = { client: context.client };
  const queue = commentContinuations(initial), seen = new Set();let requests=1;
  if(!queue.length)return{...result,checked:false,reason:'PUBLIC_CONTINUATION_MISSING',requests};
  for (let i = 0; queue.length && i < 4; i++) {
    const continuation = queue.shift();
    if (seen.has(continuation)) continue;
    seen.add(continuation);
    if(Date.now()>deadline-500)return{...result,checked:false,reason:'PUBLIC_TIMEOUT',requests};
    const response=await publicRead({kind:'next',payload:{context:publicContext,continuation},apiKey:publicConfig.INNERTUBE_API_KEY||'',
      clientName:String(publicConfig.INNERTUBE_CONTEXT_CLIENT_NAME||'1'),timeoutMs:Math.min(7000,deadline-Date.now())});
    requests++;
    if (!response.ok) return{...result,checked:false,reason:'PUBLIC_COMMENTS_HTTP_ERROR',requests,readHttp:response.status};
    const json = await response.json();
    const evidence = DesktopGifProtocol.evidence(json, msg.commentId, msg.tenorId);
    result = { commentVisible: result.commentVisible || evidence.commentVisible, gifVisible: result.gifVisible || evidence.gifVisible,
      gifAttachmentVisible: result.gifAttachmentVisible || evidence.gifAttachmentVisible, selectedAttachmentVisible: result.selectedAttachmentVisible || evidence.selectedAttachmentVisible,
      attributionVisible: result.attributionVisible || evidence.attributionVisible };
    if (verified(result)) break;
    queue.push(...commentContinuations(json).filter(token => !seen.has(token)));
  }
  return { ...result, checked: true, reason:verified(result)?'PUBLIC_VERIFIED':result.commentVisible?'PUBLIC_GIF_OR_ATTRIBUTION_UNVERIFIED':'PUBLIC_COMMENT_NOT_FOUND',requests,readHttp:200 };
}

function toGif(r) {
  if (!r || !/^\d{1,20}$/.test(String(r.id)) || !r.media_formats) return null;
  const flags = r.flags || [];
  if (flags.includes('sticker') || flags.includes('static')) return null;
  const f = r.media_formats.tinygif || r.media_formats.tinywebp || r.media_formats.gif;
  if (!f || typeof f.url !== 'string' || !/^https:\/\/media\d*\.tenor\.com\//.test(f.url)) return null;
  const dims = Array.isArray(f.dims) ? f.dims : [];
  return {
    id: String(r.id),
    title: String(r.content_description || r.h1_title || 'GIF').slice(0, 200),
    preview: f.url,
    width: dims[0] || 220,
    height: dims[1] || 124,
    contentRating: typeof r.content_rating === 'string' ? r.content_rating : null,
  };
}

const toGifs = (results) => (results || []).map(toGif).filter(Boolean).slice(0, MAX_RESULTS);

async function featured() {
  try { return toGifs((await fetchTenorApi('/featured',{limit:MAX_RESULTS})).filter(ratedG)); } catch (_) { /* Preserve page search if the API is unavailable. */ }
  const store = await fetchStore(`${TENOR}/`);
  return toGifs(store.gifs && store.gifs.featured && store.gifs.featured.results);
}

async function search(query) {
  const slug = query.trim().toLowerCase().split(/\s+/).filter(Boolean).map(encodeURIComponent).join('-');
  if (!slug) return featured();
  try { return toGifs((await fetchTenorApi('/search',{q:query.trim(),limit:MAX_RESULTS})).filter(ratedG)); } catch (_) { /* Ratings will be checked when staging. */ }
  const store = await fetchStore(`${TENOR}/search/${slug}-gifs`);
  const searches = Object.values((store.universal && store.universal.search) || {});
  return toGifs(searches[0] && searches[0].results);
}

// Accepts a tenor.com page link, a tenor.com short link, a media.tenor.com
// file link or a bare numeric ID, and returns the one GIF it points at.
async function resolve(input) {
  const text = input.trim();
  let pageUrl;
  if (/^\d{1,20}$/.test(text)) {
    pageUrl = `${TENOR}/view/x-gif-${text}`;
  } else {
    let url;
    try { url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`); } catch (e) { throw new Error('That is not a Tenor link.'); }
    if (/^media\d*\.tenor\.com$/.test(url.hostname)) {
      // media IDs are the base64 of the 64-bit GIF ID followed by a format code
      const mediaId = url.pathname.split('/').filter(Boolean).find((p) => /^[A-Za-z0-9_-]{16}$/.test(p));
      if (!mediaId) throw new Error('That is not a Tenor GIF link.');
      pageUrl = `${TENOR}/view/x-gif-${decodeMediaId(mediaId)}`;
    } else if (url.hostname === 'tenor.com' || url.hostname === 'www.tenor.com') {
      pageUrl = `${TENOR}${url.pathname}`;
    } else {
      throw new Error('That is not a Tenor link.');
    }
  }
  const store = await fetchStore(pageUrl);
  const entries = Object.values((store.gifs && store.gifs.byId) || {});
  const gifs = toGifs(entries.flatMap((e) => (e && e.results) || []).slice(0, 1));
  if (!gifs.length) throw new Error('That link does not point at a GIF.');
  return gifs;
}

function decodeMediaId(mediaId) {
  const bin = atob(mediaId.slice(0, 11).replace(/-/g, '+').replace(/_/g, '/') + '=');
  let n = 0n;
  for (let i = 0; i < 8; i++) n = (n << 8n) | BigInt(bin.charCodeAt(i));
  return n.toString();
}
