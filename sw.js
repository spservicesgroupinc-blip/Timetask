
const CACHE_NAME = 'truchoice-tasks-v4';

// Add the external CDNs your app relies on
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './icon.svg',
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

// Fetch: Network first for API, Cache first for everything else
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // 1. API Calls (Apps Script) -> Network Only (don't cache data aggressively)
  if (url.href.includes('script.google.com')) {
    event.respondWith(fetch(event.request));
    return;
  }

  // 2. External Assets (ESM.sh, CDNs, Fonts) -> Stale-While-Revalidate
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
          if (networkResponse && networkResponse.status === 200) {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        });
        return cachedResponse || fetchPromise;
      })
    );
    return;
  }

  // 3. App Files (HTML, JS bundles) -> Cache First
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        if (response) {
          return response;
        }
        return fetch(event.request).then((response) => {
           if(!response || response.status !== 200 || response.type !== 'basic') {
              return response;
           }
           const responseToCache = response.clone();
           caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
           });
           return response;
        });
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
      icon: './icon.svg',
      badge: './icon.svg',
      data: {
        url: data.url || './' // Allow deep linking
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

  const urlToOpen = new URL(event.notification.data.url || './', self.location.origin).href;

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
