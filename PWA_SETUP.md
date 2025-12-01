# PWA Implementation Complete! 🎉

## Files Created

✅ **sw.js** - Service Worker with smart caching
✅ **manifest.json** - PWA configuration
✅ **src/index.html** - Updated with PWA support
✅ **src/styles.css** - Added install banner & offline indicator styles
✅ **icon.svg** - Icon template

## What You Need to Do

### 1. Create App Icons (Required)

The app needs two PNG icons. Use the generated `icon.svg`:

**Option A - Online Converter:**
1. Go to https://cloudconvert.com/svg-to-png
2. Upload `icon.svg`
3. Convert to 192x192 → save as `icon-192.png`
4. Convert to 512x512 → save as `icon-512.png`
5. Place both in the `metro` folder (same level as `sw.js`)

**Option B - Using PowerShell (if you have ImageMagick):**
```powershell
magick icon.svg -resize 192x192 icon-192.png
magick icon.svg -resize 512x512 icon-512.png
```

**Option C - Manual (any image editor):**
- Create 192x192 and 512x512 PNG images with metro/map theme
- Save as `icon-192.png` and `icon-512.png`

### 2. Test Locally

```powershell
cd b:\Desktop\misc\digger\scripts\metro
python -m http.server 8000
```

Open: http://localhost:8000/src/index.html

### 3. Deploy to GitHub Pages

```bash
git add .
git commit -m "Add PWA support for offline functionality"
git push origin master
```

## How It Works Now

### ✨ First Visit (Online)
1. User opens https://yourname.github.io/metro
2. Service Worker installs and caches:
   - HTML, CSS, JavaScript files
   - MapLibre GL library
   - Draw plugin
3. As user explores map, tiles are cached automatically
4. Install banner appears: "Install Metro Map"

### ⚡ Second Visit (Online)
1. App loads INSTANTLY from cache
2. Map tiles load from cache (no wait!)
3. Updates check in background

### 🔌 Offline Mode
1. User enters subway/basement (no internet)
2. App still loads from cache
3. Cached map area works perfectly
4. Orange banner shows: "Offline Mode"
5. Drawing/editing works normally
6. Uncached areas show gray placeholder

### 📱 Installation
1. Click "Install" button or browser prompt
2. App adds to home screen
3. Opens like native app (no browser UI)
4. Works offline after installation

## Features Included

✅ **Smart Tile Caching** - Max 500 tiles, auto-cleanup
✅ **Offline Detection** - Visual indicator when offline
✅ **Install Prompt** - User-friendly install banner
✅ **Background Updates** - Checks for new version every minute
✅ **iOS Support** - Apple-specific meta tags
✅ **Placeholder Tiles** - Gray tiles for uncached areas
✅ **Cache Management** - Old versions auto-deleted

## Storage Breakdown

```
After exploring Kyiv center for 5 minutes:

Browser Cache:
├── metro-map-v1/          ~800 KB
│   ├── HTML/CSS/JS        ~50 KB
│   └── Libraries          ~750 KB
│
├── metro-tiles-v1/        ~2-5 MB
│   └── 200-400 tiles      (depends on zoom/pan)
│
LocalStorage:
└── customRoutes           ~10-100 KB

Total: ~3-6 MB
```

## Testing Offline Mode

1. Open app in Chrome
2. Open DevTools (F12)
3. Go to "Network" tab
4. Select "Offline" from throttling dropdown
5. Refresh page → App still works!

## Troubleshooting

**Service Worker not registering?**
- Must use HTTPS or localhost (not file://)
- Check console for errors

**Install button not showing?**
- Works on Chrome/Edge/Android
- iOS uses "Add to Home Screen" in Safari menu
- Desktop requires visiting 2+ times

**Tiles not caching?**
- Pan/zoom around the map area you need
- Max 500 tiles cached (zoom levels 12-16)

## Next Steps

1. ✅ Create icons (see step 1 above)
2. ✅ Test locally with python http server
3. ✅ Deploy to GitHub Pages
4. ✅ Test on mobile device
5. ✅ Install to home screen
6. ✅ Test offline mode in subway!

## Cache Management Commands

Add these to your browser console:

```javascript
// Clear all caches
navigator.serviceWorker.controller.postMessage({type: 'CLEAR_CACHE'});

// Check cache size
caches.open('metro-tiles-v1').then(c => c.keys()).then(k => console.log('Cached tiles:', k.length));

// Unregister service worker
navigator.serviceWorker.getRegistrations().then(r => r.forEach(reg => reg.unregister()));
```

Your metro map is now a full PWA! 🚇📱
