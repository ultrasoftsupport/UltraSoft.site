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
        
        let query = supabase.from('home_settings').select('*');
        if (currentTenantId) {
            query = query.eq('tenant_id', currentTenantId);
        }

        const { data, error } = await query;
        const settings = {};
        if (data && !error) {
            data.forEach(item => settings[item.setting_key] = item.setting_value);
        }

        if (!settings.invoice_factory_name && currentTenant?.name) {
            settings.invoice_factory_name = currentTenant.name;
        }

        const layoutId = settings.footer_layout || 'simple';
        renderFooter(layoutId, settings);

    } catch (e) {
        console.error('[Footer Renderer] Error loading settings:', e);
        const currentTenant = getCurrentTenant();
        renderFooter('simple', { invoice_factory_name: currentTenant?.name || '' });
    }
}
