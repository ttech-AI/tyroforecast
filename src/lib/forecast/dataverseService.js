import { PublicClientApplication, InteractionRequiredAuthError } from '@azure/msal-browser';

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MSAL CONFIGURATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Azure SPA için Client/Tenant ID public clients — secret değil, fallback olarak
// bundle'a hardcoded girer (env var'lar override eder; CI'da Variables ile gelir).
const CLIENT_ID = import.meta.env.VITE_AZURE_CLIENT_ID || '951a2be8-e3e2-4595-bd93-27b1d11a563f';
const TENANT_ID = import.meta.env.VITE_AZURE_TENANT_ID || '9efa3bdf-67ad-47e3-8dfb-d1df79a6d7fa';
const DATAVERSE_URL = import.meta.env.VITE_DATAVERSE_URL || 'https://operations-tiryaki.crm4.dynamics.com';
const ENTITY_NAME = import.meta.env.VITE_DATAVERSE_ENTITY || 'mserp_tryaiinventoryagingreportentities';
// Logical name (singular) — used by FetchXML. Standard Dataverse pluralization: entities → entity
const ENTITY_LOGICAL = import.meta.env.VITE_DATAVERSE_ENTITY_LOGICAL
  || (ENTITY_NAME.endsWith('ies') ? ENTITY_NAME.slice(0, -3) + 'y'
      : ENTITY_NAME.endsWith('s') ? ENTITY_NAME.slice(0, -1)
      : ENTITY_NAME);

export const MSAL_ENABLED = !!(CLIENT_ID && TENANT_ID);

let msalInstance = null;

// MSAL redirect URI — Vite'ın BASE_URL'i ile birlikte origin'i kullan.
// Dev'de: http://localhost:5173/
// GitHub Pages prod'da: https://ttech-ai.github.io/tyroforecast/
// Bu URI, Azure App Registration → Authentication → SPA platform'unda kayıtlı olmalı.
const BASE_URL = (import.meta.env.BASE_URL || '/');
const redirectUri = (typeof window !== 'undefined')
  ? `${window.location.origin}${BASE_URL}`.replace(/\/+$/, '/')
  : '/';

const msalConfig = {
  auth: {
    clientId: CLIENT_ID || '',
    authority: `https://login.microsoftonline.com/${TENANT_ID || ''}`,
    redirectUri,
    postLogoutRedirectUri: redirectUri,
  },
  cache: { cacheLocation: 'sessionStorage', storeAuthStateInCookie: false },
};

const loginRequest = { scopes: ['User.Read'] };
const dataverseScopes = { scopes: [`${DATAVERSE_URL}/.default`] };

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// MSAL INIT & AUTH
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function initMsal() {
  if (!MSAL_ENABLED) return null;
  if (msalInstance) return msalInstance;
  msalInstance = new PublicClientApplication(msalConfig);
  await msalInstance.initialize();
  try { await msalInstance.handleRedirectPromise(); } catch (_) { /* redirect handled */ }
  return msalInstance;
}

export function getMsalInstance() { return msalInstance; }

export function getActiveAccount() {
  if (!msalInstance) return null;
  return msalInstance.getAllAccounts()[0] || null;
}

export async function loginPopup() {
  if (!msalInstance) await initMsal();
  const res = await msalInstance.loginPopup(loginRequest);
  return res.account;
}

export async function loginRedirect() {
  if (!msalInstance) await initMsal();
  await msalInstance.loginRedirect(loginRequest);
}

export async function logout(account) {
  if (!msalInstance) return;
  await msalInstance.logoutRedirect({ account, postLogoutRedirectUri: redirectUri });
}

