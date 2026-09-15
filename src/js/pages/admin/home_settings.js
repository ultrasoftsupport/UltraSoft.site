import { supabase } from '../../config/supabase.js';
import { showToast } from '../../components/toast.js';
import { confirmDialog } from '../../components/modal.js';
import { HEADER_LAYOUTS } from '../home/header_layouts.js';
import { FOOTER_LAYOUTS } from '../home/footer_layouts.js';
import { getCurrentTenantId } from '../../services/tenant_service.js';
import { getTenantModularSettings, saveTenantModularSettings } from '../../services/modular_settings.js';

let isInitialized = false;
let promoCards = [];
let currentSettings = {}; // كاش لإعدادات الموقع الحالية

// --- دالة معالجة روابط درايف ---
function resolveImageUrl(url) {
    if (!url || url.trim() === "" || url === "null" || url === "undefined") return '';
    try {
        if (url.includes('drive.google.com') || url.includes('drive.usercontent.google.com')) {
            const idMatch = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
            if (idMatch && idMatch[1]) return `https://drive.google.com/thumbnail?id=${idMatch[1]}&sz=w400`;
        }
    } catch (e) {}
    return url; 
}

export async function initHomeSettingsView() {
    if (isInitialized) return;

    await loadHeroSettings();
    isInitialized = true;
}

let isPromoInitialized = false;
export async function initPromoCardsView() {
    await loadPromoCards();

    if (!isPromoInitialized) {
        document.getElementById('promo-form')?.addEventListener('submit', handleSavePromo);
        isPromoInitialized = true;
    }
}

