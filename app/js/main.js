/**
 * ==========================================================================
 * قرآني معاي - المحرك البرمجي الرئيسي للتطبيق (Quran Chat Core Engine)
 * الإصدار الذهبي الموحد - مضافاً إليه محرك البحث التراكمي الشامل وميزة عرض الكل
 * ==========================================================================
 */

// --- 1. الإعدادات العامة وحالة التطبيق (State & Configuration) ---
const CONFIG = {
    allSurahsMetaPath: 'allSurahsMeta.json',
    tafsirBasePath: 'tafseer',
    maxRecentChats: 7,
    maxSearchResultsDisplay: 7,
    concurrencyBatchSize: 15, // معالجة 15 سورة بالتوازي في الدفعة الواحدة لتسريع البحث دون استهلاك موارد الجهاز
    defaultGreeting: "وعليكم السلام ورحمة الله وبركاته. أهلاً بك في تطبيق \"قرآني معاي\" 📖✨ رفيقك الرقمي لتدبر وتلاوة الذكر الحكيم. كيف يمكنني مساعدتك اليوم؟"
};

const STATE = {
    allSurahsMeta: [],
    fetchedSurahsCache: {},
    currentChatID: `chat_${Date.now()}`,
    currentZenModeSurahIndex: null,
    currentZenModeAyahNumber: null,
    isVoiceRecording: false,
    zenTriggerElement: null // لحفظ وتتبع مرجع التركيز التفاعلي ومنع تداخل قارئات الشاشة
};

// --- 2. جلب وعزل عناصر واجهة المستخدم (DOM Elements Cache) ---
const DOM = {
    sidebar: document.getElementById('sidebar'),
    sidebarToggle: document.getElementById('sidebar-toggle'),
    messageArea: document.getElementById('message-area'),
    userInput: document.getElementById('user-input'),
    sendBtn: document.getElementById('send-btn'),
    voiceInputBtn: document.getElementById('voice-input-btn'),
    zenModeOverlay: document.getElementById('zen-mode-overlay'),
    zenAyahDisplay: document.getElementById('zen-ayah-display'),
    zenSurahInfoDisplay: document.getElementById('zen-surah-info-display'),
    zenCloseBtn: document.getElementById('zen-close-btn'),
    navNewChat: document.getElementById('nav-new-chat'),
    chatInterfaceTitle: document.getElementById('chat-interface-title'),
    appLoadingOverlay: document.getElementById('app-loading-overlay'),
    recentChatsUI: document.getElementById('recent-recitations-list-ui'),
    navZenToggle: document.getElementById('nav-zen-mode-toggle')
};

// الأرقام الهندية المعتمدة في واجهة المستخدم العربية
const ARABIC_INDIC_NUMERALS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];

// --- 3. الأدوات الخدمية المساعدة لتهيئة وتصفية النصوص (Utilities) ---

/**
 * تحويل الأرقام الإنجليزية القياسية إلى أرقام هندية عربية جمالية لعرضها في الواجهة
 */
function toArabicNumerals(num) {
    if (num === null || num === undefined) return '';
    return String(num).replace(/[0-9]/g, (digit) => ARABIC_INDIC_NUMERALS[+digit]);
}

/**
 * تحويل الأرقام الشرقية بكافة أشكالها (هندية أو فارسية) إلى أرقام برمجية قياسية (Latin Digits) لإجراء الحسابات
 */
function convertIndianToArabicNumerals(str) {
    if (!str) return '';
    const indianNumerals = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩', '۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
    const standardNumerals = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];
    return String(str).replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (char) => {
        const index = indianNumerals.indexOf(char);
        return index !== -1 ? standardNumerals[index] : char;
    });
}

/**
 * حماية التعبيرات النمطية من محاولات التلاعب بالرموز الخاصة لفرملة المتصفح (Anti-ReDoS)
 */
function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * دالة تعقيم لمنع حقن نصوص برمجية ضارة (HTML Sanitizer)
 */
function sanitizeHTML(htmlString) {
    const tempDiv = document.createElement('div');
    tempDiv.textContent = htmlString;
    return tempDiv.innerHTML;
}

/**
 * تنظيف وتوحيد الحروف العربية من التشكيل والهمزات المختلفة لضمان سرعة البحث والمطابقة اللغوية
 * تم تطويرها لتعويض وحل مشكلة الألف الخنجرية العثمانية لضمان مطابقة الكلمات المصحفية
 */
function normalizeArabicText(text) {
    if (!text) return "";
    let cleanText = String(text);
    
    // أولاً: استبدال الألف الخنجرية العثمانية (\u0670) بألف برمجية قياسية لضمان مطابقة الكلمات مثل (ميثاق، الكتاب، السماوات)
    cleanText = cleanText.replace(/\u0670/g, "\u0627");
    
    // ثانياً: إزالة باقي التشكيل والرموز والوقف المصحفي بالكامل لضمان سرعة المطابقة اللغوية
    cleanText = cleanText.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, "");
    
    // ثالثاً: إزالة التلوين والتطويل اللغوي (المدّ)
    cleanText = cleanText.replace(/\u0640/g, "");
    
    // رابعاً: توحيد همزات الألف المختلفة والألف المقصورة والتاء المربوطة
    cleanText = cleanText.replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627");
    cleanText = cleanText.replace(/\u0629/g, "\u0647");
    cleanText = cleanText.replace(/\u0649/g, "\u064A");
    
    // خامساً: موازنة الكلمات القرآنية الشاذة إملائياً في الكتابة الحديثة لتتطابق تماماً
    cleanText = cleanText.replace(/الرحمان/g, "الرحمن");
    cleanText = cleanText.replace(/اسحق/g, "اسحاق");
    cleanText = cleanText.replace(/هرون/g, "هارون");
    cleanText = cleanText.replace(/سليمن/g, "سليمان");
    
    return cleanText.trim().toLowerCase();
}

// --- 4. محرك جلب البيانات والذاكرة المؤقتة (API & Data Handling) ---

/**
 * التحكم بظهور شاشة التحميل الذكية الفورية
 */
function toggleLoadingState(isLoading, message = "جاري التحميل...") {
    if (!DOM.appLoadingOverlay) return;
    const statusText = DOM.appLoadingOverlay.querySelector('.loader-status');
    if (statusText && message) statusText.textContent = message;

    if (isLoading) {
        DOM.appLoadingOverlay.style.display = 'flex';
        DOM.appLoadingOverlay.style.opacity = '1';
        DOM.appLoadingOverlay.setAttribute('aria-hidden', 'false');
    } else {
        DOM.appLoadingOverlay.style.opacity = '0';
        DOM.appLoadingOverlay.setAttribute('aria-hidden', 'true');
        setTimeout(() => {
            DOM.appLoadingOverlay.style.display = 'none';
        }, 300);
    }
}

/**
 * جلب بيانات السورة الواحدة مع التخزين المؤقت بالذاكرة لتجنب استهلاك الشبكة (In-Memory Caching)
 */
async function fetchSurahData(surahIndexNumeric) {
    if (!surahIndexNumeric) return null;
    const cleanIndex = parseInt(surahIndexNumeric);
    
    // استخدام التخزين المؤقت في الذاكرة لتوفير باقة بيانات المستخدم
    if (STATE.fetchedSurahsCache[cleanIndex]) {
        return STATE.fetchedSurahsCache[cleanIndex];
    }
    
    const filename = `surah/surah_${cleanIndex}.json`;
    try {
        const response = await fetch(filename);
        if (!response.ok) throw new Error(`فشل جلب ملف السورة رقم ${cleanIndex}`);
        const surahData = await response.json();
        STATE.fetchedSurahsCache[cleanIndex] = surahData;
        return surahData;
    } catch (error) {
        console.error(`خطأ أثناء محاولة جلب السورة ${cleanIndex}:`, error);
        addMessageToChat(`عفواً، تعذر تحميل بيانات السورة رقم ${toArabicNumerals(cleanIndex)}. يرجى التأكد من تشغيل خادم محلي.`, 'system', STATE.currentChatID, false, true);
        return null;
    }
}

/**
 * جلب التفسير الميسر الموجه لآية معينة بدقة
 */
