// API Key for OpenWeatherMap API - Replace with your own API key
const API_KEY = "54523491dceae28d59694598a16248fd";

// DOM Elements
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
const currentLocationBtn = document.getElementById('current-location-btn');
const saveLocationBtn = document.getElementById('save-location-btn');
const cityName = document.getElementById('city-name');
const currentDate = document.getElementById('current-date');
const temperature = document.getElementById('temperature');
const weatherDescription = document.getElementById('weather-description');
const humidity = document.getElementById('humidity');
const windSpeed = document.getElementById('wind-speed');
const pressure = document.getElementById('pressure');
const forecastContainer = document.getElementById('forecast');
const hourlyContainer = document.getElementById('hourly-container');
const savedLocationsContainer = document.getElementById('saved-locations-container');
const weatherAlert = document.getElementById('weather-alert');
const alertText = document.getElementById('alert-text');
const loadingIndicator = document.querySelector('.loading');

// Default location
let currentCity = "london";

// Load saved locations from local storage
let savedLocations = JSON.parse(localStorage.getItem('savedLocations')) || [];

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    // Load default city or last searched city
    const lastCity = localStorage.getItem('lastCity');
    if (lastCity) {
        currentCity = lastCity;
    }
    
    getWeatherData(currentCity);
    displaySavedLocations();
    
    // Event listeners
    searchBtn.addEventListener('click', handleSearch);
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });
    
    currentLocationBtn.addEventListener('click', getUserLocation);
    saveLocationBtn.addEventListener('click', saveCurrentLocation);
});

// Handle search
function handleSearch() {
    const city = searchInput.value.trim();
    if (city) {
        showLoading();
        getWeatherData(city);
    }
}

// Get user's current location
function getUserLocation() {
    showLoading();
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const { latitude, longitude } = position.coords;
                getWeatherByCoordinates(latitude, longitude);
            },
            (error) => {
                hideLoading();
                alert(`Error getting location: ${error.message}`);
            }
        );
    } else {
        hideLoading();
        alert("Geolocation is not supported by your browser");
    }
}

