# TYRO Forecast

> AI destekli satış tahmini ve senaryo simülasyon paneli — Tiryaki trader bazlı gelişmiş forecasting.

Tahmin modeli (8 algoritma paralel), backtest doğruluğu (MAPE), what-if simülasyon, hedef backcast, Monte Carlo güven aralığı ve ürün bazlı reconcile içeren tam-stack bir web uygulaması. MSAL ile Azure AD kimlik doğrulaması üzerinden Dataverse'ye doğrudan bağlanır.

---

## ✨ Özellikler

### Tahmin motoru
- **8 paralel model**: Holt-Winters · Outlier STL+ETS · Theta · Holt's Linear · STL+ETS · Seasonal Naive · Croston (TSB) · Moving Average
- **Otomatik Best Fit seçimi** — backtest MAPE (holdout doğruluk) ile düşük hatalı model işaretlenir
- **Hyndman-Boylan ADI/CV² sınıflandırma** — smooth / erratic / intermittent / lumpy
- **Bottom-up reconciliation** — Σ ürün tahminleri = trader toplam tahmini olacak şekilde pro-rata scaling
- **Year-partitioned Dataverse aggregate** — 50K limit'i aşan trader'larda yıl bazlı parallel queries

### Senaryo simülasyonu
- Volume çarpanı (±%50)
- Mevsim kayması (±3 ay)
- Müşteri kaybı (top 5 destinations)
- Origin kaybı (şirket grubu)
- **Hedef Backcast** — bir target'a göre geri-projeksiyon + fizibilite skoru (easy / moderate / hard / unrealistic)
- **Monte Carlo** — wild bootstrap residual ile 200 simülasyon, P10/P90 koridor

### UX
- 3-seviye trader filtresi (Ana Trader → Trader → Tek Ürün)
- Inline SVG forecast chart (Cubic Bezier smoothing)
- Mevsim profili / R² trend gücü / güven seviyesi mini kartlar
- Aylık tahmin detay tablosu + Ürün bazlı tahmin (Top 30, sortable, sparkline)
- Yatay model karşılaştırma kartları + MAPE eğitim bandı
- Premium tooltipler (kullanıcı-dostu açıklama + teknik detay + formül)
- Excel (SheetJS) + PDF (window.print A4 landscape) export
- Tam Türkçe — `tr-TR` locale uppercase, sayı formatlama, ay isimleri

---

## 🛠 Teknoloji

| Katman | Stack |
|---|---|
| **UI** | React 19 · TypeScript · Vite 8 · Tailwind CSS v4 (`@theme`) |
| **Auth** | `@azure/msal-browser` v5 — loginRedirect flow |
| **Veri** | Dataverse Web API v9.2 — FetchXML aggregate + OData filter |
| **Tahmin** | Pure JS (no dependencies) — `salesForecast.js` 1100+ satır |
| **Senaryo** | Pure JS — `salesSimulation.js` |
| **İkonlar** | `@hugeicons/react` + `lucide-react` |
| **Animasyon** | `framer-motion` |
| **Export** | SheetJS (CDN lazy load) + native `window.print` |

---

## 🚀 Başlangıç

### Gereksinimler
- **Node.js ≥ 20** (`.nvmrc` ile uyumlu)
- **npm** veya **pnpm**
- Azure AD tenant + uygulamada kayıtlı bir SPA Redirect URI
- Dataverse environment erişim izni (`user_impersonation` delegated scope)

### Kurulum

```powershell
# Repo'yu klonla
git clone https://github.com/ttech-AI/tyroforecast.git
cd tyroforecast

# Bağımlılıkları yükle
npm install

# Environment dosyasını hazırla
copy .env.example .env
# .env'i kendi Azure / Dataverse değerlerinle düzenle
```

### Çalıştır

```powershell
npm run dev        # Geliştirme — http://localhost:5173
npm run build      # Üretim build — dist/
npm run preview    # Build sonrası lokal önizleme
npm run lint       # ESLint kontrolü
```

---

