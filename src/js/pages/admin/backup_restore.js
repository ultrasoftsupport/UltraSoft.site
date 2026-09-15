import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { requireAuth } from '../../services/auth.js';
import { getCurrentTenantId } from '../../services/tenant_service.js';

// ============================================================
// 📦 تعريف الهيكل وثوابت الجداول والمستويات
// ============================================================
const APP_VERSION = '2.5.0';
const BACKUP_FORMAT_IDENTIFIER = 'ULTRASOFT_SYSTEM_BACKUP';
const STORAGE_BUCKET_NAME = 'system_backups';
const RETENTION_DAYS = 30; // الاحتفاظ التلقائي بآخر 30 يوماً

// الجداول التي تمتلك عمود tenant_id صريح في قواعد البيانات
const TABLES_WITH_TENANT_ID = [
    'categories', 'classes', 'sizes', 'colors', 'models',
    'system_users', 'home_settings', 'invoices', 'inbound_invoices',
    'orders', 'returns', 'inventory_audits', 'promo_cards',
    'system_notifications', 'stock_movements', 'order_logs', 'model_inventory',
    'model_colors_inventory', 'system_backups_log', 'class_sizes', 'order_items',
    'inbound_invoice_items', 'tenant_domains', 'excel_credits_log', 'system_audit_logs',
    'tenant_pos_settings', 'tenant_social_links', 'tenant_invoice_settings',
    'tenant_report_schedules', 'tenant_branding_settings', 'tenant_telegram_settings',
    'subscriptions', 'profiles'
];

// خريطة المفاتيح الرئيسية لكل جدول لمنع التعارضات في الدفعات الكبيرة
const PRIMARY_KEY_CONFIG = {
    class_sizes: 'class_id, size_id',
    model_sizes: 'model_id, size_id',
    home_settings: 'setting_key',
    tenant_branding_settings: 'tenant_id',
    tenant_social_links: 'tenant_id',
    tenant_invoice_settings: 'tenant_id',
    tenant_pos_settings: 'tenant_id',
    tenant_telegram_settings: 'tenant_id',
    tenant_report_schedules: 'tenant_id',
    default: 'id'
};

// كافة الجداول التابعة لكل مستوى تصدير
const EXPORT_PRESETS = {
    models_only: {
        id: 'models_only',
        label: 'الموديلات فقط',
        icon: 'ph-t-shirt',
        desc: 'الموديلات، التصنيفات، الفئات، المقاسات، الألوان، وأرصدة الألوان والصور',
        tables: ['categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory']
    },
    models_colors: {
        id: 'models_colors',
        label: 'الموديلات والألوان التابعة لها',
        icon: 'ph-palette',
        desc: 'تشمل الموديلات بالإضافة للألوان المرتبطة بها وحالة التوفر والأرصدة',
        tables: ['categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory']
    },
    models_colors_stock: {
        id: 'models_colors_stock',
        label: 'الموديلات والألوان والرصيد الحالي',
        icon: 'ph-boxes',
        desc: 'تشمل الموديلات والألوان والرصيد المتاح حالياً في المخزن',
        tables: ['categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory']
    },
    models_colors_stock_movements: {
        id: 'models_colors_stock_movements',
        label: 'الموديلات والألوان والرصيد وحركاتها',
        icon: 'ph-arrows-left-right',
        desc: 'تشمل الموديلات والألوان والمخزون مع سجّلات جميع حركات المخزون',
        tables: ['categories', 'classes', 'sizes', 'colors', 'class_sizes', 'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory', 'stock_movements']
    },
    invoices_orders: {
        id: 'invoices_orders',
        label: 'الفواتير والأوردرات فقط',
        icon: 'ph-receipt',
        desc: 'تشمل الفواتير وعناصرها، الأوردرات وعناصرها، وسجلات التعديل والمرتجعات',
        tables: ['invoices', 'invoice_items', 'inbound_invoices', 'inbound_invoice_items', 'orders', 'order_items', 'order_logs', 'returns', 'return_items']
    },
    full_system: {
        id: 'full_system',
        label: 'نسخة احتياطية شاملة للمصنع (كافة الجداول ديناميكياً)',
        icon: 'ph-hard-drives',
        desc: 'نسخة شاملة لكل جداول وبيانات المصنع، الموديلات، الإعدادات، الفواتير، والأرصدة ديناميكياً',
        tables: [
            'categories', 'classes', 'sizes', 'colors', 'class_sizes',
            'system_users', 'themes', 'home_settings', 'tenant_branding_settings',
            'tenant_social_links', 'tenant_invoice_settings', 'tenant_pos_settings',
            'tenant_telegram_settings', 'tenant_report_schedules', 'tenant_domains',
            'subscriptions', 'profiles',
            'models', 'model_sizes', 'model_images', 'model_colors_inventory', 'model_inventory',
            'promo_cards', 'inbound_invoices', 'inbound_invoice_items',
            'orders', 'order_items', 'order_item_preparation', 'preparation_status_log', 'order_logs',
            'invoices', 'invoice_items', 'returns', 'return_items', 'inventory_audits', 'inventory_audit_items',
            'stock_movements', 'excel_credits_log', 'system_notifications', 'inventory_notification_queue',
            'system_audit_logs', 'system_backups_log'
        ]
    }
};

// الترتيب الهندسي لإدراج البيانات عند الاستعادة لحماية العلاقات المفتاحية (FK Order)
const RESTORE_TABLE_ORDER = [
    // 1. الأساسيات والتصنيفات والمظاهر والإعدادات
    'categories',
    'classes',
    'sizes',
    'colors',
    'class_sizes',
    'themes',
    'home_settings',
    'tenant_branding_settings',
    'tenant_social_links',
    'tenant_invoice_settings',
    'tenant_pos_settings',
    'tenant_telegram_settings',
    'tenant_report_schedules',
    'tenant_domains',
    'subscriptions',
    'system_users',
    'profiles',
    // 2. الموديلات والمنتجات وتفاصيلها
    'models',
    'model_sizes',
    'model_images',
    'model_colors_inventory',
    'model_inventory',
    'promo_cards',
    // 3. الفواتير والأوردرات والتجهيز
    'inbound_invoices',
    'inbound_invoice_items',
    'orders',
    'order_items',
    'order_item_preparation',
    'preparation_status_log',
    'order_logs',
    'invoices',
    'invoice_items',
    'returns',
    'return_items',
    // 4. الجرد والمخزون والإشعارات
    'inventory_audits',
    'inventory_audit_items',
    'stock_movements',
    'excel_credits_log',
    'system_audit_logs',
    'system_notifications',
    'inventory_notification_queue',
    'system_backups_log'
];

// أسماء الجداول بالعربية للعرض في الواجهة
const TABLE_ARABIC_NAMES = {
    categories: 'التصنيفات الرئيسيّة',
    classes: 'الفئات والأنواع',
    sizes: 'المقاسات',
    colors: 'الألوان المعتمدة',
    class_sizes: 'مقاسات الفئات العمرية',
    system_users: 'حسابات المستخدمين',
    themes: 'مظاهر النظام',
    home_settings: 'إعدادات الموقع والمظهر',
    tenant_branding_settings: 'هوية ومظهر المتجر',
    tenant_social_links: 'روابط التواصل الاجتماعي',
    tenant_invoice_settings: 'إعدادات الفواتير والطباعة',
    tenant_pos_settings: 'نقاط البيع وقارئ الباركود',
    tenant_telegram_settings: 'إشعارات وبوت تليجرام المصنع',
    tenant_report_schedules: 'جدولة التقارير التلقائية',
    tenant_domains: 'نطاقات ودومينات المصنع',
    excel_credits_log: 'سجل رصيد واستخراج إكسل',
    system_audit_logs: 'سجل المراقبة والعمليات',
    system_backups_log: 'سجل النسخ الاحتياطية',
    models: 'الموديلات والمنتجات',
    model_sizes: 'مقاسات الموديلات',
    model_images: 'صور الموديلات',
    model_colors_inventory: 'ألوان الموديلات المتوفرة',
    model_inventory: 'رصيد مخزون الموديلات',
    promo_cards: 'البطاقات الترويجية',
    inbound_invoices: 'فواتير التوريد والموردين',
    inbound_invoice_items: 'عناصر فواتير التوريد',
    orders: 'الأوردرات والمبيعات',
    order_items: 'تفاصيل عناصر الأوردرات',
    order_item_preparation: 'تجهيز عناصر الأوردرات',
    preparation_status_log: 'سجل حالات التجهيز',
    order_logs: 'سجلات تغييرات الأوردرات',
    invoices: 'فواتير المبيعات',
    invoice_items: 'عناصر فواتير المبيعات',
    returns: 'مرتجعات المبيعات',
    return_items: 'عناصر المرتجعات',
    inventory_audits: 'جرد المخزون',
    inventory_audit_items: 'عناصر جرد المخزون',
    stock_movements: 'حركات وسجلات المخزون',
    system_notifications: 'إشعارات النظام',
    inventory_notification_queue: 'طابور تنبيهات المخزون',
    profiles: 'الملفات الشخصية',
    subscriptions: 'اشتراكات وباقات المصنع'
};

let isInitialized = false;
let selectedExportPreset = 'full_system';
let loadedBackupData = null;
let currentRestoreMode = 'upsert'; // 'upsert' or 'replace'
let cloudBackupsList = [];
let computedDiffData = null; // تخزين نتائج الفروقات والمقارنة

// ============================================================
// 🎯 تهيئة الواجهة
// ============================================================
export async function initBackupRestoreView() {
    const user = requireAuth(['owner', 'admin']);
    if (!user) {
        showToast('⛔ ليس لديك صلاحية للوصول لإدارة النسخ الاحتياطي', 'error');
        return;
    }

    if (isInitialized) return;
    isInitialized = true;

    renderBackupRestoreView();
    attachBackupRestoreEvents();
    
    // تحميل سجل النسخ السحابية اليدوية فقط للمصنع
    await fetchCloudBackups();
}

