/**
 * UltraSoft Modular Settings Service
 * خدمة إدارة الإعدادات المنظمة للمنظومة والمصانع
 */

import { supabase } from '../config/supabase.js';

export async function getTenantModularSettings(tenantId) {
    if (!tenantId) return null;
    try {
        const { data, error } = await supabase.rpc('get_tenant_modular_settings', {
            p_tenant_id: tenantId
        });
        if (error) throw error;
        return data || {};
    } catch (err) {
        console.warn('Fallback to home_settings for tenant:', tenantId, err);
        return await fallbackLoadFromHomeSettings(tenantId);
    }
}

export async function saveTenantModularSettings(tenantId, moduleName, payload) {
    if (!tenantId || !moduleName || !payload) return { success: false, message: 'بيانات غير مكتملة' };
    try {
        const { data, error } = await supabase.rpc('save_tenant_modular_settings', {
            p_tenant_id: tenantId,
            p_module: moduleName,
            p_data: payload
        });
        if (error) throw error;
        return data || { success: true };
    } catch (err) {
        console.error(`Error saving ${moduleName} settings:`, err);
        return { success: false, message: err.message };
    }
}

// Fallback helper in case table migration is pending
async function fallbackLoadFromHomeSettings(tenantId) {
    try {
        const { data, error } = await supabase
            .from('home_settings')
            .select('setting_key, setting_value')
            .eq('tenant_id', tenantId);

        if (error || !data) return {};

        const map = {};
        data.forEach(r => { map[r.setting_key] = r.setting_value; });

        return {
            branding: {
                active_theme_id: map.active_theme_id,
                header_config: {
                    layout: map.header_layout || 'classic',
                    sticky: map.header_sticky === 'true',
                    transparent: map.header_transparent === 'true',
                    height: Number(map.header_height) || 80,
                    compact_on_scroll: map.header_compact_on_scroll === 'true'
                },
                hero_config: {
                    show: map.hero_bg_show !== 'false',
                    badge: map.hero_badge || '',
                    title: map.hero_title || '',
                    title_color: map.hero_title_color || '#ffffff',
                    subtitle: map.hero_subtitle || '',
                    subtitle_color: map.hero_subtitle_color || '#ff8800',
                    desktop_url: map.hero_bg_desktop || '',
                    mobile_url: map.hero_bg_mobile || '',
                    opacity: Number(map.hero_bg_opacity) || 90,
                    overlay_opacity: Number(map.hero_bg_overlay_opacity) || 0,
                    blur: Number(map.hero_bg_blur) || 1,
                    blend: map.hero_bg_blend || 'normal',
                    edge_feather: Number(map.hero_bg_edge_feather) || 25,
                    glass_mode: map.hero_bg_glass || 'soft',
                    glass_blur: Number(map.hero_glass_blur) || 2,
                    glass_opacity: Number(map.hero_glass_opacity) || 25
                },
                footer_config: {
                    layout: map.footer_layout || 'brand-social',
                    bio_text: map.footer_bio_text || '',
                    copyright_text: map.footer_copyright_text || '',
                    show_quick_links: map.footer_show_quick_links === 'true'
                }
            },
            social: {
                facebook_url: map.social_facebook || '',
                whatsapp_number: map.social_whatsapp || '',
                telegram_channel: map.social_telegram || '',
                google_maps_url: map.social_maps || ''
            },
            invoice: {
                factory_name: map.invoice_factory_name || '',
                admin_title: map.invoice_admin_title || 'فاتورة للإدارة',
                customer_title: map.invoice_customer_title || 'فاتورة للعميل',
                subtitle: map.invoice_subtitle || '',
                notes: map.invoice_notes || 'البضاعة المباعة لا تُرد بعد 14 يوماً من تاريخ الفاتورة.'
            },
            pos: {
                barcode_match_type: map.barcode_match_type || 'factory',
                barcode_scan_mode: map.barcode_scan_mode || 'both',
                enable_barcode: map.bg_enable_barcode === 'true',
                enable_cart: map.bg_enable_cart === 'true',
                enable_gallery: map.bg_enable_gallery === 'true',
                enable_orders: map.bg_enable_orders === 'true'
            },
            telegram: {
                bot_token: map.telegram_bot_token || '',
                general_chat_id: map.telegram_chat_id || '',
                general_enabled: map.telegram_enabled === 'true',
                reports_chat_id: map.telegram_reports_chat_id || '',
                reports_enabled: map.telegram_reports_enabled === 'true',
                reports_group_link: map.telegram_reports_group_link || '',
                stock_chat_id: map.telegram_stock_chat_id || '',
                stock_enabled: map.telegram_stock_enabled === 'true',
                web_notifications_enabled: map.web_notifications_enabled !== 'false'
            },
            reports: {
                daily_enabled: map.report_daily_enabled === 'true',
                daily_time: map.report_daily_time || '23:00',
                weekly_enabled: map.report_weekly_enabled !== 'false',
                weekly_day: map.report_weekly_day || 'thursday',
                weekly_time: map.report_weekly_time || '23:00',
                monthly_enabled: map.report_monthly_enabled !== 'false',
                monthly_day: map.report_monthly_day || 'last_day',
                monthly_time: map.report_monthly_time || '23:00',
                annual_enabled: map.report_annual_enabled !== 'false',
                annual_date: map.report_annual_date || '12-31',
                annual_time: map.report_annual_time || '23:00'
            }
        };
    } catch (e) {
        console.error('Failed to load fallback settings:', e);
        return {};
    }
}
