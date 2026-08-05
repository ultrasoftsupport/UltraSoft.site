import { initNavbar } from './navbar.js';
import { initGallery } from './gallery.js';
import { initHomeContent } from './home_content.js';
import { initCart } from './cart.js?v=8.0';
import { initOrdersView } from './orders.js?v=8.0';
import { initBarcode } from './barcode.js';
import { initFooter } from './footer_renderer.js';
import { initLandingPage } from './ultrasoft_landing.js';
import { syncActiveTheme } from '../../services/theme.js';
import { initNetworkStatusMonitor } from '../../components/network_banner.js';
import { initializeTenantContext, getCurrentTenantId } from '../../services/tenant_service.js';
import { initHomeNotifications } from '../../services/notifications.js';
import { getCurrentSession } from '../../services/auth.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 🏢 تهيئة سياق المصنع وتطبيق الهوية البصرية تلقائياً
    await initializeTenantContext();

    // مراقبة وإظهار بنر الاتصال بالإنترنت عند الانقطاع
    initNetworkStatusMonitor();

    // تزامن المظهر النشط من قاعدة البيانات
    syncActiveTheme();

    // تهيئة واجهة ألتراسوفت التسويقية والاشتراكات
    initLandingPage();
    
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
    Promise.all([
        initFooter(),
        initHomeContent(),
        initGallery()
    ]);
    
    // تشغيل السلة والأوردرات والباركود فقط لفريق العمل والمديرين
    if (!window.isVisitor) {
        initCart();
        await initOrdersView();
        initBarcode();

        // 🔔 تفعيل نظام الإشعارات الفوري للمستخدمين المسجلين في الصفحة الرئيسية
        // يعمل بعد initNavbar حتى تكون عناصر الجرس موجودة في الـ DOM
        initHomeNotifications();

        const tenantId = getCurrentTenantId() || 'default';
        if (localStorage.getItem(`devo_edit_order_data_${tenantId}`)) {
            if (window.switchSiteView) window.switchSiteView('view-cart');
        }
    }
});