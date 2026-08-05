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
 * 🧹 تنظيف معلمة tenant المباشرة أو الخاطئة من الـ URL لتكون رابطاً رائداً ونظيفاً
 */
export function cleanDefaultTenantFromURL() {
    try {
        const url = new URL(window.location.href);
        const tenantParam = url.searchParams.get('tenant')?.toLowerCase();
        if (tenantParam === 'default' || tenantParam === '127' || tenantParam === '127.0.0.1') {
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
        if (tenantParam === 'default' || tenantParam === '127' || tenantParam === '127.0.0.1') {
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
        let tenant = null;

        // البحث عن بيانات المصنع حسب الـ slug أو custom domain إذا لم يكن slug هو default
        if (slug && slug !== 'default') {
            const { data, error } = await supabase
                .from('tenants')
                .select('*, subscriptions(*)')
                .or(`slug.eq.${slug},domain.eq.${hostname},custom_domain.eq.${hostname}`)
                .eq('status', 'active')
                .maybeSingle();

            if (error) {
                console.error('Error fetching tenant context:', error);
            }

            if (data) {
                // فحص تاريخ انتهاء الاشتراك والإيقاف التلقائي للحساب عند انتهاء المدة
                const sub = Array.isArray(data.subscriptions) ? data.subscriptions[0] : data.subscriptions;
                const isExpired = sub && sub.end_date && new Date(sub.end_date) < new Date() && data.slug !== 'default';
                
                if (isExpired) {
                    console.warn(`[Subscription Expired] Tenant ${data.name} subscription ended on ${sub.end_date}. Auto-suspending.`);
                    data.status = 'suspended';
                    supabase.from('tenants').update({ status: 'suspended' }).eq('id', data.id).then();
                    if (sub) supabase.from('subscriptions').update({ status: 'expired' }).eq('id', sub.id).then();
                    tenant = null; // معاملته كمصنع غير مفعل / منتهي
                } else {
                    tenant = data;
                }
            }
        }

        if (tenant) {
            cachedTenant = tenant;
            window.isDefaultOrInvalidTenant = false;
        } else {
            // التراجع للمصنع الافتراضي إن لم يتم العثور على intent صحيح ومفعل
            if (tenantParam) {
                shouldCleanUrl = true;
            }

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
            window.isDefaultOrInvalidTenant = true;
        }

        // تنظيف معلمة الـ tenant من رابط المتصفح فوراً لإرجاع الرابط إلى النمط الرئيسي النظيف
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
            excel_upload_stock_cost: 0
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
            excel_upload_stock_cost: 1
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

    const items = Math.max(1, itemsCount || 1);
    const mode = rules.bulk_edit_pricing_mode || 'per_item';
    const maxCap = rules.bulk_edit_max_cap !== undefined ? Number(rules.bulk_edit_max_cap) : 50;

    // ⚡ 2. التعديلات المجمعة (Bulk Edits) تعتمد على وضع المحاسبة والسقف الأقصى
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
    const tenantId = tenantIdParam || getCurrentTenantId();
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
