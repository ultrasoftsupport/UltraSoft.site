import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { getCurrentSession } from '../../services/auth.js';
import { printOrderCustomerInvoice, printOrderAdminInvoice, fetchInvoicePrintSettings, getUltraSoftBarcodeSVG } from '../../utils/print.js?v=2';
import { getCurrentTenantId } from '../../services/tenant_service.js';
import { logAuditEvent } from '../../services/audit_service.js';
import { getExcelProfiles, getActiveExcelProfile, buildOrdersExportRows } from '../../services/excel_templates_service.js';

let isInitialized = false;
let allAdminOrders = [];
let currentAdminOrdersTab = 'active'; // 'active' | 'archived' | 'visitor'
let currentUserProfile = null;
let currentEditingOrderId = null;
let localEditingItems = [];
let isLocalEditMode = false;
let localEditingInventory = {};

// 🌟 متغيرات إدارة طلبات الزوار 🌟
let allVisitorOrders = [];
let currentVisitorSubtab = 'pending'; // 'pending' | 'archived' | 'approved' | 'rejected' | 'all'
let visitorOrderUnderAction = null;
let visitorOrderEditingItems = [];

const statusConfig = {
    'created': { text: 'تم إنشاء الأوردر', color: 'bg-devo-gray text-white border-devo-gray' },
    'in_progress': { text: 'جاري العمل', color: 'bg-devo-orange/20 text-devo-orange border-devo-orange/50' },
    'editing': { text: 'جاري التعديل', color: 'bg-amber-500/20 text-amber-400 border-amber-500/50' },
    'registered': { text: 'تم التسجيل', color: 'bg-blue-500/20 text-blue-400 border-blue-500/50' },
    'preparing': { text: 'جاري التجهيز', color: 'bg-purple-500/20 text-purple-400 border-purple-500/50' },
    'shipped': { text: 'تم الشحن', color: 'bg-green-500/20 text-green-400 border-green-500/50' },
    'delivered': { text: 'تم التسليم', color: 'bg-devo-success/20 text-devo-success border-devo-success/50' }
};

export async function initAdminOrdersView() {
    if (isInitialized) return;

    const { session } = getCurrentSession();
    if(session) currentUserProfile = session.user;

    const filterInputIds = [
        'ao-search-num', 'ao-search-customer', 'ao-search-phone',
        'ao-worker-filter', 'ao-status', 'ao-date-from', 'ao-date-to',
        'ao-search'
    ];

    filterInputIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', applyAdminOrdersFilter);
            el.addEventListener('change', applyAdminOrdersFilter);
        }
    });

    const voSearchInput = document.getElementById('vo-search-input');
    if (voSearchInput) {
        voSearchInput.addEventListener('input', () => renderVisitorOrders());
    }

    await fetchAdminOrders();
    await fetchVisitorOrders();
    setupRealtimeAdminOrders(); // 🌟 تفعيل الرادار اللحظي الذكي 🌟
    setupVisitorOrdersRealtime(); // 🌟 تفعيل رادار طلبات الزوار 🌟

    isInitialized = true;
}

// ==========================================
// 🌟 1. استدعاء البيانات الأساسي 🌟
// ==========================================
export async function fetchAdminOrders() {
    const tBody = document.getElementById('ao-table-body');
    if(tBody && allAdminOrders.length === 0) tBody.innerHTML = `<tr><td colspan="9" class="p-10 text-center"><i class="ph ph-spinner animate-spin text-3xl text-devo-orange"></i></td></tr>`;

    const currentTenantId = getCurrentTenantId();
    let query = supabase
        .from('orders')
        .select(`
            *,
            system_users!orders_worker_id_fkey (full_name),
            order_items (
                *,
                models (id, name, factory_code, system_code, code_assignment_mode, image_url_1, model_sizes(size_id), classes(class_sizes(size_id)), model_images(image_url), model_inventory(color_id, color_system_code, color_factory_code)),
                colors (id, name, color_code)
            )
        `);

    if (currentTenantId) {
        query = query.eq('tenant_id', currentTenantId);
    }

    const { data, error } = await query.order('created_at', { ascending: false });
        
    if (!error && data) {
        allAdminOrders = data;
        populateWorkerFilter();
        updateAdminStats();
        applyAdminOrdersFilter();
    } else if (error) {
        showToast('حدث خطأ أثناء جلب الأوردرات', 'error');
        console.error(error);
    }
}

async function fetchFullOrderById(orderId) {
    try {
        const currentTenantId = getCurrentTenantId();
        let query = supabase
            .from('orders')
            .select(`
                *,
                system_users!orders_worker_id_fkey (full_name),
                order_items (
                    *,
                    models (id, name, factory_code, system_code, code_assignment_mode, image_url_1, model_sizes(size_id), classes(class_sizes(size_id)), model_images(image_url), model_inventory(color_id, color_system_code, color_factory_code)),
                    colors (id, name, color_code)
                )
            `)
            .eq('id', orderId);

        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data, error } = await query.maybeSingle();

        if (data && !error) {
            const index = allAdminOrders.findIndex(o => o.id === orderId);
            if (index > -1) {
                allAdminOrders[index] = data;
            } else {
                allAdminOrders.unshift(data);
            }
            return data;
        }
    } catch (e) {
        console.error('Error fetching full order by ID:', e);
    }
    return null;
}

// ==========================================
// 🌟 2. الرادار اللحظي (Targeted DOM Updates) 🌟
// ==========================================
function setupRealtimeAdminOrders() {
    const currentTenantId = getCurrentTenantId();
    const filterConfig = currentTenantId ? { filter: `tenant_id=eq.${currentTenantId}` } : {};

    supabase.channel('admin_orders_tracker_' + (currentTenantId || 'default'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'orders', ...filterConfig }, async (payload) => {
            if (currentTenantId && payload.new.tenant_id && payload.new.tenant_id !== currentTenantId) {
                return; // Ignore orders from other factories
            }

            // جلب الأوردر الجديد بالكامل مع علاقاته
            const data = await fetchFullOrderById(payload.new.id);
            
            if (data) {
                updateAdminStats();
                
                const tbody = document.getElementById('ao-table-body');
                if (tbody) {
                    const noDataRow = tbody.querySelector('.no-data-row');
                    if(noDataRow) noDataRow.remove(); 
                    
                    // حقن الصف الجديد في أعلى الجدول
                    tbody.insertAdjacentHTML('afterbegin', generateOrderRowHTML(data));
                    
                    // تنبيه مرئي (وميض برتقالي) للصف الجديد
                    const newRow = document.getElementById(`admin-order-row-${data.id}`);
                    if(newRow) {
                        newRow.classList.add('bg-devo-orange/30', 'transition-all', 'duration-500');
                        setTimeout(() => newRow.classList.remove('bg-devo-orange/30'), 3000);
                    }
                }
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'orders', ...filterConfig }, async (payload) => {
            if (currentTenantId && payload.new.tenant_id && payload.new.tenant_id !== currentTenantId) {
                return; // Ignore updates for orders of other factories
            }
            // جلب الأوردر التراكمي بالأصناف كاملة
            const updatedOrder = await fetchFullOrderById(payload.new.id) || payload.new;
            const index = allAdminOrders.findIndex(o => o.id === payload.new.id);
            if (index > -1) {
                updateAdminStats();
                
                // 🌟 تحديث الـ DOM للصف المستهدف وعمل وميض ملفت للانتباه لكي يعرف الأدمن أن هناك من يعمل عليه 🌟
                const existingRow = document.getElementById(`admin-order-row-${payload.new.id}`);
                if (existingRow) {
                    existingRow.outerHTML = generateOrderRowHTML(allAdminOrders[index]);
                    
                    const newRow = document.getElementById(`admin-order-row-${payload.new.id}`);
                    if (newRow) {
                        newRow.classList.add('bg-devo-info/30', 'transition-all', 'duration-500');
                        setTimeout(() => newRow.classList.remove('bg-devo-info/30'), 2000);
                    }
                }
            }
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'orders', ...filterConfig }, (payload) => {
            allAdminOrders = allAdminOrders.filter(o => o.id !== payload.old.id);
            updateAdminStats();
            
            // إزالة الصف من الشاشة بتأثير حركي
            const existingRow = document.getElementById(`admin-order-row-${payload.old.id}`);
            if (existingRow) {
                existingRow.classList.add('opacity-0', 'scale-95', 'transition-all');
                setTimeout(() => existingRow.remove(), 300);
            }
        })
        .subscribe(async (status, err) => {
            if (err && (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT')) {
                console.warn('⚠️ تنبيه في اتصال رادار الطلبات:', err);
            }
            if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
                try {
                    await supabase.auth.getSession();
                } catch (e) {
                    console.debug('Session check after channel disconnect:', e);
                }
            }
        });
}

// 🌐 إعادة الاتصال التلقائي برادار الأدمن عند عودة الإنترنت 🌐
window.addEventListener('online', () => {
    setupRealtimeAdminOrders();
});

// ==========================================
// 🌟 3. هندسة الـ HTML للصف الواحد 🌟
// ==========================================
function generateOrderRowHTML(o) {
    const dateStr = new Date(o.created_at).toLocaleString('ar-EG', { year: 'numeric', month: 'short', day: 'numeric', hour:'2-digit', minute:'2-digit' });
    const isOwner = currentUserProfile?.role === 'owner';
    const conf = statusConfig[o.status] || { text: 'غير معروف', color: 'text-devo-muted bg-transparent' };
    
    // الصلاحيات
    const isAssignedToMe = o.assigned_admin_name === currentUserProfile?.full_name;
    const canEdit = !o.is_locked || isAssignedToMe || isOwner;

    const isOwnerOrAdmin = currentUserProfile?.role === 'owner' || currentUserProfile?.role === 'admin';

    // الحماية والتأكد من إمكانية التعديل
    const isEditable = o.status === 'created' && !o.is_locked;
    const editBtnHtml = isOwnerOrAdmin
        ? (isEditable 
            ? `<button onclick="openEditOrderChoices('${o.id}')" class="p-1.5 bg-devo-orange/20 text-devo-orange hover:bg-devo-orange hover:text-white rounded transition-colors" title="تعديل الأوردر"><i class="ph ph-pencil-simple text-lg"></i></button>`
            : `<button disabled class="p-1.5 bg-devo-gray/30 text-devo-muted rounded cursor-not-allowed opacity-50" title="${o.is_locked ? 'الأوردر مقفل أو قيد التعديل حالياً' : 'يجب إعادة حالة الأوردر إلى تم إنشاء الأوردر لتعديله'}"><i class="ph ph-lock text-lg text-devo-muted"></i></button>`)
        : '';

    const lockIcon = `<button onclick="toggleOrderLock('${o.id}', ${!o.is_locked})" class="${o.is_locked ? 'text-devo-error' : 'text-devo-success'} p-1 hover:bg-white/10 rounded transition-colors" title="${o.is_locked ? 'إلغاء القفل' : 'قفل واستلام الأوردر'}"><i class="ph ${o.is_locked ? 'ph-lock' : 'ph-lock-open'} text-lg"></i></button>`;

    const assignedHTML = o.assigned_admin_name 
        ? `<span class="bg-devo-info/20 text-devo-info px-2 py-1 rounded text-[10px] font-bold"><i class="ph ph-user-gear"></i> ${o.assigned_admin_name}</span>` 
        : `<span class="text-devo-muted text-[10px]">-</span>`;

    const buildStatusOptions = (currentVal) => {
        return Object.keys(statusConfig).map(k => `<option value="${k}" ${k === currentVal ? 'selected' : ''}>${statusConfig[k].text}</option>`).join('');
    };

    const archivedBadge = o.is_archived 
        ? `<span class="bg-purple-500/20 text-purple-400 border border-purple-500/30 px-1.5 py-0.5 rounded text-[9px] font-bold">مؤرشف</span>` 
        : '';

    return `
        <tr id="admin-order-row-${o.id}" class="hover:bg-devo-black/40 transition-colors">
            <td class="p-3 font-mono text-devo-orange font-bold text-xs flex items-center gap-1.5">${o.invoice_number} ${archivedBadge} ${lockIcon}</td>
            <td class="p-3 text-devo-muted text-[10px]">${dateStr}</td>
            <td class="p-3 font-bold text-white text-xs">
                ${o.customer_name} <br>
                <span class="text-devo-muted text-[10px] font-mono">${o.phone_1}</span>
            </td>
            <td class="p-3 text-devo-muted text-[11px]"><i class="ph-fill ph-user-circle"></i> ${o.system_users?.full_name || '-'}</td>
            <td class="p-3 text-center text-white font-black">${o.total_series}</td>
            <td class="p-3 text-center text-devo-orange font-bold">${o.total_price}</td>
            <td class="p-3 text-center">${assignedHTML}</td>
            <td class="p-3 text-center">
                <select ${!canEdit ? 'disabled' : ''} onchange="updateOrderStatus('${o.id}', this.value)" class="bg-devo-black border border-devo-gray rounded px-2 py-1 text-white text-xs outline-none focus:border-devo-orange cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed">
                    ${buildStatusOptions(o.status)}
                </select>
                <div class="mt-1 text-[10px] ${conf.color} px-2 py-0.5 rounded inline-block">${conf.text}</div>
            </td>
            <td class="p-3">
                <div class="flex items-center justify-center gap-1.5">
                    <button onclick="exportSingleOrderToExcel('${o.id}')" class="p-1.5 bg-devo-success/10 text-devo-success hover:bg-devo-success hover:text-white rounded transition-colors" title="تصدير (Excel)"><i class="ph ph-file-xls text-lg"></i></button>

                    <button onclick="printAdminOrder('${o.id}', 'customer')" class="p-1.5 bg-gray-200 text-gray-800 hover:bg-white rounded transition-colors" title="طباعة فاتورة العميل"><i class="ph ph-receipt text-lg"></i></button>
                    <button onclick="printAdminOrder('${o.id}', 'detailed')" class="p-1.5 bg-devo-orange/20 text-devo-orange hover:bg-devo-orange hover:text-white rounded transition-colors" title="طباعة فاتورة الإدارة"><i class="ph ph-printer text-lg"></i></button>
                    ${editBtnHtml}
                    <button onclick="viewAdminOrderDetails('${o.id}')" class="p-1.5 bg-devo-info/10 text-devo-info hover:bg-devo-info hover:text-white rounded transition-colors" title="التفاصيل"><i class="ph ph-eye text-lg"></i></button>
                    ${o.is_archived 
                        ? `<button onclick="toggleOrderArchive('${o.id}', false)" class="p-1.5 bg-amber-500/10 text-amber-400 hover:bg-amber-500 hover:text-white rounded transition-colors" title="استعادة من الأرشيف"><i class="ph ph-arrow-u-up-left text-lg"></i></button>`
                        : `<button onclick="toggleOrderArchive('${o.id}', true)" class="p-1.5 bg-purple-500/10 text-purple-400 hover:bg-purple-500 hover:text-white rounded transition-colors" title="نقل إلى الأرشيف"><i class="ph ph-archive-box text-lg"></i></button>`
                    }
                    ${isOwner ? `<button onclick="deleteOrder('${o.id}')" class="p-1.5 bg-devo-error/10 text-devo-error hover:bg-devo-error hover:text-white rounded transition-colors" title="حذف وإرجاع المخزون"><i class="ph ph-trash text-lg"></i></button>` : ''}
                </div>
            </td>
        </tr>
    `;
}

// ==========================================
// 🌟 4. الإحصائيات والفلترة 🌟
// ==========================================
function populateWorkerFilter() {
    const select = document.getElementById('ao-worker-filter');
    if (!select) return;

    const currentVal = select.value;
    const workerNames = [...new Set(
        allAdminOrders
            .map(o => o.system_users?.full_name)
            .filter(Boolean)
    )].sort();

    let html = '<option value="">كل الموظفين / البائعين</option>';
    workerNames.forEach(name => {
        html += `<option value="${name}" ${name === currentVal ? 'selected' : ''}>${name}</option>`;
    });
    select.innerHTML = html;
}

window.resetAdminOrdersFilter = () => {
    const searchNum = document.getElementById('ao-search-num');
    const searchCust = document.getElementById('ao-search-customer');
    const searchPhone = document.getElementById('ao-search-phone');
    const legacySearch = document.getElementById('ao-search');
    const workerSelect = document.getElementById('ao-worker-filter');
    const statusSelect = document.getElementById('ao-status');
    const dateFrom = document.getElementById('ao-date-from');
    const dateTo = document.getElementById('ao-date-to');

    if (searchNum) searchNum.value = '';
    if (searchCust) searchCust.value = '';
    if (searchPhone) searchPhone.value = '';
    if (legacySearch) legacySearch.value = '';
    if (workerSelect) workerSelect.value = '';
    if (statusSelect) statusSelect.value = '';
    if (dateFrom) dateFrom.value = '';
    if (dateTo) dateTo.value = '';

    applyAdminOrdersFilter();
    showToast('تمت إعادة ضبط جميع الفلاتر', 'info');
};

window.switchAdminOrdersTab = (tab) => {
    currentAdminOrdersTab = tab;
    const activeBtn = document.getElementById('ao-tab-active');
    const archivedBtn = document.getElementById('ao-tab-archived');
    const visitorBtn = document.getElementById('ao-tab-visitor');
    const activeArchivedContainer = document.getElementById('ao-active-archived-container');
    const visitorContainer = document.getElementById('ao-visitor-orders-container');

    const resetBtn = (btn) => {
        if (!btn) return;
        btn.classList.remove('bg-devo-orange', 'text-white', 'shadow-md');
        btn.classList.add('bg-devo-dark', 'text-devo-muted', 'hover:text-white', 'border', 'border-devo-gray', 'hover:bg-devo-gray/40');
    };

    const activateBtn = (btn) => {
        if (!btn) return;
        btn.classList.remove('bg-devo-dark', 'text-devo-muted', 'hover:text-white', 'border', 'border-devo-gray', 'hover:bg-devo-gray/40');
        btn.classList.add('bg-devo-orange', 'text-white', 'shadow-md');
    };

    resetBtn(activeBtn);
    resetBtn(archivedBtn);
    resetBtn(visitorBtn);

    if (tab === 'active') {
        activateBtn(activeBtn);
        activeArchivedContainer?.classList.remove('hidden');
        visitorContainer?.classList.add('hidden');
        applyAdminOrdersFilter();
    } else if (tab === 'archived') {
        activateBtn(archivedBtn);
        activeArchivedContainer?.classList.remove('hidden');
        visitorContainer?.classList.add('hidden');
        applyAdminOrdersFilter();
    } else if (tab === 'visitor') {
        activateBtn(visitorBtn);
        activeArchivedContainer?.classList.add('hidden');
        visitorContainer?.classList.remove('hidden');
        renderVisitorOrders();
    }
};

window.toggleOrderArchive = async (orderId, archive) => {
    try {
        const order = allAdminOrders.find(x => x.id === orderId);
        if (!order) return;

        // التحديث اللحظي المتفائل
        order.is_archived = archive;
        applyAdminOrdersFilter();

        const { error } = await supabase
            .from('orders')
            .update({ is_archived: archive })
            .eq('id', orderId);

        if (error) {
            // التراجع عند الفشل
            order.is_archived = !archive;
            applyAdminOrdersFilter();
            throw error;
        }

        showToast(archive ? 'تم نقل الأوردر إلى الأرشيف بنجاح' : 'تمت استعادة الأوردر من الأرشيف بنجاح', 'success');
    } catch (err) {
        console.error('Error toggling order archive:', err);
        showToast('حدث خطأ أثناء تحديث حالة الأرشيف', 'error');
    }
};

function updateAdminStats(customList = null) {
    // تحديث عدادات التبويبات العلوية دائماً من إجمالي الأوردرات
    const activeCount = allAdminOrders.filter(o => !o.is_archived).length;
    const archivedCount = allAdminOrders.filter(o => o.is_archived === true).length;

    const activeBadge = document.getElementById('ao-count-active');
    if (activeBadge) activeBadge.textContent = activeCount;

    const archivedBadge = document.getElementById('ao-count-archived');
    if (archivedBadge) archivedBadge.textContent = archivedCount;

    // القائمة التي يتم حساب إحصائيات الكروت الثلاثة منها:
    // إذا كان هناك بحث/فلتر (customList ممررة): تعكس نتائج البحث بدقة
    // وإذا لم يكن هناك بحث: تعكس إجمالي جميع الأوردرات (المؤرشفة والغير مؤرشفة) كما طلب المستخدم
    const targetOrders = customList !== null 
        ? customList 
        : allAdminOrders;

    let totalRev = 0, totalSeries = 0;
    targetOrders.forEach(o => {
        totalRev += o.total_price || 0;
        totalSeries += o.total_series || 0;
    });

    const statTotal = document.getElementById('ao-stat-total');
    if (statTotal) statTotal.textContent = targetOrders.length.toLocaleString('ar-EG');

    const statSeries = document.getElementById('ao-stat-series');
    if (statSeries) statSeries.textContent = totalSeries.toLocaleString('ar-EG');

    const statRev = document.getElementById('ao-stat-rev');
    if (statRev) statRev.textContent = totalRev.toLocaleString('ar-EG');
}

window.applyAdminOrdersFilter = () => {
    const numTerm = document.getElementById('ao-search-num')?.value.trim().toLowerCase() || '';
    const custTerm = document.getElementById('ao-search-customer')?.value.trim().toLowerCase() || '';
    const phoneTerm = document.getElementById('ao-search-phone')?.value.trim() || '';
    const legacyTerm = document.getElementById('ao-search')?.value.trim().toLowerCase() || '';
    const workerFilter = document.getElementById('ao-worker-filter')?.value || '';
    const statusFilter = document.getElementById('ao-status')?.value || '';
    const dateFrom = document.getElementById('ao-date-from')?.value;
    const dateTo = document.getElementById('ao-date-to')?.value;

    const hasSearchQuery = Boolean(numTerm || custTerm || phoneTerm || legacyTerm);
    const hasAnyFilter = Boolean(hasSearchQuery || workerFilter || statusFilter || dateFrom || dateTo);

    const filtered = allAdminOrders.filter(o => {
        const isArchived = o.is_archived === true;

        // إذا لم يكن هناك بحث مخصص، يتم التقيد بالتبويب المختار (النشطة أو الأرشيف)
        // أما إذا كان هناك بحث مخصص، يتم البحث داخل الأوردرات النشطة والمؤرشفة معاً في نفس الوقت
        if (!hasSearchQuery) {
            if (currentAdminOrdersTab === 'active' && isArchived) return false;
            if (currentAdminOrdersTab === 'archived' && !isArchived) return false;
        }

        // 1. بحث برقم الأوردر أو كود الموديل أو كود اللون
        if (numTerm) {
            const matchInvoice = (o.invoice_number || '').toString().toLowerCase().includes(numTerm);
            const matchModelCode = o.order_items && o.order_items.some(item => {
                const fCode = (item.models?.factory_code || '').toLowerCase();
                const sCode = (item.models?.system_code || '').toLowerCase();
                const colorInv = item.models?.model_inventory?.find(inv => inv.color_id === item.color_id);
                const colorSysCode = (colorInv?.color_system_code || '').toLowerCase();
                const colorFacCode = (colorInv?.color_factory_code || '').toLowerCase();
                return fCode.includes(numTerm) || sCode.includes(numTerm) || colorSysCode.includes(numTerm) || colorFacCode.includes(numTerm);
            });
            if (!matchInvoice && !matchModelCode) return false;
        }

        // 2. بحث باسم العميل أو المحل
        if (custTerm) {
            const matchCustomer = (o.customer_name || '').toLowerCase().includes(custTerm);
            if (!matchCustomer) return false;
        }

        // 3. بحث برقم هاتف العميل
        if (phoneTerm) {
            const matchPhone1 = (o.phone_1 || '').includes(phoneTerm);
            const matchPhone2 = (o.phone_2 || '').includes(phoneTerm);
            if (!matchPhone1 && !matchPhone2) return false;
        }

        // بحث شامل احتياطي
        if (legacyTerm) {
            const matchesMain = (o.invoice_number || '').toString().toLowerCase().includes(legacyTerm) 
                             || (o.customer_name || '').toLowerCase().includes(legacyTerm) 
                             || (o.phone_1 || '').includes(legacyTerm)
                             || (o.system_users?.full_name || '').toLowerCase().includes(legacyTerm);
            if (!matchesMain) return false;
        }

        // 4. فلتر الموظف / البائع
        if (workerFilter && (o.system_users?.full_name !== workerFilter)) {
            return false;
        }

        // 5. فلتر الحالة
        if (statusFilter && o.status !== statusFilter) return false;

        // 6. فلتر التاريخ
        if (dateFrom || dateTo) {
            const oDate = new Date(o.created_at);
            oDate.setHours(0, 0, 0, 0);
            if (dateFrom && oDate < new Date(dateFrom)) return false;
            if (dateTo && oDate > new Date(dateTo)) return false;
        }

        return true;
    });

    // تحديث الإحصائيات لتعكس نتائج البحث كما طلب المستخدم تماماً
    updateAdminStats(hasAnyFilter ? filtered : null);

    const tbody = document.getElementById('ao-table-body');
    if (!tbody) return;

    if (filtered.length === 0) {
        const emptyMsg = hasAnyFilter
            ? 'لا توجد أوردرات مطابقة لنتائج البحث والتصفية.'
            : (currentAdminOrdersTab === 'archived' ? 'لا توجد أوردرات في الأرشيف حالياً.' : 'لا توجد أوردرات نشطة حالياً.');
        tbody.innerHTML = `<tr class="no-data-row"><td colspan="9" class="p-10 text-center text-devo-muted">${emptyMsg}</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(o => generateOrderRowHTML(o)).join('');
};

// ==========================================
// 🌟 5. إجراءات الإدارة (تحديث، قفل، تفاصيل، طباعة) 🌟
// ==========================================

window.updateOrderStatus = async (id, newStatus) => {
    const o = allAdminOrders.find(x => x.id === id);
    if (!o) return;

    let lockState = o.is_locked;
    let assignedAdmin = o.assigned_admin_name;

    if (newStatus !== 'created') {
        lockState = true;
        assignedAdmin = currentUserProfile.full_name;
    } else {
        lockState = false;
        assignedAdmin = null;
    }

    // التحديث اللحظي الصامت (Optimistic Update)
    o.status = newStatus;
    o.is_locked = lockState;
    o.assigned_admin_name = assignedAdmin;
    const row = document.getElementById(`admin-order-row-${id}`);
    if (row) row.outerHTML = generateOrderRowHTML(o);

    const { error } = await supabase.from('orders').update({ 
        status: newStatus, 
        is_locked: lockState, 
        assigned_admin_name: assignedAdmin 
    }).eq('id', id);

    if (error) {
        showToast(error.message || 'حدث خطأ أثناء تحديث الحالة', 'error');
        await fetchAdminOrders(); // لإعادة الحالة إلى ما كانت عليه بالـ DB
    } else {
        showToast('تم تحديث وتخصيص الأوردر بنجاح', 'success');
        const statusText = statusConfig[newStatus]?.text || newStatus;
        await logOrderAction(id, 'status_changed', `تم تغيير حالة الأوردر إلى (${statusText}) بواسطة الإداري ${currentUserProfile?.full_name || ''}`);
    }
};

window.toggleOrderLock = async (id, lockState) => {
    const o = allAdminOrders.find(x => x.id === id);
    if(!o) return;

    if (currentUserProfile?.role !== 'owner' && o.assigned_admin_name && o.assigned_admin_name !== currentUserProfile?.full_name) {
        return showToast('لا تملك صلاحية فتح قفل هذا الأوردر، تواصل مع المالك.', 'error');
    }

    // التحديث اللحظي الصامت
    o.is_locked = lockState;
    o.assigned_admin_name = lockState ? currentUserProfile?.full_name : null;
    const row = document.getElementById(`admin-order-row-${id}`);
    if (row) row.outerHTML = generateOrderRowHTML(o);

    const { error } = await supabase.from('orders').update({ 
        is_locked: lockState,
        assigned_admin_name: o.assigned_admin_name
    }).eq('id', id);

    if (!error) {
        showToast(lockState ? 'تم قفل الأوردر واستلامه' : 'تم فتح الأوردر للجميع', 'success');
        await logOrderAction(id, lockState ? 'locked' : 'unlocked', lockState ? `تم قفل واستلام الأوردر بواسطة الإداري ${currentUserProfile?.full_name || ''}` : `تم إلغاء قفل الأوردر وإتاحته للجميع بواسطة الإداري ${currentUserProfile?.full_name || ''}`);
    }
};


// 🌟 دوال مساعدة لشاشتي التفاصيل والتعديل 🌟
function resolveImageUrl(url) {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") {
        return window.tenantDefaultModelImage || localStorage.getItem(`devo_default_model_img_${getCurrentTenantId() || 'default'}`) || './src/assets/icons/devo.png';
    }
    try {
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
            if (idMatch && idMatch[1]) return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`;
        }
    } catch (e) {}
    return url; 
}

