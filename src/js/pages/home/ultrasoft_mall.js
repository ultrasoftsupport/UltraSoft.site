/**
 * UltraSoft Mall Component
 * واجهة العرض والتسوق لمول ألترا سوفت الرقمي (UltraSoft Mall)
 * متناسقة 100% مع ثيم الموقع النشط (Dynamic Theme: Dark / Light / Custom)
 * ومطابقة للـ UI Mockup المعتمد مع الدمج الانسيابي للخلفية والترتيب الدقيق
 */

import { fetchMallTenants, fetchMallConfig } from '../../services/mall_service.js';

// المصانع الافتراضية الأربعة المعتمدة في التصميم (Showcase Factories)
const SHOWCASE_FACTORIES = [
    {
        id: 'alpha-textile',
        slug: 'alpha-textile',
        name: 'Alpha Textile',
        displayName: 'Alpha Textile',
        tagline: 'أناقة وجودة في كل تفصيلة',
        coverUrl: 'src/assets/mall_alpha_textile.jpg',
        logoType: 'alpha',
        tags: [
            { text: 'ملابس رجالية', type: 'brand' },
            { text: 'ملابس كاجوال', type: 'muted' }
        ]
    },
    {
        id: 'modern-wear',
        slug: 'modern-wear',
        name: 'Modern Wear',
        displayName: 'Modern Wear',
        tagline: 'تصاميم عصرية تناسب جميع الأذواق',
        coverUrl: 'src/assets/mall_modern_wear.jpg',
        logoType: 'modern',
        tags: [
            { text: 'ملابس نسائية', type: 'brand' },
            { text: 'أزياء عصرية', type: 'muted' }
        ]
    },
    {
        id: 'tiny-style',
        slug: 'tiny-style',
        name: 'Tiny Style',
        displayName: 'Tiny Style',
        tagline: 'ملابس أطفال بجودة عالية',
        coverUrl: 'src/assets/mall_tiny_style.jpg',
        logoType: 'tiny',
        tags: [
            { text: 'ملابس أطفال', type: 'brand' },
            { text: 'أزياء مريحة', type: 'muted' }
        ]
    },
    {
        id: 'delta-fabrics',
        slug: 'delta-fabrics',
        name: 'Delta Fabrics',
        displayName: 'Delta Fabrics',
        tagline: 'أقمشة ومنسوجات عالية الجودة',
        coverUrl: 'src/assets/mall_delta_fabrics.jpg',
        logoType: 'delta',
        tags: [
            { text: 'أقمشة متنوعة', type: 'brand' },
            { text: 'منسوجات', type: 'muted' }
        ]
    }
];

let activeMallTenants = [];

/**
 * 🚀 تهيئة وعرض UltraSoft Mall في صفحة الموقع
 */
export async function initUltraSoftMall() {
    const container = document.getElementById('view-mall');
    if (!container) return;

    // إخفاء زر السلة العائم فوراً عند فتح المول
    const floatingCartBtn = document.getElementById('floating-cart-btn');
    if (floatingCartBtn) floatingCartBtn.classList.add('hidden');

    // تهيئة معالج فتح متجر المصنع عالمياً
    window.handleExploreFactory = (slug) => {
        if (slug && slug !== 'default' && !SHOWCASE_FACTORIES.some(f => f.slug === slug)) {
            const hostname = window.location.hostname;
            const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1';
            const isVercel = hostname.endsWith('.vercel.app');
            if (isLocalhost || isVercel || !hostname.includes('ultrasoft.site')) {
                window.location.href = `index.html?tenant=${encodeURIComponent(slug)}`;
            } else {
                window.location.href = `https://${slug}.ultrasoft.site/`;
            }
        } else {
            if (typeof window.enterDemoStoreMode === 'function') {
                window.enterDemoStoreMode();
            } else if (typeof window.switchSiteView === 'function') {
                window.switchSiteView('view-gallery');
            }
        }
    };

    try {
        const [config, dbTenants] = await Promise.all([
            fetchMallConfig().catch(() => ({})),
            fetchMallTenants().catch(() => [])
        ]);

        if (Array.isArray(dbTenants) && dbTenants.length > 0) {
            const formattedDb = dbTenants.map(t => ({
                id: t.id,
                slug: t.slug,
                name: t.name,
                displayName: t.displayName || t.name,
                tagline: t.description || 'أناقة وجودة في كل تفصيلة',
                coverUrl: t.coverUrl || 'src/assets/mall_delta_fabrics.jpg',
                logoUrl: t.logoUrl,
                logoType: 'default',
                tags: (t.tags || []).map(tag => ({ text: tag, type: 'brand' }))
            }));

            if (formattedDb.length < 4) {
                const needed = 4 - formattedDb.length;
                activeMallTenants = [...formattedDb, ...SHOWCASE_FACTORIES.slice(0, needed)];
            } else {
                activeMallTenants = formattedDb;
            }
        } else {
            activeMallTenants = [...SHOWCASE_FACTORIES];
        }

        renderMallView(container, config);
    } catch (err) {
        console.error('[UltraSoftMall] Initialization error:', err);
        activeMallTenants = [...SHOWCASE_FACTORIES];
        renderMallView(container, {});
    }
}

