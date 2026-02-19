import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const MODEL_URL = "./assets/cafe.glb";

const canvas = document.getElementById("webgl");
const statusEl = document.getElementById("status");
const levelsEl = document.getElementById("levels");
const popupEl = document.getElementById("popup");
const popupTitleEl = document.getElementById("popup-title");
const popupTextEl = document.getElementById("popup-text");
const popupCloseEl = document.getElementById("popup-close");
const popupStartGameEl = document.getElementById("popup-start-game");
const miniGameEl = document.getElementById("minigame");
const miniGameTitleEl = document.getElementById("minigame-title");
const miniGameLeadEl = document.getElementById("minigame-lead");
const miniGameBoardEl = document.getElementById("minigame-board");
const miniGameCardsEl = document.getElementById("minigame-cards");
const miniGameSlotsEl = document.getElementById("minigame-slots");
const miniGameTimerEl = document.getElementById("minigame-timer");
const miniGameTimerFillEl = document.getElementById("minigame-timer-fill");
const miniGameResultEl = document.getElementById("minigame-result");
const miniGameResultTitleEl = document.getElementById("minigame-result-title");
const miniGameResultTextEl = document.getElementById("minigame-result-text");
const miniGameCloseEl = document.getElementById("minigame-close");
const miniGameRetryEl = document.getElementById("minigame-retry");

const MINIGAME_DOCS = {
  inn: { label: "ИНН", note: "Налоговая карточка", color: "#f0d98d" },
  contract: { label: "Договор", note: "Основной пакет", color: "#9dd7f9" },
  stamp: { label: "Печать", note: "Подтверждение", color: "#f3b0bc" },
  sign: { label: "Подпись", note: "Финальная проверка", color: "#b8e5a0" },
};

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xa59d90);

const sizes = {
  width: window.innerWidth,
  height: window.innerHeight,
};

const camera = new THREE.PerspectiveCamera(38, sizes.width / sizes.height, 0.1, 100);
camera.position.set(5.8, 4.4, 6.6);
scene.add(camera);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
});
renderer.setSize(sizes.width, sizes.height);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.78;

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.target.set(0, 1.2, 0);
controls.minDistance = 3;
controls.maxDistance = 14;
controls.maxPolarAngle = Math.PI * 0.48;
controls.enablePan = false;

const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
scene.add(ambientLight);

const keyLight = new THREE.DirectionalLight(0xfff1cf, 0.45);
keyLight.position.set(5, 9, 4);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xa8d2ff, 0.18);
fillLight.position.set(-6, 5, -3);
scene.add(fillLight);

function addFallbackSoftLights() {
  const spotA = new THREE.SpotLight(0xfff0d2, 0.55, 20, Math.PI * 0.28, 0.45, 1.2);
  spotA.position.set(1.1, 3.1, 1.9);
  spotA.target.position.set(0.9, 0.9, 0.8);
  scene.add(spotA);
  scene.add(spotA.target);

  const spotB = new THREE.SpotLight(0xaecbff, 0.28, 18, Math.PI * 0.33, 0.5, 1.25);
  spotB.position.set(-1.6, 2.5, -0.8);
  spotB.target.position.set(0.9, 0.9, 0.8);
  scene.add(spotB);
  scene.add(spotB.target);
}

async function addSoftAreaLights() {
  try {
    const { RectAreaLightUniformsLib } = await import(
      "three/addons/lights/RectAreaLightUniformsLib.js"
    );
    RectAreaLightUniformsLib.init();

  // Main soft key light above the room (imitates large Area light from Blender).
    const areaKey = new THREE.RectAreaLight(0xfff0d2, 5.2, 3.2, 2.1);
    areaKey.position.set(1.1, 2.8, 1.9);
    areaKey.lookAt(0.9, 0.9, 0.8);
    scene.add(areaKey);

  // Secondary fill to avoid hard falloff on the opposite side.
    const areaFill = new THREE.RectAreaLight(0xaecbff, 2.6, 2.0, 1.4);
    areaFill.position.set(-1.6, 2.3, -0.8);
    areaFill.lookAt(0.9, 0.9, 0.8);
    scene.add(areaFill);
  } catch (error) {
    console.warn("RectAreaLight addon unavailable, fallback SpotLight is used.", error);
    addFallbackSoftLights();
  }
}

