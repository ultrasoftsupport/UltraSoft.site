import { supabase } from '../config/supabase.js';
import { getCurrentTenantId, getTenantSlugFromURL, getCurrentTenant, initializeTenantContext } from './tenant_service.js';

/**
 * 🔑 مفتاح الجلسة المنعزلة بحسب التينانت
 */
export function getTenantSessionKey(slug, tenantId) {
    const activeSlug = slug || getTenantSlugFromURL() || 'default';
    return `devo_session_${activeSlug}`;
}

/**
 * 🔒 تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور عبر Supabase Auth
 * مع حفظ وتخزين الجلسة بصورة منعزلة لكل مصنع لتمكين فتح أكثر من مصنع في جلسات متعددة بالمتصفح
 */
export async function loginUser(usernameInput, password) {
    try {
        const cleanInput = usernameInput.trim().toLowerCase();
        const activeTenant = await initializeTenantContext();
        const currentTenantId = activeTenant?.id || getCurrentTenantId();
        const activeSlug = activeTenant?.slug || getTenantSlugFromURL() || 'default';

        if (!cleanInput || !password) {
            throw new Error('يرجى إدخال اسم المستخدم وكلمة المرور');
        }

        // أ) البحث الحصري بحقل اسم المستخدم (username) فقط داخل مصنع التينانت الحالي
        let query = supabase
            .from('system_users')
            .select('*')
            .eq('username', cleanInput);

        if (activeTenant && activeTenant.slug !== 'super_admin' && activeTenant.slug !== 'default' && currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data: matchedUsers } = await query;

        if (!matchedUsers || matchedUsers.length === 0) {
            throw new Error('هذا الحساب غير موجود بالنظام');
        }

        const targetUser = matchedUsers[0];

        if (!targetUser.is_active) {
            throw new Error('هذا الحساب معطل، يرجى مراجعة الإدارة.');
        }

        // 🔒 حظر الأمان الصارم: تمنع حساب أي مصنع من الدخول في مصنع آخر
        if (targetUser.role !== 'super_admin' && activeTenant && activeTenant.id && activeTenant.slug !== 'default' && activeTenant.slug !== 'super_admin') {
            if (targetUser.tenant_id && targetUser.tenant_id !== activeTenant.id) {
                throw new Error('هذا الحساب غير موجود بالنظام');
            }
        }

        // ب) محاولة تسجيل الدخول عبر Supabase Auth مع دعم RPC Fallback المباشر في حال تسبب GoTrue بـ 500 على auth.users
        const targetEmail = targetUser.email || `${targetUser.username}@staff.devo.internal`;
        
        let isAuthSuccess = false;

        try {
            const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                email: targetEmail,
                password: password
            });

            if (!authError && authData?.user) {
                isAuthSuccess = true;
            }
        } catch (authErr) {
            console.warn('GoTrue Auth endpoint returned exception, attempting direct password verification fallback...');
        }

        if (!isAuthSuccess) {
            // التحقق المباشر من صحة كلمة السر عبر RPC التابع للـ Postgres
            const { data: isValidPassword, error: rpcErr } = await supabase.rpc('verify_system_user_password', {
                p_user_id: targetUser.id,
                p_password: password
            });

            if (isValidPassword === true && !rpcErr) {
                isAuthSuccess = true;
            }
        }

        if (!isAuthSuccess) {
            throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة');
        }

        // جـ) حفظ وتحديث بيانات الجلسة المنعزلة لكل مصنع
        await supabase
            .from('system_users')
            .update({ login_count: (targetUser.login_count || 0) + 1 })
            .eq('id', targetUser.id);

        const sessionData = {
            id: targetUser.id,
            tenant_id: targetUser.tenant_id || currentTenantId,
            username: targetUser.username,
            full_name: targetUser.full_name,
            role: targetUser.role,
            worker_job: targetUser.worker_job,
            tenant_slug: activeSlug
        };

        // 🔑 حفظ الجلسة بصورة منعزلة لكل مصنع لتمكين فتح أكثر من جلسة في نفس الوقت
        localStorage.setItem(`devo_session_${activeSlug}`, JSON.stringify(sessionData));
        if (targetUser.tenant_id) {
            localStorage.setItem(`devo_session_${targetUser.tenant_id}`, JSON.stringify(sessionData));
        }
        localStorage.setItem('devo_session', JSON.stringify(sessionData));

        return { user: sessionData, error: null };
    } catch (error) {
        console.error('Login error:', error.message);
        return { user: null, error };
    }
}

/**
 * 🚪 تسجيل الخروج ومسح الجلسة الخاصة بالمصنع الحالي فقط دون تأثر المصانع الأخرى المفتوحة
 */
export async function logoutUser() {
    try {
        const slug = getTenantSlugFromURL() || 'default';
        const currentTenant = getCurrentTenant();

        localStorage.removeItem(`devo_session_${slug}`);
        if (currentTenant && currentTenant.id) {
            localStorage.removeItem(`devo_session_${currentTenant.id}`);
        }

        // مسح الجلسة العامة إذا كانت تخص هذا المصنع
        const globalSessionStr = localStorage.getItem('devo_session');
        if (globalSessionStr) {
            try {
                const globalSession = JSON.parse(globalSessionStr);
                if (globalSession.tenant_slug === slug || (currentTenant && globalSession.tenant_id === currentTenant.id)) {
                    localStorage.removeItem('devo_session');
                }
            } catch(e) { localStorage.removeItem('devo_session'); }
        }

        await supabase.auth.signOut();
        window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
    } catch (e) {
        console.error('Signout error:', e);
        window.location.href = 'auth.html';
    }
}

/**
 * 🛡️ جلب بيانات المستخدم الحالي المنعزلة للمصنع النشط فقط مع التأكد الصارم من عدم تسريب أو تداخل الجلسات
 */
export function getCurrentSession() {
    const slug = getTenantSlugFromURL() || 'default';
    const currentTenant = getCurrentTenant();
    const currentTenantId = currentTenant?.id || getCurrentTenantId();

    // 1. البحث في الجلسات المنعزلة للمصنع أولاً
    let sessionStr = localStorage.getItem(`devo_session_${slug}`);
    if (!sessionStr && currentTenantId) {
        sessionStr = localStorage.getItem(`devo_session_${currentTenantId}`);
    }
    if (!sessionStr) {
        sessionStr = localStorage.getItem('devo_session');
    }

    if (!sessionStr) return { session: null };
    
    try {
        const session = JSON.parse(sessionStr);
        if (!session || !session.id) return { session: null };

        // 🔒 حاجز العزل والتحقق الصارم: إذا كان الحساب ليس Super Admin ولا ينتمي لهذا المصنع، ترفض الجلسة فوراً لهذا الموقع
        if (session.role !== 'super_admin') {
            if (currentTenantId && session.tenant_id && session.tenant_id !== currentTenantId) {
                console.warn(`[Session Guard] Foreign session blocked. User (${session.username}) belongs to tenant (${session.tenant_id}), but active site is (${currentTenantId}).`);
                return { session: null };
            }
        }

        return { session: { user: session } }; 
    } catch (e) {
        return { session: null };
    }
}

/**
 * 🛡️ حماية الصفحات وتأكيد الصلاحية وعزل المصانع
 */
export function requireAuth(allowedRoles = []) {
    const { session } = getCurrentSession();
    const slug = getTenantSlugFromURL();
    
    if (!session) {
        window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        return null;
    }

    const user = session.user;

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        if (user.role === 'worker') window.location.href = `index.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        else window.location.href = `admin.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        return null;
    }

    return user;
}