/**
 * 🎨 تصيير كامل واجهة UltraSoft Mall المتناسقة مع الثيم
 */
function renderMallView(container, config) {
    container.innerHTML = `
        <style>
            .us-mall-wrapper {
                background-color: var(--devo-black) !important;
                color: var(--devo-text) !important;
                min-height: 100vh;
                padding-top: 16px;
                padding-bottom: 80px;
                font-family: 'Cairo', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                transition: background-color 0.3s ease, color 0.3s ease;
            }
            .us-mall-container {
                max-width: 1280px;
                margin: 0 auto;
                padding: 0 20px;
            }
            
            /* HERO BANNER CONTAINER */
            .us-mall-hero {
                width: 100%;
                height: 440px;
                border-radius: 28px;
                overflow: hidden;
                position: relative;
                background-color: var(--devo-dark);
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
                border: 1px solid var(--devo-gray);
            }

            /* HERO BACKGROUND IMAGE (The UltraSoft Mall corridor & storefront) */
            .us-mall-hero-bg {
                position: absolute;
                inset: 0;
                background-image: url('src/assets/ultrasoft%20mall.png');
                background-size: cover;
                background-position: right center;
                background-repeat: no-repeat;
                z-index: 1;
            }

            /* HERO BLEND OVERLAY (Seamless transition merging into theme background) */
            .us-mall-hero-blend {
                position: absolute;
                inset: 0;
                z-index: 2;
                pointer-events: none;
                background: 
                    radial-gradient(
                        ellipse 85% 115% at 20% 50%,
                        var(--devo-dark) 0%,
                        var(--devo-dark) 60%,
                        transparent 100%
                    ),
                    linear-gradient(
                        90deg,
                        var(--devo-dark) 0%,
                        var(--devo-dark) 38%,
                        color-mix(in srgb, var(--devo-dark) 95%, transparent) 48%,
                        color-mix(in srgb, var(--devo-dark) 80%, transparent) 60%,
                        color-mix(in srgb, var(--devo-dark) 45%, transparent) 72%,
                        color-mix(in srgb, var(--devo-dark) 15%, transparent) 84%,
                        transparent 94%
                    );
            }

            /* HERO CONTENT PANEL (Firmly locked to the left side) */
            .us-mall-hero-content {
                position: absolute;
                top: 0;
                left: 0;
                bottom: 0;
                width: 52%;
                max-width: 560px;
                z-index: 10;
                padding: 44px 52px;
                display: flex;
                flex-direction: column;
                justify-content: center;
            }

            /* HERO TYPOGRAPHY */
            .us-mall-subtitle-en {
                font-size: 11px;
                font-weight: 800;
                letter-spacing: 0.28em;
                color: var(--devo-muted);
                text-transform: uppercase;
                margin-bottom: 8px;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            }
            .us-mall-title-en {
                font-size: 44px;
                font-weight: 900;
                color: var(--devo-text);
                line-height: 1.08;
                margin: 0 0 16px 0;
                font-family: 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif;
            }
            .us-mall-title-accent {
                color: var(--devo-orange);
            }
            .us-mall-desc-ar {
                font-size: 16.5px;
                font-weight: 800;
                color: var(--devo-text);
                margin-bottom: 6px;
                line-height: 1.45;
                font-family: 'Cairo', sans-serif;
            }
            .us-mall-sub-ar {
                font-size: 12.5px;
                font-weight: 600;
                color: var(--devo-muted);
                margin-bottom: 26px;
                font-family: 'Cairo', sans-serif;
            }

            /* HERO BUTTONS */
            .us-mall-actions {
                display: flex;
                align-items: center;
                gap: 12px;
                flex-wrap: wrap;
            }
            .us-mall-btn-primary {
                background-color: var(--devo-orange);
                color: #ffffff !important;
                padding: 12px 24px;
                border-radius: 12px;
                font-weight: 800;
                font-size: 13.5px;
                font-family: 'Cairo', sans-serif;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                border: none;
                cursor: pointer;
                box-shadow: 0 4px 16px color-mix(in srgb, var(--devo-orange) 45%, transparent);
                transition: all 0.25s ease;
                text-decoration: none;
            }
            .us-mall-btn-primary:hover {
                background-color: var(--devo-orange-hover);
                transform: translateY(-2px);
                box-shadow: 0 6px 22px color-mix(in srgb, var(--devo-orange) 60%, transparent);
            }
            .us-mall-btn-secondary {
                background-color: color-mix(in srgb, var(--devo-dark) 85%, transparent);
                color: var(--devo-text) !important;
                padding: 12px 24px;
                border-radius: 12px;
                font-weight: 800;
                font-size: 13.5px;
                font-family: 'Cairo', sans-serif;
                display: inline-flex;
                align-items: center;
                gap: 8px;
                border: 1px solid var(--devo-gray);
                cursor: pointer;
                backdrop-filter: blur(8px);
                box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
                transition: all 0.25s ease;
                text-decoration: none;
            }
            .us-mall-btn-secondary:hover {
                background-color: var(--devo-gray-hover);
                border-color: var(--devo-orange);
                color: var(--devo-text) !important;
                transform: translateY(-2px);
            }

            /* HERO SLIDER DOTS (Bottom Center) */
            .us-mall-hero-dots {
                position: absolute;
                bottom: 18px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                gap: 8px;
                z-index: 10;
                pointer-events: none;
            }
            .us-mall-dot-active {
                width: 28px;
                height: 7px;
                border-radius: 9999px;
                background-color: var(--devo-orange);
                box-shadow: 0 0 12px var(--devo-orange);
            }
            .us-mall-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background-color: color-mix(in srgb, var(--devo-muted) 45%, transparent);
            }

            /* SECTION HEADER */
            .us-mall-section-header {
                display: flex;
                flex-direction: column;
                align-items: flex-end;
                text-align: right;
                margin-top: 52px;
                margin-bottom: 24px;
            }
            .us-mall-section-title {
                font-size: 28px;
                font-weight: 900;
                color: var(--devo-text) !important;
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0;
                font-family: 'Cairo', sans-serif;
            }
            .us-mall-section-sub {
                font-size: 14px;
                font-weight: 600;
                color: var(--devo-muted) !important;
                margin: 4px 0 0 0;
                font-family: 'Cairo', sans-serif;
            }

            /* CARDS GRID */
            .us-mall-grid {
                display: grid;
                grid-template-columns: repeat(4, minmax(0, 1fr));
                gap: 24px;
            }

            /* FACTORY CARD */
            .us-mall-card {
                background-color: var(--devo-dark) !important;
                border: 1px solid var(--devo-gray);
                border-radius: 20px;
                box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
                overflow: hidden;
                display: flex;
                flex-direction: column;
                justify-content: space-between;
                transition: transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease;
            }
            .us-mall-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
                border-color: var(--devo-orange);
            }
            .us-mall-card-cover {
                height: 160px;
                width: 100%;
                overflow: hidden;
                background-color: var(--devo-black);
                position: relative;
            }
            .us-mall-card-cover img {
                width: 100%;
                height: 100%;
                object-fit: cover;
                transition: transform 0.4s ease;
            }
            .us-mall-card:hover .us-mall-card-cover img {
                transform: scale(1.06);
            }
            .us-mall-card-logo {
                width: 76px;
                height: 76px;
                border-radius: 50%;
                background-color: var(--devo-dark);
                border: 4px solid var(--devo-dark);
                box-shadow: 0 6px 18px rgba(0, 0, 0, 0.25);
                margin: -38px auto 0 auto;
                position: relative;
                z-index: 10;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            .us-mall-card-body {
                padding: 14px 16px 8px 16px;
                text-align: center;
            }
            .us-mall-card-name {
                font-size: 18px;
                font-weight: 900;
                color: var(--devo-text) !important;
                margin: 0 0 4px 0;
                font-family: 'Cairo', sans-serif;
            }
            .us-mall-card-tagline {
                font-size: 12px;
                font-weight: 600;
                color: var(--devo-muted) !important;
                margin: 0 0 14px 0;
                line-height: 1.4;
                font-family: 'Cairo', sans-serif;
            }
            .us-mall-card-tags {
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                flex-wrap: wrap;
                margin-bottom: 6px;
            }
            .us-mall-pill {
                padding: 4px 12px;
                border-radius: 9999px;
                font-size: 11px;
                font-weight: 700;
                font-family: 'Cairo', sans-serif;
                display: inline-block;
                transition: all 0.2s ease;
            }
            .us-mall-pill-brand {
                background-color: color-mix(in srgb, var(--devo-orange) 14%, transparent);
                color: var(--devo-orange) !important;
                border: 1px solid color-mix(in srgb, var(--devo-orange) 30%, transparent);
            }
            .us-mall-pill-muted {
                background-color: color-mix(in srgb, var(--devo-gray) 60%, transparent);
                color: var(--devo-muted) !important;
                border: 1px solid var(--devo-gray);
            }
            .us-mall-card-btn {
                width: 100%;
                background-color: color-mix(in srgb, var(--devo-orange) 15%, transparent);
                color: var(--devo-orange) !important;
                border: 1px solid color-mix(in srgb, var(--devo-orange) 30%, transparent);
                border-radius: 12px;
                padding: 11px 16px;
                font-size: 13px;
                font-weight: 800;
                font-family: 'Cairo', sans-serif;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 8px;
                cursor: pointer;
                transition: all 0.2s ease;
            }
            .us-mall-card-btn:hover {
                background-color: var(--devo-orange);
                color: #ffffff !important;
                border-color: var(--devo-orange);
                box-shadow: 0 4px 14px color-mix(in srgb, var(--devo-orange) 40%, transparent);
            }

            /* RESPONSIVE DESIGN */
            @media (max-width: 1024px) {
                .us-mall-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .us-mall-hero-content {
                    width: 60%;
                    padding: 36px 36px;
                }
                .us-mall-hero-blend {
                    background: 
                        radial-gradient(
                            ellipse 95% 120% at 20% 50%,
                            var(--devo-dark) 0%,
                            var(--devo-dark) 65%,
                            transparent 100%
                        ),
                        linear-gradient(
                            90deg,
                            var(--devo-dark) 0%,
                            var(--devo-dark) 48%,
                            color-mix(in srgb, var(--devo-dark) 85%, transparent) 70%,
                            transparent 95%
                        );
                }
            }
            @media (max-width: 768px) {
                .us-mall-hero {
                    height: auto;
                    min-height: 480px;
                }
                .us-mall-hero-blend {
                    background: linear-gradient(
                        to bottom,
                        color-mix(in srgb, var(--devo-dark) 96%, transparent) 0%,
                        color-mix(in srgb, var(--devo-dark) 92%, transparent) 65%,
                        color-mix(in srgb, var(--devo-dark) 75%, transparent) 100%
                    );
                }
                .us-mall-hero-content {
                    position: relative;
                    width: 100%;
                    max-width: 100%;
                    padding: 36px 24px 50px 24px;
                }
                .us-mall-title-en {
                    font-size: 34px;
                }
                .us-mall-grid {
                    grid-template-columns: repeat(1, minmax(0, 1fr));
                }
            }
        </style>

        <div class="us-mall-wrapper">
            <div class="us-mall-container">
                
                <!-- 1. HERO BANNER (UltraSoft Mall Featured Showcase) -->
                <div class="us-mall-hero">
                    <!-- Right Background: Real Mall Image -->
                    <div class="us-mall-hero-bg"></div>

                    <!-- Seamless Theme Gradient Blend Layer -->
                    <div class="us-mall-hero-blend"></div>

                    <!-- Left Content Island (Strictly locked to left) -->
                    <div class="us-mall-hero-content">
                        <!-- Top English Title (LTR) -->
                        <div style="direction: ltr; text-align: left;">
                            <div class="us-mall-subtitle-en">
                                W E L C O M E &nbsp; T O
                            </div>
                            <h1 class="us-mall-title-en">
                                UltraSoft <span class="us-mall-title-accent">Mall</span>
                            </h1>
                        </div>

                        <!-- Arabic Description & Buttons (RTL) -->
                        <div style="direction: rtl; text-align: right;">
                            <div class="us-mall-desc-ar">
                                اكتشف مجموعة من والمتاجر التي تعمل بنظام UltraSoft
                            </div>
                            <div class="us-mall-sub-ar">
                                جودة عالية &nbsp;•&nbsp; تصاميم متنوعة &nbsp;•&nbsp; تجربة تسوق احترافية
                            </div>

                            <!-- Buttons (Side-by-Side in RTL) -->
                            <div class="us-mall-actions">
                                <button onclick="document.getElementById('mall-factories-section')?.scrollIntoView({ behavior: 'smooth' })" class="us-mall-btn-primary">
                                    <i class="ph ph-storefront" style="font-size: 18px;"></i>
                                    <span>استعرض المصانع</span>
                                </button>
                                <button onclick="window.enterDemoStoreMode ? window.enterDemoStoreMode() : window.switchSiteView('view-gallery')" class="us-mall-btn-secondary">
                                    <i class="ph ph-play" style="font-size: 14px;"></i>
                                    <span>تجربة النظام</span>
                                </button>
                            </div>
                        </div>
                    </div>

                    <!-- 4 Slider Dots at Bottom Center -->
                    <div class="us-mall-hero-dots">
                        <div class="us-mall-dot-active"></div>
                        <div class="us-mall-dot"></div>
                        <div class="us-mall-dot"></div>
                        <div class="us-mall-dot"></div>
                    </div>
                </div>

                <!-- 2. SECTION HEADER (المصانع المميزة ⭐️) -->
                <div id="mall-factories-section" class="us-mall-section-header">
                    <h2 class="us-mall-section-title">
                        <span>المصانع المميزة</span>
                        <i class="ph ph-star-fill" style="color: var(--devo-orange); font-size: 26px;"></i>
                    </h2>
                    <p class="us-mall-section-sub">
                        مجموعة مختارة من أفضل المصانع على منصة UltraSoft
                    </p>
                </div>

                <!-- 3. FEATURED FACTORIES GRID (4 CARDS) -->
                <div class="us-mall-grid">
                    ${activeMallTenants.map(factory => renderFactoryCard(factory)).join('')}
                </div>

            </div>
        </div>
    `;
}

