import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { getCurrentTenantId } from '../../services/tenant_service.js';

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

// 9. جلب إعدادات تليجرام من جدول home_settings
export async function loadTelegramSettings() {
    try {
        const currentTenantId = getCurrentTenantId();
        let query = supabase
            .from('home_settings')
            .select('*')
            .in('setting_key', ['telegram_enabled', 'telegram_stock_enabled', 'web_notifications_enabled', 'telegram_bot_token', 'telegram_chat_id', 'telegram_stock_chat_id']);
            
        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data, error } = await query;
            
        if (error) throw error;
        
        const settings = {};
        if (data) {
            data.forEach(item => settings[item.setting_key] = item.setting_value);
        }
        
        const enabledInput = document.getElementById('telegram-enabled');
        const stockEnabledInput = document.getElementById('telegram-stock-enabled');
        const webNotificationsInput = document.getElementById('web-notifications-enabled');
        const tokenInput = document.getElementById('telegram-bot-token');
        const chatInput = document.getElementById('telegram-chat-id');
        const stockChatInput = document.getElementById('telegram-stock-chat-id');
        
        if (enabledInput) enabledInput.checked = settings['telegram_enabled'] === 'true';
        if (stockEnabledInput) stockEnabledInput.checked = settings['telegram_stock_enabled'] !== 'false';
        if (webNotificationsInput) webNotificationsInput.checked = settings['web_notifications_enabled'] !== 'false';
        
        // 🔒 حماية بيانات البوت الحساسة: عدم إرسال القيم صريحاً للفرونت إند لمنع استخراجها
        if (tokenInput) {
            tokenInput.value = '';
            const hasExistingToken = !!settings['telegram_bot_token'];
            tokenInput.placeholder = hasExistingToken 
                ? '•••••••••••••••• (التوكن محفوظ ومحمى بأمان بالخادم - أدخل توكن جديد فقط للتغيير)' 
                : 'أدخل Bot Token من @BotFather';
        }

        if (chatInput) {
            chatInput.value = '';
            const hasExistingChat = !!settings['telegram_chat_id'];
            chatInput.placeholder = hasExistingChat 
                ? '•••••••••••• (معرّف المحادثة محفوظ بأمان بالخادم - أدخل معرّف جديد فقط للتغيير)' 
                : 'مثال: -100123456789';
        }

        if (stockChatInput) {
            stockChatInput.value = '';
            const hasExistingStockChat = !!settings['telegram_stock_chat_id'];
            stockChatInput.placeholder = hasExistingStockChat 
                ? '•••••••••••• (معرّف المحادثة محفوظ بأمان بالخادم - أدخل معرّف جديد فقط للتغيير)' 
                : 'مثال: -100123456789';
        }
    } catch (e) {
        console.error('Error loading Telegram settings:', e);
    }
}

