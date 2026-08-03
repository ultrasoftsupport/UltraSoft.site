import { supabase } from '../config/supabase.js';
import { getCurrentTenantId, getTenantSlugFromURL, getCurrentTenant, initializeTenantContext } from './tenant_service.js';

/**
 * تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور عبر Supabase Auth
 * يتم تحويل اسم المستخدم داخلياً إلى بريد إلكتروني وهمي
 */
export async function loginUser(usernameInput, password) {
    try {
        const cleanInput = usernameInput.trim().toLowerCase();
        const activeTenant = await initializeTenantContext();
        const currentTenantId = activeTenant?.id || getCurrentTenantId();

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

        // جـ) حفظ وتحديث بيانات الجلسة
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
            worker_job: targetUser.worker_job
        };
        localStorage.setItem('devo_session', JSON.stringify(sessionData));

        return { user: sessionData, error: null };
    } catch (error) {
        console.error('Login error:', error.message);
        return { user: null, error };
    }
}

/**
 * تسجيل الخروج ومسح الجلسة
 */
export async function logoutUser() {
    try {
        const slug = getTenantSlugFromURL();
        localStorage.removeItem('devo_session');
        await supabase.auth.signOut();
        window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
    } catch (e) {
        console.error('Signout error:', e);
        window.location.href = 'auth.html';
    }
}

/**
 * جلب بيانات المستخدم الحالي من المتصفح
 */
export function getCurrentSession() {
    const sessionStr = localStorage.getItem('devo_session');
    if (!sessionStr) return { session: null };
    
    try {
        const session = JSON.parse(sessionStr);
        return { session: { user: session } }; 
    } catch (e) {
        return { session: null };
    }
}

/**
 * حماية الصفحات وتأكيد الصلاحية وعزل المصانع
 */
export function requireAuth(allowedRoles = []) {
    const { session } = getCurrentSession();
    const slug = getTenantSlugFromURL();
    
    if (!session) {
        window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        return null;
    }

    const user = session.user;
    const currentTenant = getCurrentTenant();

    // 🔒 حاجز الأمان: منع مستخدم مصنع من دخول لوحة مصنع آخر
    if (user.role !== 'super_admin' && currentTenant && currentTenant.id && currentTenant.slug !== 'default' && currentTenant.slug !== 'super_admin') {
        if (user.tenant_id && user.tenant_id !== currentTenant.id) {
            console.warn(`[Tenant Guard] Access denied. Session tenant (${user.tenant_id}) does not match current site tenant (${currentTenant.id}).`);
            localStorage.removeItem('devo_session');
            window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
            return null;
        }
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        if (user.role === 'worker') window.location.href = `index.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        else window.location.href = `admin.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        return null;
    }

    return user;
}