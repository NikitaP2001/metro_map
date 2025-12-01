// Metro Map Application
// MapLibre GL + PMTiles Implementation

// Global variables
let map;
let draw;
let editMode = false;
let currentFeatureId = null;
let customRoutes = [];
let curveMode = false;
let isEditingCurve = false;
let editPoints = [];
let draggedPointIndex = null;
let dragStartPoints = null;
let hasMovedDuringDrag = false; // Track if point actually moved during drag
let pendingDragIndex = null; // Index of point with mouse pressed (not dragging yet)
let justDeletedPoint = false; // Prevent line dblclick from firing right after point delete
let lastTapTime = 0; // For detecting double-tap on mobile
let lastTapTarget = null; // Track what was tapped
let touchMoved = false; // Track if touch moved (drag vs tap)
let tempLayerId = 'temp-edit-layer';
let tempPointsLayerId = 'temp-edit-points';
let currentPopup = null; // Track the current popup to close it when opening a new one

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    setupEventListeners();
    loadStoredRoutes();
});

// Google Geolocation API key (free tier: 40,000 requests/month)
// If you have a Google API key, replace 'YOUR_API_KEY' with your actual key
// Get one at: https://console.cloud.google.com/apis/credentials
const GOOGLE_GEOLOCATION_API_KEY = null; // Set to your API key or leave null for browser fallback

// Custom geolocation using Google API with fallback
async function getAccurateLocation() {
    // Try Google Geolocation API first if API key is available
    if (GOOGLE_GEOLOCATION_API_KEY) {
        try {
            // Collect WiFi access points for better accuracy (if available)
            const requestBody = {
                considerIp: true
            };
            
            const response = await fetch(
                `https://www.googleapis.com/geolocation/v1/geolocate?key=${GOOGLE_GEOLOCATION_API_KEY}`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(requestBody)
                }
            );
            
            if (response.ok) {
                const data = await response.json();
                return {
                    latitude: data.location.lat,
                    longitude: data.location.lng,
                    accuracy: data.accuracy,
                    source: 'google'
                };
            }
        } catch (error) {
            console.warn('Google Geolocation failed, falling back to browser:', error);
        }
    }
    
    // Fallback to browser geolocation API
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error('Geolocation not supported'));
            return;
        }
        
        navigator.geolocation.getCurrentPosition(
            (position) => {
                resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude,
                    accuracy: position.coords.accuracy,
                    source: 'browser'
                });
            },
            (error) => {
                reject(error);
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0
            }
        );
    });
}

