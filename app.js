const btn = document.getElementById("btn");
const box = document.getElementById("imgBox");

btn.addEventListener("click", async () => {
  try {
    const res = await fetch("https://api.thecatapi.com/v1/images/search");
    const data = await res.json();
    const img = document.createElement("img");
    img.src = data[0].url;
    img.style.maxWidth = "100%";
    img.style.maxHeight = "100%";
    img.classList.add("rounded");

    box.innerHTML = ""; // entfernt altes Bild oder Text
    box.appendChild(img);
  } catch (e) {
    console.error(e);
    box.innerHTML = "<p class='text-danger'>Fehler beim Laden 😿</p>";
  }
});


// === b) Bitcoin Preis ===
const btnBtc = document.getElementById("btn-btc");
const btcBox = document.getElementById("btcBox");

btnBtc.addEventListener("click", async () => {
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,chf");
    const data = await res.json();
    btcBox.innerHTML = `
      <p class="fw-bold text-dark m-1">💵 ${data.bitcoin.usd.toLocaleString()} USD</p>
      <p class="fw-bold text-dark m-1">🇨🇭 ${data.bitcoin.chf.toLocaleString()} CHF</p>
    `;
  } catch {
    btcBox.innerHTML = "<p class='text-danger'>Fehler beim Laden 😿</p>";
  }
});


// === c) Wetter Zürich ===
const btnWeather = document.getElementById("btn-weather");
const weatherBox = document.getElementById("weatherBox");

btnWeather.addEventListener("click", async () => {
  const LAT = 47.3769, LON = 8.5417;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&forecast_days=1&timezone=Europe/Zurich`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    const tMax = data.daily.temperature_2m_max[0];
    const tMin = data.daily.temperature_2m_min[0];
    const rain = data.daily.precipitation_sum[0];
    weatherBox.innerHTML = `
      <p class="fw-bold text-dark m-1">🌡️ Max: ${tMax}°C</p>
      <p class="fw-bold text-dark m-1">❄️ Min: ${tMin}°C</p>
      <p class="fw-bold text-dark m-1">🌧️ Niederschlag: ${rain} mm</p>
    `;
  } catch {
    weatherBox.innerHTML = "<p class='text-danger'>Fehler beim Laden ☁️</p>";
  }
});




















// --- Winterthur Koordinaten (Referenzpunkt) ---
const WINT_LAT = 47.4988;
const WINT_LON = 8.7237;

// --- Leaflet Loader ---
async function loadLeaflet() {
  if (window.L) return;
  const css = document.createElement("link");
  css.rel = "stylesheet";
  css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
  document.head.appendChild(css);
  await new Promise(res => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    s.onload = res;
    document.body.appendChild(s);
  });
}

// --- Helper: lesbaren Namen finden ---
function pickReadableName(st) {
  const names = st.ChargingStationNames || st.ChargingStationName || [];
  if (Array.isArray(names)) {
    for (const n of names) {
      if (n?.name && n.name.length > 2 && /[a-zA-Z]/.test(n.name)) return n.name.trim();
      if (typeof n === "string" && n.length > 2) return n.trim();
    }
  }
  const addr = st.Address || {};
  if (addr.Street && addr.City) return `${addr.Street}, ${addr.City}`;
  return "Unbekannt";
}

// --- Helper: Koordinaten finden ---
function parseGeoCoordinates(st) {
  const s = st.GeoCoordinates?.Google ?? "";
  if (typeof s === "string" && s.includes(" ")) {
    const [a, b] = s.split(" ").map(parseFloat);
    if (!isNaN(a) && !isNaN(b)) {
      return a > b ? { lat: b, lon: a } : { lat: a, lon: b };
    }
  }
  return null;
}

// --- Map state ---
let myMap = null;
let searchMarker = null;

// --- Tankstellen laden ---
document.getElementById("btn-stations").addEventListener("click", async () => {
  const stationBox = document.getElementById("stationBox");
  stationBox.innerHTML = "<p class='text-muted text-center'>Lade Daten...</p>";

  try {
    const resp = await fetch("https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json");
    const json = await resp.json();
    const records = json.EVSEData?.[0]?.EVSEDataRecord || [];

    const parsed = records.map(r => {
      const geo = parseGeoCoordinates(r);
      const addr = r.Address || {};
      return {
        name: pickReadableName(r),
        address: addr.Street || "-",
        zip: addr.PostalCode || "-",
        city: addr.City || "-",
        lat: geo?.lat ?? null,
        lon: geo?.lon ?? null
      };
    }).filter(p => p.lat && p.lon);

    // Doppelte entfernen
    const seen = new Set();
    const unique = parsed.filter(p => {
      const key = `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Distanz zu Winterthur
    const hav = (lat1, lon1, lat2, lon2) => {
      const R = 6371;
      const toRad = d => d * Math.PI / 180;
      const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
      return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    };

    const top5 = unique.map(u => ({ ...u, dist: hav(WINT_LAT, WINT_LON, u.lat, u.lon) }))
                      .sort((a,b) => a.dist - b.dist)
                      .slice(0,5);

    // Karte initialisieren
    if (!myMap) {
      await loadLeaflet();
      myMap = L.map("mapBox").setView([WINT_LAT, WINT_LON], 14);
      L.tileLayer(
        "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
        { maxZoom: 18, attribution: "© swisstopo" }
      ).addTo(myMap);
      L.circleMarker([WINT_LAT, WINT_LON], { radius: 7, color: "red", fillColor: "red", fillOpacity: 0.8 })
        .addTo(myMap)
        .bindPopup("Referenzpunkt: Winterthur");
    }

    // Vorherige Marker löschen (ausser Referenz)
    myMap.eachLayer(layer => {
      if (layer instanceof L.Marker && !layer._popup?.getContent()?.includes("Referenzpunkt")) {
        myMap.removeLayer(layer);
      }
    });

    // Buttons & Marker
    stationBox.innerHTML = "";
    top5.forEach(s => {
      const marker = L.marker([s.lat, s.lon]).addTo(myMap)
        .bindPopup(`<b>${s.name}</b><br>${s.address}, ${s.zip} ${s.city}<br><small>${s.dist.toFixed(2)} km</small>`);

      const btn = document.createElement("button");
      btn.className = "station-btn btn btn-light w-100 text-start mb-2 border";
      btn.innerHTML = `<b>${s.name}</b><br>${s.address}, ${s.zip} ${s.city} <small class="text-muted">(${s.dist.toFixed(2)} km)</small>`;

      btn.addEventListener("click", () => {
        myMap.setView([s.lat, s.lon], 16);
        marker.openPopup();
        document.querySelectorAll(".station-btn").forEach(b => b.classList.remove("btn-success"));
        btn.classList.add("btn-success");
      });

      btn.addEventListener("mouseenter", () => marker.openPopup());
      btn.addEventListener("mouseleave", () => marker.closePopup());

      stationBox.appendChild(btn);
    });
  } catch (e) {
    console.error(e);
    stationBox.innerHTML = "<p class='text-danger text-center'>Fehler beim Laden.</p>";
  }
});