async function fetchTafsirData(surahIndex, ayahNumber) {
    if (!surahIndex || !ayahNumber) return null;
    const filename = `${CONFIG.tafsirBasePath}/${parseInt(surahIndex)}/${parseInt(ayahNumber)}.json`;
    try {
        const response = await fetch(filename);
        if (!response.ok) {
            if (response.status === 404) return null;
            throw new Error(`تعذر تحميل التفسير ملقم الحالة ${response.status}`);
        }
        return await response.json();
    } catch (error) {
        console.error(`حدث خطأ أثناء جلب التفسير للآية [${surahIndex}:${ayahNumber}]:`, error);
        return { error: true, message: error.message };
    }
}

/**
 * فحص الميتا ومطابقة اسم السورة أو رقمها المُدخل لغوياً
 */
function findSurahMeta(identifier) {
    if (!STATE.allSurahsMeta || STATE.allSurahsMeta.length === 0) return null;
    const cleanedId = String(identifier).trim();
    
    // الفحص في حال تم إدخال رقم السورة مباشرة
    if (/^([1-9]|[1-9]\d|10\d|11[0-4])$/.test(cleanedId)) {
        return STATE.allSurahsMeta.find(s => parseInt(s.index) === parseInt(cleanedId));
    }
    
    const normalizedQuery = normalizeArabicText(cleanedId);
    // البحث بالمطابقة الكاملة أولاً ثم الجزئية
    return STATE.allSurahsMeta.find(s => 
        normalizeArabicText(s.name) === normalizedQuery ||
        (s.name_simple && normalizeArabicText(s.name_simple) === normalizedQuery) ||
        (s.englishName && normalizeArabicText(s.englishName).includes(normalizedQuery))
    ) || STATE.allSurahsMeta.find(s => normalizeArabicText(s.name).includes(normalizedQuery) && normalizedQuery.length >= 2);
}

// --- 5. محرك العرض والإنشاء الآمن لعناصر الرسائل (Secure Rendering Engine) ---

/**
 * إضافة رسالة موحدة للدردشة مع تعقيمها وحمايتها من الاختراق
 */
function addMessageToChat(content, sender, chatID, isHtml = false, doSave = true) {
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', sender);
    
    if (isHtml) {
        // حظر مدمج للثغرات البرمجية والتحويلات الخبيثة من خلال التصفية الهيكلية
        const safeContent = content
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
            .replace(/on\w+\s*=\s*["'][^"']*["']/gi, ""); // منع حقن الأكواد الذاتية التنفيذ
        bubble.innerHTML = safeContent;
    } else {
        bubble.textContent = content; // حماية مطلقة عند كتابة نصوص عادية
    }
    
    if (sender === 'system' && (content.includes('خطأ') || content.includes('فشل'))) {
        bubble.classList.add('error');
    }
    
    DOM.messageArea.appendChild(bubble);
    DOM.messageArea.scrollTop = DOM.messageArea.scrollHeight;
    
    if (doSave) saveMessageToHistory(chatID, sender, content, isHtml);
    return bubble;
}

/**
 * مؤشر الكتابة الإبداعي المؤقت للذكاء الروحي
 */
function addTypingIndicator() {
    const bubble = document.createElement('div');
    bubble.classList.add('message-bubble', 'quran', 'typing-indicator-bubble');
    bubble.innerHTML = `
        <div class="loading-dots">
            <span class="dot"></span>
            <span class="dot"></span>
            <span class="dot"></span>
        </div>
    `;
    DOM.messageArea.appendChild(bubble);
    DOM.messageArea.scrollTop = DOM.messageArea.scrollHeight;
    return bubble;
}

// --- 6. محرك تفسير النوايا اللغوية والبحث الذكي (Quranic NLP Intent Parser) ---

/**
 * محلل النوايا اللغوية الشامل والمرن لتفسير ما يكتبه المستخدم لغوياً بدقة متناهية
 */
function parseQueryIntent(query) {
    if (!query) return null;
    
    const normalized = normalizeArabicText(query);
    
    // رصد نية التفسير اللغوية
    const isTafsirIntent = normalized.includes("تفسير") || 
                           normalized.includes("معنى") || 
                           normalized.includes("شرح") || 
                           normalized.includes("توضيح");
                           
    // تنظيف العبارة من الكلمات الاستهلالية لتبسيط المطابقة الرقمية
    let cleanedQuery = query.replace(/^(?:تفسير|معنى|شرح|توضيح|آيات|ايات)\s+/i, "").trim();
    
    // النمط الأول: [اسم السورة] ثم [كلمة رابطة اختيارية] ثم [رقم الآية بأي أرقام]
    const pattern1 = /^(?:سورة\s+)?([^\d\s]+)\s*(?:آية|اية|ايه|أية|أيه|الآية|الاية|الايه|رقم|جزء)?\s*(\d+|[\u0660-\u0669\u06f0-\u06f9]+)$/i;
    
    // النمط الثاني: [كلمة رابطة] ثم [رقم الآية] ثم [حرف جر اختياري] ثم [اسم السورة]
    const pattern2 = /^(?:آية|اية|ايه|الآية|الاية|الايه|رقم)\s+(\d+|[\u0660-\u0669\u06f0-\u06f9]+)\s*(?:من|في)?\s*(?:سورة\s+)?([^\d\s]+)$/i;
    
    let match = cleanedQuery.match(pattern1);
    let surahIdentifier = "";
    let ayahStr = "";
    
    if (match) {
        surahIdentifier = match[1].trim();
        ayahStr = match[2].trim();
    } else {
        match = cleanedQuery.match(pattern2);
        if (match) {
            ayahStr = match[1].trim();
            surahIdentifier = match[2].trim();
        }
    }
    
    // معالجة الأرقام وتحويلها قياسياً
    if (ayahStr) {
        ayahStr = convertIndianToArabicNumerals(ayahStr);
    }
    
    // التحقق والمطابقة في حال وجود اسم سورة ورقم آية
    if (surahIdentifier && ayahStr) {
        const surahMeta = findSurahMeta(surahIdentifier);
        const ayahNum = parseInt(ayahStr);
        if (surahMeta && ayahNum > 0 && ayahNum <= surahMeta.verses) {
            return {
                intent: isTafsirIntent ? 'tafsir_ayah' : 'ayah',
                surahIndex: surahMeta.index,
                ayahNumber: ayahNum,
                surahName: surahMeta.name
            };
        }
    }
    
    // التحقق مما إذا كان الطلب يخص السورة بالكامل (مع أو بدون نية التفسير)
    const cleanForSurah = cleanedQuery.replace(/^(?:سورة)\s+/g, "").trim();
    const surahMetaOnly = findSurahMeta(cleanForSurah);
    if (surahMetaOnly) {
        return {
            intent: isTafsirIntent ? 'tafsir_surah' : 'surah',
            surahIndex: surahMetaOnly.index,
            surahName: surahMetaOnly.name
        };
    }
    
    // السقوط التلقائي الآمن (Graceful Fallback Intent): معاملة أي نص لغوي سليم كنية بحث
    const searchKeyword = query.replace(/^(?:آيات عن|ابحث عن|ماذا يقول القرآن عن|كلمة|البحث عن|تصفح آيات)\s*/i, "").trim();
    if (searchKeyword && searchKeyword.length >= 2) {
        return {
            intent: 'search',
            keyword: searchKeyword
        };
    }
    
    return null;
}

/**
 * محرك البحث المتوازي عالي الأداء المطور والمستقصي لكافة نتائج الـ 114 سورة كاملة
 * تم تحصينه بالكامل برمجياً ضد أخطاء عدم تطابق الهيكل ومشاكل الـ Null Reference
 */
