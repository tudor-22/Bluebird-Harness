import type { UiScenePart } from "@bluebird/shared";
import {
  AmbientLight,
  BoxGeometry,
  BufferGeometry,
  Color,
  ConeGeometry,
  CylinderGeometry,
  DirectionalLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  TorusGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

import {
  DEFAULT_SIZE,
  partCenter,
  partShift,
  sceneCenter,
  sceneRadius,
  tubePlacement,
  type Vec3,
} from "../../lib/scene-model";

/**
 * Draws a 3D scene from validated shapes. Nothing here runs anything the model
 * wrote: the model only supplies numbers, colours and labels.
 */
export type SceneView = { spread: number; group: string; picked: string | null };

export type SceneHandle = {
  update(view: SceneView): void;
  dispose(): void;
};

const PALETTE = ["#12829e", "#2f6fbd", "#5fa8a0", "#7b8fc7", "#3fa7c7", "#8cb8d9"];
const FADED = 0.14;

function geometryFor(part: UiScenePart): BufferGeometry {
  const size = part.size ?? DEFAULT_SIZE[part.shape];
  switch (part.shape) {
    case "sphere":
      return new SphereGeometry(size[0] ?? 0.5, 32, 20);
    case "cylinder":
      return new CylinderGeometry(size[0] ?? 0.4, size[0] ?? 0.4, size[1] ?? 1, 32);
    case "cone":
      return new ConeGeometry(size[0] ?? 0.4, size[1] ?? 1, 32);
    case "torus":
      return new TorusGeometry(size[0] ?? 1, size[1] ?? 0.15, 16, 56);
    case "tube": {
      const radius = part.radius ?? 0.2;
      return new CylinderGeometry(radius, radius, 1, 20);
    }
    default:
      return new BoxGeometry(size[0] ?? 1, size[1] ?? size[0] ?? 1, size[2] ?? size[0] ?? 1);
  }
}

/** Throws when the device cannot draw 3D, so the caller can show a plain list instead. */
export function createScene(
  host: HTMLElement,
  parts: UiScenePart[],
  callbacks: { onPick: (label: string | null) => void },
): SceneHandle {
  const renderer = new WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  host.append(renderer.domElement);

  const scene = new Scene();
  const camera = new PerspectiveCamera(38, 1, 0.1, 800);
  const center = sceneCenter(parts);
  // Frame the assembled model; the camera backs away as the parts spread.
  const FIT = 2.8;
  const full = sceneRadius(parts, 100);
  const start = sceneRadius(parts, 0) * FIT;
  const look = new Vector3(...center);
  camera.position.set(center[0] + start * 0.5, center[1] + start * 0.32, center[2] + start * 0.8);

  scene.add(new AmbientLight(0xffffff, 1.15));
  const key = new DirectionalLight(0xffffff, 2.2);
  key.position.set(6, 11, 8);
  scene.add(key);
  const fill = new DirectionalLight(0xffffff, 0.9);
  fill.position.set(-7, -3, -6);
  scene.add(fill);

  const groups = [...new Set(parts.map((part) => part.group).filter((g): g is string => Boolean(g)))];
  const items = parts.map((part) => {
    const color = part.color ?? PALETTE[part.group ? groups.indexOf(part.group) % PALETTE.length : 0];
    const material = new MeshStandardMaterial({
      color: new Color(color),
      roughness: 0.55,
      metalness: 0.12,
      transparent: true,
      opacity: 1,
    });
    const mesh = new Mesh(geometryFor(part), material);
    const base = partCenter(part);
    if (part.shape === "tube" && part.from && part.to) {
      const placement = tubePlacement(part.from, part.to);
      mesh.scale.set(1, placement.length, 1);
      mesh.quaternion.copy(
        new Quaternion().setFromAxisAngle(new Vector3(...placement.axis), placement.angle),
      );
    } else if (part.rotation) {
      const [x, y, z] = part.rotation.map((degrees) => (degrees * Math.PI) / 180);
      mesh.rotation.set(x, y, z);
    }
    mesh.position.set(...base);
    mesh.userData.label = part.label;
    scene.add(mesh);
    return { part, mesh, material, base };
  });

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(...center);
  controls.enablePan = false;
  controls.minDistance = full * 0.6;
  controls.maxDistance = full * 7;
  controls.update();

  const render = () => renderer.render(scene, camera);
  controls.addEventListener("change", render);

  const resize = () => {
    const width = Math.max(1, host.clientWidth);
    const height = Math.max(1, host.clientHeight);
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();

  // A tap picks a part; a drag only turns the view.
  const raycaster = new Raycaster();
  const pointer = new Vector2();
  let down: { x: number; y: number } | null = null;
  const canvas = renderer.domElement;
  const onDown = (event: PointerEvent) => {
    down = { x: event.clientX, y: event.clientY };
  };
  const onUp = (event: PointerEvent) => {
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) {
      down = null;
      return;
    }
    down = null;
    const box = canvas.getBoundingClientRect();
    pointer.set(
      ((event.clientX - box.left) / box.width) * 2 - 1,
      -((event.clientY - box.top) / box.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster
      .intersectObjects(items.filter((item) => item.material.opacity > 0.5).map((item) => item.mesh))
      .at(0);
    callbacks.onPick(hit ? String(hit.object.userData.label) : null);
  };
  canvas.addEventListener("pointerdown", onDown);
  canvas.addEventListener("pointerup", onUp);

  return {
    update({ spread, group, picked }) {
      // Back away just enough to keep spread parts in view, never closer than the reader chose.
      const needed = sceneRadius(parts, spread) * FIT;
      const away = camera.position.clone().sub(look);
      if (away.length() < needed) camera.position.copy(look).add(away.setLength(needed));
      const focused = Boolean(group) || picked !== null;
      for (const item of items) {
        const shift: Vec3 = partShift(item.part, center, spread);
        item.mesh.position.set(item.base[0] + shift[0], item.base[1] + shift[1], item.base[2] + shift[2]);
        const on = !focused || item.part.group === group || item.part.label === picked;
        item.material.opacity = on ? 1 : FADED;
        item.material.depthWrite = on;
        const chosen = item.part.label === picked;
        item.material.emissive.set(chosen ? 0x1d6bf0 : 0x000000);
        item.material.emissiveIntensity = chosen ? 0.45 : 0;
      }
      render();
    },
    dispose() {
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      controls.dispose();
      for (const item of items) {
        item.mesh.geometry.dispose();
        item.material.dispose();
      }
      renderer.dispose();
      canvas.remove();
    },
  };
}