// ============================================================
// 🎨 رسم الواجهة الرئيسية
// ============================================================
function renderBackupRestoreView() {
    const container = document.getElementById('backup-restore-content');
    if (!container) return;

    container.innerHTML = `
        <div class="animate-fade-in relative pb-16 space-y-6 max-w-6xl mx-auto">

            <!-- Header -->
            <div class="flex flex-col md:flex-row gap-4 justify-between items-start md:items-center bg-devo-dark border border-devo-gray p-5 rounded-2xl shadow-sm">
                <div class="flex items-center gap-3.5">
                    <div class="w-12 h-12 rounded-xl bg-devo-orange/10 border border-devo-orange/20 flex items-center justify-center text-devo-orange">
                        <i class="ph ph-database text-2xl"></i>
                    </div>
                    <div>
                        <h2 class="text-xl font-bold text-white flex items-center gap-2">
                            النسخ الاحتياطي واستعادة البيانات
                        </h2>
                        <p class="text-devo-muted text-xs mt-1">تصدير واستعادة دقيقة مع قراءة أسماء المقاسات والفئات وتأمين الروابط المباشرة للسحابة</p>
                    </div>
                </div>
                <div class="flex items-center gap-2 text-xs text-devo-success bg-devo-success/10 border border-devo-success/20 px-3.5 py-2 rounded-xl font-bold">
                    <i class="ph ph-shield-check text-base"></i>
                    النظام جاهز ومحمي بالكامل
                </div>
            </div>

            <!-- Grid: 2 Columns for Export & Restore -->
            <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

                <!-- 📤 كارت تصدير النسخ الاحتياطية -->
                <div class="bg-devo-dark border border-devo-gray rounded-2xl p-6 space-y-5 flex flex-col justify-between shadow-md">
                    <div class="space-y-4">
                        <div class="flex items-center justify-between border-b border-devo-gray pb-4">
                            <h3 class="text-base font-bold text-white flex items-center gap-2">
                                <i class="ph ph-export text-devo-orange text-xl"></i>
                                تصدير نسخة احتياطية محلية
                            </h3>
                            <span class="text-xs text-devo-muted bg-devo-black px-2.5 py-1 rounded-lg border border-devo-gray">تنسيق JSON</span>
                        </div>

                        <p class="text-xs text-devo-muted leading-relaxed">
                            اختر درجة التفاصيل المطلوبة للنسخة الاحتياطية وتصديرها وتحميلها على جهازك الشخصي:
                        </p>

                        <!-- خيارات المستويات -->
                        <div class="space-y-2.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar">
                            ${Object.values(EXPORT_PRESETS).map(preset => `
                                <label class="export-preset-card flex items-start gap-3 p-3.5 rounded-xl border border-devo-gray bg-devo-black/40 hover:border-devo-orange/50 transition-all cursor-pointer ${preset.id === selectedExportPreset ? 'border-devo-orange bg-devo-orange/5 shadow-sm' : ''}">
                                    <input type="radio" name="export-preset" value="${preset.id}" ${preset.id === selectedExportPreset ? 'checked' : ''} class="mt-1 accent-devo-orange">
                                    <div class="flex-1 space-y-1">
                                        <div class="flex items-center justify-between">
                                            <span class="text-sm font-bold text-white flex items-center gap-2">
                                                <i class="ph ${preset.icon} text-devo-orange"></i>
                                                ${preset.label}
                                            </span>
                                            <span class="text-[10px] text-devo-muted bg-devo-gray/50 px-2 py-0.5 rounded font-mono">${preset.tables.length} جداول</span>
                                        </div>
                                        <p class="text-xs text-devo-muted">${preset.desc}</p>
                                    </div>
                                </label>
                            `).join('')}
                        </div>
                    </div>

                    <button
                        id="btn-trigger-export"
                        class="w-full py-3.5 px-4 bg-devo-orange hover:bg-devo-orange-hover text-white rounded-xl font-bold text-sm transition-all duration-200 shadow-lg shadow-devo-orange/10 flex items-center justify-center gap-2 active:scale-[0.99] cursor-pointer"
                    >
                        <i class="ph ph-download-simple text-lg"></i>
                        <span>تصدير وتحميل النسخة الآن</span>
                    </button>
                </div>

                <!-- 📥 كارت استعادة البيانات من ملف مع معاينة الفروقات -->
                <div class="bg-devo-dark border border-devo-gray rounded-2xl p-6 space-y-5 flex flex-col justify-between shadow-md">
                    <div class="space-y-4">
                        <div class="flex items-center justify-between border-b border-devo-gray pb-4">
                            <h3 class="text-base font-bold text-white flex items-center gap-2">
                                <i class="ph ph-arrow-counter-clockwise text-devo-success text-xl"></i>
                                استعادة البيانات ومعاينة الفروقات
                            </h3>
                            <span class="text-xs text-devo-muted bg-devo-black px-2.5 py-1 rounded-lg border border-devo-gray">فحص واستعادة جزئية</span>
                        </div>

                        <p class="text-xs text-devo-muted leading-relaxed">
                            قم بسحب وإسقاط ملف النسخة الاحتياطية (.json) لتقييم الفروقات وتحديد عناصر معينة للاستعادة:
                        </p>

                        <!-- منطقة رفع الملف Dropzone -->
                        <div id="restore-dropzone" class="border-2 border-dashed border-devo-gray hover:border-devo-success/60 bg-devo-black/30 rounded-2xl p-6 flex flex-col items-center justify-center text-center space-y-3 cursor-pointer transition-all duration-200 group relative">
                            <input type="file" id="restore-file-input" accept=".json" class="absolute inset-0 opacity-0 cursor-pointer w-full h-full">
                            <div class="w-14 h-14 rounded-2xl bg-devo-gray/50 group-hover:bg-devo-success/10 group-hover:text-devo-success text-devo-muted flex items-center justify-center transition-all duration-200">
                                <i class="ph ph-file-arrow-down text-3xl"></i>
                            </div>
                            <div>
                                <p class="text-sm font-bold text-white group-hover:text-devo-success transition-colors">اضغط هنا لاختيار الملف أو اسحبه إلى هنا</p>
                                <p class="text-xs text-devo-muted mt-1">يدعم فقط ملفات النسخ الاحتياطي الخاصة بنظام DEVO (.json)</p>
                            </div>
                        </div>

                        <!-- كارت معاينة ومعلومات الملف المرفوع (مخفي افتراضياً) -->
                        <div id="file-inspection-card" class="hidden bg-devo-black/60 border border-devo-gray rounded-xl p-4 space-y-3 animate-fade-in">
                            <div class="flex items-center justify-between border-b border-devo-gray/60 pb-2.5">
                                <div class="flex items-center gap-2 truncate max-w-[70%]">
                                    <i class="ph ph-file-js text-devo-orange text-xl shrink-0"></i>
                                    <span id="inspect-filename" class="text-xs font-bold text-white truncate">backup.json</span>
                                </div>
                                <span id="inspect-backup-type" class="text-[11px] font-bold text-devo-success bg-devo-success/10 border border-devo-success/20 px-2.5 py-0.5 rounded-lg">نوع النسخة: كاملة</span>
                            </div>

                            <div class="grid grid-cols-2 gap-2 text-xs">
                                <div>
                                    <span class="text-devo-muted">تاريخ النسخة:</span>
                                    <p id="inspect-date" class="text-white font-mono font-medium mt-0.5">-</p>
                                </div>
                                <div>
                                    <span class="text-devo-muted">إجمالي السجلات:</span>
                                    <p id="inspect-total-records" class="text-devo-orange font-bold font-mono mt-0.5">0 سجل</p>
                                </div>
                            </div>

                            <!-- زر معاينة الفروقات المتقدمة -->
                            <div class="pt-1">
                                <button
                                    id="btn-open-diff-modal"
                                    class="w-full py-2.5 px-3 bg-devo-orange/15 hover:bg-devo-orange text-devo-orange hover:text-white border border-devo-orange/30 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm"
                                >
                                    <i class="ph ph-git-diff text-base"></i>
                                    <span>🔍 معاينة الفروقات وتحديد عناصر مخصصة للاستعادة</span>
                                </button>
                            </div>

                            <!-- اختيار طريقة الاستعادة -->
                            <div class="border-t border-devo-gray/60 pt-3 space-y-2">
                                <span class="text-xs font-bold text-white flex items-center gap-1.5">
                                    <i class="ph ph-sliders text-devo-orange"></i> طريقة معالجة البيانات:
                                </span>
                                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                    <label class="flex items-center gap-2 p-2 rounded-lg border border-devo-gray bg-devo-dark hover:border-devo-success/50 cursor-pointer">
                                        <input type="radio" name="restore-mode" value="upsert" checked class="accent-devo-success">
                                        <div>
                                            <p class="text-white font-bold">دمج وتحديث (آمن)</p>
                                            <p class="text-[10px] text-devo-muted">إضافة الجديد وتحديث الموجود</p>
                                        </div>
                                    </label>
                                    <label class="flex items-center gap-2 p-2 rounded-lg border border-devo-gray bg-devo-dark hover:border-devo-error/50 cursor-pointer">
                                        <input type="radio" name="restore-mode" value="replace" class="accent-devo-error">
                                        <div>
                                            <p class="text-devo-error font-bold">إعادة استبدال كاملة</p>
                                            <p class="text-[10px] text-devo-muted">حذف الجداول المعنية واستبدالها</p>
                                        </div>
                                    </label>
                                </div>
                            </div>
                        </div>

                    </div>

                    <button
                        id="btn-trigger-restore"
                        disabled
                        class="w-full py-3.5 px-4 bg-devo-gray text-devo-muted rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-not-allowed opacity-60"
                    >
                        <i class="ph ph-play-circle text-lg"></i>
                        <span>بدء عملية استعادة كافة البيانات</span>
                    </button>
                </div>

            </div>

        </div>

        <!-- ===== MODAL معاينة الفروقات واستعادة العناصر المخصصة ===== -->
        <div id="diff-selective-modal" class="fixed inset-0 z-[9999] items-center justify-center bg-black/80 backdrop-blur-md" style="display:none">
            <div class="w-full max-w-4xl mx-4 bg-devo-dark border border-devo-gray rounded-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[90vh]">

                <!-- رأس الـ Modal -->
                <div class="flex items-center justify-between p-5 border-b border-devo-gray bg-devo-black/40 shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-xl bg-devo-orange/15 flex items-center justify-center text-devo-orange">
                            <i class="ph ph-git-diff text-2xl"></i>
                        </div>
                        <div>
                            <p class="text-base font-bold text-white">معاينة الفروقات والاستعادة المخصصة للعناصر</p>
                            <p class="text-xs text-devo-muted">قارن بين بيانات الملف وبيانات السيرفر الحالية وحدد عناصر معينة فقط لاستعادتها</p>
                        </div>
                    </div>
                    <button id="btn-close-diff-modal" class="w-8 h-8 rounded-lg bg-devo-gray hover:bg-devo-grayHover flex items-center justify-center text-devo-muted hover:text-white transition-colors cursor-pointer">
                        <i class="ph ph-x text-sm"></i>
                    </button>
                </div>

                <!-- محتوى الفروقات الداخلي -->
                <div class="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">

                    <!-- 1. شريط إحصائيات المقارنة (Diff Stats Bar) -->
                    <div class="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <div class="bg-devo-success/10 border border-devo-success/30 rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <span class="block text-devo-muted text-xs mb-1">سجلات جديدة ستُضاف</span>
                                <span class="text-2xl font-black text-devo-success font-mono" id="diff-stat-new">0</span>
                            </div>
                            <i class="ph ph-plus-circle text-3xl text-devo-success opacity-80"></i>
                        </div>

                        <div class="bg-devo-warning/10 border border-devo-warning/30 rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <span class="block text-devo-muted text-xs mb-1">سجلات سيتعدل محتواها</span>
                                <span class="text-2xl font-black text-devo-warning font-mono" id="diff-stat-modified">0</span>
                            </div>
                            <i class="ph ph-pencil-simple-line text-3xl text-devo-warning opacity-80"></i>
                        </div>

                        <div class="bg-devo-black/60 border border-devo-gray rounded-xl p-4 flex items-center justify-between">
                            <div>
                                <span class="text-devo-muted text-xs block mb-1">سجلات متطابقة بالضبط</span>
                                <span class="text-2xl font-black text-devo-muted font-mono" id="diff-stat-identical">0</span>
                            </div>
                            <i class="ph ph-equals text-3xl text-devo-muted opacity-50"></i>
                        </div>
                    </div>

                    <!-- 2. قائمة شجرة الجداول والعناصر القابلة للتحديد -->
                    <div class="space-y-3">
                        <div class="flex items-center justify-between pb-1">
                            <span class="text-xs font-bold text-white flex items-center gap-2">
                                <i class="ph ph-list-checks text-devo-orange text-base"></i>
                                تحديد الجداول والعناصر المراد استعادتها:
                            </span>
                            <div class="flex items-center gap-2 text-xs">
                                <button id="btn-diff-select-all" class="text-devo-orange hover:underline font-bold">تحديد الكل</button>
                                <span class="text-devo-muted">•</span>
                                <button id="btn-diff-deselect-all" class="text-devo-muted hover:text-white">إلغاء الكل</button>
                            </div>
                        </div>

                        <div id="diff-tables-accordion-container" class="space-y-3">
                            <div class="p-8 text-center text-devo-muted text-xs flex flex-col items-center gap-2">
                                <i class="ph ph-spinner animate-spin text-2xl text-devo-orange"></i>
                                <span>جاري حساب المقارنة مع قاعدة البيانات الحية...</span>
                            </div>
                        </div>
                    </div>

                </div>

                <!-- أسفل الـ Modal مع زر الاستعادة الجزئية -->
                <div class="p-5 border-t border-devo-gray bg-devo-black/60 flex items-center justify-between shrink-0">
                    <span class="text-xs text-devo-muted">سيتم استعادة العناصر المفحوصة والمحددة فقط</span>
                    <div class="flex items-center gap-3">
                        <button id="btn-diff-cancel" class="px-5 py-2.5 rounded-xl border border-devo-gray text-devo-muted hover:bg-devo-gray hover:text-white transition-colors text-xs font-medium cursor-pointer">
                            إلغاء
                        </button>
                        <button id="btn-execute-selective-restore" class="px-6 py-2.5 rounded-xl bg-devo-success hover:bg-emerald-600 text-white transition-colors text-xs font-bold flex items-center gap-2 cursor-pointer shadow-lg active:scale-95">
                            <i class="ph ph-check-square-offset text-base"></i>
                            <span>استعادة العناصر المحددة فقط</span>
                        </button>
                    </div>
                </div>

            </div>
        </div>

        <!-- ===== MODAL تقدم عملية التصدير أوالاستعادة ===== -->
        <div id="backup-progress-modal" class="fixed inset-0 z-[9999] items-center justify-center bg-black/80 backdrop-blur-md" style="display:none">
            <div class="w-full max-w-xl mx-4 bg-devo-dark border border-devo-gray rounded-2xl shadow-2xl overflow-hidden animate-fade-in">

                <!-- شريط التقدم المئوي الأعلى -->
                <div class="h-1.5 bg-devo-gray">
                    <div id="progress-bar-fill" class="h-full bg-devo-orange transition-all duration-300" style="width: 0%"></div>
                </div>

                <!-- رأس الـ Modal -->
                <div class="flex items-center justify-between p-5 border-b border-devo-gray">
                    <div class="flex items-center gap-3">
                        <div id="progress-modal-icon-container" class="w-10 h-10 rounded-xl bg-devo-orange/15 flex items-center justify-center text-devo-orange">
                            <i id="progress-modal-icon" class="ph ph-spinner animate-spin text-xl"></i>
                        </div>
                        <div>
                            <p class="text-sm font-bold text-white" id="progress-modal-title">جاري تنفيذ العملية...</p>
                            <p class="text-xs text-devo-muted" id="progress-modal-subtitle">يرجى الانتظار ولا تغلق الشاشة</p>
                        </div>
                    </div>
                    <span id="progress-modal-percentage" class="text-base font-black text-devo-orange font-mono">0%</span>
                </div>

                <!-- المحتوى الداخلي -->
                <div class="p-6 space-y-5">

                    <!-- الإحصائية السريعة الحالية -->
                    <div class="bg-devo-black/60 border border-devo-gray rounded-xl p-4 flex items-center justify-between text-xs">
                        <div>
                            <span class="text-devo-muted">الجدول الحالي:</span>
                            <p id="progress-current-table" class="text-white font-bold text-sm mt-0.5">-</p>
                        </div>
                        <div class="text-left">
                            <span class="text-devo-muted">السجلات المعالجة:</span>
                            <p id="progress-records-counter" class="text-devo-orange font-bold font-mono text-sm mt-0.5">0 / 0</p>
                        </div>
                    </div>

                    <!-- قائمة خطوات وسجلات الجداول الحية -->
                    <div class="space-y-1">
                        <p class="text-xs font-bold text-devo-muted mb-2 flex items-center justify-between">
                            <span>تفاصيل الجداول:</span>
                            <span id="progress-time-elapsed" class="font-mono text-[11px]">00:00</span>
                        </p>
                        <div id="progress-steps-list" class="max-h-48 overflow-y-auto space-y-2 pr-1 custom-scrollbar">
                            <!-- Live table status steps -->
                        </div>
                    </div>

                    <!-- سجل التنبيهات والأخطاء (إن وُجد) -->
                    <div id="progress-errors-container" class="hidden bg-devo-error/10 border border-devo-error/30 rounded-xl p-3 text-xs space-y-1.5">
                        <p class="font-bold text-devo-error flex items-center gap-1.5">
                            <i class="ph ph-warning"></i> تنبيهات أثناء العملية:
                        </p>
                        <div id="progress-errors-list" class="text-devo-muted max-h-20 overflow-y-auto custom-scrollbar space-y-1"></div>
                    </div>

                    <!-- زر الإغلاق والإنهاء -->
                    <div id="progress-modal-footer" class="hidden pt-2">
                        <button
                            id="btn-close-progress-modal"
                            class="w-full py-3 bg-devo-orange hover:bg-devo-orange-hover text-white font-bold text-sm rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                        >
                            تم إكمال العملية بنجاح — إغلاق
                        </button>
                    </div>

                </div>

            </div>
        </div>
    `;
}

