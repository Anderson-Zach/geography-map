// Global variables
let rawData, map, heatLayer;
let aggregatedPoints = [];
let timelapseActive = false;
let timelapseInterval;
let updateTimeout;

// Use the exact number you found to lock the color scales
const globalMaxDensity = 1500; 

// Debounce function for smooth slider performance
function debounce(func, wait) {
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(updateTimeout);
            func(...args);
        };
        clearTimeout(updateTimeout);
        updateTimeout = setTimeout(later, wait);
    };
}

// 1. Initialize Map
async function init() {
    try {
        // Initialize Leaflet map
        map = L.map('base-map').setView([48.0, 10.0], 5);

        // Add CartoDB Base Map
        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 10
        }).addTo(map);

        // Add Scale Bar
        L.control.scale({ imperial: true, position: 'bottomright' }).addTo(map);

        // Setup the Leaflet Heat Layer
        heatLayer = L.heatLayer([], {
            radius: 15,            
            blur: 20,              
            maxZoom: 10,           
            max: globalMaxDensity, 
            gradient: {
                0.0: 'rgba(0,0,255,0)', 
                0.2: 'blue',
                0.4: 'cyan',
                0.6: 'yellow',
                0.8: 'orange',
                1.0: 'red'
            }
        }).addTo(map);

        // Load operations data
        rawData = await d3.json("operations.json");

        // Set up slider and perform initial draw

        // --- THE DROPPER TOOL ---
        map.on('mousemove', function(e) {
            if (!aggregatedPoints.length) return;

            const tooltip = document.getElementById('hover-tooltip');
            const mouseLat = e.latlng.lat;
            const mouseLng = e.latlng.lng;
            
            // Search radius: 0.15 degrees is roughly a 10-15km box around the cursor
            const searchRadius = 0.15; 
            let localTons = 0;

            // Fast bounding-box search to find bombs near the mouse
            for (let i = 0; i < aggregatedPoints.length; i++) {
                const pt = aggregatedPoints[i];
                if (Math.abs(pt.lat - mouseLat) < searchRadius && Math.abs(pt.lon - mouseLng) < searchRadius) {
                    localTons += pt.count; 
                }
            }

            // If we found bombs, show the tooltip and make it follow the mouse
            if (localTons > 0) {
                document.getElementById('hover-tons').textContent = Math.round(localTons).toLocaleString();
                tooltip.style.display = 'block';
                // Offset by 15px so it doesn't get stuck directly under the mouse arrow
                tooltip.style.left = (e.containerPoint.x + 15) + 'px';
                tooltip.style.top = (e.containerPoint.y + 15) + 'px';
            } else {
                // Hide tooltip if pointing at empty space
                tooltip.style.display = 'none';
            }
        });

        // Hide tooltip when mouse leaves the map completely
        map.on('mouseout', function() {
            document.getElementById('hover-tooltip').style.display = 'none';
        });

        initSlider();
        updateData();

    } catch (error) {
        console.error("Initialization error:", error);
    }
}

// 2. Setup Slider
function initSlider() {
    const dateSlider = document.getElementById('slider-date');
    
    function timestamp(str) {
        return new Date(str).getTime() / 1000;
    }

    noUiSlider.create(dateSlider, {
        range: {
            min: timestamp('1939-08'),
            max: timestamp('1945-05')
        },
        step: 24 * 60 * 60, // 1 day
        start: [timestamp('1939-08'), timestamp('1945-05')],
        format: wNumb({ decimals: 0 }),
        connect: true
    });

    const dateValues = [
        document.getElementById('event-start'),
        document.getElementById('event-end')
    ];

    const formatMonth = d3.timeFormat("%b %d, %Y");

    const debouncedUpdate = debounce(() => {
        updateData();
    }, 50);

    dateSlider.noUiSlider.on('update', function (values, handle) {
        const date = new Date(+values[handle] * 1000);
        dateValues[handle].value = formatMonth(date);
    });

    dateSlider.noUiSlider.on('slide', function () {
        debouncedUpdate();
    });

    dateSlider.noUiSlider.on('set', function () {
        updateData();
    });

    window.dateSlider = dateSlider;
}

