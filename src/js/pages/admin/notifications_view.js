import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { getCurrentTenantId } from '../../services/tenant_service.js';
import { getTenantModularSettings, saveTenantModularSettings } from '../../services/modular_settings.js';

let allNotifications = [];
let activeFilter = 'all'; // 'all', 'unread', 'archived'

// تهيئة صفحة إدارة الإشعارات
export async function initNotificationsView() {
    setupWindowBindings();
    await fetchNotifications();
    await loadTelegramSettings();
    
    // الاستماع لحدث تلقي إشعار جديد لتحديث القائمة تلقائياً
    window.addEventListener('devo:notifications-received', handleRealtimeRefresh);
}

// إلغاء الاستماع عند الحاجة لتجنب تسريب الذاكرة
function handleRealtimeRefresh() {
    fetchNotifications();
}

// ربط الدوال بنافذة المتصفح لتشغيل أحداث onclick من ملف HTML
function setupWindowBindings() {
    window.changeNotificationFilter = changeNotificationFilter;
    window.bulkMarkNotificationsRead = bulkMarkNotificationsRead;
    window.bulkArchiveNotifications = bulkArchiveNotifications;
    window.bulkDeleteNotifications = bulkDeleteNotifications;
    window.broadcastCustomNotification = broadcastCustomNotification;
    window.toggleNotificationRead = toggleNotificationRead;
    window.toggleNotificationArchive = toggleNotificationArchive;
    window.deleteNotification = deleteNotification;
    window.viewNotificationTarget = viewNotificationTarget;
    window.saveTelegramSettings = saveTelegramSettings;
    window.toggleTelegramSettingsCard = toggleTelegramSettingsCard;
    window.testTelegramConnection = testTelegramConnection;
    window.sendAutomatedReport = sendAutomatedReport;
    window.togglePasswordVisibility = togglePasswordVisibility;
}

