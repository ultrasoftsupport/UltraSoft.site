import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog, showSubscriptionUpgradeModal } from '../../components/modal.js';
import { getCurrentTenantId, getTenantCreditRules, calculateOperationCredits, deductTenantCredits } from '../../services/tenant_service.js';
import { logAuditEvent } from '../../services/audit_service.js';
import { getExcelProfiles, getActiveExcelProfile, parseColorsDataWithProfile } from '../../services/excel_templates_service.js';

let currentTab = 'categories'; 
let allData = []; 
let isInitialized = false;

export async function initDefinitionsView() {
    if (isInitialized) return;

    const defForm = document.getElementById('def-action-form');
    if (defForm) {
        defForm.addEventListener('submit', handleSaveDefinition);
    }

    await loadCurrentTabData();
    isInitialized = true;
}

window.switchDefTab = async (tabId) => {
    currentTab = tabId;
    
    document.querySelectorAll('[data-def-tab]').forEach(btn => {
        btn.classList.toggle('active-tab', btn.dataset.defTab === tabId);
    });

    const searchInput = document.getElementById('def-search-input');
    if (searchInput) searchInput.value = '';
    
    // 🌟 إزالة الزر القديم لمنع التكرار
    const oldBtn = document.getElementById('btn-import-colors');
    if (oldBtn) oldBtn.remove();

    // 🌟 البحث عن زر "إضافة عنصر جديد" لتحديد المكان الصحيح
    const addNewBtn = document.querySelector('button[onclick="openDefinitionModalFromCurrent()"]');

    if (tabId === 'colors' && addNewBtn) {
        const btnHtml = `<button id="btn-import-colors" onclick="openColorExcelModal()" class="bg-devo-success/10 hover:bg-devo-success text-devo-success hover:text-white px-4 py-2.5 rounded-xl font-bold transition-all flex items-center gap-2 border border-devo-success/20"><i class="ph ph-file-xls text-xl"></i> استيراد (Excel)</button>`;
        
        // 🌟 إضافته "قبل" زر الإضافة (بجانبه وليس بداخله) 🌟
        addNewBtn.insertAdjacentHTML('beforebegin', btnHtml);
    }
    
    await loadCurrentTabData();
};

window.handleDefSearch = () => {
    const term = document.getElementById('def-search-input').value.toLowerCase().trim();
    const filtered = allData.filter(item => 
        item.name.toLowerCase().includes(term) || (item.color_code && String(item.color_code).toLowerCase().includes(term))
    );
    renderTable(filtered);
};

export async function loadCurrentTabData() {
    const tableBody = document.getElementById('def-table-body');
    const emptyState = document.getElementById('def-empty-state');
    
    tableBody.innerHTML = `<tr><td colspan="4" class="p-10 text-center"><i class="ph ph-spinner animate-spin text-3xl text-devo-orange"></i></td></tr>`;
    emptyState.classList.add('hidden');

    const currentTenantId = getCurrentTenantId();
    let query = supabase.from(currentTab).select('*');
    if (currentTenantId) {
        query = query.eq('tenant_id', currentTenantId);
    }
    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
        showToast(`خطأ في جلب البيانات: ${error.message}`, 'error');
        return;
    }

    allData = data; 
    renderTable(data);
}

