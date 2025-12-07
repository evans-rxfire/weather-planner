const htmlElement = document.documentElement;

const propertyName = document.getElementById("property-name");
const latitudeInput = document.getElementById("latitude-input");
const longitudeInput = document.getElementById("longitude-input");

let forecastPeriods = [];

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

const darkModeBtn = document.getElementById("dark-mode-toggle");

const DEBUG = false;


if (darkModeBtn) {
    darkModeBtn.addEventListener("click", () => {
        htmlElement.classList.toggle("dark");
        localStorage.setItem("theme", htmlElement.classList.contains("dark") ? "dark" : "light");
    });

    window.addEventListener("DOMContentLoaded", () => {
        const savedTheme = localStorage.getItem("theme");
        if (savedTheme === "dark") {
            htmlElement.classList.add("dark");
        }
    });
}


// FUNCTIONS

// Debugging
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}

// Conversion functions
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
        hour12: false  // 24-hour format
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
            time: t.toISOString(), // keep standardized
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

    // clearForecastGrid();
    clearErrorMessage();

    const lat = parseFloat(latitudeInput.value);
    const lon = parseFloat(longitudeInput.value);

    if (isNaN(lat) || isNaN(lon)) {
        showErrorMessage("Please enter valid latitude and longitude coordinates.");
        return;
    }

    try {
        debugLog("Loading forecast data for:", lat, lon);
        const result = await loadForecastData(lat, lon);

        const rawForecastData = result.gridData;
        const forecastTimezone = result.timeZone;

        const fireWeatherData = getFireWeatherForecastData(rawForecastData);
        // console.log("Extracted Fire Weather Data:", fireWeatherData);

        const expandedFireWeatherData = expandForecastData(fireWeatherData);
        // console.log("Expanded Fire Weather Data:", expandedFireWeatherData);

        const mergedFireWeatherData = mergeExpandedForecast(expandedFireWeatherData);
        // console.log("Merged Fire Weather Data:", mergedFireWeatherData);

        const normalizedFireWeatherData = normalizeForecastData(mergedFireWeatherData, forecastTimezone);
        console.log("Normalized Fire Weather Data:", normalizedFireWeatherData)
        
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

        console.table(evaluatedForecast);

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
