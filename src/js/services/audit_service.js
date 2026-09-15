import { supabase } from '../config/supabase.js';
import { getCurrentTenantId, getCurrentTenant, getTenantSlugFromURL } from './tenant_service.js';
import { escapeHtml } from '../utils/sanitize.js';

/**
 * 📝 خدمة تسـجيل أحـداث وفعاليات النظام الشاملة (System Audit Logging Service)
 */
export async function logAuditEvent({
    module,
    actionType,
    action,
    entityType = null,
    entityId = null,
    details = {},
    tenantIdParam = null,
    userNameParam = null
}) {
    try {
        const activeTenant = getCurrentTenant();
        const tenantId = tenantIdParam || activeTenant?.id || getCurrentTenantId();

        const resolvedModule = module || 'system';
        const resolvedAction = actionType || action || 'activity';

        let savedUser = null;
        try {
            const activeSlug = getTenantSlugFromURL() || 'default';
            const localSession = localStorage.getItem(`devo_session_${activeSlug}`) || localStorage.getItem('devo_session');
            if (localSession) savedUser = JSON.parse(localSession);
        } catch (e) {
            console.debug('Error parsing local session for audit:', e);
        }

        const userName = userNameParam 
            || window.currentUserProfile?.full_name 
            || window.currentUser?.full_name 
            || savedUser?.full_name 
            || savedUser?.username 
            || localStorage.getItem('devo_user_fullname') 
            || 'مستخدم النظام';

        const userRole = savedUser?.role || window.currentUser?.role || 'staff';
        const userId = savedUser?.id || null;

        // 1. المحاولة عبر RPC المباشر الآمن
        try {
            const { data: rpcData, error: rpcErr } = await supabase.rpc('log_system_audit_event', {
                p_tenant_id: tenantId,
                p_user_id: userId,
                p_user_name: userName,
                p_user_role: userRole,
                p_module: resolvedModule,
                p_action_type: resolvedAction,
                p_entity_type: entityType,
                p_entity_id: entityId ? String(entityId) : null,
                p_details: typeof details === 'object' ? details : { info: details }
            });

            if (!rpcErr && rpcData?.success) {
                return rpcData;
            }
        } catch (e) {
            console.debug('RPC audit log failed, using fallback insert:', e);
        }

        // 2. Fallback: الإدراج المباشر في جدول system_audit_logs
        const { data, error } = await supabase.from('system_audit_logs').insert([{
            tenant_id: tenantId,
            user_id: userId,
            user_name: userName,
            user_role: userRole,
            module: resolvedModule,
            action_type: resolvedAction,
            entity_type: entityType,
            entity_id: entityId ? String(entityId) : null,
            details: typeof details === 'object' ? details : { info: details }
        }]).select().maybeSingle();

        if (error) {
            console.warn('Direct audit log insertion error:', error);
        }
        return data;
    } catch (err) {
        console.error('Failed to log audit event:', err);
        return null;
    }
}

