import { supabase } from '../config/supabase.js';
import { getCurrentTenantId } from './tenant_service.js';

// 🌟 القالب الافتراضي المتوافق كلياً مع كود وسيستم UltraSoft الأصلي 🌟
export const DEFAULT_EXCEL_PROFILE = {
    id: 'default',
    name: 'القالب الافتراضي القياسي (UltraSoft Standard)',
    description: 'التنسيق الافتراضي للنظام المتوافق مع معظم برامج المصانع والأعمدة الشائعة',
    is_default: true,
    created_at: '2026-01-01T00:00:00.000Z',
    
    // 🎨 1. إعدادات استيراد الألوان
    colors_import: {
        header_row: 'auto', // 'auto' أو رقم الصف مثل 1
        code_columns: 'كود اللون, كود, Code, رمز اللون',
        name_columns: 'اسم اللون, اللون, لون, Name, Color',
        hex_columns: 'كود الهكس, Hex, Hex Code',
        strip_dot_zero: true,
        trim_spaces: true,
        skip_duplicates: true
    },

    // 👕 2. إعدادات استيراد الموديلات
    models_import: {
        header_row: 'auto',
        // 🔑 وضع تعيين الكود:
        // 'standard'            => كود سيستم + كود مصنع ثابتَين على مستوى الموديل (الافتراضي)
        // 'color_system_codes'  => كل لون له system_code مختلف — factory_code هو المعرف الموحد
        // 'color_factory_codes' => كل لون له factory_code مختلف — system_code هو المعرف الموحد
        code_assignment_mode: 'standard',
        system_code_columns: 'كود, الكود, كود الصنف, كود السيستم, كود الموديل, Code',
        name_columns: 'الصنف, اسم الموديل, اسم الصنف, اسم المنتج, الموديل, Name',
        factory_code_strategy: 'extract_from_name', // 'extract_from_name' | 'separate_column' | 'same_as_system'
        factory_code_columns: 'كود المصنع, كود المورد, Factory Code',
        // أعمدة الأكواد على مستوى اللون (تُستخدم في الوضعَين الجديدَين)
        color_system_code_columns: 'كود سيستم اللون, كود السيستم, كود, Color System Code, Sys Code',
        color_factory_code_columns: 'كود مصنع اللون, كود المصنع, Color Factory Code, Fac Code',
        price_columns: 'بيع 1, السعر, سعر البيع, بيع, Price',
        wholesale_price_columns: 'بيع 2, جملة, سعر الجملة',
        cost_price_columns: 'التكلفة, س التكلفة, سعر التكلفة, Cost',
        category_columns: 'النوع, التصنيف, القسم, المجموعة, Category',
        strip_dot_zero: true,
        trim_spaces: true
    },

    // 📦 3. إعدادات استيراد الأرصدة والجرد وفواتير الإدخال
    stock_import: {
        header_detection: 'smart', // 'smart' أو رقم محدد
        header_row: 2, // في حالة عدم التحديد الذكي
        // 🔑 وضع تعيين الكود (يجب أن يتطابق مع إعداد الموديل)
        code_assignment_mode: 'standard',
        // في الوضع 'standard': هذا العمود هو system_code
        // في الوضع 'color_system_codes': هذا العمود هو factory_code (المعرف الموحد للموديل)
        // في الوضع 'color_factory_codes': هذا العمود هو system_code (المعرف الموحد للموديل)
        code_columns: 'الكود, كود, كود الصنف, كود السيستم, كود الموديل',
        // عمود الكود على مستوى اللون (للوضعَين الجديدَين)
        color_code_columns: 'كود اللون, Color Code, كود, Code',
        name_columns: 'اسم الصنف, اسم الموديل, اسم المنتج, الصنف, الموديل',
        color_columns: 'لون, اللون, اسم اللون, Color',
        default_color_name: 'ساده',
        size_columns: 'مقاس, المقاس, Size',
        price_columns: 'بيع 1, سعر البيع, بيع, السعر, Price',
        cost_price_columns: 'س التكلفة, التكلفة, سعر التكلفة, Cost',
        
        // استراتيجية حساب الرصيد
        qty_strategy: 'smart', // 'smart' | 'direct' | 'calc_cost_val' | 'calc_diff'
        qty_columns: 'رصيد, الرصيد, وحدة, الوحدة, الكمية, كمية, عدد, العدد, رصيد حالي, الرصيد الحالي, Qty, Quantity, Balance',
        total_val_columns: 'القيمة, قيمة, إجمالي القيمة, اجمالي القيمة, Total Value, Total',
        added_qty_columns: 'مضاف, المضاف, الوارد, وارد',
        sold_qty_columns: 'مباع, المباع, المنصرف, منصرف',
        
        auto_create_unregistered_models: true,
        auto_create_unregistered_colors: true
    },

    // 📤 4. إعدادات تصدير الأوردرات (Orders Export)
    orders_export: {
        sheet_name: 'الأوردرات',
        direction: 'rtl',
        file_prefix: 'DEVO_Orders',
        columns: [
            { key: 'notes', label: 'الملاحظات', enabled: true, width: 30, defaultValue: '' },
            { key: 'warehouse_code', label: 'كود المخزن', enabled: true, width: 12, defaultValue: '1' },
            { key: 'system_code', label: 'كودالصنف', enabled: true, width: 15 },
            { key: 'factory_code', label: 'كود المصنع', enabled: false, width: 15 },
            { key: 'color_system_code', label: 'كود سيستم اللون', enabled: false, width: 15 },
            { key: 'color_factory_code', label: 'كود مصنع اللون', enabled: false, width: 15 },
            { key: 'model_name', label: 'اسم الموديل', enabled: false, width: 25 },
            { key: 'quantity', label: 'عدد', enabled: true, width: 10 },
            { key: 'unit_price', label: 'الفئة', enabled: true, width: 12 },
            { key: 'gift', label: 'هدية', enabled: true, width: 10, defaultValue: '' },
            { key: 'serial', label: 'سيريال', enabled: true, width: 10, defaultValue: '-' },
            { key: 'batch', label: 'باتش', enabled: true, width: 10, defaultValue: '1' },
            { key: 'expiry', label: 'ت صلاحية', enabled: true, width: 15, defaultValue: '' },
            { key: 'color_name', label: 'اسم اللون', enabled: true, width: 15 },
            { key: 'size_code', label: 'كود المقاس', enabled: true, width: 12, defaultValue: '1' },
            { key: 'size_name', label: 'المقاس', enabled: false, width: 12 },
            { key: 'invoice_number', label: 'رقم الأوردر', enabled: false, width: 15 },
            { key: 'customer_name', label: 'اسم العميل', enabled: false, width: 20 },
            { key: 'customer_phone', label: 'الهاتف', enabled: false, width: 15 },
            { key: 'total_price', label: 'الإجمالي', enabled: false, width: 15 },
            { key: 'created_at', label: 'التاريخ', enabled: false, width: 15 }
        ]
    },

    // 📥 5. إعدادات تصدير فواتير الإدخال (Inbound Invoices Export)
    inbound_export: {
        sheet_name: 'Inbound_Items',
        direction: 'rtl',
        file_prefix: 'INB',
        columns: [
            { key: 'notes', label: 'الملاحظات', enabled: true, width: 30, defaultValue: '' },
            { key: 'warehouse_code', label: 'كود المخزن', enabled: true, width: 12, defaultValue: '1' },
            { key: 'system_code', label: 'كودالصنف', enabled: true, width: 15 },
            { key: 'factory_code', label: 'كود المصنع', enabled: false, width: 15 },
            { key: 'color_system_code', label: 'كود سيستم اللون', enabled: false, width: 15 },
            { key: 'color_factory_code', label: 'كود مصنع اللون', enabled: false, width: 15 },
            { key: 'model_name', label: 'اسم الموديل', enabled: false, width: 25 },
            { key: 'quantity', label: 'عدد', enabled: true, width: 10 },
            { key: 'unit_price', label: 'الفئة', enabled: true, width: 12 },
            { key: 'gift', label: 'هدية', enabled: true, width: 10, defaultValue: '' },
            { key: 'serial', label: 'سيريال', enabled: true, width: 10, defaultValue: '-' },
            { key: 'batch', label: 'باتش', enabled: true, width: 10, defaultValue: '1' },
            { key: 'expiry', label: 'ت صلاحية', enabled: true, width: 15, defaultValue: '' },
            { key: 'color_name', label: 'اسم اللون', enabled: true, width: 15 },
            { key: 'size_code', label: 'كود المقاس', enabled: true, width: 12, defaultValue: '1' }
        ]
    }
};