// ============================================================
// 🎮 ربط الأحداث بالواجهة
// ============================================================
function attachBackupRestoreEvents() {
    document.querySelectorAll('input[name="export-preset"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            selectedExportPreset = e.target.value;
            document.querySelectorAll('.export-preset-card').forEach(card => {
                card.classList.remove('border-devo-orange', 'bg-devo-orange/5');
            });
            e.target.closest('.export-preset-card')?.classList.add('border-devo-orange', 'bg-devo-orange/5');
        });
    });

    document.getElementById('btn-trigger-export')?.addEventListener('click', handleExportProcess);

    document.getElementById('btn-create-cloud-backup')?.addEventListener('click', () => {
        executeCloudAutoBackup(true);
    });

    const fileInput = document.getElementById('restore-file-input');
    fileInput?.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) handleFileSelection(file);
    });

    const dropzone = document.getElementById('restore-dropzone');
    if (dropzone) {
        ['dragenter', 'dragover'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.classList.add('border-devo-success', 'bg-devo-success/5');
            });
        });
        ['dragleave', 'drop'].forEach(eventName => {
            dropzone.addEventListener(eventName, (e) => {
                e.preventDefault();
                dropzone.classList.remove('border-devo-success', 'bg-devo-success/5');
            });
        });
        dropzone.addEventListener('drop', (e) => {
            const file = e.dataTransfer?.files?.[0];
            if (file) {
                if (fileInput) fileInput.files = e.dataTransfer.files;
                handleFileSelection(file);
            }
        });
    }

    document.getElementById('btn-open-diff-modal')?.addEventListener('click', openDiffAndSelectiveModal);

    document.getElementById('btn-close-diff-modal')?.addEventListener('click', closeDiffModal);
    document.getElementById('btn-diff-cancel')?.addEventListener('click', closeDiffModal);
    document.getElementById('btn-diff-select-all')?.addEventListener('click', () => toggleAllDiffCheckboxes(true));
    document.getElementById('btn-diff-deselect-all')?.addEventListener('click', () => toggleAllDiffCheckboxes(false));
    document.getElementById('btn-execute-selective-restore')?.addEventListener('click', handleSelectiveRestoreExecution);

    document.getElementById('btn-trigger-restore')?.addEventListener('click', () => handleRestoreProcess(null));

    document.getElementById('btn-close-progress-modal')?.addEventListener('click', () => {
        closeProgressModal();
    });
}