// ==========================================
// 1. Barcode Settings Save Handler
// ==========================================
window.saveBarcodeSettings = async () => {
    const btn = document.getElementById('btn-save-barcode');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري الحفظ...`;

    try {
        const currentTenantId = getCurrentTenantId();
        const scanMode = document.getElementById('hs-barcode-scan-mode')?.value || 'both';
        const matchType = document.getElementById('hs-barcode-match-type')?.value || 'both';

        // 1. حفظ في الجدول المنظم الجديد tenant_pos_settings
        await saveTenantModularSettings(currentTenantId, 'pos', {
            barcode_scan_mode: scanMode,
            barcode_match_type: matchType
        });

        // 2. مزامنة احتياطية مع home_settings
        const updates = [
            { tenant_id: currentTenantId, setting_key: 'barcode_scan_mode', setting_value: scanMode },
            { tenant_id: currentTenantId, setting_key: 'barcode_match_type', setting_value: matchType }
        ];
        try {
            await supabase.from('home_settings').upsert(updates, { onConflict: 'tenant_id,setting_key' });
        } catch(e) {}

        showToast('تم حفظ إعدادات الباركود والـ QR بنجاح ✓', 'success');
    } catch (err) {
        showToast('حدث خطأ أثناء حفظ إعدادات الباركود: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
};

// ==========================================
// 1. Hero Settings Logic + Layout Settings
// ==========================================

export async function loadHeroSettings() {
    const currentTenantId = getCurrentTenantId();

    // 1. جلب البيانات من الجداول المنظمة أولاً
    const modular = await getTenantModularSettings(currentTenantId);
    const branding = modular?.branding || {};
    const hero = branding.hero_config || {};
    const header = branding.header_config || {};
    const footer = branding.footer_config || {};
    const social = modular?.social || {};
    const invoice = modular?.invoice || {};
    const pos = modular?.pos || {};

    // 2. كاش ومواءمة مع home_settings
    let map = {};
    try {
        let query = supabase.from('home_settings').select('*');
        if (currentTenantId) query = query.eq('tenant_id', currentTenantId);
        const { data } = await query;
        (data || []).forEach(item => map[item.setting_key] = item.setting_value);
    } catch(e) {}

    currentSettings = map;

    if (document.getElementById('hs-hero-title')) {
        if (document.getElementById('hs-hero-badge')) document.getElementById('hs-hero-badge').value = hero.badge || map['hero_badge'] || 'ULTRASOFT COLLECTION';
        document.getElementById('hs-hero-title').value = hero.title ?? map['hero_title'] ?? '';
        document.getElementById('hs-hero-subtitle').value = hero.subtitle ?? map['hero_subtitle'] ?? '';
        document.getElementById('hs-bg-desktop').value = hero.desktop_url ?? map['hero_bg_desktop'] ?? '';
        document.getElementById('hs-bg-mobile').value = hero.mobile_url ?? map['hero_bg_mobile'] ?? '';
        document.getElementById('hs-social-fb').value = social.facebook_url ?? map['social_facebook'] ?? '';
        document.getElementById('hs-social-wa').value = social.whatsapp_number ?? map['social_whatsapp'] ?? '';
        if (document.getElementById('hs-social-tg')) document.getElementById('hs-social-tg').value = social.telegram_channel ?? map['social_telegram'] ?? '';
        document.getElementById('hs-social-maps').value = social.google_maps_url ?? map['social_maps'] ?? '';

        // الخيارات المتقدمة لخلفية الهيرو
        if (document.getElementById('hs-bg-show')) document.getElementById('hs-bg-show').value = (hero.show !== undefined ? String(hero.show) : (map['hero_bg_show'] || 'true'));
        if (document.getElementById('hs-bg-blend')) document.getElementById('hs-bg-blend').value = hero.blend || map['hero_bg_blend'] || 'normal';
        if (document.getElementById('hs-bg-glass')) document.getElementById('hs-bg-glass').value = hero.glass_mode || map['hero_bg_glass'] || 'soft';
        if (document.getElementById('hs-title-color')) document.getElementById('hs-title-color').value = hero.title_color || map['hero_title_color'] || '#ffffff';
        if (document.getElementById('hs-subtitle-color')) document.getElementById('hs-subtitle-color').value = hero.subtitle_color || map['hero_subtitle_color'] || '#a3a3a3';
        if (document.getElementById('hs-bg-edge-feather')) document.getElementById('hs-bg-edge-feather').value = hero.edge_feather ?? map['hero_bg_edge_feather'] ?? '25';
        if (document.getElementById('hs-bg-opacity')) document.getElementById('hs-bg-opacity').value = hero.opacity ?? map['hero_bg_opacity'] ?? '100';
        if (document.getElementById('hs-bg-overlay')) document.getElementById('hs-bg-overlay').value = hero.overlay_opacity ?? map['hero_bg_overlay_opacity'] ?? '40';
        if (document.getElementById('hs-bg-blur')) document.getElementById('hs-bg-blur').value = hero.blur ?? map['hero_bg_blur'] ?? '0';
        if (document.getElementById('hs-glass-opacity')) document.getElementById('hs-glass-opacity').value = hero.glass_opacity ?? map['hero_glass_opacity'] ?? '30';
        if (document.getElementById('hs-glass-blur')) document.getElementById('hs-glass-blur').value = hero.glass_blur ?? map['hero_glass_blur'] ?? '12';

        // خيارات تفعيل الخلفية في صفحات الموقع المختلفة
        if (document.getElementById('hs-bg-enable-gallery')) document.getElementById('hs-bg-enable-gallery').value = (pos.enable_gallery !== undefined ? String(pos.enable_gallery) : (map['bg_enable_gallery'] || 'false'));
        if (document.getElementById('hs-bg-enable-barcode')) document.getElementById('hs-bg-enable-barcode').value = (pos.enable_barcode !== undefined ? String(pos.enable_barcode) : (map['bg_enable_barcode'] || 'false'));
        if (document.getElementById('hs-bg-enable-cart')) document.getElementById('hs-bg-enable-cart').value = (pos.enable_cart !== undefined ? String(pos.enable_cart) : (map['bg_enable_cart'] || 'false'));
        if (document.getElementById('hs-bg-enable-orders')) document.getElementById('hs-bg-enable-orders').value = (pos.enable_orders !== undefined ? String(pos.enable_orders) : (map['bg_enable_orders'] || 'false'));
        if (document.getElementById('hs-barcode-scan-mode')) document.getElementById('hs-barcode-scan-mode').value = pos.barcode_scan_mode || map['barcode_scan_mode'] || 'both';
        if (document.getElementById('hs-barcode-match-type')) document.getElementById('hs-barcode-match-type').value = pos.barcode_match_type || map['barcode_match_type'] || 'both';

        // تعبئة حقول إعدادات الفاتورة
        if (document.getElementById('hs-inv-factory-name')) document.getElementById('hs-inv-factory-name').value = invoice.factory_name || map['invoice_factory_name'] || 'UltraSoft Collection';
        if (document.getElementById('hs-inv-subtitle')) document.getElementById('hs-inv-subtitle').value = invoice.subtitle || map['invoice_subtitle'] || 'Phone: +20 12 12751111';
        if (document.getElementById('hs-inv-customer-title')) document.getElementById('hs-inv-customer-title').value = invoice.customer_title || map['invoice_customer_title'] || 'فاتورة تفصيلية للعميل';
        if (document.getElementById('hs-inv-admin-title')) document.getElementById('hs-inv-admin-title').value = invoice.admin_title || map['invoice_admin_title'] || 'فاتورة تفصيلية للإدارة';
        if (document.getElementById('hs-inv-notes')) document.getElementById('hs-inv-notes').value = invoice.notes || map['invoice_notes'] || 'البضاعة المباعة لا تُرد بعد 14 يوماً من تاريخ الفاتورة.';
        
        if (document.getElementById('hs-footer-bio')) document.getElementById('hs-footer-bio').value = footer.bio_text || map['footer_bio_text'] || '';
        if (document.getElementById('hs-footer-copyright')) document.getElementById('hs-footer-copyright').value = footer.copyright_text || map['footer_copyright_text'] || '';

        updateInvoicePreview();
    }

    // تعبئة قوائم خيارات الهيدر والفوتر
    populateHeaderFooterSelectors(header.layout || map['header_layout'] || 'classic', footer.layout || map['footer_layout'] || 'simple');

    // ربط وتفعيل المعاينة الحية في لوحة الإدارة
    setupHeroPreviewListeners();
    updateAdminHeroPreview();
}

window.updateInvoicePreview = function() {
    const factory = document.getElementById('hs-inv-factory-name')?.value.trim() || 'UltraSoft Collection';
    const subtitle = document.getElementById('hs-inv-subtitle')?.value.trim() || 'Phone: +20 12 12751111';
    const adminTitle = document.getElementById('hs-inv-admin-title')?.value.trim() || 'فاتورة تفصيلية للإدارة';
    const notes = document.getElementById('hs-inv-notes')?.value.trim() || '';

    if (document.getElementById('prev-inv-factory-name')) document.getElementById('prev-inv-factory-name').textContent = factory;
    if (document.getElementById('prev-inv-subtitle')) document.getElementById('prev-inv-subtitle').textContent = subtitle;
    if (document.getElementById('prev-inv-admin-title')) document.getElementById('prev-inv-admin-title').textContent = adminTitle;

    // تحديث فوتر الأدمن السفلي باسم المصنع الحالي ديناميكياً
    if (document.getElementById('admin-footer-factory-name')) document.getElementById('admin-footer-factory-name').textContent = factory;
    if (document.getElementById('admin-footer-factory-name-2')) document.getElementById('admin-footer-factory-name-2').textContent = factory;

    const notesContainer = document.getElementById('prev-inv-notes-container');
    if (notesContainer) {
        if (notes) {
            notesContainer.style.display = 'block';
            if (document.getElementById('prev-inv-notes')) document.getElementById('prev-inv-notes').textContent = notes;
        } else {
            notesContainer.style.display = 'none';
        }
    }
};

window.saveInvoiceSettings = async function() {
    const btn = document.getElementById('btn-save-invoice-settings');
    if (!btn) return;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري الحفظ...`;

    try {
        const currentTenantId = getCurrentTenantId();
        const invoicePayload = {
            factory_name: (document.getElementById('hs-inv-factory-name')?.value || '').trim(),
            subtitle: (document.getElementById('hs-inv-subtitle')?.value || '').trim(),
            customer_title: (document.getElementById('hs-inv-customer-title')?.value || '').trim(),
            admin_title: (document.getElementById('hs-inv-admin-title')?.value || '').trim(),
            notes: (document.getElementById('hs-inv-notes')?.value || '').trim()
        };

        // 1. حفظ في الجدول المنظم الجديد tenant_invoice_settings
        await saveTenantModularSettings(currentTenantId, 'invoice', invoicePayload);

        // 2. مزامنة مع home_settings احتياطياً
        const updates = [
            { tenant_id: currentTenantId, setting_key: 'invoice_factory_name', setting_value: invoicePayload.factory_name },
            { tenant_id: currentTenantId, setting_key: 'invoice_subtitle', setting_value: invoicePayload.subtitle },
            { tenant_id: currentTenantId, setting_key: 'invoice_customer_title', setting_value: invoicePayload.customer_title },
            { tenant_id: currentTenantId, setting_key: 'invoice_admin_title', setting_value: invoicePayload.admin_title },
            { tenant_id: currentTenantId, setting_key: 'invoice_notes', setting_value: invoicePayload.notes }
        ];
        try {
            await supabase.from('home_settings').upsert(updates, { onConflict: 'tenant_id,setting_key' });
        } catch(e) {}

        // مسح كاش الإعدادات المحلي
        const cacheKey = `devo_cached_hero_settings_${currentTenantId}`;
        localStorage.removeItem(cacheKey);

        showToast('تم حفظ وتطبيق إعدادات الفاتورة بنجاح ✓', 'success');
    } catch (err) {
        showToast('حدث خطأ أثناء حفظ إعدادات الفاتورة: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// ==========================================
// دالة تحديث المعاينة الحية المباشرة في أدمن
// ==========================================
function updateAdminHeroPreview() {
    const desktopImg = resolveImageUrl(document.getElementById('hs-bg-desktop')?.value);
    const mobileImg = resolveImageUrl(document.getElementById('hs-bg-mobile')?.value);
    const bgUrl = desktopImg || mobileImg;

    const showBg = document.getElementById('hs-bg-show')?.value === 'true';
    const blendMode = document.getElementById('hs-bg-blend')?.value || 'normal';
    const glassMode = document.getElementById('hs-bg-glass')?.value || 'soft';
    const titleColor = document.getElementById('hs-title-color')?.value || '#ffffff';
    const subtitleColor = document.getElementById('hs-subtitle-color')?.value || '#a3a3a3';
    const edgeFeather = document.getElementById('hs-bg-edge-feather')?.value || '25';
    const opacity = document.getElementById('hs-bg-opacity')?.value || '100';
    const overlay = document.getElementById('hs-bg-overlay')?.value || '40';
    const blur = document.getElementById('hs-bg-blur')?.value || '0';
    const glassOpacity = document.getElementById('hs-glass-opacity')?.value || '30';
    const glassBlur = document.getElementById('hs-glass-blur')?.value || '12';

    // تحديث أرقام ونصوص المؤشرات
    if (document.getElementById('hs-title-color-text')) document.getElementById('hs-title-color-text').textContent = titleColor;
    if (document.getElementById('hs-subtitle-color-text')) document.getElementById('hs-subtitle-color-text').textContent = subtitleColor;
    if (document.getElementById('hs-bg-edge-feather-val')) document.getElementById('hs-bg-edge-feather-val').textContent = `${edgeFeather}%`;
    if (document.getElementById('hs-bg-opacity-val')) document.getElementById('hs-bg-opacity-val').textContent = `${opacity}%`;
    if (document.getElementById('hs-bg-overlay-val')) document.getElementById('hs-bg-overlay-val').textContent = `${overlay}%`;
    if (document.getElementById('hs-bg-blur-val')) document.getElementById('hs-bg-blur-val').textContent = `${blur}px`;
    if (document.getElementById('hs-glass-opacity-val')) document.getElementById('hs-glass-opacity-val').textContent = `${glassOpacity}%`;
    if (document.getElementById('hs-glass-blur-val')) document.getElementById('hs-glass-blur-val').textContent = `${glassBlur}px`;

    // 1. طبقة الصورة
    const prevImg = document.getElementById('admin-hero-prev-img');
    if (prevImg) {
        if (showBg && bgUrl) {
            prevImg.style.display = 'block';
            prevImg.style.backgroundImage = `url('${bgUrl}')`;
            prevImg.style.opacity = (parseInt(opacity) / 100).toString();
            prevImg.style.filter = `blur(${blur}px)`;
            prevImg.style.mixBlendMode = blendMode;
        } else {
            prevImg.style.display = 'none';
        }
    }

    // 2. طبقة التغميق
    const prevOverlay = document.getElementById('admin-hero-prev-overlay');
    if (prevOverlay) {
        prevOverlay.style.backgroundColor = `rgba(0, 0, 0, ${parseInt(overlay) / 100})`;
    }

    // 3. طبقات الدمج العلوية والسفلية Edge Merging Fades
    const prevTopFade = document.getElementById('admin-hero-prev-top-fade');
    const prevBottomFade = document.getElementById('admin-hero-prev-bottom-fade');
    const featherPercent = parseInt(edgeFeather);
    if (prevTopFade) {
        prevTopFade.style.height = `${featherPercent}%`;
        prevTopFade.style.backgroundImage = 'linear-gradient(to bottom, #0a0a0a, transparent)';
    }
    if (prevBottomFade) {
        prevBottomFade.style.height = `${featherPercent}%`;
        prevBottomFade.style.backgroundImage = 'linear-gradient(to top, #0a0a0a, transparent)';
    }

    // 4. كارت المحتوى الزجاجي
    const prevCard = document.getElementById('admin-hero-prev-card');
    if (prevCard) {
        if (glassMode !== 'none') {
            const opacityRatio = parseInt(glassOpacity) / 100;
            const bgAlpha = glassMode === 'heavy' ? Math.min(0.9, opacityRatio + 0.3) : opacityRatio;
            prevCard.style.backgroundColor = `rgba(0, 0, 0, ${bgAlpha})`;
            prevCard.style.backdropFilter = `blur(${glassBlur}px)`;
            prevCard.style.webkitBackdropFilter = `blur(${glassBlur}px)`;
            prevCard.style.border = `1px solid rgba(255, 255, 255, ${Math.min(0.25, opacityRatio * 0.5)})`;
            prevCard.style.boxShadow = `0 10px 40px rgba(0, 0, 0, ${Math.min(0.6, opacityRatio + 0.2)})`;
        } else {
            prevCard.style.backgroundColor = 'transparent';
            prevCard.style.backdropFilter = 'none';
            prevCard.style.webkitBackdropFilter = 'none';
            prevCard.style.border = 'none';
            prevCard.style.boxShadow = 'none';
        }
    }

    // 5. النصوص والألوان
    const badgeVal = document.getElementById('hs-hero-badge')?.value.trim();
    const titleVal = document.getElementById('hs-hero-title')?.value.trim();
    const subtitleVal = document.getElementById('hs-hero-subtitle')?.value.trim();
    const prevBadge = document.getElementById('admin-hero-prev-badge');
    const prevTitle = document.getElementById('admin-hero-prev-title');
    const prevSubtitle = document.getElementById('admin-hero-prev-subtitle');

    if (prevBadge) {
        prevBadge.textContent = badgeVal || 'ULTRASOFT COLLECTION';
    }
    if (prevTitle) {
        prevTitle.textContent = titleVal || 'العنوان الرئيسي';
        prevTitle.style.color = titleColor;
    }
    if (prevSubtitle) {
        prevSubtitle.textContent = subtitleVal || 'الوصف المكتوب في حقل النص الفرعي اعلاه';
        prevSubtitle.style.color = subtitleColor;
    }
}

function setupHeroPreviewListeners() {
    const ids = [
        'hs-hero-badge', 'hs-hero-title', 'hs-hero-subtitle', 'hs-bg-desktop', 'hs-bg-mobile',
        'hs-bg-show', 'hs-bg-blend', 'hs-bg-glass', 'hs-title-color', 'hs-subtitle-color',
        'hs-bg-edge-feather', 'hs-bg-opacity', 'hs-bg-overlay', 'hs-bg-blur',
        'hs-glass-opacity', 'hs-glass-blur', 'hs-bg-enable-gallery', 'hs-bg-enable-barcode',
        'hs-bg-enable-cart', 'hs-bg-enable-orders', 'hs-barcode-scan-mode', 'hs-barcode-match-type'
    ];
    ids.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.removeEventListener('input', updateAdminHeroPreview);
            el.removeEventListener('change', updateAdminHeroPreview);
            el.addEventListener('input', updateAdminHeroPreview);
            el.addEventListener('change', updateAdminHeroPreview);
        }
    });
}

