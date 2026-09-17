import { requireAuth, logoutUser } from '../../services/auth.js';
import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { initHomeSettingsView, initPromoCardsView } from './home_settings.js';
// استيراد صفحة المستخدمين (كما كانت في كودك)
import { initUsersView } from './users.js';
import { syncActiveTheme } from '../../services/theme.js';
import { initNotifications } from '../../services/notifications.js';
import { initNetworkStatusMonitor } from '../../components/network_banner.js';
import { initializeTenantContext, getCurrentTenant, applyTenantBranding, getCurrentTenantId, getTenantStorageKey } from '../../services/tenant_service.js';

// --- Security Check (Protect the Admin Route) ---
let currentUserContext = null;
let currentSettingsSubtab = 'view-home-settings';

function saveAdminStandingPosition(targetId, extra = {}) {
    if (!targetId) return;
    try {
        const tenantId = getCurrentTenantId() || 'default';
        const state = {
            targetId: targetId,
            settingsSubtab: extra.settingsSubtab || currentSettingsSubtab || 'view-home-settings',
            subtab: extra.subtab !== undefined ? extra.subtab : null,
            timestamp: Date.now()
        };
        const stateStr = JSON.stringify(state);
        localStorage.setItem(`ultrasoft_admin_view_${tenantId}`, stateStr);
        try {
            const isolatedKey = getTenantStorageKey('ultrasoft_admin_view');
            localStorage.setItem(isolatedKey, stateStr);
        } catch(e) {}
    } catch(e) {}
}

async function authenticateAdmin() {
    // 1. Initialize Active Tenant Context FIRST
    try {
        await initializeTenantContext();
    } catch(e) { console.error('Tenant init error:', e); }

    // 2. Perform RequireAuth check AFTER tenant context is loaded
    const user = requireAuth(['owner', 'admin']); 
    
    if (!user) {
        return false;
    }

    // 🔒 3. التحقق الأمني الحي: التأكد من وجود المستخدم في قاعدة بيانات هذا المصنع (منع الجلسات العالقة من مواقع أخرى)
    try {
        const tenantId = getCurrentTenantId();
        const { data: dbUser, error } = await supabase
            .from('system_users')
            .select('*')
            .eq('id', user.id)
            .single();

        if (error || !dbUser || !dbUser.is_active || (tenantId && tenantId !== '00000000-0000-0000-0000-000000000001' && dbUser.tenant_id !== tenantId && user.role !== 'super_admin')) {
            console.warn('[Admin Guard] User session does not exist in this database or tenant. Logging out foreign session.');
            await logoutUser();
            return false;
        }

        // تحديث بيانات الجلسة بأحدث البيانات الفعلية من قاعدة البيانات
        user.full_name = dbUser.full_name;
        user.role = dbUser.role;
        user.username = dbUser.username;
    } catch (err) {
        console.error('Error verifying admin user in DB:', err);
    }

    currentUserContext = user;
    updateUserProfileUI(user);

    const tenant = getCurrentTenant();
    if (tenant) {
        applyTenantBranding(tenant);
        if (tenant.name) {
            const activeBadge = document.getElementById('activeTenantBadge');
            const activeName = document.getElementById('activeTenantName');
            if (activeName) activeName.textContent = tenant.name;
            if (activeBadge) activeBadge.classList.remove('hidden');
            document.title = `لوحة تحكم ${tenant.name} | ألترا سوفت`;

            const adminFooterEl = document.getElementById('admin-footer-factory-name');
            if (adminFooterEl) adminFooterEl.textContent = tenant.name;
        }
    }

    return true;
}

