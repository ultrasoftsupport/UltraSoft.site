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
                
                <!-- HERO SPLIT SECTION (SIDE-BY-SIDE DESIGN) -->
                <section class="relative pt-6 pb-14 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
                        
                        <!-- Right Side: Headline, Paragraph, and Action Buttons -->
                        <div class="lg:col-span-7 text-right">
                            <h1 class="text-2xl sm:text-4xl lg:text-5xl font-black text-devo-text leading-[1.3] mb-6 tracking-tight">
                                منظومة <span class="inline-block whitespace-nowrap bg-gradient-to-r from-sky-400 via-ultra-400 to-blue-500 bg-clip-text text-transparent" dir="ltr">UltraSoft ERP & POS</span><br>
                                إدارة سحابية ذكية ومحترفة لتجارتك
                            </h1>

                            <p class="text-devo-muted text-base sm:text-lg lg:text-xl leading-relaxed mb-8 font-medium max-w-2xl">
                                نظام سحابي متكامل صُمم خصيصاً للمصانع، المعارض، محلات الملابس والمتاجر. يُتيح لك التحكم الكامل في الموديلات، الباركود، رصيد المخزن، الأوردرات، والتقارير المالية بدقة فائقة ومن أي مكان.
                            </p>

                            <div class="flex flex-wrap items-center gap-3 sm:gap-4">
                                <a href="index.html" class="px-6 sm:px-7 py-3.5 sm:py-4 rounded-2xl bg-gradient-to-r from-ultra-600 to-blue-600 hover:from-ultra-500 hover:to-blue-500 text-white font-black text-xs sm:text-sm md:text-base shadow-[0_10px_30px_rgba(2,132,199,0.4)] hover:shadow-[0_15px_35px_rgba(2,132,199,0.6)] transition-all transform hover:-translate-y-1 flex items-center gap-2.5">
                                    <i class="ph-fill ph-play-circle text-lg sm:text-xl"></i>
                                    <span>تصفح المعرض التجريبي (Live Demo)</span>
                                </a>

                                <a href="admin.html" class="px-5 sm:px-6 py-3.5 sm:py-4 rounded-2xl bg-devo-dark hover:bg-devo-gray border border-devo-gray text-devo-text font-bold text-xs sm:text-sm md:text-base transition-all transform hover:-translate-y-1 flex items-center gap-2 shadow-md">
                                    <i class="ph-fill ph-shield-check text-sky-400 text-lg sm:text-xl"></i>
                                    <span>معاينة لوحة الأدمن</span>
                                </a>

                                <button onclick="switchLandingModule('pricing')" class="px-5 py-3.5 sm:py-4 rounded-2xl bg-devo-black hover:bg-devo-dark border border-ultra-500/30 text-ultra-400 font-bold text-xs sm:text-sm md:text-base transition-all flex items-center gap-2">
                                    <i class="ph ph-tag text-lg"></i>
                                    <span>خطط الأسعار</span>
                                </button>
                            </div>
                        </div>

                        <!-- Left Side: Vertical Stats & Capabilities Cards Stack -->
                        <div class="lg:col-span-5 space-y-4">
                            
                            <!-- Card 1 -->
                            <div class="bg-devo-dark/90 border border-ultra-500/30 hover:border-ultra-400 p-5 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 transform hover:-translate-x-1 flex items-center gap-4 group">
                                <div class="w-14 h-14 rounded-xl bg-ultra-500/10 border border-ultra-500/30 text-ultra-400 flex items-center justify-center text-xl font-black shrink-0 group-hover:bg-ultra-600 group-hover:text-white transition-all">
                                    100%
                                </div>
                                <div class="text-right">
                                    <h3 class="text-base font-bold text-devo-text mb-0.5">مزامنة سحابية لحظية</h3>
                                    <p class="text-xs text-devo-muted leading-relaxed font-medium">تزامن فوري للمبيعات والأوردرات والمخزن عبر كافة الأجهزة بدون ريفريش</p>
                                </div>
                            </div>

                            <!-- Card 2 -->
                            <div class="bg-devo-dark/90 border border-sky-500/30 hover:border-sky-400 p-5 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 transform hover:-translate-x-1 flex items-center gap-4 group">
                                <div class="w-14 h-14 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400 flex items-center justify-center text-xl font-black shrink-0 group-hover:bg-sky-500 group-hover:text-white transition-all">
                                    0s
                                </div>
                                <div class="text-right">
                                    <h3 class="text-base font-bold text-devo-text mb-0.5">تجهيز الفواتير بدون تأخير</h3>
                                    <p class="text-xs text-devo-muted leading-relaxed font-medium">سرعة فائقة في إصدار وحفظ وطباعة الفواتير حرارياً و A4</p>
                                </div>
                            </div>

                            <!-- Card 3 -->
                            <div class="bg-devo-dark/90 border border-emerald-500/30 hover:border-emerald-400 p-5 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 transform hover:-translate-x-1 flex items-center gap-4 group">
                                <div class="w-14 h-14 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center text-sm font-black shrink-0 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                    PWA
                                </div>
                                <div class="text-right">
                                    <h3 class="text-base font-bold text-devo-text mb-0.5">يعمل على كافة الأجهزة</h3>
                                    <p class="text-xs text-devo-muted leading-relaxed font-medium">تطبيق ويب تقدمي يعمل بسلاسة على الموبايل والكمبيوتر والأجهزة اللوحية</p>
                                </div>
                            </div>

                            <!-- Card 4 -->
                            <div class="bg-devo-dark/90 border border-amber-500/30 hover:border-amber-400 p-5 rounded-2xl backdrop-blur-xl shadow-lg transition-all duration-300 transform hover:-translate-x-1 flex items-center gap-4 group">
                                <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center justify-center text-sm font-black shrink-0 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                    24/7
                                </div>
                                <div class="text-right">
                                    <h3 class="text-base font-bold text-devo-text mb-0.5">دعم فني وتحديثات مستمرة</h3>
                                    <p class="text-xs text-devo-muted leading-relaxed font-medium">دعم فني شامل ومتابعة وتطوير دوري لبيانات المنظومة</p>
                                </div>
                            </div>

                        </div>

                    </div>
                </section>

                <!-- SYSTEM FEATURES GRID -->
                <section class="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-devo-gray/40">
                    <div class="text-center max-w-3xl mx-auto mb-14">
                        <h2 class="text-2xl sm:text-4xl font-black text-devo-text mb-4">
                            كافة الإمكانيات والقدرات في منظومة واحدة
                        </h2>
                        <p class="text-devo-muted text-sm sm:text-base leading-relaxed font-medium">
                            صُمم نظام UltraSoft بعناية فائقة لتغطية كل خطوة في دورة العمل من أول إدخال الموديل وحتى الفاتورة والأرباح.
                        </p>
                    </div>

                    <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
                        
                        <!-- Feature 1 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-ultra-500/10 border border-ultra-500/20 text-ultra-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-ultra-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-arrows-clockwise"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">المزامنة والمشاركة اللحظية</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                تحديث فوري وتزامن لحظي للأوردرات، الفواتير، والمخزون عبر كافه هواتف وأجهزة فريق العمل في نفس الثانية بدون ريفريش.
                            </p>
                        </div>

                        <!-- Feature 2: Telegram & Browser Notifications -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-sky-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-telegram-logo"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">إشعارات المتصفح والتليجرام</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إرسال وتلقي إشعارات الأوردرات الجديدة، المبيعات، ونواقص الأصناف فورياً على أجهزة المتصفح وعلى تطبيق Telegram.
                            </p>
                        </div>

                        <!-- Feature 3 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-pencil-line"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">تعديل الأوردرات وإعادة تحميلها</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إمكانية فتح وتعديل أي أوردر سابق بسهولة، إعادة تحميل محتوياته للسلة للعمل عليها من جديد وإصدار الفاتورة المحدثة.
                            </p>
                        </div>

                        <!-- Feature 4 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-user-switch"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">إسناد الأوردرات وتحويل العاملين</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إسناد الطلبات لعامل مبيعات أو موظف تجهيز آخر، وتحديد مستلم العربون والمسئول المالي عن كل معاملة بشكل ملحوظ.
                            </p>
                        </div>

                        <!-- Feature 5 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-rose-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-palette"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">تخصيص المظهر وألوان الواجهة</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                إمكانية تخصيص ألوان الواجهة والهيدر والفوتر بنقرة زر (Themes Manager) ليتطابق النظام بالكامل مع هوية محلك.
                            </p>
                        </div>

                        <!-- Feature 6 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-qr-code"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">قارئ واستيكر الباركود الضوئي</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                ماسح ضوئي ذكي يعمل فورياً بكاميرا الموبايل والكمبيوتر دون شراء أجهزة خارجية، مع طباعة ملصقات الباركود للموديلات.
                            </p>
                        </div>

                        <!-- Feature 7 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-teal-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-file-spreadsheet"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">الرفع والتعديل المجمع عبر Excel</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                استيراد وتحديث أعداد وأسعار الموديلات والمقاسات بالجملة من خلال ملفات Excel مع تتبع رصيد الكريديت بكل سهولة.
                            </p>
                        </div>

                        <!-- Feature 8 -->
                        <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                            <div class="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all">
                                <i class="ph-fill ph-hand-coins"></i>
                            </div>
                            <h3 class="text-lg font-bold text-devo-text mb-2">حساب العربون وتقارير الإيداعات</h3>
                            <p class="text-devo-muted text-xs sm:text-sm leading-relaxed font-medium">
                                حساب العربون والمتبقي تلقائياً، تعيين مستلم العربون، واستخراج تقارير المقبوضات والإيداعات اليومية والشهرية.
                            </p>
                        </div>

                    </div>

                    <!-- Bottom Module 1 Action Banner -->
                    <div class="text-center bg-gradient-to-r from-ultra-600/20 via-devo-dark to-blue-600/20 border border-ultra-500/30 p-8 rounded-3xl backdrop-blur-md">
                        <h3 class="text-xl font-bold text-devo-text mb-3">هل ترغب في معرفة خطط الأسعار المناسبة لنشاطك؟</h3>
                        <p class="text-devo-muted text-sm mb-6 font-medium">انتقل فوراً لموديول خطط الأسعار وجدول المقارنة للاختيار من بين الباقات المتاحة.</p>
                        <button onclick="switchLandingModule('pricing')" class="px-8 py-3.5 rounded-xl bg-ultra-600 hover:bg-ultra-500 text-white font-bold text-sm shadow-md transition-all inline-flex items-center gap-2">
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
                <section class="py-8 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto">
                    
                    <div class="text-center max-w-3xl mx-auto mb-12">
                        <h2 class="text-3xl sm:text-5xl font-black text-devo-text mb-4">
                            خطط الأسعار والاشتراكات
                        </h2>
                        <p class="text-devo-muted text-sm sm:text-base leading-relaxed font-medium">
                            اختر الباقة المناسبة لنشاطك التجاري واستمتع بإمكانيات مخصصة تزيد قيمتها مع كل باقة.
                        </p>
                    </div>

                    <!-- Pricing Cards Grid -->
                    <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto mb-16 pt-4">
                        
                        <!-- PLAN 1: 3 MONTHS - EMERALD GREEN THEME -->
                        <div class="bg-gradient-to-b from-emerald-500/10 via-devo-dark to-emerald-600/15 border-2 border-emerald-500/60 hover:border-emerald-500 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                            
                            <!-- Original Top Header Badge -->
                            <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-xs font-black shadow-md flex items-center gap-1.5 whitespace-nowrap">
                                <i class="ph-fill ph-sparkle text-slate-950"></i>
                                <span>باقة البداية الاقتصادية</span>
                            </div>

                            <div>
                                <div class="flex justify-between items-center mb-3 pt-3">
                                    <h3 class="text-lg sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك 3 أشهر</h3>
                                    <span class="px-2.5 py-1 rounded-full bg-emerald-400 text-slate-950 text-xs font-black shadow-sm whitespace-nowrap">ربع سنوي</span>
                                </div>

                                <div class="mb-6">
                                    <div class="flex items-baseline gap-1.5">
                                        <span class="text-4xl sm:text-5xl font-black text-emerald-400">7,000</span>
                                        <span class="text-devo-muted text-sm font-bold">ج.م</span>
                                    </div>
                                    <p class="text-xs text-emerald-400 font-bold mt-1">الباقة الأساسية للمحلات والمتاجر الناشئة</p>
                                </div>

                                <!-- Spec Box (Solid High-Contrast Readable Badges) -->
                                <div class="bg-devo-black/80 border border-emerald-500/40 p-4 rounded-2xl mb-6 space-y-2.5 text-xs">
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">الموديلات النشطة بالمعرض:</span>
                                        <span class="font-black text-slate-950 bg-emerald-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">حتى 200 موديل</span>
                                    </div>
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">رصيد الرفع والتعديل (Excel):</span>
                                        <span class="font-black text-slate-950 bg-emerald-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">200 كريديت / شهرياً</span>
                                    </div>
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">مستخدمو فريق العمل:</span>
                                        <span class="font-black text-slate-950 bg-emerald-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">حتى 4 مستخدمين</span>
                                    </div>
                                </div>

                                <!-- Unique Benefits Bullet List -->
                                <ul class="space-y-3 text-xs sm:text-sm text-devo-muted mb-8">
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>مناسبة للمتاجر والمحلات في بداية الانطلاق</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>إعداد وتأمين قاعدة البيانات السحابية فورياً</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>دعم فني وتدريب كامل 24/7 طوال الأسبوع</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                        <span>نسخ احتياطي سحابي تلقائي لبيانات الحساب</span>
                                    </li>
                                </ul>
                            </div>

                            <a href="${createWaLink('اشتراك 3 أشهر', '7000 جنيه')}" target="_blank" class="w-full py-4 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                                <i class="ph-fill ph-whatsapp-logo text-slate-950 text-xl"></i>
                                <span>اشترك الآن (7,000 ج.م)</span>
                            </a>
                        </div>

                        <!-- PLAN 2: 6 MONTHS - CYAN / SKY BLUE THEME (RECOMMENDED) -->
                        <div class="bg-gradient-to-b from-ultra-500/20 via-devo-dark to-sky-600/25 border-2 border-ultra-500 hover:border-sky-400 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 shadow-[0_10px_40px_rgba(2,132,199,0.4)] relative transform md:-translate-y-3">
                            
                            <!-- Original Top Header Badge -->
                            <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-ultra-600 to-sky-500 text-white text-xs font-black tracking-wide shadow-md flex items-center gap-1.5 whitespace-nowrap">
                                <i class="ph-fill ph-lightning text-amber-300"></i>
                                <span>الباقة الأكثر طلباً</span>
                            </div>

                            <!-- Top-Left Corner Discount Badge (Solid High Contrast Tag) -->
                            <div class="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-sky-400 text-slate-950 font-black text-xs shadow-md border border-sky-300 whitespace-nowrap z-10">
                                خصم 28%
                            </div>

                            <div>
                                <div class="flex justify-between items-center mb-3 pt-3">
                                    <h3 class="text-lg sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك 6 أشهر</h3>
                                    <!-- Dedicated Savings Tag (Solid High Contrast) -->
                                    <span class="px-2.5 py-1 rounded-full bg-sky-400 text-slate-950 font-black text-xs whitespace-nowrap shadow-sm">توفير 4,000 ج.م</span>
                                </div>

                                <div class="mb-6">
                                    <div class="flex items-baseline gap-1.5">
                                        <span class="text-4xl sm:text-5xl font-black text-sky-400">10,000</span>
                                        <span class="text-devo-muted text-sm font-bold">ج.م</span>
                                    </div>
                                    <p class="text-xs text-sky-400 font-bold mt-1">الباقة المتكاملة لنشاط تجاري متوسط ومتوسع</p>
                                </div>

                                <!-- Spec Box (Solid High-Contrast Readable Badges) -->
                                <div class="bg-devo-black/80 border border-sky-500/40 p-4 rounded-2xl mb-6 space-y-2.5 text-xs">
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">الموديلات النشطة بالمعرض:</span>
                                        <span class="font-black text-slate-950 bg-sky-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">حتى 600 موديل (3 أضعاف)</span>
                                    </div>
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">رصيد الرفع والتعديل (Excel):</span>
                                        <span class="font-black text-slate-950 bg-sky-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">500 كريديت / شهرياً (2.5x)</span>
                                    </div>
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">مستخدمو فريق العمل:</span>
                                        <span class="font-black text-slate-950 bg-sky-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">حتى 10 مستخدمين</span>
                                    </div>
                                </div>

                                <!-- Unique Benefits Bullet List -->
                                <ul class="space-y-3 text-xs sm:text-sm text-devo-muted mb-8">
                                    <li class="flex items-center gap-2.5 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>جميع مميزات وتسهيلات باقة الـ 3 أشهر</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>توفير اقتصادي ممتاز بنسبة 28%</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>تخصيص الشعار والألوان والهوية على الفاتورة</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-sky-400 text-base shrink-0"></i>
                                        <span>أولوية مرتفعة في الدعم الفني والتدريب</span>
                                    </li>
                                </ul>
                            </div>

                            <a href="${createWaLink('اشتراك 6 أشهر', '10000 جنيه')}" target="_blank" class="w-full py-4 rounded-2xl bg-gradient-to-r from-ultra-600 to-sky-500 hover:from-ultra-500 hover:to-sky-400 text-white font-black text-sm text-center shadow-[0_10px_25px_rgba(2,132,199,0.5)] transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02]">
                                <i class="ph-fill ph-whatsapp-logo text-emerald-300 text-xl"></i>
                                <span>اشترك الآن (10,000 ج.م)</span>
                            </a>
                        </div>

                        <!-- PLAN 3: 1 YEAR - GOLD / AMBER THEME (BEST VALUE) -->
                        <div class="bg-gradient-to-b from-amber-500/15 via-devo-dark to-amber-600/20 border-2 border-amber-500/70 hover:border-amber-400 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 shadow-xl relative">
                            
                            <!-- Original Top Header Badge -->
                            <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-amber-500 text-slate-950 font-black text-xs shadow-md flex items-center gap-1.5 whitespace-nowrap">
                                <i class="ph-fill ph-crown text-slate-950"></i>
                                <span>أفضل قيمة وتوفير</span>
                            </div>

                            <!-- Top-Left Corner Discount Badge (Solid High Contrast Tag) -->
                            <div class="absolute top-3 left-3 px-2.5 py-1 rounded-xl bg-amber-400 text-slate-950 font-black text-xs shadow-md border border-amber-300 whitespace-nowrap z-10">
                                خصم 46%
                            </div>

                            <div>
                                <div class="flex justify-between items-center mb-3 pt-3">
                                    <!-- Fixed Unbroken Title -->
                                    <h3 class="text-lg sm:text-xl font-black text-devo-text whitespace-nowrap inline-block">اشتراك سنة كاملة</h3>
                                    <!-- Dedicated Savings Tag (Solid High Contrast) -->
                                    <span class="px-2.5 py-1 rounded-full bg-amber-400 text-slate-950 font-black text-xs whitespace-nowrap shadow-sm">توفير 13,000 ج.م</span>
                                </div>

                                <div class="mb-6">
                                    <div class="flex items-baseline gap-1.5">
                                        <span class="text-4xl sm:text-5xl font-black text-amber-400">15,000</span>
                                        <span class="text-devo-muted text-sm font-bold">ج.م</span>
                                    </div>
                                    <p class="text-xs text-amber-400/90 font-bold mt-1">الباقة الملكية الشاملة لكافة الإمكانيات بلا حدود</p>
                                </div>

                                <!-- Spec Box (Solid High-Contrast Readable Badges) -->
                                <div class="bg-devo-black/80 border border-amber-500/40 p-4 rounded-2xl mb-6 space-y-2.5 text-xs">
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">الموديلات النشطة بالمعرض:</span>
                                        <span class="font-black text-slate-950 bg-amber-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">غير محدود ∞</span>
                                    </div>
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">رصيد الرفع والتعديل (Excel):</span>
                                        <span class="font-black text-slate-950 bg-amber-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">غير محدود ∞</span>
                                    </div>
                                    <div class="flex justify-between items-center text-devo-text">
                                        <span class="text-devo-muted font-bold">مستخدمو فريق العمل:</span>
                                        <span class="font-black text-slate-950 bg-amber-400 px-2.5 py-0.5 rounded-md whitespace-nowrap shadow-sm">حتى 25 مستخدم</span>
                                    </div>
                                </div>

                                <!-- Unique Benefits Bullet List -->
                                <ul class="space-y-3 text-xs sm:text-sm text-devo-muted mb-8">
                                    <li class="flex items-center gap-2.5 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>جميع المميزات والوظائف المتقدمة بلا حدود</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>توفير ضخم يصل إلى 46% مقارنة بالاشتراك الربع سنوي</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-bold">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>دعم فني وتدريب VIP 24/7 (أولوية كبار العملاء)</span>
                                    </li>
                                    <li class="flex items-center gap-2.5 text-devo-text font-medium">
                                        <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                        <span>تصميم وتفصيل قوالب الفواتير والباركود مخصصاً</span>
                                    </li>
                                </ul>
                            </div>

                            <a href="${createWaLink('اشتراك سنة كاملة', '15000 جنيه')}" target="_blank" class="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                                <i class="ph-fill ph-whatsapp-logo text-slate-950 text-xl"></i>
                                <span>اشترك الآن (15,000 ج.م)</span>
                            </a>
                        </div>

                    </div>

                    <!-- DETAILED COMPETITIVE COMPARISON TABLE -->
                    <div class="mt-16 bg-devo-dark/95 border border-devo-gray rounded-3xl p-6 sm:p-8 shadow-2xl overflow-hidden">
                        <div class="text-center mb-8">
                            <h3 class="text-xl sm:text-3xl font-black text-devo-text mb-2">جدول المقارنة الشامل لكافة ميزات ووظائف النظام</h3>
                            <p class="text-devo-muted text-xs sm:text-sm font-medium">مقارنة تفصيلية تستعرض جميع إمكانيات منظومة UltraSoft</p>
                        </div>

                        <div class="overflow-x-auto">
                            <table class="w-full text-right text-xs sm:text-sm border-collapse min-w-[700px]">
                                <thead>
                                    <tr class="border-b border-devo-gray bg-devo-black/60 text-devo-text font-bold">
                                        <th class="p-4 rounded-r-2xl">الوظيفة / مميزات المنظومة</th>
                                        <th class="p-4 text-center text-emerald-400 bg-emerald-500/10">اشتراك 3 أشهر (7,000 ج.م)</th>
                                        <th class="p-4 text-center text-sky-400 bg-ultra-500/15">اشتراك 6 أشهر (10,000 ج.م)</th>
                                        <th class="p-4 text-center text-amber-400 bg-amber-500/15 rounded-l-2xl">اشتراك سنة (15,000 ج.م)</th>
                                    </tr>
                                </thead>
                                <tbody class="divide-y divide-devo-gray/50 text-devo-muted">
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-t-shirt text-ultra-400"></i>
                                            <span>حدود الموديلات النشطة بالمعرض</span>
                                        </td>
                                        <td class="p-4 text-center font-bold text-emerald-400 bg-emerald-500/5">حتى 200 موديل</td>
                                        <td class="p-4 text-center font-bold text-sky-400 bg-ultra-500/5">حتى 600 موديل (3x)</td>
                                        <td class="p-4 text-center font-black text-amber-400 bg-amber-500/5 text-base">غير محدود ∞</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-file-arrow-up text-amber-400"></i>
                                            <span>رصيد الرفع والتعديل المجمع (Excel)</span>
                                        </td>
                                        <td class="p-4 text-center font-bold text-emerald-400 bg-emerald-500/5">200 كريديت / شهرياً</td>
                                        <td class="p-4 text-center font-bold text-sky-400 bg-ultra-500/5">500 كريديت / شهرياً</td>
                                        <td class="p-4 text-center font-black text-amber-400 bg-amber-500/5 text-base">غير محدود ∞</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-users-three text-purple-400"></i>
                                            <span>حسابات المستخدمين وفريق العمل</span>
                                        </td>
                                        <td class="p-4 text-center font-bold text-emerald-400 bg-emerald-500/5">حتى 4 مستخدمين</td>
                                        <td class="p-4 text-center font-bold text-sky-400 bg-ultra-500/5">حتى 10 مستخدمين</td>
                                        <td class="p-4 text-center font-black text-amber-400 bg-amber-500/5">حتى 25 مستخدم</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-telegram-logo text-sky-400"></i>
                                            <span>إشعارات المتصفح الفورية والتليجرام</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-arrows-clockwise text-emerald-400"></i>
                                            <span>المزامنة والمشاركة اللحظية على الأجهزة</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-bell-ringing text-amber-400"></i>
                                            <span>تنبيهات نواقص الأصناف والطلبات صوتياً</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-pencil-line text-sky-400"></i>
                                            <span>تعديل الفواتير والأوردرات وإعادة تحميلها</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-user-switch text-purple-400"></i>
                                            <span>إسناد الطلبات وتغيير العامل المسؤول</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-palette text-rose-400"></i>
                                            <span>تخصيص ألوان الواجهة والمظهر (Themes)</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-hand-coins text-blue-400"></i>
                                            <span>حساب العربون والمتبقي وتقارير الإيداعات</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-qr-code text-sky-400"></i>
                                            <span>معرض الموديلات وقارئ الباركود الكاميرا</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-package text-emerald-400"></i>
                                            <span>إدارة المخزن وشحن دفعات الرصيد</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-receipt text-blue-400"></i>
                                            <span>الفواتير والطباعة (حراري & A4)</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5"><i class="ph-fill ph-check-circle text-base"></i> متاح</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-headphones text-rose-400"></i>
                                            <span>الدعم الفني والتدريب</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5">24/7 طوال الأسبوع</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5">24/7 طوال الأسبوع</td>
                                        <td class="p-4 text-center font-bold text-amber-400 bg-amber-500/5">VIP 24/7 (أولوية كبار العملاء)</td>
                                    </tr>
                                    <tr>
                                        <td class="p-4 font-bold text-devo-text flex items-center gap-2">
                                            <i class="ph ph-database text-teal-400"></i>
                                            <span>النسخ الاحتياطي واستعادة البيانات</span>
                                        </td>
                                        <td class="p-4 text-center text-emerald-400 font-bold bg-emerald-500/5">تلقائي سحابي</td>
                                        <td class="p-4 text-center text-sky-400 font-bold bg-ultra-500/5">تلقائي سحابي</td>
                                        <td class="p-4 text-center text-amber-400 font-bold bg-amber-500/5">تلقائي سحابي</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                </section>

            </div>

            <!-- ==========================================
                 UNIVERSAL FOOTER SECTION: CONTACT HUB
                 ========================================== -->
            <section id="contact-section" class="py-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-devo-gray/40">
                
                <div class="text-center max-w-3xl mx-auto mb-10">
                    <h2 class="text-2xl sm:text-4xl font-black text-devo-text mb-3">
                        تواصل مباشرة مع شركة UltraSoft
                    </h2>
                    <p class="text-devo-muted text-sm sm:text-base font-medium">
                        فريق المبيعات والدعم الفني جاهز للرد على جميع استفساراتك وتفعيل حسابك فوراً.
                    </p>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
                    
                    <!-- WhatsApp -->
                    <a href="https://wa.me/201140409832" target="_blank" class="bg-devo-dark border border-devo-gray hover:border-emerald-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-whatsapp-logo"></i>
                        </div>
                        <h3 class="text-base font-bold text-devo-text mb-1">محادثة واتساب</h3>
                        <p class="text-xs text-devo-muted mb-3 font-mono" dir="ltr">+20 11 40409832</p>
                        <span class="text-xs text-emerald-400 font-bold group-hover:underline">تواصل فوراً &larr;</span>
                    </a>

                    <!-- Phone -->
                    <a href="tel:+201140409832" class="bg-devo-dark border border-devo-gray hover:border-sky-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-sky-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-phone-call"></i>
                        </div>
                        <h3 class="text-base font-bold text-devo-text mb-1">الاتصال المباشر</h3>
                        <p class="text-xs text-devo-muted mb-3 font-mono" dir="ltr">+20 12 12751111</p>
                        <span class="text-xs text-sky-400 font-bold group-hover:underline">اتصال هاتفي &larr;</span>
                    </a>

                    <!-- Facebook -->
                    <a href="https://www.facebook.com/share/1NiodPNtXF/" target="_blank" class="bg-devo-dark border border-devo-gray hover:border-blue-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-facebook-logo"></i>
                        </div>
                        <h3 class="text-base font-bold text-devo-text mb-1">صفحة فيسبوك</h3>
                        <p class="text-xs text-devo-muted mb-3">UltraSoft Software Solutions</p>
                        <span class="text-xs text-blue-400 font-bold group-hover:underline">زيارة الصفحة &larr;</span>
                    </a>

                    <!-- Location / Telegram -->
                    <a href="https://wa.me/201140409832" target="_blank" class="bg-devo-dark border border-devo-gray hover:border-purple-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-buildings"></i>
                        </div>
                        <h3 class="text-base font-bold text-devo-text mb-1">مقر شركة UltraSoft</h3>
                        <p class="text-xs text-devo-muted mb-3">جمهورية مصر العربية</p>
                        <span class="text-xs text-purple-400 font-bold group-hover:underline">طلب استشارة &larr;</span>
                    </a>

                </div>

            </section>

        </div>
    `;
}
