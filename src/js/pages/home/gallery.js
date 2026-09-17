import { supabase } from '../../config/supabase.js';
import { getCurrentSession } from '../../services/auth.js';
import { showToast } from '../../components/toast.js';
import { getCurrentTenantId, getTenantSlugFromURL, buildTenantUrl, getTenantStorageKey } from '../../services/tenant_service.js';

let allModels = [];
if (!window.allGalleryModels) {
    window.allGalleryModels = allModels;
}
let currentCategories = new Set();
let currentUser = null;
let isWorker = false;
let localCart = []; 
let currentPage = 1;
const itemsPerPage = 25;
let currentFilteredModels = [];

// ⚙️ إعدادات إظهار وإخفاء عناصر الفلترة والبحث
let filterOnlyDiscounts = false;
const DEFAULT_FILTER_PREFERENCES = {
    'filter-scope': true,
    'filter-category': true,
    'filter-class': true,
    'filter-c1': true,
    'filter-c2': true,
    'filter-price': true,
    'filter-discount': true,
    'filter-sort': true
};

function getFilterPrefsKey() {
    const tenantId = getCurrentTenantId() || 'default';
    return `devo_gallery_filter_prefs_${tenantId}`;
}

function getFilterPreferences() {
    try {
        const saved = localStorage.getItem(getFilterPrefsKey());
        if (saved) return { ...DEFAULT_FILTER_PREFERENCES, ...JSON.parse(saved) };
    } catch(e) {}
    return { ...DEFAULT_FILTER_PREFERENCES };
}

function loadAndApplyFilterPreferences() {
    const prefs = getFilterPreferences();
    Object.keys(DEFAULT_FILTER_PREFERENCES).forEach(key => {
        const isVisible = prefs[key] !== false;
        const els = document.querySelectorAll(`[data-filter-id="${key}"]`);
        els.forEach(el => {
            if (isVisible) {
                el.classList.remove('!hidden');
            } else {
                el.classList.add('!hidden');
            }
        });
    });
}

export async function loadTenantFilterPreferences() {
    loadAndApplyFilterPreferences();

    const tenantId = getCurrentTenantId();
    try {
        let query = supabase
            .from('home_settings')
            .select('setting_value')
            .eq('setting_key', 'gallery_filter_settings');
        if (tenantId) query = query.eq('tenant_id', tenantId);

        const { data, error } = await query.maybeSingle();
        if (!error && data && data.setting_value) {
            localStorage.setItem(getFilterPrefsKey(), data.setting_value.trim());
            loadAndApplyFilterPreferences();
        }
    } catch (err) {
        console.warn('Error fetching tenant gallery filter settings:', err);
    }
}

export async function loadTenantDefaultModelImage() {
    const tenantId = getCurrentTenantId();
    const cacheKey = `devo_default_model_img_${tenantId || 'default'}`;
    
    // Fast-path: read from localStorage immediately
    const cached = localStorage.getItem(cacheKey);
    if (cached) {
        window.tenantDefaultModelImage = cached;
    }

    try {
        let query = supabase
            .from('home_settings')
            .select('setting_value')
            .eq('setting_key', 'default_model_image');
        if (tenantId) query = query.eq('tenant_id', tenantId);

        const { data, error } = await query.maybeSingle();
        if (!error && data && data.setting_value) {
            window.tenantDefaultModelImage = data.setting_value.trim();
            localStorage.setItem(cacheKey, window.tenantDefaultModelImage);
        } else if (!error && !data && cached) {
            localStorage.removeItem(cacheKey);
            window.tenantDefaultModelImage = null;
        }
    } catch (err) {
        console.warn('Error loading tenant default model image:', err);
    }
}

export async function initGallery() {
    loadTenantDefaultModelImage();
    loadTenantFilterPreferences();
    const { session } = getCurrentSession();
    currentUser = session ? session.user : null;
    
    // الموظف المخول برؤية الأرصدة والطلب هو الأونر/الأدمن أو العامل بوظيفة مبيعات (showroom / both)
    isWorker = currentUser && (
        currentUser.role === 'admin' 
        || currentUser.role === 'owner' 
        || (currentUser.role === 'worker' && (currentUser.worker_job === 'showroom' || currentUser.worker_job === 'both'))
    );

    // تحميل السلة المحلية وإظهار زر السلة العائم للجميع إلا إذا كنا في تابات عن النظام والاشتراكات
    loadLocalCart();
    const isNonCartView = window.currentView === 'view-landing-overview' 
                       || window.currentView === 'view-landing-pricing' 
                       || window.currentView === 'view-landing'
                       || window.currentView === 'view-mall';
    if (!isNonCartView) {
        document.getElementById('floating-cart-btn')?.classList.remove('hidden');
    } else {
        document.getElementById('floating-cart-btn')?.classList.add('hidden');
    }

    // تفعيل تفضيلات إظهار وإخفاء الفلاتر
    loadAndApplyFilterPreferences();

    // مستمعات عناصر البحث والفلترة
    document.getElementById('gal-search')?.addEventListener('input', () => {
        const clearBtn = document.getElementById('gal-search-clear');
        const val = document.getElementById('gal-search')?.value.trim();
        if (clearBtn) {
            if (val) clearBtn.classList.remove('hidden');
            else clearBtn.classList.add('hidden');
        }
        applyGalleryFilters();
    });
    document.getElementById('gal-search-scope')?.addEventListener('change', applyGalleryFilters);
    document.getElementById('gal-category')?.addEventListener('change', applyGalleryFilters);
    document.getElementById('gal-class')?.addEventListener('change', applyGalleryFilters);
    document.getElementById('gal-c1')?.addEventListener('change', applyGalleryFilters);
    document.getElementById('gal-c2')?.addEventListener('change', applyGalleryFilters);
    document.getElementById('gal-price-min')?.addEventListener('input', applyGalleryFilters);
    document.getElementById('gal-price-max')?.addEventListener('input', applyGalleryFilters);
    document.getElementById('gal-sort')?.addEventListener('change', applyGalleryFilters);

    await fetchGalleryModels();
    setupGalleryRealtime(); // 🌟 تفعيل الرادار اللحظي الشامل 🌟

    // نظام الروابط العميقة (Deep Linking)
    const urlParams = new URLSearchParams(window.location.search);
    const modelFromUrl = urlParams.get('model');
    if (modelFromUrl) {
        setTimeout(() => { window.openModelViewer(modelFromUrl, true); }, 500);
    }



    // إغلاق نافذة التفاصيل عند الضغط خارجها (خلفية المودال)
    const modelViewerModal = document.getElementById('model-viewer-modal');
    if (modelViewerModal) {
        modelViewerModal.addEventListener('click', (e) => {
            if (e.target === modelViewerModal) {
                window.closeModelViewer();
            }
        });
    }
}