function updateUserProfileUI(profile) {
    document.getElementById('current-user-name').textContent = profile.full_name;
    document.getElementById('user-avatar').textContent = profile.full_name.charAt(0).toUpperCase();
    
    const roleText = profile.role === 'owner' ? 'مالك النظام' : 'مدير نظام';
    const roleColor = profile.role === 'owner' ? 'text-red-500' : 'text-devo-orange';
    
    const roleEl = document.getElementById('current-user-role');
    if (roleEl) {
        roleEl.textContent = roleText;
        roleEl.className = `text-xs font-bold ${roleColor}`;
    }

    // إخفاء/إظهار تاب إدارة الحسابات والإعدادات للمالك فقط
    const usersLink = document.querySelector('[data-target="view-users"]');
    const settingsGroup = document.getElementById('sidebar-settings-group');
    const settingsLink = document.querySelector('[data-target="view-settings"]');
    const isOwner = profile.role === 'owner';
    if (usersLink) {
        usersLink.classList.toggle('hidden', !isOwner);
    }
    if (settingsGroup) {
        settingsGroup.classList.toggle('hidden', !isOwner);
    } else if (settingsLink) {
        settingsLink.classList.toggle('hidden', !isOwner);
    }
}
// --- Navigation Engine (Router Logic) ---
const views = document.querySelectorAll('.view-section');
const navLinks = document.querySelectorAll('.nav-link');
const pageTitle = document.getElementById('page-title');

export function switchView(targetId, titleElement) {
    const settingsSubtabsList = [
        'view-home-settings',
        'view-invoice-settings',
        'view-theme-manager',
        'view-barcode-settings',
        'view-telegram-settings',
        'view-backup-restore',
        'view-google-drive-settings',
        'view-excel-settings',
        'view-api-settings'
    ];

    if (settingsSubtabsList.includes(targetId)) {
        const settingsLink = document.querySelector('[data-target="view-settings"]');
        switchView('view-settings', settingsLink);
        switchSettingsSubtab(targetId);
        return;
    }

    if (!titleElement) {
        titleElement = document.querySelector(`.nav-link[data-target="${targetId}"]`);
    }

    // 1. Hide all views
    views.forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('animate-fade-in'); 
    });

    // 2. Remove active state from all links
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('bg-devo-orange/10', 'text-devo-orange');
        link.classList.add('text-devo-muted');
    });

    // 2.1 التعامل مع القائمة الجانبية للتقارير (تمدد أو طي تلقائي عند الخروج)
    const reportsSubmenu = document.getElementById('sidebar-reports-submenu');
    const reportsChevron = document.getElementById('reports-chevron');
    const reportsToggle = document.getElementById('sidebar-reports-toggle');

    if (targetId === 'view-reports') {
        if (reportsSubmenu) reportsSubmenu.classList.remove('hidden');
        if (reportsChevron) reportsChevron.classList.add('rotate-180');
        if (reportsToggle) {
            reportsToggle.classList.remove('text-devo-muted');
            reportsToggle.classList.add('text-white');
        }
    } else {
        // الخروج خارج التقارير: طي القائمة الفرعية تلقائياً
        if (reportsSubmenu) reportsSubmenu.classList.add('hidden');
        if (reportsChevron) reportsChevron.classList.remove('rotate-180');
        if (reportsToggle) {
            reportsToggle.classList.remove('text-white', 'bg-devo-orange/10', 'text-devo-orange');
            reportsToggle.classList.add('text-devo-muted');
        }
    }

    // 2.2 التعامل مع القائمة الجانبية للإعدادات (تمدد أو طي تلقائي عند الخروج)
    const settingsSubmenu = document.getElementById('sidebar-settings-submenu');
    const settingsChevron = document.getElementById('settings-chevron');
    const settingsToggle = document.getElementById('sidebar-settings-toggle');

    if (targetId === 'view-settings') {
        if (settingsSubmenu) settingsSubmenu.classList.remove('hidden');
        if (settingsChevron) settingsChevron.classList.add('rotate-180');
        if (settingsToggle) {
            settingsToggle.classList.remove('text-devo-muted');
            settingsToggle.classList.add('text-white');
        }
    } else {
        // الخروج خارج الإعدادات: طي القائمة الفرعية تلقائياً
        if (settingsSubmenu) settingsSubmenu.classList.add('hidden');
        if (settingsChevron) settingsChevron.classList.remove('rotate-180');
        if (settingsToggle) {
            settingsToggle.classList.remove('text-white', 'bg-devo-orange/10', 'text-devo-orange');
            settingsToggle.classList.add('text-devo-muted');
        }
    }

    // إظهار أو إخفاء أزرار إجراءات التقارير بالهيدر العلوي (طباعة وإرسال لتليجرام)
    const repHeaderActions = document.getElementById('reports-header-actions');
    if (repHeaderActions) {
        if (targetId === 'view-reports') {
            repHeaderActions.classList.remove('hidden');
            repHeaderActions.classList.add('flex');
        } else {
            repHeaderActions.classList.add('hidden');
            repHeaderActions.classList.remove('flex');
        }
    }

    // 3. Show the target view
    const targetView = document.getElementById(targetId);
    if (targetView) {
        targetView.classList.remove('hidden');
        // targetView.classList.add('animate-fade-in'); 
    }

    // 4. Highlight active link
    if (titleElement) {
        titleElement.classList.remove('text-devo-muted');
        titleElement.classList.add('bg-devo-orange/10', 'text-devo-orange');
        const pt = document.getElementById('page-title');
        if (pt && titleElement.querySelector('span')) {
            pt.textContent = titleElement.querySelector('span').textContent;
        }
    }

    // 5. Initialize View Logic (Lazy Loading)
    loadViewLogic(targetId, titleElement);

    // 6. Save Standing Position per tenant
    saveAdminStandingPosition(targetId, {
        subtab: titleElement?.getAttribute('data-subtab') || null
    });
}
window.switchView = switchView;

