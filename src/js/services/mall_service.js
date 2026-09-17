/**
 * UltraSoft Mall Service
 * خدمة إدارة وجلب بيانات مول ألترا سوفت الرقمي للمصانع والشركات
 */

import { supabase } from '../config/supabase.js';
import { normalizeImageUrl } from './tenant_service.js';

// Default Mall Banners (Carousel Slides)
export const DEFAULT_MALL_BANNERS = [
    {
        id: 'banner_ultrasoft_main',
        title: 'UltraSoft Mall',
        subtitle: 'W E L C O M E   T O',
        description: 'اكتشف مجموعة من والمتاجر التي تعمل بنظام UltraSoft',
        sub_description: 'جودة عالية • تصاميم متنوعة • تجربة تسوق احترافية',
        image_url: 'src/assets/ultrasoft%20mall.png',
        badge: 'ULTRASOFT ECOSYSTEM',
        primary_btn_text: 'استعرض المصانع',
        primary_btn_action: 'scroll', // 'scroll' | 'factory' | 'link' | 'demo'
        primary_btn_target: '#mall-factories-section',
        secondary_btn_text: 'تجربة النظام',
        secondary_btn_action: 'demo',
        secondary_btn_target: '',
        order: 1,
        is_active: true
    }
];

// Default Mall Configuration Fallback
const DEFAULT_MALL_CONFIG = {
    enabled: true,
    title: 'UltraSoft Mall',
    subtitle: 'الملتقى الرقمي الأول لكبرى مصانع وشركات الملابس الجاهزة',
    hero_badge: 'ULTRASOFT ECOSYSTEM',
    banner_url: '',
    primary_color: '#0284c7',
    banners: DEFAULT_MALL_BANNERS
};

// Default Curated Covers for Factories without custom banner
const DEFAULT_COVERS = [
    'src/assets/mall_delta_fabrics.jpg',
    'src/assets/mall_modern_wear.jpg',
    'src/assets/mall_alpha_textile.jpg',
    'src/assets/mall_tiny_style.jpg',
    'src/assets/ultrasoft_factory_hero.jpg',
    'src/assets/ultrasoft_factory_hero_modern.jpg'
];

/**
 * 🏬 جلب كافة المصانع المتاحة للعرض داخل UltraSoft Mall من قاعدة البيانات الحقيقية
 */
export async function fetchMallTenants() {
    try {
        // نطلب المصانع النشطة التي تم تفعيل عرضها في المول
        const { data, error } = await supabase
            .from('tenants')
            .select('id, name, legal_name, slug, logo_url, phone, is_in_mall, mall_order, mall_featured, mall_settings, status, settings')
            .eq('status', 'active')
            .eq('is_in_mall', true)
            .order('mall_order', { ascending: true })
            .order('mall_featured', { ascending: false });

        if (error) {
            // فحص إذا كان العمود غير موجود بعد في قاعدة البيانات (Fallback عبر JSON settings)
            if (error.code === '42703') {
                console.warn('[MallService] Column missing, trying fallback with settings jsonb.');
                const { data: fallbackData } = await supabase
                    .from('tenants')
                    .select('id, name, legal_name, slug, logo_url, phone, status, settings')
                    .eq('status', 'active');
                
                if (!fallbackData) return [];
                return fallbackData
                    .filter(t => t.settings?.mall?.is_in_mall)
                    .map((t, idx) => formatTenantMallRecord(t, idx));
            }
            throw error;
        }

        return (data || []).map((t, idx) => formatTenantMallRecord(t, idx));
    } catch (err) {
        console.error('[MallService] Error fetching mall tenants:', err);
        return [];
    }
}

/**
 * ⚙️ تنسيق سجل المصنع لبيانات المول بشكل موحد وآمن مع توفير Defaults ذكية
 */