/**
 * 🃏 تصيير كارت المصنع الواحد بدقة متوافقة مع الثيم
 */
function renderFactoryCard(factory) {
    const logoHtml = getLogoHtml(factory);
    const tagsHtml = renderTagPills(factory.tags);
    const slug = factory.slug || '';

    return `
        <div class="us-mall-card">
            <div>
                <!-- صورة الغلاف -->
                <div class="us-mall-card-cover">
                    <img src="${factory.coverUrl}" alt="${factory.displayName}" loading="lazy">
                </div>

                <!-- الشعار الدائري المتداخل بالمنتصف -->
                <div class="us-mall-card-logo">
                    ${logoHtml}
                </div>

                <!-- معلومات المصنع -->
                <div class="us-mall-card-body">
                    <h3 class="us-mall-card-name">${factory.displayName}</h3>
                    <p class="us-mall-card-tagline">${factory.tagline}</p>

                    <!-- التاجات التصنيفية -->
                    <div class="us-mall-card-tags">
                        ${tagsHtml}
                    </div>
                </div>
            </div>

            <!-- زر الإجراء السفلي -->
            <div style="padding: 0 16px 18px 16px;">
                <button onclick="window.handleExploreFactory('${slug}')" class="us-mall-card-btn">
                    <span>استكشف المتجر</span>
                    <i class="ph ph-arrow-left" style="font-size: 16px; font-weight: 800;"></i>
                </button>
            </div>
        </div>
    `;
}