## ⚙️ Yapılandırma

### 1. Azure AD App Registration

Azure Portal → App registrations → New registration:
- **Name**: `TYRO Forecast Web App`
- **Supported account types**: Single tenant
- **Redirect URI**: `Single-page application (SPA)` + `http://localhost:5173/` (dev) ve canlı URL'iniz

**API permissions** ekle:
- `Dynamics CRM` → `user_impersonation` (Delegated)
- Eğer ikinci bir environment kullanılıyorsa onun için de aynı scope

Tenant admin onayı gerekebilir.

`.env`'e şu değerleri kopyala:
```
VITE_AZURE_CLIENT_ID=<Application (client) ID>
VITE_AZURE_TENANT_ID=<Directory (tenant) ID>
```

### 2. Dataverse erişimi

Power Platform admin center → Environments → ilgili environment URL'ini al:
```
VITE_DATAVERSE_URL=https://your-org.crm4.dynamics.com
VITE_HISTORICAL_DATAVERSE_URL=https://your-org.crm4.dynamics.com
```

Kullanılan tablolar:
- `mserp_tryaiinventoryagingreportentities` — envanter raporu
- `mserp_tryhistoricalsalesdemandentities` — geçmiş satış (forecast kaynak)
- `mserp_etgtradertableentities` — trader dizini

İlgili kullanıcıya bu tablolarda `Read` rolü verilmeli.

### 3. (Opsiyonel) Şirket label fallback