async function searchKeywordInQuran(keyword, chatID) {
    const escapedKeyword = escapeRegExp(keyword);
    const normalizedKeyword = normalizeArabicText(escapedKeyword);
    
    const statusBubble = addMessageToChat(`جاري البحث الذكي عن آيات تتعلق بـ "${sanitizeHTML(keyword)}"... ⏳`, 'system', chatID, false, false);
    
    let resultsBuffer = [];
    const batchSize = CONFIG.concurrencyBatchSize;
    
    // البحث الشامل في الـ 114 سورة بشكل متكامل
    for (let i = 0; i < STATE.allSurahsMeta.length; i += batchSize) {
        const currentBatch = STATE.allSurahsMeta.slice(i, i + batchSize);
        const batchPromises = currentBatch.map(async (surahMeta) => {
            const surahData = await fetchSurahData(surahMeta.index);
            // حماية صارمة ضد الملفات التالفة أو غير الموجودة لمنع الانهيار
            if (!surahData || !surahData.verse) return [];
            
            const localResults = [];
            for (const key in surahData.verse) {
                const verseNum = parseInt(key.split('_')[1]);
                if (verseNum === 0) continue; // تخطي البسملة الافتراضية
                
                const originalText = surahData.verse[key];
                const normalizedVerse = normalizeArabicText(originalText);
                
                if (normalizedVerse.includes(normalizedKeyword)) {
                    localResults.push({
                        surahIdx: surahMeta.index,
                        surahName: surahMeta.name,
                        verseNum: verseNum,
                        text: originalText
                    });
                }
            }
            return localResults;
        });
        
        const batchResults = await Promise.all(batchPromises);
        for (const res of batchResults) {
            if (res) resultsBuffer.push(...res);
        }
    }
    
    if (statusBubble) statusBubble.remove();
    
    if (resultsBuffer.length > 0) {
        // تجميع النتائج برمجياً حسب السورة وتخزين النص الكامل في الذاكرة لعرضه لاحقاً
        const groupedResults = {};
        resultsBuffer.forEach(item => {
            if (!groupedResults[item.surahIdx]) {
                groupedResults[item.surahIdx] = {
                    surahName: item.surahName,
                    ayahs: []
                };
            }
            groupedResults[item.surahIdx].ayahs.push({
                num: item.verseNum,
                text: item.text
            });
        });
        
        const totalSurahs = Object.keys(groupedResults).length;
        
        // بناء واجهة الفهرس التفاعلية الأنيقة والمدمجة لسهولة التحكم اللمسي مع زر "عرض الكل"
        let indexHTML = `
            <div class="search-results-index-card" style="background-color: var(--bg-star-cluster); border: 1px solid rgba(148, 163, 184, 0.08); border-radius: var(--radius-md); padding: 1.2rem; width: 100%; box-shadow: var(--shadow-cosmic); margin-top: 0.5rem;">
                <p style="font-weight: 500; color: var(--text-pure); margin-bottom: 1rem; font-size: 0.95rem; line-height: 1.6;">
                    🔍 تم رصد <strong style="color: var(--color-pulsar-hover); font-size: 1.15em;">${toArabicNumerals(resultsBuffer.length)}</strong> مواضع لـ "${sanitizeHTML(keyword)}" موزعة على <strong style="color: var(--color-aurora-hover); font-size: 1.1em;">${toArabicNumerals(totalSurahs)}</strong> سورة.<br>
                    <span style="font-size: 0.82rem; color: var(--text-celestial);">انقر على رقم آية لعرضها منفصلة، أو اعرضها كاملة:</span>
                </p>
                
                <button class="tool-btn show-all-results-btn" data-keyword="${sanitizeHTML(keyword)}" style="width: 100%; justify-content: center; padding: 0.6rem; margin-bottom: 1rem; background-color: rgba(16, 185, 129, 0.1); border-color: rgba(16, 185, 129, 0.3); color: #34d399; font-weight: 700; gap: 0.5rem;">
                    📖 عرض جميع الآيات الـ (${toArabicNumerals(resultsBuffer.length)}) متتالية
                </button>
                
                <div class="index-scroll-area" style="display: flex; flex-direction: column; gap: 0.9rem; max-height: 300px; overflow-y: auto; padding-left: 5px; -webkit-overflow-scrolling: touch;">
        `;
        
        for (const surahIdx in groupedResults) {
            const group = groupedResults[surahIdx];
            indexHTML += `
                <div style="border-bottom: 1px solid rgba(148, 163, 184, 0.05); padding-bottom: 0.7rem; margin-bottom: 0.1rem;">
                    <span style="font-weight: 700; color: var(--text-luminous); font-size: 0.88rem; display: block; margin-bottom: 0.5rem;">
                        سورة ${group.surahName} (${toArabicNumerals(group.ayahs.length)} مواضع):
                    </span>
                    <div style="display: flex; flex-wrap: wrap; gap: 0.4rem;">
            `;
            
            group.ayahs.forEach(ayah => {
                indexHTML += `
                    <button class="tool-btn zen-trigger-btn" 
                            data-surah="${surahIdx}" 
                            data-ayah="${ayah.num}" 
                            style="padding: 0.3rem 0.65rem; font-size: 0.8rem; background-color: rgba(59, 130, 246, 0.04); border-color: rgba(59, 130, 246, 0.1); cursor: pointer;" 
                            title="استدعاء الآية رقم ${ayah.num}">
                        ${toArabicNumerals(ayah.num)}
                    </button>
                `;
            });
            
            indexHTML += `
                    </div>
                </div>
            `;
        }
        
        indexHTML += `
                </div>
            </div>
        `;
        
        const bubble = addMessageToChat(indexHTML, 'quran', chatID, true, true);
        
        // ربط نقرة زر "عرض الكل" لتوليد السرد الكامل
        const showAllBtn = bubble.querySelector('.show-all-results-btn');
        if (showAllBtn) {
            showAllBtn.addEventListener('click', () => {
                renderAllMatchingVerses(groupedResults, keyword, chatID);
                showAllBtn.disabled = true; // تعطيل الزر لتفادي إغراق الشات
                showAllBtn.style.opacity = '0.5';
            });
        }
        
        // ربط أزرار الفهرس لجلب وعرض الآية المحددة في الدردشة تحت الفهرس فور النقر عليها
        bubble.querySelectorAll('button[data-surah]').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const sIdx = e.currentTarget.dataset.surah;
                const aNum = e.currentTarget.dataset.ayah;
                STATE.zenTriggerElement = e.currentTarget;
                await fetchAndDisplaySingleAyah(sIdx, aNum, chatID);
            });
        });
        
    } else {
        addMessageToChat(`لم أعثر على نتائج لـ "${sanitizeHTML(keyword)}" في كامل المصحف الشريف.`, 'system', chatID, false, true);
    }
}

/**
 * دالة سرد وعرض كافة الآيات المكتشفة متتالية داخل كارت قراءة تفاعلي موحد بأداء فائق وسرعة مذهلة
 */
function renderAllMatchingVerses(groupedResults, keyword, chatID) {
    addMessageToChat(`جاري جمع الآيات الشامل لـ "${sanitizeHTML(keyword)}"...`, 'system', chatID, false, false);
    
    let allVersesHTML = `
        <div class="all-verses-stream" style="background-color: var(--bg-star-cluster); border: 1px solid rgba(148, 163, 184, 0.08); border-radius: var(--radius-md); padding: 1.4rem; width: 100%; box-shadow: var(--shadow-cosmic); margin-top: 0.5rem; text-align: right; max-height: 500px; overflow-y: auto; -webkit-overflow-scrolling: touch;">
            <h3 style="font-size: 1.1rem; color: var(--color-pulsar-hover); font-weight: 700; margin-bottom: 1.2rem; border-bottom: 1px solid rgba(148, 163, 184, 0.08); padding-bottom: 0.6rem; display: flex; align-items: center; gap: 0.5rem;">📖 سرد الآيات المكتشفة كاملاً</h3>
    `;
    
    const escapedKeyword = escapeRegExp(keyword);
    const regex = new RegExp(`(${escapedKeyword})`, 'gi');
    
    for (const surahIdx in groupedResults) {
        const group = groupedResults[surahIdx];
        allVersesHTML += `
            <div style="margin-bottom: 1.6rem; border-bottom: 1px dashed rgba(148, 163, 184, 0.05); padding-bottom: 1.2rem;">
                <h4 style="font-size: 1rem; color: var(--text-pure); font-weight: 700; margin-bottom: 1rem; color: var(--color-aurora-hover);">سورة ${group.surahName}</h4>
                <div style="display: flex; flex-direction: column; gap: 1rem;">
        `;
        
        group.ayahs.forEach(ayah => {
            // إبراز الكلمة البحثية داخل النص القرآني بسلاسة
            const highlightedText = ayah.text.replace(regex, `<span class="highlight">$1</span>`);
            
            ayahsHTML = `
                <div class="ayah-display-block" style="padding: 0.2rem 0;">
                    <span style="font-family: var(--font-quran); font-size: 1.7rem; line-height: 2.2; color: var(--text-pure); display: block; margin-bottom: 0.4rem;">
                        ${highlightedText} <span class="ayah-number-symbol">﴿${toArabicNumerals(ayah.num)}﴾</span>
                    </span>
                    <span style="font-size: 0.75rem; color: var(--text-celestial); display: block; text-align: left; opacity: 0.85;">الآية ${toArabicNumerals(ayah.num)}</span>
                </div>
            `;
            allVersesHTML += ayahsHTML;
        });
        
        allVersesHTML += `
                </div>
            </div>
        `;
    }
    
    allVersesHTML += `
        </div>
    `;
    
    addMessageToChat(allVersesHTML, 'quran', chatID, true, true);
}

