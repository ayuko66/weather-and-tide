"use strict";

const NAGOYA_LAT = 35.1815;
const NAGOYA_LON = 136.9066;
const PREFECTURE_CODE = 23;
const HARBOR_CODE = 17;

const FISHING_SPOTS = [
  { id: "shinmaiko", name: "新舞子マリンパーク", alias: "魚釣り施設", latitude: 34.9497, longitude: 136.8180 },
  { id: "rinku", name: "りんくう釣り護岸", alias: "常滑りんくうビーチ隣接", latitude: 34.8820, longitude: 136.8250 },
  { id: "kasumi", name: "四日市港・霞地区魚釣り施設", alias: "霞埠頭の魚釣り施設", latitude: 35.0130, longitude: 136.6580 },
  { id: "hekinan", name: "碧南釣り広場", alias: "碧南海釣り公園／旧・中部電力釣り広場", latitude: 34.8290, longitude: 136.9600 },
  { id: "inae", name: "稲永公園周辺", alias: "藤前干潟・庄内川河口周辺", latitude: 35.0790, longitude: 136.8500 },
  { id: "taketoyo", name: "武豊緑地", alias: "衣浦港の海浜緑地", latitude: 34.8460, longitude: 136.9200 },
];

let spotRequestId = 0;

const WEATHER_CODE_MAP = {
  0: ["晴れ", "☀️"], 1: ["晴れ", "🌤️"], 2: ["くもり", "⛅"], 3: ["くもり", "☁️"],
  45: ["霧", "🌫️"], 48: ["霧", "🌫️"], 51: ["小雨", "🌦️"], 53: ["雨", "🌦️"],
  55: ["雨", "🌧️"], 61: ["雨", "🌧️"], 63: ["雨", "🌧️"], 65: ["強い雨", "🌧️"],
  71: ["雪", "❄️"], 73: ["雪", "❄️"], 75: ["強い雪", "❄️"], 77: ["雪", "❄️"],
  80: ["にわか雨", "🌦️"], 81: ["にわか雨", "🌦️"], 82: ["激しいにわか雨", "🌧️"],
  95: ["雷雨", "⛈️"], 96: ["雷雨", "⛈️"], 99: ["激しい雷雨", "⛈️"],
};

const byId = (id) => document.getElementById(id);

function formatToday() {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo", month: "long", day: "numeric", weekday: "short",
  }).format(new Date());
}

function todayKey() {
  return tideDate(0);
}