addSoftAreaLights();

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const state = {
  chairRootsByVariant: new Map(),
  clickableMeshes: [],
  hoveredRoot: null,
  activeVariant: 1,
  selectedSofaRoot: null,
  miniGame: {
    isOpen: false,
    selectedDocId: null,
    filledSlots: new Map(),
    config: null,
    timerStartedAt: 0,
    timerDurationMs: 0,
    timerIntervalId: null,
    activeRootName: "",
  },
};

const hoverBox = new THREE.BoxHelper(undefined, 0xf0b54a);
hoverBox.visible = false;
scene.add(hoverBox);

function setStatus(text) {
  statusEl.textContent = text;
}

function formatSeconds(totalMs) {
  const totalSec = Math.max(0, Math.ceil(totalMs / 1000));
  const mm = Math.floor(totalSec / 60)
    .toString()
    .padStart(2, "0");
  const ss = (totalSec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function shuffleArray(input) {
  const array = [...input];
  for (let i = array.length - 1; i > 0; i -= 1) {
    const randomIndex = Math.floor(Math.random() * (i + 1));
    [array[i], array[randomIndex]] = [array[randomIndex], array[i]];
  }
  return array;
}

function getMiniGameConfig() {
  if (state.activeVariant === 2) {
    return {
      title: "Регистрация бизнеса: Упрощенный процесс",
      lead: "С банковым продуктом часть проверки автоматизирована. Разложите 3 документа до таймера.",
      timeLimitSec: 18,
      slots: [
        { id: "slot-1", label: "Проверка клиента", docId: "inn" },
        { id: "slot-2", label: "Договор в архив", docId: "contract" },
        { id: "slot-3", label: "Подтверждение", docId: "stamp" },
      ],
    };
  }

  return {
    title: "Регистрация бизнеса: Ручной режим",
    lead: "Перетащите документы в правильные зоны стола бухгалтера до окончания времени.",
    timeLimitSec: 24,
    slots: [
      { id: "slot-1", label: "Проверка клиента", docId: "inn" },
      { id: "slot-2", label: "Договор в архив", docId: "contract" },
      { id: "slot-3", label: "Подтверждение", docId: "stamp" },
      { id: "slot-4", label: "Подпись руководителя", docId: "sign" },
    ],
  };
}

function setMiniGameDocSelection(docId) {
  state.miniGame.selectedDocId = docId;
  miniGameCardsEl.querySelectorAll(".doc-card").forEach((card) => {
    const selected = card.dataset.docId === docId;
    card.classList.toggle("is-selected", selected);
  });
}

function createDocCard(docId) {
  const doc = MINIGAME_DOCS[docId];
  const card = document.createElement("article");
  card.className = "doc-card";
  card.draggable = true;
  card.dataset.docId = docId;
  card.style.background = `linear-gradient(145deg, ${doc.color}, #f7efe0)`;
  card.innerHTML = `<span class="doc-title">${doc.label}</span><span class="doc-note">${doc.note}</span>`;

  card.addEventListener("dragstart", (event) => {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", docId);
    card.classList.add("dragging");
  });
  card.addEventListener("dragend", () => {
    card.classList.remove("dragging");
  });
  card.addEventListener("click", () => {
    if (card.classList.contains("is-placed")) {
      return;
    }
    setMiniGameDocSelection(docId);
  });

  return card;
}

function markSlotWrong(slotEl) {
  slotEl.classList.add("is-wrong");
  window.setTimeout(() => {
    slotEl.classList.remove("is-wrong");
  }, 240);
}

function tryPlaceDoc(slotEl, docId) {
  if (!slotEl || !docId || slotEl.dataset.locked === "true") {
    return;
  }

  const expectedDocId = slotEl.dataset.accept;
  if (docId !== expectedDocId) {
    markSlotWrong(slotEl);
    return;
  }

  const card = miniGameCardsEl.querySelector(`.doc-card[data-doc-id="${docId}"]`);
  if (!card || card.classList.contains("is-placed")) {
    return;
  }

  card.classList.add("is-placed");
  card.classList.remove("is-selected");
  card.draggable = false;
  slotEl.dataset.locked = "true";
  slotEl.classList.add("is-correct");
  slotEl.append(card);

  state.miniGame.filledSlots.set(slotEl.dataset.slotId, docId);
  state.miniGame.selectedDocId = null;

  if (state.miniGame.filledSlots.size === state.miniGame.config.slots.length) {
    finishMiniGame(true);
  }
}

function createDocSlot(slotConfig) {
  const slotEl = document.createElement("article");
  slotEl.className = "doc-slot";
  slotEl.dataset.slotId = slotConfig.id;
  slotEl.dataset.accept = slotConfig.docId;
  slotEl.innerHTML = `<div class="slot-title">${slotConfig.label}</div>`;

  slotEl.addEventListener("dragover", (event) => {
    event.preventDefault();
    if (slotEl.dataset.locked !== "true") {
      slotEl.classList.add("is-hovered");
    }
  });
  slotEl.addEventListener("dragleave", () => {
    slotEl.classList.remove("is-hovered");
  });
  slotEl.addEventListener("drop", (event) => {
    event.preventDefault();
    slotEl.classList.remove("is-hovered");
    const docId = event.dataTransfer.getData("text/plain");
    tryPlaceDoc(slotEl, docId);
  });
  slotEl.addEventListener("click", () => {
    if (!state.miniGame.selectedDocId) {
      return;
    }
    tryPlaceDoc(slotEl, state.miniGame.selectedDocId);
  });

  return slotEl;
}

function updateMiniGameTimer() {
  const elapsed = Date.now() - state.miniGame.timerStartedAt;
  const remainingMs = Math.max(0, state.miniGame.timerDurationMs - elapsed);
  const progress = Math.max(0, remainingMs / state.miniGame.timerDurationMs);
  miniGameTimerEl.textContent = formatSeconds(remainingMs);
  miniGameTimerFillEl.style.width = `${progress * 100}%`;

  if (remainingMs === 0) {
    finishMiniGame(false);
  }
}

function startMiniGameTimer() {
  if (state.miniGame.timerIntervalId) {
    window.clearInterval(state.miniGame.timerIntervalId);
  }

  state.miniGame.timerStartedAt = Date.now();
  state.miniGame.timerDurationMs = state.miniGame.config.timeLimitSec * 1000;
  updateMiniGameTimer();
  state.miniGame.timerIntervalId = window.setInterval(updateMiniGameTimer, 120);
}

function renderMiniGameBoard() {
  const config = state.miniGame.config;
  const randomizedDocIds = shuffleArray(config.slots.map((slot) => slot.docId));

  miniGameCardsEl.innerHTML = "";
  miniGameSlotsEl.innerHTML = "";
  randomizedDocIds.forEach((docId) => {
    miniGameCardsEl.append(createDocCard(docId));
  });
  config.slots.forEach((slotConfig) => {
    miniGameSlotsEl.append(createDocSlot(slotConfig));
  });
}

function finishMiniGame(success) {
  if (state.miniGame.timerIntervalId) {
    window.clearInterval(state.miniGame.timerIntervalId);
    state.miniGame.timerIntervalId = null;
  }
  miniGameBoardEl.classList.remove("is-playing");

  const config = state.miniGame.config;
  miniGameResultEl.classList.remove("hidden");
  if (success) {
    miniGameResultTitleEl.textContent = "Готово: документы приняты";
    miniGameResultTextEl.textContent =
      "Отлично. Операция завершена быстрее, репутация бизнеса выросла.";
    setStatus(`Мини-игра завершена успешно (${config.slots.length}/${config.slots.length}).`);
  } else {
    miniGameResultTitleEl.textContent = "Время вышло";
    miniGameResultTextEl.textContent =
      "Клиент устал ждать. Повтори раунд, чтобы не терять репутацию бизнеса.";
    setStatus("Мини-игра не пройдена: время вышло.");
  }

  miniGameSlotsEl.querySelectorAll(".doc-slot").forEach((slot) => {
    slot.dataset.locked = "true";
  });
  miniGameCardsEl.querySelectorAll(".doc-card").forEach((card) => {
    card.draggable = false;
  });
}

function openMiniGame(root) {
  if (!root) {
    return;
  }
  state.miniGame.isOpen = true;
  state.miniGame.selectedDocId = null;
  state.miniGame.filledSlots.clear();
  state.miniGame.config = getMiniGameConfig();
  state.miniGame.activeRootName = root?.name || "Sofa";

  miniGameTitleEl.textContent = state.miniGame.config.title;
  miniGameLeadEl.textContent = `${state.miniGame.config.lead} Объект: ${state.miniGame.activeRootName}.`;
  miniGameResultEl.classList.add("hidden");
  miniGameEl.classList.remove("hidden");
  miniGameBoardEl.classList.add("is-playing");
  hidePopup();

  controls.enabled = false;
  setHoveredRoot(null);

  renderMiniGameBoard();
  startMiniGameTimer();
}

function closeMiniGame() {
  if (state.miniGame.timerIntervalId) {
    window.clearInterval(state.miniGame.timerIntervalId);
    state.miniGame.timerIntervalId = null;
  }
  state.miniGame.isOpen = false;
  state.miniGame.selectedDocId = null;
  state.miniGame.filledSlots.clear();
  miniGameEl.classList.add("hidden");
  miniGameBoardEl.classList.remove("is-playing");
  controls.enabled = true;
  setActiveVariant(state.activeVariant);
}

function restartMiniGame() {
  if (!state.miniGame.isOpen) {
    return;
  }
  state.miniGame.selectedDocId = null;
  state.miniGame.filledSlots.clear();
  miniGameResultEl.classList.add("hidden");
  miniGameBoardEl.classList.add("is-playing");
  renderMiniGameBoard();
  startMiniGameTimer();
}

function centerOrbitOnObject(root) {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) {
    return;
  }

  const center = new THREE.Vector3();
  const size = new THREE.Vector3();
  box.getCenter(center);
  box.getSize(size);

  controls.target.copy(center);

  // Keep zoom limits proportional to model size so orbit remains comfortable.
  const radius = Math.max(size.length() * 0.45, 1);
  controls.minDistance = Math.max(1.5, radius * 0.35);
  controls.maxDistance = Math.max(8, radius * 4.2);
  controls.update();
}

function parseChairVariant(name) {
  const lower = String(name || "").toLowerCase();
  if (!lower.includes("chair") && !lower.includes("sofa")) {
    return null;
  }

  const match = lower.match(/(?:chair|sofa)[\s_-]*(?:v|variant|level|lvl)?[\s_-]*(\d+)/i);
  if (!match) {
    return null;
  }

  return Number(match[1]);
}

function hasChairRootAncestor(object) {
  let node = object.parent;
  while (node) {
    if (node.userData?.isChairRoot) {
      return true;
    }
    node = node.parent;
  }
  return false;
}

function registerChairRoot(root, variant, meshSet) {
  root.userData.isChairRoot = true;
  root.userData.chairVariant = variant;

  if (!state.chairRootsByVariant.has(variant)) {
    state.chairRootsByVariant.set(variant, []);
  }
  state.chairRootsByVariant.get(variant).push(root);

  root.traverse((node) => {
    node.userData.chairVariant = variant;
    if (node.isMesh) {
      meshSet.add(node);
    }
  });
}

function collectChairVariants(root) {
  state.chairRootsByVariant.clear();
  const meshSet = new Set();

  root.traverse((node) => {
    const variant = parseChairVariant(node.name);
    if (!variant) {
      return;
    }
    if (hasChairRootAncestor(node)) {
      return;
    }
    registerChairRoot(node, variant, meshSet);
  });

  state.clickableMeshes = Array.from(meshSet);
}

function setActiveVariant(variant) {
  const available = Array.from(state.chairRootsByVariant.keys()).sort((a, b) => a - b);
  if (available.length === 0) {
    return;
  }

  const targetVariant = available.includes(variant) ? variant : available[0];
  state.activeVariant = targetVariant;

  for (const [currentVariant, roots] of state.chairRootsByVariant.entries()) {
    const visible = currentVariant === targetVariant;
    roots.forEach((root) => {
      root.visible = visible;
    });
  }

  document.querySelectorAll(".level-btn").forEach((button) => {
    const level = Number(button.dataset.level);
    button.classList.toggle("is-active", level === targetVariant);
  });

  setStatus(
    `Активен вариант дивана ${targetVariant}. Найдено вариантов: ${available.join(", ")}.`
  );
}

function getChairRoot(object) {
  let node = object;
  while (node) {
    if (node.userData?.isChairRoot) {
      return node;
    }
    node = node.parent;
  }
  return null;
}

function pickChairRoot(clientX, clientY) {
  const rect = canvas.getBoundingClientRect();
  pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const intersects = raycaster.intersectObjects(state.clickableMeshes, false);
  if (intersects.length === 0) {
    return null;
  }

  for (const hit of intersects) {
    const root = getChairRoot(hit.object);
    if (root && root.visible) {
      return root;
    }
  }

  return null;
}

function showPopup(root) {
  state.selectedSofaRoot = root;
  const variant = root.userData.chairVariant;
  popupTitleEl.textContent = `Диван уровня ${variant}`;
  popupTextEl.textContent = `Объект "${root.name}" выбран. Нажмите "Запустить мини-игру", чтобы показать игровой сценарий с таймером и результатом.`;
  popupEl.classList.remove("hidden");
}

function hidePopup() {
  popupEl.classList.add("hidden");
}

function setHoveredRoot(root) {
  if (state.hoveredRoot === root) {
    return;
  }

  state.hoveredRoot = root;
  if (!root) {
    hoverBox.visible = false;
    canvas.style.cursor = "grab";
    return;
  }

  hoverBox.setFromObject(root);
  hoverBox.visible = true;
  canvas.style.cursor = "pointer";
}

function createSofaVariant(name, color, backHeight, cushionRadius) {
  const group = new THREE.Group();
  group.name = name;

  const frameMaterial = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.6,
    metalness: 0.08,
  });
  const seatMaterial = new THREE.MeshStandardMaterial({
    color: 0x2f2f33,
    roughness: 0.75,
    metalness: 0.02,
  });

  const seat = new THREE.Mesh(
    new THREE.CylinderGeometry(cushionRadius, cushionRadius + 0.03, 0.14, 24),
    seatMaterial
  );
  seat.position.y = 1.02;
  group.add(seat);

  const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.02, 10), frameMaterial);
  leg.position.y = 0.5;
  group.add(leg);

  const back = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, backHeight, 12), frameMaterial);
  back.position.set(0, 1.02 + backHeight * 0.5, -cushionRadius * 0.85);
  group.add(back);

  const backTop = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.018, cushionRadius * 1.25, 12),
    frameMaterial
  );
  backTop.rotation.x = Math.PI * 0.5;
  backTop.position.set(0, 1.02 + backHeight, -cushionRadius * 0.86);
  group.add(backTop);

  return group;
}