function getModelThumbnail(model) {
    const rawUrl = model?.image_url_1 || model?.model_images?.[0]?.image_url;
    return resolveImageUrl(rawUrl);
}

function formatArabicDateTime(dateStr) {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    const year = d.getFullYear();
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    return `${day} ${month} ${year} ${hours}:${minutes} ${ampm}`;
}

function formatArabicTime(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
    const day = d.getDate();
    const month = months[d.getMonth()];
    let hours = d.getHours();
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';
    hours = hours % 12 || 12;
    return `${day} ${month}، ${hours}:${minutes} ${ampm}`;
}

function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

window.copyAdminOrderDetails = async (id) => {
    const freshOrder = await fetchFullOrderById(id);
    const o = freshOrder || allAdminOrders.find(x => x.id === id);
    if (!o) return;

    const brandName = document.getElementById('admin-footer-factory-name')?.textContent?.trim() || 'DEVO';
    let text = `📦 *تفاصيل أوردر #${o.invoice_number || o.id.slice(0, 8)}* (${brandName})\n`;
    text += `👤 *العميل:* ${o.customer_name || '-'}\n`;
    text += `📞 *الهاتف الأساسي:* ${o.phone_1 || '-'}${o.phone_2 ? ` / ${o.phone_2}` : ''}\n`;
    text += `📍 *العنوان:* ${o.address || '-'}\n`;
    text += `📅 *تاريخ الإنشاء:* ${formatArabicDateTime(o.created_at)}\n`;
    if (o.notes) text += `📝 *ملاحظات:* ${o.notes}\n`;
    text += `\n*الأصناف والموديلات:*\n`;

    const grouped = {};
    (o.order_items || []).forEach(item => {
        const mId = item.model_id;
        if (!grouped[mId]) {
            grouped[mId] = {
                name: item.models?.name || 'موديل',
                code: item.models?.factory_code || item.models?.system_code || '',
                colors: []
            };
        }
        grouped[mId].colors.push(`${item.colors?.name || '-'}: ${item.quantity} سيريه`);
    });

    Object.values(grouped).forEach((g, idx) => {
        text += `${idx + 1}. *${g.name}* ${g.code ? `(${g.code})` : ''}\n`;
        text += `   - ${g.colors.join(' | ')}\n`;
    });

    const remaining = (o.total_price || 0) - (o.deposit || 0);
    text += `\n💰 *إجمالي الفاتورة:* ${(o.total_price || 0).toLocaleString()} ج.م\n`;
    text += `💵 *المدفوع (العربون):* ${(o.deposit || 0).toLocaleString()} ج.م\n`;
    text += `⏳ *المتبقي للتحصيل:* ${(remaining || 0).toLocaleString()} ج.م\n`;

    try {
        await navigator.clipboard.writeText(text);
        showToast('تم نسخ تفاصيل الأوردر للحافظة بنجاح', 'success');
    } catch (e) {
        console.error('Clipboard copy failed:', e);
        showToast('تعذر نسخ الأوردر، يرجى المحاولة يدوياً', 'warning');
    }
};

window.filterViewOrderItems = (term) => {
    term = (term || '').toLowerCase().trim();
    const cards = document.querySelectorAll('.view-model-card');
    cards.forEach(card => {
        const modelText = (card.getAttribute('data-model-search') || '').toLowerCase();
        const rows = card.querySelectorAll('.view-color-row');
        let cardHasMatch = false;

        rows.forEach(row => {
            const rowText = (row.getAttribute('data-color-search') || '').toLowerCase();
            const matches = !term || modelText.includes(term) || rowText.includes(term);
            row.style.display = matches ? '' : 'none';
            if (matches) cardHasMatch = true;
        });

        card.style.display = cardHasMatch ? '' : 'none';
    });
};
window.filterModalTable = window.filterViewOrderItems;