const SETTINGS_KEY = 'excel_io_profiles_v1';
let cachedProfiles = null;

/**
 * 🔍 جلب جميع قوالب المصانع المحفوظة للـ Tenant الحالي
 */
export async function getExcelProfiles(tenantId = null) {
    const tid = tenantId || getCurrentTenantId();
    try {
        let query = supabase.from('home_settings').select('setting_value');
        if (tid) {
            query = query.eq('tenant_id', tid);
        }
        query = query.eq('setting_key', SETTINGS_KEY);

        const { data, error } = await query.maybeSingle();
        if (error) throw error;

        if (data && data.setting_value) {
            const parsed = JSON.parse(data.setting_value);
            if (Array.isArray(parsed) && parsed.length > 0) {
                cachedProfiles = parsed;
                return parsed;
            }
        }
    } catch (e) {
        console.warn('Could not fetch excel profiles from db, using fallback:', e);
    }

    // تجربة الذاكرة المحلية كـ Fallback
    try {
        const local = localStorage.getItem(`ultrasoft_excel_profiles_${tid || 'default'}`);
        if (local) {
            const parsed = JSON.parse(local);
            if (Array.isArray(parsed) && parsed.length > 0) {
                cachedProfiles = parsed;
                return parsed;
            }
        }
    } catch(e) {}

    // إن لم توجد، إرجاع القالب الافتراضي
    cachedProfiles = [JSON.parse(JSON.stringify(DEFAULT_EXCEL_PROFILE))];
    return cachedProfiles;
}

