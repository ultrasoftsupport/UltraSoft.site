import { supabase } from '../../config/supabase.js';
import { getCurrentTenantId, getCurrentTenant, getTenantSlugFromURL } from '../../services/tenant_service.js';

export async function initFactorySubscriptionView() {
    const currentTenant = getCurrentTenant();
    const currentTenantId = getCurrentTenantId();
    const currentSlug = getTenantSlugFromURL() || 'default';

    if (!currentTenantId) return;

    try {
        // 1. جلب بيانات الاشتراك الحالية للمصنع من Supabase
        const { data: subList } = await supabase
            .from('subscriptions')
            .select('*')
            .eq('tenant_id', currentTenantId)
            .order('created_at', { ascending: false });

        const sub = (subList && subList.length > 0) ? subList[0] : {};
        const planKey = (sub.plan || 'quarterly').toLowerCase();
        const customLimits = sub.custom_limits || {};
        const instDetails = (sub.installment_details) ? sub.installment_details : (customLimits.installment_details || {});

        // 2. جلب الأعداد الفعلية المستهلكة في قواعد البيانات للمصنع
        const [{ count: productsCount }, { count: usersCount }, { count: ordersCount }] = await Promise.all([
            supabase.from('models').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
            supabase.from('system_users').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId),
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', currentTenantId)
        ]);

        const currentProducts = productsCount || 0;
        const currentUsers = usersCount || 0;
        const currentOrders = ordersCount || 0;

        const maxProducts = sub.max_products !== undefined ? (sub.max_products === -1 ? 99999 : sub.max_products) : 500;
        const maxUsers = sub.max_users !== undefined ? (sub.max_users === -1 ? 999 : sub.max_users) : 10;
        const maxOrders = sub.max_orders !== undefined ? (sub.max_orders === -1 ? 999999 : sub.max_orders) : 5000;
        const maxExcelCredits = sub.monthly_excel_credits ?? customLimits.monthly_excel_credits ?? 200;
        const consumedExcelCredits = customLimits.consumed_excel_credits || 0;

        // 3. تعبئة بيانات شريط الهيدر العلوي
        const planBadge = document.getElementById('sub-view-plan-badge');
        if (planBadge) planBadge.textContent = getPlanTitle(planKey);

        const statusBadge = document.getElementById('sub-view-status-badge');
        const isExpired = sub.end_date && new Date(sub.end_date) < new Date();
        const statusText = isExpired ? 'منتهي' : (sub.status === 'active' ? 'نشط' : 'موقوف');
        if (statusBadge) {
            statusBadge.textContent = statusText;
            statusBadge.className = `px-3.5 py-1 rounded-full text-xs font-black ${statusText === 'نشط' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40' : 'bg-red-500/20 text-red-400 border border-red-500/40'}`;
        }

        // التواريخ والأيام المتبقية
        const startDateStr = sub.start_date ? new Date(sub.start_date).toLocaleDateString('ar-EG') : 'غير محدد';
        const endDateStr = sub.end_date ? new Date(sub.end_date).toLocaleDateString('ar-EG') : 'دائم (بلا تاريخ)';
        
        document.getElementById('sub-view-start-date').textContent = startDateStr;
        document.getElementById('sub-view-end-date').textContent = endDateStr;

        const daysLeftEl = document.getElementById('sub-view-days-left');
        if (daysLeftEl) {
            if (sub.end_date) {
                const diffTime = new Date(sub.end_date) - new Date();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                daysLeftEl.textContent = diffDays > 0 ? `${diffDays} يوماً` : 'منتهي الصلاحية';
                daysLeftEl.className = `font-black font-mono ${diffDays > 15 ? 'text-emerald-400' : 'text-amber-400'}`;
            } else {
                daysLeftEl.textContent = 'اشتراك دائم';
                daysLeftEl.className = 'font-black text-emerald-400 font-mono';
            }
        }

        // شارة ونوع نظام التعاقد والسداد
        const instTextEl = document.getElementById('sub-inst-pill-text');
        if (instTextEl) {
            if (instDetails && instDetails.enabled) {
                instTextEl.textContent = `${instDetails.count || 1} أقساط (${(instDetails.amount || 0).toLocaleString()} ج.م)`;
            } else {
                instTextEl.textContent = 'سداد مباشر (كامل)';
            }
        }

        // 4. تحديث كروت حدود الاستهلاك داخل التبويب الأول (Tab 1: تفاصيل حدود الخطة)
        updateMetricCard('sub-products', currentProducts, maxProducts, 'منتج');
        updateMetricCard('sub-users', currentUsers, maxUsers, 'مستخدم');
        updateMetricCard('sub-orders', currentOrders, maxOrders, 'أوردر');
        updateMetricCard('sub-credits', consumedExcelCredits, maxExcelCredits, 'كريديت');

        // 5. بناء كارت الباقة النشطة (الكود المطابق تماماً لـ landing) وجدول مواصفاتها المخصص داخل التبويب الثاني (Tab 2)
        renderExactActivePricingCard(planKey, maxProducts, maxUsers, maxExcelCredits, maxOrders);
        renderActivePlanDedicatedTable(planKey, maxProducts, maxUsers, maxExcelCredits, maxOrders);

        // 6. ربط زر التوجيه إلى صفحة خطط الأسعار والاشتراكات في landing.html
        const redirectBtn = document.getElementById('btn-redirect-pricing');
        if (redirectBtn) {
            redirectBtn.onclick = () => {
                window.location.href = 'landing.html#pricing';
            };
        }

        // 7. ربط التبديل بين التبويبات الرئيسية العلوية
        setupInnerSubTabs();

    } catch (err) {
        console.error('Error initializing factory subscription view:', err);
    }
}