// Map views to their specific JS initialization functions
async function loadViewLogic(targetId, titleElement) {
    
    if (targetId === 'view-users' && currentUserContext?.role !== 'owner') {
        showToast('عفواً، هذه الصفحة مخصصة لمالك النظام فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return; 
    }

    if (targetId === 'view-settings' && currentUserContext?.role !== 'owner') {
        showToast('عفواً، صفحة الإعدادات مخصصة لمالك النظام فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return;
    }




    if (targetId === 'view-theme-manager' && currentUserContext?.role !== 'owner') {
        showToast('عفواً، هذه الصفحة مخصصة لمالك النظام فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return; 
    }

    if (targetId === 'view-home-settings' && currentUserContext?.role !== 'owner') {
        showToast('عفواً، هذه الصفحة مخصصة لمالك النظام فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return; 
    }

    if (targetId === 'view-notifications' && !['owner', 'admin'].includes(currentUserContext?.role)) {
        showToast('عفواً، هذه الصفحة مخصصة للمدراء والمالكين فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return; 
    }

    if (targetId === 'view-add-batch' && !['owner', 'admin'].includes(currentUserContext?.role)) {
        showToast('عفواً، هذه الصفحة مخصصة للمدراء والمالكين فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return; 
    }

    if (targetId === 'view-system-reset' && currentUserContext?.role !== 'owner') {
        showToast('⛔ هذه الصفحة مخصصة لمالك النظام فقط', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return;
    }

    if (targetId === 'view-backup-restore' && !['owner', 'admin'].includes(currentUserContext?.role)) {
        showToast('عفواً، هذه الصفحة مخصصة للمدراء والمالكين فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return;
    }

    if (targetId === 'view-import-images' && !['owner', 'admin'].includes(currentUserContext?.role)) {
        showToast('عفواً، هذه الصفحة مخصصة للمدراء والمالكين فقط 🛑', 'error');
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
        return;
    }

    switch (targetId) {
        case 'view-dashboard':
            const { initDashboard } = await import('./dashboard.js');
            await initDashboard();
            break;
        case 'view-stock-alerts':
            const { initStockAlertsView } = await import('./stock_alerts.js');
            await initStockAlertsView();
            break;
        case 'view-reports': {
            let targetSubTab = titleElement?.getAttribute('data-report-tab') || 'sales';
            if (targetSubTab === 'workers') targetSubTab = 'staff';
            const { initReportsView, switchReportTab } = await import('./reports.js');
            await initReportsView(targetSubTab);
            if (targetSubTab) {
                switchReportTab(targetSubTab);
            }
            break;
        }
        case 'view-users':
            await initUsersView();
            break;
        case 'view-definitions':
            const { initDefinitionsView } = await import('./definitions.js');
            initDefinitionsView();
            break;
        case 'view-models':
            const { initModelsView } = await import('./models.js?v=8.1'); 
            await initModelsView(); 
            break;
        case 'view-settings': {
            const requestedSubtab = titleElement?.getAttribute('data-settings-subtab') || currentSettingsSubtab || 'view-home-settings';
            await switchSettingsSubtab(requestedSubtab);
            break;
        }
        case 'view-home-settings':
            await initHomeSettingsView();
            break;
        case 'view-bulk-edits':
            const { initBulkEditsView } = await import('./bulk_edits.js');
            await initBulkEditsView();
            break;
        case 'view-print-barcodes':
            const { initPrintBarcodesView } = await import('./print_barcodes.js');
            await initPrintBarcodesView();
            break;
        case 'view-admin-orders': {
            const { initAdminOrdersView } = await import('./admin_orders.js?v=8.3');
            await initAdminOrdersView();
            const subtab = titleElement?.getAttribute('data-subtab');
            if (subtab === 'visitor' && window.switchAdminOrdersTab) {
                window.switchAdminOrdersTab('visitor');
            }
            break;
        }
        case 'view-deposit-reports':
            const { initDepositReportsView } = await import('./deposit_reports.js');
            await initDepositReportsView();
            break;
        case 'view-import-stock':
            const { initImportStockView } = await import('./import_stock.js');
            await initImportStockView();
            break;
        case 'view-import-images':
            const { initImportImagesView } = await import('./import_images.js');
            await initImportImagesView();
            break;
        case 'view-add-batch':
            const { initInboundInvoicesView } = await import('./inbound_invoices.js');
            await initInboundInvoicesView();
            break;
        case 'view-theme-manager':
            const { initThemeManagerView } = await import('./theme_manager.js');
            await initThemeManagerView();
            break;
        case 'view-promo-cards':
            await initPromoCardsView();
            break;
        case 'view-subscription':
            const { initFactorySubscriptionView } = await import('./factory_subscription.js');
            await initFactorySubscriptionView();
            break;
        case 'view-system-audit-logs':
            const { initSystemAuditLogs } = await import('./system_audit_logs.js');
            await initSystemAuditLogs();
            break;
        case 'view-notifications':
            const { initNotificationsView } = await import('./notifications_view.js');
            await initNotificationsView();
            break;
        case 'view-backup-restore':
            const { initBackupRestoreView } = await import('./backup_restore.js');
            initBackupRestoreView();
            break;
        case 'view-google-drive-settings':
            await switchView('view-settings');
            await switchSettingsSubtab('view-google-drive-settings');
            break;
        case 'view-excel-settings':
            await switchView('view-settings');
            await switchSettingsSubtab('view-excel-settings');
            break;
        case 'view-api-settings':
            await switchView('view-settings');
            await switchSettingsSubtab('view-api-settings');
            break;
    }
}

export async function switchSettingsSubtab(subtabId) {
    const subviews = document.querySelectorAll('.settings-subview');
    const subtabBtns = document.querySelectorAll('.settings-subtab-btn');

    currentSettingsSubtab = subtabId;
    saveAdminStandingPosition('view-settings', { settingsSubtab: subtabId });

    subviews.forEach(sv => sv.classList.add('hidden'));

    subtabBtns.forEach(btn => {
        const target = btn.getAttribute('data-settings-subtab');
        if (target === subtabId) {
            btn.className = 'settings-subtab-btn px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 bg-devo-orange text-white shadow-md cursor-pointer';
        } else {
            btn.className = 'settings-subtab-btn px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 text-devo-muted hover:bg-devo-gray/50 hover:text-white cursor-pointer';
        }
    });

    // تحديث تمييز الرابط النشط في القائمة الجانبية للإعدادات
    const settingsSublinks = document.querySelectorAll('.settings-sublink');
    settingsSublinks.forEach(link => {
        if (link.getAttribute('data-settings-subtab') === subtabId) {
            link.classList.remove('text-devo-muted');
            link.classList.add('text-devo-orange', 'bg-devo-orange/15', 'font-bold');
        } else {
            link.classList.remove('text-devo-orange', 'bg-devo-orange/15', 'font-bold');
            link.classList.add('text-devo-muted');
        }
    });

    // تحديث عنوان الصفحة بالهيدر العلوي
    const settingsTitles = {
        'view-home-settings': 'واجهة الموقع',
        'view-invoice-settings': 'التحكم في الفواتير',
        'view-theme-manager': 'إدارة المظهر (Themes)',
        'view-barcode-settings': 'إعدادات الباركود والـ QR',
        'view-telegram-settings': 'بوت التليجرام والإشعارات',
        'view-backup-restore': 'النسخ الاحتياطي والاستعادة',
        'view-google-drive-settings': 'إعدادات Google API',
        'view-excel-settings': 'قوالب وإعدادات استيراد/تصدير Excel',
        'view-api-settings': 'الربط البرمجي ومفاتيح API'
    };
    const pt = document.getElementById('page-title');
    if (pt && settingsTitles[subtabId]) {
        pt.textContent = settingsTitles[subtabId];
    }

    const targetSub = document.getElementById(subtabId);
    if (targetSub) {
        targetSub.classList.remove('hidden');
    }

    switch (subtabId) {
        case 'view-home-settings':
            await initHomeSettingsView();
            break;
        case 'view-invoice-settings':
            await initHomeSettingsView();
            if (typeof window.updateInvoicePreview === 'function') {
                window.updateInvoicePreview();
            }
            break;
        case 'view-theme-manager':
            const { initThemeManagerView } = await import('./theme_manager.js');
            await initThemeManagerView();
            break;
        case 'view-barcode-settings':
            await initHomeSettingsView();
            break;
        case 'view-telegram-settings':
            const { loadTelegramSettings } = await import('./notifications_view.js');
            if (typeof loadTelegramSettings === 'function') {
                await loadTelegramSettings();
            }
            break;
        case 'view-backup-restore':
            const { initBackupRestoreView } = await import('./backup_restore.js');
            initBackupRestoreView();
            break;
        case 'view-google-drive-settings': {
            const { initGoogleApiSettingsView } = await import('./import_images.js');
            if (typeof initGoogleApiSettingsView === 'function') {
                initGoogleApiSettingsView();
            }
            break;
        }
        case 'view-excel-settings': {
            const { initExcelSettingsView } = await import('./excel_settings.js');
            if (typeof initExcelSettingsView === 'function') {
                await initExcelSettingsView();
            }
            break;
        }
        case 'view-api-settings': {
            const { initApiKeysView } = await import('./api_keys_view.js');
            if (typeof initApiKeysView === 'function') {
                await initApiKeysView();
            }
            break;
        }
    }
}
window.switchSettingsSubtab = switchSettingsSubtab;

// --- Event Listeners Initialization ---
async function initRouter() {
    // مراقبة وإظهار بنر الاتصال بالإنترنت عند الانقطاع
    initNetworkStatusMonitor();

    // 1. تهيئة سياق المصنع النشط أولاً لضمان تحميل الهوية والثيم الصحيح لهذا المصنع
    try {
        await initializeTenantContext();
    } catch(e) { console.error('Tenant init error:', e); }

    // 2. تزامن المظهر النشط الخاص بهذا المصنع من قاعدة البيانات
    await syncActiveTheme();

    // الاستماع لأي تغيير حي في المظهر
    window.addEventListener('ultrasoft:themeChanged', (e) => {
        if (e.detail) {
            import('../../services/theme.js').then(m => m.applyTheme(e.detail));
        }
    });

    // Wait for authentication before rendering anything
    const isAuth = await authenticateAdmin();
    if (!isAuth) return;

    // تهيئة نظام الإشعارات اللحظية للأدمن
    initNotifications();

    // Attach click events to Sidebar Links (including reports sublinks)
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            switchView(targetId, link);
        });
    });

    // Attach click events to Reports Sidebar Accordion Toggle
    const reportsToggleBtn = document.getElementById('sidebar-reports-toggle');
    if (reportsToggleBtn) {
        reportsToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const submenu = document.getElementById('sidebar-reports-submenu');
            const chevron = document.getElementById('reports-chevron');
            if (submenu) {
                const isHidden = submenu.classList.contains('hidden');
                if (isHidden) {
                    submenu.classList.remove('hidden');
                    if (chevron) chevron.classList.add('rotate-180');
                    const currentVisible = document.querySelector('.view-section:not(.hidden)');
                    if (currentVisible?.id !== 'view-reports') {
                        const firstSublink = submenu.querySelector('.report-sublink');
                        if (firstSublink) firstSublink.click();
                    }
                } else {
                    submenu.classList.add('hidden');
                    if (chevron) chevron.classList.remove('rotate-180');
                }
            }
        });
    }

    // Attach click events to Settings Sidebar Accordion Toggle
    const settingsToggleBtn = document.getElementById('sidebar-settings-toggle');
    if (settingsToggleBtn) {
        settingsToggleBtn.addEventListener('click', (e) => {
            e.preventDefault();
            const submenu = document.getElementById('sidebar-settings-submenu');
            const chevron = document.getElementById('settings-chevron');
            if (submenu) {
                const isHidden = submenu.classList.contains('hidden');
                if (isHidden) {
                    submenu.classList.remove('hidden');
                    if (chevron) chevron.classList.add('rotate-180');
                    const currentVisible = document.querySelector('.view-section:not(.hidden)');
                    if (currentVisible?.id !== 'view-settings') {
                        const firstSublink = submenu.querySelector('.settings-sublink');
                        if (firstSublink) firstSublink.click();
                    }
                } else {
                    submenu.classList.add('hidden');
                    if (chevron) chevron.classList.remove('rotate-180');
                }
            }
        });
    }

    // Attach click events to Settings Subtabs
    document.querySelectorAll('.settings-subtab-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            const subtabId = btn.getAttribute('data-settings-subtab');
            if (subtabId) switchSettingsSubtab(subtabId);
        });
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        logoutUser(); 
    });

    // 🌟 فحص الرابط العميق أو استعادة موقع الوقوف المحفوظ لكل مصنع بدقة 🌟
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin_model')) {
        // إذا كان هناك رابط موديل، افتح صفحة الموديلات
        const modelsLink = document.querySelector('[data-target="view-models"]');
        if (modelsLink) switchView('view-models', modelsLink);
    } else {
        const tenantId = getCurrentTenantId() || 'default';
        let restored = false;
        try {
            const isolatedKey = getTenantStorageKey('ultrasoft_admin_view');
            const rawState = localStorage.getItem(isolatedKey) || localStorage.getItem(`ultrasoft_admin_view_${tenantId}`) || localStorage.getItem('ultrasoft_admin_view_default');
            if (rawState) {
                const state = JSON.parse(rawState);
                if (state && state.targetId && document.getElementById(state.targetId)) {
                    // التحقق من الصلاحيات للمالك والمديرين للموقع المحفوظ
                    const isOwner = currentUserContext?.role === 'owner';
                    const isAdmin = ['owner', 'admin'].includes(currentUserContext?.role);
                    const restrictedOwnerViews = ['view-users', 'view-settings', 'view-theme-manager', 'view-home-settings', 'view-system-reset'];
                    const restrictedAdminViews = ['view-notifications', 'view-add-batch', 'view-backup-restore'];

                    let allowed = true;
                    if (restrictedOwnerViews.includes(state.targetId) && !isOwner) allowed = false;
                    if (restrictedAdminViews.includes(state.targetId) && !isAdmin) allowed = false;

                    if (allowed) {
                        if (state.settingsSubtab) currentSettingsSubtab = state.settingsSubtab;
                        const targetLink = document.querySelector(`[data-target="${state.targetId}"]`);
                        switchView(state.targetId, targetLink);
                        if (state.targetId === 'view-settings' && state.settingsSubtab) {
                            switchSettingsSubtab(state.settingsSubtab);
                        }
                        if (state.targetId === 'view-admin-orders' && state.subtab && window.switchAdminOrdersTab) {
                            window.switchAdminOrdersTab(state.subtab);
                        }
                        restored = true;
                    }
                }
            }
        } catch (e) {
            console.warn('Error restoring admin standing view:', e);
        }

        if (!restored) {
            const defaultLink = document.querySelector('[data-target="view-dashboard"]');
            if (defaultLink) switchView('view-dashboard', defaultLink);
        }
    }
}

