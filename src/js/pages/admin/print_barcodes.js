import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { getCurrentTenantId } from '../../services/tenant_service.js';

let isBarcodeInitialized = false;
let barcodeAllModels = []; 
let filteredBarcodeModels = [];
let selectedBarcodeModelIds = new Set();
let sizesMap = {};
let colorsMap = {};

let barcodeCurrentPage = 1;
const barcodeItemsPerPage = 50;

export async function initPrintBarcodesView() {
    if (isBarcodeInitialized) return;
    
    await fetchBarcodeFilterOptions();
    await fetchBarcodeModels();

    const stockOp = document.getElementById('barcode-filter-stock-op');
    const stockQty = document.getElementById('barcode-filter-stock-qty');
    if (stockOp && stockQty) {
        stockOp.addEventListener('change', () => {
            if (stockOp.value) {
                stockQty.classList.remove('hidden');
            } else {
                stockQty.classList.add('hidden');
                stockQty.value = '';
            }
        });
    }
    
    isBarcodeInitialized = true;
}

// 🌟 دالة فتح/غلق الفلاتر 🌟
window.toggleBarcodeFilters = () => {
    const container = document.getElementById('barcode-filters-container');
    const icon = document.getElementById('barcode-filter-icon');
    
    if (container.classList.contains('hidden')) {
        container.classList.remove('hidden');
        icon.style.transform = 'rotate(0deg)';
    } else {
        container.classList.add('hidden');
        icon.style.transform = 'rotate(180deg)';
    }
};

window.toggleBarcodeMultiSelectDropdown = (event, menuId) => {
    event.stopPropagation();
    const menu = document.getElementById(menuId);
    if (!menu) return;
    
    // Close other dropdowns
    const allMenus = document.querySelectorAll('.multi-select-dropdown [id$="-menu"]');
    allMenus.forEach(m => {
        if (m.id !== menuId) {
            m.classList.add('hidden');
        }
    });
    
    menu.classList.toggle('hidden');
};

window.barcodeMultiSelectAction = (event, key, action) => {
    event.stopPropagation();
    const checkboxes = document.querySelectorAll(`input[name="barcode-filter-${key}"]`);
    checkboxes.forEach(cb => {
        cb.checked = (action === 'all');
    });
    window.updateBarcodeMultiSelectLabel(key);
};

window.updateBarcodeMultiSelectLabel = (key) => {
    const checkboxes = document.querySelectorAll(`input[name="barcode-filter-${key}"]:checked`);
    const excludeCheckbox = document.getElementById(`barcode-dropdown-${key}-exclude`);
    const labelEl = document.getElementById(`barcode-dropdown-${key}-label`);
    
    if (!labelEl) return;
    
    const count = checkboxes.length;
    const isExclude = excludeCheckbox ? excludeCheckbox.checked : false;
    
    let defaultLabel = '';
    if (key === 'cat') defaultLabel = 'جميع التصنيفات';
    else if (key === 'class') defaultLabel = 'جميع الفئات';
    else if (key === 'color') defaultLabel = 'جميع الألوان';
    else if (key === 'size') defaultLabel = 'جميع المقاسات';
    
    if (count === 0) {
        labelEl.textContent = isExclude ? `استثناء: لا شيء (الكل)` : defaultLabel;
        labelEl.classList.remove('text-devo-orange');
    } else {
        const names = Array.from(checkboxes).map(cb => cb.nextElementSibling.textContent.trim());
        if (isExclude) {
            if (count <= 2) {
                labelEl.textContent = `استثناء: ${names.join('، ')}`;
            } else {
                labelEl.textContent = `الكل عدا ${count}`;
            }
            labelEl.classList.add('text-devo-orange');
        } else {
            if (count <= 2) {
                labelEl.textContent = names.join('， ');
            } else {
                labelEl.textContent = `${count} محددة`;
            }
            labelEl.classList.add('text-devo-orange');
        }
    }
};

// Global click handler to close dropdowns when clicking outside
document.addEventListener('click', () => {
    const allBarcodeMenus = document.querySelectorAll('.multi-select-dropdown [id^="barcode-dropdown-"][id$="-menu"]');
    allBarcodeMenus.forEach(m => m.classList.add('hidden'));
});

export async function fetchBarcodeFilterOptions() {
    try {
        const currentTenantId = getCurrentTenantId();
        let catQ = supabase.from('categories').select('id, name');
        let clsQ = supabase.from('classes').select('id, name');
        let clrQ = supabase.from('colors').select('id, name');
        let szQ = supabase.from('sizes').select('id, name');
        if (currentTenantId) {
            catQ = catQ.eq('tenant_id', currentTenantId);
            clsQ = clsQ.eq('tenant_id', currentTenantId);
            clrQ = clrQ.eq('tenant_id', currentTenantId);
            szQ = szQ.eq('tenant_id', currentTenantId);
        }
        const [cats, clss, colors, sizes] = await Promise.all([
            catQ, clsQ, clrQ, szQ
        ]);

        const populateCheckbox = (containerId, data, key) => {
            const container = document.getElementById(containerId);
            if (container && data) {
                container.innerHTML = data.map(item => `
                    <label class="flex items-center gap-2 px-2 py-1.5 hover:bg-devo-black/40 rounded cursor-pointer text-xs text-white select-none" onclick="event.stopPropagation()">
                        <input type="checkbox" value="${item.id}" name="barcode-filter-${key}" class="accent-devo-orange w-3.5 h-3.5 rounded cursor-pointer" onchange="updateBarcodeMultiSelectLabel('${key}')">
                        <span class="truncate">${item.name}</span>
                    </label>
                `).join('');
            }
        };

        populateCheckbox('barcode-dropdown-cat-options', cats.data, 'cat');
        populateCheckbox('barcode-dropdown-class-options', clss.data, 'class');
        populateCheckbox('barcode-dropdown-color-options', colors.data, 'color');
        populateCheckbox('barcode-dropdown-size-options', sizes.data, 'size');

        if (sizes && sizes.data) {
            sizes.data.forEach(s => {
                sizesMap[s.id] = s.name;
            });
        }

        if (colors && colors.data) {
            colors.data.forEach(c => {
                colorsMap[c.id] = c.name;
            });
        }

        // Setup labels
        window.updateBarcodeMultiSelectLabel('cat');
        window.updateBarcodeMultiSelectLabel('class');
        window.updateBarcodeMultiSelectLabel('color');
        window.updateBarcodeMultiSelectLabel('size');

    } catch (err) {
        console.error("Error fetching filter options:", err);
    }
}