function formatTenantMallRecord(tenant, index = 0) {
    const ms = tenant.mall_settings || tenant.settings?.mall || {};
    const displayName = ms.display_name?.trim() || tenant.name || 'مصنع معتمد';
    const logoUrl = normalizeImageUrl(ms.logo_url || tenant.logo_url || tenant.settings?.logo_url || '');
    
    // الغلاف الافتراضي الذكي عند عدم التخصيص
    let coverUrl = normalizeImageUrl(ms.cover_url || ms.banner_url || '');
    if (!coverUrl) {
        const coverIdx = Math.abs(hashCode(tenant.slug || tenant.name || String(index))) % DEFAULT_COVERS.length;
        coverUrl = DEFAULT_COVERS[coverIdx];
    }

    const description = ms.description?.trim() || 'مصنع متخصص في صناعة وتجارة أرقى الموديلات الجاهزة بأعلى معايير الجودة.';
    const isFeatured = Boolean(tenant.mall_featured === true || ms.is_featured === true || ms.featured === true);
    const badge = ms.badge?.trim() || (isFeatured ? 'براند مميز 🔥' : 'مصنع رسمي 🌟');
    
    // استخراج التصنيفات (Tags)
    let tags = [];
    if (Array.isArray(ms.tags) && ms.tags.length > 0) {
        tags = ms.tags;
    } else if (typeof ms.tags === 'string' && ms.tags.trim()) {
        tags = ms.tags.split(/[,،]/).map(t => t.trim()).filter(Boolean);
    } else {
        tags = ['ملابس جاهزة', 'جملة وقطاعي'];
    }

    return {
        id: tenant.id,
        name: tenant.name,
        slug: tenant.slug,
        phone: tenant.phone || '',
        displayName,
        logoUrl,
        coverUrl,
        description,
        badge,
        tags,
        isFeatured,
        order: Number(tenant.mall_order ?? ms.sort_order ?? ms.order ?? (index + 1)),
        storeUrl: buildTenantStoreUrl(tenant.slug)
    };
}

/**
 * 🔤 دالة Hash بسيطة لتوزيع الأغلفة الافتراضية بانتظام
 */
function hashCode(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return hash;
}

/**
 * 🌐 بناء الرابط المباشر لمتجر المصنع
 */
function buildTenantStoreUrl(slug) {
    if (!slug || slug === 'default') return window.location.origin;
    const hostname = window.location.hostname;
    
    // إذا كان يعمل على نطاق محلي (localhost / IP) أو استضافة سحابية (Vercel, Netlify, etc.)
    const isLocal = hostname === 'localhost' || hostname.includes('127.0.0.1') || hostname.endsWith('.local');
    const isHostingDomain = ['vercel.app', 'netlify.app', 'pages.dev', 'onrender.com', 'github.io', 'railway.app'].some(d => hostname.endsWith(d));

    if (isLocal || isHostingDomain || !hostname.includes('ultrasoft.site')) {
        return `${window.location.origin}${window.location.pathname}?tenant=${encodeURIComponent(slug)}`;
    }
    
    // الإنتاج على النطاق الرسمي: استخدام Subdomain
    const parts = hostname.split('.');
    if (parts.length >= 2) {
        const rootDomain = parts.slice(-2).join('.');
        return `https://${slug}.${rootDomain}`;
    }
    return `${window.location.origin}?tenant=${encodeURIComponent(slug)}`;
}

/**
 * 📋 جلب الإعدادات العامة لـ UltraSoft Mall
 */
