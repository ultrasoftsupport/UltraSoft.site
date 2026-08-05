import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog, showSubscriptionUpgradeModal } from '../../components/modal.js';
import { getCurrentTenantId, getTenantUserQuotaDetails } from '../../services/tenant_service.js';

let isInitialized = false;
let allUsers = [];

export async function initUsersView() {
    if (isInitialized) return;

    document.getElementById('user-form')?.addEventListener('submit', handleSaveUser);
    
    ['user-search', 'user-filter-role', 'user-filter-status'].forEach(id => {
        document.getElementById(id)?.addEventListener('input', applyUserFilters);
    });

    // u-role and job logic are merged, no extra listener needed

    await loadUsers();
    isInitialized = true;
}

// --- Data Fetching ---
export async function loadUsers() {
    const container = document.getElementById('users-container');
    container.innerHTML = `<div class="col-span-full py-10 text-center"><i class="ph ph-spinner animate-spin text-3xl text-devo-orange"></i></div>`;

    const currentTenantId = getCurrentTenantId();

    let query = supabase
        .from('system_users')
        .select('*');

    if (currentTenantId) {
        query = query.eq('tenant_id', currentTenantId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });

    if (error) return showToast('خطأ في تحميل بيانات المستخدمين', 'error');

    allUsers = data || [];
    await updateUserStatistics();
    applyUserFilters();
}

async function updateUserStatistics() {
    let owners = 0, admins = 0, workers = 0;
    
    allUsers.forEach(u => {
        if (u.role === 'owner') owners++;
        else if (u.role === 'admin') admins++;
        else if (u.role === 'worker') workers++;
    });

    const totalEl = document.getElementById('u-stat-total');
    if (totalEl) totalEl.textContent = allUsers.length;
    const ownersEl = document.getElementById('u-stat-owners');
    if (ownersEl) ownersEl.textContent = owners;
    const adminsEl = document.getElementById('u-stat-admins');
    if (adminsEl) adminsEl.textContent = admins;
    const workersEl = document.getElementById('u-stat-workers');
    if (workersEl) workersEl.textContent = workers;

    const quotaDetails = await getTenantUserQuotaDetails();
    const quotaTextEl = document.getElementById('u-stat-quota-text');
    const quotaRemEl = document.getElementById('u-stat-quota-rem');

    if (quotaTextEl) {
        if (quotaDetails.isUnlimited) {
            quotaTextEl.textContent = `${quotaDetails.totalUsers} / غير محدود`;
            if (quotaRemEl) quotaRemEl.textContent = 'باقة مفتوحة';
        } else {
            quotaTextEl.textContent = `${quotaDetails.maxUsers} / ${quotaDetails.totalUsers}`;
            if (quotaRemEl) quotaRemEl.textContent = `متبقي ${quotaDetails.remainingTotal} مستخدم`;
        }
    }
}

// --- Filtering & Rendering ---
function applyUserFilters() {
    const term = document.getElementById('user-search').value.toLowerCase();
    const role = document.getElementById('user-filter-role').value;
    const status = document.getElementById('user-filter-status').value;

    const filtered = allUsers.filter(u => {
        let isMatch = true;
        if (term && !u.full_name.toLowerCase().includes(term) && !u.username.toLowerCase().includes(term)) isMatch = false;
        if (role && u.role !== role) isMatch = false;
        if (status === 'active' && !u.is_active) isMatch = false;
        if (status === 'inactive' && u.is_active) isMatch = false;
        return isMatch;
    });

    renderUsersGrid(filtered);
}

