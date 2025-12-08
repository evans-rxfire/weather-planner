const propertyName = document.getElementById("property-name");
const latitudeInput = document.getElementById("latitude-input");
const longitudeInput = document.getElementById("longitude-input");

let rawForecastData = [];

const windDirectionRanges = {
    N: [[338, 360], [0, 22]],
    NE: [[23, 67]],
    E: [[68, 112]],
    SE: [[113, 157]],
    S: [[158, 202]],
    SW: [[203, 247]],
    W: [[248, 292]],
    NW: [[293, 337]]
};

const outputHeader = document.getElementById("output-header");
const outputContainer = document.getElementById("output-container");

const submitBtn = document.getElementById("submit-button");
const saveBtn = document.getElementById("save-button");
const clearBtn = document.getElementById("clear-button");

let deferredPrompt;
const installBtn = document.getElementById("install-button");

const DEBUG = false;


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./service-worker.js')
      .then((reg) => debugLog("Service Worker registered:", reg.scope))
      .catch((err) => debugLog("Service Worker registration failed:", err));
  });
}


// FUNCTIONS

// Debugging
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}


// Conversion/Helper functions
function convertCtoF(c) {
    if (c === null || c === undefined) return null;
    return (c * 9/5) + 32;
}

function convertKmHtoMph(kmh) {
    if (kmh === null || kmh === undefined) return null;
    return kmh * 0.621371;
}

function convertMetersToFeet(m) {
    if (!m && m !== 0) return null;
    return m * 3.28084;
}

function safeFloor(value, converter = v => v) {
    if (value === null || value === undefined) return null;
    return Math.floor(converter(value));
}

function formatForecastLocalTime(isoString, timeZone) {
    return new Date(isoString).toLocaleString("en-US", {
        timeZone: timeZone || "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false 
    });
}

function getLocalHourFromFormattedTime(isoString, timeZone) {
    const formatted = formatForecastLocalTime(isoString, timeZone);
    // example: "Sat, Dec 6, 21:00"
    const timePart = formatted.split(", ").pop(); // "21:00"
    const [hour] = (timePart.split(":"));        // 21
    return hour.padStart(2, "0") + "00";
}

function formatDateHeader(isoString, timeZone) {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
        timeZone,
        weekday: "short",
        month: "numeric",
        day: "numeric"
    });
}

function getNumberValue(inputEl) {
    if (!inputEl) return null;
    const value = inputEl.value.trim();
    return value === "" ? null : Number(value);
}

function isDegreeInRange(deg, range) {
    return deg >= range[0] && deg <= range[1];
}

// Helper: get local hour (0-23) from UTC ISO + timezone
function getLocalHourFromUTC(isoString, timeZone) {
  // returns numeric hour 0-23 in forecast location tz
    const parts = new Date(isoString).toLocaleString("en-US", {
        timeZone,
        hour12: false,
        hour: "2-digit"
    });
  // parts like "04" or "16" or " 4" depending; force number
  return Number(parts.match(/\d{1,2}/)[0]);
}

// Helper: format date header (Mon 12/6) using timezone
function formatDateHeader(isoString, timeZone) {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, {
        timeZone,
        weekday: "short",
        month: "numeric",
        day: "numeric"
    })
    .replace(",", "");
}

// Check if PWA to disable location info fetch from Nominatim
function isPWA() {
    return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}


// Get data from weather API
async function fetchForecastData(lat, lon) {
    const pointUrl = `https://api.weather.gov/points/${lat},${lon}`;
    debugLog(`Fetching point data from: ${pointUrl}`);

    try {
        const pointResponse = await fetch(pointUrl);
        debugLog("Point response status:", pointResponse.status);

        if (!pointResponse.ok) {
            throw new Error(`Point forecast not found (status: ${pointResponse.status})`);
        }
        const pointData = await pointResponse.json();
        const forecastUrl = pointData.properties.forecastGridData;
        debugLog(`Fetching hourly forecast from: ${forecastUrl}`); 

        const forecastResponse = await fetch(forecastUrl);
        debugLog("Forecast response status:", forecastResponse.status); 

        if (!forecastResponse.ok) {
            throw new Error(`Hourly forecast not found (status: ${forecastResponse.status})`);
        }
        const forecastGridData = await forecastResponse.json();

        return {
            gridData: forecastGridData,
            timeZone: pointData.properties.timeZone,
            locationName: pointData.properties.relativeLocation?.properties?.city || null
        };

    } catch (error) {
        console.error("Error fetching forecast data:", error);
        throw error;
    }
}

