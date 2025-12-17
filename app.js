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
    box.innerHTML = "<p class='text-danger'>Fehler beim Laden</p>";
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
      <p class="fw-bold text-dark m-1">${data.bitcoin.usd.toLocaleString()} USD</p>
      <p class="fw-bold text-dark m-1">${data.bitcoin.chf.toLocaleString()} CHF</p>
    `;
  } catch {
    btcBox.innerHTML = "<p class='text-danger'>Fehler beim Laden</p>";
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
      <p class="fw-bold text-dark m-1">Max: ${tMax}°C</p>
      <p class="fw-bold text-dark m-1">Min: ${tMin}°C</p>
      <p class="fw-bold text-dark m-1">Niederschlag: ${rain} mm</p>
    `;
  } catch {
    weatherBox.innerHTML = "<p class='text-danger'>Fehler beim Laden</p>";
  }
});




















// ===============================
// d + e) Tankstellen + Karte
// ===============================

const WINT_LAT = 47.4988;
const WINT_LON = 8.7237;

const btnStations = document.getElementById("btn-stations");
const stationList = document.getElementById("stationList");
const mapBox = document.getElementById("mapBox");

let map;
let markers = [];

// -------------------------------
// Leaflet Loader
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

// -------------------------------
// Init Map
async function initMap() {
  if (map) return;

  await loadLeaflet();

  map = L.map("mapBox").setView([WINT_LAT, WINT_LON], 14);

  L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
      maxZoom: 19,
      attribution: "Leaflet | © OpenStreetMap contributors"
    }
  ).addTo(map);

  // Referenzpunkt Winterthur
  L.circleMarker([WINT_LAT, WINT_LON], {
    radius: 7,
    color: "red",
    fillOpacity: 1
  }).addTo(map).bindPopup("Winterthur");
}

// -------------------------------
// Distanz (Haversine)
function distanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) *
    Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// -------------------------------
// Lade Tankstellen
btnStations.addEventListener("click", async () => {
  stationList.innerHTML =
    `<div class="list-group-item text-muted text-center">Lade…</div>`;

  await initMap();

  try {
    const res = await fetch(
      "https://data.geo.admin.ch/ch.bfe.ladestellen-elektromobilitaet/data/ch.bfe.ladestellen-elektromobilitaet.json"
    );
    const json = await res.json();

    // ✅ KORREKT
    const records = json.EVSEData[0].EVSEDataRecord;

    const stations = [];
    const used = new Set();

    records.forEach(r => {
      if (!r.GeoCoordinates?.Google) return;

      const [lat, lon] = r.GeoCoordinates.Google.split(" ").map(Number);
      if (isNaN(lat) || isNaN(lon)) return;

      const addr = r.Address;
      if (!addr) return;

      const key = `${addr.Street}-${addr.HouseNum}-${addr.PostalCode}`;
      if (used.has(key)) return;
      used.add(key);

      const name =
        r.ChargingStationNames?.[0]?.value ||
        r.ChargingStationId ||
        "Ladestation";

      stations.push({
        name,
        lat,
        lon,
        address: `${addr.Street} ${addr.HouseNum}`,
        plz: addr.PostalCode,
        city: addr.City,
        dist: distanceKm(WINT_LAT, WINT_LON, lat, lon)
      });
    });

    const top5 = stations
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 5);

    // Cleanup
    markers.forEach(m => map.removeLayer(m));
    markers = [];
    stationList.innerHTML = "";

    top5.forEach(s => {
      const marker = L.marker([s.lat, s.lon])
        .addTo(map)
        .bindPopup(
          `<strong>${s.name}</strong><br>
           ${s.address}<br>
           ${s.plz} ${s.city}<br>
           ${s.dist.toFixed(2)} km`
        );

      markers.push(marker);

      const btn = document.createElement("button");
      btn.className = "list-group-item list-group-item-action";
      btn.innerHTML = `
        <strong>${s.name}</strong><br>
        ${s.address}, ${s.plz} ${s.city}<br>
        <small>(${s.dist.toFixed(2)} km)</small>
      `;

      btn.onclick = () => {
        map.setView([s.lat, s.lon], 16);
        marker.openPopup();
      };

      btn.onmouseenter = () => marker.openPopup();
      btn.onmouseleave = () => marker.closePopup();

      stationList.appendChild(btn);
    });

    // Zoom auf alles
    const group = L.featureGroup(markers);
    map.fitBounds(group.getBounds().pad(0.3));

  } catch (e) {
    console.error(e);
    stationList.innerHTML =
      `<div class="list-group-item text-danger text-center">
        Fehler beim Laden
       </div>`;
  }
});








































// === f) Bewerbungsformular (OHNE fetch, CORS-sicher) ===
const form = document.getElementById("applicationForm");

if (form) {

  // Mehrfaches Absenden verhindern
  if (sessionStorage.getItem("applicationSent") === "true") {
    const btn = form.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.innerHTML = "Bereits abgeschickt ✔";
  }

  form.addEventListener("submit", (e) => {

    if (!form.checkValidity()) {
      e.preventDefault();
      form.classList.add("was-validated");
      return;
    }

    const btn = form.querySelector("button[type='submit']");
    btn.disabled = true;
    btn.innerHTML = "Wird gesendet...";

    sessionStorage.setItem("applicationSent", "true");
    // KEIN preventDefault → Browser sendet selbst!
  });
}
