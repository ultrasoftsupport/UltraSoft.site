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

        let { data: matchedUsers } = await query;
        let targetUser = (matchedUsers && matchedUsers.length > 0) ? matchedUsers[0] : null;

        if (!targetUser) {
            // 👑 توليد وحقن حساب super_admin تلقائياً إذا لم يكن موجوداً بقاعدة البيانات
            if (cleanInput === 'super_admin') {
                try {
                    await supabase.rpc('create_super_admin_account', {
                        p_username: 'super_admin',
                        p_full_name: 'Super Admin UltraSoft',
                        p_email: 'admin@ultrasoft.com',
                        p_password: password,
                        p_security_pin: '123456'
                    });
                    const { data: retryUsers } = await supabase.from('system_users').select('*').eq('username', 'super_admin');
                    if (retryUsers && retryUsers.length > 0) {
                        targetUser = retryUsers[0];
                    }
                } catch (e) {
                    console.warn('Super admin auto-provision fallback info:', e);
                }
            }

            if (!targetUser) {
                throw new Error('هذا الحساب غير موجود بالنظام');
            }
        }

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

        // جـ) حفظ وتحديث بيانات الجلسة المنعزلة لكل مصنع وسوبر أدمن
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

        if (targetUser.role === 'super_admin') {
            // 👑 مفتاح منفصل ومستقل للجلسة العليا بالسوبر أدمن لعدم تدمير أو مسح جلسات المصانع
            localStorage.setItem('devo_super_admin_session', JSON.stringify(sessionData));
        } else {
            // 🔑 حفظ الجلسة بصورة منعزلة لكل مصنع لتمكين فتح أكثر من جلسة في نفس الوقت
            localStorage.setItem(`devo_session_${activeSlug}`, JSON.stringify(sessionData));
            if (targetUser.tenant_id) {
                localStorage.setItem(`devo_session_${targetUser.tenant_id}`, JSON.stringify(sessionData));
            }
            localStorage.setItem('devo_session', JSON.stringify(sessionData));
        }

        return { user: sessionData, error: null };
    } catch (error) {
        console.error('Login error:', error.message);
        return { user: null, error };
    }
}

/**
 * 🚪 تسجيل الخروج ومسح الجلسة الخاصة بالمصنع الحالي فقط أو السوبر أدمن دون تأثر الجلسات الأخرى
 */
export async function logoutUser() {
    try {
        const isSuperAdminPage = window.location.pathname.includes('super_admin') || window.location.pathname.includes('super_auth');

        if (isSuperAdminPage) {
            localStorage.removeItem('devo_super_admin_session');
            // مسح مفتاح التحقق من الـ PIN أيضاً للسوبر أدمن
            Object.keys(localStorage).forEach(key => {
                if (key.startsWith('devo_super_admin_pin_verified_')) {
                    localStorage.removeItem(key);
                }
            });
            await supabase.auth.signOut();
            window.location.href = 'super_auth.html';
            return;
        }

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
 * 🛡️ جلب بيانات المستخدم الحالي المنعزلة للمصنع النشط أو السوبر أدمن مع التأكد الصارم من عدم تسريب أو تداخل الجلسات
 */
export function getCurrentSession() {
    const isSuperAdminPage = window.location.pathname.includes('super_admin') || window.location.pathname.includes('super_auth');

    if (isSuperAdminPage) {
        const superSessionStr = localStorage.getItem('devo_super_admin_session');
        if (!superSessionStr) return { session: null };
        try {
            const session = JSON.parse(superSessionStr);
            if (!session || session.role !== 'super_admin') return { session: null };
            return { session: { user: session } };
        } catch (e) {
            return { session: null };
        }
    }

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

        // التغافل عن جلسات السوبر أدمن بالصفحات العادية لضمان بقائها للمصانع فقط
        if (session.role === 'super_admin') {
            return { session: null };
        }

        // 🔒 حاجز العزل والتحقق الصارم للمصانع
        if (currentTenantId && session.tenant_id && session.tenant_id !== currentTenantId) {
            console.warn(`[Session Guard] Foreign session blocked. User (${session.username}) belongs to tenant (${session.tenant_id}), but active site is (${currentTenantId}).`);
            return { session: null };
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
    const isSuperAdminRoute = allowedRoles.includes('super_admin') || window.location.pathname.includes('super_admin');
    
    if (!session) {
        if (isSuperAdminRoute) {
            window.location.href = 'super_auth.html';
        } else {
            window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        }
        return null;
    }

    const user = session.user;

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        if (user.role === 'super_admin') {
            window.location.href = 'super_admin.html';
        } else if (user.role === 'worker') {
            window.location.href = `index.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        } else {
            window.location.href = `admin.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        }
        return null;
    }

    return user;
}