/**
 * جلب وعرض آية واحدة مخصصة مع الأدوات التفاعلية الملحقة بها
 */
async function fetchAndDisplaySingleAyah(surahIndex, ayahNumberStr, chatID) {
    const surahMeta = STATE.allSurahsMeta.find(s => parseInt(s.index) === parseInt(surahIndex));
    const surahData = await fetchSurahData(surahIndex);
    if (!surahData || !surahData.verse || !surahMeta) return;

    const verseText = surahData.verse[`verse_${ayahNumberStr}`];
    if (verseText) {
        const ayahNumDisplay = toArabicNumerals(ayahNumberStr);
        const content = `
            <div class="ayah-text" data-surah-idx="${surahIndex}" data-ayah-num="${ayahNumberStr}">
                ${verseText} <span class="ayah-number-symbol">﴿${ayahNumDisplay}﴾</span>
            </div>
            <div class="surah-info">سورة ${surahMeta.name} - الآية ${ayahNumDisplay}</div>
            <div class="ayah-tools">
                <button class="tool-btn" data-action="tafsir" title="تفسير"><span class="icon">📖</span> تفسير</button>
                <button class="tool-btn" data-action="play_single" title="استماع بالصوت"><span class="icon">🎧</span> استماع</button>
                <button class="tool-btn" data-action="share" title="مشاركة الآية"><span class="icon">📤</span> مشاركة</button>
                <button class="tool-btn" data-action="zen_this" title="خشوع"><span class="icon">🧘</span> خشوع</button>
            </div>`;
        const bubble = addMessageToChat(content, 'quran', chatID, true, true);
        
        // ربط أحداث النقرات برفق للأدوات المضافة
        const toolsContainer = bubble.querySelector('.ayah-tools');
        if (toolsContainer) {
            toolsContainer.querySelectorAll('button').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    const action = e.currentTarget.dataset.action;
                    handleAyahToolAction(action, surahIndex, ayahNumberStr, bubble);
                });
            });
        }
    }
}

/**
 * معالجة وعرض سورة كاملة منسقة تالياً بشكل جمالي مريح للغاية
 * تم تحصينها بالكامل برمجياً ضد مشاكل الـ Null Reference والأخطاء المرجعية
 */
async function displayFullSurah(surahIndex, chatID) {
    const surahMeta = STATE.allSurahsMeta.find(s => parseInt(s.index) === parseInt(surahIndex));
    const surahData = await fetchSurahData(surahIndex);
    if (!surahData || !surahData.verse || !surahMeta) return;

    addMessageToChat(`جاري عرض سورة ${surahMeta.name} كاملة...`, 'system', chatID);
    
    // استبعاد البسملة عند استعراض سورة التوبة وسورة الفاتحة
    let bismillahHTML = (surahIndex !== "009" && surahIndex !== "001" && surahIndex !== "9" && surahIndex !== "1") 
        ? `<span class="bismillah">بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ</span>` : '';
        
    let ayahsHTML = Object.keys(surahData.verse)
        .map(key => parseInt(key.split('_')[1]))
        .filter(num => num > 0)
        .sort((a, b) => a - b)
        .map(num => `
            <span class="ayah-text" data-surah-idx="${surahIndex}" data-ayah-num="${num}">
                ${surahData.verse['verse_' + num]} <span class="ayah-number-symbol">﴿${toArabicNumerals(num)}﴾</span>
            </span>
        `).join(' ');
    
    addMessageToChat(`${bismillahHTML}<div class="surah-info" style="text-align:center; font-size:1.15rem; margin-bottom:1rem; font-weight:700;">${surahMeta.name}</div>${ayahsHTML}`, 'quran', chatID, true, true);
}

/**
 * عرض التفسير والآية مباشرة في نافذة واحدة كاستجابة فورية للأوامر اللغوية المباشرة
 */
async function fetchAndDisplayTafsirDirectly(surahIndex, ayahNumber, chatID) {
    const surahMeta = STATE.allSurahsMeta.find(s => parseInt(s.index) === parseInt(surahIndex));
    const surahData = await fetchSurahData(surahIndex);
    if (!surahData || !surahData.verse || !surahMeta) return;

    const verseText = surahData.verse[`verse_${ayahNumber}`];
    const tafsirData = await fetchTafsirData(surahIndex, ayahNumber);
    const ayahNumDisplay = toArabicNumerals(ayahNumber);
    
    if (verseText) {
        let tafsirContentHTML = '';
        if (tafsirData && tafsirData.text) {
            tafsirContentHTML = `
                <div class="message-bubble system tafsir-bubble" style="margin-top: 0.8rem; align-self: stretch; max-width: 100%; border-style: solid; border-color: rgba(5, 150, 105, 0.3);">
                    <div class="tafsir-header">تفسير الآية ${ayahNumDisplay} من سورة ${surahMeta.name}:</div>
                    <div class="tafsir-text">${tafsirData.text.replace(/\n/g, '<br>')}</div>
                </div>`;
        } else {
            tafsirContentHTML = `
                <div class="message-bubble system tafsir-bubble" style="margin-top: 0.8rem; align-self: stretch;">
                    لم يتم العثور على تفسير لهذه الآية في السجلات المحلية حالياً.
                </div>`;
        }

        const content = `
            <div class="ayah-text" data-surah-idx="${surahIndex}" data-ayah-num="${ayahNumber}">
                ${verseText} <span class="ayah-number-symbol">﴿${ayahNumDisplay}﴾</span>
            </div>
            <div class="surah-info">سورة ${surahMeta.name} - الآية ${ayahNumDisplay}</div>
            ${tafsirContentHTML}
        `;
        addMessageToChat(content, 'quran', chatID, true, true);
    }
}

/**
 * معالجة تدفق المحادثة والردود الذكية وتفسير رغبة المستخدم بناء على النوايا الملتقطة
 */
