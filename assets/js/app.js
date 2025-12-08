// ===== Конфигурация борда (localStorage) =====

const CONFIG_STORAGE_KEY = "mtaBoardConfig";
const DEFAULT_ROUTE_LABEL = "BUS";

function getInitialBusLabel() {
  return config?.lastLineLabel || DEFAULT_ROUTE_LABEL;
}

const defaultConfig = {
  workerUrl: "https://mta-selected-transport-web-app-with-ads-v4.pages.dev/api/stop-monitoring",
  stopId: "300432",                  // можно так или MTA_300432
  refreshSeconds: 30,
  maxArrivals: 3,
  lastLineLabel: null,
};

function loadConfig() {
  try {
    const raw = localStorage.getItem(CONFIG_STORAGE_KEY);
    if (!raw) return { ...defaultConfig };
    const parsed = JSON.parse(raw);
    return { ...defaultConfig, ...parsed };
  } catch {
    return { ...defaultConfig };
  }
}

function saveConfig(cfg) {
  localStorage.setItem(CONFIG_STORAGE_KEY, JSON.stringify(cfg));
}

function setLastLineLabel(label) {
  if (!label) return;
  if (config.lastLineLabel === label) return;
  config.lastLineLabel = label;
  saveConfig(config);
}

let config = loadConfig();

// ===== Состояние для вывода на экран =====

// то, что реально рисуем сейчас
const DEFAULT_TIME_PLACEHOLDERS = ["-", "-", "-"];

const screenConfig = {
  bus: getInitialBusLabel(),
  times: [...DEFAULT_TIME_PLACEHOLDERS],
};

// сюда будем класть все маршруты на остановке
let lineRotationOrder = [];          // например ["B6", "B82"]
let arrivalsByLine = {};             // { "B6": [10, 35, 55], "B82": [3, 5, 24] }
let currentLineIndex = 0;

// интервал переключения маршрутов (10 сек)
const LINE_ROTATION_INTERVAL_MS = 10_000;
// сколько минимум записей запрашиваем на маршрут, даже если показываем меньше
const MIN_FETCH_ARRIVALS_PER_LINE = 5;
const MAX_FETCH_VISITS = 15;
const MAX_MINUTES_AHEAD = 100;
const ORDER_TEXTS = ["You've got time", "Hot pizza & rolls", "Fresh oven vibes"];
const ORDER_TEXT_INTERVAL_MS = 5000;
let lineRotationTimer = null;

// интервал обновления данных с MTA
let refreshTimer = null;

// ===== Утилиты =====