/**
 * 🏷️ بناء الشارات والتاجات بألوان متناسقة مع الثيم
 */
function renderTagPills(tags) {
    if (!Array.isArray(tags)) return '';
    return tags.map(tag => {
        const text = typeof tag === 'string' ? tag : (tag.text || '');
        let type = typeof tag === 'object' && tag.type ? tag.type : 'muted';

        if (type === 'gray') type = 'muted';
        if (type === 'blue' || type === 'sky' || type === 'rose') type = 'brand';

        const pillClass = type === 'brand' ? 'us-mall-pill-brand' : 'us-mall-pill-muted';
        return `<span class="us-mall-pill ${pillClass}">${text}</span>`;
    }).join('');
}

/**
 * 🖼️ شعارات الـ SVG الدقيقة المتوافقة مع الثيم
 */
function getLogoHtml(factory) {
    if (factory.logoUrl && factory.logoUrl.startsWith('http')) {
        return `<img src="${factory.logoUrl}" alt="${factory.name}" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;" onerror="this.onerror=null; this.src='src/assets/icons/ultrasoft_transparent.png';">`;
    }

    switch (factory.logoType) {
        case 'alpha':
            return `
                <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="48" fill="var(--devo-black)" stroke="var(--devo-gray)" stroke-width="2" />
                    <text x="50" y="58" font-family="'Cairo', sans-serif" font-weight="900" font-size="36" text-anchor="middle" fill="var(--devo-text)">A</text>
                    <text x="50" y="76" font-family="'Cairo', sans-serif" font-weight="800" font-size="9" letter-spacing="2" text-anchor="middle" fill="var(--devo-muted)">ALPHA</text>
                </svg>
            `;
        case 'modern':
            return `
                <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="48" fill="var(--devo-black)" stroke="var(--devo-gray)" stroke-width="2" />
                    <path d="M50 24 L68 35 L68 53 L50 64 L32 53 L32 35 Z" stroke="var(--devo-orange)" stroke-width="2.5" fill="none" />
                    <path d="M41 50 L50 37 L59 50" stroke="var(--devo-orange)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" fill="none" />
                    <text x="50" y="76" font-family="'Cairo', sans-serif" font-weight="800" font-size="8.5" letter-spacing="1" text-anchor="middle" fill="var(--devo-text)">MODERN</text>
                    <text x="50" y="86" font-family="'Cairo', sans-serif" font-weight="800" font-size="7.5" letter-spacing="1" text-anchor="middle" fill="var(--devo-muted)">WEAR</text>
                </svg>
            `;
        case 'tiny':
            return `
                <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="48" fill="var(--devo-black)" stroke="var(--devo-gray)" stroke-width="2" />
                    <circle cx="35" cy="32" r="8" fill="#f59e0b"/>
                    <circle cx="65" cy="32" r="8" fill="#f59e0b"/>
                    <circle cx="50" cy="45" r="18" fill="#fbbf24"/>
                    <circle cx="44" cy="43" r="2.2" fill="#1e293b"/>
                    <circle cx="56" cy="43" r="2.2" fill="#1e293b"/>
                    <ellipse cx="50" cy="50" rx="6" ry="4" fill="#ffffff"/>
                    <ellipse cx="50" cy="48" rx="2.5" ry="1.8" fill="#d97706"/>
                    <text x="50" y="78" font-family="'Cairo', sans-serif" font-weight="800" font-size="10" text-anchor="middle" fill="var(--devo-text)">Tiny Style</text>
                </svg>
            `;
        case 'delta':
            return `
                <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <circle cx="50" cy="50" r="48" fill="var(--devo-black)" stroke="var(--devo-gray)" stroke-width="2" />
                    <path d="M38 28 L38 60 L49 60 C58 60 65 53 65 44 C65 35 58 28 49 28 Z M45 35 L49 35 C54 35 58 39 58 44 C58 49 54 53 49 53 L45 53 Z" fill="var(--devo-text)" />
                    <text x="50" y="78" font-family="'Cairo', sans-serif" font-weight="800" font-size="8.5" text-anchor="middle" fill="var(--devo-muted)">Delta Fabrics</text>
                </svg>
            `;
        default:
            const initial = (factory.name || 'U').charAt(0).toUpperCase();
            return `
                <div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 24px; color: var(--devo-text); background: var(--devo-black); border-radius: 50%;">
                    ${initial}
                </div>
            `;
    }
}