export function renderHumanReadableDetails(details) {
    if (!details) return '<p class="text-devo-muted italic">لا توجد تفاصيل إضافية مسجلة.</p>';
    
    let parsedDetails = details;
    if (typeof details === 'string') {
        try {
            parsedDetails = JSON.parse(details);
        } catch (e) {
            return `<div class="bg-devo-black/60 p-4 rounded-xl border border-devo-gray/40 text-white text-xs font-semibold leading-relaxed">${details}</div>`;
        }
    }

    if (typeof parsedDetails !== 'object' || parsedDetails === null) {
        return `<div class="bg-devo-black/60 p-4 rounded-xl border border-devo-gray/40 text-white text-xs font-semibold leading-relaxed">${parsedDetails}</div>`;
    }

    const keyTranslations = {
        notes: 'بيان العملية والوصف',
        message: 'رسالة التوضيح',
        info: 'معلومات الفعالية',
        description: 'الوصف التفصيلي',
        action: 'نوع الإجراء',
        invoice_number: 'رقم الفاتورة',
        customer_name: 'اسم العميل',
        phone: 'رقم الهاتف',
        governorate: 'المحافظة / المدينة',
        model_name: 'اسم الموديل',
        factory_code: 'كود المصنع',
        system_code: 'الكود النظامي',
        price: 'السعر',
        piece_price: 'سعر القطعة',
        total_price: 'إجمالي الفاتورة',
        deposit: 'مبلغ العربون',
        remaining: 'المبلغ المتبقي',
        count: 'عدد العناصر',
        items_count: 'عدد القطع / العناصر',
        total_series: 'إجمالي السريات',
        total_cost: 'التكلفة الإجمالية',
        supplier_name: 'اسم المورد',
        credits: 'الكريديت المستهلك',
        credits_deducted: 'الكريديت المستقطع',
        remaining_credits: 'رصيد الكريديت المتبقي',
        status: 'الحالة الجديدة',
        old_status: 'الحالة السابقة',
        assigned_worker: 'الموظف المسند إليه',
        reason: 'السبب / الداعي',
        category: 'التصنيف الرئيسي',
        class: 'الفئة الفرعية',
        size: 'المقاس',
        color: 'اللون',
        user_name: 'المُفَـذ / المسؤول',
        user_role: 'صلاحية المستخدم',
        tenant_id: 'معرف المصنع',
        type: 'نوع البند / التعريف',
        table_name: 'الجدول المستهدف',
        operation_type: 'طبيعة العملية'
    };

    const actionTranslations = {
        status_changed: 'تغيير حالة طلب',
        status_change: 'تغيير حالة طلب',
        created: 'إنشاء جديد',
        create: 'إنشاء جديد',
        updated: 'تعديل بيانات',
        update: 'تعديل بيانات',
        deleted: 'حذف عنصر',
        delete: 'حذف عنصر',
        bulk_edit: 'تعديل مجمع للموديلات',
        excel_import: 'استيراد عبر ملف إكسيل',
        recharge: 'شحن رصيد كريديت',
        assigned: 'إسناد وتعيين',
        locked: 'قفل واستلام',
        unlocked: 'فك قفل'
    };

    let mainNotes = parsedDetails.notes || parsedDetails.message || parsedDetails.info || parsedDetails.description || '';
    
    const items = [];
    for (const [key, value] of Object.entries(parsedDetails)) {
        if (['notes', 'message', 'info', 'description'].includes(key) && mainNotes === value) continue;
        if (value === null || value === undefined || value === '') continue;

        const label = keyTranslations[key] || key;
        let displayVal = value;

        if (key === 'action' && actionTranslations[value]) {
            displayVal = actionTranslations[value];
        } else if (typeof value === 'object') {
            displayVal = JSON.stringify(value, null, 2);
        }

        items.push(`
            <div class="flex items-center justify-between p-3 rounded-lg bg-devo-black/50 border border-devo-gray/30 hover:border-devo-orange/30 transition-colors">
                <span class="text-devo-muted font-bold text-xs">${escapeHtml(label)}:</span>
                <span class="text-white font-extrabold text-xs dir-rtl text-right font-mono">${escapeHtml(String(displayVal))}</span>
            </div>
        `);
    }

    return `
        <div class="space-y-3.5">
            ${mainNotes ? `
                <div class="p-4 rounded-xl bg-gradient-to-r from-devo-orange/15 to-amber-500/10 border border-devo-orange/30 text-xs font-medium flex items-start gap-3 shadow-inner">
                    <div class="w-8 h-8 rounded-lg bg-devo-orange/20 border border-devo-orange/40 flex items-center justify-center text-devo-orange shrink-0">
                        <i class="ph ph-receipt-text text-lg"></i>
                    </div>
                    <div class="space-y-1">
                        <span class="text-devo-orange font-black block text-[11px] uppercase tracking-wider">البيان الرسمي للعملية:</span>
                        <p class="text-white leading-relaxed font-bold text-xs">${escapeHtml(mainNotes)}</p>
                    </div>
                </div>
            ` : ''}

            ${items.length > 0 ? `
                <div class="grid grid-cols-1 md:grid-cols-2 gap-2.5 mt-2">
                    ${items.join('')}
                </div>
            ` : ''}
        </div>
    `;
}

