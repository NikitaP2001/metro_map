// Metro Map Application
// MapLibre GL + PMTiles Implementation

// Global variables
let map;
let draw;
let editMode = false;
let currentFeatureId = null;
let customRoutes = [];
let curveMode = true;
let isEditingCurve = false;
let editPoints = [];
let fixedPoints = new Set(); // Track fixed point indices (e.g., 0, 1, "branch-0-2")
let pointHoldTimer = null; // Timer for detecting hold gesture
let pointHoldTarget = null; // Target point for hold gesture
let draggedPointIndex = null;
let draggedPointType = null; // 'main' or 'branch'
let dragStartPoints = null;
let dragStartBranches = null; // Save branch state for dragging
let hasMovedDuringDrag = false; // Track if point actually moved during drag
let pendingDragIndex = null; // Index of point with mouse pressed (not dragging yet)
let pendingDragType = null; // Type of pending drag point
let justDeletedPoint = false; // Prevent line dblclick from firing right after point delete
let lastTapTime = 0; // For detecting double-tap on mobile
let lastTapTarget = null; // Track what was tapped
let touchMoved = false; // Track if touch moved (drag vs tap)
let tempLayerId = 'temp-edit-layer';
let tempPointsLayerId = 'temp-edit-points';
let currentPopup = null; // Track the current popup to close it when opening a new one

