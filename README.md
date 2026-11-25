# NTS

NTS, bir kıyafet modelinin tasarım sunumundan numune üretimine kadar geçtiği aşamaları takip eder. Tasarım ekibi **Koleksiyon**’da slaytları, ürün görsellerini ve üretime devir notlarını görür. Modelhane **Üretim**’de aynı modelin barkod ve versiyon bazındaki numunelerini izler. Katalog ekibi **Üni-verse**’te yakın zamanda eklenen ve güncellenen ürünlerin ERP karşılıklarını inceler.

## Demoyu aç

Python 3.12 veya üzeriyle, repo klasöründe şu komutu çalıştır:

```powershell
python -m http.server 8845 --bind 127.0.0.1 --directory dist
```

[Üretim demosu](http://127.0.0.1:8845/?demo=koleksiyon) doğrudan panoyu açar. Komut çalışırken bağlantıyı aynı bilgisayarda aç. Demo 10 temsili model ve çizimle gelir. Dördü koleksiyonda devir bekler, altısı farklı üretim aşamalarındadır. Demo adımları bu tarayıcı sekmesinde saklanır.

### İlk numuneyi üretime gönder

1. Üstte **Koleksiyon**’a geçip **Düğmeli hırka** modelini aç.
2. **Üretime aktar**’a bas, ilk prova için bir tasarım notu gir ve devri onayla.
3. Üretim panosunda aynı görselin **Kalıp sırası**na geldiğini kontrol et. Kartta numune kodu, barkod ve versiyon görünür.
4. Kartın üstündeki işlem düğmesiyle kalıbı tamamla, modeli kesime al ve dikime geçir. Dikimden teslim alınca kart **Kalitede** sütununa geçer. Numuneyi onaylayınca **Tamamlandı** olarak görünür.
5. **Koleksiyon görseli**’ne dönüp aynı modelin son aşamasını gör. Kendi fotoğrafınla denemek için Koleksiyon’da **Görsel ekle**’yi kullan.

## Gerçek verilerle kullanım

### Koleksiyon

**Canva’dan al** düğmesine basıp yetkili Canva hesabının erişebildiği sunumun bağlantısını gir. İçeri alındıktan sonra koleksiyon kartındaki **Sunumu aç** ile slaytlara git. Ürün, slayt başlığı veya ERP referansıyla arama yapabilirsin. **Koleksiyon oluştur** ile boş bir çalışma da açabilirsin.

Canva içe aktarımı PDF’deki seçilebilir metinleri ve görselleri okur. Model kodu ve işlem talebi bulunursa bunları ürünle ilişkilendirir. Yalnızca görüntüye gömülü yazılar için OCR bulunmaz. **ERP modelini bağla** ile eşleşmeyi kontrol et ve **Üretime aktar** ile tasarım kararını ekibe ilet. **Üretimde gör** ilgili modelin numunelerine götürür. İzlemeye alınan Canva sunumlarında takip başlangıcından sonraki içerik değişiklikleri kontrol edilir.

### Üretim

**Pano** aşamaları tek yatay sırada, **Liste** numuneleri satır satır gösterir. Model kodu, barkod, çalışan veya koleksiyon adıyla arama yap. **Markalar** ve **Filtreler** ile kapsamı daralt. **Özet**’te ERP okuma durumu, ekip adresi ve veri analizi bulunur.

| Aşama | Kartın oraya gelme koşulu |
| --- | --- |
| Kalıp sırası / Kalıp tamamlandı | Daha ileri bir hareket yoksa, ERP numune kartındaki Kalıp No alanına göre ayrılır. |
| Kesimde | Barkod kartı oluşur. |
| Ara işlem teyidi / Baskı–Nakış | Kesim okutulur. Ara işlem seçimi belirsizse teyit istenir. Baskı veya nakış tanımlıysa ilgili aşamaya geçer. |
| Dikim sırası / Dikimde | Ara işlem gerekmiyorsa kesimden sonra Dikim sırası. Dikime giden barkod okutulunca Dikimde. |
| Kalitede | Dikimden dönen barkod okutulur. Kalite onayı kartta ayrıca kaydedilir. |
| Numune Depo / Gönderi | Numuneyle eşleşen ve ERP kurallarını karşılayan fiş hareketleriyle ilerler. |

Kartı açarak hareket geçmişini, revizyon notunu, sorumluyu, hedef tarihi ve onay durumunu görebilir veya düzenleyebilirsin. ERP’de aşamayı başlatan hareket tarihi doğrulanabiliyorsa, kart o aşamada kaç gündür beklediğini gösterir. Atanmış işlem personeli veya ekip etiketi ve ERP kaydını oluşturan kullanıcı ayrı alanlardır. Fiziksel okutan kişinin adı ancak kaynakta doğrulanabiliyorsa bilinir.

Fotoğraftan tutup kartı başka bir aşamaya bırakarak elle düzeltme yapabilirsin. ERP ile farklılık olduğunda kartta görünür. **ERP aşamasını kullan** ile otomatik duruma dönersin. ERP son 30 İstanbul takvim günündeki değişiklikler için 60 saniyede bir kontrol edilir. Değişen kartlar sayfa yenilenmeden güncellenir.

### Üni-verse

- **Eklenen ve güncellenenler** son 30 gündeki katalog kayıtlarını ve varsa ERP numune eşleşmesini gösterir.
- **Katalog eşleşmesi bekleyenler** ERP’de onaylı olup katalogda eşleşmesi bulunmayan numuneleri gösterir.
- **Web scraping · Üniteks üretimi** UFF’de son 30 günde eklenen ve Üniteks üretimi olarak filtrelenen ürünleri, eşleşme dayanağıyla listeler.

Üni-verse ve UFF ekranları kaynaklardan okur. NTS’deki notlar, koleksiyon bağlantıları ve onaylar NTS veritabanında kaydedilir.

## Windows’ta sunucuyu çalıştır

Python 3.12 veya üzeri ve PowerShell gerekir. Statik demo için yukarıdaki komut yeterlidir. Gerçek bağlantıları ve ekip takibini kullanmak için şu komutlarla NTS sunucusunu başlat:

```powershell
python -m pip install -r requirements.txt
.\NUMUNE-TAKIP-V2-AC.bat
```

[NTS](http://127.0.0.1:8845/) varsayılan olarak bu bilgisayarda açılır. Aynı Wi-Fi ağına ekip erişimi vermek için ana bilgisayarda `NUMUNE-TAKIP-V2-EKIP-AC.bat` çalıştır ve **Üretim → Özet → Ekip adresi** bağlantısını paylaş. Ortak revizyon, sorumlu, hedef tarih ve onaylar aynı NTS sunucusunda tutulur. Elle aşama düzeltmeleri tarayıcıya özeldir.

### Bağlantı ayarları

| Kaynak | Ayar |
| --- | --- |
| MSSQL ERP | `NUMUNE_ERP_CONFIG` değişkenini depo dışında duran env dosyasının tam yoluna ayarla. SQL sorguları desteklenen kurum şemasına göre okunur. |
| Canva | `NUMUNE_CANVA_CONFIG_DIR` ile yetkili OAuth istemci ve token dosyalarının klasörünü göster. Varsayılan konum `~/.nts/canva`. Sunum okuma ve dışa aktarma izinleri olan yetkili bir oturum gerekir. |
| Üni-verse | `NUMUNE_UNIVERSE_SETTINGS` ile salt okunur katalog bağlantısını içeren JSON dosyasını göster. Okuyucu `ConnectionStrings.DefaultConnection` alanını kullanır. |
| UFF | `NUMUNE_UFF_ORIGIN` ile HTTPS hizmet adresini belirt. Gerekiyorsa `NUMUNE_UFF_TOKEN_FILE` veya `NUMUNE_UFF_TOKEN` ile yetkilendir. Zara tedarikçi kodları için `NUMUNE_UFF_ZARA_SUPPLIER_CODES` virgülle ayrılmış değerler kabul eder. |

ERP env dosyası örneği:

```dotenv
ERP_DB_SERVER=your-sql-server
ERP_DB_PORT=1433
ERP_DB_DATABASE=your-database
ERP_DB_USER=your-read-only-user
ERP_DB_PASSWORD=your-password
ERP_DB_ENCRYPT=true
ERP_DB_TRUST_CERT=false
```

Canva istemci dosyasının adı `numunetakip-canva-client.json`, yetkili oturum dosyasının adı `numunetakip-canva-token.json` olmalı. İlk OAuth yetkilendirmesi dışarıda tamamlanır. Kimlik bilgilerini depo dışında sakla. Bu deponun demo kayıtları temsili verilerden oluşur.

## Test

```powershell
python -m unittest discover -s tests -q
npm install
npm test
```

JavaScript testleri için Node.js 22.12 veya üzeri kullan. NTS sunucusu Node.js gerektirmez.

Kaynak kod için açık kaynak lisansı tanımlanmamıştır.
