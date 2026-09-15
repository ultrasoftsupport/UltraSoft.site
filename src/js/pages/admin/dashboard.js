import { getCurrentSession } from '../../services/auth.js';
import { getCurrentTenant, initializeTenantContext, normalizeImageUrl } from '../../services/tenant_service.js';

let clockInterval = null;

export async function initDashboard() {
    startLiveClock();
    await updateWelcomeGreeting();
}

export async function fetchDashboardData() {
    await updateWelcomeGreeting();
}

export async function updateWelcomeGreeting() {
    // 1. حساب وتحميل اسم الموظف / المسؤول المسجل حالياً
    const { session } = getCurrentSession();
    const userName = session?.user?.full_name || session?.user?.username || 'المسؤول';
    
    const greetingUserEl = document.getElementById('dash-welcome-user');
    if (greetingUserEl) {
        greetingUserEl.textContent = userName;
    }

    // 2. جلب وتحديث اسم المصنع النشط حالياً
    let tenant = getCurrentTenant();
    if (!tenant || !tenant.name) {
        tenant = await initializeTenantContext();
    }
    const headerTenantBadge = document.getElementById('activeTenantName');
    const factoryName = tenant?.name || (headerTenantBadge?.textContent !== '--' ? headerTenantBadge?.textContent : null) || 'المصنع';

    const factoryNameEl = document.getElementById('dash-factory-name');
    if (factoryNameEl) {
        factoryNameEl.textContent = factoryName;
    }

    const factorySubnameEl = document.getElementById('dash-factory-subname');
    if (factorySubnameEl) {
        factorySubnameEl.textContent = factoryName;
    }

    // 3. جلب وتحديث شعار المصنع الحالي
    const rawLogo = normalizeImageUrl(tenant?.logo_url || tenant?.settings?.logo_url) || './logo_transparnt.png';
    const cleanLogo = (rawLogo.startsWith('/') && !rawLogo.startsWith('//')) 
        ? '.' + rawLogo 
        : rawLogo;

    const factoryLogoEl = document.getElementById('dash-factory-logo');
    if (factoryLogoEl) {
        factoryLogoEl.src = cleanLogo;
        factoryLogoEl.alt = factoryName;
        factoryLogoEl.setAttribute('referrerpolicy', 'no-referrer');
        factoryLogoEl.onerror = () => {
            factoryLogoEl.src = './logo_transparnt.png';
        };
    }

    // 4. تحية وقت اليوم (صباح الخير / طاب يومك / مساء الخير)
    const timeGreetingEl = document.getElementById('dash-time-greeting');
    if (timeGreetingEl) {
        const hour = new Date().getHours();
        let greeting = 'أهلاً بك';
        if (hour >= 4 && hour < 12) {
            greeting = 'صباح الخير';
        } else if (hour >= 12 && hour < 17) {
            greeting = 'طاب يومك';
        } else {
            greeting = 'مساء الخير';
        }
        timeGreetingEl.textContent = greeting;
    }
}

function startLiveClock() {
    if (clockInterval) {
        clearInterval(clockInterval);
    }

    updateClock();
    clockInterval = setInterval(updateClock, 1000);
}

function updateClock() {
    const now = new Date();

    // 1. حساب الوقت بالساعات والدقائق والثواني
    let hours = now.getHours();
    const minutes = String(now.getMinutes()).padStart(2, '0');
    const seconds = String(now.getSeconds()).padStart(2, '0');
    const ampm = hours >= 12 ? 'م' : 'ص';

    hours = hours % 12;
    hours = hours ? hours : 12; // الساعة 0 تصبح 12
    const formattedHours = String(hours).padStart(2, '0');

    // 2. تحديث عناصر الساعة بالـ DOM
    const hoursEl = document.getElementById('dash-clock-hours');
    const minutesEl = document.getElementById('dash-clock-minutes');
    const secondsEl = document.getElementById('dash-clock-seconds');
    const ampmEl = document.getElementById('dash-clock-ampm');

    if (hoursEl) hoursEl.textContent = formattedHours;
    if (minutesEl) minutesEl.textContent = minutes;
    if (secondsEl) secondsEl.textContent = seconds;
    if (ampmEl) ampmEl.textContent = ampm;

    // 3. التاريخ الميلادي بالعربية الكاملة
    const days = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
    const months = [
        'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
        'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'
    ];

    const dayName = days[now.getDay()];
    const dayNum = now.getDate();
    const monthName = months[now.getMonth()];
    const year = now.getFullYear();

    const fullDateStr = `${dayName}، ${dayNum} ${monthName} ${year}`;
    const dateEl = document.getElementById('dash-full-date');
    if (dateEl) {
        const textSpan = dateEl.querySelector('span');
        if (textSpan) {
            textSpan.textContent = fullDateStr;
        } else {
            dateEl.textContent = fullDateStr;
        }
    }

    // 4. التاريخ الهجري العربي
    try {
        const hijriFormatter = new Intl.DateTimeFormat('ar-SA-u-ca-islamic', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
        });
        const hijriStr = hijriFormatter.format(now);
        const hijriEl = document.getElementById('dash-hijri-date');
        if (hijriEl) hijriEl.textContent = hijriStr;
    } catch (e) {
        // Fallback
    }
}