// ==========================================
// 🌟 1. استدعاء البيانات مع تقنية الكاش الفوري وتصفية المصنع (Stale-While-Revalidate) 🌟
// ==========================================
async function fetchGalleryModels() {
    const container = document.getElementById('gallery-grid');
    if(!container) return;
    
    const currentTenantId = getCurrentTenantId();
    const cacheKey = `devo_cached_gallery_models_${currentTenantId || 'default'}`;

    // ⚡ 1. التحميل الفوري السريع من الـ LocalStorage إذا وجد ⚡
    const cachedData = localStorage.getItem(cacheKey);
    if (cachedData && allModels.length === 0) {
        try {
            allModels = JSON.parse(cachedData);
            window.allGalleryModels = allModels;
            populateAllFilterDropdowns();
            applyGalleryFilters();
        } catch (e) {
            console.warn('تجاوز كاش المعرض التالف:', e);
        }
    }

    if (allModels.length === 0) {
        container.innerHTML = `<div class="col-span-full py-20 text-center"><i class="ph ph-spinner animate-spin text-5xl text-devo-orange"></i></div>`;
    }

    // 🔄 2. التحديث الصامت من Supabase مقترناً بالمصنع النشط 🔄
    let query = supabase
        .from('models')
        .select(`
            *,
            categories(id, name),
            classifications_1(id, name),
            classifications_2(id, name),
            classes(id, name, class_sizes(sort_order, sizes(id, name))),
            model_sizes(sizes(id, name)),
            model_inventory(color_id, available_series, color_system_code, color_factory_code, colors(name)),
            model_images(image_url)
        `)
        .eq('is_active', true);

    if (currentTenantId) {
        query = query.eq('tenant_id', currentTenantId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) return console.error(error);

    allModels = data || [];
    window.allGalleryModels = allModels;

    // حفظ أحدث نسخة من البيانات في الـ LocalStorage برابط المصنع
    try {
        localStorage.setItem(cacheKey, JSON.stringify(allModels));
    } catch (e) {
        console.warn('فشل حفظ كاش المعرض بالـ LocalStorage:', e);
    }
    
    populateAllFilterDropdowns();
    applyGalleryFilters();
}

function populateAllFilterDropdowns() {
    // 1. التصنيف الرئيسي
    const catSelect = document.getElementById('gal-category');
    if (catSelect) {
        const cur = catSelect.value;
        const cats = new Set();
        allModels.forEach(m => { if(m.categories?.name) cats.add(m.categories.name); });
        catSelect.innerHTML = `<option value="">جميع التصنيفات</option>` + 
            [...cats].sort().map(c => `<option value="${c}">${c}</option>`).join('');
        if (cur && cats.has(cur)) catSelect.value = cur;
    }

    // 2. الفئة العمرية
    const clsSelect = document.getElementById('gal-class');
    if (clsSelect) {
        const cur = clsSelect.value;
        const clss = new Set();
        allModels.forEach(m => { if(m.classes?.name) clss.add(m.classes.name); });
        clsSelect.innerHTML = `<option value="">جميع الفئات العمرية</option>` + 
            [...clss].sort().map(c => `<option value="${c}">${c}</option>`).join('');
        if (cur && clss.has(cur)) clsSelect.value = cur;
    }

    // 3. تصنيف 1
    const c1Select = document.getElementById('gal-c1');
    if (c1Select) {
        const cur = c1Select.value;
        const c1s = new Set();
        allModels.forEach(m => { if(m.classifications_1?.name) c1s.add(m.classifications_1.name); });
        c1Select.innerHTML = `<option value="">جميع تصنيف 1</option>` + 
            [...c1s].sort().map(c => `<option value="${c}">${c}</option>`).join('');
        if (cur && c1s.has(cur)) c1Select.value = cur;
    }

    // 4. تصنيف 2
    const c2Select = document.getElementById('gal-c2');
    if (c2Select) {
        const cur = c2Select.value;
        const c2s = new Set();
        allModels.forEach(m => { if(m.classifications_2?.name) c2s.add(m.classifications_2.name); });
        c2Select.innerHTML = `<option value="">جميع تصنيف 2</option>` + 
            [...c2s].sort().map(c => `<option value="${c}">${c}</option>`).join('');
        if (cur && c2s.has(cur)) c2Select.value = cur;
    }
}

// ==========================================
// 🌟 2. الرادار اللحظي الشامل (Insert, Update, Delete) 🌟
// ==========================================
function setupGalleryRealtime() {
    const currentTenantId = getCurrentTenantId();
    const filterConfig = currentTenantId ? { filter: `tenant_id=eq.${currentTenantId}` } : {};

    supabase.channel('public_gallery_sync_' + (currentTenantId || 'default'))
        .on('postgres_changes', { event: '*', schema: 'public', table: 'models', ...filterConfig }, (payload) => {
            if (currentTenantId) {
                if (payload.new && payload.new.tenant_id && payload.new.tenant_id !== currentTenantId) return;
                if (payload.old && payload.old.tenant_id && payload.old.tenant_id !== currentTenantId) return;
            }
            
            // 🚨 حالة الحذف المباشر (DELETE) - تحدث فوراً ولا تحتاج انتظار 🚨
            if (payload.eventType === 'DELETE') {
                allModels = allModels.filter(m => m.id !== payload.old.id);
                window.allGalleryModels = allModels;
                applyGalleryFilters();
                checkAndCloseModal(payload.old.id, 'تم حذف هذا الموديل من قبل الإدارة.');
                return;
            }

            // 🌟 الحل السحري (Race Condition Fix): 
            // ننتظر 800 ملي ثانية لكي تكتمل عمليات مسح وإعادة إدخال الألوان والصور في قاعدة البيانات
            setTimeout(async () => {
                const { data: fullModel, error } = await supabase
                    .from('models')
                    .select(`
                        *, categories(name), classes(name, class_sizes(sizes(name))),
                        model_sizes(sizes(name)), model_inventory(color_id, available_series, color_system_code, color_factory_code, colors(name)), model_images(image_url)
                    `)
                    .eq('id', payload.new.id)
                    .single();

                if (error || !fullModel) return;

                if (payload.eventType === 'INSERT') {
                    if (fullModel.is_active) {
                        // تجنب التكرار إذا كان الموديل موجوداً بالفعل
                        if (!allModels.find(m => m.id === fullModel.id)) {
                            allModels.unshift(fullModel);
                            window.allGalleryModels = allModels;
                            applyGalleryFilters();
                        }
                    }
                } 
                else if (payload.eventType === 'UPDATE') {
                    if (!fullModel.is_active) {
                        allModels = allModels.filter(m => m.id !== fullModel.id);
                        window.allGalleryModels = allModels;
                        applyGalleryFilters();
                        checkAndCloseModal(fullModel.id, 'تم تعطيل هذا الموديل ولم يعد متاحاً.');
                    } else {
                        const index = allModels.findIndex(m => m.id === fullModel.id);
                        if (index > -1) {
                            allModels[index] = fullModel;
                            window.allGalleryModels = allModels;
                            updateGalleryCardDOM(fullModel.id);
                            updateModelViewerDOM(fullModel.id);
                        } else {
                            // كان معطلاً وأصبح نشطاً (إضافة جديدة للمعرض)
                            allModels.unshift(fullModel);
                            window.allGalleryModels = allModels;
                            applyGalleryFilters();
                        }
                    }
                }
            }, 800); // <-- زمن الانتظار الذكي
        })
        
        // 🚨 حالة تعديل المخزون المباشر (سحب الكميات، الحفظ، أو الاستيراد) 🚨
        .on('postgres_changes', { event: '*', schema: 'public', table: 'model_inventory' }, async (payload) => {
            const targetModelId = payload.new?.model_id || payload.old?.model_id;
            if (!targetModelId) return;

            const modelIndex = allModels.findIndex(m => m.id === targetModelId);
            if (modelIndex === -1) return;

            // 🔄 جلب التحديث الفعلي للمخزون لهذا الموديل من السيرفر فوراً 🔄
            const { data: freshInv } = await supabase
                .from('model_inventory')
                .select('color_id, available_series, color_system_code, color_factory_code, colors(name)')
                .eq('model_id', targetModelId);

            if (freshInv) {
                allModels[modelIndex].model_inventory = freshInv;
                window.allGalleryModels = allModels;

                // ⚡ تحديث الكاش المحلي فوراً ⚡
                const cacheKey = `devo_cached_gallery_models_${currentTenantId || 'default'}`;
                try { localStorage.setItem(cacheKey, JSON.stringify(allModels)); } catch(e) {}

                // ⚡ رسم وتحديث الكارت والنافذة المفتوحة لحظياً ⚡
                updateGalleryCardDOM(targetModelId);
                updateModelViewerDOM(targetModelId);
            }
        })
        .subscribe();
}

// دالة حماية: إغلاق نافذة الموديل إذا تم إخفاؤه أو حذفه
function checkAndCloseModal(modelId, message) {
    const modal = document.getElementById('model-viewer-modal');
    if (modal && !modal.classList.contains('hidden') && modal.getAttribute('data-current-model-id') === modelId) {
        window.closeModelViewer();
        showToast(message, 'warning');
    }
}

// تحديث كارت الموديل في واجهة المعرض بصمت
function updateGalleryCardDOM(id) {
    const existingCard = document.getElementById(`gallery-card-${id}`);
    if (existingCard) {
        const model = allModels.find(m => m.id === id);
        if (model) existingCard.outerHTML = generateGalleryCardHTML(model);
    }
}

// 🌟 التحديث الشامل داخل نافذة التفاصيل 🌟
function updateModelViewerDOM(id) {
    const modal = document.getElementById('model-viewer-modal');
    if (modal && !modal.classList.contains('hidden') && modal.getAttribute('data-current-model-id') === id) {
        const model = allModels.find(m => m.id === id);
        if (model) {
            // تحديث الاسم
            const nameEl = document.getElementById('viewer-name');
            if (nameEl) nameEl.textContent = model.name;

            // تحديث السعر
            const priceEl = document.getElementById('viewer-price');
            if (priceEl) priceEl.textContent = model.price;

            // تحديث عدد المقاسات الكلي في العنوان
            const classSizes = model.classes?.class_sizes || [];
            const sizesCount = classSizes.length > 0 ? classSizes.length : (model.model_sizes?.length || 1);
            const sizesTitleEl = document.getElementById('viewer-sizes-title');
            if (sizesTitleEl) sizesTitleEl.innerHTML = `<i class="ph ph-ruler"></i> المقاسات داخل السيريه (${sizesCount} قطع)`;

            // تحديث بادجات (Tags) المقاسات
            const sizesContainer = document.getElementById('viewer-sizes-container');
            if (sizesContainer) {
                const renderSizesTags = classSizes.length > 0 
                    ? classSizes.map(cs => `<span class="bg-devo-gray/30 border border-devo-gray text-white text-xs px-3 py-1.5 rounded font-medium"><i class="ph ph-link text-devo-muted"></i> ${cs.sizes?.name}</span>`).join('')
                    : model.model_sizes?.map(s => `<span class="bg-devo-gray/30 border border-devo-gray text-white text-xs px-3 py-1.5 rounded font-medium">${s.sizes?.name}</span>`).join('');
                sizesContainer.innerHTML = renderSizesTags || '<span class="text-devo-muted text-xs">غير محدد</span>';
            }

            // تحديث الألوان والمخزون
            const colorsContainer = document.getElementById('viewer-colors-container');
            if (colorsContainer) {
                colorsContainer.innerHTML = generateColorsHTML(model, sizesCount);
            }
        }
    }
}

// ==========================================
// 🌟 3. الفلترة والرسم (Pagination) 🌟
// ==========================================
function resolveImageUrl(url) {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        return window.tenantDefaultModelImage || localStorage.getItem(`devo_default_model_img_${getCurrentTenantId() || 'default'}`) || './src/assets/icons/devo.png';
    }
    try {
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
            if (idMatch && idMatch[1]) return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w1000`;
        }
    } catch (e) {}
    return url; 
}

window.toggleGalleryFilters = () => {
    const advFilters = document.getElementById('gallery-advanced-filters');
    const btnIcon = document.querySelector('button[onclick="toggleGalleryFilters()"] i');
    if (!advFilters) return;
    
    const isHidden = advFilters.classList.contains('hidden');
    if (isHidden) {
        advFilters.classList.remove('hidden');
        advFilters.classList.add('flex');
        if (btnIcon) {
            btnIcon.className = 'ph ph-x text-lg text-devo-orange';
        }
    } else {
        advFilters.classList.add('hidden');
        advFilters.classList.remove('flex');
        if (btnIcon) {
            btnIcon.className = 'ph ph-faders text-lg text-white';
        }
    }
};

window.clearSearchInput = () => {
    const sInput = document.getElementById('gal-search');
    if (sInput) sInput.value = '';
    const clearBtn = document.getElementById('gal-search-clear');
    if (clearBtn) clearBtn.classList.add('hidden');
    applyGalleryFilters();
};

window.toggleDiscountOnlyFilter = () => {
    filterOnlyDiscounts = !filterOnlyDiscounts;
    const btn = document.getElementById('gal-discount-toggle');
    if (btn) {
        if (filterOnlyDiscounts) {
            btn.className = 'bg-rose-600 text-white border border-rose-400 shadow-md ring-2 ring-rose-500/30 px-2 sm:px-3 py-1 rounded-lg sm:rounded-xl transition-all text-xs md:text-sm font-bold flex items-center justify-center gap-1.5 h-[34px] sm:h-[38px] select-none';
        } else {
            btn.className = 'bg-devo-dark border border-devo-gray text-devo-muted hover:border-rose-500/50 hover:text-rose-400 px-2 sm:px-3 py-1 rounded-lg sm:rounded-xl transition-all text-xs md:text-sm font-bold flex items-center justify-center gap-1.5 h-[34px] sm:h-[38px] select-none';
        }
    }
    applyGalleryFilters();
};

window.clearGalleryFilters = () => {
    const sInput = document.getElementById('gal-search');
    if (sInput) sInput.value = '';
    const clearBtn = document.getElementById('gal-search-clear');
    if (clearBtn) clearBtn.classList.add('hidden');

    const sScope = document.getElementById('gal-search-scope');
    if (sScope) sScope.value = 'all';

    const catSelect = document.getElementById('gal-category');
    if (catSelect) catSelect.value = '';

    const clsSelect = document.getElementById('gal-class');
    if (clsSelect) clsSelect.value = '';

    const c1Select = document.getElementById('gal-c1');
    if (c1Select) c1Select.value = '';

    const c2Select = document.getElementById('gal-c2');
    if (c2Select) c2Select.value = '';

    const pMin = document.getElementById('gal-price-min');
    if (pMin) pMin.value = '';

    const pMax = document.getElementById('gal-price-max');
    if (pMax) pMax.value = '';

    if (filterOnlyDiscounts) {
        window.toggleDiscountOnlyFilter();
    }

    const sortSelect = document.getElementById('gal-sort');
    if (sortSelect) sortSelect.value = 'newest';

    applyGalleryFilters();
};

function applyGalleryFilters() {
    const term = document.getElementById('gal-search')?.value.toLowerCase().trim() || '';
    const scope = document.getElementById('gal-search-scope')?.value || 'all';
    const cat = document.getElementById('gal-category')?.value || '';
    const cls = document.getElementById('gal-class')?.value || '';
    const c1 = document.getElementById('gal-c1')?.value || '';
    const c2 = document.getElementById('gal-c2')?.value || '';
    const pMinRaw = document.getElementById('gal-price-min')?.value;
    const pMaxRaw = document.getElementById('gal-price-max')?.value;
    const minPrice = (pMinRaw !== '' && pMinRaw !== null && !isNaN(parseFloat(pMinRaw))) ? parseFloat(pMinRaw) : null;
    const maxPrice = (pMaxRaw !== '' && pMaxRaw !== null && !isNaN(parseFloat(pMaxRaw))) ? parseFloat(pMaxRaw) : null;
    const sort = document.getElementById('gal-sort')?.value || 'newest';

    // Show/hide search clear button
    const clearBtn = document.getElementById('gal-search-clear');
    if (clearBtn) {
        if (term) clearBtn.classList.remove('hidden');
        else clearBtn.classList.add('hidden');
    }

    // Active filters counter
    let activeFilters = 0;
    if (term) activeFilters++;
    if (cat) activeFilters++;
    if (cls) activeFilters++;
    if (c1) activeFilters++;
    if (c2) activeFilters++;
    if (minPrice !== null || maxPrice !== null) activeFilters++;
    if (filterOnlyDiscounts) activeFilters++;

    const badge = document.getElementById('gal-active-filters-count');
    if (badge) {
        if (activeFilters > 0) {
            badge.textContent = activeFilters;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }

    const mobileBadge = document.getElementById('gal-mobile-active-badge');
    if (mobileBadge) {
        if (activeFilters > 0) {
            mobileBadge.textContent = activeFilters;
            mobileBadge.classList.remove('hidden');
        } else {
            mobileBadge.classList.add('hidden');
        }
    }

    let filtered = allModels.filter(m => {
        // 1. Search filter with scope
        if (term) {
            const systemCode = String(m.system_code || '').toLowerCase();
            const factoryCode = String(m.factory_code || '').toLowerCase();
            const modelName = String(m.name || '').toLowerCase();
            const colorCodes = (m.model_inventory || []).map(inv => `${inv.color_system_code || ''} ${inv.color_factory_code || ''}`).join(' ').toLowerCase();

            if (scope === 'code') {
                const isCodeMatch = systemCode.includes(term) || factoryCode.includes(term) || colorCodes.includes(term);
                if (!isCodeMatch) return false;
            } else if (scope === 'name') {
                if (!modelName.includes(term)) return false;
            } else {
                // All: search in codes, name, category, classes, and classifications
                const catName = String(m.categories?.name || '').toLowerCase();
                const className = String(m.classes?.name || '').toLowerCase();
                const c1Name = String(m.classifications_1?.name || '').toLowerCase();
                const c2Name = String(m.classifications_2?.name || '').toLowerCase();
                const searchStr = `${factoryCode} ${systemCode} ${modelName} ${colorCodes} ${catName} ${className} ${c1Name} ${c2Name}`;
                if (!searchStr.includes(term)) return false;
            }
        }

        // 2. Main Category
        if (cat && m.categories?.name !== cat) return false;

        // 3. Class (Age Category)
        if (cls && m.classes?.name !== cls) return false;

        // 4. Classification 1
        if (c1 && m.classifications_1?.name !== c1) return false;

        // 5. Classification 2
        if (c2 && m.classifications_2?.name !== c2) return false;

        // 6. Price range (effective price: discount_price if on sale, otherwise regular price)
        const effectivePrice = (m.discount_price != null && Number(m.discount_price) > 0 && Number(m.discount_price) < Number(m.price))
            ? Number(m.discount_price)
            : Number(m.price || 0);

        if (minPrice !== null && effectivePrice < minPrice) return false;
        if (maxPrice !== null && effectivePrice > maxPrice) return false;

        // 7. Discounts only
        if (filterOnlyDiscounts) {
            const hasDiscount = m.discount_price != null && Number(m.discount_price) > 0 && Number(m.discount_price) < Number(m.price);
            if (!hasDiscount) return false;
        }

        return true;
    });

    // Sorting
    if (sort === 'price_asc') {
        filtered.sort((a, b) => {
            const pa = (a.discount_price != null && Number(a.discount_price) > 0 && Number(a.discount_price) < Number(a.price)) ? Number(a.discount_price) : Number(a.price || 0);
            const pb = (b.discount_price != null && Number(b.discount_price) > 0 && Number(b.discount_price) < Number(b.price)) ? Number(b.discount_price) : Number(b.price || 0);
            return pa - pb;
        });
    } else if (sort === 'price_desc') {
        filtered.sort((a, b) => {
            const pa = (a.discount_price != null && Number(a.discount_price) > 0 && Number(a.discount_price) < Number(a.price)) ? Number(a.discount_price) : Number(a.price || 0);
            const pb = (b.discount_price != null && Number(b.discount_price) > 0 && Number(b.discount_price) < Number(b.price)) ? Number(b.discount_price) : Number(b.price || 0);
            return pb - pa;
        });
    } else if (sort === 'discount_desc') {
        filtered.sort((a, b) => {
            const getPct = (m) => (m.discount_price != null && Number(m.discount_price) > 0 && Number(m.discount_price) < Number(m.price))
                ? ((Number(m.price) - Number(m.discount_price)) / Number(m.price)) * 100
                : 0;
            return getPct(b) - getPct(a);
        });
    } else {
        filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    }

    currentFilteredModels = filtered;
    currentPage = 1; 
    renderGalleryPage();
}

function renderGalleryPage() {
    const container = document.getElementById('gallery-grid');
    const topPagination = document.getElementById('gallery-pagination-top');
    const bottomPagination = document.getElementById('gallery-pagination-bottom');
    
    if (!container) return;

    if (currentFilteredModels.length === 0) {
        container.innerHTML = `<div class="col-span-full py-20 text-center text-devo-muted flex flex-col items-center"><i class="ph ph-magnifying-glass text-6xl mb-4 opacity-50"></i><p>لا توجد موديلات تطابق بحثك حالياً.</p></div>`;
        if (topPagination) topPagination.innerHTML = '';
        if (bottomPagination) bottomPagination.innerHTML = '';
        return;
    }

    const totalItems = currentFilteredModels.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = currentFilteredModels.slice(startIndex, endIndex);

    container.innerHTML = pageData.map(m => generateGalleryCardHTML(m)).join('');
    renderGalleryPaginationControls(totalPages);
}

function generateGalleryCardHTML(m) {
    const totalSeries = m.model_inventory?.reduce((sum, inv) => sum + inv.available_series, 0) || 0;
    const isOut = totalSeries === 0;
    const mainImg = resolveImageUrl(m.model_images?.[0]?.image_url);
    
    let stockBadge = '';
    if (isWorker) {
        if (isOut) stockBadge = `<span style="position:absolute; top:8px; right:8px; z-index:30;" class="bg-devo-error text-white text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-md shadow-lg font-bold flex items-center gap-1"><i class="ph ph-warning-circle"></i> نفذت</span>`;
        else if (totalSeries <= 5) stockBadge = `<span style="position:absolute; top:8px; right:8px; z-index:30;" class="bg-devo-orange text-white text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-md shadow-lg font-bold">متبقي ${totalSeries} سيريه</span>`;
        else stockBadge = `<span style="position:absolute; top:8px; right:8px; z-index:30;" class="bg-devo-success text-white text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-md shadow-lg font-bold">متبقي ${totalSeries} سيريه</span>`;
    } else {
        if (isOut) stockBadge = `<span style="position:absolute; top:8px; right:8px; z-index:30;" class="bg-devo-black/80 backdrop-blur-sm text-white text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-md shadow-lg font-bold border border-devo-gray">نفذت الكمية</span>`;
        else stockBadge = `<span style="position:absolute; top:8px; right:8px; z-index:30;" class="bg-devo-success/20 text-devo-success backdrop-blur-sm border border-devo-success/50 text-[10px] sm:text-xs px-2 sm:px-2.5 py-1 rounded-md shadow-lg font-bold">متوفر</span>`;
    }

    const hasDiscount = m.discount_price != null && Number(m.discount_price) > 0 && Number(m.discount_price) < Number(m.price);
    let discountTag = '';
    if (hasDiscount) {
        const discountPct = Math.round(((Number(m.price) - Number(m.discount_price)) / Number(m.price)) * 100);
        discountTag = `<span style="position:absolute; top:8px; left:8px; z-index:30;" class="bg-gradient-to-r from-rose-600 to-red-600 text-white text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-md font-black shadow-lg flex items-center gap-1 border border-white/20"><i class="ph-bold ph-tag"></i> خصم ${discountPct}%</span>`;
    }

    const cardStyle = isOut ? 'grayscale opacity-80' : 'card-hover cursor-pointer';

    return `
    <div id="gallery-card-${m.id}" class="product-card bg-devo-dark border border-devo-gray rounded-xl sm:rounded-2xl overflow-hidden flex flex-col relative group transition-all duration-300 shadow-md ${cardStyle}" onclick="openModelViewer('${m.id}')">
        ${stockBadge}
        ${discountTag}
        <div class="h-44 sm:h-64 md:h-72 bg-devo-black relative overflow-hidden flex items-center justify-center p-3 border-b border-devo-gray/50">
            <img src="${mainImg}" class="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-30 pointer-events-none" aria-hidden="true" onerror="this.style.display='none'" loading="lazy" decoding="async">
            <div class="absolute inset-0 bg-devo-black/10 backdrop-blur-sm pointer-events-none"></div>
            <img src="${mainImg}" class="relative z-10 max-w-full max-h-full w-auto h-auto object-contain rounded-lg border border-devo-gray/50 shadow-md transition-transform duration-500 group-hover:scale-[1.03]" onerror="this.src=(window.tenantDefaultModelImage || './src/assets/icons/devo.png')" loading="lazy" decoding="async">
        </div>
        <div class="p-2.5 sm:p-4 flex flex-col flex-1 justify-between z-10 relative bg-devo-dark">
            <div>
                <p class="text-devo-muted text-[9px] sm:text-[10px] font-mono tracking-wider mb-0.5">${m.factory_code || m.system_code}</p>
                <h3 class="text-devo-text font-black text-xs sm:text-base md:text-lg mb-0.5 sm:mb-1 truncate" title="${m.name}">${m.name}</h3>
            </div>
            <div class="flex justify-between items-end mt-1 sm:mt-2">
                <span class="text-devo-muted text-[10px] sm:text-xs flex items-center gap-1 truncate max-w-[55%]"><i class="ph ph-tag text-devo-orange"></i> ${m.categories?.name || 'بدون تصنيف'}</span>
                ${hasDiscount 
                    ? `<div class="text-left">
                           <span class="line-through text-devo-muted text-[10px] sm:text-xs font-normal block leading-none mb-0.5">${m.price} ج.م</span>
                           <p class="text-devo-orange font-black text-sm sm:text-lg md:text-xl leading-none">${m.discount_price} <span class="text-[9px] sm:text-[10px] font-normal">ج.م</span></p>
                       </div>`
                    : `<p class="text-devo-orange font-black text-sm sm:text-lg md:text-xl">${m.price} <span class="text-[9px] sm:text-[10px] font-normal">ج.م</span></p>`
                }
            </div>
        </div>
    </div>`;
}

function renderGalleryPaginationControls(totalPages) {
    const topContainer = document.getElementById('gallery-pagination-top');
    const bottomContainer = document.getElementById('gallery-pagination-bottom');
    if (!topContainer || !bottomContainer) return;
    if (totalPages <= 1) { topContainer.innerHTML = ''; bottomContainer.innerHTML = ''; return; }

    let html = `
        <button onclick="changeGalleryPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="px-3.5 md:px-5 py-2 md:py-2.5 rounded-xl border border-devo-gray bg-devo-dark/80 text-white disabled:text-neutral-600 disabled:border-neutral-800/40 disabled:opacity-40 disabled:pointer-events-none hover:border-devo-orange hover:text-devo-orange transition-all duration-300 flex items-center gap-1.5 text-xs md:text-sm font-medium group">
            <i class="ph ph-caret-right text-devo-orange group-disabled:text-inherit text-sm md:text-base transition-colors"></i>
            <span class="text-inherit">السابق</span>
        </button>
        <span class="px-4 md:px-6 py-2 md:py-2.5 rounded-xl bg-devo-dark/80 text-white font-bold border border-devo-gray text-xs md:text-sm whitespace-nowrap">
            صفحة <span class="text-devo-orange font-bold">${currentPage} من ${totalPages}</span>
        </span>
        <button onclick="changeGalleryPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} class="px-3.5 md:px-5 py-2 md:py-2.5 rounded-xl border border-devo-gray bg-devo-dark/80 text-white disabled:text-neutral-600 disabled:border-neutral-800/40 disabled:opacity-40 disabled:pointer-events-none hover:border-devo-orange hover:text-devo-orange transition-all duration-300 flex items-center gap-1.5 text-xs md:text-sm font-medium group">
            <span class="text-inherit">التالي</span>
            <i class="ph ph-caret-left text-devo-orange group-disabled:text-inherit text-sm md:text-base transition-colors"></i>
        </button>
    `;
    topContainer.innerHTML = html; bottomContainer.innerHTML = html;
}

window.changeGalleryPage = (newPage) => {
    currentPage = newPage;
    renderGalleryPage();
    document.getElementById('gal-search')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
};

// ==========================================
// 🌟 4. تفاصيل الموديل والروابط العميقة 🌟
// ==========================================
window.openModelViewer = (id, skipHistory = false) => {
    const modelsList = (allModels && allModels.length > 0) ? allModels : (window.allGalleryModels || []);
    const model = modelsList.find(m => m.id === id);
    if (!model) {
        console.warn(`[openModelViewer] لم يتم العثور على الموديل ذو المعرف: ${id} في قائمة الموديلات النشطة`);
        return;
    }

    if (!skipHistory) {
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('model', id);
        const newUrl = window.location.pathname + '?' + urlParams.toString();
        history.pushState({ modelId: id }, '', newUrl);
    }

    let classSizes = model.classes?.class_sizes || [];
    if (classSizes.length > 0) {
        classSizes = [...classSizes].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    }
    const sizesCount = classSizes.length > 0 ? classSizes.length : (model.model_sizes?.length || 1);

    const modal = document.getElementById('model-viewer-modal');
    if (modal) modal.setAttribute('data-current-model-id', id);

    const content = document.getElementById('model-viewer-content');
    const imgs = model.model_images?.length > 0 ? model.model_images : [{image_url: null}];
    const mainImg = resolveImageUrl(imgs[0].image_url);
    
    let imagesGalleryHtml = `
        <div class="bg-devo-black rounded-xl overflow-hidden border border-devo-gray h-56 sm:h-72 md:h-[380px] mb-2 sm:mb-3 flex items-center justify-center p-4 relative">
            <img src="${mainImg}" id="viewer-blur-bg" class="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-40 pointer-events-none" aria-hidden="true" onerror="this.style.display='none'" loading="lazy" decoding="async">
            <div class="absolute inset-0 bg-devo-black/20 backdrop-blur-sm pointer-events-none"></div>
            <img src="${mainImg}" id="viewer-main-img" class="relative z-10 max-w-full max-h-full w-auto h-auto object-contain rounded-xl border border-devo-gray/50 shadow-lg" onerror="this.src=(window.tenantDefaultModelImage || './src/assets/icons/devo.png')" decoding="async">
        </div>
        ${imgs.length > 1 ? `<div class="flex gap-2 overflow-x-auto pb-1.5 custom-scrollbar">${imgs.map(img => `<img src="${resolveImageUrl(img.image_url)}" onclick="document.getElementById('viewer-main-img').src=this.src; if(document.getElementById('viewer-blur-bg')) document.getElementById('viewer-blur-bg').src=this.src" class="w-14 h-14 sm:w-20 sm:h-20 rounded-lg object-cover cursor-pointer border border-devo-gray hover:border-devo-orange transition-colors shrink-0" onerror="this.src=(window.tenantDefaultModelImage || './src/assets/icons/devo.png')" loading="lazy" decoding="async">`).join('')}</div>` : ''}
    `;

    const renderSizesTags = classSizes.length > 0 
        ? classSizes.map(cs => `<span class="bg-devo-gray/30 border border-devo-gray text-white text-[11px] sm:text-xs px-2.5 py-1 rounded font-medium"><i class="ph ph-link text-devo-muted"></i> ${cs.sizes?.name}</span>`).join('')
        : model.model_sizes?.map(s => `<span class="bg-devo-gray/30 border border-devo-gray text-white text-[11px] sm:text-xs px-2.5 py-1 rounded font-medium">${s.sizes?.name}</span>`).join('');
    
    const sizesHtml = renderSizesTags || '<span class="text-devo-muted text-xs">غير محدد</span>';

    // قسم إضافة طقم كامل للسلة (متاح للجميع)
    const setHtml = `
    <div class="bg-gradient-to-r from-devo-orange/15 via-devo-dark to-devo-black border border-devo-orange/40 rounded-xl p-2.5 sm:p-3 mb-3 flex flex-wrap sm:flex-nowrap items-center justify-between gap-2 shadow-md">
        <div class="flex items-center gap-2">
            <div class="w-8 h-8 rounded-lg bg-devo-orange/20 border border-devo-orange/50 flex items-center justify-center text-devo-orange shrink-0">
                <i class="ph ph-package text-lg font-bold"></i>
            </div>
            <div>
                <h5 class="text-white text-xs sm:text-sm font-black flex items-center gap-1">
                    إضافة طقم كامل
                </h5>
            </div>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
            <div class="flex items-center bg-devo-dark border border-devo-orange/50 rounded-lg overflow-hidden h-8 sm:h-9 shadow-inner">
                <button type="button" onclick="decrementQty('set-qty-${model.id}')" class="w-8 sm:w-9 h-full flex items-center justify-center text-white hover:text-devo-orange hover:bg-devo-orange/15 transition-all shrink-0 cursor-pointer select-none" title="تقليل">
                    <i class="ph-bold ph-minus text-xs sm:text-sm"></i>
                </button>
                <input type="number" id="set-qty-${model.id}" value="1" min="1" max="99" readonly class="w-9 sm:w-10 h-full bg-transparent text-center text-devo-orange text-xs sm:text-sm font-black outline-none border-x border-devo-gray/70 appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none leading-none select-none">
                <button type="button" onclick="incrementQty('set-qty-${model.id}', 99)" class="w-8 sm:w-9 h-full flex items-center justify-center text-white hover:text-devo-orange hover:bg-devo-orange/15 transition-all shrink-0 cursor-pointer select-none" title="زيادة">
                    <i class="ph-bold ph-plus text-xs sm:text-sm"></i>
                </button>
            </div>
            
            <button id="add-set-btn-${model.id}" onclick="addSetToCart(event, '${model.id}')" class="flex-1 sm:flex-none px-3.5 py-1.5 sm:py-2 bg-gradient-to-r from-devo-orange to-orange-600 hover:from-devo-orangeHover hover:to-orange-700 text-white rounded-lg text-xs sm:text-sm font-black transition-all shadow-lg flex items-center justify-center gap-1.5 active:scale-95">
                <i class="ph ph-plus-circle text-base sm:text-lg"></i>
                <span>إضافة طقم</span>
            </button>
        </div>
    </div>`;

    if (content) {
        content.innerHTML = `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 p-1 sm:p-2 md:p-0">
                <div>${imagesGalleryHtml}</div>
                <div class="flex flex-col">
                    <div class="mb-3 pb-3 border-b border-devo-gray flex justify-between items-center gap-2">
                        <div>
                            <p class="text-devo-muted text-[10px] sm:text-xs font-mono mb-0.5">كود: ${model.factory_code || model.system_code}</p>
                            <h2 id="viewer-name" class="text-lg sm:text-2xl font-black text-white leading-tight">${model.name}</h2>
                            ${model.discount_price != null && Number(model.discount_price) > 0 && Number(model.discount_price) < Number(model.price)
                                ? `<div class="flex items-center gap-2 mt-1 flex-wrap">
                                       <span class="line-through text-devo-muted text-sm sm:text-lg font-normal">${model.price} ج.م</span>
                                       <p class="text-xl sm:text-3xl text-devo-orange font-black"><span id="viewer-price">${model.discount_price}</span> <span class="text-xs sm:text-base font-normal">ج.م</span></p>
                                       <span class="bg-gradient-to-r from-red-600 to-rose-500 text-white text-xs px-2.5 py-0.5 rounded-md font-bold shadow-sm flex items-center gap-1">
                                           <i class="ph-bold ph-tag"></i> وفرت ${(Number(model.price) - Number(model.discount_price)).toFixed(0)} ج.م (${Math.round(((Number(model.price) - Number(model.discount_price)) / Number(model.price)) * 100)}%)
                                       </span>
                                   </div>`
                                : `<p class="text-xl sm:text-3xl text-devo-orange font-black mt-1"><span id="viewer-price">${model.price}</span> <span class="text-xs sm:text-base font-normal">ج.م</span></p>`
                            }
                        </div>
                        <button onclick="shareModel('${model.id}')" class="flex items-center justify-center gap-1.5 bg-devo-dark border border-devo-gray hover:border-devo-info hover:text-devo-info text-white px-3 py-1.5 rounded-lg transition-colors text-xs sm:text-sm font-bold shrink-0 shadow-sm">
                            <i class="ph ph-share-network text-base"></i> مشاركة
                        </button>
                    </div>

                    <div class="mb-3">
                        <h4 id="viewer-sizes-title" class="text-xs sm:text-sm font-bold text-white mb-1.5 flex items-center gap-1.5"><i class="ph ph-ruler text-devo-orange"></i> المقاسات داخل السيريه (${sizesCount} قطع)</h4>
                        <div id="viewer-sizes-container" class="flex flex-wrap gap-1.5">${sizesHtml}</div>
                    </div>

                    ${setHtml}

                    <div class="flex-1">
                        <h4 class="text-xs sm:text-sm font-bold text-white mb-2 flex items-center gap-1.5"><i class="ph ph-palette text-devo-orange"></i> الألوان المتاحة للطلب</h4>
                        <div id="viewer-colors-container" class="space-y-1.5">
                            ${generateColorsHTML(model, sizesCount)}
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    if (modal) { modal.classList.remove('hidden'); setTimeout(() => modal.classList.remove('opacity-0'), 10); }
};

function getOwnedQtyForColor(modelId, colorId) {
    const tenantId = getCurrentTenantId() || 'default';
    const editKey = getTenantStorageKey('devo_edit_order_data');
    const savedOrderData = localStorage.getItem(editKey) || localStorage.getItem(`devo_edit_order_data_${tenantId}`);
    if (!savedOrderData) return 0;
    try {
        const orderData = JSON.parse(savedOrderData);
        if (orderData && orderData.original_items) {
            const item = orderData.original_items.find(oi => oi.model_id === modelId && oi.color_id === colorId);
            return item ? (item.quantity || 0) : 0;
        }
    } catch(e) {}
    return 0;
}

function getCartQtyForColor(modelId, colorId) {
    loadLocalCart();
    const item = localCart.find(i => i.modelId === modelId && i.colorId === colorId);
    return item ? item.qty : 0;
}

function refreshColorsContainer(modelId) {
    const model = allModels.find(m => m.id === modelId);
    if (!model) return;
    const classSizes = model.classes?.class_sizes || [];
    const sizesCount = classSizes.length > 0 ? classSizes.length : (model.model_sizes?.length || 1);
    const container = document.getElementById('viewer-colors-container');
    if (container) container.innerHTML = generateColorsHTML(model, sizesCount);
}

function generateColorsHTML(model, sizesCount) {
    if (!model.model_inventory || model.model_inventory.length === 0) {
        return `<div class="text-center p-3 text-devo-error bg-devo-error/10 rounded-xl text-xs sm:text-sm border border-devo-error/20">لا توجد ألوان مسجلة.</div>`;
    }

    const mainImg = resolveImageUrl(model.model_images?.[0]?.image_url);

    return model.model_inventory.map(inv => {
        const dbAvailable = inv.available_series || 0;
        const ownedQty = getOwnedQtyForColor(model.id, inv.color_id);
        const available = dbAvailable + ownedQty;
        const isOut = available === 0;

        const cartQty = getCartQtyForColor(model.id, inv.color_id);
        const displayAvailable = Math.max(0, available - cartQty);
        const isDisplayOut = displayAvailable === 0;

        const cartBadge = cartQty > 0
            ? `<span class="inline-flex items-center gap-0.5 text-[10px] font-black text-devo-orange bg-devo-orange/15 border border-devo-orange/40 px-1.5 py-0.5 rounded-md whitespace-nowrap"><i class="ph ph-shopping-cart-simple text-[10px]"></i>${cartQty} في السلة</span>`
            : '';

        // للموظف: إظهار الرصيد الفعلي. للزائر: إخفاء الأرقام تماماً والاكتفاء بحالة التوفر فقط
        const stockStatusLabel = isWorker
            ? `<span class="text-[10px] sm:text-xs ${isOut ? 'text-devo-error' : isDisplayOut ? 'text-devo-orange' : 'text-devo-muted'} font-mono whitespace-nowrap">${isOut ? '(نفذت)' : `(متبقي ${displayAvailable})`}</span>`
            : (isOut ? `<span class="text-[10px] sm:text-xs text-devo-error font-bold whitespace-nowrap">(نفذت)</span>` : isDisplayOut ? `<span class="text-[10px] sm:text-xs text-devo-orange font-bold whitespace-nowrap">(بالسلة)</span>` : '');

        return `
        <div class="flex items-center justify-between p-2 sm:p-2.5 bg-devo-black border ${isDisplayOut && !isOut ? 'border-devo-orange/30' : isOut ? 'border-devo-error/30 opacity-70' : 'border-devo-gray'} rounded-xl mb-1.5 gap-2 transition-all duration-300">
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <span class="w-2.5 h-2.5 rounded-full shrink-0 ${isOut ? 'bg-devo-error' : isDisplayOut ? 'bg-devo-orange' : 'bg-devo-success'}"></span>
                <div class="flex items-center gap-1.5 flex-wrap min-w-0">
                    <span class="text-white font-bold text-xs sm:text-sm truncate">${inv.colors?.name}</span>
                    ${stockStatusLabel}
                    ${cartBadge}
                </div>
            </div>
            ${isOut ? `<span class="text-[11px] font-bold text-devo-error px-2 py-1 bg-devo-error/10 border border-devo-error/20 rounded-lg shrink-0">غير متوفر</span>` : isDisplayOut ? `<span class="text-[11px] font-bold text-devo-orange px-2 py-1 bg-devo-orange/10 border border-devo-orange/20 rounded-lg shrink-0">مضافة كلها</span>` : `
                <div class="flex items-center gap-1.5 shrink-0">
                    <div class="flex items-center bg-devo-dark border border-devo-gray rounded-lg overflow-hidden h-8 sm:h-9">
                        <button type="button" onclick="decrementQty('qty-${inv.color_id}')" class="w-8 sm:w-9 h-full flex items-center justify-center text-white hover:text-devo-orange hover:bg-white/5 transition-all shrink-0 cursor-pointer select-none" title="تقليل">
                            <i class="ph-bold ph-minus text-xs sm:text-sm"></i>
                        </button>
                        <input type="number" id="qty-${inv.color_id}" value="1" min="1" max="${displayAvailable}" readonly class="w-9 sm:w-10 h-full bg-transparent text-center text-white text-xs sm:text-sm font-bold outline-none border-x border-devo-gray appearance-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none leading-none select-none">
                        <button type="button" onclick="incrementQty('qty-${inv.color_id}', ${displayAvailable})" class="w-8 sm:w-9 h-full flex items-center justify-center text-white hover:text-devo-orange hover:bg-white/5 transition-all shrink-0 cursor-pointer select-none" title="زيادة">
                            <i class="ph-bold ph-plus text-xs sm:text-sm"></i>
                        </button>
                    </div>
                    <button onclick="addToCart(event, '${model.id}', '${inv.color_id}', '${model.name.replace(/'/g, "\\'")}', '${inv.colors?.name}', ${model.price}, '${mainImg}', ${dbAvailable}, ${sizesCount}, '${inv.color_system_code || inv.color_factory_code || model.factory_code || model.system_code}', '${inv.color_system_code || ''}', '${inv.color_factory_code || ''}')" class="px-2.5 sm:px-4 py-1.5 sm:py-2 bg-devo-orange hover:bg-devo-orangeHover text-white rounded-lg text-xs sm:text-sm font-bold transition-all shadow-md flex justify-center items-center gap-1 active:scale-95">
                        <i class="ph ph-shopping-cart-simple text-sm sm:text-base"></i> <span class="hidden xs:inline">إضافة</span>
                    </button>
                </div>
            `}
        </div>`;
    }).join('');
}