export async function fetchMallConfig() {
    try {
        // محاولة القراءة من system_platform_settings أولاً
        const { data, error } = await supabase
            .from('system_platform_settings')
            .select('setting_value')
            .eq('setting_key', 'ultrasoft_mall_config')
            .maybeSingle();

        if (data && data.setting_value) {
            const val = data.setting_value;
            let rawBanners = Array.isArray(val.banners) && val.banners.length > 0 
                ? val.banners 
                : DEFAULT_MALL_BANNERS;

            const banners = rawBanners.map((b, idx) => ({
                id: b.id || `banner_${idx + 1}`,
                title: b.title || 'UltraSoft Mall',
                subtitle: b.subtitle || 'W E L C O M E   T O',
                description: b.description || 'اكتشف مجموعة من والمتاجر التي تعمل بنظام UltraSoft',
                sub_description: b.sub_description || 'جودة عالية • تصاميم متنوعة • تجربة تسوق احترافية',
                image_url: b.image_url || 'src/assets/ultrasoft%20mall.png',
                badge: b.badge || 'ULTRASOFT ECOSYSTEM',
                primary_btn_text: b.primary_btn_text || 'استعرض المصانع',
                primary_btn_action: b.primary_btn_action || 'scroll',
                primary_btn_target: b.primary_btn_target || '#mall-factories-section',
                secondary_btn_text: b.secondary_btn_text || '',
                secondary_btn_action: b.secondary_btn_action || 'demo',
                secondary_btn_target: b.secondary_btn_target || '',
                order: Number(b.order ?? (idx + 1)),
                is_active: b.is_active !== false
            })).sort((a, b) => a.order - b.order);

            return { 
                ...DEFAULT_MALL_CONFIG, 
                ...val,
                banners
            };
        }

        // قراءة احتياطية من home_settings
        const { data: hsData } = await supabase
            .from('home_settings')
            .select('setting_key, setting_value')
            .in('setting_key', ['mall_enabled', 'mall_title', 'mall_subtitle', 'mall_hero_banner']);

        if (hsData && hsData.length > 0) {
            const map = {};
            hsData.forEach(r => map[r.setting_key] = r.setting_value);
            return {
                ...DEFAULT_MALL_CONFIG,
                enabled: map.mall_enabled !== 'false',
                title: map.mall_title || DEFAULT_MALL_CONFIG.title,
                subtitle: map.mall_subtitle || DEFAULT_MALL_CONFIG.subtitle,
                banner_url: map.mall_hero_banner || '',
                banners: DEFAULT_MALL_BANNERS
            };
        }
    } catch (e) {
        console.warn('[MallService] Fallback to default mall config:', e);
    }
    return DEFAULT_MALL_CONFIG;
}

/**
 * 📢 جلب قائمة إعلانات وبانرات المول مرتبة
 */
export async function fetchMallBanners(onlyActive = true) {
    const config = await fetchMallConfig();
    const banners = config.banners || DEFAULT_MALL_BANNERS;
    return onlyActive ? banners.filter(b => b.is_active !== false) : banners;
}

/**
 * 💾 حفظ وتحديث قائمة إعلانات وبانرات المول في Supabase
 */
export async function saveMallBanners(bannersList) {
    try {
        const currentConfig = await fetchMallConfig();
        const updatedConfig = {
            ...currentConfig,
            banners: bannersList
        };
        return await saveMallConfig(updatedConfig);
    } catch (err) {
        console.error('[MallService] Error saving mall banners:', err);
        return { success: false, message: err.message };
    }
}

/**
 * 💾 حفظ إعدادات UltraSoft Mall العامة
 */
export async function saveMallConfig(config) {
    const payload = { ...DEFAULT_MALL_CONFIG, ...config };
    try {
        // 1. الحفظ في system_platform_settings
        await supabase
            .from('system_platform_settings')
            .upsert({
                setting_key: 'ultrasoft_mall_config',
                setting_value: payload,
                description: 'إعدادات مول ألترا سوفت الرقمي',
                updated_at: new Date().toISOString()
            }, { onConflict: 'setting_key' });

        // 2. مزامنة احتياطية في home_settings
        await supabase
            .from('home_settings')
            .upsert([
                { tenant_id: '00000000-0000-0000-0000-000000000001', setting_key: 'mall_enabled', setting_value: String(payload.enabled) },
                { tenant_id: '00000000-0000-0000-0000-000000000001', setting_key: 'mall_title', setting_value: payload.title || '' },
                { tenant_id: '00000000-0000-0000-0000-000000000001', setting_key: 'mall_subtitle', setting_value: payload.subtitle || '' }
            ], { onConflict: 'tenant_id,setting_key' });

        return { success: true };
    } catch (err) {
        console.error('[MallService] Error saving mall config:', err);
        return { success: false, message: err.message };
    }
}

