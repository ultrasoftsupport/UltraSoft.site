import { showToast } from '../../components/toast.js';
import { confirmDialog, promptDialog } from '../../components/modal.js';
import { 
    getExcelProfiles, 
    saveExcelProfiles, 
    DEFAULT_EXCEL_PROFILE, 
    getActiveExcelProfile,
    parseColorsDataWithProfile,
    parseModelsDataWithProfile,
    parseStockRawRowsWithProfile
} from '../../services/excel_templates_service.js';

let currentProfiles = [];
let activeProfileId = 'default';
let activeSubtab = 'tab-profiles';

/**
 * 🚀 تهيئة واجهة إعدادات قوالب الإكسيل
 */
export async function initExcelSettingsView() {
    try {
        currentProfiles = await getExcelProfiles();
        if (!currentProfiles || currentProfiles.length === 0) {
            currentProfiles = [JSON.parse(JSON.stringify(DEFAULT_EXCEL_PROFILE))];
        }

        const defaultProf = currentProfiles.find(p => p.is_default) || currentProfiles[0];
        activeProfileId = defaultProf ? defaultProf.id : 'default';

        setupEventListeners();
        renderProfilesSelector();
        populateFormFromActiveProfile();
        renderExportColumns('orders');
        renderExportColumns('inbound');
        switchExcelSettingsTab(activeSubtab);
    } catch (err) {
        console.error('Error initializing Excel Settings view:', err);
        showToast('حدث خطأ أثناء تحميل قوالب الإكسيل', 'error');
    }
}

/**
 * 🎯 استرجاع القالب النشط حالياً في الواجهة
 */
function getActiveProfile() {
    return currentProfiles.find(p => p.id === activeProfileId) || currentProfiles[0] || DEFAULT_EXCEL_PROFILE;
}

/**
 * 🔄 تحديث القائمة المنسدلة لاختيار القالب وشريط المعلومات
 */
function renderProfilesSelector() {
    const selector = document.getElementById('excel-profile-select');
    if (selector) {
        selector.innerHTML = currentProfiles.map(p => `
            <option value="${p.id}" ${p.id === activeProfileId ? 'selected' : ''}>
                ${p.name} ${p.is_default ? '★ (افتراضي)' : ''}
            </option>
        `).join('');
    }

    const activeProfile = getActiveProfile();
    const nameEl = document.getElementById('excel-active-profile-name');
    const badgeEl = document.getElementById('excel-active-profile-badge');
    const descEl = document.getElementById('excel-active-profile-desc');

    if (nameEl) nameEl.textContent = activeProfile.name || 'قالب غير مسمى';
    if (badgeEl) {
        if (activeProfile.is_default) {
            badgeEl.classList.remove('hidden');
        } else {
            badgeEl.classList.add('hidden');
        }
    }
    if (descEl) descEl.textContent = activeProfile.description || 'لا يوجد وصف محدد لهذا القالب';

    // تحديث أزرار الإجراءات
    const setDefaultBtn = document.getElementById('btn-set-default-profile');
    if (setDefaultBtn) {
        setDefaultBtn.disabled = !!activeProfile.is_default;
        setDefaultBtn.classList.toggle('opacity-50', !!activeProfile.is_default);
    }
    const deleteBtn = document.getElementById('btn-delete-profile');
    if (deleteBtn) {
        const canDelete = currentProfiles.length > 1 && !activeProfile.is_default;
        deleteBtn.disabled = !canDelete;
        deleteBtn.classList.toggle('opacity-50', !canDelete);
    }
}

/**
 * 📝 ملء جميع الحقول من بيانات القالب النشط
 */