export async function fetchBarcodeModels() {
    const tbody = document.getElementById('barcode-table-body');
    if (tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center"><i class="ph ph-spinner animate-spin text-3xl text-devo-orange"></i> جاري تحميل كل الموديلات...</td></tr>`;

    let allFetchedData = [];
    let from = 0;
    const step = 999;
    let hasMore = true;

    try {
        while (hasMore) {
            const currentTenantId = getCurrentTenantId();
            let query = supabase
                .from('models')
                .select(`
                    *, 
                    categories(name), 
                    classes(name, class_sizes(size_id, sort_order)),
                    model_sizes(size_id),
                    model_inventory(color_id, available_series, colors(name)),
                    model_images(image_url)
                `);

            if (currentTenantId) {
                query = query.eq('tenant_id', currentTenantId);
            }

            const { data, error } = await query
                .order('created_at', { ascending: false })
                .range(from, from + step);

            if (error) throw error;

            if (data.length > 0) {
                allFetchedData = [...allFetchedData, ...data];
                from += step + 1;
            }
            if (data.length <= step) {
                hasMore = false;
            }
        }
        
        barcodeAllModels = allFetchedData;
        window.applyBarcodeFilters();

    } catch (error) {
        console.error("Barcode Fetch Error:", error);
        showToast('خطأ في تحميل الموديلات للطباعة', 'error');
    }
}

window.applyBarcodeFilters = () => {
    const nameTerm = document.getElementById('barcode-search-name')?.value.toLowerCase().trim() || '';
    const factoryTerm = document.getElementById('barcode-search-factory')?.value.toLowerCase().trim() || '';
    const systemTerm = document.getElementById('barcode-search-system')?.value.toLowerCase().trim() || '';

    const factoryFromVal = document.getElementById('barcode-factory-from')?.value.trim() || '';
    const factoryToVal = document.getElementById('barcode-factory-to')?.value.trim() || '';

    const selectedCats = Array.from(document.querySelectorAll('input[name="barcode-filter-cat"]:checked')).map(cb => cb.value);
    const isCatExclude = document.getElementById('barcode-dropdown-cat-exclude')?.checked || false;

    const selectedClasses = Array.from(document.querySelectorAll('input[name="barcode-filter-class"]:checked')).map(cb => cb.value);
    const isClassExclude = document.getElementById('barcode-dropdown-class-exclude')?.checked || false;

    const status = document.getElementById('barcode-filter-status')?.value || '';
    const stockOp = document.getElementById('barcode-filter-stock-op')?.value || '';
    const stockQtyVal = parseInt(document.getElementById('barcode-filter-stock-qty')?.value, 10);

    const selectedColors = Array.from(document.querySelectorAll('input[name="barcode-filter-color"]:checked')).map(cb => cb.value);
    const isColorExclude = document.getElementById('barcode-dropdown-color-exclude')?.checked || false;

    const selectedSizes = Array.from(document.querySelectorAll('input[name="barcode-filter-size"]:checked')).map(cb => cb.value);
    const isSizeExclude = document.getElementById('barcode-dropdown-size-exclude')?.checked || false;

    const minPriceVal = document.getElementById('barcode-price-min')?.value;
    const maxPriceVal = document.getElementById('barcode-price-max')?.value;
    const minPrice = minPriceVal ? parseFloat(minPriceVal) : NaN;
    const maxPrice = maxPriceVal ? parseFloat(maxPriceVal) : NaN;

    const dateFrom = document.getElementById('barcode-date-from')?.value || '';
    const dateTo = document.getElementById('barcode-date-to')?.value || '';

    filteredBarcodeModels = barcodeAllModels.filter(m => {
        let isMatch = true;
        
        // 1. Split search fields (AND logic)
        if (nameTerm && !m.name?.toLowerCase().includes(nameTerm)) isMatch = false;
        if (factoryTerm && !m.factory_code?.toLowerCase().includes(factoryTerm)) isMatch = false;
        if (systemTerm && !m.system_code?.toLowerCase().includes(systemTerm)) isMatch = false;
        
        // 2. Factory Code Range Filter
        if (factoryFromVal || factoryToVal) {
            const codeNum = parseInt(m.factory_code, 10);
            const fromNum = factoryFromVal ? parseInt(factoryFromVal, 10) : NaN;
            const toNum = factoryToVal ? parseInt(factoryToVal, 10) : NaN;
            
            if (!isNaN(codeNum)) {
                if (!isNaN(fromNum) && codeNum < fromNum) isMatch = false;
                if (!isNaN(toNum) && codeNum > toNum) isMatch = false;
            } else {
                if (factoryFromVal && m.factory_code < factoryFromVal) isMatch = false;
                if (factoryToVal && m.factory_code > factoryToVal) isMatch = false;
            }
        }

        // 3. Category Multi-select (Inclusion / Exclusion)
        if (selectedCats.length > 0) {
            const inList = selectedCats.includes(m.category_id);
            if (isCatExclude && inList) isMatch = false;
            if (!isCatExclude && !inList) isMatch = false;
        }

        // 4. Class Multi-select (Inclusion / Exclusion)
        if (selectedClasses.length > 0) {
            const inList = selectedClasses.includes(m.class_id);
            if (isClassExclude && inList) isMatch = false;
            if (!isClassExclude && !inList) isMatch = false;
        }

        // 5. Activation status
        if (status !== "" && String(m.is_active) !== status) isMatch = false;

        // 6. Stock quantity filter
        const totalQty = m.model_inventory?.reduce((sum, inv) => sum + (inv.available_series || 0), 0) || 0;
        if (stockOp && !isNaN(stockQtyVal)) {
            if (stockOp === 'less' && totalQty >= stockQtyVal) isMatch = false;
            if (stockOp === 'greater' && totalQty <= stockQtyVal) isMatch = false;
            if (stockOp === 'equal' && totalQty !== stockQtyVal) isMatch = false;
        }

        // 7. Colors Multi-select (Inclusion / Exclusion)
        if (selectedColors.length > 0) {
            const hasAnyColor = m.model_inventory?.some(inv => selectedColors.includes(inv.color_id)) || false;
            if (isColorExclude && hasAnyColor) isMatch = false;
            if (!isColorExclude && !hasAnyColor) isMatch = false;
        }

        // 8. Sizes Multi-select (Inclusion / Exclusion)
        if (selectedSizes.length > 0) {
            const classSizes = m.classes?.class_sizes?.map(cs => cs.size_id) || [];
            const manualSizes = m.model_sizes?.map(ms => ms.size_id) || [];
            const hasAnySize = selectedSizes.some(sId => classSizes.includes(sId) || manualSizes.includes(sId));
            if (isSizeExclude && hasAnySize) isMatch = false;
            if (!isSizeExclude && !hasAnySize) isMatch = false;
        }

        // 9. Prices Range
        if (!isNaN(minPrice) && m.price < minPrice) isMatch = false;
        if (!isNaN(maxPrice) && m.price > maxPrice) isMatch = false;

        // 10. Date Range
        if (dateFrom || dateTo) {
            const modelDate = new Date(m.created_at);
            modelDate.setHours(0, 0, 0, 0);
            if (dateFrom) {
                const fDate = new Date(dateFrom);
                fDate.setHours(0, 0, 0, 0);
                if (modelDate < fDate) isMatch = false;
            }
            if (dateTo) {
                const tDate = new Date(dateTo);
                tDate.setHours(23, 59, 59, 999);
                if (modelDate > tDate) isMatch = false;
            }
        }
        return isMatch;
    });

    selectedBarcodeModelIds.clear();
    filteredBarcodeModels.forEach(m => selectedBarcodeModelIds.add(m.id));
    
    barcodeCurrentPage = 1; 

    renderBarcodePage();
    updateBarcodeActionBar();
};

window.clearBarcodeFilters = () => {
    const textSelectIds = [
        'barcode-search-name', 'barcode-search-factory', 'barcode-search-system',
        'barcode-factory-from', 'barcode-factory-to',
        'barcode-filter-status', 'barcode-filter-stock-op', 'barcode-filter-stock-qty',
        'barcode-price-min', 'barcode-price-max', 
        'barcode-date-from', 'barcode-date-to'
    ];
    textSelectIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
    });
    const stockQty = document.getElementById('barcode-filter-stock-qty');
    if (stockQty) stockQty.classList.add('hidden');

    const multiSelectKeys = ['cat', 'class', 'color', 'size'];
    multiSelectKeys.forEach(key => {
        const checkboxes = document.querySelectorAll(`input[name="barcode-filter-${key}"]`);
        checkboxes.forEach(cb => {
            cb.checked = false;
        });
        const excludeCb = document.getElementById(`barcode-dropdown-${key}-exclude`);
        if (excludeCb) excludeCb.checked = false;
        
        window.updateBarcodeMultiSelectLabel(key);
    });

    window.applyBarcodeFilters(); 
};

function renderBarcodePage() {
    const tbody = document.getElementById('barcode-table-body');
    const paginationContainer = document.getElementById('barcode-pagination');
    const masterCb = document.getElementById('barcode-select-all');
    
    document.getElementById('barcode-results-count').textContent = filteredBarcodeModels.length;
    document.getElementById('barcode-selected-count').textContent = selectedBarcodeModelIds.size;

    if (filteredBarcodeModels.length === 0) {
        if(masterCb) { masterCb.checked = false; masterCb.disabled = true; }
        if(tbody) tbody.innerHTML = `<tr><td colspan="5" class="p-10 text-center text-devo-muted">لا توجد نتائج مطابقة للبحث</td></tr>`;
        if (paginationContainer) paginationContainer.innerHTML = '';
        return;
    }

    if(masterCb) {
        masterCb.disabled = false;
        masterCb.checked = selectedBarcodeModelIds.size === filteredBarcodeModels.length;
    }

    const totalItems = filteredBarcodeModels.length;
    const totalPages = Math.ceil(totalItems / barcodeItemsPerPage);
    
    if (barcodeCurrentPage > totalPages) barcodeCurrentPage = totalPages;
    if (barcodeCurrentPage < 1) barcodeCurrentPage = 1;

    const startIndex = (barcodeCurrentPage - 1) * barcodeItemsPerPage;
    const endIndex = startIndex + barcodeItemsPerPage;
    const pageData = filteredBarcodeModels.slice(startIndex, endIndex);

    if(tbody) {
        tbody.innerHTML = pageData.map(m => {
            const totalQty = m.model_inventory?.reduce((sum, inv) => sum + (inv.available_series || 0), 0) || 0;
            return `
            <tr class="hover:bg-devo-black/50 transition-colors border-b border-devo-gray/50">
                <td class="p-3 text-center border-l border-devo-gray/30">
                    <input type="checkbox" value="${m.id}" onchange="toggleSingleBarcodeCheck(this)" class="barcode-item-cb accent-devo-orange w-4 h-4 cursor-pointer" ${selectedBarcodeModelIds.has(m.id) ? 'checked' : ''}>
                </td>
                <td class="p-3">
                    <p class="text-[10px] text-devo-muted font-mono tracking-wider">${m.factory_code || m.system_code}</p>
                    <p class="font-bold text-white text-xs mt-0.5">${m.name}</p>
                </td>
                <td class="p-3 text-center font-black text-devo-orange text-sm">${m.price}</td>
                <td class="p-3 text-center text-xs text-devo-muted">
                    <span class="block mb-1">${m.categories?.name || '-'} / ${m.classes?.name || '-'}</span>
                    <span class="${totalQty === 0 ? 'text-devo-error' : 'text-devo-success'} font-bold text-[10px] bg-devo-black px-2 py-0.5 rounded border border-devo-gray">${totalQty === 0 ? 'نفذت الكمية' : `متبقي: ${totalQty}`}</span>
                </td>
                <td class="p-3 text-center">
                    ${m.is_active ? `<span class="bg-devo-success/10 border border-devo-success/20 text-devo-success text-[10px] font-bold px-2 py-1 rounded">نشط</span>` : `<span class="bg-devo-gray/30 border border-devo-gray text-white text-[10px] font-bold px-2 py-1 rounded">معطل</span>`}
                </td>
            </tr>
        `}).join('');
    }

    renderBarcodePaginationControls(totalPages);
}

