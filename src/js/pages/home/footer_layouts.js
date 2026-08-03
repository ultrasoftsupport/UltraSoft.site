/**
 * Footer Layouts Library
 * كل Layout هو component مستقل ومصمم بعناية للتجاوب والجمالية.
 */

// ===================================================================
// 1. LAYOUT REGISTRY — قائمة الـ Layouts المتاحة
// ===================================================================
export const FOOTER_LAYOUTS = [
    {
        id: 'simple',
        name: 'بسيط (Simple Row)',
        description: 'سطر واحد منظم: الشعار باليمين، الحقوق بالوسط، وشبكات التواصل باليسار',
        icon: 'ph-minus',
    },
    {
        id: 'minimal',
        name: 'شعار وسوشيال بالوسط (Centered Minimal)',
        description: 'الشعار واسم المصنع بالمنتصف وأزرار تواصل دائرية أنيقة وحقوق المطور',
        icon: 'ph-dot-outline-fill',
    },
    {
        id: 'columns',
        name: 'متعدد الأعمدة (Multi-Column Grid)',
        description: 'شبكة 4 أعمدة تفصيلية: عن المصنع، روابط سريعة، ساعات العمل، والتواصل',
        icon: 'ph-columns',
    },
    {
        id: 'luxury',
        name: 'فاخر مع بنر تواصل (Luxury Banner)',
        description: 'بنر تواصل برتقالي متدرج في الأعلى مع أقسام متكاملة وحقوق المطور',
        icon: 'ph-crown-simple',
    },
    {
        id: 'contact-only',
        name: 'بطاقات تواصل تفاعلية (Action Cards)',
        description: 'بطاقات لمسية أنيقة ومباشرة للاتصال، الواتساب، ورابط الموقع الجغرافي',
        icon: 'ph-phone',
    },
    {
        id: 'brand-social',
        name: 'شعار ووصف الماركة (Brand Bio & Social)',
        description: 'شعار المصنع مع وصف نشاط الملابس ورابط أزرار السوشيال',
        icon: 'ph-heart',
    },
];

// ===================================================================
// 2. SHARED UTILITIES — أدوات مشتركة
// ===================================================================

function buildSocialIcons(settings, size = 'md') {
    const fb = settings.social_facebook || '#';
    const wa = settings.social_whatsapp || '#';
    const tg = settings.social_telegram || '#';
    const maps = settings.social_maps || '#';
    const sz = size === 'lg' ? 'w-11 h-11 text-2xl' : 'w-9 h-9 text-lg';

    return `
        <a href="${fb}" target="_blank" class="${sz} rounded-xl bg-devo-black border border-devo-gray flex items-center justify-center text-devo-muted hover:text-blue-400 hover:border-blue-400/50 hover:bg-blue-500/10 transition-all shadow-sm" aria-label="Facebook" id="link-facebook" title="فيسبوك">
            <i class="ph ph-facebook-logo"></i>
        </a>
        <a href="${wa}" target="_blank" class="${sz} rounded-xl bg-devo-black border border-devo-gray flex items-center justify-center text-devo-muted hover:text-green-400 hover:border-green-400/50 hover:bg-green-500/10 transition-all shadow-sm" aria-label="WhatsApp" id="link-whatsapp" title="واتساب">
            <i class="ph ph-whatsapp-logo"></i>
        </a>
        <a href="${tg}" target="_blank" class="${sz} rounded-xl bg-devo-black border border-devo-gray flex items-center justify-center text-devo-muted hover:text-sky-400 hover:border-sky-400/50 hover:bg-sky-500/10 transition-all shadow-sm" aria-label="Telegram" id="link-telegram" title="تليجرام">
            <i class="ph ph-telegram-logo"></i>
        </a>
        <a href="${maps}" target="_blank" class="${sz} rounded-xl bg-devo-black border border-devo-gray flex items-center justify-center text-devo-muted hover:text-red-400 hover:border-red-400/50 hover:bg-red-500/10 transition-all shadow-sm" aria-label="Google Maps" id="link-maps" title="خرائط جوجل">
            <i class="ph ph-map-pin"></i>
        </a>
    `;
}

