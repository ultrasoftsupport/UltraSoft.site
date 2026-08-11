/**
 * DEVO Custom Confirm & Prompt Dialogs System
 * Replaces native window.confirm() and window.prompt() with sleek, custom DEVO styled dialogs using Promises.
 */

export function confirmDialog(options = {}) {
    let title = 'تأكيد الإجراء';
    let message = 'هل أنت متأكد من القيام بهذا الإجراء؟ لا يمكن التراجع عنه.';
    let confirmText = 'نعم، متأكد';
    let cancelText = 'إلغاء';
    let isDestructive = true;

    if (typeof options === 'string') {
        message = options;
    } else if (typeof options === 'object' && options !== null) {
        if (options.title !== undefined) title = options.title;
        if (options.message !== undefined) message = options.message;
        if (options.confirmText !== undefined) confirmText = options.confirmText;
        if (options.cancelText !== undefined) cancelText = options.cancelText;
        if (options.isDestructive !== undefined) isDestructive = options.isDestructive;
    }

    return new Promise((resolve) => {
        // 1. Create Backdrop
        const backdrop = document.createElement('div');
        backdrop.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[999999] flex items-center justify-center opacity-0 transition-opacity duration-300 p-4';
        
        // 2. Define colors based on action type
        const iconColor = isDestructive ? 'text-devo-error bg-devo-error/10' : 'text-devo-orange bg-devo-orange/10';
        const iconClass = isDestructive ? 'ph-warning-circle' : 'ph-question';
        const btnClass = isDestructive 
            ? 'bg-devo-error hover:bg-red-700 text-white shadow-lg shadow-red-500/20' 
            : 'bg-devo-orange hover:bg-devo-orangeHover text-white shadow-lg shadow-amber-500/20';

        // 3. Formatted Message with line breaks
        const formattedMessage = message.replace(/\n/g, '<br>');

        // 4. Create Modal Content
        const modal = document.createElement('div');
        modal.className = 'bg-devo-dark border border-devo-gray rounded-xl w-full max-w-sm p-6 text-center transform scale-95 transition-transform duration-300 shadow-devo-float';
        
        modal.innerHTML = `
            <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${iconColor}">
                <i class="ph ${iconClass} text-3xl"></i>
            </div>
            <h3 class="text-xl font-bold text-devo-text mb-2 leading-tight">${title}</h3>
            <p class="text-devo-muted mb-6 text-sm leading-relaxed">${formattedMessage}</p>
            <div class="flex justify-center gap-3">
                <button id="devo-cancel-btn" class="px-4 py-2.5 rounded-lg border border-devo-gray text-devo-text hover:bg-devo-gray transition-colors font-medium w-1/2 text-sm">
                    ${cancelText}
                </button>
                <button id="devo-confirm-btn" class="px-4 py-2.5 rounded-lg transition-colors font-medium w-1/2 text-sm ${btnClass}">
                    ${confirmText}
                </button>
            </div>
        `;

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        // 5. Animate In
        requestAnimationFrame(() => {
            setTimeout(() => {
                backdrop.classList.remove('opacity-0');
                modal.classList.remove('scale-95');
            }, 10);
        });

        // 6. Clean up and Resolve logic
        const closeAndResolve = (result) => {
            backdrop.classList.add('opacity-0');
            modal.classList.add('scale-95');
            
            setTimeout(() => {
                backdrop.remove();
                resolve(result);
            }, 300);
        };

        // 7. Event Listeners
        const confirmBtn = modal.querySelector('#devo-confirm-btn');
        const cancelBtn = modal.querySelector('#devo-cancel-btn');

        confirmBtn.addEventListener('click', () => closeAndResolve(true));
        cancelBtn.addEventListener('click', () => closeAndResolve(false));
        
        // Escape key to cancel
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') {
                document.removeEventListener('keydown', handleKeyDown);
                closeAndResolve(false);
            }
        };
        document.addEventListener('keydown', handleKeyDown);

        // Allow clicking outside the modal to cancel
        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) {
                document.removeEventListener('keydown', handleKeyDown);
                closeAndResolve(false);
            }
        });
    });
}