// دالة تحديث كروت الاستهلاك والنسب وإظهار أزرار التواصل عند الوصول للحد الأقصى
function updateMetricCard(idPrefix, current, max, unitLabel) {
    const textEl = document.getElementById(`${idPrefix}-text`);
    const pctEl = document.getElementById(`${idPrefix}-pct`);
    const remEl = document.getElementById(`${idPrefix}-remaining`);
    const barEl = document.getElementById(`${idPrefix}-bar`);

    if (!textEl || !barEl) return;

    const maxDisplay = (max === 99999 || max === 999999) ? '∞' : max;
    textEl.textContent = `${current.toLocaleString()} / ${maxDisplay.toLocaleString()}`;

    let pct = 0;
    if (max > 0 && max !== 99999 && max !== 999999) {
        pct = Math.min(100, Math.round((current / max) * 100));
    }

    pctEl.textContent = `${pct}%`;
    barEl.style.width = `${pct}%`;

    if (remEl) {
        if (max === 99999 || max === 999999) {
            remEl.textContent = 'غير محدود';
        } else {
            const rem = Math.max(0, max - current);
            remEl.textContent = `متبقي ${rem.toLocaleString()} ${unitLabel}`;
        }
    }

    // إضافة زر تواصل مخصص عند الوصول إلى 90% أو أكثر من الحد (pct >= 90)
    const cardParent = barEl.closest('.bg-devo-dark');
    if (cardParent) {
        let actionBtn = cardParent.querySelector('.quota-card-action-btn');
        if (pct >= 90 && max !== 99999 && max !== 999999) {
            if (!actionBtn) {
                actionBtn = document.createElement('button');
                actionBtn.className = 'quota-card-action-btn w-full mt-3 py-2 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-sm cursor-pointer';
                cardParent.appendChild(actionBtn);
            }

            const tenantName = window.activeTenant?.name || localStorage.getItem('devo_active_tenant_name') || 'المصنع';
            const userName = window.currentUser?.full_name || localStorage.getItem('devo_user_fullname') || 'المالك';

            let labelText = '';
            let waMsg = '';

            if (idPrefix === 'sub-products') {
                labelText = 'طلب زيادة حد المنتجات';
                waMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). أرغب في التفاوض لزيادة حد المنتجات في باقتنا الحالية (الحد الحالي: ${max} منتج).`;
            } else if (idPrefix === 'sub-users') {
                labelText = 'طلب زيادة حد فريق العمل';
                waMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). أرغب في التفاوض لزيادة عدد حسابات فريق العمل في باقتنا الحالية (الحد الحالي: ${max} مستخدم).`;
            } else if (idPrefix === 'sub-orders') {
                labelText = 'طلب زيادة حد الفواتير والطلبات';
                waMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). أرغب في التفاوض لزيادة حد الفواتير والطلبات المتاحة في باقتنا الحالية (الحد الحالي: ${max} طلب).`;
            } else {
                labelText = 'طلب زيادة رصيد الكريديت';
                waMsg = `مرحباً فريق الدعم الفني، أنا ${userName} من (مصنع ${tenantName}). أرغب في التفاوض لزيادة رصيد الكريديت الإكسيل في باقتنا الحالية.`;
            }

            actionBtn.innerHTML = `<i class="ph ph-whatsapp-logo text-base text-emerald-400"></i> <span>${labelText}</span>`;
            actionBtn.onclick = () => {
                window.open(`https://wa.me/201000000000?text=${encodeURIComponent(waMsg)}`, '_blank');
            };
        } else if (actionBtn) {
            actionBtn.remove();
        }
    }
}

