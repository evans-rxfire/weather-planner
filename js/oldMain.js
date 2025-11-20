const htmlElement = document.documentElement;

const propertyName = document.getElementById("property-name");
const latitudeInput = document.getElementById("latitude-input");
const longitudeInput = document.getElementById("longitude-input");

let forecastPeriods = [];

const windDirectionGroups = {
  	N: ["N", "NNE", "NNW"],
  	NE: ["NE", "NNE", "ENE"],
  	E: ["E", "ENE", "ESE"],
  	SE: ["SE", "SSE", "ESE"],
  	S: ["S", "SSE", "SSW"],
  	SW: ["SW", "SSW", "WSW"],
  	W: ["W", "WSW", "WNW"],
  	NW: ["NW", "NNW", "WNW"]
};

const outputHeader = document.getElementById("output-header");
const outputContainer = document.getElementById("output-container");

const submitBtn = document.getElementById("submit-button");
const saveBtn = document.getElementById("save-button");
const clearBtn = document.getElementById("clear-button");

let deferredPrompt;
const installBtn = document.getElementById("install-button");

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
        const forecastUrl = pointData.properties.forecastHourly;
        debugLog(`Fetching hourly forecast from: ${forecastUrl}`); 

        const forecastResponse = await fetch(forecastUrl);
        debugLog("Forecast response status:", forecastResponse.status); 

        if (!forecastResponse.ok) {
            throw new Error(`Hourly forecast not found (status: ${forecastResponse.status})`);
        }
        const forecastData = await forecastResponse.json();

        return forecastData.properties.periods;
    } catch (error) {
        console.error("Error fetching forecast data:", error);
        throw error;
    }
}

async function loadForecastData(lat, lon) {
  forecastPeriods = await fetchForecastData(lat, lon);
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


// Functions to work through weather forecast data
function processForecastData(periods) {
    return periods.map((period) => {
        const dateObj = new Date(period.startTime);
        
        const hour = String(dateObj.getHours()).padStart(2, '0') + '00';
        
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        const date = `${year}-${month}-${day}`;

        return {
            date: date,
            hour: hour,
            temp: period.temperature,
            rh: period.relativeHumidity.value,
            windSpeed: parseInt(period.windSpeed),
            windDir: period.windDirection,
            startTime: period.startTime
        };
  	});
}

function filterBurnPeriods(periods) {
    return periods.filter((period) => {
        const hourInt = parseInt(period.hour);
        return hourInt >= 800 && hourInt <= 2000;
    });
}


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
    }
}

function matchesWindDirGroup(userDirs, forecastDir) {
  	return userDirs.some(userDir => {
    	const group = windDirectionGroups[userDir] || [];
    	return group.includes(forecastDir);
  	});
}


function determineStatus(period, preferred, acceptable) {
    const { temp, rh, windSpeed, windDir } = period;

    if (
        temp >= preferred.temp.min && temp <= preferred.temp.max &&
        rh >= preferred.rh.min && rh <= preferred.rh.max &&
        windSpeed >= preferred.windSpeed.min && windSpeed <= preferred.windSpeed.max &&
        matchesWindDirGroup(preferred.windDirs, windDir)
    ) {
        return "preferred";
    } else if (
        temp >= acceptable.temp.min && temp <= acceptable.temp.max &&
        rh >= acceptable.rh.min && rh <= acceptable.rh.max &&
        windSpeed >= acceptable.windSpeed.min && windSpeed <= acceptable.windSpeed.max &&
        matchesWindDirGroup(acceptable.windDirs, windDir)
    ) {
        return "acceptable";
    } else {
        return "unsuitable";
    }
}

