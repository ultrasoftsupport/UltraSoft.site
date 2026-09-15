const CACHE_VERSION = 'v2.0.1';
const STATIC_CACHE = `ultrasoft-static-${CACHE_VERSION}`;
const IMAGE_CACHE = `ultrasoft-images-${CACHE_VERSION}`;

const staticAssets = [
  './',
  './index.html',
  './admin.html',
  './auth.html',
  './landing.html',
  './super_admin.html',
  './super_auth.html',
  './src/css/output.css',
  './src/css/ultrasoft-theme.css',
  './src/assets/icons/ultrasoft_transparent.png',
  './src/assets/icons/ultrasoft.png',
  './manifest-index.json',
  './manifest-admin.json',
  './manifest.json'
];

// تثبيت وتجهيز السيرفس وركر
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => {
      return cache.addAll(staticAssets);
    })
  );
});

// تفعيل وتنظيف النسخ القديمة من الكاش
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== STATIC_CACHE && key !== IMAGE_CACHE) {
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// الاستجابة للطلبات بتكتيك كاش محسن (Cache-First للصور، Network-First للمستندات)
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = new URL(event.request.url);

  // 1. كاش الصور الديناميكي (Supabase Storage + صور الأصول)
  const isImageRequest = 
    url.hostname.includes('supabase.co') && url.pathname.includes('/storage/v1/object/') ||
    /\.(png|jpg|jpeg|webp|svg|gif|ico)$/i.test(url.pathname);

  if (isImageRequest) {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cachedResponse = await cache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          if (networkResponse && networkResponse.status === 200) {
            cache.put(event.request, networkResponse.clone());
          }
          return networkResponse;
        } catch (err) {
          return new Response('Image unavailable offline', { status: 404 });
        }
      })
    );
    return;
  }

  // 2. كاش الملفات المحلية والنظام (App Shell)
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          return networkResponse;
        })
        .catch(() => {
          return caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) return cachedResponse;
            return new Response('Network error occurred', {
              status: 503,
              statusText: 'Service Unavailable',
              headers: new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })
            });
          });
        })
    );
  }
});