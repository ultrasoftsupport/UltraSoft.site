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

        // أ) البحث الحصري بحقل اسم المستخدم (username) عبر RPC الآمن أو الاستعلام المباشر
        let targetUser = null;
        try {
            const tenantParam = (activeTenant && activeTenant.slug !== 'super_admin' && activeTenant.slug !== 'default' && currentTenantId) ? currentTenantId : null;
            const { data: rpcUser, error: rpcErr } = await supabase.rpc('get_system_user_login_info', {
                p_username: cleanInput,
                p_tenant_id: tenantParam
            });
            if (!rpcErr && rpcUser) {
                targetUser = rpcUser;
            }
        } catch (rpcEx) {
            console.warn('RPC user lookup skipped:', rpcEx);
        }

        if (!targetUser) {
            let query = supabase
                .from('system_users')
                .select('*')
                .eq('username', cleanInput);

            if (activeTenant && activeTenant.slug !== 'super_admin' && activeTenant.slug !== 'default' && currentTenantId) {
                query = query.eq('tenant_id', currentTenantId);
            }

            let { data: matchedUsers } = await query;
            targetUser = (matchedUsers && matchedUsers.length > 0) ? matchedUsers[0] : null;
        }

        if (!targetUser) {
            throw new Error('هذا الحساب غير موجود بالنظام');
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

        // ب) التحقق من صحة كلمة المرور مباشرة عبر RPC الآمن أولاً لتجنب استثناء 500 من GoTrue
        try {
            const { data: isValidPassword, error: rpcErr } = await supabase.rpc('verify_system_user_password', {
                p_user_id: targetUser.id,
                p_password: password
            });

            if (isValidPassword === true && !rpcErr) {
                isAuthSuccess = true;
            }
        } catch (rpcEx) {
            console.warn('Direct RPC verification check skipped:', rpcEx);
        }

        // في حال لم ينجح RPC، نحاول تسجيل الدخول عبر GoTrue Auth
        if (!isAuthSuccess) {
            try {
                const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
                    email: targetEmail,
                    password: password
                });

                if (!authError && authData?.user) {
                    isAuthSuccess = true;
                }
            } catch (authErr) {
                console.warn('GoTrue Auth fallback exception:', authErr);
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

        const rawSlug = getTenantSlugFromURL() || 'default';
        const slug = (rawSlug === '127' || rawSlug === '127.0.0.1' || rawSlug === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(rawSlug)) ? 'default' : rawSlug;
        const currentTenant = getCurrentTenant();

        // 🧹 مسح شامل لمفاتيح الجلسة لمنع أي حلقات إعادة توجيه لا نهائية بسبب حسابات غير صالحة
        localStorage.removeItem('devo_session');
        if (slug) localStorage.removeItem(`devo_session_${slug}`);
        if (currentTenant && currentTenant.id) {
            localStorage.removeItem(`devo_session_${currentTenant.id}`);
        }
        Object.keys(localStorage).forEach(key => {
            if (key.startsWith('devo_session')) {
                localStorage.removeItem(key);
            }
        });
        sessionStorage.removeItem('current_active_tenant_slug');

        try {
            await supabase.auth.signOut();
        } catch(signOutErr) {
            console.warn('Supabase signOut notice:', signOutErr);
        }

        const isOnAuthPage = window.location.pathname.endsWith('/auth.html') || window.location.pathname.endsWith('auth.html');
        if (isOnAuthPage) {
            // إذا كنا بالفعل داخل صفحة تسجيل الدخول، نكتفي بتنظيف رابط الـ URL بدون إعادة تحميل
            const cleanUrlObj = new URL(window.location.href);
            if (cleanUrlObj.searchParams.has('tenant')) {
                const t = cleanUrlObj.searchParams.get('tenant')?.toLowerCase();
                if (t === '127' || t === '127.0.0.1' || t === 'default' || t === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(t || '')) {
                    cleanUrlObj.searchParams.delete('tenant');
                    window.history.replaceState({}, document.title, cleanUrlObj.pathname + (cleanUrlObj.searchParams.toString() ? '?' + cleanUrlObj.searchParams.toString() : ''));
                }
            }
            return;
        }

        window.location.href = `auth.html${slug && slug !== 'default' ? '?tenant=' + slug : ''}`;
    } catch (e) {
        console.error('Signout error:', e);
        localStorage.removeItem('devo_session');
        if (!window.location.pathname.includes('auth.html')) {
            window.location.href = 'auth.html';
        }
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

    // إذا كان هناك خطأ في معرف المصنع المطلوب بالرابط، نمنع تحميل أي جلسة
    if (window.isDefaultOrInvalidTenant && window.invalidTenantRequestedSlug) {
        return { session: null };
    }

    const rawSlug = getTenantSlugFromURL() || 'default';
    const isCustomTenant = rawSlug && rawSlug !== 'default' && rawSlug !== '127' && rawSlug !== '127.0.0.1' && rawSlug !== 'localhost' && !/^(\d{1,3}\.){3}\d{1,3}$/.test(rawSlug);
    const slug = isCustomTenant ? rawSlug : 'default';
    const currentTenant = getCurrentTenant();
    const currentTenantId = currentTenant?.id || (isCustomTenant ? null : getCurrentTenantId());

    // 1. عزل الجلسات: المصانع المنفصلة تقرأ فقط مفاتيحها المنعزلة الخاصة بها حصراً وتتجاهل الجلسة العامة للمنصة
    let sessionStr = null;
    if (isCustomTenant) {
        sessionStr = localStorage.getItem(`devo_session_${slug}`);
        if (!sessionStr && currentTenantId) {
            sessionStr = localStorage.getItem(`devo_session_${currentTenantId}`);
        }
    } else {
        sessionStr = localStorage.getItem('devo_session_default') || localStorage.getItem('devo_session');
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

        if (isCustomTenant) {
            if (session.tenant_slug && session.tenant_slug !== slug) {
                console.warn(`[Session Guard] Slug mismatch. Session belongs to (${session.tenant_slug}), but active URL is (${slug}).`);
                return { session: null };
            }
        } else {
            if (session.tenant_slug && session.tenant_slug !== 'default') {
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
    const rawSlug = getTenantSlugFromURL();
    const slug = (rawSlug === '127' || rawSlug === '127.0.0.1' || rawSlug === 'localhost' || /^(\d{1,3}\.){3}\d{1,3}$/.test(rawSlug || '')) ? 'default' : rawSlug;
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