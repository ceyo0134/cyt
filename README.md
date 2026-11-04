# cyt

YouTube yorumlarına GIF ekleme denemesi yapan deneysel bir Firefox eklentisi.

**Durum: DENEYSEL.** GIF gönderim protokolü doğrulanmamıştır; çalışmayabilir. İki gönderim arasında 30 sn beklenir, hata durumunda otomatik tekrar yapılmaz. YouTube bu özelliği zaten kullanıcılara açmaktadır; resmi uygulama kullanılabildiğinde bu eklentiye gerek kalmaz.

## Lisans ve köken

GPL-3.0. Bu proje şu çalışmaların türevidir ve lisans gereği kaynak kodu açıktır:

- [rayytor/desktop_gifs](https://github.com/rayytor/desktop_gifs) (GPL-3.0): özgün masaüstü eklenti.
- "Can Demir GIF" 0.8.22 Android uyarlaması (GPL-3.0): bu depodaki kodun doğrudan temeli.

Özgün telif ve lisans bildirimleri korunmuştur.

## Değişiklikler (özgün Android uyarlamasına göre)

- Ad `cyt` olarak değiştirildi. Zorunlu yorum imzası kaldırıldı; yazı yazmadan, yalnızca GIF ile de gönderilebilir.
- Tek test videosu sınırı kaldırıldı; her videoda çalışır.
- "Tek kullanımlık" kilit yerine 30 sn bekleme süresi kondu.
- Android yerel köprüsü (nativeMessaging) izni kaldırıldı; eklenti tek başına Firefox'ta çalışır.

## Kurulum

Actions sekmesi `cyt.xpi` dosyasını derleyip **Releases > latest** altına koyar. Firefox Nightly (Android) ile kurulabilir; imzasız eklenti için `about:config` içinde `xpinstall.signatures.required` değerini `false` yapmak gerekir.

## APK

Actions > build-apk, `cyt.apk` dosyasını **Releases > apk-latest** altına koyar. Uygulama GeckoView (Firefox motoru) tabanlıdır, yalnızca YouTube ve Google giriş alan adlarına gitmeye izin verir ve eklenti içine gömülüdür. Debug imzalıdır; kurmak için bilinmeyen kaynaklara izin gerekir.