export async function showAuditLogDetails(id, fallbackObj = null) {
    let log = fallbackObj;
    if (!log && id) {
        try {
            const { data } = await supabase.from('system_audit_logs').select('*').eq('id', id).maybeSingle();
            if (data) log = data;
        } catch (e) {}
    }
    if (!log) return;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
    modal.onclick = (e) => { if (e.target === modal) modal.remove(); };

    modal.innerHTML = `
        <div class="bg-devo-dark border border-devo-gray rounded-xl w-full max-w-xl p-6 shadow-2xl relative animate-in fade-in zoom-in duration-200">
            <div class="flex items-center justify-between border-b border-devo-gray/50 pb-4 mb-4">
                <h3 class="text-base font-bold text-white flex items-center gap-2">
                    <i class="ph ph-receipt-text text-devo-orange text-xl"></i>
                    تفاصيل سجل الفعالية
                </h3>
                <button onclick="this.closest('.fixed').remove()" class="text-devo-muted hover:text-white text-xl"><i class="ph ph-x"></i></button>
            </div>

            <div class="space-y-4 text-xs">
                <div class="grid grid-cols-2 gap-3 bg-devo-black/50 p-3.5 rounded-lg border border-devo-gray/30">
                    <div><span class="text-devo-muted block text-[11px] mb-0.5">التاريخ والوقت:</span> <span class="text-white font-mono font-bold">${log.created_at ? new Date(log.created_at).toLocaleString('ar-EG') : 'غير محدد'}</span></div>
                    <div><span class="text-devo-muted block text-[11px] mb-0.5">المستخدم المسؤول:</span> <span class="text-devo-orange font-bold">${escapeHtml(log.user_name || 'مستخدم النظام')} (${escapeHtml(log.user_role || 'staff')})</span></div>
                    <div><span class="text-devo-muted block text-[11px] mb-0.5">القسم / الموديول:</span> <span class="text-white font-bold">${escapeHtml(log.module || 'نظامي')}</span></div>
                    <div><span class="text-devo-muted block text-[11px] mb-0.5">نوع الإجراء:</span> <span class="text-white font-bold">${escapeHtml(log.action_type || 'فعالية')}</span></div>
                </div>

                <div>
                    <label class="text-white font-bold mb-2 text-xs flex items-center gap-1.5">
                        <i class="ph ph-list-bullets text-devo-orange"></i>
                        تفاصيل وتوضيح العملية:
                    </label>
                    ${renderHumanReadableDetails(log.details)}
                </div>

                <details class="group mt-3">
                    <summary class="cursor-pointer text-[11px] text-devo-muted hover:text-white flex items-center gap-1 font-mono select-none">
                        <i class="ph ph-code"></i> عرض البيانات البرمجية الدقيقة (JSON Data)
                    </summary>
                    <pre class="mt-2 bg-devo-black p-3.5 rounded-lg border border-devo-gray/50 font-mono text-[10px] text-emerald-400 overflow-x-auto max-h-48 dir-ltr text-left">${escapeHtml(JSON.stringify(log.details || {}, null, 2))}</pre>
                </details>
            </div>

            <div class="mt-6 text-left border-t border-devo-gray/30 pt-4">
                <button onclick="this.closest('.fixed').remove()" class="px-5 py-2 rounded-lg bg-devo-gray/50 hover:bg-devo-gray text-white text-xs font-bold transition-colors">إغلاق</button>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

if (typeof window !== 'undefined') {
    window.logAuditEvent = logAuditEvent;
    window.showAuditLogDetails = showAuditLogDetails;
    window.renderHumanReadableDetails = renderHumanReadableDetails;
}