function renderBarcodePaginationControls(totalPages) {
    const container = document.getElementById('barcode-pagination');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    let html = '';
    html += `<button onclick="changeBarcodePage(${barcodeCurrentPage - 1})" ${barcodeCurrentPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded border border-devo-gray bg-devo-black text-white hover:bg-devo-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-xs"><i class="ph ph-caret-right"></i> السابق</button>`;
    html += `<span class="px-4 py-1.5 rounded bg-devo-dark text-devo-orange font-bold border border-devo-gray text-xs">صفحة ${barcodeCurrentPage} من ${totalPages}</span>`;
    html += `<button onclick="changeBarcodePage(${barcodeCurrentPage + 1})" ${barcodeCurrentPage === totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded border border-devo-gray bg-devo-black text-white hover:bg-devo-gray transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1 text-xs">التالي <i class="ph ph-caret-left"></i></button>`;

    container.innerHTML = html;
}

window.changeBarcodePage = (newPage) => {
    barcodeCurrentPage = newPage;
    renderBarcodePage();
};

window.toggleBarcodeSelectAll = (cb) => {
    selectedBarcodeModelIds.clear();
    if (cb.checked) {
        filteredBarcodeModels.forEach(m => selectedBarcodeModelIds.add(m.id));
    }
    renderBarcodePage(); 
    updateBarcodeActionBar();
};

window.toggleSingleBarcodeCheck = (cb) => {
    if (cb.checked) selectedBarcodeModelIds.add(cb.value);
    else selectedBarcodeModelIds.delete(cb.value);
    
    document.getElementById('barcode-selected-count').textContent = selectedBarcodeModelIds.size;
    const masterCb = document.getElementById('barcode-select-all');
    if(masterCb) masterCb.checked = selectedBarcodeModelIds.size === filteredBarcodeModels.length;
    updateBarcodeActionBar();
};

function updateBarcodeActionBar() {
    const bar = document.getElementById('barcode-action-bar');
    if (selectedBarcodeModelIds.size > 0) {
        bar.classList.remove('hidden');
        bar.classList.add('block');
    } else {
        bar.classList.add('hidden');
        bar.classList.remove('block');
    }
}

// =========================================================================
// 🌟 7. تصدير وطباعة الباركود المجمع 🌟
// =========================================================================

// دالة مساعدة للحصول على نص مقاسات الموديل المنسق
function getModelSizesString(m) {
    let sizeNames = [];
    if (m.classes?.class_sizes && m.classes.class_sizes.length > 0) {
        const sortedClassSizes = [...m.classes.class_sizes].sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
        sizeNames = sortedClassSizes.map(cs => sizesMap[cs.size_id] || cs.size_id);
    } else if (m.model_sizes && m.model_sizes.length > 0) {
        sizeNames = m.model_sizes.map(ms => sizesMap[ms.size_id] || ms.size_id);
    }
    return sizeNames.filter(Boolean).join('، ');
}

// دالة تحميل مكتبات التشفير ديناميكياً
async function loadPrintingLibraries() {
    if (typeof JsBarcode === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js');
    }
    if (typeof QRCode === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.4.4/qrcode.min.js');
    }
}

function loadScript(url) {
    const existing = document.querySelector(`script[src="${url}"]`);
    if (existing) {
        return new Promise((resolve) => {
            if (existing.dataset.loaded === "true") {
                resolve();
            } else {
                existing.addEventListener('load', resolve);
                existing.addEventListener('error', resolve);
            }
        });
    }

    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = url;
        script.onload = () => {
            script.dataset.loaded = "true";
            resolve();
        };
        script.onerror = (err) => {
            script.remove();
            reject(err);
        };
        document.head.appendChild(script);
    });
}

// دالة إخفاء/تفعيل مدخلات عدد النسخ الثابت
window.toggleBarcodeQtyInput = () => {
    const qtyMode = document.getElementById('bulk-barcode-qty-mode')?.value;
    const container = document.getElementById('bulk-barcode-fixed-qty-container');
    if (container) {
        const input = container.querySelector('input');
        if (qtyMode === 'fixed') {
            container.classList.remove('opacity-50', 'pointer-events-none');
            if (input) input.disabled = false;
        } else {
            container.classList.add('opacity-50', 'pointer-events-none');
            if (input) input.disabled = true;
        }
    }
};

