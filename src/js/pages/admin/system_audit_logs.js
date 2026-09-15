import { supabase } from '../../config/supabase.js';
import { getCurrentTenantId, getCurrentTenant } from '../../services/tenant_service.js';
import { showToast } from '../../components/toast.js';
import { showAuditLogDetails, renderHumanReadableDetails } from '../../services/audit_service.js';
import { escapeHtml } from '../../utils/sanitize.js';

let auditLogsData = [];
let filteredAuditLogs = [];
let currentPage = 1;
const pageSize = 20;

export async function initSystemAuditLogs() {
    setupAuditLogsEventListeners();
    await fetchAuditLogs();
}

function setupAuditLogsEventListeners() {
    const searchInput = document.getElementById('audit-search-input');
    const moduleSelect = document.getElementById('audit-filter-module');
    const actionSelect = document.getElementById('audit-filter-action');
    const dateStart = document.getElementById('audit-filter-date-start');
    const dateEnd = document.getElementById('audit-filter-date-end');
    const refreshBtn = document.getElementById('btn-refresh-audit-logs');

    if (searchInput) searchInput.addEventListener('input', applyAuditFilters);
    if (moduleSelect) moduleSelect.addEventListener('change', applyAuditFilters);
    if (actionSelect) actionSelect.addEventListener('change', applyAuditFilters);
    if (dateStart) dateStart.addEventListener('change', applyAuditFilters);
    if (dateEnd) dateEnd.addEventListener('change', applyAuditFilters);
    if (refreshBtn) refreshBtn.addEventListener('click', () => fetchAuditLogs());
}