function renderUsersGrid(users) {
    const container = document.getElementById('users-container');
    if (users.length === 0) {
        container.innerHTML = `<div class="col-span-full py-10 text-center text-devo-muted">لا يوجد مستخدمين يطابقون البحث</div>`;
        return;
    }

    container.innerHTML = users.map(u => {
        let roleIcon, roleName, roleColor;
        if (u.role === 'owner') { roleIcon = 'ph-shield-check'; roleName = 'مالك (Owner)'; roleColor = 'text-devo-orange'; }
        else if (u.role === 'admin') { roleIcon = 'ph-wrench'; roleName = 'مشرف (Admin)'; roleColor = 'text-devo-info'; }
        else {
            roleIcon = 'ph-hard-hat';
            roleColor = 'text-devo-success';
            let jobText = 'عامل (مبيعات)';
            if (u.worker_job === 'warehouse') jobText = 'عامل (مخزن)';
            else if (u.worker_job === 'both') jobText = 'عامل (مبيعات + مخزن)';
            roleName = jobText;
        }

        const isOwner = u.role === 'owner';
        const cardClass = !u.is_active ? 'opacity-70 grayscale' : '';

        // زر الحذف (محمي للأونر)
        const deleteBtn = isOwner 
            ? `<button disabled class="col-span-1 py-1.5 bg-devo-gray/20 text-devo-muted rounded text-xs cursor-not-allowed flex items-center justify-center gap-1" title="لا يمكن حذف المالك"><i class="ph ph-lock"></i></button>`
            : `<button onclick="handleDeleteUser('${u.id}')" class="col-span-1 py-1.5 bg-devo-error/10 hover:bg-devo-error text-devo-error hover:text-white rounded text-xs transition-colors flex items-center justify-center gap-1" title="حذف الحساب"><i class="ph ph-trash"></i></button>`;

        return `
        <div class="bg-devo-dark border border-devo-gray rounded-xl p-4 flex flex-col gap-3 transition-all hover:border-devo-grayHover ${cardClass}">
            <div class="flex justify-between items-start">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 rounded-full bg-devo-black border border-devo-gray flex items-center justify-center ${roleColor}">
                        <i class="ph ${roleIcon} text-2xl"></i>
                    </div>
                    <div>
                        <h4 class="text-white font-bold text-sm truncate w-28" title="${u.full_name}">${u.full_name}</h4>
                        <p class="text-devo-muted text-xs dir-ltr text-left mt-0.5">@${u.username}</p>
                    </div>
                </div>
                ${u.is_active ? `<span class="w-2.5 h-2.5 rounded-full bg-devo-success shadow-[0_0_8px_rgba(16,185,129,0.6)]" title="نشط"></span>` : `<span class="w-2.5 h-2.5 rounded-full bg-devo-error" title="معطل"></span>`}
            </div>
            
            <div class="bg-devo-black rounded-lg p-2 flex justify-center border border-devo-gray text-xs font-bold ${roleColor}">
                ${roleName}
            </div>

            <div class="grid grid-cols-3 gap-2 mt-auto pt-2 border-t border-devo-gray">
                <button onclick="viewUserDetails('${u.id}')" class="col-span-1 py-1.5 bg-devo-black hover:bg-devo-gray text-white border border-devo-gray rounded text-xs transition-colors flex items-center justify-center gap-1" title="عرض التفاصيل"><i class="ph ph-eye"></i></button>
                <button onclick="openUserModal('${u.id}')" class="col-span-1 py-1.5 bg-devo-info/10 hover:bg-devo-info text-devo-info hover:text-white rounded text-xs transition-colors flex items-center justify-center gap-1" title="تعديل الحساب"><i class="ph ph-pencil"></i></button>
                ${deleteBtn}
            </div>
        </div>`;
    }).join('');
}

