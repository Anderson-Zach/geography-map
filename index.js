let rawData, map, heatLayer;
let aggregatedPoints = [];
let timelapseActive = false;
let timelapseInterval;
let updateTimeout;

const globalMaxDensity = 1500; 

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

async function init() {
    try {
        map = L.map('base-map').setView([48.0, 10.0], 5);

        L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '&copy; OpenStreetMap &copy; CARTO',
            subdomains: 'abcd',
            maxZoom: 10
        }).addTo(map);

        L.control.scale({ imperial: true, position: 'bottomright' }).addTo(map);

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

        rawData = await d3.json("operations.json");


        map.on('mousemove', function(e) {
            if (!aggregatedPoints.length) return;

            const tooltip = document.getElementById('hover-tooltip');
            const mouseLat = e.latlng.lat;
            const mouseLng = e.latlng.lng;
            
            const searchRadius = 0.15; 
            let localTons = 0;

            for (let i = 0; i < aggregatedPoints.length; i++) {
                const pt = aggregatedPoints[i];
                if (Math.abs(pt.lat - mouseLat) < searchRadius && Math.abs(pt.lon - mouseLng) < searchRadius) {
                    localTons += pt.count; 
                }
            }

            if (localTons > 0) {
                document.getElementById('hover-tons').textContent = Math.round(localTons).toLocaleString();
                tooltip.style.display = 'block';
                tooltip.style.left = (e.containerPoint.x + 15) + 'px';
                tooltip.style.top = (e.containerPoint.y + 15) + 'px';
            } else {
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

function filterData(data) {
    if (!window.dateSlider || !window.dateSlider.noUiSlider) return data;
    
    const values = window.dateSlider.noUiSlider.get();
    const startDate = +values[0];
    const endDate = +values[1];
    
    return data.filter(item => {
        return item[0] >= startDate && item[0] <= endDate;
    });
}

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

function drawHeatmap() {
    if (!heatLayer || !aggregatedPoints.length) return;

    const leafletPoints = aggregatedPoints.map(point => [
        point.lat, 
        point.lon, 
        point.count
    ]);

    heatLayer.setLatLngs(leafletPoints);
}

function updateStats(operationsCount) {
    document.getElementById('operations-count').textContent = operationsCount.toLocaleString();
    
    if (aggregatedPoints.length > 0) {
        const totalTons = d3.sum(aggregatedPoints, d => d.count);
        document.getElementById('total-tons').textContent = Math.round(totalTons).toLocaleString();

        const maxIntensity = d3.max(aggregatedPoints, d => d.count);
        document.getElementById('peak-intensity').textContent = Math.round(maxIntensity).toLocaleString();
    } else {
        // If the map is empty, reset stats to 0
        document.getElementById('total-tons').textContent = "0";
        document.getElementById('peak-intensity').textContent = "0";
    }
}

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
        playText.textContent = 'Play';
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
            togglePlayback(); 
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

init();