// ==========================================
// 2. Header & Footer Layout Selectors UI
// ==========================================

function populateHeaderFooterSelectors(activeHeaderId, activeFooterId) {
    const headerSelect = document.getElementById('hs-header-layout');
    const footerSelect = document.getElementById('hs-footer-layout');

    if (headerSelect) {
        headerSelect.innerHTML = HEADER_LAYOUTS.map(l => 
            `<option value="${l.id}" ${l.id === activeHeaderId ? 'selected' : ''}>${l.name}</option>`
        ).join('');
    }

    if (footerSelect) {
        footerSelect.innerHTML = FOOTER_LAYOUTS.map(l => 
            `<option value="${l.id}" ${l.id === activeFooterId ? 'selected' : ''}>${l.name}</option>`
        ).join('');
    }
}

window.saveHeaderFooterLayouts = async () => {
    const btn = document.getElementById('btn-save-header-footer');
    if (!btn) return;

    const originalHTML = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري الحفظ...`;

    try {
        const currentTenantId = getCurrentTenantId();
        const headerVal = document.getElementById('hs-header-layout')?.value || 'classic';
        const footerVal = document.getElementById('hs-footer-layout')?.value || 'simple';
        const footerBioVal = (document.getElementById('hs-footer-bio')?.value || '').trim();
        const footerCopyrightVal = (document.getElementById('hs-footer-copyright')?.value || '').trim();

        // 1. حفظ في الجدول المنظم tenant_branding_settings
        await saveTenantModularSettings(currentTenantId, 'branding', {
            header_config: { layout: headerVal },
            footer_config: { layout: footerVal, bio_text: footerBioVal, copyright_text: footerCopyrightVal }
        });

        // 2. مزامنة مع home_settings
        const updates = [
            { tenant_id: currentTenantId, setting_key: 'header_layout', setting_value: headerVal },
            { tenant_id: currentTenantId, setting_key: 'footer_layout', setting_value: footerVal },
            { tenant_id: currentTenantId, setting_key: 'footer_bio_text', setting_value: footerBioVal },
            { tenant_id: currentTenantId, setting_key: 'footer_copyright_text', setting_value: footerCopyrightVal }
        ];
        try {
            await supabase.from('home_settings').upsert(updates, { onConflict: 'tenant_id,setting_key' });
        } catch(e) {}

        currentSettings.header_layout = headerVal;
        currentSettings.footer_layout = footerVal;
        currentSettings.footer_bio_text = footerBioVal;
        currentSettings.footer_copyright_text = footerCopyrightVal;

        showToast('تم حفظ تصميم الهيدر والفوتر بنجاح ✓', 'success');
    } catch (err) {
        showToast('حدث خطأ أثناء الحفظ: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHTML;
    }
};

// ==========================================
// 4. General Hero / Social Settings
// ==========================================

window.saveHeroSettings = async () => {
    const btn = document.getElementById('btn-save-hero');
    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> جاري الحفظ...`;

    try {
        const currentTenantId = getCurrentTenantId();

        // 1. حفظ إعدادات الهيرو والمظهر في tenant_branding_settings
        const heroPayload = {
            hero_config: {
                badge: (document.getElementById('hs-hero-badge')?.value || '').trim(),
                title: document.getElementById('hs-hero-title').value.trim(),
                subtitle: document.getElementById('hs-hero-subtitle').value.trim(),
                desktop_url: document.getElementById('hs-bg-desktop').value.trim(),
                mobile_url: document.getElementById('hs-bg-mobile').value.trim(),
                show: document.getElementById('hs-bg-show')?.value === 'true',
                blend: document.getElementById('hs-bg-blend')?.value || 'normal',
                glass_mode: document.getElementById('hs-bg-glass')?.value || 'soft',
                title_color: document.getElementById('hs-title-color')?.value || '#ffffff',
                subtitle_color: document.getElementById('hs-subtitle-color')?.value || '#a3a3a3',
                edge_feather: Number(document.getElementById('hs-bg-edge-feather')?.value) || 25,
                opacity: Number(document.getElementById('hs-bg-opacity')?.value) || 100,
                overlay_opacity: Number(document.getElementById('hs-bg-overlay')?.value) || 40,
                blur: Number(document.getElementById('hs-bg-blur')?.value) || 0,
                glass_opacity: Number(document.getElementById('hs-glass-opacity')?.value) || 30,
                glass_blur: Number(document.getElementById('hs-glass-blur')?.value) || 12
            }
        };
        await saveTenantModularSettings(currentTenantId, 'branding', heroPayload);

        // 2. حفظ الروابط الاجتماعية في tenant_social_links
        const socialPayload = {
            facebook_url: document.getElementById('hs-social-fb').value.trim(),
            whatsapp_number: document.getElementById('hs-social-wa').value.trim(),
            telegram_channel: (document.getElementById('hs-social-tg')?.value || '').trim(),
            google_maps_url: document.getElementById('hs-social-maps').value.trim()
        };
        await saveTenantModularSettings(currentTenantId, 'social', socialPayload);

        // 3. حفظ إعدادات الصفحات ونقاط البيع في tenant_pos_settings
        const posPayload = {
            enable_gallery: document.getElementById('hs-bg-enable-gallery')?.value === 'true',
            enable_barcode: document.getElementById('hs-bg-enable-barcode')?.value === 'true',
            enable_cart: document.getElementById('hs-bg-enable-cart')?.value === 'true',
            enable_orders: document.getElementById('hs-bg-enable-orders')?.value === 'true',
            barcode_scan_mode: document.getElementById('hs-barcode-scan-mode')?.value || 'both',
            barcode_match_type: document.getElementById('hs-barcode-match-type')?.value || 'both'
        };
        await saveTenantModularSettings(currentTenantId, 'pos', posPayload);

        // 4. مزامنة مع home_settings احتياطياً
        const updates = [
            { tenant_id: currentTenantId, setting_key: 'hero_badge', setting_value: (document.getElementById('hs-hero-badge')?.value || '').trim() },
            { tenant_id: currentTenantId, setting_key: 'hero_title', setting_value: document.getElementById('hs-hero-title').value.trim() },
            { tenant_id: currentTenantId, setting_key: 'hero_subtitle', setting_value: document.getElementById('hs-hero-subtitle').value.trim() },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_desktop', setting_value: document.getElementById('hs-bg-desktop').value.trim() },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_mobile', setting_value: document.getElementById('hs-bg-mobile').value.trim() },
            { tenant_id: currentTenantId, setting_key: 'social_facebook', setting_value: document.getElementById('hs-social-fb').value.trim() },
            { tenant_id: currentTenantId, setting_key: 'social_whatsapp', setting_value: document.getElementById('hs-social-wa').value.trim() },
            { tenant_id: currentTenantId, setting_key: 'social_telegram', setting_value: (document.getElementById('hs-social-tg')?.value || '').trim() },
            { tenant_id: currentTenantId, setting_key: 'social_maps', setting_value: document.getElementById('hs-social-maps').value.trim() },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_show', setting_value: document.getElementById('hs-bg-show')?.value || 'true' },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_blend', setting_value: document.getElementById('hs-bg-blend')?.value || 'normal' },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_glass', setting_value: document.getElementById('hs-bg-glass')?.value || 'soft' },
            { tenant_id: currentTenantId, setting_key: 'hero_title_color', setting_value: document.getElementById('hs-title-color')?.value || '#ffffff' },
            { tenant_id: currentTenantId, setting_key: 'hero_subtitle_color', setting_value: document.getElementById('hs-subtitle-color')?.value || '#a3a3a3' },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_edge_feather', setting_value: document.getElementById('hs-bg-edge-feather')?.value || '25' },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_opacity', setting_value: document.getElementById('hs-bg-opacity')?.value || '100' },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_overlay_opacity', setting_value: document.getElementById('hs-bg-overlay')?.value || '40' },
            { tenant_id: currentTenantId, setting_key: 'hero_bg_blur', setting_value: document.getElementById('hs-bg-blur')?.value || '0' },
            { tenant_id: currentTenantId, setting_key: 'hero_glass_opacity', setting_value: document.getElementById('hs-glass-opacity')?.value || '30' },
            { tenant_id: currentTenantId, setting_key: 'hero_glass_blur', setting_value: document.getElementById('hs-glass-blur')?.value || '12' },
            { tenant_id: currentTenantId, setting_key: 'bg_enable_gallery', setting_value: document.getElementById('hs-bg-enable-gallery')?.value || 'false' },
            { tenant_id: currentTenantId, setting_key: 'bg_enable_barcode', setting_value: document.getElementById('hs-bg-enable-barcode')?.value || 'false' },
            { tenant_id: currentTenantId, setting_key: 'bg_enable_cart', setting_value: document.getElementById('hs-bg-enable-cart')?.value || 'false' },
            { tenant_id: currentTenantId, setting_key: 'bg_enable_orders', setting_value: document.getElementById('hs-bg-enable-orders')?.value || 'false' },
            { tenant_id: currentTenantId, setting_key: 'barcode_scan_mode', setting_value: document.getElementById('hs-barcode-scan-mode')?.value || 'both' },
            { tenant_id: currentTenantId, setting_key: 'barcode_match_type', setting_value: document.getElementById('hs-barcode-match-type')?.value || 'both' }
        ];

        try {
            await supabase.from('home_settings').upsert(updates, { onConflict: 'tenant_id,setting_key' });
        } catch(e) {}

        // مسح الكاش المحلي فورياً للتاكيد
        const cacheKey = `devo_cached_hero_settings_${currentTenantId}`;
        localStorage.removeItem(cacheKey);

        // إعادة تطبيق البيانات مباشرة بالواجهة والمعاينة الحية
        if (typeof window.loadHeroSettings === 'function') {
            await window.loadHeroSettings(true);
        }

        showToast('تم تحديث وحفظ كافة الإعدادات بالجداول المنظمة بنجاح ✓', 'success');
    } catch (error) {
        showToast('حدث خطأ أثناء الحفظ: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="ph ph-floppy-disk"></i> حفظ الإعدادات`;
    }
};

