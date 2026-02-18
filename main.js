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
};

const hoverBox = new THREE.BoxHelper(undefined, 0xf0b54a);
hoverBox.visible = false;
scene.add(hoverBox);

function setStatus(text) {
  statusEl.textContent = text;
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
  if (!lower.includes("chair")) {
    return null;
  }

  const match = lower.match(/chair[\s_-]*(?:v|variant|level|lvl)?[\s_-]*(\d+)/i);
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
  const variant = root.userData.chairVariant;
  popupTitleEl.textContent = `Диван уровня ${variant}`;
  popupTextEl.textContent = `Клик по объекту "${root.name}". Здесь можно открыть попап с оффером банковского продукта или действием "Купить".`;
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
  const root = pickChairRoot(event.clientX, event.clientY);
  setHoveredRoot(root);
});

canvas.addEventListener("pointerleave", () => {
  setHoveredRoot(null);
});

canvas.addEventListener("click", (event) => {
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