function addFallbackRoom() {
  const fallback = new THREE.Group();
  fallback.name = "FallbackRoom";

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(7, 0.18, 7),
    new THREE.MeshStandardMaterial({ color: 0x9a8975, roughness: 0.95 })
  );
  floor.position.y = -0.09;
  fallback.add(floor);

  const wallMaterial = new THREE.MeshStandardMaterial({ color: 0x535353, roughness: 0.9 });
  const wallA = new THREE.Mesh(new THREE.BoxGeometry(7, 4.2, 0.2), wallMaterial);
  wallA.position.set(0, 2, -3.4);
  fallback.add(wallA);

  const wallB = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4.2, 7), wallMaterial);
  wallB.position.set(-3.4, 2, 0);
  fallback.add(wallB);

  const bar = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.2, 1.1),
    new THREE.MeshStandardMaterial({ color: 0x33354f, roughness: 0.6 })
  );
  bar.position.set(1.25, 0.6, 1.2);
  fallback.add(bar);

  const sofa1 = createSofaVariant("Chair_1", 0x7d2f2f, 0.45, 0.3);
  const sofa2 = createSofaVariant("Chair_2", 0x2f5f87, 0.65, 0.34);
  [sofa1, sofa2].forEach((sofa) => {
    sofa.position.set(0.9, 0, 0.85);
    fallback.add(sofa);
  });

  scene.add(fallback);
  return fallback;
}

