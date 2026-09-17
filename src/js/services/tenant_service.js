import { supabase } from '../config/supabase.js';

// Global cache for current tenant context
let cachedTenant = null;

/**
 * 🔗 تطبيع وضبط روابط الصور (Imgur, Dropbox, Google Drive) لضمان عرضها المباشر بدون حظر أو أخطاء
 */
export function normalizeImageUrl(url) {
    if (!url || typeof url !== 'string') return '';
    let clean = url.trim();
    if (!clean) return '';

    // 1. تحويل روابط Imgur المباشرة أو صفحات المعرض إلى رابط صورة مباشر (.png)
    // يدعم https://imgur.com/3KBQ1cd و https://imgur.com/a/3KBQ1cd و https://i.imgur.com/3KBQ1cd
    const imgurMatch = clean.match(/^https?:\/\/(?:i\.)?imgur\.com\/(?:a\/|gallery\/)?([a-zA-Z0-9]+)(?:\.[a-zA-Z0-9]+)?$/i);
    if (imgurMatch && imgurMatch[1]) {
        return `https://i.imgur.com/${imgurMatch[1]}.png`;
    }

    // 2. تحويل روابط Dropbox العادية لتكون تنزيل/عرض مباشر
    if (clean.includes('dropbox.com')) {
        return clean.replace(/[?&]dl=0/, '?raw=1');
    }

    // 3. تحويل روابط Google Drive
    const gDriveMatch = clean.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
    if (gDriveMatch && gDriveMatch[1]) {
        return `https://drive.google.com/uc?export=view&id=${gDriveMatch[1]}`;
    }

    return clean;
}

const KNOWN_HOSTING_SUFFIXES = [
    'vercel.app',
    'netlify.app',
    'pages.dev',
    'onrender.com',
    'github.io',
    'railway.app',
    'fly.dev',
    'ngrok-free.app',
    'loca.lt'
];

export function isHostingProviderDomain(hostname = window.location.hostname) {
    if (!hostname) return false;
    const lower = hostname.toLowerCase();
    return KNOWN_HOSTING_SUFFIXES.some(suffix => lower === suffix || lower.endsWith('.' + suffix));
}

/**
 * 🔍 1. استخراج الـ Slug الخاص بالمصنع الحالي من اسم النطاق أو الـ Query Parameters
 */
export function getTenantSlugFromURL() {
    // 1. الأولوية الأولى: معلمة ?tenant=xxxx في الرابط
    const urlParams = new URLSearchParams(window.location.search);
    const paramTenant = urlParams.get('tenant')?.trim()?.toLowerCase();
    
    if (paramTenant) {
        if (
            paramTenant !== 'default' && 
            paramTenant !== '127' && 
            paramTenant !== '127.0.0.1' && 
            paramTenant !== 'localhost' &&
            !/^(\d{1,3}\.){3}\d{1,3}$/.test(paramTenant)
        ) {
            return paramTenant;
        }
    }

    const hostname = window.location.hostname;

    // 2. التحقق مما إذا كان النطاق هو Super Admin
    if (hostname.startsWith('admin.') || window.location.pathname.startsWith('/super-admin') || window.location.pathname.includes('super_admin')) {
        return 'super_admin';
    }

    // فحص ما إذا كان العنوان هو IP محلي أو localhost لمنع اعتباره Subdomain خاطئ (مثل 127.0.0.1)
    const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
    const isLocalhost = hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal');
    const isHosting = isHostingProviderDomain(hostname);

    if (!isIpAddress && !isLocalhost) {
        // 3. استخراج الـ Subdomain (مثال: nike.ultrasoft.site -> nike)
        const parts = hostname.split('.');
        // إذا كان النطاق مستضافاً على Vercel أو Netlify، فإن النطاق الأساسي يتكون من 3 أجزاء (مثل project.vercel.app)
        // وبالتالي لا يعتبر Subdomain إلا إذا كان 4 أجزاء أو أكثر (مثل tenant.project.vercel.app)
        const minParts = isHosting ? 4 : 3;
        if (parts.length >= minParts) {
            const subdomain = parts[0].toLowerCase();
            if (subdomain !== 'www' && subdomain !== 'app' && subdomain !== 'admin' && subdomain !== 'default') {
                return subdomain;
            }
        }
    }

    // 4. النمط الافتراضي (المصنع الرئيسي / المنصة)
    return 'default';
}