async function processQuranQuery(query) {
    const typingIndicator = addTypingIndicator();
    
    try {
        await new Promise(resolve => setTimeout(resolve, 500)); 
        const parsedIntent = parseQueryIntent(query);
        
        if (!parsedIntent) {
            addMessageToChat("عفواً، لم أفهم طلبك بدقة. جرب طلب سورة (مثل 'البقرة')، آية معينة ('البقرة ٢')، أو ابحث عن موضوع ('الصبر').", "system", STATE.currentChatID);
            if (typingIndicator) typingIndicator.remove();
            return;
        }
        
        // فحص طلب المتابعة والاستمرارية من القراءة السابقة
        if (parsedIntent.intent === 'search' && ["تابع", "اكمل", "متابعة", "أكمل القراءة"].some(s => normalizeArabicText(parsedIntent.keyword).includes(s))) {
            const lastRead = getLastReadAyah(STATE.currentChatID);
            if (lastRead && lastRead.surahIndex && lastRead.ayahNumber) {
                const surahMeta = STATE.allSurahsMeta.find(s => s.index === lastRead.surahIndex);
                if (surahMeta) {
                    addMessageToChat(`حسناً، لنتابع من بعد الآية ${toArabicNumerals(lastRead.ayahNumber)} من سورة ${surahMeta.name}.`, 'system', STATE.currentChatID);
                    let nextAyahNum = parseInt(lastRead.ayahNumber) + 1;
                    if (nextAyahNum <= surahMeta.verses) {
                        await fetchAndDisplaySingleAyah(lastRead.surahIndex, String(nextAyahNum), STATE.currentChatID);
                    } else {
                        addMessageToChat(`ما شاء الله، لقد أتممت قراءة سورة ${surahMeta.name} بالكامل. 🌸`, 'system', STATE.currentChatID);
                    }
                    if (typingIndicator) typingIndicator.remove();
                    return;
                }
            }
        }

        switch (parsedIntent.intent) {
            case 'ayah':
                await fetchAndDisplaySingleAyah(parsedIntent.surahIndex, String(parsedIntent.ayahNumber), STATE.currentChatID);
                break;
                
            case 'tafsir_ayah':
                await fetchAndDisplayTafsirDirectly(parsedIntent.surahIndex, parsedIntent.ayahNumber, STATE.currentChatID);
                break;
                
            case 'surah':
                await displayFullSurah(parsedIntent.surahIndex, STATE.currentChatID);
                break;
                
            case 'tafsir_surah':
                addMessageToChat(`ميزة استعراض تفسير سورة ${parsedIntent.surahName} كاملة دفعة واحدة قيد التطوير. يُمكنك طلب تفسير آية محددة مثل (تفسير البقرة ٢).`, 'system', STATE.currentChatID);
                break;
                
            case 'search':
                const normKeyword = normalizeArabicText(parsedIntent.keyword);
                if (["السلام عليكم", "مرحبا", "اهلا", "سلام"].some(s => normKeyword.includes(s))) {
                    addMessageToChat("وعليكم السلام ورحمة الله وبركاته. أهلاً بك في رحاب كلام الله العظيم. 🙏", "system", STATE.currentChatID);
                } else if (["شكرا", "جزاك الله خيرا", "ممتاز"].some(s => normKeyword.includes(s))) {
                    addMessageToChat("وإياكم، بارك الله فيكم ونور قلوبكم بالإيمان. في الخدمة دائماً. 😊", "system", STATE.currentChatID);
                } else {
                    await searchKeywordInQuran(parsedIntent.keyword, STATE.currentChatID);
                }
                break;
                
            default:
                addMessageToChat("عفواً، واجهت عثرة في تفسير رغبتك. يرجى صياغة الاستفسار بطريقة أخرى.", "system", STATE.currentChatID);
        }
        
    } catch (error) {
        console.error("خطأ أثناء معالجة استفسار المستخدم:", error);
        addMessageToChat("أعتذر، حدث خطأ داخلي غير متوقع. يرجى المحاولة لاحقاً.", "system", STATE.currentChatID);
    } finally {
        if (typingIndicator) typingIndicator.remove();
    }
}

// --- 7. منطق وإجراءات أدوات الآيات والتفاسير (Ayah Context Tools) ---

async function handleAyahToolAction(action, surahIndex, ayahNumberStr, bubbleElement) {
    const ayahNumber = parseInt(ayahNumberStr);
    if (isNaN(ayahNumber)) return;

    const surahMeta = STATE.allSurahsMeta.find(s => s.index === surahIndex);
    const surahName = surahMeta ? surahMeta.name : `سورة رقم ${surahIndex}`;
    const ayahNumDisplay = toArabicNumerals(ayahNumberStr);

    switch (action) {
        case 'tafsir':
            const existingTafsir = bubbleElement.nextElementSibling;
            if (existingTafsir && existingTafsir.classList.contains('tafsir-bubble')) {
                existingTafsir.remove();
                return;
            }
            toggleLoadingState(true, `جاري استحضار تفسير الآية من السجلات...`);
            const tafsirData = await fetchTafsirData(surahIndex, ayahNumber);
            toggleLoadingState(false);
            
            const tafsirBubble = document.createElement('div');
            tafsirBubble.classList.add('message-bubble', 'system', 'tafsir-bubble');

            if (tafsirData && tafsirData.text) {
                tafsirBubble.innerHTML = `
                    <div class="tafsir-header">تفسير الآية ${ayahNumDisplay} من سورة ${surahName}:</div>
                    <div class="tafsir-text">${tafsirData.text.replace(/\n/g, '<br>')}</div>`;
            } else if (tafsirData && tafsirData.error) {
                tafsirBubble.innerHTML = `عفواً، تعذر تحميل تفسير هذه الآية في الوقت الراهن.`;
                tafsirBubble.classList.add('error');
            } else {
                tafsirBubble.innerHTML = `تفسير هذه الآية غير متوفر حالياً محلياً في السجلات.`;
            }
            bubbleElement.insertAdjacentElement('afterend', tafsirBubble);
            tafsirBubble.scrollIntoView({ behavior: 'smooth', block: 'center' });
            break;
        
        case 'copy_ayah':
            const surahForCopy = STATE.fetchedSurahsCache[parseInt(surahIndex)];
            if (surahForCopy && surahForCopy.verse[`verse_${ayahNumber}`]) {
                const textToCopy = `﴿${surahForCopy.verse[`verse_${ayahNumber}`]}﴾ [${surahName}: ${ayahNumDisplay}]`;
                navigator.clipboard.writeText(textToCopy)
                    .then(() => showToastNotification("تم نسخ الآية الكريمة ✅", bubbleElement))
                    .catch(() => showToastNotification("فشل نسخ الآية ❌", bubbleElement, true));
            }
            break;

        case 'play_single':
            addMessageToChat(`ميزة تلاوة الآية ${ayahNumDisplay} بصوت مشاهير القراء قيد التطوير والتحضير. 🎧`, 'system', STATE.currentChatID);
            break;

        case 'zen_this':
            if (surahIndex && ayahNumber) fetchAndDisplayZenAyah(surahIndex, ayahNumber);
            break;
            
        case 'share':
             const surahForShare = STATE.fetchedSurahsCache[parseInt(surahIndex)];
             if (surahForShare && surahForShare.verse[`verse_${ayahNumber}`]) {
                 const textToShare = `﴿${surahForShare.verse[`verse_${ayahNumber}`]}﴾ [${surahName}: ${ayahNumDisplay}] - عبر تطبيق قرآني معاي 📖`;
                 if (navigator.share) {
                     navigator.share({ title: `آية من الذكر الحكيم`, text: textToShare }).catch(() => {});
                 } else {
                     navigator.clipboard.writeText(textToShare)
                         .then(() => addMessageToChat('تم نسخ نص الآية مهيأ للمشاركة في تطبيقات التواصل. 📝', 'system', STATE.currentChatID));
                 }
             }
             break;
    }
}

function showToastNotification(message, element, isError = false) {
    if (!element) return;
    let oldToast = element.querySelector('.toast-notif');
    if (oldToast) oldToast.remove();
    
    const toast = document.createElement('div');
    toast.className = 'toast-notif';
    toast.textContent = message;
    
    toast.style.cssText = `
        position: absolute; bottom: -10px; left: 50%; transform: translate(-50%, 100%);
        background-color: ${isError ? 'var(--color-error)' : 'var(--color-pulsar-hover)'};
        color: #fff; padding: 6px 12px; border-radius: var(--radius-md);
        font-size: 0.8rem; z-index: 100; opacity: 0; transition: all 0.3s ease;
        box-shadow: var(--shadow-cosmic); white-space: nowrap; font-weight: 500;
    `;
    if (getComputedStyle(element).position === 'static') {
        element.style.position = 'relative';
    }
    element.appendChild(toast);
    
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translate(-50%, calc(100% + 4px))';
    });
    
    setTimeout(() => {
        if (toast && toast.parentNode) {
            toast.style.opacity = '0';
            setTimeout(() => toast.remove(), 300);
        }
    }, 2000);
}

// --- 8. إدارة المحادثات وتخزين الجلسات (LocalStorage Chat Manager) ---