async function loadForecastData(lat, lon) {
    const result = await fetchForecastData(lat, lon);
    return result;
}


// Functions to process forecast data into more easily usable format
// Extract gridForecast.properties needed
function getFireWeatherForecastData(gridData) {
    const props = gridData.properties;

    return {
        temperature: props.temperature || null,
        dewpoint: props.dewpoint || null,
        relativeHumidity: props.relativeHumidity || null,
        twentyFootWindSpeed: props.twentyFootWindSpeed || null,
        twentyFootWindDirection: props.twentyFootWindDirection || null,
        skyCover: props.skyCover || null,
        probabilityOfPrecipitation: props.probabilityOfPrecipitation || null,
        mixingHeight: props.mixingHeight || null,
        transportWindSpeed: props.transportWindSpeed || null,
        transportWindDirection: props.transportWindDirection || null
    };
}

// Weather data ISO-8601 duration parser
function parseDurationToHours(duration) {
    const dayMatch = duration.match(/(\d+)D/);
    const hourMatch = duration.match(/(\d+)H/);

    const days = dayMatch ? parseInt(dayMatch[1], 10) : 0;
    const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;

    return (days * 24) + hours;
}

// Expand a single validTime entry
function expandValidTimeEntry(entry) {
    const [startTimeStr, durationStr] = entry.validTime.split("/");
    const durationHours = parseDurationToHours(durationStr);

    const start = new Date(startTimeStr);
    const expanded = [];

    for (let i = 0; i < durationHours; i++) {
        const t = new Date(start);
        t.setHours(start.getHours() + i);

        expanded.push({
            time: t.toISOString(),
            value: entry.value
        });
    }

    return expanded;
}

// Expand single field in fireWeatherData
function expandedSingleField(field) {
    if (!field || !field.values) return [];

    let expanded = [];

    field.values.forEach(entry => {
        expanded.push(...expandValidTimeEntry(entry));
    });

    return expanded;
}

// Expand all weather fields
function expandForecastData(fireWeatherData) {
    const expanded = {};

    for (const [key, field] of Object.entries(fireWeatherData)) {
        expanded[key] = expandedSingleField(field);
    }

    return expanded;
}

// Merge forecast data by time stamp
function mergeExpandedForecast(expandedData) {
    const timeline = {};

    for (const [field, values] of Object.entries(expandedData)) {
        values.forEach(({ time, value }) => {
            if (!timeline[time]) timeline[time] = { time };
            timeline[time][field] = value;
        });
    }

    // Convert object → sorted array
    return Object.values(timeline).sort(
        (a, b) => new Date(a.time) - new Date(b.time)
    );
}

// Normalize weather forecast data
function normalizeForecastData(mergedData, forecastTimezone) {
    return mergedData.map(entry => ({
        timeUTC: entry.time,
        displayTime: formatForecastLocalTime(entry.time, forecastTimezone),
        temperature: safeFloor(convertCtoF(entry.temperature)),
        dewpoint: safeFloor(convertCtoF(entry.dewpoint)),
        relativeHumidity: entry.relativeHumidity ?? null,
        twentyFootWindSpeed: safeFloor(convertKmHtoMph(entry.twentyFootWindSpeed)),
        twentyFootWindDirection: entry.twentyFootWindDirection ?? null,
        mixingHeight: safeFloor(convertMetersToFeet(entry.mixingHeight)),
        transportWindSpeed: safeFloor(convertKmHtoMph(entry.transportWindSpeed)),
        transportWindDirection: entry.transportWindDirection ?? null,
        skyCover: entry.skyCover ?? null,
        probabilityOfPrecipitation: entry.probabilityOfPrecipitation ?? null
    }));
}


// Functions to process form input data
function getCheckedDirs(name) {
    return Array.from(document.querySelectorAll(`input[name="${name}"]:checked`)).map(el => el.value);
}

function setCheckedDirs(groupName, checkedValues) {
    if (!Array.isArray(checkedValues)) {
        console.warn(`checkedValues for "${groupName}" is not an array:`, checkedValues);
        return;
    }

    const checkboxes = document.querySelectorAll(`input[name="${groupName}"]`);
    checkboxes.forEach(cb => {
        cb.checked = checkedValues.includes(cb.value);
    });
}

