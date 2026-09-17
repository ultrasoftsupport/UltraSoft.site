import { initNavbar } from './navbar.js?v=8.5';
import { initGallery } from './gallery.js?v=8.5';
import { initHomeContent } from './home_content.js?v=8.5';
import { initCart } from './cart.js?v=8.7';
import { initOrdersView } from './orders.js?v=8.7';
import { initBarcode } from './barcode.js?v=8.5';
import { initFooter } from './footer_renderer.js?v=8.5';
import { initLandingPage } from './ultrasoft_landing.js?v=8.5';
import { initUltraSoftMall } from './ultrasoft_mall.js';
import { syncActiveTheme } from '../../services/theme.js';
import { initNetworkStatusMonitor } from '../../components/network_banner.js';
import { initializeTenantContext, getCurrentTenantId, getCurrentTenant, applyTenantBranding } from '../../services/tenant_service.js?v=8.5';
import { initHomeNotifications } from '../../services/notifications.js';
import { getCurrentSession } from '../../services/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 🏢 تهيئة سياق المصنع وتطبيق الهوية البصرية تلقائياً
    await initializeTenantContext();

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