// ==========================================
// 2. Promo Cards Logic
// ==========================================
async function loadPromoCards() {
    const container = document.getElementById('promo-cards-container');
    container.innerHTML = `<div class="col-span-full py-10 text-center"><i class="ph ph-spinner animate-spin text-3xl text-devo-info"></i></div>`;

    const currentTenantId = getCurrentTenantId();
    let query = supabase.from('promo_cards').select('*');
    if (currentTenantId) {
        query = query.eq('tenant_id', currentTenantId);
    }

    const { data, error } = await query.order('created_at', { ascending: true });
    
    if (error) {
        container.innerHTML = `<div class="col-span-full text-center text-devo-error">خطأ في تحميل الكروت</div>`;
        return;
    }

    promoCards = data || [];
    renderPromoCards();
}

function renderPromoCards() {
    const container = document.getElementById('promo-cards-container');
    if (promoCards.length === 0) {
        container.innerHTML = `<div class="col-span-full py-8 text-center text-devo-muted border border-dashed border-devo-gray rounded-xl">لا توجد كروت إعلانية مسجلة. اضغط على إضافة عرض جديد.</div>`;
        return;
    }

    // هنا يتم رسم صورة الكارت إن وجدت بدلاً من الأيقونة فقط
    container.innerHTML = promoCards.map(card => {
        const imgUrl = resolveImageUrl(card.image_url);
        const imgHtml = imgUrl 
            ? `<img src="${imgUrl}" class="w-12 h-12 rounded-lg object-cover border border-devo-gray shrink-0">` 
            : `<div class="w-12 h-12 rounded-lg bg-devo-gray flex items-center justify-center text-white shrink-0"><i class="ph ph-star text-xl"></i></div>`;

        const lines = card.description ? card.description.split('\n').map(l => l.trim()).filter(l => l.length > 0) : [];
        let descHtml = '';
        if (lines.length > 1) {
            descHtml = `<ul class="text-devo-muted text-[10px] sm:text-xs leading-relaxed space-y-0.5 flex flex-col items-start w-full list-none">` + 
                lines.map(line => `<li class="flex items-center gap-1.5 text-right"><span class="w-1 h-1 rounded-full bg-devo-orange shrink-0"></span><span>${line}</span></li>`).join('') + 
                `</ul>`;
        } else {
            descHtml = `<p class="text-devo-muted text-xs leading-relaxed line-clamp-2">${card.description || ''}</p>`;
        }

        return `
        <div class="bg-devo-black border border-devo-gray rounded-xl p-4 relative flex flex-col transition-colors hover:border-devo-info ${!card.is_active ? 'opacity-50 grayscale' : ''}">
            ${card.badge_text ? `<span class="absolute top-0 right-0 ${card.badge_color} text-white text-[10px] font-bold px-2 py-1 rounded-bl-lg rounded-tr-xl">${card.badge_text}</span>` : ''}
            
            <div class="flex items-start gap-3 mt-2">
                ${imgHtml}
                <div class="min-w-0 flex-1">
                    <h4 class="text-white font-bold text-sm leading-tight mb-1">${card.title}</h4>
                    ${descHtml}
                </div>
            </div>

            <div class="flex justify-end gap-2 mt-4 pt-3 border-t border-devo-gray">
                <button onclick="openPromoModal('${card.id}')" class="text-devo-info hover:bg-devo-info/10 p-1.5 rounded transition-colors" title="تعديل"><i class="ph ph-pencil-simple text-lg"></i></button>
                <button onclick="deletePromoCard('${card.id}')" class="text-devo-error hover:bg-devo-error/10 p-1.5 rounded transition-colors" title="حذف"><i class="ph ph-trash text-lg"></i></button>
            </div>
        </div>
        `;
    }).join('');
}