function populateFormFromActiveProfile() {
    const p = getActiveProfile();

    // 1. البيانات العامة
    setInputValue('prof-name', p.name || '');
    setInputValue('prof-desc', p.description || '');

    // 2. استيراد الألوان
    const c = p.colors_import || DEFAULT_EXCEL_PROFILE.colors_import;
    setInputValue('ci-header-row', c.header_row || 'auto');
    setInputValue('ci-code-cols', c.code_columns || '');
    setInputValue('ci-name-cols', c.name_columns || '');
    setInputValue('ci-hex-cols', c.hex_columns || '');
    setCheckboxValue('ci-strip-zero', c.strip_dot_zero !== false);
    setCheckboxValue('ci-trim-spaces', c.trim_spaces !== false);
    setCheckboxValue('ci-skip-dup', c.skip_duplicates !== false);

    // 3. استيراد الموديلات
    const m = p.models_import || DEFAULT_EXCEL_PROFILE.models_import;
    setInputValue('mi-header-row', m.header_row || 'auto');
    setInputValue('mi-system-code-cols', m.system_code_columns || '');
    setInputValue('mi-name-cols', m.name_columns || '');
    setInputValue('mi-factory-strategy', m.factory_code_strategy || 'extract_from_name');
    setInputValue('mi-factory-code-cols', m.factory_code_columns || '');
    setInputValue('mi-price-cols', m.price_columns || '');
    setInputValue('mi-wholesale-price-cols', m.wholesale_price_columns || '');
    setInputValue('mi-cost-price-cols', m.cost_price_columns || '');
    setInputValue('mi-cat-cols', m.category_columns || '');
    setCheckboxValue('mi-strip-zero', m.strip_dot_zero !== false);

    // 🔑 وضع تعيين الكود وحقول أكواد الألوان
    const codeMode = m.code_assignment_mode || 'standard';
    setInputValue('mi-code-assignment-mode', codeMode);
    setInputValue('mi-color-system-code-cols', m.color_system_code_columns || DEFAULT_EXCEL_PROFILE.models_import.color_system_code_columns || '');
    setInputValue('mi-color-factory-code-cols', m.color_factory_code_columns || DEFAULT_EXCEL_PROFILE.models_import.color_factory_code_columns || '');
    toggleColorCodeColumnsUI(codeMode);

    // تحديث إظهار/إخفاء حقل عمود كود المصنع حسب الاستراتيجية
    toggleFactoryCodeColumnInput(m.factory_code_strategy || 'extract_from_name');

    // 4. استيراد الأرصدة والكميات
    const s = p.stock_import || DEFAULT_EXCEL_PROFILE.stock_import;
    setInputValue('si-header-detection', s.header_detection || 'smart');
    setInputValue('si-header-row', s.header_row || 2);
    setInputValue('si-code-assignment-mode', s.code_assignment_mode || 'standard');
    setInputValue('si-code-cols', s.code_columns || '');
    setInputValue('si-color-code-cols', s.color_code_columns || DEFAULT_EXCEL_PROFILE.stock_import.color_code_columns || '');
    setInputValue('si-name-cols', s.name_columns || '');
    setInputValue('si-color-cols', s.color_columns || '');
    setInputValue('si-default-color', s.default_color_name || 'ساده');
    setInputValue('si-size-cols', s.size_columns || '');
    setInputValue('si-price-cols', s.price_columns || '');
    setInputValue('si-cost-cols', s.cost_price_columns || '');
    setInputValue('si-qty-strategy', s.qty_strategy || 'smart');
    setInputValue('si-qty-cols', s.qty_columns || '');
    setInputValue('si-total-val-cols', s.total_val_columns || '');
    setInputValue('si-added-qty-cols', s.added_qty_columns || '');
    setInputValue('si-sold-qty-cols', s.sold_qty_columns || '');
    setCheckboxValue('si-auto-models', s.auto_create_unregistered_models !== false);
    setCheckboxValue('si-auto-colors', s.auto_create_unregistered_colors !== false);

    toggleStockHeaderRowInput(s.header_detection || 'smart');

    // 5. تصدير الأوردرات
    const oe = p.orders_export || DEFAULT_EXCEL_PROFILE.orders_export;
    setInputValue('oe-sheet-name', oe.sheet_name || 'الأوردرات');
    setInputValue('oe-direction', oe.direction || 'rtl');
    renderExportColumns('orders');

    // 6. تصدير فواتير الإدخال
    const ie = p.inbound_export || DEFAULT_EXCEL_PROFILE.inbound_export;
    setInputValue('ie-sheet-name', ie.sheet_name || 'Inbound_Items');
    setInputValue('ie-direction', ie.direction || 'rtl');
    renderExportColumns('inbound');
}

/**
 * 📥 سحب البيانات من حقول النموذج وحفظها في كائن القالب النشط
 */