// 1. جلب الإشعارات بالكامل من قاعدة البيانات
export async function fetchNotifications() {
    try {
        const tenantId = getCurrentTenantId();
        if (!tenantId) {
            allNotifications = [];
            updateStats();
            renderNotifications();
            return;
        }

        const { data, error } = await supabase
            .from('system_notifications')
            .select('*')
            .eq('tenant_id', tenantId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        allNotifications = (data || []).filter(n => n.tenant_id === tenantId);
        updateStats();
        renderNotifications();
    } catch (e) {
        console.error('Error fetching notifications:', e);
        showToast('حدث خطأ أثناء تحميل الإشعارات', 'error');
    }
}

// 2. تحديث مؤشرات الإحصائيات في الصفحة
function updateStats() {
    const totalEl = document.getElementById('notify-stat-total');
    const unreadEl = document.getElementById('notify-stat-unread');

    if (totalEl) totalEl.textContent = `الكل: ${allNotifications.length}`;
    if (unreadEl) {
        const unreadCount = allNotifications.filter(n => !n.is_read && !n.is_archived).length;
        unreadEl.textContent = `غير مقروء: ${unreadCount}`;
    }
}

// 3. عرض كروت الإشعارات بالصفحة
function renderNotifications() {
    const listContainer = document.getElementById('notifications-manager-list');
    if (!listContainer) return;

    let filtered = allNotifications;
    if (activeFilter === 'unread') {
        filtered = allNotifications.filter(n => !n.is_read && !n.is_archived);
    } else if (activeFilter === 'archived') {
        filtered = allNotifications.filter(n => n.is_archived);
    } else {
        // فلتر "الكل" يعرض كافة الإشعارات غير المؤرشفة بشكل افتراضي لتنظيم الواجهة
        filtered = allNotifications.filter(n => !n.is_archived);
    }

    if (filtered.length === 0) {
        listContainer.innerHTML = `
            <div class="p-16 text-center bg-devo-dark border border-devo-gray rounded-xl text-devo-muted flex flex-col items-center gap-3">
                <i class="ph ph-bell-slash text-4xl opacity-40"></i>
                <span>لا توجد إشعارات تطابق التصفية الحالية</span>
            </div>
        `;
        return;
    }

    listContainer.innerHTML = filtered.map(n => {
        const dateStr = new Date(n.created_at).toLocaleString('ar-EG', {
            year: 'numeric', month: 'short', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });

        // تحديد الأيقونة وكلاسات الألوان حسب نوع الإشعار
        let iconClass = 'ph ph-info bg-devo-info/10 text-devo-info';
        if (n.type === 'order_created') iconClass = 'ph ph-shopping-cart bg-devo-success/10 text-devo-success';
        else if (n.type === 'order_updated') iconClass = 'ph ph-pencil-simple bg-devo-warning/10 text-devo-warning';
        else if (n.type === 'out_of_stock') iconClass = 'ph ph-warning bg-devo-error/10 text-devo-error';
        else if (n.type === 'order_assigned') iconClass = 'ph ph-user-gear bg-blue-500/10 text-blue-400';
        else if (n.type === 'custom_broadcast') iconClass = 'ph ph-broadcast bg-devo-orange/10 text-devo-orange';

        // تنسيق الخلفية ونقاط الحالة بناء على المقروئية
        const cardBg = n.is_read ? 'bg-devo-dark/40 opacity-70 border-devo-gray/50' : 'bg-devo-dark border-devo-orange/30';
        const unreadIndicator = n.is_read ? '' : '<span class="w-2.5 h-2.5 bg-devo-orange rounded-full animate-pulse shrink-0"></span>';

        // أزرار التحكم بالمقروئية
        const readBtnHtml = n.is_read 
            ? `<button onclick="toggleNotificationRead('${n.id}', false)" class="p-1.5 hover:bg-white/10 rounded text-devo-muted hover:text-white transition-colors" title="تحديد كغير مقروء"><i class="ph ph-envelope-open text-base"></i></button>`
            : `<button onclick="toggleNotificationRead('${n.id}', true)" class="p-1.5 hover:bg-white/10 rounded text-devo-orange hover:text-devo-orangeHover transition-colors" title="تحديد كمقروء"><i class="ph ph-envelope text-base"></i></button>`;

        // أزرار التحكم بالأرشفة
        const archiveBtnHtml = n.is_archived
            ? `<button onclick="toggleNotificationArchive('${n.id}', false)" class="p-1.5 hover:bg-white/10 rounded text-devo-orange transition-colors" title="إلغاء الأرشفة"><i class="ph ph-archive-box text-base"></i></button>`
            : `<button onclick="toggleNotificationArchive('${n.id}', true)" class="p-1.5 hover:bg-white/10 rounded text-devo-muted hover:text-white transition-colors" title="أرشفة الإشعار"><i class="ph ph-archive text-base"></i></button>`;

        // زر الانتقال للمحتوى المرتبط
        let linkBtnHtml = '';
        if (n.metadata && n.metadata.order_id) {
            linkBtnHtml = `<button onclick="viewNotificationTarget('${n.metadata.order_id}')" class="px-2.5 py-1 bg-devo-orange/10 hover:bg-devo-orange text-devo-orange hover:text-white rounded text-[11px] font-bold transition-all flex items-center gap-1">
                <i class="ph ph-eye text-sm"></i> عرض الطلب
            </button>`;
        } else if (n.metadata && n.metadata.model_id) {
            linkBtnHtml = `<a href="admin.html?admin_model=${n.metadata.model_id}" class="px-2.5 py-1 bg-devo-orange/10 hover:bg-devo-orange text-devo-orange hover:text-white rounded text-[11px] font-bold transition-all flex items-center gap-1">
                <i class="ph ph-eye text-sm"></i> عرض الموديل
            </a>`;
        }

        return `
            <div class="border p-4 rounded-xl shadow-sm flex items-start gap-4 transition-all ${cardBg}" id="notify-card-${n.id}">
                <!-- الأيقونة التعبيرية -->
                <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xl shrink-0 ${iconClass}"></div>
                
                <!-- محتوى الإشعار -->
                <div class="flex-1 min-w-0 space-y-1 text-right">
                    <div class="flex items-center gap-2 flex-wrap">
                        <span class="font-bold text-sm text-white">${n.title}</span>
                        ${unreadIndicator}
                        <span class="text-[10px] text-devo-muted mr-auto font-mono">${dateStr}</span>
                    </div>
                    <p class="text-xs text-devo-muted leading-relaxed whitespace-pre-wrap">${n.body}</p>
                    
                    <div class="flex items-center justify-between pt-2 border-t border-devo-gray/20 mt-2">
                        <!-- رابط الانتقال السريع -->
                        <div>${linkBtnHtml}</div>
                        
                        <!-- أدوات التحكم الفردية -->
                        <div class="flex items-center gap-1">
                            ${readBtnHtml}
                            ${archiveBtnHtml}
                            <button onclick="deleteNotification('${n.id}')" class="p-1.5 hover:bg-devo-error/10 rounded text-devo-muted hover:text-devo-error transition-colors" title="حذف الإشعار">
                                <i class="ph ph-trash text-base"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// 4. تغيير فلتر التصفية النشط
export function changeNotificationFilter(filter) {
    activeFilter = filter;
    ['all', 'unread', 'archived'].forEach(f => {
        const btn = document.getElementById(`filter-notify-${f}`);
        if (btn) {
            if (f === filter) {
                btn.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all text-white bg-devo-orange shadow-md";
            } else {
                btn.className = "px-3 py-1.5 rounded-md text-xs font-bold transition-all text-devo-muted hover:text-white";
            }
        }
    });
    renderNotifications();
}

// 5. تعديل حالة إشعار واحد (قراءة / عدم قراءة)
export async function toggleNotificationRead(id, isRead) {
    try {
        const { error } = await supabase
            .from('system_notifications')
            .update({ is_read: isRead })
            .eq('id', id);

        if (error) throw error;

        const idx = allNotifications.findIndex(n => n.id === id);
        if (idx > -1) {
            allNotifications[idx].is_read = isRead;
            updateStats();
            renderNotifications();
            // إرسال حدث لتحديث جرس الهيدر تلقائياً
            window.dispatchEvent(new CustomEvent('devo:notifications-updated'));
        }
    } catch (e) {
        showToast('خطأ أثناء تعديل حالة الإشعار', 'error');
    }
}

// أرشفة إشعار واحد
export async function toggleNotificationArchive(id, isArchived) {
    try {
        const { error } = await supabase
            .from('system_notifications')
            .update({ is_archived: isArchived })
            .eq('id', id);

        if (error) throw error;

        const idx = allNotifications.findIndex(n => n.id === id);
        if (idx > -1) {
            allNotifications[idx].is_archived = isArchived;
            updateStats();
            renderNotifications();
            window.dispatchEvent(new CustomEvent('devo:notifications-updated'));
        }
    } catch (e) {
        showToast('خطأ أثناء أرشفة الإشعار', 'error');
    }
}

// حذف إشعار واحد نهائياً
export async function deleteNotification(id) {
    const confirm = await confirmDialog({
        title: 'تأكيد الحذف',
        body: 'هل أنت متأكد من رغبتك في حذف هذا الإشعار نهائياً من قاعدة البيانات؟',
        confirmText: 'نعم، احذف',
        cancelText: 'إلغاء'
    });
    if (!confirm) return;

    try {
        const { error } = await supabase
            .from('system_notifications')
            .delete()
            .eq('id', id);

        if (error) throw error;

        allNotifications = allNotifications.filter(n => n.id !== id);
        updateStats();
        renderNotifications();
        window.dispatchEvent(new CustomEvent('devo:notifications-updated'));
        showToast('تم حذف الإشعار بنجاح', 'success');
    } catch (e) {
        showToast('خطأ أثناء حذف الإشعار', 'error');
    }
}

// 6. إجراءات جماعية
// تحديد الكل كمقروء
export async function bulkMarkNotificationsRead() {
    try {
        const unreadIds = allNotifications
            .filter(n => !n.is_read)
            .map(n => n?.id)
            .filter(id => id && typeof id === 'string' && id.trim() !== '');

        if (unreadIds.length === 0) {
            showToast('لا توجد إشعارات غير مقروءة حالياً', 'info');
            return;
        }

        for (let i = 0; i < unreadIds.length; i += 50) {
            const chunk = unreadIds.slice(i, i + 50);
            const { error } = await supabase
                .from('system_notifications')
                .update({ is_read: true })
                .in('id', chunk);

            if (error) console.warn('Error marking chunk read:', error);
        }

        allNotifications.forEach(n => n.is_read = true);
        updateStats();
        renderNotifications();
        window.dispatchEvent(new CustomEvent('devo:notifications-updated'));
        showToast('تم تحديد جميع الإشعارات كمقروءة', 'success');
    } catch (e) {
        showToast('حدث خطأ أثناء تحديث الإشعارات', 'error');
    }
}

// أرشفة جميع الإشعارات غير المؤرشفة
export async function bulkArchiveNotifications() {
    try {
        const nonArchivedIds = allNotifications
            .filter(n => !n.is_archived)
            .map(n => n?.id)
            .filter(id => id && typeof id === 'string' && id.trim() !== '');

        if (nonArchivedIds.length === 0) {
            showToast('جميع الإشعارات مؤرشفة بالفعل', 'info');
            return;
        }

        for (let i = 0; i < nonArchivedIds.length; i += 50) {
            const chunk = nonArchivedIds.slice(i, i + 50);
            const { error } = await supabase
                .from('system_notifications')
                .update({ is_archived: true })
                .in('id', chunk);

            if (error) console.warn('Error archiving chunk:', error);
        }

        allNotifications.forEach(n => n.is_archived = true);
        updateStats();
        renderNotifications();
        window.dispatchEvent(new CustomEvent('devo:notifications-updated'));
        showToast('تم أرشفة جميع الإشعارات بنجاح', 'success');
    } catch (e) {
        showToast('حدث خطأ أثناء أرشفة الإشعارات', 'error');
    }
}

// حذف جميع الإشعارات من قاعدة البيانات
export async function bulkDeleteNotifications() {
    if (allNotifications.length === 0) {
        showToast('قائمة الإشعارات فارغة بالفعل', 'info');
        return;
    }

    const confirm = await confirmDialog({
        title: 'حذف جميع الإشعارات',
        body: 'هل أنت متأكد من رغبتك في حذف جميع الإشعارات نهائياً من قاعدة البيانات؟ لا يمكن التراجع عن هذا الإجراء.',
        confirmText: 'نعم، احذف الكل',
        cancelText: 'إلغاء'
    });
    if (!confirm) return;

    try {
        const ids = allNotifications
            .map(n => n?.id)
            .filter(id => id && typeof id === 'string' && id.trim() !== '');

        if (ids.length > 0) {
            for (let i = 0; i < ids.length; i += 50) {
                const chunk = ids.slice(i, i + 50);
                const { error } = await supabase
                    .from('system_notifications')
                    .delete()
                    .in('id', chunk);

                if (error) console.warn('Error deleting chunk:', error);
            }
        }

        allNotifications = [];
        updateStats();
        renderNotifications();
        window.dispatchEvent(new CustomEvent('devo:notifications-updated'));
        showToast('تم تفريغ كافة الإشعارات بنجاح', 'success');
    } catch (e) {
        showToast('حدث خطأ أثناء مسح الإشعارات', 'error');
    }
}

// 7. بث إشعار مخصص لجميع المستخدمين متصلين
export async function broadcastCustomNotification() {
    const titleInput = document.getElementById('broadcast-title');
    const bodyInput = document.getElementById('broadcast-body');
    const btn = document.getElementById('broadcast-btn');

    if (!titleInput || !bodyInput) return;

    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();

    if (!title || !body) {
        showToast('يرجى ملء جميع حقول بث التنبيه', 'warning');
        return;
    }

    const tenantId = getCurrentTenantId();
    if (!tenantId) {
        showToast('حدث خطأ: لم يتم تحديد هويّة المصنع / المتجر الحالي', 'error');
        return;
    }

    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin text-base"></i> جاري البث...`;
    }

    const tgTargetInput = document.getElementById('broadcast-tg-target');
    const tgTarget = tgTargetInput ? tgTargetInput.value : 'none';

    try {
        const { error } = await supabase
            .from('system_notifications')
            .insert([{
                type: 'custom_broadcast',
                title: title,
                body: body,
                tenant_id: tenantId,
                metadata: { 
                    broadcasted_by: 'Admin Panel',
                    telegram_target: tgTarget
                }
            }]);

        if (error) throw error;

        titleInput.value = '';
        bodyInput.value = '';
        showToast('تم بث الإشعار بنجاح لجميع الأجهزة بالمصنع الحالي 🎉', 'success');
        
        await fetchNotifications();
    } catch (e) {
        console.error('Broadcast failed:', e);
        showToast('حدث خطأ أثناء بث الإشعار عبر النظام', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="ph ph-paper-plane-tilt text-base"></i> بث التنبيه الآن`;
        }
    }
}

// 8. الانتقال التلقائي للهدف (مثل الطلب)
export function viewNotificationTarget(orderId) {
    const adminOrdersLink = document.querySelector('[data-target="view-admin-orders"]');
    if (adminOrdersLink && typeof window.switchView === 'function') {
        window.switchView('view-admin-orders', adminOrdersLink);
        setTimeout(() => {
            const row = document.getElementById(`admin-order-row-${orderId}`);
            if (row) {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                row.classList.add('bg-devo-orange/30', 'transition-all', 'duration-500');
                setTimeout(() => row.classList.remove('bg-devo-orange/30'), 3000);
            }
        }, 500);
    }
}

// 9. جلب إعدادات تليجرام وجدولة التقارير من جدول home_settings
export async function loadTelegramSettings() {
    try {
        const currentTenantId = getCurrentTenantId();
        const settingKeys = [
            'telegram_enabled',
            'telegram_stock_enabled',
            'telegram_reports_enabled',
            'web_notifications_enabled',
            'telegram_bot_token',
            'telegram_chat_id',
            'telegram_stock_chat_id',
            'telegram_reports_chat_id',
            'telegram_reports_group_link',
            'report_daily_enabled',
            'report_daily_time',
            'report_weekly_enabled',
            'report_weekly_day',
            'report_weekly_time',
            'report_monthly_enabled',
            'report_monthly_day',
            'report_monthly_time',
            'report_annual_enabled',
            'report_annual_date',
            'report_annual_time'
        ];

        // 1. جلب الإعدادات من الجداول المنظمة أولاً
        const modular = await getTenantModularSettings(currentTenantId);
        const tg = modular?.telegram || {};
        const rep = modular?.reports || {};

        let query = supabase
            .from('home_settings')
            .select('*')
            .in('setting_key', settingKeys);
            
        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        let data = null;
        try {
            const res = await query;
            data = res.data;
        } catch (e) {
            console.warn('Fallback query notice:', e);
        }
        
        const settings = {};
        if (data) {
            data.forEach(item => settings[item.setting_key] = item.setting_value);
        }

        // دمج القيم من الجداول المنظمة أولاً
        if (tg.general_enabled !== undefined) settings['telegram_enabled'] = String(tg.general_enabled);
        if (tg.stock_enabled !== undefined) settings['telegram_stock_enabled'] = String(tg.stock_enabled);
        if (tg.reports_enabled !== undefined) settings['telegram_reports_enabled'] = String(tg.reports_enabled);
        if (tg.web_notifications_enabled !== undefined) settings['web_notifications_enabled'] = String(tg.web_notifications_enabled);
        if (tg.bot_token) settings['telegram_bot_token'] = tg.bot_token;
        if (tg.general_chat_id) settings['telegram_chat_id'] = tg.general_chat_id;
        if (tg.stock_chat_id) settings['telegram_stock_chat_id'] = tg.stock_chat_id;
        if (tg.reports_chat_id) settings['telegram_reports_chat_id'] = tg.reports_chat_id;
        if (tg.reports_group_link) settings['telegram_reports_group_link'] = tg.reports_group_link;

        if (rep.daily_enabled !== undefined) settings['report_daily_enabled'] = String(rep.daily_enabled);
        if (rep.daily_time) settings['report_daily_time'] = rep.daily_time;
        if (rep.weekly_enabled !== undefined) settings['report_weekly_enabled'] = String(rep.weekly_enabled);
        if (rep.weekly_day) settings['report_weekly_day'] = rep.weekly_day;
        if (rep.weekly_time) settings['report_weekly_time'] = rep.weekly_time;
        if (rep.monthly_enabled !== undefined) settings['report_monthly_enabled'] = String(rep.monthly_enabled);
        if (rep.monthly_day) settings['report_monthly_day'] = rep.monthly_day;
        if (rep.monthly_time) settings['report_monthly_time'] = rep.monthly_time;
        if (rep.annual_enabled !== undefined) settings['report_annual_enabled'] = String(rep.annual_enabled);
        if (rep.annual_date) settings['report_annual_date'] = rep.annual_date;
        if (rep.annual_time) settings['report_annual_time'] = rep.annual_time;
        
        // 1. قنوات التفعيل
        const enabledInput = document.getElementById('telegram-enabled');
        const stockEnabledInput = document.getElementById('telegram-stock-enabled');
        const reportsEnabledInput = document.getElementById('telegram-reports-enabled');
        const webNotificationsInput = document.getElementById('web-notifications-enabled');

        if (enabledInput) enabledInput.checked = settings['telegram_enabled'] === 'true';
        if (stockEnabledInput) stockEnabledInput.checked = settings['telegram_stock_enabled'] !== 'false';
        if (reportsEnabledInput) reportsEnabledInput.checked = settings['telegram_reports_enabled'] !== 'false';
        if (webNotificationsInput) webNotificationsInput.checked = settings['web_notifications_enabled'] !== 'false';
        
        // 2. بيانات البوت ومعرفات المجموعات (مع الحماية السرية)
        const tokenInput = document.getElementById('telegram-bot-token');
        const chatInput = document.getElementById('telegram-chat-id');
        const stockChatInput = document.getElementById('telegram-stock-chat-id');
        const reportsChatInput = document.getElementById('telegram-reports-chat-id');
        const reportsLinkInput = document.getElementById('telegram-reports-group-link');
        
        if (tokenInput) {
            tokenInput.value = '';
            const hasExistingToken = !!settings['telegram_bot_token'];
            tokenInput.placeholder = hasExistingToken 
                ? '•••••••••••••••• (التوكن محفوظ ومحمى بأمان بالخادم - أدخل توكن جديد فقط للتغيير)' 
                : 'أدخل Bot Token من @BotFather (مثال: 123456789:ABCdefGhI...)';
        }

        if (chatInput) {
            chatInput.value = '';
            const hasExistingChat = !!settings['telegram_chat_id'];
            chatInput.placeholder = hasExistingChat 
                ? '•••••••••••• (معرّف المحادثة محفوظ بأمان بالخادم - أدخل معرّف جديد فقط للتغيير)' 
                : 'مثال: -1004430334412';
        }

        if (stockChatInput) {
            stockChatInput.value = '';
            const hasExistingStockChat = !!settings['telegram_stock_chat_id'];
            stockChatInput.placeholder = hasExistingStockChat 
                ? '•••••••••••• (معرّف المحادثة محفوظ بأمان بالخادم - أدخل معرّف جديد فقط للتغيير)' 
                : 'مثال: -1004482360716';
        }

        if (reportsChatInput) {
            reportsChatInput.value = '';
            const hasExistingReportsChat = !!settings['telegram_reports_chat_id'];
            reportsChatInput.placeholder = hasExistingReportsChat 
                ? '•••••••••••• (معرّف المحادثة محفوظ بأمان بالخادم - أدخل معرّف جديد فقط للتغيير)' 
                : 'مثال: -1004352609361';
        }

        if (reportsLinkInput) {
            reportsLinkInput.value = settings['telegram_reports_group_link'] || '';
        }

        // 3. جدولة ومواعيد التقارير التلقائية
        const dailyEnabled = document.getElementById('report-daily-enabled');
        const dailyTime = document.getElementById('report-daily-time');
        if (dailyEnabled) dailyEnabled.checked = settings['report_daily_enabled'] === 'true';
        if (dailyTime && settings['report_daily_time']) dailyTime.value = settings['report_daily_time'];

        const weeklyEnabled = document.getElementById('report-weekly-enabled');
        const weeklyDay = document.getElementById('report-weekly-day');
        const weeklyTime = document.getElementById('report-weekly-time');
        if (weeklyEnabled) weeklyEnabled.checked = settings['report_weekly_enabled'] !== 'false';
        if (weeklyDay && settings['report_weekly_day']) weeklyDay.value = settings['report_weekly_day'];
        if (weeklyTime && settings['report_weekly_time']) weeklyTime.value = settings['report_weekly_time'];

        const monthlyEnabled = document.getElementById('report-monthly-enabled');
        const monthlyDay = document.getElementById('report-monthly-day');
        const monthlyTime = document.getElementById('report-monthly-time');
        if (monthlyEnabled) monthlyEnabled.checked = settings['report_monthly_enabled'] !== 'false';
        if (monthlyDay && settings['report_monthly_day']) monthlyDay.value = settings['report_monthly_day'];
        if (monthlyTime && settings['report_monthly_time']) monthlyTime.value = settings['report_monthly_time'];

        const annualEnabled = document.getElementById('report-annual-enabled');
        const annualDate = document.getElementById('report-annual-date');
        const annualTime = document.getElementById('report-annual-time');
        if (annualEnabled) annualEnabled.checked = settings['report_annual_enabled'] !== 'false';
        if (annualDate && settings['report_annual_date']) annualDate.value = settings['report_annual_date'];
        if (annualTime && settings['report_annual_time']) annualTime.value = settings['report_annual_time'];

    } catch (e) {
        console.error('Error loading Telegram settings:', e);
    }
}

// 10. حفظ كافة إعدادات تليجرام والمواعيد في جدول home_settings
export async function saveTelegramSettings() {
    const enabledInput = document.getElementById('telegram-enabled');
    const stockEnabledInput = document.getElementById('telegram-stock-enabled');
    const reportsEnabledInput = document.getElementById('telegram-reports-enabled');
    const webNotificationsInput = document.getElementById('web-notifications-enabled');
    
    const tokenInput = document.getElementById('telegram-bot-token');
    const chatInput = document.getElementById('telegram-chat-id');
    const stockChatInput = document.getElementById('telegram-stock-chat-id');
    const reportsChatInput = document.getElementById('telegram-reports-chat-id');
    const reportsLinkInput = document.getElementById('telegram-reports-group-link');

    const dailyEnabled = document.getElementById('report-daily-enabled');
    const dailyTime = document.getElementById('report-daily-time');
    const weeklyEnabled = document.getElementById('report-weekly-enabled');
    const weeklyDay = document.getElementById('report-weekly-day');
    const weeklyTime = document.getElementById('report-weekly-time');
    const monthlyEnabled = document.getElementById('report-monthly-enabled');
    const monthlyDay = document.getElementById('report-monthly-day');
    const monthlyTime = document.getElementById('report-monthly-time');
    const annualEnabled = document.getElementById('report-annual-enabled');
    const annualDate = document.getElementById('report-annual-date');
    const annualTime = document.getElementById('report-annual-time');

    const btn = document.getElementById('save-tg-btn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin text-lg"></i> جاري حفظ الإعدادات...`;
    }
    
    try {
        const currentTenantId = getCurrentTenantId();
        const updates = [
            { tenant_id: currentTenantId, setting_key: 'telegram_enabled', setting_value: enabledInput?.checked ? 'true' : 'false' },
            { tenant_id: currentTenantId, setting_key: 'telegram_stock_enabled', setting_value: stockEnabledInput?.checked ? 'true' : 'false' },
            { tenant_id: currentTenantId, setting_key: 'telegram_reports_enabled', setting_value: reportsEnabledInput?.checked ? 'true' : 'false' },
            { tenant_id: currentTenantId, setting_key: 'web_notifications_enabled', setting_value: webNotificationsInput?.checked ? 'true' : 'false' },
            
            { tenant_id: currentTenantId, setting_key: 'report_daily_enabled', setting_value: dailyEnabled?.checked ? 'true' : 'false' },
            { tenant_id: currentTenantId, setting_key: 'report_daily_time', setting_value: dailyTime?.value || '23:00' },
            
            { tenant_id: currentTenantId, setting_key: 'report_weekly_enabled', setting_value: weeklyEnabled?.checked ? 'true' : 'false' },
            { tenant_id: currentTenantId, setting_key: 'report_weekly_day', setting_value: weeklyDay?.value || 'thursday' },
            { tenant_id: currentTenantId, setting_key: 'report_weekly_time', setting_value: weeklyTime?.value || '23:00' },
            
            { tenant_id: currentTenantId, setting_key: 'report_monthly_enabled', setting_value: monthlyEnabled?.checked ? 'true' : 'false' },
            { tenant_id: currentTenantId, setting_key: 'report_monthly_day', setting_value: monthlyDay?.value || 'last_day' },
            { tenant_id: currentTenantId, setting_key: 'report_monthly_time', setting_value: monthlyTime?.value || '23:00' },
            
            { tenant_id: currentTenantId, setting_key: 'report_annual_enabled', setting_value: annualEnabled?.checked ? 'true' : 'false' },
            { tenant_id: currentTenantId, setting_key: 'report_annual_date', setting_value: annualDate?.value || '12-31' },
            { tenant_id: currentTenantId, setting_key: 'report_annual_time', setting_value: annualTime?.value || '23:00' }
        ];

        // رابط جروب التقارير
        if (reportsLinkInput) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_reports_group_link', setting_value: reportsLinkInput.value.trim() });
        }

        // 🔒 تحديث البيانات الحساسة فقط إذا قام المستخدم بكتابة قيم جديدة
        const token = tokenInput?.value.trim();
        const chat = chatInput?.value.trim();
        const stockChat = stockChatInput?.value.trim();
        const reportsChat = reportsChatInput?.value.trim();

        if (token) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_bot_token', setting_value: token });
        }
        if (chat) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_chat_id', setting_value: chat });
        }
        if (stockChat) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_stock_chat_id', setting_value: stockChat });
        }
        if (reportsChat) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_reports_chat_id', setting_value: reportsChat });
        }
        
        // 1. حفظ في الجداول المنظمة الجديدة
        const telegramPayload = {
            general_enabled: enabledInput?.checked ?? false,
            stock_enabled: stockEnabledInput?.checked ?? true,
            reports_enabled: reportsEnabledInput?.checked ?? true,
            web_notifications_enabled: webNotificationsInput?.checked ?? true,
            reports_group_link: reportsLinkInput?.value.trim() || ''
        };
        if (token) telegramPayload.bot_token = token;
        if (chat) telegramPayload.general_chat_id = chat;
        if (stockChat) telegramPayload.stock_chat_id = stockChat;
        if (reportsChat) telegramPayload.reports_chat_id = reportsChat;

        await saveTenantModularSettings(currentTenantId, 'telegram', telegramPayload);

        const reportsPayload = {
            daily_enabled: dailyEnabled?.checked ?? false,
            daily_time: dailyTime?.value || '23:00',
            weekly_enabled: weeklyEnabled?.checked ?? true,
            weekly_day: weeklyDay?.value || 'thursday',
            weekly_time: weeklyTime?.value || '23:00',
            monthly_enabled: monthlyEnabled?.checked ?? true,
            monthly_day: monthlyDay?.value || 'last_day',
            monthly_time: monthlyTime?.value || '23:00',
            annual_enabled: annualEnabled?.checked ?? true,
            annual_date: annualDate?.value || '12-31',
            annual_time: annualTime?.value || '23:00'
        };

        await saveTenantModularSettings(currentTenantId, 'reports', reportsPayload);

        // 2. مزامنة مع home_settings احتياطياً
        try {
            await supabase
                .from('home_settings')
                .upsert(updates, { onConflict: 'tenant_id,setting_key' });
        } catch (e) {
            console.warn('home_settings sync notice:', e);
        }
            
        showToast('تم حفظ وتحديث كافة الإعدادات والمواعيد بالجداول المنظمة بنجاح 🔒💾', 'success');
        await loadTelegramSettings();
    } catch (e) {
        console.error('Error saving Telegram settings:', e);
        showToast('خطأ أثناء حفظ الإعدادات في قاعدة البيانات: ' + (e.message || ''), 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="ph ph-floppy-disk text-lg"></i> حفظ كافة الإعدادات والمواعيد`;
        }
    }
}

// 11. إظهار/إخفاء حقل كلمة المرور أو التوكن
export function togglePasswordVisibility(inputId, btnEl) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isPass = input.type === 'password';
    input.type = isPass ? 'text' : 'password';
    if (btnEl) {
        const icon = btnEl.querySelector('i');
        if (icon) {
            icon.className = isPass ? 'ph ph-eye-slash text-base text-devo-orange' : 'ph ph-eye text-base';
        }
    }
}

// 12. تجربة وإرسال إشعار فحص فوري لبوت التليجرام (المجموعات المختلفة)
export async function testTelegramConnection(targetType = 'all') {
    const tokenInput = document.getElementById('telegram-bot-token');
    const chatInput = document.getElementById('telegram-chat-id');
    const stockChatInput = document.getElementById('telegram-stock-chat-id');
    const reportsChatInput = document.getElementById('telegram-reports-chat-id');
    
    let activeBtn = document.getElementById('test-tg-btn');

    let token = tokenInput ? tokenInput.value.trim() : '';
    let chat = chatInput ? chatInput.value.trim() : '';
    let stockChat = stockChatInput ? stockChatInput.value.trim() : '';
    let reportsChat = reportsChatInput ? reportsChatInput.value.trim() : '';

    // 🔒 إذا كانت الحقول فارغة بالشاشة (محفوظة بالخادم)، نجلبها من قاعدة البيانات
    if (!token || !chat || !stockChat || !reportsChat) {
        try {
            const currentTenantId = getCurrentTenantId();
            let query = supabase
                .from('home_settings')
                .select('setting_key, setting_value')
                .in('setting_key', ['telegram_bot_token', 'telegram_chat_id', 'telegram_stock_chat_id', 'telegram_reports_chat_id']);
                
            if (currentTenantId) query = query.eq('tenant_id', currentTenantId);

            const { data } = await query;
            if (data) {
                const dbSettings = {};
                data.forEach(item => dbSettings[item.setting_key] = item.setting_value);
                if (!token && dbSettings['telegram_bot_token']) token = dbSettings['telegram_bot_token'];
                if (!chat && dbSettings['telegram_chat_id']) chat = dbSettings['telegram_chat_id'];
                if (!stockChat && dbSettings['telegram_stock_chat_id']) stockChat = dbSettings['telegram_stock_chat_id'];
                if (!reportsChat && dbSettings['telegram_reports_chat_id']) reportsChat = dbSettings['telegram_reports_chat_id'];
            }
        } catch (err) {
            console.error('Error fetching saved telegram credentials for test:', err);
        }
    }

    if (!token) {
        showToast('لم يتم العثور على Bot Token، يرجى كتابته أولاً وتجربته أو حفظه', 'warning');
        return;
    }

    const targetChats = [];
    if ((targetType === 'all' || targetType === 'orders') && chat) {
        targetChats.push({ id: chat, name: 'جروب الطلبات 🛍️' });
    }
    if ((targetType === 'all' || targetType === 'stock') && stockChat) {
        targetChats.push({ id: stockChat, name: 'جروب المخزون 📦' });
    }
    if ((targetType === 'all' || targetType === 'reports') && reportsChat) {
        targetChats.push({ id: reportsChat, name: 'جروب التقارير 📊' });
    }

    if (targetChats.length === 0) {
        showToast('يرجى تحديد وكتابة معرف محادثة واحد على الأقل للاختبار', 'warning');
        return;
    }

    const originalBtnHtml = activeBtn ? activeBtn.innerHTML : '';
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-base"></i> جاري فحص الاتصال...`;
    }

    let successCount = 0;
    let errorMsgs = [];

    for (const target of targetChats) {
        try {
            const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: target.id,
                    text: `🧪 <b>رسالة فحص واختبار من سيستم UltraSoft</b>\nتم فحص اتصال بوت التليجرام الخاص بـ (<b>${target.name}</b>) بنجاح! ✅\n\n⏰ <i>التاريخ: ${new Date().toLocaleString('ar-EG')}</i>`,
                    parse_mode: 'HTML'
                })
            });

            const resData = await res.json();
            if (res.ok && resData.ok) {
                successCount++;
            } else {
                errorMsgs.push(`${target.name}: ${resData.description || 'فشل الإرسال'}`);
            }
        } catch (err) {
            errorMsgs.push(`${target.name}: ${err.message || 'فشل الاتصال بخوادم التليجرام'}`);
        }
    }

    if (activeBtn) {
        activeBtn.disabled = false;
        activeBtn.innerHTML = originalBtnHtml;
    }

    if (successCount > 0 && errorMsgs.length === 0) {
        showToast(`تم إرسال رسائل الفحص بنجاح إلى (${successCount}) مجموعة في التليجرام 🚀`, 'success');
    } else if (successCount > 0 && errorMsgs.length > 0) {
        showToast(`تم الإرسال بنجاح لـ ${successCount} محادثة مع تعذر الباقي: ${errorMsgs.join(' | ')}`, 'warning');
    } else {
        showToast('فشل اختبار التليجرام: ' + errorMsgs.join(' | '), 'error');
    }
}