// Get weather data by city name
async function getWeatherData(city) {
    try {
        showLoading();
        
        // Get current weather
        const currentWeatherResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${API_KEY}&units=metric`
        );
        
        if (!currentWeatherResponse.ok) {
            throw new Error('City not found');
        }
        
        const currentWeatherData = await currentWeatherResponse.json();
        const { lat, lon } = currentWeatherData.coord;
        
        // Get forecast and detailed data using 3.0 API
        const forecastResponse = await fetch(
            `https://api.openweathermap.org/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely&appid=${API_KEY}&units=metric`
        );
        
        // Check if 3.0 API worked, if not fall back to 2.5
        let forecastData;
        if (forecastResponse.ok) {
            forecastData = await forecastResponse.json();
        } else {
            // Fallback to 2.5 API
            const fallbackResponse = await fetch(
                `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
            );
            
            if (!fallbackResponse.ok) {
                throw new Error('Failed to fetch forecast data');
            }
            
            const fallbackData = await fallbackResponse.json();
            
            // Convert the 5-day/3-hour forecast to our expected format
            forecastData = convertForecastFormat(fallbackData, currentWeatherData);
        }
        
        // Update current city and save to local storage
        currentCity = currentWeatherData.name;
        localStorage.setItem('lastCity', currentCity);
        
        // Display the data
        displayCurrentWeather(currentWeatherData);
        displayForecast(forecastData);
        displayHourlyForecast(forecastData);
        displayAlerts(forecastData);
        
        // Change background based on weather
        setBackgroundByWeather(currentWeatherData.weather[0].main, 
                              isDaytime(currentWeatherData.dt, currentWeatherData.sys.sunrise, currentWeatherData.sys.sunset));
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error details:', error);
        alert(`Error fetching weather data: ${error.message}`);
    }
}

// Convert the 5-day/3-hour forecast to our expected format
function convertForecastFormat(forecastData, currentWeatherData) {
    // Group forecast by day
    const dailyForecasts = {};
    
    forecastData.list.forEach(item => {
        const date = new Date(item.dt * 1000);
        const day = date.toDateString();
        
        if (!dailyForecasts[day]) {
            dailyForecasts[day] = {
                dt: item.dt,
                temp: { day: item.main.temp, min: item.main.temp_min, max: item.main.temp_max },
                weather: [item.weather[0]],
                hourly: []
            };
        } else {
            // Update min/max temps
            if (item.main.temp_max > dailyForecasts[day].temp.max) {
                dailyForecasts[day].temp.max = item.main.temp_max;
            }
            if (item.main.temp_min < dailyForecasts[day].temp.min) {
                dailyForecasts[day].temp.min = item.main.temp_min;
            }
            
            // Add to hourly forecast
            dailyForecasts[day].hourly.push({
                dt: item.dt,
                temp: item.main.temp,
                weather: [item.weather[0]]
            });
        }
    });
    
    // Convert to array format
    const daily = Object.values(dailyForecasts);
    
    // Create hourly array for next 24 hours
    const hourly = forecastData.list.slice(0, 8).map(item => ({
        dt: item.dt,
        temp: item.main.temp,
        weather: [item.weather[0]]
    }));
    
    // Create current data
    const current = {
        dt: currentWeatherData.dt,
        sunrise: currentWeatherData.sys.sunrise,
        sunset: currentWeatherData.sys.sunset,
        temp: currentWeatherData.main.temp,
        weather: currentWeatherData.weather
    };
    
    return {
        current,
        hourly,
        daily,
        alerts: [] // Default to empty alerts
    };
}

// Get weather by coordinates
async function getWeatherByCoordinates(lat, lon) {
    try {
        // Get current weather
        const currentWeatherResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
        );
        
        if (!currentWeatherResponse.ok) {
            throw new Error('Location not found');
        }
        
        const currentWeatherData = await currentWeatherResponse.json();
        
        // Get forecast using 2.5 API as fallback
        const forecastResponse = await fetch(
            `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric`
        );
        
        if (!forecastResponse.ok) {
            throw new Error('Failed to fetch forecast data');
        }
        
        const forecastData = await forecastResponse.json();
        
        // Convert the 5-day/3-hour forecast to our expected format
        const convertedForecastData = convertForecastFormat(forecastData, currentWeatherData);
        
        // Update current city and save to local storage
        currentCity = currentWeatherData.name;
        localStorage.setItem('lastCity', currentCity);
        
        // Display the data
        displayCurrentWeather(currentWeatherData);
        displayForecast(convertedForecastData);
        displayHourlyForecast(convertedForecastData);
        displayAlerts(convertedForecastData);
        
        // Change background based on weather
        setBackgroundByWeather(currentWeatherData.weather[0].main, 
                              isDaytime(currentWeatherData.dt, currentWeatherData.sys.sunrise, currentWeatherData.sys.sunset));
        
        hideLoading();
    } catch (error) {
        hideLoading();
        console.error('Error details:', error);
        alert(`Error fetching weather data: ${error.message}`);
    }
}

// Check if it's daytime
function isDaytime(currentTime, sunrise, sunset) {
    return currentTime > sunrise && currentTime < sunset ? 'day' : 'night';
}

// Display current weather
function displayCurrentWeather(currentData) {
    const date = new Date(currentData.dt * 1000);
    cityName.textContent = `${currentData.name}, ${currentData.sys.country}`;
    currentDate.textContent = formatDate(date);
    temperature.textContent = `${Math.round(currentData.main.temp)}°C`;
    weatherDescription.textContent = currentData.weather[0].description;
    humidity.textContent = `${currentData.main.humidity}%`;
    windSpeed.textContent = `${(currentData.wind.speed * 3.6).toFixed(1)} km/h`;
    pressure.textContent = `${currentData.main.pressure} hPa`;
}

// Display 4-day forecast
function displayForecast(forecastData) {
    forecastContainer.innerHTML = '';
    
    // Make sure we have daily data
    if (!forecastData.daily || forecastData.daily.length < 4) {
        forecastContainer.innerHTML = '<p>No forecast data available</p>';
        return;
    }
    
    // Display next 4 days
    const daysToShow = Math.min(4, forecastData.daily.length);
    for (let i = 0; i < daysToShow; i++) {
        const dayData = forecastData.daily[i];
        const date = new Date(dayData.dt * 1000);
        
        const forecastDay = document.createElement('div');
        forecastDay.classList.add('forecast-day');
        
        forecastDay.innerHTML = `
            <h3 class="forecast-date">${formatDay(date)}</h3>
            <img src="http://openweathermap.org/img/wn/${dayData.weather[0].icon}@2x.png" alt="${dayData.weather[0].description}">
            <p class="forecast-temp">${Math.round(dayData.temp.day)}°C</p>
            <p>${dayData.weather[0].description}</p>
            <p>H: ${Math.round(dayData.temp.max)}°C | L: ${Math.round(dayData.temp.min)}°C</p>
        `;
        
        forecastContainer.appendChild(forecastDay);
    }
}

// Display hourly forecast for the next 24 hours
function displayHourlyForecast(forecastData) {
    hourlyContainer.innerHTML = '';
    
    // Make sure we have hourly data
    if (!forecastData.hourly || forecastData.hourly.length === 0) {
        hourlyContainer.innerHTML = '<p>No hourly data available</p>';
        return;
    }
    
    // Display hourly forecast for the next 24 hours (in 3-hour intervals)
    const hoursToShow = Math.min(8, forecastData.hourly.length);
    for (let i = 0; i < hoursToShow; i++) {
        const hourData = forecastData.hourly[i];
        const date = new Date(hourData.dt * 1000);
        
        const hourlyItem = document.createElement('div');
        hourlyItem.classList.add('hourly-item');
        
        hourlyItem.innerHTML = `
            <p>${date.getHours()}:00</p>
            <img src="http://openweathermap.org/img/wn/${hourData.weather[0].icon}.png" alt="${hourData.weather[0].description}">
            <p class="hourly-temp">${Math.round(hourData.temp)}°C</p>
            <p>${hourData.weather[0].description}</p>
        `;
        
        hourlyContainer.appendChild(hourlyItem);
    }
}

// Display weather alerts if any
function displayAlerts(forecastData) {
    if (forecastData.alerts && forecastData.alerts.length > 0) {
        const alert = forecastData.alerts[0];
        alertText.textContent = alert.description;
        weatherAlert.style.display = 'block';
    } else {
        weatherAlert.style.display = 'none';
    }
}

// Save current location
function saveCurrentLocation() {
    if (!currentCity) return;
    
    // Check if location is already saved
    if (!savedLocations.includes(currentCity)) {
        savedLocations.push(currentCity);
        localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
        displaySavedLocations();
    }
}

// Display saved locations
function displaySavedLocations() {
    savedLocationsContainer.innerHTML = '';
    
    savedLocations.forEach((location, index) => {
        const locationCard = document.createElement('div');
        locationCard.classList.add('location-card');
        locationCard.innerHTML = `
            <h3>${location}</h3>
            <button class="remove-location" data-index="${index}">×</button>
        `;
        
        // Add click event to load this location
        locationCard.addEventListener('click', () => {
            getWeatherData(location);
        });
        
        savedLocationsContainer.appendChild(locationCard);
    });
    
    // Add event listeners to remove buttons
    document.querySelectorAll('.remove-location').forEach(button => {
        button.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = e.target.getAttribute('data-index');
            removeLocation(index);
        });
    });
}

// Remove a saved location
function removeLocation(index) {
    savedLocations.splice(index, 1);
    localStorage.setItem('savedLocations', JSON.stringify(savedLocations));
    displaySavedLocations();
}

// Set background based on weather condition and time of day
function setBackgroundByWeather(weatherCondition, timeOfDay) {
    let backgroundImage;
    
    switch (weatherCondition.toLowerCase()) {
        case 'clear':
            backgroundImage = timeOfDay === 'day' ? 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' :
                'https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
            break;
        case 'clouds':
            backgroundImage = timeOfDay === 'day' ? 'https://images.unsplash.com/photo-1525920955777-02e13f29c7f0?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' :
                'https://images.unsplash.com/photo-1534088568595-a066f410bcda?ixlib=rb-1.2.1&auto=format&fit=crop&w=1351&q=80';
            break;
        case 'rain':
        case 'drizzle':
            backgroundImage = 'https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
            break;
        case 'thunderstorm':
            backgroundImage = 'https://images.unsplash.com/photo-1605727216801-e27ce1d0cc28?ixlib=rb-1.2.1&auto=format&fit=crop&w=1351&q=80';
            break;
        case 'snow':
            backgroundImage = 'https://images.unsplash.com/photo-1491002052546-bf38f186af56?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
            break;
        case 'mist':
        case 'fog':
        case 'haze':
            backgroundImage = 'https://images.unsplash.com/photo-1585508889431-a1d0d9c5a324?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
            break;
        default:
            backgroundImage = timeOfDay === 'day' ? 'https://images.unsplash.com/photo-1601297183305-6df142704ea2?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80' :
                'https://images.unsplash.com/photo-1531306728370-e2ebd9d7bb99?ixlib=rb-1.2.1&auto=format&fit=crop&w=1350&q=80';
    }
    
    document.body.style.backgroundImage = `url('${backgroundImage}')`;
}

// Format date
function formatDate(date) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return date.toLocaleDateString('en-US', options);
}

// Format day
function formatDay(date) {
    const options = { weekday: 'long' };
    return date.toLocaleDateString('en-US', options);
}

// Show loading indicator
function showLoading() {
    loadingIndicator.classList.add('active');
}

// Hide loading indicator
function hideLoading() {
    loadingIndicator.classList.remove('active');
}