window.closeModelViewer = (skipHistory = false) => {
    const modal = document.getElementById('model-viewer-modal');
    if (!modal || modal.classList.contains('hidden') || modal.classList.contains('opacity-0')) return;

    modal.classList.add('opacity-0');

    if (!skipHistory) {
        if (history.state && history.state.modelId) {
            history.back();
        } else {
            const urlParams = new URLSearchParams(window.location.search);
            urlParams.delete('model');
            const newUrl = window.location.pathname + (urlParams.toString() ? '?' + urlParams.toString() : '');
            history.replaceState(null, '', newUrl);
        }
    }

    setTimeout(() => {
        modal.classList.add('hidden');
        modal.removeAttribute('data-current-model-id');
        if (typeof window.onModelViewerClosed === 'function') {
            window.onModelViewerClosed();
        }
    }, 300);
};

window.shareModel = async (id) => {
    const slug = getTenantSlugFromURL();
    const urlParams = new URLSearchParams(window.location.search);
    if (slug && slug !== 'default' && slug !== 'super_admin') {
        urlParams.set('tenant', slug);
    }
    urlParams.set('model', id);
    const url = `${window.location.origin}${window.location.pathname}?${urlParams.toString()}`;
    try {
        await navigator.clipboard.writeText(url);
        showToast('تم نسخ رابط الموديل الخاص بالمصنع بنجاح!', 'success');
    } catch (err) {
        showToast('حدث خطأ أثناء نسخ الرابط', 'error');
    }
};