// دالة تحديث المعاينة الحية للملصق بداخل المودال
window.updateBarcodePreview = () => {
    const codeType = document.getElementById('bulk-barcode-type')?.value || 'barcode';
    const valueSource = document.getElementById('bulk-barcode-value-source')?.value || 'factory';
    
    const paperW = parseFloat(document.getElementById('bulk-barcode-paper-w')?.value) || 4;
    const paperH = parseFloat(document.getElementById('bulk-barcode-paper-h')?.value) || 5;
    
    const fontName = parseInt(document.getElementById('bulk-barcode-font-size-name')?.value, 10) || 11;
    const fontCode = parseInt(document.getElementById('bulk-barcode-font-size-code')?.value, 10) || 10;
    const fontDetails = parseInt(document.getElementById('bulk-barcode-font-size-details')?.value, 10) || 9;
    const fontPrice = parseInt(document.getElementById('bulk-barcode-font-size-price')?.value, 10) || 12;
    
    const boldCode = document.getElementById('bulk-barcode-bold-code')?.checked !== false;
    const colorInline = document.getElementById('bulk-barcode-color-inline')?.checked !== false;

    const showName = document.getElementById('bulk-barcode-show-name')?.checked !== false;
    const showCode = document.getElementById('bulk-barcode-show-code')?.checked !== false;
    const showSizes = document.getElementById('bulk-barcode-show-sizes')?.checked !== false;
    const showPrice = document.getElementById('bulk-barcode-show-price')?.checked !== false;
    const showColors = document.getElementById('bulk-barcode-show-colors')?.checked !== false;
    const skipZeroStock = document.getElementById('bulk-barcode-skip-zero-stock-colors')?.checked !== false;

    const qtyMode = document.getElementById('bulk-barcode-qty-mode')?.value || 'fixed';
    const fixedQty = parseInt(document.getElementById('bulk-barcode-fixed-qty')?.value, 10) || 1;

    // 1. تحديث شارة الأبعاد
    const dimBadge = document.getElementById('barcode-prev-dimensions-badge');
    if (dimBadge) {
        dimBadge.textContent = `${paperW} × ${paperH} سم`;
    }

    // 2. تحديث لافتة وعداد إجمالي الملصقات التفاعلي
    const totalCountEl = document.getElementById('barcode-preview-total-count');
    const copiesDescEl = document.getElementById('barcode-preview-copies-desc');
    const selectedModels = barcodeAllModels.filter(m => selectedBarcodeModelIds.has(m.id));

    if (totalCountEl && copiesDescEl) {
        if (qtyMode === 'by_color') {
            let totalCopies = 0;
            selectedModels.forEach(m => {
                let count = 0;
                if (m.model_inventory && m.model_inventory.length > 0) {
                    let invs = m.model_inventory;
                    if (skipZeroStock) {
                        invs = invs.filter(inv => (inv.available_series || 0) > 0);
                    }
                    const clrs = [...new Set(invs.map(inv => inv.color_id).filter(Boolean))];
                    count = clrs.length;
                }
                totalCopies += Math.max(1, count);
            });
            totalCountEl.textContent = totalCopies;
            copiesDescEl.textContent = 'حسب ألوان الموديل';
        } else {
            const total = selectedBarcodeModelIds.size * fixedQty;
            totalCountEl.textContent = total;
            copiesDescEl.textContent = `${fixedQty} لكل موديل`;
        }
    }

    // 3. ضبط أبعاد كرت المعاينة
    const previewCard = document.getElementById('barcode-preview-card');
    if (previewCard) {
        previewCard.style.width = `${paperW}cm`;
        previewCard.style.height = `${paperH}cm`;
        previewCard.style.padding = `${Math.min(paperW, paperH) * 0.08}cm`;
    }

    // 4. إظهار/إخفاء الحقول وضبط الخط والوزن بشكل منفصل
    const prevName = document.getElementById('prev-name');
    const prevCode = document.getElementById('prev-code');
    const prevSizes = document.getElementById('prev-sizes');
    const prevColors = document.getElementById('prev-colors');
    const prevPrice = document.getElementById('prev-price');

    if (prevName) {
        prevName.style.display = showName ? '-webkit-box' : 'none';
        prevName.style.fontSize = `${fontName}px`;
    }
    if (prevCode) {
        prevCode.style.display = showCode ? 'block' : 'none';
        prevCode.style.fontSize = `${fontCode}px`;
        prevCode.style.fontWeight = boldCode ? 'bold' : 'normal';
        if (colorInline) {
            prevCode.textContent = showColors ? 'CODE12345 - أحمر' : 'CODE12345';
            if (prevColors) prevColors.style.display = 'none';
        } else {
            prevCode.textContent = 'CODE12345';
            if (prevColors) {
                prevColors.style.display = showColors ? 'block' : 'none';
                prevColors.textContent = 'أحمر، أسود، أزرق';
            }
        }
    }
    if (prevSizes) {
        prevSizes.style.display = showSizes ? 'block' : 'none';
        prevSizes.style.fontSize = `${fontDetails}px`;
    }
    if (prevColors && !colorInline) {
        prevColors.style.display = showColors ? 'block' : 'none';
        prevColors.style.fontSize = `${fontDetails}px`;
    }
    if (prevPrice) {
        prevPrice.style.display = showPrice ? 'block' : 'none';
        prevPrice.style.fontSize = `${fontPrice}px`;
        prevPrice.style.paddingTop = `${fontPrice * 0.2}px`;
    }

    // 5. رسم الكود التجريبي
    const barcodeSvg = document.getElementById('prev-barcode-svg');
    const qrcodeImg = document.getElementById('prev-qrcode-img');
    const sampleValue = 'CODE12345';

    if (codeType === 'barcode') {
        if (barcodeSvg) barcodeSvg.classList.remove('hidden');
        if (qrcodeImg) qrcodeImg.classList.add('hidden');
        try {
            if (typeof JsBarcode !== 'undefined' && barcodeSvg) {
                JsBarcode(barcodeSvg, sampleValue, {
                    format: "CODE128",
                    width: 1.8,
                    height: 50,
                    displayValue: false,
                    margin: 0
                });
            }
        } catch(e) {
            console.error("Preview JsBarcode error:", e);
        }
    } else {
        if (barcodeSvg) barcodeSvg.classList.add('hidden');
        if (qrcodeImg) qrcodeImg.classList.remove('hidden');
        if (typeof QRCode !== 'undefined') {
            QRCode.toDataURL(sampleValue, { width: 250, margin: 1 })
                .then(url => { if (qrcodeImg) qrcodeImg.src = url; })
                .catch(err => {
                    console.error("Local QRCode error:", err);
                    if (qrcodeImg) qrcodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(sampleValue)}`;
                });
        } else if (qrcodeImg) {
            qrcodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(sampleValue)}`;
        }
    }
};

window.openBulkBarcodeModal = async () => {
    if (!selectedBarcodeModelIds || selectedBarcodeModelIds.size === 0) {
        return showToast('الرجاء تحديد موديل واحد على الأقل أولاً', 'warning');
    }

    try {
        await loadPrintingLibraries();
    } catch(e) {
        console.error("Failed to load barcode scripts:", e);
        showToast('خطأ في تحميل مكتبات الباركود، تحقق من الاتصال بالشبكة', 'error');
    }

    // تهيئة واستدعاء القوالب المحفوظة
    if (typeof window.initBarcodeTemplates === 'function') {
        window.initBarcodeTemplates();
    }

    const countEl = document.getElementById('bulk-barcode-count');
    if (countEl) countEl.textContent = selectedBarcodeModelIds.size;

    const modal = document.getElementById('bulk-barcode-modal');
    if (!modal) {
        console.error("bulk-barcode-modal element not found in DOM");
        return;
    }

    modal.classList.remove('hidden');
    modal.classList.add('flex');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        if (typeof window.toggleBarcodeQtyInput === 'function') window.toggleBarcodeQtyInput();
        if (typeof window.updateBarcodePreview === 'function') window.updateBarcodePreview();
    });
};

window.closeBulkBarcodeModal = () => {
    const modal = document.getElementById('bulk-barcode-modal');
    if (!modal) return;
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }, 300);
};