window.viewAdminOrderDetails = async (id) => {
    const freshOrder = await fetchFullOrderById(id);
    const o = freshOrder || allAdminOrders.find(x => x.id === id);
    if (!o) return;

    currentEditingOrderId = id;
    isLocalEditMode = false;

    const remaining = (o.total_price || 0) - (o.deposit || 0);
    const invoiceNum = o.invoice_number || o.id.slice(0, 8);
    const statusConf = statusConfig[o.status] || { text: 'غير معروف', color: 'bg-devo-gray text-white border-devo-gray' };

    // تجميع الأصناف حسب الموديل
    const modelGroups = [];
    const modelMap = new Map();

    (o.order_items || []).forEach(item => {
        const modelId = item.model_id;
        if (!modelMap.has(modelId)) {
            const classSizes = item.models?.classes?.class_sizes || [];
            const sizesCount = classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1);
            const seriesPrice = item.price_per_series || 0;
            const piecePrice = sizesCount > 0 ? (seriesPrice / sizesCount) : seriesPrice;

            const group = {
                modelId: modelId,
                modelName: item.models?.name || 'موديل',
                code: item.models?.factory_code || item.models?.system_code || '',
                imageUrl: getModelThumbnail(item.models),
                sizesCount: sizesCount,
                seriesPrice: seriesPrice,
                piecePrice: piecePrice,
                items: []
            };
            modelMap.set(modelId, group);
            modelGroups.push(group);
        }

        const group = modelMap.get(modelId);
        const pieces = item.quantity * group.sizesCount;
        const itemTotal = item.quantity * item.price_per_series;
        const colorInv = item.models?.model_inventory?.find(inv => inv.color_id === item.color_id);

        group.items.push({
            ...item,
            colorName: item.colors?.name || '-',
            colorCode: item.colors?.color_code,
            colorSystemCode: colorInv?.color_system_code || '',
            colorFactoryCode: colorInv?.color_factory_code || '',
            pieces,
            itemTotal
        });
    });

    let totalSeries = 0;
    let totalPieces = 0;
    modelGroups.forEach(g => {
        g.items.forEach(i => {
            totalSeries += i.quantity;
            totalPieces += i.pieces;
        });
    });

    // إنشاء كروت الموديلات المجمعة
    let modelsHtml = '';
    if (modelGroups.length === 0) {
        modelsHtml = `
            <div class="p-8 text-center bg-devo-black/60 border border-devo-gray rounded-2xl">
                <i class="ph ph-package text-3xl text-devo-muted mb-2 block"></i>
                <p class="text-devo-muted text-sm font-bold">لا توجد أصناف مسجلة في هذا الأوردر.</p>
            </div>
        `;
    } else {
        modelsHtml = modelGroups.map(group => {
            const allColorsText = group.items.map(i => i.colorName).join(' ');
            return `
                <div class="bg-devo-black/50 border border-devo-gray/70 hover:border-devo-orange/40 rounded-2xl p-4 transition-all shadow-sm view-model-card" data-model-search="${group.modelName} ${group.code} ${allColorsText}">
                    <!-- هيدر الموديل -->
                    <div class="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-devo-gray/60">
                        <div class="flex items-center gap-3">
                            <img src="${group.imageUrl}" alt="${escapeHtml(group.modelName)}" class="w-14 h-14 rounded-xl object-cover border border-devo-gray bg-devo-black shrink-0 shadow-sm" onerror="this.src='./src/assets/icons/devo.png'">
                            <div>
                                <div class="flex flex-wrap items-center gap-2">
                                    <h4 class="text-white font-black text-sm sm:text-base">${escapeHtml(group.modelName)}</h4>
                                    ${group.code ? `<span class="bg-devo-gray/70 border border-devo-gray text-devo-text px-2 py-0.5 rounded-lg text-xs font-mono font-bold">${group.code}</span>` : ''}
                                    <span class="bg-devo-gray/70 border border-devo-gray text-devo-muted px-2 py-0.5 rounded-lg text-xs font-medium">${group.sizesCount} قطع</span>
                                    <span class="bg-sky-500/15 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-lg text-xs font-bold font-mono">ق: ${(group.piecePrice || 0).toLocaleString()} ج</span>
                                    <span class="bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono">سيريه: ${(group.seriesPrice || 0).toLocaleString()} ج</span>
                                </div>
                                <div class="text-xs text-devo-muted flex items-center gap-1.5 mt-1.5 font-medium">
                                    <i class="ph ph-palette text-devo-orange"></i>
                                    <span>الألوان المسجلة لهذا الموديل (${group.items.length}):</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- صفوف ألوان الموديل -->
                    <div class="space-y-2">
                        ${group.items.map(item => `
                            <div class="flex items-center justify-between p-3 bg-devo-dark/60 border border-devo-gray/50 hover:border-devo-gray rounded-xl transition-colors view-color-row" data-color-search="${group.modelName} ${group.code} ${item.colorName} ${item.colorSystemCode || ''} ${item.colorFactoryCode || ''}">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20 shadow-sm" style="background-color: ${item.colorCode || '#38BDF8'}"></span>
                                    <span class="text-white text-xs sm:text-sm font-bold">${escapeHtml(item.colorName)}</span>
                                    ${item.colorSystemCode ? `<span class="text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded">كود: ${item.colorSystemCode}</span>` : ''}
                                    ${item.colorFactoryCode ? `<span class="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">مصنع: ${item.colorFactoryCode}</span>` : ''}
                                </div>
                                <div class="flex items-center gap-3 sm:gap-5">
                                    <span class="bg-devo-black/80 border border-devo-gray/60 px-3 py-1.5 rounded-xl text-devo-text text-xs font-bold shadow-inner">
                                        ${item.quantity} سيريه <span class="text-[11px] text-devo-muted font-normal">(${item.pieces} قطعة)</span>
                                    </span>
                                    <div class="text-left min-w-[90px] sm:min-w-[110px]">
                                        <span class="text-devo-orange font-black font-mono text-sm block">${(item.itemTotal || 0).toLocaleString()} ج.م</span>
                                        <span class="text-[10px] text-devo-muted font-mono block">سعر السيريه: ${(item.price_per_series || 0).toLocaleString()} ج</span>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- فوتر إجمالي الموديل -->
                    <div class="flex items-center justify-between pt-2.5 mt-2.5 border-t border-devo-gray/50 text-xs">
                        <span class="text-devo-muted font-bold">إجمالي الموديل: <span class="text-white font-bold">${group.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} سيريه</span> (${group.items.reduce((s, i) => s + (Number(i.pieces) || 0), 0)} قطعة)</span>
                        <span class="text-devo-orange font-black font-mono text-sm sm:text-base">${group.items.reduce((s, i) => s + (Number(i.itemTotal) || 0), 0).toLocaleString()} ج.م</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // جلب سجل الحركات والتعديلات للأوردر
    let logsHtml = '';
    try {
        const { data: logs, error: logsError } = await supabase
            .from('order_logs')
            .select('*')
            .eq('order_id', id)
            .order('created_at', { ascending: false });

        if (!logsError && logs && logs.length > 0) {
            logsHtml = `
                <div class="mt-2 border border-devo-gray rounded-2xl p-4 bg-devo-black/50 shadow-sm">
                    <h5 class="text-xs text-devo-orange font-bold mb-3 flex items-center gap-1.5">
                        <i class="ph ph-clock-counter-clockwise text-base"></i>
                        <span>سجل حركات وتعديلات الأوردر</span>
                    </h5>
                    <div class="space-y-2.5 max-h-[190px] overflow-y-auto custom-scrollbar text-xs">
                        ${logs.map(log => `
                            <div class="flex gap-2.5 items-start">
                                <div class="w-2 h-2 rounded-full bg-devo-orange mt-1.5 shrink-0 shadow-sm shadow-devo-orange/50"></div>
                                <div class="flex-1 text-devo-text leading-relaxed font-medium">
                                    <span class="text-white">${escapeHtml(log.notes)}</span>
                                    <span class="text-[11px] text-devo-muted mr-1.5 font-mono">(${formatArabicTime(log.created_at)})</span>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            `;
        } else {
            logsHtml = `
                <div class="mt-2 border border-devo-gray/50 rounded-2xl p-3.5 bg-devo-black/30 text-xs text-devo-muted flex items-center gap-1.5">
                    <i class="ph ph-info text-devo-orange text-sm"></i>
                    <span>لا توجد حركات مسجلة لهذا الأوردر بعد.</span>
                </div>
            `;
        }
    } catch (e) {
        console.error('Error fetching logs:', e);
    }

    document.getElementById('ao-details-content').innerHTML = `
        <div class="flex flex-col gap-4">
            <!-- الهيدر العلوي للأوردر -->
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-devo-gray/80">
                <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-devo-orange/15 border border-devo-orange/30 flex items-center justify-center text-devo-orange text-lg shadow-sm">
                        <i class="ph ph-receipt font-bold"></i>
                    </div>
                    <h3 class="text-base sm:text-lg font-black text-white">تفاصيل الأوردر #${invoiceNum}</h3>
                </div>
                <div class="flex flex-wrap items-center gap-2">
                    <button onclick="closeAdminOrderDetails()" class="text-devo-muted hover:text-white p-2 rounded-xl border border-devo-gray hover:bg-white/5 transition-colors cursor-pointer" title="إغلاق">
                        <i class="ph ph-x text-lg"></i>
                    </button>
                    <button onclick="window.printAdminOrder('${o.id}', 'detailed')" class="px-3.5 py-1.5 bg-devo-orange/15 hover:bg-devo-orange text-devo-orange hover:text-white border border-devo-orange/40 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm">
                        <i class="ph ph-printer text-sm"></i> فاتورة الإدارة
                    </button>
                    <button onclick="window.printAdminOrder('${o.id}', 'customer')" class="px-3.5 py-1.5 bg-devo-gray/50 hover:bg-white/15 text-white border border-devo-gray text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm">
                        <i class="ph ph-receipt text-sm"></i> فاتورة العميل
                    </button>
                    <button onclick="window.copyAdminOrderDetails('${o.id}')" class="px-3.5 py-1.5 bg-teal-500/15 hover:bg-teal-500 text-teal-400 hover:text-white border border-teal-500/40 text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer shadow-sm">
                        <i class="ph ph-copy text-sm"></i> نسخ الأوردر
                    </button>
                </div>
            </div>

            <!-- الكروت الثلاثة العلوية -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <!-- 1. بيانات العميل -->
                <div class="bg-devo-black/60 border border-devo-gray rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div>
                        <div class="flex items-center gap-1.5 text-devo-orange text-xs font-bold mb-2.5">
                            <i class="ph ph-user-circle text-base"></i>
                            <span>بيانات العميل</span>
                        </div>
                        <h4 class="text-white font-black text-base mb-2 truncate">${escapeHtml(o.customer_name || 'عميل غير مسجل')}</h4>
                        <div class="text-xs text-devo-info font-mono mb-1.5 flex items-center gap-1">
                            <span class="text-devo-muted font-sans text-[11px]">الهاتف الأساسي:</span>
                            <a href="tel:${o.phone_1}" class="hover:underline font-bold" dir="ltr">${o.phone_1 || '-'}</a>
                            ${o.phone_2 ? `<span class="text-devo-muted">/</span><a href="tel:${o.phone_2}" class="hover:underline font-bold" dir="ltr">${o.phone_2}</a>` : ''}
                        </div>
                        <div class="text-xs text-devo-muted flex items-center gap-1 truncate">
                            <span class="text-[11px] shrink-0">العنوان:</span>
                            <span class="text-devo-text font-medium truncate">${escapeHtml(o.address || '-')}</span>
                        </div>
                    </div>
                </div>

                <!-- 2. معلومات الأوردر -->
                <div class="bg-devo-black/60 border border-devo-gray rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <div class="flex items-center gap-1.5 text-devo-orange text-xs font-bold">
                                <i class="ph ph-receipt text-base"></i>
                                <span>معلومات الأوردر</span>
                            </div>
                            <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${statusConf.color}">
                                ${statusConf.text}
                            </span>
                        </div>
                        <div class="space-y-1 text-xs">
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">رقم الفاتورة:</span>
                                <span class="text-devo-orange font-bold font-mono text-sm">#${invoiceNum}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">البائع (المعرض):</span>
                                <span class="text-devo-text font-medium">${escapeHtml(o.system_users?.full_name || 'غير محدد')}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">مستلم العربون:</span>
                                <span class="text-devo-text font-medium">${escapeHtml(o.deposit_receiver || 'غير محدد')}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">تاريخ الإنشاء:</span>
                                <span class="text-devo-text font-medium">${formatArabicDateTime(o.created_at)}</span>
                            </div>
                            <div class="flex justify-between items-start pt-1 border-t border-devo-gray/50">
                                <span class="text-devo-muted text-[11px] shrink-0">ملاحظات الأوردر:</span>
                                <span class="text-devo-text text-[11px] font-medium text-left pr-2 truncate max-w-[200px]" title="${escapeHtml(o.notes || '')}">${escapeHtml(o.notes || 'لا توجد ملاحظات')}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. الملخص المالي -->
                <div class="bg-devo-black/60 border border-devo-gray rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div>
                        <div class="flex items-center gap-1.5 text-devo-orange text-xs font-bold mb-2">
                            <i class="ph ph-calculator text-base"></i>
                            <span>الملخص المالي</span>
                        </div>
                        <div class="space-y-1.5 text-xs">
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">الكمية الإجمالية:</span>
                                <span class="text-devo-text font-bold">${totalSeries} سيريه <span class="text-[11px] text-devo-muted font-normal">(${totalPieces} قطعة)</span></span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">إجمالي الفاتورة:</span>
                                <span class="text-devo-text font-bold font-mono text-sm">${(o.total_price || 0).toLocaleString()} ج.م</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">المدفوع (العربون):</span>
                                <span class="text-devo-success font-bold font-mono">${(o.deposit || 0).toLocaleString()} ج.م</span>
                            </div>
                            <div class="flex justify-between items-center bg-devo-orange/10 border border-devo-orange/30 px-3 py-2 rounded-xl mt-1.5">
                                <span class="text-devo-orange font-bold text-xs">المتبقي للتحصيل:</span>
                                <span class="text-devo-orange font-black text-sm font-mono">${(remaining || 0).toLocaleString()} ج.م</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- حقل البحث السريع في الأصناف -->
            <div class="relative">
                <i class="ph ph-magnifying-glass absolute right-3.5 top-1/2 -translate-y-1/2 text-devo-muted text-base"></i>
                <input type="text" oninput="filterViewOrderItems(this.value)" placeholder="بحث سريع داخل الأصناف باسم الموديل أو الكود أو اللون..." 
                    class="w-full bg-devo-black/70 border border-devo-gray rounded-xl pr-10 pl-4 py-2.5 text-devo-text placeholder-devo-muted text-xs sm:text-sm focus:outline-none focus:border-devo-orange transition-all shadow-inner">
            </div>

            <!-- كروت الموديلات المجمعة -->
            <div class="space-y-4">
                ${modelsHtml}
            </div>

            <!-- سجل حركات وتعديلات الأوردر -->
            ${logsHtml}
        </div>
    `;

    const modal = document.getElementById('ao-details-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
};

window.closeAdminOrderDetails = async () => {
    const modal = document.getElementById('ao-details-modal');
    if (modal) modal.classList.add('opacity-0');
    
    if (isLocalEditMode && currentEditingOrderId) {
        const orderId = currentEditingOrderId;
        try {
            const { error } = await supabase.from('orders').update({
                is_locked: false,
                assigned_admin_name: null,
                status: 'created'
            }).eq('id', orderId);
            
            if (!error) {
                const o = allAdminOrders.find(x => x.id === orderId);
                if (o) {
                    o.is_locked = false;
                    o.assigned_admin_name = null;
                    o.status = 'created';
                    const row = document.getElementById(`admin-order-row-${orderId}`);
                    if (row) row.outerHTML = generateOrderRowHTML(o);
                }
            }
            await logOrderAction(orderId, 'local_edit_cancel', `ألغى الإداري ${currentUserProfile?.full_name || ''} تعديل الأوردر محلياً (إغلاق التفاصيل)`);
        } catch (e) {
            console.error('Error unlocking order on modal close:', e);
        }
    }

    setTimeout(() => {
        if (modal) modal.classList.add('hidden');
        currentEditingOrderId = null;
        isLocalEditMode = false;
        localEditingItems = [];
        localEditingInventory = {};
    }, 300);
};

function printHtmlInIframe(htmlContent) {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '-9999px';
    iframe.style.bottom = '-9999px';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow.document;
    doc.open();
    doc.write(htmlContent);
    doc.close();

    iframe.onload = function() {
        iframe.contentWindow.focus();
        iframe.contentWindow.print();
        setTimeout(() => { document.body.removeChild(iframe); }, 1000);
    };
}

window.printAdminOrder = async (id, type) => {
    const freshOrder = await fetchFullOrderById(id);
    const o = freshOrder || allAdminOrders.find(x => x.id === id);
    if(!o) return;
    
    showToast('جاري تحضير الفاتورة للطباعة...', 'info');
    if (type === 'detailed') {
        await printOrderAdminInvoice(o);
    } else {
        await printOrderCustomerInvoice(o);
    }
};

window.deleteOrder = async (id) => {
    const confirmed = await confirmDialog({ 
        title: 'حذف الأوردر', 
        message: 'هل أنت متأكد من الحذف؟ سيتم إرجاع جميع الكميات إلى المخزن.', 
        isDestructive: true 
    });
    
    if (confirmed) {
        showToast('جاري الحذف وإرجاع المخزون...', 'info');
        const { error } = await supabase.rpc('delete_order_safely', { p_order_id: id });
        if (error) {
            console.error('Error deleting order:', error);
            showToast('حدث خطأ أثناء الحذف: ' + (error.message || ''), 'error');
        } else {
            showToast('تم الحذف بنجاح', 'success');
            // إزالة الأوردر المحذوف من مصفوفة الذاكرة وإعادة رسم الجدول والإحصائيات فوراً
            allAdminOrders = allAdminOrders.filter(o => o.id !== id);
            if (typeof updateAdminStats === 'function') updateAdminStats();
            if (typeof applyAdminOrdersFilter === 'function') applyAdminOrdersFilter();
            if (typeof fetchAdminOrders === 'function') fetchAdminOrders();
        }
    }
};

function formatOrderExportNotes(o) {
    const depositVal = parseFloat(o.deposit);
    const hasDeposit = !isNaN(depositVal) && depositVal > 0;
    const depositText = hasDeposit ? `العربون ${o.deposit}` : '';
    const mainNotes = o.notes ? String(o.notes).trim() : '';

    if (depositText && mainNotes) {
        return `${depositText} - ${mainNotes}`;
    } else if (depositText) {
        return depositText;
    } else {
        return mainNotes;
    }
}

window.exportOrdersToExcel = async () => {
    if (allAdminOrders.length === 0) return showToast('لا توجد بيانات للتصدير', 'warning');
    showToast('جاري تجهيز ملف الإكسيل...', 'info');

    try {
        const profiles = await getExcelProfiles();
        const activeProfile = getActiveExcelProfile(profiles);
        const { rows, colWidths, direction, sheetName } = buildOrdersExportRows(allAdminOrders, activeProfile, formatOrderExportNotes);

        const worksheet = XLSX.utils.json_to_sheet(rows);
        if (!worksheet['!views']) worksheet['!views'] = [];
        worksheet['!views'].push({ rightToLeft: direction !== 'ltr' });
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "الأوردرات");
        const filePrefix = activeProfile.orders_export?.file_prefix || 'Orders';
        XLSX.writeFile(workbook, `${filePrefix}_${new Date().toISOString().split('T')[0]}.xlsx`);
        showToast('تم تحميل الملف بنجاح', 'success');
    } catch (err) {
        console.error('Error exporting orders to Excel:', err);
        showToast('خطأ أثناء تصدير ملف الإكسيل', 'error');
    }
};

window.exportSingleOrderToExcel = async (id) => {
    const freshOrder = await fetchFullOrderById(id);
    const o = freshOrder || allAdminOrders.find(x => x.id === id);
    if (!o) return;

    showToast('جاري تجهيز ملف الإكسيل...', 'info');

    try {
        const cleanCustomerName = (o.customer_name || 'Customer').replace(/[^a-zA-Z0-9\u0600-\u06FF\s]/g, '').replace(/\s+/g, '_').trim();
        const dateStr = new Date(o.created_at).toISOString().split('T')[0];
        const fileName = `${cleanCustomerName}_ORD${o.invoice_number}_${dateStr}.xlsx`;

        const profiles = await getExcelProfiles();
        const activeProfile = getActiveExcelProfile(profiles);
        const { rows, colWidths, direction, sheetName } = buildOrdersExportRows([o], activeProfile, formatOrderExportNotes);

        const worksheet = XLSX.utils.json_to_sheet(rows);
        if (!worksheet['!views']) worksheet['!views'] = [];
        worksheet['!views'].push({ rightToLeft: direction !== 'ltr' });
        worksheet['!cols'] = colWidths;

        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, sheetName || "Order_Items");
        XLSX.writeFile(workbook, fileName);

        showToast('تم تحميل ملف الأوردر بنجاح', 'success');
    } catch (err) {
        console.error('Error exporting single order to Excel:', err);
        showToast('خطأ أثناء تصدير ملف الأوردر', 'error');
    }
};

// --- Custom Sort Handler ---
window.customSortHandlers = window.customSortHandlers || {};
window.customSortHandlers['admin-orders-table'] = (colIndex, direction) => {
    allAdminOrders.sort((a, b) => {
        let valA, valB;
        switch (colIndex) {
            case 0: // رقم الأوردر
                valA = a.invoice_number || '';
                valB = b.invoice_number || '';
                break;
            case 1: // التاريخ
                valA = new Date(a.created_at);
                valB = new Date(b.created_at);
                break;
            case 2: // العميل / المحل
                valA = a.customer_name || '';
                valB = b.customer_name || '';
                break;
            case 3: // البائع
                valA = a.system_users?.full_name || '';
                valB = b.system_users?.full_name || '';
                break;
            case 4: // الكمية
                valA = a.total_series || 0;
                valB = b.total_series || 0;
                break;
            case 5: // الإجمالي
                valA = a.total_price || 0;
                valB = b.total_price || 0;
                break;
            case 6: // مسند إلى
                valA = a.assigned_admin_name || '';
                valB = b.assigned_admin_name || '';
                break;
            case 7: // الحالة
                valA = a.status || '';
                valB = b.status || '';
                break;
            default:
                return 0;
        }

        if (typeof valA === 'string') {
            return direction === 'asc' ? valA.localeCompare(valB, 'ar') : valB.localeCompare(valA, 'ar');
        } else {
            return direction === 'asc' ? valA - valB : valB - valA;
        }
    });

    window.applyAdminOrdersFilter();
};


// =========================================================================
// 🌟 6. خيارات وإجراءات تعديل الأوردرات (الخيارات الثلاثة) 🌟
// =========================================================================

window.openEditOrderChoices = async (orderId) => {
    currentEditingOrderId = orderId;
    const freshOrder = await fetchFullOrderById(orderId);
    const o = freshOrder || allAdminOrders.find(x => x.id === orderId);
    if (!o) return;

    // إعادة تعيين خطوات المودال
    document.getElementById('eoc-step-select').classList.remove('hidden');
    document.getElementById('eoc-step-assign').classList.add('hidden');
    
    // عرض رقم الفاتورة في العنوان
    document.getElementById('eoc-order-number').textContent = `(#${o.invoice_number})`;

    // إظهار المودال
    const modal = document.getElementById('edit-order-choices-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.closeEditOrderChoices = (keepOrderContext = false) => {
    const modal = document.getElementById('edit-order-choices-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => {
        modal.classList.add('hidden');
        if (!keepOrderContext) {
            currentEditingOrderId = null;
        }
    }, 300);
};

window.showSelectChoicesStep = () => {
    document.getElementById('eoc-step-select').classList.remove('hidden');
    document.getElementById('eoc-step-assign').classList.add('hidden');
};

window.showAssignWorkerStep = async () => {
    document.getElementById('eoc-step-select').classList.add('hidden');
    document.getElementById('eoc-step-assign').classList.remove('hidden');

    const select = document.getElementById('eoc-worker-select');
    select.innerHTML = '<option value="">-- اختر الموظف --</option>';

    try {
        const currentTenantId = getCurrentTenantId();
        let query = supabase
            .from('system_users')
            .select('id, full_name, role, worker_job, tenant_id')
            .eq('is_active', true);

        // 🔒 تصفية الموظفين التابعين للمصنع الحالي فقط وعدم إظهار موظفي المصانع الأخرى
        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data: users, error } = await query.order('full_name', { ascending: true });

        if (error) throw error;

        if (users) {
            users.forEach(u => {
                let jobLabel = u.role === 'owner' ? 'مالك' : (u.role === 'admin' ? 'مشرف' : '');
                if (u.role === 'worker') {
                    if (u.worker_job === 'showroom') jobLabel = 'مبيعات المعرض';
                    else if (u.worker_job === 'warehouse') jobLabel = 'أمين مخزن';
                    else jobLabel = 'مبيعات + مخزن';
                }
                const option = document.createElement('option');
                option.value = u.id;
                option.textContent = `${u.full_name} (${jobLabel})`;
                select.appendChild(option);
            });
        }
    } catch (e) {
        showToast('خطأ أثناء جلب الموظفين: ' + e.message, 'error');
    }
};

// --- الخيار الأول: التعديل المحلي ---
window.triggerLocalEdit = async () => {
    if (!currentEditingOrderId) return;
    const o = allAdminOrders.find(x => x.id === currentEditingOrderId);
    if (!o) return;

    if (o.is_locked && o.assigned_admin_name && o.assigned_admin_name !== currentUserProfile?.full_name && currentUserProfile?.role !== 'owner') {
        return showToast('هذا الأوردر مغلق بواسطة إداري آخر!', 'error');
    }

    // قفل الأوردر بقاعدة البيانات فوراً لمنع التعديل المتزامن وتغيير الحالة إلى جاري التعديل
    const adminName = currentUserProfile?.full_name || 'أدمن';
    const { error } = await supabase.rpc('acquire_order_lock', {
        p_order_id: o.id,
        p_assigned_admin_name: adminName
    });

    if (error) {
        return showToast('فشل قفل الأوردر للتعديل: ' + error.message, 'error');
    }

    o.is_locked = true;
    o.assigned_admin_name = currentUserProfile?.full_name;
    o.status = 'editing';
    const row = document.getElementById(`admin-order-row-${o.id}`);
    if (row) row.outerHTML = generateOrderRowHTML(o);

    await logOrderAction(o.id, 'local_edit_start', `بدأ الإداري ${currentUserProfile?.full_name || ''} تعديل الأوردر محلياً`);

    closeEditOrderChoices(true);
    
    isLocalEditMode = true;
    localEditingItems = o.order_items.map(item => ({
        ...item,
        isDeleted: false
    }));

    // جلب كميات المخزن المتاحة لكل موديل ولون معروضين وتخزينها محلياً لتفادي الطلبات المتكررة عند التعديل
    localEditingInventory = {};
    const modelIds = [...new Set(localEditingItems.map(item => item.model_id))];
    if (modelIds.length > 0) {
        try {
            const { data: invData, error: invError } = await supabase
                .from('model_inventory')
                .select('model_id, color_id, available_series')
                .in('model_id', modelIds);
            
            if (!invError && invData) {
                invData.forEach(inv => {
                    const key = `${inv.model_id}_${inv.color_id}`;
                    localEditingInventory[key] = inv.available_series;
                });
            }
        } catch (e) {
            console.error('Error fetching inventory for local edit cache:', e);
        }
    }

    renderLocalEditModal(o);
};

function captureCurrentLocalEditFormValues(o) {
    if (!o) return;
    const custName = document.getElementById('le-customer-name')?.value;
    const phone1 = document.getElementById('le-phone-1')?.value;
    const phone2 = document.getElementById('le-phone-2')?.value;
    const addr = document.getElementById('le-address')?.value;
    const dep = document.getElementById('le-deposit')?.value;
    const depRec = document.getElementById('le-deposit-receiver')?.value;
    const nts = document.getElementById('le-notes')?.value;

    if (custName !== undefined) o.customer_name = custName;
    if (phone1 !== undefined) o.phone_1 = phone1;
    if (phone2 !== undefined) o.phone_2 = phone2;
    if (addr !== undefined) o.address = addr;
    if (dep !== undefined) o.deposit = parseFloat(dep) || 0;
    if (depRec !== undefined) o.deposit_receiver = depRec;
    if (nts !== undefined) o.notes = nts;
}

window.updateLocalDepositSummary = () => {
    const depVal = parseFloat(document.getElementById('le-deposit')?.value) || 0;
    const total = calculateLocalTotalPrice();
    const remaining = total - depVal;

    const depEl = document.getElementById('le-summary-deposit');
    if (depEl) depEl.textContent = `${depVal.toLocaleString()} ج.م`;

    const remEl = document.getElementById('le-summary-remaining');
    if (remEl) remEl.textContent = `${remaining.toLocaleString()} ج.م`;

    const o = allAdminOrders.find(x => x.id === currentEditingOrderId);
    if (o) o.deposit = depVal;
};

window.toggleLocalOrderLogs = () => {
    const logsBody = document.getElementById('le-logs-body');
    const chevron = document.getElementById('le-logs-chevron');
    if (logsBody) {
        const isHidden = logsBody.classList.contains('hidden');
        if (isHidden) {
            logsBody.classList.remove('hidden');
            if (chevron) chevron.classList.add('rotate-180');
        } else {
            logsBody.classList.add('hidden');
            if (chevron) chevron.classList.remove('rotate-180');
        }
    }
};

window.filterLocalEditItems = (term) => {
    term = (term || '').toLowerCase().trim();
    const cards = document.querySelectorAll('.le-model-card');
    let visibleCount = 0;

    cards.forEach(card => {
        const modelText = (card.getAttribute('data-model-search') || '').toLowerCase();
        const rows = card.querySelectorAll('.le-color-row');
        let cardHasMatch = false;

        rows.forEach(row => {
            const rowText = (row.getAttribute('data-color-search') || '').toLowerCase();
            const matches = !term || modelText.includes(term) || rowText.includes(term);
            row.style.display = matches ? '' : 'none';
            if (matches) {
                cardHasMatch = true;
                visibleCount++;
            }
        });

        card.style.display = cardHasMatch ? '' : 'none';
    });

    const countEl = document.getElementById('le-active-items-count');
    if (countEl) countEl.textContent = visibleCount;
};

function calculateLocalTotalSeries() {
    return localEditingItems.reduce((sum, item) => item.isDeleted ? sum : sum + item.quantity, 0);
}

function calculateLocalTotalPrice() {
    return localEditingItems.reduce((sum, item) => item.isDeleted ? sum : sum + (item.quantity * item.price_per_series), 0);
}

function calculateLocalRemaining(o) {
    const total = calculateLocalTotalPrice();
    const deposit = o && o.deposit !== undefined ? o.deposit : (parseFloat(document.getElementById('le-deposit')?.value) || 0);
    return total - deposit;
}

window.deleteLocalModel = async (modelId) => {
    const o = allAdminOrders.find(x => x.id === currentEditingOrderId);
    if (!o) return;
    captureCurrentLocalEditFormValues(o);

    localEditingItems.forEach(item => {
        if (item.model_id === modelId) {
            item.isDeleted = true;
            item.quantity = 0;
        }
    });
    await renderLocalEditModal(o);
};

window.deleteLocalItem = async (index) => {
    const o = allAdminOrders.find(x => x.id === currentEditingOrderId);
    if (!o) return;
    captureCurrentLocalEditFormValues(o);

    localEditingItems[index].isDeleted = true;
    localEditingItems[index].quantity = 0;
    await renderLocalEditModal(o);
};

window.updateLocalItemQty = async (index, newQty) => {
    if (newQty < 1) return;
    const o = allAdminOrders.find(x => x.id === currentEditingOrderId);
    if (!o) return;
    captureCurrentLocalEditFormValues(o);

    const item = localEditingItems[index];
    const key = `${item.model_id}_${item.color_id}`;
    const dbStock = localEditingInventory[key] !== undefined ? localEditingInventory[key] : 0;

    const originalItem = o.order_items.find(oi => oi.model_id === item.model_id && oi.color_id === item.color_id);
    const originalQty = originalItem ? originalItem.quantity : 0;
    const realTimeStock = dbStock - (item.quantity - originalQty);

    if (newQty > item.quantity) {
        const diff = newQty - item.quantity;
        if (diff > realTimeStock) {
            showToast(`المخزون غير كافي! المتاح إضافته هو: ${realTimeStock} سيريه فقط.`, 'warning');
            return;
        }
    }

    localEditingItems[index].quantity = newQty;
    await renderLocalEditModal(o);
};

async function renderLocalEditModal(o) {
    const totalPrice = calculateLocalTotalPrice();
    const currentDeposit = o.deposit !== undefined ? o.deposit : 0;
    const remaining = totalPrice - currentDeposit;
    const invoiceNum = o.invoice_number || o.id.slice(0, 8);
    const brandName = document.getElementById('admin-footer-factory-name')?.textContent?.trim() || 'DEVO';

    // حفظ قيمة البحث ومواضع السكرول الحالية قبل إعادة الرسم
    const searchInput = document.getElementById('ao-local-search-input');
    const term = searchInput ? searchInput.value : '';

    const mainDetailsEl = document.getElementById('ao-details-content');
    const mainScrollTop = mainDetailsEl ? mainDetailsEl.scrollTop : 0;

    // تجميع الأصناف الفعالة حسب الموديل
    const activeItemsWithIndex = localEditingItems
        .map((item, originalIndex) => ({ ...item, originalIndex }))
        .filter(item => !item.isDeleted);

    const groupedModels = [];
    const modelGroupMap = new Map();

    activeItemsWithIndex.forEach(item => {
        const modelId = item.model_id;
        if (!modelGroupMap.has(modelId)) {
            const classSizes = item.models?.classes?.class_sizes || [];
            const sizesCount = classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1);
            const seriesPrice = item.price_per_series || 0;
            const piecePrice = sizesCount > 0 ? (seriesPrice / sizesCount) : seriesPrice;

            const group = {
                modelId: modelId,
                modelName: item.models?.name || 'موديل',
                code: item.models?.factory_code || item.models?.system_code || '',
                imageUrl: getModelThumbnail(item.models),
                sizesCount: sizesCount,
                seriesPrice: seriesPrice,
                piecePrice: piecePrice,
                items: []
            };
            modelGroupMap.set(modelId, group);
            groupedModels.push(group);
        }

        const group = modelGroupMap.get(modelId);
        const pieces = item.quantity * group.sizesCount;
        const itemTotal = item.quantity * item.price_per_series;

        const key = `${item.model_id}_${item.color_id}`;
        const dbStock = localEditingInventory[key] !== undefined ? localEditingInventory[key] : 0;
        const originalItem = o.order_items.find(oi => oi.model_id === item.model_id && oi.color_id === item.color_id);
        const originalQty = originalItem ? originalItem.quantity : 0;
        const realTimeStock = dbStock - (item.quantity - originalQty);
        const colorInv = item.models?.model_inventory?.find(inv => inv.color_id === item.color_id);

        group.items.push({
            ...item,
            colorName: item.colors?.name || '-',
            colorCode: item.colors?.color_code,
            colorSystemCode: colorInv?.color_system_code || '',
            colorFactoryCode: colorInv?.color_factory_code || '',
            pieces,
            itemTotal,
            realTimeStock
        });
    });

    let totalSeries = 0;
    let totalPieces = 0;
    groupedModels.forEach(g => {
        g.items.forEach(i => {
            totalSeries += i.quantity;
            totalPieces += i.pieces;
        });
    });

    let itemsHtml = '';
    if (groupedModels.length === 0) {
        itemsHtml = `
            <div class="p-8 text-center bg-devo-black/60 border border-devo-gray rounded-2xl">
                <i class="ph ph-trash text-3xl text-devo-muted mb-2 block"></i>
                <p class="text-devo-muted text-sm font-bold">تم حذف جميع الأصناف من الفاتورة.</p>
            </div>
        `;
    } else {
        itemsHtml = groupedModels.map(group => {
            const allColorsText = group.items.map(i => i.colorName).join(' ');
            return `
                <div class="bg-devo-black/50 border border-devo-gray/70 hover:border-devo-orange/40 rounded-2xl p-4 transition-all shadow-sm le-model-card" data-model-search="${group.modelName} ${group.code} ${allColorsText}">
                    <!-- هيدر كارت الموديل -->
                    <div class="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-devo-gray/60">
                        <div class="flex items-center gap-3">
                            <img src="${group.imageUrl}" alt="${escapeHtml(group.modelName)}" class="w-14 h-14 rounded-xl object-cover border border-devo-gray bg-devo-black shrink-0 shadow-sm" onerror="this.src='./src/assets/icons/devo.png'">
                            <div>
                                <div class="flex flex-wrap items-center gap-2">
                                    <h4 class="text-white font-black text-sm sm:text-base">${escapeHtml(group.modelName)}</h4>
                                    ${group.code ? `<span class="bg-devo-gray/70 border border-devo-gray text-devo-text px-2 py-0.5 rounded-lg text-xs font-mono font-bold">${group.code}</span>` : ''}
                                    <span class="bg-devo-gray/70 border border-devo-gray text-devo-muted px-2 py-0.5 rounded-lg text-xs font-medium">${group.sizesCount} قطع</span>
                                    <span class="bg-sky-500/15 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-lg text-xs font-bold font-mono">ق: ${(group.piecePrice || 0).toLocaleString()} ج</span>
                                    <span class="bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono">سيريه: ${(group.seriesPrice || 0).toLocaleString()} ج</span>
                                </div>
                                <div class="text-xs text-devo-muted flex items-center gap-1.5 mt-1.5 font-medium">
                                    <i class="ph ph-palette text-devo-orange"></i>
                                    <span>الألوان المحددة لهذا الموديل (${group.items.length}):</span>
                                </div>
                            </div>
                        </div>

                        <!-- زر حذف الموديل بالكامل -->
                        <button type="button" onclick="deleteLocalModel('${group.modelId}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs font-bold cursor-pointer shadow-sm">
                            <i class="ph ph-trash text-sm"></i>
                            <span>حذف الموديل</span>
                        </button>
                    </div>

                    <!-- صفوف ألوان الموديل -->
                    <div class="space-y-2">
                        ${group.items.map(item => `
                            <div class="flex items-center justify-between p-2.5 sm:p-3 bg-devo-dark/60 border border-devo-gray/50 hover:border-devo-gray rounded-xl transition-colors le-color-row" data-color-search="${group.modelName} ${group.code} ${item.colorName} ${item.colorSystemCode || ''} ${item.colorFactoryCode || ''}">
                                <div class="flex items-center gap-2.5">
                                    <span class="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20 shadow-sm" style="background-color: ${item.colorCode || '#38BDF8'}"></span>
                                    <span class="text-white text-xs sm:text-sm font-bold">${escapeHtml(item.colorName)}</span>
                                    ${item.colorSystemCode ? `<span class="text-[9px] font-mono text-purple-400 bg-purple-500/10 border border-purple-500/30 px-1.5 py-0.5 rounded">كود: ${item.colorSystemCode}</span>` : ''}
                                    ${item.colorFactoryCode ? `<span class="text-[9px] font-mono text-amber-400 bg-amber-500/10 border border-amber-500/30 px-1.5 py-0.5 rounded">مصنع: ${item.colorFactoryCode}</span>` : ''}
                                    ${item.realTimeStock > 0 
                                        ? `<span class="bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-bold font-mono">متاح: ${item.realTimeStock} سيريه</span>` 
                                        : `<span class="bg-red-500/15 border border-red-500/30 text-red-400 px-2 py-0.5 rounded-lg text-[10px] sm:text-xs font-bold font-mono">متاح: 0 سيريه</span>`
                                    }
                                </div>
                                <div class="flex items-center gap-3 sm:gap-4">
                                    <!-- عداد الكميات -->
                                    <div class="flex items-center bg-devo-black border border-devo-gray rounded-xl overflow-hidden h-8 w-26 sm:w-28 shadow-inner">
                                        <button type="button" onclick="updateLocalItemQty(${item.originalIndex}, ${item.quantity - 1})" class="px-2 sm:px-2.5 text-devo-muted hover:text-white transition-colors h-full flex items-center justify-center cursor-pointer ${item.quantity <= 1 ? 'opacity-40 cursor-not-allowed' : ''}"><i class="ph ph-minus text-xs"></i></button>
                                        <input type="text" inputmode="numeric" pattern="[0-9]*" onchange="updateLocalItemQty(${item.originalIndex}, parseInt(this.value) || 1)" value="${item.quantity}" class="w-10 sm:w-12 h-full bg-transparent text-center text-white text-xs font-bold outline-none border-x border-devo-gray leading-none font-mono">
                                        <button type="button" onclick="updateLocalItemQty(${item.originalIndex}, ${item.quantity + 1})" ${item.realTimeStock <= 0 ? 'disabled' : ''} class="px-2 sm:px-2.5 h-full transition-colors flex items-center justify-center cursor-pointer ${item.realTimeStock <= 0 ? 'text-devo-muted/40 cursor-not-allowed' : 'text-devo-muted hover:text-white'}"><i class="ph ph-plus text-xs"></i></button>
                                    </div>

                                    <!-- إجمالي السعر وعدد القطع -->
                                    <div class="text-left min-w-[80px] sm:min-w-[100px]">
                                        <span class="text-devo-orange font-black font-mono text-xs sm:text-sm block">${(item.itemTotal || 0).toLocaleString()} ج.م</span>
                                        <span class="text-[10px] text-devo-muted font-normal block">(${item.pieces} قطعة)</span>
                                    </div>

                                    <!-- زر حذف اللون المنفرد -->
                                    <button type="button" onclick="deleteLocalItem(${item.originalIndex})" class="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer" title="حذف هذا اللون"><i class="ph ph-trash text-base"></i></button>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    <!-- فوتر إجمالي الموديل -->
                    <div class="flex items-center justify-between pt-2.5 mt-2.5 border-t border-devo-gray/50 text-xs">
                        <span class="text-devo-muted font-bold">إجمالي الموديل: <span class="text-white font-bold">${group.items.reduce((s, i) => s + (Number(i.quantity) || 0), 0)} سيريه</span> (${group.items.reduce((s, i) => s + (Number(i.pieces) || 0), 0)} قطعة)</span>
                        <span class="text-devo-orange font-black font-mono text-sm sm:text-base">${group.items.reduce((s, i) => s + (Number(i.itemTotal) || 0), 0).toLocaleString()} ج.م</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // جلب سجل الحركات بقاعدة البيانات للأوردر
    let logs = [];
    try {
        const { data: logsData } = await supabase
            .from('order_logs')
            .select('*')
            .eq('order_id', o.id)
            .order('created_at', { ascending: false });
        if (logsData) logs = logsData;
    } catch (e) {
        console.error('Error fetching logs:', e);
    }

    const logsListHtml = logs.length > 0 
        ? logs.map(log => `
            <div class="flex gap-2.5 items-start">
                <div class="w-2 h-2 rounded-full bg-devo-orange mt-1 shrink-0 shadow-sm shadow-devo-orange/50"></div>
                <div class="flex-1 text-devo-text leading-relaxed font-medium">
                    <span class="text-white">${escapeHtml(log.notes)}</span>
                    <span class="text-[11px] text-devo-muted mr-1.5 font-mono">(${formatArabicTime(log.created_at)})</span>
                </div>
            </div>
        `).join('')
        : `<div class="text-devo-muted text-xs p-2">لا توجد حركات مسجلة بعد.</div>`;

    document.getElementById('ao-details-content').innerHTML = `
        <div class="flex flex-col gap-4">
            <!-- الهيدر العلوي -->
            <div class="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-devo-gray/80">
                <div class="flex items-center gap-2.5">
                    <div class="w-9 h-9 rounded-xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 text-lg shadow-sm">
                        <i class="ph ph-pencil-simple font-bold"></i>
                    </div>
                    <h3 class="text-base sm:text-lg font-black text-white">تعديل الأوردر محلياً #${invoiceNum}</h3>
                    <span class="bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-full text-[11px] font-bold flex items-center gap-1.5">
                        <span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                        وضع التعديل المباشر
                    </span>
                </div>
                <button onclick="cancelLocalEdit('${o.id}')" class="text-devo-muted hover:text-white p-2 rounded-xl border border-devo-gray hover:bg-white/5 transition-colors cursor-pointer" title="إلغاء التعديل وإغلاق">
                    <i class="ph ph-x text-lg"></i>
                </button>
            </div>

            <!-- الكروت الثلاثة العلوية القابلة للتعديل والمربوطة لحظياً -->
            <div class="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                <!-- 1. بيانات العميل المستلم -->
                <div class="bg-devo-black/60 border border-devo-gray rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2.5">
                            <div class="flex items-center gap-1.5 text-devo-orange text-xs font-bold">
                                <i class="ph ph-user-circle text-base"></i>
                                <span>بيانات العميل المستلم</span>
                            </div>
                            <span class="text-[10px] text-devo-muted font-medium">قابلة للتعديل مباشرة</span>
                        </div>
                        <div class="space-y-2">
                            <div>
                                <label class="block text-[11px] text-devo-muted mb-1 font-medium">اسم العميل / المحل *</label>
                                <input type="text" id="le-customer-name" value="${escapeHtml(o.customer_name || '')}" placeholder="اسم العميل..." 
                                    class="w-full bg-devo-black/80 border border-devo-gray rounded-xl px-3 py-1.5 text-white text-xs font-bold focus:border-devo-orange outline-none transition-colors shadow-inner">
                            </div>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-[11px] text-devo-muted mb-1 font-medium">رقم الهاتف الأساسي *</label>
                                    <input type="text" id="le-phone-1" dir="ltr" value="${escapeHtml(o.phone_1 || '')}" placeholder="01XXXXXXXXX" 
                                        class="w-full bg-devo-black/80 border border-devo-gray rounded-xl px-3 py-1.5 text-white text-xs font-mono font-bold focus:border-devo-orange outline-none transition-colors shadow-inner">
                                </div>
                                <div>
                                    <label class="block text-[11px] text-devo-muted mb-1 font-medium">رقم هاتف إضافي (اختياري)</label>
                                    <input type="text" id="le-phone-2" dir="ltr" value="${escapeHtml(o.phone_2 || '')}" placeholder="...رقم إضافي" 
                                        class="w-full bg-devo-black/80 border border-devo-gray rounded-xl px-3 py-1.5 text-white text-xs font-mono focus:border-devo-orange outline-none transition-colors shadow-inner">
                                </div>
                            </div>
                            <div>
                                <label class="block text-[11px] text-devo-muted mb-1 font-medium">العنوان وتفاصيل الشحن</label>
                                <input type="text" id="le-address" value="${escapeHtml(o.address || '')}" placeholder="العنوان وتفاصيل الشحن..." 
                                    class="w-full bg-devo-black/80 border border-devo-gray rounded-xl px-3 py-1.5 text-white text-xs focus:border-devo-orange outline-none transition-colors shadow-inner">
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 2. الدفع والملاحظات -->
                <div class="bg-devo-black/60 border border-devo-gray rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2.5">
                            <div class="flex items-center gap-1.5 text-devo-orange text-xs font-bold">
                                <i class="ph ph-credit-card text-base"></i>
                                <span>الدفع والملاحظات</span>
                            </div>
                            <span class="text-[10px] text-devo-muted font-medium">تحديث تلقائي</span>
                        </div>
                        <div class="space-y-2">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                    <label class="block text-[11px] text-devo-muted mb-1 font-medium">العربون المدفوع (ج.م)</label>
                                    <input type="number" id="le-deposit" min="0" oninput="updateLocalDepositSummary()" value="${currentDeposit}" 
                                        class="w-full bg-devo-black/80 border border-devo-gray rounded-xl px-3 py-1.5 text-devo-success text-xs font-mono font-bold focus:border-devo-orange outline-none transition-colors shadow-inner">
                                </div>
                                <div>
                                    <label class="block text-[11px] text-devo-muted mb-1 font-medium">مستلم العربون</label>
                                    <input type="text" id="le-deposit-receiver" value="${escapeHtml(o.deposit_receiver || '')}" placeholder="اسم المستلم / الخزينة..." 
                                        class="w-full bg-devo-black/80 border border-devo-gray rounded-xl px-3 py-1.5 text-white text-xs focus:border-devo-orange outline-none transition-colors shadow-inner">
                                </div>
                            </div>
                            <div>
                                <label class="block text-[11px] text-devo-muted mb-1 font-medium">ملاحظات وتعليمات الأوردر</label>
                                <textarea id="le-notes" rows="2" placeholder="ملاحظات وتعليمات الأوردر..." 
                                    class="w-full bg-devo-black/80 border border-devo-gray rounded-xl px-3 py-1.5 text-white text-xs focus:border-devo-orange outline-none transition-colors shadow-inner resize-none">${escapeHtml(o.notes || '')}</textarea>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 3. ملخص الحسابات اللحظي -->
                <div class="bg-devo-black/60 border border-devo-gray rounded-2xl p-4 flex flex-col justify-between shadow-sm">
                    <div>
                        <div class="flex items-center justify-between gap-2 mb-2">
                            <div class="flex items-center gap-1.5 text-devo-orange text-xs font-bold">
                                <i class="ph ph-calculator text-base"></i>
                                <span>ملخص الحسابات اللحظي</span>
                            </div>
                            <span class="bg-devo-orange/15 border border-devo-orange/30 text-devo-orange px-2 py-0.5 rounded-full text-[10px] font-bold">مباشر</span>
                        </div>
                        <div class="text-xs font-bold text-devo-muted mb-2 tracking-wider font-mono">${brandName}</div>
                        <div class="space-y-1.5 text-xs">
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">البائع المنشئ:</span>
                                <span class="text-devo-text font-medium">${escapeHtml(o.system_users?.full_name || '-')}</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">إجمالي السيريهات:</span>
                                <span id="le-summary-series" class="text-devo-text font-bold">${totalSeries} سيريه <span class="text-[11px] text-devo-muted font-normal">(${totalPieces} قطعة)</span></span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">إجمالي الفاتورة:</span>
                                <span id="le-summary-total" class="text-devo-text font-bold font-mono text-sm">${totalPrice.toLocaleString()} ج.م</span>
                            </div>
                            <div class="flex justify-between items-center">
                                <span class="text-devo-muted text-[11px]">المدفوع (العربون):</span>
                                <span id="le-summary-deposit" class="text-devo-success font-bold font-mono">${currentDeposit.toLocaleString()} ج.م</span>
                            </div>
                            <div class="flex justify-between items-center bg-devo-orange/10 border border-devo-orange/30 px-3 py-2 rounded-xl mt-1.5">
                                <span class="text-devo-orange font-bold text-xs">المتبقي للتحصيل:</span>
                                <span id="le-summary-remaining" class="text-devo-orange font-black text-sm font-mono">${remaining.toLocaleString()} ج.م</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- شريط البحث وإحصائية الأصناف -->
            <div class="flex flex-wrap items-center justify-between gap-3 pt-1">
                <div class="text-xs text-devo-muted font-medium">
                    عدد الأصناف المتاحة بالفاتورة: <span id="le-active-items-count" class="font-bold text-white font-mono">${activeItemsWithIndex.length}</span>
                </div>
                <div class="relative flex-1 max-w-md">
                    <i class="ph ph-magnifying-glass absolute right-3.5 top-1/2 -translate-y-1/2 text-devo-muted text-base"></i>
                    <input type="text" id="ao-local-search-input" oninput="filterLocalEditItems(this.value)" placeholder="بحث سريع في الأصناف بالكود أو الموديل أو اللون..." value="${term}"
                        class="w-full bg-devo-black/70 border border-devo-gray rounded-xl pr-10 pl-4 py-2 text-devo-text placeholder-devo-muted text-xs sm:text-sm focus:outline-none focus:border-devo-orange transition-all shadow-inner">
                </div>
            </div>

            <!-- مساحة كروت الموديلات المجمعة -->
            <div class="space-y-4" id="modal-items-tbody">
                ${itemsHtml}
            </div>

            <!-- سجل حركات وتعديلات الأوردر القابل للطي -->
            <div class="mt-2">
                <button type="button" onclick="toggleLocalOrderLogs()" class="w-full flex items-center justify-between p-3.5 bg-devo-black/50 border border-devo-gray rounded-2xl hover:border-devo-gray-hover text-devo-muted hover:text-white transition-all cursor-pointer">
                    <div class="flex items-center gap-2 text-xs font-bold text-devo-orange">
                        <i class="ph ph-clock-counter-clockwise text-base"></i>
                        <span>سجل حركات وتعديلات الأوردر (${logs.length})</span>
                    </div>
                    <i id="le-logs-chevron" class="ph ph-caret-down text-base transition-transform duration-300"></i>
                </button>
                <div id="le-logs-body" class="hidden mt-2 p-3.5 bg-devo-black/40 border border-devo-gray/50 rounded-2xl space-y-2.5 max-h-[160px] overflow-y-auto custom-scrollbar text-xs">
                    ${logsListHtml}
                </div>
            </div>

            <!-- شريط الحفظ والإجراءات السفلي -->
            <div class="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-devo-gray/80 mt-1">
                <div class="flex items-center gap-2 text-devo-muted text-xs">
                    <i class="ph ph-info text-devo-info text-base"></i>
                    <span>تعديل الكميات يخصم/يضيف تلقائياً من المخزون عند الحفظ.</span>
                </div>
                <div class="flex items-center gap-2.5">
                    <button id="ao-local-save-btn" onclick="saveLocalOrderEdits('${o.id}')" class="bg-devo-orange hover:bg-devo-orangeHover text-white px-6 py-2.5 rounded-xl font-bold transition-all shadow-md flex items-center gap-2 text-xs sm:text-sm cursor-pointer">
                        <i class="ph ph-check-circle text-lg"></i>
                        <span>حفظ جميع التعديلات</span>
                    </button>
                    <button type="button" onclick="cancelLocalEdit('${o.id}')" class="bg-devo-gray/70 hover:bg-white/10 text-white px-5 py-2.5 rounded-xl font-bold transition-colors text-xs sm:text-sm cursor-pointer">
                        إلغاء التعديل
                    </button>
                </div>
            </div>
        </div>
    `;

    // استعادة مواضع السكرول
    const newMainDetailsEl = document.getElementById('ao-details-content');
    if (newMainDetailsEl && mainScrollTop > 0) {
        newMainDetailsEl.scrollTop = mainScrollTop;
    }

    if (term) {
        filterLocalEditItems(term);
    }

    const modal = document.getElementById('ao-details-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
}

// دالة إظهار سجل حركات الأوردر في نافذة منبثقة مستقلة عند الطلب (للتوافق)
window.showOrderLogsModal = async (orderId) => {
    let logsHtml = '';
    try {
        const { data: logs, error } = await supabase
            .from('order_logs')
            .select('*')
            .eq('order_id', orderId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (logs && logs.length > 0) {
            logsHtml = logs.map(log => {
                const logDate = formatArabicTime(log.created_at);
                return `
                    <div class="flex gap-3 items-start p-3 bg-devo-black border border-devo-gray/50 rounded-xl">
                        <div class="w-2 h-2 rounded-full bg-devo-orange mt-1.5 shrink-0 shadow-sm shadow-devo-orange/50"></div>
                        <div class="flex-1 text-devo-text text-xs leading-relaxed font-medium">
                            <div class="text-white font-bold mb-0.5">${escapeHtml(log.notes)}</div>
                            <div class="text-[10px] text-devo-muted font-mono">بواسطة: ${escapeHtml(log.user_name || 'غير معروف')} &bull; (${logDate})</div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            logsHtml = `<div class="p-6 text-center text-devo-muted text-xs"><i class="ph ph-info text-xl mb-1 block text-devo-orange"></i> لا توجد حركات مسجلة لهذا الأوردر بعد.</div>`;
        }
    } catch (e) {
        console.error('Error fetching logs modal:', e);
        logsHtml = `<div class="p-4 text-center text-devo-error text-xs">تعذر تحميل سجل الحركات</div>`;
    }

    let logsModal = document.getElementById('ao-order-logs-modal');
    if (!logsModal) {
        logsModal = document.createElement('div');
        logsModal.id = 'ao-order-logs-modal';
        logsModal.className = 'fixed inset-0 bg-black/90 backdrop-blur-md z-[300] hidden flex items-center justify-center p-4 opacity-0 transition-opacity duration-300 no-print';
        document.body.appendChild(logsModal);
    }

    logsModal.innerHTML = `
        <div class="bg-devo-dark border border-devo-gray rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col shadow-devo-float">
            <div class="p-4 border-b border-devo-gray flex justify-between items-center bg-devo-black/80">
                <h4 class="text-sm font-bold text-white flex items-center gap-2">
                    <i class="ph ph-clock-counter-clockwise text-devo-orange text-lg"></i> سجل حركات وتعديلات الأوردر
                </h4>
                <button onclick="closeOrderLogsModal()" class="text-devo-muted hover:text-white p-1 rounded-full hover:bg-devo-gray/40 transition-colors"><i class="ph ph-x text-lg"></i></button>
            </div>
            <div class="p-4 overflow-y-auto custom-scrollbar flex-1 space-y-2.5">
                ${logsHtml}
            </div>
            <div class="p-3 border-t border-devo-gray text-left bg-devo-black/50">
                <button onclick="closeOrderLogsModal()" class="px-4 py-1.5 bg-devo-gray hover:bg-white/10 text-white rounded-xl text-xs font-bold transition-colors">إغلاق</button>
            </div>
        </div>
    `;

    logsModal.classList.remove('hidden');
    setTimeout(() => logsModal.classList.remove('opacity-0'), 10);
};

window.closeOrderLogsModal = () => {
    const modal = document.getElementById('ao-order-logs-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

window.cancelLocalEdit = async (orderId) => {
    isLocalEditMode = false;
    localEditingItems = [];
    localEditingInventory = {};

    // إلغاء قفل الأوردر بقاعدة البيانات وإتاحته وإعادة حالته لتم الإنشاء
    const { error } = await supabase.from('orders').update({
        is_locked: false,
        assigned_admin_name: null,
        assigned_worker_id: null,
        status: 'created'
    }).eq('id', orderId);

    if (error) {
        showToast('فشل إلغاء قفل الأوردر: ' + error.message, 'error');
    } else {
        const o = allAdminOrders.find(x => x.id === orderId);
        if (o) {
            o.is_locked = false;
            o.assigned_admin_name = null;
            o.assigned_worker_id = null;
            o.status = 'created';
            const row = document.getElementById(`admin-order-row-${orderId}`);
            if (row) row.outerHTML = generateOrderRowHTML(o);
        }
        await logOrderAction(orderId, 'local_edit_cancel', `ألغى الإداري ${currentUserProfile?.full_name || ''} تعديل الأوردر محلياً`);
    }

    viewAdminOrderDetails(orderId);
};

window.saveLocalOrderEdits = async (orderId) => {
    const o = allAdminOrders.find(x => x.id === orderId);
    if (!o) return;

    captureCurrentLocalEditFormValues(o);

    const customerName = document.getElementById('le-customer-name')?.value?.trim() || o.customer_name?.trim();
    const phone1 = document.getElementById('le-phone-1')?.value?.trim() || o.phone_1?.trim();
    const phone2 = document.getElementById('le-phone-2')?.value?.trim() || '';
    const address = document.getElementById('le-address')?.value?.trim() || '';
    const deposit = parseFloat(document.getElementById('le-deposit')?.value) || 0;
    const depositReceiver = document.getElementById('le-deposit-receiver')?.value?.trim() || '';
    const notes = document.getElementById('le-notes')?.value?.trim() || '';

    if (!customerName) {
        return showToast('يرجى كتابة اسم العميل / المحل!', 'warning');
    }
    if (!phone1) {
        return showToast('يرجى كتابة رقم الهاتف الأساسي للعميل!', 'warning');
    }

    const activeItems = localEditingItems.filter(item => !item.isDeleted && item.quantity > 0);
    if (activeItems.length === 0) {
        return showToast('عفواً، لا يمكن حفظ الأوردر فارغاً بالكامل! يرجى حذف الأوردر نهائياً بدلاً من ذلك.', 'error');
    }

    const saveBtn = document.getElementById('ao-local-save-btn');
    if (!saveBtn) return;
    const oldBtnHtml = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري الحفظ...`;

    try {
        // 1. التحقق من توافر المخزون للزيادات
        const modelIds = [...new Set(activeItems.map(i => i.model_id))];
        const { data: dbInv, error: dbInvError } = await supabase
            .from('model_inventory')
            .select('model_id, color_id, available_series')
            .in('model_id', modelIds);

        if (dbInvError) throw dbInvError;

        let hasStockErrors = false;
        activeItems.forEach(item => {
            const originalItem = o.order_items.find(oi => oi.model_id === item.model_id && oi.color_id === item.color_id);
            const originalQty = originalItem ? originalItem.quantity : 0;
            const diff = item.quantity - originalQty;

            if (diff > 0) {
                const inv = dbInv.find(x => x.model_id === item.model_id && x.color_id === item.color_id);
                const available = inv ? inv.available_series : 0;
                if (available < diff) {
                    showToast(`المخزون غير كافي للموديل ${item.models?.name}. المطلوب زيادة: ${diff}، المتاح بالمخزن: ${available}`, 'error');
                    hasStockErrors = true;
                }
            }
        });

        if (hasStockErrors) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = oldBtnHtml;
            return;
        }

        // 2. تحديث البيانات بالكامل
        const totalPrice = calculateLocalTotalPrice();
        const totalSeries = calculateLocalTotalSeries();

        const orderData = {
            customer_name: customerName,
            phone_1: phone1,
            phone_2: phone2,
            address: address,
            deposit: deposit,
            deposit_receiver: depositReceiver,
            notes: notes,
            total_price: totalPrice,
            total_series: totalSeries
        };

        const orderItemsData = activeItems.map(item => {
            const sizesCount = getModelSizesCount(item.models);
            return {
                model_id: item.model_id,
                color_id: item.color_id,
                qty: item.quantity,
                model_name: item.models?.name || '',
                price: item.price_per_series,
                total: item.quantity * item.price_per_series,
                sizes_count: sizesCount,
                piece_price: sizesCount > 0 ? item.price_per_series / sizesCount : item.price_per_series
            };
        });

        const { data, error: rpcError } = await supabase.rpc('process_order_transaction', {
            p_order_id: orderId,
            p_order_data: orderData,
            p_order_items: orderItemsData
        });

        if (rpcError) throw rpcError;

        // إزالة الإسناد وإلغاء القفل بعد الحفظ الناجح وإعادة الحالة إلى تم إنشاء الأوردر
        await supabase.from('orders').update({ 
            assigned_worker_id: null,
            is_locked: false,
            assigned_admin_name: null,
            status: 'created'
        }).eq('id', orderId);

        await logOrderAction(orderId, 'edited_locally', `تم تعديل بيانات وتفاصيل الأوردر محلياً وحفظ الفروقات بالمخزن بواسطة الإداري ${currentUserProfile?.full_name || ''}`);

        showToast('تم تعديل الأوردر وحفظ التغييرات والمخزون بنجاح!', 'success');
        closeAdminOrderDetails();
        await fetchAdminOrders();

    } catch (e) {
        showToast('فشل حفظ التعديلات: ' + e.message, 'error');
        console.error(e);
        saveBtn.disabled = false;
        saveBtn.innerHTML = oldBtnHtml;
    }
};

// --- الخيار الثاني: التعديل بالمعرض (السلة) ---
window.triggerCartEdit = async () => {
    if (!currentEditingOrderId) return;
    const o = allAdminOrders.find(x => x.id === currentEditingOrderId);
    if (!o) return;

    if (o.is_locked && o.assigned_admin_name && o.assigned_admin_name !== currentUserProfile?.full_name && currentUserProfile?.role !== 'owner') {
        return showToast('هذا الأوردر مغلق بواسطة إداري آخر!', 'error');
    }

    // قفل الأوردر بقاعدة البيانات لمنع التعديل المتزامن وتغيير الحالة إلى جاري التعديل
    const adminName = currentUserProfile?.full_name || 'أدمن';
    const { error } = await supabase.rpc('acquire_order_lock', {
        p_order_id: o.id,
        p_assigned_admin_name: adminName
    });

    if (error) {
        return showToast('فشل قفل الأوردر للتعديل: ' + error.message, 'error');
    }

    await logOrderAction(o.id, 'cart_edit_start', `بدأ الإداري ${currentUserProfile?.full_name || ''} تعديل الأوردر بالسلة (المعرض)`);

    showToast('جاري تجهيز السلة والتحويل للمعرض...', 'info');

    const newCart = o.order_items.map(item => {
        const imgUrl = item.models?.image_url_1 || './src/assets/icons/devo.png';
        const classSizes = item.models?.classes?.class_sizes || [];
        const sizesCount = classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1);
        const colorInv = item.models?.model_inventory?.find(inv => inv.color_id === item.color_id);
        const specificCode = colorInv?.color_system_code || colorInv?.color_factory_code || item.models?.factory_code || item.models?.system_code || '';

        return {
            modelId: item.model_id,
            factoryCode: specificCode,
            colorSystemCode: colorInv?.color_system_code || '',
            colorFactoryCode: colorInv?.color_factory_code || '',
            colorId: item.color_id,
            modelName: item.models?.name,
            colorName: item.colors?.name,
            price: item.price_per_series / sizesCount,
            image: imgUrl,
            qty: item.quantity,
            sizesCount: sizesCount
        };
    });

    const tenantId = o.tenant_id || getCurrentTenantId() || 'default';
    localStorage.setItem(`devo_cart_${tenantId}`, JSON.stringify(newCart));

    const orderData = {
        id: o.id,
        invoice_number: o.invoice_number,
        customer_name: o.customer_name,
        phone_1: o.phone_1,
        phone_2: o.phone_2,
        address: o.address,
        deposit: o.deposit,
        deposit_receiver: o.deposit_receiver,
        notes: o.notes,
        original_items: o.order_items.map(oi => ({
            model_id: oi.model_id,
            color_id: oi.color_id,
            quantity: oi.quantity
        }))
    };
    localStorage.setItem(`devo_edit_order_data_${tenantId}`, JSON.stringify(orderData));

    closeEditOrderChoices(true);
    const tenantParam = new URLSearchParams(window.location.search).get('tenant');
    window.location.href = `index.html${tenantParam ? '?tenant=' + tenantParam : (tenantId && tenantId !== 'default' ? '?tenant=' + tenantId : '')}`;
};

// --- الخيار الثالث: إسناد الأوردر لموظف آخر ---
window.executeOrderAssignment = async () => {
    if (!currentEditingOrderId) return;
    const workerId = document.getElementById('eoc-worker-select').value;
    if (!workerId) return showToast('يرجى اختيار الموظف أولاً', 'warning');

    const o = allAdminOrders.find(x => x.id === currentEditingOrderId);
    if (!o) return;

    showToast('جاري إسناد الأوردر...', 'info');

    try {
        const currentTenantId = getCurrentTenantId();
        // 🔒 التحقق الأمني: التأكد من أن الموظف ينتمي للمصنع الحالي فقط
        const { data: targetUser, error: userErr } = await supabase
            .from('system_users')
            .select('id, tenant_id')
            .eq('id', workerId)
            .single();

        if (userErr || !targetUser) {
            return showToast('الموظف المختار غير موجود بالسيستم', 'error');
        }

        if (currentTenantId && targetUser.tenant_id && targetUser.tenant_id !== currentTenantId) {
            return showToast('عفواً، لا يمكن إسناد الأوردر لموظف ينتمي لمصنع آخر', 'error');
        }

        const { error } = await supabase
            .from('orders')
            .update({
                assigned_worker_id: workerId,
                is_locked: false
            })
            .eq('id', currentEditingOrderId);

        if (error) throw error;

        const workerSelect = document.getElementById('eoc-worker-select');
        const workerName = workerSelect.options[workerSelect.selectedIndex]?.text || 'موظف';
        await logOrderAction(currentEditingOrderId, 'assigned', `تم إسناد الأوردر للتعديل إلى الموظف (${workerName}) بواسطة الإداري ${currentUserProfile?.full_name || ''}`);

        showToast('تم إسناد وتعيين الأوردر بنجاح للموظف!', 'success');
        closeEditOrderChoices();
        await fetchAdminOrders();
    } catch (e) {
        showToast('خطأ أثناء إسناد الأوردر: ' + e.message, 'error');
    }
};

// دالة مساعدة لتحويل اسم الحالة إلى العربية
function getArabicStatusName(status) {
    if (!status) return null;
    return statusConfig[status]?.text || status;
}

// دالة لتسجيل حركات وتعديلات الأوردرات بسجل الملاحظات
async function logOrderAction(orderId, actionType, notes, extraMeta = {}) {
    try {
        const { session } = getCurrentSession();
        const userId = session?.user?.id || null;
        const userName = currentUserProfile?.full_name || 'نظام DEVO';
        const currentTenantId = getCurrentTenantId();
        
        let orderObj = null;
        const ordersList = (typeof allAdminOrders !== 'undefined' && Array.isArray(allAdminOrders)) ? allAdminOrders : ((typeof allOrders !== 'undefined' && Array.isArray(allOrders)) ? allOrders : []);
        if (orderId && Array.isArray(ordersList)) {
            orderObj = ordersList.find(o => String(o.id) === String(orderId));
        }

        const enrichedDetails = {
            notes: notes,
            action: actionType,
            invoice_number: extraMeta.invoice_number || (orderObj?.invoice_number ? `#${orderObj.invoice_number}` : null),
            customer_name: extraMeta.customer_name || orderObj?.customer_name || null,
            phone: extraMeta.phone || orderObj?.customer_phone || orderObj?.phone || null,
            status: extraMeta.new_status || (orderObj?.status ? getArabicStatusName(orderObj.status) : null),
            total_price: extraMeta.total_price || (orderObj?.total_price ? `${orderObj.total_price} ج.م` : null),
            deposit: extraMeta.deposit || (orderObj?.deposit !== undefined ? `${orderObj.deposit} ج.م` : null),
            user_name: userName,
            ...extraMeta
        };

        const { error } = await supabase.from('order_logs').insert([{
            tenant_id: currentTenantId,
            order_id: orderId,
            user_id: userId,
            user_name: userName,
            action_type: actionType,
            notes: notes,
            details: JSON.stringify(enrichedDetails)
        }]);
        if (error) {
            console.error('Database error inserting order log:', error);
        }

        // 📝 تسـجيل الإجراء في سجلات النظام الشاملة
        logAuditEvent({
            module: 'orders',
            actionType: actionType === 'status_changed' ? 'status_change' : (actionType.includes('delete') ? 'delete' : 'update'),
            entityType: 'order',
            entityId: orderId,
            details: enrichedDetails,
            tenantIdParam: currentTenantId,
            userNameParam: userName
        }).catch(e => console.warn(e));

    } catch (err) {
        console.error('Error logging order action:', err);
    }
}

// دالة مساعدة لحساب عدد مقاسات الموديل لتحديد أسعار القطع
function getModelSizesCount(model) {
    if (!model) return 1;
    const classSizes = model.classes?.class_sizes || [];
    if (classSizes.length > 0) return classSizes.length;
    const modelSizes = model.model_sizes || [];
    if (modelSizes.length > 0) return modelSizes.length;
    return 1;
}

// =========================================================================
// 🌟 5. منظومة إدارة طلبات الزوار وقائمة الانتظار (Visitor Orders System) 🌟
// =========================================================================

// --- تبديل التبويبات الفرعية لطلبات الزوار (مطابق للصورة 4) ---
window.switchVisitorOrdersSubtab = (subtab) => {
    currentVisitorSubtab = subtab;
    const subtabs = ['pending', 'archived', 'approved', 'rejected', 'all'];
    subtabs.forEach(tabKey => {
        const btn = document.getElementById(`vo-tab-${tabKey}`);
        if (!btn) return;
        if (tabKey === subtab) {
            btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-devo-orange text-white shadow-md cursor-pointer';
        } else {
            btn.className = 'px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-2 bg-devo-dark text-devo-muted hover:text-white border border-devo-gray hover:bg-devo-gray/40 cursor-pointer';
        }
    });
    renderVisitorOrders();
};

// --- 📱 مساعدات الواتساب والتنبيهات الصوتية ومؤشر التقادم لطلبات الزوار ---
export function formatWhatsAppUrl(rawPhone, text) {
    if (!rawPhone) return '#';
    let clean = String(rawPhone).replace(/[^\d+]/g, '');
    if (clean.startsWith('0') && clean.length === 11) {
        clean = '2' + clean;
    } else if (!clean.startsWith('2') && !clean.startsWith('+') && clean.length === 10) {
        clean = '20' + clean;
    }
    clean = clean.replace(/^\+/, '');
    return `https://wa.me/${clean}?text=${encodeURIComponent(text)}`;
}

export function getWhatsAppOrderMessage(order) {
    const code = order.order_code || '';
    const name = order.customer_name || 'عميلنا العزيز';
    const amount = Number(order.total_amount || 0).toLocaleString();
    const series = order.total_series || 0;
    let statusText = 'قيد المراجعة في قائمة الانتظار';
    if (order.status === 'approved') statusText = 'تم اعتماده وجاري التجهيز';
    if (order.status === 'rejected') statusText = 'تم رفضه';
    if (order.status === 'assigned') statusText = 'مسند للمراجعة والتنسيق';

    return `مرحباً أ/ ${name}،
بخصوص طلبكم رقم (#${code}):
📦 إجمالي السريات: ${series} سيريه
💰 المبلغ الإجمالي: ${amount} ج.م
📌 حالة الطلب الحالية: ${statusText}

يسعدنا متابعة وتأكيد طلبكم، هل تود تأكيد شحن أو استلام الطلب؟`;
}

// 🔔 تشغيل نغمة تنبيه راقية مزدوجة (Live Sound Ping)
export function playVisitorOrderChime() {
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const now = audioCtx.currentTime;

        // النغمة الأولى: وتر مبهج D5 (587 Hz)
        const osc1 = audioCtx.createOscillator();
        const gain1 = audioCtx.createGain();
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(587.33, now);
        gain1.gain.setValueAtTime(0, now);
        gain1.gain.linearRampToValueAtTime(0.18, now + 0.04);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.38);
        osc1.connect(gain1);
        gain1.connect(audioCtx.destination);
        osc1.start(now);
        osc1.stop(now + 0.38);

        // النغمة الثانية: وتر مرتفع A5 (880 Hz) بتناغم زمني
        const osc2 = audioCtx.createOscillator();
        const gain2 = audioCtx.createGain();
        osc2.type = 'sine';
        osc2.frequency.setValueAtTime(880, now + 0.14);
        gain2.gain.setValueAtTime(0, now + 0.14);
        gain2.gain.linearRampToValueAtTime(0.22, now + 0.18);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.65);
        osc2.connect(gain2);
        gain2.connect(audioCtx.destination);
        osc2.start(now + 0.14);
        osc2.stop(now + 0.65);
    } catch (e) {
        console.warn('AudioContext visitor chime ping error:', e);
    }
}

// نبض بصري لتبويب طلبات الزوار في الشريط الجانبي والرئيسي
function pulseVisitorOrderTabs() {
    const tabBtn = document.getElementById('ao-tab-visitor');
    const badge = document.getElementById('sidebar-visitor-badge');
    const aoBadge = document.getElementById('ao-count-visitor');

    if (tabBtn) {
        tabBtn.classList.add('animate-pulse', 'ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-slate-900');
        setTimeout(() => {
            tabBtn.classList.remove('animate-pulse', 'ring-2', 'ring-amber-400', 'ring-offset-2', 'ring-offset-slate-900');
        }, 12000);
    }
    if (badge) {
        badge.classList.add('animate-bounce');
        setTimeout(() => badge.classList.remove('animate-bounce'), 10000);
    }
    if (aoBadge) {
        aoBadge.classList.add('animate-ping');
        setTimeout(() => aoBadge.classList.remove('animate-ping'), 6000);
    }
}

// ⏳ مؤشر تقادم وتأخر الطلب الذكي (Order Aging Indicator)
export function getOrderAgingInfo(createdAt, status) {
    if (status === 'approved') {
        return {
            badgeHtml: `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 whitespace-nowrap"><i class="ph ph-check text-[11px]"></i> معتمد</span>`,
            isOverdue: false
        };
    }
    if (status === 'rejected') {
        return {
            badgeHtml: `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-rose-500/10 text-rose-400/60 border border-rose-500/20 whitespace-nowrap"><i class="ph ph-x text-[11px]"></i> ملغي</span>`,
            isOverdue: false
        };
    }

    const createdTime = new Date(createdAt).getTime();
    const now = Date.now();
    const diffMinutes = Math.max(0, Math.floor((now - createdTime) / 60000));

    if (diffMinutes < 60) {
        const mins = Math.max(1, diffMinutes);
        return {
            badgeHtml: `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 whitespace-nowrap"><i class="ph ph-clock text-[11px]"></i> منذ ${mins} د</span>`,
            isOverdue: false
        };
    } else if (diffMinutes < 720) { // أقل من 12 ساعة
        const hours = Math.floor(diffMinutes / 60);
        return {
            badgeHtml: `<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 whitespace-nowrap"><i class="ph ph-clock text-[11px]"></i> منذ ${hours} س</span>`,
            isOverdue: false
        };
    } else if (diffMinutes < 1440) { // 12 إلى 24 ساعة (متأخر)
        const hours = Math.floor(diffMinutes / 60);
        return {
            badgeHtml: `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse whitespace-nowrap shadow-sm shadow-amber-500/10" title="متأخر في الانتظار أكثر من 12 ساعة"><i class="ph ph-warning text-[11px]"></i> متأخر (${hours} س)</span>`,
            isOverdue: true
        };
    } else { // أكثر من 24 ساعة (متأخر جداً)
        const days = Math.floor(diffMinutes / 1440);
        return {
            badgeHtml: `<span class="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500/25 text-rose-300 border border-rose-500/50 animate-pulse whitespace-nowrap shadow-sm shadow-rose-500/20" title="متأخر في الانتظار أكثر من 24 ساعة!"><i class="ph ph-warning-octagon text-[11px]"></i> متأخر جداً (${days} ي)</span>`,
            isOverdue: true
        };
    }
}

// --- جلب طلبات الزوار من قاعدة البيانات ---
export async function fetchVisitorOrders() {
    try {
        const currentTenantId = getCurrentTenantId();
        let query = supabase
            .from('visitor_orders')
            .select('*')
            .order('created_at', { ascending: false });

        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data, error } = await query;
        if (!error && data) {
            allVisitorOrders = data;
            updateVisitorOrderBadges();
            renderVisitorOrders();
        } else if (error) {
            console.error('Error fetching visitor orders:', error);
        }
    } catch (e) {
        console.error('Error in fetchVisitorOrders:', e);
    }
}
window.refreshVisitorOrders = fetchVisitorOrders;

// --- تحديث عدادات التبويبات والبادجات اللحظية ---
function updateVisitorOrderBadges() {
    const nonDeleted = allVisitorOrders.filter(o => !o.is_deleted);
    const pendingCount = nonDeleted.filter(o => o.status === 'pending' || o.status === 'assigned').length;
    const approvedCount = nonDeleted.filter(o => o.status === 'approved').length;
    const rejectedCount = nonDeleted.filter(o => o.status === 'rejected').length;
    const archivedCount = nonDeleted.filter(o => o.status === 'approved' || o.status === 'rejected').length;
    const allCount = nonDeleted.length;

    const aoBadge = document.getElementById('ao-count-visitor');
    if (aoBadge) aoBadge.textContent = pendingCount;

    const pendingBadge = document.getElementById('vo-count-pending');
    if (pendingBadge) pendingBadge.textContent = pendingCount;

    const archivedBadge = document.getElementById('vo-count-archived');
    if (archivedBadge) archivedBadge.textContent = archivedCount;

    const approvedBadge = document.getElementById('vo-count-approved');
    if (approvedBadge) approvedBadge.textContent = approvedCount;

    const rejectedBadge = document.getElementById('vo-count-rejected');
    if (rejectedBadge) rejectedBadge.textContent = rejectedCount;

    const allBadge = document.getElementById('vo-count-all');
    if (allBadge) allBadge.textContent = allCount;

    const sidebarBadge = document.getElementById('sidebar-visitor-badge');
    if (sidebarBadge) {
        sidebarBadge.textContent = pendingCount;
        sidebarBadge.classList.toggle('hidden', pendingCount === 0);
    }
}

// --- رندر جدول طلبات الزوار وطباعة الصفوف طبقاً للصورة 4 ---
export function renderVisitorOrders() {
    const tBody = document.getElementById('vo-table-body');
    if (!tBody) return;

    const searchTerm = (document.getElementById('vo-search-input')?.value || '').trim().toLowerCase();

    let filtered = allVisitorOrders.filter(o => !o.is_deleted);

    // تصفية حسب التبويب الفرعي
    if (currentVisitorSubtab === 'pending') {
        filtered = filtered.filter(o => o.status === 'pending' || o.status === 'assigned');
    } else if (currentVisitorSubtab === 'archived') {
        filtered = filtered.filter(o => o.status === 'approved' || o.status === 'rejected');
    } else if (currentVisitorSubtab === 'approved') {
        filtered = filtered.filter(o => o.status === 'approved');
    } else if (currentVisitorSubtab === 'rejected') {
        filtered = filtered.filter(o => o.status === 'rejected');
    }

    // تصفية حسب البحث
    if (searchTerm) {
        filtered = filtered.filter(o => {
            const code = (o.order_code || '').toLowerCase();
            const name = (o.customer_name || '').toLowerCase();
            const phone1 = (o.customer_phone_1 || '').toLowerCase();
            const phone2 = (o.customer_phone_2 || '').toLowerCase();
            const addr = (o.customer_address || '').toLowerCase();
            const notes = (o.notes || '').toLowerCase();
            return code.includes(searchTerm) || name.includes(searchTerm) || phone1.includes(searchTerm) || phone2.includes(searchTerm) || addr.includes(searchTerm) || notes.includes(searchTerm);
        });
    }

    if (filtered.length === 0) {
        tBody.innerHTML = `
            <tr>
                <td colspan="9" class="p-12 text-center text-devo-muted">
                    <div class="w-14 h-14 rounded-2xl bg-devo-gray/30 border border-devo-gray flex items-center justify-center text-devo-muted text-2xl mx-auto mb-3">
                        <i class="ph ph-tray"></i>
                    </div>
                    <span class="text-sm font-bold block text-white">لا توجد طلبات في هذا التبويب</span>
                    <span class="text-xs mt-1 block">لم يتم العثور على أي طلبات تطابق معايير البحث أو التصفية الحالية</span>
                </td>
            </tr>
        `;
        return;
    }

    tBody.innerHTML = filtered.map(o => {
        const createdDate = new Date(o.created_at);
        const formattedDate = createdDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) + '، ' + createdDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
        const agingInfo = getOrderAgingInfo(o.created_at, o.status);

        let statusBadgeHTML = '';
        if (o.status === 'pending') {
            statusBadgeHTML = `<span class="bg-amber-500/20 text-amber-400 border border-amber-500/40 text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 justify-center"><i class="ph ph-clock text-xs"></i> في الانتظار</span>`;
        } else if (o.status === 'assigned') {
            statusBadgeHTML = `<span class="bg-purple-500/20 text-purple-400 border border-purple-500/40 text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 justify-center"><i class="ph ph-user text-xs"></i> مسند للمراجعة</span>`;
        } else if (o.status === 'approved') {
            statusBadgeHTML = `<span class="bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 justify-center"><i class="ph ph-check-circle text-xs"></i> معتمد</span>`;
        } else if (o.status === 'rejected') {
            statusBadgeHTML = `<span class="bg-rose-500/20 text-rose-400 border border-rose-500/40 text-[11px] font-bold px-3 py-1 rounded-full flex items-center gap-1.5 justify-center" title="${escapeHtml(o.rejection_reason || '')}"><i class="ph ph-x-circle text-xs"></i> مرفوض</span>`;
        } else {
            statusBadgeHTML = `<span class="bg-devo-gray text-white text-[11px] font-bold px-3 py-1 rounded-full">${o.status}</span>`;
        }

        const itemsCount = o.total_models || (Array.isArray(o.items) ? o.items.length : 0);
        const seriesCount = o.total_series || 0;
        const totalAmount = Number(o.total_amount || 0).toLocaleString();

        return `
            <tr id="visitor-order-row-${o.id}" class="hover:bg-white/[0.02] transition-colors ${agingInfo.isOverdue ? 'bg-amber-500/[0.02]' : ''}">
                <!-- كود الطلب -->
                <td class="p-3">
                    <div class="flex items-center gap-1.5">
                        <span class="font-mono font-black text-amber-400 text-xs tracking-wider">${escapeHtml(o.order_code || '')}</span>
                        <button type="button" onclick="navigator.clipboard.writeText('${o.order_code}'); showToast('تم نسخ كود الطلب', 'info');" class="text-devo-muted hover:text-white transition-colors cursor-pointer" title="نسخ الكود">
                            <i class="ph ph-copy text-xs"></i>
                        </button>
                    </div>
                </td>

                <!-- تاريخ الإرسال ومؤشر التقادم -->
                <td class="p-3 text-xs text-devo-muted font-medium">
                    <div class="text-[11px] text-slate-200 mb-1 leading-tight">${formattedDate}</div>
                    ${agingInfo.badgeHtml}
                </td>

                <!-- العميل / الهاتف / واتساب -->
                <td class="p-3">
                    <div class="font-bold text-white text-xs">${escapeHtml(o.customer_name || 'عميل بدون اسم')}</div>
                    <div class="text-[11px] font-mono text-devo-muted mt-0.5 flex items-center gap-1.5 flex-wrap">
                        <i class="ph ph-phone text-xs"></i>
                        <a href="tel:${o.customer_phone_1}" class="hover:text-devo-orange transition-colors">${escapeHtml(o.customer_phone_1 || '-')}</a>
                        ${o.customer_phone_1 ? `
                            <a href="${formatWhatsAppUrl(o.customer_phone_1, getWhatsAppOrderMessage(o))}" target="_blank" class="w-5 h-5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-400 border border-emerald-500/30 inline-flex items-center justify-center transition-all cursor-pointer" title="محادثة العميل عبر واتساب">
                                <i class="ph ph-whatsapp-logo text-xs"></i>
                            </a>
                        ` : ''}
                    </div>
                </td>

                <!-- العنوان / الملاحظات -->
                <td class="p-3 max-w-[200px]">
                    <div class="text-xs text-white truncate" title="${escapeHtml(o.customer_address || '')}">
                        ${escapeHtml(o.customer_address || '-')}
                    </div>
                    ${o.notes ? `<div class="text-[10px] text-amber-300/80 truncate mt-0.5" title="${escapeHtml(o.notes)}"><i class="ph ph-chat-text text-[10px]"></i> ${escapeHtml(o.notes)}</div>` : ''}
                </td>

                <!-- الأصناف -->
                <td class="p-3 text-center text-xs font-bold text-white">
                    ${itemsCount} صنف
                </td>

                <!-- السريات -->
                <td class="p-3 text-center text-xs font-black text-blue-400 font-mono">
                    ${seriesCount}
                </td>

                <!-- الإجمالي -->
                <td class="p-3 text-center text-xs font-black text-devo-orange font-mono">
                    ${totalAmount} ج.م
                </td>

                <!-- حالة الطلب -->
                <td class="p-3 text-center">
                    ${statusBadgeHTML}
                </td>

                <!-- إجراءات الإدارة مطابق للصورة 4 -->
                <td class="p-3 text-center">
                    <div class="flex items-center justify-center gap-1">
                        <!-- Eye: عرض التفاصيل -->
                        <button type="button" onclick="window.openVisitorOrderDetails('${o.id}')" class="w-7 h-7 rounded-lg bg-blue-500/10 hover:bg-blue-500/30 text-blue-400 flex items-center justify-center transition-all cursor-pointer" title="عرض تفاصيل الطلب">
                            <i class="ph ph-eye text-sm"></i>
                        </button>

                        <!-- Pencil: تعديل الطلب بالكامل -->
                        <button type="button" onclick="window.openVisitorOrderEdit('${o.id}')" class="w-7 h-7 rounded-lg bg-amber-500/10 hover:bg-amber-500/30 text-amber-400 flex items-center justify-center transition-all cursor-pointer" title="تعديل بيانات وأصناف الطلب">
                            <i class="ph ph-pencil-simple text-sm"></i>
                        </button>

                        <!-- User-Plus: إسناد لعامل -->
                        <button type="button" onclick="window.openVisitorOrderAssign('${o.id}')" class="w-7 h-7 rounded-lg bg-purple-500/10 hover:bg-purple-500/30 text-purple-400 flex items-center justify-center transition-all cursor-pointer" title="إسناد الطلب لعامل مبيعات">
                            <i class="ph ph-user-circle-plus text-sm"></i>
                        </button>

                        <!-- Check: موافقة واعتماد فوري -->
                        ${o.status !== 'approved' ? `
                            <button type="button" onclick="window.approveVisitorOrder('${o.id}')" class="w-7 h-7 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/30 text-emerald-400 flex items-center justify-center transition-all cursor-pointer" title="اعتماد الطلب وخصم المخزون فوراً">
                                <i class="ph ph-check-circle text-sm"></i>
                            </button>
                        ` : ''}

                        <!-- X: رفض الطلب -->
                        ${o.status !== 'rejected' ? `
                            <button type="button" onclick="window.openVisitorOrderReject('${o.id}')" class="w-7 h-7 rounded-lg bg-rose-500/10 hover:bg-rose-500/30 text-rose-400 flex items-center justify-center transition-all cursor-pointer" title="رفض الطلب">
                                <i class="ph ph-x-circle text-sm"></i>
                            </button>
                        ` : ''}

                        <!-- Printer: طباعة -->
                        <button type="button" onclick="window.printVisitorOrder('${o.id}')" class="w-7 h-7 rounded-lg bg-devo-gray/40 hover:bg-devo-gray text-white flex items-center justify-center transition-all cursor-pointer" title="طباعة الفاتورة">
                            <i class="ph ph-printer text-sm"></i>
                        </button>

                        <!-- Trash: حذف -->
                        <button type="button" onclick="window.deleteVisitorOrder('${o.id}')" class="w-7 h-7 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-400 flex items-center justify-center transition-all cursor-pointer" title="حذف الطلب">
                            <i class="ph ph-trash text-sm"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// --- رادار التحديث اللحظي لطلبات الزوار ---
function setupVisitorOrdersRealtime() {
    const currentTenantId = getCurrentTenantId();
    const filterConfig = currentTenantId ? { filter: `tenant_id=eq.${currentTenantId}` } : {};

    supabase.channel('admin_visitor_orders_realtime_' + (currentTenantId || 'default'))
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'visitor_orders', ...filterConfig }, (payload) => {
            const existingIdx = allVisitorOrders.findIndex(o => o.id === payload.new.id);
            if (existingIdx === -1) {
                allVisitorOrders.unshift(payload.new);
                updateVisitorOrderBadges();
                renderVisitorOrders();
                playVisitorOrderChime();
                pulseVisitorOrderTabs();
                showToast(`🔔 وصل طلب جديد من الزائر (${escapeHtml(payload.new.customer_name || 'عميل')}) برقم #${payload.new.order_code} بقيمة ${Number(payload.new.total_amount || 0).toLocaleString()} ج.م!`, 'info');
            }
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'visitor_orders', ...filterConfig }, (payload) => {
            const idx = allVisitorOrders.findIndex(o => o.id === payload.new.id);
            if (idx > -1) {
                allVisitorOrders[idx] = payload.new;
            } else {
                allVisitorOrders.unshift(payload.new);
            }
            updateVisitorOrderBadges();
            renderVisitorOrders();
        })
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'visitor_orders', ...filterConfig }, (payload) => {
            allVisitorOrders = allVisitorOrders.filter(o => o.id !== payload.old.id);
            updateVisitorOrderBadges();
            renderVisitorOrders();
        })
        .subscribe();
}

// --- 1. نافذة تفاصيل طلب الزائر (معاينة) ---
window.openVisitorOrderDetails = (orderId) => {
    const order = allVisitorOrders.find(o => o.id === orderId);
    if (!order) return;
    visitorOrderUnderAction = order;

    document.getElementById('vo-details-code').textContent = '#' + (order.order_code || '');
    
    const statusBadge = document.getElementById('vo-details-status-badge');
    if (statusBadge) {
        if (order.status === 'pending') {
            statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-amber-500/20 text-amber-400 border border-amber-500/40';
            statusBadge.textContent = 'قيد الانتظار';
        } else if (order.status === 'assigned') {
            statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-purple-500/20 text-purple-400 border border-purple-500/40';
            statusBadge.textContent = 'مسند للمراجعة';
        } else if (order.status === 'approved') {
            statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/40';
            statusBadge.textContent = 'معتمد';
        } else if (order.status === 'rejected') {
            statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-500/20 text-rose-400 border border-rose-500/40';
            statusBadge.textContent = 'مرفوض';
        } else {
            statusBadge.className = 'text-xs px-2.5 py-0.5 rounded-full font-bold bg-devo-gray text-white';
            statusBadge.textContent = order.status;
        }
    }

    const agingEl = document.getElementById('vo-details-aging-badge');
    if (agingEl) {
        const aging = getOrderAgingInfo(order.created_at, order.status);
        agingEl.innerHTML = aging.badgeHtml;
    }

    const createdDate = new Date(order.created_at);
    document.getElementById('vo-details-date').textContent = createdDate.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) + '، ' + createdDate.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });

    document.getElementById('vo-details-customer').textContent = order.customer_name || 'عميل بدون اسم';
    document.getElementById('vo-details-phone').textContent = order.customer_phone_1 || '-';
    document.getElementById('vo-details-phone2').textContent = order.customer_phone_2 ? `(${order.customer_phone_2})` : '';

    const waModalBtn = document.getElementById('vo-details-whatsapp-btn');
    if (waModalBtn) {
        if (order.customer_phone_1) {
            waModalBtn.href = formatWhatsAppUrl(order.customer_phone_1, getWhatsAppOrderMessage(order));
            waModalBtn.classList.remove('hidden');
        } else {
            waModalBtn.classList.add('hidden');
        }
    }

    document.getElementById('vo-details-address').textContent = order.customer_address || '-';
    document.getElementById('vo-details-notes').textContent = order.notes || 'لا توجد ملاحظات إضافية';

    const rejRow = document.getElementById('vo-details-rejection-row');
    if (rejRow) {
        if (order.status === 'rejected' && order.rejection_reason) {
            rejRow.classList.remove('hidden');
            document.getElementById('vo-details-rejection').textContent = order.rejection_reason;
        } else {
            rejRow.classList.add('hidden');
        }
    }

    // محتويات الطلب (عرض الموديلات مجمعة)
    let items = order.items;
    if (typeof items === 'string') {
        try { items = JSON.parse(items); } catch(e) { items = []; }
    }
    if (!Array.isArray(items)) items = [];
    const modelMap = new Map();

    items.forEach(item => {
        const modelId = item.model_id || item.modelId || item.model_name || 'unknown';
        if (!modelMap.has(modelId)) {
            const sizesCount = Number(item.sizes_count) || 1;
            const seriesPrice = Number(item.price) || 0;
            const piecePrice = sizesCount > 0 ? Math.round(seriesPrice / sizesCount) : seriesPrice;

            modelMap.set(modelId, {
                modelId,
                modelName: item.model_name || item.modelName || 'موديل',
                code: item.factory_code || item.factoryCode || '',
                imageUrl: item.image_url || item.image || './src/assets/icons/devo.png',
                sizesCount: sizesCount,
                seriesPrice: seriesPrice,
                piecePrice: piecePrice,
                totalSeries: 0,
                totalPieces: 0,
                totalPrice: 0,
                items: []
            });
        }

        const group = modelMap.get(modelId);
        const qty = Number(item.qty || item.quantity) || 0;
        const pieces = qty * group.sizesCount;
        const itemTotal = qty * group.seriesPrice;

        group.totalSeries += qty;
        group.totalPieces += pieces;
        group.totalPrice += itemTotal;

        group.items.push({
            colorName: item.color_name || item.colorName || 'لون',
            colorCode: item.color_code || item.colorCode || '#38BDF8',
            quantity: qty,
            pieces: pieces,
            itemTotal: itemTotal,
            price_per_series: group.seriesPrice
        });
    });

    const modelGroups = Array.from(modelMap.values());
    let container = document.getElementById('vo-details-models-container');
    if (!container) {
        const oldTableBody = document.getElementById('vo-details-items-body');
        if (oldTableBody) {
            const tableWrapper = oldTableBody.closest('.overflow-hidden') || oldTableBody.closest('table');
            if (tableWrapper && tableWrapper.parentNode) {
                container = document.createElement('div');
                container.id = 'vo-details-models-container';
                container.className = 'space-y-3';
                tableWrapper.parentNode.replaceChild(container, tableWrapper);
            }
        }
    }
    if (container) {
        if (modelGroups.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center bg-devo-black/60 border border-devo-gray rounded-2xl">
                    <i class="ph ph-package text-3xl text-devo-muted mb-2 block"></i>
                    <p class="text-devo-muted text-sm font-bold">لا توجد أصناف مسجلة في هذا الطلب.</p>
                </div>
            `;
        } else {
            container.innerHTML = modelGroups.map(group => {
                const allColorsText = group.items.map(i => i.colorName).join(' ');
                return `
                    <div class="bg-devo-black/50 border border-devo-gray/70 hover:border-devo-orange/40 rounded-2xl p-4 transition-all shadow-sm vo-detail-model-card" data-model-search="${escapeHtml(group.modelName)} ${escapeHtml(group.code)} ${allColorsText}">
                        <!-- هيدر الموديل -->
                        <div class="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-devo-gray/60">
                            <div class="flex items-center gap-3">
                                <img src="${group.imageUrl}" alt="${escapeHtml(group.modelName)}" class="w-14 h-14 rounded-xl object-cover border border-devo-gray bg-devo-black shrink-0 shadow-sm" onerror="this.src='./src/assets/icons/devo.png'">
                                <div>
                                    <div class="flex flex-wrap items-center gap-2">
                                        <h4 class="text-white font-black text-sm sm:text-base">${escapeHtml(group.modelName)}</h4>
                                        ${group.code ? `<span class="bg-devo-gray/70 border border-devo-gray text-devo-text px-2 py-0.5 rounded-lg text-xs font-mono font-bold">${escapeHtml(group.code)}</span>` : ''}
                                        <span class="bg-devo-gray/70 border border-devo-gray text-devo-muted px-2 py-0.5 rounded-lg text-xs font-medium">${group.sizesCount} قطع</span>
                                        <span class="bg-sky-500/15 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-lg text-xs font-bold font-mono">ق: ${(group.piecePrice || 0).toLocaleString()} ج</span>
                                        <span class="bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono">سيريه: ${(group.seriesPrice || 0).toLocaleString()} ج</span>
                                    </div>
                                    <div class="text-xs text-devo-muted flex items-center gap-1.5 mt-1.5 font-medium">
                                        <i class="ph ph-palette text-devo-orange"></i>
                                        <span>الألوان المسجلة لهذا الموديل (${group.items.length}):</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- صفوف ألوان الموديل -->
                        <div class="space-y-2">
                            ${group.items.map(item => `
                                <div class="flex items-center justify-between p-2.5 sm:p-3 bg-devo-dark/60 border border-devo-gray/50 hover:border-devo-gray rounded-xl transition-colors vo-detail-color-row" data-color-search="${escapeHtml(group.modelName)} ${escapeHtml(group.code)} ${escapeHtml(item.colorName)}">
                                    <div class="flex items-center gap-2.5">
                                        <span class="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20 shadow-sm" style="background-color: ${item.colorCode || '#38BDF8'}"></span>
                                        <span class="text-white text-xs sm:text-sm font-bold">${escapeHtml(item.colorName)}</span>
                                    </div>
                                    <div class="flex items-center gap-3 sm:gap-5">
                                        <span class="bg-devo-black/80 border border-devo-gray/60 px-3 py-1.5 rounded-xl text-devo-text text-xs font-bold shadow-inner">
                                            ${item.quantity} سيريه <span class="text-[11px] text-devo-muted font-normal">(${item.pieces} قطعة)</span>
                                        </span>
                                        <div class="text-left min-w-[90px] sm:min-w-[110px]">
                                            <span class="text-devo-orange font-black font-mono text-sm block">${(item.itemTotal || 0).toLocaleString()} ج.م</span>
                                            <span class="text-[10px] text-devo-muted font-mono block">سعر السيريه: ${(item.price_per_series || 0).toLocaleString()} ج</span>
                                        </div>
                                    </div>
                                </div>
                            `).join('')}
                        </div>

                        <!-- فوتر إجمالي الموديل -->
                        <div class="flex items-center justify-between pt-2.5 mt-2.5 border-t border-devo-gray/50 text-xs">
                            <span class="text-devo-muted font-bold">إجمالي الموديل: <span class="text-white font-bold">${group.totalSeries} سيريه</span> (${group.totalPieces} قطعة)</span>
                            <span class="text-devo-orange font-black font-mono text-sm sm:text-base">${group.totalPrice.toLocaleString()} ج.م</span>
                        </div>
                    </div>
                `;
            }).join('');
        }
    }

    document.getElementById('vo-details-total-models').textContent = modelGroups.length;
    document.getElementById('vo-details-total-series').textContent = order.total_series || modelGroups.reduce((acc, g) => acc + g.totalSeries, 0);
    document.getElementById('vo-details-total-amount').textContent = Number(order.total_amount || modelGroups.reduce((acc, g) => acc + g.totalPrice, 0)).toLocaleString() + ' ج.م';

    // أزرار الإجراءات داخل المودال
    const btnApprove = document.getElementById('vo-btn-approve-from-details');
    if (btnApprove) {
        btnApprove.onclick = () => window.approveVisitorOrder(order.id);
        btnApprove.classList.toggle('hidden', order.status === 'approved');
    }

    const btnReject = document.getElementById('vo-btn-reject-from-details');
    if (btnReject) {
        btnReject.onclick = () => {
            window.closeVisitorOrderDetailsModal();
            window.openVisitorOrderReject(order.id);
        };
        btnReject.classList.toggle('hidden', order.status === 'rejected');
    }

    const btnEdit = document.getElementById('vo-btn-edit-from-details');
    if (btnEdit) {
        btnEdit.onclick = () => {
            window.closeVisitorOrderDetailsModal();
            window.openVisitorOrderEdit(order.id);
        };
    }

    const btnAssign = document.getElementById('vo-btn-assign-from-details');
    if (btnAssign) {
        btnAssign.onclick = () => {
            window.closeVisitorOrderDetailsModal();
            window.openVisitorOrderAssign(order.id);
        };
    }

    const btnPrint = document.getElementById('vo-btn-print-from-details');
    if (btnPrint) {
        btnPrint.onclick = () => window.printVisitorOrder(order.id);
    }

    const modal = document.getElementById('vo-details-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
};

window.closeVisitorOrderDetailsModal = () => {
    const modal = document.getElementById('vo-details-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

// --- 2. نافذة تعديل طلب الزائر بالكامل ---
window.openVisitorOrderEdit = (orderId) => {
    const order = allVisitorOrders.find(o => o.id === orderId);
    if (!order) return;
    visitorOrderUnderAction = order;

    document.getElementById('vo-edit-code-badge').textContent = '#' + (order.order_code || '');
    document.getElementById('vo-edit-customer').value = order.customer_name || '';
    document.getElementById('vo-edit-phone').value = order.customer_phone_1 || '';
    document.getElementById('vo-edit-phone2').value = order.customer_phone_2 || '';
    document.getElementById('vo-edit-address').value = order.customer_address || '';
    document.getElementById('vo-edit-notes').value = order.notes || '';

    // استنساخ الأصناف للتعديل
    visitorOrderEditingItems = JSON.parse(JSON.stringify(order.items || []));
    renderVisitorOrderEditingItems();

    const modal = document.getElementById('vo-edit-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
};

window.closeVisitorOrderEditModal = () => {
    const modal = document.getElementById('vo-edit-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

// فلتر البحث السريع داخل أصناف طلب الزائر بالمعاينة
window.filterVoDetailsItems = (term) => {
    term = (term || '').toLowerCase().trim();
    const cards = document.querySelectorAll('.vo-detail-model-card');
    cards.forEach(card => {
        const modelText = (card.getAttribute('data-model-search') || '').toLowerCase();
        const rows = card.querySelectorAll('.vo-detail-color-row');
        let cardHasMatch = false;

        rows.forEach(row => {
            const rowText = (row.getAttribute('data-color-search') || '').toLowerCase();
            const matches = !term || modelText.includes(term) || rowText.includes(term);
            row.style.display = matches ? '' : 'none';
            if (matches) cardHasMatch = true;
        });

        card.style.display = cardHasMatch ? '' : 'none';
    });
};

function renderVisitorOrderEditingItems() {
    let container = document.getElementById('vo-edit-models-container');
    if (!container) {
        const oldTableBody = document.getElementById('vo-edit-items-body');
        if (oldTableBody) {
            const tableWrapper = oldTableBody.closest('.overflow-hidden') || oldTableBody.closest('table');
            if (tableWrapper && tableWrapper.parentNode) {
                container = document.createElement('div');
                container.id = 'vo-edit-models-container';
                container.className = 'space-y-3';
                tableWrapper.parentNode.replaceChild(container, tableWrapper);
            }
        }
    }
    if (!container) return;

    let totalSeries = 0;
    let totalAmount = 0;
    const uniqueModels = new Set();

    // تجميع الأصناف داخل كروت الموديلات مع الاحتفاظ بالفهرس الأصلي
    const modelGroupMap = new Map();
    const modelGroups = [];

    visitorOrderEditingItems.forEach((item, originalIndex) => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        const lineTotal = qty * price;
        const sizesCount = Number(item.sizes_count) || 1;
        const pieces = qty * sizesCount;
        const piecePrice = sizesCount > 0 ? Math.round(price / sizesCount) : price;

        totalSeries += qty;
        totalAmount += lineTotal;
        if (item.model_id) uniqueModels.add(item.model_id);

        const modelKey = item.model_id || item.model_name || 'unknown';
        if (!modelGroupMap.has(modelKey)) {
            const group = {
                modelKey,
                modelId: item.model_id,
                modelName: item.model_name || 'موديل',
                code: item.factory_code || '',
                imageUrl: item.image_url || item.image || './src/assets/icons/devo.png',
                sizesCount: sizesCount,
                seriesPrice: price,
                piecePrice: piecePrice,
                totalSeries: 0,
                totalPieces: 0,
                totalPrice: 0,
                items: []
            };
            modelGroupMap.set(modelKey, group);
            modelGroups.push(group);
        }

        const g = modelGroupMap.get(modelKey);
        g.totalSeries += qty;
        g.totalPieces += pieces;
        g.totalPrice += lineTotal;

        g.items.push({
            ...item,
            originalIndex,
            qty,
            price,
            lineTotal,
            pieces
        });
    });

    if (modelGroups.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center bg-devo-black/60 border border-devo-gray rounded-2xl">
                <i class="ph ph-trash text-3xl text-devo-muted mb-2 block"></i>
                <p class="text-devo-muted text-sm font-bold">تم حذف جميع الأصناف من الطلب.</p>
            </div>
        `;
    } else {
        container.innerHTML = modelGroups.map(group => `
            <div class="bg-devo-black/50 border border-devo-gray/70 hover:border-devo-orange/40 rounded-2xl p-4 transition-all shadow-sm">
                <!-- هيدر الموديل -->
                <div class="flex flex-wrap items-center justify-between gap-3 mb-3 pb-3 border-b border-devo-gray/60">
                    <div class="flex items-center gap-3">
                        <img src="${group.imageUrl}" alt="${escapeHtml(group.modelName)}" class="w-14 h-14 rounded-xl object-cover border border-devo-gray bg-devo-black shrink-0 shadow-sm" onerror="this.src='./src/assets/icons/devo.png'">
                        <div>
                            <div class="flex flex-wrap items-center gap-2">
                                <h4 class="text-white font-black text-sm sm:text-base">${escapeHtml(group.modelName)}</h4>
                                ${group.code ? `<span class="bg-devo-gray/70 border border-devo-gray text-devo-text px-2 py-0.5 rounded-lg text-xs font-mono font-bold">${escapeHtml(group.code)}</span>` : ''}
                                <span class="bg-devo-gray/70 border border-devo-gray text-devo-muted px-2 py-0.5 rounded-lg text-xs font-medium">${group.sizesCount} قطع</span>
                                <span class="bg-sky-500/15 border border-sky-500/30 text-sky-400 px-2 py-0.5 rounded-lg text-xs font-bold font-mono">ق: ${(group.piecePrice || 0).toLocaleString()} ج</span>
                                <span class="bg-amber-500/15 border border-amber-500/30 text-amber-400 px-2.5 py-0.5 rounded-lg text-xs font-bold font-mono">سيريه: ${(group.seriesPrice || 0).toLocaleString()} ج</span>
                            </div>
                            <div class="text-xs text-devo-muted flex items-center gap-1.5 mt-1.5 font-medium">
                                <i class="ph ph-palette text-devo-orange"></i>
                                <span>الألوان المحددة لهذا الموديل (${group.items.length}):</span>
                            </div>
                        </div>
                    </div>

                    <!-- زر حذف الموديل بالكامل -->
                    <button type="button" onclick="window.removeVisitorEditModel('${escapeHtml(group.modelKey)}')" class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-red-500/40 bg-red-500/10 text-red-400 hover:bg-red-500 hover:text-white transition-all text-xs font-bold cursor-pointer shadow-sm" title="حذف الموديل بجميع ألوانه">
                        <i class="ph ph-trash text-sm"></i>
                        <span>حذف الموديل</span>
                    </button>
                </div>

                <!-- صفوف ألوان الموديل -->
                <div class="space-y-2">
                    ${group.items.map(item => `
                        <div class="flex items-center justify-between p-2.5 sm:p-3 bg-devo-dark/60 border border-devo-gray/50 hover:border-devo-gray rounded-xl transition-colors">
                            <div class="flex items-center gap-2.5">
                                <span class="w-3.5 h-3.5 rounded-full shrink-0 border border-white/20 shadow-sm" style="background-color: ${item.color_code || '#38BDF8'}"></span>
                                <span class="text-white text-xs sm:text-sm font-bold">${escapeHtml(item.color_name || '')}</span>
                            </div>
                            <div class="flex items-center gap-3 sm:gap-4">
                                <!-- عداد الكميات -->
                                <div class="flex items-center bg-devo-black border border-devo-gray rounded-xl overflow-hidden h-8 w-26 sm:w-28 shadow-inner">
                                    <button type="button" onclick="window.changeVisitorEditItemQty(${item.originalIndex}, -1)" class="px-2 sm:px-2.5 text-devo-muted hover:text-white transition-colors h-full flex items-center justify-center cursor-pointer ${item.qty <= 1 ? 'opacity-40 cursor-not-allowed' : ''}"><i class="ph ph-minus text-xs"></i></button>
                                    <input type="text" inputmode="numeric" pattern="[0-9]*" onchange="window.updateVisitorEditItemQty(${item.originalIndex}, parseInt(this.value) || 1)" value="${item.qty}" class="w-10 sm:w-12 h-full bg-transparent text-center text-white text-xs font-bold outline-none border-x border-devo-gray leading-none font-mono">
                                    <button type="button" onclick="window.changeVisitorEditItemQty(${item.originalIndex}, 1)" class="px-2 sm:px-2.5 text-devo-muted hover:text-white transition-colors h-full flex items-center justify-center cursor-pointer"><i class="ph ph-plus text-xs"></i></button>
                                </div>

                                <!-- إجمالي السعر وعدد القطع -->
                                <div class="text-left min-w-[80px] sm:min-w-[100px]">
                                    <span class="text-devo-orange font-black font-mono text-xs sm:text-sm block">${(item.lineTotal || 0).toLocaleString()} ج.م</span>
                                    <span class="text-[10px] text-devo-muted font-normal block">(${item.pieces} قطعة)</span>
                                </div>

                                <!-- زر حذف اللون المنفرد -->
                                <button type="button" onclick="window.removeVisitorEditItem(${item.originalIndex})" class="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer" title="حذف هذا اللون"><i class="ph ph-trash text-base"></i></button>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <!-- فوتر إجمالي الموديل -->
                <div class="flex items-center justify-between pt-2.5 mt-2.5 border-t border-devo-gray/50 text-xs">
                    <span class="text-devo-muted font-bold">إجمالي الموديل: <span class="text-white font-bold">${group.totalSeries} سيريه</span> (${group.totalPieces} قطعة)</span>
                    <span class="text-devo-orange font-black font-mono text-sm sm:text-base">${group.totalPrice.toLocaleString()} ج.م</span>
                </div>
            </div>
        `).join('');
    }

    document.getElementById('vo-edit-total-models').textContent = uniqueModels.size || modelGroups.length;
    document.getElementById('vo-edit-total-series').textContent = totalSeries;
    document.getElementById('vo-edit-total-amount').textContent = totalAmount.toLocaleString() + ' ج.م';
}

window.removeVisitorEditModel = (modelKey) => {
    if (!modelKey) return;
    if (visitorOrderEditingItems.length <= 1) {
        showToast('يجب أن يحتوي الطلب على صنف واحد على الأقل!', 'warning');
        return;
    }
    visitorOrderEditingItems = visitorOrderEditingItems.filter(item => {
        const key = item.model_id || item.model_name || 'unknown';
        return key !== modelKey;
    });
    renderVisitorOrderEditingItems();
};

window.changeVisitorEditItemQty = (idx, delta) => {
    if (!visitorOrderEditingItems[idx]) return;
    let currentQty = Number(visitorOrderEditingItems[idx].qty) || 1;
    currentQty = Math.max(1, currentQty + delta);
    visitorOrderEditingItems[idx].qty = currentQty;
    renderVisitorOrderEditingItems();
};

window.updateVisitorEditItemQty = (idx, val) => {
    if (!visitorOrderEditingItems[idx]) return;
    const num = Math.max(1, parseInt(val, 10) || 1);
    visitorOrderEditingItems[idx].qty = num;
    renderVisitorOrderEditingItems();
};

window.removeVisitorEditItem = (idx) => {
    if (visitorOrderEditingItems.length <= 1) {
        showToast('يجب أن يحتوي الطلب على صنف واحد على الأقل!', 'warning');
        return;
    }
    visitorOrderEditingItems.splice(idx, 1);
    renderVisitorOrderEditingItems();
};

window.saveVisitorOrderEdits = async () => {
    if (!visitorOrderUnderAction) return;

    const custName = document.getElementById('vo-edit-customer').value.trim();
    const phone1 = document.getElementById('vo-edit-phone').value.trim();
    const phone2 = document.getElementById('vo-edit-phone2').value.trim();
    const addr = document.getElementById('vo-edit-address').value.trim();
    const notes = document.getElementById('vo-edit-notes').value.trim();

    if (!custName) {
        showToast('يرجى إدخال اسم العميل / المحل', 'error');
        return;
    }
    if (!phone1) {
        showToast('يرجى إدخال رقم الهاتف الأساسي', 'error');
        return;
    }
    if (!addr) {
        showToast('يرجى إدخال العنوان بالتفصيل', 'error');
        return;
    }
    if (!visitorOrderEditingItems || visitorOrderEditingItems.length === 0) {
        showToast('يجب أن يحتوي الطلب على أصناف!', 'error');
        return;
    }

    let totalSeries = 0;
    let totalAmount = 0;
    const uniqueModels = new Set();
    visitorOrderEditingItems.forEach(item => {
        const qty = Number(item.qty) || 0;
        const price = Number(item.price) || 0;
        totalSeries += qty;
        totalAmount += qty * price;
        if (item.model_id) uniqueModels.add(item.model_id);
    });

    try {
        const { error } = await supabase
            .from('visitor_orders')
            .update({
                customer_name: custName,
                customer_phone_1: phone1,
                customer_phone_2: phone2 || null,
                customer_address: addr,
                notes: notes || null,
                items: visitorOrderEditingItems,
                total_series: totalSeries,
                total_models: uniqueModels.size,
                total_amount: totalAmount,
                updated_at: new Date().toISOString()
            })
            .eq('id', visitorOrderUnderAction.id);

        if (error) throw error;

        // تحديث العنصر محلياً
        const target = allVisitorOrders.find(o => o.id === visitorOrderUnderAction.id);
        if (target) {
            target.customer_name = custName;
            target.customer_phone_1 = phone1;
            target.customer_phone_2 = phone2 || null;
            target.customer_address = addr;
            target.notes = notes || null;
            target.items = visitorOrderEditingItems;
            target.total_series = totalSeries;
            target.total_models = uniqueModels.size;
            target.total_amount = totalAmount;
        }

        renderVisitorOrders();
        window.closeVisitorOrderEditModal();
        showToast('تم حفظ تعديلات الطلب بنجاح ✅', 'success');

    } catch (err) {
        console.error('Error saving visitor order edits:', err);
        showToast('حدث خطأ أثناء حفظ التعديلات: ' + (err.message || ''), 'error');
    }
};

// --- 3. نافذة إسناد الطلب لعامل مبيعات ---
window.openVisitorOrderAssign = async (orderId) => {
    const order = allVisitorOrders.find(o => o.id === orderId);
    if (!order) return;
    visitorOrderUnderAction = order;

    document.getElementById('vo-assign-code-badge').textContent = '#' + (order.order_code || '');

    const select = document.getElementById('vo-assign-worker-select');
    if (select) {
        select.innerHTML = '<option value="">جاري تحميل الموظفين...</option>';

        try {
            const currentTenantId = getCurrentTenantId();
            let query = supabase
                .from('system_users')
                .select('id, full_name, role')
                .order('full_name');

            if (currentTenantId) {
                query = query.eq('tenant_id', currentTenantId);
            }

            const { data: users, error } = await query;
            if (!error && users) {
                select.innerHTML = '<option value="">-- اختر من قائمة الموظفين --</option>' + users.map(u => `
                    <option value="${u.id}" ${u.id === order.assigned_worker_id ? 'selected' : ''}>
                        ${escapeHtml(u.full_name || '')} (${u.role === 'sales' ? 'بائع' : (u.role === 'admin' ? 'مدير' : u.role)})
                    </option>
                `).join('');
            } else {
                select.innerHTML = '<option value="">تعذر جلب قائمة الموظفين</option>';
            }
        } catch (e) {
            console.error('Error fetching workers for assign:', e);
            select.innerHTML = '<option value="">تعذر جلب قائمة الموظفين</option>';
        }
    }

    const modal = document.getElementById('vo-assign-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
};

window.closeVisitorOrderAssignModal = () => {
    const modal = document.getElementById('vo-assign-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

window.confirmVisitorOrderAssign = async () => {
    if (!visitorOrderUnderAction) return;

    const workerId = document.getElementById('vo-assign-worker-select').value;
    if (!workerId) {
        showToast('يرجى اختيار الموظف أولاً', 'warning');
        return;
    }

    try {
        const { error } = await supabase.rpc('assign_visitor_order', {
            p_visitor_order_id: visitorOrderUnderAction.id,
            p_worker_id: workerId,
            p_admin_id: currentUserProfile?.id || null
        });

        if (error) throw error;

        // تحديث محلي
        const target = allVisitorOrders.find(o => o.id === visitorOrderUnderAction.id);
        if (target) {
            target.assigned_worker_id = workerId;
        }

        window.closeVisitorOrderAssignModal();
        showToast('تم إسناد الطلب للموظف بنجاح ✅', 'success');

    } catch (err) {
        console.error('Error assigning visitor order:', err);
        showToast('تعذر إسناد الطلب: ' + (err.message || ''), 'error');
    }
};

// --- 4. نافذة رفض الطلب مع إدخال السبب ---
window.openVisitorOrderReject = (orderId) => {
    const order = allVisitorOrders.find(o => o.id === orderId);
    if (!order) return;
    visitorOrderUnderAction = order;

    document.getElementById('vo-reject-code-badge').textContent = '#' + (order.order_code || '');
    document.getElementById('vo-reject-reason-input').value = order.rejection_reason || '';

    const modal = document.getElementById('vo-reject-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
};

window.closeVisitorOrderRejectModal = () => {
    const modal = document.getElementById('vo-reject-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

window.confirmVisitorOrderReject = async () => {
    if (!visitorOrderUnderAction) return;

    const reason = document.getElementById('vo-reject-reason-input').value.trim();
    if (!reason) {
        showToast('يرجى كتابة سبب الرفض ليظهر للعميل', 'warning');
        return;
    }

    try {
        const { error } = await supabase.rpc('reject_visitor_order', {
            p_visitor_order_id: visitorOrderUnderAction.id,
            p_reason: reason,
            p_admin_id: currentUserProfile?.id || null
        });

        if (error) throw error;

        const target = allVisitorOrders.find(o => o.id === visitorOrderUnderAction.id);
        if (target) {
            target.status = 'rejected';
            target.rejection_reason = reason;
        }

        updateVisitorOrderBadges();
        renderVisitorOrders();
        window.closeVisitorOrderRejectModal();
        showToast('تم رفض الطلب بنجاح وتسجيل السبب للعميل', 'info');

    } catch (err) {
        console.error('Error rejecting visitor order:', err);
        showToast('تعذر رفض الطلب: ' + (err.message || ''), 'error');
    }
};

// --- 5. اعتماد الطلب فورياً مع فحص المخزون والخصم والتحويل لأوردر نشط ---
window.approveVisitorOrder = async (orderId) => {
    const order = allVisitorOrders.find(o => o.id === orderId);
    if (!order) return;

    const confirmed = await confirmDialog({
        title: 'تأكيد اعتماد الطلب',
        message: `هل أنت متأكد من اعتماد طلب الزائر رقم (${order.order_code})؟ سيتم فحص المخزون فورياً، وخصم السريات من المستودع، وإنشاء أوردر نشط في قائمة الأوردرات الرسمية.`,
        confirmText: 'نعم، اعتماد وتنفيذ فوراً'
    });

    if (!confirmed) return;

    showToast('جاري فحص المخزون واعتماد الطلب...', 'info');

    try {
        const { data, error } = await supabase.rpc('approve_visitor_order', {
            p_visitor_order_id: orderId,
            p_admin_id: currentUserProfile?.id || null
        });

        if (error) {
            // فحص إذا كان الخطأ بسبب عجز في المخزون
            const errMsg = error.message || '';
            if (errMsg.includes('عجز في المخزون') || errMsg.includes('نقص')) {
                openVisitorOrderShortageModal(order, errMsg);
                return;
            }
            throw error;
        }

        if (data && data.success) {
            order.status = 'approved';
            order.converted_order_id = data.order_id;

            updateVisitorOrderBadges();
            renderVisitorOrders();
            window.closeVisitorOrderDetailsModal();

            // تحديث جدول الأوردرات النشطة أيضاً لظهور الأوردر الجديد فورياً
            await fetchAdminOrders();

            showToast(`تم اعتماد الطلب بنجاح! رقم الفاتورة الجديد: #${data.invoice_number} 🎉`, 'success');
        }

    } catch (err) {
        console.error('Error approving visitor order:', err);
        showToast('تعذر اعتماد الطلب: ' + (err.message || ''), 'error');
    }
};