/**
 * 💾 حفظ قوالب المصانع في Supabase للـ Tenant الحالي
 */
export async function saveExcelProfiles(profiles, tenantId = null) {
    const tid = tenantId || getCurrentTenantId();
    if (!Array.isArray(profiles) || profiles.length === 0) {
        profiles = [DEFAULT_EXCEL_PROFILE];
    }

    cachedProfiles = profiles;
    const jsonStr = JSON.stringify(profiles);

    // 1. الحفظ في LocalStorage فورياً
    try {
        localStorage.setItem(`ultrasoft_excel_profiles_${tid || 'default'}`, jsonStr);
    } catch(e) {}

    // 2. الحفظ في Supabase home_settings
    try {
        const payload = {
            setting_key: SETTINGS_KEY,
            setting_value: jsonStr,
            description: 'Excel import and export custom factory profiles'
        };
        if (tid) {
            payload.tenant_id = tid;
        }

        const { error } = await supabase
            .from('home_settings')
            .upsert(payload, { onConflict: tid ? 'tenant_id,setting_key' : 'setting_key' });

        if (error) throw error;
        return { success: true };
    } catch (err) {
        console.error('Error saving excel profiles to Supabase:', err);
        return { success: false, error: err.message };
    }
}

/**
 * 🎯 استرجاع القالب النشط (سواء محدد بالـ ID أو القالب الافتراضي)
 */
export function getActiveExcelProfile(profiles, requestedId = null) {
    if (!Array.isArray(profiles) || profiles.length === 0) {
        return DEFAULT_EXCEL_PROFILE;
    }
    if (requestedId) {
        const found = profiles.find(p => p.id === requestedId);
        if (found) return found;
    }
    const def = profiles.find(p => p.is_default);
    return def || profiles[0] || DEFAULT_EXCEL_PROFILE;
}

/**
 * 🔤 توحيد الحروف العربية وإلغاء أل التعريف للمطابقة الذكية الشاملة
 */
export function cleanArabicForMatch(text) {
    if (!text) return '';
    return String(text)
        .trim()
        .toLowerCase()
        .replace(/^ال(?=[\u0600-\u06FF])/, '') // إزالة أل التعريف في أول الكلمة
        .replace(/[أإآ]/g, 'ا') // توحيد الألف
        .replace(/ة$/g, 'ه')   // توحيد التاء المربوطة
        .replace(/[\u064B-\u0652]/g, '') // إزالة علامات التشكيل
        .replace(/\s+/g, '');
}

/**
 * 🔎 دالة مساعدة لمطابقة أسماء الأعمدة البديلة (Case-Insensitive, Trimmed & Arabic Normalized)
 */
export function matchColumnIndex(headers, candidateString) {
    if (!headers || !candidateString) return -1;
    const rawCandidates = String(candidateString)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    const normalizedCandidates = rawCandidates.map(c => cleanArabicForMatch(c)).filter(Boolean);

    // 1. فحص التطابق الحرفي المباشر أولاً
    for (let i = 0; i < headers.length; i++) {
        const h = String(headers[i] || '').trim().toLowerCase();
        if (!h) continue;
        if (rawCandidates.includes(h)) return i;
    }

    // 2. فحص التطابق الذكي مع توحيد الألف وإلغاء أل التعريف
    for (let i = 0; i < headers.length; i++) {
        const hClean = cleanArabicForMatch(headers[i]);
        if (!hClean) continue;
        if (normalizedCandidates.includes(hClean)) return i;
    }

    return -1;
}

/**
 * 🔎 دالة مساعدة لقراءة قيمة حقل من كائن الصف بناءً على قائمة أسماء بديلة
 */
export function getRowValueByAliases(row, candidateString) {
    if (!row || !candidateString) return '';
    const rawCandidates = String(candidateString)
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);

    const normalizedCandidates = rawCandidates.map(c => cleanArabicForMatch(c)).filter(Boolean);

    // 1. فحص التطابق الحرفي المباشر
    for (const key of Object.keys(row)) {
        const cleanKey = key.trim().toLowerCase();
        if (rawCandidates.includes(cleanKey)) {
            const val = row[key];
            return val !== undefined && val !== null ? String(val).trim() : '';
        }
    }

    // 2. فحص التطابق الذكي مع توحيد الألف وال التعريف
    for (const key of Object.keys(row)) {
        const cleanKey = cleanArabicForMatch(key);
        if (normalizedCandidates.includes(cleanKey)) {
            const val = row[key];
            return val !== undefined && val !== null ? String(val).trim() : '';
        }
    }

    return '';
}

/**
 * 🔄 دالة ذكية وشاملة لتحويل البيانات الخام (سواء مصفوفة ثنائية الأبعاد 2D Rows أو مصفوفة كائنات Objects)
 * إلى كائنات صفوف صالحة ومطابقة مع اكتشاف صف الهيدر الحقيقي تلقائياً حتى لو وجد بانر/ترويسة
 */