function buildCopyrightBar(settings = {}) {
    const factoryName = settings.invoice_factory_name || settings.hero_title || 'المصنع';
    const copyrightContent = settings.footer_copyright_text 
        ? settings.footer_copyright_text 
        : `&copy; <span id="footer-current-year">${new Date().getFullYear()}</span> جميع الحقوق محفوظة لدى مصنع ${factoryName}.`;

    return `
        <div class="border-t border-devo-gray/50 mt-8 pt-4 flex flex-col md:flex-row items-center justify-between max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-[11px] gap-3">
            <div class="text-devo-muted font-medium text-center md:text-right">
                ${copyrightContent}
            </div>
            <div class="flex flex-wrap items-center justify-center gap-1.5 text-devo-muted bg-devo-black py-1.5 px-3 rounded-full border border-devo-gray/60 shadow-sm">
                <i class="ph-fill ph-code text-ultra-400 text-sm"></i>
                <span class="text-devo-text font-medium text-xs">Powered by <a href="https://www.facebook.com/share/1NiodPNtXF/" target="_blank" class="text-ultra-400 font-bold hover:underline transition-colors tracking-wide">UltraSoft</a></span>
            </div>
        </div>
    `;
}

function buildQuickLinks() {
    return `
        <div>
            <h4 class="text-devo-text font-bold text-sm mb-3 flex items-center gap-1.5 justify-center md:justify-start"><i class="ph ph-link text-ultra-400"></i> روابط سريعة</h4>
            <ul class="space-y-2 text-devo-muted text-xs font-medium">
                <li><button onclick="switchSiteView('view-home')" class="hover:text-ultra-400 transition-colors">الرئيسية</button></li>
                <li><button onclick="switchSiteView('view-gallery')" class="hover:text-ultra-400 transition-colors">المعرض</button></li>
                <li><button onclick="switchSiteView('view-cart'); window.refreshCartView?.();" class="hover:text-ultra-400 transition-colors">السلة</button></li>
                <li><button onclick="switchSiteView('view-orders')" class="hover:text-ultra-400 transition-colors">الأوردرات</button></li>
            </ul>
        </div>
    `;
}

// ===================================================================
// 3. LAYOUT RENDERERS
// ===================================================================

function renderSimple(settings) {
    const factoryName = settings.invoice_factory_name || settings.hero_title || 'المصنع';
    const copyrightContent = settings.footer_copyright_text 
        ? settings.footer_copyright_text 
        : `&copy; <span id="footer-current-year">${new Date().getFullYear()}</span> جميع الحقوق محفوظة لدى مصنع ${factoryName}.`;

    return `
        <footer class="bg-devo-dark border-t border-devo-gray py-6 mt-auto" data-layout="simple">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div class="cursor-pointer flex-shrink-0 flex items-center gap-2.5" onclick="switchSiteView('view-home')">
                        <img src="./logo_transparnt.png" onerror="this.onerror=null; this.src='./logo.png';" alt="UltraSoft Logo" class="h-8 md:h-10 w-auto object-contain">
                        <h2 class="text-2xl font-black tracking-wider text-devo-text">${factoryName}</h2>
                    </div>
                    <p class="text-devo-muted text-xs font-medium text-center">
                        ${copyrightContent}
                    </p>
                    <div class="flex items-center gap-2">
                        ${buildSocialIcons(settings)}
                    </div>
                </div>
            </div>
        </footer>
    `;
}

function renderMinimal(settings) {
    const factoryName = settings.invoice_factory_name || settings.hero_title || 'المصنع';
    const bioText = settings.footer_bio_text || 'الشركة الرائدة للأنظمة الذكية والحلول التقنية المتكاملة';

    return `
        <footer class="bg-devo-dark border-t border-devo-gray py-10 mt-auto text-center" data-layout="minimal">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center gap-4">
                <div class="cursor-pointer flex flex-col items-center justify-center" onclick="switchSiteView('view-home')">
                    <img src="./logo_transparnt.png" onerror="this.onerror=null; this.src='./logo.png';" alt="UltraSoft Logo" class="h-12 sm:h-16 w-auto object-contain mb-2 drop-shadow-md">
                    <h2 class="text-3xl font-black tracking-wider text-devo-text">${factoryName}</h2>
                </div>
                <p class="text-devo-muted text-xs max-w-xs leading-relaxed">${bioText}</p>
                <div class="flex items-center gap-3 my-2">
                    ${buildSocialIcons(settings, 'lg')}
                </div>
                ${buildCopyrightBar(settings)}
            </div>
        </footer>
    `;
}