// --- نافذة عجز المخزون ---
function openVisitorOrderShortageModal(order, errorMsg) {
    const itemsBody = document.getElementById('vo-shortage-items-body');
    const items = Array.isArray(order.items) ? order.items : [];

    if (itemsBody) {
        itemsBody.innerHTML = items.map(item => `
            <tr>
                <td class="p-3 font-bold text-white">${escapeHtml(item.model_name || '')} (${escapeHtml(item.factory_code || '')})</td>
                <td class="p-3 text-white">${escapeHtml(item.color_name || '')}</td>
                <td class="p-3 text-center font-bold text-amber-400 font-mono">${item.qty || 0}</td>
                <td class="p-3 text-center font-mono text-devo-muted">غير كافٍ</td>
                <td class="p-3 text-center font-black text-rose-400 font-mono">عجز</td>
            </tr>
        `).join('');
    }

    const editBtn = document.getElementById('vo-btn-edit-from-shortage');
    if (editBtn) {
        editBtn.onclick = () => {
            window.closeVisitorOrderShortageModal();
            window.openVisitorOrderEdit(order.id);
        };
    }

    const modal = document.getElementById('vo-shortage-modal');
    if (modal) {
        modal.classList.remove('hidden');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
}

window.closeVisitorOrderShortageModal = () => {
    const modal = document.getElementById('vo-shortage-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => modal.classList.add('hidden'), 300);
    }
};

// --- 6. حذف طلب الزائر ---
window.deleteVisitorOrder = async (orderId) => {
    const confirmed = await confirmDialog({
        title: 'حذف طلب الزائر',
        message: 'هل أنت متأكد من رغبتك في حذف هذا الطلب؟ سيختفي نهائياً ولن يتمكن الزائر من تتبعه.',
        confirmText: 'حذف نهائي'
    });

    if (!confirmed) return;

    try {
        const { error } = await supabase
            .from('visitor_orders')
            .update({ is_deleted: true, updated_at: new Date().toISOString() })
            .eq('id', orderId);

        if (error) throw error;

        allVisitorOrders = allVisitorOrders.filter(o => o.id !== orderId);
        updateVisitorOrderBadges();
        renderVisitorOrders();
        window.closeVisitorOrderDetailsModal();
        showToast('تم حذف الطلب بنجاح', 'success');

    } catch (err) {
        console.error('Error deleting visitor order:', err);
        showToast('تعذر حذف الطلب: ' + (err.message || ''), 'error');
    }
};

// --- 7. طباعة فاتورة طلب الزائر ---
window.printVisitorOrder = (orderId) => {
    const order = allVisitorOrders.find(o => o.id === orderId);
    if (!order) return showToast('الطلب غير موجود', 'error');

    const items = Array.isArray(order.items) ? order.items : [];

    const printable = {
        id: order.id,
        tenant_id: order.tenant_id,
        invoice_number: order.order_code,
        customer_name: order.customer_name,
        phone_1: order.customer_phone_1,
        phone_2: order.customer_phone_2,
        address: order.customer_address,
        notes: order.notes,
        created_at: order.created_at,
        total_price: order.total_amount,
        deposit: 0,
        remaining: order.total_amount,
        order_items: items.map(i => {
            const sizesCount = Number(i.sizes_count) || 1;
            const qty = Number(i.qty) || 0;
            const piecePrice = Math.round(Number(i.piece_price != null ? i.piece_price : (i.price || 0)));
            const pieces = Number(i.pieces || i.total_pieces) || (qty * sizesCount);
            const totalPrice = Math.round(Number(i.total_price || i.total) || (pieces * piecePrice));
            return {
                model_id: i.model_id || i.modelId || `${i.model_name || 'm'}_${i.factory_code || ''}`,
                quantity: qty,
                sizes_count: sizesCount,
                pieces: pieces,
                price: piecePrice,
                piece_price: piecePrice,
                price_per_series: piecePrice * sizesCount,
                total_price: totalPrice,
                models: { 
                    id: i.model_id || i.modelId, 
                    name: i.model_name, 
                    factory_code: i.factory_code, 
                    system_code: i.factory_code,
                    model_sizes: { length: sizesCount }
                },
                colors: { name: i.color_name }
            };
        })
    };

    printOrderCustomerInvoice(printable);
};