window.generateAndPrintBulkBarcodes = () => {
    if (selectedBarcodeModelIds.size === 0) return showToast('الرجاء تحديد موديل واحد على الأقل أولاً', 'warning');

    const codeType = document.getElementById('bulk-barcode-type')?.value || 'barcode';
    const valueSource = document.getElementById('bulk-barcode-value-source')?.value || 'factory';
    const sortOrder = document.getElementById('bulk-barcode-sort-order')?.value || 'table';
    
    const paperW = parseFloat(document.getElementById('bulk-barcode-paper-w')?.value) || 4;
    const paperH = parseFloat(document.getElementById('bulk-barcode-paper-h')?.value) || 5;
    
    const fontName = parseInt(document.getElementById('bulk-barcode-font-size-name')?.value, 10) || 11;
    const fontCode = parseInt(document.getElementById('bulk-barcode-font-size-code')?.value, 10) || 10;
    const fontDetails = parseInt(document.getElementById('bulk-barcode-font-size-details')?.value, 10) || 9;
    const fontPrice = parseInt(document.getElementById('bulk-barcode-font-size-price')?.value, 10) || 12;
    
    const boldCode = document.getElementById('bulk-barcode-bold-code')?.checked !== false;
    const colorInline = document.getElementById('bulk-barcode-color-inline')?.checked !== false;

    const showName = document.getElementById('bulk-barcode-show-name')?.checked !== false;
    const showCode = document.getElementById('bulk-barcode-show-code')?.checked !== false;
    const showSizes = document.getElementById('bulk-barcode-show-sizes')?.checked !== false;
    const showPrice = document.getElementById('bulk-barcode-show-price')?.checked !== false;
    const showColors = document.getElementById('bulk-barcode-show-colors')?.checked !== false;
    const skipZeroStock = document.getElementById('bulk-barcode-skip-zero-stock-colors')?.checked !== false;

    const qtyMode = document.getElementById('bulk-barcode-qty-mode')?.value || 'fixed';
    const fixedQty = parseInt(document.getElementById('bulk-barcode-fixed-qty')?.value, 10) || 1;
    const colorDist = document.getElementById('bulk-barcode-color-dist')?.value || 'separate';

    // Get selected models data
    let selectedModels = barcodeAllModels.filter(m => selectedBarcodeModelIds.has(m.id));

    if (selectedModels.length === 0) return showToast('الموديلات المحددة غير متوفرة', 'error');

    // ترتيب الموديلات حسب الخيار المحدد
    if (sortOrder === 'factory_asc') {
        selectedModels.sort((a, b) => String(a.factory_code || '').localeCompare(String(b.factory_code || ''), undefined, { numeric: true, sensitivity: 'base' }));
    } else if (sortOrder === 'factory_desc') {
        selectedModels.sort((a, b) => String(b.factory_code || '').localeCompare(String(a.factory_code || ''), undefined, { numeric: true, sensitivity: 'base' }));
    } else if (sortOrder === 'name_asc') {
        selectedModels.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'ar'));
    }

    showToast('جاري تحضير الباركود للطباعة...', 'info');

    // Generate label items based on copies count and color choices
    const labelsToPrint = [];
    selectedModels.forEach(m => {
        const hasInventoryEntries = m.model_inventory && m.model_inventory.length > 0;
        
        let colorsList = [];
        if (hasInventoryEntries) {
            let inventoryItems = m.model_inventory;
            if (skipZeroStock) {
                inventoryItems = inventoryItems.filter(inv => (inv.available_series || 0) > 0);
            }
            const modelColors = inventoryItems.map(inv => {
                return (inv.colors && inv.colors.name) || colorsMap[inv.color_id] || '';
            }).filter(Boolean);
            colorsList = [...new Set(modelColors)];
            
            // If all colors of the model are out of stock and we are skipping out-of-stock, skip this model completely
            if (colorsList.length === 0 && skipZeroStock) {
                return;
            }
        }
        
        const hasColors = colorsList.length > 0;
        if (colorsList.length === 0) {
            colorsList = [''];
        }

        let targetVal = (valueSource === 'system' ? m.system_code : m.factory_code) || m.system_code || '0000000';
        let formattedValue = String(targetVal).trim();
        if (valueSource === 'system') {
            if (!formattedValue.toUpperCase().startsWith('S')) formattedValue = 'S' + formattedValue;
        } else {
            if (!formattedValue.toUpperCase().startsWith('F')) formattedValue = 'F' + formattedValue;
        }

        const baseLabel = {
            name: m.name,
            factory_code: m.factory_code,
            system_code: m.system_code,
            price: m.price,
            sizesStr: getModelSizesString(m),
            value: formattedValue
        };

        if (qtyMode === 'by_color') {
            const copiesCount = colorsList.length;
            if (colorDist === 'separate') {
                colorsList.forEach(color => {
                    const hasCol = showColors && color;
                    const codeDisplay = colorInline && hasCol 
                        ? `${formattedValue} - ${color}` 
                        : formattedValue;
                    labelsToPrint.push({
                        ...baseLabel,
                        codeStr: codeDisplay,
                        colorStr: colorInline ? '' : (showColors ? color : '')
                    });
                });
            } else {
                const allColorsJoined = showColors && hasColors ? colorsList.join('، ') : '';
                for (let i = 0; i < copiesCount; i++) {
                    labelsToPrint.push({
                        ...baseLabel,
                        codeStr: formattedValue,
                        colorStr: allColorsJoined
                    });
                }
            }
        } else {
            const copiesCount = Math.max(1, fixedQty);
            if (colorDist === 'separate') {
                colorsList.forEach(color => {
                    const hasCol = showColors && color;
                    const codeDisplay = colorInline && hasCol 
                        ? `${formattedValue} - ${color}` 
                        : formattedValue;
                    for (let i = 0; i < copiesCount; i++) {
                        labelsToPrint.push({
                            ...baseLabel,
                            codeStr: codeDisplay,
                            colorStr: colorInline ? '' : (showColors ? color : '')
                        });
                    }
                });
            } else {
                const allColorsJoined = showColors && hasColors ? colorsList.join('، ') : '';
                for (let i = 0; i < copiesCount; i++) {
                    labelsToPrint.push({
                        ...baseLabel,
                        codeStr: formattedValue,
                        colorStr: allColorsJoined
                    });
                }
            }
        }
    });

    const labelsDataJson = JSON.stringify(labelsToPrint);

    const printHtml = `
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <title>طباعة الباركود</title>
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;700&display=swap');
        @page {
            size: ${paperW}cm ${paperH}cm;
            margin: 0;
        }
        body {
            margin: 0;
            padding: 0;
            background: white;
            color: black;
            font-family: 'Tajawal', sans-serif;
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
        }
        .barcode-label {
            width: ${paperW}cm;
            height: ${paperH}cm;
            page-break-after: always;
            box-sizing: border-box;
            padding: ${Math.min(paperW, paperH) * 0.08}cm;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            align-items: center;
            text-align: center;
            overflow: hidden;
        }
        .model-name {
            font-size: ${fontName}px;
            font-weight: 700;
            width: 100%;
            display: ${showName ? '-webkit-box' : 'none'};
            -webkit-line-clamp: 2;
            line-clamp: 2;
            -webkit-box-orient: vertical;
            overflow: hidden;
            text-overflow: ellipsis;
            line-height: 1.2;
            text-align: center;
            word-break: break-word;
        }
        .model-code {
            font-size: ${fontCode}px;
            font-weight: ${boldCode ? '700' : '400'};
            color: #000;
            margin-top: 1px;
            font-family: monospace;
            display: ${showCode ? 'block' : 'none'};
        }
        .model-sizes {
            font-size: ${fontDetails}px;
            font-weight: 700;
            color: #000;
            margin-top: 1px;
            display: ${showSizes ? 'block' : 'none'};
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .model-colors {
            font-size: ${fontDetails}px;
            font-weight: 700;
            color: #000;
            margin-top: 1px;
            display: ${showColors ? 'block' : 'none'};
            width: 100%;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .code-container {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            width: 100%;
            height: ${paperH * 0.45}cm;
            margin: 2px 0;
        }
        .code-container svg, .code-container img {
            max-width: 100%;
            max-height: 100%;
            display: block;
        }
        .model-price {
            font-size: ${fontPrice}px;
            font-weight: 700;
            margin-top: 1px;
            border-top: 1px dashed #000;
            width: 100%;
            padding-top: ${fontPrice * 0.2}px;
            display: ${showPrice ? 'block' : 'none'};
        }
    </style>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/jsbarcode/3.11.6/JsBarcode.all.min.js"></script>
    <script src="https://cdnjs.cloudflare.com/ajax/libs/qrcode/1.4.4/qrcode.min.js"></script>
</head>
<body>
    <div id="labels-container"></div>

    <script>
        const labels = ${labelsDataJson};
        const codeType = "${codeType}";

        const container = document.getElementById('labels-container');
        const qrPromises = [];
        
        labels.forEach((lbl, idx) => {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'barcode-label';
            
            labelDiv.innerHTML = '<div>' +
                '<div class="model-name">' + lbl.name + '</div>' +
                '<div class="model-code">' + (lbl.codeStr || lbl.factory_code || lbl.system_code || '') + '</div>' +
                (lbl.sizesStr ? '<div class="model-sizes">' + lbl.sizesStr + '</div>' : '') +
                (lbl.colorStr ? '<div class="model-colors">' + lbl.colorStr + '</div>' : '') +
            '</div>' +
            '<div class="code-container">' +
                (codeType === 'barcode' 
                    ? '<svg id="barcode-' + idx + '"></svg>' 
                    : '<img id="qrcode-' + idx + '" src="">'
                ) +
            '</div>' +
            '<div class="model-price">' + lbl.price + ' ج.م</div>';
            
            container.appendChild(labelDiv);

            if (codeType === 'barcode') {
                try {
                    JsBarcode("#barcode-" + idx, lbl.value, {
                        format: "CODE128",
                        width: 2.0,
                        height: 65,
                        displayValue: false,
                        margin: 0
                    });
                } catch(e) {
                    console.error("JsBarcode failed for", lbl.value, e);
                }
            } else if (codeType === 'qrcode') {
                if (typeof QRCode !== 'undefined') {
                    const promise = QRCode.toDataURL(lbl.value, { width: 250, margin: 1 })
                        .then(url => {
                            const img = document.getElementById('qrcode-' + idx);
                            if (img) img.src = url;
                        })
                        .catch(err => {
                            console.error("Local QRCode generate failed, falling back:", err);
                            const img = document.getElementById('qrcode-' + idx);
                            if (img) img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(lbl.value);
                        });
                    qrPromises.push(promise);
                } else {
                    const img = document.getElementById('qrcode-' + idx);
                    if (img) img.src = 'https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=' + encodeURIComponent(lbl.value);
                }
            }
        });

        window.onload = function() {
            Promise.all(qrPromises).then(() => {
                setTimeout(() => {
                    window.focus();
                    window.print();
                }, 800);
            });
        };
    </script>
</body>
</html>
    `;

    // Print inside an iframe
    let iframe = document.getElementById('print-barcode-iframe');
    if (iframe) {
        iframe.remove();
    }
    iframe = document.createElement('iframe');
    iframe.id = 'print-barcode-iframe';
    iframe.style.position = 'fixed';
    iframe.style.right = '-9999px';
    iframe.style.bottom = '-9999px';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = 'none';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(printHtml);
    doc.close();

    closeBulkBarcodeModal();
};

// =========================================================================
// 🌟 8. إدارة وحفظ قوالب تصميم الباركود 🌟
// =========================================================================