function renderColumns(settings) {
    const factoryName = settings.invoice_factory_name || settings.hero_title || 'المصنع';
    const bioText = settings.footer_bio_text || `مصنع ${factoryName} للملابس والأنظمة الذكية. نلتزم بتقديم أفضل الخدمات وأعلى معايير الجودة لعملائنا بكل احترافية.`;

    return `
        <footer class="bg-devo-dark border-t border-devo-gray py-10 mt-auto relative overflow-hidden" data-layout="columns">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-8 text-center md:text-right relative z-10">
                <div>
                    <div class="cursor-pointer mb-3 inline-flex items-center gap-2.5" onclick="switchSiteView('view-home')">
                        <img src="./logo_transparnt.png" onerror="this.onerror=null; this.src='./logo.png';" alt="UltraSoft Logo" class="h-8 md:h-10 w-auto object-contain">
                        <h2 class="text-2xl font-black tracking-wider text-devo-text">${factoryName}</h2>
                    </div>
                    <p class="text-devo-muted text-xs leading-relaxed">
                        ${bioText}
                    </p>
                </div>
                ${buildQuickLinks()}
                <div>
                    <h4 class="text-white font-bold text-sm mb-3 flex items-center gap-1.5 justify-center md:justify-start"><i class="ph ph-clock text-ultra-400"></i> أوقات العمل</h4>
                    <p class="text-devo-muted text-xs leading-relaxed">
                        السبت - الخميس<br>
                        <span class="text-white font-bold">10:00 صباحاً - 10:00 مساءً</span><br>
                        الجمعة: عطلة أسبوعية
                    </p>
                </div>
                <div>
                    <h4 class="text-white font-bold text-sm mb-3 flex items-center gap-1.5 justify-center md:justify-start"><i class="ph ph-share-network text-ultra-400"></i> تواصل معنا</h4>
                    <div class="flex justify-center md:justify-start gap-2.5">
                        ${buildSocialIcons(settings)}
                    </div>
                </div>
            </div>
            ${buildCopyrightBar(settings)}
        </footer>
    `;
}

function renderLuxury(settings) {
    const factoryName = settings.invoice_factory_name || settings.hero_title || 'المصنع';
    const bioText = settings.footer_bio_text || `نلتزم بتقديم أرقى الموديلات والأنظمة بمستويات جودة عالية لعملائنا في كافة المحافظات.`;

    return `
        <footer class="bg-devo-black border-t border-ultra-500/20 mt-auto relative overflow-hidden" data-layout="luxury">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10 pb-6">
                <!-- Top Callout Banner -->
                <div class="bg-gradient-to-r from-devo-dark via-devo-black to-devo-dark border border-ultra-500/30 p-6 rounded-2xl mb-10 flex flex-col md:flex-row items-center justify-between gap-4 shadow-xl">
                    <div>
                        <h3 class="text-lg font-bold text-white flex items-center gap-2"><i class="ph ph-sparkle text-ultra-400"></i> هل لديك استفسار أو طلب خاص؟</h3>
                        <p class="text-devo-muted text-xs mt-1">تواصل مباشرة مع إدارة مصنع ${factoryName} وسيتم الرد عليك فوراً</p>
                    </div>
                    <a href="${settings.social_whatsapp || '#'}" target="_blank" class="ultrasoft-btn-primary text-white px-5 py-2.5 rounded-xl font-bold text-xs transition-all shadow-md flex items-center gap-2 shrink-0">
                        <i class="ph ph-whatsapp-logo text-lg"></i>
                        <span>تواصل عبر الواتساب</span>
                    </a>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-right">
                    <div>
                        <img src="./logo_transparnt.png" onerror="this.onerror=null; this.src='./logo.png';" alt="UltraSoft Logo" class="h-12 w-auto object-contain mb-2 mx-auto md:mx-0">
                        <h2 class="text-3xl font-black tracking-wider text-devo-text mb-1">${factoryName}</h2>
                        <p class="text-devo-muted text-xs leading-relaxed max-w-xs mx-auto md:mx-0 mt-2">
                            ${bioText}
                        </p>
                    </div>
                    <div class="flex flex-col items-center justify-center">
                        <h4 class="text-white font-bold text-sm mb-3">وسائل التواصل الاجتماعي</h4>
                        <div class="flex items-center gap-3">
                            ${buildSocialIcons(settings, 'lg')}
                        </div>
                    </div>
                    <div>
                        <h4 class="text-white font-bold text-sm mb-3">الدعم والمساعدة</h4>
                        <p class="text-devo-muted text-xs leading-relaxed">
                            يمكنك إجراء واستعراض أوردراتك ومتابعة حالتها اللحظية مباشرة من التطبيق دون انتظار.
                        </p>
                    </div>
                </div>

                ${buildCopyrightBar(settings)}
            </div>
        </footer>
    `;
}

