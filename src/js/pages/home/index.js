import { initNavbar } from './navbar.js';
import { initGallery } from './gallery.js';
import { initHomeContent } from './home_content.js';
import { initCart } from './cart.js';
import { initOrdersView } from './orders.js';
import { initBarcode } from './barcode.js';
import { initFooter } from './footer_renderer.js';
import { initLandingPage } from './ultrasoft_landing.js';
import { initUltraSoftMall } from './ultrasoft_mall.js';
import { syncActiveTheme } from '../../services/theme.js';
import { initNetworkStatusMonitor } from '../../components/network_banner.js';
import { initializeTenantContext, getCurrentTenantId, getCurrentTenant, applyTenantBranding } from '../../services/tenant_service.js';
import { initHomeNotifications } from '../../services/notifications.js';
import { getCurrentSession } from '../../services/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 🏢 تهيئة سياق المصنع وتطبيق الهوية البصرية تلقائياً
    await initializeTenantContext();

    // في حال تم طلب مصنع غير موجود برابط صريح
    if (window.isDefaultOrInvalidTenant && window.invalidTenantRequestedSlug) {
        document.body.innerHTML = `
            <div class="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-center" dir="rtl">
                <div class="max-w-md w-full bg-slate-900 border border-slate-800 p-8 rounded-3xl shadow-2xl space-y-6">
                    <div class="w-20 h-20 mx-auto rounded-3xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400 text-4xl">
                        <i class="ph ph-buildings"></i>
                    </div>
                    <div class="space-y-2">
                        <h1 class="text-2xl font-black text-white">المصنع غير مسجل أو غير متاح</h1>
                        <p class="text-sm text-slate-400 leading-relaxed">
                            عذراً، المعرف المطلوب <span class="text-sky-400 font-mono font-bold bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">${window.invalidTenantRequestedSlug}</span> غير مرتبط بأي مصنع نشط في المنظومة، أو قد يكون الرابط غير صحيح.
                        </p>
                    </div>
                    <div class="pt-2">
                        <a href="index.html" class="inline-flex items-center justify-center gap-2 w-full py-3.5 px-6 rounded-2xl bg-sky-600 hover:bg-sky-500 text-white font-bold text-sm shadow-lg shadow-sky-600/25 transition-all">
                            <i class="ph ph-house text-lg"></i>
                            <span>العودة لمنصة ألترا سوفت الرئيسية</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
        return;
    }

    // مراقبة وإظهار بنر الاتصال بالإنترنت عند الانقطاع
    initNetworkStatusMonitor();

    // تزامن المظهر النشط من قاعدة البيانات
    await syncActiveTheme();

    // الاستماع لأي تغيير حي في المظهر
    window.addEventListener('ultrasoft:themeChanged', (e) => {
        if (e.detail) {
            import('../../services/theme.js').then(m => m.applyTheme(e.detail));
        }
    });

    // تهيئة واجهة ألتراسوفت التسويقية ومول ألترا سوفت الرقمي
    initLandingPage();
    initUltraSoftMall();
    
    // التحقق من الجلسة وصلاحية البائع/المبيعات المنعزلة لهذا المصنع
    const { session } = getCurrentSession();
    let currentUser = session ? session.user : null;
    
    if (currentUser) {
        const role = currentUser.role;
        const workerJob = currentUser.worker_job;
        
        // التحقق من الصلاحيات الأخرى، إن كانت غير معروفة يتم التعامل كزائر
        const isManager = (role === 'owner' || role === 'admin' || role === 'super_admin');
        const isShowroomSeller = (role === 'worker' && (workerJob === 'showroom' || workerJob === 'both'));
        
        if (!isManager && !isShowroomSeller) {
            currentUser = null;
        }
    }

    // تعيين علامة الزائر عالمياً
    window.isVisitor = !currentUser;

    // تهيئة الهيدر أولاً حتى تكون عناصر الجرس موجودة في الـ DOM قبل تفعيل الإشعارات
    await initNavbar();

    // تهيئة الفوتر والمحتوى والمعرض بشكل توازي سريع
    await Promise.all([
        initFooter(),
        initHomeContent(),
        initGallery()
    ]);

    // 🎨 تطبيق هوية وشعار المصنع فورياً على جميع مكونات الهيدر والفوتر بعد اكتمال بنائها في الـ DOM
    applyTenantBranding(getCurrentTenant());
    
    // تشغيل السلة والباركود للجميع (بما فيهم الزوار)
    initCart();
    initBarcode();

    // تشغيل الأوردرات والإشعارات فقط لفريق العمل والمديرين
    if (!window.isVisitor) {
        await initOrdersView();

        // 🔔 تفعيل نظام الإشعارات الفوري للمستخدمين المسجلين في الصفحة الرئيسية
        // يعمل بعد initNavbar حتى تكون عناصر الجرس موجودة في الـ DOM
        initHomeNotifications();
    }
});