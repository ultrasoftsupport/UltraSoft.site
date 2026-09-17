/**
 * UltraSoft Mall Service
 * خدمة إدارة وجلب بيانات مول ألترا سوفت الرقمي للمصانع والشركات
 */

import { supabase } from '../config/supabase.js';
import { normalizeImageUrl } from './tenant_service.js';

// Default Mall Configuration Fallback
const DEFAULT_MALL_CONFIG = {
    enabled: true,
    title: 'UltraSoft Mall',
    subtitle: 'الملتقى الرقمي الأول لكبرى مصانع وشركات الملابس الجاهزة',
    hero_badge: 'ULTRASOFT ECOSYSTEM',
    banner_url: '',
    primary_color: '#0284c7'
};

/**
 * 🏬 جلب كافة المصانع المتاحة للعرض داخل UltraSoft Mall
 */
export async function fetchMallTenants() {
    try {
        // نطلب المصانع النشطة التي تم تفعيل عرضها في المول
        const { data, error } = await supabase
            .from('tenants')
            .select('id, name, legal_name, slug, logo_url, phone, is_in_mall, mall_order, mall_featured, mall_settings, status')
            .eq('status', 'active')
            .eq('is_in_mall', true)
            .order('mall_featured', { ascending: false })
            .order('mall_order', { ascending: true });

        if (error) {
            // فحص إذا كان العمود غير موجود بعد في قاعدة البيانات (Fallback)
            if (error.code === '42703') {
                console.warn('[MallService] Column missing, trying fallback with settings jsonb.');
                const { data: fallbackData } = await supabase
                    .from('tenants')
                    .select('id, name, legal_name, slug, logo_url, phone, status, settings')
                    .eq('status', 'active');
                
                if (!fallbackData) return [];
                return fallbackData
                    .filter(t => t.settings?.mall?.is_in_mall)
                    .map(formatTenantMallRecord);
            }
            throw error;
        }

        return (data || []).map(formatTenantMallRecord);
    } catch (err) {
        console.error('[MallService] Error fetching mall tenants:', err);
        return [];
    }
}

/**
 * ⚙️ تنسيق سجل المصنع لبيانات المول بشكل موحد وآمن
 */
function formatTenantMallRecord(tenant) {
    const ms = tenant.mall_settings || tenant.settings?.mall || {};
    const displayName = ms.display_name?.trim() || tenant.name || 'مصنع معتمد';
    const logoUrl = normalizeImageUrl(ms.logo_url || tenant.logo_url || 'src/assets/icons/ultrasoft_transparent.png');
    const coverUrl = normalizeImageUrl(ms.cover_url || ms.banner_url || '');
    const description = ms.description?.trim() || 'مصنع متخصص في صناعة وتجارة أرقى الموديلات الجاهزة بأعلى معايير الجودة.';
    const badge = ms.badge?.trim() || (tenant.mall_featured ? 'براند موثق 💎' : 'مصنع رسمي 🌟');
    
    // استخراج التصنيفات (Tags)
    let tags = [];
    if (Array.isArray(ms.tags)) {
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
        isFeatured: Boolean(tenant.mall_featured || ms.featured),
        order: Number(tenant.mall_order ?? ms.order ?? 999),
        storeUrl: buildTenantStoreUrl(tenant.slug)
    };
}

/**
 * 🌐 بناء الرابط المباشر لمتجر المصنع
 */
function buildTenantStoreUrl(slug) {
    if (!slug || slug === 'default') return window.location.origin;
    const hostname = window.location.hostname;
    
    // إذا كان يعمل على نطاق محلي (localhost / IP)
    const isLocal = hostname === 'localhost' || hostname.includes('127.0.0.1') || hostname.endsWith('.local');
    if (isLocal) {
        return `${window.location.origin}${window.location.pathname}?tenant=${slug}`;
    }
    
    // الإنتاج: استخدام Subdomain
    const parts = hostname.split('.');
    if (parts.length >= 2) {
        const rootDomain = parts.slice(-2).join('.');
        return `https://${slug}.${rootDomain}`;
    }
    return `${window.location.origin}?tenant=${slug}`;
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
            return { ...DEFAULT_MALL_CONFIG, ...data.setting_value };
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
                banner_url: map.mall_hero_banner || ''
            };
        }
    } catch (e) {
        console.warn('[MallService] Fallback to default mall config:', e);
    }
    return DEFAULT_MALL_CONFIG;
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
 */
export async function updateTenantMallSettings(tenantId, mallData) {
    if (!tenantId) return { success: false, message: 'معرف المصنع غير موجود' };
    try {
        const updateObj = {
            is_in_mall: Boolean(mallData.is_in_mall),
            mall_featured: Boolean(mallData.mall_featured),
            mall_order: Number(mallData.mall_order) || 999,
            mall_settings: {
                display_name: mallData.display_name || '',
                logo_url: mallData.logo_url || '',
                cover_url: mallData.cover_url || '',
                description: mallData.description || '',
                badge: mallData.badge || '',
                tags: Array.isArray(mallData.tags) ? mallData.tags : (mallData.tags || '').split(/[,،]/).map(s => s.trim()).filter(Boolean)
            }
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
                currentSettings.mall = {
                    is_in_mall: updateObj.is_in_mall,
                    featured: updateObj.mall_featured,
                    order: updateObj.mall_order,
                    ...updateObj.mall_settings
                };

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