// القوالب الافتراضية للسيستم
const DEFAULT_BARCODE_TEMPLATES = {
    "default_4_5": {
        name: "قالب افتراضي 4×5 سم 🏷️",
        paperW: 4,
        paperH: 5,
        fontName: 11,
        fontCode: 10,
        fontDetails: 9,
        fontPrice: 12,
        boldCode: true,
        colorInline: true,
        sortOrder: "table",
        showName: true,
        showCode: true,
        showSizes: true,
        showPrice: true,
        codeType: "barcode",
        valueSource: "factory",
        qtyMode: "fixed",
        fixedQty: 1,
        colorDist: "separate",
        showColors: true,
        skipZeroStockColors: true
    },
    "small_3_4": {
        name: "قالب صغير 3×4 سم 🏷️",
        paperW: 3,
        paperH: 4,
        fontName: 9,
        fontCode: 8,
        fontDetails: 7,
        fontPrice: 10,
        boldCode: true,
        colorInline: true,
        sortOrder: "table",
        showName: true,
        showCode: true,
        showSizes: false,
        showPrice: true,
        codeType: "barcode",
        valueSource: "factory",
        qtyMode: "fixed",
        fixedQty: 1,
        colorDist: "separate",
        showColors: true,
        skipZeroStockColors: true
    },
    "qr_standard_5_5": {
        name: "قالب QR مربع 5×5 سم 🔳",
        paperW: 5,
        paperH: 5,
        fontName: 12,
        fontCode: 11,
        fontDetails: 9,
        fontPrice: 13,
        boldCode: true,
        colorInline: true,
        sortOrder: "table",
        showName: true,
        showCode: true,
        showSizes: true,
        showPrice: true,
        codeType: "qrcode",
        valueSource: "system",
        qtyMode: "fixed",
        fixedQty: 1,
        colorDist: "separate",
        showColors: true,
        skipZeroStockColors: true
    }
};

window.initBarcodeTemplates = () => {
    let saved = {};
    try {
        const localData = localStorage.getItem('devo_barcode_templates');
        if (localData) {
            saved = JSON.parse(localData);
        } else {
            // Save defaults first time
            localStorage.setItem('devo_barcode_templates', JSON.stringify(DEFAULT_BARCODE_TEMPLATES));
            saved = DEFAULT_BARCODE_TEMPLATES;
        }
    } catch (e) {
        console.error("Failed to parse templates from localstorage", e);
        saved = DEFAULT_BARCODE_TEMPLATES;
    }

    const selectEl = document.getElementById('bulk-barcode-template-select');
    if (!selectEl) return;

    // Reset select except first custom option
    selectEl.innerHTML = '<option value="">-- إعدادات يدوية (مخصصة) --</option>';

    Object.keys(saved).forEach(key => {
        const opt = document.createElement('option');
        opt.value = key;
        opt.textContent = saved[key].name;
        selectEl.appendChild(opt);
    });

    // Hide trash button by default
    const trashBtn = document.getElementById('btn-delete-barcode-template');
    if (trashBtn) trashBtn.classList.add('hidden');
};

window.loadBarcodeTemplate = () => {
    const selectEl = document.getElementById('bulk-barcode-template-select');
    const selectedKey = selectEl.value;

    const trashBtn = document.getElementById('btn-delete-barcode-template');
    if (trashBtn) {
        if (selectedKey && !selectedKey.startsWith('default_') && !selectedKey.startsWith('small_') && !selectedKey.startsWith('qr_standard_')) {
            trashBtn.classList.remove('hidden');
        } else {
            trashBtn.classList.add('hidden');
        }
    }

    if (!selectedKey) return; // Custom mode

    let templates = {};
    try {
        templates = JSON.parse(localStorage.getItem('devo_barcode_templates')) || DEFAULT_BARCODE_TEMPLATES;
    } catch(e) {
        templates = DEFAULT_BARCODE_TEMPLATES;
    }

    const template = templates[selectedKey];
    if (!template) return;

    // Set values to inputs
    if (document.getElementById('bulk-barcode-type')) document.getElementById('bulk-barcode-type').value = template.codeType || 'barcode';
    if (document.getElementById('bulk-barcode-value-source')) document.getElementById('bulk-barcode-value-source').value = template.valueSource || 'factory';
    if (document.getElementById('bulk-barcode-sort-order')) document.getElementById('bulk-barcode-sort-order').value = template.sortOrder || 'table';
    if (document.getElementById('bulk-barcode-paper-w')) document.getElementById('bulk-barcode-paper-w').value = template.paperW || 4;
    if (document.getElementById('bulk-barcode-paper-h')) document.getElementById('bulk-barcode-paper-h').value = template.paperH || 5;
    
    if (document.getElementById('bulk-barcode-font-size-name')) document.getElementById('bulk-barcode-font-size-name').value = template.fontName || 11;
    if (document.getElementById('bulk-barcode-font-size-code')) document.getElementById('bulk-barcode-font-size-code').value = template.fontCode || 10;
    if (document.getElementById('bulk-barcode-font-size-details')) document.getElementById('bulk-barcode-font-size-details').value = template.fontDetails || 9;
    if (document.getElementById('bulk-barcode-font-size-price')) document.getElementById('bulk-barcode-font-size-price').value = template.fontPrice || 12;
    
    if (document.getElementById('bulk-barcode-bold-code')) document.getElementById('bulk-barcode-bold-code').checked = template.boldCode !== false;
    if (document.getElementById('bulk-barcode-color-inline')) document.getElementById('bulk-barcode-color-inline').checked = template.colorInline !== false;

    if (document.getElementById('bulk-barcode-show-name')) document.getElementById('bulk-barcode-show-name').checked = template.showName !== false;
    if (document.getElementById('bulk-barcode-show-code')) document.getElementById('bulk-barcode-show-code').checked = template.showCode !== false;
    if (document.getElementById('bulk-barcode-show-sizes')) document.getElementById('bulk-barcode-show-sizes').checked = template.showSizes !== false;
    if (document.getElementById('bulk-barcode-show-price')) document.getElementById('bulk-barcode-show-price').checked = template.showPrice !== false;
    
    if (document.getElementById('bulk-barcode-qty-mode')) document.getElementById('bulk-barcode-qty-mode').value = template.qtyMode || 'fixed';
    if (document.getElementById('bulk-barcode-fixed-qty')) document.getElementById('bulk-barcode-fixed-qty').value = template.fixedQty || 1;
    if (document.getElementById('bulk-barcode-color-dist')) document.getElementById('bulk-barcode-color-dist').value = template.colorDist || 'separate';
    if (document.getElementById('bulk-barcode-show-colors')) document.getElementById('bulk-barcode-show-colors').checked = template.showColors !== false;
    if (document.getElementById('bulk-barcode-skip-zero-stock-colors')) document.getElementById('bulk-barcode-skip-zero-stock-colors').checked = template.skipZeroStockColors !== false;

    // Toggle qty input state
    window.toggleBarcodeQtyInput();

    // Refresh live preview
    window.updateBarcodePreview();
};

window.saveBarcodeTemplate = () => {
    const nameInput = document.getElementById('bulk-barcode-template-name');
    const templateName = nameInput.value.trim();

    if (!templateName) {
        return showToast('الرجاء إدخال اسم للقالب أولاً', 'warning');
    }

    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem('devo_barcode_templates')) || {};
    } catch(e) {
        saved = {};
    }

    // Generate unique key
    const key = 'custom_' + Date.now();

    saved[key] = {
        name: templateName,
        codeType: document.getElementById('bulk-barcode-type')?.value || 'barcode',
        valueSource: document.getElementById('bulk-barcode-value-source')?.value || 'factory',
        sortOrder: document.getElementById('bulk-barcode-sort-order')?.value || 'table',
        paperW: parseFloat(document.getElementById('bulk-barcode-paper-w')?.value) || 4,
        paperH: parseFloat(document.getElementById('bulk-barcode-paper-h')?.value) || 5,
        fontName: parseInt(document.getElementById('bulk-barcode-font-size-name')?.value, 10) || 11,
        fontCode: parseInt(document.getElementById('bulk-barcode-font-size-code')?.value, 10) || 10,
        fontDetails: parseInt(document.getElementById('bulk-barcode-font-size-details')?.value, 10) || 9,
        fontPrice: parseInt(document.getElementById('bulk-barcode-font-size-price')?.value, 10) || 12,
        boldCode: document.getElementById('bulk-barcode-bold-code')?.checked !== false,
        colorInline: document.getElementById('bulk-barcode-color-inline')?.checked !== false,
        showName: document.getElementById('bulk-barcode-show-name')?.checked !== false,
        showCode: document.getElementById('bulk-barcode-show-code')?.checked !== false,
        showSizes: document.getElementById('bulk-barcode-show-sizes')?.checked !== false,
        showPrice: document.getElementById('bulk-barcode-show-price')?.checked !== false,
        qtyMode: document.getElementById('bulk-barcode-qty-mode')?.value || 'fixed',
        fixedQty: parseInt(document.getElementById('bulk-barcode-fixed-qty')?.value, 10) || 1,
        colorDist: document.getElementById('bulk-barcode-color-dist')?.value || 'separate',
        showColors: document.getElementById('bulk-barcode-show-colors')?.checked !== false,
        skipZeroStockColors: document.getElementById('bulk-barcode-skip-zero-stock-colors')?.checked !== false
    };

    localStorage.setItem('devo_barcode_templates', JSON.stringify(saved));
    nameInput.value = ''; // clear input

    // Reinitialize select dropdown
    window.initBarcodeTemplates();

    // Select the newly created template
    const selectEl = document.getElementById('bulk-barcode-template-select');
    if (selectEl) {
        selectEl.value = key;
        window.loadBarcodeTemplate();
    }

    showToast(`تم حفظ قالب الطباعة "${templateName}" بنجاح`, 'success');
};

