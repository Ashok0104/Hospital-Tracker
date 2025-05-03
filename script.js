// Global Variables
let map;
let currentMarker;
let routingControl;
let userLocation = null;
let selectedFacility = null;
let trafficLayerActive = false;
let mapStyle = 'streets'; // Default map style
let emergencyActive = false;
let ambulanceMarkers = [];
let hospitalMarkers = [];
let trafficLightMarkers = [];
let weatherData = null;
let emergencyType = 'accident';
let priorityLevel = 'medium';

// Hospital data will be fetched from OpenStreetMap
let hospitals = [];

const clinics = [
    { id: 4, name: "City Urgent Care", type: "Clinic", lat: 0, lng: 0, distance: 0, eta: 0,
      address: "101 Quick Response Road", specialty: "Urgent Care", beds: 10, hours: "8AM-10PM",
      services: ["Minor Emergency", "X-ray", "Lab Testing", "General Medicine"] },
    { id: 5, name: "Community Health Clinic", type: "Clinic", lat: 0, lng: 0, distance: 0, eta: 0,
      address: "202 Wellness Way", specialty: "General Care", beds: 5, hours: "9AM-8PM",
      services: ["General Medicine", "Pediatrics", "Basic Emergency"] }
];

const specializedCenters = [
    { id: 6, name: "Cardiac Institute", type: "Specialized Center", lat: 0, lng: 0, distance: 0, eta: 0,
      address: "303 Heart Boulevard", specialty: "Cardiac Care", beds: 20, hours: "24/7",
      services: ["Cardiac Emergency", "Cardiac Surgery", "Cardiac ICU", "Rehabilitation"] },
    { id: 7, name: "Neuroscience Center", type: "Specialized Center", lat: 0, lng: 0, distance: 0, eta: 0,
      address: "404 Brain Avenue", specialty: "Neurological", beds: 15, hours: "24/7",
      services: ["Neurological Emergency", "Neurosurgery", "Stroke Unit", "Rehabilitation"] },
    { id: 8, name: "Children's Medical Center", type: "Specialized Center", lat: 0, lng: 0, distance: 0, eta: 0,
      address: "505 Kids Care Lane", specialty: "Pediatric", beds: 30, hours: "24/7",
      services: ["Pediatric Emergency", "NICU", "PICU", "Pediatric Surgery", "Child Life Services"] }
];

// Initialize when DOM content is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Add event listeners to emergency type and priority level
    document.getElementById('emergency-type').addEventListener('change', function() {
        emergencyType = this.value;
    });

    document.querySelectorAll('input[name="priority"]').forEach(radio => {
        radio.addEventListener('change', function() {
            priorityLevel = this.value;
        });
    });

    // Initialize weather status with placeholder
    updateWeatherStatus("Data unavailable");

    // Show landing page initially
    document.getElementById('landing-page').classList.remove('hidden');
});

// Function to switch from landing page to dashboard
function enterDashboard() {
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('dashboard-page').classList.remove('hidden');
    initializeMap();
    showLoading("Initializing System...");

    // Simulate loading time and then hide the loader
    setTimeout(() => {
        hideLoading();
        showNotification("System Ready", "Emergency response system initialized successfully.", "success");
    }, 1500);
}

// Initialize the Leaflet map
function initializeMap() {
    if (map) return; // Don't initialize twice

    map = L.map('map', {
        zoom: 13,
        zoomControl: false,
        attributionControl: false
    });

    // Add 3D terrain layer
    L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        maxZoom: 17,
        attribution: 'Map data: &copy; OpenStreetMap contributors, SRTM | Map style: &copy; OpenTopoMap'
    }).addTo(map);

    // Add 3D building layer
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        opacity: 0.7
    }).addTo(map);

    // Add custom zoom controls
    L.control.zoom({
        position: 'bottomright'
    }).addTo(map);

    // Add click event to map for location selection
    map.on('click', function(e) {
        setManualLocation(e.latlng.lat, e.latlng.lng);
    });

    // Add tilt effect on map movement
    map.on('moveend', function() {
        const zoom = map.getZoom();

        // Apply tilt effect based on zoom level
        const tilt = Math.min((zoom - 13) * 5, 30);
        document.querySelector('.map-container').style.perspective = `${1000 - tilt * 10}px`;
        document.querySelector('.map-container').style.transform = `rotateX(${tilt}deg)`;
    });

    // Try to get the user's current location
    useCurrentLocation();
}

// Fetch real hospital data from OpenStreetMap with optimized performance
function fetchHospitals(lat, lng, radius = 5000) {
    showLoading("Fetching nearby hospitals...");

    // Clear existing hospitals
    hospitals = [];

    // Set a timeout to ensure we don't wait too long for the API
    const apiTimeout = setTimeout(() => {
        // If API takes too long, use fallback data
        if (hospitals.length === 0) {
            console.log("API timeout - using fallback data");
            createFallbackHospitals(lat, lng);
            showNearbyHospitals();
            hideLoading();
            showNotification("Using Local Data", "Showing approximate hospital locations while fetching real data.", "info");
        }
    }, 3000); // 3 second timeout

    // Use Overpass API to fetch hospitals and healthcare facilities
    const overpassUrl = "https://overpass-api.de/api/interpreter";

    // Optimized query for faster results - only fetch nodes (not ways/relations) and limit data returned
    const query = `
        [out:json][timeout:5];
        (
          node["amenity"="hospital"](around:${radius},${lat},${lng});
          node["amenity"="clinic"](around:${radius},${lat},${lng});
          node["amenity"="doctors"](around:${radius},${lat},${lng});
        );
        out center;
    `;

    fetch(overpassUrl, {
        method: "POST",
        body: query,
        headers: {
            "Content-Type": "application/x-www-form-urlencoded"
        },
        // Add a signal to abort the fetch if it takes too long
        signal: AbortSignal.timeout(8000) // 8 second timeout for the fetch
    })
    .then(response => response.json())
    .then(data => {
        // Clear the timeout since we got a response
        clearTimeout(apiTimeout);

        if (data && data.elements && data.elements.length > 0) {
            // Process the results
            processHospitalData(data.elements, lat, lng);
            showNearbyHospitals();
            hideLoading();
            showNotification("Hospitals Found", `Found ${hospitals.length} healthcare facilities nearby`, "success");
        } else {
            // If no hospitals found, use fallback data
            createFallbackHospitals(lat, lng);
            showNearbyHospitals();
            hideLoading();
            showNotification("Limited Data", "Using approximate hospital locations. Real data unavailable.", "warning");
        }
    })
    .catch(error => {
        // Clear the timeout since we got a response (even if it's an error)
        clearTimeout(apiTimeout);

        console.error("Error fetching hospitals:", error);
        // Use fallback data if API fails
        createFallbackHospitals(lat, lng);
        showNearbyHospitals();
        hideLoading();
        showNotification("Using Local Data", "Showing nearby hospitals based on your location.", "info");
    });
}