function tideDate(offsetDays) {
  const date = new Date(Date.now() + offsetDays * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return {
    yr: Number(values.year), mn: Number(values.month), dy: Number(values.day),
    key: `${values.year}-${values.month}-${values.day}`,
    displayDate: new Intl.DateTimeFormat("ja-JP", {
      timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short",
    }).format(date),
  };
}

function showState(prefix, state) {
  byId(`${prefix}-loading`).classList.toggle("hidden", state !== "loading");
  byId(`${prefix}-content`).classList.toggle("hidden", state !== "content");
  byId(`${prefix}-error`).classList.toggle("hidden", state !== "error");
}

function numberOrThrow(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}を取得できませんでした。`);
  return number;
}

async function fetchWeather() {
  const params = new URLSearchParams({
    latitude: NAGOYA_LAT, longitude: NAGOYA_LON,
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max,sunrise,sunset",
    timezone: "Asia/Tokyo", forecast_days: "2", wind_speed_unit: "ms",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`天気APIから応答がありません（${response.status}）。`);
  return response.json();
}

function buildForecastPeriods(data) {
  if (!data?.hourly?.time || !data?.daily?.time) throw new Error("予報データの形式が正しくありません。");
  const today = todayKey().key;
  const hourlyPeriod = (label, hour) => {
    const index = data.hourly.time.indexOf(`${today}T${hour}:00`);
    if (index < 0) throw new Error(`${label}の予報が見つかりませんでした。`);
    return {
      label, timeLabel: `${Number(hour)}:00`, code: data.hourly.weather_code?.[index],
      temperature: numberOrThrow(data.hourly.temperature_2m?.[index], `${label}の気温`),
      rain: numberOrThrow(data.hourly.precipitation_probability?.[index], `${label}の降水確率`),
      wind: numberOrThrow(data.hourly.wind_speed_10m?.[index], `${label}の風速`),
    };
  };
  const tomorrowIndex = data.daily.time.findIndex((date) => date > today);
  if (tomorrowIndex < 0) throw new Error("明日の予報が見つかりませんでした。");
  const tomorrowDate = new Date(`${data.daily.time[tomorrowIndex]}T00:00:00+09:00`);
  return [
    hourlyPeriod("午前", "09"),
    hourlyPeriod("午後", "15"),
    {
      label: "明日",
      timeLabel: new Intl.DateTimeFormat("ja-JP", { month: "numeric", day: "numeric" }).format(tomorrowDate),
      code: data.daily.weather_code?.[tomorrowIndex],
      max: numberOrThrow(data.daily.temperature_2m_max?.[tomorrowIndex], "明日の最高気温"),
      min: numberOrThrow(data.daily.temperature_2m_min?.[tomorrowIndex], "明日の最低気温"),
      rain: numberOrThrow(data.daily.precipitation_probability_max?.[tomorrowIndex], "明日の降水確率"),
      wind: numberOrThrow(data.daily.wind_speed_10m_max?.[tomorrowIndex], "明日の最大風速"),
    },
  ];
}

function appendTextElement(parent, tagName, className, text) {
  const element = document.createElement(tagName);
  element.className = className;
  element.textContent = text;
  parent.append(element);
  return element;
}

function renderForecastPeriods(container, periods) {
  container.replaceChildren();
  periods.forEach((period) => {
    const [description, icon] = WEATHER_CODE_MAP[Number(period.code)] ?? ["不明", "❔"];
    const article = document.createElement("article");
    article.className = "forecast-period";
    const header = document.createElement("header");
    header.className = "forecast-period-header";
    appendTextElement(header, "h3", "forecast-period-title", period.label);
    appendTextElement(header, "span", "forecast-period-time", period.timeLabel);
    const summary = document.createElement("div");
    summary.className = "forecast-summary";
    appendTextElement(summary, "span", "forecast-icon", icon).setAttribute("aria-hidden", "true");
    appendTextElement(summary, "span", "forecast-description", description);
    const temperatureText = period.max === undefined
      ? `${Math.round(period.temperature)}℃`
      : `${Math.round(period.max)}℃ / ${Math.round(period.min)}℃`;
    const temperature = appendTextElement(article, "strong", "forecast-temperature", temperatureText);
    if (period.max !== undefined) temperature.classList.add("range");
    const stats = document.createElement("dl");
    stats.className = "forecast-stats";
    [["降水", `${Math.round(period.rain)}%`], [period.max === undefined ? "風速" : "最大風速", `${period.wind.toFixed(1)} m/s`]].forEach(([label, value]) => {
      const row = document.createElement("div");
      row.className = "forecast-stat";
      appendTextElement(row, "dt", "", label);
      appendTextElement(row, "dd", "", value);
      stats.append(row);
    });
    article.prepend(header, summary);
    article.append(stats);
    container.append(article);
  });
}

function renderWeather(data) {
  renderForecastPeriods(byId("weather-forecast"), buildForecastPeriods(data));
  const todayIndex = data.daily.time.indexOf(todayKey().key);
  const formatSunTime = (value) => {
    const match = typeof value === "string" ? value.match(/T(\d{2}):(\d{2})/) : null;
    return match ? `${Number(match[1])}:${match[2]}` : "--:--";
  };
  byId("sunrise-time").textContent = formatSunTime(data.daily.sunrise?.[todayIndex]);
  byId("sunset-time").textContent = formatSunTime(data.daily.sunset?.[todayIndex]);
  showState("weather", "content");
}

function renderWeatherError(message) {
  byId("weather-error").textContent = `天気を表示できませんでした。${message}`;
  showState("weather", "error");
}

async function loadWeather() {
  try { renderWeather(await fetchWeather()); }
  catch (error) { renderWeatherError(error instanceof Error ? error.message : "時間をおいて再度お試しください。"); }
}

async function fetchTideDate(dateInfo) {
  const { yr, mn, dy, key } = dateInfo;
  const params = new URLSearchParams({ pc: PREFECTURE_CODE, hc: HARBOR_CODE, yr, mn, dy, rg: "day" });
  const response = await fetch(`https://tide736.net/api/get_tide.php?${params}`);
  if (!response.ok) throw new Error(`潮汐APIから応答がありません（${response.status}）。`);
  const data = await response.json();
  if (Number(data.status) !== 1) throw new Error(data.message || "潮汐データを取得できませんでした。");
  const chart = data.tide?.chart?.[key];
  if (!chart) throw new Error("指定日の潮汐データが見つかりませんでした。");
  return chart;
}

