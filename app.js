// Metro Map Application
// MapLibre GL + PMTiles Implementation

// Global variables
let map;
let draw;
let editMode = false;
let currentFeatureId = null;
let customRoutes = [];
let curveMode = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
    initializeMap();
    setupEventListeners();
    loadStoredRoutes();
});

// Initialize MapLibre GL map with raster tiles
function initializeMap() {
    // Initialize map with OpenStreetMap raster tiles (no PMTiles needed for now)
    map = new maplibregl.Map({
        container: 'map',
        style: getMapStyle(),
        center: [-74.006, 40.7128], // New York City (matches sample-routes.geojson)
        zoom: 12,
        attributionControl: true
    });
    
    // Add navigation controls
    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    
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
    document.getElementById('delete-feature').addEventListener('click', deleteSelectedFeature);
    
    // Export/Import
    document.getElementById('export-geojson').addEventListener('click', exportGeoJSON);
    document.getElementById('import-file').addEventListener('change', handleImport);
    
    // Properties panel
    document.getElementById('save-properties').addEventListener('click', saveProperties);
    document.getElementById('cancel-properties').addEventListener('click', cancelProperties);
    
    // Panel collapse
    document.getElementById('toggle-panel').addEventListener('click', toggleControlsPanel);
    
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
    // Click on lines
    map.on('click', 'custom-routes-lines', (e) => {
        showFeaturePopup(e);
    });
    
    // Click on polygons
    map.on('click', 'custom-routes-polygons', (e) => {
        showFeaturePopup(e);
    });
    
    // Hover effects
    map.on('mouseenter', 'custom-routes-lines', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'custom-routes-lines', () => {
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
    const feature = e.features[0];
    const props = feature.properties;
    
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
    
    new maplibregl.Popup()
        .setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(map);
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
    
    // Apply curve smoothing if enabled and feature is a LineString
    if (curveMode && feature.geometry.type === 'LineString') {
        feature.geometry.coordinates = smoothLineString(feature.geometry.coordinates);
        draw.delete(feature.id);
        const newFeature = draw.add(feature)[0];
        currentFeatureId = newFeature;
    }
    
    showPropertiesPanel(feature);
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
    document.getElementById('properties-panel').style.display = 'block';
    
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
    const drawnFeature = draw.get(currentFeatureId);
    if (!drawnFeature) return;
    
    const name = document.getElementById('line-name').value;
    const color = document.getElementById('line-color').value;
    const width = parseInt(document.getElementById('line-width').value);
    const opacity = parseFloat(document.getElementById('line-opacity').value);
    const description = document.getElementById('description').value;
    
    const feature = {
        id: currentFeatureId,
        type: 'Feature',
        geometry: drawnFeature.geometry,
        properties: {
            name: name,
            description: description
        }
    };
    
    // Apply curve smoothing if enabled for LineStrings
    if (curveMode && feature.geometry.type === 'LineString') {
        feature.geometry.coordinates = smoothLineString(feature.geometry.coordinates);
    }
    
    // Add type-specific properties
    if (drawnFeature.geometry.type === 'LineString') {
        feature.properties.stroke = color;
        feature.properties['stroke-width'] = width;
        feature.properties['stroke-opacity'] = opacity;
    } else if (drawnFeature.geometry.type === 'Polygon') {
        feature.properties.fill = color;
        feature.properties['fill-opacity'] = opacity;
    }
    
    // Remove from draw layer
    draw.delete(currentFeatureId);
    
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
    document.getElementById('properties-panel').style.display = 'none';
    
    // Remove drawn feature if not saved
    if (currentFeatureId) {
        draw.delete(currentFeatureId);
    }
    
    currentFeatureId = null;
    
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

// Toggle controls panel
function toggleControlsPanel() {
    const panel = document.querySelector('.controls-panel');
    const button = document.getElementById('toggle-panel');
    
    panel.classList.toggle('collapsed');
    button.textContent = panel.classList.contains('collapsed') ? '▶' : '◀';
}

// Hide loading indicator
function hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
}