// ==========================================
// 🌟 5. أوامر السلة والكميات (مع حماية الضغط المتكرر) 🌟
// ==========================================
window.incrementQty = (inputId, max) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    let val = parseInt(input.value) || 1;
    if (val < max) input.value = val + 1;
};

window.decrementQty = (inputId) => {
    const input = document.getElementById(inputId);
    if (!input) return;
    let val = parseInt(input.value) || 1;
    if (val > 1) input.value = val - 1;
};

window.addSetToCart = (event, modelId) => {
    const btn = event?.currentTarget || event?.target;
    if (btn) {
        if (btn.dataset.locked === "true") return; // 🛡️ حماية ضد الضغط المتكرر
        btn.dataset.locked = "true";
        btn.disabled = true;
    }

    const model = allModels.find(m => m.id === modelId);
    if (!model || !model.model_inventory || model.model_inventory.length === 0) {
        if (btn) { btn.disabled = false; delete btn.dataset.locked; }
        return showToast('لا توجد ألوان متاحة لهذا الموديل!', 'error');
    }

    const setQtyInput = document.getElementById(`set-qty-${modelId}`);
    const setCount = parseInt(setQtyInput?.value) || 1;

    loadLocalCart();

    const mainImg = resolveImageUrl(model.model_images?.[0]?.image_url);
    const classSizes = model.classes?.class_sizes || [];
    const sizesCount = classSizes.length > 0 ? classSizes.length : (model.model_sizes?.length || 1);
    const factoryCode = model.factory_code || model.system_code;

    let addedColorsCount = 0;
    let totalSeriesAdded = 0;
    let skippedColors = [];

    model.model_inventory.forEach(inv => {
        const dbAvailable = inv.available_series || 0;
        const ownedQty = getOwnedQtyForColor(model.id, inv.color_id);
        const trueAvailable = dbAvailable + ownedQty;

        if (trueAvailable <= 0) {
            skippedColors.push(inv.colors?.name || 'لون');
            return;
        }

        const existingIndex = localCart.findIndex(i => i.modelId === model.id && i.colorId === inv.color_id);
        const currentQty = existingIndex > -1 ? localCart[existingIndex].qty : 0;
        
        const spaceLeft = trueAvailable - currentQty;
        if (spaceLeft <= 0) {
            skippedColors.push(inv.colors?.name || 'لون');
            return;
        }

        const qtyToAdd = Math.min(setCount, spaceLeft);

        if (existingIndex > -1) {
            localCart[existingIndex].qty += qtyToAdd;
        } else {
            localCart.push({
                modelId: model.id,
                colorId: inv.color_id,
                modelName: model.name,
                colorName: inv.colors?.name,
                price: model.price,
                image: mainImg,
                qty: qtyToAdd,
                sizesCount: sizesCount,
                factoryCode: inv.color_system_code || inv.color_factory_code || factoryCode,
                colorSystemCode: inv.color_system_code || '',
                colorFactoryCode: inv.color_factory_code || ''
            });
        }
        addedColorsCount++;
        totalSeriesAdded += qtyToAdd;
    });

    if (addedColorsCount === 0) {
        showToast('جميع الألوان المتاحة نفذت كميتها أو مضافة بالفعل بأقصى حد بالسلة!', 'error');
    } else {
        saveLocalCart();
        if (window.refreshCartView) window.refreshCartView();
        refreshColorsContainer(modelId);

        let msg = `تم إضافة ${setCount} طقم (${addedColorsCount} لون) للسلة بنجاح!`;
        if (skippedColors.length > 0) {
            msg += ` (تم تجاوز ${skippedColors.length} لون لنفاذ الكمية)`;
        }
        showToast(msg, 'success');
    }

    if (btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-check text-base"></i> تمت إضافة الطقم`;
        btn.classList.replace('from-devo-orange', 'from-devo-success');
        btn.classList.replace('to-orange-600', 'to-green-600');
        
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.replace('from-devo-success', 'from-devo-orange');
            btn.classList.replace('to-green-600', 'to-orange-600');
            btn.disabled = false;
            delete btn.dataset.locked;
        }, 1000);
    }
};