export function normalizeToRowObjects(rawData, candidateColumnLists = [], headerRowSetting = 'auto') {
    if (!Array.isArray(rawData) || rawData.length === 0) return [];

    // 1️⃣ الحالة الأولى: البيانات الخام عبارة عن صفوف خام (2D Array)
    if (Array.isArray(rawData[0])) {
        let headerRowIdx = -1;
        if (headerRowSetting !== 'auto' && headerRowSetting) {
            headerRowIdx = Math.max(0, parseInt(headerRowSetting) - 1);
        } else {
            // كشف ذكي عبر أول 8 صفوف للبحث عن أعمدة مطابقة
            for (let r = 0; r < Math.min(8, rawData.length); r++) {
                const row = rawData[r] || [];
                const matches = candidateColumnLists.some(candidates => matchColumnIndex(row, candidates) !== -1);
                if (matches) {
                    headerRowIdx = r;
                    break;
                }
            }
        }

        if (headerRowIdx === -1) headerRowIdx = 0;

        const headers = (rawData[headerRowIdx] || []).map(h => String(h || '').trim());
        const objectRows = [];
        for (let r = headerRowIdx + 1; r < rawData.length; r++) {
            const row = rawData[r];
            if (!row || row.length === 0) continue;
            if (row.every(cell => cell === '' || cell === null || cell === undefined)) continue;
            const obj = {};
            headers.forEach((h, colIdx) => {
                const key = h || `__col_${colIdx}`;
                obj[key] = row[colIdx] !== undefined ? row[colIdx] : '';
            });
            objectRows.push(obj);
        }
        return objectRows;
    }

    // 2️⃣ الحالة الثانية: البيانات عبارة عن مصفوفة كائنات من SheetJS
    const firstRowKeys = Object.keys(rawData[0] || {});
    const keysMatch = candidateColumnLists.some(candidates => {
        return matchColumnIndex(firstRowKeys, candidates) !== -1;
    });

    if (keysMatch) {
        return rawData;
    }

    // إذا لم تتطابق المفاتيح (مثلاً كان الصف الأول عبارة عن عنوان/بانر)، نفحص قيم أول 6 صفوف
    for (let r = 0; r < Math.min(6, rawData.length); r++) {
        const rowVals = Object.values(rawData[r] || {}).map(v => String(v || '').trim());
        const valsMatch = candidateColumnLists.some(candidates => matchColumnIndex(rowVals, candidates) !== -1);
        if (valsMatch) {
            const keys = Object.keys(rawData[r]);
            const newHeaders = rowVals;
            const objectRows = [];
            for (let i = r + 1; i < rawData.length; i++) {
                const rowObj = {};
                keys.forEach((k, colIdx) => {
                    const hName = newHeaders[colIdx] || `__col_${colIdx}`;
                    rowObj[hName] = rawData[i][k] !== undefined ? rawData[i][k] : '';
                });
                objectRows.push(rowObj);
            }
            return objectRows;
        }
    }

    return rawData;
}

/**
 * 🎨 1. تحليل واستيراد ملف الألوان بناءً على القالب المختار
 */
export function parseColorsDataWithProfile(rawData, profile = DEFAULT_EXCEL_PROFILE, existingCodesSet = new Set()) {
    const p = profile.colors_import || DEFAULT_EXCEL_PROFILE.colors_import;
    const candidateCols = [p.code_columns, p.name_columns];
    const rows = normalizeToRowObjects(rawData, candidateCols, p.header_row);

    const newColors = [];
    const duplicates = [];
    const seenInFile = new Set();

    rows.forEach(row => {
        let code = getRowValueByAliases(row, p.code_columns);
        if (p.strip_dot_zero && code.endsWith('.0')) {
            code = code.replace('.0', '');
        }
        if (p.trim_spaces) code = code.trim();

        let name = getRowValueByAliases(row, p.name_columns);
        if (p.trim_spaces) name = name.trim();

        // تجاهل الصفوف غير الصالحة
        if (!code || code === 'undefined' || !name) return;

        if (seenInFile.has(code)) return;
        seenInFile.add(code);

        if (existingCodesSet.has(code)) {
            duplicates.push({ code, name });
        } else {
            newColors.push({ color_code: code, name: name });
            if (p.skip_duplicates) existingCodesSet.add(code);
        }
    });

    return { newColors, duplicates };
}

/**
 * 👕 2. تحليل واستيراد ملف الموديلات بناءً على القالب المختار
 */