window.openPromoModal = async (id = null) => {
    const form = document.getElementById('promo-form');
    form.reset();
    document.getElementById('pm-id').value = id || '';
    document.getElementById('promo-modal-title').textContent = id ? 'تعديل العرض' : 'إضافة عرض جديد';

    // تعبئة قائمة الموديلات المتاحة للربط المفلترة بـ tenant_id للمصنع الحالي فقط
    const modelSelect = document.getElementById('pm-model-id');
    if (modelSelect) {
        modelSelect.innerHTML = `<option value="">جاري تحميل الموديلات...</option>`;
        try {
            const currentTenantId = getCurrentTenantId();
            let modelQuery = supabase
                .from('models')
                .select('id, name, factory_code, system_code')
                .eq('is_active', true);

            if (currentTenantId) {
                modelQuery = modelQuery.eq('tenant_id', currentTenantId);
            }

            const { data: models } = await modelQuery.order('name', { ascending: true });

            let options = `<option value="">-- بدون ربط (تصفح المعرض فقط) --</option>`;
            if (models && models.length > 0) {
                options += models.map(m => `<option value="${m.id}">[${m.factory_code || m.system_code || 'موديل'}] ${m.name}</option>`).join('');
            }
            modelSelect.innerHTML = options;
        } catch (e) {
            modelSelect.innerHTML = `<option value="">-- بدون ربط --</option>`;
        }
    }

    if (id) {
        const card = promoCards.find(c => c.id === id);
        if (card) {
            document.getElementById('pm-title').value = card.title;
            document.getElementById('pm-desc').value = card.description;
            if (document.getElementById('pm-image')) document.getElementById('pm-image').value = card.image_url || '';
            if (modelSelect) modelSelect.value = card.model_id || '';
            document.getElementById('pm-badge').value = card.badge_text || '';
            document.getElementById('pm-color').value = card.badge_color || 'bg-devo-orange';
            document.getElementById('pm-status').checked = card.is_active;
        }
    } else {
        document.getElementById('pm-status').checked = true;
    }

    const modal = document.getElementById('promo-modal');
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.remove('opacity-0'), 10);
};

