# Metro Map Application - Implementation

This is a complete implementation of a metro map application using MapLibre GL JS and PMTiles, based on the design analysis from metro2.org.

## Features

✅ **MapLibre GL JS** - WebGL-accelerated map rendering
✅ **PMTiles** - Efficient vector tile hosting
✅ **GeoJSON Routes** - Custom metro lines with curved paths
✅ **Interactive Drawing** - Create and edit routes visually
✅ **Data-Driven Styling** - Colors and widths from GeoJSON properties
✅ **Click Popups** - Display route information
✅ **Export/Import** - Save and load GeoJSON files
✅ **LocalStorage** - Persist routes in browser

## Quick Start

1. **Open `index.html`** in a modern web browser (Chrome, Firefox, Safari, Edge)

2. **View the map** with default Protomaps basemap

3. **Enable Edit Mode** to start drawing routes

4. **Draw routes**:
   - Click "Draw Line" to create metro lines
   - Click "Draw Station" to create station polygons
   - Click points on the map to define the route
   - Double-click to finish drawing

5. **Configure properties**:
   - Enter line name
   - Choose color
   - Set width and opacity
   - Add description
   - Click "Save"

6. **Export routes**:
   - Click "Export GeoJSON" to download your routes
   - Share the file or use it in other applications

7. **Import routes**:
   - Click "Import GeoJSON" to load existing routes
   - Select a `.geojson` file from your computer

## File Structure

```
src/
├── index.html           # Main HTML file
├── styles.css           # Application styles
├── app.js              # JavaScript application logic
├── sample-routes.geojson  # Example routes (NYC metro)
└── README.md           # This file
```

## Sample Data

The included `sample-routes.geojson` contains example metro routes for New York City with:
- 4 curved metro lines (Red, Blue, Green, Yellow)
- 2 station polygons
- Proper styling properties

To import the sample:
1. Enable Edit Mode
2. Click "Import GeoJSON"
3. Select `sample-routes.geojson`

## Creating Curved Routes

### Method 1: Dense Coordinates
Add many coordinate points to create smooth curves:

```json
{
  "type": "LineString",
  "coordinates": [
    [lon1, lat1, 0],
    [lon2, lat2, 0],
    [lon3, lat3, 0],
    // ... more points create smoother curves
    [lonN, latN, 0]
  ]
}
```

### Method 2: Visual Drawing
1. Enable Edit Mode
2. Click "Draw Line"
3. Click many points along your desired curved path
4. MapLibre GL will interpolate between points
5. Double-click to finish

### Method 3: Use geojson.io
1. Visit https://geojson.io/
2. Draw your routes visually
3. Copy the GeoJSON output
4. Import into the application

## GeoJSON Properties

### For LineString (metro lines):
```json
{
  "name": "Line Name",
  "stroke": "#ff0000",        // Hex color
  "stroke-width": 6,          // Width in pixels
  "stroke-opacity": 1,        // 0-1
  "description": "Description text"
}
```

### For Polygon (stations):
```json
{
  "name": "Station Name",
  "fill": "#ffaa00",          // Hex color
  "fill-opacity": 0.6,        // 0-1
  "description": "Description text"
}
```

## Customization

### Change Basemap

Edit `app.js` and modify the `PMTILES_URL`:

```javascript
const PMTILES_URL = 'https://your-pmtiles-url.pmtiles';
```

**Free PMTiles sources:**
- Protomaps: `https://build.protomaps.com/20230927.pmtiles`
- Custom: Generate your own from OpenStreetMap data

### Change Default Location

Modify the `center` in `initializeMap()`:

```javascript
map = new maplibregl.Map({
    // ...
    center: [longitude, latitude],  // Your coordinates
    zoom: 12,                        // Your preferred zoom
    // ...
});
```

### Style the Basemap

Edit the `getMapStyle()` function to customize colors:

```javascript
{
    id: 'water',
    type: 'fill',
    paint: {
        'fill-color': '#aad3df'  // Change water color
    }
}
```

## Browser Compatibility

- Chrome/Edge: 79+
- Firefox: 78+
- Safari: 14+
- Mobile Safari: 14+
- Android Chrome: 79+

**Requirements:**
- WebGL support
- ES6+ JavaScript
- LocalStorage API

## Performance Tips

1. **Limit coordinate points** - Use only as many as needed for smooth curves
2. **Keep GeoJSON < 1MB** - Split large datasets into multiple files
3. **Simplify geometries** - Remove redundant vertices
4. **Use appropriate zoom levels** - Don't show too much detail at low zoom

## Deployment

### Static Hosting
Upload the `src/` folder to:
- **GitHub Pages**: Free, easy setup
- **Netlify**: Free tier with CI/CD
- **Vercel**: Free tier with automatic deployments
- **Traditional hosting**: Any web server

### Steps:
1. Upload all files from `src/` to your host
2. Ensure CORS is enabled if loading external GeoJSON
3. Access via your domain or hosting URL

## Troubleshooting

### Map doesn't load
- Check browser console for errors
- Ensure internet connection (for loading PMTiles)
- Try a different browser

### Routes don't appear after drawing
- Make sure to click "Save" in the properties panel
- Check that properties have valid values
- Verify GeoJSON format if importing

### Performance issues
- Reduce number of coordinate points
- Simplify complex geometries
- Clear localStorage if too much data

### Import fails
- Verify GeoJSON is valid (use https://geojsonlint.com/)
- Check file format is FeatureCollection
- Ensure features have required properties

## Advanced Features

### Add Custom Basemap
Replace Protomaps with your own PMTiles:
1. Generate PMTiles from OSM data using `planetiler` or `tippecanoe`
2. Upload to CDN or static hosting
3. Update `PMTILES_URL` in `app.js`

### Integrate Backend API
Replace localStorage with server-side storage:
1. Create REST API endpoints (POST, GET, PUT, DELETE)
2. Modify `saveRoutesToStorage()` and `loadStoredRoutes()`
3. Add authentication if needed

### Add Real-Time Collaboration
Use WebSocket for multi-user editing:
1. Set up WebSocket server
2. Broadcast draw events to other users
3. Sync route changes in real-time

## Resources

- **MapLibre GL JS Docs**: https://maplibre.org/maplibre-gl-js/docs/
- **PMTiles Spec**: https://docs.protomaps.com/pmtiles/
- **GeoJSON Spec**: https://geojson.org/
- **geojson.io**: https://geojson.io/ (visual GeoJSON editor)
- **QGIS**: https://qgis.org/ (professional GIS software)

## License

This implementation is provided as-is for educational and commercial use.

## Credits

Based on design analysis of metro2.org metro map application.
Built with MapLibre GL JS, PMTiles, and Protomaps.
