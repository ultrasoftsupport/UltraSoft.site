import { requireAuth, logoutUser } from '../../services/auth.js';
import { showToast } from '../../components/toast.js';
import { initHomeSettingsView, initPromoCardsView } from './home_settings.js';
// استيراد صفحة المستخدمين (كما كانت في كودك)
import { initUsersView } from './users.js';
import { syncActiveTheme } from '../../services/theme.js';
import { initNotifications } from '../../services/notifications.js';
import { initNetworkStatusMonitor } from '../../components/network_banner.js';
import { initializeTenantContext, getCurrentTenant } from '../../services/tenant_service.js';

// --- Security Check (Protect the Admin Route) ---
let currentUserContext = null;

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

    currentUserContext = user;
    updateUserProfileUI(user);

    const tenant = getCurrentTenant();
    if (tenant && tenant.name) {
        const activeBadge = document.getElementById('activeTenantBadge');
        const activeName = document.getElementById('activeTenantName');
        if (activeName) activeName.textContent = tenant.name;
        if (activeBadge) activeBadge.classList.remove('hidden');
        document.title = `لوحة تحكم ${tenant.name} | ألترا سوفت`;

        const adminFooterEl = document.getElementById('admin-footer-factory-name');
        if (adminFooterEl) adminFooterEl.textContent = tenant.name;
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

    // 🌟 السطر السحري لإخفاء/إظهار زر إدارة الحسابات بناءً على الصلاحية 🌟
    const usersLink = document.querySelector('[data-target="view-users"]');
    if (usersLink) {
        if (profile.role === 'owner') {
            usersLink.classList.remove('hidden'); // إظهار للمالك
        } else {
            usersLink.classList.add('hidden'); // إخفاء للمدير
        }
    }
}
// --- Navigation Engine (Router Logic) ---
const views = document.querySelectorAll('.view-section');
const navLinks = document.querySelectorAll('.nav-link');
const pageTitle = document.getElementById('page-title');

function switchView(targetId, titleElement) {
    // 1. Hide all views
    views.forEach(view => {
        view.classList.add('hidden');
        view.classList.remove('animate-fade-in'); 
    });

    // 2. Remove active state from all links
    navLinks.forEach(link => {
        link.classList.remove('bg-devo-orange/10', 'text-devo-orange');
        link.classList.add('text-devo-muted');
    });

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
    loadViewLogic(targetId);
}

// Map views to their specific JS initialization functions
async function loadViewLogic(targetId) {
    
    if (targetId === 'view-users' && currentUserContext?.role !== 'owner') {
        showToast('عفواً، هذه الصفحة مخصصة لمالك النظام فقط 🛑', 'error');
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

    switch (targetId) {
            case 'view-dashboard':
            const { initDashboard } = await import('./dashboard.js');
            await initDashboard();
            break;
        case 'view-users':
            await initUsersView();
            break;
        case 'view-definitions':
            const { initDefinitionsView } = await import('./definitions.js');
            initDefinitionsView();
            break;
        case 'view-models':
            const { initModelsView } = await import('./models.js?v=8.0'); 
            await initModelsView(); 
            break;
        case 'view-settings':
            await switchSettingsSubtab(currentSettingsSubtab || 'view-home-settings');
            break;
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
        case 'view-admin-orders':
            const { initAdminOrdersView } = await import('./admin_orders.js?v=8.0');
            await initAdminOrdersView();
            break;
        case 'view-deposit-reports':
            const { initDepositReportsView } = await import('./deposit_reports.js');
            await initDepositReportsView();
            break;
        case 'view-import-stock':
            const { initImportStockView } = await import('./import_stock.js');
            await initImportStockView();
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
        case 'view-notifications':
            const { initNotificationsView } = await import('./notifications_view.js');
            await initNotificationsView();
            break;
        case 'view-backup-restore':
            const { initBackupRestoreView } = await import('./backup_restore.js');
            initBackupRestoreView();
            break;
    }
}

let currentSettingsSubtab = 'view-home-settings';

export async function switchSettingsSubtab(subtabId) {
    const subviews = document.querySelectorAll('.settings-subview');
    const subtabBtns = document.querySelectorAll('.settings-subtab-btn');

    currentSettingsSubtab = subtabId;

    subviews.forEach(sv => sv.classList.add('hidden'));

    subtabBtns.forEach(btn => {
        const target = btn.getAttribute('data-settings-subtab');
        if (target === subtabId) {
            btn.className = 'settings-subtab-btn px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 bg-devo-orange text-white shadow-md cursor-pointer';
        } else {
            btn.className = 'settings-subtab-btn px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 text-devo-muted hover:bg-devo-gray/50 hover:text-white cursor-pointer';
        }
    });

    const targetSub = document.getElementById(subtabId);
    if (targetSub) {
        targetSub.classList.remove('hidden');
    }

    switch (subtabId) {
        case 'view-home-settings':
            await initHomeSettingsView();
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
    }
}

// --- Event Listeners Initialization ---
async function initRouter() {
    // مراقبة وإظهار بنر الاتصال بالإنترنت عند الانقطاع
    initNetworkStatusMonitor();

    // تزامن المظهر النشط من قاعدة البيانات
    syncActiveTheme();

    // Wait for authentication before rendering anything
    const isAuth = await authenticateAdmin();
    if (!isAuth) return;

    // تهيئة نظام الإشعارات اللحظية للأدمن
    initNotifications();

    // Attach click events to Sidebar Links
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            const targetId = link.getAttribute('data-target');
            switchView(targetId, link);
        });
    });

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

    // 🌟 الإصلاح: فحص الرابط العميق قبل فتح الداشبورد 🌟
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('admin_model')) {
        // إذا كان هناك رابط موديل، افتح صفحة الموديلات
        const modelsLink = document.querySelector('[data-target="view-models"]');
        if (modelsLink) switchView('view-models', modelsLink);
    } else {
        // غير ذلك، افتح الداشبورد كالمعتاد
        const defaultLink = document.querySelector('[data-target="view-dashboard"]');
        if (defaultLink) switchView('view-dashboard', defaultLink);
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

// Start the Router
document.addEventListener('DOMContentLoaded', initRouter);