// GPL-3.0. Isolated serialization experiment, not a verified GIF transport.
// See BINARY-TEST.txt for schema sources, deliberate omissions and limitations.
(() => {
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', {fatal:true});
  const TEST_VIDEO = 'YJqo89sa6iw';
  const scalar = (n, type = 'string') => ({n,type});
  const message = (n, fields, repeated = false) => ({n,type:'message',fields,repeated});
  const enumeration = (n, values) => ({n,type:'enum',values});
  const pair = {key:scalar(1),value:scalar(2)};
  // Enum numbers from YouTube's public player 0229cd64 (2026-10-16).
  const attestationErrors={ATTESTATION_ERROR_UNKNOWN:0,ATTESTATION_ERROR_VM_NOT_INITIALIZED:1,ATTESTATION_ERROR_VM_NO_RESPONSE:2,ATTESTATION_ERROR_VM_TIMEOUT:3,ATTESTATION_ERROR_VM_INTERNAL_ERROR:4,ATTESTATION_ERROR_PREFETCH_CHALLENGE_INVALID:5,ATTESTATION_ERROR_PREFETCH_CHALLENGE_NETWORK_ERROR:6,ATTESTATION_ERROR_PREFETCH_CHALLENGE_OFFLINE:7,ATTESTATION_ERROR_PREFETCH_CHALLENGE_INTERNAL_ERROR:8,ATTESTATION_ERROR_API_NOT_READY:9,ATTESTATION_ERROR_DEVICE_OFFLINE:10,ATTESTATION_ERROR_KEY_PAIR_INIT_FAILED:12,ATTESTATION_ERROR_SIGNING_DATA_MISSING:13,ATTESTATION_ERROR_SIGNING_FAILED:14,ATTESTATION_ERROR_CERT_CHAIN_RETRIEVAL_FAILED:15};
  const client = {};
  for (const [key,n] of Object.entries({hl:1,gl:2,remoteHost:4,deviceMake:12,deviceModel:13,visitorData:14,
    userAgent:15,clientVersion:17,osName:18,osVersion:19,acceptLanguage:21,acceptRegion:22,originalUrl:23,
    configData:27,experimentsToken:54,contentSizeCategory:76,timeZone:80,browserName:87,browserVersion:88,
    acceptHeader:103,deviceExperimentId:104,rolloutToken:108})) client[key]=scalar(n);
  for (const [key,n] of Object.entries({screenWidthPoints:37,screenHeightPoints:38,screenPixelDensity:41,
    windowWidthPoints:55,windowHeightPoints:56,androidSdkVersion:64,utcOffsetMinutes:67,memoryTotalKbytes:95})) client[key]=scalar(n,'integer');
  for (const [key,n] of Object.entries({screenWidthInches:39,screenHeightInches:40,screenDensityFloat:65,fontScale:77})) client[key]=scalar(n,'float');
  for (const [key,n] of Object.entries({webpSupport:51,animatedWebpSupport:68})) client[key]=scalar(n,'bool');
  client.clientName=enumeration(16,{WEB:1,MWEB:2});
  client.clientFormFactor=enumeration(46,{UNKNOWN_FORM_FACTOR:0,SMALL_FORM_FACTOR:1,LARGE_FORM_FACTOR:2,AUTOMOTIVE_FORM_FACTOR:3,WEARABLE_FORM_FACTOR:4});
  client.userInterfaceTheme=enumeration(78,{USER_INTERFACE_THEME_UNKNOWN:0,USER_INTERFACE_THEME_LIGHT:1,USER_INTERFACE_THEME_DARK:2});
  // Added by YouTube's live request builder AFTER INNERTUBE_CONTEXT is loaded.
  // Source: 2026-10-16 public kevlar bundle + yt-dlp-ytse ClientInfo schema.
  client.applicationState=enumeration(35,{UNKNOWN_APPLICATION_STATE:0,ACTIVE:1,BACKGROUND:2,INACTIVE:3});
  client.connectionType=enumeration(61,{CONN_DEFAULT:0,CONN_UNKNOWN:1,CONN_NONE:2,CONN_WIFI:3,CONN_CELLULAR_2G:4,CONN_CELLULAR_3G:5,CONN_CELLULAR_4G:6,CONN_CELLULAR_UNKNOWN:7,CONN_DISCO:8,CONN_CELLULAR_5G:9,CONN_WIFI_METERED:10,CONN_CELLULAR_5G_SA:11,CONN_CELLULAR_5G_NSA:12,CONN_WIRED:30,CONN_INVALID:31});
  client.effectiveConnectionType=enumeration(94,{EFFECTIVE_CONNECTION_TYPE_UNKNOWN:0,EFFECTIVE_CONNECTION_TYPE_OFFLINE:1,EFFECTIVE_CONNECTION_TYPE_SLOW_2G:2,EFFECTIVE_CONNECTION_TYPE_2G:3,EFFECTIVE_CONNECTION_TYPE_3G:4,EFFECTIVE_CONNECTION_TYPE_4G:5});
  client.internalGeo=scalar(34);
  client.configInfo=message(62,{coldConfigData:scalar(1),coldHashData:scalar(3),hotHashData:scalar(5),appInstallData:scalar(6),activeAccountStaticConfigData:scalar(7),accountStaticHashData:scalar(8),accountDynamicHashData:scalar(9)});
  // These are presentation hints. Their public enum mappings are unconfirmed.
  // Explicitly omit them instead of inventing enum values. Never omit identity,
  // rollout, user, safety, integrity or arbitrary unrecognized fields.
  client.platform={type:'displayHint'};
  client.mainAppWebInfo={type:'displayHint'};
  const context = {
    client:message(1,client),
    user:message(3,{onBehalfOfUser:scalar(3),enableSafetyMode:scalar(7,'bool'),isIncognito:scalar(15,'bool'),lockedSafetyMode:scalar(16,'bool'),serializedDelegationContext:scalar(18)}),
    request:message(5,{useSsl:scalar(7,'bool'),internalExperimentFlags:message(15,pair,true),
      consistencyTokenJars:{type:'emptyRepeated'},externalPrequestContext:scalar(32),
      // Forward only the original YouTube-produced values. Never manufacture a
      // response, clear an error, or change the challenge/client identity.
      attestationResponseData:message(34,{challenge:scalar(1),webResponse:scalar(2),androidResponse:scalar(3),iosResponse:scalar(4,'bytes'),error:enumeration(5,attestationErrors)})}),
    clickTracking:message(6,{clickTrackingParams:scalar(2,'bytes')}),
    adSignalsInfo:message(9,{params:message(1,pair,true),bid:scalar(2),mutsuId:scalar(3),consentBumpState:scalar(4),advertisingId:scalar(7),limitAdTracking:scalar(9,'bool'),attributionOsSupportedVersion:scalar(10)}),
    clientScreenNonce:scalar(11)
  };
  const create={context:message(1,context),createCommentParams:scalar(2),commentText:scalar(3),tenorId:scalar(32)};
  function fail(code,field='') { const e=Error(code);if(field)e.schemaFields=safeField(field);throw e; }
  function safeField(path) { return /^(?:[A-Za-z][A-Za-z0-9_]{0,63}\.){0,5}[A-Za-z][A-Za-z0-9_]{0,63}$/.test(path)&&path.length<=180?path:'[unrecognized-key]'; }
  function unknownFields(object,fields,path='',out=[]) {
    if(!object||typeof object!=='object'||Array.isArray(object))return out;
    for(const [key,value] of Object.entries(object)){
      if(out.length>=8)break;
      const field=Object.prototype.hasOwnProperty.call(fields,key)&&fields[key];
      if(!field){out.push(safeField(path+key));continue;}
      if(field.type==='message')for(const item of field.repeated?(Array.isArray(value)?value:[]):[value])unknownFields(item,field.fields,path+key+'.',out);
    }return out;
  }
  function join(parts) { const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out; }
  function integer(value) {
    if (typeof value==='number' && !Number.isSafeInteger(value)) fail('BINARY_INTEGER');
    if (!/^-?\d+$/.test(String(value))) fail('BINARY_INTEGER');
    let n=BigInt(value);if(n<-(1n<<63n)||n>=(1n<<63n))fail('BINARY_INTEGER');
    if(n<0)n=BigInt.asUintN(64,n);const out=[];
    do{const b=Number(n&127n);n>>=7n;out.push(b|(n?128:0));}while(n);
    return new Uint8Array(out);
  }
  function unbase64(value) {
    if(typeof value!=='string'||!/^[A-Za-z0-9_+\/-]*={0,2}$/.test(value)||value.length%4===1)fail('BINARY_BYTES');
    try{return Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));}catch{fail('BINARY_BYTES');}
  }
  function encode(object,fields,omitted=[],path='') {
    if(!object||typeof object!=='object'||Array.isArray(object))fail('BINARY_SCHEMA');
    const parts=[];
    for(const [key,value] of Object.entries(object)) {
      const field=Object.prototype.hasOwnProperty.call(fields,key)&&fields[key];
      if(!field)fail('BINARY_UNKNOWN_FIELD',path+key);
      if(field.type==='displayHint'){omitted.push(path+key);continue;}
      if(field.type==='emptyRepeated'){if(!Array.isArray(value)||value.length)fail('BINARY_TOKEN_JAR_UNSUPPORTED',path+key);continue;}
      const values=field.repeated?value:[value];
      if(!Array.isArray(values))fail('BINARY_SCHEMA');
      for(const item of values) {
        let data,wire=2;
        if(field.type==='message') data=encode(item,field.fields,omitted,path+key+'.');
        else if(field.type==='string') {if(typeof item!=='string')fail('BINARY_SCHEMA');data=encoder.encode(item);}
        else if(field.type==='bytes') data=unbase64(item);
        else if(field.type==='integer') {try{data=integer(item);}catch(e){e.schemaFields=safeField(path+key);throw e;}wire=0;}
        else if(field.type==='bool') {if(typeof item!=='boolean')fail('BINARY_SCHEMA');data=integer(item?1:0);wire=0;}
        else if(field.type==='enum') {if(typeof item!=='string'||!Object.prototype.hasOwnProperty.call(field.values,item))fail('BINARY_ENUM',path+key);data=integer(field.values[item]);wire=0;}
        else if(field.type==='float') {if(typeof item!=='number'||!Number.isFinite(item))fail('BINARY_SCHEMA');data=new Uint8Array(4);new DataView(data.buffer).setFloat32(0,item,true);wire=5;}
        else fail('BINARY_SCHEMA');
        parts.push(integer(field.n*8+wire));if(wire===2)parts.push(integer(data.length));parts.push(data);
      }
    }
    const result=join(parts);if(result.length>1000000)fail('BINARY_TOO_LARGE');return result;
  }
  function parameterVideo(raw) {
    // Only inspect the known video-id field. All opaque params are forwarded
    // unchanged; no flags or experiment/access data are edited.
    let decoded;try{decoded=decodeURIComponent(raw);}catch{fail('BINARY_TARGET');}
    const data=unbase64(decoded);if(data.length>8192)fail('BINARY_TARGET');let offset=0,video='';
    function read(){let n=0n;for(let i=0;i<10;i++){if(offset>=data.length)fail('BINARY_TARGET');const b=data[offset++];n|=BigInt(b&127)<<BigInt(i*7);if(!(b&128)){if(n>BigInt(Number.MAX_SAFE_INTEGER))fail('BINARY_TARGET');return Number(n);}}fail('BINARY_TARGET');}
    while(offset<data.length){const tag=read(),field=Math.floor(tag/8),wire=tag%8;if(!field)fail('BINARY_TARGET');
      if(wire===0){read();continue;}let size=wire===1?8:wire===5?4:wire===2?read():-1;
      if(size<0||offset+size>data.length)fail('BINARY_TARGET');
      if(field===2){if(wire!==2||video)fail('BINARY_TARGET');video=decoder.decode(data.subarray(offset,offset+size));}offset+=size;
    }return video;
  }
  function videoIdFromUrl(raw) {
    try{const page=new URL(raw);if(page.protocol!=='https:'||!['www.youtube.com','m.youtube.com'].includes(page.hostname))return '';
      const id=/^\/watch\/?$/.test(page.pathname)?page.searchParams.get('v'):(page.pathname.match(/^\/shorts\/([A-Za-z0-9_-]{11})\/?$/)||[])[1];
      return /^[A-Za-z0-9_-]{11}$/.test(id||'')?id:'';
    }catch{return '';}
  }
  function prepare(payload,url,headers,pageUrl) {
    const endpoint=new URL(url),page=new URL(pageUrl);
    if(endpoint.origin!==page.origin||!['www.youtube.com','m.youtube.com'].includes(endpoint.hostname))fail('BINARY_TARGET');
    if(endpoint.pathname!=='/youtubei/v1/comment/create_comment')fail('BINARY_NEW_COMMENT_ONLY');
    const pageVideo=videoIdFromUrl(pageUrl);
    const body=JSON.parse(payload);
    // createCommentParams is YouTube-owned opaque data, not a stable public
    // schema. A missing/unrecognized field 2 must not reject the correct page.
    // Still reject a positively decoded different video, and forward the exact
    // original params. Never rebuild or replace them with a guessed video ID.
    if(typeof body.createCommentParams!=='string'||!body.createCommentParams||body.createCommentParams.length>32768)fail('BINARY_PARAMS_MISSING');
    let requestVideo='';try{const found=parameterVideo(body.createCommentParams);if(/^[A-Za-z0-9_-]{11}$/.test(found))requestVideo=found;}catch{}
    const target={pageVideoId:/^[A-Za-z0-9_-]{11}$/.test(pageVideo||'')?pageVideo:'',requestVideoId:requestVideo,parameterTargetKnown:!!requestVideo};
    const targetFail=code=>{const error=Error(code);Object.assign(error,target);throw error;};
    if(!pageVideo)targetFail('BINARY_PAGE_VIDEO_ONLY');
    if(requestVideo&&requestVideo!==pageVideo)targetFail('BINARY_REQUEST_VIDEO_MISMATCH');
    if(typeof body.commentText!=='string'||!body.commentText.includes('cyt ile gönderildi'))fail('ATTRIBUTION_REQUIRED');
    if(typeof body.tenorId!=='string'||!/^\d{1,20}$/.test(body.tenorId))fail('BINARY_GIF_ID');
    const nativeClient=body.context?.client,expected={WEB:'1',MWEB:'2'}[nativeClient?.clientName];
    if(!expected||headers.get('x-youtube-client-name')!==expected
       ||headers.get('x-youtube-client-version')!==nativeClient.clientVersion)fail('BINARY_CLIENT_MISMATCH');
    const unknown=unknownFields(body,create);
    if(unknown.length){const error=Error('BINARY_UNKNOWN_FIELD');Object.assign(error,target,{schemaFields:unknown.join(', ')});throw error;}
    const omitted=[];let bytes;try{bytes=encode(body,create,omitted);}catch(error){Object.assign(error,target);throw error;}
    const nextHeaders=new Headers(headers);nextHeaders.set('content-type','application/x-protobuf');
    nextHeaders.delete('content-encoding');nextHeaders.delete('content-length');endpoint.searchParams.set('alt','json');
    return {url:endpoint.href,headers:nextHeaders,body:bytes,omitted,...target};
  }
  globalThis.CanDemirBinaryTest=Object.freeze({prepare,encodeContext:value=>encode(value,context),videoIdFromUrl,testVideo:TEST_VIDEO});
})();