export async function getGraphToken(account) {
  try {
    const r = await msalInstance.acquireTokenSilent({ ...loginRequest, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await msalInstance.acquireTokenPopup(loginRequest);
      return r.accessToken;
    }
    throw e;
  }
}

export async function getDataverseToken(account) {
  try {
    const r = await msalInstance.acquireTokenSilent({ ...dataverseScopes, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await msalInstance.acquireTokenPopup(dataverseScopes);
      return r.accessToken;
    }
    throw e;
  }
}

// Belirli bir Dataverse URL'i için token al (örn. UAT environment)
export async function getDataverseTokenFor(account, baseUrl) {
  const scopes = { scopes: [`${baseUrl}/.default`] };
  try {
    const r = await msalInstance.acquireTokenSilent({ ...scopes, account });
    return r.accessToken;
  } catch (e) {
    if (e instanceof InteractionRequiredAuthError) {
      const r = await msalInstance.acquireTokenPopup(scopes);
      return r.accessToken;
    }
    throw e;
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// GRAPH API — User Profile
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function fetchUserProfile(account) {
  const token = await getGraphToken(account);
  const res = await fetch('https://graph.microsoft.com/v1.0/me?$select=displayName,mail,jobTitle', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Graph API ${res.status}`);
  return res.json();
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATAVERSE API — Entity Fetch
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
const API_BASE = `${DATAVERSE_URL}/api/data/v9.2/${ENTITY_NAME}`;

const DV_HEADERS = (token) => ({
  Authorization: `Bearer ${token}`,
  'OData-MaxVersion': '4.0',
  'OData-Version': '4.0',
  Accept: 'application/json',
  Prefer: 'odata.include-annotations="*"',
});

async function dvFetch(url, token, prefer) {
  const headers = { ...DV_HEADERS(token) };
  if (prefer) headers.Prefer = prefer;
  const res = await fetch(url, { headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body?.error?.message || JSON.stringify(body);
    } catch { /* ignore parse error */ }
    throw new Error(`Dataverse API ${res.status}: ${detail}`);
  }
  return res.json();
}

const DATE_FIELD = 'mserp_headerreportdate';

// Only fetch these fields from Dataverse (user-approved list)
const SELECT_FIELDS = [
  'mserp_inventcolorid','mserp_closingpricemst','mserp_purchlifo','mserp_purchpricemst',
  'mserp_amountmst','mserp_qty','mserp_itemname','mserp_headerreportdate','mserp_companyid',
  'mserp_etgproductlevel03name','mserp_sfilotid','mserp_purchweav','mserp_amountsec',
  'mserp_itemid','mserp_inventsizeid','mserp_inventdimension1','mserp_etgproductlevel02name',
  'mserp_inventlocationid','mserp_prodweav','mserp_purchfifo','mserp_purchpricesec',
  'mserp_prodfifo','mserp_prodlifo','mserp_vesselassignmentid','mserp_etgproductlevel01name',
  'mserp_inventsiteid','mserp_inventsitename','mserp_pricesec','mserp_companyname',
  'mserp_product','mserp_closingpricesec','mserp_pricemst','mserp_etgproductlevel04name',
  'mserp_inventbatchid','mserp_inventdimension2','mserp_inventlocationname',
  // mserp_inventdimension2 = proje no (proje master entity'sindeki mserp_projid ile join)
].join(',');

// Tiryaki proje master entity — projid → trader / ana trader eşlemesi
const PROJECT_ENTITY_NAME = 'mserp_etgtryprojecttableentities';
const PROJECT_API_BASE = `${DATAVERSE_URL}/api/data/v9.2/${PROJECT_ENTITY_NAME}`;
// Trader master entity — traderid → description (isim) eşlemesi
const TRADER_ENTITY_NAME = 'mserp_etgtradertableentities';
const TRADER_API_BASE = `${DATAVERSE_URL}/api/data/v9.2/${TRADER_ENTITY_NAME}`;
// Historical sales demand entity — geçmiş sipariş satırları (forecasting kaynağı)
// Entity artık PROD'a alındı; default PROD URL'i, gerekirse .env ile override edilir.
const HISTORICAL_DATAVERSE_URL = import.meta.env.VITE_HISTORICAL_DATAVERSE_URL || 'https://operations-tiryaki.crm4.dynamics.com';
// Env'lere göre entity adı farklı olabilir → birkaç varyant denenir, çalışanı runtime'da bulunur
const HISTORICAL_SALES_VARIANTS = [
  import.meta.env.VITE_HISTORICAL_SALES_ENTITY,  // env override (varsa öncelikli)
  'mserp_tryhistoricalsalesdemandentities',
  'mserp_etgtryhistoricalsalesdemandentities',
  'mserp_tryhistoricalsalesdemands',
  'mserp_etgtryhistoricalsalesdemands',
].filter(Boolean);
let HISTORICAL_RESOLVED_ENTITY = null;  // ilk başarılı fetch'te kilitlenir

// Fetch latest report date — $orderby desc, take top 1 (en güncel snapshot tarihi)
export async function fetchLatestReportDate(token) {
  const url = `${API_BASE}?$orderby=${DATE_FIELD} desc&$top=1`;
  const data = await dvFetch(url, token);
  if (!data.value || data.value.length === 0) throw new Error('Entity boş — rapor verisi bulunamadı');
  const rawDate = data.value[0][DATE_FIELD];
  if (!rawDate) throw new Error('Rapor tarihi alanı boş');
  return rawDate;
}

// Convert raw Dataverse date to YYYY-MM-DD for OData filter
function toISODate(raw) {
  const s = String(raw);
  // Already ISO: 2024-10-20T00:00:00Z
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.split('T')[0];
  // US format from formatted value: 10/20/2024
  const parts = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (parts) return `${parts[3]}-${parts[1].padStart(2,'0')}-${parts[2].padStart(2,'0')}`;
  // Try JS Date parse
  const d = new Date(s);
  if (!isNaN(d)) return d.toISOString().split('T')[0];
  return s;
}

// Türkçe-güvenli Title Case: "MEHMET YILMAZ" → "Mehmet Yılmaz", "ŞAHİN İÇTEN" → "Şahin İçten"
// I→ı, İ→i; her kelimenin ilk harfi büyük, geri kalanı küçük (locale tr-TR)
function trTitleCase(s) {
  return String(s || '').toLocaleLowerCase('tr-TR').replace(/(^|[\s\-/.&_])(\S)/g, (m, sep, ch) => sep + ch.toLocaleUpperCase('tr-TR'));
}

// Trader master'dan traderid → description (isim) eşlemesini çek
// Geriye uyumluluk için Map<traderid, name> döner; detaylı bilgi için fetchTraderDirectory kullan
export async function fetchTraderNames(token, onProgress) {
  const dir = await fetchTraderDirectory(token, onProgress);
  const map = new Map();
  for (const t of dir) map.set(t.traderid, t.name);
  return map;
}

// Trader master'dan zengin trader directory (filtre & multi-combo için)
// Her kayıtta: traderid, name (title-cased), maintraderid, ispassive (option set value), validityenddate
// Otomatik filtre: $filter ile sadece aktif (ispassive=200000000) ve validity >= bugün
export async function fetchTraderDirectory(token, onProgress) {
  const todayIso = new Date().toISOString().slice(0, 10);
  const select = ['mserp_traderid','mserp_description','mserp_maintraderid','mserp_ispassive','mserp_validityenddate'].join(',');
  // ispassive option set: 200000000 = No (aktif), 200000001 = Yes (pasif). Aktif olanı filtrele.
  // validityenddate >= bugün (geçerlilik tarihi geçmemiş olanlar)
  const filter = `mserp_ispassive eq 200000000 and mserp_validityenddate ge ${todayIso}T00:00:00Z`;
  const url = `${TRADER_API_BASE}?$select=${select}&$filter=${encodeURIComponent(filter)}`;
  let all = [];
  let nextUrl = url;
  while (nextUrl) {
    const data = await dvFetch(nextUrl, token, 'odata.maxpagesize=5000');
    all = all.concat(data.value || []);
    if (onProgress) onProgress(all.length);
    nextUrl = data['@odata.nextLink'] || null;
  }
  const out = [];
  for (const r of all) {
    const tid = String(r.mserp_traderid || '').trim();
    if (!tid) continue;
    out.push({
      traderid: tid,
      name: trTitleCase(r.mserp_description || ''),
      maintraderid: String(r.mserp_maintraderid || '').trim(),
      ispassive: r.mserp_ispassive,
      validityenddate: r.mserp_validityenddate,
    });
  }
  return out;
}

// Historical sales demand entity'sinden tek bir trader'ın geçmiş satış satırlarını çek
// `fromDate` / `toDate` opsiyonel (YYYY-MM-DD); verilmezse son 36 ay default
// Tutar (amount) alanları runtime'da keşfedilir — entity'de yoksa graceful fallback
// FetchXML aggregate sorgusu yardımcısı (Historical Dataverse — PROD)
async function fetchHistoricalAggregateXml(token, entity, fetchXmlInner) {
  const wrapper = `<fetch aggregate="true">${fetchXmlInner}</fetch>`;
  const url = `${HISTORICAL_DATAVERSE_URL}/api/data/v9.2/${entity}?fetchXml=${encodeURIComponent(wrapper)}`;
  const data = await dvFetch(url, token, 'odata.include-annotations="*"');
  return data.value || [];
}

// Aylık aggregate, top ürün, top müşteri — yıl-bazlı partitioned server-side queries
// Dataverse aggregate 50K satır limit'i nedeniyle her yıl için ayrı query atılır;
// 80K+ satırlı Hasata gibi trader'lar için bu kritik. Sonuçlar client'ta merge edilir.
// traderCodes: tek string veya string array (multi-select için)
export async function fetchHistoricalAggregatesByTrader(account, traderCodes, opts = {}) {
  const token = await getDataverseTokenFor(account, HISTORICAL_DATAVERSE_URL);
  const today = new Date();
  const defaultFrom = new Date(today); defaultFrom.setUTCMonth(defaultFrom.getUTCMonth() - 36);
  const fromDate = opts.fromDate || defaultFrom.toISOString().slice(0, 10);
  const toDate = opts.toDate || today.toISOString().slice(0, 10);
  const codes = Array.isArray(traderCodes) ? traderCodes : [traderCodes];
  if (codes.length === 0) throw new Error('En az bir trader seçilmeli');
  // filterField: 'mserp_trader' (default) veya 'mserp_maintrader' — ana trader bazlı sorgular için
  const filterField = opts.filterField === 'mserp_maintrader' ? 'mserp_maintrader' : 'mserp_trader';

  // Entity discovery (raw fetch ile aynı liste, paylaş)
  if (!HISTORICAL_RESOLVED_ENTITY) {
    for (const entityName of HISTORICAL_SALES_VARIANTS) {
      try {
        const probeUrl = `${HISTORICAL_DATAVERSE_URL}/api/data/v9.2/${entityName}?$select=mserp_trader&$top=1`;
        const r = await fetch(probeUrl, { headers: DV_HEADERS(token) });
        if (r.ok) { HISTORICAL_RESOLVED_ENTITY = entityName; break; }
      } catch (_) {}
    }
    if (!HISTORICAL_RESOLVED_ENTITY) throw new Error('Historical sales entity bulunamadı');
  }
  const entity = HISTORICAL_RESOLVED_ENTITY;
  // FetchXML logical name (singular) — Dataverse pluralization rule: ies→y, s→ø
  const entityLogical = entity.endsWith('ies') ? entity.slice(0, -3) + 'y' : entity.endsWith('s') ? entity.slice(0, -1) : entity;

  // Yılları belirle: fromDate yılından toDate yılına kadar
  const fromY = +fromDate.slice(0, 4);
  const toY = +toDate.slice(0, 4);
  const years = [];
  for (let y = fromY; y <= toY; y++) years.push(y);

  // Her yıl için 4 paralel aggregate query (4 yıl × 4 query = 16 query, hepsi paralel)
  const buildYearQueries = (y) => {
    const yFrom = y === fromY ? fromDate : `${y}-01-01`;
    const yTo = y === toY ? toDate : `${y}-12-31`;
    // Trader / Ana Trader multi-select: tek code → eq, çok code → in (FetchXML <value> child'ları)
    const traderCondition = codes.length === 1
      ? `<condition attribute="${filterField}" operator="eq" value="${xmlEsc(codes[0])}" />`
      : `<condition attribute="${filterField}" operator="in">${codes.map(c => `<value>${xmlEsc(c)}</value>`).join('')}</condition>`;
    const yFilter = `<filter type="and">
      ${traderCondition}
      <condition attribute="mserp_shipdate" operator="on-or-after" value="${yFrom}" />
      <condition attribute="mserp_shipdate" operator="on-or-before" value="${yTo}" />
    </filter>`;
    // Sadece "month" dategrouping; yıl filter'dan zaten biliniyor (her query bir yıla filtreli)
    // İki groupby aynı tarih alanında bazı Dataverse sürümlerinde per-day grouping'e düşüyor → 935 satır gibi anormal sonuç
    const monthlyXml = `<entity name="${entityLogical}">
      <attribute name="mserp_quantity" alias="qty" aggregate="sum" />
      <attribute name="mserp_shipdate" alias="ym" groupby="true" dategrouping="month" />
      ${yFilter}
    </entity>`;
    // PROD entity'e name alanları geldi → id'lerin yanında insan-okunabilir ad ekliyoruz.
    // Aynı id genelde tek isme sahip; varyasyon durumunda mergeBy ilk gördüğü ismi tutar.
    const productXml = `<entity name="${entityLogical}">
      <attribute name="mserp_quantity" alias="qty" aggregate="sum" />
      <attribute name="mserp_productid" alias="pid" groupby="true" />
      <attribute name="mserp_tryitemname" alias="pname" groupby="true" />
      ${yFilter}
    </entity>`;
    const accountXml = `<entity name="${entityLogical}">
      <attribute name="mserp_quantity" alias="qty" aggregate="sum" />
      <attribute name="mserp_toaccountid" alias="aid" groupby="true" />
      <attribute name="mserp_accountname" alias="aname" groupby="true" />
      ${yFilter}
    </entity>`;
    const companyXml = `<entity name="${entityLogical}">
      <attribute name="mserp_quantity" alias="qty" aggregate="sum" />
      <attribute name="mserp_salesdataareaid" alias="co" groupby="true" />
      <attribute name="mserp_trycompanyname" alias="cname" groupby="true" />
      ${yFilter}
    </entity>`;
    // 5. query — itemid × month (Phase 3: trader+itemid hiyerarşi için)
    // Cardinality: yıl başına ~3K satır (200 itemid × 12 ay maks), 50K limit altında rahat
    // Ürün adını da groupby'a ekliyoruz; aynı pid için tek ad → row count'u şişirmez.
    const itemmonthXml = `<entity name="${entityLogical}">
      <attribute name="mserp_quantity" alias="qty" aggregate="sum" />
      <attribute name="mserp_productid" alias="pid" groupby="true" />
      <attribute name="mserp_tryitemname" alias="pname" groupby="true" />
      <attribute name="mserp_shipdate" alias="ym" groupby="true" dategrouping="month" />
      ${yFilter}
    </entity>`;
    return [monthlyXml, productXml, accountXml, companyXml, itemmonthXml];
  };

  const totalQueries = years.length * 5;
  let completedQueries = 0;
  if (opts.onProgress) opts.onProgress(0, totalQueries);

  const tickProgress = () => {
    completedQueries++;
    if (opts.onProgress) opts.onProgress(completedQueries, totalQueries);
  };

  // Her yıl için 5 query — tümünü paralel başlat
  const allPromises = years.flatMap(y => {
    const [monthlyXml, productXml, accountXml, companyXml, itemmonthXml] = buildYearQueries(y);
    return [
      fetchHistoricalAggregateXml(token, entity, monthlyXml).then(r => { tickProgress(); return { kind: 'monthly', y, rows: r }; }),
      fetchHistoricalAggregateXml(token, entity, productXml).then(r => { tickProgress(); return { kind: 'products', y, rows: r }; }),
      fetchHistoricalAggregateXml(token, entity, accountXml).then(r => { tickProgress(); return { kind: 'accounts', y, rows: r }; }),
      fetchHistoricalAggregateXml(token, entity, companyXml).then(r => { tickProgress(); return { kind: 'companies', y, rows: r }; }),
      fetchHistoricalAggregateXml(token, entity, itemmonthXml).then(r => { tickProgress(); return { kind: 'itemmonth', y, rows: r }; }),
    ];
  });

  const results = await Promise.all(allPromises);

  // Merge: monthly — her satıra partition yılını inject et (query yıl-bazlı filter'lı)
  const monthly = results.filter(r => r.kind === 'monthly').flatMap(r => r.rows.map(row => ({ ...row, yy: r.y })));
  // itemmonth — partition yılını ekle (her satırda pid + ym (1-12))
  const itemmonth = results.filter(r => r.kind === 'itemmonth').flatMap(r => r.rows.map(row => ({ ...row, yy: r.y })));
  // Products/accounts/companies: yıllar arası aynı id varsa qty toplanır.
  // Name field varsa ilk gördüğümüz boş-olmayan değeri tutarız (groupby aynı id için
  // teorik olarak tek ad döner; varyasyon olursa qty en yüksek olanın adı kazansın diye
  // tekrar sıralanmıyor — basit yaklaşım yeterli).
  const mergeBy = (kind, idField, nameField) => {
    const m = new Map();
    for (const r of results.filter(x => x.kind === kind)) {
      for (const row of r.rows) {
        const id = row[idField];
        if (id == null || id === '') continue;
        if (!m.has(id)) m.set(id, { [idField]: id, qty: 0, name: null });
        const entry = m.get(id);
        entry.qty += Number(row.qty) || 0;
        if (nameField && !entry.name) {
          const raw = row[nameField] ?? row[`${nameField}@OData.Community.Display.V1.FormattedValue`];
          const str = (raw == null ? '' : String(raw)).trim();
          if (str) entry.name = str;
        }
      }
    }
    return [...m.values()];
  };
  const products = mergeBy('products', 'pid', 'pname');
  const accounts = mergeBy('accounts', 'aid', 'aname');
  const companies = mergeBy('companies', 'co', 'cname');

  return { monthly, products, accounts, companies, itemmonth, fromDate, toDate, traderCodes: codes, queryCount: totalQueries };
}

export async function fetchHistoricalSalesByTrader(account, traderCodes, opts = {}) {
  // Historical Dataverse için ayrı token al (env override ile farklı URL olabilir)
  const token = await getDataverseTokenFor(account, HISTORICAL_DATAVERSE_URL);
  const onProgress = opts.onProgress;
  const codes = Array.isArray(traderCodes) ? traderCodes : [traderCodes];
  if (codes.length === 0) throw new Error('En az bir trader seçilmeli');
  // filterField: 'mserp_trader' (default) veya 'mserp_maintrader' — ana trader bazlı sorgular için
  const filterField = opts.filterField === 'mserp_maintrader' ? 'mserp_maintrader' : 'mserp_trader';
  // Default: son 36 ay (3 yıl)
  const today = new Date();
  const defaultFrom = new Date(today); defaultFrom.setUTCMonth(defaultFrom.getUTCMonth() - 36);
  const fromDate = opts.fromDate || defaultFrom.toISOString().slice(0, 10);
  const toDate = opts.toDate || today.toISOString().slice(0, 10);

  // Tutar adayı alanlar — Dataverse'de yoksa fetch 400 ile dönebilir, fallback yapacağız.
  // PROD entity'de id'lerin yanında ad alanları da var: mserp_tryitemname (ürün),
  // mserp_accountname (müşteri), mserp_trycompanyname (şirket), mserp_tradername,
  // mserp_maintradername. Yoksa $select 400 atar → ileride graceful fallback eklenebilir.
  const baseFields = [
    'mserp_trader','mserp_maintrader','mserp_tradername','mserp_maintradername',
    'mserp_productid','mserp_productvariantid','mserp_tryitemname',
    'mserp_quantity','mserp_inventoryquantity','mserp_unit','mserp_inventoryunitsymbol',
    'mserp_shipdate','mserp_toaccountid','mserp_accountname','mserp_accountid',
    'mserp_inventsiteid','mserp_warehouseid','mserp_locationid',
    'mserp_salesdataareaid','mserp_trycompanyname','mserp_etgordertype','mserp_ordertype','mserp_documentid',
    'mserp_orderid','mserp_channel',
  ];
  const valueCandidates = ['mserp_amount','mserp_amountmst','mserp_amountsec','mserp_lineamount'];

  console.log('[HistoricalSales] Filter', filterField, 'codes:', JSON.stringify(codes));
  const buildUrl = (entity, fields) => {
    const select = fields.join(',');
    // OData multi-trader: code 1 → eq, çok code → OR chain (filterField'a göre)
    const traderExpr = codes.length === 1
      ? `${filterField} eq '${odataStr(codes[0])}'`
      : '(' + codes.map(c => `${filterField} eq '${odataStr(c)}'`).join(' or ') + ')';
    const filter = `${traderExpr} and mserp_shipdate ge ${fromDate}T00:00:00Z and mserp_shipdate le ${toDate}T23:59:59Z`;
    return `${HISTORICAL_DATAVERSE_URL}/api/data/v9.2/${entity}?$select=${select}&$filter=${encodeURIComponent(filter)}&$count=true`;
  };

  // Entity adı discovery — daha önce çözülmemişse her varyantı dene
  if (!HISTORICAL_RESOLVED_ENTITY) {
    for (const entityName of HISTORICAL_SALES_VARIANTS) {
      try {
        // Tek bir kayıt çekerek varlığı doğrula
        const probeUrl = `${HISTORICAL_DATAVERSE_URL}/api/data/v9.2/${entityName}?$select=mserp_trader&$top=1`;
        const r = await fetch(probeUrl, { headers: DV_HEADERS(token) });
        if (r.ok) {
          HISTORICAL_RESOLVED_ENTITY = entityName;
          console.log('[HistoricalSales] Resolved entity:', entityName, 'on', HISTORICAL_DATAVERSE_URL);
          break;
        }
      } catch (_) { /* dene bir sonraki */ }
    }
    if (!HISTORICAL_RESOLVED_ENTITY) {
      throw new Error(`Historical sales entity bulunamadı (${HISTORICAL_DATAVERSE_URL}). Denenenler: ${HISTORICAL_SALES_VARIANTS.join(', ')}. .env'e VITE_HISTORICAL_SALES_ENTITY=<doğru_ad> ve gerekirse VITE_HISTORICAL_DATAVERSE_URL=<url> ekleyin.`);
    }
  }

  // İlk denemede tutar adaylarını da iste; başarısızsa kaldırıp tekrar dene
  let usedFields = [...baseFields, ...valueCandidates];
  let availableValueFields = [];
  let firstUrl = buildUrl(HISTORICAL_RESOLVED_ENTITY, usedFields);
  let allRecords = [];
  let firstAttempt = true;

  let nextUrl = firstUrl;
  while (nextUrl) {
    try {
      const data = await dvFetch(nextUrl, token, 'odata.include-annotations="*",odata.maxpagesize=5000');
      allRecords = allRecords.concat(data.value || []);
      if (onProgress) onProgress(allRecords.length, data['@odata.count']);
      nextUrl = data['@odata.nextLink'] || null;
      // İlk başarılı response'tan tutar alanı varlığını tespit et
      if (firstAttempt && data.value && data.value.length > 0) {
        for (const c of valueCandidates) {
          if (data.value[0][c] != null) availableValueFields.push(c);
        }
        firstAttempt = false;
      }
    } catch (e) {
      // 400 → bilinmeyen alan; tutar adaylarını çıkar ve tekrar dene
      if (firstAttempt && /400|not.*found|invalid.*field/i.test(e.message)) {
        usedFields = [...baseFields];
        nextUrl = buildUrl(HISTORICAL_RESOLVED_ENTITY, usedFields);
        availableValueFields = [];
        allRecords = [];
        firstAttempt = false;
        continue;
      }
      throw e;
    }
  }

  return {
    records: allRecords,
    valueFieldsAvailable: availableValueFields,
    valueField: availableValueFields[0] || null,  // ilk bulunan tutar alanı
    fromDate,
    toDate,
    traderCodes: codes,
  };
}

// Proje entity'sinden tüm projid → {trader, mainTrader} eşlemesini çek
// 5000'lik sayfalama, paginate yaparak tüm kayıtları toplar
export async function fetchProjectTraders(token, onProgress) {
  const select = ['mserp_projid','mserp_traderid','mserp_maintraderid'].join(',');
  const url = `${PROJECT_API_BASE}?$select=${select}`;
  let all = [];
  let nextUrl = url;
  while (nextUrl) {
    const data = await dvFetch(nextUrl, token, 'odata.maxpagesize=5000');
    all = all.concat(data.value || []);
    if (onProgress) onProgress(all.length);
    nextUrl = data['@odata.nextLink'] || null;
  }
  const map = new Map();
  for (const r of all) {
    const pid = String(r.mserp_projid || '').trim();
    if (!pid) continue;
    map.set(pid, {
      trader: String(r.mserp_traderid || ''),
      mainTrader: String(r.mserp_maintraderid || ''),
    });
  }
  return map;
}

export async function fetchEntityByDate(token, reportDate, onProgress) {
  let allRecords = [];
  const isoDate = toISODate(reportDate);
  const url = `${API_BASE}?$select=${SELECT_FIELDS}&$filter=${DATE_FIELD} eq ${isoDate}&$count=true`;

  let nextUrl = url;
  while (nextUrl) {
    const data = await dvFetch(nextUrl, token, 'odata.include-annotations="*",odata.maxpagesize=5000');
    allRecords = allRecords.concat(data.value || []);
    if (onProgress) onProgress(allRecords.length, data['@odata.count']);
    nextUrl = data['@odata.nextLink'] || null;
  }
  return allRecords;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// DATA MAPPING — Dataverse → App 33-column format
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Dataverse → App 33-column mapping (confirmed from actual entity fields)
// L2-L5 code alanları Dataverse'de yok, sadece name alanları var
const FIELD_MAP = [
  { key: 'mserp_companyid',              type: 'string' },  // 0  Şirket Kodu
  { key: 'mserp_companyname',            type: 'string' },  // 1  Şirket Adı
  { key: 'mserp_itemid',                 type: 'string' },  // 2  Madde Kodu
  { key: 'mserp_itemname',               type: 'string' },  // 3  Ürün Adı
  { key: 'mserp_inventcolorid',          type: 'string' },  // 4  Menşe
  { key: 'mserp_sfilotid',               type: 'string' },  // 5  Proje No
  { key: 'mserp_inventdimension1',       type: 'string' },  // 6  Ambalaj
  { key: 'mserp_inventsizeid',           type: 'string' },  // 7  Gümrük
  { key: 'mserp_qty',                    type: 'decimal2' },// 8  Miktar (kg)
  { key: 'mserp_inventsiteid',           type: 'string' },  // 9  Tesis
  { key: 'mserp_inventsitename',         type: 'string' },  // 10 Tesis Adı
  { key: 'mserp_inventlocationid',       type: 'string' },  // 11 Depo
  { key: 'mserp_inventlocationname',     type: 'string' },  // 12 Ambar Adı
  { key: 'mserp_inventbatchid',          type: 'string' },  // 13 Parti No
  { key: 'mserp_vesselassignmentid',     type: 'string' },  // 14 L1
  { key: 'mserp_etgproductlevel01name',  type: 'string' },  // 15 L1 Adı
  { key: '_no_l2_code',                  type: 'string' },  // 16 L2 (Dataverse'de yok)
  { key: 'mserp_etgproductlevel02name',  type: 'string' },  // 17 L2 Adı
  { key: '_no_l3_code',                  type: 'string' },  // 18 L3 (Dataverse'de yok)
  { key: 'mserp_etgproductlevel03name',  type: 'string' },  // 19 L3 Adı
  { key: '_no_l4_code',                  type: 'string' },  // 20 L4 (Dataverse'de yok)
  { key: 'mserp_etgproductlevel04name',  type: 'string' },  // 21 L4 Adı
  { key: '_no_l5_code',                  type: 'string' },  // 22 L5 (Dataverse'de yok)
  { key: '_no_l5_name',                  type: 'string' },  // 23 L5 Adı (Dataverse'de yok)
  { key: 'mserp_pricemst',              type: 'decimal2' },// 24 Fiyat ₺
  { key: 'mserp_pricesec',              type: 'decimal4' },// 25 Fiyat $
  { key: 'mserp_purchweav',             type: 'decimal2' },// 26 PurchWEAV
  { key: 'mserp_purchfifo',             type: 'int' },     // 27 PurchFIFO (aging days)
  { key: 'mserp_purchlifo',             type: 'int' },     // 28 PurchLIFO
  { key: 'mserp_prodweav',              type: 'int' },     // 29 ProdWEAV
  { key: 'mserp_prodfifo',              type: 'int' },     // 30 ProdFIFO
  { key: 'mserp_prodlifo',              type: 'int' },     // 31 ProdLIFO
  { key: 'mserp_purchfifo',             type: 'int' },     // 32 Gün (= PurchFIFO)
];

function castValue(raw, type) {
  if (raw == null || raw === '') {
    return type === 'string' ? '' : 0;
  }
  switch (type) {
    case 'string': return String(raw);
    case 'int': return Math.round(Number(raw) || 0);
    case 'decimal2': return Math.round((Number(raw) || 0) * 100) / 100;
    case 'decimal4': return Math.round((Number(raw) || 0) * 10000) / 10000;
    default: return raw;
  }
}

export function mapToRows(records, traderMap = null, traderNameMap = null) {
  return records.map(rec => {
    const row = FIELD_MAP.map(f => castValue(rec[f.key], f.type));
    // Proje no: mserp_inventdimension2 (stok satırında); proje master entity'sinde aynı değer mserp_projid alanında
    const projid = String(rec['mserp_inventdimension2'] || '').trim();
    const tr = (traderMap && projid) ? (traderMap.get(projid) || null) : null;
    const traderCode = tr ? tr.trader : '';
    const mainTraderCode = tr ? tr.mainTrader : '';
    const traderName = (traderNameMap && traderCode) ? (traderNameMap.get(traderCode) || '') : '';
    const mainTraderName = (traderNameMap && mainTraderCode) ? (traderNameMap.get(mainTraderCode) || '') : '';
    row.push(projid);          // 33 Proje ID
    row.push(traderCode);      // 34 Trader
    row.push(mainTraderCode);  // 35 Ana Trader
    row.push(traderName);      // 36 Trader Adı
    row.push(mainTraderName);  // 37 Ana Trader Adı
    return row;
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CONVENIENCE — Full fetch pipeline
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export async function fetchErpData(account, onStatus) {
  onStatus?.('Dataverse token alınıyor...');
  const token = await getDataverseToken(account);

  onStatus?.('En son rapor tarihi aranıyor...');
  const reportDate = await fetchLatestReportDate(token);

  onStatus?.(`Veri çekiliyor (${toISODate(reportDate).split('-').reverse().join('.')})...`);
  const records = await fetchEntityByDate(token, reportDate, (loaded, total) => {
    onStatus?.(`Veri çekiliyor... ${loaded}${total ? ' / ' + total : ''} kayıt`);
  });

  // Proje master'dan trader bilgilerini çek (projid → trader, ana trader)
  let traderMap = null;
  try {
    onStatus?.('Proje-trader eşlemesi yükleniyor...');
    traderMap = await fetchProjectTraders(token, n => onStatus?.(`Proje-trader: ${n} kayıt...`));
    onStatus?.(`Proje-trader: ${traderMap.size} proje eşlendi`);
  } catch (e) {
    console.warn('Project trader fetch failed:', e);
    onStatus?.('Proje-trader bilgisi alınamadı (devam ediliyor)');
  }

  // Trader master'dan trader id → isim (description) eşlemesi
  let traderNameMap = null;
  try {
    onStatus?.('Trader isimleri yükleniyor...');
    traderNameMap = await fetchTraderNames(token, n => onStatus?.(`Trader isim: ${n} kayıt...`));
    onStatus?.(`Trader: ${traderNameMap.size} isim eşlendi`);
  } catch (e) {
    console.warn('Trader names fetch failed:', e);
    onStatus?.('Trader isimleri alınamadı (devam ediliyor)');
  }

  // Ham (raw) records'u trader bilgisiyle zenginleştir — Ham Veriler sayfası bu fields'ı görsün
  if (traderMap || traderNameMap) {
    for (const rec of records) {
      const pid = String(rec.mserp_inventdimension2 || '').trim();
      const tr = (traderMap && pid) ? traderMap.get(pid) : null;
      const traderCode = tr ? tr.trader : '';
      const mainTraderCode = tr ? tr.mainTrader : '';
      rec.mserp_traderid = traderCode;
      rec.mserp_maintraderid = mainTraderCode;
      rec.mserp_tradername = (traderNameMap && traderCode) ? (traderNameMap.get(traderCode) || '') : '';
      rec.mserp_maintradername = (traderNameMap && mainTraderCode) ? (traderNameMap.get(mainTraderCode) || '') : '';
    }
  }

  onStatus?.('Veri dönüştürülüyor...');
  const rows = mapToRows(records, traderMap, traderNameMap);

  onStatus?.(`${rows.length} satır yüklendi`);
  return { rows, reportDate, recordCount: records.length, rawRecords: records, traderMapSize: traderMap?.size || 0, traderNameMapSize: traderNameMap?.size || 0 };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TREND DATA — Aggregated quantity per report date (last 3 years)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Escape single quotes for OData literals (double them)
function odataStr(s) { return String(s).replace(/'/g, "''"); }

// Build OData filter expression from gFilter object
function buildGFilterExpr(gFilter) {
  const parts = [];
  if (gFilter.comp) parts.push(`mserp_companyname eq '${odataStr(gFilter.comp)}'`);
  if (gFilter.urun) parts.push(`mserp_itemname eq '${odataStr(gFilter.urun)}'`);
  if (gFilter.mense) parts.push(`mserp_inventcolorid eq '${odataStr(gFilter.mense)}'`);
  if (gFilter.tesis) parts.push(`mserp_inventsitename eq '${odataStr(gFilter.tesis)}'`);
  if (gFilter.l2) parts.push(`mserp_etgproductlevel02name eq '${odataStr(gFilter.l2)}'`);
  if (gFilter.l3) parts.push(`mserp_etgproductlevel03name eq '${odataStr(gFilter.l3)}'`);
  if (gFilter.grpCompanies && gFilter.grpCompanies.length > 0) {
    // grp filter: list of company codes (OR expansion — Dataverse OData 'in' is limited)
    const orExpr = gFilter.grpCompanies.map(c => `mserp_companyid eq '${odataStr(c)}'`).join(' or ');
    parts.push(`(${orExpr})`);
  }
  return parts.length > 0 ? parts.join(' and ') : '';
}

// Escape XML special chars for FetchXML values
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
}

// Build <filter> XML block from gFilter
// Also applies the base rule: only item codes starting with 1, 2, or 3 (matches dashboard's calcRows)
function buildFetchFilter(gFilter, cutoffISO) {
  const conds = [`<condition attribute="${DATE_FIELD}" operator="on-or-after" value="${cutoffISO}" />`];
  // Madde kodu filtresi: 1/2/3 ile başlayan (stok kalemleri) — dashboard calcRows ile aynı
  const itemOr = `<filter type="or">` +
    `<condition attribute="mserp_itemid" operator="begins-with" value="1" />` +
    `<condition attribute="mserp_itemid" operator="begins-with" value="2" />` +
    `<condition attribute="mserp_itemid" operator="begins-with" value="3" />` +
  `</filter>`;
  conds.push(itemOr);
  if (gFilter.comp) conds.push(`<condition attribute="mserp_companyname" operator="eq" value="${xmlEsc(gFilter.comp)}" />`);
  if (gFilter.urun) conds.push(`<condition attribute="mserp_itemname" operator="eq" value="${xmlEsc(gFilter.urun)}" />`);
  if (gFilter.mense) conds.push(`<condition attribute="mserp_inventcolorid" operator="eq" value="${xmlEsc(gFilter.mense)}" />`);
  if (gFilter.tesis) conds.push(`<condition attribute="mserp_inventsitename" operator="eq" value="${xmlEsc(gFilter.tesis)}" />`);
  if (gFilter.l2) conds.push(`<condition attribute="mserp_etgproductlevel02name" operator="eq" value="${xmlEsc(gFilter.l2)}" />`);
  if (gFilter.l3) conds.push(`<condition attribute="mserp_etgproductlevel03name" operator="eq" value="${xmlEsc(gFilter.l3)}" />`);
  if (gFilter.grpCompanies && gFilter.grpCompanies.length > 0) {
    const vals = gFilter.grpCompanies.map(c => `<value>${xmlEsc(c)}</value>`).join('');
    conds.push(`<condition attribute="mserp_companyid" operator="in">${vals}</condition>`);
  }
  // Transit/Fark ambar dışlama — dashboard calcRows ile aynı mantık
  // İşaret false ise ambar adında "transit" / "fark" geçen satırlar elenir; null ambar adları korunur
  if (gFilter.incTransit !== true) {
    conds.push(
      `<filter type="or">` +
        `<condition attribute="mserp_inventlocationname" operator="null" />` +
        `<condition attribute="mserp_inventlocationname" operator="not-like" value="%transit%" />` +
      `</filter>`
    );
  }
  if (gFilter.incFark !== true) {
    conds.push(
      `<filter type="or">` +
        `<condition attribute="mserp_inventlocationname" operator="null" />` +
        `<condition attribute="mserp_inventlocationname" operator="not-like" value="%fark%" />` +
      `</filter>`
    );
  }
  // Global arama: her terim için, aranabilir alanlar arasında LIKE %term% OR bloğu
  // Dashboard GS_IDX = [1,3,4,10,12,15,17,19,21,23] (şirket, ürün, menşe, tesis, ambar, L1-L4 adları)
  if (gFilter.searchTerms && gFilter.searchTerms.length > 0) {
    const searchableFields = [
      'mserp_companyname','mserp_itemname','mserp_inventcolorid',
      'mserp_inventsitename','mserp_inventlocationname',
      'mserp_etgproductlevel01name','mserp_etgproductlevel02name',
      'mserp_etgproductlevel03name','mserp_etgproductlevel04name',
    ];
    for (const term of gFilter.searchTerms) {
      const like = `%${xmlEsc(term)}%`;
      const orBlock = `<filter type="or">` +
        searchableFields.map(f => `<condition attribute="${f}" operator="like" value="${like}" />`).join('') +
      `</filter>`;
      conds.push(orBlock);
    }
  }
  return `<filter type="and">${conds.join('')}</filter>`;
}

// Metric → FetchXML aggregate attribute mapping
// NOT: facilities, products ve avgAge özel yollar kullanır — buraya düşmezler
function metricAggregateXml(metricId) {
  switch (metricId) {
    case 'qty':           return `<attribute name="mserp_qty" alias="value" aggregate="sum" />`;
    case 'value':         return `<attribute name="mserp_amountsec" alias="value" aggregate="sum" />`;
    case 'criticalStock': return `<attribute name="mserp_qty" alias="value" aggregate="sum" />`;
    default:              return `<attribute name="mserp_qty" alias="value" aggregate="sum" />`;
  }
}

// Tarih listesinden sadece "her ayın ilk haftası (gün<=7) + en güncel tarih" olanları seç
// avgAge, products, facilities gibi pahalı sorguları hızlandırır (~60 → ~16 tarih)
function filterToFirstWeekDates(dates) {
  if (dates.length === 0) return [];
  const maxDate = dates[dates.length - 1]; // sorted asc, last = max
  const seen = new Set();
  const result = [];
  for (const d of dates) {
    const dt = new Date(d + 'T00:00:00Z');
    const key = dt.getUTCFullYear() + '-' + dt.getUTCMonth();
    if (dt.getUTCDate() <= 7 && !seen.has(key)) {
      seen.add(key);
      result.push(d);
    }
  }
  // En güncel tarih yoksa ekle
  if (!result.includes(maxDate)) result.push(maxDate);
  return result.sort();
}

// Tesis ve Ürün: groupby (date, field) + client-side distinct count per date
async function fetchCountDistinctTrend(token, cutoffISO, gFilter, fieldName) {
  const baseFilter = buildFetchFilter(gFilter, cutoffISO);

  // 1) Tarih listesi al (hızlı)
  const dateInner =
    `<entity name="${ENTITY_LOGICAL}">` +
      `<attribute name="mserp_qty" alias="qtySum" aggregate="sum" />` +
      `<attribute name="${DATE_FIELD}" alias="reportDate" groupby="true" dategrouping="day" />` +
      baseFilter +
    `</entity>`;
  const dateRows = await fetchXmlAggregate(dateInner, token);
  const allDates = [...new Set(dateRows.map(r => normalizeDate(r.reportDate)).filter(Boolean))].sort();
  const targetDates = filterToFirstWeekDates(allDates);

  // 2) Her hedef tarih için groupby(field) sorgusu — paralel
  const perDate = await Promise.all(targetDates.map(async (d) => {
    const dt = new Date(d + 'T00:00:00Z');
    const next = new Date(dt); next.setUTCDate(dt.getUTCDate() + 1);
    const nextIso = next.toISOString().split('T')[0];
    const extra =
      `<condition attribute="${DATE_FIELD}" operator="on-or-after" value="${d}" />` +
      `<condition attribute="${DATE_FIELD}" operator="lt" value="${nextIso}" />`;
    const filterXml = addConditionsToFilter(baseFilter, extra);
    const inner =
      `<entity name="${ENTITY_LOGICAL}">` +
        `<attribute name="mserp_qty" alias="cnt" aggregate="count" />` +
        `<attribute name="${fieldName}" alias="grpVal" groupby="true" />` +
        filterXml +
      `</entity>`;
    const rows = await fetchXmlAggregate(inner, token);
    let distinctCount = 0, totalRows = 0;
    for (const r of rows) {
      distinctCount++;
      totalRows += Number(r.cnt) || 0;
    }
    return { date: d, value: distinctCount, recordCount: totalRows };
  }));

  return perDate.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// Extra filter conditions specific to a metric (e.g. criticalStock needs fifo >= 180)
function metricExtraCondition(metricId) {
  if (metricId === 'criticalStock') return `<condition attribute="mserp_purchfifo" operator="ge" value="180" />`;
  return '';
}

// Normalize Dataverse date strings to ISO YYYY-MM-DD
function normalizeDate(raw) {
  if (!raw) return null;
  if (typeof raw === 'string') {
    if (raw.includes('/')) {
      const m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
      if (m) return `${m[3]}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
    }
    if (raw.includes('T')) return raw.split('T')[0];
  }
  return raw;
}

// Single-shot aggregate FetchXML fetch (Dataverse aggregate has 50K row input limit)
async function fetchXmlAggregate(fetchXmlInner, token) {
  const fullXml = `<fetch aggregate="true">${fetchXmlInner}</fetch>`;
  const url = `${API_BASE}?fetchXml=${encodeURIComponent(fullXml)}`;
  const data = await dvFetch(url, token);
  return data.value || [];
}

// baseFilter içinde iç içe <filter> olabildiği için ilk </filter>'ı değil, SON (outer) </filter>'ı bul
// ve condition'ı onun hemen ÖNÜNE ekle. .replace('</filter>') ilk eşleşmeyi değiştirir, hatalıdır.
function addConditionsToFilter(baseFilter, extraConditionsXml) {
  const lastIdx = baseFilter.lastIndexOf('</filter>');
  if (lastIdx < 0) return baseFilter + extraConditionsXml;
  return baseFilter.slice(0, lastIdx) + extraConditionsXml + baseFilter.slice(lastIdx);
}

// Special path: weighted-avg of purchfifo by qty (matches dashboard's Ort. Yaşlanma formula)
// Dataverse aggregate 50K row input limit → bir seferde yapılamaz.
// Strateji: önce tarih listesini al, sonra her tarih için küçük bir sorgu at (paralel).
async function fetchAvgAgeWeighted(token, cutoffISO, gFilter) {
  const baseFilter = buildFetchFilter(gFilter, cutoffISO);

  // 1) Unique reportdate listesi (qty aggregate, hızlı) — sonra sadece ilk-hafta tarihlerine daralt
  const dateInner =
    `<entity name="${ENTITY_LOGICAL}">` +
      `<attribute name="mserp_qty" alias="qtySum" aggregate="sum" />` +
      `<attribute name="${DATE_FIELD}" alias="reportDate" groupby="true" dategrouping="day" />` +
      baseFilter +
    `</entity>`;
  const dateRows = await fetchXmlAggregate(dateInner, token);
  const allDates = [...new Set(dateRows.map(r => normalizeDate(r.reportDate)).filter(Boolean))].sort();
  const dates = filterToFirstWeekDates(allDates); // ~60 → ~16 tarih

  // 2) Her tarih için (fifo groupby + sum(qty)) — paralel
  // ge + lt next-day → datetime alanında o günün tüm saatlerini kapsar
  const perDate = await Promise.all(dates.map(async (d) => {
    const dt = new Date(d + 'T00:00:00Z');
    const next = new Date(dt); next.setUTCDate(dt.getUTCDate() + 1);
    const nextIso = next.toISOString().split('T')[0];
    const extra =
      `<condition attribute="${DATE_FIELD}" operator="on-or-after" value="${d}" />` +
      `<condition attribute="${DATE_FIELD}" operator="lt" value="${nextIso}" />`;
    const filterXml = addConditionsToFilter(baseFilter, extra);
    const inner =
      `<entity name="${ENTITY_LOGICAL}">` +
        `<attribute name="mserp_qty" alias="qtySum" aggregate="sum" />` +
        `<attribute name="mserp_qty" alias="rowCount" aggregate="count" />` +
        `<attribute name="mserp_purchfifo" alias="fifo" groupby="true" />` +
        filterXml +
      `</entity>`;
    const rows = await fetchXmlAggregate(inner, token);
    let qSum = 0, qFifoSum = 0, rowsTotal = 0;
    for (const r of rows) {
      const q = Number(r.qtySum) || 0;
      const f = Number(r.fifo) || 0;
      const c = Number(r.rowCount) || 0;
      qSum += q;
      qFifoSum += q * f;
      rowsTotal += c;
    }
    return { date: d, value: qSum > 0 ? qFifoSum / qSum : 0, recordCount: rowsTotal };
  }));

  return perDate.sort((a,b) => String(a.date).localeCompare(String(b.date)));
}

export async function fetchKPITrend(account, gFilter = {}, metricId = 'qty') {
  const token = await getDataverseToken(account);
  const cutoffISO = '2025-01-01';

  // Özel yollar: Dataverse aggregate sınırları nedeniyle özel sorgu stratejileri
  if (metricId === 'avgAge') return fetchAvgAgeWeighted(token, cutoffISO, gFilter);
  if (metricId === 'facilities') return fetchCountDistinctTrend(token, cutoffISO, gFilter, 'mserp_inventsiteid');
  if (metricId === 'products') return fetchCountDistinctTrend(token, cutoffISO, gFilter, 'mserp_itemname');

  const baseFilter = buildFetchFilter(gFilter, cutoffISO);
  const extraCond = metricExtraCondition(metricId);
  const filterXml = extraCond ? addConditionsToFilter(baseFilter, extraCond) : baseFilter;

  const inner =
    `<entity name="${ENTITY_LOGICAL}">` +
      metricAggregateXml(metricId) +
      `<attribute name="mserp_qty" alias="recordCount" aggregate="count" />` +
      `<attribute name="${DATE_FIELD}" alias="reportDate" groupby="true" dategrouping="day" />` +
      filterXml +
    `</entity>`;

  const records = await fetchXmlAggregate(inner, token);
  return records
    .map(d => ({ date: normalizeDate(d.reportDate), value: Number(d.value) || 0, recordCount: Number(d.recordCount) || 0 }))
    .filter(d => d.date)
    .sort((a,b) => String(a.date).localeCompare(String(b.date)));
}

// Backward-compat alias
export const fetchTrendData = (account, gFilter) => fetchKPITrend(account, gFilter, 'qty');