/**
 * 🧹 تنظيف معلمة tenant المباشرة أو الخاطئة من الـ URL لتكون رابطاً رائداً ونظيفاً
 */
export function cleanDefaultTenantFromURL() {
    try {
        const url = new URL(window.location.href);
        const tenantParam = url.searchParams.get('tenant')?.toLowerCase();
        if (
            tenantParam === 'default' || 
            tenantParam === '127' || 
            tenantParam === '127.0.0.1' || 
            tenantParam === 'localhost' ||
            /^(\d{1,3}\.){3}\d{1,3}$/.test(tenantParam || '')
        ) {
            url.searchParams.delete('tenant');
            const cleanUrl = url.pathname + (url.searchParams.toString() ? '?' + url.searchParams.toString() : '') + url.hash;
            window.history.replaceState({}, document.title, cleanUrl);
        }
    } catch (e) {
        console.warn('Error cleaning tenant from URL:', e);
    }
}

/**
 * ⚡ 2. جلب بيانات المصنع الحالي من Supabase وحفظها
 */
export async function initializeTenantContext() {
    try {
        const rawUrl = new URL(window.location.href);
        const tenantParam = rawUrl.searchParams.get('tenant')?.trim()?.toLowerCase();
        let shouldCleanUrl = false;

        // 1. التجاوز المباشر لمعلمة default أو المحلية
        if (
            tenantParam === 'default' || 
            tenantParam === '127' || 
            tenantParam === '127.0.0.1' || 
            tenantParam === 'localhost' ||
            /^(\d{1,3}\.){3}\d{1,3}$/.test(tenantParam || '')
        ) {
            shouldCleanUrl = true;
        }

        const slug = getTenantSlugFromURL();

        // سياق الـ Super Admin
        if (slug === 'super_admin') {
            cachedTenant = {
                id: null,
                name: 'إدارة ألترا سوفت الشاملة',
                slug: 'super_admin',
                is_super_admin: true
            };
            window.isDefaultOrInvalidTenant = false;
            return cachedTenant;
        }

        const hostname = window.location.hostname;
        const isIpAddress = /^(\d{1,3}\.){3}\d{1,3}$/.test(hostname) || hostname.includes(':');
        const isLocalhost = hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal');
        let tenant = null;

        // البحث الصارم عن بيانات المصنع حسب الـ slug إذا لم يكن slug هو default
        if (slug && slug !== 'default') {
            const { data, error } = await supabase
                .from('tenants')
                .select('*, subscriptions(*)')
                .eq('slug', slug)
                .eq('status', 'active')
                .maybeSingle();

            if (error) {
                console.error('Error fetching tenant context by slug:', error);
            }

            if (data) {
                // فحص تاريخ انتهاء الاشتراك والإيقاف التلقائي للحساب عند انتهاء المدة
                const sub = Array.isArray(data.subscriptions) ? data.subscriptions[0] : data.subscriptions;
                const isExpired = sub && sub.end_date && new Date(sub.end_date) < new Date() && data.slug !== 'default';
                
                if (isExpired) {
                    console.warn(`[Subscription Expired] Tenant ${data.name} subscription ended on ${sub.end_date}.`);
                    data.status = 'suspended';
                    tenant = null; // معاملته كمصنع غير مفعل / منتهي
                } else {
                    tenant = data;
                }
            }
        } else if (!isIpAddress && !isLocalhost) {
            // في بيئة الإنتاج: فحص الـ domain أو custom_domain إذا لم تكن هناك معلّمة slug
            const { data, error } = await supabase
                .from('tenants')
                .select('*, subscriptions(*)')
                .or(`domain.eq.${hostname},custom_domain.eq.${hostname}`)
                .eq('status', 'active')
                .maybeSingle();

            if (data) {
                tenant = data;
            }
        }

        if (tenant) {
            cachedTenant = tenant;
            window.__ultrasoft_active_tenant = tenant;
            window.isDefaultOrInvalidTenant = false;
            window.invalidTenantRequestedSlug = null;
        } else {
            // إذا كان المستخدم طلب مصنعاً محدداً بالرابط ولم يتم العثور عليه
            if (tenantParam && tenantParam !== 'default' && tenantParam !== '127' && tenantParam !== '127.0.0.1' && tenantParam !== 'localhost') {
                window.isDefaultOrInvalidTenant = true;
                window.invalidTenantRequestedSlug = tenantParam;
                try {
                    sessionStorage.removeItem('current_active_tenant_slug');
                } catch(e) {}

                cachedTenant = {
                    id: null,
                    name: `المصنع (${tenantParam}) غير موجود`,
                    slug: tenantParam,
                    is_invalid: true
                };
                window.__ultrasoft_active_tenant = cachedTenant;
            } else {
                // التراجع الطبيعي للمنصة والمصنع الرئيسي
                const { data: defaultTenant } = await supabase
                    .from('tenants')
                    .select('*, subscriptions(*)')
                    .eq('slug', 'default')
                    .maybeSingle();

                cachedTenant = defaultTenant || {
                    id: '00000000-0000-0000-0000-000000000001',
                    name: 'المصنع الرئيسي',
                    slug: 'default'
                };
                window.__ultrasoft_active_tenant = cachedTenant;
                window.isDefaultOrInvalidTenant = false;
                window.invalidTenantRequestedSlug = null;
            }
        }

        // تنظيف معلمة الـ tenant من رابط المتصفح فقط إذا كانت default أو محلية
        if (shouldCleanUrl) {
            try {
                const cleanUrlObj = new URL(window.location.href);
                cleanUrlObj.searchParams.delete('tenant');
                const cleanUrl = cleanUrlObj.pathname + (cleanUrlObj.searchParams.toString() ? '?' + cleanUrlObj.searchParams.toString() : '') + cleanUrlObj.hash;
                window.history.replaceState({}, document.title, cleanUrl);
            } catch (e) {
                console.warn('Error cleaning tenant from URL:', e);
            }
        }

        // تطبيق الهوية البصرية للمصنع
        if (cachedTenant && !cachedTenant.is_invalid) {
            applyTenantBranding(cachedTenant);
        }

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
    const tenant = cachedTenant || window.__ultrasoft_active_tenant;
    if (tenant && tenant.id) {
        return tenant.id;
    }
    return '00000000-0000-0000-0000-000000000001';
}

/**
 * 🔒 مفتاح تخزين محلي معزول تماماً لكل مصنع لضمان عدم التداخل نهائياً
 */
export function getTenantStorageKey(baseKey) {
    const slug = getTenantSlugFromURL();
    const tenant = cachedTenant || window.__ultrasoft_active_tenant;
    let identifier = 'default';
    if (tenant && tenant.slug && tenant.slug !== 'default' && tenant.slug !== '127' && tenant.slug !== '127.0.0.1' && tenant.slug !== 'localhost') {
        identifier = tenant.slug;
    } else if (slug && slug !== 'default' && slug !== '127' && slug !== '127.0.0.1' && slug !== 'localhost') {
        identifier = slug;
    } else if (tenant && tenant.id && tenant.id !== '00000000-0000-0000-0000-000000000001') {
        identifier = tenant.id;
    } else if (tenant && tenant.id) {
        identifier = tenant.id;
    }
    return `${baseKey}_${identifier}`;
}

/**
 * 🏢 4. الحصول على كائن المصنع الحالي بالكامل
 */
export function getCurrentTenant() {
    return cachedTenant || window.__ultrasoft_active_tenant || null;
}

/**
 * 🎨 5. تطبيق الهوية البصرية والخصائص البصرية الخاصة بالمصنع
 */
export function applyTenantBranding(tenant) {
    if (!tenant || tenant.is_super_admin) return;

    const tenantName = tenant.name || '';
    const settings = tenant.settings || {};
    const rawLogo = tenant.logo_url || settings.logo_url;
    const logoUrl = normalizeImageUrl(rawLogo);

    // 1. تحديث عنوان الصفحة
    if (tenantName) {
        const currentTitle = document.title;
        if (!currentTitle.includes(tenantName) && !currentTitle.includes('Super Admin')) {
            document.title = `${tenantName} | ألترا سوفت`;
        }
    }

    // 2. تحديث أيقونة الموقع (Favicon)
    if (logoUrl) {
        let favicon = document.querySelector("link[rel*='icon']");
        if (favicon) {
            favicon.href = logoUrl;
        }
        let appleIcon = document.querySelector("link[rel*='apple-touch-icon']");
        if (appleIcon) {
            appleIcon.href = logoUrl;
        }
    }

    // 3. تحديث جميع عناصر الشعار في الصفحة بالكامل
    if (logoUrl) {
        const logoSelectors = [
            '.tenant-logo',
            '.brand-logo',
            '#brandLogo',
            '#sidebar-logo img',
            '#sidebar-logo-mini img',
            '#dash-factory-logo',
            '#site-header-nav img',
            '#login-container img',
            'header img',
            'footer img.brand-logo'
        ].join(', ');

        const logoElements = document.querySelectorAll(logoSelectors);
        logoElements.forEach(el => {
            if (el.tagName === 'IMG') {
                el.src = logoUrl;
                if (tenantName) el.alt = tenantName;
                el.setAttribute('referrerpolicy', 'no-referrer');
                el.onerror = () => {
                    el.onerror = null;
                    el.src = './logo_transparnt.png';
                };
            }
        });
    }

    // 4. تحديث اسم المصنع في كل العناصر المخصصة
    if (tenantName) {
        const nameSelectors = [
            '.tenant-name',
            '#brandName',
            '#dash-factory-name',
            '#dash-factory-subname',
            '#login-tenant-name',
            '#sidebar-logo span',
            '#sidebar-logo h1',
            '#admin-footer-factory-name',
            '#activeTenantName'
        ].join(', ');

        const nameElements = document.querySelectorAll(nameSelectors);
        nameElements.forEach(el => {
            el.textContent = tenantName;
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
    const rawSlug = getTenantSlugFromURL();
    const slug = (rawSlug === '127' || rawSlug === '127.0.0.1' || rawSlug === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(rawSlug || '')) ? 'default' : rawSlug;
    const basePath = targetPath || window.location.pathname;
    const url = new URL(basePath, window.location.origin);
    const currentParams = new URLSearchParams(window.location.search);

    const rawTenantParam = currentParams.get('tenant');
    const validTenantParam = (rawTenantParam && 
        rawTenantParam !== '127' && 
        rawTenantParam !== '127.0.0.1' && 
        rawTenantParam !== 'localhost' && 
        rawTenantParam !== 'default' &&
        !/^(\d{1,3}\.){3}\d{1,3}$/.test(rawTenantParam)) ? rawTenantParam : null;

    const tenantParam = validTenantParam || (slug && slug !== 'default' && slug !== 'super_admin' ? slug : null);
    
    if (tenantParam) {
        url.searchParams.set('tenant', tenantParam);
    } else {
        url.searchParams.delete('tenant');
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

/**
 * ⚡ 6.1 تفاصيل حدود الموديلات بالمعرض (Model Quota Details)
 */
export async function getTenantModelQuotaDetails(tenantIdParam = null) {
    const tenantId = tenantIdParam || getCurrentTenantId();
    if (!tenantId) {
        return { maxProducts: 99999, totalProducts: 0, activeProducts: 0, remainingActive: 99999, remainingTotal: 99999, isUnlimited: true };
    }

    try {
        const [{ data: subList }, { count: totalProducts }, { count: activeProducts }] = await Promise.all([
            supabase.from('subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
            supabase.from('models').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId),
            supabase.from('models').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId).eq('is_active', true)
        ]);

        const sub = (subList && subList.length > 0) ? subList[0] : {};
        const maxProducts = sub.max_products !== undefined ? (sub.max_products === -1 ? 99999 : sub.max_products) : 500;
        const isUnlimited = sub.max_products === -1 || maxProducts >= 99999;
        
        const currentTotal = totalProducts || 0;
        const currentActive = activeProducts || 0;

        const remainingTotal = isUnlimited ? 99999 : Math.max(0, maxProducts - currentTotal);
        const remainingActive = isUnlimited ? 99999 : Math.max(0, maxProducts - currentActive);

        return {
            maxProducts,
            totalProducts: currentTotal,
            activeProducts: currentActive,
            remainingActive,
            remainingTotal,
            isUnlimited,
            sub
        };
    } catch (err) {
        console.error('Error fetching model quota details:', err);
        return { maxProducts: 500, totalProducts: 0, activeProducts: 0, remainingActive: 500, remainingTotal: 500, isUnlimited: false };
    }
}

/**
 * ⚡ 6.2 تفاصيل حدود المستخدمين (User Quota Details)
 */
export async function getTenantUserQuotaDetails(tenantIdParam = null) {
    const tenantId = tenantIdParam || getCurrentTenantId();
    if (!tenantId) {
        return { maxUsers: 999, totalUsers: 0, remainingTotal: 999, isUnlimited: true };
    }

    try {
        const [{ data: subList }, { count: totalUsers }] = await Promise.all([
            supabase.from('subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
            supabase.from('system_users').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
        ]);

        const sub = (subList && subList.length > 0) ? subList[0] : {};
        const maxUsers = sub.max_users !== undefined ? (sub.max_users === -1 ? 999 : sub.max_users) : 10;
        const isUnlimited = sub.max_users === -1 || maxUsers >= 999;
        const currentTotal = totalUsers || 0;
        const remainingTotal = isUnlimited ? 999 : Math.max(0, maxUsers - currentTotal);

        return {
            maxUsers,
            totalUsers: currentTotal,
            remainingTotal,
            isUnlimited,
            sub
        };
    } catch (err) {
        console.error('Error fetching user quota details:', err);
        return { maxUsers: 10, totalUsers: 0, remainingTotal: 10, isUnlimited: false };
    }
}

/**
 * ⚡ 6.3 تفاصيل حدود الطلبات والفواتير (Order Quota Details)
 */
export async function getTenantOrderQuotaDetails(tenantIdParam = null) {
    const tenantId = tenantIdParam || getCurrentTenantId();
    if (!tenantId) {
        return { maxOrders: 99999, totalOrders: 0, remainingTotal: 99999, isUnlimited: true };
    }

    try {
        const [{ data: subList }, { count: totalOrders }] = await Promise.all([
            supabase.from('subscriptions').select('*').eq('tenant_id', tenantId).order('created_at', { ascending: false }),
            supabase.from('orders').select('id', { count: 'exact', head: true }).eq('tenant_id', tenantId)
        ]);

        const sub = (subList && subList.length > 0) ? subList[0] : {};
        const maxOrders = sub.max_orders !== undefined ? (sub.max_orders === -1 ? 99999 : sub.max_orders) : 1000;
        const isUnlimited = sub.max_orders === -1 || maxOrders >= 99999;
        const currentTotal = totalOrders || 0;
        const remainingTotal = isUnlimited ? 99999 : Math.max(0, maxOrders - currentTotal);

        return {
            maxOrders,
            totalOrders: currentTotal,
            remainingTotal,
            isUnlimited,
            sub
        };
    } catch (err) {
        console.error('Error fetching order quota details:', err);
        return { maxOrders: 1000, totalOrders: 0, remainingTotal: 1000, isUnlimited: false };
    }
}

/**
 * ⚡ 6.4 تفاصيل وقواعد خصم الكريديت (Excel Credits Rules & Rates)
 */
export async function getTenantCreditRules(tenantIdParam = null) {
    const tenantId = tenantIdParam || getCurrentTenantId();
    if (!tenantId) {
        return {
            monthly_excel_credits: 99999,
            consumed_excel_credits: 0,
            remaining_credits: 99999,
            is_unlimited: true,
            bulk_edit_pricing_mode: 'per_item',
            bulk_edit_per_op_cost: 0,
            bulk_edit_per_item_cost: 0,
            bulk_edit_max_cap: 50,
            excel_upload_items_cost: 0,
            excel_upload_stock_cost: 0,
            drive_images_pricing_mode: 'per_operation',
            drive_images_per_op_cost: 0,
            drive_images_per_item_cost: 0,
            drive_images_max_cap: 30
        };
    }

    try {
        const { data, error } = await supabase.rpc('get_tenant_credit_rules', { p_tenant_id: tenantId });
        if (error || !data) throw error || new Error('No credit rules returned');
        return data;
    } catch (err) {
        console.error('Error fetching tenant credit rules:', err);
        return {
            monthly_excel_credits: 200,
            consumed_excel_credits: 0,
            remaining_credits: 200,
            is_unlimited: false,
            bulk_edit_pricing_mode: 'per_item',
            bulk_edit_per_op_cost: 5,
            bulk_edit_per_item_cost: 1,
            bulk_edit_max_cap: 50,
            excel_upload_items_cost: 1,
            excel_upload_stock_cost: 1,
            drive_images_pricing_mode: 'per_operation',
            drive_images_per_op_cost: 10,
            drive_images_per_item_cost: 1,
            drive_images_max_cap: 30
        };
    }
}

/**
 * ⚡ 6.5 حساب التكلفة المطلوبة بالكريديت قبل تنفيذ العملية (تطبيق السقف الأقصى)
 */
export function calculateOperationCredits(operationType, itemsCount, rules) {
    if (!rules || rules.is_unlimited) return 0;

    // ⚡ 1. عمليات رفع الإكسيل لها تكلفة عملية ثابتة مخصصة بالباقة (Colors / Items / Stock Excel)
    if (operationType === 'excel_colors_import') {
        return Number(rules.excel_upload_colors_cost !== undefined ? rules.excel_upload_colors_cost : 5);
    }
    if (operationType === 'excel_models_import') {
        return Number(rules.excel_upload_items_cost !== undefined ? rules.excel_upload_items_cost : 5);
    }
    if (operationType === 'excel_stock_import') {
        return Number(rules.excel_upload_stock_cost !== undefined ? rules.excel_upload_stock_cost : 10);
    }

    // ⚡ 2. عمليات استيراد صور الموديلات من Google Drive (Fixed Per Op أو Per Item + Max Cap)
    if (operationType === 'drive_images_import') {
        const driveMode = rules.drive_images_pricing_mode || 'per_operation';
        if (driveMode === 'per_operation') {
            return Number(rules.drive_images_per_op_cost !== undefined ? rules.drive_images_per_op_cost : 10);
        }
        const items = Math.max(1, itemsCount || 1);
        let rawCost = items * (rules.drive_images_per_item_cost !== undefined ? Number(rules.drive_images_per_item_cost) : 1);
        const maxCap = rules.drive_images_max_cap !== undefined ? Number(rules.drive_images_max_cap) : 30;
        if (maxCap > 0 && rawCost > maxCap) {
            rawCost = maxCap;
        }
        return Number(rawCost.toFixed(2));
    }

    const items = Math.max(1, itemsCount || 1);
    const mode = rules.bulk_edit_pricing_mode || 'per_item';
    const maxCap = rules.bulk_edit_max_cap !== undefined ? Number(rules.bulk_edit_max_cap) : 50;

    // ⚡ 3. التعديلات المجمعة (Bulk Edits) تعتمد على وضع المحاسبة والسقف الأقصى
    if (mode === 'per_operation') {
        return Number(rules.bulk_edit_per_op_cost || 5);
    }

    // mode === 'per_item' لـ bulk_edit
    let rawCost = items * (rules.bulk_edit_per_item_cost || 1);

    // Apply maximum cap ceiling if configured
    if (maxCap > 0 && rawCost > maxCap) {
        rawCost = maxCap;
    }

    return Number(rawCost.toFixed(2));
}

/**
 * ⚡ 6.6 خصم الكريديت وتوثيق العملية بسجل استهلاك الكريديت (Atomic Deduction & Audit Logging)
 */
export async function deductTenantCredits(operationType, locationName, creditsToDeduct, itemsCount, tenantIdParam = null) {
    const activeTenant = getCurrentTenant();
    const tenantId = tenantIdParam || activeTenant?.id || getCurrentTenantId();
    if (!tenantId) return { success: true, remaining: 99999, is_unlimited: true };

    const session = (await supabase.auth.getSession())?.data?.session;
    const userId = session?.user?.id || null;

    let savedUser = null;
    try {
        const activeSlug = getTenantSlugFromURL() || 'default';
        const localSession = localStorage.getItem(`devo_session_${activeSlug}`) || localStorage.getItem('devo_session');
        if (localSession) {
            savedUser = JSON.parse(localSession);
        }
    } catch (e) {}

    let userName = window.currentUser?.full_name 
        || window.currentUserProfile?.full_name 
        || savedUser?.full_name 
        || localStorage.getItem('devo_user_fullname') 
        || localStorage.getItem('devo_user_name');

    if (!userName || userName.includes('@') || userName.toLowerCase() === 'admin') {
        try {
            let query = supabase.from('system_users').select('full_name').limit(1);
            if (userId) {
                query = query.eq('user_id', userId);
            } else if (savedUser?.username) {
                query = query.eq('username', savedUser.username);
            } else if (tenantId) {
                query = query.eq('tenant_id', tenantId).eq('role', 'owner');
            }
            const { data: sysUsers } = await query;
            if (sysUsers && sysUsers.length > 0 && sysUsers[0].full_name) {
                userName = sysUsers[0].full_name;
            }
        } catch (e) {}
    }

    if (!userName) {
        userName = savedUser?.username || session?.user?.email || 'مستخدم النظام';
        if (userName.includes('@')) {
            userName = userName.split('@')[0];
        }
    }

    const rules = await getTenantCreditRules(tenantId);
    let mode = rules.bulk_edit_pricing_mode || 'per_item';
    if (operationType && operationType.startsWith('excel_')) {
        mode = 'per_operation';
    } else if (operationType === 'drive_images_import') {
        mode = rules.drive_images_pricing_mode || 'per_operation';
    }

    const { data, error } = await supabase.rpc('deduct_excel_credits', {
        p_tenant_id: tenantId,
        p_user_id: userId,
        p_user_name: userName,
        p_operation_type: operationType,
        p_location_name: locationName,
        p_credits_to_deduct: creditsToDeduct,
        p_items_count: itemsCount,
        p_pricing_mode: mode
    });

    if (error) {
        console.error('Error deducting excel credits:', error);
        throw error;
    }
    return data;
}

/**
 * ⚡ 6.7 شحن رصيد كريديتس لمصنع من لوحة السوبر أدمن
 */
export async function addCreditsToTenant(tenantId, creditsToAdd, userName = 'Super Admin') {
    if (!tenantId || !creditsToAdd) return { success: false };

    const { data, error } = await supabase.rpc('add_credits_to_tenant', {
        p_tenant_id: tenantId,
        p_credits_to_add: Number(creditsToAdd),
        p_user_name: userName
    });

    if (error) {
        console.error('Error recharging tenant credits:', error);
        throw error;
    }
    return data;
}