`mserp_trycompanyname` alanı entity'de henüz populate edilmediyse `src/lib/forecast/salesForecast.js` içindeki `COMPANY_ALIAS`'a manuel eşleme eklenebilir (mevcut sadece `DTHY → DANE` merge alias'ı içerir).

---

## 📁 Proje yapısı

```
src/
├── App.tsx                          # Top-level routing (home / forecast / data / settings)
├── main.tsx                         # MsalProvider wrap (StrictMode KAPALI — bkz. not)
├── components/
│   ├── SalesForecastPage.jsx        # Ana modül (~4000 satır, tüm forecast UI)
│   ├── Sidebar.tsx · TopNav.tsx     # Shell layout
│   ├── Login.tsx · TyroLogo.tsx     # Auth giriş
│   └── *Card.tsx                    # Dashboard kartları
└── lib/forecast/
    ├── salesForecast.js             # 8 model + ADI/CV² + reconcile (pure JS)
    ├── salesSimulation.js           # Senaryo orkestrasyonu (pure JS)
    ├── dataverseService.js          # MSAL + FetchXML aggregate + OData (pure JS)
    └── msalContext.jsx              # React Context: account / ready / login / logout
```

### Mimari notlar

- **StrictMode KAPALI**: React 19 StrictMode double-mount, MSAL `handleRedirectPromise()`'i URL hash'i iki kez tüketmeye zorluyor → ilk girişte auth state set olmuyordu. Referans TYRO-WMSAgent uygulaması da StrictMode'suz çalışıyor.
- **Cache versioning**: `localStorage` prefix `tyroforecast_fcst_v3` — schema değişimlerinde bump'lanır (eski cache otomatik invalidate).
- **`position: fixed` tooltip portal**: `transform` parent'lar containing block oluşturduğu için tüm tooltipler `createPortal` ile `document.body`'e render edilir.

---

## 📊 Tahmin metodolojisi (özet)

### Model seçimi
8 model paralel koşturulur. Her biri için:
1. **Backtest**: Son `min(6, kayıt/6)` ay tutulur (holdout). Geri kalan tarihçe ile model eğitilir, holdout aylar tahmin edilir, gerçekle karşılaştırılır.
2. **MAPE hesaplanır**: `mean(|gerçek − tahmin| / gerçek) × 100`
3. **Best Fit**: En düşük MAPE'li model seçilir.

| MAPE | Yorum |
|---|---|
| %0-10 | 🟢 Mükemmel — planlama için güvenle kullan |
| %10-20 | 🟡 Kabul edilebilir — yön gösterir, ±%20 marj bırak |
| %20-30 | 🟠 Düşük — koridor şeklinde yorumla |
| %30+ | 🔴 Gürültülü — referans amaçlı, nokta tahmin alma |

### Bottom-up reconciliation
Ürün bazlı tahminlerin toplamı (Σ top-30 forecast) trader toplam tahminine eşit olmayabilir. Pro-rata scaling:
```
factor = traderTotal / Σ itemForecasts
adjusted[i] = item[i].forecast × factor
```

---

## 🚢 Deploy

### Yol A — GitHub Pages (`gh-pages` branch, runner gerek yok) ✅

Setup hazır. Sadece komut:

```powershell
npm run deploy
```

Bu komut:
1. `tsc -b && vite build` — production build (`/tyroforecast/` base path ile)
2. `node scripts/copy-404.mjs` — `dist/404.html` oluşturur (SPA fallback)
3. `gh-pages -d dist -b gh-pages` — `dist/` içeriğini `gh-pages` branch'ine push eder

**İlk kurulum** (sadece bir kez):
1. GitHub repo → Settings → Pages → **Source: "Deploy from a branch"** → Branch: `gh-pages` → `/ (root)` → Save
2. Azure App Registration → Authentication → SPA Redirect URI'lere ekle:
   - `https://ttech-ai.github.io/tyroforecast/`
3. (Opsiyonel) Custom domain kullanılacaksa `public/CNAME` dosyası oluştur

Yayın URL'i: **https://ttech-ai.github.io/tyroforecast/**

> ⚠️ Vite `base` path'i `vite.config.ts`'de `'/tyroforecast/'` olarak hardcoded. Repo adı değişirse veya custom domain kullanılacaksa `BASE_PATH=/yeni-path/` env var'ı ile override edilebilir.

### Yol B — Self-hosted runner (GHE Actions)

`.github/workflows/deploy.yml` ekle (`runs-on: self-hosted` — runner kurulumu IT ekibinden istenir).

### Yol C — Azure Static Web Apps / Vercel / Netlify

Repo bağlanır, push'ta otomatik build alır.

---

## 🧪 Doğrulama checklist

```powershell
npm run build         # TS + Vite build temiz olmalı
```

Browser'da:
- [ ] Login → Microsoft popup → consent → dashboard
- [ ] Sidebar "Satış Tahmini" → filtre paneli
- [ ] Ana Trader veya Trader seçimi → Hesapla
- [ ] Trader profil kartı + 3 stat + 3 top breakdown
- [ ] Model sekmeleri (MAPE sıralı) + InfoTip rich tooltips
- [ ] Tahmin grafiği + Gelişmiş Filtre dropdown
- [ ] Ürün bazlı tablo → satır tıklama chart filter
- [ ] Simülasyon drawer → slider'lar + Backcast + MC
- [ ] Excel / PDF export

---

## 🔐 Güvenlik notları

- `VITE_AZURE_CLIENT_ID` ve `VITE_AZURE_TENANT_ID` **secret değildir** — SPA için public client. Asıl güvenlik Azure AD katmanında (kullanıcı auth + Dataverse RBAC).
- `.env` her zaman gitignore'da kalmalı.
- Dataverse'ye giden tüm istekler kullanıcının kendi access token'ıyla yapılır (delegated). Servis prensibi: her kullanıcı sadece kendi yetkili olduğu veriyi görür.
- Token cache `sessionStorage`'da (tab kapanırken silinir). Logout için `msalLogout()` + `localStorage` temizliği.

---

## 📝 Katkı

Dahili Tiryaki Teknoloji repo'su. Bug report / feature request için Issues sekmesi.

Forecast modellerinde değişiklik yapılacaksa `src/lib/forecast/salesForecast.js` içindeki `FORECAST_MODELS` registry'sini güncelle (label / short / description / strength / weakness / whenToUse / formula alanları UI tooltip'lerinde kullanılıyor).

---

## 📜 Lisans

Tiryaki Teknoloji A.Ş. — internal use.
