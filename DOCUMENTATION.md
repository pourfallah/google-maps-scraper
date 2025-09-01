# 📚 مستندات فنی اسکریپت Google Maps Scraper

<div align="center">

![Version](https://img.shields.io/badge/version-3.1-blue.svg)
![JavaScript](https://img.shields.io/badge/JavaScript-ES6+-yellow.svg)
![Tampermonkey](https://img.shields.io/badge/Tampermonkey-Compatible-green.svg)

**مستندات کامل توابع، متدها و معماری اسکریپت**

</div>

---

## 📋 فهرست مطالب

- [معماری کلی](#-معماری-کلی)
- [تنظیمات و پیکربندی](#-تنظیمات-و-پیکربندی)
- [توابع اصلی](#-توابع-اصلی)
- [مدیریت رابط کاربری](#-مدیریت-رابط-کاربری)
- [استخراج داده‌ها](#-استخراج-دادهها)
- [مدیریت خطا](#-مدیریت-خطا)
- [بهینه‌سازی عملکرد](#-بهینهسازی-عملکرد)
- [API Reference](#-api-reference)

---

## 🏗️ معماری کلی

### ساختار کلی اسکریپت

```javascript
(function() {
    'use strict';
    
    // 1. تنظیمات و پیکربندی
    const CFG = { ... };
    
    // 2. متغیرهای سراسری
    const state = { ... };
    
    // 3. توابع کمکی
    const utilityFunctions = { ... };
    
    // 4. توابع اصلی
    const coreFunctions = { ... };
    
    // 5. رابط کاربری
    const uiFunctions = { ... };
    
    // 6. راه‌اندازی اولیه
    initializeScript();
})();
```

### اجزای اصلی

1. **Configuration Layer**: تنظیمات و پارامترهای قابل تنظیم
2. **State Management**: مدیریت وضعیت اسکریپت
3. **Utility Layer**: توابع کمکی و ابزاری
4. **Core Logic**: منطق اصلی استخراج داده‌ها
5. **UI Layer**: رابط کاربری و تعامل با کاربر
6. **Event Handling**: مدیریت رویدادها

---

## ⚙️ تنظیمات و پیکربندی

### شیء CFG (Configuration)

```javascript
const CFG = {
    // تنظیمات زوم
    startZoomDefault: 19,        // زوم شروع پیش‌فرض
    endZoomDefault: 14,          // زوم پایان پیش‌فرض
    
    // محدودیت‌ها
    maxPerZoom: 100,             // حداکثر نتیجه در هر سطح زوم
    logMaxLines: 1000,           // حداکثر خطوط لاگ
    
    // تاخیرها (میلی‌ثانیه)
    scrollDelay: 1500,           // تاخیر اسکرول
    clickDelay: 800,             // تاخیر کلیک
    detailsDelay: 2000,          // تاخیر بارگذاری جزئیات
    minDelayMs: 450,             // حداقل تاخیر تصادفی
    maxDelayMs: 1100,            // حداکثر تاخیر تصادفی
    searchAreaButtonDelay: 3000  // تاخیر دکمه "Search this area"
};
```

### انتخاب‌گرهای CSS

```javascript
// انتخاب‌گرهای اصلی برای یافتن عناصر
const RESULTS_FEED_SEL = '[role="feed"], [role="main"] [role="region"] > div > div > div';
const RESULT_ITEM_SEL = 'a[href*="/maps/place/"], div[data-result-index], [role="article"], .Nv2PK';
const SEARCH_AREA_BUTTON_SEL = 'button[jsaction="search.refresh"], button[aria-label="Search this area"], .NlVald.UUrkN.cDZBKc';
```

---

## 🔧 توابع اصلی

### 1. توابع کمکی (Utility Functions)

#### `sleep(ms)`
```javascript
/**
 * ایجاد تاخیر غیرهمزمان
 * @param {number} ms - مدت زمان تاخیر به میلی‌ثانیه
 * @returns {Promise} - Promise که پس از تاخیر resolve می‌شود
 */
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
```

#### `jitter()`
```javascript
/**
 * تولید تاخیر تصادفی برای جلوگیری از تشخیص ربات
 * @returns {number} - عدد تصادفی بین minDelayMs و maxDelayMs
 */
const jitter = () => CFG.minDelayMs + Math.floor(Math.random() * (CFG.maxDelayMs - CFG.minDelayMs + 1));
```

#### `clamp(val, min, max)`
```javascript
/**
 * محدود کردن مقدار در بازه مشخص
 * @param {number} val - مقدار ورودی
 * @param {number} min - حداقل مقدار
 * @param {number} max - حداکثر مقدار
 * @returns {number} - مقدار محدود شده
 */
const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
```

#### `nowStr()`
```javascript
/**
 * دریافت زمان فعلی به فرمت فارسی
 * @returns {string} - زمان فعلی به فرمت "HH:MM:SS"
 */
const nowStr = () => new Date().toLocaleTimeString('fa-IR');
```

### 2. توابع انتظار (Wait Functions)

#### `waitForSelector(selector, timeout)`
```javascript
/**
 * انتظار برای ظاهر شدن عنصر با انتخاب‌گر مشخص
 * @param {string} selector - انتخاب‌گر CSS
 * @param {number} timeout - حداکثر زمان انتظار (پیش‌فرض: 10000ms)
 * @returns {Promise<Element|null>} - عنصر یافت شده یا null
 */
const waitForSelector = async (selector, timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const el = document.querySelector(selector);
        if (el) return el;
        await sleep(100);
    }
    return null;
};
```

#### `waitForResults(timeout)`
```javascript
/**
 * انتظار برای بارگذاری نتایج جستجو
 * @param {number} timeout - حداکثر زمان انتظار (پیش‌فرض: 10000ms)
 * @returns {Promise<Array>} - آرایه عناصر نتایج
 */
const waitForResults = async (timeout = 10000) => {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        const items = getResultItems();
        if (items.length > 0) return items;
        await sleep(200);
    }
    return [];
};
```

### 3. توابع مدیریت زوم

#### `getCurrentZoom()`
```javascript
/**
 * دریافت سطح زوم فعلی از URL
 * @returns {number|null} - سطح زوم فعلی یا null در صورت عدم تشخیص
 */
const getCurrentZoom = () => {
    const url = new URL(location.href);
    
    // استخراج زوم از پارامتر متر (مثل 113m, 226m)
    const meterMatch = url.pathname.match(/,([0-9]+)m/) || url.hash.match(/,([0-9]+)m/);
    if (meterMatch) {
        const meters = parseInt(meterMatch[1]);
        // تبدیل متر به سطح زوم تقریبی
        const zoomLevel = Math.max(1, Math.min(20, Math.round(20 - Math.log2(meters / 113))));
        return zoomLevel;
    }
    
    // روش جایگزین: استخراج از پارامتر z
    const match = url.pathname.match(/@([^,]+),([^,]+),([^z]+)z/) || url.hash.match(/@([^,]+),([^,]+),([^z]+)z/);
    return match ? parseFloat(match[3]) : null;
};
```

#### `setZoom(targetZoom)`
```javascript
/**
 * تنظیم سطح زوم به مقدار مشخص
 * @param {number} targetZoom - سطح زوم هدف
 * @returns {Promise<boolean>} - true در صورت موفقیت
 */
const setZoom = async (targetZoom) => {
    const currentZoom = getCurrentZoom();
    if (!currentZoom) {
        log('❌ نمی‌توان زوم فعلی را تشخیص داد');
        return false;
    }

    log(`🔍 تنظیم زوم از ${currentZoom} به ${targetZoom}`);
    
    let attempts = 0;
    const maxAttempts = 20;
    
    while (Math.abs(getCurrentZoom() - targetZoom) > 0.5 && attempts < maxAttempts) {
        const current = getCurrentZoom();
        
        if (current < targetZoom) {
            // زوم نزدیک
            const zoomInBtn = document.querySelector('#widget-zoom-in');
            if (zoomInBtn && zoomInBtn.offsetParent) {
                zoomInBtn.click();
                await sleep(800 + Math.random() * 400);
            }
        } else {
            // زوم دور
            const zoomOutBtn = document.querySelector('#widget-zoom-out');
            if (zoomOutBtn && zoomOutBtn.offsetParent) {
                zoomOutBtn.click();
                await sleep(800 + Math.random() * 400);
            }
        }
        
        attempts++;
        await sleep(500);
    }
    
    return Math.abs(getCurrentZoom() - targetZoom) <= 1;
};
```

### 4. توابع جستجو

#### `runSearch(query)`
```javascript
/**
 * اجرای جستجو با کلیدواژه مشخص
 * @param {string} query - کلیدواژه جستجو
 * @returns {Promise<void>}
 */
const runSearch = async (query) => {
    if (!query) return;
    log(`🔎 جستجو: "${query}"`);
    
    const searchBox = document.querySelector('#searchboxinput');
    if (!searchBox) {
        log('❌ جعبه جستجو پیدا نشد');
        return;
    }
    
    // پاک کردن و تایپ تدریجی
    searchBox.value = '';
    searchBox.focus();
    await sleep(300);
    
    for (let i = 0; i < query.length; i++) {
        searchBox.value = query.substring(0, i + 1);
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(50 + Math.random() * 100);
    }
    
    await sleep(1200 + Math.random() * 800);
    
    // کلیک روی دکمه جستجو یا Enter
    const searchButton = document.querySelector('#searchbox-searchbutton, .mL3xi[aria-label="Search"], button[aria-label="Search"]');
    if (searchButton) {
        searchButton.click();
    } else {
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter', code: 'Enter', keyCode: 13, which: 13,
            bubbles: true, cancelable: true
        });
        searchBox.dispatchEvent(enterEvent);
    }
    
    await sleep(5000 + jitter());
};
```

### 5. توابع استخراج داده‌ها

#### `getResultItems()`
```javascript
/**
 * دریافت لیست آیتم‌های نتایج جستجو
 * @returns {Array<Element>} - آرایه عناصر نتایج
 */
const getResultItems = () => {
    const selectors = [
        '[role="feed"] a[href*="/maps/place/"]',
        '[role="feed"] div[data-result-index] a',
        '[role="feed"] .Nv2PK a[href*="/maps/place/"]',
        '[role="feed"] [role="article"] a[href*="/maps/place/"]',
        '[role="feed"] div[jsaction*="click"] a[href*="/maps/place/"]'
    ];
    
    // تلاش با انتخاب‌گرهای مختلف
    for (const sel of selectors) {
        const items = Array.from(document.querySelectorAll(sel))
            .filter(item => {
                const href = item.getAttribute('href') || '';
                const text = item.textContent || '';
                
                // فیلتر کردن آیتم‌های نامعتبر
                if (!href.includes('/maps/place/')) return false;
                if (text.trim().toLowerCase() === 'results' || text.trim() === '') return false;
                if (!text.trim()) return false;
                if (item.offsetParent === null) return false;
                
                return true;
            });
        
        if (items.length > 0) {
            log(`🎯 پیدا شد ${items.length} آیتم معتبر`);
            return items;
        }
    }
    
    return [];
};
```

#### `extractDetailsFromPlace()`
```javascript
/**
 * استخراج جزئیات کامل از صفحه مکان
 * @returns {Object} - شیء حاوی اطلاعات استخراج شده
 */
const extractDetailsFromPlace = () => {
    const result = {
        name: '',
        phone: '',
        mobile: '',
        address: '',
        website: '',
        category: '',
        rating: '',
        lat: null,
        lng: null
    };

    // استخراج نام
    const nameSelectors = [
        'h1.DUwDvf',
        'h1[data-attrid="title"]',
        'h1 span[role="text"]',
        'h1',
        '[data-attrid="title"] span'
    ];
    
    for (const sel of nameSelectors) {
        const nameEl = document.querySelector(sel);
        if (nameEl && nameEl.textContent?.trim()) {
            result.name = nameEl.textContent.trim();
            break;
        }
    }

    // استخراج شماره تلفن
    const phoneButtons = document.querySelectorAll('button[aria-label*="Phone:"], button[aria-label*="تلفن:"]');
    
    phoneButtons.forEach(button => {
        const ariaLabel = button.getAttribute('aria-label') || '';
        const phoneMatch = ariaLabel.match(/Phone:\s*([+\d\s\-\(\)]+)|تلفن:\s*([+\d\s\-\(\)]+)/i);
        if (phoneMatch) {
            const phoneNumber = (phoneMatch[1] || phoneMatch[2]).trim();
            
            // تشخیص موبایل یا تلفن ثابت
            if (/^(\+98\s?9|09)\d{9}/.test(phoneNumber.replace(/\s/g, ''))) {
                if (!result.mobile) result.mobile = phoneNumber;
            } else {
                if (!result.phone) result.phone = phoneNumber;
            }
        }
    });

    // استخراج آدرس
    const addressSelectors = [
        'button[data-item-id="address"] div[role="img"] + div',
        '[data-attrid="kc:/location/location:address"] span',
        'button[aria-label*="Address"] div:last-child',
        '.rogA2c .Io6YTe'
    ];
    
    for (const sel of addressSelectors) {
        const addrEl = document.querySelector(sel);
        if (addrEl && addrEl.textContent?.trim()) {
            result.address = addrEl.textContent.trim();
            break;
        }
    }

    // استخراج وب‌سایت
    const websiteEl = document.querySelector('a[data-item-id="authority"], a[href^="http"][data-item-id], button[data-item-id*="website"] a');
    if (websiteEl) {
        result.website = websiteEl.href || websiteEl.textContent?.trim() || '';
    }

    // استخراج دسته‌بندی
    const categorySelectors = [
        'button[jsaction*="category"] span',
        '.DkEaL',
        '[data-attrid*="category"] span'
    ];
    
    for (const sel of categorySelectors) {
        const catEl = document.querySelector(sel);
        if (catEl && catEl.textContent?.trim()) {
            result.category = catEl.textContent.trim();
            break;
        }
    }

    // استخراج امتیاز
    const ratingEl = document.querySelector('.F7nice span[aria-hidden="true"], .ceNzKf[aria-label*="star"]');
    if (ratingEl) {
        const ratingText = ratingEl.textContent?.trim() || '';
        const ratingMatch = ratingText.match(/([\d.]+)/);
        if (ratingMatch) {
            result.rating = ratingMatch[1];
        }
    }

    // استخراج مختصات
    const url = new URL(location.href);
    const match = url.pathname.match(/@([^,]+),([^,]+),([^z]+)z/) || url.hash.match(/@([^,]+),([^,]+),([^z]+)z/);
    if (match) {
        result.lat = parseFloat(match[1]);
        result.lng = parseFloat(match[2]);
    }

    return result;
};
```

---

## 🎨 مدیریت رابط کاربری

### 1. ایجاد استایل‌ها

#### `addPanelStyles()`
```javascript
/**
 * اضافه کردن استایل‌های CSS به صفحه
 * @returns {void}
 */
const addPanelStyles = () => {
    if (document.getElementById('gm-styles')) return;
    
    const styles = document.createElement('style');
    styles.id = 'gm-styles';
    styles.textContent = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
        
        #gm-panel {
            position: fixed;
            top: 20px;
            right: 20px;
            width: 420px;
            max-height: 90vh;
            background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
            border-radius: 20px;
            box-shadow: 0 25px 50px rgba(0, 0, 0, 0.15);
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            z-index: 999999;
            overflow: hidden;
            transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255, 255, 255, 0.2);
        }
        /* سایر استایل‌ها... */
    `;
    
    document.head.appendChild(styles);
};
```

### 2. راه‌اندازی رابط کاربری

#### `initUI()`
```javascript
/**
 * راه‌اندازی اولیه رابط کاربری
 * @returns {void}
 */
const initUI = () => {
    if (document.getElementById('gm-panel')) return;
    
    // اعمال استایل‌ها
    addPanelStyles();
    
    // اضافه کردن HTML
    document.body.insertAdjacentHTML('beforeend', html);
    
    // تنظیم Event Listeners
    setupEventListeners();
    
    // راه‌اندازی اولیه
    initializePanel();
};
```

### 3. مدیریت رویدادها

#### `setupEventListeners()`
```javascript
/**
 * تنظیم تمام Event Listeners
 * @returns {void}
 */
const setupEventListeners = () => {
    // دکمه تنظیم مرکز
    document.getElementById('gm-set-center')?.addEventListener('click', () => {
        log('📍 روی نقطه مورد نظر در نقشه کلیک کنید');
        // منطق تنظیم مرکز...
    });
    
    // دکمه شروع
    document.getElementById('gm-start')?.addEventListener('click', startScraping);
    
    // دکمه توقف
    document.getElementById('gm-stop')?.addEventListener('click', stopScraping);
    
    // سایر Event Listeners...
};
```

---

## 📊 مدیریت وضعیت (State Management)

### شیء State

```javascript
/**
 * مدیریت وضعیت کلی اسکریپت
 */
const state = {
    running: false,              // وضعیت اجرا
    centerPoint: null,           // نقطه مرکز انتخاب شده
    currentZoom: null,           // زوم فعلی
    query: '',                   // کلیدواژه جستجو
    results: [],                 // نتایج استخراج شده
    visited: new Set(),          // مکان‌های بازدید شده
    currentZoomLevel: 19         // سطح زوم فعلی
};
```

### توابع مدیریت وضعیت

#### `updateStatus(message, type)`
```javascript
/**
 * به‌روزرسانی وضعیت نمایش داده شده
 * @param {string} message - پیام وضعیت
 * @param {string} type - نوع پیام (success, error, warning, info)
 */
const updateStatus = (message, type = 'info') => {
    const statusEl = document.getElementById('gm-status');
    if (statusEl) {
        statusEl.textContent = message;
        statusEl.className = `gm-status ${type}`;
    }
};
```

#### `updateStats()`
```javascript
/**
 * به‌روزرسانی آمار نمایش داده شده
 */
const updateStats = () => {
    const countEl = document.getElementById('gm-count');
    if (countEl) {
        countEl.textContent = state.results.length;
        
        // انیمیشن پالس
        countEl.classList.add('countPulse');
        setTimeout(() => countEl.classList.remove('countPulse'), 600);
    }
};
```

---

## 🔄 چرخه حیات اسکریپت

### 1. راه‌اندازی اولیه
```javascript
// هنگام بارگذاری صفحه
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initUI);
} else {
    setTimeout(initUI, 1000);
}
```

### 2. فرآیند استخراج
```javascript
/**
 * فرآیند کامل استخراج داده‌ها
 */
const scrapingProcess = async () => {
    // 1. تنظیم مرکز
    await setCenterPoint(lat, lng);
    
    // 2. اجرای جستجو
    await runSearch(query);
    
    // 3. حلقه زوم
    for (let zoom = startZoom; zoom >= endZoom; zoom--) {
        await setZoom(zoom);
        await clickSearchAreaButton();
        await scrollResultsFeed();
        await processAllResults();
    }
    
    // 4. تکمیل و خروجی
    generateCSV();
};
```

---

## 🚨 مدیریت خطا

### سیستم لاگ

```javascript
/**
 * سیستم لاگ پیشرفته با رنگ‌بندی
 * @param {string} message - پیام لاگ
 * @param {string} type - نوع پیام
 */
const log = (message, type = 'info') => {
    const timestamp = nowStr();
    const logMessage = `[${timestamp}] ${message}`;
    
    // نمایش در کنسول
    console.log(logMessage);
    
    // نمایش در UI
    const logContent = document.getElementById('gm-log-content');
    if (logContent) {
        const entry = document.createElement('div');
        entry.className = `gm-log-entry ${type}`;
        entry.textContent = logMessage;
        
        logContent.appendChild(entry);
        logContent.scrollTop = logContent.scrollHeight;
        
        // محدود کردن تعداد خطوط
        const entries = logContent.querySelectorAll('.gm-log-entry');
        if (entries.length > CFG.logMaxLines) {
            entries[0].remove();
        }
    }
};
```

### مدیریت خطاهای غیرمنتظره

```javascript
/**
 * مدیریت خطاهای سراسری
 */
window.addEventListener('error', (event) => {
    log(`❌ خطای غیرمنتظره: ${event.message}`, 'error');
    console.error('Script Error:', event);
});

window.addEventListener('unhandledrejection', (event) => {
    log(`❌ Promise رد شده: ${event.reason}`, 'error');
    console.error('Unhandled Promise Rejection:', event);
});
```

---

## ⚡ بهینه‌سازی عملکرد

### 1. مدیریت حافظه

```javascript
/**
 * پاک‌سازی داده‌های اضافی
 */
const cleanupMemory = () => {
    // پاک کردن نتایج قدیمی
    if (state.results.length > 1000) {
        state.results = state.results.slice(-500);
    }
    
    // پاک کردن visited set
    if (state.visited.size > 2000) {
        state.visited.clear();
    }
};
```

### 2. تاخیر هوشمند

```javascript
/**
 * محاسبه تاخیر بر اساس بار سیستم
 */
const adaptiveDelay = () => {
    const baseDelay = jitter();
    const loadFactor = performance.now() % 1000 / 1000;
    return Math.floor(baseDelay * (1 + loadFactor));
};
```

---

## 📋 API Reference

### توابع عمومی

| تابع | پارامترها | بازگشت | توضیح |
|------|-----------|---------|-------|
| `sleep(ms)` | `number` | `Promise` | ایجاد تاخیر |
| `jitter()` | - | `number` | تاخیر تصادفی |
| `log(message, type)` | `string, string` | `void` | ثبت لاگ |
| `getCurrentZoom()` | - | `number\|null` | دریافت زوم فعلی |
| `setZoom(zoom)` | `number` | `Promise<boolean>` | تنظیم زوم |

### توابع استخراج

| تابع | پارامترها | بازگشت | توضیح |
|------|-----------|---------|-------|
| `getResultItems()` | - | `Array<Element>` | دریافت نتایج |
| `extractDetailsFromPlace()` | - | `Object` | استخراج جزئیات |
| `processAllResults()` | - | `Promise<void>` | پردازش همه نتایج |

### توابع UI

| تابع | پارامترها | بازگشت | توضیح |
|------|-----------|---------|-------|
| `initUI()` | - | `void` | راه‌اندازی UI |
| `updateStatus(msg, type)` | `string, string` | `void` | به‌روزرسانی وضعیت |
| `updateStats()` | - | `void` | به‌روزرسانی آمار |

---

## 🔧 تنظیمات پیشرفته

### سفارشی‌سازی انتخاب‌گرها

```javascript
// برای سایت‌های مختلف گوگل مپس
const SELECTORS = {
    'maps.google.com': {
        searchBox: '#searchboxinput',
        results: '[role="feed"]',
        resultItem: 'a[href*="/maps/place/"]'
    },
    'maps.google.co.uk': {
        // انتخاب‌گرهای مخصوص UK
    }
};
```

### تنظیمات منطقه‌ای

```javascript
// تنظیمات بر اساس زبان و منطقه
const REGIONAL_CONFIG = {
    'fa-IR': {
        dateFormat: 'fa-IR',
        phoneRegex: /^(\+98\s?9|09)\d{9}/,
        addressKeywords: ['خیابان', 'کوچه', 'پلاک']
    },
    'en-US': {
        dateFormat: 'en-US',
        phoneRegex: /^\+?1?[2-9]\d{2}[2-9]\d{2}\d{4}$/,
        addressKeywords: ['street', 'avenue', 'road']
    }
};
```

---

<div align="center">

**مستندات فنی کامل - نسخه 3.1**

*برای اطلاعات بیشتر به [README.md](README.md) مراجعه کنید*

</div>