// ============================================================
// 🎯 حساب ومعاينة الفروقات واستعادة العناصر المخصصة (Diff Engine)
// ============================================================
async function openDiffAndSelectiveModal() {
    if (!loadedBackupData || !loadedBackupData.tables) {
        showToast('يرجى رفع ملف نسخة احتياطية صالح أولاً', 'error');
        return;
    }

    const modal = document.getElementById('diff-selective-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    document.getElementById('diff-stat-new').textContent = '...';
    document.getElementById('diff-stat-modified').textContent = '...';
    document.getElementById('diff-stat-identical').textContent = '...';
    document.getElementById('diff-tables-accordion-container').innerHTML = `
        <div class="p-8 text-center text-devo-muted text-xs flex flex-col items-center gap-2">
            <i class="ph ph-spinner animate-spin text-2xl text-devo-orange"></i>
            <span>جاري مقارنة ملف النسخة الاحتياطية وقراءة أسماء المنتجات والمقاسات من السيرفر...</span>
        </div>
    `;

    computedDiffData = await computeBackupDiffStats(loadedBackupData.tables);
    renderDiffModalContent(computedDiffData);
}

// محرك فحص وقراءة أسماء السجلات والمقارنة
async function computeBackupDiffStats(backupTables) {
    const tableKeys = Object.keys(backupTables);
    let totalNew = 0;
    let totalModified = 0;
    let totalIdentical = 0;

    // بناء خرائط التسمية التوضيحية لفك التشفير وإظهار أسماء المقاسات والفئات المباشرة
    const lookups = {
        classes: {},
        sizes: {},
        colors: {},
        models: {}
    };

    try {
        const [clRes, szRes, coRes, moRes] = await Promise.all([
            supabase.from('classes').select('id, name'),
            supabase.from('sizes').select('id, name'),
            supabase.from('colors').select('id, name'),
            supabase.from('models').select('id, name, system_code')
        ]);

        if (clRes.data) clRes.data.forEach(r => lookups.classes[r.id] = r.name);
        if (szRes.data) szRes.data.forEach(r => lookups.sizes[r.id] = r.name);
        if (coRes.data) coRes.data.forEach(r => lookups.colors[r.id] = r.name);
        if (moRes.data) moRes.data.forEach(r => lookups.models[r.id] = r.name || r.system_code);
    } catch (e) {
        console.warn('Could not fetch lookup maps for diff labels:', e);
    }

    const diffResult = {
        summary: { new: 0, modified: 0, identical: 0 },
        tables: {},
        lookups
    };

    for (const tableName of tableKeys) {
        const backupRows = backupTables[tableName];
        if (!Array.isArray(backupRows) || backupRows.length === 0) continue;

        try {
            const liveRows = await fetchAllTableRecords(tableName);
            const liveMap = new Map();

            liveRows.forEach(r => {
                if (r.id) liveMap.set(String(r.id), r);
                else if (r.setting_key) liveMap.set(String(r.setting_key), r);
                else if (r.class_id && r.size_id) liveMap.set(`${r.class_id}_${r.size_id}`, r);
                else if (r.model_id && r.size_id) liveMap.set(`${r.model_id}_${r.size_id}`, r);
                else if (r.model_id && r.color_id) liveMap.set(`${r.model_id}_${r.color_id}`, r);
            });

            const tableDiff = {
                newItems: [],
                modifiedItems: [],
                identicalItems: []
            };

            backupRows.forEach(backupRow => {
                let pk = null;
                if (backupRow.id) pk = String(backupRow.id);
                else if (backupRow.setting_key) pk = String(backupRow.setting_key);
                else if (backupRow.class_id && backupRow.size_id) pk = `${backupRow.class_id}_${backupRow.size_id}`;
                else if (backupRow.model_id && backupRow.size_id) pk = `${backupRow.model_id}_${backupRow.size_id}`;
                else if (backupRow.model_id && backupRow.color_id) pk = `${backupRow.model_id}_${backupRow.color_id}`;

                const liveRow = pk ? liveMap.get(pk) : null;

                if (!liveRow) {
                    tableDiff.newItems.push(backupRow);
                    totalNew++;
                } else {
                    const isChanged = Object.keys(backupRow).some(key => {
                        const valA = backupRow[key];
                        const valB = liveRow[key];
                        if (valA === null && valB === null) return false;
                        if (typeof valA === 'object' || typeof valB === 'object') {
                            return JSON.stringify(valA) !== JSON.stringify(valB);
                        }
                        return String(valA) !== String(valB);
                    });

                    if (isChanged) {
                        tableDiff.modifiedItems.push({ backupRow, liveRow });
                        totalModified++;
                    } else {
                        tableDiff.identicalItems.push(backupRow);
                        totalIdentical++;
                    }
                }
            });

            diffResult.tables[tableName] = tableDiff;

        } catch (e) {
            console.warn(`Could not compute diff for ${tableName}:`, e);
        }
    }

    diffResult.summary = { new: totalNew, modified: totalModified, identical: totalIdentical };
    return diffResult;
}

function renderDiffModalContent(diffData) {
    document.getElementById('diff-stat-new').textContent = diffData.summary.new.toLocaleString('ar-EG');
    document.getElementById('diff-stat-modified').textContent = diffData.summary.modified.toLocaleString('ar-EG');
    document.getElementById('diff-stat-identical').textContent = diffData.summary.identical.toLocaleString('ar-EG');

    const container = document.getElementById('diff-tables-accordion-container');
    if (!container) return;

    const tableNames = Object.keys(diffData.tables);
    if (tableNames.length === 0) {
        container.innerHTML = `<div class="p-6 text-center text-devo-muted text-xs">لا توجد جداول قابلة للمقارنة</div>`;
        return;
    }

    container.innerHTML = tableNames.map(tableName => {
        const tableDiff = diffData.tables[tableName];
        const arabicName = TABLE_ARABIC_NAMES[tableName] || tableName;
        const totalItemsCount = tableDiff.newItems.length + tableDiff.modifiedItems.length + tableDiff.identicalItems.length;

        return `
            <div class="border border-devo-gray bg-devo-black/40 rounded-xl overflow-hidden">
                <!-- رأس الجدول بالشجرة -->
                <div class="flex items-center justify-between p-3.5 bg-devo-black/70 border-b border-devo-gray/50 cursor-pointer">
                    <label class="flex items-center gap-3 cursor-pointer select-none">
                        <input type="checkbox" data-table-checkbox="${tableName}" checked class="accent-devo-orange w-4 h-4 rounded">
                        <span class="text-sm font-bold text-white flex items-center gap-2">
                            <i class="ph ph-table text-devo-orange"></i>
                            ${arabicName} (${tableName})
                        </span>
                    </label>

                    <div class="flex items-center gap-2 text-[11px]">
                        ${tableDiff.newItems.length > 0 ? `<span class="bg-devo-success/10 text-devo-success border border-devo-success/20 px-2 py-0.5 rounded font-mono font-bold">+${tableDiff.newItems.length} جديد</span>` : ''}
                        ${tableDiff.modifiedItems.length > 0 ? `<span class="bg-devo-warning/10 text-devo-warning border border-devo-warning/20 px-2 py-0.5 rounded font-mono font-bold">~${tableDiff.modifiedItems.length} معدّل</span>` : ''}
                        <span class="text-devo-muted font-mono">(${totalItemsCount} سجل)</span>
                    </div>
                </div>

                <!-- قائمة العناصر للتحديد الفردي مع إظهار الأسماء الواضحة والمقاسات -->
                <div class="p-3 space-y-1.5 bg-devo-dark/50 max-h-48 overflow-y-auto custom-scrollbar">
                    ${tableDiff.newItems.map((item, idx) => `
                        <label class="flex items-center justify-between p-2 rounded-lg bg-devo-black/50 border border-devo-gray/40 hover:border-devo-success/40 text-xs cursor-pointer">
                            <div class="flex items-center gap-2 truncate">
                                <input type="checkbox" data-record-table="${tableName}" data-record-index="new_${idx}" checked class="accent-devo-success">
                                <span class="text-white truncate font-medium">${getItemDisplayLabel(tableName, item, diffData.lookups)}</span>
                            </div>
                            <span class="text-[10px] bg-devo-success/10 text-devo-success px-2 py-0.5 rounded font-bold shrink-0">سجل جديد</span>
                        </label>
                    `).join('')}

                    ${tableDiff.modifiedItems.map((mod, idx) => `
                        <label class="flex items-center justify-between p-2 rounded-lg bg-devo-black/50 border border-devo-gray/40 hover:border-devo-warning/40 text-xs cursor-pointer">
                            <div class="flex items-center gap-2 truncate">
                                <input type="checkbox" data-record-table="${tableName}" data-record-index="mod_${idx}" checked class="accent-devo-warning">
                                <span class="text-white truncate font-medium">${getItemDisplayLabel(tableName, mod.backupRow, diffData.lookups)}</span>
                            </div>
                            <span class="text-[10px] bg-devo-warning/10 text-devo-warning px-2 py-0.5 rounded font-bold shrink-0">سيتم التحديث</span>
                        </label>
                    `).join('')}

                    ${tableDiff.newItems.length === 0 && tableDiff.modifiedItems.length === 0 ? `
                        <p class="text-[11px] text-devo-muted text-center py-2">جميع السجلات متطابقة كلياً مع الحية بالسيستم</p>
                    ` : ''}
                </div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('input[data-table-checkbox]').forEach(tableCheckbox => {
        tableCheckbox.addEventListener('change', (e) => {
            const tbl = e.target.getAttribute('data-table-checkbox');
            const isChecked = e.target.checked;
            container.querySelectorAll(`input[data-record-table="${tbl}"]`).forEach(cb => {
                cb.checked = isChecked;
            });
        });
    });
}

// دالة فك التشفير وتوليد الأسماء العربية الواضحة لكافة العناصر بدلاً من "سجل رقمي"
function getItemDisplayLabel(tableName, item, lookups = {}) {
    if (!item) return 'سجل خالي';

    // 1. الأسماء المباشرة
    if (item.name) return item.name;
    if (item.full_name) return item.full_name;
    if (item.title) return item.title;

    // 2. الأوردرات والفواتير
    if (tableName === 'orders' || item.customer_name) {
        return `أوردر: ${item.customer_name || 'عميل'} (رقم: ${item.invoice_number || 'بدون'})`;
    }
    if (tableName === 'invoices' || item.customer_phone_1) {
        return `فاتورة: ${item.customer_name || 'مورد/عميل'} (#${item.invoice_number || ''})`;
    }

    // 3. الموديلات
    if (item.system_code) {
        return `موديل: ${item.name || ''} (كود: ${item.system_code})`;
    }

    // 4. class_sizes (مقاسات الفئات)
    if (tableName === 'class_sizes' || (item.class_id && item.size_id)) {
        const className = lookups.classes?.[item.class_id] || 'فئة';
        const sizeName = lookups.sizes?.[item.size_id] || 'مقاس';
        return `فئة: ${className} - مقاس: ${sizeName}`;
    }

    // 5. model_sizes (مقاسات الموديلات)
    if (tableName === 'model_sizes' || (item.model_id && item.size_id && !item.color_id)) {
        const modelName = lookups.models?.[item.model_id] || 'موديل';
        const sizeName = lookups.sizes?.[item.size_id] || 'مقاس';
        return `موديل: ${modelName} - مقاس: ${sizeName}`;
    }

    // 6. model_colors_inventory & model_inventory (ألوان وأرصدة الموديلات)
    if (tableName === 'model_colors_inventory' || tableName === 'model_inventory' || (item.model_id && item.color_id)) {
        const modelName = lookups.models?.[item.model_id] || 'موديل';
        const colorName = lookups.colors?.[item.color_id] || 'لون';
        const qty = item.available_series ?? item.available_series_count ?? 0;
        return `موديل: ${modelName} - لون: ${colorName} (رصيد: ${qty})`;
    }

    // 7. stock_movements (حركات المخزون)
    if (tableName === 'stock_movements') {
        const modelName = lookups.models?.[item.model_id] || 'موديل';
        const colorName = lookups.colors?.[item.color_id] || 'لون';
        const typeText = item.movement_type === 'in' ? 'إدخال' : 'صرف';
        return `حركة ${typeText}: ${item.quantity || 0} قطعة - ${modelName} (${colorName})`;
    }

    // 8. invoice_items & order_items
    if (tableName === 'invoice_items' || tableName === 'order_items') {
        const modelName = lookups.models?.[item.model_id] || 'موديل';
        const colorName = lookups.colors?.[item.color_id] || 'لون';
        const qty = item.quantity || item.series_quantity || 0;
        return `بند: ${modelName} (${colorName}) - كمية: ${qty}`;
    }

    // 9. الإعدادات والمستخدمين والألوان
    if (item.setting_key) return `إعداد: ${item.setting_key}`;
    if (item.username) return `مستخدم: ${item.username} (${item.full_name || ''})`;
    if (item.color_code) return `لون: ${item.name || item.color_code}`;

    // 10. Fallback بالعربية بدلاً من الجمل المبهمة
    const arTable = TABLE_ARABIC_NAMES[tableName] || tableName;
    if (item.id) return `${arTable} #${String(item.id).substring(0, 8)}`;
    return `${arTable} (سجل جديد)`;
}

function toggleAllDiffCheckboxes(checkState) {
    const modal = document.getElementById('diff-selective-modal');
    if (!modal) return;
    modal.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = checkState);
}

function closeDiffModal() {
    const modal = document.getElementById('diff-selective-modal');
    if (modal) modal.style.display = 'none';
}

// تنفيذ الاستعادة المخصصة للعناصر المحددة فقط
async function handleSelectiveRestoreExecution() {
    if (!loadedBackupData || !computedDiffData) return;

    const selectedTablesPayload = {};
    let totalSelectedItemsCount = 0;

    Object.keys(computedDiffData.tables).forEach(tableName => {
        const tableDiff = computedDiffData.tables[tableName];
        const selectedItems = [];

        tableDiff.newItems.forEach((item, idx) => {
            const cb = document.querySelector(`input[data-record-table="${tableName}"][data-record-index="new_${idx}"]`);
            if (cb && cb.checked) selectedItems.push(item);
        });

        tableDiff.modifiedItems.forEach((mod, idx) => {
            const cb = document.querySelector(`input[data-record-table="${tableName}"][data-record-index="mod_${idx}"]`);
            if (cb && cb.checked) selectedItems.push(mod.backupRow);
        });

        if (selectedItems.length > 0) {
            selectedTablesPayload[tableName] = selectedItems;
            totalSelectedItemsCount += selectedItems.length;
        }
    });

    if (totalSelectedItemsCount === 0) {
        showToast('يرجى تحديد عنصر واحد على الأقل للاستعادة الجزئية', 'warning');
        return;
    }

    closeDiffModal();

    await handleRestoreProcess({
        meta: { preset_name: 'عناصر مخصصة مختارة' },
        tables: selectedTablesPayload
    });
}

// دالة جلب اسم المصنع الحالي للمصنع المعني بالنسخة
async function getTenantName() {
    const currentTenantId = getCurrentTenantId();
    if (!currentTenantId) return 'المصنع';

    try {
        const { data: tenant } = await supabase
            .from('tenants')
            .select('name')
            .eq('id', currentTenantId)
            .maybeSingle();

        if (tenant && tenant.name) return tenant.name;
    } catch (e) {}

    try {
        const { data: setting } = await supabase
            .from('home_settings')
            .select('setting_value')
            .eq('tenant_id', currentTenantId)
            .eq('setting_key', 'site_title')
            .maybeSingle();

        if (setting && setting.setting_value) return setting.setting_value;
    } catch (e) {}

    return `مصنع_${currentTenantId.substring(0, 6)}`;
}

// ============================================================
// 📤 عملية تصدير النسخة الاحتياطية المحلية
// ============================================================
async function handleExportProcess() {
    const preset = EXPORT_PRESETS[selectedExportPreset];
    if (!preset) {
        showToast('يرجى اختيار مستوى التصدير أولاً', 'error');
        return;
    }

    const currentTenantId = getCurrentTenantId();
    const tenantName = await getTenantName();
    const safeTenantName = tenantName.replace(/[\s\/\\]+/g, '_');

    const backupPayload = await generateBackupPayload(preset);
    if (!backupPayload) return;

    if (backupPayload.meta) {
        backupPayload.meta.tenant_id = currentTenantId;
        backupPayload.meta.tenant_name = tenantName;
    }

    // 1. تنزيل الملف محلياً للمستخدم على جهازه باسم المصنع والتاريخ
    const filename = `backup_${safeTenantName}_${preset.id}_${getFormattedDateStr()}.json`;
    downloadJsonFile(backupPayload, filename);

    // 2. إرسال ملف النسخة الاحتياطية المباشر فورياً إلى جروب/بوت التليجرام الخاص بالمصنع لحفظه هناك مجاناً وبدون استهلاك مساحة Supabase
    try {
        const jsonContent = JSON.stringify(backupPayload);
        const fileBlob = new Blob([jsonContent], { type: 'application/json' });
        const fileSize = fileBlob.size;

        await sendTelegramBackupNotification(backupPayload.meta, fileSize, '', fileBlob, filename);
        showToast('تم تنزيل النسخة محلياً وإرسال الملف المباشر إلى Telegram بنجاح 📱📥✅', 'success');

    } catch (tgErr) {
        console.warn('Could not auto-send export to Telegram:', tgErr);
        showToast('تم تصدير وتنزيل النسخة بنجاح ✅ (تنبيه: لم يتوفر اتصال التليجرام)', 'success');
    }
}

const SYSTEM_SECURITY_SALT = 'ULTRASOFT_SECURE_BACKUP_TOKEN_v2.5';

// ============================================================
// 🔐 المحرك التشفيري المتقدم المعتمد على Web Crypto API (AES-256-GCM)
// ============================================================

// 1. جلب المفتاح السري المخصص لمصنع المستخدم لحظياً من الداتابيز
async function fetchTenantEncryptionKey() {
    const currentTenantId = getCurrentTenantId();
    if (!currentTenantId) return null;

    try {
        const { data: key, error } = await supabase
            .rpc('get_tenant_backup_encryption_key', { p_tenant_id: currentTenantId });

        if (error || !key) {
            console.warn('RPC key fetch notice, using fallback hash key:', error?.message);
            return `ULTRASOFT_SALT_${currentTenantId.replace(/-/g, '')}`;
        }
        return key;
    } catch (e) {
        console.error('Error fetching tenant encryption key:', e);
        return `ULTRASOFT_SALT_${currentTenantId.replace(/-/g, '')}`;
    }
}

// 2. اشتقاق مفتاح التشفير CryptoKey من السلسلة النصية
async function deriveCryptoKey(secretKeyStr, saltUint8) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
        'raw',
        encoder.encode(secretKeyStr),
        'PBKDF2',
        false,
        ['deriveKey']
    );

    return await window.crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: saltUint8,
            iterations: 100000,
            hash: 'SHA-256'
        },
        keyMaterial,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt', 'decrypt']
    );
}

// 3. تشفير البيانات النصية بـ AES-256-GCM وتدمير المفتاح فوراً من الذاكرة
async function encryptBackupPayload(payloadObj) {
    let secretKeyStr = await fetchTenantEncryptionKey();
    if (!secretKeyStr) return payloadObj;

    try {
        const salt = window.crypto.getRandomValues(new Uint8Array(16));
        const iv = window.crypto.getRandomValues(new Uint8Array(12));
        const cryptoKey = await deriveCryptoKey(secretKeyStr, salt);

        const encoder = new TextEncoder();
        const jsonStr = JSON.stringify(payloadObj.tables);
        const encodedData = encoder.encode(jsonStr);

        const encryptedBuffer = await window.crypto.subtle.encrypt(
            { name: 'AES-GCM', iv: iv },
            cryptoKey,
            encodedData
        );

        // 🔒 تدمير المفتاح النصي فوراً من الذاكرة للحماية
        secretKeyStr = null;

        const encryptedArray = Array.from(new Uint8Array(encryptedBuffer));
        const encryptedHex = encryptedArray.map(b => b.toString(16).padStart(2, '0')).join('');

        const saltHex = Array.from(salt).map(b => b.toString(16).padStart(2, '0')).join('');
        const ivHex = Array.from(iv).map(b => b.toString(16).padStart(2, '0')).join('');

        return {
            meta: {
                ...payloadObj.meta,
                is_encrypted: true,
                crypto: {
                    algo: 'AES-256-GCM',
                    iv: ivHex,
                    salt: saltHex
                }
            },
            encrypted_data: encryptedHex
        };
    } catch (err) {
        console.error('Encryption error:', err);
        secretKeyStr = null;
        return payloadObj;
    }
}