function startNewChat(addGreeting = true) {
    STATE.currentChatID = `chat_${Date.now()}`;
    localStorage.setItem('quranLastActiveChatID', STATE.currentChatID);
    DOM.messageArea.innerHTML = '';
    
    if (addGreeting) {
        addMessageToChat("أهلاً بك في فضاء تدبر جديد. ✨ ماذا يعالج خاطرك أو ذهنك اليوم؟", "system", STATE.currentChatID);
    }
    
    updateRecentChatsUI();
    updateChatInterfaceTitle(STATE.currentChatID);
    DOM.userInput.value = '';
    DOM.userInput.focus();
    setActiveSidebarLink(DOM.navNewChat);
    
    if (window.innerWidth <= 768) {
        DOM.sidebar.classList.remove('open');
        DOM.sidebarToggle.setAttribute('aria-expanded', 'false');
    }
}

function loadChatHistory(chatID) {
    const history = JSON.parse(localStorage.getItem(chatID) || '[]');
    DOM.messageArea.innerHTML = '';
    history.forEach(msg => addMessageToChat(msg.content, msg.sender, chatID, msg.isHtml, false));
    DOM.messageArea.scrollTop = DOM.messageArea.scrollHeight;
    localStorage.setItem('quranLastActiveChatID', chatID);
    updateChatInterfaceTitle(chatID);
}

function saveMessageToHistory(chatID, sender, content, isHtml = false) {
    if (!chatID) return;
    let history = [];
    try {
        history = JSON.parse(localStorage.getItem(chatID) || '[]');
    } catch(e) { history = []; }
    
    history.push({ sender, content, isHtml, timestamp: Date.now() });
    
    // تأمين وحماية تخزين البيانات وعزلها بالكامل ضد استثناءات امتلاء الذاكرة
    try {
        try {
            localStorage.setItem(chatID, JSON.stringify(history));
        } catch (e) {
            if (e.name === 'QuotaExceededError') {
                cleanOldestChatHistory();
                localStorage.setItem(chatID, JSON.stringify(history));
            }
        }

        let preview = isHtml ? content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : content;
        if (sender === 'user' && history.filter(m => m.sender === 'user').length <= 1) {
            updateRecentChatInfo(chatID, preview);
        } else if (history.length === 1) {
            updateRecentChatInfo(chatID, "محادثة جديدة");
        } else {
            updateRecentChatInfo(chatID);
        }

        if (sender === 'quran' && isHtml) {
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = content;
            const lastAyahEl = Array.from(tempDiv.querySelectorAll('.ayah-text[data-surah-idx]')).pop();
            if (lastAyahEl) {
                saveLastReadAyah(chatID, lastAyahEl.dataset.surahIdx, parseInt(lastAyahEl.dataset.ayahNum));
            }
        }
    } catch (storageError) {
        console.warn("فشل في معالجة عمليات التخزين الاحتياطية غير الحرجة:", storageError);
    }
}

function cleanOldestChatHistory() {
    let recentChats = [];
    try {
        recentChats = JSON.parse(localStorage.getItem('quranRecentChats') || '[]');
    } catch(e) { return; }
    
    if (recentChats.length > 2) {
        const oldest = recentChats.pop();
        localStorage.removeItem(oldest.id);
        localStorage.setItem('quranRecentChats', JSON.stringify(recentChats));
    }
}

function saveLastReadAyah(chatID, surahIndex, ayahNumber) {
    try {
        localStorage.setItem(`lastRead_${chatID}`, JSON.stringify({ surahIndex, ayahNumber }));
    } catch(e) {
        console.warn("تعذر تخزين آخر آية مقروءة بذاكرة المتصفح.");
    }
}

function getLastReadAyah(chatID) {
    try {
        return JSON.parse(localStorage.getItem(`lastRead_${chatID}`) || 'null');
    } catch(e) { return null; }
}

function updateRecentChatInfo(chatID, previewText) {
    let recentChats = [];
    try {
        recentChats = JSON.parse(localStorage.getItem('quranRecentChats') || '[]');
    } catch(e) { recentChats = []; }
    
    let chatInfo = recentChats.find(c => c.id === chatID);
    if (chatInfo) {
        chatInfo.timestamp = Date.now();
        if (previewText) chatInfo.preview = previewText.substring(0, 35) + (previewText.length > 35 ? '...' : '');
        recentChats = recentChats.filter(c => c.id !== chatID);
        recentChats.unshift(chatInfo);
    } else {
        let preview = previewText || 'محادثة جديدة';
        recentChats.unshift({ id: chatID, timestamp: Date.now(), preview: preview.substring(0, 35) + (preview.length > 35 ? '...' : '') });
    }
    
    try {
        localStorage.setItem('quranRecentChats', JSON.stringify(recentChats.slice(0, CONFIG.maxRecentChats)));
    } catch(e) {
        console.warn("تعذر تحديث قائمة المحادثات الأخيرة بذاكرة المتصفح.");
    }
    updateRecentChatsUI();
}

function updateRecentChatsUI() {
    let recentChats = [];
    try {
        recentChats = JSON.parse(localStorage.getItem('quranRecentChats') || '[]');
    } catch(e) { recentChats = []; }
    
    DOM.recentChatsUI.innerHTML = '';
    recentChats.forEach(chat => {
        const li = document.createElement('li');
        li.textContent = chat.preview;
        li.dataset.chatId = chat.id;
        li.title = chat.preview;
        if (chat.id === STATE.currentChatID) li.classList.add('active');
        
        li.addEventListener('click', () => {
            STATE.currentChatID = chat.id;
            loadChatHistory(chat.id);
            setActiveSidebarLink(li);
            if (window.innerWidth <= 768) {
                DOM.sidebar.classList.remove('open');
                DOM.sidebarToggle.setAttribute('aria-expanded', 'false');
            }
        });
        DOM.recentChatsUI.appendChild(li);
    });
    
    if (!recentChats.some(c => c.id === STATE.currentChatID)) {
        setActiveSidebarLink(DOM.navNewChat);
    }
}

function updateChatInterfaceTitle(chatID) {
    let recentChats = [];
    try {
        recentChats = JSON.parse(localStorage.getItem('quranRecentChats') || '[]');
    } catch(e) { recentChats = []; }
    
    const currentChat = recentChats.find(c => c.id === chatID);
    DOM.chatInterfaceTitle.textContent = (currentChat && currentChat.preview) || "محادثة جديدة";
}

function setActiveSidebarLink(activeLink) {
    document.querySelectorAll('#sidebar nav ul li a, .recent-recitations-list li').forEach(l => l.classList.remove('active'));
    if (activeLink) activeLink.classList.add('active');
}

// --- 9. وضع الخشوع المطور الهادئ (Immersive Zen Mode Component) ---

async function fetchAndDisplayZenAyah(surahIndex, ayahNumber) {
    toggleLoadingState(true, "جاري الدخول لوضع الخشوع والتدبر 🧘");
    const surahData = await fetchSurahData(surahIndex);
    toggleLoadingState(false);
    
    if (!surahData) {
        displayInZenMode("تعذر جلب الآية لوضع الخشوع.", "خطأ في الاتصال");
        return;
    }
    const verseText = surahData.verse[`verse_${ayahNumber}`];
    const surahMeta = STATE.allSurahsMeta.find(s => parseInt(s.index) === parseInt(surahIndex));
    
    if (verseText && surahMeta) {
        STATE.currentZenModeSurahIndex = surahIndex;
        STATE.currentZenModeAyahNumber = parseInt(ayahNumber);
        displayInZenMode(verseText, `سورة ${surahMeta.name} - الآية ${toArabicNumerals(ayahNumber)}`);
    }
}

function displayInZenMode(ayahText, surahInfo) {
    STATE.zenTriggerElement = document.activeElement;

    DOM.zenAyahDisplay.textContent = ayahText;
    DOM.zenSurahInfoDisplay.textContent = surahInfo;
    
    DOM.zenModeOverlay.style.display = 'flex';
    DOM.zenModeOverlay.setAttribute('aria-hidden', 'false');
    DOM.zenModeOverlay.removeAttribute('inert');
    
    DOM.zenCloseBtn.focus();
    createZenNavButtons();
    
    [DOM.zenAyahDisplay, DOM.zenSurahInfoDisplay].forEach(el => {
        el.style.animation = 'none';
        requestAnimationFrame(() => el.style.animation = '');
    });
}