// Build legend for output-container in index.html
function buildLegend() {
    const legendContainer = document.getElementById("legend-container");
    legendContainer.innerHTML = "";
    const legendItems = [
        { label: "Preferred", color: "bg-sky-300 dark:bg-sky-600" },
        { label: "Acceptable", color: "bg-green-300 dark:bg-green-700" },
        { label: "Not in Prescription", color: "bg-gray-300 dark:bg-gray-600" },
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

// Populate forecast grid in index.html
function buildForecastGrid(evaluatedBurnPeriodData, location) {
    clearForecastGrid();

    outputHeader.textContent += ` for: ${propertyName.value}, ${location.county}, ${location.state}`;

    const groupedByDate = evaluatedBurnPeriodData.reduce((groups, period) => {
        if (!groups[period.date]) {
            groups[period.date] = [];
        }
        groups[period.date].push(period);
        return groups;
    }, {});

    const burnHours = [
        "0800", "0900", "1000", "1100", "1200", "1300",
        "1400", "1500", "1600", "1700", "1800", "1900", "2000"
    ];

    const gridContainer = document.createElement("div");
    gridContainer.className = "flex gap-2 justify-center";

    for (const [date, periods] of Object.entries(groupedByDate)) {
        const dayColumn = document.createElement("div");
        dayColumn.className = "flex flex-col w-28 border border-gray-300 dark:border-gray-600 rounded p-3 shadow-sm bg-white dark:bg-gray-900";

        const firstPeriodDate = new Date(periods[0].startTime);
        const dayName = firstPeriodDate.toLocaleDateString(undefined, { weekday: "short" });
        const month = firstPeriodDate.getMonth() + 1;
        const day = firstPeriodDate.getDate();

        const dateHeader = document.createElement("div");
        dateHeader.textContent = `${dayName} ${month}/${day}`;
        dateHeader.className = "font-semibold mb-2 text-center text-lg text-gray-700 dark:text-gray-200";

        dayColumn.appendChild(dateHeader);

        burnHours.forEach((hour) => {
            const period = periods.find(p => p.hour === hour);

            const hourDiv = document.createElement("div");
            hourDiv.className = "p-3 mb-2 rounded-lg text-sm font-medium text-center cursor-default";

            if (period) {
                hourDiv.textContent = `${period.hour}`;
                hourDiv.className += ` ${
                    period.status === "preferred"
                        ? "bg-sky-300 dark:bg-sky-600 dark:text-white"
                        : period.status === "acceptable"
                        ? "bg-green-300 dark:bg-green-700 dark:text-white"
                        : "bg-gray-300 dark:bg-gray-600 dark:text-white"
                }`;

                hourDiv.title = `
                    Date: ${period.date}
                    Hour: ${period.hour}
                    Temp: ${period.temp}\u00B0F
                    RH: ${period.rh}%
                    Wind Speed: ${period.windSpeed}mph
                    Wind Direction: ${period.windDir}
                    Status: ${period.status}
                `.trim();
            } else {
                hourDiv.className += " bg-transparent";
                hourDiv.textContent = "";
                hourDiv.title = `No data for ${hour}`;
            }

            dayColumn.appendChild(hourDiv);
        });

        gridContainer.appendChild(dayColumn);
    }

    outputContainer.appendChild(gridContainer);
}


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

    const { preferred, acceptable } = getPreferredAndAcceptable();
        
    const getRangeValues = (range) => ({
        min: parseFloat(range.min.value),
        max: parseFloat(range.max.value)
    });

    try {
        debugLog("Loading forecast data for:", lat, lon);
        await loadForecastData(lat, lon);

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

        debugLog("Raw forecastPeriods array:", forecastPeriods);

        const structuredForecast = processForecastData(forecastPeriods);
        debugLog("Processed structuredForecast:", structuredForecast);

        const burnPeriodData = filterBurnPeriods(structuredForecast);
        debugLog("Filtered burnPeriodData (0800-2000):", burnPeriodData);

        const preferredValues = {
            temp: getRangeValues(preferred.temp),
            rh: getRangeValues(preferred.rh),
            windSpeed: getRangeValues(preferred.windSpeed),
            windDirs: preferred.windDirs()
        };
        debugLog("Preferred values:", preferredValues);

        const acceptableValues = {
            temp: getRangeValues(acceptable.temp),
            rh: getRangeValues(acceptable.rh),
            windSpeed: getRangeValues(acceptable.windSpeed),
            windDirs: acceptable.windDirs()
        };
        debugLog("Acceptable values:", acceptableValues);

        const evaluatedBurnPeriodData = burnPeriodData.map(period => ({
            ...period,
            status: determineStatus(period, preferredValues, acceptableValues)
        }));
        debugLog("Evaluated burn period data with status:", evaluatedBurnPeriodData);

        buildLegend();
        buildForecastGrid(evaluatedBurnPeriodData, location);

    } catch (error) {
        console.error("Error caught in event listener:", error);
        showErrorMessage("No forecast data found for this location. Please check your latitude and longitude.");
    }
});


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


// app install language
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