export function parseModelsDataWithProfile(rawData, profile = DEFAULT_EXCEL_PROFILE, existingModelCodesSet = new Set()) {
    const p = profile.models_import || DEFAULT_EXCEL_PROFILE.models_import;
    const mode = p.code_assignment_mode || 'standard';
    const candidateCols = [p.system_code_columns, p.name_columns, p.price_columns, p.category_columns];
    const rows = normalizeToRowObjects(rawData, candidateCols, p.header_row);

    const excelModels = [];
    const categoriesSet = new Set();
    const seenCodesInFile = new Set();
    let dupCount = 0;
    let newCount = 0;

    rows.forEach(row => {
        // 🔑 الكود الرئيسي يختلف حسب الوضع
        // color_system_codes => factory_code هو المعرف الموحد للموديل
        // color_factory_codes / standard => system_code هو المعرف
        let primaryCode = '';
        let sysCode = '';
        let factoryCode = '';

        if (mode === 'color_system_codes') {
            // في هذا الوضع: factory_code هو المعرف الموحد للموديل
            factoryCode = getRowValueByAliases(row, p.factory_code_columns);
            if (p.strip_dot_zero && factoryCode.endsWith('.0')) factoryCode = factoryCode.replace('.0', '');
            if (p.trim_spaces) factoryCode = factoryCode.trim();
            primaryCode = factoryCode;
            // system_code على مستوى اللون — لا يوجد هنا في استيراد الموديلات
            sysCode = null;
        } else {
            // standard أو color_factory_codes: system_code هو المعرف الموحد
            sysCode = getRowValueByAliases(row, p.system_code_columns);
            if (p.strip_dot_zero && sysCode.endsWith('.0')) sysCode = sysCode.replace('.0', '');
            if (p.trim_spaces) sysCode = sysCode.trim();
            primaryCode = sysCode;

            if (mode === 'standard') {
                if (p.factory_code_strategy === 'extract_from_name') {
                    const rawName = getRowValueByAliases(row, p.name_columns);
                    const match = rawName.match(/(.+?)\s+(\d+)$/);
                    factoryCode = match ? match[2] : (getRowValueByAliases(row, p.factory_code_columns) || '');
                } else if (p.factory_code_strategy === 'separate_column') {
                    factoryCode = getRowValueByAliases(row, p.factory_code_columns);
                } else if (p.factory_code_strategy === 'same_as_system') {
                    factoryCode = sysCode;
                }
            } else {
                // color_factory_codes: factory_code على مستوى اللون — هنا نقرأ من عمود المصنع إن وُجد
                factoryCode = getRowValueByAliases(row, p.factory_code_columns) || '';
            }
        }

        if (!primaryCode || primaryCode === 'undefined') return;
        if (seenCodesInFile.has(primaryCode)) return;
        seenCodesInFile.add(primaryCode);

        const isDuplicate = existingModelCodesSet.has(primaryCode);
        const catName = getRowValueByAliases(row, p.category_columns);
        if (catName) categoriesSet.add(catName);

        const rawName = getRowValueByAliases(row, p.name_columns);
        let cleanName = rawName;
        if (mode === 'standard' && p.factory_code_strategy === 'extract_from_name') {
            const match = rawName.match(/(.+?)\s+(\d+)$/);
            cleanName = match ? match[1].trim() : rawName;
        }

        const priceStr = getRowValueByAliases(row, p.price_columns);
        const price = parseFloat(priceStr) || 0;

        const modelItem = {
            system_code: sysCode,
            factory_code: factoryCode || '',
            name: cleanName || 'صنف بدون اسم',
            price: price,
            category_name: catName || null,
            is_active: false,
            is_duplicate: isDuplicate,
            code_assignment_mode: mode  // نحفظ الوضع لاستخدامه عند الـ upsert
        };

        excelModels.push(modelItem);
        if (isDuplicate) dupCount++;
        else newCount++;
    });

    return { excelModels, categories: Array.from(categoriesSet), dupCount, newCount, code_assignment_mode: mode };
}

/**
 * 📦 3. تحليل ملف الأرصدة والجرد وفواتير الإدخال الخام بناءً على القالب المختار
 */
