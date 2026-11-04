// Android adaptation of rayytor/desktop_gifs content.js. GPL-3.0, 2026-10-12.
(() => {
  const boxScope = 'ytd-comment-simplebox-renderer, ytd-comment-thread-renderer, ytd-comment-dialog-renderer, ytd-comment-reply-dialog-renderer';
  const callbacks = new Map();
  const REQUIRED_ATTRIBUTION = 'cyt ile gönderildi';
  const availability = globalThis.CanDemirAvailability;
  const verificationPolicy = globalThis.CanDemirVerification;
  const picker = { open: false, busy: false, uncertain: false, selected: null, pending: null, seq: 0, box: null };
  let lastPickerVisible=false,lastDraftVisible=false;
  const libraryState={favorites:[],recent:[]};
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
  browser.runtime.sendMessage({type:'page-ready'}).catch(()=>null);
  let commentsOpening;
  async function openShortsComments(){
    for(let i=0;i<40&&location.pathname.startsWith('/shorts/');i++){
      const shorts=document.querySelector('ytd-shorts');
      const candidates=shorts?[...shorts.querySelectorAll('#comments-button button, #comments-button, button[aria-label]')]:[];
      const button=candidates.find(el=>{
        if(el.closest('ytd-commentbox, ytd-comment-thread-renderer, [role="dialog"], tp-yt-paper-dialog')||el.disabled)return false;
        const r=el.getBoundingClientRect(),label=el.getAttribute('aria-label')||el.closest('#comments-button')?.getAttribute('aria-label')||'';
        if(/yorum\s+(yap|gönder)|post\s+(a\s+)?comment|submit/i.test(label))return false;
        return r.width>0&&r.height>0&&r.top>=-48&&r.bottom<=innerHeight+48&&(el.id==='comments-button'||el.closest('#comments-button')||/\b(comments?|yorum)/i.test(label));
      });
      if(button){button.click();return{message:'YouTube yorum alanı açılıyor…'};}
      await sleep(150);
    }
    return{message:'Shorts yorum simgesi bulunamadı. Video yüklenince tekrar deneyin veya YouTube’un yorum simgesine dokunun.'};
  }
  const visible = el => !!el?.isConnected && el.getBoundingClientRect().width>0 && el.getBoundingClientRect().height>0;
  async function openWatchComments(){
    const target=videoId(),watch=document.querySelector('ytd-watch-flexy:not([hidden])');
    if(!target||!watch)return{message:'Önce bir YouTube videosu açın.'};
    const sameVideo=()=>watch.isConnected&&videoId()===target&&location.pathname==='/watch';
    let comments;
    for(let i=0;i<60&&sameVideo();i++){
      comments=watch.querySelector('ytd-comments#comments, #comments');
      if(visible(comments)&&!comments.hidden)break;
      await sleep(200);
    }
    if(!sameVideo())return{message:'Video değişti. Yeni videoda Yorumlar düğmesine dokunun.'};
    if(!visible(comments)||comments.hidden)return{message:'Bu videonun yorum alanı yüklenemedi veya yorumlar kapalı.'};
    comments.scrollIntoView({block:'start',behavior:'auto'});
    let simple;
    for(let i=0;i<60&&sameVideo();i++){
      const box=comments.querySelector('ytd-commentbox');
      if(visible(box)&&visible(box.querySelector('#contenteditable-root'))){scan();return{message:'Yorum kutusu hazır • GIF düğmesine dokunun'};}
      simple=comments.querySelector('ytd-comment-simplebox-renderer #placeholder-area, ytd-comment-simplebox-renderer #simplebox-placeholder');
      if(visible(simple))break;
      await sleep(200);
    }
    if(!sameVideo())return{message:'Video değişti. Yeni videoda Yorumlar düğmesine dokunun.'};
    if(visible(simple)){
      simple.click();
      for(let i=0;i<20&&sameVideo();i++){
        const box=comments.querySelector('ytd-commentbox');
        if(visible(box)&&visible(box.querySelector('#contenteditable-root'))){scan();return{message:'Yorum kutusu hazır • GIF düğmesine dokunun'};}
        await sleep(100);
      }
    }
    return{message:'Yorum alanına geçildi. Giriş yaptıktan sonra Yorum ekleyin kutusuna dokunun.'};
  }
  browser.runtime.onMessage.addListener((msg,sender)=>{
    if(sender.id!==browser.runtime.id)return;
    if(msg?.type==='dismiss-picker'){if(picker.open&&!picker.busy)closePicker();return Promise.resolve({closed:!picker.open});}
    if(msg?.type!=='open-comments')return;
    const result=async()=>{
      if(location.pathname.startsWith('/shorts/')){
        if(!commentsOpening)commentsOpening=openShortsComments().finally(()=>{commentsOpening=null;});
        return commentsOpening;
      }
      if(!commentsOpening)commentsOpening=openWatchComments().finally(()=>{commentsOpening=null;});
      return commentsOpening;
    };return result();
  });
  const toMain = msg => window.postMessage({ gcfy: 'to-main', ...msg }, location.origin);
  window.addEventListener('message', e => {
    if (e.source === window && e.origin === location.origin && e.data?.gcfy === 'edit-status') {
      const tx = picker.pending;
      if (tx?.done) {
        // The old composer may be reused for Save. Release its one-shot guard
        // without deleting text from the newly opened edit composer.
        clearTimeout(tx.timer); callbacks.delete(tx.nonce);
        toMain({type:'disarm', nonce:tx.nonce});
        tx.submit?.removeEventListener('click', tx.onClick, true);
        tx.box?.removeEventListener('input', tx.onInput);
        tx.submit?.classList.remove('gcfy-native-submit'); tx.card?.remove();
        tx.cancelled = true; picker.pending = null; syncPickerVisibility();
      }
      return;
    }
    if (e.source !== window || e.origin !== location.origin || !e.data || e.data.gcfy !== 'to-content') return;
    const cb = callbacks.get(e.data.nonce); if (cb) cb(e.data);
  });
  function element(tag, text, cls) {
    const el = document.createElement(tag); if (text) el.textContent = text; if (cls) el.className = cls; return el;
  }
  function refreshViewport() {
    const vp = window.visualViewport;
    const root = document.documentElement;
    if (!root) return;
    root.style.setProperty('--gcfy-vp-height', (vp ? vp.height : innerHeight) + 'px');
    root.style.setProperty('--gcfy-vp-width', (vp ? vp.width : innerWidth) + 'px');
    root.style.setProperty('--gcfy-vp-top', (vp ? vp.offsetTop : 0) + 'px');
    root.style.setProperty('--gcfy-vp-left', (vp ? vp.offsetLeft : 0) + 'px');
  }
  function adaptCommentBox(box) {
    if (globalThis.CanDemirPlatform === 'DESKTOP') return;
    box.classList.add('gcfy-commentbox');
    if (!location.pathname.startsWith('/shorts/')) return;
    let dialog = box.closest('tp-yt-paper-dialog') || box.closest('[role="dialog"]');
    if (!dialog) {
      const panel = box.closest('ytd-engagement-panel-section-list-renderer');
      if (panel && panel.getBoundingClientRect().height > 0 && getComputedStyle(panel).display !== 'none') dialog = panel;
    }
    if (!dialog || dialog.id === 'desktop-gifs-mobile') return;
    dialog.classList.add('gcfy-comment-dialog');
    // Preserve YouTube's header and put its comment list/editor in a scroller.
    const content = dialog.querySelector('ytd-engagement-panel-section-list-renderer > #content')
      || dialog.querySelector(':scope > #content');
    if (content) content.classList.add('gcfy-comment-scroll');
  }
  function revealSubmit(tx) {
    if (!tx || tx.cancelled || tx.clicked || !tx.submit?.isConnected) return;
    adaptCommentBox(tx.box);
    tx.submit.classList.add('gcfy-native-submit');
    tx.submit.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' });
  }
  function scan() {
    syncPickerVisibility();
    refreshViewport();
    if (document.head && globalThis.CanDemirPlatform !== 'DESKTOP') {
      let viewport = document.querySelector('meta[name="viewport"]');
      if (!viewport) { viewport = document.createElement('meta'); viewport.name = 'viewport'; document.head.append(viewport); }
      if (viewport.content !== 'width=device-width, initial-scale=1') viewport.content = 'width=device-width, initial-scale=1';
    }
    const tx = picker.pending;
    if (tx && !tx.cancelled && !tx.clicked) {
      if (!tx.box.isConnected) cancelDraft(tx);
      else {
        const editor = tx.box.querySelector('#contenteditable-root, [contenteditable="true"], textarea');
        if (editor && editor !== tx.editor) {
          if (readEditor(editor).includes(tx.marker)) tx.editor = editor;
          else cancelDraft(tx);
        }
        if (!tx.cancelled) protectSignature(tx);
        const submit = findSubmit(tx.box);
        if (!tx.cancelled && submit && submit !== tx.submit && tx.onClick) {
          tx.submit.removeEventListener('click', tx.onClick, true); tx.submit = submit;
          tx.submit.addEventListener('click', tx.onClick, true);
          revealSubmit(tx);
        }
        const footer = tx.box.querySelector('#footer');
        if (!tx.cancelled && tx.card && !tx.card.isConnected && footer) footer.before(tx.card);
      }
    }
    for (const box of document.querySelectorAll('ytd-commentbox')) {
      adaptCommentBox(box);
      if (box.querySelector('.gcfy-btn') || !box.closest(boxScope) || box.closest('ytd-backstage-post-dialog-renderer')) continue;
      const footer = box.querySelector('#footer'); if (!footer) continue;
      const btn = element('button', 'GIF', 'gcfy-btn'); btn.type = 'button';
      btn.setAttribute('aria-label', 'Tenor GIF seç'); btn.setAttribute('aria-haspopup', 'dialog');
      btn.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openPicker(box); });
      const emoji = footer.querySelector('#emoji-button'); if (emoji) emoji.after(btn); else footer.prepend(btn);
    }
  }
  let scanQueued = false;
  const observe = () => {
    if (!document.documentElement) { setTimeout(observe, 0); return; }
    new MutationObserver(() => {
      if (!scanQueued) { scanQueued = true; requestAnimationFrame(() => { scanQueued = false; scan(); }); }
    }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden','aria-hidden','visibility','opened'] });
    scan();
  };
  observe();

  function syncPickerVisibility(){
    const open=!!(picker.open&&picker.host?.isConnected);
    const draft=!!(picker.pending&&!picker.pending.cancelled&&!picker.pending.clicked&&picker.pending.card?.isConnected);
    if(open===lastPickerVisible&&draft===lastDraftVisible)return;lastPickerVisible=open;lastDraftVisible=draft;
    browser.runtime.sendMessage({type:'ui-state',pickerOpen:open,draftOpen:draft,hideKeyboard:open||draft}).catch(()=>null);
  }
  function buildPicker() {
    const host=element('div');host.id='desktop-gifs-mobile';host.style.cssText='position:fixed;z-index:2147483647;left:0;top:0;width:100%;';
    const root=host.attachShadow({mode:'open'}),style=element('style');style.textContent=`:host{all:initial;--cd-bg:#101319;--cd-surface:#1b202a;--cd-card:#252c38;--cd-gold:#e8b65b;--cd-text:#f5f6f8;--cd-muted:#aab2bf;--cd-line:#3b4554;font:16px/1.45 system-ui,-apple-system,Arial,sans-serif;color:var(--cd-text);color-scheme:dark}
*{box-sizing:border-box}button,input{font:inherit}button{cursor:pointer;touch-action:manipulation;color:inherit}button:disabled{opacity:.42;cursor:default}[hidden]{display:none!important}:focus-visible{outline:3px solid var(--cd-gold);outline-offset:2px}.backdrop{position:absolute;inset:0;background:#000a}
.panel{position:absolute;left:0;bottom:0;width:100%;max-height:100%;display:flex;flex-direction:column;background:var(--cd-surface);border:1px solid var(--cd-line);border-radius:26px 26px 0 0;box-shadow:0 -12px 48px #0008;overflow:hidden}.handle{height:12px;flex-shrink:0;display:grid;place-items:center}.handle::after{content:"";width:34px;height:4px;background:#596271;border-radius:4px}.header{display:flex;align-items:center;gap:12px;padding:0 16px 4px;flex-shrink:0}.identity{flex:1;min-width:0}.identity strong{display:block;font-size:18px;letter-spacing:-.02em}.source{font-size:11px;color:var(--cd-muted)}.close{border:0;background:transparent;border-radius:14px;width:48px;height:48px;font-size:28px;flex-shrink:0}.close:hover,.search button:hover{background:var(--cd-card)}
.search{display:flex;gap:8px;padding:4px 16px 10px;flex-shrink:0}.search input{flex:1;min-width:0;height:50px;border:1px solid var(--cd-line);border-radius:15px;background:var(--cd-bg);color:var(--cd-text);padding:0 14px;font-size:16px}.search input:focus{border-color:var(--cd-gold);outline:none;box-shadow:0 0 0 2px #e8b65b22}.search button{min-width:54px;min-height:48px;padding:8px 12px;border:1px solid var(--cd-line);border-radius:15px;background:var(--cd-card);font-size:14px;font-weight:650}
.tabs{display:flex;gap:4px;padding:0 12px 4px;flex-shrink:0}.tabs button{flex:1;min-width:0;min-height:48px;border:0;border-radius:12px;padding:6px 4px;background:transparent;font-size:12px;color:var(--cd-muted);font-weight:650}.tabs button[aria-selected=true]{background:var(--cd-card);color:var(--cd-gold)}.suggestions{display:flex;gap:6px;overflow:auto;padding:0 16px 6px;flex-shrink:0;scrollbar-width:none}.suggestions button{min-height:48px;padding:7px 12px;white-space:nowrap;border:1px solid var(--cd-line);border-radius:24px;background:transparent;color:var(--cd-muted);font-size:12px}.status{padding:2px 16px 10px;color:var(--cd-muted);font-size:12px;flex-shrink:0}.status[data-error]{color:#ffb7a9}.status[data-loading]::before{content:"";display:inline-block;width:11px;height:11px;border:2px solid #5c503c;border-top-color:var(--cd-gold);border-radius:50%;vertical-align:-1px;margin-right:7px;animation:spin .8s linear infinite}
.grid{display:flex;align-items:flex-start;flex:1;min-height:0;gap:10px;padding:0 12px 12px;overflow:auto;overscroll-behavior:contain;scrollbar-width:thin}.col{display:flex;flex-direction:column;gap:10px;flex:1;min-width:0}.gif-card{position:relative;border-radius:16px;overflow:hidden;background:var(--cd-card);flex:none}.tile{display:block;padding:0;width:100%;min-height:64px;border:2px solid transparent;border-radius:16px;background:var(--cd-card);overflow:hidden;position:relative}.tile[aria-pressed=true]{border-color:var(--cd-gold)}.tile[aria-pressed=true]::after{content:"✓";position:absolute;left:8px;top:8px;background:var(--cd-gold);color:var(--cd-bg);width:25px;height:25px;border-radius:50%;font-weight:800;font-size:15px;display:grid;place-items:center}.tile img{display:block;width:100%;height:100%;object-fit:contain}.tile img:not([src]){visibility:hidden}.tile .image-error{display:flex;align-items:center;justify-content:center;padding:16px 12px 56px;min-height:120px;font-size:12px;color:var(--cd-muted)}.favorite{position:absolute;right:4px;bottom:4px;min-width:48px;min-height:48px;border:1px solid #ffffff22;border-radius:14px;background:#101319e8;color:var(--cd-gold);font-size:23px;box-shadow:0 2px 10px #0003}.favorite[aria-pressed=true]{background:var(--cd-gold);color:var(--cd-bg)}
.empty{padding:28px 14px;width:100%;text-align:center;color:var(--cd-muted);font-size:14px;align-self:center}.empty strong{display:block;color:var(--cd-text);margin-bottom:8px}.retry{min-height:48px;padding:10px 20px;background:var(--cd-card);border:1px solid var(--cd-line);border-radius:14px;margin:14px auto 0;display:block;color:var(--cd-text)}.skeleton{height:130px;background:linear-gradient(120deg,var(--cd-card),#303947,var(--cd-card));border-radius:16px}
.preview{display:flex;gap:10px;align-items:center;margin:0 12px;padding:10px 12px;background:var(--cd-card);border:1px solid var(--cd-line);border-radius:15px;flex-shrink:0;max-height:82px;overflow:hidden}.preview img{width:44px;height:44px;object-fit:contain;border-radius:10px}.preview p{margin:0;min-width:0;max-height:58px;overflow:auto;font-size:12px;color:var(--cd-muted)}.signature-option{padding:8px 16px;color:var(--cd-gold);font-size:12px;flex-shrink:0;line-height:1.4}.send{margin:8px 16px 4px;padding:13px;border:0;border-radius:16px;background:var(--cd-gold);color:var(--cd-bg);min-height:52px;font-weight:750;font-size:15px;flex-shrink:0}.send:active{background:#f5c978}.attribution{padding:7px 16px 12px;font-size:10px;color:var(--cd-muted);flex-shrink:0}.link{display:block;margin:6px 16px 10px;min-height:48px;padding:12px;color:#aacfff;font-size:13px;flex-shrink:0}
@keyframes spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){.status[data-loading]::before{animation:none}}
.grid[data-loading]{opacity:.35;pointer-events:none}
@media(min-width:700px){.panel{max-width:660px;left:50%;transform:translateX(-50%);border-radius:26px}.grid{padding-inline:16px}.identity strong{font-size:20px}}
@media(max-height:520px){.handle,.suggestions,.attribution{display:none}.header{padding-bottom:0}.search{padding-block:0}.search input{height:48px}.tabs{padding-bottom:0}.status{padding-top:3px;padding-bottom:5px;font-size:11px;max-height:38px;overflow:auto}.preview{padding:4px 8px;max-height:48px}.preview img{width:32px;height:32px}.preview p{font-size:11px;max-height:38px}.signature-option{padding-block:4px;font-size:11px}.send{margin-top:4px;min-height:48px;padding:10px}.grid{padding-bottom:8px}}
@media(max-height:360px){.tabs{display:none}.status:not([data-error]):not([data-loading]){display:none}.header{padding-inline:12px}.identity strong{font-size:16px}.source{font-size:10px}.preview p{font-size:10px}.signature-option{font-size:10px}.grid{gap:8px}.send{font-size:13px}}
`;
    const backdrop=element('div','','backdrop'),panel=element('section','','panel');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','cyt seçici');
    const handle=element('div','','handle');handle.setAttribute('aria-hidden','true');
    const header=element('div','','header'),identity=element('div','','identity');identity.append(element('strong','cyt'),element('span','GIF kaynağı · Tenor','source'));
    const close=element('button','×','close');close.type='button';close.setAttribute('aria-label','GIF seçicisini kapat');close.onclick=closePicker;header.append(identity,close);
    const search=element('div','','search'),input=element('input');input.placeholder='GIF ara veya Tenor bağlantısı yapıştır';input.setAttribute('aria-label',input.placeholder);input.autocomplete='off';input.spellcheck=false;input.enterKeyHint='search';
    const searchBtn=element('button','Ara');searchBtn.type='button';searchBtn.onclick=()=>{setPickerTab('search');load(input.value,true);};search.append(input,searchBtn);
    const tabs=element('div','','tabs');tabs.setAttribute('role','tablist');tabs.setAttribute('aria-label','GIF kaynakları');
    const tabButtons=new Map();for(const [id,label]of [['search','GIF ara'],['favorites','Favoriler'],['recent','Son seçilen'],['creator','cyt']]){const b=element('button',label);b.type='button';b.setAttribute('role','tab');b.setAttribute('aria-selected',String(id==='search'));b.onclick=()=>switchPickerTab(id);tabs.append(b);tabButtons.set(id,b);}
    const suggestions=element('div','','suggestions');for(const text of ['Komik','Şaşkın','Mutlu','Alkış','Tepki']){const b=element('button',text);b.type='button';b.onclick=()=>{input.value=text;setPickerTab('search');load(text,true);};suggestions.append(b);}
    const status=element('div','','status');status.setAttribute('role','status');status.setAttribute('aria-live','polite');
    const grid=element('div','','grid');grid.setAttribute('aria-label','GIF sonuçları');
    const preview=element('div','','preview');preview.hidden=true;
    const signatureOption=element('div','GIF yorumunda “cyt ile gönderildi” imzası zorunludur.','signature-option');signatureOption.hidden=true;
    const sendBtn=element('button','GIF’i yorum kutusuna ekle','send');sendBtn.type='button';sendBtn.disabled=true;sendBtn.onclick=send;
    const nativeOpen=element('button','Resmî YouTube’da aç','send');nativeOpen.type='button';nativeOpen.hidden=true;
    const nativeNote=element('p','Yorumlar → GIF adımlarını YouTube’da tamamla. Buradaki GIF ve metin otomatik aktarılmaz; burada korunur. YouTube hesabında GIF desteği gerekir.','status');nativeNote.hidden=true;
    nativeOpen.onclick=async event=>{
      if(!event.isTrusted||picker.busy||picker.nativeOpening)return;
      const target=videoId();if(!target){setStatus('Önce bir YouTube videosu aç.',true);return;}
      picker.nativeOpening=true;nativeOpen.disabled=true;
      try{
        const result=await browser.runtime.sendMessage({type:'native-youtube-open',videoId:target});
        setStatus(result?.launchRequested?'Video bağlantısı YouTube’a aktarıldı. GIF gönderimi henüz doğrulanmadı.':result?.status==='VIDEO_CHANGED'?'Video değişti; bu taslak korunuyor.':'Resmî YouTube uygulaması açılamadı. GIF ve metnin bu uygulamada kaldı.',!result?.launchRequested);
      }catch{setStatus('YouTube açılamadı; taslak korunuyor.',true);}
      finally{picker.nativeOpening=false;nativeOpen.disabled=false;}
    };
    const unavailable=element('p',availability.description,'status');unavailable.setAttribute('data-error','');
    const link=element('a','Yorumu YouTube’da kontrol et','link');link.hidden=true;link.target='_self';
    const attribution=element('div','Seçmek göndermez. Paylaşımı YouTube’da sen başlatırsın.','attribution');
    panel.append(handle,header,search,tabs,suggestions,unavailable,status,grid,preview,signatureOption,sendBtn,nativeOpen,nativeNote,link,attribution);root.append(style,backdrop,panel);
    backdrop.onclick=()=>{if(!picker.busy)closePicker();};let timer;
    input.oninput=()=>{clearTimeout(timer);timer=setTimeout(()=>{setPickerTab('search');load(input.value);},450);};
    Object.assign(picker,{host,panel,input,status,grid,preview,signatureOption,sendBtn,nativeOpen,nativeNote,link,close,searchBtn,tabButtons,suggestions,unavailable,tab:'search',timer:()=>clearTimeout(timer)});
  }
  function place(){if(!picker.open)return;const vp=window.visualViewport,height=vp?vp.height:innerHeight;picker.host.style.height=height+'px';picker.host.style.top=(vp?vp.offsetTop:0)+'px';picker.panel.style.height=Math.min(height,740)+'px';}
  function openPicker(box){
    if(picker.pending&&!picker.pending.cancelled){picker.pending.card?.scrollIntoView({block:'center',behavior:'auto'});return;}
    if(!picker.host)buildPicker();if(picker.busy)return;
    picker.box=box;picker.open=true;picker.returnFocus=box.querySelector('.gcfy-btn');document.documentElement.append(picker.host);place();syncPickerVisibility();picker.close.focus({preventScroll:true});
    picker.sendBtn.textContent = editing(box) ? 'GIF’i düzenlenen yoruma ekle' : 'GIF’i yorum kutusuna ekle';
    picker.unavailable.textContent = availability.description + ' Hedef: ' + (document.querySelector('ytd-watch-metadata h1')?.textContent.trim() || videoId() || 'Video seçilmedi');
    if (editing(box)) picker.unavailable.textContent = 'Düzenlerken GIF ekleme deneyseldir; YouTube kabul etmeyebilir. Kaydet’e dokununca yalnız bir düzenleme isteği denenir. Yeni yorum oluşturulmaz.';
    browser.runtime.sendMessage({type:'native-youtube-capabilities'}).then(result=>{
      if(!picker.open||picker.box!==box)return;
      picker.nativeHandoffEnabled=result?.enabled===true;picker.nativeReceiverAvailable=result?.receiverAvailable===true&&result?.videoAvailable===true;
      picker.sendBtn.hidden=picker.nativeHandoffEnabled;
      picker.nativeOpen.hidden=!result?.enabled;picker.nativeNote.hidden=!result?.enabled;
      picker.nativeOpen.disabled=!result?.receiverAvailable||!result?.videoAvailable;
      if(result?.enabled&&!result?.receiverAvailable)picker.nativeNote.textContent='Bu cihazda resmî YouTube bağlantı alıcısı bulunamadı. GIF ve metnin burada kalır.';
      else picker.nativeNote.textContent='Yorumlar → GIF adımlarını YouTube’da tamamla. Buradaki GIF ve metin otomatik aktarılmaz; burada korunur. YouTube hesabında GIF desteği gerekir.';
    }).catch(()=>{picker.nativeOpen.hidden=true;picker.nativeNote.hidden=true;});
    if(picker.uncertain){setStatus('Önceki gönderim belirsiz. Tekrar göndermeden yorumlarını kontrol et.',true);return;}
    clearSelection();picker.link.hidden=true;readLibrary();
    if(['favorites','recent'].includes(picker.tab))switchPickerTab(picker.tab);else load(picker.input.value);
  }
  function closePicker(){if(picker.busy)return;picker.open=false;picker.seq++;picker.loading=false;picker.timer?.();picker.imageObserver?.disconnect();if(picker.host)picker.host.remove();syncPickerVisibility();picker.returnFocus?.focus({preventScroll:true});}
  function setStatus(text,error=false){picker.status.textContent=text;picker.status.toggleAttribute('data-error',error);picker.status.removeAttribute('data-loading');}
  function setBusy(value){picker.busy=value;picker.input.disabled=value;picker.searchBtn.disabled=value;picker.close.disabled=value;picker.sendBtn.disabled=value||picker.uncertain||!picker.selected||availability.gifPosting!==true;if(picker.nativeOpen)picker.nativeOpen.disabled=value||!picker.nativeReceiverAvailable;}
  function clearSelection(){picker.selected=null;picker.preview.hidden=true;picker.signatureOption.hidden=true;picker.sendBtn.disabled=true;}
  function setPickerTab(id){picker.tab=id;for(const[key,b]of picker.tabButtons)b.setAttribute('aria-selected',String(key===id));picker.suggestions.hidden=id!=='search';}
  async function readLibrary(){try{const data=await browser.runtime.sendMessage({type:'library-get'});if(data?.ok&&Array.isArray(data.favorites)&&Array.isArray(data.recent)){libraryState.favorites=data.favorites;libraryState.recent=data.recent;updateFavoriteButtons();return true;}}catch{}return false;}
  async function switchPickerTab(id){
    if(picker.busy||picker.uncertain)return;setPickerTab(id);clearSelection();
    if(id==='search'){load(picker.input.value);return;}if(id==='creator'){picker.input.value='candemir';load('candemir',true);return;}
    const seq=++picker.seq;setStatus('Cihazdaki GIF’ler okunuyor…');const available=await readLibrary();if(!picker.open||seq!==picker.seq)return;
    const gifs=libraryState[id==='favorites'?'favorites':'recent'];renderGifs(gifs);
    if(!gifs.length)emptyResults(id==='favorites'?'Henüz favori GIF yok':'Henüz GIF seçmedin',id==='favorites'?'GIF kartındaki yıldıza dokun. Favorilerin yalnızca bu cihazda saklanır.':'Seçtiğin GIF’ler burada görünür. Seçmek, yorum göndermek anlamına gelmez.');
    setStatus(!available?'Yerel geçmiş şu anda kullanılamıyor. GIF araması açık.':id==='favorites'?'Favorilerin bu cihazda saklanır.':'Son seçilen GIF’ler · Yayımlanma geçmişi değildir.',!available);
  }
  function stopLoading(){picker.loading=false;picker.grid.removeAttribute('data-loading');picker.grid.setAttribute('aria-busy','false');}
  function emptyResults(title,description,retry=false){stopLoading();picker.imageObserver?.disconnect();picker.grid.replaceChildren();const empty=element('div','','empty');empty.append(element('strong',title),element('span',description));if(retry){const b=element('button','Tekrar dene','retry');b.type='button';b.onclick=()=>load(picker.input.value,true);empty.append(b);}picker.grid.append(empty);}
  function updateFavoriteButtons(){for(const b of picker.grid.querySelectorAll('.favorite')){const favorite=libraryState.favorites.some(g=>g.id===b.dataset.gifId);b.textContent=favorite?'★':'☆';b.setAttribute('aria-pressed',String(favorite));b.setAttribute('aria-label',favorite?'Favoriden kaldır':'Favoriye ekle');}}
  async function toggleFavorite(gif){
    if(picker.loading)return;
    try{const result=await browser.runtime.sendMessage({type:'library-favorite',gif});if(!result?.ok)throw Error();libraryState.favorites=result.favorites;libraryState.recent=result.recent;updateFavoriteButtons();}catch{setStatus('Favori kaydedilemedi. GIF’i kullanmaya devam edebilirsin.',true);}
  }
  function renderGifs(gifs){
    stopLoading();
    picker.imageObserver?.disconnect();picker.grid.replaceChildren();
    const cols=[element('div','','col'),element('div','','col')],heights=[0,0];
    picker.imageObserver=typeof IntersectionObserver==='function'?new IntersectionObserver(entries=>{for(const e of entries){const image=e.target.querySelector('img');if(!image||image.dataset.failed)continue;if(e.isIntersecting&&!document.hidden)image.src=image.dataset.preview;else image.removeAttribute('src');}},{root:picker.grid,rootMargin:'120px'}):null;
    for(const gif of gifs||[]){
      const card=element('div','','gif-card'),tile=element('button','','tile');tile.type='button';tile.dataset.gifId=gif.id;tile.setAttribute('aria-label',gif.title);tile.setAttribute('aria-pressed','false');tile.style.aspectRatio=(gif.width||220)+' / '+(gif.height||124);
      const image=element('img');image.dataset.preview=gif.preview;image.alt=gif.title;image.loading='lazy';image.decoding='async';image.referrerPolicy='no-referrer';image.width=gif.width;image.height=gif.height;
      image.onerror=()=>{if(!image.getAttribute('src'))return;image.dataset.failed='true';image.hidden=true;tile.append(element('span','Önizleme yüklenemedi · GIF’i seçebilirsin','image-error'));};
      tile.append(image);tile.onclick=()=>{if(!picker.busy&&!picker.uncertain&&!picker.loading)select(gif);};
      const favorite=element('button','☆','favorite');favorite.type='button';favorite.dataset.gifId=gif.id;favorite.onclick=e=>{e.stopPropagation();toggleFavorite(gif);};card.append(tile,favorite);
      const index=heights[0]<=heights[1]?0:1;cols[index].append(card);heights[index]+=(gif.height||124)/(gif.width||220);
      if(picker.imageObserver)picker.imageObserver.observe(tile);else image.src=gif.preview;
    }
    picker.grid.append(...cols);picker.grid.scrollTop=0;updateFavoriteButtons();
  }
  async function load(raw,force=false){
    if(picker.busy||picker.uncertain)return;const query=raw.trim(),seq=++picker.seq;picker.loading=true;picker.grid.setAttribute('aria-busy','true');picker.grid.setAttribute('data-loading','');clearSelection();setStatus('GIF’ler yükleniyor…');picker.status.setAttribute('data-loading','');
    let response;
    if(!force&&picker.cachedQuery===query&&picker.cachedResult&&Date.now()-picker.cachedTime<60000)response={ok:true,gifs:picker.cachedResult};
    else{
      const link=/^\d{1,20}$/.test(query)||/^(https?:\/\/)?([\w-]+\.)*tenor\.com\//i.test(query);
      try{response=await browser.runtime.sendMessage(!query?{type:'featured'}:link?{type:'resolve',input:query}:{type:'search',query});}
      catch{response={ok:false};}
    }
    if(!picker.open||seq!==picker.seq)return;
    if(!response?.ok||!Array.isArray(response.gifs)){setStatus('GIF’ler yüklenemedi. Tekrar dene.',true);emptyResults('Bağlantı kurulamadı','İnternet bağlantını kontrol edip yeniden deneyebilirsin.',true);return;}
    picker.cachedQuery=query;picker.cachedResult=response.gifs;picker.cachedTime=Date.now();renderGifs(response.gifs);
    if(!response.gifs.length){emptyResults('GIF bulunamadı','Başka bir kelimeyle ara veya Tenor bağlantısı yapıştır.');setStatus('Bu aramada sonuç yok.');}
    else setStatus(picker.tab==='creator'?'Tenor’da candemir sonuçları · Farklı üreticiler bulunabilir.':'Bir GIF seç. Paylaşmadan önce taslağını göreceksin.');
  }
  function select(gif){
    picker.selected=gif;picker.preview.replaceChildren();picker.preview.hidden=false;picker.signatureOption.hidden=false;
    for(const tile of picker.grid.querySelectorAll('.tile'))tile.setAttribute('aria-pressed',String(tile.dataset.gifId===gif.id));
    const image=element('img');image.referrerPolicy='no-referrer';image.src=gif.preview;image.alt=gif.title;picker.preview.append(image,element('p',gif.title+(picker.nativeHandoffEnabled?'\nÖnizleme · GIF’i YouTube’da yeniden seçmen gerekir.':'\nYalnız önizleme · Henüz gönderilmedi.')));
    picker.signatureOption.hidden=picker.nativeHandoffEnabled===true||availability.gifPosting!==true;
    picker.sendBtn.disabled=availability.gifPosting!==true;setStatus(picker.nativeHandoffEnabled?'GIF önizlemesi hazır. Resmî YouTube’a geçiş videoyu açar; GIF göndermez.':availability.description);picker.input.blur();
    browser.runtime.sendMessage({type:'ui-state',pickerOpen:true,hideKeyboard:true}).catch(()=>null);
    browser.runtime.sendMessage({type:'library-use',gif}).then(data=>{if(data?.ok&&Array.isArray(data.recent))libraryState.recent=data.recent;}).catch(()=>null);
  }
  function editMarker(editor, marker, remove) {
    if (!remove) editor.focus();
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') {
      editor.value = remove ? editor.value.replace(marker, '') : editor.value + marker;
    } else if (remove) {
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) node.data = node.data.replace(marker, '');
    } else {
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      let inserted = false; try { inserted = document.execCommand('insertText', false, marker); } catch (_) { /* fallback */ }
      if (!inserted && !editor.textContent.includes(marker)) editor.append(document.createTextNode(marker));
      // Visually hide only the internal token. font-size:0 retains innerText
      // and textContent; display:none would lose it in YouTube serialization.
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        const index = node.data.indexOf(marker); if (index < 0) continue;
        const tokenRange = document.createRange(); tokenRange.setStart(node, index); tokenRange.setEnd(node, index + marker.length);
        const span = element('span'); span.dataset.desktopGifsMarker = 'true';
        span.style.cssText = 'font-size:0;line-height:0;color:transparent;';
        tokenRange.surroundContents(span); break;
      }
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: remove ? 'deleteContentBackward' : 'insertText', data: remove ? null : marker }));
  }
  function videoId() {
    if(availability.binaryTest&&globalThis.CanDemirBinaryTest)return globalThis.CanDemirBinaryTest.videoIdFromUrl(location.href);
    const url = new URL(location.href); return url.searchParams.get('v') || (url.pathname.match(/^\/shorts\/([\w-]{11})/) || [])[1] || '';
  }
  function addSignature(tx) {
    const before = readEditor(tx.editor);
    if (before.includes(REQUIRED_ATTRIBUTION)) return;
    const suffix = (before.trim().length ? ' · ' : '') + REQUIRED_ATTRIBUTION;
    tx.signatureText = suffix; tx.signatureStart = before.length;
    const editor = tx.editor;
    editor.focus();
    if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') editor.value += suffix;
    else if (tx.repairing) {
      // execCommand next to a noneditable span may manufacture NBSPs and split
      // the suffix, making cancellation leave generated branding behind.
      if (!before.trim()) editor.replaceChildren();
      const span = element('span'); span.dataset.gcfySignature = tx.nonce;
      span.contentEditable = 'false'; span.textContent = suffix;
      span.setAttribute('aria-label', 'GIF yorumunda zorunlu imza: ' + REQUIRED_ATTRIBUTION);
      editor.append(span); tx.signatureNode = span;
    }
    else {
      const range = document.createRange(); range.selectNodeContents(editor); range.collapse(false);
      const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
      let inserted = false; try { inserted = document.execCommand('insertText', false, suffix); } catch (_) {}
      if (!inserted && !readEditor(editor).endsWith(suffix)) editor.append(document.createTextNode(suffix));
      const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT); let last;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.data.endsWith(suffix)) last = node;
      if (last) {
        const signatureRange = document.createRange(); signatureRange.setStart(last, last.data.length - suffix.length); signatureRange.setEnd(last, last.data.length);
        const span = element('span'); span.dataset.gcfySignature = tx.nonce;
        span.contentEditable = 'false'; span.setAttribute('aria-label', 'GIF yorumunda zorunlu imza: ' + REQUIRED_ATTRIBUTION);
        signatureRange.surroundContents(span); tx.signatureNode = span;
      }
    }
    editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: suffix }));
  }
  // YouTube still owns submission and authentication. Only this prepared GIF
  // draft is protected; ordinary comments and already published comments are
  // never changed. A deleted signature is restored visibly before submission.
  function protectSignature(tx) {
    if (tx.cancelled || tx.clicked || tx.repairing || !tx.editor.isConnected) return false;
    const text = readEditor(tx.editor);
    if (text.replace(tx.marker, '').includes(REQUIRED_ATTRIBUTION) && text.includes(tx.marker)) return false;
    tx.repairing = true;
    const focused = document.activeElement === tx.editor;
    try {
      if (text.includes(tx.marker)) editMarker(tx.editor, tx.marker, true);
      addSignature(tx);
      editMarker(tx.editor, tx.marker, false);
      const token = [...tx.editor.querySelectorAll('[data-desktop-gifs-marker]')].find(n => n.textContent.includes(tx.marker));
      if (token && tx.signatureNode?.contains(token)) tx.signatureNode.after(token);
      if (!focused) tx.editor.blur();
      showDraftStatus(tx, 'GIF hazır · cyt ile gönderildi imzası zorunlu. Henüz gönderilmedi.');
      return true;
    } finally { tx.repairing = false; }
  }
  function removeAddedSignature(tx) {
    if (!tx.signatureText || !tx.editor.isConnected) return;
    const editor = tx.editor;
    const span = tx.signatureNode?.isConnected ? tx.signatureNode : editor.querySelector(`[data-gcfy-signature="${tx.nonce}"]`);
    let removed = false;
    if (span && span.textContent === tx.signatureText) { span.remove(); removed = true; }
    else if (!span) {
      const text = readEditor(editor), end = text.indexOf(tx.marker), start = end - tx.signatureText.length;
      if (start >= 0 && text.slice(start, end) === tx.signatureText) {
        if (editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT') editor.value = text.slice(0, start) + text.slice(end);
        else {
          const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT), range = document.createRange(); let offset = 0, started = false;
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            const next = offset + node.length;
            if (!started && start <= next) { range.setStart(node, start - offset); started = true; }
            if (started && end <= next) { range.setEnd(node, end - offset); range.deleteContents(); break; }
            offset = next;
          }
        }
        removed = true;
      }
    }
    if (removed) editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'deleteContentBackward', data: null }));
  }
  function findSubmit(box) {
    return box && (box.querySelector('#submit-button button')
      || box.querySelector('button[aria-label="Comment"]') || box.querySelector('#submit-button'));
  }
  const editing = box => !!box?.closest('ytd-comment-dialog-renderer, ytd-comment-reply-dialog-renderer, #edit-dialog');
  async function send() {
    if (picker.busy || picker.pending || !picker.selected) return;
    if (!availability.gifPosting) {
      setStatus(availability.description,true);
      report({nonce:availability.correlation(),gif:picker.selected,clicked:false}, {state:'blocked',status:availability.reason,http:0,attempts:0});
      return;
    }
    const box = picker.box, selected = picker.selected, targetVideo = videoId();
    if(!targetVideo){
      setStatus('Bu deneme yalnız test videosunda açık. Ana menüde Test videosunu aç düğmesini kullan; yorum gönderilmedi.',true);
      report({nonce:availability.correlation(),gif:selected,clicked:false,targetVideo}, {state:'blocked',status:'BINARY_PAGE_VIDEO_ONLY',http:0,attempts:0,pageVideoId:targetVideo});return;
    }
    const editor = box && box.isConnected && box.querySelector('#contenteditable-root, [contenteditable="true"], textarea');
    const submit = findSubmit(box);
    if (!editor || !submit || !/^[\w-]{11}$/.test(targetVideo)) { setStatus('Yorum kutusu veya video kimliği bulunamadı. Kutuyu yeniden açın.', true); return; }
    setBusy(true);setStatus('Seçilen GIF’in güncel kimliği ve içerik derecesi kontrol ediliyor…');
    let gif=selected, ratingChecked=false;
    try {
      const check=await Promise.race([browser.runtime.sendMessage({type:'check',id:selected.id}),sleep(5500).then(()=>null)]);
      if(check?.ok){
        const current=check.gifs?.[0];
        if(!current){setStatus('Bu GIF Tenor’da artık bulunamıyor veya hareketli GIF olarak kullanılamıyor. Başka bir GIF seçin.',true);return;}
        if(typeof current.contentRating==='string'&&current.contentRating!=='G'){
          setStatus('Bu GIF’in Tenor derecesi '+current.contentRating+'. YouTube GIF yorumları için G dereceli bir GIF seçin.',true);return;
        }
        gif=current;ratingChecked=current.contentRating==='G';
      }
    } catch (_) { /* Unknown rating is not invented; YouTube decides once. */ }
    finally { setBusy(false); }
    if(!picker.open||picker.box!==box||!editor.isConnected||videoId()!==targetVideo)return;
    if(picker.selected!==selected){setStatus('Seçilen GIF değişti. Yeni seçimi hazırlamak için düğmeye tekrar dokunun.');return;}
    if(typeof gif.contentRating==='string'&&gif.contentRating!=='G'){
      setStatus('Bu GIF’in Tenor derecesi '+gif.contentRating+'. YouTube GIF yorumları için G dereceli bir GIF seçin.',true);return;
    }
    const nonce = [...crypto.getRandomValues(new Uint8Array(12))].map(b => b.toString(16).padStart(2, '0')).join('');
    const marker = `[[gif:${gif.id}:${nonce}]]`;
    let acknowledge;
    const ack = new Promise(resolve => { acknowledge = resolve; });
    const tx = { nonce, marker, gif, box, editor, submit, targetVideo, ratingChecked, editing:editing(box), clicked: false, seen: false, cancelled: false, processing: false, done: false, timer: 0 };
    tx.targetCommentId = tx.editing ? editor.getAttribute('data-cdg-edit-comment-id') || '' : '';
    callbacks.set(nonce, msg => {
      if (msg.type === 'armed') acknowledge(true);
      else if (msg.type === 'seen') {
        tx.seen = true; tx.transport = msg.transport; tx.endpoint = msg.endpoint;
        tx.pageVideoId=msg.pageVideoId;tx.requestVideoId=msg.requestVideoId;tx.parameterTargetKnown=msg.parameterTargetKnown;
        clearTimeout(tx.timer);
        if (tx.editor.isConnected) editMarker(tx.editor, marker, true);
        showDraftStatus(tx, 'YouTube GIF isteği gönderildi. Sunucu yanıtı bekleniyor…');
        report(tx, { state: 'sending', status: 'REQUEST_REWRITTEN', http: 0 });
        tx.timer = setTimeout(() => timedOut(tx, 'RESPONSE_TIMEOUT'), 65000);
      } else if (msg.type === 'result') processResult(tx, msg).catch(() => timedOut(tx, 'VERIFICATION_ERROR'));
    });
    setBusy(true); setStatus('GIF yorum kutusu için hazırlanıyor…');
    try {
      toMain({ type: 'arm', id: gif.id, nonce, ratedG:ratingChecked });
      if (!await Promise.race([ack, sleep(2000).then(() => false)])) {
        callbacks.delete(nonce); toMain({ type: 'disarm', nonce });
        setStatus('GIF gönderim bileşeni açılmadı. Sayfayı yenileyin; yorum gönderilmedi.', true);
        report(tx, { state: 'blocked', status: 'HOOK_UNAVAILABLE', http: 0 }); return;
      }
      picker.pending = tx;
      buildDraft(tx);
      addSignature(tx);
      editMarker(editor, marker, false);
      tx.onInput = event => { if (event.target === tx.editor || tx.editor.contains(event.target)) protectSignature(tx); };
      box.addEventListener('input', tx.onInput);
      // Browsers can insert at the end inside the signature span. Keep the
      // hidden GIF token separate so editing/removing the visible name is safe.
      const token = [...editor.querySelectorAll('[data-desktop-gifs-marker]')].find(node => node.textContent.includes(marker));
      if (token && tx.signatureNode?.contains(token)) tx.signatureNode.after(token);
      tx.onClick = event => {
        if (tx.cancelled) return;
        if (!event.isTrusted || tx.clicked) {
          event.preventDefault(); event.stopImmediatePropagation();
          if (!tx.done) showDraftStatus(tx, tx.clicked ? 'Gönderim zaten denendi. Tekrar göndermeden yorumları kontrol edin.' : 'YouTube’un Yorum/Yanıtla/Kaydet düğmesine doğrudan dokunun.', true);
          return;
        }
        if (!tx.editor.isConnected || videoId() !== targetVideo) {
          event.preventDefault(); event.stopImmediatePropagation();
          cancelDraft(tx); return;
        }
        if (protectSignature(tx)) {
          event.preventDefault(); event.stopImmediatePropagation();
          showDraftStatus(tx, 'Zorunlu imza geri eklendi. Taslağı kontrol edip YouTube’un Yorum/Yanıtla düğmesine yeniden dokunun.');
          return;
        }
        if (!readEditor(tx.editor).replace(marker, '').includes(REQUIRED_ATTRIBUTION)) {
          event.preventDefault(); event.stopImmediatePropagation();
          showDraftStatus(tx, 'GIF göndermek için “cyt ile gönderildi” imzası yorumda bulunmalıdır. İmzayı geri yazın veya GIF’i kaldırın.', true);
          report(tx, { state: 'blocked', status: 'ATTRIBUTION_REQUIRED', http: 0 });
          return;
        }
        tx.clicked = true; tx.cancel.disabled = true;
        box.removeEventListener('input', tx.onInput);
        // Primitive detail crosses Firefox's isolated/page worlds synchronously.
        // It enables the rewrite before YouTube's own trusted click handler runs.
        document.dispatchEvent(new CustomEvent('desktop-gifs-submit-intent', { detail: nonce }));
        showDraftStatus(tx, 'YouTube’un gönderme düğmesine dokunuldu. Gönderim isteği bekleniyor…');
        report(tx, { state: 'sending', status: 'NATIVE_SUBMIT_TAPPED', http: 0 });
        clearTimeout(tx.timer); tx.timer = setTimeout(() => timedOut(tx, 'REQUEST_NOT_OBSERVED'), 12000);
        // No submit.click(): YouTube handles the actual user tap and its own auth.
      };
      submit.addEventListener('click', tx.onClick, true);
      picker.open = false; picker.seq++; picker.host.remove();
      editor.blur(); picker.input.blur();
      requestAnimationFrame(() => requestAnimationFrame(() => revealSubmit(tx)));
      report(tx, { state: 'prepared', status: 'AWAITING_NATIVE_TAP', http: 0 });
      tx.timer = setTimeout(() => { if (!tx.clicked) cancelDraft(tx, 'GIF hazırlığının süresi doldu. Yorum gönderilmedi.'); }, 120000);
    } finally {
      setBusy(false);
    }
  }
  function readEditor(editor) { return editor.tagName === 'TEXTAREA' || editor.tagName === 'INPUT' ? editor.value : typeof editor.innerText === 'string' ? editor.innerText : editor.textContent; }
  function report(tx, result) {
    browser.runtime.sendMessage({ type: 'diagnostic', stage: result.state, http: result.http || 0, status: result.status,
      correlationId:tx.nonce,category:availability.category(result.status,result.http),
      transport: result.transport || tx.transport || '', endpoint: result.endpoint || tx.endpoint || '', nativeTapped: tx.clicked, errorName: result.errorName || '',
      pageVideoId:result.pageVideoId||tx.pageVideoId||tx.targetVideo||'',requestVideoId:result.requestVideoId||tx.requestVideoId||'',parameterTargetKnown:result.parameterTargetKnown===true||tx.parameterTargetKnown===true,
      schemaFields:result.schemaFields||'',
      commentId: result.commentId || '', publicGifVerified: result.publicGifVerified === true,
      editing: tx.editing === true,
      tenorId: tx.gif.id, contentRating: tx.gif.contentRating || '', ratingChecked: tx.ratingChecked === true,
      apiStatus: result.apiStatus || '', actionStatus: result.actionStatus || '', serverMessage: availability.safeMessage(result.serverMessage || ''), attempts:Number.isInteger(result.attempts) ? result.attempts : (tx.clicked ? 1 : 0),
      publicCommentVerified: result.publicCommentVerified === true, publicGifAttachmentVerified: result.publicGifAttachmentVerified === true,
      publicAttributionVerified: result.publicAttributionVerified === true,
      verificationChecked: result.verificationChecked === true,verificationReason: result.verificationReason||'',verificationRequests:result.verificationRequests||0,verificationReadHttp:result.verificationReadHttp||0 }).catch(() => {});
  }
  function buildDraft(tx) {
    const card = element('section', '', 'gcfy-draft'); card.setAttribute('aria-label', 'Seçilen GIF taslağı ve gönderim durumu');
    const heading = element('strong', 'GIF taslağı');
    const image = element('img'); image.src = tx.gif.preview; image.alt = tx.gif.title; image.referrerPolicy = 'no-referrer';
    const status = element('p', tx.ratingChecked ? 'GIF hazır · Tenor derecesi G · Henüz gönderilmedi'
      : 'GIF hazır · Tenor derecesi şu anda doğrulanamadı · Henüz gönderilmedi', 'gcfy-draft-status'); status.setAttribute('role', 'status');
    const cancel = element('button', '×'); cancel.type = 'button'; cancel.setAttribute('aria-label', 'Seçilen GIF’i kaldır'); cancel.onclick = () => cancelDraft(tx);
    const link = element('a', 'Yorumları kontrol et'); link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(tx.targetVideo); link.hidden = true;
    card.append(heading, image, status, cancel, link);
    const footer = tx.box.querySelector('#footer'); (footer || tx.editor).before(card);
    Object.assign(tx, { card, image, statusEl: status, cancel, link });
  }
  function showDraftStatus(tx, text, error = false) {
    if (!tx.statusEl) return;
    tx.statusEl.textContent = text; tx.statusEl.toggleAttribute('data-error', error);
  }
  function cancelDraft(tx, reason) {
    if (tx.clicked && !tx.done) return;
    tx.cancelled = true; clearTimeout(tx.timer); callbacks.delete(tx.nonce);
    toMain({ type: 'disarm', nonce: tx.nonce });
    removeAddedSignature(tx);
    if (tx.editor.isConnected) editMarker(tx.editor, tx.marker, true);
    if (tx.onClick) tx.submit.removeEventListener('click', tx.onClick, true);
    if (tx.onInput) tx.box.removeEventListener('input', tx.onInput);
    tx.submit?.classList.remove('gcfy-native-submit');
    tx.card?.remove(); if (picker.pending === tx) picker.pending = null;
    if (!tx.clicked) report(tx, { state: 'cancelled', status: reason ? 'PREPARATION_EXPIRED' : 'PREPARATION_CANCELLED', http: 0 });
  }
  function errorMessage(result) {
    if(result.status==='BINARY_TEST_USED')return 'Bu özel testin tek gönderim hakkı kullanıldı. Yeniden gönderilmedi. Menü → Gönderim durumu bölümünden sonucu kopyalayabilirsin.';
    if(result.status==='BINARY_TEST_VIDEO_ONLY'||result.status==='BINARY_PAGE_VIDEO_ONLY')return 'Açık sayfa test videosu değil. Ana menüde Test videosunu aç düğmesini kullan. Bu yorum gönderilmedi.';
    if(result.status==='BINARY_REQUEST_VIDEO_MISMATCH')return 'YouTube’un yorum isteği farklı videoya ait. Sayfayı yenile; bu yorum gönderilmedi.';
    if(result.status==='BINARY_NEW_COMMENT_ONLY')return 'İkili test düzenlemeyi veya yanıtı desteklemiyor. Yeni yorum kutusunu kullan; bu işlem gönderilmedi.';
    if(/^BINARY_/.test(result.status||''))return 'İkili test, mevcut YouTube isteğini güvenle dönüştüremedi ('+result.status+'). İstek gönderilmedi; otomatik tekrar yapılmadı.';
    if(result.state==='rejected'){
      const detail=result.serverMessage?' YouTube yanıtı: '+result.serverMessage:'';
      if(result.status==='YOUTUBE_INVALID_ARGUMENT')return 'YouTube bu GIF yorumunu kabul etmedi (HTTP 400 / INVALID_ARGUMENT). GIF’i kaldırarak normal yoruma dönebilirsin.'+detail;
      if(result.status==='YOUTUBE_GIF_REJECTED')return 'YouTube seçilen GIF yorumunu kabul etmedi.'+detail+' Gönderim doğrulanmadı; otomatik tekrar gönderilmedi.';
      return 'YouTube gönderimi reddetti (HTTP '+result.http+(result.apiStatus?' / '+result.apiStatus:'')+').'+detail+' Otomatik tekrar gönderilmedi.';
    }
    const reasons = {
      ATTRIBUTION_REQUIRED: 'İmza YouTube’un gönderim metninde bulunamadı. GIF isteği gönderilmedi. Taslağı kapatıp yeniden hazırlayın.',
      UNREADABLE_RESPONSE: 'YouTube yanıtı okunamadı. Yorum ve GIF yayımlanması doğrulanamadı; tekrar göndermeden yorumları kontrol edin.',
      MISSING_ACTION_RESULT: 'YouTube yanıtında gönderim sonucu yok. Yorum ve GIF yayımlanması doğrulanamadı; yorumları kontrol edin.',
      REQUEST_NOT_OBSERVED: 'YouTube gönderim isteği yakalanamadı. Yorumları kontrol edin; yeniden göndermeden sayfayı yenileyin.',
      RESPONSE_TIMEOUT: 'İstek gönderildi fakat sunucu yanıtı bekleme süresinde gelmedi. Yorum gönderilmiş olabilir; tekrar göndermeden kontrol edin.',
      FETCH_NETWORK_ERROR: 'YouTube isteğinde ağ/tarayıcı hatası oluştu. HTTP yanıtı alınamadı. Tekrar göndermeden yorumları kontrol edin.',
      FETCH_ABORTED: 'YouTube isteği tarayıcı tarafından iptal edildi. Gönderim sonucu belirsiz; yorumları kontrol edin.',
      XHR_ERROR: 'YouTube bağlantısı hata verdi. HTTP yanıtı alınamadı; yorumları kontrol edin.',
      XHR_TIMEOUT: 'YouTube bağlantısı zaman aşımına uğradı. Gönderim sonucu belirsiz; yorumları kontrol edin.',
      XHR_ABORT: 'YouTube bağlantısı iptal edildi. Gönderim sonucu belirsiz; yorumları kontrol edin.',
      NO_HTTP_RESPONSE: 'YouTube’dan HTTP yanıtı alınamadı. Tekrar göndermeden yorumları kontrol edin.',
      EDITOR_STATE_NOT_SERIALIZED: 'YouTube, hazırlanan GIF’i yorum kutusundan okumadı. Yanlış metin gönderimi engellendi; sayfayı yenileyin.',
      BODY_UNREADABLE: 'YouTube isteği okunamadı; GIF işaretçisinin yorum olarak gitmesi engellendi.',
      MARKER_BLOCKED: 'GIF hazırlığı geçersiz veya süresi dolmuş. Gönderim engellendi; GIF’i yeniden seçin.',
      VERIFICATION_ERROR: 'Gönderim denendi; görünürlük kontrolü tamamlanamadı. Tekrar göndermeden yorumları kontrol edin.'
    };
    if (result.state === 'accepted' && !result.commentId) return 'Sunucu kabul bildirdi fakat yorum kimliği bulunamadı. Yorum/GIF yayımlanması doğrulanamadı; yorumları kontrol edin.';
    return reasons[result.status] || (result.http ? `YouTube yanıtı doğrulanamadı (HTTP ${result.http}). Yorumları kontrol edin.` : 'Gönderim sonucu doğrulanamadı. Yorumları kontrol edin.');
  }
  function timedOut(tx, status) {
    if (tx.cancelled || tx.done || tx.processing) return;
    tx.done = true; tx.cancel.disabled = false; tx.cancel.textContent = 'Yorumları kontrol ettim; taslağı kapat'; tx.link.hidden = false;
    if (tx.editor.isConnected) editMarker(tx.editor, tx.marker, true);
    showDraftStatus(tx, errorMessage({ status, http: 0 }), true);
    report(tx, { state: 'unknown', status, http: 0 });
    // Keep the callback: a late real response can still resolve this uncertainty.
  }
  async function processResult(tx, result) {
    if (tx.cancelled || tx.processing) return;
    tx.processing = true; clearTimeout(tx.timer);
    const readTarget = verificationPolicy.target(result, tx.editing, tx.targetCommentId);
    if (readTarget) result.commentId = readTarget;
    if (tx.editor.isConnected) editMarker(tx.editor, tx.marker, true);
    tx.link.href = 'https://www.youtube.com/watch?v=' + encodeURIComponent(tx.targetVideo)
      + (result.commentId ? '&lc=' + encodeURIComponent(result.commentId) : '');
    tx.link.hidden = false;
    try {
      if (!readTarget) {
        showDraftStatus(tx, errorMessage(result), true);
        return;
      }
      showDraftStatus(tx, 'YouTube yanıtı alındı. Yorum ve GIF eki ayrıca okunarak kontrol ediliyor…');
      report(tx, { ...result, state: 'checking_public' });
      let verification = { checked: false };
      try {
        verification = await Promise.race([
          browser.runtime.sendMessage({ type: 'verify', videoId: tx.targetVideo, commentId: result.commentId, tenorId: tx.gif.id, editing: tx.editing === true }),
          sleep(30000).then(() => ({ checked: false }))
        ]);
      } catch (_) { /* unknown, never success */ }
      result.publicGifVerified = verification?.selectedAttachmentVisible === true;
      result.publicCommentVerified = verification?.commentVisible === true;
      // An edit may already have an older GIF. Its presence cannot prove that
      // the newly selected GIF was saved; require exact identity for edits.
      result.publicGifAttachmentVerified = verification?.gifAttachmentVisible === true;
      result.publicAttributionVerified = verification?.attributionVisible === true;
      result.verificationChecked=verification?.checked===true;result.verificationReason=verification?.reason||'PUBLIC_TIMEOUT';result.verificationRequests=verification?.requests||0;
      result.verificationReadHttp=verification?.readHttp||0;
      result.state = verificationPolicy.verdict(verification, tx.editing);
      if (result.state === 'verified_public') {
        showDraftStatus(tx, result.publicGifVerified ? 'Yorum, seçilen GIF ve cyt imzası çerezsiz YouTube yanıtında doğrulandı.'
          : 'Yorum, YouTube’un GIF eki ve cyt imzası çerezsiz yanıtta doğrulandı. YouTube görsel kimliğini değiştirdiği için bire bir Tenor kimliği ayrıca doğrulanmadı.');
        tx.image.hidden = true; tx.card.querySelector('strong').textContent = 'Gönderim doğrulandı';
        result.state='verified_public';
      } else if (result.state === 'gif_missing') {
        result.status = 'PUBLIC_GIF_ATTACHMENT_MISSING';
        showDraftStatus(tx, 'Okunan yorumda GIF eki bulunamadı. Metin görünse de GIF gönderimi başarısız; otomatik tekrar yapılmadı.', true);
      } else if (result.state === 'selected_gif_unverified') {
        result.status = 'PUBLIC_SELECTED_GIF_UNVERIFIED';
        showDraftStatus(tx, 'Yorumda bir GIF eki var; yeni seçtiğin GIF’in kaydedildiği doğrulanamadı. Otomatik tekrar yapılmadı.', true);
      } else {
        showDraftStatus(tx, verification?.commentVisible ? 'Yorum yayımlandı. GIF ve cyt imzasının herkese açık eşleşmesi tam doğrulanamadı. Aynı yorumu tekrar göndermeden kontrol edin.'
          : 'YouTube yanıtı alındı; yorum ve GIF’in herkese açık görünürlüğü doğrulanamadı. Tekrar göndermeden kontrol edin.', true);
      }
    } finally {
      tx.processing = false; tx.done = true; tx.cancel.disabled = false;
      tx.cancel.textContent = result.state === 'blocked' || result.state === 'rejected' ? 'GIF’i kaldır'
        : result.publicGifVerified || result.publicCommentVerified ? 'Kapat' : 'Yorumları kontrol ettim; taslağı kapat';
      callbacks.delete(tx.nonce); toMain({ type: 'disarm', nonce: tx.nonce }); report(tx, result);
    }
  }
  for (const type of ['keydown', 'keyup', 'keypress', 'wheel', 'touchmove']) {
    window.addEventListener(type, e => {
      if (!picker.open || !e.composedPath().includes(picker.host)) return;
      if(type==='keydown'&&e.key==='Tab'){const nodes=[...picker.panel.querySelectorAll('button:not(:disabled),input:not(:disabled),a[href]')].filter(el=>!el.hidden&&el.getBoundingClientRect().height>0),active=picker.host.shadowRoot.activeElement;if(nodes.length&&((e.shiftKey&&active===nodes[0])||(!e.shiftKey&&active===nodes.at(-1)))){e.preventDefault();(e.shiftKey?nodes.at(-1):nodes[0]).focus();}}
      e.stopImmediatePropagation();
      if (type === 'keydown' && e.key === 'Escape') closePicker();
      if (type === 'keydown' && e.key === 'Enter' && e.composedPath().includes(picker.input)) { e.preventDefault(); load(picker.input.value); }
    }, { capture: true, passive: type === 'wheel' || type === 'touchmove' });
  }
  document.addEventListener('visibilitychange',()=>{if(!picker.grid)return;for(const image of picker.grid.querySelectorAll('img')){if(document.hidden)image.removeAttribute('src');else if(!image.dataset.failed)picker.imageObserver?.observe(image.closest('.tile'));}});
  window.addEventListener('pagehide',()=>{lastPickerVisible=false;browser.runtime.sendMessage({type:'ui-state',pickerOpen:false}).catch(()=>null);picker.imageObserver?.disconnect();});
  const onViewportChange = () => { refreshViewport(); place(); if (picker.pending && !picker.pending.clicked) revealSubmit(picker.pending); };
  window.addEventListener('resize', onViewportChange);
  if (window.visualViewport) { visualViewport.addEventListener('resize', onViewportChange); visualViewport.addEventListener('scroll', refreshViewport); }
  window.addEventListener('yt-navigate-start', () => {
    if (!picker.busy) closePicker();
    if (picker.pending && !picker.pending.clicked) cancelDraft(picker.pending);
  });
})();