export function promptDialog(options = {}) {
    let title = 'إدخال بيانات';
    let message = '';
    let defaultValue = '';
    let placeholder = '';
    let confirmText = 'تأكيد';
    let cancelText = 'إلغاء';

    if (typeof options === 'string') {
        message = options;
        if (arguments.length > 1 && typeof arguments[1] === 'string') {
            defaultValue = arguments[1];
        }
    } else if (typeof options === 'object' && options !== null) {
        if (options.title !== undefined) title = options.title;
        if (options.message !== undefined) message = options.message;
        if (options.defaultValue !== undefined) defaultValue = options.defaultValue;
        if (options.placeholder !== undefined) placeholder = options.placeholder;
        if (options.confirmText !== undefined) confirmText = options.confirmText;
        if (options.cancelText !== undefined) cancelText = options.cancelText;
    }

    return new Promise((resolve) => {
        const backdrop = document.createElement('div');
        backdrop.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[999999] flex items-center justify-center opacity-0 transition-opacity duration-300 p-4';

        const formattedMessage = message ? message.replace(/\n/g, '<br>') : '';

        const modal = document.createElement('div');
        modal.className = 'bg-devo-dark border border-devo-gray rounded-xl w-full max-w-sm p-6 transform scale-95 transition-transform duration-300 shadow-devo-float';

        modal.innerHTML = `
            <div class="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 text-devo-orange bg-devo-orange/10">
                <i class="ph ph-note-pencil text-3xl"></i>
            </div>
            <h3 class="text-xl font-bold text-devo-text mb-2 text-center leading-tight">${title}</h3>
            ${formattedMessage ? `<p class="text-devo-muted mb-4 text-sm leading-relaxed text-center">${formattedMessage}</p>` : ''}
            <div class="mb-6">
                <input type="text" id="devo-prompt-input" value="${defaultValue}" placeholder="${placeholder}" class="w-full px-4 py-2.5 bg-devo-card border border-devo-gray rounded-lg text-devo-text focus:outline-none focus:border-devo-orange text-sm dir-auto" />
            </div>
            <div class="flex justify-center gap-3">
                <button id="devo-prompt-cancel-btn" class="px-4 py-2.5 rounded-lg border border-devo-gray text-devo-text hover:bg-devo-gray transition-colors font-medium w-1/2 text-sm">
                    ${cancelText}
                </button>
                <button id="devo-prompt-confirm-btn" class="px-4 py-2.5 rounded-lg bg-devo-orange hover:bg-devo-orangeHover text-white transition-colors font-medium w-1/2 text-sm shadow-lg shadow-amber-500/20">
                    ${confirmText}
                </button>
            </div>
        `;

        backdrop.appendChild(modal);
        document.body.appendChild(backdrop);

        const inputEl = modal.querySelector('#devo-prompt-input');

        requestAnimationFrame(() => {
            setTimeout(() => {
                backdrop.classList.remove('opacity-0');
                modal.classList.remove('scale-95');
                inputEl.focus();
                inputEl.select();
            }, 10);
        });

        const closeAndResolve = (value) => {
            backdrop.classList.add('opacity-0');
            modal.classList.add('scale-95');
            setTimeout(() => {
                backdrop.remove();
                resolve(value);
            }, 300);
        };

        const confirmBtn = modal.querySelector('#devo-prompt-confirm-btn');
        const cancelBtn = modal.querySelector('#devo-prompt-cancel-btn');

        confirmBtn.addEventListener('click', () => closeAndResolve(inputEl.value));
        cancelBtn.addEventListener('click', () => closeAndResolve(null));

        inputEl.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                closeAndResolve(inputEl.value);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                closeAndResolve(null);
            }
        });

        backdrop.addEventListener('click', (e) => {
            if (e.target === backdrop) closeAndResolve(null);
        });
    });
}

/**
 * DEVO Subscription Quota Limit & Upgrade Modal
 * Renders a rich, styled dialog when subscription limits (models, users, orders) are hit.
 */
