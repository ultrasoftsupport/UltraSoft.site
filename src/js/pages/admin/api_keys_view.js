import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { getCurrentTenantId } from '../../services/tenant_service.js';
import { logAuditEvent } from '../../services/audit_service.js';

let isInitialized = false;
let allApiKeys = [];

export async function initApiKeysView() {
    if (!isInitialized) {
        document.getElementById('create-api-key-form')?.addEventListener('submit', handleCreateApiKeySubmit);
        isInitialized = true;
    }

    renderProjectApiBaseUrl();
    await loadApiKeys();
}

function renderProjectApiBaseUrl() {
    const baseUrlEl = document.getElementById('api-project-base-url');
    if (baseUrlEl && supabase.supabaseUrl) {
        baseUrlEl.textContent = `${supabase.supabaseUrl}/rest/v1/rpc/`;
    }
}

export async function loadApiKeys() {
    const tableBody = document.getElementById('api-keys-table-body');
    const emptyState = document.getElementById('api-keys-empty-state');
    if (!tableBody) return;

    tableBody.innerHTML = `<tr><td colspan="6" class="p-8 text-center text-devo-muted"><i class="ph ph-spinner animate-spin text-2xl text-cyan-400"></i> جاري تحميل مفاتيح الربط...</td></tr>`;

    const tenantId = getCurrentTenantId();
    let query = supabase.from('tenant_api_keys').select('*').order('created_at', { ascending: false });
    if (tenantId) {
        query = query.eq('tenant_id', tenantId);
    }

    const { data, error } = await query;

    if (error) {
        console.error('Error fetching API keys:', error);
        tableBody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-rose-400 text-xs">تعذر جلب مفاتيح الربط (تأكد من تشغيل الترحيل v100 في قاعدة البيانات).</td></tr>`;
        return;
    }

    allApiKeys = data || [];

    if (allApiKeys.length === 0) {
        tableBody.innerHTML = '';
        if (emptyState) emptyState.classList.remove('hidden');
        return;
    }

    if (emptyState) emptyState.classList.add('hidden');

    tableBody.innerHTML = allApiKeys.map((key, index) => {
        const perms = Array.isArray(key.permissions) ? key.permissions : [];
        const permsBadges = perms.map(p => {
            const labels = {
                'models:read': 'الموديلات',
                'stock:read': 'المخزون',
                'orders:read': 'الفواتير',
                'orders:create': 'إنشاء أوردر'
            };
            return `<span class="px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/30 text-cyan-400 text-[10px] font-mono">${labels[p] || p}</span>`;
        }).join(' ');

        const lastUsed = key.last_used_at ? new Date(key.last_used_at).toLocaleDateString('ar-EG', { hour: '2-digit', minute: '2-digit' }) : 'لم يُستخدم بعد';

        return `
            <tr class="hover:bg-devo-black/50 transition-colors border-b border-devo-gray/50 text-xs">
                <td class="p-3.5 text-center text-devo-muted font-mono">${index + 1}</td>
                <td class="p-3.5 font-bold text-white">
                    <div class="flex items-center gap-2">
                        <i class="ph ph-key text-cyan-400 text-base"></i>
                        <span>${key.key_name}</span>
                    </div>
                </td>
                <td class="p-3.5 font-mono text-cyan-300 dir-ltr text-left">
                    <span class="bg-devo-black border border-devo-gray px-2 py-1 rounded select-all">${key.key_prefix}••••••••</span>
                </td>
                <td class="p-3.5">
                    <div class="flex flex-wrap gap-1">${permsBadges}</div>
                </td>
                <td class="p-3.5 text-devo-muted">${lastUsed}</td>
                <td class="p-3.5 text-center">
                    <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold ${key.is_active ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/30' : 'bg-rose-500/15 text-rose-400 border border-rose-500/30'}">
                        <span class="w-1.5 h-1.5 rounded-full ${key.is_active ? 'bg-emerald-400' : 'bg-rose-400'}"></span>
                        ${key.is_active ? 'نشط' : 'معطل'}
                    </span>
                </td>
                <td class="p-3.5">
                    <div class="flex justify-center gap-1.5">
                        <button onclick="window.toggleApiKeyStatus('${key.id}', ${!key.is_active})" class="p-1.5 rounded-lg border border-devo-gray hover:border-amber-500/50 text-devo-muted hover:text-amber-400 transition-colors" title="${key.is_active ? 'تعطيل المفتاح' : 'تفعيل المفتاح'}">
                            <i class="ph ${key.is_active ? 'ph-pause-circle' : 'ph-play-circle'} text-base"></i>
                        </button>
                        <button onclick="window.handleDeleteApiKey('${key.id}')" class="p-1.5 rounded-lg border border-devo-gray hover:border-rose-500/50 text-devo-muted hover:text-rose-400 transition-colors" title="حذف نهائي">
                            <i class="ph ph-trash text-base"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

// دالة توليد مفتاح عشوائي مشفر
async function generateSecureApiKey() {
    const array = new Uint8Array(24);
    window.crypto.getRandomValues(array);
    const randomHex = Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    const fullKey = `us_live_${randomHex}`;

    // حساب الـ SHA-256 Hash
    const encoder = new TextEncoder();
    const data = encoder.encode(fullKey);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
        plainKey: fullKey,
        prefix: fullKey.slice(0, 15),
        hash: hashHex
    };
}

window.openCreateApiKeyModal = () => {
    const modal = document.getElementById('create-api-key-modal');
    const form = document.getElementById('create-api-key-form');
    if (form) form.reset();
    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
};

window.closeCreateApiKeyModal = () => {
    const modal = document.getElementById('create-api-key-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }, 200);
    }
};

async function handleCreateApiKeySubmit(e) {
    e.preventDefault();
    const btn = document.getElementById('btn-save-api-key');
    const originalText = btn.innerHTML;
    const nameInput = document.getElementById('api-key-name');
    const name = nameInput?.value.trim();

    if (!name) {
        showToast('يرجى كتابة اسم للمفتاح', 'warning');
        return;
    }

    // جمع الصلاحيات المحددة
    const permissions = Array.from(document.querySelectorAll('input[name="api-perm-cb"]:checked')).map(cb => cb.value);
    if (permissions.length === 0) {
        showToast('يرجى اختيار صلاحية واحدة على الأقل', 'warning');
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري التوليد...`;

    try {
        const tenantId = getCurrentTenantId();
        if (!tenantId) throw new Error('تعذر تحديد المصنع الحالي');

        const { plainKey, prefix, hash } = await generateSecureApiKey();

        const { error } = await supabase.from('tenant_api_keys').insert([{
            tenant_id: tenantId,
            key_name: name,
            api_key_hash: hash,
            key_prefix: prefix,
            permissions: permissions,
            is_active: true
        }]);

        if (error) throw error;

        await logAuditEvent({
            module: 'api_keys',
            actionType: 'create',
            details: { notes: `تم توليد مفتاح API جديد باسم "${name}"` }
        });

        window.closeCreateApiKeyModal();
        await loadApiKeys();

        // إظهار نافذة المفتاح السري مرة واحدة للنسخ
        showSecretKeyCreatedModal(name, plainKey);

    } catch (err) {
        console.error('Error creating API key:', err);
        showToast(err.message || 'حدث خطأ أثناء توليد المفتاح', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

function showSecretKeyCreatedModal(name, plainKey) {
    const modal = document.getElementById('reveal-api-key-modal');
    const keyValEl = document.getElementById('reveal-api-key-value');
    const keyNameEl = document.getElementById('reveal-api-key-name');

    if (keyNameEl) keyNameEl.textContent = name;
    if (keyValEl) keyValEl.value = plainKey;

    if (modal) {
        modal.classList.remove('hidden');
        modal.classList.add('flex');
        setTimeout(() => modal.classList.remove('opacity-0'), 10);
    }
}

window.closeRevealApiKeyModal = () => {
    const modal = document.getElementById('reveal-api-key-modal');
    if (modal) {
        modal.classList.add('opacity-0');
        setTimeout(() => {
            modal.classList.remove('flex');
            modal.classList.add('hidden');
        }, 200);
    }
};

window.copyApiKeyToClipboard = () => {
    const keyValEl = document.getElementById('reveal-api-key-value');
    if (!keyValEl) return;
    navigator.clipboard.writeText(keyValEl.value).then(() => {
        showToast('تم نسخ مفتاح API بنجاح! احتفظ به في مكان آمن.', 'success');
    }).catch(() => {
        keyValEl.select();
        document.execCommand('copy');
        showToast('تم نسخ المفتاح!', 'success');
    });
};

window.toggleApiKeyStatus = async (id, newStatus) => {
    try {
        const { error } = await supabase.from('tenant_api_keys').update({ is_active: newStatus }).eq('id', id);
        if (error) throw error;
        showToast(newStatus ? 'تم تفعيل المفتاح بنجاح' : 'تم تعطيل المفتاح', 'success');
        await loadApiKeys();
    } catch (err) {
        showToast('خطأ في تعديل حالة المفتاح: ' + err.message, 'error');
    }
};

window.handleDeleteApiKey = async (id) => {
    confirmDialog({
        title: 'حذف مفتاح API',
        message: 'هل أنت متأكد من حذف هذا المفتاح نهائياً؟ أي نظام خارجي يستخدم هذا المفتاح سيتوقف عن العمل فوراً.',
        confirmText: 'نعم، احذف المفتاح',
        cancelText: 'إلغاء',
        confirmClass: 'bg-rose-600 hover:bg-rose-700 text-white',
        onConfirm: async () => {
            try {
                const { error } = await supabase.from('tenant_api_keys').delete().eq('id', id);
                if (error) throw error;
                showToast('تم حذف المفتاح بنجاح', 'success');
                await loadApiKeys();
            } catch (err) {
                showToast('خطأ أثناء الحذف: ' + err.message, 'error');
            }
        }
    });
};

window.copyEndpointCode = (elementId) => {
    const codeEl = document.getElementById(elementId);
    if (!codeEl) return;
    navigator.clipboard.writeText(codeEl.textContent.trim()).then(() => {
        showToast('تم نسخ كود الاستدعاء إلى الحافظة!', 'success');
    });
};