// 13. إنشاء وإرسال التقارير التلقائية والفورية لجروب التقارير وتنبيه جروب الطلبات بالرابط
export async function sendAutomatedReport(reportType = 'daily') {
    const currentTenantId = getCurrentTenantId();
    const btnIdMap = {
        'daily': 'btn-run-daily-report',
        'weekly': 'btn-run-weekly-report',
        'monthly': 'btn-run-monthly-report',
        'annual': 'btn-run-annual-report'
    };
    const targetBtn = document.getElementById(btnIdMap[reportType]);
    const origHtml = targetBtn ? targetBtn.innerHTML : '';
    
    if (targetBtn) {
        targetBtn.disabled = true;
        targetBtn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري التوليد والإرسال...`;
    }

    try {
        // 1. جلب بيانات البوت والجروبات من الجداول المنظمة أولاً ثم البدائل
        const modular = await getTenantModularSettings(currentTenantId);
        const tg = modular?.telegram || {};

        let settings = {};
        try {
            let query = supabase
                .from('home_settings')
                .select('setting_key, setting_value')
                .in('setting_key', [
                    'telegram_bot_token',
                    'telegram_chat_id',
                    'telegram_reports_chat_id',
                    'telegram_reports_group_link',
                    'telegram_reports_enabled',
                    'telegram_enabled'
                ]);

            if (currentTenantId) query = query.eq('tenant_id', currentTenantId);
            const { data: dbRows } = await query;
            if (dbRows) dbRows.forEach(r => settings[r.setting_key] = r.setting_value);
        } catch(e) {}

        // التحقق من الحقول المكتوبة حالياً بالشاشة في حال تم تعديلها ولم تحفظ بعد
        const tokenInput = document.getElementById('telegram-bot-token');
        const chatInput = document.getElementById('telegram-chat-id');
        const repChatInput = document.getElementById('telegram-reports-chat-id');
        const repLinkInput = document.getElementById('telegram-reports-group-link');

        let botToken = (tokenInput && tokenInput.value.trim()) || tg.bot_token || settings['telegram_bot_token'];
        let reportsChatId = (repChatInput && repChatInput.value.trim()) || tg.reports_chat_id || settings['telegram_reports_chat_id'];
        let ordersChatId = (chatInput && chatInput.value.trim()) || tg.general_chat_id || settings['telegram_chat_id'];
        let reportsLink = (repLinkInput && repLinkInput.value.trim()) || tg.reports_group_link || settings['telegram_reports_group_link'];

        // إذا لم يكن التوكن مسجلاً في إعدادات المصنع، نجلب التوكن الموحد من super_admin_telegram_bots
        if (!botToken) {
            try {
                const { data: botRow } = await supabase
                    .from('super_admin_telegram_bots')
                    .select('bot_token')
                    .not('bot_token', 'is', null)
                    .limit(1)
                    .maybeSingle();
                if (botRow && botRow.bot_token) botToken = botRow.bot_token;
            } catch(e) {}
        }

        // إذا لم يكن معرف جروب التقارير مسجلاً للمصنع، نجلب reports_bot من super_admin_telegram_bots
        if (!reportsChatId) {
            try {
                const { data: repBotRow } = await supabase
                    .from('super_admin_telegram_bots')
                    .select('chat_id')
                    .eq('bot_key', 'reports_bot')
                    .maybeSingle();
                if (repBotRow && repBotRow.chat_id) reportsChatId = repBotRow.chat_id;
            } catch(e) {}
        }

        if (!botToken) {
            throw new Error('يرجى كتابة أو حفظ توكن البوت (Bot Token) أولاً');
        }
        if (!reportsChatId) {
            throw new Error('يرجى تحديد وكتابة معرّف جروب التقارير (Reports Chat ID) أولاً');
        }

        // 2. حساب الفترة الزمنية المطلوبة للتقرير
        const now = new Date();
        let startDate = new Date();
        let endDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        let periodDescription = '';

        const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
        const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];

        if (reportType === 'daily') {
            startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
            periodDescription = `${days[now.getDay()]} (${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()})`;
        } else if (reportType === 'weekly') {
            startDate = new Date(now);
            startDate.setDate(startDate.getDate() - 6);
            startDate.setHours(0, 0, 0, 0);
            const startDayName = days[startDate.getDay()];
            const endDayName = days[now.getDay()];
            periodDescription = `من ${startDayName} (${startDate.getDate()} ${months[startDate.getMonth()]}) ⬅️ إلى ${endDayName} (${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()})`;
        } else if (reportType === 'monthly') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
            periodDescription = `${months[now.getMonth()]} ${now.getFullYear()}`;
        } else if (reportType === 'annual') {
            startDate = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);
            periodDescription = `سنة ${now.getFullYear()}`;
        }

        // 3. جلب الأوردرات ومبيعات الفترة المحددة
        let ordersQuery = supabase
            .from('orders')
            .select(`
                id, invoice_number, customer_name, total_price, deposit, status, created_at,
                assigned_admin_name, worker_id,
                order_items (
                    id, quantity, total_price,
                    colors ( name ),
                    models (
                        id, factory_code, name, price,
                        classes ( id, name, class_sizes ( size_id ) ),
                        model_sizes ( size_id )
                    )
                )
            `)
            .gte('created_at', startDate.toISOString())
            .lte('created_at', endDate.toISOString())
            .order('created_at', { ascending: true });

        if (currentTenantId) ordersQuery = ordersQuery.eq('tenant_id', currentTenantId);
        const { data: orders, error: ordersErr } = await ordersQuery;
        if (ordersErr) throw ordersErr;

        // جلب خريطة أسماء الموظفين بأمان
        const workerIds = [...new Set((orders || []).map(o => o.worker_id).filter(Boolean))];
        let userMap = {};
        if (workerIds.length > 0) {
            try {
                const { data: users } = await supabase
                    .from('system_users')
                    .select('id, full_name, username')
                    .in('id', workerIds);
                if (users) users.forEach(u => userMap[u.id] = u.full_name || u.username);
            } catch (uErr) {
                console.warn('System users fetch warning:', uErr);
            }
        }

        // 4. تجميع الإحصائيات الشاملة
        let totalSales = 0;
        let totalDeposits = 0;
        let totalSeriesSold = 0;
        let totalPiecesSold = 0;

        const modelsMap = {};
        const colorsMap = {};
        const staffMap = {};
        const daysMap = {};
        const validOrders = [];

        (orders || []).forEach(o => {
            if (o.status === 'cancelled') return;
            validOrders.push(o);

            const oTotal = parseFloat(o.total_price) || 0;
            const oDep = parseFloat(o.deposit) || 0;
            totalSales += oTotal;
            totalDeposits += oDep;

            // أداء موظفي المبيعات
            const workerName = userMap[o.worker_id] || o.assigned_admin_name || 'مسؤول المبيعات';
            if (!staffMap[workerName]) {
                staffMap[workerName] = { count: 0, sales: 0 };
            }
            staffMap[workerName].count++;
            staffMap[workerName].sales += oTotal;

            // حركة المبيعات اليومية
            const oDate = new Date(o.created_at);
            const dayKey = `${days[oDate.getDay()]} (${oDate.getDate()} ${months[oDate.getMonth()]})`;
            if (!daysMap[dayKey]) {
                daysMap[dayKey] = { dayName: days[oDate.getDay()], count: 0, sales: 0 };
            }
            daysMap[dayKey].count++;
            daysMap[dayKey].sales += oTotal;

            // تفاصيل الأصناف والموديلات والألوان
            if (o.order_items && Array.isArray(o.order_items)) {
                o.order_items.forEach(item => {
                    const qty = item.quantity || 0;
                    totalSeriesSold += qty;

                    const classSizes = item.models?.classes?.class_sizes || [];
                    const sizesCount = classSizes.length > 0 ? classSizes.length : (item.models?.model_sizes?.length || 1);
                    const pcs = qty * sizesCount;
                    totalPiecesSold += pcs;

                    const itemPrice = parseFloat(item.total_price) || (qty * (parseFloat(item.models?.price) || 0));

                    // تجميع الموديلات
                    const mId = item.models?.id || item.models?.name || 'unknown';
                    const mName = item.models?.name || 'موديل بدون اسم';
                    const mCode = item.models?.factory_code || '';
                    if (!modelsMap[mId]) {
                        modelsMap[mId] = { name: mName, code: mCode, series: 0, pieces: 0, revenue: 0 };
                    }
                    modelsMap[mId].series += qty;
                    modelsMap[mId].pieces += pcs;
                    modelsMap[mId].revenue += itemPrice;

                    // تجميع الألوان
                    const colorName = item.colors?.name || 'غير محدد';
                    if (!colorsMap[colorName]) {
                        colorsMap[colorName] = { name: colorName, series: 0, pieces: 0 };
                    }
                    colorsMap[colorName].series += qty;
                    colorsMap[colorName].pieces += pcs;
                });
            }
        });

        const remainingDues = totalSales - totalDeposits;
        const avgOrder = validOrders.length > 0 ? totalSales / validOrders.length : 0;

        // 5. تنسيق أكثر الموديلات طلباً وسحباً
        const sortedModels = Object.values(modelsMap).sort((a, b) => b.series - a.series).slice(0, 7);
        const modelMedals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];
        let modelsText = '';
        if (sortedModels.length > 0) {
            sortedModels.forEach((m, idx) => {
                const medal = modelMedals[idx] || '▫️';
                modelsText += 
                    `${medal} <b>${m.name}</b>\n` +
                    (m.code ? `   • كود: <code>${m.code}</code>\n` : '') +
                    `   • الكمية: <b>${m.series.toLocaleString('ar-EG')} سيري</b> (${m.pieces.toLocaleString('ar-EG')} قطعة)\n` +
                    `   • الإجمالي: <b>${m.revenue.toLocaleString('ar-EG')} ج.م</b>\n\n`;
            });
            modelsText = modelsText.trim();
        } else {
            modelsText = 'لا توجد مبيعات موديلات مسجلة في هذه الفترة';
        }

        // 6. تنسيق أكثر الألوان طلباً
        const sortedColors = Object.values(colorsMap).sort((a, b) => b.series - a.series).slice(0, 5);
        let colorsText = '';
        if (sortedColors.length > 0) {
            sortedColors.forEach(c => {
                colorsText += `▫️ ${c.name}: <b>${c.series.toLocaleString('ar-EG')} سيري</b> (${c.pieces.toLocaleString('ar-EG')} قطعة)\n`;
            });
            colorsText = colorsText.trim();
        } else {
            colorsText = 'لا توجد بيانات ألوان في هذه الفترة';
        }

        // 7. تنسيق أداء موظفي المبيعات
        const sortedStaff = Object.entries(staffMap).sort((a, b) => b[1].sales - a[1].sales);
        let staffText = '';
        if (sortedStaff.length > 0) {
            sortedStaff.forEach(([name, data]) => {
                staffText += `👤 <b>${name}:</b> ${data.count} فواتير • <b>${data.sales.toLocaleString('ar-EG')} ج.م</b>\n`;
            });
            staffText = staffText.trim();
        } else {
            staffText = 'لا توجد فواتير مسجلة للموظفين في هذه الفترة';
        }

        // 8. تنسيق حركة المبيعات اليومية بالأسبوع
        let dailyText = '';
        const daysEntries = Object.entries(daysMap);
        if (reportType === 'weekly' && daysEntries.length > 0) {
            dailyText += `📈 <b>حركة المبيعات اليومية بالأسبوع:</b>\n`;
            let highestDay = null;
            daysEntries.forEach(([dayLabel, data]) => {
                dailyText += `▫️ ${dayLabel}: ${data.count} فواتير • <b>${data.sales.toLocaleString('ar-EG')} ج.م</b>\n`;
                if (!highestDay || data.sales > highestDay.sales) {
                    highestDay = { dayName: data.dayName, sales: data.sales };
                }
            });
            if (highestDay && highestDay.sales > 0) {
                dailyText += `\n🌟 <b>أعلى يوم مبيعاً:</b> ${highestDay.dayName} (<b>${highestDay.sales.toLocaleString('ar-EG')} ج.م</b>)`;
            }
        }

        // 9. جلب اسم المصنع
        let factoryTitle = '';
        if (currentTenantId) {
            try {
                const { data: invRow } = await supabase
                    .from('tenant_invoice_settings')
                    .select('factory_name')
                    .eq('tenant_id', currentTenantId)
                    .maybeSingle();
                if (invRow?.factory_name) factoryTitle = invRow.factory_name;
            } catch (invErr) {}

            if (!factoryTitle) {
                try {
                    const { data: tenantRow } = await supabase
                        .from('tenants')
                        .select('name')
                        .eq('id', currentTenantId)
                        .maybeSingle();
                    if (tenantRow?.name) factoryTitle = tenantRow.name;
                } catch (tErr) {}
            }
        }
        if (!factoryTitle) {
            const hsTitle = document.getElementById('hs-invoice-factory')?.value?.trim();
            factoryTitle = hsTitle || 'المصنع الرئيسي';
        }

        const dateFormatted = `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
        const timeFormatted = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true });

        // 10. تكوين رأس التقرير حسب النوع
        let reportTitle = '';
        let headerBlock = '';
        if (reportType === 'weekly') {
            reportTitle = 'التقرير التنفيذي الشامل للأسبوع';
            headerBlock = 
                `Devo Bot:\n` +
                `📅 <b>${reportTitle}</b>\n` +
                `━━━━━━━━━━━━\n` +
                `🗓️ <b>الفترة:</b> ${periodDescription}\n` +
                `⏰ <b>وقت إصدار التقرير:</b> ${timeFormatted}\n` +
                `🏭 <b>المصنع:</b> <b>${factoryTitle}</b>\n` +
                `━━━━━━━━━━━━\n\n`;
        } else if (reportType === 'daily') {
            reportTitle = 'تقرير المبيعات والعمليات اليومي';
            headerBlock = 
                `Devo Bot:\n` +
                `📊 <b>${reportTitle}</b>\n` +
                `━━━━━━━━━━━━\n` +
                `🗓️ <b>التاريخ:</b> ${periodDescription}\n` +
                `⏰ <b>وقت إصدار التقرير:</b> ${timeFormatted}\n` +
                `🏭 <b>المصنع:</b> <b>${factoryTitle}</b>\n` +
                `━━━━━━━━━━━━\n\n`;
        } else if (reportType === 'monthly') {
            reportTitle = `التقرير المالي والإداري الشامل لشهر ${months[now.getMonth()]}`;
            headerBlock = 
                `Devo Bot:\n` +
                `🗓️ <b>${reportTitle}</b>\n` +
                `━━━━━━━━━━━━\n` +
                `📅 <b>الشهر والسنة:</b> ${periodDescription}\n` +
                `⏰ <b>وقت إصدار التقرير:</b> ${timeFormatted} (${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()})\n` +
                `🏭 <b>المصنع:</b> <b>${factoryTitle}</b>\n` +
                `━━━━━━━━━━━━\n\n`;
        } else {
            reportTitle = `التقرير السنوي الشامل والختامي لسنة ${now.getFullYear()}`;
            headerBlock = 
                `Devo Bot:\n` +
                `🏆 <b>${reportTitle}</b>\n` +
                `━━━━━━━━━━━━\n` +
                `📅 <b>السنة المالية:</b> ${periodDescription}\n` +
                `⏰ <b>وقت إصدار التقرير:</b> ${timeFormatted}\n` +
                `🏭 <b>المصنع:</b> <b>${factoryTitle}</b>\n` +
                `━━━━━━━━━━━━\n\n`;
        }

        // 11. تكوين نص التقرير النهائي المطابق لنموذج النظام التنفيذي
        const reportMessage = 
            headerBlock +
            `💰 <b><u>المؤشرات المالية والكميات:</u></b>\n` +
            `🧾 <b>عدد الفواتير:</b> ${validOrders.length} فاتورة\n` +
            `💵 <b>إجمالي المبيعات:</b> <b>${totalSales.toLocaleString('ar-EG')} ج.م</b>\n` +
            `📥 <b>العرابين المقبوضة:</b> <b>${totalDeposits.toLocaleString('ar-EG')} ج.م</b>\n` +
            `⏳ <b>المتبقي للتحصيل:</b> <b>${remainingDues.toLocaleString('ar-EG')} ج.م</b>\n` +
            `🎯 <b>متوسط الفاتورة:</b> <b>${avgOrder.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ج.م</b>\n` +
            `📦 <b>إجمالي السريات:</b> ${totalSeriesSold.toLocaleString('ar-EG')} سيري\n` +
            `👕 <b>إجمالي القطع:</b> ${totalPiecesSold.toLocaleString('ar-EG')} قطعة\n\n` +
            `🔥 <b><u>أكثر الموديلات طلباً وسحباً:</u></b>\n` +
            `${modelsText}\n\n` +
            `🎨 <b><u>أكثر الألوان طلباً:</u></b>\n` +
            `${colorsText}\n\n` +
            `🏆 <b><u>أداء موظفي المبيعات:</u></b>\n` +
            `${staffText}\n\n` +
            (dailyText ? `${dailyText}\n\n` : '') +
            `━━━━━━━━━━━━\n` +
            `🤖 <i>تم إرسال هذا التقرير آلياً بواسطة بوت تقارير UltraSoft</i>`;

        // إرسال التقرير لجروب التقارير
        const resReport = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: reportsChatId,
                text: reportMessage,
                parse_mode: 'HTML'
            })
        });
        const resReportData = await resReport.json();
        if (!resReport.ok || !resReportData.ok) {
            throw new Error(resReportData.description || 'فشل إرسال التقرير لجروب التقارير');
        }

        // 7. إذا كان هناك رابط لجروب التقارير، نرسل تنبيهاً لجروب الطلبات
        let alertSentText = '';
        if (ordersChatId && reportsLink) {
            try {
                const alertMessage = 
                    `📢 <b>تنبيه إداري: تم إصدار تقرير جديد</b> 📊\n` +
                    `تم إرسال (<b>${reportTitle}</b>) الخاص بـ <b>${factoryTitle}</b> إلى جروب التقارير المعتمد بنجاح! ✅\n\n` +
                    `🔗 <b>رابط التقرير المباشر:</b>\n<a href="${reportsLink}">${reportsLink}</a>\n\n` +
                    `⏰ <i>التاريخ: ${dateFormatted} - ${timeFormatted}</i>`;

                await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        chat_id: ordersChatId,
                        text: alertMessage,
                        parse_mode: 'HTML'
                    })
                });
                alertSentText = ' وتم إرسال تنبيه الرابط لجروب الطلبات 📢';
            } catch (alertErr) {
                console.warn('Could not send notification to orders chat:', alertErr);
            }
        }

        showToast(`تم إرسال ${reportTitle} بنجاح إلى جروب التقارير 📑🚀${alertSentText}`, 'success');
    } catch (err) {
        console.error('Error generating and sending automated report:', err);
        showToast('تعذر إرسال التقرير: ' + (err.message || 'خطأ غير معروف'), 'error');
    } finally {
        if (targetBtn) {
            targetBtn.disabled = false;
            targetBtn.innerHTML = origHtml;
        }
    }
}