window.closePromoModal = () => {
    const modal = document.getElementById('promo-modal');
    modal.classList.add('opacity-0');
    setTimeout(() => modal.classList.add('hidden'), 300);
};

async function handleSavePromo(e) {
    e.preventDefault();
    const id = document.getElementById('pm-id').value;
    const btn = e.target.querySelector('button[type="submit"]');
    const originalText = btn.innerHTML;

    const currentTenantId = getCurrentTenantId();
    const selectedModelId = document.getElementById('pm-model-id')?.value || null;

    const payload = {
        title: document.getElementById('pm-title').value.trim(),
        description: document.getElementById('pm-desc').value.trim(),
        image_url: document.getElementById('pm-image') ? document.getElementById('pm-image').value.trim() : null,
        model_id: selectedModelId,
        badge_text: document.getElementById('pm-badge').value.trim() || null,
        badge_color: document.getElementById('pm-color').value,
        is_active: document.getElementById('pm-status').checked
    };

    if (currentTenantId) {
        payload.tenant_id = currentTenantId;
    }

    btn.disabled = true;
    btn.innerHTML = `<i class="ph ph-spinner animate-spin"></i> حفظ...`;

    try {
        if (id) {
            let query = supabase.from('promo_cards').update(payload).eq('id', id);
            if (currentTenantId) query = query.eq('tenant_id', currentTenantId);
            const { error } = await query;
            if (error) {
                if (error.message && error.message.includes('model_id')) {
                    delete payload.model_id;
                    let query2 = supabase.from('promo_cards').update(payload).eq('id', id);
                    if (currentTenantId) query2 = query2.eq('tenant_id', currentTenantId);
                    const { error: err2 } = await query2;
                    if (err2) throw err2;
                    showToast('تم الحفظ، لتشغيل ربط الموديل يرجى إضافة عمود model_id في جدول promo_cards', 'warning');
                } else throw error;
            }
        } else {
            const { error } = await supabase.from('promo_cards').insert([payload]);
            if (error) {
                if (error.message && error.message.includes('model_id')) {
                    delete payload.model_id;
                    const { error: err2 } = await supabase.from('promo_cards').insert([payload]);
                    if (err2) throw err2;
                    showToast('تم الحفظ، لتشغيل ربط الموديل يرجى إضافة عمود model_id في جدول promo_cards', 'warning');
                } else throw error;
            }
        }
        showToast('تم حفظ الكارت الإعلاني بنجاح', 'success');
        closePromoModal();
        loadPromoCards();
    } catch (error) {
        showToast('حدث خطأ أثناء الحفظ', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
}

window.deletePromoCard = async (id) => {
    const confirmed = await confirmDialog({ title: 'حذف العرض', message: 'هل أنت متأكد من حذف هذا الكارت الإعلاني؟', isDestructive: true });
    if (!confirmed) return;

    const currentTenantId = getCurrentTenantId();
    let query = supabase.from('promo_cards').delete().eq('id', id);
    if (currentTenantId) query = query.eq('tenant_id', currentTenantId);

    const { error } = await query;
    if (error) {
        showToast('حدث خطأ أثناء الحذف', 'error');
    } else {
        showToast('تم الحذف بنجاح', 'success');
        loadPromoCards();
    }
};