// 4. فك تشفير البيانات بـ AES-256-GCM وتدمير المفتاح فوراً من الذاكرة
async function decryptBackupPayload(encryptedFileObj) {
    if (!encryptedFileObj.meta?.is_encrypted || !encryptedFileObj.encrypted_data) {
        return encryptedFileObj; // غير مشفر
    }

    let secretKeyStr = await fetchTenantEncryptionKey();
    if (!secretKeyStr) {
        throw new Error('تعذر جلب مفتاح التشفير المخصص لمصنعك لفك التشفير.');
    }

    try {
        const cryptoInfo = encryptedFileObj.meta.crypto || {};
        const salt = new Uint8Array(cryptoInfo.salt.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const iv = new Uint8Array(cryptoInfo.iv.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
        const encryptedBytes = new Uint8Array(encryptedFileObj.encrypted_data.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));

        const cryptoKey = await deriveCryptoKey(secretKeyStr, salt);
        secretKeyStr = null; // 🔒 تدمير المفتاح النصي فوراً من الذاكرة

        const decryptedBuffer = await window.crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: iv },
            cryptoKey,
            encryptedBytes
        );

        const decoder = new TextDecoder();
        const decryptedJsonStr = decoder.decode(decryptedBuffer);
        const tablesObj = JSON.parse(decryptedJsonStr);

        return {
            meta: encryptedFileObj.meta,
            tables: tablesObj
        };
    } catch (err) {
        console.error('Decryption failed:', err);
        secretKeyStr = null;
        throw new Error('فشل فك تشفير الملف! مفتاح المصنع غير مطابق أو تم العبث ببيانات الملف.');
    }
}

function generateBackupSecurityHash(tenantId, createdAt, recordsCount) {
    const raw = `${tenantId || 'global'}:${createdAt}:${recordsCount}:${SYSTEM_SECURITY_SALT}`;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
        const char = raw.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return 'USSEC_' + Math.abs(hash).toString(16);
}

// مولّد بيانات الـ JSON للنسخة الاحتياطية
async function generateBackupPayload(preset) {
    openProgressModal('تصدير نسخة احتياطية', `جاري تصدير: ${preset.label}`);
    updateProgressUI(0, 'جاري البدء...', '0 / 0');

    const currentTenantId = getCurrentTenantId();
    const tenantName = await getTenantName();

    const backupPayload = {
        meta: {
            format: BACKUP_FORMAT_IDENTIFIER,
            version: APP_VERSION,
            preset_id: preset.id,
            preset_name: preset.label,
            created_at: new Date().toISOString(),
            exported_by: localStorage.getItem('devo_current_username') || 'admin',
            tenant_id: currentTenantId,
            tenant_name: tenantName,
            total_records: 0,
            tables_count: 0
        },
        tables: {}
    };

    let overallTotalRecords = 0;
    const errorsList = [];

    let startTime = Date.now();
    const timerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        const el = document.getElementById('progress-time-elapsed');
        if (el) el.textContent = `${mins}:${secs}`;
    }, 1000);

    try {
        let rpcExtracted = false;

        // 1. محاولة استدعاء الدالة الديناميكية الفورية في قاعدة البيانات execute_tenant_dynamic_backup
        try {
            updateProgressUI(15, 'جاري الاستخراج الديناميكي السريع من السيرفر...', 'استخراج فوري لكافة الجداول...');
            const { data: rpcData, error: rpcErr } = await supabase.rpc('execute_tenant_dynamic_backup', {
                p_tenant_id: currentTenantId,
                p_preset: preset.id
            });

            if (!rpcErr && rpcData && rpcData.success && rpcData.tables) {
                backupPayload.tables = rpcData.tables;
                const tblKeys = Object.keys(rpcData.tables);
                backupPayload.meta.tables_count = tblKeys.length;
                
                tblKeys.forEach(tableName => {
                    const rows = rpcData.tables[tableName] || [];
                    const rowCount = Array.isArray(rows) ? rows.length : 0;
                    overallTotalRecords += rowCount;
                    const arabicName = TABLE_ARABIC_NAMES[tableName] || tableName;
                    addOrUpdateStepItem(tableName, arabicName, 'success', `تم تصدير ${rowCount.toLocaleString('ar-EG')} سجل بنجاح`);
                });

                rpcExtracted = true;
                console.log('✅ تم استخراج النسخة الاحتياطية بنجاح عبر execute_tenant_dynamic_backup:', tblKeys.length, 'جدولاً');
            } else if (rpcErr) {
                console.warn('execute_tenant_dynamic_backup RPC notice, falling back to client fetch:', rpcErr.message);
            }
        } catch (rpcCallErr) {
            console.warn('RPC execute_tenant_dynamic_backup call note, using client extraction:', rpcCallErr);
        }

        // 2. إذا لم تتوفر الدالة بالسيرفر، استخدام آلية الجلب المتتابعة عبر المتصفح لكافة الجداول
        if (!rpcExtracted) {
            let targetTables = [...preset.tables];

            // محاولة اكتشاف أي جداول إضافية ديناميكياً من السيرفر
            if (preset.id === 'full_system') {
                try {
                    const { data: dynTables } = await supabase.rpc('get_tenant_dynamic_tables_info', {
                        p_tenant_id: currentTenantId
                    });
                    if (Array.isArray(dynTables) && dynTables.length > 0) {
                        dynTables.forEach(t => {
                            if (t.table_name && !targetTables.includes(t.table_name)) {
                                targetTables.push(t.table_name);
                            }
                        });
                    }
                } catch (dynErr) {
                    console.warn('get_tenant_dynamic_tables_info note:', dynErr);
                }
            }

            const totalTables = targetTables.length;
            backupPayload.meta.tables_count = totalTables;

            for (let i = 0; i < totalTables; i++) {
                const tableName = targetTables[i];
                const arabicName = TABLE_ARABIC_NAMES[tableName] || tableName;
                const stepPercent = Math.round(((i) / totalTables) * 100);

                updateProgressUI(stepPercent, `${arabicName} (${tableName})`, 'جاري الجلب الحجمي...');
                addOrUpdateStepItem(tableName, arabicName, 'loading', 'جاري جلب البيانات على دفعات...');

                try {
                    const rows = await fetchAllTableRecords(tableName, (fetchedSoFar) => {
                        updateProgressUI(stepPercent, `${arabicName} (${tableName})`, `${fetchedSoFar.toLocaleString('ar-EG')} سجل`);
                    });
                    
                    backupPayload.tables[tableName] = rows;
                    overallTotalRecords += rows.length;

                    addOrUpdateStepItem(tableName, arabicName, 'success', `تم تصدير ${rows.length.toLocaleString('ar-EG')} سجل بنجاح`);
                } catch (err) {
                    console.error(`Error exporting table ${tableName}:`, err);
                    backupPayload.tables[tableName] = [];
                    errorsList.push(`جدول ${arabicName}: ${err.message}`);
                    addOrUpdateStepItem(tableName, arabicName, 'error', `فشل الجلب: ${err.message}`);
                }
            }
        }

        clearInterval(timerInterval);
        backupPayload.meta.total_records = overallTotalRecords;
        backupPayload.meta.security_signature = generateBackupSecurityHash(
            currentTenantId,
            backupPayload.meta.created_at,
            overallTotalRecords
        );

        updateProgressUI(100, 'تم التصدير بنجاح!', `${overallTotalRecords.toLocaleString('ar-EG')} سجل إجمالي`);

        showProgressCompletion(
            '✅ تم التصدير بنجاح!',
            `تم تصدير ${overallTotalRecords.toLocaleString('ar-EG')} سجل عبر ${backupPayload.meta.tables_count || Object.keys(backupPayload.tables).length} جداول بنجاح بتقنيات الأمان الحجمية.`
        );

        if (errorsList.length > 0) {
            showProgressErrors(errorsList);
        }

        // 🔒 تشفير محتوى النسخة بالكامل بمفتاح المصنع المخصص AES-256-GCM قبل إرجاعها
        updateProgressUI(100, 'جاري التشفير والأمان...', 'جاري تشفير البيانات بـ AES-256-GCM...');
        const finalEncryptedPayload = await encryptBackupPayload(backupPayload);
        return finalEncryptedPayload;

    } catch (globalErr) {
        clearInterval(timerInterval);
        console.error('Global export failure:', globalErr);
        showToast(`فشلت عملية التصدير: ${globalErr.message}`, 'error');
        closeProgressModal();
        return null;
    }
}

// جلب كل السجلات من جدول معيّن بصفحات محددة بالترتيب الهندسي لتفادي أي تكرار أو مفقودات
async function fetchAllTableRecords(tableName, onProgress = null) {
    let allRecords = [];
    let page = 0;
    const pageSize = 1000;
    let hasMore = true;

    const sortCol = PRIMARY_KEY_CONFIG[tableName] ? PRIMARY_KEY_CONFIG[tableName].split(',')[0].trim() : 'id';
    const currentTenantId = getCurrentTenantId();

    while (hasMore) {
        let query = supabase.from(tableName).select('*');

        // تطبيق الفلترة بـ tenant_id فقط للجداول التي تمتلك هذا العمود في قاعدة البيانات لعدم التسبب في خطأ 400
        if (currentTenantId && TABLES_WITH_TENANT_ID.includes(tableName)) {
            query = query.eq('tenant_id', currentTenantId);
        } else if (currentTenantId && tableName === 'themes') {
            query = query.or(`is_system.eq.true,tenant_id.eq.${currentTenantId},tenant_id.is.null`);
        }

        if (sortCol) {
            query = query.order(sortCol, { ascending: true });
        }

        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) {
            console.warn(`Query warning on table ${tableName}:`, error.message);
            const { data: fbData, error: fbErr } = await supabase
                .from(tableName)
                .select('*')
                .range(page * pageSize, (page + 1) * pageSize - 1);

            if (fbErr) throw new Error(fbErr.message);

            if (fbData && fbData.length > 0) {
                allRecords = allRecords.concat(fbData);
                if (onProgress) onProgress(allRecords.length);
                if (fbData.length < pageSize) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
        } else {
            if (data && data.length > 0) {
                allRecords = allRecords.concat(data);
                if (onProgress) onProgress(allRecords.length);
                if (data.length < pageSize) hasMore = false;
                else page++;
            } else {
                hasMore = false;
            }
        }
    }

    return allRecords;
}

// ============================================================
// ☁️ تنفيذ وإنشاء النسخة السحابية المجدولة وتنبيه التليجرام
// ============================================================
async function executeCloudAutoBackup(isManualClick = false) {
    const preset = EXPORT_PRESETS.full_system;
    const currentTenantId = getCurrentTenantId();
    const tenantName = await getTenantName();
    const safeTenantName = tenantName.replace(/[\s\/\\]+/g, '_');
    
    const backupPayload = await generateBackupPayload(preset);
    if (!backupPayload) return;

    if (backupPayload.meta) {
        backupPayload.meta.tenant_id = currentTenantId;
        backupPayload.meta.tenant_name = tenantName;
    }

    try {
        const dateStr = getFormattedDateStr();
        const filename = `backup_${safeTenantName}_cloud_${dateStr}.json`;
        const jsonContent = JSON.stringify(backupPayload);
        const fileBlob = new Blob([jsonContent], { type: 'application/json' });
        const fileSize = fileBlob.size;

        // 1. الرفع لـ Supabase Storage
        let publicUrl = '';
        const { data: uploadData, error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKET_NAME)
            .upload(filename, fileBlob, { upsert: true, contentType: 'application/json' });

        if (uploadError) {
            console.warn('Storage upload non-fatal warning:', uploadError.message);
            if (isManualClick) {
                showToast(`⚠️ تعذر الرفع السحابي: ${uploadError.message}. تم التخزين المحلي بنجاح.`, 'warning', 6000);
            }
        } else {
            const { data: publicUrlData } = supabase.storage
                .from(STORAGE_BUCKET_NAME)
                .getPublicUrl(filename);
            publicUrl = publicUrlData?.publicUrl || '';
        }

        // 2. تدوين النسخة في جدول system_backups_log مع tenant_id واسم المصنع
        const { error: logInsertError } = await supabase
            .from('system_backups_log')
            .insert([{
                tenant_id: currentTenantId,
                filename: filename,
                backup_type: preset.id,
                total_records: backupPayload.meta.total_records,
                file_size_bytes: fileSize,
                storage_path: filename,
                exported_by: isManualClick ? (localStorage.getItem('devo_current_username') || 'admin') : 'system_auto',
                metadata: { ...backupPayload.meta, tenant_name: tenantName }
            }]);

        if (logInsertError) {
            console.error('Log insert error:', logInsertError);
            showToast(`⚠️ تم رفع الملف للسحابة بنجاح، لكن يرجى تشغيل ملف SQL (v11) في Supabase لتفعيل جدول السجلات.`, 'warning', 7000);
        }

        // 3. تطبيق سياسة الأرشفة الحلقية والتنظيف التلقائي
        await enforceBackupRetentionPolicy();

        // 4. إرسال إشعار التليجرام والمستند المباشر لمالك النظام
        await sendTelegramBackupNotification(backupPayload.meta, fileSize, publicUrl, fileBlob, filename);

        // 5. إعادة تحديث جدول النسخ السحابية بالواجهة
        await fetchCloudBackups();

        if (isManualClick) {
            showToast('تم رفع النسخة السحابية وإرسال رابط التنزيل للتليجرام بنجاح ☁️✅', 'success');
        }

        localStorage.setItem('devo_last_auto_backup_date', new Date().toISOString().split('T')[0]);

    } catch (err) {
        console.error('Cloud backup error:', err);
        showToast(`فشل التخزين السحابي: ${err.message}`, 'error');
    }
}