function closeZenMode() {
    if (document.activeElement === DOM.zenCloseBtn) {
        DOM.zenCloseBtn.blur();
    }

    DOM.zenModeOverlay.style.display = 'none';
    DOM.zenModeOverlay.setAttribute('aria-hidden', 'true');
    DOM.zenModeOverlay.setAttribute('inert', '');
    
    if (STATE.zenTriggerElement && typeof STATE.zenTriggerElement.focus === 'function') {
        STATE.zenTriggerElement.focus();
    } else if (DOM.userInput) {
        DOM.userInput.focus();
    }
    STATE.zenTriggerElement = null;
}

function navigateZenAyah(direction) {
    if (!STATE.currentZenModeSurahIndex) return;
    let surahMeta = STATE.allSurahsMeta.find(s => s.index === STATE.currentZenModeSurahIndex);
    let newAyah = STATE.currentZenModeAyahNumber + direction;
    let newSurahIndex = STATE.currentZenModeSurahIndex;
    
    if (newAyah < 1) {
        let prevIdx = parseInt(newSurahIndex) - 1;
        newSurahIndex = String(prevIdx === 0 ? 114 : prevIdx);
        surahMeta = STATE.allSurahsMeta.find(s => parseInt(s.index) === parseInt(newSurahIndex));
        newAyah = surahMeta.verses;
    } else if (newAyah > surahMeta.verses) {
        let nextIdx = parseInt(newSurahIndex) + 1;
        newSurahIndex = String(nextIdx === 115 ? 1 : nextIdx);
        newAyah = 1;
    }
    fetchAndDisplayZenAyah(newSurahIndex, newAyah);
}

function createZenNavButtons() {
    if (document.getElementById('zen-nav-prev')) return;
    
    const prevBtn = document.createElement('button');
    prevBtn.id = 'zen-nav-prev';
    prevBtn.className = 'zen-nav-btn';
    prevBtn.setAttribute('aria-label', 'الآية السابقة');
    prevBtn.innerHTML = '❯';
    
    const nextBtn = document.createElement('button');
    nextBtn.id = 'zen-nav-next';
    nextBtn.className = 'zen-nav-btn';
    nextBtn.setAttribute('aria-label', 'الآية التالية');
    nextBtn.innerHTML = '❮';
    
    DOM.zenModeOverlay.appendChild(prevBtn);
    DOM.zenModeOverlay.appendChild(nextBtn);
    
    prevBtn.addEventListener('click', () => navigateZenAyah(-1));
    nextBtn.addEventListener('click', () => navigateZenAyah(1));
}


// --- 11. إعداد ومعالجة الإدخال الصوتي (Native Voice-to-Text API) ---

function setupVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        DOM.voiceInputBtn.style.opacity = '0.3';
        DOM.voiceInputBtn.title = "الإدخال الصوتي غير مدعوم في متصفحك الحالي";
        return;
    }
    
    const recognition = new SpeechRecognition();
    recognition.lang = 'ar-EG';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    
    DOM.voiceInputBtn.addEventListener('click', () => {
        if (STATE.isVoiceRecording) {
            recognition.stop();
        } else {
            recognition.start();
        }
    });
    
    recognition.onstart = () => {
        STATE.isVoiceRecording = true;
        DOM.voiceInputBtn.classList.add('recording-active');
        DOM.voiceInputBtn.style.color = 'var(--color-error)';
        DOM.userInput.placeholder = "جاري الاستماع لصوتك الآن... تكلم برفق 🎙️";
    };
    
    recognition.onresult = (event) => {
        const voiceResult = event.results[0][0].transcript;
        DOM.userInput.value = voiceResult;
    };
    
    recognition.onend = () => {
        STATE.isVoiceRecording = false;
        DOM.voiceInputBtn.classList.remove('recording-active');
        DOM.voiceInputBtn.style.color = '';
        DOM.userInput.placeholder = "اكتب سؤالك أو اطلب سورة...";
    };
    
    recognition.onerror = () => {
        showToastNotification("حدث خطأ في التقاط الصوت 🎙️", DOM.voiceInputBtn, true);
    };
}

// --- 12. تصفح وفهرسة السور التفاعلية المباشرة (Surah Index Browser Panel) ---

function openSurahBrowser() {
    let modal = document.getElementById('surah-browser-modal');
    if (modal) {
        modal.style.display = 'flex';
        modal.setAttribute('aria-hidden', 'false');
        modal.removeAttribute('inert');
        document.getElementById('surah-search-input').focus();
        return;
    }
    
    modal = document.createElement('div');
    modal.id = 'surah-browser-modal';
    modal.className = 'zen-mode-overlay';
    modal.style.cssText = `
        display: flex; flex-direction: column; justify-content: flex-start; align-items: center;
        padding: 2.2rem 1.5rem; z-index: 3000; overflow-y: hidden;
    `;
    
    modal.innerHTML = `
        <div style="width: 100%; max-width: 800px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem; gap: 1rem; flex-wrap: wrap;">
            <h2 style="font-size: 1.4rem; color: var(--text-pure); font-weight: 700; font-family: var(--font-ui); display: flex; align-items: center; gap: 0.5rem;">📂 الفهرس الشامل للسور الكريمة</h2>
            <button id="close-browser-btn" class="zen-close-btn" style="position: static; width: 42px; height: 42px;" aria-label="إغلاق الفهرس">×</button>
        </div>
        <div style="width: 100%; max-width: 800px; margin-bottom: 1.5rem;">
            <input type="text" id="surah-search-input" placeholder="اكتب اسم السورة أو رقمها لتصفيتها فوراً..." style="width: 100%; padding: 0.9rem 1.4rem; border-radius: var(--radius-md); border: 1px solid rgba(148, 163, 184, 0.15); background-color: var(--bg-star-cluster); color: var(--text-pure); font-family: var(--font-ui); font-size: 1rem;">
        </div>
        <div id="surahs-grid-container" style="width: 100%; max-width: 800px; flex-grow: 1; overflow-y: auto; display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 0.8rem; padding-left: 5px; -webkit-overflow-scrolling: touch;">
            <!-- السور سيتم حقنها ديناميكياً هنا -->
        </div>
    `;
    
    document.body.appendChild(modal);
    
    const gridContainer = document.getElementById('surahs-grid-container');
    const searchInput = document.getElementById('surah-search-input');
    
    function renderFilteredSurahs(filterText = '') {
        gridContainer.innerHTML = '';
        const normalizedFilter = normalizeArabicText(filterText);
        
        STATE.allSurahsMeta.forEach(surah => {
            const normalizedName = normalizeArabicText(surah.name);
            const normalizedSimple = surah.name_simple ? normalizeArabicText(surah.name_simple) : '';
            const normalizedEnglish = normalizeArabicText(surah.englishName);
            
            if (normalizedName.includes(normalizedFilter) || 
                normalizedSimple.includes(normalizedFilter) || 
                normalizedEnglish.includes(normalizedFilter) || 
                surah.index.includes(normalizedFilter)) {
                
                const card = document.createElement('div');
                card.style.cssText = `
                    background-color: var(--bg-star-cluster); border: 1px solid rgba(148, 163, 184, 0.08);
                    padding: 1rem; border-radius: var(--radius-md); cursor: pointer; transition: var(--transition-bounce);
                    display: flex; align-items: center; gap: 0.8rem; text-align: right;
                `;
                
                card.addEventListener('mouseenter', () => {
                    card.style.borderColor = 'var(--color-aurora-blue)';
                    card.style.transform = 'translateY(-3px)';
                    card.style.boxShadow = '0 5px 15px var(--color-aurora-glow)';
                });
                card.addEventListener('mouseleave', () => {
                    card.style.borderColor = 'rgba(148, 163, 184, 0.08)';
                    card.style.transform = 'translateY(0)';
                    card.style.boxShadow = 'none';
                });
                
                card.innerHTML = `
                    <div style="width: 32px; height: 32px; border-radius: 50%; background-color: rgba(59, 130, 246, 0.08); display: flex; justify-content: center; align-items: center; font-family: var(--font-tech); font-size: 0.85rem; color: var(--color-aurora-hover); font-weight: 700; flex-shrink: 0;">
                        ${toArabicNumerals(surah.index)}
                    </div>
                    <div style="flex-grow: 1; overflow: hidden;">
                        <span style="font-weight: 700; color: var(--text-pure); font-size: 0.95rem; display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">سورة ${surah.name}</span>
                        <span style="font-size: 0.72rem; color: var(--text-celestial); display: block;">${toArabicNumerals(surah.verses)} آية • ${surah.revelationType === 'Meccan' ? 'مكية' : 'مدنية'}</span>
                    </div>
                `;
                
                card.addEventListener('click', () => {
                    modal.style.display = 'none';
                    modal.setAttribute('aria-hidden', 'true');
                    modal.setAttribute('inert', '');
                    displayFullSurah(surah.index, STATE.currentChatID);
                });
                
                gridContainer.appendChild(card);
            }
        });
        
        if (gridContainer.children.length === 0) {
            gridContainer.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: var(--text-celestial); padding: 2rem;">لا توجد سورة تطابق العبارة المبحوث عنها 🔍</div>`;
        }
    }
    
    searchInput.addEventListener('input', (e) => {
        renderFilteredSurahs(e.target.value);
    });
    
    document.getElementById('close-browser-btn').addEventListener('click', () => {
        modal.style.display = 'none';
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('inert', '');
        DOM.userInput.focus();
    });
    
    modal.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            document.getElementById('close-browser-btn').click();
        }
    });
    
    renderFilteredSurahs();
    searchInput.focus();
}

