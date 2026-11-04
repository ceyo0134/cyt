// Device-local GIF metadata only. No account, cookie, video or comment data.
(() => {
  const key='canDemirGifLibraryV1';let queue=Promise.resolve();
  function clean(gif){
    if(!gif||typeof gif.id!=='string'||!/^\d{1,20}$/.test(gif.id)||typeof gif.preview!=='string'||gif.preview.length>1000)return null;
    try{const url=new URL(gif.preview);if(url.protocol!=='https:'||!/^media\d*\.tenor\.com$/.test(url.hostname)||url.username||url.password||url.port)return null;}catch{return null;}
    const width=Number(gif.width),height=Number(gif.height);if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>10000||height>10000)return null;
    return{id:gif.id,title:String(gif.title||'GIF').slice(0,200),preview:gif.preview,width:Math.round(width),height:Math.round(height)};
  }
  function list(value,max){const seen=new Set();return(Array.isArray(value)?value:[]).map(clean).filter(gif=>gif&&!seen.has(gif.id)&&seen.add(gif.id)).slice(0,max);}
  function handle(message){
    const work=queue.then(async()=>{
      if(!browser.storage?.local)throw Error('Yerel kayıt kullanılamıyor.');
      const saved=(await browser.storage.local.get(key))[key]||{};
      const state={favorites:list(saved.favorites,40),recent:list(saved.recent,20)};
      if(message.type==='library-get')return{ok:true,...state};
      const gif=clean(message.gif);if(!gif)throw Error('Geçersiz GIF kaydı.');
      if(message.type==='library-favorite'){
        state.favorites=state.favorites.some(item=>item.id===gif.id)?state.favorites.filter(item=>item.id!==gif.id):[gif,...state.favorites].slice(0,40);
      }else if(message.type==='library-use')state.recent=[gif,...state.recent.filter(item=>item.id!==gif.id)].slice(0,20);
      else throw Error('Geçersiz kayıt işlemi.');
      await browser.storage.local.set({[key]:state});return{ok:true,...state};
    });
    queue=work.catch(()=>null);return work.catch(()=>({ok:false,error:'GIF geçmişi kaydedilemedi. Seçtiğin GIF’i kullanmaya devam edebilirsin.'}));
  }
  globalThis.CanDemirLibrary={handle,clean};
})();
