// Metro Map Editor - Service Worker
// Enables offline functionality with cached tiles and app files

const CACHE_VERSION = 'v1.0.1';
const CACHE_NAME = `metro-map-${CACHE_VERSION}`;
const TILE_CACHE_NAME = `metro-tiles-${CACHE_VERSION}`;
const MAX_TILE_CACHE_SIZE = 500; // Maximum number of tiles to cache

// Files to cache immediately on install
const STATIC_ASSETS = [
    './',
    './index.html',
    './app.js',
    './styles.css',
    './sample-routes.geojson'
];

// External dependencies to cache
const EXTERNAL_DEPS = [
    'https://unpkg.com/maplibre-gl@5.3.0/dist/maplibre-gl.css',
    'https://unpkg.com/maplibre-gl@5.3.0/dist/maplibre-gl.js',
    'https://unpkg.com/pmtiles@3.0.7/dist/pmtiles.js',
    'https://unpkg.com/@mapbox/mapbox-gl-draw@1.4.3/dist/mapbox-gl-draw.css',
    'https://unpkg.com/@mapbox/mapbox-gl-draw@1.4.3/dist/mapbox-gl-draw.js'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        Promise.all([
            // Cache local files
            caches.open(CACHE_NAME).then((cache) => {
                console.log('[SW] Caching static assets');
                return cache.addAll(STATIC_ASSETS).catch(err => {
                    console.error('[SW] Failed to cache static assets:', err);
                });
            }),
            // Cache external dependencies
            caches.open(CACHE_NAME).then((cache) => {
                console.log('[SW] Caching external dependencies');
                return Promise.all(
                    EXTERNAL_DEPS.map(url => 
                        fetch(url)
                            .then(response => cache.put(url, response))
                            .catch(err => console.warn('[SW] Failed to cache:', url))
                    )
                );
            })
        ]).then(() => {
            console.log('[SW] Installation complete');
            self.skipWaiting();
        })
    );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    // Delete old versions
                    if (cacheName.startsWith('metro-map-') && cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                    if (cacheName.startsWith('metro-tiles-') && cacheName !== TILE_CACHE_NAME) {
                        console.log('[SW] Deleting old tile cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            console.log('[SW] Activation complete');
            return self.clients.claim();
        })
    );
});

// Fetch event - serve from cache, fallback to network
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    
    // Handle OpenStreetMap tiles specially
    if (url.hostname === 'tile.openstreetmap.org' || url.hostname.includes('openstreetmap')) {
        event.respondWith(handleTileRequest(event.request));
        return;
    }
    
    // Handle Google Geolocation API (don't cache)
    if (url.hostname === 'www.googleapis.com' && url.pathname.includes('/geolocation/')) {
        event.respondWith(fetch(event.request));
        return;
    }
    
    // Handle other requests with cache-first strategy
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                // Return cached version and update in background
                event.waitUntil(updateCache(event.request));
                return cachedResponse;
            }
            
            // Not in cache, fetch from network
            return fetch(event.request).then((networkResponse) => {
                // Cache successful responses
                if (networkResponse && networkResponse.status === 200) {
                    const responseClone = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return networkResponse;
            }).catch((error) => {
                console.error('[SW] Fetch failed:', error);
                // Return offline page if navigation request fails
                if (event.request.mode === 'navigate') {
                    return caches.match('./index.html');
                }
                throw error;
            });
        })
    );
});

// Handle map tile requests with smart caching
async function handleTileRequest(request) {
    const cache = await caches.open(TILE_CACHE_NAME);
    
    // Check cache first
    const cachedResponse = await cache.match(request);
    if (cachedResponse) {
        return cachedResponse;
    }
    
    // Not in cache, fetch from network
    try {
        const networkResponse = await fetch(request);
        
        if (networkResponse && networkResponse.status === 200) {
            // Clone response before caching
            const responseClone = networkResponse.clone();
            
            // Manage cache size
            await manageTileCache(cache, request, responseClone);
        }
        
        return networkResponse;
    } catch (error) {
        console.warn('[SW] Tile fetch failed:', request.url);
        // Return placeholder tile for offline
        return createPlaceholderTile();
    }
}

// Manage tile cache size (LRU - Least Recently Used)
async function manageTileCache(cache, request, response) {
    // Add new tile
    await cache.put(request, response);
    
    // Check cache size
    const keys = await cache.keys();
    
    if (keys.length > MAX_TILE_CACHE_SIZE) {
        // Remove oldest tiles (first in the list)
        const deleteCount = keys.length - MAX_TILE_CACHE_SIZE;
        for (let i = 0; i < deleteCount; i++) {
            await cache.delete(keys[i]);
        }
        console.log(`[SW] Cleaned ${deleteCount} old tiles from cache`);
    }
}

// Update cache in background
async function updateCache(request) {
    try {
        const networkResponse = await fetch(request);
        if (networkResponse && networkResponse.status === 200) {
            const cache = await caches.open(CACHE_NAME);
            await cache.put(request, networkResponse);
        }
    } catch (error) {
        // Silent fail - keep using cached version
    }
}

// Create a placeholder tile for offline mode
function createPlaceholderTile() {
    // Simple 256x256 gray tile with "Offline" text
    const svg = `
        <svg width="256" height="256" xmlns="http://www.w3.org/2000/svg">
            <rect width="256" height="256" fill="#f0f0f0"/>
            <text x="128" y="128" font-family="Arial" font-size="14" text-anchor="middle" fill="#999">
                Offline
            </text>
        </svg>
    `;
    
    return new Response(svg, {
        headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'no-store'
        }
    });
}

// Listen for messages from the app
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data && event.data.type === 'CLEAR_CACHE') {
        event.waitUntil(
            caches.keys().then((cacheNames) => {
                return Promise.all(
                    cacheNames.map((cacheName) => caches.delete(cacheName))
                );
            }).then(() => {
                return self.clients.matchAll();
            }).then((clients) => {
                clients.forEach(client => {
                    client.postMessage({ type: 'CACHE_CLEARED' });
                });
            })
        );
    }
});

console.log('[SW] Service Worker loaded');