async function loadMainModel() {
  const loader = new GLTFLoader();
  setStatus(`Пробую загрузить ${MODEL_URL}...`);

  try {
    const gltf = await loader.loadAsync(MODEL_URL);
    scene.add(gltf.scene);
    return gltf.scene;
  } catch (error) {
    console.warn("Model load failed. Fallback scene will be used.", error);
    return null;
  }
}

async function initScene() {
  let root = await loadMainModel();

  if (!root) {
    root = addFallbackRoom();
    setStatus("Файл assets/cafe.glb не найден. Показана fallback-сцена для демо.");
  }

  centerOrbitOnObject(root);

  collectChairVariants(root);

  if (state.chairRootsByVariant.size === 0) {
    const fallback = new THREE.Group();
    fallback.name = "FallbackSofas";
    const sofa1 = createSofaVariant("Chair_1", 0x7d2f2f, 0.45, 0.3);
    const sofa2 = createSofaVariant("Chair_2", 0x2f5f87, 0.65, 0.34);
    [sofa1, sofa2].forEach((sofa) => {
      sofa.position.set(0, 0, 0);
      fallback.add(sofa);
    });
    scene.add(fallback);
    collectChairVariants(fallback);
    setStatus(
      "В загруженной модели не найдены объекты Chair_1/2. Добавлены demo-диваны в центре сцены."
    );
  }

  setActiveVariant(1);
}