// Process hospital data from OpenStreetMap
function processHospitalData(elements, userLat, userLng) {
    // Get nodes that are hospitals or healthcare facilities
    const healthcareNodes = elements.filter(element =>
        (element.type === "node" || element.type === "way") &&
        element.tags &&
        (element.tags.amenity === "hospital" ||
         element.tags.amenity === "clinic" ||
         element.tags.amenity === "doctors")
    );

    // Convert to our hospital format
    hospitals = healthcareNodes.map((node, index) => {
        // Get coordinates
        let lat = node.lat;
        let lng = node.lon;

        // For ways, use the center point
        if (node.type === "way" && !lat && !lng) {
            // Find center of way by averaging node coordinates
            const nodeRefs = node.nodes || [];
            if (nodeRefs.length > 0) {
                const wayNodes = elements.filter(el =>
                    el.type === "node" && nodeRefs.includes(el.id)
                );

                if (wayNodes.length > 0) {
                    lat = wayNodes.reduce((sum, n) => sum + n.lat, 0) / wayNodes.length;
                    lng = wayNodes.reduce((sum, n) => sum + n.lon, 0) / wayNodes.length;
                }
            }
        }

        // Skip if no valid coordinates
        if (!lat || !lng) return null;

        // Calculate distance
        const distance = calculateDistance(userLat, userLng, lat, lng).toFixed(1);

        // Determine facility type
        let type = "Hospital";
        if (node.tags.amenity === "clinic") type = "Clinic";
        if (node.tags.amenity === "doctors") type = "Medical Office";

        // Get name or create a default one
        const name = node.tags.name || `${type} ${index + 1}`;

        // Get address or create a placeholder
        const address = node.tags["addr:street"] ?
            `${node.tags["addr:housenumber"] || ""} ${node.tags["addr:street"]}` :
            "Address unavailable";

        // Determine specialty based on available tags
        let specialty = "General";
        if (node.tags.healthcare === "specialist") {
            specialty = node.tags.speciality || node.tags.specialty || "Specialist";
        }

        // Estimate beds based on facility type
        let beds = 0;
        if (type === "Hospital") {
            beds = Math.floor(Math.random() * 30) + 20; // 20-50 beds for hospitals
        } else if (type === "Clinic") {
            beds = Math.floor(Math.random() * 10) + 5; // 5-15 beds for clinics
        } else {
            beds = Math.floor(Math.random() * 5) + 1; // 1-5 beds for medical offices
        }

        // Determine hours
        let hours = node.tags.opening_hours || (type === "Hospital" ? "24/7" : "8AM-8PM");

        // Create services array based on available tags
        const services = [];
        if (node.tags.emergency === "yes") services.push("Emergency Room");
        if (type === "Hospital") {
            services.push("ICU", "Surgery");
            if (specialty.includes("Cardiac")) services.push("Cardiology");
            if (specialty.includes("Neuro")) services.push("Neurology");
            if (specialty.includes("Ortho")) services.push("Orthopedics");
        } else if (type === "Clinic") {
            services.push("General Medicine");
            if (Math.random() > 0.5) services.push("X-ray");
            if (Math.random() > 0.5) services.push("Lab Testing");
        } else {
            services.push("General Medicine");
            if (Math.random() > 0.7) services.push("Specialist Consultation");
        }

        // Calculate ETA based on distance
        const eta = Math.floor(distance * 2) + 5;

        return {
            id: node.id || index + 1,
            name: name,
            type: type,
            lat: lat,
            lng: lng,
            distance: distance,
            eta: eta,
            address: address,
            specialty: specialty,
            beds: beds,
            hours: hours,
            services: services
        };
    }).filter(hospital => hospital !== null); // Remove any null entries

    // Sort by distance
    hospitals.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

    // Limit to a reasonable number
    if (hospitals.length > 20) {
        hospitals = hospitals.slice(0, 20);
    }

    // If no hospitals found, create fallback data
    if (hospitals.length === 0) {
        createFallbackHospitals(userLat, userLng);
    }
}

// Create fallback hospital data if API fails or returns no results
function createFallbackHospitals(lat, lng) {
    const hospitalNames = [
        "Central Medical Center", "North Regional Hospital", "East General Hospital",
        "Community Memorial Hospital", "University Medical Center", "St. Mary's Hospital",
        "Metro General Hospital", "Valley Medical Center", "Riverside Hospital"
    ];

    const specialties = [
        "General", "Trauma Center", "Cardiac Care", "Pediatric", "Orthopedic",
        "Neurological", "Cancer Treatment", "Women's Health", "Rehabilitation"
    ];

    hospitals = [];

    // Create 5-8 hospitals around the user location
    const count = Math.floor(Math.random() * 4) + 5;

    for (let i = 0; i < count; i++) {
        // Create random offsets to distribute facilities around the center
        // Larger radius for more realistic distribution
        const angle = Math.random() * Math.PI * 2;
        const radius = (Math.random() * 0.05) + 0.01; // 1-6 km approximately

        const latOffset = Math.sin(angle) * radius;
        const lngOffset = Math.cos(angle) * radius;

        const hospitalLat = lat + latOffset;
        const hospitalLng = lng + lngOffset;

        // Calculate actual distance
        const distance = calculateDistance(lat, lng, hospitalLat, hospitalLng).toFixed(1);
        const eta = Math.floor(distance * 2) + 5;

        // Select random name and specialty
        const name = hospitalNames[Math.floor(Math.random() * hospitalNames.length)];
        const specialty = specialties[Math.floor(Math.random() * specialties.length)];

        // Create services based on specialty
        const services = ["Emergency Room", "ICU", "Surgery"];
        if (specialty === "Cardiac Care") services.push("Cardiology", "Cardiac ICU");
        if (specialty === "Neurological") services.push("Neurology", "Neurosurgery");
        if (specialty === "Orthopedic") services.push("Orthopedics", "Physical Therapy");
        if (specialty === "Pediatric") services.push("Pediatrics", "NICU");

        hospitals.push({
            id: i + 1,
            name: `${name} ${i + 1}`,
            type: "Hospital",
            lat: hospitalLat,
            lng: hospitalLng,
            distance: distance,
            eta: eta,
            address: `${Math.floor(Math.random() * 1000) + 100} Medical Drive`,
            specialty: specialty,
            beds: Math.floor(Math.random() * 30) + 20,
            hours: "24/7",
            services: services
        });
    }

    // Sort by distance
    hospitals.sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
}

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1, lon1, lat2, lon2) {
    // Earth's radius in km
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Try to get the user's current location with optimized performance
function useCurrentLocation() {
    const locationStatus = document.getElementById('location-status');
    locationStatus.textContent = "Requesting location...";

    showLoading("Getting your location...");

    // Set a timeout to use fallback if geolocation takes too long
    const geoTimeout = setTimeout(() => {
        // If we still don't have a location after 15 seconds, use a fallback
        if (!userLocation) {
            // Ask user to select location on map instead of using IP geolocation
            useIpBasedLocation();
        }
    }, 15000); // Increased to 15 seconds to give more time for accurate location

    if (navigator.geolocation) {
        const options = {
            enableHighAccuracy: true,
            timeout: 20000, // Increased timeout to 20 seconds for better accuracy
            maximumAge: 0 // Don't use cached positions for initial location
        };

        // First try with high accuracy
        navigator.geolocation.getCurrentPosition(
            // Success callback
            (position) => {
                clearTimeout(geoTimeout); // Clear the fallback timeout

                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const accuracy = position.coords.accuracy;

                // Set user location with accuracy indicator
                setUserLocation(lat, lng, accuracy);
                locationStatus.textContent = `Found: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

                // Show notification and fetch hospitals
                showNotification("Location Updated", "Using your precise location", "success");

                // Always fetch hospitals when the "Get My Location" button is clicked
                fetchHospitals(lat, lng);

                // Simulate weather check
                fetchWeatherData(lat, lng);

                hideLoading();

                // Start watching position for continuous updates
                startWatchingPosition();
            },
            // Error callback
            (error) => {
                console.error("Error getting location:", error);

                // Try with lower accuracy immediately
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        clearTimeout(geoTimeout); // Clear the fallback timeout

                        const lat = position.coords.latitude;
                        const lng = position.coords.longitude;
                        const accuracy = position.coords.accuracy;

                        setUserLocation(lat, lng, accuracy);
                        locationStatus.textContent = `Found: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

                        showNotification("Location Found", "Using approximate location", "success");

                        // Always fetch hospitals when the "Get My Location" button is clicked
                        fetchHospitals(lat, lng);
                        fetchWeatherData(lat, lng);

                        hideLoading();

                        // Start watching position for continuous updates
                        startWatchingPosition();
                    },
                    (retryError) => {
                        // If both attempts fail, don't clear the timeout
                        // The fallback will be used
                        handleLocationError(retryError);
                    },
                    {
                        enableHighAccuracy: false,
                        timeout: 8000,
                        maximumAge: 120000 // Allow cached positions up to 2 minutes old
                    }
                );
            },
            options
        );
    } else {
        clearTimeout(geoTimeout);
        hideLoading();
        locationStatus.textContent = "Geolocation not supported";
        showNotification("Location Error", "Your browser doesn't support geolocation. Please search for a location manually.", "error");
    }
}

