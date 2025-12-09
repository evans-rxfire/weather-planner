const propertyName = document.getElementById("property-name");
const latitudeInput = document.getElementById("latitude-input");
const longitudeInput = document.getElementById("longitude-input");

const outputHeader = document.getElementById("output-header");
const outputContainer = document.getElementById("output-container");

const submitBtn = document.getElementById("submit-button");
const saveBtn = document.getElementById("save-button");
const clearBtn = document.getElementById("clear-button");


const DEBUG = false;


// FUNCTIONS
// Debugging
function debugLog(...args) {
    if (DEBUG) {
        console.log(...args);
    }
}





// Build a containter to hold forecast link and related information
function buildForecastLink(lat, lon) {
    const linkContainer = document.getElementById("forecast-link-container");
    linkContainer.innerHTML = "";

    const pointForecastUrl = `https://forecast.weather.gov/MapClick.php?lat=${lat}&lon=${lon}&unit=0&lg=english&FcstType=graphical`;

    const wrapper = document.createElement("div");
    wrapper.className = "flex justify-center mb-4 text-sm border border-gray-300 dark:border-gray-600 p-4 rounded-md";

    const linkParagraph = document.createElement("p");
    linkParagraph.innerHTML = `The National Weather Service (NWS) forecast for the prescribed burn can be found here: <a href="${pointForecastUrl}" target="_blank" rel="noopener noreferrer" class="font-semibold text-blue-600 hover:underline dark:text-blue-400">Point Forecast</a>`;

    const howToParagraph = document.createElement("p");
    howToParagraph.innerHTML = `For more information on NWS point forecasts, review the provided <a href="https://docs.google.com/document/d/135GaKVAMILCETM3MFHCdpE5O4QaQtIHCT4emThaKOIc/edit?usp=sharing" target="_blank" rel="noopener noreferrer" class="font-semibold text-blue-600 hover:underline dark:text-blue-400">Point Forecast Guide</a>.`;

    wrapper.appendChild(linkParagraph);
    wrapper.appendChild(howToParagraph);

    linkContainer.appendChild(wrapper);
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

// Clear forecast grid
function clearForecastGrid() {
    outputContainer.innerHTML = "";
    outputHeader.textContent = outputHeader.dataset.base;
}


// EVENT LISTENERS
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

        buildLegend();
        

    } catch (error) {
        console.error("Error caught in event listener:", error);
        showErrorMessage("No forecast data found for this location. Please check your latitude and longitude.");
    }
});