levelsEl.addEventListener("click", (event) => {
  const button = event.target.closest(".level-btn");
  if (!button) {
    return;
  }
  const level = Number(button.dataset.level);
  setActiveVariant(level);
  hidePopup();
});

canvas.addEventListener("pointermove", (event) => {
  if (state.miniGame.isOpen) {
    return;
  }
  const root = pickChairRoot(event.clientX, event.clientY);
  setHoveredRoot(root);
});

canvas.addEventListener("pointerleave", () => {
  setHoveredRoot(null);
});

canvas.addEventListener("click", (event) => {
  if (state.miniGame.isOpen) {
    return;
  }
  const root = pickChairRoot(event.clientX, event.clientY);
  if (!root) {
    hidePopup();
    return;
  }
  showPopup(root);
});

popupCloseEl.addEventListener("click", () => {
  hidePopup();
});

popupStartGameEl.addEventListener("click", () => {
  openMiniGame(state.selectedSofaRoot);
});

miniGameCloseEl.addEventListener("click", () => {
  closeMiniGame();
});

miniGameRetryEl.addEventListener("click", () => {
  restartMiniGame();
});

miniGameEl.addEventListener("click", (event) => {
  if (event.target.classList.contains("minigame-backdrop")) {
    closeMiniGame();
  }
});

window.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.miniGame.isOpen) {
    closeMiniGame();
  }
});

window.addEventListener("resize", () => {
  sizes.width = window.innerWidth;
  sizes.height = window.innerHeight;

  camera.aspect = sizes.width / sizes.height;
  camera.updateProjectionMatrix();

  renderer.setSize(sizes.width, sizes.height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
});

renderer.setAnimationLoop(() => {
  controls.update();
  renderer.render(scene, camera);
});

initScene();