// فحص الجدولة التلقائية لمنتصف الليل عند فتح الصفحة
async function checkAutoCloudBackupMidnight() {
    try {
        const lastBackupDate = localStorage.getItem('devo_last_auto_backup_date');
        const todayDate = new Date().toISOString().split('T')[0];

        if (lastBackupDate !== todayDate) {
            console.log('⚡ Running automated daily cloud backup check...');
            await executeCloudAutoBackup(false);
        }
    } catch (e) {
        console.error('Auto backup check error:', e);
    }
}

// سياسة الأرشفة والتنظيف التلقائي (حذف النسخ القديمة جداً)
async function enforceBackupRetentionPolicy() {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - RETENTION_DAYS);

        const { data: oldLogs } = await supabase
            .from('system_backups_log')
            .select('*')
            .lt('created_at', cutoffDate.toISOString());

        if (oldLogs && oldLogs.length > 0) {
            console.log(`🧹 Purging ${oldLogs.length} expired backups older than ${RETENTION_DAYS} days...`);
            
            const filesToRemove = oldLogs.map(l => l.storage_path || l.filename).filter(Boolean);
            if (filesToRemove.length > 0) {
                await supabase.storage.from(STORAGE_BUCKET_NAME).remove(filesToRemove);
            }

            await supabase
                .from('system_backups_log')
                .delete()
                .lt('created_at', cutoffDate.toISOString());
        }
    } catch (e) {
        console.error('Error enforcing backup retention policy:', e);
    }
}

// إرسال إشعار لحظي لمالك النظام عبر Telegram وإرفاق الملف مباشرة
async function sendTelegramBackupNotification(meta, fileSize, publicUrl = '', fileBlob = null, filename = '') {
    try {
        const currentTenantId = getCurrentTenantId();
        let query = supabase
            .from('home_settings')
            .select('*')
            .in('setting_key', ['telegram_bot_token', 'telegram_chat_id']);

        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data: settings } = await query;

        if (!settings || settings.length === 0) return;

        const tokenRow = settings.find(s => s.setting_key === 'telegram_bot_token');
        const chatIdRow = settings.find(s => s.setting_key === 'telegram_chat_id');

        if (!tokenRow?.setting_value || !chatIdRow?.setting_value) return;

        const botToken = tokenRow.setting_value.trim();
        const chatId = chatIdRow.setting_value.trim();

        const formattedSize = (fileSize / 1024).toFixed(1) + ' KB';
        const formattedDate = new Date().toLocaleString('ar-EG');
        const tenantDisplayName = meta.tenant_name || (await getTenantName());

        const captionText = 
`🛡️ <b>تأكيد النسخ الاحتياطي للنظام</b>

🏢 <b>المصنع / الجهة:</b> ${tenantDisplayName}
📅 <b>التاريخ والوقت:</b> ${formattedDate}
📦 <b>نوع النسخة:</b> ${meta.preset_name || 'كاملة'}
📊 <b>إجمالي السجلات:</b> ${meta.total_records.toLocaleString('ar-EG')} سجل
💾 <b>حجم الملف:</b> ${formattedSize}
🌐 <b>النظام:</b> UltraSoft System v${meta.version || '2.5.0'}
${publicUrl ? `\n🔗 <a href="${publicUrl}">اضغط هنا لتنزيل النسخة المباشرة من السحابة (.json)</a>` : ''}`;

        // 1. المحاولة الأولى: إرسال ملف الـ JSON المباشر كمستند مرفق في شات التليجرام (sendDocument)
        if (fileBlob && filename) {
            try {
                const formData = new FormData();
                formData.append('chat_id', chatId);
                formData.append('caption', captionText);
                formData.append('parse_mode', 'HTML');
                formData.append('document', fileBlob, filename);

                const docRes = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
                    method: 'POST',
                    body: formData
                });

                if (docRes.ok) {
                    console.log('Telegram backup document sent successfully via sendDocument! 🚀');
                    return;
                }
            } catch (docErr) {
                console.warn('sendDocument failed, falling back to sendMessage:', docErr);
            }
        }

        // 2. المحاولة الثانية: إرسال الرسالة النصية التفاعلية الهيكلية
        await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: captionText,
                parse_mode: 'HTML',
                disable_web_page_preview: false
            })
        });

        console.log('Telegram backup notification message sent successfully! 🚀');

    } catch (e) {
        console.error('Error sending Telegram notification:', e);
    }
}