/**
 * 🏭 تحديث بيانات مصنع خاص في UltraSoft Mall (للسوبر أدمن)
 * يدعم كلاً من CamelCase و Snake_case لضمان الحفظ بنسبة 100%
 */
export async function updateTenantMallSettings(tenantId, mallData) {
    if (!tenantId) return { success: false, message: 'معرف المصنع غير موجود' };
    try {
        const isInMall = (mallData.is_in_mall !== undefined) 
            ? Boolean(mallData.is_in_mall) 
            : Boolean(mallData.isInMall);

        const mallFeatured = (mallData.mall_featured !== undefined) 
            ? Boolean(mallData.mall_featured) 
            : Boolean(mallData.mallFeatured);

        const mallOrder = Number(
            mallData.mall_order !== undefined ? mallData.mall_order : (mallData.mallOrder ?? 999)
        ) || 999;

        const ms = mallData.mall_settings || mallData.mallSettings || {};
        const displayName = ms.display_name || ms.displayName || mallData.display_name || mallData.displayName || '';
        const logoUrl = ms.logo_url || ms.logoUrl || mallData.logo_url || mallData.logoUrl || '';
        const coverUrl = ms.cover_url || ms.coverUrl || mallData.cover_url || mallData.coverUrl || '';
        const description = ms.description || mallData.description || '';
        const badge = ms.badge || mallData.badge || '';
        let tags = ms.tags || mallData.tags || [];
        if (typeof tags === 'string') {
            tags = tags.split(/[,،]/).map(s => s.trim()).filter(Boolean);
        }

        const consolidatedMallSettings = {
            is_in_mall: isInMall,
            is_featured: mallFeatured,
            sort_order: mallOrder,
            display_name: displayName,
            logo_url: logoUrl,
            cover_url: coverUrl,
            description: description,
            badge: badge,
            tags: tags
        };

        const updateObj = {
            is_in_mall: isInMall,
            mall_featured: mallFeatured,
            mall_order: mallOrder,
            mall_settings: consolidatedMallSettings
        };

        const { error } = await supabase
            .from('tenants')
            .update(updateObj)
            .eq('id', tenantId);

        if (error) {
            // إذا كانت الأعمدة الجديدة غير مفعلة، نحفظها داخل JSON settings
            if (error.code === '42703') {
                const { data: tenantData } = await supabase
                    .from('tenants')
                    .select('settings')
                    .eq('id', tenantId)
                    .single();

                const currentSettings = tenantData?.settings || {};
                currentSettings.mall = consolidatedMallSettings;

                await supabase
                    .from('tenants')
                    .update({ settings: currentSettings })
                    .eq('id', tenantId);

                return { success: true };
            }
            throw error;
        }

        return { success: true };
    } catch (err) {
        console.error('[MallService] Error updating tenant mall settings:', err);
        return { success: false, message: err.message };
    }
}

/**
 * 🔢 تحديث ترتيب أولوية مجموعة من المصانع دفعة واحدة (Batch Reorder للسحب والإفلات)
 * @param {Array<{ id: string, order: number }>} orderPairs
 */
export async function updateTenantMallBatchOrders(orderPairs) {
    if (!Array.isArray(orderPairs) || orderPairs.length === 0) return { success: true };
    try {
        const promises = orderPairs.map(async ({ id, order }) => {
            return supabase
                .from('tenants')
                .update({ mall_order: order })
                .eq('id', id);
        });

        await Promise.all(promises);
        return { success: true };
    } catch (err) {
        console.error('[MallService] Error updating batch mall orders:', err);
        return { success: false, message: err.message };
    }
}