// --- Suchfunktion auf Karte ---
document.getElementById("btnSearch").addEventListener("click", async () => {
  const query = document.getElementById("mapSearch").value.trim();
  if (!query) return;

  await loadLeaflet();
  if (!myMap) {
    myMap = L.map("mapBox").setView([WINT_LAT, WINT_LON], 14);
    L.tileLayer(
      "https://wmts.geo.admin.ch/1.0.0/ch.swisstopo.pixelkarte-farbe/default/current/3857/{z}/{x}/{y}.jpeg",
      { maxZoom: 18, attribution: "© swisstopo" }
    ).addTo(myMap);
  }

  const resp = await fetch(`https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=${encodeURIComponent(query)}&type=locations`);
  const data = await resp.json();
  if (data.results && data.results.length > 0) {
    const r = data.results[0];
    const [lon, lat] = r.attrs.latlon.split(",").map(parseFloat);

    if (!isNaN(lat) && !isNaN(lon)) {
      myMap.setView([lat, lon], 15);
      if (searchMarker) myMap.removeLayer(searchMarker);
      searchMarker = L.marker([lat, lon], { icon: L.icon({
        iconUrl: "https://cdn-icons-png.flaticon.com/512/854/854878.png",
        iconSize: [28, 28],
        iconAnchor: [14, 28],
        popupAnchor: [0, -28]
      })}).addTo(myMap).bindPopup(`📍 <b>${r.attrs.label}</b>`).openPopup();
    }
  } else {
    alert("Kein Ort gefunden.");
  }
});