window.addToCart = (event, modelId, colorId, modelName, colorName, price, image, maxAvailable, sizesCount, factoryCode, colorSystemCode = '', colorFactoryCode = '') => {
    const btn = event?.currentTarget || event?.target;
    if (btn) {
        if (btn.dataset.locked === "true") return; // 🛡️ حماية ضد الضغط المتكرر
        btn.dataset.locked = "true";
        btn.disabled = true;
    }

    const unlockBtn = () => {
        if (btn) {
            btn.disabled = false;
            delete btn.dataset.locked;
        }
    };

    const qtyInput = document.getElementById(`qty-${colorId}`);
    const qty = parseInt(qtyInput?.value) || 1;

    // 🌟 قراءة أحدث سلة من localStorage مباشرة لمنع مسح أصناف الفاتورة عند التعديل 🌟
    loadLocalCart();

    const ownedQty = getOwnedQtyForColor(modelId, colorId);
    const trueAvailable = maxAvailable + ownedQty;

    if (qty > trueAvailable) {
        unlockBtn();
        return showToast('الكمية المطلوبة تتجاوز المتاح لك في المخزن!', 'error');
    }

    const existingIndex = localCart.findIndex(i => i.modelId === modelId && i.colorId === colorId);
    
    if (existingIndex > -1) {
        if (localCart[existingIndex].qty + qty > trueAvailable) {
            unlockBtn();
            return showToast('إجمالي الكمية المطلوبة في السلة تتجاوز المتاح لك!', 'error');
        }
        localCart[existingIndex].qty += qty;
    } else {
        localCart.push({ modelId, colorId, modelName, colorName, price, image, qty, sizesCount, factoryCode, colorSystemCode, colorFactoryCode });
    }

    saveLocalCart();
    if (window.refreshCartView) window.refreshCartView();
    refreshColorsContainer(modelId);

    if (btn) {
        const originalHtml = btn.innerHTML;
        btn.innerHTML = `<i class="ph ph-check text-base"></i> تمت الإضافة`;
        btn.classList.replace('bg-devo-orange', 'bg-devo-success');
        btn.classList.replace('hover:bg-devo-orangeHover', 'hover:bg-green-600');
        setTimeout(() => {
            btn.innerHTML = originalHtml;
            btn.classList.replace('bg-devo-success', 'bg-devo-orange');
            btn.classList.replace('hover:bg-green-600', 'hover:bg-devo-orangeHover');
            unlockBtn();
        }, 1000);
    } else {
        unlockBtn();
    }
    showToast(`تم إضافة الموديل للسلة`, 'success');
};