// Add custom geolocation control button
function addCustomGeolocateControl() {
    // Create control container
    const geolocateControl = document.createElement('div');
    geolocateControl.className = 'maplibregl-ctrl maplibregl-ctrl-group';
    
    // Create button
    const button = document.createElement('button');
    button.className = 'maplibregl-ctrl-geolocate';
    button.type = 'button';
    button.title = 'Find my location';
    button.setAttribute('aria-label', 'Find my location');
    
    // Add icon (using SVG)
    button.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" xmlns="http://www.w3.org/2000/svg">
            <path d="M10 4C9 4 9 5 9 5L9 5.1A5 5 0 0 0 5.1 9L5 9C5 9 4 9 4 10 4 11 5 11 5 11L5.1 11A5 5 0 0 0 9 14.9L9 15C9 15 9 16 10 16 11 16 11 15 11 15L11 14.9A5 5 0 0 0 14.9 11L15 11C15 11 16 11 16 10 16 9 15 9 15 9L14.9 9A5 5 0 0 0 11 5.1L11 5C11 5 11 4 10 4zM10 6.5A3.5 3.5 0 0 1 13.5 10 3.5 3.5 0 0 1 10 13.5 3.5 3.5 0 0 1 6.5 10 3.5 3.5 0 0 1 10 6.5zM10 8.3A1.8 1.8 0 0 0 8.3 10 1.8 1.8 0 0 0 10 11.8 1.8 1.8 0 0 0 11.8 10 1.8 1.8 0 0 0 10 8.3z"/>
        </svg>
    `;
    
    // Add click handler
    button.addEventListener('click', async () => {
        button.classList.add('maplibregl-ctrl-geolocate-active');
        button.disabled = true;
        
        try {
            const position = await getAccurateLocation();
            
            // Fly to location
            map.flyTo({
                center: [position.longitude, position.latitude],
                zoom: 16,
                speed: 1.2,
                curve: 1.4
            });
            
            // Add/update user location marker
            const markerEl = document.getElementById('user-location-marker');
            if (markerEl) {
                markerEl.remove();
            }
            
            const newMarker = document.createElement('div');
            newMarker.id = 'user-location-marker';
            newMarker.className = 'user-location-marker';
            newMarker.style.cssText = `
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background: #4285f4;
                border: 3px solid white;
                box-shadow: 0 0 10px rgba(66, 133, 244, 0.5);
            `;
            
            new maplibregl.Marker({ element: newMarker })
                .setLngLat([position.longitude, position.latitude])
                .addTo(map);
            
            // Show accuracy info
            console.log(`Location found (${position.source}): accuracy ±${Math.round(position.accuracy)}m`);
            
        } catch (error) {
            console.error('Geolocation error:', error);
            alert('Unable to get your location. Please check permissions.');
        } finally {
            button.classList.remove('maplibregl-ctrl-geolocate-active');
            button.disabled = false;
        }
    });
    
    geolocateControl.appendChild(button);
    
    // Add to map
    const topRightControls = document.querySelector('.maplibregl-ctrl-top-right');
    if (topRightControls) {
        topRightControls.appendChild(geolocateControl);
    }
}

// Initialize MapLibre GL map with raster tiles
function initializeMap() {

    // Initialize map with OpenStreetMap raster tiles (no PMTiles needed for now)
    map = new maplibregl.Map({
        container: 'map',
        style: getMapStyle(),
        center: [30.5234, 50.4501], // Kyiv, Ukraine
        zoom: 12,
        attributionControl: true
    });
    
    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    
    // Add custom geolocation control with Google API fallback
    addCustomGeolocateControl();
    
    // Add scale control
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    
    // Initialize drawing controls (MapboxDraw is the global name even for MapLibre GL Draw)
    draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
            line_string: false,
            polygon: false,
            trash: false
        },
        styles: getDrawStyles()
    });
    
    // Map load event
    map.on('load', () => {
        hideLoading();
        
        // Add custom routes source and layers
        map.addSource('custom-routes', {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        
        // Add line layer
        map.addLayer({
            id: 'custom-routes-lines',
            type: 'line',
            source: 'custom-routes',
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': ['get', 'stroke'],
                'line-width': ['get', 'stroke-width'],
                'line-opacity': ['get', 'stroke-opacity']
            }
        });
        
        // Add invisible wider line layer for easier clicking
        map.addLayer({
            id: 'custom-routes-lines-hitarea',
            type: 'line',
            source: 'custom-routes',
            filter: ['==', '$type', 'LineString'],
            paint: {
                'line-color': 'transparent',
                'line-width': 20,
                'line-opacity': 0
            }
        });
        
        // Add polygon layer
        map.addLayer({
            id: 'custom-routes-polygons',
            type: 'fill',
            source: 'custom-routes',
            filter: ['==', '$type', 'Polygon'],
            paint: {
                'fill-color': ['get', 'fill'],
                'fill-opacity': ['get', 'fill-opacity'],
                'fill-outline-color': ['get', 'fill']
            }
        });
        
        // Add click handlers
        setupMapClickHandlers();
        
        // Prevent double-click zoom when in curve editing mode
        map.on('dblclick', (e) => {
            if (isEditingCurve) {
                e.preventDefault();
                if (e.originalEvent) {
                    e.originalEvent.stopPropagation();
                }
            }
        });
        
        // Load stored routes
        refreshCustomRoutes();
    });
}

// Get map style definition
function getMapStyle() {
    return {
        version: 8,
        sources: {
            'osm-tiles': {
                type: 'raster',
                tiles: [
                    'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
                ],
                tileSize: 256,
                attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }
        },
        layers: [
            {
                id: 'osm-tiles-layer',
                type: 'raster',
                source: 'osm-tiles',
                minzoom: 0,
                maxzoom: 19
            }
        ]
    };
}

// Get drawing styles
function getDrawStyles() {
    return [
        {
            id: 'gl-draw-line',
            type: 'line',
            filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#3498db',
                'line-width': 6
            }
        },
        {
            id: 'gl-draw-polygon-fill',
            type: 'fill',
            filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
            paint: {
                'fill-color': '#3498db',
                'fill-opacity': 0.5
            }
        },
        {
            id: 'gl-draw-polygon-stroke',
            type: 'line',
            filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
            layout: {
                'line-cap': 'round',
                'line-join': 'round'
            },
            paint: {
                'line-color': '#3498db',
                'line-width': 2
            }
        },
        {
            id: 'gl-draw-vertex',
            type: 'circle',
            filter: ['all', ['==', 'meta', 'vertex'], ['==', '$type', 'Point']],
            paint: {
                'circle-radius': 5,
                'circle-color': '#ffffff',
                'circle-stroke-color': '#3498db',
                'circle-stroke-width': 2
            }
        }
    ];
}

// Setup event listeners
function setupEventListeners() {
    // Edit mode toggle
    document.getElementById('toggle-edit-mode').addEventListener('click', toggleEditMode);
    
    // Curve mode toggle
    document.getElementById('toggle-curve-mode').addEventListener('click', toggleCurveMode);
    
    // Drawing controls
    document.getElementById('draw-line').addEventListener('click', () => startDrawing('LineString'));
    document.getElementById('draw-polygon').addEventListener('click', () => startDrawing('Polygon'));
    
    // Export/Import
    document.getElementById('export-geojson').addEventListener('click', exportGeoJSON);
    document.getElementById('import-geojson-btn').addEventListener('click', () => {
        document.getElementById('import-file').click();
    });
    document.getElementById('import-file').addEventListener('change', handleImport);
    document.getElementById('clear-all-routes').addEventListener('click', clearAllRoutes);
    
    // Properties panel
    document.getElementById('save-properties').addEventListener('click', saveProperties);
    document.getElementById('cancel-properties').addEventListener('click', cancelProperties);
    
    // Show panel buttons
    document.getElementById('show-panel').addEventListener('click', toggleControlsPanel);
    document.getElementById('show-properties').addEventListener('click', togglePropertiesPanel);
    
    // Auto-hide panels on mouse leave
    const controlsPanel = document.getElementById('controls-panel');
    const propertiesPanel = document.getElementById('properties-panel');
    const showPanelBtn = document.getElementById('show-panel');
    const showPropertiesBtn = document.getElementById('show-properties');
    
    controlsPanel.addEventListener('mouseleave', () => {
        if (!controlsPanel.classList.contains('collapsed')) {
            toggleControlsPanel();
        }
    });
    
    // Remove auto-hide on mouseleave for properties panel
    // It will only hide on click/touch outside
    
    // Auto-hide panels on click/touch outside
    const hideOnOutsideClick = (e) => {
        const clickedControls = controlsPanel.contains(e.target) || 
                               document.getElementById('show-panel').contains(e.target) ||
                               e.target.closest('.maplibregl-ctrl');
        const clickedProperties = propertiesPanel.contains(e.target) || 
                                 document.getElementById('show-properties').contains(e.target);
        
        if (!clickedControls && !controlsPanel.classList.contains('collapsed')) {
            toggleControlsPanel();
        }
        
        // Check if properties panel should be hidden
        if (!clickedProperties && !propertiesPanel.classList.contains('collapsed') && 
            propertiesPanel.style.display === 'block') {
            const showTime = propertiesPanel.dataset.showTime;
            const timeSinceShow = showTime ? Date.now() - parseInt(showTime) : 1000;
            
            // Only hide if panel has been visible for at least 500ms
            if (timeSinceShow > 500) {
                togglePropertiesPanel();
            }
        }
    };
    
    // Listen to both click and touchstart for better mobile support
    document.addEventListener('click', hideOnOutsideClick);
    document.addEventListener('touchstart', hideOnOutsideClick);
    
    // Hide properties panel on any map interaction (drag, zoom, scroll)
    map.on('movestart', () => {
        if (propertiesPanel.style.display === 'block' && !propertiesPanel.classList.contains('collapsed')) {
            const showTime = propertiesPanel.dataset.showTime;
            const timeSinceShow = showTime ? Date.now() - parseInt(showTime) : 1000;
            if (timeSinceShow > 500) {
                togglePropertiesPanel();
            }
        }
    });
    
    map.on('zoomstart', () => {
        if (propertiesPanel.style.display === 'block' && !propertiesPanel.classList.contains('collapsed')) {
            const showTime = propertiesPanel.dataset.showTime;
            const timeSinceShow = showTime ? Date.now() - parseInt(showTime) : 1000;
            if (timeSinceShow > 500) {
                togglePropertiesPanel();
            }
        }
    });
    
    // Range input updates
    document.getElementById('line-width').addEventListener('input', (e) => {
        document.getElementById('width-value').textContent = e.target.value;
    });
    document.getElementById('line-opacity').addEventListener('input', (e) => {
        document.getElementById('opacity-value').textContent = e.target.value;
    });
}

// Setup map click handlers
function setupMapClickHandlers() {
    // Click on lines (using the wider hit area)
    map.on('click', 'custom-routes-lines-hitarea', (e) => {
        showFeaturePopup(e);
    });
    
    // Touch on lines for mobile
    map.on('touchend', 'custom-routes-lines-hitarea', (e) => {
        if (e.originalEvent.touches.length === 0) {
            showFeaturePopup(e);
        }
    });
    
    // Click on polygons
    map.on('click', 'custom-routes-polygons', (e) => {
        showFeaturePopup(e);
    });
    
    // Touch on polygons for mobile
    map.on('touchend', 'custom-routes-polygons', (e) => {
        if (e.originalEvent.touches.length === 0) {
            showFeaturePopup(e);
        }
    });
    
    // Hover effects (using the wider hit area)
    map.on('mouseenter', 'custom-routes-lines-hitarea', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'custom-routes-lines-hitarea', () => {
        map.getCanvas().style.cursor = '';
    });
    
    map.on('mouseenter', 'custom-routes-polygons', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'custom-routes-polygons', () => {
        map.getCanvas().style.cursor = '';
    });
}

// Show feature popup
function showFeaturePopup(e) {
    // Don't show popup if we're in curve editing mode
    if (isEditingCurve) {
        return;
    }
    
    const feature = e.features[0];
    const props = feature.properties;
    
    // Try multiple ways to get the feature ID
    let featureId = feature.id || props.id || props.featureId;
    
    // If still no ID, try to find by matching properties
    if (!featureId) {
        const matchedFeature = customRoutes.find(f => {
            return f.properties.name === props.name && 
                   f.properties.description === props.description &&
                   (f.properties.stroke === props.stroke || f.properties.fill === props.fill);
        });
        featureId = matchedFeature ? matchedFeature.id : null;
    }
    
    if (!featureId) {
        console.error('Could not find feature ID');
        console.log('Feature:', feature);
        console.log('Custom routes:', customRoutes);
        alert('Error: Could not identify this route. Please try again.');
        return;
    }
    
    console.log('Found feature ID:', featureId);
    
    let html = `<h4>${props.name || 'Unnamed Route'}</h4>`;
    
    if (props.description) {
        html += `<p>${props.description}</p>`;
    }
    
    html += '<div class="property-row">';
    html += `<span class="property-label">Color:</span>`;
    html += `<span class="property-value" style="background: ${props.stroke || props.fill}; padding: 2px 10px; border-radius: 3px;">&nbsp;</span>`;
    html += '</div>';
    
    if (props['stroke-width']) {
        html += '<div class="property-row">';
        html += `<span class="property-label">Width:</span>`;
        html += `<span class="property-value">${props['stroke-width']}px</span>`;
        html += '</div>';
    }
    
    html += '<div style="margin-top: 10px; display: flex; gap: 5px;">';
    html += `<button onclick="window.editExistingRoute('${featureId}')" style="flex: 1; padding: 5px 10px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Edit</button>`;
    html += `<button onclick="window.deleteExistingRoute('${featureId}')" style="flex: 1; padding: 5px 10px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">Delete</button>`;
    html += '</div>';
    
    // Close existing popup if any
    if (currentPopup) {
        currentPopup.remove();
    }
    
    // Create and track new popup
    currentPopup = new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    
    // Clear reference when popup is closed
    currentPopup.on('close', () => {
        currentPopup = null;
    });
}