// Fallback to map-based location selection if browser geolocation fails
function useIpBasedLocation() {
    showLoading("Browser geolocation failed. Please select your location on the map...");
    hideLoading();

    // Show a notification instructing the user to click on the map
    showNotification("Select Location", "Please click on the map to set your location", "info", 8000);

    // Add a one-time click event to the map
    const clickHandler = function(e) {
        const lat = e.latlng.lat;
        const lng = e.latlng.lng;

        // Set user location
        setUserLocation(lat, lng);

        const locationStatus = document.getElementById('location-status');
        locationStatus.textContent = `Selected: ${lat.toFixed(6)}, ${lng.toFixed(6)}`;

        showNotification("Location Set", "Using your selected location", "success");

        // Fetch hospitals based on this location
        fetchHospitals(lat, lng);
        fetchWeatherData(lat, lng);

        // Remove the click handler after one use
        map.off('click', clickHandler);
    };

    // Add the click handler to the map
    map.on('click', clickHandler);

    // Add a visual cue to indicate the map is clickable
    document.getElementById('map').style.cursor = 'crosshair';

    // Reset cursor after 10 seconds or when a location is selected
    setTimeout(() => {
        document.getElementById('map').style.cursor = '';
        // If still no location after 10 seconds, use a default location
        if (!userLocation) {
            useDefaultLocation();
        }
    }, 10000);
}

// Ultimate fallback - use a default location if everything else fails
function useDefaultLocation() {
    // Use a generic location (this could be customized based on the user's country/region)
    const lat = 40.7128; // New York City coordinates as default
    const lng = -74.0060;

    setUserLocation(lat, lng);

    const locationStatus = document.getElementById('location-status');
    locationStatus.textContent = "Using default location";

    showNotification("Default Location", "Using a default location. Please search for your actual location.", "warning");

    // Fetch hospitals based on default location
    fetchHospitals(lat, lng);
    fetchWeatherData(lat, lng);
}

// Function to start watching position for continuous updates
function startWatchingPosition() {
    if (window.locationWatchId) {
        navigator.geolocation.clearWatch(window.locationWatchId);
    }

    const watchOptions = {
        enableHighAccuracy: true,
        timeout: 30000,
        maximumAge: 0
    };

    window.locationWatchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            const accuracy = position.coords.accuracy;

            setUserLocation(lat, lng, accuracy);
        },
        (error) => {
            console.error("Error watching position:", error);
            // Don't show error notification for watch position errors
            // as they are less critical than initial position errors
        },
        watchOptions
    );
}

// Function to handle location errors
function handleLocationError(error) {
    hideLoading();
    let errorMessage = "Location access denied";

    switch(error.code) {
        case error.PERMISSION_DENIED:
            errorMessage = "Please allow location access in your browser settings";
            break;
        case error.POSITION_UNAVAILABLE:
            errorMessage = "Location information is unavailable. Please check your device's location services.";
            break;
        case error.TIMEOUT:
            errorMessage = "Location request timed out. Please check your internet connection and try again.";
            break;
    }

    document.getElementById('location-status').textContent = errorMessage;
    showNotification("Location Error", errorMessage, "error");

    // Provide guidance to user
    if (error.code === error.PERMISSION_DENIED) {
        showNotification("How to Enable Location", "1. Click the lock/info icon in your browser's address bar\n2. Find 'Location' in the permissions list\n3. Change it to 'Allow'", "info", 10000);
    }
}

// Function to show nearby hospitals on the map
function showNearbyHospitals() {
    clearHospitalMarkers();

    hospitals.forEach(hospital => {
        const marker = create3DHospitalMarker(hospital);

        marker.on('click', () => {
            // Add pulse animation to selected hospital
            marker.getElement().classList.add('selected-hospital');
            setTimeout(() => {
                marker.getElement().classList.remove('selected-hospital');
            }, 1000);

            updateEmergencyStatus(hospital);
        });

        marker.on('mouseover', () => {
            marker.getElement().classList.add('hover-hospital');
        });

        marker.on('mouseout', () => {
            marker.getElement().classList.remove('hover-hospital');
        });

        hospitalMarkers.push(marker);
        marker.addTo(map);
    });
}

// Function to update emergency status when a hospital is selected
function updateEmergencyStatus(hospital) {
    document.getElementById('current-status').textContent = 'Hospital Selected';
    document.getElementById('destination-value').textContent = hospital.name;
    document.getElementById('eta-value').textContent = `${hospital.eta} mins`;
    document.getElementById('distance-value').textContent = `${hospital.distance} km`;

    // Update weather status if available
    if (weatherData) {
        updateWeatherStatus(weatherData);
    }

    // Create route to the selected hospital
    if (userLocation) {
        createRoute(userLocation.lat, userLocation.lng, hospital.lat, hospital.lng);
    }
}