async function fetchTide() {
  const days = [
    { id: "today", label: "今日", dateInfo: tideDate(0) },
    { id: "tomorrow", label: "明日", dateInfo: tideDate(1) },
  ];
  const results = await Promise.allSettled(days.map(({ dateInfo }) => fetchTideDate(dateInfo)));
  const tideDays = days.map((day, index) => ({
    ...day,
    chart: results[index].status === "fulfilled" ? results[index].value : null,
    error: results[index].status === "rejected"
      ? (results[index].reason instanceof Error ? results[index].reason.message : "データを取得できませんでした。")
      : null,
  }));
  if (tideDays.every(({ chart }) => !chart)) throw new Error("今日と明日の潮汐データを取得できませんでした。");
  return tideDays;
}

function buildTideListItems(listEl, events) {
  listEl.replaceChildren();
  if (!Array.isArray(events) || events.length === 0) {
    const item = document.createElement("li");
    item.className = "empty-data";
    item.textContent = "データなし";
    listEl.append(item);
    return;
  }
  events.forEach((event) => {
    const item = document.createElement("li");
    const time = document.createElement("span");
    const height = document.createElement("strong");
    time.className = "tide-time";
    height.className = "tide-cm";
    time.textContent = event.time || "--:--";
    height.textContent = `${numberOrThrow(event.cm, "潮位").toFixed(1)} cm`;
    item.append(time, height);
    listEl.append(item);
  });
}

function renderTideDay(day) {
  byId(`${day.id}-tide-date`).textContent = day.dateInfo.displayDate;
  const data = byId(`${day.id}-tide-data`);
  const error = byId(`${day.id}-tide-error`);
  if (!day.chart) {
    byId(`${day.id}-moon-title`).textContent = "取得不可";
    error.textContent = `${day.label}の潮汐を表示できませんでした。${day.error}`;
    error.classList.remove("hidden");
    data.classList.add("hidden");
    return;
  }
  byId(`${day.id}-moon-title`).textContent = day.chart.moon?.title || "不明";
  buildTideListItems(byId(`${day.id}-flood-list`), day.chart.flood);
  buildTideListItems(byId(`${day.id}-ebb-list`), day.chart.edd);
  error.classList.add("hidden");
  data.classList.remove("hidden");
}

function renderTide(days) {
  days.forEach(renderTideDay);
  showState("tide", "content");
}

function renderTideError(message) {
  byId("tide-error").textContent = `潮汐を表示できませんでした。${message}`;
  showState("tide", "error");
}

async function loadTide() {
  try { renderTide(await fetchTide()); }
  catch (error) { renderTideError(error instanceof Error ? error.message : "時間をおいて再度お試しください。"); }
}

function populateSpotSelect() {
  const select = byId("spot-select");
  FISHING_SPOTS.forEach((spot) => {
    const option = document.createElement("option");
    option.value = spot.id;
    option.textContent = spot.name;
    select.append(option);
  });
  select.addEventListener("change", loadSpotWeather);
}

async function fetchSpotWeather(spot) {
  const params = new URLSearchParams({
    latitude: spot.latitude, longitude: spot.longitude,
    hourly: "temperature_2m,precipitation_probability,weather_code,wind_speed_10m",
    daily: "temperature_2m_max,temperature_2m_min,precipitation_probability_max,weather_code,wind_speed_10m_max",
    timezone: "Asia/Tokyo", forecast_days: "2", wind_speed_unit: "ms",
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error(`予報APIから応答がありません（${response.status}）。`);
  return response.json();
}

function renderSpotWeather(data, spot) {
  byId("spot-alias").textContent = spot.alias;
  renderForecastPeriods(byId("spot-forecast"), buildForecastPeriods(data));
  showState("spot", "content");
}

function renderSpotWeatherError(message) {
  byId("spot-error").textContent = `スポット予報を表示できませんでした。${message}`;
  showState("spot", "error");
}

async function loadSpotWeather() {
  const requestId = ++spotRequestId;
  const spot = FISHING_SPOTS.find(({ id }) => id === byId("spot-select").value);
  if (!spot) {
    renderSpotWeatherError("選択されたスポットが見つかりません。");
    return;
  }
  byId("spot-alias").textContent = spot.alias;
  showState("spot", "loading");
  try {
    const data = await fetchSpotWeather(spot);
    if (requestId === spotRequestId) renderSpotWeather(data, spot);
  } catch (error) {
    if (requestId === spotRequestId) {
      renderSpotWeatherError(error instanceof Error ? error.message : "時間をおいて再度お試しください。");
    }
  }
}

byId("today-date").textContent = formatToday();
populateSpotSelect();
loadWeather();
loadTide();
loadSpotWeather();