function renderContactOnly(settings) {
    const fb = settings.social_facebook || '#';
    const wa = settings.social_whatsapp || '#';
    const tg = settings.social_telegram || '#';
    const maps = settings.social_maps || '#';

    return `
        <footer class="bg-devo-dark border-t border-devo-gray py-8 mt-auto" data-layout="contact-only">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <a href="${wa}" target="_blank" class="p-4 rounded-2xl bg-devo-black border border-devo-gray hover:border-green-500/50 hover:bg-green-500/5 transition-all flex items-center gap-3 group">
                        <div class="w-10 h-10 rounded-xl bg-green-500/10 text-green-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                            <i class="ph ph-whatsapp-logo"></i>
                        </div>
                        <div>
                            <p class="text-white font-bold text-xs">محادثة واتساب</p>
                            <p class="text-devo-muted text-[11px]">تواصل مباشر مع الدعم</p>
                        </div>
                    </a>
                    <a href="${fb}" target="_blank" class="p-4 rounded-2xl bg-devo-black border border-devo-gray hover:border-blue-500/50 hover:bg-blue-500/5 transition-all flex items-center gap-3 group">
                        <div class="w-10 h-10 rounded-xl bg-blue-500/10 text-blue-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                            <i class="ph ph-facebook-logo"></i>
                        </div>
                        <div>
                            <p class="text-white font-bold text-xs">صفحة الفيسبوك</p>
                            <p class="text-devo-muted text-[11px]">متابعة أحدث التحديثات</p>
                        </div>
                    </a>
                    <a href="${tg}" target="_blank" class="p-4 rounded-2xl bg-devo-black border border-devo-gray hover:border-sky-500/50 hover:bg-sky-500/5 transition-all flex items-center gap-3 group">
                        <div class="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                            <i class="ph ph-telegram-logo"></i>
                        </div>
                        <div>
                            <p class="text-white font-bold text-xs">قناة التليجرام</p>
                            <p class="text-devo-muted text-[11px]">انضم لقناتنا الرسمية</p>
                        </div>
                    </a>
                    <a href="${maps}" target="_blank" class="p-4 rounded-2xl bg-devo-black border border-devo-gray hover:border-red-500/50 hover:bg-red-500/5 transition-all flex items-center gap-3 group">
                        <div class="w-10 h-10 rounded-xl bg-red-500/10 text-red-400 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                            <i class="ph ph-map-pin"></i>
                        </div>
                        <div>
                            <p class="text-white font-bold text-xs">موقعنا الجغرافي</p>
                            <p class="text-devo-muted text-[11px]">موقعنا على خرائط جوجل</p>
                        </div>
                    </a>
                </div>
                ${buildCopyrightBar(settings)}
            </div>
        </footer>
    `;
}

function renderBrandSocial(settings) {
    return `
        <footer class="bg-devo-dark border-t border-devo-gray py-10 mt-auto" data-layout="brand-social">
            <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
                <div class="cursor-pointer mb-2 inline-block" onclick="switchSiteView('view-home')">
                    <h2 class="text-3xl font-black tracking-wider text-white">Ultra<span class="text-ultra-400">Soft</span></h2>
                </div>
                <p class="text-xs tracking-[0.4em] text-ultra-400 uppercase font-bold mb-4">Collection</p>
                <p class="text-devo-muted text-xs leading-relaxed max-w-md mx-auto mb-6">
                    شركة UltraSoft للأنظمة والحلول البرمجية الذكية. نلتزم بتقديم أفضل الخدمات لعملائنا في كل مكان.
                </p>
                <div class="flex items-center justify-center gap-3 mb-6">
                    ${buildSocialIcons(settings)}
                </div>
                ${buildCopyrightBar(settings)}
            </div>
        </footer>
    `;
}

// ===================================================================
// 4. MAIN RENDER FUNCTION
// ===================================================================

export function renderFooter(layoutId, settings = {}) {
    let html = '';

    switch (layoutId) {
        case 'minimal':
            html = renderMinimal(settings);
            break;
        case 'columns':
            html = renderColumns(settings);
            break;
        case 'luxury':
            html = renderLuxury(settings);
            break;
        case 'contact-only':
            html = renderContactOnly(settings);
            break;
        case 'brand-social':
            html = renderBrandSocial(settings);
            break;
        case 'simple':
        default:
            html = renderSimple(settings);
            break;
    }

    const container = document.getElementById('site-footer');
    if (container) {
        container.outerHTML = html;
    } else {
        const existingFooter = document.querySelector('footer');
        if (existingFooter) {
            existingFooter.outerHTML = html;
        }
    }

    const yearEl = document.getElementById('footer-current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
}