// 3. Filter Data
function filterData(data) {
    if (!window.dateSlider || !window.dateSlider.noUiSlider) return data;
    
    const values = window.dateSlider.noUiSlider.get();
    const startDate = +values[0];
    const endDate = +values[1];
    
    return data.filter(item => {
        return item[0] >= startDate && item[0] <= endDate;
    });
}

// Update Data State
function updateData() {
    if (!rawData || !rawData.locations) return;

    const cleanData = filterData(rawData.locations);

    const groupedData = d3.rollup(
        cleanData,
        v => d3.sum(v, d => d[3]), 
        d => Math.round(d[1] * 100) / 100, // Longitude
        d => Math.round(d[2] * 100) / 100  // Latitude
    );

    aggregatedPoints = [];
    for (const [lon, latMap] of groupedData) {
        for (const [lat, count] of latMap) {
            aggregatedPoints.push({ lon, lat, count });
        }
    }

    updateStats(cleanData.length, aggregatedPoints.length);
    drawHeatmap();
}

// 5. Render Heatmap on Leaflet
function drawHeatmap() {
    if (!heatLayer || !aggregatedPoints.length) return;

    // Convert to Leaflet's preferred format: [Lat, Lon, Intensity]
    const leafletPoints = aggregatedPoints.map(point => [
        point.lat, 
        point.lon, 
        point.count
    ]);

    heatLayer.setLatLngs(leafletPoints);
}

// 6. Update HTML Statistics
function updateStats(operationsCount) {
    // Update operations count
    document.getElementById('operations-count').textContent = operationsCount.toLocaleString();
    
    if (aggregatedPoints.length > 0) {
        // CALCULATE NEW STAT: Add up every single ton dropped on the map right now
        const totalTons = d3.sum(aggregatedPoints, d => d.count);
        // Math.round() prevents ugly decimals like "1,245.67 tons"
        document.getElementById('total-tons').textContent = Math.round(totalTons).toLocaleString();

        // Calculate peak intensity (The single hottest spot on the map)
        const maxIntensity = d3.max(aggregatedPoints, d => d.count);
        document.getElementById('peak-intensity').textContent = Math.round(maxIntensity).toLocaleString();
    } else {
        // If the map is empty, reset stats to 0
        document.getElementById('total-tons').textContent = "0";
        document.getElementById('peak-intensity').textContent = "0";
    }
}

// 7. Dynamic Timelapse Controls
function togglePlayback() {
    timelapseActive = !timelapseActive;
    const playIcon = document.getElementById('play-icon');
    const playText = document.getElementById('play-text');

    if (timelapseActive) {
        playIcon.textContent = '⏸';
        playText.textContent = 'Pause';
        startTimelapse();
    } else {
        playIcon.textContent = '▶';
        playText.textContent = 'Play Timelapse';
        stopTimelapse();
    }
}

function startTimelapse() {
    if (!window.dateSlider || !window.dateSlider.noUiSlider) return;
    
    const absoluteMax = window.dateSlider.noUiSlider.options.range.max;
    const currentValues = window.dateSlider.noUiSlider.get();
    const leftHandle = parseFloat(currentValues[0]); 
    let rightHandle = parseFloat(currentValues[1]);  

    // Restart from left handle if already at the end
    if (rightHandle >= absoluteMax) {
        rightHandle = leftHandle;
    }

    const stepAmount = 3 * 24 * 60 * 60; // 3 days per frame
    let currentTime = rightHandle;

    function animate() {
        if (!timelapseActive) return;

        currentTime += stepAmount;

        if (currentTime > absoluteMax) {
            currentTime = absoluteMax;
            window.dateSlider.noUiSlider.set([leftHandle, currentTime]);
            togglePlayback(); // Auto-pause at the end
            return;
        }

        window.dateSlider.noUiSlider.set([leftHandle, currentTime]);
        timelapseInterval = requestAnimationFrame(animate);
    }

    animate();
}

function stopTimelapse() {
    if (timelapseInterval) {
        cancelAnimationFrame(timelapseInterval);
        timelapseInterval = null;
    }
}

function resetView() {
    if (!window.dateSlider || !window.dateSlider.noUiSlider) return;
    stopTimelapse()
    const sliderRange = window.dateSlider.noUiSlider.options.range;
    window.dateSlider.noUiSlider.set([sliderRange.min, sliderRange.max]);
}

// Start application
init();