// Toggle curve mode
function toggleCurveMode() {
    curveMode = !curveMode;
    const curveModeText = document.getElementById('curve-mode-text');
    const curveIndicator = document.getElementById('curve-indicator');
    
    if (curveMode) {
        curveModeText.textContent = 'Smooth Curves: ON';
        curveIndicator.style.display = 'inline';
    } else {
        curveModeText.textContent = 'Smooth Curves: OFF';
        curveIndicator.style.display = 'none';
    }
}

// Edit existing route (called from popup)
window.editExistingRoute = function(featureId) {
    console.log('Attempting to edit route:', featureId);
    
    // Close all popups
    const popups = document.getElementsByClassName('maplibregl-popup');
    while(popups[0]) {
        popups[0].remove();
    }
    
    // Find the feature in customRoutes
    const feature = customRoutes.find(f => f.id === featureId);
    if (!feature) {
        console.error('Feature not found:', featureId);
        console.log('Available routes:', customRoutes.map(r => r.id));
        alert('Error: Could not find this route. Please try again.');
        return;
    }
    
    console.log('Found feature to edit:', feature);
    
    // Set current feature ID
    currentFeatureId = featureId;
    
    // Enable edit mode if not already enabled
    if (!editMode) {
        toggleEditMode();
    }
    
    // For LineStrings, enable interactive curve editing
    if (feature.geometry.type === 'LineString') {
        // Check if this route was created with smooth curves
        const wasSmoothed = feature.properties.controlPoints && feature.properties.controlPoints.length > 0;
        
        // Auto-enable curve mode if the route was originally smoothed
        if (wasSmoothed && !curveMode) {
            toggleCurveMode();
        }
        
        // Use stored control points if available, otherwise use current coordinates
        if (feature.properties.controlPoints && feature.properties.controlPoints.length > 0) {
            editPoints = feature.properties.controlPoints.map(c => [...c]);
        } else {
            // Fallback for old routes without stored control points
            editPoints = feature.geometry.coordinates.map(c => [...c]);
        }
        
        // Enable interactive editing mode
        enableCurveEditing();
    }
    
    // Show properties panel with existing values using the proper function
    const propertiesPanel = document.getElementById('properties-panel');
    propertiesPanel.style.display = 'block';
    propertiesPanel.classList.remove('collapsed');
    propertiesPanel.dataset.showTime = Date.now().toString();
    document.getElementById('show-properties').style.display = 'none';
    
    // Update position based on controls panel state
    const controlsPanel = document.getElementById('controls-panel');
    const controlsCollapsed = controlsPanel.classList.contains('collapsed');
    if (controlsCollapsed) {
        propertiesPanel.classList.add('controls-hidden');
    } else {
        propertiesPanel.classList.remove('controls-hidden');
    }
    
    document.getElementById('line-name').value = feature.properties.name || '';
    document.getElementById('line-color').value = feature.properties.stroke || feature.properties.fill || '#ff0000';
    document.getElementById('line-width').value = feature.properties['stroke-width'] || 6;
    document.getElementById('width-value').textContent = feature.properties['stroke-width'] || 6;
    document.getElementById('line-opacity').value = feature.properties['stroke-opacity'] || feature.properties['fill-opacity'] || 1;
    document.getElementById('opacity-value').textContent = feature.properties['stroke-opacity'] || feature.properties['fill-opacity'] || 1;
    document.getElementById('description').value = feature.properties.description || '';
};