// Search for a location
function searchLocation() {
    const searchInput = document.getElementById('location-search').value;

    if (!searchInput.trim()) {
        showNotification("Search Error", "Please enter a location to search", "error");
        return;
    }

    showLoading("Searching for location...");

    // Use OpenStreetMap Nominatim API for geocoding
    const searchUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchInput)}`;

    fetch(searchUrl)
        .then(response => response.json())
        .then(data => {
            if (data && data.length > 0) {
                const result = data[0];
                const lat = parseFloat(result.lat);
                const lng = parseFloat(result.lon);

                setUserLocation(lat, lng);

                const locationStatus = document.getElementById('location-status');
                locationStatus.textContent = `Found: ${result.display_name}`;

                hideLoading();
                showNotification("Location Found", `Found location: ${result.display_name}`, "success");

                // Clear search input
                document.getElementById('location-search').value = '';

                // Fetch nearby hospitals based on location
                fetchHospitals(lat, lng);

                // Simulate weather check
                fetchWeatherData(lat, lng);
            } else {
                hideLoading();
                showNotification("Search Error", "No locations found. Please try a different search term.", "error");
            }
        })
        .catch(error => {
            console.error("Error searching location:", error);
            hideLoading();
            showNotification("Search Error", "Failed to search location. Please try again.", "error");
        });
}

// Set user's location manually (from map click or search)
function setManualLocation(lat, lng) {
    setUserLocation(lat, lng);

    const locationStatus = document.getElementById('location-status');
    locationStatus.textContent = `Selected: ${lat.toFixed(4)}, ${lng.toFixed(4)}`;

    showNotification("Location Updated", "Using selected location on map.", "info");

    // Fetch nearby hospitals based on location
    fetchHospitals(lat, lng);

    // Simulate weather check
    fetchWeatherData(lat, lng);
}

// Set user location and update map
function setUserLocation(lat, lng, accuracy) {
    userLocation = { lat, lng };

    // Center map on user location with animation
    map.setView([lat, lng], 15, {
        animate: true,
        duration: 1
    });

    // Remove existing marker if any
    if (currentMarker) {
        map.removeLayer(currentMarker);
    }

    // Create new marker with accuracy circle
    const userIcon = L.divIcon({
        className: 'user-location-3d',
        html: `
            <div class="user-location-3d">
                <div class="user-pulse"></div>
                <div class="user-dot"></div>
                <div class="user-shadow"></div>
            </div>
        `,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    currentMarker = L.marker([lat, lng], { icon: userIcon }).addTo(map);

    // Add accuracy circle if accuracy is provided
    if (accuracy) {
        const accuracyCircle = L.circle([lat, lng], {
            radius: accuracy,
            color: '#3498db',
            fillColor: '#3498db',
            fillOpacity: 0.1,
            weight: 1
        }).addTo(map);

        // Store accuracy circle for later removal
        if (window.accuracyCircle) {
            map.removeLayer(window.accuracyCircle);
        }
        window.accuracyCircle = accuracyCircle;
    }

    // Update facility distances
    updateFacilityDistances();
}

// Update the calculated distances for all healthcare facilities
function updateFacilityDistances() {
    if (!userLocation) return;

    const calculateDistance = (lat1, lon1, lat2, lon2) => {
        // Simple Haversine distance calculation
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a =
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    };

    // Update hospitals
    hospitals.forEach(hospital => {
        hospital.distance = calculateDistance(
            userLocation.lat, userLocation.lng,
            hospital.lat, hospital.lng
        ).toFixed(1);
        hospital.eta = Math.floor(hospital.distance * 2) + 5; // Simple ETA calculation
    });

    // Update clinics
    clinics.forEach(clinic => {
        clinic.distance = calculateDistance(
            userLocation.lat, userLocation.lng,
            clinic.lat, clinic.lng
        ).toFixed(1);
        clinic.eta = Math.floor(clinic.distance * 2) + 3;
    });

    // Update specialized centers
    specializedCenters.forEach(center => {
        center.distance = calculateDistance(
            userLocation.lat, userLocation.lng,
            center.lat, center.lng
        ).toFixed(1);
        center.eta = Math.floor(center.distance * 2) + 7;
    });
}

// Find the nearest hospital based on user's location
function findNearestHospital() {
    if (!userLocation) {
        showNotification("Location Missing", "Please set your location first", "error");
        return;
    }

    showLoading("Finding nearest hospital...");

    // Clear existing hospital markers
    clearHospitalMarkers();

    // Sort hospitals by distance
    const sortedHospitals = [...hospitals].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    const nearestHospital = sortedHospitals[0];

    // Update status
    document.getElementById('current-status').textContent = "Hospital Selected";
    document.getElementById('destination-value').textContent = nearestHospital.name;
    document.getElementById('eta-value').textContent = `${nearestHospital.eta} min`;
    document.getElementById('distance-value').textContent = `${nearestHospital.distance} km`;

    // Create marker for the hospital
    const hospitalIcon = L.divIcon({
        className: 'hospital-marker',
        html: '<div class="hospital-marker-icon">🏥</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const marker = L.marker([nearestHospital.lat, nearestHospital.lng], { icon: hospitalIcon }).addTo(map);
    marker.bindPopup(`<b>${nearestHospital.name}</b><br>Distance: ${nearestHospital.distance} km<br>ETA: ${nearestHospital.eta} min`);
    hospitalMarkers.push(marker);

    // Create route to hospital
    createRoute(userLocation.lat, userLocation.lng, nearestHospital.lat, nearestHospital.lng);

    // Select the hospital
    selectedFacility = nearestHospital;

    setTimeout(() => {
        hideLoading();
        showNotification("Hospital Found", `Nearest hospital: ${nearestHospital.name} (${nearestHospital.distance} km)`, "success");
    }, 1000);
}

// Dispatch an emergency vehicle
function dispatchEmergencyVehicle() {
    if (!userLocation) {
        showNotification("Location Missing", "Please set your location first", "error");
        return;
    }

    if (!selectedFacility) {
        // If no facility is selected, find nearest hospital first
        findNearestHospital();
        setTimeout(dispatchEmergencyVehicle, 1500);
        return;
    }

    showLoading("Dispatching emergency vehicle...");

    // Update status
    document.getElementById('current-status').textContent = "Vehicle Dispatched";

    // Create ambulance marker at the selected facility
    const ambulanceIcon = L.divIcon({
        className: 'ambulance-marker',
        html: '<div class="ambulance-marker-icon">🚑</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const ambulanceMarker = L.marker([selectedFacility.lat, selectedFacility.lng], { icon: ambulanceIcon }).addTo(map);
    ambulanceMarkers.push(ambulanceMarker);

    // Simulate ambulance movement towards user location
    simulateAmbulanceMovement(ambulanceMarker, selectedFacility, userLocation);

    // Simulate traffic control
    createSimulatedTrafficLights();

    setTimeout(() => {
        hideLoading();
        showNotification("Vehicle Dispatched", `Emergency vehicle dispatched from ${selectedFacility.name}`, "success");
        showNotification("Traffic Control", "Smart traffic management system activated", "info");

        // Set emergency mode active
        emergencyActive = true;
    }, 1500);
}

// Simulate ambulance movement from hospital to user
function simulateAmbulanceMovement(marker, from, to) {
    const steps = 20;
    let currentStep = 0;

    const latStep = (to.lat - from.lat) / steps;
    const lngStep = (to.lng - from.lng) / steps;

    // Create 3D ambulance marker
    const ambulanceHtml = `
        <div class="ambulance-3d">
            <div class="ambulance-body">
                <div class="ambulance-cab"></div>
                <div class="ambulance-box"></div>
                <div class="ambulance-lights"></div>
            </div>
            <div class="ambulance-shadow"></div>
        </div>
    `;

    const ambulanceIcon = L.divIcon({
        className: 'ambulance-3d-icon',
        html: ambulanceHtml,
        iconSize: [40, 40],
        iconAnchor: [20, 20]
    });

    marker.setIcon(ambulanceIcon);

    const moveInterval = setInterval(() => {
        currentStep++;

        if (currentStep <= steps) {
            const newLat = from.lat + (latStep * currentStep);
            const newLng = from.lng + (lngStep * currentStep);

            marker.setLatLng([newLat, newLng]);

            // Add tilt effect based on movement direction
            const angle = Math.atan2(lngStep, latStep) * (180 / Math.PI);
            marker.getElement().style.transform = `rotate(${angle}deg)`;

            // Update ETA
            const remainingSteps = steps - currentStep;
            const newEta = Math.ceil(remainingSteps / steps * selectedFacility.eta);
            document.getElementById('eta-value').textContent = `${newEta} min`;

            if (currentStep === steps) {
                showNotification("Vehicle Arrived", "Emergency vehicle has arrived at your location", "success");
                document.getElementById('current-status').textContent = "Vehicle Arrived";

                setTimeout(() => {
                    document.getElementById('current-status').textContent = "Returning to Hospital";
                    simulateAmbulanceReturn(marker, to, from);
                }, 3000);
            }
        } else {
            clearInterval(moveInterval);
        }
    }, 500);
}

// Simulate ambulance return journey
function simulateAmbulanceReturn(marker, from, to) {
    const steps = 20;
    let currentStep = 0;

    const latStep = (to.lat - from.lat) / steps;
    const lngStep = (to.lng - from.lng) / steps;

    const moveInterval = setInterval(() => {
        currentStep++;

        if (currentStep <= steps) {
            const newLat = from.lat + (latStep * currentStep);
            const newLng = from.lng + (lngStep * currentStep);

            marker.setLatLng([newLat, newLng]);

            // If this is the last step, show completed notification
            if (currentStep === steps) {
                showNotification("Mission Complete", "Emergency response completed successfully", "success");
                document.getElementById('current-status').textContent = "Mission Complete";

                // Reset emergency mode
                emergencyActive = false;
            }
        } else {
            clearInterval(moveInterval);
        }
    }, 500);
}

// Create simulated traffic lights
function createSimulatedTrafficLights() {
    // Clear existing traffic lights
    clearTrafficLightMarkers();

    if (!userLocation || !selectedFacility) return;

    // Create traffic lights along the route
    const steps = 8; // Number of traffic lights

    const latStep = (selectedFacility.lat - userLocation.lat) / (steps + 1);
    const lngStep = (selectedFacility.lng - userLocation.lng) / (steps + 1);

    for (let i = 1; i <= steps; i++) {
        const lat = userLocation.lat + (latStep * i);
        const lng = userLocation.lng + (lngStep * i);

        // Add slight randomness to position
        const randomLat = lat + (Math.random() - 0.5) * 0.005;
        const randomLng = lng + (Math.random() - 0.5) * 0.005;

        const trafficLightIcon = L.divIcon({
            className: 'traffic-light-marker',
            html: '<div class="traffic-light-icon">🚦</div>',
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });

        const marker = L.marker([randomLat, randomLng], { icon: trafficLightIcon }).addTo(map);
        marker.bindPopup("Traffic Light - Click to control");

        marker.on('click', () => showTrafficControlModal());

        trafficLightMarkers.push(marker);
    }
}

// Create a route between two points with improved hospital highlighting
function createRoute(fromLat, fromLng, toLat, toLng) {
    // Remove existing route if any
    if (routingControl) {
        map.removeControl(routingControl);
    }

    // Find the hospital marker at the destination coordinates
    let selectedHospitalMarker = null;
    for (let marker of hospitalMarkers) {
        const markerLatLng = marker.getLatLng();
        // Check if this marker is at the destination coordinates (with small tolerance)
        if (Math.abs(markerLatLng.lat - toLat) < 0.0001 && Math.abs(markerLatLng.lng - toLng) < 0.0001) {
            selectedHospitalMarker = marker;
            break;
        }
    }

    // Highlight the selected hospital marker
    if (selectedHospitalMarker) {
        // Remove any existing highlight classes
        hospitalMarkers.forEach(marker => {
            if (marker.getElement()) {
                marker.getElement().classList.remove('selected-hospital');
                marker.getElement().style.animation = '';
                marker.getElement().style.transform = '';
                marker.getElement().style.zIndex = '';
            }
        });

        // Add highlight to the selected hospital
        if (selectedHospitalMarker.getElement()) {
            selectedHospitalMarker.getElement().classList.add('selected-hospital');

            // Add a persistent pulse animation
            selectedHospitalMarker.getElement().style.animation = 'pulse 2s infinite';

            // Make the marker larger
            selectedHospitalMarker.getElement().style.transform = 'scale(1.2)';
            selectedHospitalMarker.getElement().style.zIndex = '1000';
        }
    }

    // Create new routing control
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(fromLat, fromLng),
            L.latLng(toLat, toLng)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        showAlternatives: true,
        fitSelectedRoutes: true,
        lineOptions: {
            styles: [
                {color: '#0066cc', opacity: 0.8, weight: 6},
                {color: '#0066ff', opacity: 0.9, weight: 4}
            ]
        },
        createMarker: function() { return null; } // Don't create default markers
    }).addTo(map);

    // Extract turn-by-turn directions
    routingControl.on('routesfound', function(e) {
        const routes = e.routes;
        if (routes && routes.length > 0) {
            // Update directions panel
            populateDirectionsPanel(routes[0].instructions);

            // Make directions button visible and highlight it
            const directionsBtn = document.getElementById('directions-btn');
            directionsBtn.classList.add('active');

            // Automatically show directions panel
            showDirectionsPanel();

            // Notify user
            showNotification("Directions Ready", "Turn-by-turn directions to hospital are ready", "success");
        }
    });
}

// Populate directions panel with instructions
function populateDirectionsPanel(instructions) {
    const directionsContent = document.getElementById('directions-content');
    directionsContent.innerHTML = '';

    if (!instructions || instructions.length === 0) {
        directionsContent.innerHTML = '<p>No directions available</p>';
        return;
    }

    const directionsList = document.createElement('ol');
    directionsList.className = 'directions-list';

    instructions.forEach(instruction => {
        if (!instruction.text) return;

        const item = document.createElement('li');
        item.className = 'direction-item';

        // Add distance if available
        if (instruction.distance) {
            const distance = (instruction.distance > 1000) ?
                `${(instruction.distance / 1000).toFixed(1)} km` :
                `${Math.round(instruction.distance)} m`;

            item.innerHTML = `${instruction.text} <span class="direction-distance">${distance}</span>`;
        } else {
            item.textContent = instruction.text;
        }

        directionsList.appendChild(item);
    });

    directionsContent.appendChild(directionsList);
}

// Show directions panel
function showDirectionsPanel() {
    document.getElementById('directions-panel').classList.remove('hidden');
}

// Hide directions panel
function hideDirectionsPanel() {
    document.getElementById('directions-panel').classList.add('hidden');
}

// Show all healthcare options in modal
function showAllHealthcareOptions() {
    if (!userLocation) {
        showNotification("Location Missing", "Please set your location first", "error");
        return;
    }

    // Sort facilities by distance
    const sortedHospitals = [...hospitals].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    const sortedClinics = [...clinics].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));
    const sortedSpecialized = [...specializedCenters].sort((a, b) => parseFloat(a.distance) - parseFloat(b.distance));

    // Populate hospital list
    const hospitalsList = document.getElementById('hospitals-list');
    hospitalsList.innerHTML = '';

    sortedHospitals.forEach(hospital => {
        const item = document.createElement('div');
        item.className = 'healthcare-item';
        item.innerHTML = `
            <div class="healthcare-item-header">
                <h3>${hospital.name}</h3>
                <span class="distance-badge">${hospital.distance} km</span>
            </div>
            <p>${hospital.address}</p>
            <p><strong>ETA:</strong> ${hospital.eta} minutes</p>
            <p><strong>Specialty:</strong> ${hospital.specialty}</p>
            <button class="view-details-btn" onclick="showFacilityDetails(${hospital.id}, 'hospital')">View Details</button>
        `;
        hospitalsList.appendChild(item);
    });

    // Populate clinics list
    const clinicsList = document.getElementById('clinics-list');
    clinicsList.innerHTML = '';

    sortedClinics.forEach(clinic => {
        const item = document.createElement('div');
        item.className = 'healthcare-item';
        item.innerHTML = `
            <div class="healthcare-item-header">
                <h3>${clinic.name}</h3>
                <span class="distance-badge">${clinic.distance} km</span>
            </div>
            <p>${clinic.address}</p>
            <p><strong>ETA:</strong> ${clinic.eta} minutes</p>
            <p><strong>Specialty:</strong> ${clinic.specialty}</p>
            <button class="view-details-btn" onclick="showFacilityDetails(${clinic.id}, 'clinic')">View Details</button>
        `;
        clinicsList.appendChild(item);
    });

    // Populate specialized centers list
    const specializedList = document.getElementById('specialized-list');
    specializedList.innerHTML = '';

    sortedSpecialized.forEach(center => {
        const item = document.createElement('div');
        item.className = 'healthcare-item';
        item.innerHTML = `
            <div class="healthcare-item-header">
                <h3>${center.name}</h3>
                <span class="distance-badge">${center.distance} km</span>
            </div>
            <p>${center.address}</p>
            <p><strong>ETA:</strong> ${center.eta} minutes</p>
            <p><strong>Specialty:</strong> ${center.specialty}</p>
            <button class="view-details-btn" onclick="showFacilityDetails(${center.id}, 'specialized')">View Details</button>
        `;
        specializedList.appendChild(item);
    });

    // Show the modal
    document.getElementById('healthcare-modal').style.display = 'flex';

    // Set first tab as active by default
    showTab('hospitals');
}

// Close healthcare modal
function closeHealthcareModal() {
    document.getElementById('healthcare-modal').style.display = 'none';
}

// Show specific tab in healthcare modal
function showTab(tabName) {
    // Hide all tab contents
    const tabContents = document.querySelectorAll('.tab-content');
    tabContents.forEach(tab => tab.classList.remove('active'));

    // Deactivate all tab buttons
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => btn.classList.remove('active'));

    // Show selected tab content and activate button
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelector(`.tab-btn[onclick="showTab('${tabName}')"]`).classList.add('active');
}

// Show facility details modal
function showFacilityDetails(facilityId, facilityType) {
    let facility;

    // Find the selected facility
    if (facilityType === 'hospital') {
        facility = hospitals.find(h => h.id === facilityId);
    } else if (facilityType === 'clinic') {
        facility = clinics.find(c => c.id === facilityId);
    } else if (facilityType === 'specialized') {
        facility = specializedCenters.find(s => s.id === facilityId);
    }

    if (!facility) {
        showNotification("Error", "Facility not found", "error");
        return;
    }

    // Store selected facility
    selectedFacility = facility;

    // Populate facility details
    document.getElementById('facility-name').textContent = facility.name;
    document.getElementById('facility-type').textContent = facility.type;
    document.getElementById('facility-address').textContent = facility.address;
    document.getElementById('facility-distance').textContent = `${facility.distance} km`;
    document.getElementById('facility-eta').textContent = `${facility.eta} minutes`;
    document.getElementById('facility-hours').textContent = facility.hours;
    document.getElementById('facility-specialty').textContent = facility.specialty;
    document.getElementById('facility-beds').textContent = facility.beds;

    // Add a fake facility image
    const randomImageNum = Math.floor(Math.random() * 3) + 1;
    document.getElementById('facility-image').style.backgroundImage = `url('https://via.placeholder.com/400x200?text=${facility.type}+${randomImageNum}')`;

    // Populate services list
    const servicesList = document.getElementById('facility-services-list');
    servicesList.innerHTML = '';

    facility.services.forEach(service => {
        const serviceItem = document.createElement('div');
        serviceItem.className = 'service-item';
        serviceItem.textContent = service;
        servicesList.appendChild(serviceItem);
    });

    // Show the facility details modal
    document.getElementById('facility-details-modal').style.display = 'flex';

    // Close the healthcare modal
    closeHealthcareModal();
}

// Close facility details modal
function closeFacilityDetailsModal() {
    document.getElementById('facility-details-modal').style.display = 'none';
}

// Navigate to selected facility
function navigateToFacility() {
    if (!userLocation || !selectedFacility) {
        showNotification("Error", "Missing location data", "error");
        return;
    }

    // Close the facility details modal
    closeFacilityDetailsModal();

    // Create route to the facility
    createRoute(userLocation.lat, userLocation.lng, selectedFacility.lat, selectedFacility.lng);

    // Update status
    document.getElementById('current-status').textContent = "Facility Selected";
    document.getElementById('destination-value').textContent = selectedFacility.name;
    document.getElementById('eta-value').textContent = `${selectedFacility.eta} min`;
    document.getElementById('distance-value').textContent = `${selectedFacility.distance} km`;

    // Add marker for the facility if not already present
    clearHospitalMarkers();

    const facilityIcon = L.divIcon({
        className: 'facility-marker',
        html: '<div class="facility-marker-icon">🏥</div>',
        iconSize: [30, 30],
        iconAnchor: [15, 15]
    });

    const marker = L.marker([selectedFacility.lat, selectedFacility.lng], { icon: facilityIcon }).addTo(map);
    marker.bindPopup(`<b>${selectedFacility.name}</b><br>Distance: ${selectedFacility.distance} km<br>ETA: ${selectedFacility.eta} min`);
    hospitalMarkers.push(marker);

    showNotification("Navigation Started", `Navigating to ${selectedFacility.name}`, "success");
}

// Simulate calling the facility
function callFacility() {
    if (!selectedFacility) return;

    showLoading("Calling facility...");

    // Simulate a call delay
    setTimeout(() => {
        hideLoading();
        showNotification("Call Connected", `Connected to ${selectedFacility.name}`, "success");

        // Show a simulated conversation in notifications after a delay
        setTimeout(() => {
            showNotification("Facility Message", "We have received your emergency notification. Please provide patient details.", "info");
        }, 2000);

        setTimeout(() => {
            showNotification("Facility Message", `We are preparing for your arrival. ETA: ${selectedFacility.eta} minutes.`, "info");
        }, 4000);
    }, 1500);
}

// Toggle traffic layer on the map
function toggleTrafficLayer() {
    trafficLayerActive = !trafficLayerActive;

    // Update button state
    const trafficBtn = document.getElementById('traffic-btn');
    if (trafficLayerActive) {
        trafficBtn.classList.add('active');
    } else {
        trafficBtn.classList.remove('active');
    }

    // In a real app, this would add a traffic layer from a provider like Google Maps or Mapbox
    // For this demo, we'll simulate traffic by adding/removing colored lines

    if (trafficLayerActive) {
        // Add simulated traffic lines
        addSimulatedTrafficData();
        showNotification("Traffic Layer", "Live traffic data enabled", "info");
    } else {
        // Remove simulated traffic
        removeSimulatedTrafficData();
        showNotification("Traffic Layer", "Live traffic data disabled", "info");
    }
}

// Add simulated traffic data to the map
let trafficLines = [];
function addSimulatedTrafficData() {
    // Clear existing traffic lines
    removeSimulatedTrafficData();

    // Get map bounds
    const bounds = map.getBounds();
    const neLat = bounds.getNorthEast().lat;
    const neLng = bounds.getNorthEast().lng;
    const swLat = bounds.getSouthWest().lat;
    const swLng = bounds.getSouthWest().lng;

    // Create several random lines to represent traffic
    for (let i = 0; i < 10; i++) {
        // Generate random start and end points within map bounds
        const startLat = swLat + Math.random() * (neLat - swLat);
        const startLng = swLng + Math.random() * (neLng - swLng);

        // Create a road-like line (straight with a small deviation)
        const angle = Math.random() * Math.PI * 2; // Random angle
        const length = 0.01 + Math.random() * 0.02; // Random length

        const endLat = startLat + Math.sin(angle) * length;
        const endLng = startLng + Math.cos(angle) * length;

        // Determine traffic level (color)
        const trafficLevel = Math.random();
        let color = '#4CAF50'; // Green - low traffic
        let weight = 5;

        if (trafficLevel > 0.7) {
            color = '#FF5722'; // Red - heavy traffic
            weight = 7;
        } else if (trafficLevel > 0.4) {
            color = '#FFC107'; // Yellow - medium traffic
            weight = 6;
        }

        // Create line
        const line = L.polyline([
            [startLat, startLng],
            [endLat, endLng]
        ], {
            color: color,
            weight: weight,
            opacity: 0.7
        }).addTo(map);

        // Add tooltip
        const trafficText = trafficLevel > 0.7 ? 'Heavy Traffic' :
                            trafficLevel > 0.4 ? 'Moderate Traffic' : 'Light Traffic';
        line.bindTooltip(trafficText);

        trafficLines.push(line);
    }
}

// Remove simulated traffic data
function removeSimulatedTrafficData() {
    trafficLines.forEach(line => map.removeLayer(line));
    trafficLines = [];
}

// Track active ambulances
function trackActiveAmbulances() {
    if (ambulanceMarkers.length === 0) {
        showNotification("No Ambulances", "No active ambulances to track", "warning");
        return;
    }

    // Toggle tracking button
    const trackBtn = document.getElementById('track-btn');
    trackBtn.classList.toggle('active');

    // Center map on the first ambulance
    if (trackBtn.classList.contains('active')) {
        const firstAmbulance = ambulanceMarkers[0];
        map.setView(firstAmbulance.getLatLng(), 15);
        showNotification("Tracking Active", "Following ambulance movements", "info");
    } else {
        showNotification("Tracking Disabled", "Ambulance tracking turned off", "info");
    }
}

// Show alternative routes
function showAlternativeRoutes() {
    if (!userLocation || !selectedFacility) {
        showNotification("Route Missing", "Please select a destination first", "error");
        return;
    }

    showLoading("Calculating alternative routes...");

    // In a real app, this would request alternative routes from a routing service
    // For this demo, we'll simulate by creating slightly modified routes

    // Remove existing route
    if (routingControl) {
        map.removeControl(routingControl);
    }

    // Create new routing control with alternatives enabled
    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(userLocation.lat, userLocation.lng),
            L.latLng(selectedFacility.lat, selectedFacility.lng)
        ],
        routeWhileDragging: false,
        addWaypoints: false,
        showAlternatives: true,
        fitSelectedRoutes: true,
        altLineOptions: {
            styles: [
                {color: '#00cc44', opacity: 0.8, weight: 6},
                {color: '#00ff55', opacity: 0.9, weight: 4}
            ]
        },
        lineOptions: {
            styles: [
                {color: '#0066cc', opacity: 0.8, weight: 6},
                {color: '#0066ff', opacity: 0.9, weight: 4}
            ]
        },
        createMarker: function() { return null; } // Don't create default markers
    }).addTo(map);

    setTimeout(() => {
        hideLoading();
        showNotification("Routes Found", "Showing alternative routes to destination", "success");
    }, 1500);
}

// Show traffic control modal
function showTrafficControlModal() {
    // Generate traffic light grid
    const trafficLightGrid = document.getElementById('traffic-light-grid');
    trafficLightGrid.innerHTML = '';

    // Create a 4x4 grid of traffic lights
    for (let i = 0; i < 4; i++) {
        for (let j = 0; j < 4; j++) {
            const trafficLight = document.createElement('div');
            trafficLight.className = 'traffic-light';
            trafficLight.dataset.row = i;
            trafficLight.dataset.col = j;

            // Randomly set initial state
            const randomState = Math.random();
            let state = 'red';

            if (randomState < 0.3) {
                state = 'green';
            } else if (randomState < 0.6) {
                state = 'yellow';
            }

            trafficLight.dataset.state = state;
            trafficLight.classList.add(state);

            // Add click handler to toggle state
            trafficLight.addEventListener('click', function() {
                toggleTrafficLightState(this);
            });

            trafficLightGrid.appendChild(trafficLight);
        }
    }

    // Show the modal
    document.getElementById('traffic-control-modal').style.display = 'flex';
}

// Close traffic control modal
function closeTrafficControlModal() {
    document.getElementById('traffic-control-modal').style.display = 'none';
}

// Toggle traffic light state
function toggleTrafficLightState(trafficLight) {
    // Remove current state class
    trafficLight.classList.remove('red', 'yellow', 'green');

    // Set next state
    let newState;
    switch (trafficLight.dataset.state) {
        case 'red':
            newState = 'green';
            break;
        case 'green':
            newState = 'yellow';
            break;
        case 'yellow':
            newState = 'red';
            break;
        default:
            newState = 'red';
    }

    // Add new state class
    trafficLight.dataset.state = newState;
    trafficLight.classList.add(newState);
}

// Create green corridor for emergency vehicle
function createGreenCorridor() {
    const trafficLights = document.querySelectorAll('.traffic-light');

    // Remove all current states
    trafficLights.forEach(light => {
        light.classList.remove('red', 'yellow', 'green');
    });

    // Create a diagonal green corridor
    trafficLights.forEach(light => {
        const row = parseInt(light.dataset.row);
        const col = parseInt(light.dataset.col);

        if (row === col || row === col + 1 || row === col - 1) {
            // Green corridor
            light.dataset.state = 'green';
            light.classList.add('green');
        } else {
            // Red for others
            light.dataset.state = 'red';
            light.classList.add('red');
        }
    });

    showNotification("Green Corridor", "Emergency green corridor created for rapid transit", "success");
}

// Override all traffic lights (set all to green)
function overrideTrafficLights() {
    const trafficLights = document.querySelectorAll('.traffic-light');

    // Remove all current states
    trafficLights.forEach(light => {
        light.classList.remove('red', 'yellow', 'green');
        light.dataset.state = 'green';
        light.classList.add('green');
    });

    showNotification("Override Active", "All traffic lights set to green for emergency vehicle", "success");
}

// Reset all traffic lights (random state)
function resetTrafficLights() {
    const trafficLights = document.querySelectorAll('.traffic-light');

    // Remove all current states
    trafficLights.forEach(light => {
        light.classList.remove('red', 'yellow', 'green');

        // Random state
        const randomState = Math.random();
        let state = 'red';

        if (randomState < 0.3) {
            state = 'green';
        } else if (randomState < 0.6) {
            state = 'yellow';
        }

        light.dataset.state = state;
        light.classList.add(state);
    });

    showNotification("Reset Complete", "Traffic lights reset to normal operation", "info");
}

// Show emergency history
function showEmergencyHistory() {
    showNotification("Feature Coming Soon", "Emergency history feature will be available in the next update", "info");
}

// Show settings
function showSettings() {
    showNotification("Feature Coming Soon", "Settings will be available in the next update", "info");
}

// Trigger emergency mode
function triggerEmergencyMode() {
    if (!userLocation) {
        showNotification("Location Missing", "Please set your location first", "error");
        return;
    }

    // Toggle emergency mode
    emergencyActive = !emergencyActive;

    if (emergencyActive) {
        // Activate emergency mode
        document.body.classList.add('emergency-mode');
        showNotification("EMERGENCY MODE ACTIVATED", "All systems on high alert", "warning", 5000);

        // Find nearest hospital automatically
        findNearestHospital();

        // Dispatch vehicle after a short delay
        setTimeout(() => {
            dispatchEmergencyVehicle();
        }, 2000);
    } else {
        // Deactivate emergency mode
        document.body.classList.remove('emergency-mode');
        showNotification("Emergency Mode Deactivated", "Systems returned to normal operation", "info");
    }
}

// Map control functions
function zoomIn() {
    map.zoomIn();
}

function zoomOut() {
    map.zoomOut();
}

function centerOnCurrentLocation() {
    if (userLocation) {
        map.setView([userLocation.lat, userLocation.lng], 14);
    } else {
        showNotification("Location Missing", "Please set your location first", "error");
    }
}

function toggleMapStyle() {
    // Toggle between map styles
    if (mapStyle === 'streets') {
        // Switch to satellite
        mapStyle = 'satellite';

        // Remove current tile layer
        map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });

        // Add satellite tile layer (using a free satellite-like tileset)
        L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            maxZoom: 19
        }).addTo(map);

        showNotification("Map Style", "Switched to satellite view", "info");
    } else {
        // Switch to streets
        mapStyle = 'streets';

        // Remove current tile layer
        map.eachLayer(layer => {
            if (layer instanceof L.TileLayer) {
                map.removeLayer(layer);
            }
        });

        // Add street tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(map);

        showNotification("Map Style", "Switched to street view", "info");
    }
}

// Clear hospital markers from map
function clearHospitalMarkers() {
    hospitalMarkers.forEach(marker => map.removeLayer(marker));
    hospitalMarkers = [];
}

// Clear ambulance markers from map
function clearAmbulanceMarkers() {
    ambulanceMarkers.forEach(marker => map.removeLayer(marker));
    ambulanceMarkers = [];
}

// Clear traffic light markers from map
function clearTrafficLightMarkers() {
    trafficLightMarkers.forEach(marker => map.removeLayer(marker));
    trafficLightMarkers = [];
}

// Reset dashboard to initial state
function resetDashboard() {
    // Reset status
    document.getElementById('current-status').textContent = "Ready";
    document.getElementById('destination-value').textContent = "Not Selected";
    document.getElementById('eta-value').textContent = "--:--";
    document.getElementById('distance-value').textContent = "-- km";

    // Clear markers
    clearHospitalMarkers();
    clearAmbulanceMarkers();
    clearTrafficLightMarkers();

    // Remove routing
    if (routingControl) {
        map.removeControl(routingControl);
        routingControl = null;
    }

    // Remove traffic data
    removeSimulatedTrafficData();

    // Reset buttons
    document.getElementById('traffic-btn').classList.remove('active');
    document.getElementById('track-btn').classList.remove('active');
    document.getElementById('directions-btn').classList.remove('active');

    // Reset variables
    selectedFacility = null;
    trafficLayerActive = false;
    emergencyActive = false;

    // Hide directions panel
    hideDirectionsPanel();

    // Remove emergency mode
    document.body.classList.remove('emergency-mode');

    showNotification("Reset Complete", "Dashboard reset to initial state", "info");
}

// Simulate fetching weather data
function fetchWeatherData(lat, lng) {
    // In a real app, this would call a weather API using the lat/lng coordinates
    // For this demo, we'll simulate weather data

    console.log(`Fetching weather data for coordinates: ${lat}, ${lng}`);

    // In a real implementation, we would use these coordinates to get local weather
    // For example: const weatherApiUrl = `https://api.weather.com/v1/location/${lat},${lng}/conditions.json`;

    const weatherConditions = [
        { condition: "Clear", icon: "☀️", impact: "No impact on emergency services" },
        { condition: "Partly Cloudy", icon: "⛅", impact: "No impact on emergency services" },
        { condition: "Cloudy", icon: "☁️", impact: "Slight visibility reduction" },
        { condition: "Light Rain", icon: "🌦️", impact: "Minor delays possible" },
        { condition: "Heavy Rain", icon: "🌧️", impact: "Reduced visibility, possible delays" },
        { condition: "Thunderstorm", icon: "⛈️", impact: "Hazardous conditions, delays likely" },
        { condition: "Snow", icon: "❄️", impact: "Reduced traction, delays likely" },
        { condition: "Fog", icon: "🌫️", impact: "Severe visibility reduction" }
    ];

    // For demo purposes, we'll use the coordinates to seed the random number generator
    // This way the same location will tend to have the same weather
    const locationSeed = Math.abs(Math.sin(lat * lng) * 10000) % weatherConditions.length;
    const randomIndex = Math.floor(locationSeed);
    weatherData = weatherConditions[randomIndex];

    // Update weather status
    updateWeatherStatus(`${weatherData.icon} ${weatherData.condition} - ${weatherData.impact}`);
}

