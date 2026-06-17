
const CACHE_NAME = 'truchoice-tasks-v5';

// Add the external CDNs your app relies on
const urlsToCache = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  'https://cdn.tailwindcss.com',
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap'
];

// Install: Cache core static assets
self.addEventListener('install', (event) => {
  self.skipWaiting(); // Activate worker immediately
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        return cache.addAll(urlsToCache);
      })
  );
});

// Activate: Clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim(); // Take control of clients immediately
});

// Fetch: Network first caching for robust Vercel updates
self.addEventListener('fetch', (event) => {
  // Only cache GET requests to prevent iOS/Safari errors with POST
  if (event.request.method !== 'GET') {
    return;
  }

  const url = new URL(event.request.url);

  // 1. API Calls -> Network Only
  if (url.href.includes('script.google.com') || url.pathname.startsWith('/api/')) {
    return;
  }

  // 2. External CDNs (Tailwind, Fonts) -> Stale-While-Revalidate
  if (
     url.hostname === 'esm.sh' || 
     url.hostname === 'cdn.tailwindcss.com' ||
     url.hostname === 'fonts.googleapis.com' || 
     url.hostname === 'fonts.gstatic.com' ||
     url.hostname === 'cdn-icons-png.flaticon.com'
  ) {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        const fetchPromise = fetch(event.request).then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && (networkResponse.type === 'basic' || networkResponse.type === 'cors')) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        }).catch(err => console.log('CDN fetch failed', err));
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. App Files (HTML, JS, Vite assets) -> Network First
  // Ensures Vercel deployments are immediately active instead of stuck in cache forever
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Only cache valid basic responses
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // If network fails (offline), fallback to cache
        return caches.match(event.request);
      })
  );
});

// --- PUSH NOTIFICATIONS (The "Robust" Part) ---

self.addEventListener('push', (event) => {
  if (!event.data) return;

  try {
    const data = event.data.json();
    const title = data.title || 'TruChoice Update';
    const options = {
      body: data.body || 'New activity in the app.',
      icon: '/icon.svg',
      badge: '/icon.svg',
      data: {
        url: data.url || '/' // Allow deep linking
      },
      vibrate: [100, 50, 100],
      tag: 'truchoice-notification', // Overwrite old notifications to prevent stacking spam
      renotify: true
    };

    // This waits until the notification is actually shown
    event.waitUntil(self.registration.showNotification(title, options));
  } catch (e) {
    console.error('Push payload parse failed', e);
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close(); // Close the notification

  const urlToOpen = new URL(event.notification.data.url || '/', self.location.origin).href;

  const promiseChain = clients.matchAll({
    type: 'window',
    includeUncontrolled: true
  }).then((windowClients) => {
    // 1. If app is already open, focus it
    for (let i = 0; i < windowClients.length; i++) {
      const client = windowClients[i];
      if (client.url === urlToOpen && 'focus' in client) {
        return client.focus();
      }
    }
    // 2. If not open, open a new window
    if (clients.openWindow) {
      return clients.openWindow(urlToOpen);
    }
  });

  event.waitUntil(promiseChain);
});
