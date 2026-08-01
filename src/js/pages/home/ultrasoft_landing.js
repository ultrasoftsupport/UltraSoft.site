/**
 * UltraSoft Marketing & Subscription Landing Page Module
 * واجهة التسويق والتعريف بالنظام وخطط الأسعار لشركة UltraSoft
 */

export function initLandingPage() {
    const landingContainer = document.getElementById('view-landing');
    if (!landingContainer) return;

    landingContainer.innerHTML = renderLandingHTML();
}

function renderLandingHTML() {
    const waNumber = '201140409832';
    const createWaLink = (planName, price) => {
        const text = `مرحباً شركة UltraSoft، أود الاستفسار والاشتراك في باقة (${planName}) بسعر ${price} لنظام إدارة المتاجر والمخازن.`;
        return `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`;
    };

    return `
        <div class="relative overflow-hidden bg-devo-black text-devo-text selection:bg-ultra-500 selection:text-white">
            
            <!-- Glow Background Highlights -->
            <div class="absolute top-0 right-1/4 w-96 h-96 bg-ultra-600/15 rounded-full filter blur-[120px] pointer-events-none"></div>
            <div class="absolute top-1/3 left-10 w-80 h-80 bg-blue-600/10 rounded-full filter blur-[100px] pointer-events-none"></div>
            <div class="absolute bottom-1/4 right-10 w-96 h-96 bg-sky-500/10 rounded-full filter blur-[140px] pointer-events-none"></div>

            <!-- ==========================================
                 SECTION 1: HERO & SYSTEM PRESENTATION
                 ========================================== -->
            <section class="relative pt-8 pb-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto text-center">
                
                <!-- Badge -->
                <div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-ultra-500/10 border border-ultra-500/30 text-ultra-400 text-xs sm:text-sm font-bold mb-6 backdrop-blur-md shadow-sm animate-pulse">
                    <i class="ph-fill ph-sparkle text-amber-400"></i>
                    <span>المنظومة الرقمية رقم #1 لإدارة المحلات والمصانع والمخازن</span>
                </div>

                <!-- Main Headline -->
                <h1 class="text-3xl sm:text-5xl md:text-6xl font-black text-white leading-tight mb-6 tracking-tight">
                    منظومة <span class="bg-gradient-to-r from-sky-400 via-ultra-400 to-blue-500 bg-clip-text text-transparent">UltraSoft ERP & POS</span><br>
                    إدارة ذكية ومحترفة لتجارتك
                </h1>

                <!-- Subtitle -->
                <p class="text-devo-muted text-base sm:text-xl max-w-3xl mx-auto leading-relaxed mb-10 font-medium">
                    نظام سحابي متكامل مصمم خصيصاً للمصانع، المعارض، محلات الملابس والمتاجر الإلكترونية. يُتيح لك التحكم الكامل بالموديلات، الباركود، رصيد المخزن، الأوردرات، والتقارير المالية بدقة متناهية ومن أي مكان.
                </p>

                <!-- Quick Action Buttons -->
                <div class="flex flex-wrap items-center justify-center gap-4 mb-16">
                    <button onclick="switchSiteView('view-gallery')" class="px-8 py-4 rounded-2xl bg-gradient-to-r from-ultra-600 to-blue-600 hover:from-ultra-500 hover:to-blue-500 text-white font-black text-sm sm:text-base shadow-[0_10px_30px_rgba(2,132,199,0.4)] hover:shadow-[0_15px_35px_rgba(2,132,199,0.6)] transition-all transform hover:-translate-y-1 flex items-center gap-2.5">
                        <i class="ph-fill ph-play-circle text-xl"></i>
                        <span>تصفح المعرض التجريبي (Live Demo)</span>
                    </button>

                    <a href="admin.html" class="px-7 py-4 rounded-2xl bg-devo-dark hover:bg-devo-gray border border-devo-gray text-white font-bold text-sm sm:text-base transition-all transform hover:-translate-y-1 flex items-center gap-2.5 shadow-md">
                        <i class="ph-fill ph-shield-check text-sky-400 text-xl"></i>
                        <span>معاينة لوحة الأدمن</span>
                    </a>

                    <a href="#pricing-section" class="px-6 py-4 rounded-2xl bg-devo-black hover:bg-devo-dark border border-ultra-500/30 text-ultra-300 font-bold text-sm sm:text-base transition-all flex items-center gap-2">
                        <i class="ph ph-tag text-lg"></i>
                        <span>خطط الأسعار</span>
                    </a>
                </div>

                <!-- Stats Bar -->
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4 max-w-5xl mx-auto bg-devo-dark/80 border border-devo-gray p-6 rounded-3xl backdrop-blur-xl shadow-xl">
                    <div class="p-3 border-l last:border-l-0 border-devo-gray/50 text-center">
                        <p class="text-2xl sm:text-3xl font-black text-ultra-400">100%</p>
                        <p class="text-xs sm:text-sm text-devo-muted font-bold mt-1">مزامنة سحابية لحظية</p>
                    </div>
                    <div class="p-3 border-l last:border-l-0 border-devo-gray/50 text-center">
                        <p class="text-2xl sm:text-3xl font-black text-sky-400">0s</p>
                        <p class="text-xs sm:text-sm text-devo-muted font-bold mt-1">تجهيز الفواتير بدون تأخير</p>
                    </div>
                    <div class="p-3 border-l last:border-l-0 border-devo-gray/50 text-center">
                        <p class="text-2xl sm:text-3xl font-black text-emerald-400">PWA</p>
                        <p class="text-xs sm:text-sm text-devo-muted font-bold mt-1">يعمل على كافة الأجهزة</p>
                    </div>
                    <div class="p-3 text-center">
                        <p class="text-2xl sm:text-3xl font-black text-amber-400">24/7</p>
                        <p class="text-xs sm:text-sm text-devo-muted font-bold mt-1">دعم فني وتحديثات</p>
                    </div>
                </div>
            </section>

            <!-- ==========================================
                 SYSTEM FEATURES & CAPABILITIES GRID
                 ========================================== -->
            <section class="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-devo-gray/40">
                <div class="text-center max-w-3xl mx-auto mb-14">
                    <h2 class="text-2xl sm:text-4xl font-black text-white mb-4">
                        كافة الإمكانيات والقدرات في منظومة واحدة
                    </h2>
                    <p class="text-devo-muted text-sm sm:text-base leading-relaxed">
                        صُمم نظام UltraSoft بعناية فائقة لتغطية كل خطوة في دورة العمل من أول إدخال الموديل وحتى الفاتورة والأرباح.
                    </p>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    
                    <!-- Feature 1 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-ultra-500/10 border border-ultra-500/20 text-ultra-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-ultra-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-t-shirt"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">إدارة الموديلات والتصنيفات</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            عرض سينمائي فاخر للموديلات بحجم الصورة الكاملة، إدارة المقاسات والألوان، تحديد أسعار الجملة والقطاعي ورصيد السريات.
                        </p>
                    </div>

                    <!-- Feature 2 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-sky-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-qr-code"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">قارئ واستيكر الباركود</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            ماسح ضوئي ذكي يعمل فورياً بكاميرا الموبايل والكمبيوتر دون شراء قارئ باركود، مع إمكانية طباعة ملصقات الباركود للموديلات.
                        </p>
                    </div>

                    <!-- Feature 3 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-package"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">إدارة المخزن والاستيراد</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            متابعة الكميات بدقة، تسجيل الفواتير الواردة، وإمكانية استيراد وتحديث الأسعار والمخزون بالجملة عبر ملفات Excel بضغطة زر.
                        </p>
                    </div>

                    <!-- Feature 4 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-amber-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-receipt"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">الفواتير وسلة المشتريات</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            إنشاء وإصدار الفواتير فورياً، حساب العربون والمتبقي، دعم الطباعة الحرارية المباشرة وطباعة A4 الاحترافية.
                        </p>
                    </div>

                    <!-- Feature 5 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-truck"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">تتبع الشحن والأوردرات</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            متابعة خط سير الأوردرات (إنشاء، تجهيز، تسجيل، شحن، تسليم)، مع إمكانية تعديل وتحديث الطلبات القائمة.
                        </p>
                    </div>

                    <!-- Feature 6 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-chart-line-up"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">التقارير المالية والتحليلات</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            تقارير الإيداعات والمقبوضات اليومية والشهرية، تحليلات الأرباح والمبيعات ومراقبة أداء الكاشير والمبيعات.
                        </p>
                    </div>

                    <!-- Feature 7 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-rose-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-users-three"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">الصلاحيات وأدوار الموظفين</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            صلاحيات مخصصة وحماية كاملة لكل مستخدم (مدير Admin، كاشير مبيعات Showroom، مسؤول مخزن Warehouse).
                        </p>
                    </div>

                    <!-- Feature 8 -->
                    <div class="bg-devo-dark/90 border border-devo-gray hover:border-ultra-500/50 p-6 rounded-3xl transition-all duration-300 transform hover:-translate-y-1.5 shadow-lg group">
                        <div class="w-14 h-14 rounded-2xl bg-teal-500/10 border border-teal-500/20 text-teal-400 flex items-center justify-center text-3xl mb-5 group-hover:scale-110 group-hover:bg-teal-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-cloud-arrow-up"></i>
                        </div>
                        <h3 class="text-lg font-bold text-white mb-2">النسخ الاحتياطي والأمان</h3>
                        <p class="text-devo-muted text-xs sm:text-sm leading-relaxed">
                            نسخ احتياطي فوري واستعادة للبيانات بضغطة زر، حماية سحابية عالية مع دعم التكيف لكل الشاشات (PWA).
                        </p>
                    </div>

                </div>
            </section>

            <!-- ==========================================
                 SECTION 2: PRICING PLANS (خطط الأسعار)
                 ========================================== -->
            <section id="pricing-section" class="py-20 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-devo-gray/40 scroll-mt-24">
                
                <div class="text-center max-w-3xl mx-auto mb-16">
                    <div class="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-ultra-500/10 border border-ultra-500/30 text-ultra-400 text-xs font-bold mb-3">
                        <i class="ph ph-currency-circle-dollar"></i>
                        <span>اشتراكات مرنة تناسب حجم أعمالك</span>
                    </div>
                    <h2 class="text-3xl sm:text-5xl font-black text-white mb-4">
                        خطط الأسعار والاشتراكات
                    </h2>
                    <p class="text-devo-muted text-sm sm:text-base leading-relaxed">
                        اختر الباقة المناسبة لمؤسستك وابدأ العمل فوراً شاملة الدعم الفني وتأمين البيانات والتحديثات.
                    </p>
                </div>

                <!-- Pricing Cards Grid -->
                <div class="grid grid-cols-1 md:grid-cols-3 gap-8 items-stretch max-w-6xl mx-auto">
                    
                    <!-- PLAN 1: 3 MONTHS -->
                    <div class="bg-devo-dark/80 border border-devo-gray rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 hover:border-devo-muted shadow-xl relative">
                        <div>
                            <div class="flex justify-between items-center mb-4">
                                <h3 class="text-xl font-bold text-white">اشتراك 3 أشهر</h3>
                                <span class="px-3 py-1 rounded-full bg-devo-black text-devo-muted border border-devo-gray text-xs font-bold">باقة البداية</span>
                            </div>

                            <div class="mb-6">
                                <div class="flex items-baseline gap-1">
                                    <span class="text-4xl font-black text-white">7,000</span>
                                    <span class="text-devo-muted text-sm font-bold">ج.م</span>
                                </div>
                                <p class="text-xs text-devo-muted mt-1 font-medium">اشتراك ربع سنوي كامل المميزات</p>
                            </div>

                            <ul class="space-y-3.5 text-xs sm:text-sm text-devo-muted mb-8">
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-ultra-400 text-base shrink-0"></i>
                                    <span>تفعيل كامل لكافة المميزات والوظائف</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-ultra-400 text-base shrink-0"></i>
                                    <span>إعداد وتأمين قاعدة البيانات السحابية</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-ultra-400 text-base shrink-0"></i>
                                    <span>تدريب ودعم فني طوال فترة الاشتراك</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-ultra-400 text-base shrink-0"></i>
                                    <span>تحديثات وتطويرات مجانية</span>
                                </li>
                                <li class="flex items-center gap-2.5">
                                    <i class="ph-fill ph-check-circle text-ultra-400 text-base shrink-0"></i>
                                    <span>تطبيق PWA لجميع الأجهزة والهواتف</span>
                                </li>
                            </ul>
                        </div>

                        <a href="${createWaLink('اشتراك 3 أشهر', '7000 جنيه')}" target="_blank" class="w-full py-4 rounded-2xl bg-devo-black hover:bg-ultra-600 text-white font-bold text-sm text-center border border-ultra-500/30 transition-all flex items-center justify-center gap-2 shadow-md">
                            <i class="ph-fill ph-whatsapp-logo text-emerald-400 text-lg"></i>
                            <span>اشترك الآن (7,000 ج.م)</span>
                        </a>
                    </div>

                    <!-- PLAN 2: 6 MONTHS (RECOMMENDED) -->
                    <div class="bg-gradient-to-b from-devo-dark to-slate-900 border-2 border-ultra-500 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 shadow-[0_10px_40px_rgba(2,132,199,0.25)] relative transform md:-translate-y-3">
                        
                        <!-- Recommendation Badge -->
                        <div class="absolute -top-4 right-1/2 translate-x-1/2 px-4 py-1.5 rounded-full bg-gradient-to-r from-ultra-500 to-blue-600 text-white text-xs font-black tracking-wide shadow-md flex items-center gap-1.5">
                            <i class="ph-fill ph-fire text-amber-300"></i>
                            <span>الباقة الأكثر طلباً</span>
                        </div>

                        <div>
                            <div class="flex justify-between items-center mb-4 pt-2">
                                <h3 class="text-xl font-black text-white">اشتراك 6 أشهر</h3>
                                <span class="px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-xs font-bold">توفير 4,000 ج.م</span>
                            </div>

                            <div class="mb-6">
                                <div class="flex items-baseline gap-1">
                                    <span class="text-4xl sm:text-5xl font-black text-ultra-300">10,000</span>
                                    <span class="text-devo-muted text-sm font-bold">ج.م</span>
                                </div>
                                <p class="text-xs text-ultra-400 font-bold mt-1">اشتراك نصف سنوي شامل المميزات</p>
                            </div>

                            <ul class="space-y-3.5 text-xs sm:text-sm text-devo-muted mb-8">
                                <li class="flex items-center gap-2.5 text-white font-bold">
                                    <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                    <span>جميع مميزات باقة الـ 3 أشهر</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                    <span>توفير ممتاز بنسبة 28%</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                    <span>أولوية في الدعم الفني وتجهيز البيانات</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                    <span>تخصيص الشعار والألوان والهوية مجاناً</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-emerald-400 text-base shrink-0"></i>
                                    <span>تدريب شامل لفريق العمل على المنظومة</span>
                                </li>
                            </ul>
                        </div>

                        <a href="${createWaLink('اشتراك 6 أشهر', '10000 جنيه')}" target="_blank" class="w-full py-4 rounded-2xl bg-gradient-to-r from-ultra-600 to-blue-600 hover:from-ultra-500 hover:to-blue-500 text-white font-black text-sm text-center shadow-[0_10px_25px_rgba(2,132,199,0.4)] transition-all flex items-center justify-center gap-2 transform hover:scale-[1.02]">
                            <i class="ph-fill ph-whatsapp-logo text-emerald-300 text-xl"></i>
                            <span>اشترك الآن (10,000 ج.م)</span>
                        </a>
                    </div>

                    <!-- PLAN 3: 1 YEAR (BEST VALUE) -->
                    <div class="bg-devo-dark/80 border border-amber-500/40 rounded-3xl p-8 flex flex-col justify-between transition-all duration-300 hover:border-amber-500 shadow-xl relative">
                        
                        <!-- Value Badge -->
                        <div class="absolute -top-4 right-1/2 translate-x-1/2 px-3.5 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-bold flex items-center gap-1">
                            <i class="ph-fill ph-crown text-amber-400"></i>
                            <span>أفضل قيمة وتوفير</span>
                        </div>

                        <div>
                            <div class="flex justify-between items-center mb-4 pt-2">
                                <h3 class="text-xl font-bold text-white">اشتراك سنة (12 شهر)</h3>
                                <span class="px-2.5 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 text-xs font-bold">توفير 13,000 ج.م</span>
                            </div>

                            <div class="mb-6">
                                <div class="flex items-baseline gap-1">
                                    <span class="text-4xl font-black text-amber-400">15,000</span>
                                    <span class="text-devo-muted text-sm font-bold">ج.م</span>
                                </div>
                                <p class="text-xs text-amber-400/80 font-bold mt-1">اشتراك سنوي كامل وموفر للغاية</p>
                            </div>

                            <ul class="space-y-3.5 text-xs sm:text-sm text-devo-muted mb-8">
                                <li class="flex items-center gap-2.5 text-white font-bold">
                                    <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                    <span>جميع المميزات المتقدمة بالنظام بدون حدود</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                    <span>توفير ضخم يصل إلى 46%</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                    <span>دعم فني VIP خاص 24/7 طوال العام</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                    <span>استضافة سحابية سريعة ونسخ احتياطي تلقائي</span>
                                </li>
                                <li class="flex items-center gap-2.5 text-devo-text">
                                    <i class="ph-fill ph-check-circle text-amber-400 text-base shrink-0"></i>
                                    <span>تخصيص نماذج الفواتير والربط مجاناً</span>
                                </li>
                            </ul>
                        </div>

                        <a href="${createWaLink('اشتراك سنة كاملة', '15000 جنيه')}" target="_blank" class="w-full py-4 rounded-2xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-sm text-center transition-all flex items-center justify-center gap-2 shadow-lg">
                            <i class="ph-fill ph-whatsapp-logo text-slate-950 text-xl"></i>
                            <span>اشترك الآن (15,000 ج.م)</span>
                        </a>
                    </div>

                </div>
            </section>

            <!-- ==========================================
                 SECTION 3: ULTRASOFT CONTACT HUB (وسائل التواصل)
                 ========================================== -->
            <section class="py-16 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto border-t border-devo-gray/40">
                
                <div class="text-center max-w-3xl mx-auto mb-12">
                    <h2 class="text-2xl sm:text-4xl font-black text-white mb-3">
                        تواصل مباشرة مع شركة UltraSoft
                    </h2>
                    <p class="text-devo-muted text-sm sm:text-base">
                        فريق المبيعات والدعم الفني جاهز للرد على جميع استفساراتك وتفعيل حسابك فوراً.
                    </p>
                </div>

                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto">
                    
                    <!-- WhatsApp -->
                    <a href="https://wa.me/201140409832" target="_blank" class="bg-devo-dark border border-devo-gray hover:border-emerald-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-emerald-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-whatsapp-logo"></i>
                        </div>
                        <h3 class="text-base font-bold text-white mb-1">محادثة واتساب</h3>
                        <p class="text-xs text-devo-muted mb-3 font-mono" dir="ltr">+20 11 40409832</p>
                        <span class="text-xs text-emerald-400 font-bold group-hover:underline">تواصل فوراً &larr;</span>
                    </a>

                    <!-- Phone -->
                    <a href="tel:+201140409832" class="bg-devo-dark border border-devo-gray hover:border-sky-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-sky-500/10 border border-sky-500/20 text-sky-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-sky-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-phone-call"></i>
                        </div>
                        <h3 class="text-base font-bold text-white mb-1">الاتصال المباشر</h3>
                        <p class="text-xs text-devo-muted mb-3 font-mono" dir="ltr">+20 12 12751111</p>
                        <span class="text-xs text-sky-400 font-bold group-hover:underline">اتصال هاتفي &larr;</span>
                    </a>

                    <!-- Facebook -->
                    <a href="https://www.facebook.com/share/1NiodPNtXF/" target="_blank" class="bg-devo-dark border border-devo-gray hover:border-blue-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-blue-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-facebook-logo"></i>
                        </div>
                        <h3 class="text-base font-bold text-white mb-1">صفحة فيسبوك</h3>
                        <p class="text-xs text-devo-muted mb-3">UltraSoft Software Solutions</p>
                        <span class="text-xs text-blue-400 font-bold group-hover:underline">زيارة الصفحة &larr;</span>
                    </a>

                    <!-- Location / Telegram -->
                    <a href="https://wa.me/201140409832" target="_blank" class="bg-devo-dark border border-devo-gray hover:border-purple-500/50 p-6 rounded-3xl text-center transition-all duration-300 transform hover:-translate-y-1 shadow-md group">
                        <div class="w-14 h-14 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-400 flex items-center justify-center text-3xl mx-auto mb-4 group-hover:scale-110 group-hover:bg-purple-500 group-hover:text-white transition-all">
                            <i class="ph-fill ph-buildings"></i>
                        </div>
                        <h3 class="text-base font-bold text-white mb-1">مقر شركة UltraSoft</h3>
                        <p class="text-xs text-devo-muted mb-3">جمهورية مصر العربية</p>
                        <span class="text-xs text-purple-400 font-bold group-hover:underline">طلب استشارة &larr;</span>
                    </a>

                </div>

            </section>

        </div>
    `;
}
