import { supabase } from '../../config/supabase.js';

/**
 * UltraSoft Marketing & Subscription Landing Page Module
 * واجهة التسويق والتعريف بالنظام وخطط الأسعار لشركة UltraSoft
 */

export function initLandingPage() {
    const landingContainer = document.getElementById('view-landing');
    if (!landingContainer) return;

    landingContainer.innerHTML = renderLandingHTML();

    // Attach event listeners for tab switching & scrolling
    setupModuleTabListeners();

    // Dynamically load updated subscription plans from Supabase
    loadLandingDynamicPricingData();
}

function setupModuleTabListeners() {
    window.switchLandingModule = function(moduleId) {
        const overviewMod = document.getElementById('module-overview');
        const pricingMod = document.getElementById('module-pricing');
        const linkOverview = document.getElementById('nav-link-overview');
        const linkPricing = document.getElementById('nav-link-pricing');

        if (!overviewMod || !pricingMod) return;

        if (moduleId === 'pricing') {
            overviewMod.classList.add('hidden');
            pricingMod.classList.remove('hidden');

            // Active Link Styling
            if (linkPricing) {
                linkPricing.className = 'px-3.5 py-2 text-xs sm:text-sm font-black text-ultra-400 border-b-2 border-ultra-400 transition-all';
            }
            if (linkOverview) {
                linkOverview.className = 'px-3.5 py-2 text-xs sm:text-sm font-bold text-devo-muted hover:text-white transition-all';
            }
        } else {
            pricingMod.classList.add('hidden');
            overviewMod.classList.remove('hidden');

            // Active Link Styling
            if (linkOverview) {
                linkOverview.className = 'px-3.5 py-2 text-xs sm:text-sm font-black text-ultra-400 border-b-2 border-ultra-400 transition-all';
            }
            if (linkPricing) {
                linkPricing.className = 'px-3.5 py-2 text-xs sm:text-sm font-bold text-devo-muted hover:text-white transition-all';
            }
        }

        // Scroll smoothly to top of main container
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    window.scrollToContact = function() {
        const el = document.getElementById('contact-section');
        if (el) {
            el.scrollIntoView({ behavior: 'smooth' });
        }
    };
}

function renderLandingHTML() {
    const waNumber = '201140409832';
    const createWaLink = (planName, price) => {
        const text = `مرحباً شركة UltraSoft، أود الاستفسار والاشتراك في باقة (${planName}) بسعر ${price} لنظام إدارة المتاجر والمخازن.`;
        return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    };

    return `
        <div class="relative overflow-hidden bg-devo-black text-devo-text selection:bg-ultra-500 selection:text-white pb-12">
            
            <!-- Glow Background Highlights -->
            <div class="absolute top-0 right-1/4 w-96 h-96 bg-ultra-600/15 rounded-full filter blur-[120px] pointer-events-none"></div>
            <div class="absolute top-1/3 left-10 w-80 h-80 bg-blue-600/10 rounded-full filter blur-[100px] pointer-events-none"></div>
            <div class="absolute bottom-1/4 right-10 w-96 h-96 bg-sky-500/10 rounded-full filter blur-[140px] pointer-events-none"></div>

            <!-- ==========================================
                 MODULE 1: OVERVIEW & SYSTEM CAPABILITIES
                 ========================================== -->
            <div id="module-overview" class="transition-all duration-300">
                
                <!-- HERO CENTERED SECTION -->
                <section class="relative pt-8 pb-10 sm:pb-14 px-4 sm:px-6 lg:px-8 max-w-5xl mx-auto text-center flex flex-col items-center">
                    
                    <!-- SaaS Top Glow Badge Pill (Centered) -->
                    <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-ultra-500/15 via-sky-500/10 to-blue-500/15 border border-ultra-500/35 text-ultra-400 text-xs font-bold mb-5 shadow-[0_0_20px_rgba(2,132,199,0.2)]">
                        <span class="flex h-2 w-2 rounded-full bg-sky-400 animate-ping"></span>
                        <span>المنظومة السحابية المتكاملة ⚡</span>
                    </div>

                    <!-- Main Title (Centered) -->
                    <h1 class="text-2xl sm:text-4xl lg:text-5xl font-black text-devo-text leading-tight mb-4 tracking-tight">
                        منظومة <span class="bg-gradient-to-r from-sky-400 via-ultra-400 to-blue-500 bg-clip-text text-transparent" dir="ltr">UltraSoft ERP & POS</span><br>
                        إدارة سحابية ذكية ومحترفة لتجارتك
                    </h1>

                    <!-- Short One-Liner Tagline (Centered) -->
                    <p class="text-devo-muted text-xs sm:text-base leading-relaxed font-semibold mb-6 max-w-2xl mx-auto">
                        تحكم كامل وفوري في الموديلات، الباركود، رصيد المخزن، الأوردرات، والتقارير المالية بدقة فائقة ومن أي جهاز.
                    </p>

                    <!-- Target Business Types & Core Pillars (Symmetrical 4-Column Grid Desktop / 2x2 Mobile) -->
                    <div class="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5 mb-8 max-w-4xl w-full mx-auto">
                        <div class="px-3 py-2.5 rounded-2xl bg-devo-dark/90 border border-devo-gray/80 hover:border-ultra-500/40 text-devo-text text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all">
                            <div class="w-6 h-6 rounded-lg bg-sky-500/15 text-sky-400 flex items-center justify-center shrink-0">
                                <i class="ph-fill ph-factory text-sm"></i>
                            </div>
                            <span class="whitespace-nowrap">المصانع والمعارض</span>
                        </div>
                        <div class="px-3 py-2.5 rounded-2xl bg-devo-dark/90 border border-devo-gray/80 hover:border-ultra-500/40 text-devo-text text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all">
                            <div class="w-6 h-6 rounded-lg bg-emerald-500/15 text-emerald-400 flex items-center justify-center shrink-0">
                                <i class="ph-fill ph-t-shirt text-sm"></i>
                            </div>
                            <span class="whitespace-nowrap">محلات الملابس</span>
                        </div>
                        <div class="px-3 py-2.5 rounded-2xl bg-devo-dark/90 border border-devo-gray/80 hover:border-ultra-500/40 text-devo-text text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all">
                            <div class="w-6 h-6 rounded-lg bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                                <i class="ph-fill ph-package text-sm"></i>
                            </div>
                            <span class="whitespace-nowrap">إدارة الموديلات والمخزن</span>
                        </div>
                        <div class="px-3 py-2.5 rounded-2xl bg-devo-dark/90 border border-devo-gray/80 hover:border-ultra-500/40 text-devo-text text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm transition-all">
                            <div class="w-6 h-6 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0">
                                <i class="ph-fill ph-chart-line-up text-sm"></i>
                            </div>
                            <span class="whitespace-nowrap">تقارير مالية دقيقة</span>
                        </div>
                    </div>

                    <!-- CTA Action Buttons (Centered) -->
                    <div class="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-3.5 w-full sm:w-auto mb-10">
                        <a href="index.html" class="px-7 py-4 rounded-2xl bg-gradient-to-r from-ultra-600 to-blue-600 hover:from-ultra-500 hover:to-blue-500 text-white font-black text-xs sm:text-sm md:text-base shadow-[0_10px_25px_rgba(2,132,199,0.4)] transition-all flex items-center justify-center gap-2.5">
                            <i class="ph-fill ph-play-circle text-lg sm:text-xl"></i>
                            <span>تصفح المعرض التجريبي (Live Demo)</span>
                        </a>

                        <button onclick="switchLandingModule('pricing')" class="px-6 py-4 rounded-2xl bg-devo-dark hover:bg-devo-gray/50 border border-ultra-500/30 text-ultra-400 font-bold text-xs sm:text-sm md:text-base transition-all flex items-center justify-center gap-2">
                            <i class="ph ph-tag text-lg"></i>
                            <span>خطط الأسعار والاشتراكات</span>
                        </button>
                    </div>

                    <!-- Capabilities Cards Grid (Centered 4-card bar below CTAs) -->
                    <div class="w-full grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mt-2">
                        <!-- Card 1 -->
                        <div class="bg-devo-dark/90 border border-ultra-500/30 hover:border-ultra-400 p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 flex flex-col items-center text-center gap-2 group">
                            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-ultra-500/10 border border-ultra-500/30 text-ultra-400 flex items-center justify-center text-sm sm:text-base font-black shrink-0 group-hover:bg-ultra-600 group-hover:text-white transition-all">
                                100%
                            </div>
                            <div>
                                <h3 class="text-xs sm:text-sm font-bold text-devo-text mb-0.5">مزامنة سحابية</h3>
                                <p class="text-[10px] sm:text-xs text-devo-muted leading-tight font-medium">تزامن فوري بدون ريفريش</p>
                            </div>
                        </div>

                        <!-- Card 2 -->
                        <div class="bg-devo-dark/90 border border-sky-500/30 hover:border-sky-400 p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 flex flex-col items-center text-center gap-2 group">
                            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center text-sm sm:text-base font-black shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-all">
                                0s
                            </div>
                            <div>
                                <h3 class="text-xs sm:text-sm font-bold text-devo-text mb-0.5">تجهيز الفواتير</h3>
                                <p class="text-[10px] sm:text-xs text-devo-muted leading-tight font-medium">طباعة وإصدار فوري</p>
                            </div>
                        </div>

                        <!-- Card 3 -->
                        <div class="bg-devo-dark/90 border border-emerald-500/30 hover:border-emerald-400 p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 flex flex-col items-center text-center gap-2 group">
                            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-xs sm:text-sm font-black shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                PWA
                            </div>
                            <div>
                                <h3 class="text-xs sm:text-sm font-bold text-devo-text mb-0.5">كافة الأجهزة</h3>
                                <p class="text-[10px] sm:text-xs text-devo-muted leading-tight font-medium">موبايل، كمبيوتر، تابلت</p>
                            </div>
                        </div>

                        <!-- Card 4 -->
                        <div class="bg-devo-dark/90 border border-amber-500/30 hover:border-amber-400 p-3.5 sm:p-4 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 flex flex-col items-center text-center gap-2 group">
                            <div class="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-xs sm:text-sm font-black shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                24/7
                            </div>
                            <div>
                                <h3 class="text-xs sm:text-sm font-bold text-devo-text mb-0.5">دعم وتحديثات</h3>
                                <p class="text-[10px] sm:text-xs text-devo-muted leading-tight font-medium">تطوير ودعم متواصل</p>
                            </div>
                        </div>
                    </div>

                </section>

                <!-- SYSTEM FEATURES GRID -->
                <section class="py-10 sm:py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-devo-gray/40">
                    <div class="text-center max-w-3xl mx-auto mb-10 sm:mb-14">
                        <h2 class="text-2xl sm:text-4xl font-black text-devo-text mb-3">
                            كافة الإمكانيات والقدرات في منظومة واحدة
                        </h2>
                        <p class="text-devo-muted text-xs sm:text-base leading-relaxed font-medium">
                            صُمم نظام UltraSoft بعناية فائقة لتغطية كل خطوة في دورة العمل من أول إدخال الموديل وحتى الفاتورة والأرباح.
                        </p>
                    </div>

                    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10 sm:mb-12">
                        
                        <!-- Feature 1 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-ultra-500/10 border border-ultra-500/20 text-ultra-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-ultra-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-arrows-clockwise"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">المزامنة والمشاركة اللحظية</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                تحديث فوري وتزامن لحظي للأوردرات، الفواتير، والمخزون عبر كافه هواتف وأجهزة فريق العمل في نفس الثانية بدون ريفريش.
                            </p>
                        </div>

                        <!-- Feature 2: Telegram & Browser Notifications -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-sky-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-telegram-logo"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">إشعارات المتصفح والتليجرام</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إرسال وتلقي إشعارات الأوردرات الجديدة، المبيعات، ونواقص الأصناف فورياً على أجهزة المتصفح وعلى تطبيق Telegram.
                            </p>
                        </div>

                        <!-- Feature 3 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-pencil-line"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">تعديل الأوردرات وإعادة تحميلها</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إمكانية فتح وتعديل أي أوردر سابق بسهولة، إعادة تحميل محتوياته للسلة للعمل عليها من جديد وإصدار الفاتورة المحدثة.
                            </p>
                        </div>

                        <!-- Feature 4 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-user-switch"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">إسناد الأوردرات وتحويل العاملين</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إسناد الطلبات لعامل مبيعات أو موظف تجهيز آخر، وتحديد مستلم العربون والمسئول المالي عن كل معاملة بشكل ملحوظ.
                            </p>
                        </div>

                        <!-- Feature 5 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-rose-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-palette"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">تخصيص المظهر وألوان الواجهة</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إمكانية تخصيص ألوان الواجهة والهيدر والفوتر بنقرة زر (Themes Manager) ليتطابق النظام بالكامل مع هوية محلك.
                            </p>
                        </div>

                        <!-- Feature 6 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-qr-code"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">قارئ واستيكر الباركود الضوئي</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                ماسح ضوئي ذكي يعمل فورياً بكاميرا الموبايل والكمبيوتر دون شراء أجهزة خارجية، مع طباعة ملصقات الباركود للموديلات.
                            </p>
                        </div>

                        <!-- Feature 7 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-teal-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-file-spreadsheet"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">الرفع والتعديل المجمع عبر Excel</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                استيراد وتحديث أعداد وأسعار الموديلات والمقاسات بالجملة من خلال ملفات Excel مع تتبع رصيد الكريديت بكل سهولة.
                            </p>
                        </div>

                        <!-- Feature 8 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-4 sm:p-6 rounded-2xl sm:rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-2xl sm:text-3xl mb-4 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-hand-coins"></i>
                            </div>
                            <h3 class="text-base sm:text-lg font-bold text-devo-text mb-2">حساب العربون وتقارير الإيداعات</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                حساب العربون والمتبقي تلقائياً، تعيين مستلم العربون، واستخراج تقارير المقبوضات والإيداعات اليومية والشهرية.
                            </p>
                        </div>

                    </div>

                    <!-- Bottom Module 1 Action Banner -->
                    <div class="text-center bg-gradient-to-r from-ultra-600/20 via-devo-dark to-blue-600/20 border border-ultra-500/30 p-6 sm:p-8 rounded-3xl backdrop-blur-md">
                        <h3 class="text-lg sm:text-xl font-bold text-devo-text mb-2">هل ترغب في معرفة خطط الأسعار المناسبة لنشاطك؟</h3>
                        <p class="text-devo-muted text-xs sm:text-sm mb-5 font-medium">انتقل فوراً لموديول خطط الأسعار وجدول المقارنة للاختيار من بين الباقات المتاحة.</p>
                        <button onclick="switchLandingModule('pricing')" class="px-6 sm:px-8 py-3.5 rounded-xl bg-ultra-600 hover:bg-ultra-500 text-white font-bold text-xs sm:text-sm shadow-md transition-all inline-flex items-center gap-2">
                            <span>استعرض خطط الأسعار والمقارنة</span>
                            <i class="ph-fill ph-arrow-left"></i>
                        </button>
                    </div>
                </section>

            </div>

            <!-- ==========================================
                 MODULE 2: PRICING PLANS & COMPARISON MATRIX
                 ========================================== -->
            <div id="module-pricing" class="hidden transition-all duration-300">
                
                <!-- PRICING SECTION -->
                <section class="py-6 sm:py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    
                    <div class="text-center max-w-3xl mx-auto mb-10 sm:mb-12">
                        <h2 class="text-2xl sm:text-5xl font-black text-devo-text mb-3">
                            خطط الأسعار والاشتراكات
                        </h2>
                        <p class="text-devo-muted text-xs sm:text-base leading-relaxed font-medium">
                            اختر الباقة المناسبة لنشاطك التجاري واستمتع بإمكانيات مخصصة تزيد قيمتها مع كل باقة.
                        </p>
                    </div>

                    <!-- Pricing Cards Grid -->
                    <div id="landing-pricing-cards-grid" class="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-stretch max-w-5xl mx-auto mb-16 pt-4">
                        
                        <!-- PLAN 1: 3 MONTHS - EMERALD GREEN THEME -->
                        <div class="bg-gradient-to-b from-emerald-500/10 via-devo-dark to-emerald-600/15 border-2 border-emerald-500/60 hover:border-emerald-500 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                            
                            <!-- Top Header Badge -->
                            <div class="absolute -top-4 right-1/2 translate-x-1/2 px-3.5 py-1 rounded-full bg-emerald-500 text-slate-950 text-[11px] sm:text-xs font-black shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                                <i class="ph-fill ph-sparkle text-slate-950"></i>
                                <span>باقة البداية الاقتصادية</span>
                            </div>

                            <div>
                                <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                                    <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك 3 أشهر</h3>
                                    <span class="px-2.5 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] sm:text-xs font-black shadow-sm whitespace-nowrap">ربع سنوي</span>
                                </div>

                                <div class="mb-5">
                                    <div class="flex items-baseline gap-1.5">
                                        <span class="text-3xl sm:text-5xl font-black text-emerald-400">7,000</span>
                                        <span class="text-devo-muted text-xs sm:text-sm font-bold">ج.م</span>
                                    </div>
                                    <p class="text-[11px] sm:text-xs text-emerald-400 font-bold mt-1">الباقة الأساسية للمحلات والمتاجر الناشئة</p>
                                </div>

                                <!-- Spec Box -->
                                <div class="bg-devo-black/80 border border-emerald-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">الموديلات النشطة بالمعرض:</span>
                                        <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 200</span>
                                    </div>
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">رصيد الرفع والتعديل (Excel):</span>
                                        <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">200 كريديت</span>
                                    </div>
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">مستخدمو فريق العمل:</span>
                                        <span class="font-black text-slate-950 bg-emerald-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 4 أفراد</span>
                                    </div>
                                </div>

                                <!-- Unique Benefits Bullet List -->
                                <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>مناسبة للمتاجر والمحلات في بداية الانطلاق</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>إعداد وتأمين قاعدة البيانات السحابية فورياً</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>دعم فني وتدريب كامل 24/7 طوال الأسبوع</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>نسخ احتياطي سحابي تلقائي لبيانات الحساب</span>
                                    </li>
                                </ul>
                            </div>

                            <a href="${createWaLink('اشتراك 3 أشهر', '7000 جنيه')}" target="_blank" class="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                                <i class="ph-fill ph-whatsapp-logo text-slate-950 text-lg sm:text-xl"></i>
                                <span>اشترك الآن (7,000 ج.م)</span>
                            </a>
                        </div>

                        <!-- PLAN 2: 6 MONTHS - CYAN / SKY BLUE THEME (RECOMMENDED) -->
                        <div class="bg-gradient-to-b from-ultra-500/20 via-devo-dark to-sky-600/25 border-2 border-ultra-500 hover:border-sky-400 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-[0_10px_40px_rgba(2,132,199,0.4)] relative transform md:-translate-y-3">
                            
                            <!-- Top Header Badge -->
                            <div class="absolute -top-4 right-1/2 translate-x-1/2 px-3.5 py-1 rounded-full bg-gradient-to-r from-ultra-600 to-sky-500 text-white text-[11px] sm:text-xs font-black tracking-wide shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                                <i class="ph-fill ph-lightning text-amber-300"></i>
                                <span>الباقة الأكثر طلباً</span>
                            </div>

                            <!-- Discount Tag -->
                            <div class="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-sky-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-sky-300 whitespace-nowrap z-10">
                                خصم 28%
                            </div>

                            <div>
                                <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                                    <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك 6 أشهر</h3>
                                    <span class="px-2 py-0.5 rounded-full bg-sky-400 text-slate-950 font-black text-[10px] sm:text-xs whitespace-nowrap shadow-sm">توفير 4,000 ج.م</span>
                                </div>

                                <div class="mb-5">
                                    <div class="flex items-baseline gap-1.5">
                                        <span class="text-3xl sm:text-5xl font-black text-sky-400">10,000</span>
                                        <span class="text-devo-muted text-xs sm:text-sm font-bold">ج.م</span>
                                    </div>
                                    <p class="text-[11px] sm:text-xs text-sky-400 font-bold mt-1">الباقة المتكاملة لنشاط تجاري متوسط ومتوسع</p>
                                </div>

                                <!-- Spec Box -->
                                <div class="bg-devo-black/80 border border-sky-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">الموديلات النشطة بالمعرض:</span>
                                        <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 600 (3x)</span>
                                    </div>
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">رصيد الرفع والتعديل (Excel):</span>
                                        <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">500 كريديت (2.5x)</span>
                                    </div>
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">مستخدمو فريق العمل:</span>
                                        <span class="font-black text-slate-950 bg-sky-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 10 أفراد (2.5x)</span>
                                    </div>
                                </div>

                                <!-- Unique Benefits Bullet List -->
                                <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                                    <li class="flex items-center gap-2 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>جميع مميزات وتسهيلات باقة الـ 3 أشهر</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>توفير اقتصادي ممتاز بنسبة 28%</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>تخصيص الشعار والألوان والهوية على الفاتورة</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>أولوية مرتفعة في الدعم الفني والتدريب</span>
                                    </li>
                                </ul>
                            </div>

                            <a href="${createWaLink('اشتراك 6 أشهر', '10000 جنيه')}" target="_blank" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-ultra-600 to-sky-500 hover:from-ultra-500 hover:to-sky-400 text-white font-black text-xs sm:text-sm text-center shadow-[0_10px_25px_rgba(2,132,199,0.5)] transition-all flex items-center justify-center gap-2">
                                <i class="ph-fill ph-whatsapp-logo text-emerald-300 text-lg sm:text-xl"></i>
                                <span>اشترك الآن (10,000 ج.م)</span>
                            </a>
                        </div>

                        <!-- PLAN 3: 1 YEAR - GOLD / AMBER THEME (BEST VALUE) -->
                        <div class="bg-gradient-to-b from-amber-500/15 via-devo-dark to-amber-600/20 border-2 border-amber-500/70 hover:border-amber-400 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                            
                            <!-- Top Header Badge -->
                            <div class="absolute -top-4 right-1/2 translate-x-1/2 px-3.5 py-1 rounded-full bg-amber-500 text-slate-950 font-black text-[11px] sm:text-xs shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                                <i class="ph-fill ph-crown text-slate-950"></i>
                                <span>أفضل قيمة وتوفير</span>
                            </div>

                            <!-- Discount Tag -->
                            <div class="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-amber-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-amber-300 whitespace-nowrap z-10">
                                خصم 46%
                            </div>

                            <div>
                                <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                                    <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك سنة كاملة</h3>
                                    <span class="px-2 py-0.5 rounded-full bg-amber-400 text-slate-950 font-black text-[10px] sm:text-xs whitespace-nowrap shadow-sm">توفير 13,000 ج.م</span>
                                </div>

                                <div class="mb-5">
                                    <div class="flex items-baseline gap-1.5">
                                        <span class="text-3xl sm:text-5xl font-black text-amber-400">15,000</span>
                                        <span class="text-devo-muted text-xs sm:text-sm font-bold">ج.م</span>
                                    </div>
                                    <p class="text-[11px] sm:text-xs text-amber-400/90 font-bold mt-1">الباقة الملكية الشاملة لكافة الإمكانيات بلا حدود</p>
                                </div>

                                <!-- Spec Box -->
                                <div class="bg-devo-black/80 border border-amber-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">الموديلات النشطة بالمعرض:</span>
                                        <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">بلا حدود ✨</span>
                                    </div>
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">رصيد الرفع والتعديل (Excel):</span>
                                        <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">بلا حدود ✨</span>
                                    </div>
                                    <div class="flex items-center justify-between text-devo-text gap-2">
                                        <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0">مستخدمو فريق العمل:</span>
                                        <span class="font-black text-slate-950 bg-amber-400 px-2 py-0.5 rounded-md text-[11px] sm:text-xs whitespace-nowrap shadow-sm font-mono shrink-0">حتى 25 فرد</span>
                                    </div>
                                </div>

                                <!-- Unique Benefits Bullet List -->
                                <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                                    <li class="flex items-center gap-2 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>جميع المميزات والوظائف المتقدمة بلا حدود</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>توفير ضخم يصل إلى 46% مقارنة بالاشتراك الربع سنوي</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>دعم فني وتدريب VIP 24/7 (أولوية كبار العملاء)</span>
                                    </li>
                                    <li class="flex items-center gap-2 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>تصميم وتفصيل قوالب الفواتير والباركود مخصصاً</span>
                                    </li>
                                </ul>
                            </div>

                            <a href="${createWaLink('اشتراك سنة كاملة', '15000 جنيه')}" target="_blank" class="w-full py-3.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs sm:text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                                <i class="ph-fill ph-whatsapp-logo text-slate-950 text-lg sm:text-xl"></i>
                                <span>اشترك الآن (15,000 ج.م)</span>
                            </a>
                        </div>

                    </div>

                </section>
            </div>
        </div>
    `;
}

function getLandingRatioTag(baselineVal, currentVal) {
    if (baselineVal === undefined || baselineVal === null || currentVal === undefined || currentVal === null) return '';
    if (currentVal === -1) {
        return baselineVal > 0 ? ' (بلا حدود)' : '';
    }
    if (baselineVal <= 0 || baselineVal === -1) return '';

    const ratio = currentVal / baselineVal;
    if (ratio > 1) {
        const formatted = (ratio % 1 === 0) ? ratio.toFixed(0) : ratio.toFixed(1);
        return ` (${formatted}x)`;
    }
    return '';
}

function renderLandingCardLimitBadges(planKey, plan, limitsMap, badgeBgClass) {
    const lim = limitsMap[planKey] || {};
    const baseLim = limitsMap['quarterly'] || {};
    const isBase = planKey === 'quarterly';

    const fmtActive = (v, base) => (v === -1 ? 'بلا حدود ✨' : `حتى ${v ?? 200} م`) + (isBase ? '' : getLandingRatioTag(base, v));
    const fmtTotal = (v, base) => (v === -1 ? 'بلا حدود ✨' : `حتى ${v ?? 500} م`) + (isBase ? '' : getLandingRatioTag(base, v));
    const fmtInvoices = (v, base) => (v === -1 ? 'بلا حدود ✨' : `حتى ${v ?? 1000} ف`) + (isBase ? '' : getLandingRatioTag(base, v));
    const fmtCredits = (v, base) => (v === -1 ? 'بلا حدود ✨' : `${v ?? 200} ⚡/ش`) + (isBase ? '' : getLandingRatioTag(base, v));
    const fmtUsers = (v, base) => (v === -1 ? 'بلا حدود ✨' : `حتى ${v ?? 4} فرد`) + (isBase ? '' : getLandingRatioTag(base, v));

    const badges = [
        { label: 'إجمالي الموديلات بالمعرض:', value: fmtTotal(lim.max_total_products, baseLim.max_total_products) },
        { label: 'الموديلات النشطة بالمعرض:', value: fmtActive(lim.max_products, baseLim.max_products) },
        { label: 'حد الفواتير المسموح بها:', value: fmtInvoices(lim.max_invoices, baseLim.max_invoices) },
        { label: 'رصيد الرفع والتعديل (Excel):', value: fmtCredits(lim.monthly_excel_credits, baseLim.monthly_excel_credits) },
        { label: 'مستخدمو فريق العمل:', value: fmtUsers(lim.max_users, baseLim.max_users) }
    ];

    const customBadges = Array.isArray(plan.custom_limit_badges) ? plan.custom_limit_badges : [];
    customBadges.forEach(cb => {
        if (cb && cb.label && cb.value) {
            badges.push(cb);
        }
    });

    return badges.map(b => `
        <div class="flex items-center justify-between text-devo-text gap-2 pb-2 border-b border-devo-gray/30 last:border-b-0 last:pb-0">
            <span class="text-devo-muted font-bold text-[11px] sm:text-xs shrink-0 whitespace-nowrap">${b.label}</span>
            <span class="font-black text-slate-950 ${badgeBgClass} px-2 py-0.5 rounded-md text-[11px] sm:text-xs shadow-sm font-mono shrink-0 whitespace-nowrap">
                ${b.value}
            </span>
        </div>
    `).join('');
}

export async function loadLandingDynamicPricingData() {
    try {
        const [plansRes, limitsRes, featuresRes] = await Promise.all([
            supabase.from('system_subscription_plans').select('*').order('sort_order', { ascending: true }),
            supabase.from('subscription_plan_limits').select('*'),
            supabase.from('subscription_comparison_features').select('*').order('sort_order', { ascending: true })
        ]);

        const plans = plansRes.data || [];
        const limitsList = limitsRes.data || [];
        const features = featuresRes.data || [];

        const limitsMap = {};
        limitsList.forEach(lim => { limitsMap[lim.plan_key] = lim; });

        if (plans.length > 0) {
            renderLandingPlanCards(plans, limitsMap);
            updateLandingTableHeaders(plans);
        }

        if (features.length > 0) {
            renderLandingComparisonTable(features);
        }

    } catch (err) {
        console.warn('Supabase landing pricing load error:', err);
    }
}

let currentComparisonFeatures = [];
let activeMobilePlanKey = 'semi_annual';

window.switchMobileComparisonPlan = function(planKey) {
    activeMobilePlanKey = planKey;

    const tabKeys = ['quarterly', 'semi_annual', 'annual'];
    tabKeys.forEach(k => {
        const btn = document.getElementById(`tab-mobile-${k}`);
        if (!btn) return;
        if (k === planKey) {
            let activeBg = 'bg-sky-500 text-white shadow font-black';
            if (k === 'quarterly') activeBg = 'bg-emerald-500 text-white shadow font-black';
            if (k === 'annual') activeBg = 'bg-amber-500 text-slate-950 shadow font-black';
            btn.className = `py-2.5 px-1 rounded-xl text-center transition-all ${activeBg}`;
        } else {
            btn.className = 'py-2.5 px-1 rounded-xl font-bold text-center transition-all text-devo-muted hover:text-white';
        }
    });

    const headerEl = document.getElementById('mobile-selected-plan-header');
    const headerRow = document.getElementById('mobile-table-header-row');
    if (headerEl && headerRow) {
        if (planKey === 'quarterly') {
            headerEl.textContent = 'اشتراك 3 أشهر';
            headerRow.className = 'border-b border-devo-gray bg-emerald-500/15 text-emerald-400 font-bold';
        } else if (planKey === 'semi_annual') {
            headerEl.textContent = 'اشتراك 6 أشهر (الأكثر طلباً)';
            headerRow.className = 'border-b border-devo-gray bg-sky-500/15 text-sky-400 font-bold';
        } else if (planKey === 'annual') {
            headerEl.textContent = 'اشتراك سنة كاملة (أفضل قيمة)';
            headerRow.className = 'border-b border-devo-gray bg-amber-500/15 text-amber-400 font-bold';
        }
    }

    if (currentComparisonFeatures.length > 0) {
        renderLandingComparisonTable(currentComparisonFeatures);
    }
};

function renderLandingPlanCards(plans, limitsMap) {
    const cardsGrid = document.getElementById('landing-pricing-cards-grid');
    if (!cardsGrid) return;

    const waNumber = '201000000000';
    const createWaLink = (planName, price) => {
        const text = `مرحباً شركة UltraSoft، أود الاستفسار والاشتراك في باقة (${planName}) بسعر ${price} لنظام إدارة المتاجر والمخزن.`;
        return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    };

    cardsGrid.innerHTML = plans.map(plan => {
        const isPurple = plan.color_scheme === 'purple' || plan.key === 'trial';
        const isEmerald = plan.color_scheme === 'emerald' || plan.key === 'quarterly';
        const isSky = plan.color_scheme === 'sky' || plan.key === 'semi_annual';
        const isAmber = plan.color_scheme === 'amber' || plan.key === 'annual';

        const features = Array.isArray(plan.features_list) ? plan.features_list : [];
        const priceFormatted = (plan.price || 0).toLocaleString();

        if (isPurple) {
            return `
                <div class="bg-gradient-to-b from-purple-500/15 via-devo-dark to-purple-600/20 border-2 border-purple-500/70 hover:border-purple-400 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                    <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-purple-500 text-white font-black text-xs shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                        <i class="ph-fill ph-gift text-amber-300"></i>
                        <span>${plan.name || 'الباقة التجريبية المجانية'}</span>
                    </div>

                    ${plan.discount_tag ? `
                        <div class="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-purple-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-purple-300 whitespace-nowrap z-10">
                            ${plan.discount_tag}
                        </div>
                    ` : ''}

                    <div>
                        <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                            <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">${plan.badge_text || 'تجربة مجانية (5 أيام)'}</h3>
                            ${plan.savings_tag ? `<span class="px-2 py-0.5 rounded-full bg-purple-400 text-slate-950 font-black text-[10px] sm:text-xs whitespace-nowrap shadow-sm">${plan.savings_tag}</span>` : ''}
                        </div>

                        <div class="mb-5">
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-3xl sm:text-5xl font-black text-purple-400">مجاناً</span>
                                <span class="text-devo-muted text-xs font-bold">(5 أيام تجريبية)</span>
                            </div>
                            <p class="text-[11px] sm:text-xs text-purple-300/90 font-bold mt-1">${plan.subtitle || ''}</p>
                        </div>

                        <!-- Dynamic Spec Box -->
                        <div class="bg-devo-black/80 border border-purple-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                            ${renderLandingCardLimitBadges('trial', plan, limitsMap, 'bg-purple-400')}
                        </div>

                        <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                            ${features.map(f => `
                                <li class="flex items-center gap-2 text-devo-text font-bold">
                                    <i class="ph-fill ph-check-circle text-purple-400 text-base shrink-0"></i>
                                    <span>${f}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <a href="${createWaLink(plan.badge_text || 'الباقة التجريبية المجانية', 'مجاني (0 ج.م)')}" target="_blank" class="w-full py-3.5 rounded-2xl bg-purple-500 hover:bg-purple-400 text-white font-black text-xs sm:text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                        <i class="ph-fill ph-rocket-launch text-amber-300 text-lg sm:text-xl"></i>
                        <span>ابدأ التجربة المجانية الآن</span>
                    </a>
                </div>
            `;
        } else if (isEmerald) {
            return `
                <div class="bg-gradient-to-b from-emerald-500/10 via-devo-dark to-emerald-600/15 border-2 border-emerald-500/60 hover:border-emerald-500 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                    <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                        <i class="ph-fill ph-sparkle text-slate-950"></i>
                        <span>${plan.name || 'باقة البداية الاقتصادية'}</span>
                    </div>

                    <div>
                        <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                            <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">${plan.badge_text || 'اشتراك 3 أشهر'}</h3>
                            <span class="px-2 py-0.5 rounded-full bg-emerald-400 text-slate-950 text-[10px] sm:text-xs font-black shadow-sm whitespace-nowrap">${plan.savings_tag || 'ربع سنوي'}</span>
                        </div>

                        <div class="mb-5">
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-3xl sm:text-5xl font-black text-emerald-400">${priceFormatted}</span>
                                <span class="text-devo-muted text-xs sm:text-sm font-bold">${plan.currency || 'ج.م'}</span>
                            </div>
                            <p class="text-[11px] sm:text-xs text-emerald-400 font-bold mt-1">${plan.subtitle || ''}</p>
                        </div>

                        <!-- Dynamic Spec Box -->
                        <div class="bg-devo-black/80 border border-emerald-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                            ${renderLandingCardLimitBadges('quarterly', plan, limitsMap, 'bg-emerald-400')}
                        </div>

                        <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                            ${features.map(f => `
                                <li class="flex items-center gap-2 text-devo-text font-medium">
                                    <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                    <span>${f}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <a href="${createWaLink(plan.badge_text || 'اشتراك 3 أشهر', priceFormatted + ' جنيه')}" target="_blank" class="w-full py-3.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs sm:text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                        <i class="ph-fill ph-whatsapp-logo text-slate-950 text-lg sm:text-xl"></i>
                        <span>اشترك الآن (${priceFormatted} ج.م)</span>
                    </a>
                </div>
            `;
        } else if (isSky) {
            return `
                <div class="bg-gradient-to-b from-ultra-500/20 via-devo-dark to-sky-600/25 border-2 border-ultra-500 hover:border-sky-400 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-[0_10px_40px_rgba(2,132,199,0.4)] relative transform md:-translate-y-3">
                    <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-ultra-600 to-sky-500 text-white text-xs font-black tracking-wide shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                        <i class="ph-fill ph-lightning text-amber-300"></i>
                        <span>${plan.name || 'الباقة الأكثر طلباً'}</span>
                    </div>

                    ${plan.discount_tag ? `
                        <div class="absolute top-3 left-3 px-2 py-0.5 rounded-lg bg-sky-400 text-slate-950 font-black text-[10px] sm:text-xs shadow-md border border-sky-300 whitespace-nowrap z-10">
                            ${plan.discount_tag}
                        </div>
                    ` : ''}

                    <div>
                        <div class="flex justify-between items-center mb-3 pt-3 gap-2">
                            <h3 class="text-base sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">${plan.badge_text || 'اشتراك 6 أشهر'}</h3>
                            ${plan.savings_tag ? `<span class="px-2 py-0.5 rounded-full bg-sky-400 text-slate-950 font-black text-[10px] sm:text-xs whitespace-nowrap shadow-sm">${plan.savings_tag}</span>` : ''}
                        </div>

                        <div class="mb-5">
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-3xl sm:text-5xl font-black text-sky-400">${priceFormatted}</span>
                                <span class="text-devo-muted text-xs sm:text-sm font-bold">${plan.currency || 'ج.م'}</span>
                            </div>
                            <p class="text-[11px] sm:text-xs text-sky-400 font-bold mt-1">${plan.subtitle || ''}</p>
                        </div>

                        <!-- Dynamic Spec Box -->
                        <div class="bg-devo-black/80 border border-sky-500/40 p-3 sm:p-4 rounded-2xl mb-6 space-y-2 text-xs">
                            ${renderLandingCardLimitBadges('semi_annual', plan, limitsMap, 'bg-sky-400')}
                        </div>

                        <ul class="space-y-2.5 text-xs sm:text-sm text-devo-muted mb-6">
                            ${features.map(f => `
                                <li class="flex items-center gap-2 text-devo-text font-bold">
                                    <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                    <span>${f}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <a href="${createWaLink(plan.badge_text || 'اشتراك 6 أشهر', priceFormatted + ' جنيه')}" target="_blank" class="w-full py-3.5 rounded-2xl bg-gradient-to-r from-ultra-600 to-sky-500 hover:from-ultra-500 hover:to-sky-400 text-white font-black text-xs sm:text-sm text-center shadow-[0_10px_25px_rgba(2,132,199,0.5)] transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02]">
                        <i class="ph-fill ph-whatsapp-logo text-emerald-300 text-lg sm:text-xl"></i>
                        <span>اشترك الآن (${priceFormatted} ج.م)</span>
                    </a>
                </div>
            `;
        } else {
            return `
                <div class="bg-gradient-to-b from-amber-500/15 via-devo-dark to-amber-600/20 border-2 border-amber-500/70 hover:border-amber-400 rounded-3xl p-4 sm:p-7 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                    <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5 whitespace-nowrap z-10">
                        <i class="ph-fill ph-crown text-slate-950"></i>
                        <span>${plan.name || 'أفضل قيمة وتوفير'}</span>
                    </div>

                    ${plan.discount_tag ? `
                        <div class="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shadow-md border border-amber-300 whitespace-nowrap z-10">
                            ${plan.discount_tag}
                        </div>
                    ` : ''}

                    <div>
                        <div class="flex justify-between items-center mb-3 pt-3">
                            <h3 class="text-lg sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">${plan.badge_text || 'اشتراك سنة كاملة'}</h3>
                            ${plan.savings_tag ? `<span class="px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs whitespace-nowrap shadow-sm">${plan.savings_tag}</span>` : ''}
                        </div>

                        <div class="mb-6">
                            <div class="flex items-baseline gap-1.5">
                                <span class="text-4xl sm:text-5xl font-black text-amber-400">${priceFormatted}</span>
                                <span class="text-devo-muted text-sm font-bold">${plan.currency || 'ج.م'}</span>
                            </div>
                            <p class="text-xs text-amber-400/90 font-bold mt-1">${plan.subtitle || ''}</p>
                        </div>

                        <!-- Dynamic Spec Box -->
                        <div class="bg-devo-black/80 border border-amber-500/40 p-4 rounded-2xl mb-6 space-y-2.5 text-xs">
                            ${renderLandingCardLimitBadges('annual', plan, limitsMap, 'bg-amber-400')}
                        </div>

                        <ul class="space-y-3 text-xs sm:text-sm text-devo-muted mb-8">
                            ${features.map(f => `
                                <li class="flex items-center gap-2.5 text-devo-text font-bold">
                                    <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                    <span>${f}</span>
                                </li>
                            `).join('')}
                        </ul>
                    </div>

                    <a href="${createWaLink(plan.badge_text || 'اشتراك سنة كاملة', priceFormatted + ' جنيه')}" target="_blank" class="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                        <i class="ph-fill ph-whatsapp-logo text-slate-950 text-xl"></i>
                        <span>اشترك الآن (${priceFormatted} ج.م)</span>
                    </a>
                </div>
            `;
        }
    }).join('');
}

function renderMobileComparisonRows() {
    const mobileBody = document.getElementById('landing-comparison-mobile-body');
    if (!mobileBody || currentComparisonFeatures.length === 0) return;

    let textColorClass = 'text-sky-400 bg-sky-500/5';
    if (activeMobilePlanKey === 'quarterly') textColorClass = 'text-emerald-400 bg-emerald-500/5';
    if (activeMobilePlanKey === 'annual') textColorClass = 'text-amber-400 bg-amber-500/5';

    mobileBody.innerHTML = currentComparisonFeatures.map(feat => {
        const vals = feat.plan_values || {};
        const val = vals[activeMobilePlanKey] || 'متاح';
        const iconClass = getFeatureIconClass(feat.feature_name || '');

        return `
            <tr>
                <td class="p-3 font-bold text-devo-text flex items-center gap-1.5 text-xs">
                    <i class="${iconClass} shrink-0"></i>
                    <span class="leading-tight">${feat.feature_name}</span>
                </td>
                <td class="p-3 text-center font-bold ${textColorClass} text-xs">${formatLandingVal(val)}</td>
            </tr>
        `;
    }).join('');
}

function updateLandingTableHeaders(plans) {
    const qPlan = plans.find(p => p.key === 'quarterly') || {};
    const sPlan = plans.find(p => p.key === 'semi_annual') || {};
    const aPlan = plans.find(p => p.key === 'annual') || {};

    const qTh = document.getElementById('landing-th-quarterly');
    const sTh = document.getElementById('landing-th-semi-annual');
    const aTh = document.getElementById('landing-th-annual');

    if (qTh) qTh.textContent = `${qPlan.badge_text || 'اشتراك 3 أشهر'} (${(qPlan.price || 7000).toLocaleString()} ج.م)`;
    if (sTh) sTh.textContent = `${sPlan.badge_text || 'اشتراك 6 أشهر'} (${(sPlan.price || 10000).toLocaleString()} ج.م)`;
    if (aTh) aTh.textContent = `${aPlan.badge_text || 'اشتراك سنة'} (${(aPlan.price || 15000).toLocaleString()} ج.م)`;
}

function getFeatureIconClass(name) {
    if (name.includes('نشطة')) return 'ph ph-t-shirt text-ultra-400';
    if (name.includes('إجمالي الموديلات')) return 'ph ph-squares-four text-sky-400';
    if (name.includes('حد الفواتير')) return 'ph ph-receipt text-emerald-400';
    if (name.includes('Excel')) return 'ph ph-file-arrow-up text-amber-400';
    if (name.includes('مستخدمين') || name.includes('فريق')) return 'ph ph-users-three text-purple-400';
    if (name.includes('إشعارات')) return 'ph ph-telegram-logo text-sky-400';
    if (name.includes('مزامنة')) return 'ph ph-arrows-clockwise text-emerald-400';
    if (name.includes('تنبيهات')) return 'ph ph-bell-ringing text-amber-400';
    if (name.includes('تعديل الفواتير')) return 'ph ph-pencil-line text-sky-400';
    if (name.includes('إسناد')) return 'ph ph-user-switch text-purple-400';
    if (name.includes('ألوان')) return 'ph ph-palette text-rose-400';
    if (name.includes('العربون')) return 'ph ph-hand-coins text-blue-400';
    if (name.includes('معرض')) return 'ph ph-qr-code text-sky-400';
    if (name.includes('المخزن')) return 'ph ph-package text-emerald-400';
    if (name.includes('الطباعة')) return 'ph ph-printer text-blue-400';
    if (name.includes('الدعم')) return 'ph ph-headphones text-rose-400';
    if (name.includes('النسخ')) return 'ph ph-database text-teal-400';
    return 'ph ph-check-circle text-ultra-400';
}

function formatLandingVal(v) {
    if (v === 'متاح') return `<span class="inline-flex items-center gap-1 text-emerald-400 font-bold"><i class="ph-fill ph-check-circle text-base"></i> متاح</span>`;
    if (v === 'غير متاح') return `<span class="inline-flex items-center gap-1 text-red-400 font-bold"><i class="ph-fill ph-x-circle text-base"></i> غير متاح</span>`;
    return v;
}

function renderLandingComparisonTable(features) {
    const uniqueMap = new Map();
    features.forEach(f => {
        const key = (f.feature_name || '').trim();
        if (key && !uniqueMap.has(key)) uniqueMap.set(key, f);
    });
    currentComparisonFeatures = Array.from(uniqueMap.values());

    const tbody = document.getElementById('landing-comparison-table-body');
    if (tbody) {
        tbody.innerHTML = currentComparisonFeatures.map(feat => {
            const vals = feat.plan_values || {};
            const qVal = vals.quarterly || 'متاح';
            const sVal = vals.semi_annual || 'متاح';
            const aVal = vals.annual || 'متاح';

            const iconClass = getFeatureIconClass(feat.feature_name || '');

            return `
                <tr>
                    <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                        <i class="${iconClass}"></i>
                        <span>${feat.feature_name}</span>
                    </td>
                    <td class="p-4 text-center font-bold text-emerald-400 bg-emerald-500/5">${formatLandingVal(qVal)}</td>
                    <td class="p-4 text-center font-bold text-sky-400 bg-ultra-500/5">${formatLandingVal(sVal)}</td>
                    <td class="p-4 text-center font-black text-amber-400 bg-amber-500/5">${formatLandingVal(aVal)}</td>
                </tr>
            `;
        }).join('');
    }

    renderMobileComparisonRows();
}