window.deleteBarcodeTemplate = () => {
    const selectEl = document.getElementById('bulk-barcode-template-select');
    const selectedKey = selectEl.value;

    if (!selectedKey) return;
    if (selectedKey.startsWith('default_') || selectedKey.startsWith('small_') || selectedKey.startsWith('qr_standard_')) {
        return showToast('لا يمكن حذف القوالب الافتراضية الخاصة بالنظام', 'error');
    }

    let saved = {};
    try {
        saved = JSON.parse(localStorage.getItem('devo_barcode_templates')) || {};
    } catch(e) {
        saved = {};
    }

    const templateName = saved[selectedKey]?.name || '';
    delete saved[selectedKey];

    localStorage.setItem('devo_barcode_templates', JSON.stringify(saved));

    // Reset dropdown and select custom
    window.initBarcodeTemplates();
    selectEl.value = '';
    window.loadBarcodeTemplate();

    showToast(`تم حذف قالب "${templateName}" بنجاح`, 'success');
};

// =========================================================================
// 🌟 9. مولّد الباركود والـ QR المستقل (Standalone Generator) 🌟
// =========================================================================

let generatorState = {
    selectedModel: null,
    source: 'factory', // 'factory', 'system', 'link', 'custom'
    type: 'barcode', // 'barcode', 'qrcode'
    codeValue: '',
    transparentBg: true,
    centerLogo: false,
    color: '#000000'
};

window.switchBarcodeSubTab = (tab) => {
    const btnBulk = document.getElementById('btn-subtab-bulk');
    const btnGen = document.getElementById('btn-subtab-generator');
    const subtabBulk = document.getElementById('barcode-subtab-bulk');
    const subtabGen = document.getElementById('barcode-subtab-generator');

    if (tab === 'generator') {
        if (subtabBulk) subtabBulk.classList.add('hidden');
        if (subtabGen) subtabGen.classList.remove('hidden');

        if (btnBulk) {
            btnBulk.className = "flex-1 py-3 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 bg-devo-black text-devo-muted hover:text-white border border-transparent";
        }
        if (btnGen) {
            btnGen.className = "flex-1 py-3 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 bg-devo-orange text-white shadow-md";
        }

        window.initStandaloneGenerator();
    } else {
        if (subtabGen) subtabGen.classList.add('hidden');
        if (subtabBulk) subtabBulk.classList.remove('hidden');

        if (btnGen) {
            btnGen.className = "flex-1 py-3 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 bg-devo-black text-devo-muted hover:text-white border border-transparent";
        }
        if (btnBulk) {
            btnBulk.className = "flex-1 py-3 px-4 rounded-lg font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-2 bg-devo-orange text-white shadow-md";
        }
    }
};

window.initStandaloneGenerator = async () => {
    try {
        await loadPrintingLibraries();
    } catch(e) {
        console.error("Error loading barcode libs:", e);
    }

    if (!barcodeAllModels || barcodeAllModels.length === 0) {
        fetchBarcodeModels().then(() => {
            window.updateStandaloneGenerator();
        });
    } else {
        window.updateStandaloneGenerator();
    }
};

window.onGeneratorModelSearchInput = (field) => {
    const suggestionsEl = document.getElementById('gen-model-suggestions');
    if (!suggestionsEl) return;

    let term = '';
    if (field === 'factory') term = document.getElementById('gen-model-factory-input')?.value.toLowerCase().trim() || '';
    if (field === 'system') term = document.getElementById('gen-model-system-input')?.value.toLowerCase().trim() || '';
    if (field === 'name') term = document.getElementById('gen-model-name-input')?.value.toLowerCase().trim() || '';

    if (!term) {
        suggestionsEl.classList.add('hidden');
        return;
    }

    const matches = barcodeAllModels.filter(m => {
        if (field === 'factory') return m.factory_code?.toLowerCase().includes(term);
        if (field === 'system') return m.system_code?.toLowerCase().includes(term);
        if (field === 'name') return m.name?.toLowerCase().includes(term);
        return false;
    }).slice(0, 10);

    if (matches.length === 0) {
        suggestionsEl.innerHTML = `<div class="p-2 text-center text-xs text-devo-muted">لا يوجد موديل مطابق</div>`;
        suggestionsEl.classList.remove('hidden');
        return;
    }

    suggestionsEl.innerHTML = matches.map(m => `
        <div onclick="selectGeneratorModel('${m.id}')" class="p-2 hover:bg-devo-black rounded cursor-pointer transition-colors flex justify-between items-center text-xs">
            <span class="font-bold text-white">${m.name}</span>
            <div class="flex items-center gap-2 text-[11px] font-mono text-devo-orange">
                ${m.factory_code ? `<span>مصنع: F${m.factory_code}</span>` : ''}
                ${m.system_code ? `<span>سيستم: S${m.system_code}</span>` : ''}
            </div>
        </div>
    `).join('');
    suggestionsEl.classList.remove('hidden');
};

window.selectGeneratorModel = (modelId) => {
    const model = barcodeAllModels.find(m => m.id === modelId);
    if (!model) return;

    generatorState.selectedModel = model;

    const facInput = document.getElementById('gen-model-factory-input');
    const sysInput = document.getElementById('gen-model-system-input');
    const nameInput = document.getElementById('gen-model-name-input');
    const suggestionsEl = document.getElementById('gen-model-suggestions');
    const codeInput = document.getElementById('gen-code-input');

    if (facInput) facInput.value = model.factory_code || '';
    if (sysInput) sysInput.value = model.system_code || '';
    if (nameInput) nameInput.value = model.name || '';
    if (suggestionsEl) suggestionsEl.classList.add('hidden');

    if (codeInput) {
        if (generatorState.source === 'factory') codeInput.value = model.factory_code || '';
        else if (generatorState.source === 'system') codeInput.value = model.system_code || '';
        else codeInput.value = model.name || '';
    }

    window.updateStandaloneGenerator();
};

window.clearGeneratorModelSelection = () => {
    generatorState.selectedModel = null;

    const facInput = document.getElementById('gen-model-factory-input');
    const sysInput = document.getElementById('gen-model-system-input');
    const nameInput = document.getElementById('gen-model-name-input');
    const codeInput = document.getElementById('gen-code-input');
    const suggestionsEl = document.getElementById('gen-model-suggestions');

    if (facInput) facInput.value = '';
    if (sysInput) sysInput.value = '';
    if (nameInput) nameInput.value = '';
    if (codeInput) codeInput.value = '';
    if (suggestionsEl) suggestionsEl.classList.add('hidden');

    window.updateStandaloneGenerator();
};

window.setGeneratorSource = (source) => {
    generatorState.source = source;

    const sources = ['factory', 'system', 'link', 'custom'];
    sources.forEach(src => {
        const btn = document.getElementById(`gen-src-btn-${src}`);
        if (!btn) return;
        if (src === source) {
            btn.className = "gen-src-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-devo-orange/20 border-devo-orange text-devo-orange";
        } else {
            btn.className = "gen-src-btn py-2.5 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 bg-devo-black border-devo-gray text-devo-muted hover:text-white";
        }
    });

    const prefixBadge = document.getElementById('gen-code-prefix-badge');
    const codeInput = document.getElementById('gen-code-input');

    if (source === 'factory') {
        if (prefixBadge) {
            prefixBadge.textContent = 'F';
            prefixBadge.classList.remove('hidden');
        }
        if (codeInput) codeInput.placeholder = "أدخل كود المصنع فقط (مثال: 5556)...";
    } else if (source === 'system') {
        if (prefixBadge) {
            prefixBadge.textContent = 'S';
            prefixBadge.classList.remove('hidden');
        }
        if (codeInput) codeInput.placeholder = "أدخل كود السيستم فقط (مثال: 5556)...";
    } else if (source === 'link') {
        if (prefixBadge) prefixBadge.classList.add('hidden');
        if (codeInput) codeInput.placeholder = "أدخل الرابط المباشر (https://...)...";
    } else {
        if (prefixBadge) prefixBadge.classList.add('hidden');
        if (codeInput) codeInput.placeholder = "أدخل أي نص مخصص...";
    }

    if (generatorState.selectedModel && codeInput) {
        if (source === 'factory') codeInput.value = generatorState.selectedModel.factory_code || '';
        else if (source === 'system') codeInput.value = generatorState.selectedModel.system_code || '';
    }

    window.updateStandaloneGenerator();
};