// ==========================================
// 🌟 Engine: Refresh All System & Website Data 🌟
// ==========================================
export async function refreshAllSystemData(options = {}) {
    const isSilent = options.silent === true;

    const icons = document.querySelectorAll('#global-refresh-icon, #refresh-icon, .refresh-icon-spin');
    icons.forEach(i => i.classList.add('animate-spin'));

    if (!isSilent) {
        showToast('جاري جلب أحدث البيانات من قاعدة البيانات...', 'info');
    }

    try {
        // 1. Refetch definitions & lookup caches for dependent modules
        const modelsMod = await import('./models.js').catch(() => null);
        if (modelsMod && typeof modelsMod.loadDefinitionsCache === 'function') {
            await modelsMod.loadDefinitionsCache();
        }

        const bulkMod = await import('./bulk_edits.js').catch(() => null);
        if (bulkMod && typeof bulkMod.fetchBulkFilterOptions === 'function') {
            await bulkMod.fetchBulkFilterOptions();
        }

        const barcodeMod = await import('./print_barcodes.js').catch(() => null);
        if (barcodeMod && typeof barcodeMod.fetchBarcodeFilterOptions === 'function') {
            await barcodeMod.fetchBarcodeFilterOptions();
        }

        const importMod = await import('./import_stock.js').catch(() => null);
        if (importMod && typeof importMod.loadInitialData === 'function') {
            await importMod.loadInitialData();
        }

        const inboundMod = await import('./inbound_invoices.js').catch(() => null);
        if (inboundMod && typeof inboundMod.loadInboundData === 'function') {
            await inboundMod.loadInboundData();
        }

        // 2. Identify active view and refresh its data
        const activeView = document.querySelector('.view-section:not(.hidden)');
        const activeViewId = activeView ? activeView.id : null;

        if (activeViewId) {
            switch (activeViewId) {
                case 'view-dashboard': {
                    const dashMod = await import('./dashboard.js').catch(() => null);
                    if (dashMod && typeof dashMod.fetchDashboardData === 'function') {
                        await dashMod.fetchDashboardData();
                    }
                    break;
                }
                case 'view-models': {
                    if (modelsMod && typeof modelsMod.fetchAllModelsChunked === 'function') {
                        await modelsMod.fetchAllModelsChunked();
                    }
                    break;
                }
                case 'view-definitions': {
                    const defMod = await import('./definitions.js').catch(() => null);
                    if (defMod && typeof defMod.loadCurrentTabData === 'function') {
                        await defMod.loadCurrentTabData();
                    }
                    break;
                }
                case 'view-admin-orders': {
                    const ordersMod = await import('./admin_orders.js').catch(() => null);
                    if (ordersMod && typeof ordersMod.fetchAdminOrders === 'function') {
                        await ordersMod.fetchAdminOrders();
                    }
                    break;
                }
                case 'view-add-batch': {
                    if (inboundMod && typeof inboundMod.loadInboundData === 'function') {
                        await inboundMod.loadInboundData();
                    }
                    break;
                }


                case 'view-bulk-edits': {
                    if (bulkMod && typeof bulkMod.fetchBulkModels === 'function') {
                        await bulkMod.fetchBulkModels();
                    }
                    break;
                }
                case 'view-print-barcodes': {
                    if (barcodeMod && typeof barcodeMod.fetchBarcodeModels === 'function') {
                        await barcodeMod.fetchBarcodeModels();
                    }
                    break;
                }
                case 'view-import-images': {
                    const imgMod = await import('./import_images.js').catch(() => null);
                    if (imgMod && typeof imgMod.initImportImagesView === 'function') {
                        await imgMod.initImportImagesView();
                    }
                    break;
                }
                case 'view-home-settings': {
                    const hsMod = await import('./home_settings.js').catch(() => null);
                    if (hsMod && typeof hsMod.loadHeroSettings === 'function') {
                        await hsMod.loadHeroSettings();
                    }
                    break;
                }
                case 'view-theme-manager': {
                    const themeMod = await import('./theme_manager.js').catch(() => null);
                    if (themeMod && typeof themeMod.loadThemes === 'function') {
                        await themeMod.loadThemes();
                    }
                    break;
                }
                case 'view-users': {
                    const usersMod = await import('./users.js').catch(() => null);
                    if (usersMod && typeof usersMod.loadUsers === 'function') {
                        await usersMod.loadUsers();
                    }
                    break;
                }
            }
        }

        window.dispatchEvent(new CustomEvent('devo:global-data-refreshed'));

        if (!isSilent) {
            showToast('تم تحديث جميع بيانات النظام بنجاح 🔄', 'success');
        }
    } catch (err) {
        console.error('Data refresh error:', err);
        if (!isSilent) {
            showToast('حدث خطأ أثناء تحديث البيانات', 'error');
        }
    } finally {
        icons.forEach(i => i.classList.remove('animate-spin'));
    }
}

window.refreshAllSystemData = refreshAllSystemData;
window.switchView = switchView;
window.switchSettingsSubtab = switchSettingsSubtab;

// Start the Router
document.addEventListener('DOMContentLoaded', initRouter);