export function parseStockRawRowsWithProfile(rawRows, profile = DEFAULT_EXCEL_PROFILE, allModels = [], existingColors = []) {
    const p = profile.stock_import || DEFAULT_EXCEL_PROFILE.stock_import;
    if (!rawRows || rawRows.length < 2) {
        throw new Error('الملف فارغ أو لا يحتوي على صفوف بيانات صالحة.');
    }

    // التحويل إلى صفوف خام 2D Array إذا تم تمرير مصفوفة كائنات
    if (Array.isArray(rawRows) && rawRows.length > 0 && !Array.isArray(rawRows[0])) {
        const headers = Object.keys(rawRows[0]);
        const rowsArray = [headers];
        rawRows.forEach(item => {
            rowsArray.push(headers.map(h => item[h]));
        });
        rawRows = rowsArray;
    }

    // 🔍 1. البحث عن صف الهيدر الحقيقي
    let headerRowIdx = -1;
    if (p.header_detection === 'smart' || !p.header_row) {
        for (let r = 0; r < Math.min(6, rawRows.length); r++) {
            const row = rawRows[r] || [];
            const codeIdx = matchColumnIndex(row, p.code_columns);
            const nameIdx = matchColumnIndex(row, p.name_columns);
            const colorIdx = matchColumnIndex(row, p.color_columns);
            const priceIdx = matchColumnIndex(row, p.price_columns);

            if (codeIdx !== -1 || (nameIdx !== -1 && (colorIdx !== -1 || priceIdx !== -1))) {
                headerRowIdx = r;
                break;
            }
        }
    } else {
        headerRowIdx = Math.max(0, parseInt(p.header_row) - 1);
    }

    if (headerRowIdx === -1) headerRowIdx = 1; // Fallback

    const headerRow = rawRows[headerRowIdx] || [];
    const upperHeaderRow = rawRows[headerRowIdx - 1] || [];

    // مطابقة مواقع الأعمدة
    let codeIdx = matchColumnIndex(headerRow, p.code_columns);
    let nameIdx = matchColumnIndex(headerRow, p.name_columns);
    let colorIdx = matchColumnIndex(headerRow, p.color_columns);
    let sizeIdx = matchColumnIndex(headerRow, p.size_columns);
    let priceIdx = matchColumnIndex(headerRow, p.price_columns);
    let costPriceIdx = matchColumnIndex(headerRow, p.cost_price_columns);
    let qtyUnitIdx = matchColumnIndex(headerRow, p.qty_columns);
    let totalValueIdx = matchColumnIndex(headerRow, p.total_val_columns);
    let addedQtyIdx = matchColumnIndex(headerRow, p.added_qty_columns);
    let soldQtyIdx = matchColumnIndex(headerRow, p.sold_qty_columns);

    // Fallbacks الذكية من الهيدر العلوي
    if (qtyUnitIdx === -1) {
        headerRow.forEach((cell, idx) => {
            const str = String(cell || '').trim().toLowerCase();
            const upperStr = String(upperHeaderRow[idx] || '').trim().toLowerCase();
            if (str === 'وحدة' && (upperStr === 'رصيد' || idx === 3)) qtyUnitIdx = idx;
            if ((upperStr === 'مضاف' || str === 'مضاف') && addedQtyIdx === -1) addedQtyIdx = idx;
            if ((upperStr === 'مباع' || str === 'مباع') && soldQtyIdx === -1) soldQtyIdx = idx;
            if ((upperStr === 'رصيد' || str === 'رصيد') && totalValueIdx === -1) totalValueIdx = idx;
        });
    }

    // Fallbacks النهائية لحالات عدم التطابق
    if (codeIdx === -1) codeIdx = 18;
    if (nameIdx === -1) nameIdx = 17;
    if (colorIdx === -1) colorIdx = 14;
    if (priceIdx === -1) priceIdx = 2;

    const excelRawData = [];
    const seenCodes = new Set();
    const unregisteredModels = [];
    const modelActions = {};
    const colorMappings = {};

    const mode = p.code_assignment_mode || 'standard';
    // في الوضع color_system_codes: نقرأ عمود كود اللون الإضافي
    let colorCodeIdx = -1;
    if (mode !== 'standard') {
        colorCodeIdx = matchColumnIndex(headerRow, p.color_code_columns || '');
    }

    const dataStartRow = headerRowIdx + 1;
    for (let i = dataStartRow; i < rawRows.length; i++) {
        const row = rawRows[i];
        if (!row || row.length === 0) continue;

        let primaryCode = String(row[codeIdx] !== undefined ? row[codeIdx] : '').trim();
        if (primaryCode.endsWith('.0')) primaryCode = primaryCode.replace('.0', '');
        
        const rawName = String(row[nameIdx] !== undefined ? row[nameIdx] : '').trim();
        const colorName = String(row[colorIdx] !== undefined ? row[colorIdx] : (p.default_color_name || 'ساده')).trim() || (p.default_color_name || 'ساده');
        const price = parseFloat(row[priceIdx]) || 0;

        if (!primaryCode && !rawName) continue;

        const finalCode = primaryCode || `MODEL_${i}`;

        // كود اللون الإضافي (system أو factory حسب الوضع)
        let colorLevelCode = '';
        if (mode !== 'standard' && colorCodeIdx !== -1) {
            colorLevelCode = String(row[colorCodeIdx] !== undefined ? row[colorCodeIdx] : '').trim();
            if (colorLevelCode.endsWith('.0')) colorLevelCode = colorLevelCode.replace('.0', '');
        }

        // حساب الرصيد والكميات بناءً على استراتيجية القالب المختار
        let balance = 0;
        const directQty = parseFloat(row[qtyUnitIdx]);
        const costPrice = parseFloat(row[costPriceIdx]) || 0;
        const totalVal = parseFloat(row[totalValueIdx]) || 0;
        const addedQty = parseFloat(row[addedQtyIdx]) || 0;
        const soldQty = parseFloat(row[soldQtyIdx]) || 0;

        if (p.qty_strategy === 'direct') {
            balance = !isNaN(directQty) ? directQty : (parseFloat(row[totalValueIdx]) || 0);
        } else if (p.qty_strategy === 'calc_cost_val') {
            balance = (costPrice > 0 && totalVal > 0) ? Math.round(totalVal / costPrice) : 0;
        } else if (p.qty_strategy === 'calc_diff') {
            balance = addedQty - soldQty;
        } else {
            // 'smart' fallback
            if (!isNaN(directQty) && directQty > 0) {
                balance = directQty;
            } else if (costPrice > 0 && totalVal > 0) {
                balance = Math.round(totalVal / costPrice);
            } else if (addedQty > 0 || soldQty > 0) {
                balance = addedQty - soldQty;
            } else if (totalValueIdx !== -1) {
                balance = parseFloat(row[totalValueIdx]) || 0;
            }
        }

        const rawDataEntry = {
            systemCode: finalCode,  // في color_system_codes هذا هو factory_code
            rawName: rawName || finalCode,
            colorName,
            price,
            balance,
            codeMode: mode
        };
        // إضافة الكود على مستوى اللون حسب الوضع
        if (mode === 'color_system_codes' && colorLevelCode) rawDataEntry.colorSystemCode = colorLevelCode;
        if (mode === 'color_factory_codes' && colorLevelCode) rawDataEntry.colorFactoryCode = colorLevelCode;

        excelRawData.push(rawDataEntry);

        modelActions[finalCode] = 'create';

        // فحص الموديلات غير المسجلة
        // في color_system_codes: البحث بـ factory_code بدل system_code
        const exists = mode === 'color_system_codes'
            ? allModels.some(m => String(m.factory_code) === String(finalCode))
            : allModels.some(m => String(m.system_code) === String(finalCode));

        if (!exists && !seenCodes.has(finalCode)) {
            seenCodes.add(finalCode);
            const match = rawName.match(/(.+?)\s+(\d+)$/);
            const cleanName = match ? match[1].trim() : (rawName || finalCode);
            const fCode = mode === 'color_system_codes' ? finalCode : (match ? match[2] : '');

            unregisteredModels.push({
                systemCode: finalCode,
                rawName: rawName || finalCode,
                factoryCode: fCode,
                name: cleanName,
                price,
                codeMode: mode
            });
        }

        // إعداد ربط الألوان الافتراضي
        if (!colorMappings[finalCode]) colorMappings[finalCode] = {};
        const matchedColor = existingColors.find(c => c.name.trim().toLowerCase() === colorName.toLowerCase());
        if (matchedColor) {
            colorMappings[finalCode][colorName] = { action: 'map', targetColorId: matchedColor.id };
        } else {
            colorMappings[finalCode][colorName] = { action: 'add', targetColorId: null };
        }
    }

    return {
        excelRawData,
        unregisteredModels,
        modelActions,
        colorMappings,
        detectedHeaders: {
            headerRowIdx,
            codeIdx,
            nameIdx,
            colorIdx,
            sizeIdx,
            priceIdx,
            qtyUnitIdx
        }
    };
}