// جلب وعرض قائمة النسخ السحابية المحفوظة للمصنع الحالي فقط
async function fetchCloudBackups() {
    const tableBody = document.getElementById('cloud-backups-table-body');
    if (!tableBody) return;

    try {
        const currentTenantId = getCurrentTenantId();
        let query = supabase.from('system_backups_log').select('*');

        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data, error } = await query.order('created_at', { ascending: false });

        if (error) {
            if (error.code === '42P01' || error.message?.includes('does not exist')) {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="6" class="p-6 text-center">
                            <div class="flex flex-col items-center gap-2 bg-devo-black/60 p-4 rounded-xl border border-devo-warning/30">
                                <i class="ph ph-warning-circle text-3xl text-devo-warning"></i>
                                <p class="font-bold text-white text-sm">جدول النسخ السحابية غير مفعّل في قواعد البيانات بعد</p>
                                <p class="text-xs text-devo-muted max-w-md">يرجى تشغيل أمر الهجرة SQL (v11_automated_cloud_backups_and_logs.sql) في لوحة متحكم Supabase لتفعيل السجل والتخزين السحابي.</p>
                            </div>
                        </td>
                    </tr>
                `;
                return;
            }
            throw error;
        }

        cloudBackupsList = data || [];
        renderCloudBackupsTable();

    } catch (e) {
        console.error('Error fetching cloud backups:', e);
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="p-4 text-center text-devo-muted">
                    حدث خطأ أثناء تحميل سجل النسخ السحابية: ${e.message}
                </td>
            </tr>
        `;
    }
}

function renderCloudBackupsTable() {
    const tableBody = document.getElementById('cloud-backups-table-body');
    if (!tableBody) return;

    if (cloudBackupsList.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6" class="p-6 text-center text-devo-muted">
                    لا توجد نسخ احتياطية سحابية محفوظة حالياً في السجل
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = cloudBackupsList.map(item => {
        const dateStr = new Date(item.created_at).toLocaleString('ar-EG');
        const sizeStr = (item.file_size_bytes / 1024).toFixed(1) + ' KB';
        const presetName = EXPORT_PRESETS[item.backup_type]?.label || item.backup_type || 'كاملة';

        return `
            <tr class="hover:bg-devo-black/30 transition-colors">
                <td class="p-3 font-mono font-bold text-white truncate max-w-[180px]" title="${item.filename}">
                    ${item.filename}
                </td>
                <td class="p-3 text-devo-muted">${dateStr}</td>
                <td class="p-3">
                    <span class="bg-devo-orange/10 text-devo-orange border border-devo-orange/20 px-2 py-0.5 rounded text-[11px] font-bold">
                        ${presetName}
                    </span>
                </td>
                <td class="p-3 font-mono font-bold text-devo-success">${item.total_records.toLocaleString('ar-EG')} سجل</td>
                <td class="p-3 text-devo-muted font-mono">${sizeStr}</td>
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-1.5">
                        <button
                            onclick="restoreDirectFromCloud('${item.filename}')"
                            title="استعادة فورية بنقرة واحدة"
                            class="px-2.5 py-1 bg-devo-success/15 hover:bg-devo-success text-devo-success hover:text-white border border-devo-success/30 rounded-lg font-bold text-[11px] transition-colors flex items-center gap-1 cursor-pointer"
                        >
                            <i class="ph ph-lightning text-sm"></i>
                            <span>استعادة 1-Click</span>
                        </button>
                        <button
                            onclick="downloadCloudBackup('${item.filename}')"
                            title="تحميل الملف"
                            class="p-1.5 bg-devo-gray hover:bg-devo-grayHover text-white rounded-lg transition-colors cursor-pointer"
                        >
                            <i class="ph ph-download-simple text-base"></i>
                        </button>
                        <button
                            onclick="deleteCloudBackup('${item.id}', '${item.filename}')"
                            title="حذف من السحابة"
                            class="p-1.5 bg-devo-error/10 hover:bg-devo-error text-devo-error hover:text-white rounded-lg transition-colors cursor-pointer"
                        >
                            <i class="ph ph-trash text-base"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    window.restoreDirectFromCloud = restoreDirectFromCloud;
    window.downloadCloudBackup = downloadCloudBackup;
    window.deleteCloudBackup = deleteCloudBackup;
}

// ⚡ الاستعادة المباشرة بنقرة واحدة من السحابة (1-Click Cloud Restore)
async function restoreDirectFromCloud(filename) {
    try {
        showToast('جاري جلب ملف النسخة الاحتياطية من السحابة...', 'info', 4000);

        let jsonContent = null;

        // المحاولة الأولى: عبر Supabase Client Storage Download SDK
        try {
            const { data, error } = await supabase.storage
                .from(STORAGE_BUCKET_NAME)
                .download(filename);

            if (!error && data) {
                const text = await data.text();
                jsonContent = JSON.parse(text);
            }
        } catch (downloadErr) {
            console.warn('Storage download SDK notice, trying HTTP public URL fetch:', downloadErr);
        }

        // المحاولة الثانية (Fallback): عبر Fetch المباشر للرابط العام
        if (!jsonContent) {
            const { data: urlData } = supabase.storage
                .from(STORAGE_BUCKET_NAME)
                .getPublicUrl(filename);

            if (urlData?.publicUrl) {
                const res = await fetch(urlData.publicUrl);
                if (res.ok) {
                    jsonContent = await res.json();
                } else {
                    throw new Error(`تعذر الوصول للملف سحابياً (${res.status})`);
                }
            }
        }

        if (!jsonContent) {
            throw new Error('الملف غير موجود في التخزين السحابي الحالي، يرجى إعادة إنشائه برفع جديد.');
        }

        // فحص وتحميل ميتاداتا الملف
        validateAndInspectBackupContent(filename, jsonContent);
        showToast('تم جلب النسخة السحابية بنجاح! جاري فتح معاينة الفروقات ⚡', 'success', 5000);

        // التمرير التلقائي وفتح شاشة الفروقات والاستعادة الجزئية فوراً للمشرف
        document.getElementById('file-inspection-card')?.scrollIntoView({ behavior: 'smooth' });
        await openDiffAndSelectiveModal();

    } catch (e) {
        console.error('Direct cloud restore error:', e);
        if (e.message?.includes('Bucket not found') || e.message?.includes('400') || e.message?.includes('404')) {
            showToast('⚠️ الملف غير متوفر في التخزين السحابي بالسيرفر. يرجى رفع ملف النسخة المحترفة (.json) من جهازك محلياً أو تشغيل سكريبت إنشاء Bucket التخزين.', 'warning', 7000);
        } else {
            showToast(`⚠️ تعذر جلب ملف السحابة: ${e.message}`, 'error', 7000);
        }
    }
}

// تنزيل ملف نسخة سحابية
async function downloadCloudBackup(filename) {
    try {
        const { data: urlData } = supabase.storage
            .from(STORAGE_BUCKET_NAME)
            .getPublicUrl(filename);

        if (urlData?.publicUrl) {
            const res = await fetch(urlData.publicUrl, { method: 'HEAD' });
            if (res.ok) {
                const a = document.createElement('a');
                a.href = urlData.publicUrl;
                a.download = filename;
                a.target = '_blank';
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                showToast('تم بدء تنزيل الملف سحابياً 📥', 'success');
                return;
            }
        }

        const { data, error } = await supabase.storage
            .from(STORAGE_BUCKET_NAME)
            .download(filename);

        if (error) throw error;

        const url = URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error('Download backup error:', e);
        showToast('⚠️ تعذر تنزيل الملف من السحابة (تنبيه: يلزم تشغيل ملف SQL v35 لإنشاء حاوية system_backups في Supabase Storage)', 'warning', 7000);
    }
}

// حذف نسخة سحابية
async function deleteCloudBackup(id, filename) {
    const confirmResult = await confirmDialog({
        title: 'تأكيد حذف النسخة السحابية',
        message: `هل أنت متأكد من حذف النسخة السحابية (${filename})؟`,
        confirmText: 'نعم، أحذف الملف',
        cancelText: 'إلغاء',
        isDestructive: true
    });
    if (!confirmResult) return;

    try {
        await supabase.storage.from(STORAGE_BUCKET_NAME).remove([filename]);
        await supabase.from('system_backups_log').delete().eq('id', id);

        showToast('تم حذف النسخة السحابية بنجاح 🗑️', 'success');
        await fetchCloudBackups();
    } catch (e) {
        console.error('Delete cloud backup error:', e);
        showToast('فشل حذف النسخة السحابية', 'error');
    }
}

// ============================================================
// 🔍 التعامل مع اختيار ومعاينة ملف الاستعادة المحترفة
// ============================================================
function handleFileSelection(file) {
    if (!file.name.endsWith('.json')) {
        showToast('يرجى اختيار ملف بصيغة .json فقط', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e) => {
        try {
            const content = JSON.parse(e.target.result);
            if (content.meta?.is_encrypted) {
                try {
                    showToast('🔐 جاري جلب مفتاح تشفير المصنع آمنياً وفك التشفير...', 'info', 3500);
                    const decryptedContent = await decryptBackupPayload(content);
                    validateAndInspectBackupContent(file.name, decryptedContent);
                } catch (decryptErr) {
                    showToast(`🚫 ${decryptErr.message}`, 'error', 8000);
                    resetFileInspection();
                }
            } else {
                validateAndInspectBackupContent(file.name, content);
            }
        } catch (err) {
            console.error('Invalid JSON file:', err);
            showToast('الملف المرفوع ليس ملف JSON صالحاً أو تالف', 'error');
            resetFileInspection();
        }
    };
    reader.readAsText(file);
}

function validateAndInspectBackupContent(fileName, data) {
    if (!data || typeof data !== 'object' || !data.tables) {
        showToast('هيكل ملف النسخة الاحتياطية غير مطابقة للمواصفات', 'error');
        resetFileInspection();
        return;
    }

    const currentTenantId = getCurrentTenantId();
    const meta = data.meta || {};

    // 🔒 1. التحقق من تنسيق ومصدر النظام الأصلي
    if (meta.format !== BACKUP_FORMAT_IDENTIFIER && meta.format !== 'DEVO_SYSTEM_BACKUP') {
        showToast('🚫 تنبيه أمني: الملف المرفوع غير معتمد أو صادر من نظام خارجي غير معروف.', 'error', 7000);
        resetFileInspection();
        return;
    }

    // 🔒 2. التحقق من التوقيع الرقمي للمسند ومنع الملفات المفتعلة
    if (meta.security_signature && meta.tenant_id && meta.created_at && meta.total_records !== undefined) {
        const computedHash = generateBackupSecurityHash(meta.tenant_id, meta.created_at, meta.total_records);
        if (computedHash !== meta.security_signature) {
            showToast('🚫 تنبيه أمني: التوقيع الرقمي للملف غير صالح أو تم التعديل عليه.', 'error', 7000);
            resetFileInspection();
            return;
        }
    }

    // 🔒 3. التحقق المشدد من هوية المصنع (Tenant Authorization Check)
    if (currentTenantId && meta.tenant_id && meta.tenant_id !== currentTenantId) {
        const otherTenantName = meta.tenant_name || 'مصنع مختلف';
        showToast(`🚫 تنبيه أمني حاسم: هذا الملف خاص بـ (${otherTenantName}). لا يمكنك استعادة بيانات مصنع آخر على حساب مصنعك الحالي!`, 'error', 8000);
        resetFileInspection();
        return;
    }

    loadedBackupData = data;

    const tables = data.tables || {};
    const tableKeys = Object.keys(tables);

    let totalRecs = 0;
    tableKeys.forEach(k => {
        if (Array.isArray(tables[k])) totalRecs += tables[k].length;
    });

    document.getElementById('inspect-filename').textContent = fileName;
    document.getElementById('inspect-backup-type').textContent = `نوع النسخة: ${meta.preset_name || 'مخصصة'}`;
    document.getElementById('inspect-date').textContent = meta.created_at ? new Date(meta.created_at).toLocaleString('ar-EG') : 'غير محدد';
    document.getElementById('inspect-total-records').textContent = `${totalRecs.toLocaleString('ar-EG')} سجل`;

    document.getElementById('file-inspection-card')?.classList.remove('hidden');

    const triggerBtn = document.getElementById('btn-trigger-restore');
    if (triggerBtn) {
        triggerBtn.disabled = false;
        triggerBtn.className = 'w-full py-3.5 px-4 bg-devo-success hover:bg-emerald-600 text-white rounded-xl font-bold text-sm transition-all duration-200 shadow-lg shadow-devo-success/10 flex items-center justify-center gap-2 cursor-pointer active:scale-[0.99]';
    }

    showToast('تم فحص وتقييم ملف النسخة الاحتياطية بنجاح ✅', 'success');
}

function resetFileInspection() {
    loadedBackupData = null;
    document.getElementById('file-inspection-card')?.classList.add('hidden');
    const triggerBtn = document.getElementById('btn-trigger-restore');
    if (triggerBtn) {
        triggerBtn.disabled = true;
        triggerBtn.className = 'w-full py-3.5 px-4 bg-devo-gray text-devo-muted rounded-xl font-bold text-sm transition-all duration-200 flex items-center justify-center gap-2 cursor-not-allowed opacity-60';
    }
}

// ============================================================
// 📥 تنفيذ عملية الاستعادة المحمية للأعداد الكبيرة مع شبكة التعافي
// ============================================================
async function handleRestoreProcess(customDataPayload = null) {
    const dataToRestore = customDataPayload || loadedBackupData;

    if (!dataToRestore || !dataToRestore.tables) {
        showToast('يرجى رفع ملف نسخة احتياطية صالح أولاً', 'error');
        return;
    }

    const currentTenantId = getCurrentTenantId();
    if (currentTenantId && dataToRestore.meta?.tenant_id && dataToRestore.meta.tenant_id !== currentTenantId) {
        showToast('🚫 تم حظر الاستعادة: الملف يتبع لمصنع آخر ولا يُسمح باستعادته على حساب مصنعك.', 'error', 8000);
        return;
    }

    const modeRadio = document.querySelector('input[name="restore-mode"]:checked');
    currentRestoreMode = modeRadio ? modeRadio.value : 'upsert';

    if (currentRestoreMode === 'replace' && !customDataPayload) {
        const confirmResult = await confirmDialog({
            title: '⚠️ تحذير شديد الخطورة (إعادة استبدال)',
            message: 'اخترت خيار "إعادة استبدال كاملة". ستقوم العملية بتفريغ وحذف البيانات الحالية للجداول المستهدفة واستبدالها بالبيانات الموجودة بالملف!\n\nهل أنت متأكد تماماً من المتابعة؟',
            confirmText: 'نعم، قم بالاستبدال',
            cancelText: 'تراجع وإلغاء',
            isDestructive: true
        });
        if (!confirmResult) return;
    }

    const tablesObj = dataToRestore.tables;
    const orderedTablesToRestore = RESTORE_TABLE_ORDER.filter(t => Array.isArray(tablesObj[t]) && tablesObj[t].length > 0);

    Object.keys(tablesObj).forEach(t => {
        if (!orderedTablesToRestore.includes(t) && Array.isArray(tablesObj[t]) && tablesObj[t].length > 0) {
            orderedTablesToRestore.push(t);
        }
    });

    if (orderedTablesToRestore.length === 0) {
        showToast('لا توجد سجلات محددة للاستعادة', 'warning');
        return;
    }

    openProgressModal('استعادة البيانات', `طريقة المعالجة: ${currentRestoreMode === 'upsert' ? 'دمج وتحديث' : 'استبدال كامل'}`);
    updateProgressUI(0, 'جاري بدء الاستعادة الحجمية...', '0 / 0');

    let totalRestoredRecords = 0;
    const errorsList = [];
    const totalTablesCount = orderedTablesToRestore.length;

    let startTime = Date.now();
    const timerInterval = setInterval(() => {
        const elapsedSec = Math.floor((Date.now() - startTime) / 1000);
        const mins = String(Math.floor(elapsedSec / 60)).padStart(2, '0');
        const secs = String(elapsedSec % 60).padStart(2, '0');
        const el = document.getElementById('progress-time-elapsed');
        if (el) el.textContent = `${mins}:${secs}`;
    }, 1000);

function sanitizeRowForTable(tableName, row, validUserIds = null) {
    if (!row || typeof row !== 'object') return row;
    let cleaned = { ...row };

    const currentTenantId = getCurrentTenantId();

    // 🔒 1. حظر استعادة حسابات الموظفين والمستخدمين الخاصة بمصانع أخرى
    if (tableName === 'system_users') {
        return null; // استثناء وتجاهل كلي لاستعادة الحسابات
    }

    // 🔒 2. حظر استعادة إعدادات التليجرام والتنبيهات السرية الخاصة بمصانع أخرى
    if (tableName === 'home_settings') {
        const SENSITIVE_KEYS = [
            'telegram_bot_token', 'telegram_chat_id', 'telegram_stock_chat_id',
            'telegram_enabled', 'telegram_stock_enabled', 'web_notifications_enabled'
        ];
        if (SENSITIVE_KEYS.includes(cleaned.setting_key)) {
            return null; // استثناء وتجاهل إعدادات التليجرام الحساسة
        }
    }

    // 🔒 3. إجبار ربط وتأمين البيانات المستعادة للجداول المعتمدة بـ tenant_id المباشر
    if (currentTenantId && TABLES_WITH_TENANT_ID.includes(tableName)) {
        cleaned.tenant_id = currentTenantId;
    }

    // تنظيف المعرفات التابعة للمستخدمين إذا كانت غير موجودة في قاعدة البيانات للحفاظ على سلامة القيود الخارجية
    if (validUserIds && validUserIds.size > 0) {
        if (tableName === 'orders') {
            if (cleaned.worker_id && !validUserIds.has(cleaned.worker_id)) cleaned.worker_id = null;
            if (cleaned.assigned_worker_id && !validUserIds.has(cleaned.assigned_worker_id)) cleaned.assigned_worker_id = null;
            if (cleaned.prepared_by && !validUserIds.has(cleaned.prepared_by)) cleaned.prepared_by = null;
        } else if (tableName === 'returns') {
            if (cleaned.worker_id && !validUserIds.has(cleaned.worker_id)) cleaned.worker_id = null;
        } else if (tableName === 'inbound_invoices') {
            if (cleaned.created_by && !validUserIds.has(cleaned.created_by)) cleaned.created_by = null;
        } else if (tableName === 'inventory_audits') {
            if (cleaned.created_by && !validUserIds.has(cleaned.created_by)) cleaned.created_by = null;
            if (cleaned.reviewed_by && !validUserIds.has(cleaned.reviewed_by)) cleaned.reviewed_by = null;
        } else if (tableName === 'order_item_preparation') {
            if (cleaned.updated_by && !validUserIds.has(cleaned.updated_by)) cleaned.updated_by = null;
        } else if (tableName === 'preparation_status_log') {
            if (cleaned.changed_by && !validUserIds.has(cleaned.changed_by)) cleaned.changed_by = null;
        } else if (tableName === 'order_logs') {
            if (cleaned.user_id && !validUserIds.has(cleaned.user_id)) cleaned.user_id = null;
        } else if (tableName === 'system_notifications') {
            if (cleaned.user_id && !validUserIds.has(cleaned.user_id)) cleaned.user_id = null;
        }
    }

    if (tableName === 'themes' && cleaned.colors) {
        let colorsPayload = cleaned.colors;
        if (!colorsPayload || cleaned.variables || cleaned.description || cleaned.is_system !== undefined) {
            const rawColors = cleaned.colors?.colors ? cleaned.colors.colors : (cleaned.colors || {});
            colorsPayload = {
                name: cleaned.name,
                description: cleaned.description || '',
                is_system: typeof cleaned.is_system === 'boolean' ? cleaned.is_system : true,
                colors: rawColors,
                fonts: cleaned.fonts || cleaned.variables?.fonts || {},
                animations: cleaned.animations || cleaned.variables?.animations || {},
                visuals: cleaned.visuals || cleaned.variables?.visuals || {}
            };
        }
        cleaned.colors = colorsPayload;
    }

    return cleaned;
}

    // جلب معرفات المستخدمين الحالية المتاحة للتحقق من سلامة العلاقات الخارجية FK
    let validUserIds = new Set();
    try {
        const { data: usersData } = await supabase.from('system_users').select('id');
        if (usersData) usersData.forEach(u => validUserIds.add(u.id));
    } catch (e) {
        console.warn('Could not fetch existing system_users IDs for FK validation:', e);
    }

    try {
        for (let i = 0; i < totalTablesCount; i++) {
            const tableName = orderedTablesToRestore[i];
            const rawRows = tablesObj[tableName];

            if (tableName === 'system_users') {
                try {
                    const { data: usersData } = await supabase.from('system_users').select('id');
                    if (usersData) validUserIds = new Set(usersData.map(u => u.id));
                } catch (e) {}
            }

            const rows = rawRows.map(r => sanitizeRowForTable(tableName, r, validUserIds)).filter(Boolean);
            const arabicName = TABLE_ARABIC_NAMES[tableName] || tableName;
            const stepPercent = Math.round((i / totalTablesCount) * 100);

            updateProgressUI(stepPercent, `${arabicName} (${tableName})`, `0 / ${rows.length}`);
            addOrUpdateStepItem(tableName, arabicName, 'loading', `جاري معالجة ${rows.length} سجل...`);

            try {
                if (currentRestoreMode === 'replace' && !customDataPayload) {
                    await clearTableDataSafely(tableName);
                }

                const upsertOptions = { ignoreDuplicates: false };
                if (PRIMARY_KEY_CONFIG[tableName]) {
                    upsertOptions.onConflict = PRIMARY_KEY_CONFIG[tableName];
                }

                const chunkSize = 150;
                let insertedCount = 0;

                for (let c = 0; c < rows.length; c += chunkSize) {
                    const chunk = rows.slice(c, c + chunkSize);
                    
                    const { error } = await supabase
                        .from(tableName)
                        .upsert(chunk, upsertOptions);

                    if (error) {
                        console.warn(`Upsert batch conflict on ${tableName} (${c}-${c + chunk.length}), triggering single-row recovery fallback...`, error.message);
                        
                        let singleSuccessCount = 0;
                        for (const row of chunk) {
                            const { error: rowErr } = await supabase
                                .from(tableName)
                                .upsert([row], upsertOptions);
                            
                            if (!rowErr) {
                                singleSuccessCount++;
                            } else if (tableName === 'system_users' && rowErr.message?.includes('row-level security')) {
                                console.info(`الحساب ${row.username || row.id} محمي بسياسات الأمان RLS ولم يتأثر بالنسخ.`);
                                singleSuccessCount++;
                            } else if (tableName === 'orders' && rowErr.message?.includes('foreign key constraint')) {
                                const safeOrder = { ...row, worker_id: null, assigned_worker_id: null, prepared_by: null };
                                const { error: safeErr } = await supabase.from('orders').upsert([safeOrder], upsertOptions);
                                if (!safeErr) {
                                    singleSuccessCount++;
                                } else {
                                    console.error(`Failed to restore row in ${tableName}:`, safeErr.message, row);
                                    errorsList.push(`جدول ${arabicName} (أوردر #${row.invoice_number || row.id}): ${safeErr.message}`);
                                }
                            } else if (tableName === 'colors') {
                                const colorPayload = {
                                    name: row.name,
                                    color_code: row.color_code,
                                    hex_code: row.hex_code,
                                    is_active: row.is_active !== undefined ? row.is_active : true
                                };
                                let updateQuery = supabase.from('colors').update(colorPayload);
                                if (row.id) {
                                    updateQuery = updateQuery.eq('id', row.id);
                                } else {
                                    updateQuery = updateQuery.eq('tenant_id', row.tenant_id).eq('color_code', row.color_code);
                                }
                                const { error: updateColorErr } = await updateQuery;
                                if (!updateColorErr) {
                                    singleSuccessCount++;
                                } else {
                                    console.error(`Failed to restore row in ${tableName}:`, updateColorErr.message, row);
                                    errorsList.push(`جدول ${arabicName} (لون ${row.name}): ${updateColorErr.message}`);
                                }
                            } else if (tableName === 'model_inventory') {
                                const updatePayload = { available_series: row.available_series };
                                if (row.color_system_code !== undefined) updatePayload.color_system_code = row.color_system_code;
                                if (row.color_factory_code !== undefined) updatePayload.color_factory_code = row.color_factory_code;
                                let updateQuery = supabase.from('model_inventory').update(updatePayload);
                                if (row.id) {
                                    updateQuery = updateQuery.eq('id', row.id);
                                } else if (row.model_id && row.color_id) {
                                    updateQuery = updateQuery.eq('model_id', row.model_id).eq('color_id', row.color_id);
                                }
                                const { error: updateErr } = await updateQuery;
                                if (!updateErr) {
                                    singleSuccessCount++;
                                } else {
                                    console.error(`Failed to restore row in ${tableName}:`, rowErr.message, row);
                                    errorsList.push(`جدول ${arabicName} (رصيد موديل #${row.model_id}): ${rowErr.message}`);
                                }
                            } else {
                                console.error(`Failed to restore row in ${tableName}:`, rowErr.message, row);
                                errorsList.push(`جدول ${arabicName} (سجل #${row.id || row.setting_key || 'مجهول'}): ${rowErr.message}`);
                            }
                        }

                        insertedCount += singleSuccessCount;
                    } else {
                        insertedCount += chunk.length;
                    }

                    updateProgressUI(
                        stepPercent + Math.round((insertedCount / rows.length) * (100 / totalTablesCount)),
                        `${arabicName} (${tableName})`,
                        `${insertedCount} / ${rows.length}`
                    );
                }

                totalRestoredRecords += insertedCount;
                addOrUpdateStepItem(tableName, arabicName, 'success', `تم استعادة ${insertedCount.toLocaleString('ar-EG')} سجل بنجاح`);

            } catch (tableErr) {
                console.error(`Restore error for ${tableName}:`, tableErr);
                errorsList.push(`جدول ${arabicName}: ${tableErr.message}`);
                addOrUpdateStepItem(tableName, arabicName, 'error', `فشل: ${tableErr.message}`);
            }
        }

        clearInterval(timerInterval);

        updateProgressUI(100, 'تمت الاستعادة بنجاح!', `${totalRestoredRecords.toLocaleString('ar-EG')} سجل إجمالي`);

        showProgressCompletion(
            '✅ تم إكمال استعادة البيانات بنجاح!',
            `تم معالجة واستعادة ${totalRestoredRecords.toLocaleString('ar-EG')} سجل عبر ${totalTablesCount} جداول بنجاح وبأمان تام.`
        );

        if (errorsList.length > 0) {
            showProgressErrors(errorsList);
        }

        showToast('تمت استعادة البيانات بنجاح ✅', 'success');

    } catch (globalErr) {
        clearInterval(timerInterval);
        console.error('Global restore failure:', globalErr);
        showToast(`فشلت عملية الاستعادة: ${globalErr.message}`, 'error');
        closeProgressModal();
    }
}