// Update weather status display
function updateWeatherStatus(text) {
    document.getElementById('weather-status').textContent = text;
}

// Show loading overlay with enhanced information
function showLoading(text = "Loading...") {
    const loadingText = document.getElementById('loading-text');
    loadingText.textContent = text;

    // Add a progress indicator for long-running operations
    if (window.loadingInterval) {
        clearInterval(window.loadingInterval);
    }

    let dots = 0;
    window.loadingInterval = setInterval(() => {
        dots = (dots + 1) % 4;
        const dotString = '.'.repeat(dots);
        loadingText.textContent = `${text}${dotString}`;
    }, 500);

    document.getElementById('loading-overlay').classList.remove('hidden');
}

// Hide loading overlay and clean up
function hideLoading() {
    if (window.loadingInterval) {
        clearInterval(window.loadingInterval);
        window.loadingInterval = null;
    }

    document.getElementById('loading-overlay').classList.add('hidden');
}

// Show notification
function showNotification(title, message, type = "info", duration = 3000) {
    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    notification.innerHTML = `
        <div class="notification-header">
            <h3>${title}</h3>
            <button class="notification-close" onclick="this.parentElement.parentElement.remove()">×</button>
        </div>
        <p>${message}</p>
    `;

    document.getElementById('notification-container').appendChild(notification);

    // Add animation classes
    setTimeout(() => {
        notification.classList.add('show');
    }, 10);

    // Auto-remove after duration
    setTimeout(() => {
        notification.classList.remove('show');

        // Remove from DOM after fade out
        setTimeout(() => {
            notification.remove();
        }, 300);
    }, duration);
}