function formatTime(date) {
  let h = date.getHours();
  const m = date.getMinutes().toString().padStart(2, "0");
  const suffix = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, "0")}:${m} ${suffix}`;
}

// ===== Рендер верхней части (маршрут + времена) =====

function getDisplayArrivalsCount() {
  return Math.max(1, config.maxArrivals || defaultConfig.maxArrivals);
}

function getFetchArrivalsCount() {
  return Math.max(getDisplayArrivalsCount(), MIN_FETCH_ARRIVALS_PER_LINE);
}

function formatArrival(minutes) {
  if (minutes === 0) return "Now";
  return minutes;
}

function renderBusHeader() {
  const timesRoot = document.getElementById("arrival-times");
  const routeTextEl = document.querySelector(".route-text");

  if (!timesRoot) return;

  if (routeTextEl) {
    routeTextEl.textContent = screenConfig.bus || DEFAULT_ROUTE_LABEL;
  }

  timesRoot.innerHTML = "";

  const times = screenConfig.times.slice(0, getDisplayArrivalsCount());

  times.forEach((t, i) => {
    const row = document.createElement("div");
    row.className = "arrival-time-row" + (i === 0 ? " primary" : "");

    const value = document.createElement("span");
    value.className = "time";
    value.textContent = formatArrival(t);

    const label = document.createElement("span");
    label.className = "min-label";
    label.textContent = "min";

    row.appendChild(value);
    row.appendChild(label);
    timesRoot.appendChild(row);
  });
}

// ===== Пицца-слайдер (как было) =====

const pizzaSlides = [
  {
    title: "",
    price: "",
    image:
      "assets/pizza_image_1.jpeg",
    duration: 4000,
  },
  {
    title: "FRESH OUT OF THE OVEN",
    price: "$19.00",
    video: "assets/pizza_vertical_video.mp4",
    duration: 7000,
  },
  {
    title: "",
    price: "",
    image:
      "assets/pizza_image_2.jpg",
    duration: 4000,
  },
  {
    title: "",
    price: "",
    image:
      "https://images.unsplash.com/photo-1604068549290-dea0e4a305ca?auto=format&fit=crop&w=800&q=80",
    duration: 4000,
  },
  {
    title: "",
    price: "",
    image:
      "https://images.unsplash.com/photo-1590947132387-155cc02f3212?auto=format&fit=crop&w=800&q=80",
    duration: 4000,
  },
];

function initPizzaSlideshow() {
  const imgEl = document.getElementById("pizza-image");
  const videoEl = document.getElementById("pizza-video");
  const titleEl = document.getElementById("pizza-title");
  const priceEl = document.getElementById("pizza-price");
  const dots = document.querySelectorAll(".dot");

  if (!imgEl || !titleEl || !priceEl || dots.length === 0 || !videoEl) return;

  let slideIndex = 0;
  let slideTimer = null;

  function setSlide(i) {
    const slide = pizzaSlides[i];
    const isVideo = Boolean(slide.video);

    if (isVideo) {
      imgEl.classList.add("hidden");
      videoEl.classList.remove("hidden");
      videoEl.src = slide.video;
      videoEl.load();
      videoEl.play().catch(() => {});
    } else {
      videoEl.pause();
      videoEl.currentTime = 0;
      videoEl.classList.add("hidden");
      imgEl.classList.remove("hidden");
      imgEl.src = slide.image;
      imgEl.alt = slide.title;
    }
    titleEl.textContent = slide.title;
    priceEl.textContent = slide.price;

    dots.forEach((dot, dotIndex) => {
      dot.classList.toggle("active", dotIndex === i);
    });
  }

  function queueNextSlide() {
    const current = pizzaSlides[slideIndex];
    const delay = Math.max(1000, current.duration || 4000);
    if (slideTimer) {
      clearTimeout(slideTimer);
    }

    slideTimer = setTimeout(() => {
      slideIndex = (slideIndex + 1) % pizzaSlides.length;
      setSlide(slideIndex);
      queueNextSlide();
    }, delay);
  }

  setSlide(slideIndex);
  queueNextSlide();
}

function initOrderTextCycle() {
  const orderEl = document.getElementById("order-text");
  if (!orderEl || ORDER_TEXTS.length === 0) return;

  let index = 0;
  orderEl.textContent = ORDER_TEXTS[index];

  setInterval(() => {
    index = (index + 1) % ORDER_TEXTS.length;
    orderEl.textContent = ORDER_TEXTS[index];
  }, ORDER_TEXT_INTERVAL_MS);
}

// ===== Часы =====

function initClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;

  function tick() {
    const now = new Date();
    clockEl.textContent = formatTime(now);
  }

  tick();
  setInterval(tick, 1000);
}

// ===== Парсинг ответа Siri: группируем по маршрутам =====

/**
 * Возвращает Map: { "B6" -> [10, 35, 55], "B82" -> [3, 5, 24], ... }
 */
function extractArrivalsByLine(json) {
  const result = new Map();

  try {
    const deliveries =
      json?.Siri?.ServiceDelivery?.StopMonitoringDelivery || [];
    const visits = deliveries[0]?.MonitoredStopVisit || [];
    const now = Date.now();

    visits.forEach((v) => {
      const mvj = v.MonitoredVehicleJourney;
      if (!mvj) return;

      // Имя маршрута: PublishedLineName[0] или очищенный LineRef
      let lineName = null;

      if (Array.isArray(mvj.PublishedLineName) && mvj.PublishedLineName[0]) {
        lineName = String(mvj.PublishedLineName[0]);
      } else if (typeof mvj.PublishedLineName === "string") {
        lineName = mvj.PublishedLineName;
      } else if (typeof mvj.LineRef === "string") {
        // "MTA NYCT_B6" -> "B6"
        const parts = mvj.LineRef.split("_");
        lineName = parts[parts.length - 1];
      }

      if (!lineName) {
        return;
      }

      const call = mvj.MonitoredCall;
      if (!call) return;

      const timeStr =
        call.ExpectedArrivalTime ||
        call.ExpectedDepartureTime ||
        call.AimedArrivalTime;

      if (!timeStr) return;

      const ts = Date.parse(timeStr);
      if (Number.isNaN(ts)) return;

      const diffMin = Math.round((ts - now) / 60000);
      if (diffMin < 0 || diffMin > MAX_MINUTES_AHEAD) return; // вне окна отображения

      if (!result.has(lineName)) {
        result.set(lineName, []);
      }
      result.get(lineName).push(diffMin);
    });

    const perLineLimit = getFetchArrivalsCount();

    // сортируем и храним небольшой буфер на маршрут
    result.forEach((arr, key) => {
      arr.sort((a, b) => a - b);
      result.set(key, arr.slice(0, perLineLimit));
    });
  } catch (e) {
    console.error("Failed to parse Siri JSON by line", e);
  }

  return result;
}

// ===== Обновление глобального состояния маршрутов и запуск рендера =====

function updateLinesFromFetch(byLineMap) {
  if (!byLineMap || byLineMap.size === 0) {
    console.warn("No arrivals parsed from Siri JSON");
    return;
  }

  arrivalsByLine = {};
  lineRotationOrder = [];

  byLineMap.forEach((minutes, line) => {
    arrivalsByLine[line] = minutes;
    lineRotationOrder.push(line);
  });

  // Например можно отсортировать по ближайшему приходу
  lineRotationOrder.sort((a, b) => {
    const aMin = arrivalsByLine[a]?.[0] ?? Infinity;
    const bMin = arrivalsByLine[b]?.[0] ?? Infinity;
    return aMin - bMin;
  });

  if (lineRotationOrder.length) {
    setLastLineLabel(lineRotationOrder[0]);
  }

  // Если индекс вылез — вернёмся к началу
  if (currentLineIndex >= lineRotationOrder.length) {
    currentLineIndex = 0;
  }

  // Перерисуем текущий маршрут
  renderCurrentLine();
}

function renderCurrentLine() {
  if (!lineRotationOrder.length) {
    screenConfig.times = [...DEFAULT_TIME_PLACEHOLDERS];
    renderBusHeader();
    return;
  }

  const line = lineRotationOrder[currentLineIndex];
  const minutes = arrivalsByLine[line] || [];

  screenConfig.bus = line;
  screenConfig.times = minutes.length ? minutes : [...DEFAULT_TIME_PLACEHOLDERS];
  renderBusHeader();
}

// ===== Fetch к Pages Function =====

async function fetchAndUpdateArrivals() {
  if (!config.workerUrl || !config.stopId) {
    console.warn("Config is incomplete; skip fetch");
    return;
  }

const url = new URL(config.workerUrl, window.location.origin);
url.searchParams.set("stopCode", config.stopId);

// сколько показать на маршрут (по-прежнему 3 по умолчанию)
const displayCount = getDisplayArrivalsCount();
const perLine = getFetchArrivalsCount();

// сколько записей запросить у MTA всего
const MIN_VISITS = 15;
const LINES_BUDGET = 5;       // считаем, что максимум 5 маршрутов
const maxVisitsToFetch = Math.min(
  Math.max(perLine * LINES_BUDGET, MIN_VISITS),
  MAX_FETCH_VISITS,
);

url.searchParams.set("maxVisits", maxVisitsToFetch);
// НЕ отправляем LineRef, MTA его ломает для некоторых остановок

  try {
    const res = await fetch(url.toString(), { cache: "no-store" });
    if (!res.ok) {
      console.error("Worker fetch failed", res.status, await res.text());
      return;
    }

    const data = await res.json();
    const byLine = extractArrivalsByLine(data);
    updateLinesFromFetch(byLine);
  } catch (err) {
    console.error("Error while fetching arrivals", err);
  }
}

// ===== Планировщик обновления с MTA =====

function scheduleRefresh() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }

  const ms = Math.max(5, config.refreshSeconds) * 1000;
  refreshTimer = setInterval(fetchAndUpdateArrivals, ms);
}

// ===== Ротация маршрутов каждые 10 секунд =====

function initLineRotation() {
  if (lineRotationTimer) {
    clearInterval(lineRotationTimer);
    lineRotationTimer = null;
  }

  lineRotationTimer = setInterval(() => {
    if (!lineRotationOrder.length) return;

    // если всего один маршрут - просто остаёмся на нём
    if (lineRotationOrder.length === 1) {
      renderCurrentLine();
      return;
    }

    currentLineIndex = (currentLineIndex + 1) % lineRotationOrder.length;
    renderCurrentLine();
  }, LINE_ROTATION_INTERVAL_MS);
}

// ===== UI настроек =====

function initSettingsUI() {
  const openBtn = document.getElementById("open-settings");
  const closeBtn = document.getElementById("close-settings");
  const overlay = document.getElementById("settings-overlay");
  const form = document.getElementById("settings-form");
  const resetBtn = document.getElementById("reset-settings");

  if (!openBtn || !closeBtn || !overlay || !form) return;

  function fillFormFromConfig() {
    form.workerUrl.value = config.workerUrl;
    form.stopId.value = config.stopId;
    form.refreshSeconds.value = config.refreshSeconds;
    form.maxArrivals.value = config.maxArrivals;
  }

  openBtn.addEventListener("click", () => {
    fillFormFromConfig();
    overlay.classList.remove("hidden");
  });

  closeBtn.addEventListener("click", () => {
    overlay.classList.add("hidden");
  });

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) {
      overlay.classList.add("hidden");
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const newCfg = {
      workerUrl: form.workerUrl.value.trim(),
      stopId: form.stopId.value.trim(),
      refreshSeconds:
        Number(form.refreshSeconds.value) || defaultConfig.refreshSeconds,
      maxArrivals:
        Number(form.maxArrivals.value) || defaultConfig.maxArrivals,
    };

    config = newCfg;
    saveConfig(config);

    // обновим экран и расписание
    screenConfig.bus = getInitialBusLabel();
    renderBusHeader();
    fetchAndUpdateArrivals();
    scheduleRefresh();

    overlay.classList.add("hidden");
  });

    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        config = { ...defaultConfig };
        saveConfig(config);
        fillFormFromConfig();
        screenConfig.bus = getInitialBusLabel();
        renderBusHeader();
      });
    }
}

// ===== Инициализация всего =====

function init() {
  renderBusHeader();
  initPizzaSlideshow();
  initClock();
  initOrderTextCycle();
  initSettingsUI();
  fetchAndUpdateArrivals();
  scheduleRefresh();
  initLineRotation(); // запускаем ротацию маршрутов каждые 10 секунд
}

document.addEventListener("DOMContentLoaded", init);