// عنوان الخطة باللغة العربية
function getPlanTitle(planKey) {
    switch (planKey) {
        case 'quarterly': return 'باقة البداية الاقتصادية';
        case 'semi_annual': return 'الباقة الأكثر طلباً (6 أشهر)';
        case 'annual': return 'أفضل قيمة وتوفير (سنة كاملة)';
        case 'trial': return 'الباقة التجريبية المجانية';
        default: return 'باقة مخصصة (Custom)';
    }
}

/**
 * 🎨 بناء كارت الباقة النشطة باستخدام نفس كود وتنسيق كروت landing.html بالضبط (Image 2)
 */
function renderExactActivePricingCard(planKey, maxProducts, maxUsers, maxExcelCredits, maxOrders) {
    const container = document.getElementById('active-plan-card-container');
    if (!container) return;

    const isPurple = planKey === 'trial';
    const isEmerald = planKey === 'quarterly';
    const isSky = planKey === 'semi_annual';
    const isAmber = planKey === 'annual';

    let cardHtml = '';

    if (isPurple) {
        cardHtml = `
            <div class="bg-gradient-to-b from-purple-500/15 via-devo-dark to-purple-600/20 border-2 border-purple-500/70 hover:border-purple-400 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                
                <!-- Top Header Badge -->
                <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-purple-500 text-white font-black text-xs shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                    <i class="ph-fill ph-gift text-amber-300"></i>
                    <span>الباقة التجريبية المجانية</span>
                </div>

                <div class="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-purple-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-purple-300 whitespace-nowrap z-10">
                    مجاناً 100%
                </div>

                <div>
                    <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                        <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">تجربة مجانية (5 أيام)</h3>
                        <span class="px-2 py-0.5 rounded-full bg-purple-400 text-slate-950 font-black text-[10px] sm:text-xs whitespace-nowrap shadow-sm">5 أيام تجريبية</span>
                    </div>

                    <div class="mb-5">
                        <div class="flex items-baseline gap-1.5">
                            <span class="text-3xl sm:text-5xl font-black text-purple-400">مجاناً</span>
                            <span class="text-devo-muted text-xs font-bold">(5 أيام تجريبية)</span>
                        </div>
                        <p class="text-[11px] sm:text-xs text-purple-300/90 font-bold mt-1">كافة خصائص ومميزات باقة الـ 6 أشهر مجاناً وبدون أي رسوم لمدة 5 أيام</p>
                    </div>

                    <!-- Spec Box -->
                    <div class="bg-devo-black/80 border border-purple-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">إجمالي الموديلات بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-purple-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 1,500 م (1.9x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">الموديلات النشطة بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-purple-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 600 م (2x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">حد الفواتير المسموح بها:</span>
                            <span class="font-black text-slate-950 bg-purple-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 3,000 ف (2x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">رصيد الرفع والتعديل (Excel):</span>
                            <span class="font-black text-slate-950 bg-purple-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">500 ⚡/ش (1.3x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">مستخدمو فريق العمل:</span>
                            <span class="font-black text-slate-950 bg-purple-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 10 فرد (2.5x)</span>
                        </div>
                    </div>

                    <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-purple-400 text-base shrink-0"></i>
                            <span>تجربة مجانية بالكامل بدون أي رسوم أو فيزا</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-purple-400 text-base shrink-0"></i>
                            <span>كافة خصائص ومميزات باقة الـ 6 أشهر</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-purple-400 text-base shrink-0"></i>
                            <span>حتى 600 موديل نشط بالمعرض</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-purple-400 text-base shrink-0"></i>
                            <span>500 كريديت رفع وتعديل (Excel)</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-purple-400 text-base shrink-0"></i>
                            <span>حتى 10 مستخدمين وفريق عمل كامل</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-purple-400 text-base shrink-0"></i>
                            <span>دعم فني وتدريب كامل خلال فترة التجربة</span>
                        </li>
                    </ul>
                </div>

                <div class="w-full py-3.5 rounded-2xl bg-purple-500 text-white font-black text-xs sm:text-sm text-center flex items-center justify-center gap-2 shadow-lg">
                    <i class="ph-fill ph-check-circle text-amber-300 text-lg"></i>
                    <span>✅ باقتك النشطة حالياً</span>
                </div>
            </div>
        `;
    } else if (isEmerald) {
        cardHtml = `
            <div class="bg-gradient-to-b from-emerald-500/10 via-devo-dark to-emerald-600/15 border-2 border-emerald-500/60 hover:border-emerald-500 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                    <i class="ph-fill ph-sparkle text-slate-950"></i>
                    <span>باقة البداية الاقتصادية</span>
                </div>

                <div>
                    <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                        <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك 3 أشهر</h3>
                        <span class="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] sm:text-xs font-black shadow-sm whitespace-nowrap">ربع سنوي</span>
                    </div>

                    <div class="mb-5">
                        <div class="flex items-baseline gap-1.5">
                            <span class="text-3xl sm:text-5xl font-black text-emerald-400">7,000</span>
                            <span class="text-devo-muted text-xs sm:text-sm font-bold">ج.م</span>
                        </div>
                        <p class="text-[11px] sm:text-xs text-emerald-400 font-bold mt-1">الباقة الأساسية للمحلات والمتاجر الناشئة</p>
                    </div>

                    <!-- Spec Box -->
                    <div class="bg-devo-black/80 border border-emerald-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">إجمالي الموديلات بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 800 م</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">الموديلات النشطة بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 300 م</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">حد الفواتير المسموح بها:</span>
                            <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 1,500 ف</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">رصيد الرفع والتعديل (Excel):</span>
                            <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">400 ⚡/ش</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">مستخدمو فريق العمل:</span>
                            <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 4 فرد</span>
                        </div>
                    </div>

                    <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                            <span>إدارة المعرض وتصدير فواتير A4 والحراري</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                            <span>إشعارات وتنبيهات الأوردرات الفورية</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                            <span>دعم فني وتحديثات دورية مستمرة</span>
                        </li>
                    </ul>
                </div>

                <div class="w-full py-3.5 rounded-2xl bg-emerald-500 text-slate-950 font-black text-xs sm:text-sm text-center flex items-center justify-center gap-2 shadow-lg">
                    <i class="ph-fill ph-check-circle text-slate-950 text-lg"></i>
                    <span>✅ باقتك النشطة حالياً</span>
                </div>
            </div>
        `;
    } else if (isSky) {
        cardHtml = `
            <div class="bg-gradient-to-b from-sky-500/10 via-devo-dark to-sky-600/15 border-2 border-sky-500/60 hover:border-sky-500 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-sky-500 text-white font-black text-xs shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                    <i class="ph-fill ph-rocket text-amber-300"></i>
                    <span>الباقة الأكثر طلباً</span>
                </div>

                <div class="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-sky-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-sky-300 whitespace-nowrap z-10">
                    توفير 28%
                </div>

                <div>
                    <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                        <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك 6 أشهر</h3>
                        <span class="px-2 py-0.5 rounded-full bg-sky-400 text-slate-950 font-black text-[10px] sm:text-xs whitespace-nowrap shadow-sm">نصف سنوي</span>
                    </div>

                    <div class="mb-5">
                        <div class="flex items-baseline gap-1.5">
                            <span class="text-3xl sm:text-5xl font-black text-sky-400">10,000</span>
                            <span class="text-devo-muted text-xs sm:text-sm font-bold">ج.م</span>
                        </div>
                        <p class="text-[11px] sm:text-xs text-sky-400 font-bold mt-1">الباقة المتكاملة لنشاط تجاري متوسط ومتوسع</p>
                    </div>

                    <!-- Spec Box -->
                    <div class="bg-devo-black/80 border border-sky-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">إجمالي الموديلات بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 1,500 م (1.9x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">الموديلات النشطة بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 600 م (2x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">حد الفواتير المسموح بها:</span>
                            <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 3,000 ف (2x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">رصيد الرفع والتعديل (Excel):</span>
                            <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">500 ⚡/ش (1.3x)</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">مستخدمو فريق العمل:</span>
                            <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 10 فرد (2.5x)</span>
                        </div>
                    </div>

                    <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                            <span>جميع مميزات وتسهيلات باقة الـ 3 أشهر</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                            <span>توفير اقتصادي ممتاز بنسبة 28%</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                            <span>تخصيص الشعار والألوان والهوية على الفاتورة</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                            <span>أولوية مرتفعة في الدعم الفني والتدريب</span>
                        </li>
                    </ul>
                </div>

                <div class="w-full py-3.5 rounded-2xl bg-sky-500 text-white font-black text-xs sm:text-sm text-center flex items-center justify-center gap-2 shadow-lg">
                    <i class="ph-fill ph-check-circle text-white text-lg"></i>
                    <span>✅ باقتك النشطة حالياً</span>
                </div>
            </div>
        `;
    } else {
        cardHtml = `
            <div class="bg-gradient-to-b from-amber-500/15 via-devo-dark to-amber-600/20 border-2 border-amber-500/70 hover:border-amber-400 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                    <i class="ph-fill ph-crown text-slate-950"></i>
                    <span>أفضل قيمة وتوفير</span>
                </div>
                <div class="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-amber-300 whitespace-nowrap z-10">
                    خصم 46%
                </div>
                <div>
                    <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                        <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك سنة كاملة</h3>
                        <span class="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] sm:text-xs whitespace-nowrap shadow-sm">توفير 13,000 ج.م</span>
                    </div>

                    <div class="mb-5">
                        <div class="flex items-baseline gap-1.5">
                            <span class="text-3xl sm:text-5xl font-black text-amber-400">15,000</span>
                            <span class="text-devo-muted text-xs sm:text-sm font-bold">ج.م</span>
                        </div>
                        <p class="text-[11px] sm:text-xs text-amber-400/90 font-bold mt-1">الباقة الملكية الشاملة بأعلى مستويات الحدود والتوفير</p>
                    </div>

                    <!-- Spec Box -->
                    <div class="bg-devo-black/80 border border-amber-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">إجمالي الموديلات بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 3,000 م</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">الموديلات النشطة بالمعرض:</span>
                            <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 1,000 م</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">حد الفواتير المسموح بها:</span>
                            <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 10,000 ف</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">رصيد الرفع والتعديل (Excel):</span>
                            <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">2,000 ⚡/ش</span>
                        </div>
                        <div class="flex items-center justify-between text-devo-text gap-2">
                            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">مستخدمو فريق العمل:</span>
                            <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 25 فرد</span>
                        </div>
                    </div>

                    <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                            <span>جميع الخصائص والتسهيلات بلا قيود</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                            <span>أقصى نسبة توفير مالي سنوياً</span>
                        </li>
                        <li class="flex items-center gap-2 text-devo-text font-bold">
                            <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                            <span>أولوية قصوى 24/7 والدعم المباشر</span>
                        </li>
                    </ul>
                </div>

                <div class="w-full py-3.5 rounded-2xl bg-amber-500 text-slate-950 font-black text-xs sm:text-sm text-center flex items-center justify-center gap-2 shadow-lg">
                    <i class="ph-fill ph-check-circle text-slate-950 text-lg"></i>
                    <span>✅ باقتك النشطة حالياً</span>
                </div>
            </div>
        `;
    }

    container.innerHTML = cardHtml;
}