// مسح بيانات الجدول بأمان عند خيار Replace
async function clearTableDataSafely(tableName) {
    try {
        let pkCol = 'id';
        if (tableName === 'class_sizes') pkCol = 'class_id';
        else if (tableName === 'model_sizes') pkCol = 'model_id';
        else if (tableName === 'home_settings') pkCol = 'setting_key';

        const dummyVal = pkCol === 'setting_key' ? '___non_existent_key___' : '00000000-0000-0000-0000-000000000000';

        const { error } = await supabase
            .from(tableName)
            .delete()
            .neq(pkCol, dummyVal);

        if (error) console.warn(`Clear table notice for ${tableName}:`, error.message);
    } catch (e) {
        console.warn(`Could not clear table ${tableName}:`, e);
    }
}

// ============================================================
// 🔀 إدارة الـ Progress Modal والواجهات
// ============================================================
function openProgressModal(title, subtitle) {
    const modal = document.getElementById('backup-progress-modal');
    if (!modal) return;

    document.getElementById('progress-modal-title').textContent = title;
    document.getElementById('progress-modal-subtitle').textContent = subtitle;
    document.getElementById('progress-modal-percentage').textContent = '0%';
    document.getElementById('progress-bar-fill').style.width = '0%';
    document.getElementById('progress-steps-list').innerHTML = '';
    document.getElementById('progress-errors-container')?.classList.add('hidden');
    document.getElementById('progress-errors-list').innerHTML = '';
    document.getElementById('progress-modal-footer')?.classList.add('hidden');

    const iconContainer = document.getElementById('progress-modal-icon-container');
    if (iconContainer) {
        iconContainer.className = 'w-10 h-10 rounded-xl bg-devo-orange/15 flex items-center justify-center text-devo-orange';
        iconContainer.innerHTML = '<i class="ph ph-spinner animate-spin text-xl"></i>';
    }

    modal.style.display = 'flex';
}

function updateProgressUI(percent, currentTable, recordText) {
    const bar = document.getElementById('progress-bar-fill');
    const percentText = document.getElementById('progress-modal-percentage');
    const tableEl = document.getElementById('progress-current-table');
    const recordsEl = document.getElementById('progress-records-counter');

    if (bar) bar.style.width = `${percent}%`;
    if (percentText) percentText.textContent = `${percent}%`;
    if (tableEl) tableEl.textContent = currentTable;
    if (recordsEl) recordsEl.textContent = recordText;
}

function addOrUpdateStepItem(tableId, arabicName, status, statusText) {
    const list = document.getElementById('progress-steps-list');
    if (!list) return;

    let stepItem = document.getElementById(`step-${tableId}`);
    if (!stepItem) {
        stepItem = document.createElement('div');
        stepItem.id = `step-${tableId}`;
        stepItem.className = 'flex items-center justify-between p-2.5 rounded-xl border border-devo-gray bg-devo-black/40 text-xs transition-all';
        list.appendChild(stepItem);
    }

    let statusBadge = '';
    if (status === 'loading') {
        statusBadge = `
            <span class="flex items-center gap-1 text-devo-orange font-medium">
                <i class="ph ph-spinner animate-spin"></i> ${statusText}
            </span>
        `;
    } else if (status === 'success') {
        statusBadge = `
            <span class="flex items-center gap-1 text-devo-success font-medium">
                <i class="ph ph-check-circle text-base"></i> ${statusText}
            </span>
        `;
    } else if (status === 'error') {
        statusBadge = `
            <span class="flex items-center gap-1 text-devo-error font-medium">
                <i class="ph ph-x-circle text-base"></i> ${statusText}
            </span>
        `;
    }

    stepItem.innerHTML = `
        <span class="font-bold text-white flex items-center gap-2">
            <i class="ph ph-table text-devo-muted"></i> ${arabicName}
        </span>
        ${statusBadge}
    `;

    stepItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function showProgressCompletion(title, subtitle) {
    document.getElementById('progress-modal-title').textContent = title;
    document.getElementById('progress-modal-subtitle').textContent = subtitle;
    document.getElementById('progress-modal-footer')?.classList.remove('hidden');

    const iconContainer = document.getElementById('progress-modal-icon-container');
    if (iconContainer) {
        iconContainer.className = 'w-10 h-10 rounded-xl bg-devo-success/15 flex items-center justify-center text-devo-success';
        iconContainer.innerHTML = '<i class="ph ph-check-circle text-2xl"></i>';
    }
}

function showProgressErrors(errors) {
    const container = document.getElementById('progress-errors-container');
    const list = document.getElementById('progress-errors-list');
    if (!container || !list) return;

    container.classList.remove('hidden');
    list.innerHTML = errors.map(err => `<p class="flex items-start gap-1"><span>•</span> <span>${err}</span></p>`).join('');
}

function closeProgressModal() {
    const modal = document.getElementById('backup-progress-modal');
    if (modal) modal.style.display = 'none';
}

// ============================================================
// 🛠️ أدوات تنزيل وصياغة التاريخ
// ============================================================
function downloadJsonFile(dataObject, filename) {
    const jsonString = JSON.stringify(dataObject);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function getFormattedDateStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}-${String(d.getMinutes()).padStart(2, '0')}`;
}