// Initialize window-level branch variables
window.drawingBranch = false;
window.branchStartConnected = false;
window.branchConnectionPoint = null;
window.branchConnectionIndex = null;
window.currentRouteBranches = [];

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
    // Try to load saved map position from localStorage
    const savedCenter = localStorage.getItem('mapCenter');
    const savedZoom = localStorage.getItem('mapZoom');
    
    const center = savedCenter ? JSON.parse(savedCenter) : [30.5234, 50.4501]; // Default: Kyiv, Ukraine
    const zoom = savedZoom ? parseFloat(savedZoom) : 12;

    // Initialize map with OpenStreetMap raster tiles (no PMTiles needed for now)
    map = new maplibregl.Map({
        container: 'map',
        style: getMapStyle(),
        center: center,
        zoom: zoom,
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
    
    // Save map position on move
    map.on('moveend', () => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        localStorage.setItem('mapCenter', JSON.stringify([center.lng, center.lat]));
        localStorage.setItem('mapZoom', zoom.toString());
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
        
        // Prevent double-click zoom when in curve editing mode (desktop)
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
        alert('Error: Could not identify this route. Please try again.');
        return;
    }

    
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
    html += `<button onclick="window.editExistingRoute('${featureId}')" style="flex: 1; padding: 5px 10px; background: #3498db; color: white; border: none; border-radius: 4px; cursor: pointer;">Править</button>`;
    html += `<button onclick="window.deleteExistingRoute('${featureId}')" style="flex: 1; padding: 5px 10px; background: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer;">Удалить</button>`;
    html += '</div>';
    
    // Close existing popup if any
    if (currentPopup) {
        currentPopup.remove();
        currentPopup = null;
    }
    
    // Remove any existing outside-click listeners
    if (window.closePopupOnOutsideClick) {
        document.removeEventListener('mousedown', window.closePopupOnOutsideClick, true);
        document.removeEventListener('touchstart', window.closePopupOnOutsideClick, true);
        delete window.closePopupOnOutsideClick;
    }
    
    // Create and track new popup
    currentPopup = new maplibregl.Popup({
        closeOnClick: false, // We'll handle closing manually
        closeButton: false // Remove close button since we auto-close on outside click
    })
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
    
    // Clear reference when popup is closed
    currentPopup.on('close', () => {
        currentPopup = null;
        // Remove event listeners if they exist
        if (window.closePopupOnOutsideClick) {
            document.removeEventListener('mousedown', window.closePopupOnOutsideClick, true);
            document.removeEventListener('touchstart', window.closePopupOnOutsideClick, true);
            delete window.closePopupOnOutsideClick;
        }
        // Remove map event listeners
        map.off('movestart', window.closePopupOnMapInteraction);
        map.off('zoomstart', window.closePopupOnMapInteraction);
        map.off('dblclick', window.closePopupOnMapInteraction);
    });
    
    // Close popup on map interactions (drag, zoom, double-click)
    window.closePopupOnMapInteraction = () => {
        if (currentPopup) {
            currentPopup.remove();
            currentPopup = null;
        }
    };
    
    map.on('movestart', window.closePopupOnMapInteraction);
    map.on('zoomstart', window.closePopupOnMapInteraction);
    map.on('dblclick', window.closePopupOnMapInteraction);
    
    // Close popup on any click/touch outside of it
    // Use next animation frame to ensure popup is fully rendered
    requestAnimationFrame(() => {
        if (!currentPopup) return; // Popup was already closed
        
        window.closePopupOnOutsideClick = (event) => {
            if (!currentPopup) {
                document.removeEventListener('mousedown', window.closePopupOnOutsideClick, true);
                document.removeEventListener('touchstart', window.closePopupOnOutsideClick, true);
                delete window.closePopupOnOutsideClick;
                return;
            }
            
            const popupElement = document.querySelector('.maplibregl-popup');
            
            // Close if click is outside the popup content
            if (popupElement && !popupElement.contains(event.target)) {
                currentPopup.remove();
                currentPopup = null;
            }
        };
        
        // Use capture phase and mousedown instead of click to catch events earlier
        document.addEventListener('mousedown', window.closePopupOnOutsideClick, true);
        document.addEventListener('touchstart', window.closePopupOnOutsideClick, true);
    });
}

// Toggle curve mode
function toggleCurveMode() {
    curveMode = !curveMode;
    const curveModeText = document.getElementById('curve-mode-text');
    const curveIndicator = document.getElementById('curve-indicator');
    
    if (curveMode) {
        curveModeText.textContent = 'Сглаживание: ВКЛ';
        curveIndicator.style.display = 'inline';
    } else {
        curveModeText.textContent = 'Сглаживание: ВЫКЛ';
        curveIndicator.style.display = 'none';
    }
}

// Edit existing route (called from popup)
window.editExistingRoute = function(featureId) {
    
    // Close all popups
    const popups = document.getElementsByClassName('maplibregl-popup');
    while(popups[0]) {
        popups[0].remove();
    }
    
    // Find the feature in customRoutes
    const feature = customRoutes.find(f => f.id === featureId);
    if (!feature) {
        console.error('Feature not found:', featureId);
        alert('Error: Could not find this route. Please try again.');
        return;
    }

    
    // Set current feature ID and store original ID for tracking
    currentFeatureId = featureId;
    window.originalFeatureId = featureId; // Track the original ID to ensure we update the right route
    
    // Temporarily remove this feature from display while editing
    const filteredRoutes = customRoutes.filter(f => f.id !== featureId);
    if (map.getSource('custom-routes')) {
        const displayFeatures = filteredRoutes.map(feature => {
            if (feature.geometry.type === 'LineString' && 
                feature.properties.branches && 
                feature.properties.branches.length > 0) {
                
                // Create MultiLineString with main line and all branches
                const lines = [feature.geometry.coordinates];
                const controlPoints = feature.properties.controlPoints || feature.geometry.coordinates;
                const hasCurveSmoothing = feature.properties.controlPoints && 
                                         feature.properties.controlPoints.length > 0;
                
                for (const branch of feature.properties.branches) {
                    let connectionPoint = null;
                    
                    if (typeof branch.connectionIndex === 'number') {
                        if (branch.connectionIndex < controlPoints.length) {
                            connectionPoint = controlPoints[branch.connectionIndex];
                        }
                    } else if (typeof branch.connectionIndex === 'string' && branch.connectionIndex.startsWith('branch-')) {
                        const match = branch.connectionIndex.match(/branch-(\d+)-(\d+)/);
                        if (match && feature.properties.branches) {
                            const branchIdx = parseInt(match[1]);
                            const pointIdx = parseInt(match[2]);
                            if (branchIdx < feature.properties.branches.length) {
                                const targetBranch = feature.properties.branches[branchIdx];
                                if (pointIdx < targetBranch.points.length) {
                                    connectionPoint = targetBranch.points[pointIdx];
                                }
                            }
                        }
                    }
                    
                    if (connectionPoint) {
                        const branchControlPoints = [connectionPoint, ...branch.points];
                        const branchLine = hasCurveSmoothing ? 
                            smoothLineString(branchControlPoints) : 
                            branchControlPoints;
                        lines.push(branchLine);
                    }
                }
                
                return {
                    ...feature,
                    geometry: {
                        type: 'MultiLineString',
                        coordinates: lines
                    }
                };
            }
            return feature;
        });
        
        map.getSource('custom-routes').setData({
            type: 'FeatureCollection',
            features: displayFeatures
        });
    }
    
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
        
        // Load branch information if it exists
        if (feature.properties.branches && feature.properties.branches.length > 0) {
            window.currentRouteBranches = feature.properties.branches.map(b => ({
                connectionIndex: b.connectionIndex,
                points: b.points.map(p => [...p])
            }));

        } else {
            window.currentRouteBranches = [];
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
        

        
        // Save to localStorage
        saveRoutesToStorage();
        
        // Refresh map display
        refreshCustomRoutes();
        
        if (beforeLength > afterLength) {

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
        editModeText.textContent = 'Отключить режим редактирования';
        editControls.style.display = 'block';
        
        // Listen to draw events
        map.on('draw.create', handleDrawCreate);
        map.on('draw.update', handleDrawUpdate);
        map.on('draw.delete', handleDrawDelete);
        map.on('draw.render', handleDrawRender);
    } else {
        map.removeControl(draw);
        editModeText.textContent = 'Включить режим редактирования';
        editControls.style.display = 'none';
        
        // Remove draw event listeners
        map.off('draw.create', handleDrawCreate);
        map.off('draw.update', handleDrawUpdate);
        map.off('draw.delete', handleDrawDelete);
        map.off('draw.render', handleDrawRender);
    }
}

// Start drawing
function startDrawing(type) {
    if (type === 'LineString') {
        // If we're in curve editing mode, we'll connect new lines to the existing route
        if (isEditingCurve && editPoints.length > 0) {
            // Store flag that we're drawing a branch
            window.drawingBranch = true;
            window.branchStartConnected = false;
            window.hasSeenFirstCoord = false;
            
            // IMPORTANT: Remove line double-click handlers while drawing branch
            // This prevents interference with MapboxDraw's point adding
            map.off('dblclick', tempLayerId + '-hitarea', onLineDoubleClick);
            map.off('touchend', tempLayerId + '-hitarea', onLineTouchTap);
        }
        
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
    
    // Clear branch preview
    if (map.getSource('branch-preview')) {
        map.getSource('branch-preview').setData({
            type: 'FeatureCollection',
            features: []
        });
    }
    
    // Reset branch drawing flag
    const wasBranchDrawing = window.drawingBranch;
    const connectionIndex = window.branchConnectionIndex;
    window.drawingBranch = false;
    window.branchStartConnected = false;
    window.branchConnectionPoint = null;
    window.branchConnectionIndex = null;
    window.hasSeenFirstCoord = false;
    
    // Restore line handlers if we were drawing a branch
    if (wasBranchDrawing && isEditingCurve) {
        map.on('dblclick', tempLayerId + '-hitarea', onLineDoubleClick);
        map.on('touchend', tempLayerId + '-hitarea', onLineTouchTap);
    }
    
    // For LineStrings, enable interactive curve editing
    if (feature.geometry.type === 'LineString') {
        let newPoints = feature.geometry.coordinates.map(c => [...c]);
        
        // If we were drawing a branch (already editing a line)
        if (wasBranchDrawing && isEditingCurve && editPoints.length > 0 && connectionIndex !== null) {
            
            // The first point is the connection point, we should exclude it from branch points
            // since it's already represented by connectionIndex
            const branchPoints = newPoints.slice(1); // Skip first point (it's the connection)
            
            // Only store the branch if it has at least one point (not just the connection)
            if (branchPoints.length > 0) {
                // Store branch information
                if (!window.currentRouteBranches) {
                    window.currentRouteBranches = [];
                }
                
                window.currentRouteBranches.push({
                    connectionIndex: connectionIndex,
                    points: branchPoints
                });
            }
            
            // Remove the drawn feature since we've merged it into the branch
            draw.delete(feature.id);
            
            // Update the display with the new branch
            updateCurveDisplay();
            
            // Stay in editing mode - don't show properties panel
            return;
        }
        
        // Normal flow: Store original control points
        editPoints = newPoints;
        
        // Clear any existing branches when starting a new route
        window.currentRouteBranches = [];
        
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

// Handle draw render (called during drawing process)
function handleDrawRender(e) {
    // If we're drawing a branch and haven't connected the start yet
    if (window.drawingBranch && isEditingCurve && editPoints.length > 0) {
        const features = draw.getAll();
        
        // Find the feature being drawn
        const drawingFeature = features.features.find(f => 
            f.geometry && f.geometry.type === 'LineString' && 
            f.geometry.coordinates && f.geometry.coordinates.length > 0
        );
        
        if (drawingFeature) {
            const coords = drawingFeature.geometry.coordinates;
            
            // Track if we've seen a coordinate yet (to detect transition from 0->1)
            if (!window.hasSeenFirstCoord) {
                window.hasSeenFirstCoord = false;
            }
            
            // Only snap when we have at least 2 points (user has clicked to place second point)
            // This ensures the first point is actually placed, not just hovering
            if (coords.length >= 2 && !window.branchStartConnected) {
                const firstPoint = coords[0];
                
                // Collect all points: main line + all branch points
                let allPoints = [...editPoints];
                let pointInfo = editPoints.map((pt, i) => ({ type: 'main', index: i, point: pt }));
                
                if (window.currentRouteBranches) {
                    window.currentRouteBranches.forEach((branch, branchIdx) => {
                        branch.points.forEach((pt, ptIdx) => {
                            allPoints.push(pt);
                            pointInfo.push({ type: 'branch', branchIndex: branchIdx, pointIndex: ptIdx, point: pt });
                        });
                    });
                }
                
                // Find nearest point among ALL points
                let minDistance = Infinity;
                let nearestInfo = null;
                
                for (let i = 0; i < allPoints.length; i++) {
                    const dist = getGeographicDistance(firstPoint, allPoints[i]);
                    
                    if (dist < minDistance) {
                        minDistance = dist;
                        nearestInfo = pointInfo[i];
                    }
                }
                
                // Always snap to nearest point (no distance limit)
                if (nearestInfo) {
                    
                    // Store the connection info IMMEDIATELY
                    window.branchConnectionPoint = [...nearestInfo.point];
                    
                    // Store connection as branch reference if it's a branch point
                    if (nearestInfo.type === 'branch') {
                        // Connection is to a branch - store as special reference
                        window.branchConnectionIndex = 'branch-' + nearestInfo.branchIndex + '-' + nearestInfo.pointIndex;
                    } else {
                        // Connection is to main line
                        window.branchConnectionIndex = nearestInfo.index;
                    }
                    
                    window.branchStartConnected = true;
                    
                    // Update the first point to snap to the connection point
                    drawingFeature.geometry.coordinates[0] = nearestInfo.point;
                    
                    // Update the feature in draw ONCE
                    draw.add(drawingFeature);
                }
            } else if (coords.length > 1 && window.branchStartConnected) {
                // Show preview of the branch with smoothing
                // Use ALL coordinates from the drawing (they already start with the snapped connection point)
                const branchCoords = coords;
                
                // Add temporary preview line to show the connection
                if (map.getSource('branch-preview')) {
                    const previewCoords = curveMode ? smoothLineString(branchCoords) : branchCoords;
                    
                    map.getSource('branch-preview').setData({
                        type: 'Feature',
                        geometry: {
                            type: 'LineString',
                            coordinates: previewCoords
                        }
                    });
                } else {
                    // Create preview source and layer
                    map.addSource('branch-preview', {
                        type: 'geojson',
                        data: {
                            type: 'Feature',
                            geometry: {
                                type: 'LineString',
                                coordinates: curveMode ? smoothLineString(branchCoords) : branchCoords
                            }
                        }
                    });
                    
                    map.addLayer({
                        id: 'branch-preview',
                        type: 'line',
                        source: 'branch-preview',
                        paint: {
                            'line-color': '#3498db',
                            'line-width': 4,
                            'line-opacity': 0.6,
                            'line-dasharray': [2, 2]
                        }
                    });
                }
            }
        }
    } else {
        // Clear preview when not drawing branch
        if (map.getSource('branch-preview')) {
            map.getSource('branch-preview').setData({
                type: 'FeatureCollection',
                features: []
            });
        }
    }
}

// Calculate geographic distance between two points using Haversine formula
function getGeographicDistance(point1, point2) {
    const R = 6371000; // Earth's radius in meters
    const lat1 = point1[1] * Math.PI / 180;
    const lat2 = point2[1] * Math.PI / 180;
    const deltaLat = (point2[1] - point1[1]) * Math.PI / 180;
    const deltaLng = (point2[0] - point1[0]) * Math.PI / 180;
    
    const a = Math.sin(deltaLat/2) * Math.sin(deltaLat/2) +
              Math.cos(lat1) * Math.cos(lat2) *
              Math.sin(deltaLng/2) * Math.sin(deltaLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c; // Distance in meters
}

// Find nearest point on a line to a given point
function findNearestPointOnLine(point, linePoints) {
    let minDistance = Infinity;
    let nearestPoint = null;
    let insertIndex = -1;
    
    // Simply check distance to each control point using geographic distance
    for (let i = 0; i < linePoints.length; i++) {
        const dist = getGeographicDistance(point, linePoints[i]);
        
        if (dist < minDistance) {
            minDistance = dist;
            nearestPoint = [...linePoints[i]];
            insertIndex = i;
        }
    }
    
    return {
        point: nearestPoint,
        distance: minDistance,
        insertIndex: insertIndex
    };
}

// Enable interactive curve editing
function enableCurveEditing() {
    if (isEditingCurve) return;
    isEditingCurve = true;
    
    // Initialize branches array if not already set
    if (!window.currentRouteBranches) {
        window.currentRouteBranches = [];
    }
    
    // Disable MapLibre's double-click and double-tap zoom
    map.doubleClickZoom.disable();
    
    // Add global touch handler to prevent double-tap zoom
    const canvas = map.getCanvas();
    let lastCanvasTouchTime = 0;
    
    window.preventDoubleTapZoom = function(e) {
        const now = Date.now();
        const timeSinceLastTouch = now - lastCanvasTouchTime;
        
        if (timeSinceLastTouch < 300 && e.touches.length === 1) {
            // This is a double-tap, prevent it
            e.preventDefault();
            e.stopPropagation();
            return false;
        }
        
        lastCanvasTouchTime = now;
    };
    
    canvas.addEventListener('touchstart', window.preventDoubleTapZoom, { passive: false });
    
    // Hide the draw feature temporarily
    if (draw.get(currentFeatureId)) {
        draw.delete(currentFeatureId);
    }
    
    // Add temporary layers for editing
    if (!map.getSource(tempLayerId)) {
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
                'circle-stroke-color': [
                    'case',
                    ['==', ['get', 'isFixed'], 1],
                    '#000000',  // Black outline for fixed points
                    '#3498db'   // Blue outline for normal points
                ],
                'circle-stroke-width': [
                    'case',
                    ['==', ['get', 'isFixed'], 1],
                    4,  // Thicker stroke for fixed points
                    3   // Normal stroke
                ]
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
    
    // Re-enable MapLibre's zoom gestures
    map.doubleClickZoom.enable();
    
    // Remove global touch handler
    const canvas = map.getCanvas();
    if (window.preventDoubleTapZoom) {
        canvas.removeEventListener('touchstart', window.preventDoubleTapZoom);
        delete window.preventDoubleTapZoom;
    }
}

// Update curve display
function updateCurveDisplay() {
    // Prepare main line coordinates
    const lineCoords = curveMode ? smoothLineString(editPoints) : editPoints;
    
    // Create features array with main line
    const lineFeatures = [{
        type: 'Feature',
        geometry: {
            type: 'LineString',
            coordinates: lineCoords
        }
    }];
    
    // Add branch lines if they exist
    if (window.currentRouteBranches && window.currentRouteBranches.length > 0) {
        for (const branch of window.currentRouteBranches) {
            let connectionPoint = null;
            
            // Check if connection is to main line (number) or another branch (string)
            if (typeof branch.connectionIndex === 'number') {
                // Connection to main line
                if (branch.connectionIndex < editPoints.length) {
                    connectionPoint = editPoints[branch.connectionIndex];
                }
            } else if (typeof branch.connectionIndex === 'string' && branch.connectionIndex.startsWith('branch-')) {
                // Connection to another branch - parse the string
                const match = branch.connectionIndex.match(/branch-(\d+)-(\d+)/);
                if (match && window.currentRouteBranches) {
                    const branchIdx = parseInt(match[1]);
                    const pointIdx = parseInt(match[2]);
                    if (branchIdx < window.currentRouteBranches.length) {
                        const targetBranch = window.currentRouteBranches[branchIdx];
                        if (pointIdx < targetBranch.points.length) {
                            connectionPoint = targetBranch.points[pointIdx];
                        }
                    }
                }
            }
            
            if (connectionPoint) {
                const branchCoords = [connectionPoint, ...branch.points];
                const smoothedBranchCoords = curveMode ? smoothLineString(branchCoords) : branchCoords;
                
                lineFeatures.push({
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: smoothedBranchCoords
                    }
                });
            }
        }
    }
    
    // Update line layer with main line and branches
    map.getSource(tempLayerId).setData({
        type: 'FeatureCollection',
        features: lineFeatures
    });
    
    // Collect all control points (main line + branches)
    const pointFeatures = editPoints.map((coord, index) => ({
        type: 'Feature',
        properties: { 
            index, 
            type: 'main',
            isFixed: fixedPoints.has(index) ? 1 : 0  // Add fixed state
        },
        geometry: {
            type: 'Point',
            coordinates: coord
        }
    }));
    
    // Add branch control points
    if (window.currentRouteBranches && window.currentRouteBranches.length > 0) {
        for (let branchIdx = 0; branchIdx < window.currentRouteBranches.length; branchIdx++) {
            const branch = window.currentRouteBranches[branchIdx];
            for (let i = 0; i < branch.points.length; i++) {
                const pointId = `branch-${branchIdx}-${i}`;
                pointFeatures.push({
                    type: 'Feature',
                    properties: { 
                        index: pointId,
                        type: 'branch',
                        branchIndex: branchIdx,
                        pointIndex: i,
                        isFixed: fixedPoints.has(pointId) ? 1 : 0  // Add fixed state
                    },
                    geometry: {
                        type: 'Point',
                        coordinates: branch.points[i]
                    }
                });
            }
        }
    }
    
    map.getSource(tempPointsLayerId).setData({
        type: 'FeatureCollection',
        features: pointFeatures
    });
}

// Double-click on point to remove it
function onPointDoubleClick(e) {
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
    
    const pointData = e.features[0].properties;
    const pointType = pointData.type;
    const pointIndex = pointData.index;
    
    // Handle branch point deletion
    if (pointType === 'branch') {
        const branchIdx = pointData.branchIndex;
        const branchPointIdx = pointData.pointIndex;
        
        if (window.currentRouteBranches[branchIdx].points.length <= 1) {
            // Delete entire branch if only one point left
            window.currentRouteBranches.splice(branchIdx, 1);
            
            // Remove all fixed points for this branch
            const updatedFixedPoints = new Set();
            fixedPoints.forEach(pointId => {
                if (typeof pointId === 'string' && !pointId.startsWith(`branch-${branchIdx}-`)) {
                    // Keep fixed points not belonging to this branch
                    updatedFixedPoints.add(pointId);
                } else if (typeof pointId === 'number') {
                    // Keep main line fixed points
                    updatedFixedPoints.add(pointId);
                }
            });
            fixedPoints = updatedFixedPoints;
        } else {
            // Delete just this point from the branch
            window.currentRouteBranches[branchIdx].points.splice(branchPointIdx, 1);
            
            // Update fixed point indices for this branch
            const updatedFixedPoints = new Set();
            fixedPoints.forEach(pointId => {
                if (typeof pointId === 'string' && pointId.startsWith(`branch-${branchIdx}-`)) {
                    const idx = parseInt(pointId.split('-')[2]);
                    if (idx === branchPointIdx) {
                        // Don't add - this fixed point was deleted
                    } else if (idx > branchPointIdx) {
                        // Decrement indices after the deleted point
                        updatedFixedPoints.add(`branch-${branchIdx}-${idx - 1}`);
                    } else {
                        // Keep indices before the deleted point
                        updatedFixedPoints.add(pointId);
                    }
                } else {
                    // Keep all other fixed points
                    updatedFixedPoints.add(pointId);
                }
            });
            fixedPoints = updatedFixedPoints;
        }
    } else {
        // Handle main line point deletion
        if (editPoints.length <= 2) return; // Need at least 2 points for a line
        
        const deleteIndex = typeof pointIndex === 'number' ? pointIndex : parseInt(pointIndex);
        editPoints.splice(deleteIndex, 1);
        
        // Update fixed point indices after deletion
        const updatedFixedPoints = new Set();
        fixedPoints.forEach(pointId => {
            if (typeof pointId === 'number') {
                if (pointId === deleteIndex) {
                    // Don't add - this fixed point was deleted
                } else if (pointId > deleteIndex) {
                    // Decrement indices after the deleted point
                    updatedFixedPoints.add(pointId - 1);
                } else {
                    // Keep indices before the deleted point
                    updatedFixedPoints.add(pointId);
                }
            } else {
                // Branch fixed points are unaffected
                updatedFixedPoints.add(pointId);
            }
        });
        fixedPoints = updatedFixedPoints;
        
        // Update connection indices in all branches
        if (window.currentRouteBranches) {
            window.currentRouteBranches.forEach(branch => {
                if (branch.connectionIndex > deleteIndex) {
                    branch.connectionIndex--;
                } else if (branch.connectionIndex === deleteIndex) {
                    // Connection point was deleted - remove the branch
                    console.warn('Connection point deleted - removing branch');
                    branch.connectionIndex = -1; // Mark for removal
                }
            });
            
            // Remove branches marked for deletion
            window.currentRouteBranches = window.currentRouteBranches.filter(b => b.connectionIndex >= 0);
        }
    }
    
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
    
    lastTapTime = now;
    lastTapTarget = featureId;
    
    if (isDoubleTap && featureId !== undefined) {
    
    const isDoubleTap = timeSinceLastTap < tapDelay && lastTapTarget === featureId;
        
        // Don't delete if we just finished dragging
        if (hasMovedDuringDrag) {
            hasMovedDuringDrag = false;
            return;
        }
        
        const pointData = e.features[0]?.properties;
        const pointType = pointData?.type;
        const pointIndex = pointData?.index;
        
        // Handle branch point deletion
        if (pointType === 'branch') {
            const branchIdx = pointData.branchIndex;
            const branchPointIdx = pointData.pointIndex;
            
            if (window.currentRouteBranches[branchIdx].points.length <= 1) {
                // Delete entire branch if only one point left
                window.currentRouteBranches.splice(branchIdx, 1);
            } else {
                // Delete just this point from the branch
                window.currentRouteBranches[branchIdx].points.splice(branchPointIdx, 1);
            }
        } else {
            // Handle main line point deletion
            if (editPoints.length <= 2) return; // Need at least 2 points
            
            const deleteIndex = typeof featureId === 'number' ? featureId : parseInt(featureId);
            editPoints.splice(deleteIndex, 1);
            
            // Update connection indices in all branches
            if (window.currentRouteBranches) {
                window.currentRouteBranches.forEach(branch => {
                    if (branch.connectionIndex > deleteIndex) {
                        branch.connectionIndex--;
                    } else if (branch.connectionIndex === deleteIndex) {
                        // Connection point was deleted - remove the branch
                        console.warn('Connection point deleted - removing branch');
                        branch.connectionIndex = -1; // Mark for removal
                    }
                });
                
                // Remove branches marked for deletion
                window.currentRouteBranches = window.currentRouteBranches.filter(b => b.connectionIndex >= 0);
            }
        }
        
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
    
    // Don't process if we're currently drawing a branch
    if (window.drawingBranch) {
        return;
    }
    
    if (!isEditingCurve) return;
    if (e.originalEvent.touches.length > 0) return; // Still touching
    
    const now = Date.now();
    const timeSinceLastTap = now - lastTapTime;
    const tapDelay = 300; // ms between taps to count as double-tap
    
    // CRITICAL: Don't process if we just handled a point tap (point layer fires before line layer)
    // If lastTapTarget is a point (number or string like "branch-0-1"), this tap is from the same touch event
    // BUT only ignore if it's within the same event cycle (very recent, < 50ms)
    if (lastTapTarget !== null && lastTapTarget !== 'line' && timeSinceLastTap < 50) {
        return;
    }
    
    // Don't add point if we just deleted one
    if (justDeletedPoint) {
        return;
    }
    
    const isDoubleTap = timeSinceLastTap < tapDelay && lastTapTarget === 'line';
    
    lastTapTime = now;
    lastTapTarget = 'line';
    
    if (isDoubleTap) {
        const clickCoords = [e.lngLat.lng, e.lngLat.lat];
        
        // Check if we clicked on a branch segment or main line
        let clickedBranch = null;
        let minBranchDistance = Infinity;
        let branchInsertIndex = -1;
        
        // Check each branch
        if (window.currentRouteBranches) {
            window.currentRouteBranches.forEach((branch, branchIdx) => {
                if (branch.points.length < 1) return;
                
                // Check the connection segment (from connection point to first branch point)
                let connectionPoint = null;
                if (typeof branch.connectionIndex === 'number') {
                    connectionPoint = editPoints[branch.connectionIndex];
                } else if (typeof branch.connectionIndex === 'string' && branch.connectionIndex.startsWith('branch-')) {
                    const match = branch.connectionIndex.match(/branch-(\d+)-(\d+)/);
                    if (match) {
                        const targetBranchIdx = parseInt(match[1]);
                        const targetPointIdx = parseInt(match[2]);
                        if (window.currentRouteBranches[targetBranchIdx]) {
                            connectionPoint = window.currentRouteBranches[targetBranchIdx].points[targetPointIdx];
                        }
                    }
                }
                
                if (connectionPoint) {
                    // Check segment from connection point to first branch point
                    const segmentStart = connectionPoint;
                    const segmentEnd = branch.points[0];
                    
                    const midpoint = [
                        (segmentStart[0] + segmentEnd[0]) / 2,
                        (segmentStart[1] + segmentEnd[1]) / 2
                    ];
                    
                    const distance = getGeographicDistance(clickCoords, midpoint);
                    
                    if (distance < minBranchDistance) {
                        minBranchDistance = distance;
                        clickedBranch = branchIdx;
                        branchInsertIndex = 0; // Insert at beginning of branch
                    }
                }
                
                // Check segments between branch points
                for (let i = 0; i < branch.points.length - 1; i++) {
                    const segmentStart = branch.points[i];
                    const segmentEnd = branch.points[i + 1];
                    
                    const midpoint = [
                        (segmentStart[0] + segmentEnd[0]) / 2,
                        (segmentStart[1] + segmentEnd[1]) / 2
                    ];
                    
                    const distance = getGeographicDistance(clickCoords, midpoint);
                    
                    if (distance < minBranchDistance) {
                        minBranchDistance = distance;
                        clickedBranch = branchIdx;
                        branchInsertIndex = i + 1;
                    }
                }
            });
        }
        
        // Find the closest segment on main line
        let minMainDistance = Infinity;
        let mainInsertIndex = 1;
        
        for (let i = 0; i < editPoints.length - 1; i++) {
            const segmentStart = editPoints[i];
            const segmentEnd = editPoints[i + 1];
            
            const midpoint = [
                (segmentStart[0] + segmentEnd[0]) / 2,
                (segmentStart[1] + segmentEnd[1]) / 2
            ];
            
            const distance = getGeographicDistance(clickCoords, midpoint);
            
            if (distance < minMainDistance) {
                minMainDistance = distance;
                mainInsertIndex = i + 1;
            }
        }
        // Determine which segment is closer - branch or main
        if (clickedBranch !== null && minBranchDistance < minMainDistance) {
            // Add point to branch
            window.currentRouteBranches[clickedBranch].points.splice(branchInsertIndex, 0, clickCoords);
            
            // Update fixed point indices for this branch (increment if >= insertIndex)
            const updatedFixedPoints = new Set();
            fixedPoints.forEach(pointId => {
                if (typeof pointId === 'string' && pointId.startsWith(`branch-${clickedBranch}-`)) {
                    const idx = parseInt(pointId.split('-')[2]);
                    if (idx >= branchInsertIndex) {
                        updatedFixedPoints.add(`branch-${clickedBranch}-${idx + 1}`);
                    } else {
                        updatedFixedPoints.add(pointId);
                    }
                } else {
                    updatedFixedPoints.add(pointId);
                }
            });
            fixedPoints = updatedFixedPoints;
        } else {
            // Add point to main line
            editPoints.splice(mainInsertIndex, 0, clickCoords);
            
            // Update fixed point indices (increment if >= insertIndex)
            const updatedFixedPoints = new Set();
            fixedPoints.forEach(pointId => {
                if (typeof pointId === 'number' && pointId >= mainInsertIndex) {
                    updatedFixedPoints.add(pointId + 1);
                } else {
                    updatedFixedPoints.add(pointId);
                }
            });
            fixedPoints = updatedFixedPoints;
            
            // Update connection indices in all branches (increment if >= insertIndex)
            if (window.currentRouteBranches) {
                window.currentRouteBranches.forEach(branch => {
                    if (branch.connectionIndex >= mainInsertIndex) {
                        branch.connectionIndex++;
                    }
                });
            }
        }
        
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
    
    // Don't process if we're currently drawing a branch
    if (window.drawingBranch) {
        return;
    }
    
    if (!isEditingCurve) return;
    
    // Don't add point if we just deleted one (prevents immediate re-add)
    if (justDeletedPoint) {
        return;
    }
    
    const clickCoords = [e.lngLat.lng, e.lngLat.lat];
    
    // Check if we clicked on a branch segment or main line
    let clickedBranch = null;
    let minBranchDistance = Infinity;
    let branchInsertIndex = -1;
    
    // Check each branch
    if (window.currentRouteBranches) {
        window.currentRouteBranches.forEach((branch, branchIdx) => {
            if (branch.points.length < 1) return;
            
            // Check the connection segment (from connection point to first branch point)
            let connectionPoint = null;
            if (typeof branch.connectionIndex === 'number') {
                connectionPoint = editPoints[branch.connectionIndex];
            } else if (typeof branch.connectionIndex === 'string' && branch.connectionIndex.startsWith('branch-')) {
                const match = branch.connectionIndex.match(/branch-(\d+)-(\d+)/);
                if (match) {
                    const targetBranchIdx = parseInt(match[1]);
                    const targetPointIdx = parseInt(match[2]);
                    if (window.currentRouteBranches[targetBranchIdx]) {
                        connectionPoint = window.currentRouteBranches[targetBranchIdx].points[targetPointIdx];
                    }
                }
            }
            
            if (connectionPoint) {
                // Check segment from connection point to first branch point
                const segmentStart = connectionPoint;
                const segmentEnd = branch.points[0];
                
                const midpoint = [
                    (segmentStart[0] + segmentEnd[0]) / 2,
                    (segmentStart[1] + segmentEnd[1]) / 2
                ];
                
                const distance = getGeographicDistance(clickCoords, midpoint);
                
                if (distance < minBranchDistance) {
                    minBranchDistance = distance;
                    clickedBranch = branchIdx;
                    branchInsertIndex = 0; // Insert at beginning of branch
                }
            }
            
            // Check segments between branch points
            for (let i = 0; i < branch.points.length - 1; i++) {
                const segmentStart = branch.points[i];
                const segmentEnd = branch.points[i + 1];
                
                const midpoint = [
                    (segmentStart[0] + segmentEnd[0]) / 2,
                    (segmentStart[1] + segmentEnd[1]) / 2
                ];
                
                const distance = getGeographicDistance(clickCoords, midpoint);
                
                if (distance < minBranchDistance) {
                    minBranchDistance = distance;
                    clickedBranch = branchIdx;
                    branchInsertIndex = i + 1;
                }
            }
        });
    }
    
    // Find the closest segment on main line
    let minMainDistance = Infinity;
    let mainInsertIndex = 1;
    
    for (let i = 0; i < editPoints.length - 1; i++) {
        const segmentStart = editPoints[i];
        const segmentEnd = editPoints[i + 1];
        
        const midpoint = [
            (segmentStart[0] + segmentEnd[0]) / 2,
            (segmentStart[1] + segmentEnd[1]) / 2
        ];
        
        const distance = getGeographicDistance(clickCoords, midpoint);
        
        if (distance < minMainDistance) {
            minMainDistance = distance;
            mainInsertIndex = i + 1;
        }
    }
    
    // Determine which segment is closer - branch or main
    if (clickedBranch !== null && minBranchDistance < minMainDistance) {
        // Add point to branch
        window.currentRouteBranches[clickedBranch].points.splice(branchInsertIndex, 0, clickCoords);
        
        // Update fixed point indices for this branch (increment if >= insertIndex)
        const updatedFixedPoints = new Set();
        fixedPoints.forEach(pointId => {
            if (typeof pointId === 'string' && pointId.startsWith(`branch-${clickedBranch}-`)) {
                const idx = parseInt(pointId.split('-')[2]);
                if (idx >= branchInsertIndex) {
                    updatedFixedPoints.add(`branch-${clickedBranch}-${idx + 1}`);
                } else {
                    updatedFixedPoints.add(pointId);
                }
            } else {
                updatedFixedPoints.add(pointId);
            }
        });
        fixedPoints = updatedFixedPoints;
    } else {
        // Add point to main line
        editPoints.splice(mainInsertIndex, 0, clickCoords);
        
        // Update fixed point indices (increment if >= insertIndex)
        const updatedFixedPoints = new Set();
        fixedPoints.forEach(pointId => {
            if (typeof pointId === 'number' && pointId >= mainInsertIndex) {
                updatedFixedPoints.add(pointId + 1);
            } else {
                updatedFixedPoints.add(pointId);
            }
        });
        fixedPoints = updatedFixedPoints;
        
        // Update connection indices in all branches (increment if >= insertIndex)
        if (window.currentRouteBranches) {
            window.currentRouteBranches.forEach(branch => {
                if (branch.connectionIndex >= mainInsertIndex) {
                    branch.connectionIndex++;
                }
            });
        }
    }
    
    updateCurveDisplay();
}

// Mouse down on point
function onPointMouseDown(e) {
    e.preventDefault();
    
    if (e.features.length > 0) {
        const props = e.features[0].properties;
        const pointIndex = props.index;
        const pointType = props.type;
        
        // Store which point is pressed
        pendingDragIndex = pointIndex;
        pendingDragType = pointType;
        
        // Start timer for hold gesture (500ms to toggle fixed state)
        pointHoldTimer = setTimeout(() => {
            // Hold completed - toggle fixed state
            const pointId = pointType === 'branch' ? pointIndex : pointIndex;
            if (fixedPoints.has(pointId)) {
                fixedPoints.delete(pointId);
            } else {
                fixedPoints.add(pointId);
            }
            
            // Update display to show fixed point styling
            updateCurveDisplay();
            
            // Clear pending drag since we're toggling fixed state
            pendingDragIndex = null;
            pendingDragType = null;
            pointHoldTimer = null;
        }, 500);
        
        // Save state for potential drag (both main points and branches)
        dragStartPoints = editPoints.map(c => [...c]);
        if (window.currentRouteBranches) {
            dragStartBranches = window.currentRouteBranches.map(b => ({
                connectionIndex: b.connectionIndex,
                points: b.points.map(p => [...p])
            }));
        }
        
        hasMovedDuringDrag = false; // Reset on every mousedown
    }
}

// Mouse move
function onPointMouseMove(e) {
    // Cancel hold timer if mouse moves (starting drag)
    if (pointHoldTimer) {
        clearTimeout(pointHoldTimer);
        pointHoldTimer = null;
    }
    
    // If mouse is pressed on a point but drag not activated yet, activate it now
    if (pendingDragIndex !== null && draggedPointIndex === null) {
        draggedPointIndex = pendingDragIndex;
        draggedPointType = pendingDragType;
        pendingDragIndex = null;
        pendingDragType = null;
        map.getCanvas().style.cursor = 'grabbing';
        map.dragPan.disable();
    }
    
    if (draggedPointIndex === null || !dragStartPoints) return;
    
    hasMovedDuringDrag = true; // Mark that we actually moved
    
    const newCoords = [e.lngLat.lng, e.lngLat.lat];
    
    // Check if dragging a branch point
    if (draggedPointType === 'branch') {
        // Parse branch index from string like "branch-0-1"
        const match = draggedPointIndex.toString().match(/branch-(\d+)-(\d+)/);
        if (match && window.currentRouteBranches && dragStartBranches) {
            const branchIdx = parseInt(match[1]);
            const pointIdx = parseInt(match[2]);
            
            if (branchIdx < window.currentRouteBranches.length) {
                // Update the branch point
                window.currentRouteBranches[branchIdx].points[pointIdx] = newCoords;
                
                // If dragging the first point of branch (connection point), also move the main line point
                if (pointIdx === 0) {
                    const connectionIdx = window.currentRouteBranches[branchIdx].connectionIndex;
                    if (typeof connectionIdx === 'number' && connectionIdx >= 0 && connectionIdx < editPoints.length) {
                        // Skip if main line connection point is fixed
                        if (!fixedPoints.has(connectionIdx)) {
                            const oldMainCoords = dragStartPoints[connectionIdx];
                            const oldBranchCoords = dragStartBranches[branchIdx].points[0];
                            const dx = newCoords[0] - oldBranchCoords[0];
                            const dy = newCoords[1] - oldBranchCoords[1];
                            
                            // Move the main line connection point with reduced influence for natural following effect
                            const mainInfluence = 0.5; // Main line follows with half the movement
                            editPoints[connectionIdx][0] = oldMainCoords[0] + dx * mainInfluence;
                            editPoints[connectionIdx][1] = oldMainCoords[1] + dy * mainInfluence;
                            
                            // Also apply chain effect to adjacent main line points
                            const chainRadius = 3;
                            // Move main line points before connection
                            for (let offset = 1; offset <= chainRadius; offset++) {
                                const idx = connectionIdx - offset;
                                if (idx < 0) break;
                                if (idx === 0) break; // Lock first point
                                if (fixedPoints.has(idx)) break;
                                
                                const influence = mainInfluence * Math.pow(0.5, offset);
                                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                            }
                            // Move main line points after connection
                            for (let offset = 1; offset <= chainRadius; offset++) {
                                const idx = connectionIdx + offset;
                                if (idx >= editPoints.length) break;
                                if (idx === editPoints.length - 1) break; // Lock last point
                                if (fixedPoints.has(idx)) break;
                                
                                const influence = mainInfluence * Math.pow(0.5, offset);
                                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                            }
                        }
                    }
                }
                
                // Move adjacent branch points with chain effect
                const branch = window.currentRouteBranches[branchIdx];
                const startBranch = dragStartBranches[branchIdx];
                const moveRadius = 3;
                
                const oldCoords = startBranch.points[pointIdx];
                const dx = newCoords[0] - oldCoords[0];
                const dy = newCoords[1] - oldCoords[1];
                
                // Move points before
                for (let offset = 1; offset <= moveRadius; offset++) {
                    const idx = pointIdx - offset;
                    if (idx < 0) break;
                    
                    // Skip fixed points
                    const pointId = `branch-${branchIdx}-${idx}`;
                    if (fixedPoints.has(pointId)) break;
                    
                    const influence = Math.pow(0.5, offset);
                    branch.points[idx][0] = startBranch.points[idx][0] + dx * influence;
                    branch.points[idx][1] = startBranch.points[idx][1] + dy * influence;
                    
                    // If we moved the first branch point, also move the main line connection point with reduced influence
                    if (idx === 0) {
                        const connectionIdx = window.currentRouteBranches[branchIdx].connectionIndex;
                        if (typeof connectionIdx === 'number' && connectionIdx >= 0 && connectionIdx < editPoints.length) {
                            const mainInfluence = influence * 0.5; // Further reduce influence for main line
                            editPoints[connectionIdx][0] = dragStartPoints[connectionIdx][0] + dx * mainInfluence;
                            editPoints[connectionIdx][1] = dragStartPoints[connectionIdx][1] + dy * mainInfluence;
                        }
                    }
                }
                
                // Move points after
                for (let offset = 1; offset <= moveRadius; offset++) {
                    const idx = pointIdx + offset;
                    if (idx >= branch.points.length) break;
                    if (idx === branch.points.length - 1) break; // Lock last point
                    
                    // Skip fixed points
                    const pointId = `branch-${branchIdx}-${idx}`;
                    if (fixedPoints.has(pointId)) break;
                    
                    const influence = Math.pow(0.5, offset);
                    branch.points[idx][0] = startBranch.points[idx][0] + dx * influence;
                    branch.points[idx][1] = startBranch.points[idx][1] + dy * influence;
                }
            }
        }
    } else {
        // Dragging main line point
        const pointIndex = typeof draggedPointIndex === 'number' ? draggedPointIndex : parseInt(draggedPointIndex);
        
        // Calculate displacement from original position at drag start
        const oldCoords = dragStartPoints[pointIndex];
        const dx = newCoords[0] - oldCoords[0];
        const dy = newCoords[1] - oldCoords[1];
        
        // Update the dragged point
        editPoints[pointIndex] = newCoords;
        
        // Also move any branches connected to the dragged point itself
        if (window.currentRouteBranches && dragStartBranches) {
            window.currentRouteBranches.forEach((branch, branchIdx) => {
                if (branch.connectionIndex === pointIndex && dragStartBranches[branchIdx]) {
                    const branchFirstPointId = `branch-${branchIdx}-0`;
                    // Skip if branch first point is fixed
                    if (!fixedPoints.has(branchFirstPointId)) {
                        const startBranch = dragStartBranches[branchIdx];
                        // Move first point of branch with reduced influence for natural following effect
                        const branchInfluence = 0.5; // Branch follows with half the movement
                        branch.points[0][0] = startBranch.points[0][0] + dx * branchInfluence;
                        branch.points[0][1] = startBranch.points[0][1] + dy * branchInfluence;
                        
                        // Apply chain effect to subsequent branch points
                        for (let branchOffset = 1; branchOffset <= 3; branchOffset++) {
                            if (branchOffset >= branch.points.length) break;
                            if (branchOffset === branch.points.length - 1) break;
                            
                            const branchPointId = `branch-${branchIdx}-${branchOffset}`;
                            if (fixedPoints.has(branchPointId)) break;
                            
                            const branchChainInfluence = branchInfluence * Math.pow(0.5, branchOffset);
                            branch.points[branchOffset][0] = startBranch.points[branchOffset][0] + dx * branchChainInfluence;
                            branch.points[branchOffset][1] = startBranch.points[branchOffset][1] + dy * branchChainInfluence;
                        }
                    }
                }
            });
        }
        
        // Move adjacent points like a chain - each point moves based on its distance
        const moveRadius = 3; // How many points on each side to affect
        const isFirstPoint = pointIndex === 0;
        const isLastPoint = pointIndex === editPoints.length - 1;
        
        // Process points before (moving backwards)
        if (!isFirstPoint) {
            for (let offset = 1; offset <= moveRadius; offset++) {
                const idx = pointIndex - offset;
                if (idx < 0) break;
                
                // Lock first point - it should never move unless directly dragged
                if (idx === 0) break;
                
                // Skip fixed points
                if (fixedPoints.has(idx)) break;
                
                // Calculate influence: exponential falloff creates more natural chain effect
                const influence = Math.pow(0.5, offset); // 0.5, 0.25, 0.125...
                
                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                
                // Also move any branches connected to this point
                if (window.currentRouteBranches && dragStartBranches) {
                    window.currentRouteBranches.forEach((branch, branchIdx) => {
                        if (branch.connectionIndex === idx && dragStartBranches[branchIdx]) {
                            const branchFirstPointId = `branch-${branchIdx}-0`;
                            // Skip if branch first point is fixed
                            if (!fixedPoints.has(branchFirstPointId)) {
                                const startBranch = dragStartBranches[branchIdx];
                                // Move first point of branch with reduced influence for natural following effect
                                const branchInfluence = influence * 0.5; // Further reduce influence for branches
                                branch.points[0][0] = startBranch.points[0][0] + dx * branchInfluence;
                                branch.points[0][1] = startBranch.points[0][1] + dy * branchInfluence;
                                
                                // Apply chain effect to subsequent branch points
                                for (let branchOffset = 1; branchOffset <= 3; branchOffset++) {
                                    if (branchOffset >= branch.points.length) break;
                                    if (branchOffset === branch.points.length - 1) break;
                                    
                                    const branchPointId = `branch-${branchIdx}-${branchOffset}`;
                                    if (fixedPoints.has(branchPointId)) break;
                                    
                                    const branchChainInfluence = branchInfluence * Math.pow(0.5, branchOffset);
                                    branch.points[branchOffset][0] = startBranch.points[branchOffset][0] + dx * branchChainInfluence;
                                    branch.points[branchOffset][1] = startBranch.points[branchOffset][1] + dy * branchChainInfluence;
                                }
                            }
                        }
                    });
                }
            }
        }
        
        // Process points after (moving forwards)
        if (!isLastPoint) {
            for (let offset = 1; offset <= moveRadius; offset++) {
                const idx = pointIndex + offset;
                if (idx >= editPoints.length) break;
                
                // Lock last point - it should never move unless directly dragged
                if (idx === editPoints.length - 1) break;
                
                // Skip fixed points
                if (fixedPoints.has(idx)) break;
                
                // Calculate influence: exponential falloff
                const influence = Math.pow(0.5, offset);
                
                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                
                // Also move any branches connected to this point
                if (window.currentRouteBranches && dragStartBranches) {
                    window.currentRouteBranches.forEach((branch, branchIdx) => {
                        if (branch.connectionIndex === idx && dragStartBranches[branchIdx]) {
                            const branchFirstPointId = `branch-${branchIdx}-0`;
                            // Skip if branch first point is fixed
                            if (!fixedPoints.has(branchFirstPointId)) {
                                const startBranch = dragStartBranches[branchIdx];
                                // Move first point of branch with reduced influence for natural following effect
                                const branchInfluence = influence * 0.5; // Further reduce influence for branches
                                branch.points[0][0] = startBranch.points[0][0] + dx * branchInfluence;
                                branch.points[0][1] = startBranch.points[0][1] + dy * branchInfluence;
                                
                                // Apply chain effect to subsequent branch points
                                for (let branchOffset = 1; branchOffset <= 3; branchOffset++) {
                                    if (branchOffset >= branch.points.length) break;
                                    if (branchOffset === branch.points.length - 1) break;
                                    
                                    const branchPointId = `branch-${branchIdx}-${branchOffset}`;
                                    if (fixedPoints.has(branchPointId)) break;
                                    
                                    const branchChainInfluence = branchInfluence * Math.pow(0.5, branchOffset);
                                    branch.points[branchOffset][0] = startBranch.points[branchOffset][0] + dx * branchChainInfluence;
                                    branch.points[branchOffset][1] = startBranch.points[branchOffset][1] + dy * branchChainInfluence;
                                }
                            }
                        }
                    });
                }
            }
        }
    }
    
    updateCurveDisplay();
}

// Mouse up
function onPointMouseUp() {
    // Cancel hold timer if mouse released
    if (pointHoldTimer) {
        clearTimeout(pointHoldTimer);
        pointHoldTimer = null;
    }
    
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
        const props = e.features[0].properties;
        const pointIndex = props.index;
        const pointType = props.type;
        
        // Store touch info in pending state (not drag state yet)
        pendingDragIndex = pointIndex;
        pendingDragType = pointType;
        
        // Start timer for hold gesture (800ms for touch)
        pointHoldTimer = setTimeout(() => {
            // Hold completed - toggle fixed state
            const pointId = pointType === 'branch' ? pointIndex : pointIndex;
            if (fixedPoints.has(pointId)) {
                fixedPoints.delete(pointId);
            } else {
                fixedPoints.add(pointId);
            }
            
            // Update display to show fixed point styling
            updateCurveDisplay();
            
            // Clear pending state
            pendingDragIndex = null;
            pendingDragType = null;
            pointHoldTimer = null;
            map.dragPan.enable();
        }, 800);
        
        // Save original positions (will be used if this becomes a drag)
        dragStartPoints = editPoints.map(c => [...c]);
        if (window.currentRouteBranches) {
            dragStartBranches = window.currentRouteBranches.map(b => ({
                connectionIndex: b.connectionIndex,
                points: b.points.map(p => [...p])
            }));
        }
        
        touchMoved = false; // Reset touch movement tracking
        map.dragPan.disable();
    }
}

// Touch move
function onPointTouchMove(e) {
    // First check if we have a pending touch (not yet a drag)
    if (pendingDragIndex !== null && pointHoldTimer) {
        // User moved while hold timer active - activate drag mode
        draggedPointIndex = pendingDragIndex;
        draggedPointType = pendingDragType;
        pendingDragIndex = null;
        pendingDragType = null;
        
        // Cancel hold timer since this is now a drag
        clearTimeout(pointHoldTimer);
        pointHoldTimer = null;
    }
    
    // Now check if we're in active drag mode
    if (draggedPointIndex === null || !dragStartPoints) return;
    
    e.preventDefault();
    
    touchMoved = true; // Mark that touch moved (this is a drag, not a tap)
    
    const touch = e.originalEvent.touches[0];
    const point = map.unproject([touch.clientX, touch.clientY]);
    const newCoords = [point.lng, point.lat];
    
    // Check if dragging a branch point
    if (draggedPointType === 'branch') {
        // Parse branch index from string like "branch-0-1"
        const match = draggedPointIndex.toString().match(/branch-(\d+)-(\d+)/);
        if (match && window.currentRouteBranches && dragStartBranches) {
            const branchIdx = parseInt(match[1]);
            const pointIdx = parseInt(match[2]);
            
            if (branchIdx < window.currentRouteBranches.length) {
                // Update the branch point
                window.currentRouteBranches[branchIdx].points[pointIdx] = newCoords;
                
                // If dragging the first point of branch (connection point), also move the main line point
                if (pointIdx === 0) {
                    const connectionIdx = window.currentRouteBranches[branchIdx].connectionIndex;
                    if (typeof connectionIdx === 'number' && connectionIdx >= 0 && connectionIdx < editPoints.length) {
                        // Skip if main line connection point is fixed
                        if (!fixedPoints.has(connectionIdx)) {
                            const oldMainCoords = dragStartPoints[connectionIdx];
                            const oldBranchCoords = dragStartBranches[branchIdx].points[0];
                            const dx = newCoords[0] - oldBranchCoords[0];
                            const dy = newCoords[1] - oldBranchCoords[1];
                            
                            // Move the main line connection point with reduced influence for natural following effect
                            const mainInfluence = 0.5; // Main line follows with half the movement
                            editPoints[connectionIdx][0] = oldMainCoords[0] + dx * mainInfluence;
                            editPoints[connectionIdx][1] = oldMainCoords[1] + dy * mainInfluence;
                            
                            // Also apply chain effect to adjacent main line points
                            const chainRadius = 3;
                            // Move main line points before connection
                            for (let offset = 1; offset <= chainRadius; offset++) {
                                const idx = connectionIdx - offset;
                                if (idx < 0) break;
                                if (idx === 0) break; // Lock first point
                                if (fixedPoints.has(idx)) break;
                                
                                const influence = mainInfluence * Math.pow(0.5, offset);
                                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                            }
                            // Move main line points after connection
                            for (let offset = 1; offset <= chainRadius; offset++) {
                                const idx = connectionIdx + offset;
                                if (idx >= editPoints.length) break;
                                if (idx === editPoints.length - 1) break; // Lock last point
                                if (fixedPoints.has(idx)) break;
                                
                                const influence = mainInfluence * Math.pow(0.5, offset);
                                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                            }
                        }
                    }
                }
                
                // Move adjacent branch points with chain effect
                const branch = window.currentRouteBranches[branchIdx];
                const startBranch = dragStartBranches[branchIdx];
                const moveRadius = 3;
                
                const oldCoords = startBranch.points[pointIdx];
                const dx = newCoords[0] - oldCoords[0];
                const dy = newCoords[1] - oldCoords[1];
                
                // Move points before
                for (let offset = 1; offset <= moveRadius; offset++) {
                    const idx = pointIdx - offset;
                    if (idx < 0) break;
                    
                    const influence = Math.pow(0.5, offset);
                    branch.points[idx][0] = startBranch.points[idx][0] + dx * influence;
                    branch.points[idx][1] = startBranch.points[idx][1] + dy * influence;
                    
                    // If we moved the first branch point, also move the main line connection point with reduced influence
                    if (idx === 0) {
                        const connectionIdx = window.currentRouteBranches[branchIdx].connectionIndex;
                        if (typeof connectionIdx === 'number' && connectionIdx >= 0 && connectionIdx < editPoints.length) {
                            const mainInfluence = influence * 0.5; // Further reduce influence for main line
                            editPoints[connectionIdx][0] = dragStartPoints[connectionIdx][0] + dx * mainInfluence;
                            editPoints[connectionIdx][1] = dragStartPoints[connectionIdx][1] + dy * mainInfluence;
                        }
                    }
                }
                
                // Move points after
                for (let offset = 1; offset <= moveRadius; offset++) {
                    const idx = pointIdx + offset;
                    if (idx >= branch.points.length) break;
                    if (idx === branch.points.length - 1) break; // Lock last point
                    
                    const influence = Math.pow(0.5, offset);
                    branch.points[idx][0] = startBranch.points[idx][0] + dx * influence;
                    branch.points[idx][1] = startBranch.points[idx][1] + dy * influence;
                }
            }
        }
    } else {
        // Dragging main line point
        const pointIndex = typeof draggedPointIndex === 'number' ? draggedPointIndex : parseInt(draggedPointIndex);
        
        // Calculate displacement from original position at drag start
        const oldCoords = dragStartPoints[pointIndex];
        const dx = newCoords[0] - oldCoords[0];
        const dy = newCoords[1] - oldCoords[1];
        
        // Update the dragged point
        editPoints[pointIndex] = newCoords;
        
        // Also move any branches connected to the dragged point itself
        if (window.currentRouteBranches && dragStartBranches) {
            window.currentRouteBranches.forEach((branch, branchIdx) => {
                if (branch.connectionIndex === pointIndex && dragStartBranches[branchIdx]) {
                    const branchFirstPointId = `branch-${branchIdx}-0`;
                    // Skip if branch first point is fixed
                    if (!fixedPoints.has(branchFirstPointId)) {
                        const startBranch = dragStartBranches[branchIdx];
                        // Move first point of branch with reduced influence for natural following effect
                        const branchInfluence = 0.5; // Branch follows with half the movement
                        branch.points[0][0] = startBranch.points[0][0] + dx * branchInfluence;
                        branch.points[0][1] = startBranch.points[0][1] + dy * branchInfluence;
                        
                        // Apply chain effect to subsequent branch points
                        for (let branchOffset = 1; branchOffset <= 3; branchOffset++) {
                            if (branchOffset >= branch.points.length) break;
                            if (branchOffset === branch.points.length - 1) break;
                            
                            const branchPointId = `branch-${branchIdx}-${branchOffset}`;
                            if (fixedPoints.has(branchPointId)) break;
                            
                            const branchChainInfluence = branchInfluence * Math.pow(0.5, branchOffset);
                            branch.points[branchOffset][0] = startBranch.points[branchOffset][0] + dx * branchChainInfluence;
                            branch.points[branchOffset][1] = startBranch.points[branchOffset][1] + dy * branchChainInfluence;
                        }
                    }
                }
            });
        }
        
        // Move adjacent points like a chain - each point moves based on its distance
        const moveRadius = 3; // How many points on each side to affect
        const isFirstPoint = pointIndex === 0;
        const isLastPoint = pointIndex === editPoints.length - 1;
        
        // Process points before (moving backwards)
        if (!isFirstPoint) {
            for (let offset = 1; offset <= moveRadius; offset++) {
                const idx = pointIndex - offset;
                if (idx < 0) break;
                
                // Lock first point - it should never move unless directly dragged
                if (idx === 0) break;
                
                // Skip fixed points
                if (fixedPoints.has(idx)) break;
                
                // Calculate influence: exponential falloff creates more natural chain effect
                const influence = Math.pow(0.5, offset);
                
                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                
                // Also move any branches connected to this point
                if (window.currentRouteBranches && dragStartBranches) {
                    window.currentRouteBranches.forEach((branch, branchIdx) => {
                        if (branch.connectionIndex === idx && dragStartBranches[branchIdx]) {
                            const branchFirstPointId = `branch-${branchIdx}-0`;
                            // Skip if branch first point is fixed
                            if (!fixedPoints.has(branchFirstPointId)) {
                                const startBranch = dragStartBranches[branchIdx];
                                // Move first point of branch with reduced influence for natural following effect
                                const branchInfluence = influence * 0.5; // Further reduce influence for branches
                                branch.points[0][0] = startBranch.points[0][0] + dx * branchInfluence;
                                branch.points[0][1] = startBranch.points[0][1] + dy * branchInfluence;
                                
                                // Apply chain effect to subsequent branch points
                                for (let branchOffset = 1; branchOffset <= 3; branchOffset++) {
                                    if (branchOffset >= branch.points.length) break;
                                    if (branchOffset === branch.points.length - 1) break;
                                    
                                    const branchPointId = `branch-${branchIdx}-${branchOffset}`;
                                    if (fixedPoints.has(branchPointId)) break;
                                    
                                    const branchChainInfluence = branchInfluence * Math.pow(0.5, branchOffset);
                                    branch.points[branchOffset][0] = startBranch.points[branchOffset][0] + dx * branchChainInfluence;
                                    branch.points[branchOffset][1] = startBranch.points[branchOffset][1] + dy * branchChainInfluence;
                                }
                            }
                        }
                    });
                }
            }
        }
        
        // Process points after (moving forwards)
        if (!isLastPoint) {
            for (let offset = 1; offset <= moveRadius; offset++) {
                const idx = pointIndex + offset;
                if (idx >= editPoints.length) break;
                
                // Lock last point - it should never move unless directly dragged
                if (idx === editPoints.length - 1) break;
                
                // Skip fixed points
                if (fixedPoints.has(idx)) break;
                
                // Calculate influence: exponential falloff
                const influence = Math.pow(0.5, offset);
                
                editPoints[idx][0] = dragStartPoints[idx][0] + dx * influence;
                editPoints[idx][1] = dragStartPoints[idx][1] + dy * influence;
                
                // Also move any branches connected to this point
                if (window.currentRouteBranches && dragStartBranches) {
                    window.currentRouteBranches.forEach((branch, branchIdx) => {
                        if (branch.connectionIndex === idx && dragStartBranches[branchIdx]) {
                            const branchFirstPointId = `branch-${branchIdx}-0`;
                            // Skip if branch first point is fixed
                            if (!fixedPoints.has(branchFirstPointId)) {
                                const startBranch = dragStartBranches[branchIdx];
                                // Move first point of branch with reduced influence for natural following effect
                                const branchInfluence = influence * 0.5; // Further reduce influence for branches
                                branch.points[0][0] = startBranch.points[0][0] + dx * branchInfluence;
                                branch.points[0][1] = startBranch.points[0][1] + dy * branchInfluence;
                                
                                // Apply chain effect to subsequent branch points
                                for (let branchOffset = 1; branchOffset <= 3; branchOffset++) {
                                    if (branchOffset >= branch.points.length) break;
                                    if (branchOffset === branch.points.length - 1) break;
                                    
                                    const branchPointId = `branch-${branchIdx}-${branchOffset}`;
                                    if (fixedPoints.has(branchPointId)) break;
                                    
                                    const branchChainInfluence = branchInfluence * Math.pow(0.5, branchOffset);
                                    branch.points[branchOffset][0] = startBranch.points[branchOffset][0] + dx * branchChainInfluence;
                                    branch.points[branchOffset][1] = startBranch.points[branchOffset][1] + dy * branchChainInfluence;
                                }
                            }
                        }
                    });
                }
            }
        }
    }
    
    updateCurveDisplay();
}

// Touch end
function onPointTouchEnd() {
    // Cancel hold timer if touch ends
    if (pointHoldTimer) {
        clearTimeout(pointHoldTimer);
        pointHoldTimer = null;
    }
    
    // Clear both active drag and pending touch states
    if (draggedPointIndex !== null) {
        draggedPointIndex = null;
        draggedPointType = null;
        dragStartPoints = null;
        dragStartBranches = null;
        map.dragPan.enable();
        // Don't reset touchMoved here - let the tap handler check it
    }
    
    if (pendingDragIndex !== null) {
        pendingDragIndex = null;
        pendingDragType = null;
        map.dragPan.enable();
    }
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
    let branches = null;
    if (isEditingCurve && editPoints.length > 0) {
        controlPoints = editPoints.map(p => [...p]);
        
        // Save branch information if it exists
        if (window.currentRouteBranches && window.currentRouteBranches.length > 0) {
            branches = window.currentRouteBranches.map(b => ({
                connectionIndex: b.connectionIndex,
                points: b.points.map(p => [...p])
            }));
        }
        
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
                // Preserve existing branches if any
                if (existingFeature.properties.branches) {
                    branches = existingFeature.properties.branches;
                }
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
            controlPoints: controlPoints,
            branches: branches  // Store branch information
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
    
    // Update or add to custom routes
    // If we're editing an existing route, use the original ID
    const featureIdToSave = window.originalFeatureId || currentFeatureId;
    
    // Update the feature ID to match the original
    feature.id = featureIdToSave;
    feature.properties.id = featureIdToSave;
    feature.properties.featureId = featureIdToSave;
    
    const existingIndex = customRoutes.findIndex(f => f.id === featureIdToSave);
    
    if (existingIndex >= 0) {
        customRoutes[existingIndex] = feature;
    } else {
        customRoutes.push(feature);
    }
    
    // Clean up: remove any duplicate routes with different IDs (safety check)
    if (window.originalFeatureId && window.originalFeatureId !== currentFeatureId) {
        const duplicateIndex = customRoutes.findIndex(f => f.id === currentFeatureId && f.id !== featureIdToSave);
        if (duplicateIndex >= 0) {
            customRoutes.splice(duplicateIndex, 1);
        }
    }
    
    // Clear the original ID tracker
    window.originalFeatureId = null;
    
    saveRoutesToStorage();
    
    // Clear and refresh to prevent duplicates
    if (map.getSource('custom-routes')) {
        map.getSource('custom-routes').setData({
            type: 'FeatureCollection',
            features: []
        });
    }
    
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
    
    // If we were editing an existing route, restore it to display
    if (window.originalFeatureId) {
        refreshCustomRoutes();
    }
    
    currentFeatureId = null;
    window.originalFeatureId = null;  // Clear original ID tracker
    editPoints = [];
    fixedPoints.clear();  // Clear fixed points
    window.currentRouteBranches = [];  // Clear branches
    
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
    
    // Convert routes with branches to MultiLineString for display
    const displayFeatures = customRoutes.map(feature => {
        if (feature.geometry.type === 'LineString' && 
            feature.properties.branches && 
            feature.properties.branches.length > 0) {
            
            // Create MultiLineString with main line and all branches
            const lines = [feature.geometry.coordinates];
            
            // Determine if this route was created with curve smoothing
            const hasCurveSmoothing = feature.properties.controlPoints && 
                                     feature.properties.controlPoints.length > 0;
            
            // Add each branch as a separate line
            const controlPoints = feature.properties.controlPoints || feature.geometry.coordinates;
            for (const branch of feature.properties.branches) {
                let connectionPoint = null;
                
                // Check if connection is to main line (number) or another branch (string)
                if (typeof branch.connectionIndex === 'number') {
                    // Connection to main line
                    if (branch.connectionIndex < controlPoints.length) {
                        connectionPoint = controlPoints[branch.connectionIndex];
                    }
                } else if (typeof branch.connectionIndex === 'string' && branch.connectionIndex.startsWith('branch-')) {
                    // Connection to another branch - parse the string
                    const match = branch.connectionIndex.match(/branch-(\d+)-(\d+)/);
                    if (match && feature.properties.branches) {
                        const branchIdx = parseInt(match[1]);
                        const pointIdx = parseInt(match[2]);
                        if (branchIdx < feature.properties.branches.length) {
                            const targetBranch = feature.properties.branches[branchIdx];
                            if (pointIdx < targetBranch.points.length) {
                                connectionPoint = targetBranch.points[pointIdx];
                            }
                        }
                    }
                }
                
                if (connectionPoint) {
                    const branchControlPoints = [connectionPoint, ...branch.points];
                    
                    // Apply smoothing if the route was created with curve mode
                    const branchLine = hasCurveSmoothing ? 
                        smoothLineString(branchControlPoints) : 
                        branchControlPoints;
                    
                    lines.push(branchLine);
                }
            }
            
            return {
                ...feature,
                geometry: {
                    type: 'MultiLineString',
                    coordinates: lines
                }
            };
        }
        
        return feature;
    });
    
    map.getSource('custom-routes').setData({
        type: 'FeatureCollection',
        features: displayFeatures
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