/**
 * 📤 4. تجهيز مصفوفة بيانات تصدير الأوردرات بتنسيق وترتيب الأعمدة المخصص للقالب
 */
export function buildOrdersExportRows(orders, profile = DEFAULT_EXCEL_PROFILE, formatNotesCallback = null) {
    const p = profile.orders_export || DEFAULT_EXCEL_PROFILE.orders_export;
    const activeColumns = (p.columns || []).filter(c => c.enabled !== false);
    const resultRows = [];

    orders.forEach(o => {
        const orderNotes = formatNotesCallback ? formatNotesCallback(o) : (o.notes || '');
        const items = o.order_items || [];

        if (items.length === 0) {
            // أوردر بدون أصناف
            const rowObj = {};
            activeColumns.forEach(col => {
                rowObj[col.label] = mapOrderField(col.key, null, o, 0, orderNotes, col.defaultValue);
            });
            resultRows.push(rowObj);
            return;
        }

        items.forEach((item, idx) => {
            const rowObj = {};
            activeColumns.forEach(col => {
                rowObj[col.label] = mapOrderField(col.key, item, o, idx, orderNotes, col.defaultValue);
            });
            resultRows.push(rowObj);
        });
    });

    const colWidths = activeColumns.map(c => ({ wch: c.width || 15 }));
    return { rows: resultRows, colWidths, direction: p.direction || 'rtl', sheetName: p.sheet_name || 'الأوردرات' };
}

