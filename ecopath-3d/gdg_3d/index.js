require("dotenv").config();
const cors = require("cors");
const express = require("express");
const axios = require("axios");
const polyline = require("@mapbox/polyline");
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 1. create app
const app = express();
const PORT = 3000;

// 2. middleware
app.use(express.json());
app.use(express.static("public"));
app.use(cors()); // 🔥 REQUIRED FOR FRONTEND FETCH

// 🔑 API keys
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
const MAPS_JS_API_KEY = process.env.MAPS_JS_API_KEY || GOOGLE_MAPS_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

// Gemini init
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

/* --------------------
   Helpers
-------------------- */

// Decode polyline & get midpoint
function getRouteMidpoint(encodedPolyline) {
  if (!encodedPolyline) return null;
  const points = polyline.decode(encodedPolyline);
  const mid = Math.floor(points.length / 2);
  return { lat: points[mid][0], lng: points[mid][1] };
}

/* --------------------
   Air Quality helper
-------------------- */
async function getAirQuality(lat, lng) {
  const response = await axios.post(
    "https://airquality.googleapis.com/v1/currentConditions:lookup",
    { location: { latitude: lat, longitude: lng } },
    {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
      },
    }
  );
  return response.data;
}

/* --------------------
   Solar API helper
-------------------- */
async function getSolarIndex(lat, lng) {
  try {
    const response = await axios.get(
      "https://solar.googleapis.com/v1/buildingInsights:findClosest",
      {
        params: {
          "location.latitude": lat,
          "location.longitude": lng,
          key: GOOGLE_MAPS_API_KEY,
        },
      }
    );

    const sunHours =
      response.data?.solarPotential?.wholeRoofStats?.yearlySunlightHours ||
      2000;

    let solarIndex = 30;
    if (sunHours < 1500) solarIndex = 50;
    else if (sunHours < 2000) solarIndex = 40;

    return {
      solarIndex,
      shadeLabel:
        solarIndex >= 45
          ? "High Shade"
          : solarIndex >= 35
          ? "Moderate Shade"
          : "Low Shade",
    };
  } catch {
    return { solarIndex: 30, shadeLabel: "Unknown" };
  }
}

/* --------------------
   Green Index helper
-------------------- */
function calculateGreenIndex(distanceMeters, aqi) {
  let distanceScore = 50;
  if (distanceMeters > 2000) distanceScore = 45;
  if (distanceMeters > 5000) distanceScore = 30;
  if (distanceMeters > 10000) distanceScore = 15;

  let airQualityScore = 50;
  if (aqi > 100) airQualityScore = 20;
  if (aqi > 150) airQualityScore = 10;

  return distanceScore + airQualityScore;
}

/* --------------------
   Gemini Translation Layer
-------------------- */
async function getGeminiExplanation(data) {
  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-flash",
    });

    const prompt = `
Explain in simple language why this walking route is recommended.

Details:
- Distance: ${data.distanceMeters} meters
- AQI: ${data.aqi}
- Green Index: ${data.greenIndex}
- Shade: ${data.shadeLabel}

Rules:
- Max 2 sentences
- No technical words
`;

    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch {
    return "This route is recommended because it has cleaner air, a reasonable walking distance, and better shade for comfort.";
  }
}

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "EcoPath backend is running" });
});

// Main API
app.post("/get-green-route", async (req, res) => {
  const { origin, destination } = req.body;

  try {
    const routeResponse = await axios.post(
      "https://routes.googleapis.com/directions/v2:computeRoutes",
      {
        origin: { address: origin },
        destination: { address: destination },
        travelMode: "WALK",
        computeAlternativeRoutes: true,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": GOOGLE_MAPS_API_KEY,
          "X-Goog-FieldMask":
            "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline",
        },
      }
    );

    const routes = routeResponse.data.routes;
    const evaluatedRoutes = [];

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const midpoint = getRouteMidpoint(
        route.polyline?.encodedPolyline
      );

      let aqi = 100;
      let solar = { solarIndex: 30, shadeLabel: "Unknown" };

      if (midpoint) {
        const air = await getAirQuality(midpoint.lat, midpoint.lng);
        aqi = air.indexes?.[0]?.aqi || 100;
        solar = await getSolarIndex(midpoint.lat, midpoint.lng);
      }

      const baseGreenIndex = calculateGreenIndex(
        route.distanceMeters,
        aqi
      );

      evaluatedRoutes.push({
        routeIndex: i,
        distanceMeters: route.distanceMeters,
        duration: route.duration,
        aqi,
        baseGreenIndex,
        greenIndex: baseGreenIndex + solar.solarIndex,
        solar,
        polyline: route.polyline,
      });
    }

    const bestRoute = evaluatedRoutes.reduce((a, b) =>
      b.greenIndex > a.greenIndex ? b : a
    );

    const explanation = await getGeminiExplanation({
      distanceMeters: bestRoute.distanceMeters,
      aqi: bestRoute.aqi,
      greenIndex: bestRoute.greenIndex,
      shadeLabel: bestRoute.solar.shadeLabel,
    });

    res.json({
      message: "Green corridor selected",
      selected_route: bestRoute,
      alternative_routes: evaluatedRoutes,
      explanation,
    });
  } catch (error) {
    console.error("Backend error:", error.message);
    res.status(500).json({
      error: "Failed to calculate green corridor",
      details: error.message,
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