// Delete existing route (called from popup)
window.deleteExistingRoute = function(featureId) {
    console.log('Attempting to delete route:', featureId);
    console.log('Current routes before delete:', customRoutes.length);
    
    // Close all popups
    const popups = document.getElementsByClassName('maplibregl-popup');
    while(popups[0]) {
        popups[0].remove();
    }
    
    if (confirm('Are you sure you want to delete this route?')) {
        // Remove from customRoutes array
        const beforeLength = customRoutes.length;
        customRoutes = customRoutes.filter(f => f.id !== featureId);
        const afterLength = customRoutes.length;
        
        console.log('Routes after filter:', afterLength, 'Deleted:', beforeLength - afterLength);
        
        // Save to localStorage
        saveRoutesToStorage();
        
        // Refresh map display
        refreshCustomRoutes();
        
        if (beforeLength > afterLength) {
            console.log('Route deleted successfully');
        } else {
            console.error('Route was not found for deletion');
            alert('Error: Could not delete route. ID mismatch.');
        }
    }
};

// Toggle edit mode
function toggleEditMode() {
    editMode = !editMode;
    const editModeText = document.getElementById('edit-mode-text');
    const editControls = document.getElementById('edit-controls');
    
    if (editMode) {
        map.addControl(draw, 'top-left');
        editModeText.textContent = 'Disable Edit Mode';
        editControls.style.display = 'block';
        
        // Listen to draw events
        map.on('draw.create', handleDrawCreate);
        map.on('draw.update', handleDrawUpdate);
        map.on('draw.delete', handleDrawDelete);
    } else {
        map.removeControl(draw);
        editModeText.textContent = 'Enable Edit Mode';
        editControls.style.display = 'none';
        
        // Remove draw event listeners
        map.off('draw.create', handleDrawCreate);
        map.off('draw.update', handleDrawUpdate);
        map.off('draw.delete', handleDrawDelete);
    }
}

// Start drawing
function startDrawing(type) {
    if (type === 'LineString') {
        draw.changeMode('draw_line_string');
    } else if (type === 'Polygon') {
        draw.changeMode('draw_polygon');
    }
}

