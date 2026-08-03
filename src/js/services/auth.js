import { supabase } from '../config/supabase.js';
import { getCurrentTenantId, getTenantSlugFromURL, getCurrentTenant } from './tenant_service.js';

/**
 * تسجيل الدخول باستخدام اسم المستخدم وكلمة المرور عبر Supabase Auth
 * يتم تحويل اسم المستخدم داخلياً إلى بريد إلكتروني وهمي
 */
export async function loginUser(username, password) {
    try {
        const cleanInput = username.trim().toLowerCase();
        const slug = getTenantSlugFromURL();
        // بناء قائمة الاحتمالات الذكية للبريد الإلكتروني الخاص بالتسجيل
        const candidateEmails = [];

        if (cleanInput.includes('@')) {
            candidateEmails.push(cleanInput);
            candidateEmails.push(cleanInput + '@staff.devo.internal');
        } else {
            candidateEmails.push(cleanInput + '@staff.devo.internal');
            if (slug && slug !== 'default' && slug !== 'super_admin') {
                candidateEmails.push(`admin@${slug}.com`);
                candidateEmails.push(`${cleanInput}@${slug}.com`);
            }
        }

        let authData = null;
        let authError = null;

        const uniqueEmails = [...new Set(candidateEmails)];
        for (const emailToTry of uniqueEmails) {
            const res = await supabase.auth.signInWithPassword({
                email: emailToTry,
                password: password
            });

            if (!res.error && res.data?.user) {
                authData = res.data;
                authError = null;
                break;
            }
            authError = res.error;
        }

        if (!authData || authError) {
            throw new Error(authError?.message === 'Invalid login credentials' 
                ? 'اسم المستخدم أو كلمة المرور غير صحيحة' 
                : (authError?.message || 'اسم المستخدم أو كلمة المرور غير صحيحة'));
        }

        const authUser = authData.user;

        // جلب بيانات الموظف والصلاحيات من جدول system_users
        let { data: user, error: profileError } = await supabase
            .from('system_users')
            .select('*')
            .eq('id', authUser.id)
            .maybeSingle();

        if (!user && authUser.email) {
            const { data: fallbackUser } = await supabase
                .from('system_users')
                .select('*')
                .eq('email', authUser.email.toLowerCase())
                .maybeSingle();
            if (fallbackUser) {
                user = fallbackUser;
            }
        }

        if (!user) {
            await supabase.auth.signOut();
            throw new Error('اسم المستخدم أو كلمة المرور غير صحيحة.');
        }

        if (!user.is_active) {
            await supabase.auth.signOut();
            throw new Error('هذا الحساب معطل، يرجى مراجعة الإدارة.');
        }

        // 🔒 حظر الأمان الشديد: منع تسجيل الدخول إذا كان الحساب ينتمي لمصنع آخر
        const currentTenantId = getCurrentTenantId();

        if (user.role !== 'super_admin' && slug && slug !== 'default' && slug !== 'super_admin') {
            if (user.tenant_id !== currentTenantId) {
                console.warn(`[Tenant Strict Auth] Account (${user.username}) belongs to tenant ${user.tenant_id}, but login attempted on tenant ${slug} (${currentTenantId}).`);
                await supabase.auth.signOut();
                localStorage.removeItem('devo_session');
                throw new Error('هذا الحساب غير موجود في هذا المصنع. يرجى استخدام صفحة تسجيل الدخول الخاصة بمصنعك.');
            }
        }

        // زيادة عداد تسجيل الدخول بمقدار 1
        await supabase
            .from('system_users')
            .update({ login_count: (user.login_count || 0) + 1 })
            .eq('id', user.id);

        // حفظ بيانات الجلسة الأساسية في LocalStorage للحفاظ على التوافق مع باقي الكود
        const sessionData = {
            id: user.id,
            tenant_id: user.tenant_id || currentTenantId || '00000000-0000-0000-0000-000000000001',
            username: user.username,
            full_name: user.full_name,
            role: user.role,
            worker_job: user.worker_job
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

    // 🔒 حاجز الأمان: منع مستخدم مصنع من دخول لوحة مصنع آخر فقط بعد تهيئة بيانات المصنع
    if (user.role !== 'super_admin' && currentTenant && currentTenant.id && user.tenant_id && user.tenant_id !== currentTenant.id) {
        console.warn(`[Tenant Barrier Guard] Access denied. User tenant (${user.tenant_id}) does not match active factory tenant (${currentTenant.id}).`);
        localStorage.removeItem('devo_session');
        window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        return null;
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(user.role)) {
        if (user.role === 'worker') window.location.href = `index.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        else window.location.href = `admin.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
        return null;
    }

    return user;
}