function renderTable(data) {
    const tableBody = document.getElementById('def-table-body');
    const emptyState = document.getElementById('def-empty-state');

    if (data.length === 0) {
        tableBody.innerHTML = '';
        emptyState.classList.remove('hidden');
        return;
    }

    emptyState.classList.add('hidden');
    tableBody.innerHTML = data.map((item, index) => `
        <tr class="hover:bg-devo-black/50 transition-colors group border-b border-devo-gray/50">
            <td class="p-4 text-center text-devo-muted font-mono text-sm">${index + 1}</td>
            <td class="p-4 font-bold text-devo-text">
                ${currentTab === 'colors' && item.color_code ? `<span class="bg-devo-gray text-white px-2 py-0.5 rounded text-[10px] ml-2 font-mono">${item.color_code}</span>` : ''}
                ${item.name}
            </td>
            <td class="p-4 text-devo-muted text-xs">${new Date(item.created_at).toLocaleDateString('ar-EG')}</td>
            <td class="p-4">
                <div class="flex justify-center gap-2">
                    <button onclick="openDefinitionModal('${currentTab}', '${item.id}', '${item.name}', '${item.color_code || ''}')" 
                        class="w-9 h-9 rounded-lg flex items-center justify-center text-devo-info hover:bg-devo-info/10 transition-all" title="تعديل">
                        <i class="ph ph-pencil-simple text-xl"></i>
                    </button>
                    <button onclick="handleDeleteDefinition('${currentTab}', '${item.id}')" 
                        class="w-9 h-9 rounded-lg flex items-center justify-center text-devo-error hover:bg-devo-error/10 transition-all" title="حذف">
                        <i class="ph ph-trash text-xl"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// --- دالة الفتح المحدثة ---
window.openDefinitionModal = async (table, id = null, name = '', code = '') => {
    const modal = document.getElementById('def-action-modal');
    const modalContent = document.getElementById('def-modal-content');
    const titleEl = document.getElementById('def-modal-title');
    const inputName = document.getElementById('def-item-name');
    const inputCode = document.getElementById('def-item-code');
    const codeWrapper = document.getElementById('def-code-wrapper');
    const sizesWrapper = document.getElementById('def-sizes-wrapper'); // العنصر الجديد
    const sizesContainer = document.getElementById('def-sizes-container'); // حاوية المقاسات
    
    document.getElementById('def-target-table').value = table;
    document.getElementById('def-item-id').value = id || '';
    inputName.value = name;
    
    if (table === 'colors') {
        codeWrapper.classList.remove('hidden');
        inputCode.value = code;
    } else {
        codeWrapper.classList.add('hidden');
        inputCode.value = '';
    }

    // 🌟 معالجة إظهار المقاسات إذا كانت التابة هي الفئات العمرية 🌟
    if (table === 'classes') {
        sizesWrapper.classList.remove('hidden');
        sizesContainer.innerHTML = '<div class="text-devo-muted text-xs p-2"><i class="ph ph-spinner animate-spin"></i> جاري جلب المقاسات...</div>';
        
        // جلب المقاسات الخاصة بالمصنع نفسه
        const currentTenantId = getCurrentTenantId();
        let sizesQuery = supabase.from('sizes').select('id, name');
        if (currentTenantId) {
            sizesQuery = sizesQuery.eq('tenant_id', currentTenantId);
        }
        const { data: allSizes } = await sizesQuery;
        currentClassAllSizes = allSizes || [];
        currentClassOrderedSizes = [];

        // إذا كنا نعدل فئة موجودة، نجلب مقاساتها المرتبطة مع مراعاة sort_order
        if (id) {
            const { data: classSizes } = await supabase
                .from('class_sizes')
                .select('size_id, sort_order')
                .eq('class_id', id)
                .order('sort_order', { ascending: true });
                
            if (classSizes && classSizes.length > 0) {
                currentClassOrderedSizes = classSizes.map(cs => cs.size_id);
            }
        }

        renderClassSizesUI();
    } else {
        sizesWrapper.classList.add('hidden');
        sizesContainer.innerHTML = '';
        currentClassAllSizes = [];
        currentClassOrderedSizes = [];
    }
    
    titleEl.textContent = id ? `تعديل البيانات` : `إضافة جديد إلى ${getTabNameAr(table)}`;
    
    modal.classList.remove('hidden');
    requestAnimationFrame(() => {
        modal.classList.remove('opacity-0');
        modalContent.classList.remove('scale-95');
        inputName.focus();
    });
};

// إدارة تحديد وترتيب المقاسات داخل الفئة العمرية
let currentClassAllSizes = [];
let currentClassOrderedSizes = [];

window.toggleClassSize = (sizeId) => {
    const idx = currentClassOrderedSizes.indexOf(sizeId);
    if (idx > -1) {
        currentClassOrderedSizes.splice(idx, 1);
    } else {
        currentClassOrderedSizes.push(sizeId);
    }
    renderClassSizesUI();
};

window.moveClassSizeOrder = (fromIdx, toIdx) => {
    if (toIdx < 0 || toIdx >= currentClassOrderedSizes.length) return;
    const item = currentClassOrderedSizes.splice(fromIdx, 1)[0];
    currentClassOrderedSizes.splice(toIdx, 0, item);
    renderClassSizesUI();
};

function renderClassSizesUI() {
    const container = document.getElementById('def-sizes-container');
    if (!container) return;

    const sizesMap = {};
    currentClassAllSizes.forEach(s => { sizesMap[s.id] = s.name; });

    let checkboxesHtml = currentClassAllSizes.map(s => {
        const isChecked = currentClassOrderedSizes.includes(s.id);
        const orderIdx = isChecked ? (currentClassOrderedSizes.indexOf(s.id) + 1) : null;
        return `
            <label class="flex items-center gap-1.5 bg-devo-dark border ${isChecked ? 'border-devo-orange bg-devo-orange/10' : 'border-devo-gray'} px-2.5 py-1.5 rounded-lg cursor-pointer text-xs transition-all hover:border-devo-orange select-none">
                <input type="checkbox" onchange="window.toggleClassSize('${s.id}')" ${isChecked ? 'checked' : ''} class="accent-devo-orange"> 
                <span class="text-white font-medium">${s.name}</span>
                ${orderIdx ? `<span class="bg-devo-orange text-white text-[10px] font-mono px-1 rounded font-bold">#${orderIdx}</span>` : ''}
            </label>
        `;
    }).join('');

    let orderListHtml = '';
    if (currentClassOrderedSizes.length > 0) {
        orderListHtml = `
            <div class="mt-3 pt-3 border-t border-devo-gray/60 w-full">
                <div class="flex items-center justify-between mb-2">
                    <span class="text-[11px] font-bold text-devo-orange flex items-center gap-1">
                        <i class="ph ph-sort-ascending"></i> ترتيب المقاسات (${currentClassOrderedSizes.length} محدد):
                    </span>
                    <span class="text-[10px] text-devo-muted">استخدم الأسهم لتحديد الترتيب المنطقي</span>
                </div>
                <div class="flex flex-col gap-1.5 max-h-44 overflow-y-auto pr-1 custom-scrollbar">
                    ${currentClassOrderedSizes.map((sizeId, idx) => `
                        <div class="flex items-center justify-between bg-devo-black/70 border border-devo-gray/60 px-3 py-1.5 rounded-lg text-xs group hover:border-devo-orange/50 transition-colors">
                            <div class="flex items-center gap-2">
                                <span class="w-5 h-5 rounded bg-devo-orange/20 text-devo-orange font-bold text-[10px] flex items-center justify-center font-mono">#${idx + 1}</span>
                                <span class="font-bold text-white">${sizesMap[sizeId] || sizeId}</span>
                            </div>
                            <div class="flex items-center gap-1">
                                <button type="button" onclick="window.moveClassSizeOrder(${idx}, ${idx - 1})" ${idx === 0 ? 'disabled' : ''} class="w-6 h-6 rounded bg-devo-dark hover:bg-devo-orange disabled:opacity-20 disabled:hover:bg-devo-dark text-white flex items-center justify-center text-xs transition-colors" title="تقديم">
                                    <i class="ph ph-caret-up"></i>
                                </button>
                                <button type="button" onclick="window.moveClassSizeOrder(${idx}, ${idx + 1})" ${idx === currentClassOrderedSizes.length - 1 ? 'disabled' : ''} class="w-6 h-6 rounded bg-devo-dark hover:bg-devo-orange disabled:opacity-20 disabled:hover:bg-devo-dark text-white flex items-center justify-center text-xs transition-colors" title="تأخير">
                                    <i class="ph ph-caret-down"></i>
                                </button>
                                <button type="button" onclick="window.toggleClassSize('${sizeId}')" class="w-6 h-6 rounded bg-devo-dark hover:bg-devo-error text-devo-muted hover:text-white flex items-center justify-center text-xs transition-colors mr-1" title="إلغاء التحديد">
                                    <i class="ph ph-x"></i>
                                </button>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    container.innerHTML = `
        <div class="w-full">
            <div class="flex flex-wrap gap-1.5 p-2 bg-devo-black/40 border border-devo-gray/40 rounded-xl max-h-32 overflow-y-auto custom-scrollbar">
                ${checkboxesHtml}
            </div>
            ${orderListHtml}
        </div>
    `;
}

async function handleSaveDefinition(e) {
    e.preventDefault();
    
    const table = document.getElementById('def-target-table').value;
    const id = document.getElementById('def-item-id').value;
    const name = document.getElementById('def-item-name').value.trim();
    const code = document.getElementById('def-item-code').value.trim();
    const btn = document.getElementById('def-save-btn');
    const currentTenantId = getCurrentTenantId();

    if (!name) return;

    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري الحفظ...`;

    let payload = { tenant_id: currentTenantId, name };
    if (table === 'colors') {
        payload.color_code = code || null;
    }

    try {
        let savedId = id;
        
        // 1. حفظ الاسم (والكود إن وجد)
        if (id) {
            const { error } = await supabase.from(table).update(payload).eq('id', id);
            if (error) throw error;
        } else {
            const { data, error } = await supabase.from(table).insert([payload]).select().single();
            if (error) throw error;
            savedId = data.id;
        }

        // 🌟 2. حفظ المقاسات مرتبة في الجدول الوسيط إذا كنا في تاب الفئات العمرية 🌟
        if (table === 'classes') {
            // حذف القديم أولاً لمنع التكرار (في حالة التعديل)
            await supabase.from('class_sizes').delete().eq('class_id', savedId);
            
            // إدخال المقاسات الجديدة بترتيبها المحدد
            if (currentClassOrderedSizes.length > 0) {
                const classSizesPayload = currentClassOrderedSizes.map((sizeId, idx) => ({ 
                    tenant_id: currentTenantId, 
                    class_id: savedId, 
                    size_id: sizeId,
                    sort_order: idx + 1
                }));
                const { error: csErr } = await supabase.from('class_sizes').insert(classSizesPayload);
                if (csErr) {
                    // Fallback without sort_order if column does not exist yet in DB
                    const simplePayload = currentClassOrderedSizes.map(sizeId => ({ class_id: savedId, size_id: sizeId }));
                    await supabase.from('class_sizes').insert(simplePayload);
                }
            }
        }

        showToast(id ? 'تم تحديث البيانات بنجاح' : 'تمت الإضافة بنجاح', 'success');
        closeDefinitionModal();

        const tableLabels = {
            colors: 'لون',
            categories: 'تصنيف رئيسي',
            classifications_1: 'تصنيف 1',
            classifications_2: 'تصنيف 2',
            classes: 'فئة فرعية',
            sizes: 'مقاس'
        };
        const typeLabel = tableLabels[table] || 'تعريف';
        const actionText = id ? `تعديل ${typeLabel}` : `إضافة ${typeLabel} جديد`;

        await logAuditEvent({
            module: 'definitions',
            actionType: id ? 'update' : 'create',
            entityType: table,
            entityId: savedId,
            details: {
                notes: `${actionText} باسم "${name}"`,
                definition_name: name,
                type: typeLabel,
                table_name: table
            }
        });

        await loadCurrentTabData();
        if (typeof window.refreshAllSystemData === 'function') await window.refreshAllSystemData({ silent: true });

    } catch (error) {
        showToast('خطأ: قد يكون هذا الاسم أو الكود مسجلاً بالفعل', 'error');
        console.error(error);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<span>حفظ البيانات</span> <i class="ph ph-check-circle text-lg"></i>`;
    }
}

window.openDefinitionModalFromCurrent = () => {
    window.openDefinitionModal(currentTab);
};

window.closeDefinitionModal = () => {
    const modal = document.getElementById('def-action-modal');
    const modalContent = document.getElementById('def-modal-content');
    
    modal.classList.add('opacity-0');
    modalContent.classList.add('scale-95');
    setTimeout(() => {
        modal.classList.add('hidden');
        document.getElementById('def-action-form').reset();
    }, 300);
};


window.handleDeleteDefinition = async (table, id) => {
    const confirmed = await confirmDialog({
        title: 'تأكيد الحذف النهائي',
        message: 'هل أنت متأكد؟ لا يمكن حذف العناصر المرتبطة بموديلات أو فواتير مسجلة في النظام.',
        isDestructive: true,
        confirmText: 'نعم، احذف'
    });

    if (!confirmed) return;

    const { error } = await supabase.from(table).delete().eq('id', id);

    if (error) {
        if (error.code === '23503') {
            showToast('لا يمكن الحذف: هذا العنصر مستخدم حالياً في بيانات الموديلات', 'error');
        } else {
            showToast('حدث خطأ غير متوقع أثناء الحذف', 'error');
        }
    } else {
        showToast('تم الحذف بنجاح', 'success');
        const tableLabels = {
            colors: 'لون',
            categories: 'تصنيف رئيسي',
            classes: 'فئة فرعية',
            sizes: 'مقاس'
        };
        const typeLabel = tableLabels[table] || 'تعريف';
        await logAuditEvent({
            module: 'definitions',
            actionType: 'delete',
            entityType: table,
            entityId: id,
            details: {
                notes: `حذف ${typeLabel} من شجرة التعريفات الأساسية`,
                type: typeLabel,
                table_name: table
            }
        });
        await loadCurrentTabData();
        if (typeof window.refreshAllSystemData === 'function') await window.refreshAllSystemData({ silent: true });
    }
};

function getTabNameAr(tab) {
    const names = { 
        categories: 'التصنيفات الرئيسية', 
        classifications_1: 'تصنيف 1', 
        classifications_2: 'تصنيف 2', 
        classes: 'الفئات العمرية', 
        sizes: 'المقاسات', 
        colors: 'الألوان' 
    };
    return names[tab] || '';
}

// ==========================================
// --- Colors Excel Import Logic ---
// ==========================================

let pendingExcelColors = [];

window.openColorExcelModal = () => {
    document.getElementById('color-excel-step-1').classList.remove('hidden');
    document.getElementById('color-excel-step-2').classList.add('hidden');
    document.getElementById('color-excel-step-2').classList.remove('flex');
    document.getElementById('color-excel-file-input').value = '';
    document.getElementById('color-excel-file-name').textContent = 'اسحب الملف هنا أو اضغط للاختيار';
    pendingExcelColors = [];
    
    // تحميل القالب المفعل من الإعدادات وتحديث البطاقة
    getExcelProfiles().then(profiles => {
        const def = getActiveExcelProfile(profiles);
        const nameEl = document.getElementById('color-active-profile-name');
        if (nameEl && def) nameEl.textContent = def.name;

        const sel = document.getElementById('color-excel-profile-select');
        if (sel && profiles) {
            sel.innerHTML = profiles.map(p => `
                <option value="${p.id}" ${p.is_default ? 'selected' : ''}>
                    ${p.name} ${p.is_default ? '★ (افتراضي)' : ''}
                </option>
            `).join('');
            if (def) sel.value = def.id;
        }
    });

    const modal = document.getElementById('color-excel-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.closeColorExcelModal = () => {
    const modal = document.getElementById('color-excel-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

document.getElementById('color-excel-file-input')?.addEventListener('change', function(e) {
    const fileName = e.target.files[0]?.name || 'اسحب الملف هنا أو اضغط للاختيار';
    document.getElementById('color-excel-file-name').textContent = fileName;
});

window.processColorExcelPreview = async () => {
    const fileInput = document.getElementById('color-excel-file-input');
    const file = fileInput.files[0];
    
    if (!file) return showToast('الرجاء اختيار ملف إكسيل أولاً', 'warning');

    const btn = document.getElementById('color-excel-preview-btn');
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin text-xl"></i> جاري التحليل...`;

    try {
        const data = await readExcelFile(file);
        if (data.length === 0) throw new Error("الملف فارغ");

        const currentTenantId = getCurrentTenantId();
        let colorsQuery = supabase.from('colors').select('color_code');
        if (currentTenantId) {
            colorsQuery = colorsQuery.eq('tenant_id', currentTenantId);
        }
        const { data: existingColors } = await colorsQuery;
        const existingCodes = new Set((existingColors || []).map(c => String(c.color_code)));

        // جلب وتطبيق قالب المصنع المختار
        const profiles = await getExcelProfiles();
        const selectedProfileId = document.getElementById('color-excel-profile-select')?.value;
        const activeProfile = getActiveExcelProfile(profiles, selectedProfileId);

        const { newColors: parsedColors, duplicates: parsedDups } = parseColorsDataWithProfile(data, activeProfile, existingCodes);

        const newColors = parsedColors.map(c => ({
            tenant_id: currentTenantId,
            color_code: c.color_code,
            name: c.name
        }));
        const duplicates = parsedDups;

        pendingExcelColors = newColors;

        document.getElementById('color-excel-new-count').textContent = newColors.length;
        document.getElementById('color-excel-dup-count').textContent = duplicates.length;

        const dupWarning = document.getElementById('color-excel-dup-warning');
        const dupList = document.getElementById('color-excel-dup-list');
        
        if (duplicates.length > 0) {
            dupWarning.classList.remove('hidden');
            dupList.innerHTML = duplicates.map(d => `<div class="p-2 border-b border-devo-error/20 last:border-0"><span class="font-mono text-devo-error ml-2">[${d.code}]</span> <span class="text-white">${d.name}</span></div>`).join('');
        } else {
            dupWarning.classList.add('hidden');
        }

        const importBtn = document.getElementById('color-excel-import-btn');
        if (importBtn) {
            try {
                const creditRules = await getTenantCreditRules();
                const cost = calculateOperationCredits('excel_colors_import', newColors.length, creditRules);
                const costLabel = creditRules.is_unlimited ? 'مجاناً ⚡' : `${cost} ⚡`;
                importBtn.innerHTML = `<i class="ph ph-check-circle text-xl"></i> <span>تأكيد وحفظ الألوان الجديدة (${costLabel})</span>`;
            } catch (e) {
                importBtn.innerHTML = `<i class="ph ph-check-circle text-xl"></i> <span>تأكيد وحفظ الألوان الجديدة</span>`;
            }
        }

        document.getElementById('color-excel-step-1').classList.add('hidden');
        document.getElementById('color-excel-step-2').classList.remove('hidden');
        document.getElementById('color-excel-step-2').classList.add('flex');

    } catch (err) {
        console.error(err);
        showToast('حدث خطأ أثناء قراءة الملف، تأكد من صحة الأعمدة (كود اللون، اسم اللون)', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="ph ph-magnifying-glass text-xl"></i> تحليل ومعاينة الملف`;
    }
};

window.executeColorExcelImport = async () => {
    // 🌟 1. تصحيح اسم المصفوفة ليطابق دالة الفحص 🌟
    if (!pendingExcelColors || pendingExcelColors.length === 0) {
        showToast('لا توجد ألوان جديدة صالحة للإضافة!', 'info');
        return;
    }

    const btn = document.getElementById('color-excel-import-btn');
    btn.disabled = true;

    // ⚡ 1. فحص رصيد الكريديت قبل البدء
    const creditRules = await getTenantCreditRules();
    const requiredCredits = calculateOperationCredits('excel_colors_import', pendingExcelColors.length, creditRules);

    if (!creditRules.is_unlimited && creditRules.remaining_credits < requiredCredits) {
        btn.disabled = false;
        showSubscriptionUpgradeModal({
            quotaType: 'excel_credits',
            limit: creditRules.remaining_credits,
            title: '⚠️ وصول للحد الأقصى لرصيد الكريديت (Excel)',
            message: `تعذر استيراد ملف ألوان الإكسيل: تتطلب العملية خصم (${requiredCredits} كريديت) بينما الرصيد المتاح لديك (${creditRules.remaining_credits} كريديت).`
        });
        return;
    }

    try {
        const CHUNK_SIZE = 500; // الألوان خفيفة، 500 سجل في الدفعة رقم ممتاز وآمن
        const totalColors = pendingExcelColors.length;
        let successCount = 0;

        for (let i = 0; i < totalColors; i += CHUNK_SIZE) {
            const chunk = pendingExcelColors.slice(i, i + CHUNK_SIZE);
            const currentEnd = Math.min(i + CHUNK_SIZE, totalColors);

            btn.innerHTML = `<i class="ph ph-spinner animate-spin text-xl"></i> جاري حفظ ${currentEnd} من ${totalColors}...`;

            // 🌟 2. الحل الجذري: استخدام upsert لتخطي الأكواد المكررة في السيرفر بصمت 🌟
            const { error } = await supabase.from('colors').upsert(chunk, {
                onConflict: 'tenant_id,color_code', // تحديد العمودين اللذين يمنعان التكرار لكل مصنع
                ignoreDuplicates: true    // تجاهل المكرر وعدم إحداث خطأ
            });

            if (error) {
                throw new Error(`خطأ أثناء حفظ الدفعة (${i} إلى ${currentEnd}): ${error.message}`);
            }

            successCount += chunk.length;
        }

        // ⚡ 2. خصم الكريديت وتوثيق العملية بسجل استهلاك الكريديت
        try {
            await deductTenantCredits('excel_colors_import', 'استيراد ألوان إكسيل', requiredCredits, successCount);
        } catch (deductErr) {
            console.error('Error deducting excel colors credits:', deductErr);
        }

        showToast(`تم استيراد وحفظ ${successCount} لون بنجاح!`, 'success');
        
        // إغلاق النافذة
        if (typeof window.closeColorExcelModal === 'function') {
            window.closeColorExcelModal();
        }

        // تحديث جدول الألوان بصمت
        if (typeof window.switchDefTab === 'function') {
            await window.switchDefTab('colors');
        }
        if (typeof window.refreshAllSystemData === 'function') await window.refreshAllSystemData({ silent: true });

    } catch (error) {
        console.error(error);
        showToast(error.message || 'حدث خطأ أثناء الحفظ', 'error');
        try {
            const creditRules = await getTenantCreditRules();
            const cost = calculateOperationCredits('excel_colors_import', pendingExcelColors.length, creditRules);
            const costLabel = creditRules.is_unlimited ? 'مجاناً ⚡' : `${cost} ⚡`;
            btn.innerHTML = `<i class="ph ph-check-circle text-xl"></i> <span>تأكيد وحفظ الألوان الجديدة (${costLabel})</span>`;
        } catch (e) {
            btn.innerHTML = `<i class="ph ph-check-circle text-xl"></i> <span>تأكيد وحفظ الألوان الجديدة</span>`;
        }
        btn.disabled = false;
        
        // 🌟 3. تفريغ المصفوفة الصحيحة بعد الانتهاء 🌟
        pendingExcelColors = []; 
    }
};


function readExcelFile(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, {type: 'array'});
                const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(worksheet, { defval: "" }));
            } catch(err) { reject(err); }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
    });
}