// --- View User Details Logic (الكود الجديد) ---
window.viewUserDetails = (id) => {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    let roleName, roleColor;
    if (user.role === 'owner') { roleName = 'مالك (Owner)'; roleColor = 'text-devo-orange'; }
    else if (user.role === 'admin') { roleName = 'مشرف (Admin)'; roleColor = 'text-devo-info'; }
    else { roleName = 'عامل (Worker)'; roleColor = 'text-devo-success'; }

    const content = document.getElementById('user-details-content');
    
    // تصميم محتوى النافذة المنبثقة
    content.innerHTML = `
        <div class="flex items-center gap-4 mb-4">
            <div class="w-16 h-16 rounded-full bg-devo-black border border-devo-gray flex items-center justify-center text-2xl font-bold ${roleColor}">
                ${user.full_name.substring(0, 2).toUpperCase()}
            </div>
            <div>
                <h4 class="text-white font-bold text-lg">${user.full_name}</h4>
                <p class="text-devo-muted font-mono mt-1">@${user.username}</p>
            </div>
        </div>

        <div class="bg-devo-black/50 rounded-xl border border-devo-gray overflow-hidden">
            <table class="w-full text-right text-sm">
                <tbody class="divide-y divide-devo-gray">
                    <tr><td class="p-3 text-devo-muted w-1/3">الصلاحية</td><td class="p-3 font-bold ${roleColor}">${roleName}</td></tr>
                    ${user.role === 'worker' ? `
                    <tr>
                        <td class="p-3 text-devo-muted">وظيفة العامل</td>
                        <td class="p-3 text-white font-bold">
                            ${user.worker_job === 'warehouse' ? 'عامل بالمخزن' : (user.worker_job === 'both' ? 'بائع بالمعرض وعامل بالمخزن معاً' : 'بائع بالمعرض')}
                        </td>
                    </tr>` : ''}
                    <tr><td class="p-3 text-devo-muted">حالة الحساب</td><td class="p-3 ${user.is_active ? 'text-devo-success' : 'text-devo-error'} font-bold">${user.is_active ? 'نشط' : 'معطل'}</td></tr>
                    <tr><td class="p-3 text-devo-muted">تاريخ الإنشاء</td><td class="p-3 text-white">${new Date(user.created_at).toLocaleDateString('ar-EG')}</td></tr>
                </tbody>
            </table>
        </div>

        <h4 class="text-devo-orange font-bold text-sm border-b border-devo-gray pb-2"><i class="ph ph-chart-bar"></i> إحصائيات النشاط</h4>
        <div class="grid grid-cols-2 gap-4">
            <div class="bg-devo-black border border-devo-gray p-4 rounded-xl text-center flex flex-col gap-1 shadow-sm">
                <i class="ph ph-sign-in text-2xl text-devo-info mb-1"></i>
                <span class="text-devo-muted text-xs">مرات الدخول</span>
                <span class="text-2xl font-bold text-white">${user.login_count || 0}</span>
            </div>
            <div class="bg-devo-black border border-devo-gray p-4 rounded-xl text-center flex flex-col gap-1 shadow-sm">
                <i class="ph ph-receipt text-2xl text-devo-success mb-1"></i>
                <span class="text-devo-muted text-xs">الفواتير المنشأة</span>
                <span class="text-2xl font-bold text-white">${user.invoice_count || 0}</span>
            </div>
        </div>
    `;

    const modal = document.getElementById('view-user-details-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.closeUserDetailsModal = () => {
    const modal = document.getElementById('view-user-details-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

// --- Create & Edit Logic ---
window.openUserModal = async (id = null) => {
    if (!id) {
        const quotaDetails = await getTenantUserQuotaDetails();
        if (!quotaDetails.isUnlimited && quotaDetails.totalUsers >= quotaDetails.maxUsers) {
            showSubscriptionUpgradeModal({
                quotaType: 'users',
                limit: quotaDetails.maxUsers,
                title: '⚠️ وصول للحد الأقصى لحسابات فريق العمل',
                message: `تعذر إضافة مستخدم جديد: لقد وصلت إلى الحد الأقصى للمستخدمين المتاحين في باقتك الحالية (${quotaDetails.maxUsers} مستخدم).`
            });
            return;
        }
    }

    const form = document.getElementById('user-form');
    form.reset();
    document.getElementById('u-id').value = id || '';
    
    const title = document.getElementById('user-modal-title');
    const passReq = document.getElementById('u-pass-req');
    const passHint = document.getElementById('u-pass-hint');
    const passInput = document.getElementById('u-password');
    const roleSelect = document.getElementById('u-role');

    if (id) {
        const user = allUsers.find(u => u.id === id);
        if (!user) return;

        title.innerHTML = `<i class="ph ph-pencil-simple text-devo-orange text-xl"></i> تعديل بيانات المستخدم`;
        document.getElementById('u-name').value = user.full_name;
        document.getElementById('u-username').value = user.username;
        roleSelect.value = user.role;
        document.getElementById('u-status').checked = user.is_active;

        passInput.required = false;
        passReq.classList.add('hidden');
        passHint.classList.remove('hidden');

        if(user.role === 'owner') {
            roleSelect.innerHTML = `<option value="owner">مالك (صلاحيات كاملة)</option>`;
            roleSelect.disabled = true;
        } else {
            roleSelect.disabled = false;
            roleSelect.innerHTML = `
                <option value="worker_showroom">بائع بالمعرض (مبيعات فقط)</option>
                <option value="worker_warehouse">عامل بالمخزن (مخازن فقط)</option>
                <option value="worker_both">بائع بالمعرض وعامل بالمخزن معاً</option>
                <option value="admin">مشرف (إدارة جزئية)</option>
            `;
            let roleVal = user.role;
            if (user.role === 'worker') {
                roleVal = `worker_${user.worker_job || 'showroom'}`;
            }
            roleSelect.value = roleVal;
        }

    } else {
        title.innerHTML = `<i class="ph ph-user-plus text-devo-orange text-xl"></i> إضافة مستخدم جديد`;
        document.getElementById('u-status').checked = true;
        roleSelect.disabled = false;
        
        roleSelect.innerHTML = `
            <option value="worker_showroom">بائع بالمعرض (مبيعات فقط)</option>
            <option value="worker_warehouse">عامل بالمخزن (مخازن فقط)</option>
            <option value="worker_both">بائع بالمعرض وعامل بالمخزن معاً</option>
            <option value="admin">مشرف (إدارة جزئية)</option>
        `;
        roleSelect.value = 'worker_showroom';
        
        passInput.required = true;
        passReq.classList.remove('hidden');
        passHint.classList.add('hidden');
    }

    const modal = document.getElementById('user-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.closeUserModal = () => {
    const modal = document.getElementById('user-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

async function handleSaveUser(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;
    
    const id = document.getElementById('u-id').value;
    const password = document.getElementById('u-password').value;

    const selectedRole = document.getElementById('u-role').value;
    let role = selectedRole;
    let worker_job = null;

    if (selectedRole.startsWith('worker_')) {
        role = 'worker';
        worker_job = selectedRole.replace('worker_', '');
    }

    const userData = {
        full_name: document.getElementById('u-name').value.trim(),
        username: document.getElementById('u-username').value.trim().toLowerCase(),
        role: role,
        worker_job: worker_job,
        is_active: document.getElementById('u-status').checked
    };

    if (!id) {
        const quotaDetails = await getTenantUserQuotaDetails();
        if (!quotaDetails.isUnlimited && quotaDetails.totalUsers >= quotaDetails.maxUsers) {
            showSubscriptionUpgradeModal({
                quotaType: 'users',
                limit: quotaDetails.maxUsers,
                title: '⚠️ وصول للحد الأقصى لحسابات فريق العمل',
                message: `تعذر إضافة مستخدم جديد: لقد وصلت بالفعل إلى الحد الأقصى المسموح به لعدد مستخدمي فريق العمل في باقتك الحالية (${quotaDetails.maxUsers} مستخدم).`
            });
            return;
        }
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري الحفظ...`;

    try {
        if (id) {
            // استدعاء دالة التحديث الآمنة من قاعدة البيانات
            const { error } = await supabase.rpc('admin_update_worker', {
                p_user_id: id,
                p_full_name: userData.full_name,
                p_username: userData.username,
                p_password: password || '', // تمرير فارغ إذا لم يتم تغيير كلمة المرور
                p_role: userData.role,
                p_worker_job: userData.worker_job,
                p_is_active: userData.is_active
            });
            if (error) throw error;
            showToast('تم تحديث بيانات المستخدم بنجاح', 'success');
        } else {
            // استدعاء دالة الإنشاء الآمنة من قاعدة البيانات
            const { error } = await supabase.rpc('admin_create_worker', {
                p_full_name: userData.full_name,
                p_username: userData.username,
                p_password: password,
                p_role: userData.role,
                p_worker_job: userData.worker_job
            });
            if (error) throw error;
            showToast('تم إنشاء المستخدم بنجاح', 'success');
        }

        closeUserModal();
        loadUsers();
    } catch (err) {
        if (err.message && err.message.includes('SUBSCRIPTION_LIMIT_EXCEEDED')) {
            const match = err.message.match(/\d+/);
            showSubscriptionUpgradeModal({
                quotaType: 'users',
                limit: match ? match[0] : 'المحدد',
                title: '⚠️ وصول للحد الأقصى لحسابات فريق العمل',
                message: `تعذر إضافة مستخدم جديد: تجاوز الحد المسموح به لحسابات فريق العمل بالباقة.`
            });
        } else if (err.code === '23505' || err.message?.includes('duplicate key')) {
            showToast('اسم المستخدم هذا مستخدم بالفعل، يرجى اختيار اسم آخر', 'error');
        } else {
            showToast(err.message || 'حدث خطأ أثناء حفظ البيانات', 'error');
        }
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

// --- Delete Logic ---
window.handleDeleteUser = async (id) => {
    const user = allUsers.find(u => u.id === id);
    if (!user) return;

    if (user.role === 'owner') {
        return showToast('غير مسموح بحذف حساب المالك', 'error');
    }

    const confirmed = await confirmDialog({ 
        title: 'حذف مستخدم', 
        message: `هل أنت متأكد من حذف المستخدم (${user.full_name}) نهائياً؟`, 
        isDestructive: true 
        });

    if (confirmed) {
        try {
            // استدعاء دالة الحذف الآمنة من قاعدة البيانات
            const { error } = await supabase.rpc('admin_delete_worker', {
                p_user_id: id
            });
            if (error) throw error;
            showToast('تم حذف المستخدم بنجاح');
            loadUsers();
        } catch(err) {
            showToast(err.message || 'حدث خطأ أثناء الحذف', 'error');
        }
    }
};