function mapOrderField(key, item, order, idx, orderNotes, defaultValue = '') {
    const models = item?.models || {};
    const colors = item?.colors || {};
    const sizesCount = item?.sizes_count || (models.model_sizes?.length || 1);
    const piecesQty = item?.total_pieces || ((item?.quantity || 1) * sizesCount);
    const unitPrice = item?.piece_price || (sizesCount > 0 ? ((item?.price_per_series || models.price || 0) / sizesCount) : (models.price || 0));
    const codeMode = models.code_assignment_mode || 'standard';
    const colorInv = (models.model_inventory || []).find(inv => inv.color_id === item?.color_id);
    const colorSysCode = item?.color_system_code || colorInv?.color_system_code || '';
    const colorFacCode = item?.color_factory_code || colorInv?.color_factory_code || '';

    switch (key) {
        case 'notes': return idx === 0 ? orderNotes : '';
        case 'warehouse_code': return defaultValue || '1';
        case 'system_code':
            // في وضع color_system_codes: system_code ليس على مستوى الموديل بل هو كود اللون
            if (codeMode === 'color_system_codes') return colorSysCode || models.factory_code || '';
            return models.system_code || '';
        case 'factory_code':
            // في وضع color_factory_codes: factory_code ليس على مستوى الموديل بل هو كود اللون
            if (codeMode === 'color_factory_codes') return colorFacCode || models.system_code || '';
            return models.factory_code || '';
        case 'color_system_code':
            // الكود النظامي الخاص بهذا اللون تحديداً
            return colorSysCode || (codeMode === 'standard' ? models.system_code : '') || '';
        case 'color_factory_code':
            // كود المصنع الخاص بهذا اللون تحديداً
            return colorFacCode || (codeMode === 'standard' ? models.factory_code : '') || '';
        case 'model_name': return models.name || '';
        case 'quantity': return piecesQty;
        case 'unit_price': return unitPrice;
        case 'gift': return defaultValue || '';
        case 'serial': return defaultValue || '-';
        case 'batch': return defaultValue || '1';
        case 'expiry': return defaultValue || '';
        case 'color_name': return colors.name || '';
        case 'size_code': return defaultValue || '1';
        case 'size_name': return item?.size_name || '';
        case 'invoice_number': return order.invoice_number || '';
        case 'customer_name': return order.customer_name || '';
        case 'customer_phone': return order.phone_1 || order.phone_2 || '';
        case 'total_price': return item ? (piecesQty * unitPrice) : (order.total_amount || 0);
        case 'created_at': return order.created_at ? new Date(order.created_at).toLocaleDateString('ar-EG') : '';
        default: return defaultValue || '';
    }
}

/**
 * 📥 5. تجهيز مصفوفة بيانات تصدير فواتير الإدخال بتنسيق وترتيب الأعمدة المخصص للقالب
 */
export function buildInboundExportRows(invoice, itemsData, profile = DEFAULT_EXCEL_PROFILE) {
    const p = profile.inbound_export || DEFAULT_EXCEL_PROFILE.inbound_export;
    const activeColumns = (p.columns || []).filter(c => c.enabled !== false);
    const resultRows = [];

    const invoiceNotes = `فاتورة دخل رقم: ${invoice.invoice_number || ''} | حررت بواسطة: ${invoice.system_users?.full_name || 'النظام'}`;

    (itemsData || []).forEach((item, idx) => {
        const models = item.models || {};
        const colors = item.colors || {};
        const classSizes = models.classes?.class_sizes || item.classes?.class_sizes || models.model_sizes || [];
        const sizesCount = classSizes.length > 0 ? classSizes.length : (models.model_sizes?.length || 1);
        const piecesQty = (item.quantity || 1) * sizesCount;
        const modelPrice = models.price || 0;
        const unitPrice = sizesCount > 0 ? (modelPrice / sizesCount) : modelPrice;

        const codeMode = models.code_assignment_mode || 'standard';
        const colorInv = (models.model_inventory || []).find(inv => inv.color_id === item?.color_id);
        const colorSysCode = item.color_system_code || colorInv?.color_system_code || '';
        const colorFacCode = item.color_factory_code || colorInv?.color_factory_code || '';

        const rowObj = {};
        activeColumns.forEach(col => {
            switch (col.key) {
                case 'notes': rowObj[col.label] = idx === 0 ? invoiceNotes : ''; break;
                case 'warehouse_code': rowObj[col.label] = col.defaultValue || '1'; break;
                case 'system_code':
                    rowObj[col.label] = codeMode === 'color_system_codes'
                        ? (colorSysCode || models.factory_code || '')
                        : (models.system_code || ''); break;
                case 'factory_code':
                    rowObj[col.label] = codeMode === 'color_factory_codes'
                        ? (colorFacCode || models.system_code || '')
                        : (models.factory_code || ''); break;
                case 'color_system_code':
                    rowObj[col.label] = colorSysCode || (codeMode === 'standard' ? models.system_code : '') || ''; break;
                case 'color_factory_code':
                    rowObj[col.label] = colorFacCode || (codeMode === 'standard' ? models.factory_code : '') || ''; break;
                case 'model_name': rowObj[col.label] = models.name || ''; break;
                case 'quantity': rowObj[col.label] = piecesQty; break;
                case 'unit_price': rowObj[col.label] = unitPrice; break;
                case 'gift': rowObj[col.label] = col.defaultValue || ''; break;
                case 'serial': rowObj[col.label] = col.defaultValue || '-'; break;
                case 'batch': rowObj[col.label] = col.defaultValue || '1'; break;
                case 'expiry': rowObj[col.label] = col.defaultValue || ''; break;
                case 'color_name': rowObj[col.label] = colors.name || ''; break;
                case 'size_code': rowObj[col.label] = col.defaultValue || '1'; break;
                default: rowObj[col.label] = col.defaultValue || '';
            }
        });
        resultRows.push(rowObj);
    });

    const colWidths = activeColumns.map(c => ({ wch: c.width || 15 }));
    return { rows: resultRows, colWidths, direction: p.direction || 'rtl', sheetName: p.sheet_name || 'Inbound_Items' };
}