function getPreferredAndAcceptable() {
    return {
        preferred: {
            temp: {
                min: document.getElementById("preferred-min-temp"),
                max: document.getElementById("preferred-max-temp"),
            },
            rh: {
                min: document.getElementById("preferred-min-rh"),
                max: document.getElementById("preferred-max-rh"),
            },
            windSpeed: {
                min: document.getElementById("preferred-min-wind-speed"),
                max: document.getElementById("preferred-max-wind-speed"),
            },
            windDirs: () => getCheckedDirs("preferredWindDir")
        },

        acceptable: {
            temp: {
                min: document.getElementById("acceptable-min-temp"),
                max: document.getElementById("acceptable-max-temp"),
            },
            rh: {
                min: document.getElementById("acceptable-min-rh"),
                max: document.getElementById("acceptable-max-rh"),
            },
            windSpeed: {
                min: document.getElementById("acceptable-min-wind-speed"),
                max: document.getElementById("acceptable-max-wind-speed"),
            },
            windDirs: () => getCheckedDirs("acceptableWindDir")
        }
    };
}


// Functions to compare user inputs to forecast data
function matchesWindDirGroup(userDirs, forecastDirDegrees) {
    if (!userDirs || userDirs.length === 0) return true; // if user doesn't select directions, allow all

    return userDirs.some(dir => {
        const ranges = windDirectionRanges[dir];
        if (!ranges) return false;

        return ranges.some(range => isDegreeInRange(forecastDirDegrees, range));
    });
}

function determineStatus(entry, preferred, acceptable) {
    const temp = entry.temperature;
    const rh = entry.relativeHumidity;
    const windSpeed = entry.twentyFootWindSpeed;
    const windDir = entry.twentyFootWindDirection;

    if (
        temp >= preferred.temp.min && temp <= preferred.temp.max &&
        rh >= preferred.rh.min && rh <= preferred.rh.max &&
        windSpeed >= preferred.windSpeed.min && windSpeed <= preferred.windSpeed.max &&
        matchesWindDirGroup(preferred.windDirs, windDir)
    ) {
        return "preferred";
    } 
    else if (
        temp >= acceptable.temp.min && temp <= acceptable.temp.max &&
        rh >= acceptable.rh.min && rh <= acceptable.rh.max &&
        windSpeed >= acceptable.windSpeed.min && windSpeed <= acceptable.windSpeed.max &&
        matchesWindDirGroup(acceptable.windDirs, windDir)
    ) {
        return "acceptable";
    } 
    else {
        return "unsuitable";
    }
}


