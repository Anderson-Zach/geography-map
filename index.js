
var rawData, svg, projection,radiusScale
async function init() {
  // 1. Load Data
  // 1. Load the GeoJSON data
  const topology = await d3.json("europe.topojson"); // Ensure you've converted your file

  // 2. Convert TopoJSON back to GeoJSON features
  // 'europe' should match the object name inside your TopoJSON file
  const geojsonData = topojson.feature(topology, topology.objects.europe);

  const countriesToKeep = ["Slovenia","Bosnia and Herzegovina","Slovakia","Croatia","Hungary","Germany", "France", "Belgium", "Netherlands", "Luxembourg", "Italy", "Austria", "Czech Republic", "Poland", "Slovakia", "Switzerland", "Romania"];

  // 3. Filter the features (Same logic as before)
  const filteredFeatures = {
    type: "FeatureCollection",
    features: geojsonData.features.filter(d => {
      const countryName = d.properties.NAME || d.properties.name;
      return countriesToKeep.includes(countryName);
    })
  };
  rawData = await d3.json("operations.json");
  const width = 1000;
  const height = 1000;

  // 2. Set up the SVG Base Map Layer
  svg = d3.select("#map-container").append("svg")
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [0, 0, width, height]);

  projection = d3.geoMercator()
    .center([10, 40])
    .scale(1200)
    .translate([width / 2, height / 2]);

  const path = d3.geoPath().projection(projection);

  svg.append("g")
    .selectAll("path")
    .data(filteredFeatures.features)
    .join("path")
    .attr("class", "country")
    .attr("d", path)
    .append("title")
    .text(d => d.properties.NAME || d.properties.name);
  const maxBombs = 8736
   radiusScale = d3.scaleSqrt()
    .domain([1, maxBombs]) // Input: 1 bomb to the max bombs
    .range([1, 25]);

  updateData()



  // 2. Convert that grouped data back into a simple array we can draw

}
function updateData() {
  // 3. Clean and Rescue the Data
  const cleanData = filterData(rawData.locations)

  // 4. Log the Data Filtering Results
  const originalCount = rawData.locations.length;
  const cleanCount = cleanData.length;
  const removedCount = originalCount - cleanCount;

  const groupedData = d3.rollup(
    cleanData,
    v => v.length,
    d => d[1], // First Key: Longitude
    d => d[2]  // Second Key: Latitude
  );

  // 2. FLATTEN: Convert the nested Maps back to a flat array
  const aggregatedPoints = [];

  for (const [lon, latMap] of groupedData) {
    for (const [lat, count] of latMap) {
      aggregatedPoints.push({
        lon: lon,
        lat: lat,
        count: count
      });
    }
  }

  //const maxBombs = d3.max(aggregatedPoints, d => d.count);

  drawData(aggregatedPoints, radiusScale)

}


function drawData(aggregatedPoints) {
  svg.selectAll("circle")
    .data(aggregatedPoints, d => `${d.lon},${d.lat}`) // Key function helps D3 identify points
    .join(
      enter => enter.append("circle")
        .attr("fill", "rgba(255, 0, 0, 0.4)")
        .attr("stroke", "rgba(200, 0, 0, 0.8)")
        .attr("stroke-width", 0.1)
        .style("mix-blend-mode", "screen")
        .attr("transform", d => `translate(${projection([d.lon, d.lat])})`)
        .attr("r", d => radiusScale(d.count)),
      update => update
        .attr("r", d => radiusScale(d.count)), // Only update radius if coords haven't moved
      exit => exit.remove()
    );
}
function filterData(data) {
  return data.filter(item => {
    return (item[0] > dateRanges[0] && item[0] < dateRanges[1])
  });

}
init();