export async function fetchAuditLogs() {
    const tbody = document.getElementById('audit-logs-tbody');
    if (!tbody) return;

    tbody.innerHTML = `
        <tr>
            <td colspan="6" class="p-12 text-center">
                <i class="ph ph-spinner animate-spin text-3xl text-devo-orange mb-2"></i>
                <p class="text-xs text-devo-muted">جاري تحميل سجلات النظام لجميع الفعاليات والعمليات...</p>
            </td>
        </tr>
    `;

    const activeTenant = getCurrentTenant();
    const currentTenantId = activeTenant?.id || getCurrentTenantId();

    try {
        let query = supabase.from('system_audit_logs').select('*');
        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data, error } = await query
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) throw error;

        auditLogsData = data || [];
        populateUserFilterOptions(auditLogsData);
        applyAuditFilters();

    } catch (err) {
        console.error('Error fetching system audit logs:', err);
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-8 text-center text-devo-error">
                    <i class="ph ph-warning-circle text-2xl mb-1 block"></i>
                    تعذر تحميل سجلات النظام: ${err.message || err}
                </td>
            </tr>
        `;
    }
}

function populateUserFilterOptions(logs) {
    const userSelect = document.getElementById('audit-filter-user');
    if (!userSelect) return;

    const currentSelection = userSelect.value;
    const usersSet = new Set();
    logs.forEach(l => {
        if (l.user_name) usersSet.add(l.user_name);
    });

    userSelect.innerHTML = `<option value="">كل المستخدمين</option>` + 
        Array.from(usersSet).map(u => `<option value="${u}">${u}</option>`).join('');

    userSelect.value = currentSelection;
    userSelect.onchange = applyAuditFilters;
}

export function applyAuditFilters() {
    const searchVal = document.getElementById('audit-search-input')?.value?.toLowerCase()?.trim() || '';
    const moduleVal = document.getElementById('audit-filter-module')?.value || '';
    const actionVal = document.getElementById('audit-filter-action')?.value || '';
    const userVal = document.getElementById('audit-filter-user')?.value || '';
    const dateStartVal = document.getElementById('audit-filter-date-start')?.value || '';
    const dateEndVal = document.getElementById('audit-filter-date-end')?.value || '';

    filteredAuditLogs = auditLogsData.filter(log => {
        if (moduleVal && log.module !== moduleVal) return false;
        if (actionVal && log.action_type !== actionVal) return false;
        if (userVal && log.user_name !== userVal) return false;

        if (dateStartVal) {
            const start = new Date(dateStartVal);
            start.setHours(0, 0, 0, 0);
            if (new Date(log.created_at) < start) return false;
        }

        if (dateEndVal) {
            const end = new Date(dateEndVal);
            end.setHours(23, 59, 59, 999);
            if (new Date(log.created_at) > end) return false;
        }

        if (searchVal) {
            const detailsStr = typeof log.details === 'object' ? JSON.stringify(log.details) : String(log.details || '');
            const matchUser = (log.user_name || '').toLowerCase().includes(searchVal);
            const matchModule = (log.module || '').toLowerCase().includes(searchVal);
            const matchAction = (log.action_type || '').toLowerCase().includes(searchVal);
            const matchEntity = (log.entity_type || '').toLowerCase().includes(searchVal);
            const matchDetails = detailsStr.toLowerCase().includes(searchVal);

            if (!matchUser && !matchModule && !matchAction && !matchEntity && !matchDetails) {
                return false;
            }
        }

        return true;
    });

    currentPage = 1;
    renderAuditLogsTable();
}

function renderAuditLogsTable() {
    const tbody = document.getElementById('audit-logs-tbody');
    const countEl = document.getElementById('audit-logs-count');
    if (countEl) countEl.textContent = `${filteredAuditLogs.length} سجل`;

    if (!tbody) return;

    if (filteredAuditLogs.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-12 text-center text-devo-muted italic">
                    <i class="ph ph-clock-counter-clockwise text-3xl mb-2 block opacity-40"></i>
                    لا توجد سجلات مطابقة للفلاتر المحددة.
                </td>
            </tr>
        `;
        renderPaginationControls(0);
        return;
    }

    const totalPages = Math.ceil(filteredAuditLogs.length / pageSize);
    const startIdx = (currentPage - 1) * pageSize;
    const pageItems = filteredAuditLogs.slice(startIdx, startIdx + pageSize);

    tbody.innerHTML = pageItems.map(log => {
        const dateStr = new Date(log.created_at).toLocaleString('ar-EG', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit', second: '2-digit'
        });

        const moduleBadge = getModuleBadge(log.module);
        const actionBadge = getActionBadge(log.action_type);

        const detailsText = formatDetailsPreview(log.details);

        return `
            <tr class="hover:bg-devo-black/40 transition-colors border-b border-devo-gray/30">
                <td class="p-3.5 text-xs font-mono text-devo-muted font-bold">${dateStr}</td>
                <td class="p-3.5">
                    <div class="flex items-center gap-2">
                        <div class="w-8 h-8 rounded-full bg-devo-orange/10 border border-devo-orange/20 flex items-center justify-center text-devo-orange font-bold text-xs">
                            ${escapeHtml((log.user_name || 'م')[0])}
                        </div>
                        <div>
                            <span class="font-bold text-white text-xs block">${escapeHtml(log.user_name || 'مستخدم النظام')}</span>
                            <span class="text-[10px] text-devo-muted uppercase">${escapeHtml(log.user_role || 'staff')}</span>
                        </div>
                    </div>
                </td>
                <td class="p-3.5">${moduleBadge}</td>
                <td class="p-3.5">${actionBadge}</td>
                <td class="p-3.5 text-xs text-devo-muted max-w-xs truncate font-mono">${escapeHtml(detailsText)}</td>
                <td class="p-3.5 text-center">
                    <button onclick="window.showAuditLogDetails('${escapeHtml(log.id)}')" class="px-2.5 py-1 rounded bg-devo-gray/40 hover:bg-devo-orange/20 hover:text-devo-orange text-white text-xs border border-devo-gray/50 transition-colors flex items-center gap-1 mx-auto">
                        <i class="ph ph-eye"></i> التفاصيل
                    </button>
                </td>
            </tr>
        `;
    }).join('');

    renderPaginationControls(totalPages);
}