// Smooth a LineString using Catmull-Rom spline interpolation
function smoothLineString(coordinates) {
    if (coordinates.length < 3) return coordinates;
    
    const smoothed = [];
    const tension = 0.5; // Controls curve tightness (0 = straight, 1 = very curved)
    const segments = 10; // Points between each control point
    
    // Add first point
    smoothed.push(coordinates[0]);
    
    // Process each segment
    for (let i = 0; i < coordinates.length - 1; i++) {
        const p0 = coordinates[Math.max(0, i - 1)];
        const p1 = coordinates[i];
        const p2 = coordinates[i + 1];
        const p3 = coordinates[Math.min(coordinates.length - 1, i + 2)];
        
        // Generate interpolated points
        for (let t = 0; t < segments; t++) {
            const u = t / segments;
            const u2 = u * u;
            const u3 = u2 * u;
            
            // Catmull-Rom spline formula
            const x = 0.5 * (
                (2 * p1[0]) +
                (-p0[0] + p2[0]) * u +
                (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 +
                (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3
            );
            
            const y = 0.5 * (
                (2 * p1[1]) +
                (-p0[1] + p2[1]) * u +
                (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 +
                (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3
            );
            
            smoothed.push([x, y]);
        }
    }
    
    // Add last point
    smoothed.push(coordinates[coordinates.length - 1]);
    
    return smoothed;
}

// Handle draw create
function handleDrawCreate(e) {
    const feature = e.features[0];
    currentFeatureId = feature.id;
    
    // For LineStrings, enable interactive curve editing
    if (feature.geometry.type === 'LineString') {
        // Store original control points
        editPoints = feature.geometry.coordinates.map(c => [...c]);
        
        // Apply curve smoothing if enabled
        if (curveMode) {
            feature.geometry.coordinates = smoothLineString(editPoints);
            draw.delete(feature.id);
            const newFeature = draw.add(feature)[0];
            currentFeatureId = newFeature;
        }
        
        // Enable interactive editing mode
        enableCurveEditing();
    }
    
    showPropertiesPanel(feature);
}

// Enable interactive curve editing
function enableCurveEditing() {
    if (isEditingCurve) return;
    isEditingCurve = true;
    
    console.log('ENABLING CURVE EDITING - editPoints:', editPoints.length);
    
    // Hide the draw feature temporarily
    if (draw.get(currentFeatureId)) {
        draw.delete(currentFeatureId);
    }
    
    // Add temporary layers for editing
    if (!map.getSource(tempLayerId)) {
        console.log('Creating temp layers for editing');
        map.addSource(tempLayerId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        
        map.addLayer({
            id: tempLayerId,
            type: 'line',
            source: tempLayerId,
            paint: {
                'line-color': '#3498db',
                'line-width': 6,
                'line-opacity': 0.8
            }
        });
        
        // Make line layer interactive for double-click (add before points so points are on top)
        map.addLayer({
            id: tempLayerId + '-hitarea',
            type: 'line',
            source: tempLayerId,
            paint: {
                'line-color': 'transparent',
                'line-width': 20, // Wider hit area
                'line-opacity': 0
            }
        });
        
        map.addSource(tempPointsLayerId, {
            type: 'geojson',
            data: {
                type: 'FeatureCollection',
                features: []
            }
        });
        
        map.addLayer({
            id: tempPointsLayerId,
            type: 'circle',
            source: tempPointsLayerId,
            paint: {
                'circle-radius': 10,
                'circle-color': '#ffffff',
                'circle-stroke-color': '#3498db',
                'circle-stroke-width': 3
            }
        });
        
        // Add medium invisible hit area for double-click (easier to hit than visual point)
        map.addLayer({
            id: tempPointsLayerId + '-dblclick',
            type: 'circle',
            source: tempPointsLayerId,
            paint: {
                'circle-radius': 15, // Medium hit area for double-click
                'circle-color': 'transparent',
                'circle-opacity': 0
            }
        });
        
        // Add larger invisible hit area for dragging
        map.addLayer({
            id: tempPointsLayerId + '-hitarea',
            type: 'circle',
            source: tempPointsLayerId,
            paint: {
                'circle-radius': 20, // Larger hit area for drag
                'circle-color': 'transparent',
                'circle-opacity': 0
            }
        });
    }
    
    // Update display
    updateCurveDisplay();
    
    // Add event listeners for dragging (mouse and touch) - use hit areas for easier dragging
    const pointHitArea = tempPointsLayerId + '-hitarea';
    const pointDblClickArea = tempPointsLayerId + '-dblclick';
    
    console.log('Curve editing enabled - layers created, points:', editPoints.length);
    console.log('Attached dblclick handler to layer:', pointDblClickArea);
    map.on('mousedown', pointHitArea, onPointMouseDown);
    map.on('touchstart', pointHitArea, onPointTouchStart);
    map.on('mousemove', onPointMouseMove);
    map.on('touchmove', onPointTouchMove);
    map.on('mouseup', onPointMouseUp);
    map.on('touchend', onPointTouchEnd);
    
    // Add double-click handlers - use medium-sized layer for balance between precision and usability
    map.on('dblclick', pointDblClickArea, onPointDoubleClick);
    map.on('dblclick', tempLayerId + '-hitarea', onLineDoubleClick);
    
    // Add touch handlers for mobile (double-tap detection)
    map.on('touchend', pointDblClickArea, onPointTouchTap);
    map.on('touchend', tempLayerId + '-hitarea', onLineTouchTap);
    
    // Change cursor on hover
    map.on('mouseenter', pointHitArea, () => {
        map.getCanvas().style.cursor = 'grab';
    });
    
    map.on('mouseleave', pointHitArea, () => {
        if (draggedPointIndex === null) {
            map.getCanvas().style.cursor = '';
        }
    });
}

// Disable curve editing
function disableCurveEditing() {
    if (!isEditingCurve) return;
    isEditingCurve = false;
    
    const pointHitArea = tempPointsLayerId + '-hitarea';
    const pointDblClickArea = tempPointsLayerId + '-dblclick';
    
    // Remove event listeners
    map.off('mousedown', pointHitArea, onPointMouseDown);
    map.off('touchstart', pointHitArea, onPointTouchStart);
    map.off('mousemove', onPointMouseMove);
    map.off('touchmove', onPointTouchMove);
    map.off('mouseup', onPointMouseUp);
    map.off('touchend', onPointTouchEnd);
    map.off('dblclick', pointDblClickArea, onPointDoubleClick);
    map.off('dblclick', tempLayerId + '-hitarea', onLineDoubleClick);
    map.off('touchend', pointDblClickArea, onPointTouchTap);
    map.off('touchend', tempLayerId + '-hitarea', onLineTouchTap);
    map.off('mouseenter', pointHitArea);
    map.off('mouseleave', pointHitArea);
    
    // Clear temporary layers
    if (map.getSource(tempLayerId)) {
        map.getSource(tempLayerId).setData({
            type: 'FeatureCollection',
            features: []
        });
    }
    if (map.getSource(tempPointsLayerId)) {
        map.getSource(tempPointsLayerId).setData({
            type: 'FeatureCollection',
            features: []
        });
    }
    
    // Reset drag state
    draggedPointIndex = null;
    dragStartPoints = null;
    map.getCanvas().style.cursor = '';
}

// Update curve display
function updateCurveDisplay() {
    // Update line
    const lineCoords = curveMode ? smoothLineString(editPoints) : editPoints;
    map.getSource(tempLayerId).setData({
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: lineCoords
        }
    });
    
    // Update control points
    const pointFeatures = editPoints.map((coord, index) => ({
        type: 'Feature',
        properties: { index },
        geometry: {
            type: 'Point',
            coordinates: coord
        }
    }));
    
    console.log('UPDATE: Setting', pointFeatures.length, 'control points on map');
    
    map.getSource(tempPointsLayerId).setData({
        type: 'FeatureCollection',
        features: pointFeatures
    });
}

// Double-click on point to remove it
function onPointDoubleClick(e) {
    console.log('POINT DOUBLE-CLICK FIRED!', e.features[0]?.properties);
    
    e.preventDefault();
    if (e.originalEvent) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopImmediatePropagation();
    }
    
    // Clear any pending or active drag state
    if (pendingDragIndex !== null) {
        pendingDragIndex = null;
        dragStartPoints = null;
    }
    if (draggedPointIndex !== null) {
        draggedPointIndex = null;
        dragStartPoints = null;
        map.dragPan.enable();
    }
    
    // Don't delete if we just finished dragging the point
    if (hasMovedDuringDrag) {
        hasMovedDuringDrag = false;
        return;
    }
    
    if (!isEditingCurve) return;
    if (editPoints.length <= 2) return; // Need at least 2 points for a line
    
    const pointIndex = e.features[0].properties.index;
    editPoints.splice(pointIndex, 1);
    updateCurveDisplay();
    
    // Set flag to prevent line dblclick from immediately adding point back
    justDeletedPoint = true;
    setTimeout(() => { justDeletedPoint = false; }, 100);
    
    // Reset the flag after processing
    hasMovedDuringDrag = false;
}

// Mobile: Double-tap on point to remove it
function onPointTouchTap(e) {
    // CRITICAL: Stop event from reaching line tap handler FIRST (before any returns)
    if (e.originalEvent) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopImmediatePropagation();
    }
    e.preventDefault();
    
    if (!isEditingCurve) return;
    if (e.originalEvent.touches.length > 0) return; // Still touching
    
    // Don't process tap if touch moved (was a drag)
    if (touchMoved) {
        touchMoved = false;
        return;
    }
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    const tapDelay = 300; // ms between taps to count as double-tap
    
    // Check if this is a double-tap on the same point
    const featureId = e.features[0]?.properties?.index;
    const isDoubleTap = timeSinceLastTap < tapDelay && lastTapTarget === featureId;
    
    console.log('Point tap:', featureId, 'isDoubleTap:', isDoubleTap, 'timeSince:', timeSinceLastTap);
    
    lastTapTime = now;
    lastTapTarget = featureId;
    
    if (isDoubleTap && featureId !== undefined) {
        console.log('MOBILE: Double-tap on point', featureId, '- DELETING');
        
        // Don't delete if we just finished dragging
        if (hasMovedDuringDrag) {
            hasMovedDuringDrag = false;
            return;
        }
        
        if (editPoints.length <= 2) return; // Need at least 2 points
        
        editPoints.splice(featureId, 1);
        updateCurveDisplay();
        
        // Set flag to prevent line tap from adding point back
        justDeletedPoint = true;
        setTimeout(() => { justDeletedPoint = false; }, 100);
        
        // Reset for next tap
        lastTapTime = 0;
        lastTapTarget = null;
    }
}

// Mobile: Double-tap on line to add new point
function onLineTouchTap(e) {
    // CRITICAL: Prevent zoom FIRST, before any logic or returns
    if (e.originalEvent) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopImmediatePropagation();
    }
    e.preventDefault();
    
    if (!isEditingCurve) return;
    if (e.originalEvent.touches.length > 0) return; // Still touching
    
    // CRITICAL: Don't process if we just handled a point tap (point layer fires before line layer)
    // If lastTapTarget is a number (point index), this tap is from the same touch event on the point
    if (typeof lastTapTarget === 'number') {
        console.log('Ignoring line tap - already handled by point tap');
        return;
    }
    
    // Don't add point if we just deleted one
    if (justDeletedPoint) {
        console.log('Ignoring line tap - just deleted a point');
        return;
    }
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    const tapDelay = 300; // ms between taps to count as double-tap
    
    const isDoubleTap = timeSinceLastTap < tapDelay && lastTapTarget === 'line';
    
    console.log('Line tap - isDoubleTap:', isDoubleTap, 'timeSince:', timeSinceLastTap);
    
    lastTapTime = now;
    lastTapTarget = 'line';
    
    if (isDoubleTap) {
        console.log('MOBILE: Double-tap on line - ADDING POINT');
        
        const clickCoords = [e.lngLat.lng, e.lngLat.lat];
        
        // Find the closest segment to insert the point
        let minDistance = Infinity;
        let insertIndex = 1;
        
        for (let i = 0; i < editPoints.length - 1; i++) {
            const segmentStart = editPoints[i];
            const segmentEnd = editPoints[i + 1];
            
            const midpoint = [
                (segmentStart[0] + segmentEnd[0]) / 2,
                (segmentStart[1] + segmentEnd[1]) / 2
            ];
            
            const distance = Math.sqrt(
                Math.pow(clickCoords[0] - midpoint[0], 2) +
                Math.pow(clickCoords[1] - midpoint[1], 2)
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                insertIndex = i + 1;
            }
        }
        
        // Insert the new point
        editPoints.splice(insertIndex, 0, clickCoords);
        updateCurveDisplay();
        
        // Reset for next tap
        lastTapTime = 0;
        lastTapTarget = null;
    }
}

// Double-click on line to add new point
function onLineDoubleClick(e) {
    if (e.originalEvent) {
        e.originalEvent.preventDefault();
        e.originalEvent.stopPropagation();
    }
    e.preventDefault();
    
    if (!isEditingCurve) return;
    
    // Don't add point if we just deleted one (prevents immediate re-add)
    if (justDeletedPoint) {
        console.log('Ignoring line dblclick - just deleted a point');
        return;
    }
    
    const clickCoords = [e.lngLat.lng, e.lngLat.lat];
    
    // Find the closest segment to insert the point
    let minDistance = Infinity;
    let insertIndex = 1;
    
    for (let i = 0; i < editPoints.length - 1; i++) {
        const segmentStart = editPoints[i];
        const segmentEnd = editPoints[i + 1];
        
        // Calculate distance from click point to segment midpoint
        const midpoint = [
            (segmentStart[0] + segmentEnd[0]) / 2,
            (segmentStart[1] + segmentEnd[1]) / 2
        ];
        
        const distance = Math.sqrt(
            Math.pow(clickCoords[0] - midpoint[0], 2) +
            Math.pow(clickCoords[1] - midpoint[1], 2)
        );
        
        if (distance < minDistance) {
            minDistance = distance;
            insertIndex = i + 1;
        }
    }
    
    // Insert the new point
    editPoints.splice(insertIndex, 0, clickCoords);
    updateCurveDisplay();
}

// Mouse down on point
function onPointMouseDown(e) {
    e.preventDefault();
    
    if (e.features.length > 0) {
        const pointIndex = e.features[0].properties.index;
        
        // Store which point is pressed, but don't activate drag mode yet
        // Drag will activate on first mousemove
        pendingDragIndex = pointIndex;
        dragStartPoints = editPoints.map(c => [...c]); // Save state for potential drag
        hasMovedDuringDrag = false; // Reset on every mousedown
    }
}

// Mouse move
function onPointMouseMove(e) {
    // If mouse is pressed on a point but drag not activated yet, activate it now
    if (pendingDragIndex !== null && draggedPointIndex === null) {
        draggedPointIndex = pendingDragIndex;
        pendingDragIndex = null;
        map.getCanvas().style.cursor = 'grabbing';
        map.dragPan.disable();
    }
    
    if (draggedPointIndex === null || !dragStartPoints) return;
    
    hasMovedDuringDrag = true; // Mark that we actually moved
    
    const newCoords = [e.lngLat.lng, e.lngLat.lat];
    
    // Calculate displacement from original position at drag start
    const oldCoords = dragStartPoints[draggedPointIndex];
    const dx = newCoords[0] - oldCoords[0];
    const dy = newCoords[1] - oldCoords[1];
    
    // Update the dragged point
    editPoints[draggedPointIndex] = newCoords;
    
    // Move adjacent points like a chain - each point moves based on its distance
    const moveRadius = 3; // How many points on each side to affect
    const isFirstPoint = draggedPointIndex === 0;
    const isLastPoint = draggedPointIndex === editPoints.length - 1;
    
    // Process points before (moving backwards)
    if (!isFirstPoint) {
        for (let offset = 1; offset <= moveRadius; offset++) {
            const idx = draggedPointIndex - offset;
            if (idx < 0) break;
            
            // Lock first point - it should never move unless directly dragged
            if (idx === 0) break;
            
            // Calculate influence: exponential falloff creates more natural chain effect
            const influence = Math.pow(0.5, offset); // 0.5, 0.25, 0.125...
            
            editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
            editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
        }
    }
    
    // Process points after (moving forwards)
    if (!isLastPoint) {
        for (let offset = 1; offset <= moveRadius; offset++) {
            const idx = draggedPointIndex + offset;
            if (idx >= editPoints.length) break;
            
            // Lock last point - it should never move unless directly dragged
            if (idx === editPoints.length - 1) break;
            
            // Calculate influence: exponential falloff
            const influence = Math.pow(0.5, offset);
            
            editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
            editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
        }
    }
    
    updateCurveDisplay();
}

// Mouse up
function onPointMouseUp() {
    // Clear pending drag if mouse released without moving
    if (pendingDragIndex !== null) {
        pendingDragIndex = null;
        dragStartPoints = null;
    }
    
    if (draggedPointIndex !== null) {
        draggedPointIndex = null;
        dragStartPoints = null;
        map.getCanvas().style.cursor = 'grab';
        map.dragPan.enable();
        // Note: hasMovedDuringDrag is kept until next mousedown or dblclick uses it
    }
}

// Touch start on point
function onPointTouchStart(e) {
    e.preventDefault();
    
    if (e.features.length > 0) {
        draggedPointIndex = e.features[0].properties.index;
        // Save original positions at drag start
        dragStartPoints = editPoints.map(c => [...c]);
        touchMoved = false; // Reset touch movement tracking
        map.dragPan.disable();
    }
}

// Touch move
function onPointTouchMove(e) {
    if (draggedPointIndex === null || !dragStartPoints) return;
    
    e.preventDefault();
    
    touchMoved = true; // Mark that touch moved (this is a drag, not a tap)
    
    const touch = e.originalEvent.touches[0];
    const point = map.unproject([touch.clientX, touch.clientY]);
    const newCoords = [point.lng, point.lat];
    
    // Calculate displacement from original position at drag start
    const oldCoords = dragStartPoints[draggedPointIndex];
    const dx = newCoords[0] - oldCoords[0];
    const dy = newCoords[1] - oldCoords[1];
    
    // Update the dragged point
    editPoints[draggedPointIndex] = newCoords;
    
    // Move adjacent points like a chain - each point moves based on its distance
    const moveRadius = 3; // How many points on each side to affect
    const isFirstPoint = draggedPointIndex === 0;
    const isLastPoint = draggedPointIndex === editPoints.length - 1;
    
    // Process points before (moving backwards)
    if (!isFirstPoint) {
        for (let offset = 1; offset <= moveRadius; offset++) {
            const idx = draggedPointIndex - offset;
            if (idx < 0) break;
            
            // Lock first point - it should never move unless directly dragged
            if (idx === 0) break;
            
            // Calculate influence: exponential falloff creates more natural chain effect
            const influence = Math.pow(0.5, offset);
            
            editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
            editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
        }
    }
    
    // Process points after (moving forwards)
    if (!isLastPoint) {
        for (let offset = 1; offset <= moveRadius; offset++) {
            const idx = draggedPointIndex + offset;
            if (idx >= editPoints.length) break;
            
            // Lock last point - it should never move unless directly dragged
            if (idx === editPoints.length - 1) break;
            
            // Calculate influence: exponential falloff
            const influence = Math.pow(0.5, offset);
            
            editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
            editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
        }
    }
    
    updateCurveDisplay();
}

// Touch end
function onPointTouchEnd() {
    if (draggedPointIndex !== null) {
        draggedPointIndex = null;
        dragStartPoints = null;
        map.dragPan.enable();
        // Don't reset touchMoved here - let the tap handler check it
    }
}

// Handle draw update
function handleDrawUpdate(e) {
    const feature = e.features[0];
    // Update stored feature coordinates
    const storedFeature = customRoutes.find(f => f.id === feature.id);
    if (storedFeature) {
        storedFeature.geometry = feature.geometry;
        saveRoutesToStorage();
        refreshCustomRoutes();
    }
}

// Handle draw delete
function handleDrawDelete(e) {
    e.features.forEach(feature => {
        customRoutes = customRoutes.filter(f => f.id !== feature.id);
    });
    saveRoutesToStorage();
    refreshCustomRoutes();
}

// Delete selected feature
function deleteSelectedFeature() {
    const selected = draw.getSelected();
    if (selected.features.length > 0) {
        draw.delete(selected.features.map(f => f.id));
    }
}

// Show properties panel
function showPropertiesPanel(feature) {
    const propertiesPanel = document.getElementById('properties-panel');
    const controlsPanel = document.getElementById('controls-panel');
    const showPropertiesBtn = document.getElementById('show-properties');
    
    propertiesPanel.style.display = 'block';
    propertiesPanel.classList.remove('collapsed');
    propertiesPanel.dataset.showTime = Date.now().toString();
    showPropertiesBtn.style.display = 'none';
    
    // Update position based on controls panel state
    const controlsCollapsed = controlsPanel.classList.contains('collapsed');
    if (controlsCollapsed) {
        propertiesPanel.classList.add('controls-hidden');
    } else {
        propertiesPanel.classList.remove('controls-hidden');
    };
    
    // Pre-fill if editing existing feature
    const stored = customRoutes.find(f => f.id === feature.id);
    if (stored) {
        document.getElementById('line-name').value = stored.properties.name || '';
        document.getElementById('line-color').value = stored.properties.stroke || stored.properties.fill || '#ff0000';
        document.getElementById('line-width').value = stored.properties['stroke-width'] || 6;
        document.getElementById('line-opacity').value = stored.properties['stroke-opacity'] || stored.properties['fill-opacity'] || 1;
        document.getElementById('description').value = stored.properties.description || '';
    }
}

// Save properties
function saveProperties() {
    const name = document.getElementById('line-name').value;
    const color = document.getElementById('line-color').value;
    const width = parseInt(document.getElementById('line-width').value);
    const opacity = parseFloat(document.getElementById('line-opacity').value);
    const description = document.getElementById('description').value;
    
    let geometry;
    
    // Use edited points if in curve editing mode
    let controlPoints = null;
    if (isEditingCurve && editPoints.length > 0) {
        controlPoints = editPoints.map(p => [...p]);
        const coords = curveMode ? smoothLineString(editPoints) : editPoints;
        geometry = {
            type: 'LineString',
            coordinates: coords
        };
        disableCurveEditing();
    } else {
        const drawnFeature = draw.get(currentFeatureId);
        if (!drawnFeature) {
            // If no drawn feature, we might be editing an existing route
            // Try to find it in customRoutes
            const existingFeature = customRoutes.find(f => f.id === currentFeatureId);
            if (existingFeature) {
                geometry = existingFeature.geometry;
            } else {
                console.error('No feature found to save');
                return;
            }
        } else {
            geometry = drawnFeature.geometry;
            
            // Apply curve smoothing if enabled for LineStrings
            if (curveMode && geometry.type === 'LineString') {
                controlPoints = geometry.coordinates.map(p => [...p]);
                geometry.coordinates = smoothLineString(geometry.coordinates);
            }
        }
    }
    
    const feature = {
        id: currentFeatureId,
        type: 'Feature',
        geometry: geometry,
        properties: {
            id: currentFeatureId,
            featureId: currentFeatureId,
            name: name,
            description: description,
            controlPoints: controlPoints
        }
    };
    
    // Add type-specific properties
    if (geometry.type === 'LineString') {
        feature.properties.stroke = color;
        feature.properties['stroke-width'] = width;
        feature.properties['stroke-opacity'] = opacity;
    } else if (geometry.type === 'Polygon') {
        feature.properties.fill = color;
        feature.properties['fill-opacity'] = opacity;
    }
    
    // Remove from draw layer if it exists
    if (draw.get(currentFeatureId)) {
        draw.delete(currentFeatureId);
    }
    
    // Add to custom routes
    const existingIndex = customRoutes.findIndex(f => f.id === currentFeatureId);
    if (existingIndex >= 0) {
        customRoutes[existingIndex] = feature;
    } else {
        customRoutes.push(feature);
    }
    
    saveRoutesToStorage();
    refreshCustomRoutes();
    
    // Hide properties panel
    cancelProperties();
}

// Cancel properties
function cancelProperties() {
    const propertiesPanel = document.getElementById('properties-panel');
    const showPropertiesBtn = document.getElementById('show-properties');
    
    propertiesPanel.style.display = 'none';
    propertiesPanel.classList.remove('collapsed');
    showPropertiesBtn.style.display = 'none';
    
    // Disable curve editing if active
    if (isEditingCurve) {
        disableCurveEditing();
    }
    
    // Remove drawn feature if not saved
    if (currentFeatureId) {
        draw.delete(currentFeatureId);
    }
    
    currentFeatureId = null;
    editPoints = [];
    
    // Reset form
    document.getElementById('line-name').value = '';
    document.getElementById('line-color').value = '#ff0000';
    document.getElementById('line-width').value = 6;
    document.getElementById('line-opacity').value = 1;
    document.getElementById('description').value = '';
}

// Refresh custom routes on map
function refreshCustomRoutes() {
    if (!map.getSource('custom-routes')) return;
    
    map.getSource('custom-routes').setData({
        type: 'FeatureCollection',
        features: customRoutes
    });
}

// Save routes to localStorage
function saveRoutesToStorage() {
    localStorage.setItem('customRoutes', JSON.stringify(customRoutes));
}

// Load routes from localStorage
function loadStoredRoutes() {
    const stored = localStorage.getItem('customRoutes');
    if (stored) {
        customRoutes = JSON.parse(stored);
    }
}

// Export GeoJSON
function exportGeoJSON() {
    const geojson = {
        type: 'FeatureCollection',
        features: customRoutes
    };
    
    const blob = new Blob([JSON.stringify(geojson, null, 2)], {
        type: 'application/json'
    });
    
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metro-routes-${Date.now()}.geojson`;
    a.click();
    URL.revokeObjectURL(url);
}

// Handle import
function handleImport(e) {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const geojson = JSON.parse(e.target.result);
            
            if (geojson.type === 'FeatureCollection') {
                // Add IDs if missing
                geojson.features.forEach((feature, index) => {
                    if (!feature.id) {
                        feature.id = `imported-${Date.now()}-${index}`;
                    }
                });
                
                customRoutes = [...customRoutes, ...geojson.features];
                saveRoutesToStorage();
                refreshCustomRoutes();
                
                alert(`Imported ${geojson.features.length} features successfully!`);
            } else {
                alert('Invalid GeoJSON format. Expected a FeatureCollection.');
            }
        } catch (error) {
            alert('Error parsing GeoJSON file: ' + error.message);
        }
    };
    reader.readAsText(file);
    
    // Reset file input
    e.target.value = '';
}

// Clear all routes
function clearAllRoutes() {
    if (confirm('Are you sure you want to delete ALL routes? This cannot be undone!')) {
        customRoutes = [];
        localStorage.removeItem('customRoutes');
        refreshCustomRoutes();
        alert('All routes cleared successfully!');
    }
}

// Toggle controls panel
function toggleControlsPanel() {
    const controlsPanel = document.querySelector('.controls-panel');
    const propertiesPanel = document.getElementById('properties-panel');
    const showButton = document.getElementById('show-panel');
    const showPropertiesBtn = document.getElementById('show-properties');
    
    controlsPanel.classList.toggle('collapsed');
    const isCollapsed = controlsPanel.classList.contains('collapsed');
    
    showButton.style.display = isCollapsed ? 'block' : 'none';
    
    // Update properties panel and button position based on controls panel state
    const propertiesVisible = propertiesPanel.style.display === 'block';
    const propertiesCollapsed = propertiesPanel.classList.contains('collapsed');
    
    if (isCollapsed) {
        propertiesPanel.classList.add('controls-hidden');
        showPropertiesBtn.classList.add('controls-hidden');
        showPropertiesBtn.classList.remove('controls-visible');
        // Reset inline styles
        showPropertiesBtn.style.top = '';
        propertiesPanel.style.top = '';
    } else {
        propertiesPanel.classList.remove('controls-hidden');
        showPropertiesBtn.classList.remove('controls-hidden');
        showPropertiesBtn.classList.add('controls-visible');
        
        // Calculate actual position based on controls panel height
        const controlsHeight = controlsPanel.offsetHeight;
        const controlsTop = parseInt(getComputedStyle(controlsPanel).top) || 10;
        const newTop = controlsTop + controlsHeight + 10; // 10px gap
        
        showPropertiesBtn.style.top = `${newTop}px`;
        propertiesPanel.style.top = `${newTop}px`;
    }
    
    // Force visibility of properties button if it should be shown
    if (!propertiesCollapsed && propertiesVisible && showPropertiesBtn.style.display === 'none') {
        // Properties panel is open, don't show the button
    } else if (propertiesCollapsed && propertiesVisible) {
        // Properties panel exists but is collapsed, show the button
        showPropertiesBtn.style.display = 'flex';
    }
}

// Toggle properties panel
function togglePropertiesPanel() {
    const panel = document.getElementById('properties-panel');
    const showPropertiesBtn = document.getElementById('show-properties');
    const controlsPanel = document.getElementById('controls-panel');
    
    panel.classList.toggle('collapsed');
    const isCollapsed = panel.classList.contains('collapsed');
    
    showPropertiesBtn.style.display = isCollapsed ? 'block' : 'none';
    
    // Update position based on controls panel state
    const controlsCollapsed = controlsPanel.classList.contains('collapsed');
    if (controlsCollapsed) {
        showPropertiesBtn.classList.add('controls-hidden');
        showPropertiesBtn.classList.remove('controls-visible');
    } else {
        showPropertiesBtn.classList.remove('controls-hidden');
        showPropertiesBtn.classList.add('controls-visible');
    }
}

// Hide loading indicator
function hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
}