// Add enhanced 3D building markers for hospitals
function create3DHospitalMarker(hospital) {
    // Determine hospital type icon and color
    let typeIcon = '🏥';
    let roofColor = '#e74c3c';
    let wallColor = '#ecf0f1';

    if (hospital.type === 'Clinic') {
        typeIcon = '🏥';
        roofColor = '#3498db';
    } else if (hospital.type === 'Medical Office') {
        typeIcon = '👨‍⚕️';
        roofColor = '#2ecc71';
    }

    // Determine status color based on beds availability
    const statusColor = hospital.beds > 20 ? '#2ecc71' :
                        hospital.beds > 10 ? '#f39c12' : '#e74c3c';

    // Create enhanced 3D marker with more details
    const markerHtml = `
        <div class="hospital-3d-marker">
            <div class="hospital-building">
                <div class="hospital-roof" style="background: linear-gradient(45deg, ${roofColor}, ${adjustColor(roofColor, -20)})"></div>
                <div class="hospital-walls" style="background: linear-gradient(to bottom, ${wallColor}, ${adjustColor(wallColor, -10)})">
                    <div class="hospital-windows"></div>
                </div>
                <div class="hospital-entrance"></div>
                <div class="hospital-sign">${typeIcon}</div>
            </div>
            <div class="hospital-shadow"></div>
            <div class="hospital-info">
                <h3>${hospital.name}</h3>
                <p>${hospital.distance} km away</p>
                <p>ETA: ${hospital.eta} mins</p>
                <div class="hospital-status" style="background-color: ${statusColor}">
                    ${hospital.beds > 20 ? 'Beds Available' : hospital.beds > 10 ? 'Limited Capacity' : 'Near Capacity'}
                </div>
                <div class="hospital-type-badge">${hospital.type}</div>
            </div>
        </div>
    `;

    const icon = L.divIcon({
        className: 'hospital-3d-icon',
        html: markerHtml,
        iconSize: [60, 80],  // Larger size for better visibility
        iconAnchor: [30, 80] // Adjusted anchor point
    });

    return L.marker([hospital.lat, hospital.lng], { icon: icon });
}

// Helper function to adjust color brightness
function adjustColor(color, amount) {
    // Remove # if present
    color = color.replace('#', '');

    // Parse the color
    let r = parseInt(color.substring(0, 2), 16);
    let g = parseInt(color.substring(2, 4), 16);
    let b = parseInt(color.substring(4, 6), 16);

    // Adjust each component
    r = Math.max(0, Math.min(255, r + amount));
    g = Math.max(0, Math.min(255, g + amount));
    b = Math.max(0, Math.min(255, b + amount));

    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}