/**
 * 📋 بناء جدول مواصفات ومميزات الباقة الحالية المنفردة (Image 3)
 */
function renderActivePlanDedicatedTable(planKey, maxProducts, maxUsers, maxExcelCredits, maxOrders) {
    const headerEl = document.getElementById('active-table-col-header');
    const tbody = document.getElementById('active-plan-table-tbody');

    if (!headerEl || !tbody) return;

    let planLabel = '';
    let themeColorClass = 'text-emerald-400';

    if (planKey === 'trial') {
        planLabel = 'تجربة مجانية (5 أيام)';
        themeColorClass = 'text-purple-400';
    } else if (planKey === 'quarterly') {
        planLabel = 'اشتراك 3 أشهر (7,000 ج.م)';
        themeColorClass = 'text-emerald-400';
    } else if (planKey === 'semi_annual') {
        planLabel = 'اشتراك 6 أشهر (10,000 ج.م)';
        themeColorClass = 'text-sky-400';
    } else {
        planLabel = 'اشتراك سنة كاملة (15,000 ج.م)';
        themeColorClass = 'text-amber-400';
    }

    headerEl.textContent = planLabel;
    headerEl.className = `p-3.5 text-center font-black ${themeColorClass} bg-devo-black/80 border-r border-devo-gray text-xs sm:text-sm`;

    const specsRows = [
        { title: 'حدود الموديلات النشطة بالمعرض', icon: 'ph-t-shirt text-ultra-400', val: `حتى ${maxProducts === 99999 ? 'غير محدود' : maxProducts.toLocaleString()} موديل` },
        { title: 'إجمالي الموديلات بالمعرض (نشطة + غير نشطة)', icon: 'ph-rows text-sky-400', val: `حتى ${maxProducts === 99999 ? 'غير محدود' : (maxProducts * 2.5).toLocaleString()} موديل` },
        { title: 'حد الفواتير المسموح إنشاؤها', icon: 'ph-receipt text-emerald-400', val: `حتى ${maxOrders === 999999 ? 'غير محدود' : maxOrders.toLocaleString()} فاتورة` },
        { title: 'رصيد الرفع والتعديل المجمع (Excel)', icon: 'ph-file-xls text-purple-400', val: `${maxExcelCredits.toLocaleString()} كريديت / شهرياً` },
        { title: 'حسابات المستخدمين وفريق العمل', icon: 'ph-users text-amber-400', val: `حتى ${maxUsers === 999 ? 'غير محدود' : maxUsers.toLocaleString()} مستخدمين` },
        { title: 'إشعارات المتصفح الفورية والتليجرام', icon: 'ph-paper-plane-tilt text-blue-400', val: 'متاح ✅' },
        { title: 'المزامنة والمشاركة اللحظية على الأجهزة', icon: 'ph-arrows-clockwise text-emerald-400', val: 'متاح ✅' },
        { title: 'تنبيهات نواقص الأصناف والطلبات صوتياً', icon: 'ph-bell-ringing text-amber-400', val: 'متاح ✅' },
        { title: 'تعديل الفواتير والأوردرات وإعادة تحميلها', icon: 'ph-pencil-line text-sky-400', val: 'متاح ✅' },
        { title: 'إسناد الطلبات وتغيير العامل المسؤول', icon: 'ph-user-switch text-purple-400', val: 'متاح ✅' },
        { title: 'تخصيص ألوان الواجهة والمظهر (Themes)', icon: 'ph-palette text-pink-400', val: 'متاح ✅' },
        { title: 'حساب العربون والمتبقي وتقارير الإيداعات', icon: 'ph-hand-coins text-emerald-400', val: 'متاح ✅' },
        { title: 'معرض الموديلات وقارئ الباركود الكاميرا', icon: 'ph-qr-code text-ultra-400', val: 'متاح ✅' },
        { title: 'إدارة المخزن وشحن دفعات الرصيد', icon: 'ph-package text-amber-400', val: 'متاح ✅' },
        { title: 'الفواتير والطباعة (حراري & A4)', icon: 'ph-printer text-sky-400', val: 'متاح ✅' },
        { title: 'الدعم الفني والتدريب', icon: 'ph-headphones text-red-400', val: planKey === 'annual' ? '24/7 طوال الأسبوع' : (planKey === 'semi_annual' ? 'مرتفع' : 'عادي') },
        { title: 'النسخ الاحتياطي واستعادة البيانات', icon: 'ph-database text-teal-400', val: 'تلقائي سحابي ✅' }
    ];

    tbody.innerHTML = specsRows.map(r => `
        <tr class="hover:bg-devo-gray/30 transition">
            <td class="p-3.5 font-bold text-white flex items-center gap-2.5">
                <i class="ph ${r.icon} text-base shrink-0"></i>
                <span>${r.title}</span>
            </td>
            <td class="p-3.5 text-center font-bold ${themeColorClass} bg-devo-black/40 border-r border-devo-gray font-mono">
                ${r.val}
            </td>
        </tr>
    `).join('');
}