// Function to retrieve location information from Nominatim
async function fetchLocationDetails(lat, lon) {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=8&addressdetails=1`;

    try {
        const response = await fetch(nominatimUrl, {
            headers: {
                "User-Agent": "RxBurnWeatherPlanner/1.0 (evans.rxfire@gmail.com) "
            }
        });

        if (!response.ok) {
            throw new Error(`Location lookup failed (status: ${response.status})`);
        }

        const data = await response.json();
        const address = data.address || {};

        return {
            county: address.county || "Unknown County",
            state: address.state || "Unknown State"
        };
    } catch (error) {
        console.error("Error fetching location details:", error);
        return {
            county: "Unknown County",
            state: "Unknown State"
        };
    }
}

async function loadLocationData(lat, lon) {
    return await fetchLocationDetails(lat, lon);
}


// Functions to build output on index.html to show acceptibility
// Build legend for output-container
function buildLegend() {
    const legendContainer = document.getElementById("legend-container");
    legendContainer.innerHTML = "";
    const legendItems = [
        { label: "Preferred", color: "bg-sky-300 dark:bg-sky-600" },
        { label: "Acceptable", color: "bg-green-300 dark:bg-green-700" },
        { label: "Not in Prescription", color: "bg-gray-300 dark:bg-gray-600" },
        { label: "Insufficient Data", color: "bg-yellow-300 dark:bg-yellow-600" }
    ];

    const wrapper = document.createElement("div");
    wrapper.className = "flex justify-center gap-4 mb-4 text-sm";

    legendItems.forEach(item => {
        const itemDiv = document.createElement("div");
        itemDiv.className = `flex items-center gap-2`;

        const colorBox = document.createElement("div");
        colorBox.className = `${item.color} w-6 h-6 rounded`;

        const label = document.createElement("span");
        label.textContent = item.label;

        itemDiv.appendChild(colorBox);
        itemDiv.appendChild(label);
        wrapper.appendChild(itemDiv);
    });

    legendContainer.appendChild(wrapper);
}

function buildForecastTable(evaluatedData, location, forecastTimezone) {
    clearForecastGrid();

    outputHeader.textContent += ` for: ${propertyName.value || ""}${location ? `, ${location.county}, ${location.state}` : ""}`;

    // group entries by local date (yyyy-mm-dd)
    const grouped = {};
    evaluatedData.forEach(item => {
        // compute local date string in forecast timezone (YYYY-MM-DD)
        const localDate = new Date(item.timeUTC).toLocaleDateString("en-CA", { timeZone: forecastTimezone }); // en-CA => YYYY-MM-DD
        if (!grouped[localDate]) grouped[localDate] = [];
        grouped[localDate].push(item);
    });

    // sort dates ascending
    const dates = Object.keys(grouped).sort((a,b) => new Date(a) - new Date(b));

    // build lookup: groupedByDateHour[date][hour] = period
    const groupedByDateHour = {};
    dates.forEach(date => {
        groupedByDateHour[date] = {};
        grouped[date].forEach(period => {
        const hourKey = getLocalHourFromFormattedTime(period.timeUTC, forecastTimezone);
        groupedByDateHour[date][hourKey] = period;
        });
    });

    // create table element
    const tableWrapper = document.createElement("div");
    tableWrapper.className = "overflow-auto";

    const table = document.createElement("table");
    table.className = "min-w-full table-auto border-collapse";

    // header row: first empty cell + one cell per date
    const thead = document.createElement("thead");
    const headRow = document.createElement("tr");

    dates.forEach(date => {
        // pick an ISO from grouped[date][0] for nice label
        const sample = grouped[date][0];
        const th = document.createElement("th");
        th.className = "px-2 py-1 text-center";
        th.textContent = formatDateHeader(sample.timeUTC, forecastTimezone);
        headRow.appendChild(th);
    });

    thead.appendChild(headRow);
    table.appendChild(thead);

    // body: 24 rows for 00..23
    const tbody = document.createElement("tbody");

    for (let h = 0; h < 24; h++) {
        const tr = document.createElement("tr");

        // one cell per date
        for (const date of dates) {
        const td = document.createElement("td");
        td.className = "p-1 text-center align-middle";

        const hourKey = String(h).padStart(2, "0") + "00";
        const period = groupedByDateHour[date][hourKey];

        if (!period) {
            // no data for that hour
            td.className += " bg-transparent";
            td.textContent = "";
            td.title = `No data for ${date} ${hourKey}:00`;
        } else {
            // determine completeness: required fields
            const requiredFields = [
                "temperature",
                "relativeHumidity",
                "twentyFootWindSpeed",
                "twentyFootWindDirection"
            ];
            const isComplete = requiredFields.every(f => period[f] !== null && period[f] !== undefined);

            // choose color
            let colorClass = "";
            if (!isComplete) {
            colorClass = "bg-yellow-300 dark:bg-yellow-600 dark:text-white"; // incomplete
            } else if (period.status === "preferred") {
            colorClass = "bg-sky-300 dark:bg-sky-600 dark:text-white";
            } else if (period.status === "acceptable") {
            colorClass = "bg-green-300 dark:bg-green-700 dark:text-white";
            } else {
            colorClass = "bg-gray-300 dark:bg-gray-600 dark:text-white";
            }

            td.className += ` ${colorClass} rounded text-sm font-medium border border-gray-100 dark:border-gray-800`;

            // cell content — keep compact: show hour and optionally a short metric
            td.textContent = `${hourKey}`;

            // tooltip with details (use template literals, trim)
            const titleLines = [
            `Date/time: ${formatForecastLocalTime(period.timeUTC, forecastTimezone)}`,
            `Temp: ${period.temperature ?? "NA"}°F`,
            `RH: ${period.relativeHumidity ?? "NA"}%`,
            `20ft Wind: ${period.twentyFootWindSpeed ?? "NA"} mph @ ${period.twentyFootWindDirection ?? "NA"}°`,
            `Status: ${period.status}`,
            !isComplete ? "INCOMPLETE: missing required fields" : ""
            ].filter(Boolean);

            td.title = titleLines.join("\n");
        }

        tr.appendChild(td);
        }

        tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    tableWrapper.appendChild(table);

    outputContainer.appendChild(tableWrapper);
}


// These functions will need updated if adding mixing height and transport winds to form
// Save form data for future use
function saveFormData() {
    const name = propertyName.value;
    const lat = latitudeInput.value;
    const lon = longitudeInput.value;

    const getRangeValues = (rangeGroup) => ({
        min: rangeGroup.min.value,
        max: rangeGroup.max.value
    });

    const { preferred, acceptable } = getPreferredAndAcceptable();

    const formData = {
        propertyName: name,
        lat,
        lon,
        preferred: {
            temp: {
                min: preferred.temp.min.value,
                max: preferred.temp.max.value,
            },
            rh: {
                min: preferred.rh.min.value,
                max: preferred.rh.max.value,
            },
            windSpeed: {
                min: preferred.windSpeed.min.value,
                max: preferred.windSpeed.max.value,
            },
            windDirs: preferred.windDirs()
        },
        acceptable: {
            temp: {
                min: acceptable.temp.min.value,
                max: acceptable.temp.max.value,
            },
            rh: {
                min: acceptable.rh.min.value,
                max: acceptable.rh.max.value,
            },
            windSpeed: {
                min: acceptable.windSpeed.min.value,
                max: acceptable.windSpeed.max.value,
            },
            windDirs: acceptable.windDirs()
        }
    };

    try {
        localStorage.setItem("burnPlannerSettings", JSON.stringify(formData));
        debugLog("Form data saved to localStorage:", formData);
    } catch (error) {
        console.error("Failed to save form data:", error);
    }
}

// Load form data
function loadFormData() {
    const savedData = JSON.parse(localStorage.getItem("burnPlannerSettings"));
    if (!savedData) return;

    propertyName.value = savedData.propertyName || "";
    latitudeInput.value = savedData.lat || "";
    longitudeInput.value = savedData.lon || "";

    const { preferred, acceptable } = getPreferredAndAcceptable();

    preferred.temp.min.value = savedData.preferred.temp.min;
    preferred.temp.max.value = savedData.preferred.temp.max;
    preferred.rh.min.value = savedData.preferred.rh.min;
    preferred.rh.max.value = savedData.preferred.rh.max;
    preferred.windSpeed.min.value = savedData.preferred.windSpeed.min;
    preferred.windSpeed.max.value = savedData.preferred.windSpeed.max;

    acceptable.temp.min.value = savedData.acceptable.temp.min;
    acceptable.temp.max.value = savedData.acceptable.temp.max;
    acceptable.rh.min.value = savedData.acceptable.rh.min;
    acceptable.rh.max.value = savedData.acceptable.rh.max;
    acceptable.windSpeed.min.value = savedData.acceptable.windSpeed.min;
    acceptable.windSpeed.max.value = savedData.acceptable.windSpeed.max;

    if (Array.isArray(savedData.preferred.windDirs)) {
        setCheckedDirs("preferredWindDir", savedData.preferred.windDirs);
    }

    if (Array.isArray(savedData.acceptable.windDirs)) {
        setCheckedDirs("acceptableWindDir", savedData.acceptable.windDirs);
    }
}

// Clear form data 
function clearFormData() {
    propertyName.value = "";
    latitudeInput.value = "";
    longitudeInput.value = "";

    const { preferred, acceptable } = getPreferredAndAcceptable();

    preferred.temp.min.value = "";
    preferred.temp.max.value = "";
    preferred.rh.min.value = "";
    preferred.rh.max.value = "";
    preferred.windSpeed.min.value = "";
    preferred.windSpeed.max.value = "";

    acceptable.temp.min.value = "";
    acceptable.temp.max.value = "";
    acceptable.rh.min.value = "";
    acceptable.rh.max.value = "";
    acceptable.windSpeed.min.value = "";
    acceptable.windSpeed.max.value = "";

    function clearChecked(groupName) {
        const checkboxes = document.querySelectorAll(`input[name="${groupName}"]`);
        checkboxes.forEach(cb => {
        cb.checked = false;
        });
    }
    clearChecked("preferredWindDir");
    clearChecked("acceptableWindDir");
    }

// Clear forecast grid
function clearForecastGrid() {
    outputContainer.innerHTML = "";
    outputHeader.textContent = outputHeader.dataset.base;
}

// Error message functions
function showErrorMessage(msg) {
    const errorDiv = document.getElementById("error-message");
    errorDiv.textContent = msg;
    errorDiv.classList.remove("hidden");
}

function clearErrorMessage() {
    const errorDiv = document.getElementById("error-message");
    errorDiv.textContent = "";
    errorDiv.classList.add("hidden");
}


// EVENT LISTENERS
document.addEventListener("DOMContentLoaded", loadFormData);


// EVENT LISTENER for submit button --- fetch weather data, evaluate burn periods, and populate output
submitBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    clearForecastGrid();
    clearErrorMessage();

    const lat = parseFloat(latitudeInput.value);
    const lon = parseFloat(longitudeInput.value);

    if (isNaN(lat) || isNaN(lon)) {
        showErrorMessage("Please enter valid latitude and longitude coordinates.");
        return;
    }

    try {
        let location = { county: "Unknown County", state: "Unknown State" };
        if (window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true) {
            console.warn("PWA mode detected. Skipping location lookup.");

            const locationNotice = document.createElement("span");
            locationNotice.className = "text-md text-blue-600 dark:text-blue-500";
            locationNotice.textContent = "(Location information is unavailable in installed mode)";

            outputHeader.appendChild(locationNotice);
        } else {
            debugLog("Fetching location data for:", lat, lon);
            location = await loadLocationData(lat, lon);
        }

        debugLog("Loading forecast data for:", lat, lon);
        const result = await loadForecastData(lat, lon);

        const rawForecastData = result.gridData;
        const forecastTimezone = result.timeZone;

        const fireWeatherData = getFireWeatherForecastData(rawForecastData);
        debugLog("Extracted Fire Weather Data:", fireWeatherData);

        const expandedFireWeatherData = expandForecastData(fireWeatherData);
        debugLog("Expanded Fire Weather Data:", expandedFireWeatherData);

        const mergedFireWeatherData = mergeExpandedForecast(expandedFireWeatherData);
        debugLog("Merged Fire Weather Data:", mergedFireWeatherData);

        const normalizedFireWeatherData = normalizeForecastData(mergedFireWeatherData, forecastTimezone);
        debugLog("Normalized Fire Weather Data:", normalizedFireWeatherData)
        
        const prefs = getPreferredAndAcceptable();

        const preferred = {
            temp: {
                min: Number(prefs.preferred.temp.min.value),
                max: Number(prefs.preferred.temp.max.value),
            },
            rh: {
                min: Number(prefs.preferred.rh.min.value),
                max: Number(prefs.preferred.rh.max.value),
            },
            windSpeed: {
                min: Number(prefs.preferred.windSpeed.min.value),
                max: Number(prefs.preferred.windSpeed.max.value),
            },
            windDirs: prefs.preferred.windDirs()
        };

        const acceptable = {
            temp: {
                min: Number(prefs.acceptable.temp.min.value),
                max: Number(prefs.acceptable.temp.max.value),
            },
            rh: {
                min: Number(prefs.acceptable.rh.min.value),
                max: Number(prefs.acceptable.rh.max.value),
            },
            windSpeed: {
                min: Number(prefs.acceptable.windSpeed.min.value),
                max: Number(prefs.acceptable.windSpeed.max.value),
            },
            windDirs: prefs.acceptable.windDirs()
        };

        const evaluatedForecast = normalizedFireWeatherData.map(period => {
        const status = determineStatus(period, preferred, acceptable);

            return {
                ...period,
                status
            };
        });

        // console.table(evaluatedForecast);

        buildLegend();
        buildForecastTable(evaluatedForecast, location, forecastTimezone);

    } catch (error) {
        console.error("Error caught in event listener:", error);
        showErrorMessage("No forecast data found for this location. Please check your latitude and longitude.");
    }
});


// EVENT LISTENERS for handling form data
saveBtn.addEventListener("click", () => {
    saveFormData();

    const saveMessage = document.getElementById("save-message");
    saveMessage.classList.remove("hidden");

    setTimeout(() => {
        saveMessage.classList.add("hidden");
    }, 2000);
    
    saveBtn.disabled = true;
    setTimeout(() => saveBtn.disabled = false, 1000);
});


clearBtn.addEventListener("click", () => {
    clearFormData();
    clearForecastGrid();
});


// App install language
installBtn?.classList.add("hidden");


window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;

    installBtn?.classList.remove("hidden");
});


installBtn?.addEventListener("click", async () => {
    if (!deferredPrompt) return;

    deferredPrompt.prompt();

    const { outcome } = await deferredPrompt.userChoice;
    debugLog("User choice:", outcome);

    deferredPrompt = null;
    installBtn?.classList.add("hidden");
});


window.addEventListener("appinstalled", () => {
    debugLog("✅ App installed");
    deferredPrompt = null;
    installBtn?.classList.add("hidden");
});