// 10. حفظ إعدادات تليجرام في جدول home_settings
export async function saveTelegramSettings() {
    const enabledInput = document.getElementById('telegram-enabled');
    const stockEnabledInput = document.getElementById('telegram-stock-enabled');
    const webNotificationsInput = document.getElementById('web-notifications-enabled');
    const tokenInput = document.getElementById('telegram-bot-token');
    const chatInput = document.getElementById('telegram-chat-id');
    const stockChatInput = document.getElementById('telegram-stock-chat-id');
    const btn = document.getElementById('save-tg-btn') || document.getElementById('save-tg-btn-top');
    
    if (!enabledInput || !tokenInput || !chatInput || !stockChatInput) return;
    
    const enabled = enabledInput.checked ? 'true' : 'false';
    const stockEnabled = stockEnabledInput ? (stockEnabledInput.checked ? 'true' : 'false') : 'true';
    const webNotifications = webNotificationsInput ? (webNotificationsInput.checked ? 'true' : 'false') : 'true';
    const token = tokenInput.value.trim();
    const chat = chatInput.value.trim();
    const stockChat = stockChatInput.value.trim();
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = `<i class="ph ph-spinner animate-spin text-base"></i> جاري الحفظ...`;
    }
    
    try {
        const currentTenantId = getCurrentTenantId();
        const updates = [
            { tenant_id: currentTenantId, setting_key: 'telegram_enabled', setting_value: enabled },
            { tenant_id: currentTenantId, setting_key: 'telegram_stock_enabled', setting_value: stockEnabled },
            { tenant_id: currentTenantId, setting_key: 'web_notifications_enabled', setting_value: webNotifications }
        ];

        // 🔒 تحديث البيانات الحساسة فقط إذا قام صاحب الحساب بكتابة قيم جديدة بالحقول
        if (token) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_bot_token', setting_value: token });
        }
        if (chat) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_chat_id', setting_value: chat });
        }
        if (stockChat) {
            updates.push({ tenant_id: currentTenantId, setting_key: 'telegram_stock_chat_id', setting_value: stockChat });
        }
        
        const { error } = await supabase
            .from('home_settings')
            .upsert(updates, { onConflict: 'tenant_id,setting_key' });
            
        if (error) throw error;
        
        showToast('تم حفظ وتحديث إعدادات تليجرام بأمان 🔒💾', 'success');
        await loadTelegramSettings();
    } catch (e) {
        console.error('Error saving Telegram settings:', e);
        showToast('خطأ أثناء حفظ الإعدادات في قاعدة البيانات', 'error');
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<i class="ph ph-floppy-disk text-base"></i> حفظ الإعدادات`;
        }
    }
}

// 11. إظهار/إخفاء لوحة إعدادات التليجرام السرية
export function toggleTelegramSettingsCard() {
    const card = document.getElementById('telegram-settings-card');
    const icon = document.getElementById('tg-lock-icon');
    if (!card || !icon) return;
    
    if (card.classList.contains('hidden')) {
        card.classList.remove('hidden');
        icon.className = 'ph ph-lock-simple-open text-base';
        card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } else {
        card.classList.add('hidden');
        icon.className = 'ph ph-lock text-base';
    }
}

// 12. تجربة وإرسال إشعار فحص فوري لبوت التليجرام (مجموعة الطلبات، المخزون، أو الكل)
export async function testTelegramConnection(targetType = 'all') {
    const tokenInput = document.getElementById('telegram-bot-token');
    const chatInput = document.getElementById('telegram-chat-id');
    const stockChatInput = document.getElementById('telegram-stock-chat-id');
    
    let activeBtn = document.getElementById('test-tg-btn');
    if (targetType === 'orders') activeBtn = document.getElementById('test-tg-orders-btn') || activeBtn;
    if (targetType === 'stock') activeBtn = document.getElementById('test-tg-stock-btn') || activeBtn;

    let token = tokenInput ? tokenInput.value.trim() : '';
    let chat = chatInput ? chatInput.value.trim() : '';
    let stockChat = stockChatInput ? stockChatInput.value.trim() : '';

    // 🔒 إذا كانت القيم فارغة في الشاشة (لأنها محفوطة بأمان في الخادم)، نجلبها من الداتابيز لاختبار الاتصال
    if (!token || (targetType !== 'stock' && !chat) || (targetType !== 'orders' && !stockChat)) {
        try {
            const currentTenantId = getCurrentTenantId();
            let query = supabase
                .from('home_settings')
                .select('setting_key, setting_value')
                .in('setting_key', ['telegram_bot_token', 'telegram_chat_id', 'telegram_stock_chat_id']);
                
            if (currentTenantId) query = query.eq('tenant_id', currentTenantId);

            const { data } = await query;
            if (data) {
                const dbSettings = {};
                data.forEach(item => dbSettings[item.setting_key] = item.setting_value);
                if (!token && dbSettings['telegram_bot_token']) token = dbSettings['telegram_bot_token'];
                if (!chat && dbSettings['telegram_chat_id']) chat = dbSettings['telegram_chat_id'];
                if (!stockChat && dbSettings['telegram_stock_chat_id']) stockChat = dbSettings['telegram_stock_chat_id'];
            }
        } catch (err) {
            console.error('Error fetching saved telegram credentials for test:', err);
        }
    }

    if (!token) {
        showToast('لم يتم العثور على Bot Token محفوظ أو مكتوب، يرجى كتابته أولاً وتجربته أو حفظه', 'warning');
        return;
    }

    const targetChats = [];
    if ((targetType === 'all' || targetType === 'orders') && chat) {
        targetChats.push({ id: chat, name: 'مجموعة الطلبات 🛍️' });
    }
    if ((targetType === 'all' || targetType === 'stock') && stockChat) {
        targetChats.push({ id: stockChat, name: 'مجموعة المخزون 📦' });
    }

    if (targetChats.length === 0) {
        const missingName = targetType === 'orders' ? 'معرّف مجموعة الطلبات (Orders Chat ID)' : (targetType === 'stock' ? 'معرّف مجموعة المخزون (Stock Chat ID)' : 'معرّف محادثة للتجربة');
        showToast(`يرجى كتابة أو حفظ ${missingName} للتجربة`, 'warning');
        return;
    }

    const originalBtnHtml = activeBtn ? activeBtn.innerHTML : '';
    if (activeBtn) {
        activeBtn.disabled = true;
        activeBtn.innerHTML = `<i class="ph ph-spinner animate-spin text-base"></i> جاري الاختبار...`;
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
                    text: `🧪 <b>رسالة فحص واختبار من سيستم UltraSoft</b>\nتم اختبار فحص الاتصال لبوت التليجرام الخاص بـ (<b>${target.name}</b>) بنجاح! ✅\n\n⏰ <i>التاريخ: ${new Date().toLocaleString('ar-EG')}</i>`,
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
        showToast('تم إرسال الرسالة التجريبية بنجاح إلى التليجرام 🚀', 'success');
    } else if (successCount > 0 && errorMsgs.length > 0) {
        showToast(`تم الإرسال بنجاح لـ ${successCount} محادثة مع وجود خطأ: ${errorMsgs.join(' | ')}`, 'warning');
    } else {
        showToast('فشل اختبار التليجرام: ' + errorMsgs.join(' | '), 'error');
    }
}

// Global window bindings for HTML onclick handlers
window.loadTelegramSettings = loadTelegramSettings;
window.saveTelegramSettings = saveTelegramSettings;
window.testTelegramConnection = testTelegramConnection;