// التبديل بين التبويبات الرئيسية
function setupInnerSubTabs() {
    const btns = document.querySelectorAll('.sub-tab-btn');
    btns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            const tabId = e.currentTarget.dataset.tab;

            btns.forEach(b => {
                b.classList.remove('bg-ultra-500/15', 'text-ultra-400', 'border-ultra-500/30', 'font-black');
                b.classList.add('text-devo-muted', 'hover:bg-devo-gray', 'hover:text-white', 'font-bold');
            });

            e.currentTarget.classList.remove('text-devo-muted', 'hover:bg-devo-gray', 'hover:text-white', 'font-bold');
            e.currentTarget.classList.add('bg-ultra-500/15', 'text-ultra-400', 'border-ultra-500/30', 'font-black');

            document.querySelectorAll('.sub-tab-view').forEach(v => v.classList.add('hidden'));
            const targetView = document.getElementById(`sub-view-tab-${tabId}`);
            if (targetView) targetView.classList.remove('hidden');

            if (tabId === 'credits') {
                loadCreditsLogTable();
            }
        });
    });
}

export async function loadCreditsLogTable() {
    const tbody = document.getElementById('sub-credits-log-tbody');
    if (!tbody) return;

    const activeTenant = getCurrentTenant();
    const currentTenantId = activeTenant?.id || getCurrentTenantId();
    if (!currentTenantId) return;

    tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center"><i class="ph ph-spinner animate-spin text-2xl text-purple-400"></i><p class="text-xs text-devo-muted mt-2">جاري تحميل سجل استهلاك الكريديت...</p></td></tr>`;

    try {
        // 1. جلب سجلات جدول الكريديت المباشر
        let excelQuery = supabase.from('excel_credits_log').select('*');
        if (currentTenantId) {
            excelQuery = excelQuery.eq('tenant_id', currentTenantId);
        }
        const { data: excelLogs } = await excelQuery.order('created_at', { ascending: false }).limit(100);

        // 2. جلب سجلات استهلاك الكريديت والفعاليات المرتبطة بالإكسيل والتعديلات المجمعة من سجل النظام
        let auditQuery = supabase.from('system_audit_logs').select('*');
        if (currentTenantId) {
            auditQuery = auditQuery.eq('tenant_id', currentTenantId);
        }
        const { data: auditLogs } = await auditQuery
            .or('module.in.(credits,excel_imports),action_type.in.(bulk_edit,excel_import,recharge)')
            .order('created_at', { ascending: false })
            .limit(100);

        // 3. توحيد ودمج السجلات في مصفوفة واحدة
        const combinedMap = new Map();

        (excelLogs || []).forEach(log => {
            combinedMap.set(`excel_${log.id}`, {
                id: log.id,
                created_at: log.created_at,
                operation_type: log.location_name || log.operation_type || 'استهلاك كريديت',
                user_name: log.user_name,
                credits_deducted: log.credits_deducted || 0,
                remaining_balance_after: log.remaining_balance_after,
                pricing_mode: log.pricing_mode,
                items_count: log.items_count,
                source: 'excel_credits_log'
            });
        });

        (auditLogs || []).forEach(audit => {
            const details = audit.details || {};
            const creditsDeducted = details.credits_deducted || details.credits || details.deducted || details.consumed || 0;
            const remaining = details.remaining_credits || details.remaining_balance || details.remaining || '-';

            let title = details.notes || details.message || details.info || '';
            if (!title) {
                if (audit.action_type === 'bulk_edit') title = 'تعديلات مجمعة للموديلات';
                else if (audit.action_type === 'excel_import') title = 'استيراد بيانات عبر Excel';
                else if (audit.action_type === 'recharge') title = 'شحن رصيد الكريديت';
                else title = 'عملية استهلاك كريديت';
            }

            combinedMap.set(`audit_${audit.id}`, {
                id: audit.id,
                audit_id: audit.id,
                created_at: audit.created_at,
                operation_type: title,
                user_name: audit.user_name,
                credits_deducted: creditsDeducted,
                remaining_balance_after: remaining,
                items_count: details.items_count || details.count || null,
                source: 'system_audit_logs'
            });
        });

        const sortedLogs = Array.from(combinedMap.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        if (sortedLogs.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-devo-muted italic">لا توجد عمليات استهلاك كريديت مسجلة مؤخراً.</td></tr>`;
            return;
        }

        const activeOwnerName = window.currentUserProfile?.full_name 
            || window.currentUser?.full_name 
            || localStorage.getItem('devo_user_fullname');

        tbody.innerHTML = sortedLogs.map(log => {
            const dateStr = new Date(log.created_at).toLocaleString('ar-EG');
            const itemCountLabel = log.items_count ? `${log.items_count} عنصر` : '';
            const modeLabel = log.source === 'excel_credits_log' ? 'سجل الكريديت' : 'سجل الفعاليات';
            const subText = [itemCountLabel, modeLabel].filter(Boolean).join(' • ');

            let displayName = log.user_name || 'مستخدم النظام';
            if ((!displayName || displayName === 'admin' || displayName.includes('admin_') || displayName.includes('@')) && activeOwnerName) {
                displayName = activeOwnerName;
            } else if (displayName.includes('@')) {
                displayName = displayName.split('@')[0];
            }

            const isAddition = log.credits_deducted < 0;
            const creditsText = log.credits_deducted > 0 ? `-${log.credits_deducted} ⚡` : (isAddition ? `+${Math.abs(log.credits_deducted)} ⚡` : 'خصم كريديت ⚡');
            const creditsColorClass = isAddition ? 'text-emerald-400 font-extrabold' : 'text-amber-400 font-black';

            return `
                <tr class="hover:bg-devo-gray/30 transition-colors">
                    <td class="p-3.5 font-mono text-xs text-devo-muted font-bold">${dateStr}</td>
                    <td class="p-3.5">
                        <span class="font-bold text-white block text-sm">${log.operation_type}</span>
                        <span class="text-xs text-devo-muted block mt-0.5">${subText}</span>
                    </td>
                    <td class="p-3.5 text-sm text-white font-extrabold">
                        <div class="flex items-center gap-1.5">
                            <i class="ph-fill ph-user-circle text-amber-400 text-base"></i>
                            <span>${displayName}</span>
                        </div>
                    </td>
                    <td class="p-3.5 text-sm ${creditsColorClass}">
                        ${creditsText}
                    </td>
                    <td class="p-3.5 text-xs text-devo-muted">
                        <div class="flex items-center gap-2">
                            ${log.items_count ? `<span class="px-2.5 py-1 rounded bg-devo-black/60 border border-devo-gray/40 text-devo-orange font-bold text-xs inline-flex items-center gap-1"><i class="ph ph-stack text-amber-400"></i> ${log.items_count} عنصر</span>` : `<span class="px-2.5 py-1 rounded bg-devo-black/40 text-devo-muted font-medium text-xs">عملية مجمعة</span>`}
                            ${log.audit_id ? `
                                <button onclick="window.showAuditLogDetails('${log.audit_id}')" class="px-2.5 py-1 rounded bg-devo-gray/40 hover:bg-devo-orange/20 hover:text-devo-orange text-white text-xs font-bold border border-devo-gray/50 transition-colors inline-flex items-center gap-1">
                                    <i class="ph ph-eye text-sm"></i> التفاصيل
                                </button>
                            ` : ''}
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    } catch (err) {
        console.error('Error loading credits log table:', err);
        tbody.innerHTML = `<tr><td colspan="5" class="p-8 text-center text-red-400 text-xs">تعذر تحميل سجل الكريديت: ${err.message || 'خطأ غير معروف'}</td></tr>`;
    }
}
