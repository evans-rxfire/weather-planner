const htmlElement = document.documentElement;

const propertyName = document.getElementById("property-name");
const latitudeInput = document.getElementById("latitude-input");
const longitudeInput = document.getElementById("longitude-input");

let forecastPeriods = [];

let rawForecastData = [];

// will this need to change since the grid forecast uses degrees?
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

        return forecastGridData;
    } catch (error) {
        console.error("Error fetching forecast data:", error);
        throw error;
    }
}

async function loadForecastData(lat, lon) {
  rawForecastData = await fetchForecastData(lat, lon);
}


// Functions to process forecast data into more easily usable format

function getFireWeatherForecastData(gridForecast) {
    // extract gridForecast.properties needed

}

function expandForecastData(gridForecast) {
    // expand forecast data set to have a value for every period(hour) in the forecast

}

function convertForecastData(gridForecast) {
    // convert timestamps and units

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
// possibly need to add mixing height and transport wind speed?
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
        await loadForecastData(lat, lon);

        console.log("forecastGridData array:", rawForecastData);
        
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
