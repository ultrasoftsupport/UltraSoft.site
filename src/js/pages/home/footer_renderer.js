/**
 * Footer Renderer
 * يجلب إعدادات الموقع من Supabase ويُطبق الـ Footer Layout المناسب.
 */

import { supabase } from '../../config/supabase.js';
import { renderFooter } from './footer_layouts.js';
import { getCurrentTenantId, getCurrentTenant } from '../../services/tenant_service.js';

export async function initFooter() {
    try {
        const currentTenantId = getCurrentTenantId();
        const currentTenant = getCurrentTenant();
        
        let layoutId = 'simple';
        const settings = {};

        if (currentTenantId) {
            try {
                // 1. القراءة من الجداول المنظمة
                const [{ data: brandRow }, { data: invRow }, { data: socRow }] = await Promise.all([
                    supabase.from('tenant_branding_settings').select('footer_config').eq('tenant_id', currentTenantId).maybeSingle(),
                    supabase.from('tenant_invoice_settings').select('factory_name').eq('tenant_id', currentTenantId).maybeSingle(),
                    supabase.from('tenant_social_links').select('*').eq('tenant_id', currentTenantId).maybeSingle()
                ]);

                if (brandRow && brandRow.footer_config) {
                    layoutId = brandRow.footer_config.layout || 'brand-social';
                    settings.footer_layout = layoutId;
                    settings.footer_bio_text = brandRow.footer_config.bio_text || '';
                    settings.footer_copyright_text = brandRow.footer_config.copyright_text || '';
                    settings.footer_show_quick_links = brandRow.footer_config.show_quick_links;
                }
                if (invRow && invRow.factory_name) {
                    settings.invoice_factory_name = invRow.factory_name;
                }
                if (socRow) {
                    settings.social_facebook = socRow.facebook_url || '';
                    settings.social_whatsapp = socRow.whatsapp_number || '';
                    settings.social_telegram = socRow.telegram_channel || '';
                    settings.social_maps = socRow.google_maps_url || '';
                }
            } catch(e) {}
        }

        // 2. كاش احتياطي من home_settings إذا لم تتوافر
        if (!settings.footer_layout) {
            let query = supabase.from('home_settings').select('*');
            if (currentTenantId) query = query.eq('tenant_id', currentTenantId);
            const { data } = await query;
            if (data) {
                data.forEach(item => settings[item.setting_key] = item.setting_value);
                layoutId = settings.footer_layout || 'simple';
            }
        }

        if (!settings.invoice_factory_name && currentTenant?.name) {
            settings.invoice_factory_name = currentTenant.name;
        }

        renderFooter(layoutId, settings);

    } catch (e) {
        console.error('[Footer Renderer] Error loading settings:', e);
        const currentTenant = getCurrentTenant();
        renderFooter('simple', { invoice_factory_name: currentTenant?.name || '' });
    }
}