// --- 13. محرك الأحداث والتهيئة والربط (Initialization & Events Setup) ---

function setupEventListeners() {
    DOM.sidebarToggle.addEventListener('click', () => {
        const isOpen = DOM.sidebar.classList.toggle('open');
        DOM.sidebarToggle.setAttribute('aria-expanded', String(isOpen));
    });
    
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 768) {
            if (!DOM.sidebar.contains(e.target) && !DOM.sidebarToggle.contains(e.target) && DOM.sidebar.classList.contains('open')) {
                DOM.sidebar.classList.remove('open');
                DOM.sidebarToggle.setAttribute('aria-expanded', 'false');
            }
        }
    });

    DOM.sendBtn.addEventListener('click', handleUserSendMessage);
    DOM.userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleUserSendMessage();
        }
    });

    DOM.zenCloseBtn.addEventListener('click', closeZenMode);
    
    DOM.navZenToggle.addEventListener('click', async (e) => {
        e.preventDefault();
        let target = getLastReadAyah(STATE.currentChatID);
        if (!target) {
            const randomSurah = STATE.allSurahsMeta[Math.floor(Math.random() * 114)];
            target = { s: randomSurah.index, a: Math.ceil(Math.random() * randomSurah.verses) };
        }
        await fetchAndDisplayZenAyah(target.s, target.a);
    });

    DOM.navNewChat.addEventListener('click', (e) => {
        e.preventDefault();
        startNewChat();
    });

    document.querySelectorAll('#sidebar-other-nav li a').forEach(link => {
        if (link.id !== 'nav-zen-mode-toggle' && link.id !== 'nav-khatma') {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                setActiveSidebarLink(this);
                addMessageToChat(`ميزة "${this.textContent.trim()}" قيد التطوير والتحضير 🚧، ستكون متاحة قريباً.`, 'system', STATE.currentChatID);
                if (window.innerWidth <= 768) {
                    DOM.sidebar.classList.remove('open');
                    DOM.sidebarToggle.setAttribute('aria-expanded', 'false');
                }
            });
        }
    });

    const quickSearchBtn = document.getElementById('quick-search-btn');
    const browseSurahsBtn = document.getElementById('browse-surahs-btn');
    
    if (quickSearchBtn) {
        quickSearchBtn.addEventListener('click', () => {
            DOM.userInput.value = "ابحث عن ";
            DOM.userInput.focus();
            
            const inputArea = document.querySelector('.input-area');
            if (inputArea) {
                inputArea.style.borderColor = 'var(--color-pulsar-green)';
                inputArea.style.boxShadow = '0 0 20px var(--color-pulsar-glow)';
                setTimeout(() => {
                    inputArea.style.borderColor = '';
                    inputArea.style.boxShadow = '';
                }, 1500);
            }
        });
    }
    
    if (browseSurahsBtn) {
        browseSurahsBtn.addEventListener('click', () => {
            openSurahBrowser();
        });
    }

    DOM.messageArea.addEventListener('click', handleAyahTextClick);
}

function handleUserSendMessage() {
    const query = DOM.userInput.value.trim();
    if (!query) return;
    addMessageToChat(query, 'user', STATE.currentChatID);
    DOM.userInput.value = '';
    processQuranQuery(query);
}

function handleAyahTextClick(event) {
    const clickedText = event.target.closest('.ayah-text');
    if (!clickedText) return;

    const parentBubble = clickedText.closest('.message-bubble.quran');
    if (!parentBubble) return;

    let existingTools = parentBubble.querySelector('.ayah-quick-tools');
    if (existingTools) {
        existingTools.remove();
        return;
    }
    document.querySelectorAll('.ayah-quick-tools').forEach(el => el.remove());

    const surahIdx = clickedText.dataset.surahIdx;
    const ayahNum = clickedText.dataset.ayahNum;

    if (surahIdx && ayahNum) {
        existingTools = document.createElement('div');
        existingTools.className = 'ayah-quick-tools';
        existingTools.innerHTML = `
            <button class="tool-btn" data-action="copy_ayah" title="نسخ">📋 نسخ</button>
            <button class="tool-btn" data-action="tafsir" title="تفسير">📖 تفسير</button>
            <button class="tool-btn" data-action="play_single" title="استماع">🎧 استماع</button>
            <button class="tool-btn" data-action="zen_this" title="خشوع">🧘 خشوع</button>
        `;
        clickedText.insertAdjacentElement('afterend', existingTools);
        
        existingTools.querySelectorAll('button').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const action = e.target.closest('button').dataset.action;
                handleAyahToolAction(action, surahIdx, ayahNum, parentBubble);
                if (existingTools.parentNode) existingTools.remove();
            });
        });
    }
}

function initializeChatSession() {
    const lastActive = localStorage.getItem('quranLastActiveChatID');
    let needsGreeting = true;
    
    if (lastActive && localStorage.getItem(lastActive)) {
        STATE.currentChatID = lastActive;
        loadChatHistory(STATE.currentChatID);
        needsGreeting = DOM.messageArea.children.length === 0;
    } else {
        startNewChat(false);
        needsGreeting = DOM.messageArea.children.length === 0;
    }
    
    if (needsGreeting && STATE.allSurahsMeta.length > 0) {
        addMessageToChat(CONFIG.defaultGreeting, "system", STATE.currentChatID);
    }
    updateChatInterfaceTitle(STATE.currentChatID);
}

// --- 14. انطلاق محرك التهيئة الرئيسي للدورة البرمجية (App Bootstrap) ---

document.addEventListener('DOMContentLoaded', async () => {
    toggleLoadingState(true, "جاري استحضار الفهرس القرآني العظيم...");
    
    DOM.zenModeOverlay.setAttribute('inert', '');
    
    try {
        const response = await fetch(CONFIG.allSurahsMetaPath);
        if (!response.ok) throw new Error("فشل المتصفح في العثور على ملف السور الأساسي.");
        STATE.allSurahsMeta = await response.json();
        
        if (!Array.isArray(STATE.allSurahsMeta) || STATE.allSurahsMeta.length === 0) {
            throw new Error("ملف بيانات السور تالف أو فارغ التنسيق.");
        }
    } catch (error) {
        console.error("خطأ حرج في تهيئة التطبيق وميتا السور:", error);
        toggleLoadingState(false);
        DOM.messageArea.innerHTML = `
            <div class="message-bubble system error">
                حدث خطأ حرج أثناء محاولة تشغيل التطبيق: <br>
                <small>${sanitizeHTML(error.message)}</small><br>
                يرجى التأكد من توفر الملفات الأساسية وتشغيل خادم محلي (Local Server) لتجاوز قيود المتصفح CORS.
            </div>`;
        DOM.userInput.disabled = true;
        DOM.sendBtn.disabled = true;
        return;
    }
    
    setupEventListeners();
    initializeChatSession();
    updateRecentChatsUI();
    setupVoiceInput();
    
    toggleLoadingState(false);
    DOM.userInput.focus();
});