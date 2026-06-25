// ==UserScript==
// @name         Google Maps Advanced Click-Based Scraper
// @namespace    http://tampermonkey.net/
// @version      3.1
// @description  Advanced Google Maps scraper with click-based center point and progressive zoom
// @author       You
// @match        https://www.google.com/maps/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const CFG = {
        startZoomDefault: 19, // Start with maximum zoom
        endZoomDefault: 14,   // End with minimum zoom
        maxPerZoom: 100,
        logMaxLines: 1000,
        scrollDelay: 1500,
        clickDelay: 800,
        detailsDelay: 2000,
        minDelayMs: 450,
        maxDelayMs: 1100,
        searchAreaButtonDelay: 3000
    };

    const RESULTS_FEED_SEL = '[role="feed"], [role="main"] [role="region"] > div > div > div';
    const RESULT_ITEM_SEL = 'a[href*="/maps/place/"], div[data-result-index], [role="article"], .Nv2PK';
    const SEARCH_AREA_BUTTON_SEL = 'button[jsaction="search.refresh"], button[aria-label="Search this area"], .NlVald.UUrkN.cDZBKc';

    // Utility functions
    const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
    const jitter = () => CFG.minDelayMs + Math.floor(Math.random() * (CFG.maxDelayMs - CFG.minDelayMs + 1));
    const clamp = (val, min, max) => Math.min(Math.max(val, min), max);
    const nowStr = () => new Date().toLocaleTimeString('fa-IR');

    // Global state
    const state = {
        running: false,
        centerPoint: null,
        currentZoom: null,
        query: '',
        results: [],
        visited: new Set(),
        currentZoomLevel: 19
    };

    const waitForSelector = async (selector, timeout = 10000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const el = document.querySelector(selector);
            if (el) return el;
            await sleep(100);
        }
        return null;
    };

    const waitForResults = async (timeout = 10000) => {
        const start = Date.now();
        while (Date.now() - start < timeout) {
            const items = getResultItems();
            if (items.length > 0) return items;
            await sleep(200);
        }
        return [];
    };

    const getResultItems = () => {
        const selectors = [
            '[role="feed"] a[href*="/maps/place/"]',
            '[role="feed"] div[data-result-index] a',
            '[role="feed"] .Nv2PK a[href*="/maps/place/"]',
            '[role="feed"] [role="article"] a[href*="/maps/place/"]',
            '[role="feed"] div[jsaction*="click"] a[href*="/maps/place/"]'
        ];
        
        for (const sel of selectors) {
            const items = Array.from(document.querySelectorAll(sel))
                .filter(item => {
                    const href = item.getAttribute('href') || '';
                    const text = item.textContent || '';
                    
                    if (!href.includes('/maps/place/')) return false;
                    if (text.trim().toLowerCase() === 'results' || text.trim() === '') return false;
                    if (!text.trim()) return false;
                    if (item.offsetParent === null) return false;
                    
                    return true;
                });
            
            if (items.length > 0) {
                log(`🎯 پیدا شد ${items.length} آیتم معتبر با انتخاب‌گر: ${sel}`);
                return items;
            }
        }
        
        const fallbackItems = Array.from(document.querySelectorAll('[role="feed"] div[jsaction]'))
            .filter(div => {
                const link = div.querySelector('a[href*="/maps/place/"]');
                const text = div.textContent || '';
                return link && text.trim() && text.trim().toLowerCase() !== 'results';
            })
            .map(div => div.querySelector('a[href*="/maps/place/"]'))
            .filter(Boolean);
            
        if (fallbackItems.length > 0) {
            log(`🎯 Fallback: پیدا شد ${fallbackItems.length} آیتم`);
            return fallbackItems;
        }
        
        return [];
    };

    const getCurrentZoom = () => {
        const url = new URL(location.href);
        // Extract zoom from meter parameter (e.g., 113m, 226m, 452m, etc.)
        const meterMatch = url.pathname.match(/,([0-9]+)m/) || url.hash.match(/,([0-9]+)m/);
        if (meterMatch) {
            const meters = parseInt(meterMatch[1]);
            // Convert meters to approximate zoom level (lower meters = higher zoom)
            // 113m ≈ zoom 19, 226m ≈ zoom 18, 452m ≈ zoom 17, etc.
            const zoomLevel = Math.max(1, Math.min(20, Math.round(20 - Math.log2(meters / 113))));
            return zoomLevel;
        }
        
        // Fallback to old z parameter method
        const match = url.pathname.match(/@([^,]+),([^,]+),([^z]+)z/) || url.hash.match(/@([^,]+),([^,]+),([^z]+)z/);
        return match ? parseFloat(match[3]) : null;
    };

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
                // Zoom in - use specific button ID
                const zoomInBtn = document.querySelector('#widget-zoom-in');
                if (zoomInBtn && zoomInBtn.offsetParent) {
                    log(`🔍 زوم نزدیک: ${current} → هدف: ${targetZoom}`);
                    zoomInBtn.click();
                    await sleep(800 + Math.random() * 400);
                } else {
                    log('❌ دکمه زوم نزدیک یافت نشد');
                    break;
                }
            } else {
                // Zoom out - use specific button ID
                const zoomOutBtn = document.querySelector('#widget-zoom-out');
                if (zoomOutBtn && zoomOutBtn.offsetParent) {
                    log(`🔍 زوم دور: ${current} → هدف: ${targetZoom}`);
                    zoomOutBtn.click();
                    await sleep(800 + Math.random() * 400);
                } else {
                    log('❌ دکمه زوم دور یافت نشد');
                    break;
                }
            }
            
            attempts++;
            // Wait for URL to update
            await sleep(500);
        }
        
        const finalZoom = getCurrentZoom();
        log(`✅ زوم نهایی: ${finalZoom} (تلاش‌ها: ${attempts})`);
        return Math.abs(finalZoom - targetZoom) <= 1;
    };

    const setCenterPoint = async (lat, lng) => {
        log(`📍 تنظیم مرکز به: ${lat}, ${lng}`);
        
        // Navigate to the specific coordinates
        const newUrl = `https://www.google.com/maps/@${lat},${lng},${state.currentZoomLevel}z`;
        
        // Use history.pushState to avoid page reload
        history.pushState(null, '', newUrl);
        
        // Trigger a map update
        window.dispatchEvent(new PopStateEvent('popstate'));
        
        await sleep(2000 + Math.random() * 1000);
        return true;
    };

    const runSearch = async (query) => {
        if (!query) return;
        log(`🔎 جستجو: "${query}"`);
        
        // Try multiple selectors for the search box (new Google Maps UI uses id="ucc-1" or name="q")
        const searchBoxSelectors = [
            '#ucc-1',
            'input[name="q"]',
            'input[role="combobox"][aria-controls]',
            '#searchboxinput',
            'input[autocomplete="off"][autofocus]',
            '.UGojuc',
            'input.fontBodyMedium'
        ];
        
        let searchBox = null;
        for (const sel of searchBoxSelectors) {
            searchBox = document.querySelector(sel);
            if (searchBox) {
                log(`🎯 جعبه جستجو پیدا شد با: ${sel}`);
                break;
            }
        }
        
        if (!searchBox) {
            log('❌ جعبه جستجو پیدا نشد');
            return;
        }
        
        // Focus and clear the search box
        searchBox.focus();
        searchBox.value = '';
        searchBox.dispatchEvent(new Event('input', { bubbles: true }));
        await sleep(300);
        
        // Type the query character by character to trigger suggestions
        for (let i = 0; i < query.length; i++) {
            const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            nativeInputValueSetter.call(searchBox, query.substring(0, i + 1));
            searchBox.dispatchEvent(new Event('input', { bubbles: true }));
            searchBox.dispatchEvent(new Event('change', { bubbles: true }));
            await sleep(50 + Math.random() * 100);
        }
        
        await sleep(1200 + Math.random() * 800);
        
        // Try to find and click the search button
        const searchButtonSelectors = [
            '.mL3xi[aria-label="Search"]',
            'button[aria-label="Search"]',
            '#searchbox-searchbutton',
            '.mL3xi',
            'button[jsaction*="omnibox.search"]',
            'span.google-symbols[aria-hidden="true"]'
        ];
        
        let searchButton = null;
        for (const sel of searchButtonSelectors) {
            searchButton = document.querySelector(sel);
            if (searchButton) {
                log(`🎯 دکمه جستجو پیدا شد با: ${sel}`);
                break;
            }
        }
        
        if (searchButton) {
            log('🔍 کلیک روی دکمه جستجو');
            searchButton.click();
        } else {
            log('⌨️ شبیه‌سازی Enter در جعبه جستجو');
            // Try pressing Enter on the search box
            const enterEvent = new KeyboardEvent('keydown', {
                key: 'Enter',
                code: 'Enter',
                keyCode: 13,
                which: 13,
                bubbles: true,
                cancelable: true
            });
            searchBox.dispatchEvent(enterEvent);
            
            // Also try submitting the form
            const form = searchBox.closest('form');
            if (form) {
                log('📝 ارسال فرم جستجو');
                form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
            }
        }
        
        await sleep(5000 + jitter());
        
        const resultsLoaded = await waitForSelector(RESULTS_FEED_SEL, 8000);
        if (resultsLoaded) {
            log('✅ نتایج جستجو بارگذاری شد');
        } else {
            log('⚠️ ممکن است نتایج جستجو کامل بارگذاری نشده باشد');
        }
    };

    const clickSearchAreaButton = async () => {
        log('🔍 جستجوی دکمه "Search this area"...');
        
        // Wait for the button to appear
        await sleep(2000);
        
        let searchAreaBtn = await waitForSelector(SEARCH_AREA_BUTTON_SEL, 5000);
        
        // If button not found, try zoom out and zoom in to trigger it
        if (!searchAreaBtn || !searchAreaBtn.offsetParent) {
            log('🔄 دکمه یافت نشد - تلاش برای نمایش با تغییر زوم...');
            
            // Zoom out slightly using correct button ID
            const zoomOutBtn = document.querySelector('#widget-zoom-out');
            if (zoomOutBtn && zoomOutBtn.offsetParent) {
                log('🔍 زوم دور کردن...');
                zoomOutBtn.click();
                await sleep(1500);
            }
            
            // Zoom back in using correct button ID
            const zoomInBtn = document.querySelector('#widget-zoom-in');
            if (zoomInBtn && zoomInBtn.offsetParent) {
                log('🔍 زوم نزدیک کردن...');
                zoomInBtn.click();
                await sleep(1500);
            }
            
            // Try to find the button again
            searchAreaBtn = await waitForSelector(SEARCH_AREA_BUTTON_SEL, 5000);
        }
        
        if (searchAreaBtn && searchAreaBtn.offsetParent) {
            log('🎯 کلیک روی دکمه "Search this area"');
            
            // Scroll to button first
            searchAreaBtn.scrollIntoView({ behavior: 'smooth', block: 'center' });
            await sleep(1000);
            
            // Click the button
            searchAreaBtn.click();
            
            // Wait for results to load
            await sleep(CFG.searchAreaButtonDelay + Math.random() * 2000);
            
            log('✅ دکمه "Search this area" کلیک شد');
            return true;
        } else {
            log('⚠️ دکمه "Search this area" یافت نشد حتی پس از تغییر زوم');
            return false;
        }
    };

    const scrollResultsFeed = async (feed) => {
        if (!feed) return;
        log('🧭 اسکرول کامل لیست نتایج...');
        
        let lastHeight = 0;
        let stableCount = 0;
        let scrollAttempts = 0;
        let lastItemCount = 0;
        const maxScrollAttempts = 30;
        
        while (scrollAttempts < maxScrollAttempts && stableCount < 5) {
            feed.scrollTop = feed.scrollHeight;
            await sleep(CFG.scrollDelay + jitter());
            
            if (scrollAttempts % 4 === 0) {
                feed.scrollBy(0, 1500);
                await sleep(700 + Math.random() * 300);
            }
            
            const currentHeight = feed.scrollHeight;
            const currentItems = getResultItems().length;
            
            // Check for end of list indicator
            const endListElement = document.querySelector('.m6QErb.XiKgde.tLjsW.eKbjU .HlvSq');
            const hasEndIndicator = endListElement && endListElement.textContent.includes('You\'ve reached the end of the list.');
            
            if (currentHeight === lastHeight && currentItems === lastItemCount) {
                stableCount++;
                
                if (hasEndIndicator) {
                    log('🏁 پایان لیست تشخیص داده شد: "You\'ve reached the end of the list."');
                    break;
                }
                
                feed.dispatchEvent(new Event('scroll', { bubbles: true }));
                await sleep(1500 + Math.random() * 1000);
            } else {
                stableCount = 0;
                lastHeight = currentHeight;
                lastItemCount = currentItems;
                log(`📏 ارتفاع: ${currentHeight}px، آیتم‌ها: ${currentItems}`);
            }
            
            scrollAttempts++;
        }
        
        const finalItemCount = getResultItems().length;
        log(`🏁 اسکرول تمام شد. تلاش‌ها: ${scrollAttempts}، نهایی: ${finalItemCount} آیتم`);
    };

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

        // Extract name
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

        // Extract phone numbers
        const phoneButtons = document.querySelectorAll('button[aria-label*="Phone:"], button[aria-label*="تلفن:"]');
        
        phoneButtons.forEach(button => {
            const ariaLabel = button.getAttribute('aria-label') || '';
            const phoneMatch = ariaLabel.match(/Phone:\s*([+\d\s\-\(\)]+)|تلفن:\s*([+\d\s\-\(\)]+)/i);
            if (phoneMatch) {
                const phoneNumber = (phoneMatch[1] || phoneMatch[2]).trim();
                
                if (/^(\+98\s?9|09)\d{9}/.test(phoneNumber.replace(/\s/g, ''))) {
                    if (!result.mobile) result.mobile = phoneNumber;
                } else {
                    if (!result.phone) result.phone = phoneNumber;
                }
            }
        });

        // Extract address
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

        // Extract website
        const websiteEl = document.querySelector('a[data-item-id="authority"], a[href^="http"][data-item-id], button[data-item-id*="website"] a');
        if (websiteEl) {
            result.website = websiteEl.href || websiteEl.textContent?.trim() || '';
        }

        // Extract category
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

        // Extract rating
        const ratingEl = document.querySelector('.F7nice span[aria-hidden="true"], .ceNzKf[aria-label*="star"]');
        if (ratingEl) {
            const ratingText = ratingEl.textContent?.trim() || '';
            const ratingMatch = ratingText.match(/([\d.]+)/);
            if (ratingMatch) {
                result.rating = ratingMatch[1];
            }
        }

        // Extract coordinates
        const url = new URL(location.href);
        const match = url.pathname.match(/@([^,]+),([^,]+),([^z]+)z/) || url.hash.match(/@([^,]+),([^,]+),([^z]+)z/);
        if (match) {
            result.lat = parseFloat(match[1]);
            result.lng = parseFloat(match[2]);
        }

        return result;
    };

    const processAllResults = async () => {
        const initialItems = getResultItems();
        if (!initialItems.length) {
            log('⚠️ دیگر آیتمی برای پردازش وجود ندارد.');
            return;
        }
        
        log(`🔄 شروع پردازش ${initialItems.length} نتیجه به ترتیب`);
        
        let currentItems = getResultItems();
        
        for (let i = 0; i < currentItems.length && state.running; i++) {
            let el = currentItems[i];
            let href = (el.getAttribute?.('href') || '');
            
            if (!href || !href.startsWith('/maps/place/')) {
                const a = el.querySelector?.('a[href^="/maps/place/"]');
                if (a) {
                    el = a;
                    href = a.getAttribute('href') || '';
                }
            }
            
            if (!href || state.visited.has(href)) {
                log(`⏭️ پرش: آیتم ${i + 1} قبلاً پردازش شده`);
                continue;
            }
            
            if (!document.getElementById('gm-panel')) {
                log('⚠️ پنل حذف شده - احتمال رفرش صفحه');
                state.running = false;
                return;
            }
            
            log(`🔍 پردازش آیتم ${i + 1}/${currentItems.length}`);
        
            // Enhanced scrolling
            const resultsFeed = document.querySelector(RESULTS_FEED_SEL);
            if (resultsFeed && el.offsetParent) {
                const elementRect = el.getBoundingClientRect();
                const feedRect = resultsFeed.getBoundingClientRect();
                
                if (elementRect.top < feedRect.top || elementRect.bottom > feedRect.bottom) {
                    const scrollOffset = elementRect.top - feedRect.top - (feedRect.height / 2) + (elementRect.height / 2);
                    resultsFeed.scrollTop += scrollOffset;
                    await sleep(500 + Math.random() * 300);
                }
            }
            
            el.scrollIntoView({behavior:'smooth',block:'center'});
            await sleep(600 + Math.random() * 400);
            
            if (!el.offsetParent || !document.body.contains(el)) {
                log(`⚠️ آیتم ${i + 1} دیگر قابل کلیک نیست - رفرش لیست`);
                currentItems = getResultItems();
                if (currentItems.length === 0) {
                    log('⚠️ هیچ آیتم قابل کلیکی یافت نشد - پایان پردازش');
                    break;
                }
                log(`🔄 لیست آیتم‌ها رفرش شد: ${currentItems.length} آیتم`);
                i = -1;
                continue;
            }
        
            const clickDelay = CFG.clickDelay;
            try {
                const clickEvent = new MouseEvent('click', {
                    bubbles: true,
                    cancelable: true,
                    view: window
                });
                el.dispatchEvent(clickEvent);
            } catch (e) {
                log(`⚠️ خطا در کلیک آیتم ${i + 1}: ${e.message}`);
                continue;
            }
            await sleep(clickDelay + jitter());

            await waitForSelector('h1.DUwDvf, h1, h1 span[role="text"]', 2000);
            
            const detailsDelay = CFG.detailsDelay;
            await sleep(detailsDelay);
            
            const details = extractDetailsFromPlace();
            
            if (details.name) {
                state.visited.add(href);
                state.results.push(details);
                
                const phoneInfo = details.phone ? `تلفن: ${details.phone}` : 'تلفن: ندارد';
                const mobileInfo = details.mobile ? ` | موبایل: ${details.mobile}` : (details.phone ? '' : ' | موبایل: ندارد');
                const addressInfo = details.address ? ` | آدرس: ${details.address.substring(0, 50)}...` : '';
                
                log(`✅ [${state.results.length}] ${details.name} | ${phoneInfo}${mobileInfo}${addressInfo}`);
                updateResultsDisplay();
            } else {
                log(`⚠️ نتوانست جزئیات آیتم ${i + 1} را استخراج کند`);
            }
            
            await sleep(300 + Math.random() * 200);
        }
        
        log(`🏁 پردازش تمام شد. مجموع نتایج: ${state.results.length}`);
    };

    const performZoomCycle = async () => {
        if (!state.centerPoint || !state.query) {
            log('❌ نقطه مرکز یا کلمه کلیدی تنظیم نشده');
            return;
        }

        log(`\n━━━━━━━━━━━━━━━ زوم ${state.currentZoomLevel} ━━━━━━━━━━━━━━━`);
        
        // Set center point
        await setCenterPoint(state.centerPoint.lat, state.centerPoint.lng);
        
        // Set zoom level
        await setZoom(state.currentZoomLevel);
        
        // Perform search
        await runSearch(state.query);
        
        // Click "Search this area" button
        const searchAreaClicked = await clickSearchAreaButton();
        
        if (searchAreaClicked) {
            // Scroll results feed completely
            const feed = document.querySelector(RESULTS_FEED_SEL);
            if (feed) {
                await scrollResultsFeed(feed);
            }
            
            // Process all results
            await processAllResults();
        } else {
            log('⚠️ نتوانست دکمه "Search this area" را کلیک کند - ادامه با نتایج موجود');
            
            const feed = document.querySelector(RESULTS_FEED_SEL);
            if (feed) {
                await scrollResultsFeed(feed);
            }
            
            await processAllResults();
        }
        
        // Decrease zoom level for next iteration
        state.currentZoomLevel--;
        
        if (state.currentZoomLevel >= CFG.endZoomDefault && state.running) {
            log(`🔄 ادامه با زوم ${state.currentZoomLevel}`);
            await sleep(2000);
            await performZoomCycle();
        } else {
            log('🏁 تمام سطوح زوم پردازش شد');
            state.running = false;
        }
    };

    // Modern Logging functions
    const log = (msg, type = 'info') => {
        const logContent = document.getElementById('gm-log-content');
        if (!logContent) {
            console.log(`[${nowStr()}] ${msg}`);
            return;
        }
        
        const time = nowStr();
        const logEntry = document.createElement('div');
        logEntry.className = `gm-log-entry ${type}`;
        logEntry.textContent = `[${time}] ${msg}`;
        
        logContent.appendChild(logEntry);
        
        // Keep only last 50 entries
        const entries = logContent.querySelectorAll('.gm-log-entry');
        if (entries.length > 50) {
            entries[0].remove();
        }
        
        // Auto scroll to bottom
        const logContainer = document.getElementById('gm-log');
        if (logContainer && !logContainer.classList.contains('collapsed')) {
            logContainer.scrollTop = logContainer.scrollHeight;
        }
        
        console.log(`[${time}] ${msg}`);
    };

    const updateResultsDisplay = () => {
        const resultsArea = document.getElementById('gm-results');
        if (!resultsArea) return;
        
        const text = state.results.map((item, idx) => {
            const phone = item.phone || 'ندارد';
            const mobile = item.mobile || 'ندارد';
            const address = item.address || 'ندارد';
            const website = item.website || 'ندارد';
            const category = item.category || 'ندارد';
            const rating = item.rating || 'ندارد';
            
            return `${idx + 1}. ${item.name}\n` +
                   `   تلفن: ${phone}\n` +
                   `   موبایل: ${mobile}\n` +
                   `   آدرس: ${address}\n` +
                   `   وب‌سایت: ${website}\n` +
                   `   دسته‌بندی: ${category}\n` +
                   `   امتیاز: ${rating}\n` +
                   `   مختصات: ${item.lat}, ${item.lng}\n`;
        }).join('\n');
        
        resultsArea.value = text;
    };

    // Map click handler
    const handleMapClick = (event) => {
        if (!state.running) {
            // Extract coordinates from click
            const rect = event.target.getBoundingClientRect();
            const x = event.clientX - rect.left;
            const y = event.clientY - rect.top;
            
            // This is a simplified approach - in reality, you'd need to convert pixel coordinates to lat/lng
            // For now, we'll use the current center as approximation
            const currentCenter = getCurrentCenter();
            if (currentCenter) {
                state.centerPoint = currentCenter;
                log(`📍 نقطه مرکز تنظیم شد: ${currentCenter.lat}, ${currentCenter.lng}`);
                updateOriginDisplay();
            }
        }
    };

    const getCurrentCenter = () => {
        try {
            // Method 1: Try to get coordinates from URL hash
            const url = window.location.href;
            const hashMatch = url.match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (hashMatch) {
                return {
                    lat: parseFloat(hashMatch[1]),
                    lng: parseFloat(hashMatch[2])
                };
            }

            // Method 2: Try to get from search params
            const urlParams = new URLSearchParams(window.location.search);
            const lat = urlParams.get('lat') || urlParams.get('latitude');
            const lng = urlParams.get('lng') || urlParams.get('longitude');
            if (lat && lng) {
                return {
                    lat: parseFloat(lat),
                    lng: parseFloat(lng)
                };
            }

            // Method 3: Try to extract from Google Maps URL patterns
            const placeMatch = url.match(/place\/[^@]*@(-?\d+\.\d+),(-?\d+\.\d+)/);
            if (placeMatch) {
                return {
                    lat: parseFloat(placeMatch[1]),
                    lng: parseFloat(placeMatch[2])
                };
            }

            // Method 4: Try to get from data attributes in DOM
            const coordElements = document.querySelectorAll('[data-lat][data-lng], [lat][lng]');
            if (coordElements.length > 0) {
                const elem = coordElements[0];
                const lat = elem.getAttribute('data-lat') || elem.getAttribute('lat');
                const lng = elem.getAttribute('data-lng') || elem.getAttribute('lng');
                if (lat && lng) {
                    return {
                        lat: parseFloat(lat),
                        lng: parseFloat(lng)
                    };
                }
            }

            // Method 5: Try to get from Google Maps API if available
            if (window.google && window.google.maps && window.google.maps.Map) {
                const mapElements = document.querySelectorAll('[data-map], .gm-style');
                for (let elem of mapElements) {
                    if (elem._gm_map && elem._gm_map.getCenter) {
                        const center = elem._gm_map.getCenter();
                        return {
                            lat: center.lat(),
                            lng: center.lng()
                        };
                    }
                }
            }

            // Method 6: Try to parse from page title or meta tags
            const titleMatch = document.title.match(/(-?\d+\.\d+),\s*(-?\d+\.\d+)/);
            if (titleMatch) {
                return {
                    lat: parseFloat(titleMatch[1]),
                    lng: parseFloat(titleMatch[2])
                };
            }

            // Setup location change listener
            if (!window.gmLocationListener) {
                window.gmLocationListener = true;
                const originalPushState = history.pushState;
                const originalReplaceState = history.replaceState;
                
                history.pushState = function() {
                    originalPushState.apply(history, arguments);
                    setTimeout(() => {
                        const center = getCurrentCenter();
                        if (center && state.centerPoint) {
                            state.centerPoint = center;
                            updateOriginDisplay();
                        }
                    }, 100);
                };
                
                history.replaceState = function() {
                    originalReplaceState.apply(history, arguments);
                    setTimeout(() => {
                        const center = getCurrentCenter();
                        if (center && state.centerPoint) {
                            state.centerPoint = center;
                            updateOriginDisplay();
                        }
                    }, 100);
                };
            }

            // Default coordinates (Tehran) - only if no other method worked
            log('⚠️ از مختصات پیش‌فرض تهران استفاده می‌شود');
            return {
                lat: 35.6892,
                lng: 51.3890
            };
        } catch (error) {
            console.error('Error getting current center:', error);
            log('❌ خطا در تشخیص مختصات، از مختصات پیش‌فرض استفاده می‌شود');
            return {
                lat: 35.6892,
                lng: 51.3890
            };
        }
    };

    const updateOriginDisplay = () => {
        const originDiv = document.getElementById('gm-origin');
        if (originDiv && state.centerPoint) {
            originDiv.textContent = `مبدا: ${state.centerPoint.lat.toFixed(6)}, ${state.centerPoint.lng.toFixed(6)}`;
        }
    };

    // Modern UI Styles
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
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                border: none;
                border-radius: 20px;
                box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25), 0 0 0 1px rgba(255, 255, 255, 0.1);
                z-index: 999999;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                font-size: 14px;
                direction: rtl;
                backdrop-filter: blur(20px);
                animation: slideInRight 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
                overflow: hidden;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            @keyframes slideInRight {
                from {
                    transform: translateX(100%) scale(0.8);
                    opacity: 0;
                }
                to {
                    transform: translateX(0) scale(1);
                    opacity: 1;
                }
            }
            
            .gm-header {
                background: rgba(255, 255, 255, 0.15);
                backdrop-filter: blur(20px);
                padding: 20px 24px;
                border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                display: flex;
                align-items: center;
                justify-content: space-between;
            }
            
            .gm-title {
                display: flex;
                align-items: center;
                gap: 12px;
            }
            
            .gm-icon {
                font-size: 24px;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0%, 100% { transform: scale(1); }
                50% { transform: scale(1.1); }
            }
            
            .gm-header h3 {
                margin: 0;
                color: white;
                font-weight: 600;
                font-size: 18px;
                text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
            }
            
            .gm-header-controls {
                display: flex;
                gap: 8px;
            }
            
            .gm-btn-icon {
                width: 32px;
                height: 32px;
                border: none;
                border-radius: 8px;
                background: rgba(255, 255, 255, 0.1);
                color: white;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
                transition: all 0.2s ease;
                backdrop-filter: blur(10px);
            }
            
            .gm-btn-icon:hover {
                background: rgba(255, 255, 255, 0.2);
                transform: scale(1.05);
            }
            
            .gm-btn-close:hover {
                background: rgba(239, 68, 68, 0.8);
            }
            
            .gm-content {
                background: rgba(255, 255, 255, 0.95);
                backdrop-filter: blur(20px);
                padding: 24px;
                max-height: calc(90vh - 80px);
                overflow-y: auto;
                scrollbar-width: thin;
                scrollbar-color: rgba(102, 126, 234, 0.3) transparent;
            }
            
            .gm-content::-webkit-scrollbar {
                width: 6px;
            }
            
            .gm-content::-webkit-scrollbar-track {
                background: transparent;
            }
            
            .gm-content::-webkit-scrollbar-thumb {
                background: rgba(102, 126, 234, 0.3);
                border-radius: 3px;
            }
            
            .gm-section {
                margin-bottom: 24px;
                animation: fadeInUp 0.6s ease forwards;
                opacity: 0;
                transform: translateY(20px);
            }
            
            .gm-section:nth-child(1) { animation-delay: 0.1s; }
            .gm-section:nth-child(2) { animation-delay: 0.2s; }
            .gm-section:nth-child(3) { animation-delay: 0.3s; }
            .gm-section:nth-child(4) { animation-delay: 0.4s; }
            .gm-section:nth-child(5) { animation-delay: 0.5s; }
            
            @keyframes fadeInUp {
                to {
                    opacity: 1;
                    transform: translateY(0);
                }
            }
            
            .gm-label {
                display: flex;
                align-items: center;
                gap: 8px;
                font-weight: 600;
                color: #374151;
                margin-bottom: 12px;
                font-size: 14px;
            }
            
            .gm-label-icon {
                font-size: 16px;
            }
            
            .gm-input {
                width: 100%;
                padding: 12px 16px;
                border: 2px solid #e5e7eb;
                border-radius: 12px;
                font-size: 14px;
                font-family: inherit;
                background: white;
                transition: all 0.3s ease;
                box-sizing: border-box;
            }
            
            .gm-input:focus {
                outline: none;
                border-color: #667eea;
                box-shadow: 0 0 0 3px rgba(102, 126, 234, 0.1);
                transform: translateY(-1px);
            }
            
            .gm-coords {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 12px;
            }
            
            .gm-coord-input {
                font-size: 13px;
            }
            
            .gm-coord-buttons {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
            }
            
            .gm-zoom-range {
                display: grid;
                grid-template-columns: 1fr auto 1fr;
                gap: 16px;
                align-items: end;
            }
            
            .gm-zoom-input {
                display: flex;
                flex-direction: column;
                gap: 6px;
            }
            
            .gm-zoom-input label {
                font-size: 12px;
                font-weight: 500;
                color: #6b7280;
            }
            
            .gm-zoom-field {
                padding: 10px 12px;
                font-size: 13px;
            }
            
            .gm-zoom-separator {
                font-size: 18px;
                font-weight: 600;
                color: #667eea;
                margin-bottom: 12px;
            }
            
            .gm-btn {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                padding: 12px 20px;
                border: none;
                border-radius: 12px;
                font-size: 14px;
                font-weight: 600;
                font-family: inherit;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
            }
            
            .gm-btn::before {
                content: '';
                position: absolute;
                top: 0;
                left: -100%;
                width: 100%;
                height: 100%;
                background: linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.2), transparent);
                transition: left 0.5s;
            }
            
            .gm-btn:hover::before {
                left: 100%;
            }
            
            .gm-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
            }
            
            .gm-btn:active {
                transform: translateY(0);
            }
            
            .gm-btn-primary {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(102, 126, 234, 0.4);
            }
            
            .gm-btn-danger {
                background: linear-gradient(135deg, #ff6b6b 0%, #ee5a24 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(255, 107, 107, 0.4);
            }
            
            .gm-btn-secondary {
                background: linear-gradient(135deg, #74b9ff 0%, #0984e3 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(116, 185, 255, 0.4);
            }
            
            .gm-btn-success {
                background: linear-gradient(135deg, #00b894 0%, #00a085 100%);
                color: white;
                box-shadow: 0 4px 15px rgba(0, 184, 148, 0.4);
            }
            
            .gm-btn:disabled {
                background: #e5e7eb;
                color: #9ca3af;
                cursor: not-allowed;
                transform: none;
                box-shadow: none;
            }
            
            .gm-btn:disabled:hover {
                transform: none;
                box-shadow: none;
            }
            
            .gm-controls {
                display: grid;
                grid-template-columns: 1fr 1fr;
                gap: 12px;
                margin-bottom: 24px;
            }
            
            .gm-controls .gm-btn:first-child {
                grid-column: 1 / -1;
            }
            
            .gm-status {
                background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
                border-radius: 16px;
                padding: 20px;
                margin-bottom: 24px;
                border: 1px solid rgba(102, 126, 234, 0.1);
            }
            
            .gm-status-item {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 12px;
            }
            
            .gm-status-item:last-child {
                margin-bottom: 0;
            }
            
            .gm-status-label {
                font-weight: 600;
                color: #374151;
                font-size: 14px;
            }
            
            .gm-status-value {
                font-weight: 500;
                color: #667eea;
                font-size: 14px;
            }
            
            .gm-count-badge {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                padding: 4px 12px;
                border-radius: 20px;
                font-size: 12px;
                font-weight: 600;
                animation: countPulse 0.3s ease;
            }
            
            @keyframes countPulse {
                0% { transform: scale(1); }
                50% { transform: scale(1.1); }
                100% { transform: scale(1); }
            }
            
            .gm-log-section {
                background: #f8fafc;
                border-radius: 16px;
                overflow: hidden;
                border: 1px solid #e2e8f0;
            }
            
            .gm-log-header {
                display: flex;
                align-items: center;
                justify-content: space-between;
                padding: 16px 20px;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                font-weight: 600;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            
            .gm-log-header:hover {
                background: linear-gradient(135deg, #5a67d8 0%, #6b46c1 100%);
            }
            
            .gm-log-toggle {
                background: rgba(255, 255, 255, 0.1);
                transition: transform 0.3s ease;
            }
            
            .gm-log-toggle.collapsed {
                transform: rotate(-90deg);
            }
            
            .gm-log {
                max-height: 200px;
                overflow-y: auto;
                transition: all 0.3s ease;
            }
            
            .gm-log.collapsed {
                max-height: 0;
            }
            
            #gm-log-content {
                padding: 16px 20px;
                font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
                font-size: 12px;
                line-height: 1.5;
                color: #374151;
                white-space: pre-wrap;
                word-break: break-word;
            }
            
            .gm-log-entry {
                margin-bottom: 8px;
                padding: 8px 12px;
                border-radius: 8px;
                background: white;
                border-left: 4px solid #667eea;
                animation: logEntrySlide 0.3s ease;
            }
            
            @keyframes logEntrySlide {
                from {
                    transform: translateX(-20px);
                    opacity: 0;
                }
                to {
                    transform: translateX(0);
                    opacity: 1;
                }
            }
            
            @keyframes slideOutRight {
                from {
                    transform: translateX(0);
                    opacity: 1;
                }
                to {
                    transform: translateX(100%);
                    opacity: 0;
                }
            }
            
            .gm-log-entry.success {
                border-left-color: #10b981;
                background: #f0fdf4;
            }
            
            .gm-log-entry.error {
                border-left-color: #ef4444;
                background: #fef2f2;
            }
            
            .gm-log-entry.warning {
                border-left-color: #f59e0b;
                background: #fffbeb;
            }
            
            .gm-log-entry.info {
                border-left-color: #3b82f6;
                background: #eff6ff;
            }
            
            #gm-panel.minimized .gm-content {
                display: none;
            }
            
            #gm-panel.minimized {
                width: 300px;
            }
            
            @media (max-width: 480px) {
                #gm-panel {
                    width: calc(100vw - 40px);
                    right: 20px;
                    left: 20px;
                }
            }
        `;
        
        document.head.appendChild(styles);
    };

    // Modern UI HTML
    const html = `
        <div id="gm-panel">
            <div class="gm-header">
                <div class="gm-title">
                    <div class="gm-icon">🗺️</div>
                    <h3>Advanced Maps Scraper</h3>
                </div>
                <div class="gm-header-controls">
                    <button id="gm-minimize" class="gm-btn-icon" title="Minimize">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 13H5v-2h14v2z"/>
                        </svg>
                    </button>
                    <button id="gm-close" class="gm-btn-icon gm-btn-close" title="Close">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
                        </svg>
                    </button>
                </div>
            </div>
            <div class="gm-content" id="gm-content">
                <div class="gm-section">
                    <label class="gm-label">
                        <span class="gm-label-icon">🔍</span>
                        <span>کلمه کلیدی جستجو</span>
                    </label>
                    <input type="text" id="gm-query" class="gm-input" placeholder="مثال: رستوران، داروخانه، بانک، کافه..." />
                </div>
                
                <div class="gm-section">
                    <label class="gm-label">
                        <span class="gm-label-icon">📍</span>
                        <span>مختصات نقطه مرکز</span>
                    </label>
                    <div id="gm-origin" style="font-size:12px;color:#6b7280;margin-bottom:12px;padding:8px 12px;background:#f9fafb;border-radius:8px;">مبدا: روی نقشه کلیک کنید یا مختصات را وارد کنید</div>
                    <div class="gm-coords">
                        <input type="number" id="gm-lat" class="gm-input gm-coord-input" placeholder="عرض جغرافیایی" step="0.000001" />
                        <input type="number" id="gm-lng" class="gm-input gm-coord-input" placeholder="طول جغرافیایی" step="0.000001" />
                    </div>
                    <div class="gm-coord-buttons">
                        <button id="gm-set-manual" class="gm-btn gm-btn-secondary">
                            <span class="gm-btn-icon">📝</span>
                            <span>تنظیم دستی</span>
                        </button>
                        <button id="gm-detect-current" class="gm-btn gm-btn-secondary">
                            <span class="gm-btn-icon">🎯</span>
                            <span>تشخیص خودکار</span>
                        </button>
                    </div>
                    <button id="gm-set-center" class="gm-btn gm-btn-success" style="width:100%;margin-top:12px;">
                        <span class="gm-btn-icon">📍</span>
                        <span>ثبت نقطه مرکز</span>
                    </button>
                </div>
                
                <div class="gm-section">
                    <label class="gm-label">
                        <span class="gm-label-icon">🔍</span>
                        <span>محدوده سطح زوم</span>
                    </label>
                    <div class="gm-zoom-range">
                        <div class="gm-zoom-input">
                            <label>زوم شروع:</label>
                            <input type="number" id="gm-start-zoom" class="gm-input gm-zoom-field" min="10" max="21" value="19" />
                        </div>
                        <div class="gm-zoom-separator">→</div>
                        <div class="gm-zoom-input">
                            <label>زوم پایان:</label>
                            <input type="number" id="gm-end-zoom" class="gm-input gm-zoom-field" min="10" max="21" value="14" />
                        </div>
                    </div>
                </div>
                
                <div class="gm-controls">
                    <button id="gm-start" class="gm-btn gm-btn-primary">
                        <span class="gm-btn-icon">🚀</span>
                        <span>شروع اسکرپینگ</span>
                    </button>
                    <button id="gm-stop" class="gm-btn gm-btn-danger" disabled>
                        <span class="gm-btn-icon">⏹️</span>
                        <span>توقف</span>
                    </button>
                    <button id="gm-clear" class="gm-btn gm-btn-secondary">
                        <span class="gm-btn-icon">🗑️</span>
                        <span>پاک کردن</span>
                    </button>
                    <button id="gm-export" class="gm-btn gm-btn-success">
                        <span class="gm-btn-icon">💾</span>
                        <span>خروجی CSV</span>
                    </button>
                </div>
                
                <div class="gm-status">
                    <div class="gm-status-item">
                        <div class="gm-status-label">وضعیت سیستم:</div>
                        <div id="gm-status" class="gm-status-value">آماده برای شروع</div>
                    </div>
                    <div class="gm-status-item">
                        <div class="gm-status-label">تعداد نتایج:</div>
                        <div class="gm-status-value">
                            <span id="gm-stats" class="gm-count-badge">0</span>
                        </div>
                    </div>
                </div>
                
                <div class="gm-log-section">
                    <div class="gm-log-header" id="gm-log-header">
                        <div style="display:flex;align-items:center;gap:8px;">
                            <span class="gm-label-icon">📋</span>
                            <span>گزارش عملیات لحظه‌ای</span>
                        </div>
                        <button id="gm-log-toggle" class="gm-btn-icon gm-log-toggle">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/>
                            </svg>
                        </button>
                    </div>
                    <div class="gm-log" id="gm-log">
                        <div id="gm-log-content"></div>
                    </div>
                </div>
                
                <div style="margin-top:24px;">
                    <label class="gm-label">
                        <span class="gm-label-icon">📄</span>
                        <span>نتایج استخراج شده</span>
                    </label>
                    <textarea id="gm-results" readonly style="width:100%;height:150px;font-size:11px;border:2px solid #e5e7eb;border-radius:12px;padding:12px;resize:vertical;font-family:monospace;background:#f9fafb;"></textarea>
                </div>
            </div>
        </div>
    `;

    // Initialize UI
    const initUI = () => {
        if (document.getElementById('gm-panel')) return;
        
        // Apply styles first
        addPanelStyles();
        
        document.body.insertAdjacentHTML('beforeend', html);
        
        // Event listeners
        document.getElementById('gm-set-center').addEventListener('click', () => {
            const center = getCurrentCenter();
            if (center) {
                state.centerPoint = center;
                log(`📍 نقطه مرکز ثبت شد: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`);
                updateOriginDisplay();
                // Fill manual input fields
                document.getElementById('gm-lat').value = center.lat.toFixed(6);
                document.getElementById('gm-lng').value = center.lng.toFixed(6);
            } else {
                log('❌ نتوانست مختصات فعلی را تشخیص دهد');
            }
        });
        
        document.getElementById('gm-set-manual').addEventListener('click', () => {
            const lat = parseFloat(document.getElementById('gm-lat').value);
            const lng = parseFloat(document.getElementById('gm-lng').value);
            
            if (isNaN(lat) || isNaN(lng)) {
                log('❌ لطفاً مختصات معتبر وارد کنید');
                return;
            }
            
            if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
                log('❌ مختصات خارج از محدوده مجاز است');
                return;
            }
            
            state.centerPoint = { lat, lng };
            log(`📝 نقطه مرکز به صورت دستی تنظیم شد: ${lat.toFixed(6)}, ${lng.toFixed(6)}`);
            updateOriginDisplay();
        });
        
        document.getElementById('gm-detect-current').addEventListener('click', () => {
            log('🔍 در حال تشخیص مختصات فعلی...');
            const center = getCurrentCenter();
            if (center && (center.lat !== 35.6892 || center.lng !== 51.3890)) {
                state.centerPoint = center;
                document.getElementById('gm-lat').value = center.lat.toFixed(6);
                document.getElementById('gm-lng').value = center.lng.toFixed(6);
                log(`✅ مختصات فعلی تشخیص داده شد: ${center.lat.toFixed(6)}, ${center.lng.toFixed(6)}`);
                updateOriginDisplay();
            } else {
                log('❌ نتوانست مختصات فعلی را تشخیص دهد - لطفاً به صورت دستی وارد کنید');
            }
        });
        
        document.getElementById('gm-start').addEventListener('click', async () => {
            const query = document.getElementById('gm-query').value.trim();
            const startZoom = parseInt(document.getElementById('gm-start-zoom').value);
            const endZoom = parseInt(document.getElementById('gm-end-zoom').value);
            
            if (!query) {
                log('❌ لطفاً کلمه کلیدی را وارد کنید');
                return;
            }
            
            if (!state.centerPoint) {
                log('❌ لطفاً ابتدا نقطه مرکز را تنظیم کنید');
                return;
            }
            
            state.running = true;
            state.query = query;
            state.currentZoomLevel = startZoom;
            CFG.endZoomDefault = endZoom;
            state.results = [];
            state.visited.clear();
            
            log('🚀 شروع اسکرپر پیشرفته مبتنی بر کلیک');
            log(`🎯 کلمه کلیدی: "${query}"`);
            log(`📍 نقطه مرکز: ${state.centerPoint.lat}, ${state.centerPoint.lng}`);
            log(`🔍 زوم: ${startZoom} تا ${endZoom}`);
            
            document.getElementById('gm-status').textContent = 'در حال اجرا...';
            
            try {
                await performZoomCycle();
                log('✅ اسکرپر با موفقیت تمام شد');
                document.getElementById('gm-status').textContent = 'تمام شد';
            } catch (error) {
                log(`❌ خطا در اجرای اسکرپر: ${error.message}`);
                document.getElementById('gm-status').textContent = 'خطا';
            }
            
            state.running = false;
        });
        
        document.getElementById('gm-stop').addEventListener('click', () => {
            state.running = false;
            log('⏹️ اسکرپر متوقف شد');
            document.getElementById('gm-status').textContent = 'متوقف شد';
        });
        
        document.getElementById('gm-clear').addEventListener('click', () => {
            state.results = [];
            state.visited.clear();
            document.getElementById('gm-log-content').innerHTML = '';
            document.getElementById('gm-results').value = '';
            document.getElementById('gm-stats').textContent = '0';
            document.getElementById('gm-status').textContent = 'آماده برای شروع';
            log('🧹 تمام داده‌ها پاک شد', 'info');
        });
        
        // Export functionality
        document.getElementById('gm-export').addEventListener('click', () => {
            if (state.results.length === 0) {
                log('❌ هیچ نتیجه‌ای برای خروجی وجود ندارد!', 'warning');
                return;
            }
            
            // Create CSV content
            const headers = ['نام', 'آدرس', 'امتیاز', 'تعداد نظرات', 'نوع کسب‌وکار', 'وضعیت', 'تلفن', 'وب‌سایت', 'عرض جغرافیایی', 'طول جغرافیایی', 'لینک Google Maps'];
            let csvContent = '\uFEFF' + headers.join(',') + '\n'; // Add BOM for UTF-8
            
            state.results.forEach(result => {
                const row = [
                    `"${(result.name || '').replace(/"/g, '""')}"`,
                    `"${(result.address || '').replace(/"/g, '""')}"`,
                    result.rating || '',
                    result.reviews || '',
                    `"${(result.type || '').replace(/"/g, '""')}"`,
                    `"${(result.status || '').replace(/"/g, '""')}"`,
                    `"${(result.phone || '').replace(/"/g, '""')}"`,
                    `"${(result.website || '').replace(/"/g, '""')}"`,
                    result.lat || '',
                    result.lng || '',
                    `"${(result.link || '').replace(/"/g, '""')}"`
                ];
                csvContent += row.join(',') + '\n';
            });
            
            // Create and download file
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            const url = URL.createObjectURL(blob);
            link.setAttribute('href', url);
            link.setAttribute('download', `google_maps_results_${new Date().toISOString().slice(0,10)}.csv`);
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            log(`✅ فایل CSV با ${state.results.length} نتیجه دانلود شد`, 'success');
        });
        
        // Minimize/Maximize functionality
        document.getElementById('gm-minimize').addEventListener('click', () => {
            const panel = document.getElementById('gm-panel');
            const content = document.getElementById('gm-content');
            const minimizeBtn = document.getElementById('gm-minimize');
            
            if (panel.classList.contains('minimized')) {
                panel.classList.remove('minimized');
                content.style.display = 'block';
                minimizeBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M19 13H5v-2h14v2z"/>
                    </svg>
                `;
                minimizeBtn.title = 'Minimize';
            } else {
                panel.classList.add('minimized');
                content.style.display = 'none';
                minimizeBtn.innerHTML = `
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z"/>
                    </svg>
                `;
                minimizeBtn.title = 'Maximize';
            }
        });
        
        // Close functionality
        document.getElementById('gm-close').addEventListener('click', () => {
            const panel = document.getElementById('gm-panel');
            panel.style.animation = 'slideOutRight 0.3s ease-in-out';
            setTimeout(() => {
                panel.remove();
            }, 300);
        });
        
        // Log toggle functionality
        document.getElementById('gm-log-header').addEventListener('click', () => {
            const logContent = document.getElementById('gm-log');
            const toggleBtn = document.getElementById('gm-log-toggle');
            
            if (logContent.classList.contains('collapsed')) {
                logContent.classList.remove('collapsed');
                toggleBtn.classList.remove('collapsed');
            } else {
                logContent.classList.add('collapsed');
                toggleBtn.classList.add('collapsed');
            }
        });
        
        // Update stats periodically
        setInterval(() => {
            const statsElement = document.getElementById('gm-stats');
            if (statsElement) {
                statsElement.textContent = state.results.length.toString();
                // Add pulse animation when count changes
                statsElement.style.animation = 'none';
                setTimeout(() => {
                    statsElement.style.animation = 'countPulse 0.3s ease';
                }, 10);
            }
        }, 1000);
        
        log('✅ رابط کاربری اسکرپر پیشرفته آماده است');
        log('📍 برای شروع، ابتدا نقطه مرکز را تنظیم کنید');
    };

    // Initialize when page loads
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initUI);
    } else {
        initUI();
    }

})();
