/**
 * UltraSoft Mall Component
 * واجهة العرض والتسوق لمول ألترا سوفت الرقمي (UltraSoft Mall)
 * متناسقة 100% مع ثيم الموقع النشط (Dynamic Theme)
 * تعتمد على البيانات الحقيقية من قاعدة بيانات Supabase
 * مع دعم الأغلفة والشعارات الافتراضية الذكية، والمصانع المميزة، واستعراض المول كاملاً
 */

import { fetchMallTenants, fetchMallConfig, DEFAULT_MALL_BANNERS } from '../../services/mall_service.js';

let activeMallTenants = [];
let allMallTenants = [];
let mallSliderTimer = null;
let currentMallSlideIdx = 0;
let totalMallSlides = 0;

/**
 * 🚀 تهيئة وعرض UltraSoft Mall في صفحة الموقع
 */
export async function initUltraSoftMall() {
    window.initUltraSoftMall = initUltraSoftMall;
    const container = document.getElementById('view-mall');
    if (!container) return;

    // إخفاء زر السلة العائم فوراً عند فتح المول
    const floatingCartBtn = document.getElementById('floating-cart-btn');
    if (floatingCartBtn) floatingCartBtn.classList.add('hidden');

    // تهيئة معالج فتح متجر المصنع عالمياً
    window.handleExploreFactory = (slug) => {
        if (slug && slug !== 'default') {
            const hostname = window.location.hostname;
            const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname.endsWith('.local');
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

    // معالج أزرار بانرات السلايدر التفاعلي
    window.handleMallBannerAction = (action, target) => {
        if (action === 'scroll' || (target && target.startsWith('#'))) {
            const el = document.querySelector(target || '#mall-factories-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        } else if (action === 'demo') {
            if (typeof window.enterDemoStoreMode === 'function') {
                window.enterDemoStoreMode();
            } else if (typeof window.switchSiteView === 'function') {
                window.switchSiteView('view-gallery');
            }
        } else if (action === 'factory' || (target && !target.startsWith('http') && !target.startsWith('#'))) {
            window.handleExploreFactory(target);
        } else if (action === 'link' || (target && target.startsWith('http'))) {
            window.open(target, '_blank');
        } else {
            const el = document.getElementById('mall-factories-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
        }
    };

    // إظهار حالة التحميل الأنيقة
    container.innerHTML = `
        <div class="us-mall-wrapper flex items-center justify-center min-h-[60vh]">
            <div class="text-center space-y-3">
                <i class="ph ph-spinner animate-spin text-4xl text-devo-orange block mx-auto"></i>
                <p class="text-sm font-bold text-devo-muted">جاري تحميل مول ألترا سوفت الرقمي...</p>
            </div>
        </div>
    `;

    try {
        const [config, dbTenants] = await Promise.all([
            fetchMallConfig().catch(() => ({})),
            fetchMallTenants().catch(() => [])
        ]);

        allMallTenants = Array.isArray(dbTenants) ? dbTenants : [];
        activeMallTenants = allMallTenants.map(t => ({
            id: t.id,
            slug: t.slug,
            name: t.name,
            displayName: t.displayName || t.name,
            tagline: t.description || 'مصنع معتمد على منصة UltraSoft',
            coverUrl: t.coverUrl || 'src/assets/mall_delta_fabrics.jpg',
            logoUrl: t.logoUrl,
            badge: t.badge || (t.isFeatured ? 'براند مميز 🔥' : 'مصنع رسمي 🌟'),
            tags: t.tags || ['ملابس جاهزة'],
            isFeatured: Boolean(t.isFeatured),
            order: Number(t.order ?? 999)
        })).sort((a, b) => (a.order - b.order) || ((b.isFeatured ? 1 : 0) - (a.isFeatured ? 1 : 0)));

        renderMallView(container, config);
    } catch (err) {
        console.error('[UltraSoftMall] Initialization error:', err);
        allMallTenants = [];
        activeMallTenants = [];
        renderMallView(container, {});
    }
}

/**
 * 🎨 تصيير كامل واجهة UltraSoft Mall المتناسقة مع الثيم
 */
function renderMallView(container, config) {
    const rawBanners = Array.isArray(config?.banners) && config.banners.length > 0
        ? config.banners.filter(b => b.is_active !== false)
        : DEFAULT_MALL_BANNERS;
    const banners = rawBanners.length > 0 ? rawBanners : DEFAULT_MALL_BANNERS;

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
            
            /* HERO SLIDER CONTAINER */
            .us-mall-hero {
                width: 100%;
                height: 440px;
                border-radius: 28px;
                overflow: hidden;
                position: relative;
                background-color: var(--devo-dark);
                box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
                border: 1px solid var(--devo-gray);
                user-select: none;
            }

            /* SLIDES TRACK (SMOOTH HORIZONTAL SLIDING ANIMATION) */
            .us-mall-slides-track {
                display: flex;
                height: 100%;
                width: 100%;
                transition: transform 0.65s cubic-bezier(0.22, 1, 0.36, 1);
                direction: ltr !important;
            }

            /* INDIVIDUAL SLIDE */
            .us-mall-slide {
                min-width: 100%;
                width: 100%;
                height: 100%;
                position: relative;
                flex-shrink: 0;
                overflow: hidden;
            }

            /* HERO BACKGROUND IMAGE */
            .us-mall-slide-bg {
                position: absolute;
                inset: 0;
                background-size: cover;
                background-position: right center;
                background-repeat: no-repeat;
                z-index: 1;
                transition: transform 6s ease-out;
            }
            .us-mall-slide.active .us-mall-slide-bg {
                transform: scale(1.03);
            }

            /* HERO BLEND OVERLAY (Balanced Transparency & Image Clarity) */
            .us-mall-slide-blend {
                position: absolute;
                inset: 0;
                z-index: 2;
                pointer-events: none;
                background: linear-gradient(
                    90deg,
                    color-mix(in srgb, var(--devo-dark) 85%, transparent) 0%,
                    color-mix(in srgb, var(--devo-dark) 70%, transparent) 28%,
                    color-mix(in srgb, var(--devo-dark) 45%, transparent) 48%,
                    color-mix(in srgb, var(--devo-dark) 18%, transparent) 68%,
                    transparent 85%
                );
            }

            /* HERO CONTENT PANEL */
            .us-mall-slide-content {
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
                text-shadow: 0 1px 4px rgba(0, 0, 0, 0.6);
            }
            .us-mall-title-en {
                font-size: 44px;
                font-weight: 900;
                color: var(--devo-text);
                line-height: 1.08;
                margin: 0 0 16px 0;
                font-family: 'Cairo', -apple-system, BlinkMacSystemFont, sans-serif;
                text-shadow: 0 2px 12px rgba(0, 0, 0, 0.7);
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
                text-shadow: 0 2px 10px rgba(0, 0, 0, 0.7);
            }
            .us-mall-sub-ar {
                font-size: 12.5px;
                font-weight: 600;
                color: var(--devo-muted);
                margin-bottom: 26px;
                font-family: 'Cairo', sans-serif;
                text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6);
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

            /* HERO SLIDER ARROWS */
            .us-mall-slider-arrow {
                position: absolute;
                top: 50%;
                transform: translateY(-50%);
                z-index: 20;
                width: 44px;
                height: 44px;
                border-radius: 50%;
                background: color-mix(in srgb, var(--devo-dark) 85%, transparent);
                backdrop-filter: blur(8px);
                border: 1px solid var(--devo-gray);
                color: var(--devo-text);
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 22px;
                cursor: pointer;
                opacity: 0;
                transition: opacity 0.25s ease, background-color 0.25s ease, border-color 0.25s ease, transform 0.25s ease;
                box-shadow: 0 4px 14px rgba(0, 0, 0, 0.3);
            }
            .us-mall-hero:hover .us-mall-slider-arrow {
                opacity: 0.85;
            }
            .us-mall-slider-arrow:hover {
                opacity: 1 !important;
                background: var(--devo-orange) !important;
                color: #ffffff !important;
                border-color: var(--devo-orange) !important;
                transform: translateY(-50%) scale(1.08);
            }
            .us-mall-slider-prev {
                right: 20px;
            }
            .us-mall-slider-next {
                left: 20px;
            }

            /* HERO SLIDER DOTS */
            .us-mall-hero-dots {
                position: absolute;
                bottom: 18px;
                left: 50%;
                transform: translateX(-50%);
                display: flex;
                align-items: center;
                gap: 8px;
                z-index: 20;
            }
            .us-mall-dot-btn {
                background: transparent;
                border: none;
                padding: 4px;
                cursor: pointer;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            .us-mall-dot-bar {
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: color-mix(in srgb, var(--devo-muted) 45%, transparent);
                transition: all 0.3s ease;
                display: block;
            }
            .us-mall-dot-btn.active .us-mall-dot-bar {
                width: 28px;
                height: 8px;
                border-radius: 9999px;
                background-color: var(--devo-orange);
                box-shadow: 0 0 12px var(--devo-orange);
            }

            /* UNIFIED SECTION HEADER */
            .us-mall-section-header-unified {
                display: flex;
                flex-direction: row;
                align-items: flex-end;
                justify-content: space-between;
                flex-wrap: wrap;
                gap: 16px;
                margin-top: 48px;
                margin-bottom: 28px;
                padding-bottom: 20px;
                border-bottom: 1px solid color-mix(in srgb, var(--devo-gray) 60%, transparent);
            }
            .us-mall-header-text {
                display: flex;
                flex-direction: column;
                gap: 4px;
            }
            .us-mall-section-title {
                font-size: 26px;
                font-weight: 900;
                color: var(--devo-text) !important;
                display: flex;
                align-items: center;
                gap: 10px;
                margin: 0;
                font-family: 'Cairo', sans-serif;
            }
            .us-mall-count-badge {
                padding: 3px 12px;
                border-radius: 9999px;
                font-size: 12px;
                font-weight: 800;
                font-family: 'Cairo', sans-serif;
                background-color: color-mix(in srgb, var(--devo-orange) 15%, transparent);
                color: var(--devo-orange);
                border: 1px solid color-mix(in srgb, var(--devo-orange) 30%, transparent);
            }
            .us-mall-section-sub {
                font-size: 13.5px;
                font-weight: 600;
                color: var(--devo-muted) !important;
                margin: 4px 0 0 0;
                font-family: 'Cairo', sans-serif;
            }

            /* SEARCH BAR */
            .us-mall-search-wrapper {
                position: relative;
                width: 100%;
                max-width: 320px;
            }
            .us-mall-search-icon {
                position: absolute;
                right: 14px;
                top: 50%;
                transform: translateY(-50%);
                color: var(--devo-muted);
                font-size: 18px;
                pointer-events: none;
            }
            .us-mall-search-input {
                width: 100%;
                background-color: var(--devo-dark);
                border: 1px solid var(--devo-gray);
                border-radius: 12px;
                padding: 10px 42px 10px 16px;
                color: var(--devo-text);
                font-size: 13.5px;
                font-family: 'Cairo', sans-serif;
                outline: none;
                transition: border-color 0.2s ease, box-shadow 0.2s ease;
            }
            .us-mall-search-input:focus {
                border-color: var(--devo-orange);
                box-shadow: 0 0 0 3px color-mix(in srgb, var(--devo-orange) 20%, transparent);
            }
            .us-mall-search-input::placeholder {
                color: var(--devo-muted);
                opacity: 0.8;
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
                position: relative;
            }
            .us-mall-card:hover {
                transform: translateY(-5px);
                box-shadow: 0 16px 36px rgba(0, 0, 0, 0.35);
                border-color: var(--devo-orange);
            }

            /* FEATURED FACTORY CARD DISTINCTIONS (GOLDEN ROYAL THEME) */
            .us-mall-card-featured {
                border: 2px solid #f59e0b !important;
                box-shadow: 0 10px 30px rgba(245, 158, 11, 0.16), 0 4px 14px rgba(0, 0, 0, 0.35) !important;
            }
            .us-mall-card-featured:hover {
                border-color: #fbbf24 !important;
                box-shadow: 0 18px 40px rgba(245, 158, 11, 0.3), 0 6px 20px rgba(0, 0, 0, 0.45) !important;
                transform: translateY(-6px);
            }
            .us-mall-card-featured .us-mall-card-logo {
                border-color: #f59e0b !important;
                box-shadow: 0 0 18px rgba(245, 158, 11, 0.45) !important;
            }
            .us-mall-featured-crown {
                position: absolute;
                top: 10px;
                right: 10px;
                z-index: 10;
                width: 34px;
                height: 34px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                background: linear-gradient(135deg, #fef08a 0%, #f59e0b 55%, #b45309 100%);
                color: #78350f;
                font-size: 18px;
                box-shadow: 0 4px 14px rgba(245, 158, 11, 0.45), 0 0 0 2px rgba(254, 240, 138, 0.4);
                pointer-events: none;
                transition: transform 0.25s ease;
            }
            .us-mall-card-featured:hover .us-mall-featured-crown {
                transform: scale(1.15) rotate(-6deg);
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
                transition: border-color 0.25s ease, box-shadow 0.25s ease;
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
                display: -webkit-box;
                -webkit-line-clamp: 2;
                -webkit-box-orient: vertical;
                overflow: hidden;
                min-height: 34px;
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
            .us-mall-card-btn-featured {
                background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%) !important;
                color: #ffffff !important;
                border: 1px solid #f59e0b !important;
                box-shadow: 0 4px 14px rgba(245, 158, 11, 0.35) !important;
            }
            .us-mall-card-btn-featured:hover {
                background: linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%) !important;
                box-shadow: 0 6px 20px rgba(245, 158, 11, 0.5) !important;
                transform: translateY(-2px);
            }

            /* RESPONSIVE DESIGN */
            @media (max-width: 1024px) {
                .us-mall-grid {
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                }
                .us-mall-slide-content {
                    width: 60%;
                    padding: 36px 36px;
                }
                .us-mall-slide-blend {
                    background: linear-gradient(
                        90deg,
                        color-mix(in srgb, var(--devo-dark) 88%, transparent) 0%,
                        color-mix(in srgb, var(--devo-dark) 72%, transparent) 40%,
                        color-mix(in srgb, var(--devo-dark) 35%, transparent) 68%,
                        transparent 90%
                    );
                }
            }
            @media (max-width: 768px) {
                .us-mall-hero {
                    height: auto;
                    min-height: 480px;
                }
                .us-mall-slide {
                    min-height: 480px;
                }
                .us-mall-slide-blend {
                    background: linear-gradient(
                        to bottom,
                        color-mix(in srgb, var(--devo-dark) 85%, transparent) 0%,
                        color-mix(in srgb, var(--devo-dark) 70%, transparent) 60%,
                        color-mix(in srgb, var(--devo-dark) 45%, transparent) 100%
                    );
                }
                .us-mall-slide-content {
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
                .us-mall-section-header-unified {
                    flex-direction: column;
                    align-items: stretch;
                }
                .us-mall-search-wrapper {
                    max-width: 100%;
                }
                .us-mall-slider-arrow {
                    display: none !important;
                }
            }
        </style>

        <div class="us-mall-wrapper">
            <div class="us-mall-container">
                
                <!-- 1. DYNAMIC HERO SLIDER -->
                <div class="us-mall-hero" id="mallHeroCarousel">
                    <!-- Slides Track -->
                    <div class="us-mall-slides-track" id="mallSlidesTrack">
                        ${banners.map((slide, idx) => `
                            <div class="us-mall-slide ${idx === 0 ? 'active' : ''}" data-slide-index="${idx}">
                                <div class="us-mall-slide-bg" style="background-image: url('${slide.image_url || 'src/assets/ultrasoft%20mall.png'}');"></div>
                                <div class="us-mall-slide-blend"></div>

                                <div class="us-mall-slide-content">
                                    <!-- Top English / Subtitle (LTR) -->
                                    <div style="direction: ltr; text-align: left;">
                                        ${slide.subtitle ? `
                                            <div class="us-mall-subtitle-en">
                                                ${slide.subtitle}
                                            </div>
                                        ` : ''}
                                        <h1 class="us-mall-title-en">
                                            ${slide.title || 'UltraSoft <span class="us-mall-title-accent">Mall</span>'}
                                        </h1>
                                    </div>

                                    <!-- Arabic Description & Buttons (RTL) -->
                                    <div style="direction: rtl; text-align: right;">
                                        <div class="us-mall-desc-ar">
                                            ${slide.description || 'اكتشف مجموعة من والمتاجر التي تعمل بنظام UltraSoft'}
                                        </div>
                                        <div class="us-mall-sub-ar">
                                            ${slide.sub_description || 'جودة عالية • تصاميم متنوعة • تجربة تسوق احترافية'}
                                        </div>

                                        <!-- Buttons (Side-by-Side in RTL) -->
                                        <div class="us-mall-actions">
                                            ${slide.primary_btn_text ? `
                                                <button onclick="window.handleMallBannerAction('${slide.primary_btn_action || 'scroll'}', '${slide.primary_btn_target || '#mall-factories-section'}')" class="us-mall-btn-primary">
                                                    <i class="ph ph-storefront" style="font-size: 18px;"></i>
                                                    <span>${slide.primary_btn_text}</span>
                                                </button>
                                            ` : ''}
                                            ${slide.secondary_btn_text ? `
                                                <button onclick="window.handleMallBannerAction('${slide.secondary_btn_action || 'demo'}', '${slide.secondary_btn_target || ''}')" class="us-mall-btn-secondary">
                                                    <i class="ph ph-play" style="font-size: 14px;"></i>
                                                    <span>${slide.secondary_btn_text}</span>
                                                </button>
                                            ` : ''}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                    </div>

                    ${banners.length > 1 ? `
                        <!-- Navigation Arrows -->
                        <button class="us-mall-slider-arrow us-mall-slider-prev" onclick="window.prevMallSlide?.()" aria-label="السابق">
                            <i class="ph ph-caret-right"></i>
                        </button>
                        <button class="us-mall-slider-arrow us-mall-slider-next" onclick="window.nextMallSlide?.()" aria-label="التالي">
                            <i class="ph ph-caret-left"></i>
                        </button>

                        <!-- Slider Dots -->
                        <div class="us-mall-hero-dots" id="mallSliderDots">
                            ${banners.map((_, i) => `
                                <button onclick="window.goToMallSlide?.(${i})" class="us-mall-dot-btn ${i === 0 ? 'active' : ''}" aria-label="الشريحة ${i + 1}">
                                    <span class="us-mall-dot-bar"></span>
                                </button>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>

                <!-- 2. UNIFIED MALL FACTORIES SECTION -->
                <div id="mall-factories-section" class="us-mall-section-header-unified">
                    <div class="us-mall-header-text">
                        <div class="flex items-center gap-3 flex-wrap">
                            <h2 class="us-mall-section-title">
                                <i class="ph ph-storefront" style="color: var(--devo-orange); font-size: 28px;"></i>
                                <span>مصانع وشركات UltraSoft Mall</span>
                            </h2>
                            <span class="us-mall-count-badge">
                                ${activeMallTenants.length} مصنع وشركة
                            </span>
                        </div>
                        <p class="us-mall-section-sub">
                            تصفح كافة المصانع والشركات المعتمدة على المنصة وتسوق مباشرة من متاجرهم
                        </p>
                    </div>

                    <!-- Search & Filter Bar -->
                    <div class="us-mall-search-wrapper">
                        <i class="ph ph-magnifying-glass us-mall-search-icon"></i>
                        <input type="text" id="mallMainSearchInput" placeholder="بحث سريع في مصانع المول بالاسم أو التخصص..."
                            class="us-mall-search-input">
                    </div>
                </div>

                <!-- 3. UNIFIED FACTORIES GRID -->
                ${activeMallTenants.length > 0 ? `
                    <div id="mallMainCardsGrid" class="us-mall-grid">
                        ${activeMallTenants.map(factory => renderFactoryCard(factory)).join('')}
                    </div>
                ` : `
                    <div class="bg-devo-dark border border-devo-gray rounded-2xl p-10 text-center space-y-3">
                        <i class="ph ph-buildings text-4xl text-devo-muted opacity-50 block mx-auto"></i>
                        <p class="text-base font-bold text-devo-text">لم يتم تفعيل مصانع في المول حتى الآن</p>
                        <p class="text-xs text-devo-muted">يمكن لمدير النظام تفعيل المصانع للعرض في المول من لوحة السوبر أدمين.</p>
                        <button onclick="window.enterDemoStoreMode ? window.enterDemoStoreMode() : window.switchSiteView('view-gallery')" class="us-mall-btn-primary mt-2">
                            <i class="ph ph-play"></i>
                            <span>استكشاف متجر تجريبي (Demo Mode)</span>
                        </button>
                    </div>
                `}

            </div>
        </div>
    `;

    // Attach real-time search listener to the unified grid
    setupMallDirectoryListeners();

    // تشغيل محرك السلايدر التلقائي للبانرات
    setupMallSlider(banners.length);
}

/**
 * 🃏 تصيير كارت المصنع بدقة متوافقة مع الثيم وتمييز المصانع المميزة
 */
function renderFactoryCard(factory) {
    const logoHtml = getLogoHtml(factory);
    const tagsHtml = renderTagPills(factory.tags);
    const slug = factory.slug || '';
    const isFeatured = Boolean(factory.isFeatured);

    return `
        <div class="us-mall-card ${isFeatured ? 'us-mall-card-featured' : ''}">
            <div>
                <!-- صورة الغلاف -->
                <div class="us-mall-card-cover">
                    ${isFeatured ? `
                        <div class="us-mall-featured-crown" title="مصنع معتمد ومميز">
                            <i class="ph-fill ph-crown"></i>
                        </div>
                    ` : ''}
                    <img src="${factory.coverUrl}" alt="${factory.displayName}" loading="lazy" onerror="this.onerror=null; this.src='src/assets/mall_delta_fabrics.jpg';">
                </div>

                <!-- الشعار الدائري المتداخل بالمنتصف -->
                <div class="us-mall-card-logo">
                    ${logoHtml}
                </div>

                <!-- معلومات المصنع -->
                <div class="us-mall-card-body">
                    <h3 class="us-mall-card-name flex items-center justify-center gap-1.5" title="${factory.displayName}">
                        <span>${factory.displayName}</span>
                        ${isFeatured ? `<i class="ph-fill ph-crown text-amber-400 text-lg inline-block" title="مصنع معتمد ومميز"></i>` : ''}
                    </h3>
                    <p class="us-mall-card-tagline">${factory.tagline}</p>

                    <!-- التاجات التصنيفية -->
                    <div class="us-mall-card-tags">
                        ${tagsHtml}
                    </div>
                </div>
            </div>

            <!-- زر الإجراء السفلي -->
            <div style="padding: 0 16px 18px 16px;">
                <button onclick="window.handleExploreFactory('${slug}')" class="us-mall-card-btn ${isFeatured ? 'us-mall-card-btn-featured' : ''}">
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
        if (type === 'blue' || type === 'sky' || type === 'rose' || type === 'brand') type = 'brand';

        const pillClass = type === 'brand' ? 'us-mall-pill-brand' : 'us-mall-pill-muted';
        return `<span class="us-mall-pill ${pillClass}">${text}</span>`;
    }).join('');
}

/**
 * 🖼️ شعارات الـ SVG الدقيقة أو الصور المتوافقة مع الثيم
 */
function getLogoHtml(factory) {
    if (factory.logoUrl && factory.logoUrl.trim() && !factory.logoUrl.includes('ultrasoft_transparent.png')) {
        return `<img src="${factory.logoUrl}" alt="${factory.displayName}" style="width: 100%; height: 100%; object-fit: contain; padding: 4px;" onerror="this.onerror=null; this.src='src/assets/icons/ultrasoft_transparent.png';">`;
    }

    const initial = (factory.displayName || factory.name || 'U').charAt(0).toUpperCase();
    return `
        <svg viewBox="0 0 100 100" style="width: 100%; height: 100%;" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="50" cy="50" r="48" fill="var(--devo-black)" stroke="var(--devo-gray)" stroke-width="2.5" />
            <text x="50" y="60" font-family="'Cairo', sans-serif" font-weight="900" font-size="36" text-anchor="middle" fill="var(--devo-text)">${initial}</text>
        </svg>
    `;
}

/**
 * 🔍 تفعيل مستمع البحث اللحظي للشبكة الموحدة
 */
function setupMallDirectoryListeners() {
    const searchInput = document.getElementById('mallMainSearchInput');
    const cardsGrid = document.getElementById('mallMainCardsGrid');
    if (searchInput && cardsGrid) {
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim().toLowerCase();
            if (!query) {
                cardsGrid.innerHTML = activeMallTenants.map(factory => renderFactoryCard(factory)).join('');
                return;
            }

            const filtered = activeMallTenants.filter(f => {
                const name = (f.displayName || f.name || '').toLowerCase();
                const desc = (f.tagline || '').toLowerCase();
                const tags = Array.isArray(f.tags) ? f.tags.join(' ').toLowerCase() : '';
                return name.includes(query) || desc.includes(query) || tags.includes(query);
            });

            if (filtered.length === 0) {
                cardsGrid.innerHTML = `
                    <div class="col-span-full py-16 text-center text-devo-muted">
                        <i class="ph ph-magnifying-glass text-4xl mb-3 opacity-40 block mx-auto"></i>
                        <p class="text-base font-bold text-devo-text mb-1">لا توجد مصانع مطابقة لبحثك: "${e.target.value}"</p>
                        <p class="text-xs text-devo-muted">جرب البحث بكلمات أخرى أو تصفح كل المصانع المتاحة في المول.</p>
                    </div>
                `;
            } else {
                cardsGrid.innerHTML = filtered.map(factory => renderFactoryCard(factory)).join('');
            }
        });
    }
}

/**
 * 🎠 محرك السلايدر التفاعلي لبانرات وإعلانات المول (Hero Dynamic Carousel)
 * يدعم الحركة التلقائية كل 5 ثوانٍ، الإيقاف عند التمرير، أسهم التنقل، ومؤشرات النقاط التفاعلية
 */
function setupMallSlider(slidesCount) {
    totalMallSlides = Number(slidesCount) || 0;
    currentMallSlideIdx = 0;

    if (mallSliderTimer) {
        clearInterval(mallSliderTimer);
        mallSliderTimer = null;
    }

    const hero = document.getElementById('mallHeroCarousel');
    const track = document.getElementById('mallSlidesTrack');
    const dotsContainer = document.getElementById('mallSliderDots');

    if (!hero || !track || totalMallSlides <= 1) return;

    // تحديث موضع الشريحة
    const updateSlidePosition = () => {
        track.style.transform = `translateX(-${currentMallSlideIdx * 100}%)`;

        // تحديث حالة الشرائح
        const slides = track.querySelectorAll('.us-mall-slide');
        slides.forEach((s, idx) => {
            if (idx === currentMallSlideIdx) {
                s.classList.add('active');
            } else {
                s.classList.remove('active');
            }
        });

        // تحديث حالة نقاط المؤشر
        if (dotsContainer) {
            const dots = dotsContainer.querySelectorAll('.us-mall-dot-btn');
            dots.forEach((dot, idx) => {
                if (idx === currentMallSlideIdx) {
                    dot.classList.add('active');
                } else {
                    dot.classList.remove('active');
                }
            });
        }
    };

    // الانتقال لشريحة محددة
    window.goToMallSlide = (idx) => {
        if (totalMallSlides <= 1) return;
        currentMallSlideIdx = (idx + totalMallSlides) % totalMallSlides;
        updateSlidePosition();
        resetTimer();
    };

    // الشريحة التالية
    window.nextMallSlide = () => {
        window.goToMallSlide(currentMallSlideIdx + 1);
    };

    // الشريحة السابقة
    window.prevMallSlide = () => {
        window.goToMallSlide(currentMallSlideIdx - 1);
    };

    // مؤقت الحركة التلقائية كل 5 ثوانٍ
    const startTimer = () => {
        if (totalMallSlides <= 1) return;
        if (mallSliderTimer) clearInterval(mallSliderTimer);
        mallSliderTimer = setInterval(() => {
            currentMallSlideIdx = (currentMallSlideIdx + 1) % totalMallSlides;
            updateSlidePosition();
        }, 5000);
    };

    const stopTimer = () => {
        if (mallSliderTimer) {
            clearInterval(mallSliderTimer);
            mallSliderTimer = null;
        }
    };

    const resetTimer = () => {
        stopTimer();
        startTimer();
    };

    // إيقاف السلايدر عند وضع الماوس فوقه واستئنافه عند الخروج
    hero.addEventListener('mouseenter', stopTimer);
    hero.addEventListener('mouseleave', startTimer);

    // دعم السحب والإفلات / اللمس للهواتف
    let touchStartX = 0;
    let touchEndX = 0;

    hero.addEventListener('touchstart', (e) => {
        touchStartX = e.changedTouches[0].screenX;
        stopTimer();
    }, { passive: true });

    hero.addEventListener('touchend', (e) => {
        touchEndX = e.changedTouches[0].screenX;
        const diff = touchStartX - touchEndX;
        if (Math.abs(diff) > 40) {
            if (diff > 0) {
                // سحب لليسار
                window.nextMallSlide();
            } else {
                // سحب لليمين
                window.prevMallSlide();
            }
        }
        startTimer();
    }, { passive: true });

    // بدء الحركة التلقائية فوراً
    startTimer();
}