function getTenantCartKey() {
    return getTenantStorageKey('devo_cart');
}

function loadLocalCart() {
    const key = getTenantCartKey();
    const saved = localStorage.getItem(key);
    if (saved) {
        try { localCart = JSON.parse(saved); } catch(e) { localCart = []; }
    } else {
        localCart = [];
    }
    updateFloatingCart();
}

function saveLocalCart() {
    const key = getTenantCartKey();
    localStorage.setItem(key, JSON.stringify(localCart));
    updateFloatingCart();
}

function updateFloatingCart() {
    const countEl = document.getElementById('floating-cart-count');
    if (!countEl) return;
    const totalItems = localCart.reduce((sum, item) => sum + item.qty, 0);
    countEl.textContent = totalItems;
    if (totalItems > 0) {
        countEl.parentElement.parentElement.classList.add('animate-bounce');
        setTimeout(() => countEl.parentElement.parentElement.classList.remove('animate-bounce'), 1000);
    }
}

export function findModelByCode(code, matchType = 'both') {
    if (!code) return null;
    const modelsList = (allModels && allModels.length > 0) ? allModels : (window.allGalleryModels || []);
    const cleanCode = code.toString().trim();
    const upperCode = cleanCode.toUpperCase();
    const lowerClean = cleanCode.toLowerCase();

    // 1. Check if barcode starts with 'S' prefix (System Code)
    if (upperCode.startsWith('S') && cleanCode.length > 1) {
        const baseCode = cleanCode.slice(1).trim().toLowerCase();
        const found = modelsList.find(m => {
            const sysStr = m.system_code ? m.system_code.toString().trim().toLowerCase() : '';
            const matchSys = sysStr && (sysStr === baseCode || ('s' + sysStr) === lowerClean || sysStr === lowerClean);
            const matchColor = m.model_inventory?.some(inv => {
                const cStr = inv.color_system_code ? inv.color_system_code.toString().trim().toLowerCase() : '';
                return cStr && (cStr === baseCode || ('s' + cStr) === lowerClean || cStr === lowerClean);
            });
            return matchSys || matchColor;
        });
        if (found) return found;
    }

    // 2. Check if barcode starts with 'F' prefix (Factory Code)
    if (upperCode.startsWith('F') && cleanCode.length > 1) {
        const baseCode = cleanCode.slice(1).trim().toLowerCase();
        const found = modelsList.find(m => {
            const facStr = m.factory_code ? m.factory_code.toString().trim().toLowerCase() : '';
            const matchFac = facStr && (facStr === baseCode || ('f' + facStr) === lowerClean || facStr === lowerClean);
            const matchColor = m.model_inventory?.some(inv => {
                const cStr = inv.color_factory_code ? inv.color_factory_code.toString().trim().toLowerCase() : '';
                return cStr && (cStr === baseCode || ('f' + cStr) === lowerClean || cStr === lowerClean);
            });
            return matchFac || matchColor;
        });
        if (found) return found;
    }

    // 3. Fallback matching (legacy barcodes or raw numbers)
    return modelsList.find(m => {
        const isSystemMatch = m.system_code && m.system_code.toString().toLowerCase() === lowerClean;
        const isFactoryMatch = m.factory_code && m.factory_code.toString().toLowerCase() === lowerClean;
        const isColorSysMatch = m.model_inventory?.some(inv => inv.color_system_code && inv.color_system_code.toString().toLowerCase() === lowerClean);
        const isColorFacMatch = m.model_inventory?.some(inv => inv.color_factory_code && inv.color_factory_code.toString().toLowerCase() === lowerClean);
        
        if (matchType === 'system') {
            return isSystemMatch || isColorSysMatch;
        } else if (matchType === 'factory') {
            return isFactoryMatch || isColorFacMatch;
        } else {
            return isSystemMatch || isFactoryMatch || isColorSysMatch || isColorFacMatch;
        }
    });
}

// إتاحة الدالة بشكل عام لحمايتها من أي تضارب إصدارات
window.findModelByCode = findModelByCode;