window.setGeneratorType = (type) => {
    generatorState.type = type;

    const btnQrcode = document.getElementById('gen-type-btn-qrcode');
    const btnBarcode = document.getElementById('gen-type-btn-barcode');
    const logoLabel = document.getElementById('gen-logo-checkbox-label');

    if (type === 'qrcode') {
        if (btnQrcode) btnQrcode.className = "gen-type-btn py-3 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 bg-devo-orange border-devo-orange text-white shadow-md";
        if (btnBarcode) btnBarcode.className = "gen-type-btn py-3 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 bg-devo-black border-devo-gray text-devo-muted hover:text-white";
        if (logoLabel) logoLabel.classList.remove('opacity-50', 'pointer-events-none');
    } else {
        if (btnBarcode) btnBarcode.className = "gen-type-btn py-3 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 bg-devo-orange border-devo-orange text-white shadow-md";
        if (btnQrcode) btnQrcode.className = "gen-type-btn py-3 px-4 rounded-xl border text-sm font-bold transition-all flex items-center justify-center gap-2 bg-devo-black border-devo-gray text-devo-muted hover:text-white";
        if (logoLabel) logoLabel.classList.add('opacity-50', 'pointer-events-none');
    }

    window.updateStandaloneGenerator();
};

function getEffectiveEncodedCode() {
    const rawVal = document.getElementById('gen-code-input')?.value.trim() || '';
    if (!rawVal) {
        return generatorState.source === 'factory' ? 'F101' : (generatorState.source === 'system' ? 'S101' : '101');
    }

    if (generatorState.source === 'factory') {
        if (rawVal.toUpperCase().startsWith('F')) return rawVal.toUpperCase();
        return 'F' + rawVal;
    } else if (generatorState.source === 'system') {
        if (rawVal.toUpperCase().startsWith('S')) return rawVal.toUpperCase();
        return 'S' + rawVal;
    } else {
        return rawVal;
    }
}

window.updateStandaloneGenerator = () => {
    const effectiveCode = getEffectiveEncodedCode();
    const lengthBadge = document.getElementById('gen-code-length-badge');
    if (lengthBadge) {
        lengthBadge.textContent = `${effectiveCode.length} حرف (${effectiveCode})`;
    }

    const color = document.getElementById('gen-code-color')?.value || '#000000';
    const isTransparent = document.getElementById('gen-transparent-bg')?.checked ?? true;
    const centerLogo = document.getElementById('gen-center-logo')?.checked ?? false;

    const barcodeSvg = document.getElementById('gen-barcode-svg');
    const qrcodeImg = document.getElementById('gen-qrcode-img');
    const previewCard = document.getElementById('gen-preview-card');

    if (previewCard) {
        if (isTransparent) {
            previewCard.className = "bg-transparent p-6 rounded-xl shadow-2xl max-w-full flex flex-col items-center justify-center transition-all duration-300 border border-dashed border-devo-gray/50";
        } else {
            previewCard.className = "bg-white p-6 rounded-xl shadow-2xl max-w-full flex flex-col items-center justify-center transition-all duration-300";
        }
    }

    if (generatorState.type === 'barcode') {
        if (qrcodeImg) qrcodeImg.classList.add('hidden');
        if (barcodeSvg) {
            barcodeSvg.classList.remove('hidden');
            try {
                if (typeof JsBarcode !== 'undefined') {
                    JsBarcode(barcodeSvg, effectiveCode, {
                        format: "CODE128",
                        width: 3.5,
                        height: 140,
                        lineColor: color,
                        background: isTransparent ? "transparent" : "#ffffff",
                        displayValue: true,
                        fontSize: 18,
                        textMargin: 8,
                        margin: 15
                    });
                }
            } catch(e) {
                console.error("Standalone JsBarcode error:", e);
            }
        }
    } else {
        if (barcodeSvg) barcodeSvg.classList.add('hidden');
        if (qrcodeImg) {
            qrcodeImg.classList.remove('hidden');
            if (typeof QRCode !== 'undefined') {
                QRCode.toDataURL(effectiveCode, {
                    width: 350,
                    margin: 1,
                    color: {
                        dark: color,
                        light: isTransparent ? '#00000000' : '#FFFFFF'
                    }
                }).then(url => {
                    qrcodeImg.src = url;
                }).catch(err => {
                    console.error("Standalone QRCode error:", err);
                    qrcodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(effectiveCode)}`;
                });
            } else {
                qrcodeImg.src = `https://api.qrserver.com/v1/create-qr-code/?size=350x350&data=${encodeURIComponent(effectiveCode)}`;
            }
        }
    }

    const dimBadge = document.getElementById('gen-preview-dimensions');
    if (dimBadge) {
        dimBadge.textContent = generatorState.type === 'barcode' ? '2560 × 1360 px' : '1360 × 1360 px';
    }
};

async function generateHighResCanvas() {
    const effectiveCode = getEffectiveEncodedCode();
    const color = document.getElementById('gen-code-color')?.value || '#000000';
    const isTransparent = document.getElementById('gen-transparent-bg')?.checked ?? true;

    const canvas = document.createElement('canvas');
    canvas.width = 2560;
    canvas.height = 1360;
    const ctx = canvas.getContext('2d');

    if (!isTransparent) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    if (generatorState.type === 'barcode') {
        const tempCanvas = document.createElement('canvas');
        if (typeof JsBarcode !== 'undefined') {
            JsBarcode(tempCanvas, effectiveCode, {
                format: "CODE128",
                width: 8,
                height: 500,
                lineColor: color,
                background: isTransparent ? "transparent" : "#ffffff",
                displayValue: true,
                fontSize: 48,
                textMargin: 20,
                margin: 40
            });
        }
        const aspect = tempCanvas.width / tempCanvas.height;
        let targetH = 900;
        let targetW = targetH * aspect;
        if (targetW > 2300) {
            targetW = 2300;
            targetH = targetW / aspect;
        }
        const x = (canvas.width - targetW) / 2;
        const y = (canvas.height - targetH) / 2;
        ctx.drawImage(tempCanvas, x, y, targetW, targetH);
    } else {
        const tempCanvas = document.createElement('canvas');
        if (typeof QRCode !== 'undefined') {
            await QRCode.toCanvas(tempCanvas, effectiveCode, {
                width: 1000,
                margin: 2,
                color: {
                    dark: color,
                    light: isTransparent ? '#00000000' : '#ffffff'
                }
            });
        }
        const size = 1000;
        const x = (canvas.width - size) / 2;
        const y = (canvas.height - size) / 2;
        ctx.drawImage(tempCanvas, x, y, size, size);
    }

    return canvas;
}

window.copyGeneratorImageToClipboard = async () => {
    try {
        const canvas = await generateHighResCanvas();
        canvas.toBlob(async (blob) => {
            if (!blob) return showToast('تعذر معالجة الصورة للنسخ', 'error');
            try {
                const item = new ClipboardItem({ 'image/png': blob });
                await navigator.clipboard.write([item]);
                showToast('تم نسخ صورة الباركود إلى الحافظة بنجاح! 📋', 'success');
            } catch (err) {
                console.error("Clipboard write error:", err);
                showToast('نسخ الصورة غير مدعوم مباشرة في هذا المتصفح، يمكنك تحميلها كـ PNG', 'warning');
            }
        });
    } catch (e) {
        console.error("Copy error:", e);
        showToast('حدث خطأ أثناء إنشاء الصورة للنسخ', 'error');
    }
};

window.downloadGeneratorImage = async (format) => {
    const effectiveCode = getEffectiveEncodedCode();
    const fileName = `barcode_${effectiveCode}.${format}`;

    if (format === 'svg' && generatorState.type === 'barcode') {
        const svgEl = document.getElementById('gen-barcode-svg');
        if (svgEl) {
            const svgData = new XMLSerializer().serializeToString(svgEl);
            const blob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            showToast(`تم تحميل ملف SVG بنجاح! 📐`, 'success');
            return;
        }
    }

    try {
        const canvas = await generateHighResCanvas();
        const url = canvas.toDataURL(`image/${format === 'svg' ? 'png' : format}`);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        showToast(`تم تحميل صورة ${format.toUpperCase()} بنجاح! 📥`, 'success');
    } catch(e) {
        console.error("Download error:", e);
        showToast('حدث خطأ أثناء تحميل الصورة', 'error');
    }
};
