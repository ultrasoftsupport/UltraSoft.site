import { supabase } from '../config/supabase.js';

// Global cache for current tenant context
let cachedTenant = null;

/**
 * 🔍 1. استخراج الـ Slug الخاص بالمصنع الحالي من اسم النطاق أو الـ Query Parameters
 */
export function getTenantSlugFromURL() {
    const hostname = window.location.hostname;
    const urlParams = new URLSearchParams(window.location.search);

    // 1. التجاوز عبر معلمة ?tenant=slug
    if (urlParams.has('tenant') && urlParams.get('tenant').trim() !== '') {
        const paramTenant = urlParams.get('tenant').trim().toLowerCase();
        if (paramTenant !== '127' && paramTenant !== '127.0.0.1' && paramTenant !== 'localhost') {
            return paramTenant;
        }
    }

    // 2. البيئة المحلية (IP/Localhost) أو نطاقات Vercel (مثال: ultrasoft-phi.vercel.app) بدون معلمة -> المصنع الرئيسي default فوراً
    if (hostname === 'localhost' || hostname === '127.0.0.1' || /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.endsWith('.vercel.app')) {
        return 'default';
    }

    // 3. التحقق مما إذا كان النطاق هو Super Admin
    if (hostname.startsWith('admin.') || window.location.pathname.startsWith('/super-admin')) {
        return 'super_admin';
    }

    // 4. استخراج الـ Subdomain (مثال: nike.ultrasoft.site -> nike)
    const parts = hostname.split('.');
    if (parts.length >= 3) {
        const subdomain = parts[0].toLowerCase();
        if (subdomain !== 'www' && subdomain !== 'app' && subdomain !== 'admin') {
            return subdomain;
        }
    }

    // 5. النمط الافتراضي (المصنع الرئيسي)
    return 'default';
}

/**
 * ⚡ 2. جلب بيانات المصنع الحالي من Supabase وحفظها
 */
export async function initializeTenantContext() {
    try {
        const slug = getTenantSlugFromURL();

        // سياق الـ Super Admin
        if (slug === 'super_admin') {
            cachedTenant = {
                id: null,
                name: 'إدارة ألترا سوفت الشاملة',
                slug: 'super_admin',
                is_super_admin: true
            };
            return cachedTenant;
        }

        // البحث عن بيانات المصنع حسب الـ slug أو custom domain
        const hostname = window.location.hostname;
        const { data: tenant, error } = await supabase
            .from('tenants')
            .select('*, subscriptions(*)')
            .or(`slug.eq.${slug},domain.eq.${hostname},custom_domain.eq.${hostname}`)
            .eq('status', 'active')
            .maybeSingle();

        if (error) {
            console.error('Error fetching tenant context:', error);
        }

        if (tenant) {
            cachedTenant = tenant;
        } else {
            // التراجع للمصنع الافتراضي إن لم يتم العثور عليه
            const { data: defaultTenant } = await supabase
                .from('tenants')
                .select('*, subscriptions(*)')
                .eq('slug', 'default')
                .single();

            cachedTenant = defaultTenant || {
                id: '00000000-0000-0000-0000-000000000001',
                name: 'المصنع الرئيسي',
                slug: 'default'
            };
        }

        // تطبيق الهوية البصرية للمصنع
        applyTenantBranding(cachedTenant);

        return cachedTenant;
    } catch (e) {
        console.error('Failed to initialize tenant context:', e);
        return null;
    }
}

/**
 * 🔑 3. الحصول على معرف المصنع الحالي لاستخدامه في الاستعلامات
 */
export function getCurrentTenantId() {
    if (cachedTenant && cachedTenant.id) {
        return cachedTenant.id;
    }
    return '00000000-0000-0000-0000-000000000001';
}

/**
 * 🏢 4. الحصول على كائن المصنع الحالي بالكامل
 */
export function getCurrentTenant() {
    return cachedTenant;
}

/**
 * 🎨 5. تطبيق الهوية البصرية والخصائص البصرية الخاصة بالمصنع
 */
export function applyTenantBranding(tenant) {
    if (!tenant || tenant.is_super_admin) return;

    // تحديث عنوان الصفحة
    if (tenant.name) {
        const currentTitle = document.title;
        if (!currentTitle.includes(tenant.name)) {
            document.title = `${tenant.name} | ألترا سوفت`;
        }
    }

    const settings = tenant.settings || {};

    // تحديث الشعار إذا وجد عنصر شعار بالموقع
    if (settings.logo_url) {
        const logoElements = document.querySelectorAll('.tenant-logo, #brandLogo, header img');
        logoElements.forEach(el => {
            if (el.tagName === 'IMG') {
                el.src = settings.logo_url;
            }
        });
    }

    // تحديث اسم المصنع بالشريط العلوي أو الصفحة
    if (tenant.name) {
        const nameElements = document.querySelectorAll('.tenant-name, #brandName');
        nameElements.forEach(el => {
            el.textContent = tenant.name;
        });
    }
}

/**
 * 🛑 6. التحقق من حدود اشتراك المصنع (Usage Quota Check)
 */
export function checkTenantQuota(quotaType = 'products', currentCount = 0) {
    if (!cachedTenant || !cachedTenant.subscriptions) return { allowed: true };

    const activeSub = Array.isArray(cachedTenant.subscriptions) 
        ? cachedTenant.subscriptions[0] 
        : cachedTenant.subscriptions;

    if (!activeSub) return { allowed: true };

    if (quotaType === 'products' && activeSub.max_products) {
        if (currentCount >= activeSub.max_products) {
            return {
                allowed: false,
                reason: `لقد وصلت للحد الأقصى للمنتجات المتاحة في باقتك الحالية (${activeSub.max_products} منتج). يرجى الترقية لإضافة المزيد.`
            };
        }
    }

    if (quotaType === 'users' && activeSub.max_users) {
        if (currentCount >= activeSub.max_users) {
            return {
                allowed: false,
                reason: `لقد وصلت للحد الأقصى للمستخدمين المتاحين في باقتك الحالية (${activeSub.max_users} مستخدم). يرجى الترقية.`
            };
        }
    }

    return { allowed: true };
}

/**
 * 🔗 7. بناء رابط موجه حصرياً للمصنع الحالي (Strict Tenant Link Builder)
 */
export function buildTenantUrl(targetPath = '', extraParams = {}) {
    const slug = getTenantSlugFromURL();
    const basePath = targetPath || window.location.pathname;
    const url = new URL(basePath, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);

    const tenantParam = currentParams.get('tenant') || (slug !== 'default' && slug !== 'super_admin' ? slug : null);
    
    if (tenantParam) {
        url.searchParams.set('tenant', tenantParam);
    }

    Object.keys(extraParams).forEach(k => {
        if (extraParams[k] !== undefined && extraParams[k] !== null && extraParams[k] !== '') {
            url.searchParams.set(k, extraParams[k]);
        } else {
            url.searchParams.delete(k);
        }
    });

    return url.toString();
}

export function navigateToTenantPage(targetPath = '', extraParams = {}) {
    window.location.href = buildTenantUrl(targetPath, extraParams);
}