function collectFormIntoActiveProfile() {
    const p = getActiveProfile();

    // 1. البيانات العامة
    p.name = document.getElementById('prof-name')?.value.trim() || p.name || 'قالب مصنع جديد';
    p.description = document.getElementById('prof-desc')?.value.trim() || '';

    // 2. استيراد الألوان
    p.colors_import = {
        header_row: document.getElementById('ci-header-row')?.value || 'auto',
        code_columns: document.getElementById('ci-code-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.colors_import.code_columns,
        name_columns: document.getElementById('ci-name-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.colors_import.name_columns,
        hex_columns: document.getElementById('ci-hex-cols')?.value.trim() || '',
        strip_dot_zero: document.getElementById('ci-strip-zero')?.checked ?? true,
        trim_spaces: document.getElementById('ci-trim-spaces')?.checked ?? true,
        skip_duplicates: document.getElementById('ci-skip-dup')?.checked ?? true
    };

    // 3. استيراد الموديلات
    const codeMode = document.getElementById('mi-code-assignment-mode')?.value || 'standard';
    p.models_import = {
        header_row: document.getElementById('mi-header-row')?.value || 'auto',
        code_assignment_mode: codeMode,
        system_code_columns: document.getElementById('mi-system-code-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.models_import.system_code_columns,
        name_columns: document.getElementById('mi-name-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.models_import.name_columns,
        factory_code_strategy: document.getElementById('mi-factory-strategy')?.value || 'extract_from_name',
        factory_code_columns: document.getElementById('mi-factory-code-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.models_import.factory_code_columns,
        color_system_code_columns: document.getElementById('mi-color-system-code-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.models_import.color_system_code_columns,
        color_factory_code_columns: document.getElementById('mi-color-factory-code-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.models_import.color_factory_code_columns,
        price_columns: document.getElementById('mi-price-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.models_import.price_columns,
        wholesale_price_columns: document.getElementById('mi-wholesale-price-cols')?.value.trim() || '',
        cost_price_columns: document.getElementById('mi-cost-price-cols')?.value.trim() || '',
        category_columns: document.getElementById('mi-cat-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.models_import.category_columns,
        strip_dot_zero: document.getElementById('mi-strip-zero')?.checked ?? true,
        trim_spaces: true
    };

    // 4. استيراد الأرصدة والكميات
    p.stock_import = {
        header_detection: document.getElementById('si-header-detection')?.value || 'smart',
        header_row: parseInt(document.getElementById('si-header-row')?.value) || 2,
        code_assignment_mode: document.getElementById('si-code-assignment-mode')?.value || 'standard',
        code_columns: document.getElementById('si-code-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.code_columns,
        color_code_columns: document.getElementById('si-color-code-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.color_code_columns,
        name_columns: document.getElementById('si-name-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.name_columns,
        color_columns: document.getElementById('si-color-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.color_columns,
        default_color_name: document.getElementById('si-default-color')?.value.trim() || 'ساده',
        size_columns: document.getElementById('si-size-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.size_columns,
        price_columns: document.getElementById('si-price-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.price_columns,
        cost_price_columns: document.getElementById('si-cost-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.cost_price_columns,
        qty_strategy: document.getElementById('si-qty-strategy')?.value || 'smart',
        qty_columns: document.getElementById('si-qty-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.qty_columns,
        total_val_columns: document.getElementById('si-total-val-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.total_val_columns,
        added_qty_columns: document.getElementById('si-added-qty-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.added_qty_columns,
        sold_qty_columns: document.getElementById('si-sold-qty-cols')?.value.trim() || DEFAULT_EXCEL_PROFILE.stock_import.sold_qty_columns,
        auto_create_unregistered_models: document.getElementById('si-auto-models')?.checked ?? true,
        auto_create_unregistered_colors: document.getElementById('si-auto-colors')?.checked ?? true
    };

    // 5. تصدير الأوردرات
    p.orders_export = p.orders_export || JSON.parse(JSON.stringify(DEFAULT_EXCEL_PROFILE.orders_export));
    p.orders_export.sheet_name = document.getElementById('oe-sheet-name')?.value.trim() || 'الأوردرات';
    p.orders_export.direction = document.getElementById('oe-direction')?.value || 'rtl';
    collectExportColumns('orders', p.orders_export);

    // 6. تصدير فواتير الإدخال
    p.inbound_export = p.inbound_export || JSON.parse(JSON.stringify(DEFAULT_EXCEL_PROFILE.inbound_export));
    p.inbound_export.sheet_name = document.getElementById('ie-sheet-name')?.value.trim() || 'Inbound_Items';
    p.inbound_export.direction = document.getElementById('ie-direction')?.value || 'rtl';
    collectExportColumns('inbound', p.inbound_export);
}

/**
 * 📋 رسم جدول أعمدة التصدير (الأوردرات أو فواتير الإدخال)
 */
function renderExportColumns(type = 'orders') {
    const p = getActiveProfile();
    const config = type === 'orders' ? (p.orders_export || DEFAULT_EXCEL_PROFILE.orders_export) : (p.inbound_export || DEFAULT_EXCEL_PROFILE.inbound_export);
    const container = document.getElementById(`${type === 'orders' ? 'oe' : 'ie'}-columns-container`);
    if (!container) return;

    const cols = config.columns || [];
    container.innerHTML = cols.map((col, idx) => `
        <tr class="border-b border-devo-gray/30 hover:bg-devo-black/30 transition-colors">
            <td class="p-2.5 text-center">
                <input type="checkbox" data-col-idx="${idx}" class="col-enable-checkbox w-4 h-4 rounded text-devo-orange focus:ring-0 bg-devo-black border-devo-gray" ${col.enabled !== false ? 'checked' : ''}>
            </td>
            <td class="p-2.5 font-mono text-xs text-devo-orange font-bold">
                ${col.key}
            </td>
            <td class="p-2.5">
                <input type="text" data-col-idx="${idx}" class="col-label-input w-full bg-devo-black border border-devo-gray rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-devo-orange outline-none" value="${escapeHtml(col.label || '')}">
            </td>
            <td class="p-2.5">
                <input type="text" data-col-idx="${idx}" class="col-default-input w-full bg-devo-black border border-devo-gray rounded-lg px-2.5 py-1.5 text-xs text-white focus:border-devo-orange outline-none" value="${escapeHtml(col.defaultValue || '')}" placeholder="قيمة افتراضية إن وجد">
            </td>
            <td class="p-2.5 text-center">
                <input type="number" data-col-idx="${idx}" class="col-width-input w-20 bg-devo-black border border-devo-gray rounded-lg px-2 py-1.5 text-xs text-white text-center focus:border-devo-orange outline-none" value="${col.width || 15}" min="5" max="100">
            </td>
            <td class="p-2.5 text-center">
                <div class="flex items-center justify-center gap-1">
                    <button type="button" onclick="window.moveExcelExportColumn('${type}', ${idx}, -1)" class="p-1 text-devo-muted hover:text-white rounded hover:bg-devo-gray/50 ${idx === 0 ? 'opacity-20 cursor-not-allowed' : ''}" title="تحريك لأعلى" ${idx === 0 ? 'disabled' : ''}>
                        <i class="ph ph-arrow-up"></i>
                    </button>
                    <button type="button" onclick="window.moveExcelExportColumn('${type}', ${idx}, 1)" class="p-1 text-devo-muted hover:text-white rounded hover:bg-devo-gray/50 ${idx === cols.length - 1 ? 'opacity-20 cursor-not-allowed' : ''}" title="تحريك لأسفل" ${idx === cols.length - 1 ? 'disabled' : ''}>
                        <i class="ph ph-arrow-down"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

/**
 * 📥 سحب قيم الأعمدة المخصصة للتصدير من الجدول
 */
function collectExportColumns(type, config) {
    const prefix = type === 'orders' ? 'oe' : 'ie';
    const container = document.getElementById(`${prefix}-columns-container`);
    if (!container || !config.columns) return;

    const rows = container.querySelectorAll('tr');
    rows.forEach((row, idx) => {
        if (!config.columns[idx]) return;
        const enableCb = row.querySelector('.col-enable-checkbox');
        const labelInp = row.querySelector('.col-label-input');
        const defaultInp = row.querySelector('.col-default-input');
        const widthInp = row.querySelector('.col-width-input');

        config.columns[idx].enabled = enableCb ? enableCb.checked : true;
        config.columns[idx].label = labelInp ? labelInp.value.trim() : config.columns[idx].label;
        config.columns[idx].defaultValue = defaultInp ? defaultInp.value : (config.columns[idx].defaultValue || '');
        config.columns[idx].width = widthInp ? parseInt(widthInp.value) || 15 : 15;
    });
}

/**
 * 🔄 تبديل ترتيب عمود في مصفوفة التصدير
 */
window.moveExcelExportColumn = (type, index, delta) => {
    const p = getActiveProfile();
    const config = type === 'orders' ? p.orders_export : p.inbound_export;
    if (!config || !config.columns) return;

    collectExportColumns(type, config);

    const newIndex = index + delta;
    if (newIndex < 0 || newIndex >= config.columns.length) return;

    const item = config.columns.splice(index, 1)[0];
    config.columns.splice(newIndex, 0, item);

    renderExportColumns(type);
};

/**
 * 💾 حفظ القالب الحالي في قاعدة البيانات
 */
export async function saveActiveProfile() {
    const saveBtn = document.getElementById('btn-save-excel-settings');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> جاري الحفظ...`;
    }

    try {
        collectFormIntoActiveProfile();
        const res = await saveExcelProfiles(currentProfiles);
        if (!res.success) throw new Error(res.error || 'فشل الحفظ');

        showToast('تم حفظ قوالب وإعدادات Excel بنجاح 🎉', 'success');
        renderProfilesSelector();
    } catch (err) {
        console.error('Error saving excel settings:', err);
        showToast(err.message || 'خطأ أثناء حفظ الإعدادات', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="ph ph-floppy-disk text-lg"></i> حفظ إعدادات القالب`;
        }
    }
}

/**
 * ➕ إضافة قالب مصنع جديد
 */
export async function addNewProfile() {
    const factoryProfileName = await promptDialog({
        title: 'إضافة قالب مصنع جديد',
        message: 'أدخل اسم المصنع أو القالب الجديد (مثال: مصنع الشروق، قالب كويك بوكس):',
        placeholder: 'اسم القالب / المصنع',
        confirmText: 'إنشاء القالب',
        cancelText: 'إلغاء'
    });

    if (!factoryProfileName || !factoryProfileName.trim()) return;

    const cleanName = factoryProfileName.trim();
    const newId = 'profile_' + Date.now();

    // نسخ هيكل القالب الافتراضي مع الاسم الجديد
    const newProfile = JSON.parse(JSON.stringify(DEFAULT_EXCEL_PROFILE));
    newProfile.id = newId;
    newProfile.name = cleanName;
    newProfile.description = `قالب مخصص لاستيراد وتصدير ملفات Excel لمصنع ${cleanName}`;
    newProfile.is_default = false;
    newProfile.created_at = new Date().toISOString();

    currentProfiles.push(newProfile);
    activeProfileId = newId;

    await saveExcelProfiles(currentProfiles);
    renderProfilesSelector();
    populateFormFromActiveProfile();
    showToast(`تم إنشاء قالب جديد: "${cleanName}" وحفظه بنجاح 🎉`, 'success');
    switchExcelSettingsTab('tab-profiles');
}

/**
 * 📋 تكرار / استنساخ القالب الحالي
 */
export async function duplicateCurrentProfile() {
    const active = getActiveProfile();
    const copyName = await promptDialog({
        title: 'استنساخ قالب المصنع',
        message: 'أدخل اسم النسخة الجديدة من القالب:',
        defaultValue: `${active.name} (نسخة)`,
        placeholder: 'اسم النسخة الجديدة',
        confirmText: 'استنساخ القالب',
        cancelText: 'إلغاء'
    });

    if (!copyName || !copyName.trim()) return;

    collectFormIntoActiveProfile();
    const cloned = JSON.parse(JSON.stringify(active));
    cloned.id = 'profile_' + Date.now();
    cloned.name = copyName.trim();
    cloned.is_default = false;
    cloned.created_at = new Date().toISOString();

    currentProfiles.push(cloned);
    activeProfileId = cloned.id;

    await saveExcelProfiles(currentProfiles);
    renderProfilesSelector();
    populateFormFromActiveProfile();
    showToast(`تم استنساخ القالب باسم "${copyName.trim()}" وحفظه بنجاح 🎉`, 'success');
}

/**
 * ⭐ تعيين القالب الحالي كقالب افتراضي للنظام
 */
export async function setAsDefaultProfile() {
    const active = getActiveProfile();
    currentProfiles.forEach(p => p.is_default = (p.id === active.id));
    await saveExcelProfiles(currentProfiles);
    renderProfilesSelector();
    showToast(`تم تعيين "${active.name}" كقالب افتراضي للنظام وحفظه ⭐`, 'info');
}

/**
 * 🗑️ حذف القالب الحالي
 */
export async function deleteCurrentProfile() {
    const active = getActiveProfile();
    if (active.is_default) {
        return showToast('لا يمكن حذف القالب الافتراضي للنظام!', 'warning');
    }
    if (currentProfiles.length <= 1) {
        return showToast('يجب أن يحتوي النظام على قالب واحد على الأقل!', 'warning');
    }

    const confirmed = await confirmDialog({
        title: 'حذف قالب المصنع',
        message: `هل أنت متأكد من حذف قالب "${active.name}"؟ لن يمكن استرجاعه.`,
        confirmText: 'نعم، حذف القالب',
        cancelText: 'إلغاء',
        isDestructive: true
    });

    if (!confirmed) return;

    currentProfiles = currentProfiles.filter(p => p.id !== active.id);
    const def = currentProfiles.find(p => p.is_default) || currentProfiles[0];
    activeProfileId = def.id;

    await saveExcelProfiles(currentProfiles);
    renderProfilesSelector();
    populateFormFromActiveProfile();
    showToast(`تم حذف القالب وتحديث النظام بنجاح`, 'success');
}

/**
 * 🔄 إعادة تعيين القالب الحالي إلى إعدادات ألترا سوفت القياسية الافتراضية
 */
export async function resetCurrentProfileToDefault() {
    const confirmed = await confirmDialog({
        title: 'استعادة الإعدادات القياسية',
        message: 'هل تريد استعادة الإعدادات والتسميات الافتراضية القياسية لهذا القالب؟',
        confirmText: 'استعادة الافتراضي',
        cancelText: 'إلغاء',
        isDestructive: false
    });

    if (!confirmed) return;

    const active = getActiveProfile();
    const currentName = active.name;
    const currentId = active.id;
    const wasDefault = active.is_default;

    const fresh = JSON.parse(JSON.stringify(DEFAULT_EXCEL_PROFILE));
    fresh.id = currentId;
    fresh.name = currentName;
    fresh.is_default = wasDefault;

    const idx = currentProfiles.findIndex(p => p.id === currentId);
    if (idx !== -1) currentProfiles[idx] = fresh;

    await saveExcelProfiles(currentProfiles);
    populateFormFromActiveProfile();
    showToast('تمت استعادة الإعدادات الافتراضية للقالب وحفظها بنجاح', 'info');
}

/**
 * 🧪 أداة المعاينة والفحص المباشر لشيتات Excel (Live Simulator)
 */
export async function runSimulatorFileAnalysis() {
    const fileInp = document.getElementById('sim-file-input');
    const simType = document.getElementById('sim-analysis-type')?.value || 'stock';
    const resultBox = document.getElementById('sim-result-box');
    const simStats = document.getElementById('sim-stats');
    const simTable = document.getElementById('sim-table-preview');

    const file = fileInp?.files[0];
    if (!file) return showToast('الرجاء اختيار ملف Excel أولاً لتجربته', 'warning');

    collectFormIntoActiveProfile();
    const activeProfile = getActiveProfile();

    const simBtn = document.getElementById('btn-run-simulator');
    if (simBtn) {
        simBtn.disabled = true;
        simBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> جاري فحص وتحليل الملف...`;
    }

    try {
        const rawRows = await readExcelFileRawAsync(file);
        if (rawRows.length < 2) throw new Error('الملف فارغ أو لا يحتوي على بيانات كافية.');

        resultBox.classList.remove('hidden');

        if (simType === 'colors') {
            // تحويل أول صف إلى Header object
            const headers = rawRows[0] || [];
            const dataObjects = rawRows.slice(1).map(r => {
                const obj = {};
                headers.forEach((h, idx) => {
                    if (h) obj[String(h).trim()] = r[idx];
                });
                return obj;
            });

            const { newColors, duplicates } = parseColorsDataWithProfile(dataObjects, activeProfile, new Set());
            simStats.innerHTML = `
                <div class="bg-devo-black/60 p-3 rounded-lg border border-emerald-500/30">
                    <span class="text-xs text-devo-muted block">الألوان الجديدة الصالحة</span>
                    <span class="text-xl font-bold text-emerald-400 font-mono">${newColors.length}</span>
                </div>
                <div class="bg-devo-black/60 p-3 rounded-lg border border-devo-gray">
                    <span class="text-xs text-devo-muted block">الألوان المكررة أو المتجاهلة</span>
                    <span class="text-xl font-bold text-amber-400 font-mono">${duplicates.length}</span>
                </div>
            `;

            simTable.innerHTML = `
                <table class="w-full text-xs text-right border-collapse">
                    <thead>
                        <tr class="bg-devo-black text-devo-muted border-b border-devo-gray">
                            <th class="p-2.5">#</th>
                            <th class="p-2.5">كود اللون المستخرج</th>
                            <th class="p-2.5">اسم اللون المستخرج</th>
                            <th class="p-2.5">الحالة</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${newColors.slice(0, 30).map((c, i) => `
                            <tr class="border-b border-devo-gray/30 hover:bg-devo-black/40">
                                <td class="p-2 text-devo-muted">${i + 1}</td>
                                <td class="p-2 font-mono text-devo-orange font-bold">${escapeHtml(c.color_code)}</td>
                                <td class="p-2 font-bold text-white">${escapeHtml(c.name)}</td>
                                <td class="p-2 text-emerald-400">✓ صالح للاستيراد</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

        } else if (simType === 'models') {
            const headers = rawRows[0] || [];
            const dataObjects = rawRows.slice(1).map(r => {
                const obj = {};
                headers.forEach((h, idx) => {
                    if (h) obj[String(h).trim()] = r[idx];
                });
                return obj;
            });

            const { excelModels, categories, newCount } = parseModelsDataWithProfile(dataObjects, activeProfile, new Set());

            simStats.innerHTML = `
                <div class="bg-devo-black/60 p-3 rounded-lg border border-emerald-500/30">
                    <span class="text-xs text-devo-muted block">الموديلات المقروءة</span>
                    <span class="text-xl font-bold text-emerald-400 font-mono">${newCount}</span>
                </div>
                <div class="bg-devo-black/60 p-3 rounded-lg border border-blue-500/30">
                    <span class="text-xs text-devo-muted block">التصنيفات المكتشفة</span>
                    <span class="text-xl font-bold text-blue-400 font-mono">${categories.length}</span>
                </div>
            `;

            simTable.innerHTML = `
                <table class="w-full text-xs text-right border-collapse">
                    <thead>
                        <tr class="bg-devo-black text-devo-muted border-b border-devo-gray">
                            <th class="p-2.5">#</th>
                            <th class="p-2.5">كود السيستم</th>
                            <th class="p-2.5">كود المصنع</th>
                            <th class="p-2.5">اسم الموديل المستخرج</th>
                            <th class="p-2.5">السعر</th>
                            <th class="p-2.5">التصنيف</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${excelModels.slice(0, 30).map((m, i) => `
                            <tr class="border-b border-devo-gray/30 hover:bg-devo-black/40">
                                <td class="p-2 text-devo-muted">${i + 1}</td>
                                <td class="p-2 font-mono text-devo-orange font-bold">${escapeHtml(m.system_code)}</td>
                                <td class="p-2 font-mono text-amber-300 font-bold">${escapeHtml(m.factory_code || '-')}</td>
                                <td class="p-2 text-white font-bold">${escapeHtml(m.name)}</td>
                                <td class="p-2 font-mono text-emerald-400">${m.price} ج.م</td>
                                <td class="p-2 text-devo-muted">${escapeHtml(m.category_name || '-')}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;

        } else {
            // Stock / Inbound simulation
            const parsed = parseStockRawRowsWithProfile(rawRows, activeProfile, [], []);
            const { excelRawData, detectedHeaders } = parsed;

            simStats.innerHTML = `
                <div class="bg-devo-black/60 p-3 rounded-lg border border-emerald-500/30">
                    <span class="text-xs text-devo-muted block">إجمالي الأصناف والكميات</span>
                    <span class="text-xl font-bold text-emerald-400 font-mono">${excelRawData.length}</span>
                </div>
                <div class="bg-devo-black/60 p-3 rounded-lg border border-purple-500/30">
                    <span class="text-xs text-devo-muted block">رقم صف الهيدر المكتشف</span>
                    <span class="text-xl font-bold text-purple-400 font-mono">صف ${detectedHeaders.headerRowIdx + 1}</span>
                </div>
                <div class="bg-devo-black/60 p-3 rounded-lg border border-devo-gray">
                    <span class="text-xs text-devo-muted block">مواقع الأعمدة (Code/Name/Color/Qty)</span>
                    <span class="text-xs font-mono text-white mt-1 block">
                        كود: [${detectedHeaders.codeIdx}] | اسم: [${detectedHeaders.nameIdx}] | لون: [${detectedHeaders.colorIdx}] | كمية: [${detectedHeaders.qtyUnitIdx}]
                    </span>
                </div>
            `;

            simTable.innerHTML = `
                <table class="w-full text-xs text-right border-collapse">
                    <thead>
                        <tr class="bg-devo-black text-devo-muted border-b border-devo-gray">
                            <th class="p-2.5">#</th>
                            <th class="p-2.5">كود الموديل</th>
                            <th class="p-2.5">اسم الصنف</th>
                            <th class="p-2.5">اللون المستخرج</th>
                            <th class="p-2.5">السعر</th>
                            <th class="p-2.5">الكمية / الرصيد المستخرج</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${excelRawData.slice(0, 30).map((r, i) => `
                            <tr class="border-b border-devo-gray/30 hover:bg-devo-black/40">
                                <td class="p-2 text-devo-muted">${i + 1}</td>
                                <td class="p-2 font-mono text-devo-orange font-bold">${escapeHtml(r.systemCode)}</td>
                                <td class="p-2 text-white font-bold">${escapeHtml(r.rawName)}</td>
                                <td class="p-2 text-amber-300">${escapeHtml(r.colorName)}</td>
                                <td class="p-2 font-mono text-devo-muted">${r.price} ج.م</td>
                                <td class="p-2 font-mono font-bold ${r.balance > 0 ? 'text-emerald-400' : 'text-rose-400'}">${r.balance}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            `;
        }

        showToast('تمت قراءة وفحص ملف الإكسيل بنجاح ✅', 'success');
    } catch (err) {
        console.error('Simulator error:', err);
        showToast(err.message || 'خطأ أثناء تحليل ملف الإكسيل', 'error');
    } finally {
        if (simBtn) {
            simBtn.disabled = false;
            simBtn.innerHTML = `<i class="ph ph-play text-lg"></i> فحص ومعاينة استخراج البيانات`;
        }
    }
}

/**
 * 📑 التنقل بين التبويبات الداخلية لإعدادات الإكسيل
 */
export function switchExcelSettingsTab(tabId) {
    activeSubtab = tabId;
    const tabs = document.querySelectorAll('.excel-tab-content');
    const tabBtns = document.querySelectorAll('.excel-tab-btn');

    tabs.forEach(t => t.classList.add('hidden'));
    tabBtns.forEach(btn => {
        if (btn.getAttribute('data-excel-tab') === tabId) {
            btn.className = 'excel-tab-btn px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-devo-orange text-white shadow-md cursor-pointer';
        } else {
            btn.className = 'excel-tab-btn px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-2 text-devo-muted hover:bg-devo-gray/50 hover:text-white cursor-pointer';
        }
    });

    const target = document.getElementById(tabId);
    if (target) target.classList.remove('hidden');
}

/**
 * ⚙️ ربط أحداث العناصر في الصفحة
 */
function setupEventListeners() {
    // اختيار قالب مختلف من القائمة
    const selector = document.getElementById('excel-profile-select');
    if (selector) {
        selector.onchange = (e) => {
            activeProfileId = e.target.value;
            renderProfilesSelector();
            populateFormFromActiveProfile();
        };
    }

    // استراتيجية كود المصنع
    const stratSelect = document.getElementById('mi-factory-strategy');
    if (stratSelect) {
        stratSelect.onchange = (e) => toggleFactoryCodeColumnInput(e.target.value);
    }

    // كشف الهيدر في الأرصدة
    const headDetect = document.getElementById('si-header-detection');
    if (headDetect) {
        headDetect.onchange = (e) => toggleStockHeaderRowInput(e.target.value);
    }

    // ربط الأزرار بالنافذة العالمية
    window.switchExcelSettingsTab = switchExcelSettingsTab;
    window.saveActiveExcelProfile = saveActiveProfile;
    window.addNewExcelProfile = addNewProfile;
    window.duplicateCurrentExcelProfile = duplicateCurrentProfile;
    window.setAsDefaultExcelProfile = setAsDefaultProfile;
    window.deleteCurrentExcelProfile = deleteCurrentProfile;
    window.resetCurrentExcelProfileToDefault = resetCurrentProfileToDefault;
    window.runSimulatorFileAnalysis = runSimulatorFileAnalysis;
}

function toggleFactoryCodeColumnInput(strategy) {
    const wrap = document.getElementById('mi-factory-code-cols-wrapper');
    if (wrap) {
        wrap.classList.toggle('hidden', strategy !== 'separate_column');
    }
}

function toggleStockHeaderRowInput(detection) {
    const wrap = document.getElementById('si-header-row-wrapper');
    if (wrap) {
        wrap.classList.toggle('hidden', detection === 'smart');
    }
}

/**
 * 🔑 تحديث إظهار/إخفاء حقول أعمدة أكواد الألوان في إعدادات استيراد الموديلات
 */
function toggleColorCodeColumnsUI(mode) {
    const miMode = mode || document.getElementById('mi-code-assignment-mode')?.value || 'standard';
    const sysCols = document.getElementById('mi-color-system-code-cols-wrapper');
    const facCols = document.getElementById('mi-color-factory-code-cols-wrapper');
    if (sysCols) sysCols.classList.toggle('hidden', miMode !== 'color_system_codes');
    if (facCols) facCols.classList.toggle('hidden', miMode !== 'color_factory_codes');

    // تحديث حقول قسم الأرصدة أيضاً
    const siMode = document.getElementById('si-code-assignment-mode')?.value || miMode;
    const stockCodeColWrap = document.getElementById('si-color-code-cols-wrapper');
    if (stockCodeColWrap) stockCodeColWrap.classList.toggle('hidden', siMode === 'standard');
}

window.toggleColorCodeColumnsUI = toggleColorCodeColumnsUI;
window.onMiCodeModeChange = (val) => { toggleColorCodeColumnsUI(val); autoSaveProfileChanges(); };
window.onSiCodeModeChange = (val) => { toggleColorCodeColumnsUI(val); autoSaveProfileChanges(); };

function setInputValue(id, val) {
    const el = document.getElementById(id);
    if (el) el.value = val;
}

function setCheckboxValue(id, checked) {
    const el = document.getElementById(id);
    if (el) el.checked = !!checked;
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function readExcelFileRawAsync(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });
                resolve(rows);
            } catch (err) {
                reject(err);
            }
        };
        reader.onerror = (err) => reject(err);
        reader.readAsArrayBuffer(file);
    });
}

// 🌐 ضمان توفر الدوال العامة على مستوى window فور تحميل الموديول
window.switchExcelSettingsTab = switchExcelSettingsTab;
window.saveActiveExcelProfile = saveActiveProfile;
window.addNewExcelProfile = addNewProfile;
window.duplicateCurrentExcelProfile = duplicateCurrentProfile;
window.setAsDefaultExcelProfile = setAsDefaultProfile;
window.deleteCurrentExcelProfile = deleteCurrentProfile;
window.resetCurrentExcelProfileToDefault = resetCurrentProfileToDefault;
window.runSimulatorFileAnalysis = runSimulatorFileAnalysis;

