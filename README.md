# NTS

ERP barkod hareketlerini ve Canva tasarımlarını bir araya getiren yerel numune takip uygulaması.

## Kapsam

- Barkod ve versiyon bazında numune kartları, fotoğraflı pano ve liste.
- ERP hareketlerinden otomatik aşama belirleme, elle düzeltme ve çelişki gösterimi.
- Kalıp, kumaş, kesim, baskı–nakış, dikim, kalite, numune depo ve gönderi takibi.
- ERP personel/kaynak adı ile ERP kayıt kullanıcısının ayrı gösterimi.
- 60 saniyelik veri kontrolü ve değişen kartların güncellenmesi.
- Koleksiyon yönetimi, Canva görsel/metin alımı ve ERP model eşleştirmesi.
- C&A → HOUSE / BRAVADO / DIFUZED BV / NY APPAREL; ARLE → A BRAND marka bağlılıkları.
- Sekiz ana marka logolu menü; diğer markalar ve teyitli alt markalar açılır menülerde.

Bu depo 18 Kasım 2026 tarihinde güncel yerel V2 kaynaklarından hazırlanmıştır. V1 ve mevcut çalışan V2 klasörleri değiştirilmemiştir.

## Windows kurulumu

Python 3.12+, Windows PowerShell ve testler için Node.js gerekir.

```powershell
python -m pip install -r requirements.txt
Copy-Item server/source-records.example.json server/source-records.json
npm install
```

`server/source-records.json` dosyasına yerel modelhane kaynak kayıtlarını yerleştirin. Örnek dosya boştur; kaynak Excel, e-posta ekleri ve gerçek üretim kayıtları depoya dahil edilmez. ERP sorgularındaki mevcut model kapsamı `server/matches.sql` dosyasında tanımlıdır; kurumun veri kapsamına göre düzenlenmelidir.

ERP bağlantı bilgilerini depo dışında bir env dosyasında tutun ve `NUMUNE_ERP_CONFIG` ortam değişkenini bu dosyanın tam yoluna ayarlayın. Gerekli alanlar:

```dotenv
ERP_DB_SERVER=your-sql-server
ERP_DB_PORT=1433
ERP_DB_DATABASE=your-database
ERP_DB_USER=your-read-only-user
ERP_DB_PASSWORD=your-password
ERP_DB_ENCRYPT=false
ERP_DB_TRUST_CERT=true
```

SQL bağlantısı yalnız sunucu tarafındaki PowerShell köprüsünde kurulur. ERP tablolarına yazma işlemi yoktur. `server/*.sql` kurumun mevcut MSSQL şemasına özeldir.

Canva OAuth bağlantısı ayrı kurulmalıdır. `server/canva_sync.py` içindeki `PRIVATE` klasör ayarı, bu kurulumun dışarıda tuttuğu `numunetakip-canva-client.json` ve `numunetakip-canva-token.json` dosyalarını gösterir. Bu dosyaları Git'e eklemeyin. OAuth yetkilendirme kurulum aracı bu kaynak kopyasında bulunmaz.

```powershell
.\NUMUNE-TAKIP-V2-AC.bat
```

Uygulama: http://127.0.0.1:8845. Sunucu varsayılan olarak yalnız bu bilgisayarda dinler. Başlatıcı tarayıcıyı açar; sunucu günlükleri ve yerel SQLite veritabanı `server/cache` altında oluşur.

## Testler

```powershell
python -m unittest discover -s tests -q
npm test
```

## Veri ve çalışma sınırları

- Kaynak kod, SQL sorguları, süreç kuralları, marka tanımları ve testler bu depodadır.
- Şifreler, OAuth anahtarları/tokenları, ERP anlık görüntüleri, ürün fotoğrafları, Canva içerikleri, çalışan grup kataloğu ve yerel SQLite verileri dahil edilmemiştir.
- Koleksiyonlar ve dikim grupları yerel SQLite'ta saklanır. Kartların elle düzeltmeleri tarayıcının localStorage alanındadır; ortak kullanıcı senkronizasyonu ve rol bazlı yetki sistemi yoktur.
- ERP bağlantısı olmadan ekran açılabilir; canlı üretim verisi için kurum ağına ve yetkili bağlantı ayarlarına ihtiyaç vardır. Bu depo boş başlangıç verileri içerir.
- Marka bağlılıklarının kaynağı `research/brand-parent-overrides.json`; dağıtılan taksonomi `dist/brand-taxonomy.json` dosyasıdır.

Herhangi bir açık kaynak lisansı verilmemiştir.