// ربط الدوال بنافذة المتصفح لضمان عملها مع عناصر الواجهة
window.loadTelegramSettings = loadTelegramSettings;
window.saveTelegramSettings = saveTelegramSettings;
window.toggleTelegramSettingsCard = function() {
    const el = document.getElementById('view-telegram-settings');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
};
window.testTelegramConnection = testTelegramConnection;
window.sendAutomatedReport = sendAutomatedReport;
window.togglePasswordVisibility = togglePasswordVisibility;

// =========================================================================
// ⏰ 8. مراقب الجدولة التلقائية الفوري (Client-Side Heartbeat Watcher)
// =========================================================================
let reportSchedulerInterval = null;

function startClientReportScheduler() {
    if (reportSchedulerInterval) clearInterval(reportSchedulerInterval);

    reportSchedulerInterval = setInterval(async () => {
        try {
            const now = new Date();
            const currentHours = String(now.getHours()).padStart(2, '0');
            const currentMins = String(now.getMinutes()).padStart(2, '0');
            const currentTimeStr = `${currentHours}:${currentMins}`;
            const currentDayStr = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'][now.getDay()];
            const currentMonthDay = String(now.getDate());
            const isLastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() === now.getDate();
            const currentAnnualDate = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

            // 1. فحص التقرير اليومي
            const dailyEnabled = document.getElementById('report-daily-enabled')?.checked;
            const dailyTime = document.getElementById('report-daily-time')?.value;
            const dailyKey = `sent_auto_daily_${now.toDateString()}_${currentTimeStr}`;
            if (dailyEnabled && dailyTime === currentTimeStr && !sessionStorage.getItem(dailyKey)) {
                sessionStorage.setItem(dailyKey, 'true');
                console.log('⏰ [Automated Scheduler] موعد التقرير اليومي حان الآن، جاري الإرسال التلقائي...');
                await sendAutomatedReport('daily');
            }

            // 2. فحص التقرير الأسبوعي
            const weeklyEnabled = document.getElementById('report-weekly-enabled')?.checked;
            const weeklyDay = document.getElementById('report-weekly-day')?.value;
            const weeklyTime = document.getElementById('report-weekly-time')?.value;
            const weeklyKey = `sent_auto_weekly_${now.getFullYear()}_w${Math.ceil(now.getDate() / 7)}_${currentTimeStr}`;
            if (weeklyEnabled && weeklyDay === currentDayStr && weeklyTime === currentTimeStr && !sessionStorage.getItem(weeklyKey)) {
                sessionStorage.setItem(weeklyKey, 'true');
                console.log('⏰ [Automated Scheduler] موعد التقرير الأسبوعي حان الآن، جاري الإرسال التلقائي...');
                await sendAutomatedReport('weekly');
            }

            // 3. فحص التقرير الشهري
            const monthlyEnabled = document.getElementById('report-monthly-enabled')?.checked;
            const monthlyDay = document.getElementById('report-monthly-day')?.value;
            const monthlyTime = document.getElementById('report-monthly-time')?.value;
            const monthlyKey = `sent_auto_monthly_${now.getFullYear()}_${now.getMonth()}_${currentTimeStr}`;
            const isMonthlyDayMatch = (monthlyDay === currentMonthDay) || (monthlyDay === 'last_day' && isLastDayOfMonth);
            if (monthlyEnabled && isMonthlyDayMatch && monthlyTime === currentTimeStr && !sessionStorage.getItem(monthlyKey)) {
                sessionStorage.setItem(monthlyKey, 'true');
                console.log('⏰ [Automated Scheduler] موعد التقرير الشهري حان الآن، جاري الإرسال التلقائي...');
                await sendAutomatedReport('monthly');
            }

            // 4. فحص التقرير السنوي
            const annualEnabled = document.getElementById('report-annual-enabled')?.checked;
            const annualDate = document.getElementById('report-annual-date')?.value || '12-31';
            const annualTime = document.getElementById('report-annual-time')?.value;
            const annualKey = `sent_auto_annual_${now.getFullYear()}_${currentTimeStr}`;
            if (annualEnabled && annualDate === currentAnnualDate && annualTime === currentTimeStr && !sessionStorage.getItem(annualKey)) {
                sessionStorage.setItem(annualKey, 'true');
                console.log('⏰ [Automated Scheduler] موعد التقرير السنوي حان الآن، جاري الإرسال التلقائي...');
                await sendAutomatedReport('annual');
            }
        } catch (e) {
            console.warn('Report scheduler check warning:', e);
        }
    }, 15000); // الفحص كل 15 ثانية للتأكد من عدم تفويت الدقيقة المحددة
}

// بدء تشغيل المراقب فورياً في الخلفية
startClientReportScheduler();
window.startClientReportScheduler = startClientReportScheduler;


