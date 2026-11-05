// GPL-3.0. Shared Android/desktop policy. A release cannot enable an unverified
// upload protocol by changing a page flag, a country code or an account token.
(() => {
  const attribution = '\u200b';
  const reason = 'TENOR_ID_UNAVAILABLE';
  const description = 'DENEME SÜRÜMÜ: GIF gönderimi doğrulanmadı. İki gönderim arasında 30 sn beklenir; düzenleme ve otomatik tekrar kapalı.';
  function correlation() {
    return [...crypto.getRandomValues(new Uint8Array(12))].map(v => v.toString(16).padStart(2, '0')).join('');
  }
  // Kept as a rejecting compatibility API for any stale caller. Selecting a GIF
  // must never generate a plain-link comment, even when a native bridge fails.
  function linkDraft() { throw Error('TEXT_LINK_FORBIDDEN'); }
  function category(status, http = 0) {
    if (status === reason) return 'UNSUPPORTED_INTEGRATION';
    if (status === 'LINK_PREPARED') return 'TEXT_LINK_ONLY';
    if (http === 401 || http === 403) return 'AUTH_OR_PERMISSION';
    if (http === 400) return 'REQUEST_REJECTED';
    if (/NETWORK|TIMEOUT|ABORT|NO_HTTP/.test(status)) return 'NETWORK_OR_UNKNOWN';
    if (/^BINARY_|BODY|MARKER|SERIALIZED|ATTRIBUTION|HOOK/.test(status)) return 'CLIENT_PREFLIGHT';
    if (/PUBLIC|VERIFICATION|MISSING_ACTION|UNREADABLE_RESPONSE/.test(status)) return 'VERIFICATION';
    return 'OTHER';
  }
  function safeMessage(message) {
    // Error payloads can echo private input. Persist only known generic phrases.
    const allowed = ['Request contains an invalid argument.', 'Returned error', 'Comment failed to post.'];
    return allowed.includes(message) ? message : message ? 'Sunucu açıklaması güvenli tanı kapsamı dışında.' : '';
  }
  function recommendation(status, http) {
    if(status==='BINARY_UNKNOWN_FIELD'||status==='BINARY_ENUM'||status==='BINARY_TOKEN_JAR_UNSUPPORTED')return 'Gönderim dönüştürücüsü bu isteğin bir alanını desteklemiyor. Tanıdaki Dönüştürülemeyen alanlar satırını paylaş. Alanın değeri kaydedilmez; YouTube’a istek gönderilmedi.';
    if(status==='BINARY_PAGE_VIDEO_ONLY')return 'Açık sayfa test videosu değil. Ana menüde Test videosunu aç düğmesini kullan. Bu işlemde YouTube’a istek gönderilmedi.';
    if(status==='BINARY_REQUEST_VIDEO_MISMATCH')return 'YouTube’un yorum isteği açık sayfadan farklı bir videoya ait. Sayfayı yenile; bu işlemde YouTube’a istek gönderilmedi.';
    if(/^BINARY_/.test(status))return 'İkili test yerel kontrolde durduruldu; YouTube’a istek gönderilmedi. Tanıyı kopyala. Bu sonuç sunucu reddi değildir.';
    if (status === 'PUBLIC_GIF_ATTACHMENT_MISSING') return 'Okunan yorumda hareketli GIF eki bulunamadı; metnin kaydedilmesi GIF gönderiminin başarılı olduğu anlamına gelmez. Otomatik tekrar yapılmadı.';
    if (status === 'PUBLIC_SELECTED_GIF_UNVERIFIED') return 'Yorumda GIF eki var; yeni seçilen GIF ile eşleşmediği için düzenleme doğrulanmadı. Otomatik tekrar yapılmadı.';
    const kind = category(status, http);
    if (kind === 'UNSUPPORTED_INTEGRATION') return 'GIF gönderilmedi. Arama, önizleme ve favoriler kullanılabilir; çalışan ek protokolü doğrulanmadan gönderim açılmaz.';
    if (kind === 'TEXT_LINK_ONLY') return 'Yalnız metin bağlantısı hazır. Yayımlama için YouTube düğmesini kullan ve yorumu yeniden açarak kontrol et.';
    if (kind === 'NETWORK_OR_UNKNOWN' || kind === 'VERIFICATION') return 'Sonuç belirsiz; aynı yorumu yeniden göndermeden yorum bağlantısını kontrol et.';
    if (kind === 'AUTH_OR_PERMISSION') return 'Gerçek YouTube arayüzündeki hesap ve yorum iznini kontrol et; giriş bilgilerini aktarma.';
    return 'Güvenli işlem kimliği ve durum koduyla kaynak istemciyi karşılaştır; otomatik tekrar yapma.';
  }
  globalThis.CanDemirAvailability = Object.freeze({ gifPosting: true, testOnly: false, binaryTest: true, testVideo:'YJqo89sa6iw', reason, description,
    attribution, correlation, linkDraft, category, safeMessage, recommendation });
})();