export function showSubscriptionUpgradeModal(options = {}) {
    const quotaType = options.quotaType || (options.title && options.title.includes('فريق') ? 'users' : 'models');
    const limit = options.limit || 'المحدد';

    let title = options.title;
    let badgeText = '';
    let defaultMsg = '';
    let supportBtnText = '';
    let waPreFilledMsg = '';

    const tenantName = window.activeTenant?.name || localStorage.getItem('devo_active_tenant_name') || 'المصنع';
    const userName = window.currentUser?.full_name || localStorage.getItem('devo_user_fullname') || 'المالك';
    
    // Check if user is Owner or Admin vs Worker
    const userRole = window.currentUserRole || window.currentUser?.role || localStorage.getItem('devo_user_role') || '';
    const isOwnerOrAdmin = userRole === 'owner' || userRole === 'admin' || window.location.pathname.includes('admin.html');

    if (quotaType === 'users') {
        title = title || '⚠️ وصول للحد الأقصى لحسابات فريق العمل';
        badgeText = `حد الباقة الحالية: ${limit} مستخدم`;
        defaultMsg = isOwnerOrAdmin
            ? `تعذر إضافة مستخدم جديد: لقد وصلت إلى الحد الأقصى للمستخدمين المتاحين في باقتك الحالية (${limit} مستخدم).`
            : `عفواً، تم الوصول للحد الأقصى لحسابات فريق العمل (${limit} مستخدم). يرجى إبلاغ إدارة المصنع لترقية الباقة.`;
        supportBtnText = 'التواصل مع الدعم للمفاوضة على زيادة فريق العمل';
        waPreFilledMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). أرغب في التفاوض لزيادة عدد حسابات فريق العمل في باقتنا الحالية (الحد الحالي: ${limit} مستخدم). هل يمكن مساعدتي في الترقية؟`;
    } else if (quotaType === 'orders') {
        title = title || '⚠️ وصول للحد الأقصى للطلبات بالفاتورة';
        badgeText = `حد الباقة الحالية: ${limit} طلب`;
        defaultMsg = isOwnerOrAdmin
            ? `لقد وصلت إلى الحد الأقصى للطلبات المسموح بها في باقتك الحالية (${limit} طلب).`
            : `عفواً، تم الوصول للحد الأقصى الصادر من الفواتير والطلبات لباقتكم الحالية (${limit} طلب). يرجى التكرم بطلب ترقية الباقة من إدارة أو مالك المصنع لمواصلة إصدار الفواتير.`;
        supportBtnText = 'التواصل مع الدعم للمفاوضة على زيادة عدد الطلبات';
        waPreFilledMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). أرغب في التفاوض لزيادة حد الفواتير والطلبات المتاحة في باقتنا الحالية (الحد الحالي: ${limit} طلب). هل يمكن مساعدتي في الترقية؟`;
    } else if (quotaType === 'excel_credits') {
        title = title || '⚠️ وصول للحد الأقصى لرصيد الكريديت (Excel)';
        badgeText = `رصيد الكريديت المتاح: ${limit} كريديت`;
        defaultMsg = isOwnerOrAdmin
            ? `لقد نفذ رصيد الكريديت المتاح لعمليات استيراد الإكسيل والتعديلات المجمعة في باقتك الحالية (${limit} كريديت).`
            : `عفواً، رصيد الكريديت المتاح للاستيراد والتعديلات المجمعة غير كافٍ. يرجى إبلاغ إدارة المصنع لشراء أو شحن كريديت جديد.`;
        supportBtnText = 'التواصل مع الدعم للحصول على دفعة كريديت إضافية';
        waPreFilledMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). لقد نفذ رصيد الكريديت الإكسيل والتعديلات المجمعة المتاح في باقتنا الحالية (الرصيد المتبقي: ${limit} كريديت). أرغب في التفاوض للحصول على دفعة إضافية من الكريديت لمواصلة العمل.`;
    } else {
        // Default: 'models'
        title = title || '⚠️ وصول للحد الأقصى لخطة الاشتراك للموديلات';
        badgeText = `حد الباقة الحالية: ${limit} موديل`;
        defaultMsg = isOwnerOrAdmin
            ? `لقد وصلت إلى الحد الأقصى للموديلات المتاحة في باقتك الحالية (${limit} موديل).`
            : `عفواً، تم الوصول للحد الأقصى للموديلات بالباقة الحالية (${limit} موديل). يرجى إبلاغ إدارة المصنع لترقية الباقة.`;
        supportBtnText = 'التواصل مع الدعم للمفاوضة على زيادة الموديلات';
        waPreFilledMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). أرغب في التفاوض لزيادة حد الموديلات المتاحة في باقتنا الحالية (الحد الحالي: ${limit} موديل). هل يمكن مساعدتي في الترقية؟`;
    }

    const message = options.message || defaultMsg;

    const existing = document.getElementById('devo-subscription-quota-modal');
    if (existing) existing.remove();

    const backdrop = document.createElement('div');
    backdrop.id = 'devo-subscription-quota-modal';
    backdrop.className = 'fixed inset-0 bg-black/80 backdrop-blur-md z-[9999] flex items-center justify-center opacity-0 transition-opacity duration-300 p-4';

    const modal = document.createElement('div');
    modal.className = 'bg-devo-dark border border-amber-500/30 rounded-2xl w-full max-w-md p-6 text-center transform scale-95 transition-transform duration-300 shadow-2xl relative overflow-hidden';

    let extraCallToAction = '';
    if (isOwnerOrAdmin) {
        if (quotaType === 'users') {
            extraCallToAction = 'لإضافة وتفعيل المزيد من **حسابات فريق العمل** وتوسيع فريقك، يمكنك **ترقية باقتك إلى خطة أعلى** أو **التواصل مع فريق المبيعات والدعم الفني** للتفاوض على زيادة سعة المستخدمين.';
        } else if (quotaType === 'orders') {
            extraCallToAction = 'لإصدار وتجهيز المزيد من **الفواتير والطلبات**، يمكنك **ترقية باقتك إلى خطة أعلى** أو **التواصل مع فريق المبيعات والدعم الفني** للتفاوض على زيادة سعة الطلبات.';
        } else if (quotaType === 'excel_credits') {
            extraCallToAction = 'لمواصلة **استيراد ملفات الإكسيل وتنفيذ التعديلات المجمعة**، يمكنك **ترقية باقتك إلى خطة أعلى** أو **التواصل المباشر مع فريق المبيعات والدعم الفني** للحصول على دفعة إضافية من الكريديت.';
        } else {
            extraCallToAction = 'لإضافة وتفعيل المزيد من **الموديلات** وتوسيع خطك الإنتاجي، يمكنك **ترقية باقتك إلى خطة أعلى** أو **التواصل مع فريق المبيعات والدعم الفني** للتفاوض على زيادة سعة الموديلات.';
        }
    }

    modal.innerHTML = `
        <div class="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-600"></div>

        <div class="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-amber-500/10">
            <i class="ph ph-crown-simple text-4xl animate-bounce"></i>
        </div>

        <h3 class="text-xl font-extrabold text-white mb-2 leading-snug">${title}</h3>
        
        <!-- High Contrast Crystal Clear Badge -->
        <div class="inline-flex items-center gap-2 bg-amber-950/90 border border-amber-500/60 text-amber-300 text-xs px-4 py-1.5 rounded-full font-bold mb-4 shadow-md">
            <i class="ph ph-warning-circle text-amber-400 text-base"></i>
            <span class="text-amber-200 font-extrabold">${badgeText}</span>
        </div>

        <p class="text-devo-muted text-sm leading-relaxed mb-6">
            ${message}
            ${extraCallToAction ? `<br><br>${extraCallToAction}` : ''}
        </p>

        <div class="space-y-3">
            ${isOwnerOrAdmin ? `
            <button id="devo-quota-upgrade-btn" class="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-white font-bold text-sm shadow-lg shadow-amber-500/25 transition-all flex items-center justify-center gap-2 group">
                <i class="ph ph-sparkle text-lg group-hover:rotate-12 transition-transform"></i>
                <span>ترقية الباقة واختيار خطة أعلى</span>
            </button>

            <button id="devo-quota-support-btn" class="w-full py-2.5 px-4 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-semibold text-sm transition-all flex items-center justify-center gap-2">
                <i class="ph ph-whatsapp-logo text-lg text-emerald-400"></i>
                <span>${supportBtnText}</span>
            </button>
            ` : ''}

            <button id="devo-quota-close-btn" class="w-full py-2 px-4 text-xs font-medium text-devo-muted hover:text-white transition-colors">
                إغلاق النافذة
            </button>
        </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    requestAnimationFrame(() => {
        setTimeout(() => {
            backdrop.classList.remove('opacity-0');
            modal.classList.remove('scale-95');
        }, 10);
    });

    const closeModal = () => {
        backdrop.classList.add('opacity-0');
        modal.classList.add('scale-95');
        setTimeout(() => backdrop.remove(), 300);
    };

    modal.querySelector('#devo-quota-close-btn')?.addEventListener('click', closeModal);
    
    modal.querySelector('#devo-quota-upgrade-btn')?.addEventListener('click', () => {
        closeModal();
        window.location.href = 'landing.html#pricing';
    });

    modal.querySelector('#devo-quota-support-btn')?.addEventListener('click', () => {
        closeModal();
        const waUrl = `https://wa.me/201000000000?text=${encodeURIComponent(waPreFilledMsg)}`;
        window.open(waUrl, '_blank');
    });

    backdrop.addEventListener('click', (e) => {
        if (e.target === backdrop) closeModal();
    });
}

// Attach to window object for global access
window.confirmDialog = confirmDialog;
window.promptDialog = promptDialog;
window.showSubscriptionUpgradeModal = showSubscriptionUpgradeModal;