function getModuleBadge(mod) {
    const map = {
        orders: '<span class="px-2.5 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-shopping-cart-simple"></i> الطلبات والأوردت</span>',
        models: '<span class="px-2.5 py-1 rounded bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-t-shirt"></i> الموديلات والمخزون</span>',
        definitions: '<span class="px-2.5 py-1 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-tree-structure"></i> التصنيفات والفئات</span>',
        excel_imports: '<span class="px-2.5 py-1 rounded bg-green-500/10 border border-green-500/30 text-green-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-file-xls"></i> استيراد إكسيل</span>',
        notifications: '<span class="px-2.5 py-1 rounded bg-purple-500/10 border border-purple-500/30 text-purple-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-bell-simple"></i> الإشعارات والرسائل</span>',
        offers: '<span class="px-2.5 py-1 rounded bg-pink-500/10 border border-pink-500/30 text-pink-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-tag"></i> العروض والخصومات</span>',
        settings: '<span class="px-2.5 py-1 rounded bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-gear"></i> إعدادات النظام</span>',
        accounts: '<span class="px-2.5 py-1 rounded bg-indigo-500/10 border border-indigo-500/30 text-indigo-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-users"></i> إدارة المستخدمين</span>',
        credits: '<span class="px-2.5 py-1 rounded bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 text-xs font-bold inline-flex items-center gap-1"><i class="ph ph-lightning"></i> الكريديت والاشتراكات</span>'
    };
    return map[mod] || `<span class="px-2 py-0.5 rounded bg-devo-gray text-white text-xs">${mod}</span>`;
}

function getActionBadge(act) {
    const map = {
        create: '<span class="text-devo-success font-bold text-xs"><i class="ph ph-plus-circle"></i> إنشاء جديد</span>',
        update: '<span class="text-sky-400 font-bold text-xs"><i class="ph ph-pencil-simple"></i> تعديل</span>',
        delete: '<span class="text-devo-error font-bold text-xs"><i class="ph ph-trash"></i> حذف</span>',
        bulk_edit: '<span class="text-amber-400 font-bold text-xs"><i class="ph ph-lightning"></i> تعديل مجمع</span>',
        excel_import: '<span class="text-emerald-400 font-bold text-xs"><i class="ph ph-upload-simple"></i> رفع إكسيل</span>',
        status_change: '<span class="text-purple-400 font-bold text-xs"><i class="ph ph-arrows-clockwise"></i> تغيير حالة</span>',
        recharge: '<span class="text-yellow-400 font-bold text-xs"><i class="ph ph-lightning"></i> شحن رصيد</span>'
    };
    return map[act] || `<span class="text-white text-xs">${act}</span>`;
}

function formatDetailsPreview(details) {
    if (!details) return '-';
    if (typeof details === 'string') return details;
    if (details.notes) return details.notes;
    if (details.message) return details.message;
    if (details.info) return details.info;
    if (details.description) return details.description;
    if (details.name) return `اسم: ${details.name}`;
    if (details.action) return `إجراء: ${details.action}`;
    return JSON.stringify(details);
}

function renderPaginationControls(totalPages) {
    const container = document.getElementById('audit-pagination-container');
    if (!container) return;

    if (totalPages <= 1) {
        container.innerHTML = '';
        return;
    }

    container.innerHTML = `
        <div class="flex items-center justify-between mt-4 px-2">
            <span class="text-xs text-devo-muted">صفحة ${currentPage} من ${totalPages}</span>
            <div class="flex items-center gap-2">
                <button onclick="window.changeAuditPage(${currentPage - 1})" ${currentPage === 1 ? 'disabled' : ''} class="px-3 py-1.5 rounded border border-devo-gray bg-devo-dark text-white hover:bg-devo-gray transition-colors disabled:opacity-40 text-xs">السابق</button>
                <button onclick="window.changeAuditPage(${currentPage + 1})" ${currentPage === totalPages ? 'disabled' : ''} class="px-3 py-1.5 rounded border border-devo-gray bg-devo-dark text-white hover:bg-devo-gray transition-colors disabled:opacity-40 text-xs">التالي</button>
            </div>
        </div>
    `;
}

window.changeAuditPage = (newPage) => {
    currentPage = newPage;
    renderAuditLogsTable();
};
