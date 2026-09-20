import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { ArrowUpRight, Network } from "lucide-react";
import type { BackendGraphEdge, BackendGraphNode } from "../types/api";
import "../styles/backend-graph.css";

type BackendGraphProps = {
  nodes: BackendGraphNode[];
  edges: BackendGraphEdge[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  focusId?: string | null;
  resetKey?: number;
};

type Category = "person" | "community" | "concept" | "context";
type ValidEdge = { source: number; target: number; edge: BackendGraphEdge };
type GraphLayout = {
  positions: THREE.Vector3[];
  byId: Map<string, number>;
  neighbors: Set<number>[];
  edges: ValidEdge[];
  radius: number;
};

const COLORS: Record<Category, string> = {
  person: "#91a8ff",
  community: "#f49a72",
  concept: "#b9c5dc",
  context: "#77c9ba",
};
const RADII: Record<Category, number> = {
  person: 0.09,
  community: 0.155,
  concept: 0.032,
  context: 0.06,
};
const EMPTY_ACTOR_LIST: BackendGraphNode[] = [];

function category(node: BackendGraphNode): Category {
  return node.kind === "person" ||
    node.kind === "concept" ||
    node.kind === "context"
    ? node.kind
    : "community";
}

function kindLabel(node: BackendGraphNode) {
  if (node.kind === "context")
    return node.subtype
      ? `${node.subtype.replace(/_/g, " ")} · activity`
      : "Activity";
  return (
    {
      person: "Person",
      club: "Club",
      lab: "Research lab",
      department: "Department",
      company: "Company",
      concept: "Interest",
    } as const
  )[node.kind];
}

function hash(value: string) {
  let result = 2166136261;
  for (let index = 0; index < value.length; index += 1)
    result = Math.imul(result ^ value.charCodeAt(index), 16777619);
  return result >>> 0;
}

function randomFor(id: string) {
  let seed = hash(id);
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

function offset(id: string, radius: number) {
  const random = randomFor(id);
  const y = random() * 2 - 1;
  const angle = random() * Math.PI * 2;
  const magnitude = (0.35 + Math.cbrt(random()) * 0.65) * radius;
  const ring = Math.sqrt(1 - y * y);
  return new THREE.Vector3(
    Math.cos(angle) * ring,
    y * 0.8,
    Math.sin(angle) * ring,
  ).multiplyScalar(magnitude);
}

/** Area anchors preserve geography; every other placement follows real edges. */
function makeLayout(
  nodes: BackendGraphNode[],
  edges: BackendGraphEdge[],
): GraphLayout {
  const byId = new Map(nodes.map((node, index) => [node.id, index]));
  const neighbors = nodes.map(() => new Set<number>());
  const validEdges = edges.flatMap((edge) => {
    const source = byId.get(edge.source),
      target = byId.get(edge.target);
    if (source === undefined || target === undefined) return [];
    neighbors[source].add(target);
    neighbors[target].add(source);
    return [{ source, target, edge }];
  });
  const actorNodes = nodes.filter(
    (node) => category(node) === "person" || category(node) === "community",
  );
  const areas = [
    ...new Set(
      actorNodes.flatMap((node) =>
        node.areaId
          ? [node.areaId]
          : node.kind === "department"
            ? [node.id]
            : [],
      ),
    ),
  ].sort();
  const columns = Math.max(2, Math.ceil(Math.sqrt(Math.max(areas.length, 1))));
  const rows = Math.max(1, Math.ceil(areas.length / columns));
  const anchors = new Map(
    areas.map((id, index) => [
      id,
      new THREE.Vector3(
        ((index % columns) - (columns - 1) / 2) * 4.1 +
          Math.sin(index * 1.8) * 0.45,
        ((rows - 1) / 2 - Math.floor(index / columns)) * 3.5 +
          Math.cos(index * 1.2) * 0.4,
        Math.sin(index * 2.35) * 2.5,
      ),
    ]),
  );
  const positions = nodes.map((node) => {
    const anchor = anchors.get(
      node.areaId ?? (node.kind === "department" ? node.id : ""),
    );
    if (category(node) === "concept" || category(node) === "context")
      return new THREE.Vector3();
    if (node.kind === "department" && anchor) return anchor.clone();
    return (anchor?.clone() ?? new THREE.Vector3(0, -rows * 1.9, 0.5)).add(
      offset(node.id, anchor ? 1.75 : 2.3),
    );
  });

  // Concepts and activities sit near their linked actors; multi-area interests
  // naturally bridge areas. The seeded offset separates identical neighborhoods.
  nodes.forEach((node, index) => {
    if (node.kind !== "concept" && node.kind !== "context") return;
    const linkedActors = [...neighbors[index]].filter(
      (neighbor) =>
        nodes[neighbor].kind !== "concept" &&
        nodes[neighbor].kind !== "context",
    );
    const center = new THREE.Vector3();
    linkedActors.forEach((neighbor) => center.add(positions[neighbor]));
    if (linkedActors.length) center.divideScalar(linkedActors.length);
    else center.copy(offset(`${node.id}-unattached`, 4.8));
    const spread =
      node.kind === "concept"
        ? 1.2 + Math.min(1.1, linkedActors.length / 20)
        : 1.45;
    positions[index].copy(center).add(offset(node.id, spread));
  });

  // Give context-to-context and concept-to-concept relations a modest influence
  // without pulling the whole network into one indistinguishable ball.
  const originals = positions.map((position) => position.clone());
  nodes.forEach((node, index) => {
    if (node.kind !== "concept" && node.kind !== "context") return;
    const linked = [...neighbors[index]].filter(
      (neighbor) => nodes[neighbor].kind === node.kind,
    );
    if (!linked.length) return;
    const center = linked
      .reduce(
        (sum, neighbor) => sum.add(originals[neighbor]),
        new THREE.Vector3(),
      )
      .divideScalar(linked.length);
    positions[index].lerp(center, 0.14);
  });
  const bounds = new THREE.Box3().setFromPoints(positions);
  const center = bounds.isEmpty()
    ? new THREE.Vector3()
    : bounds.getCenter(new THREE.Vector3());
  positions.forEach((position) => position.sub(center));
  const radius = Math.max(
    2.2,
    ...positions.map((position) => position.length()),
  );
  return { positions, byId, neighbors, edges: validEdges, radius };
}

function GraphFallback({
  nodes,
  selectedId,
  onSelect,
}: Pick<BackendGraphProps, "nodes" | "selectedId" | "onSelect">) {
  const [limit, setLimit] = useState(48);
  return (
    <div className="backend-graph-fallback">
      <div className="backend-graph-fallback-heading">
        <Network size={25} strokeWidth={1.3} />
        <div>
          <h3>Explore the network in a list.</h3>
          <p>
            3D is unavailable in this browser. Every node is still selectable.
          </p>
        </div>
      </div>
      <div className="backend-graph-fallback-list">
        {nodes.slice(0, limit).map((node) => (
          <button
            type="button"
            key={node.id}
            aria-pressed={selectedId === node.id}
            onClick={() => onSelect(node.id)}
          >
            <i style={{ background: COLORS[category(node)] }} />
            <span>
              <strong>{node.label}</strong>
              <small>{kindLabel(node)}</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
        ))}
      </div>
      {limit < nodes.length && (
        <button
          type="button"
          className="backend-graph-fallback-more"
          onClick={() => setLimit((value) => value + 48)}
        >
          Show more nodes ({Math.min(limit, nodes.length)} of {nodes.length})
        </button>
      )}
    </div>
  );
}

export function BackendGraph(props: BackendGraphProps) {
  const { nodes, edges, selectedId, onSelect, focusId, resetKey } = props;
  const rootRef = useRef<HTMLDivElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const selectedLabelRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef(props);
  latestRef.current = props;
  const actionsRef = useRef({
    refresh: () => {},
    focus: (_id: string | null) => {},
    reset: () => {},
  });
  const [status, setStatus] = useState<"loading" | "ready" | "fallback">(
    "loading",
  );
  const layout = useMemo(() => makeLayout(nodes, edges), [nodes, edges]);

  useEffect(() => {
    const root = rootRef.current,
      mount = mountRef.current;
    if (!root || !mount || !nodes.length) return;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      setStatus("fallback");
      return;
    }

    let disposed = false,
      visible = true,
      contextLost = false;
    let frame = 0,
      hoverFrame = 0,
      width = 1,
      height = 1,
      fitDistance = 24;
    let hoveredIndex: number | null = null;
    let paintedSelection: string | null | undefined;
    let pointerOrigin: { x: number; y: number } | null = null;
    let pointerPosition: { x: number; y: number } | null = null;
    let interacting = false;
    let tween: {
      camera: THREE.Vector3;
      target: THREE.Vector3;
      destination: THREE.Vector3;
      center: THREE.Vector3;
      started: number;
    } | null = null;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.05, 400);
    renderer.setClearColor(0x152139, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !reducedMotion.matches;
    controls.dampingFactor = 0.1;
    controls.rotateSpeed = 0.48;
    controls.zoomSpeed = 0.85;
    controls.panSpeed = 0.6;
    controls.minDistance = 2.2;
    controls.maxDistance = 100;
    controls.enableZoom = true;
    controls.enablePan = true;
    scene.add(new THREE.AmbientLight(0xdfe8ff, 1.9));
    const keyLight = new THREE.DirectionalLight(0xe1eaff, 2.8);
    keyLight.position.set(-6, 10, 12);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x648bff, 1.2);
    rimLight.position.set(9, -4, -5);
    scene.add(rimLight);

    const resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] =
      [];
    const nodeGeometry = new THREE.SphereGeometry(1, 10, 8);
    const smallGeometry = new THREE.IcosahedronGeometry(1, 0);
    const communityGeometry = new THREE.IcosahedronGeometry(1, 1);
    resources.push(nodeGeometry, smallGeometry, communityGeometry);
    const matrix = new THREE.Matrix4(),
      quaternion = new THREE.Quaternion(),
      scale = new THREE.Vector3();
    const nodeColors = nodes.map(
      (node) => new THREE.Color(COLORS[category(node)]),
    );
    const background = new THREE.Color("#152139");
    const groups = (
      ["person", "community", "concept", "context"] as const
    ).flatMap((kind) => {
      const indices = nodes.flatMap((node, index) =>
        category(node) === kind ? [index] : [],
      );
      if (!indices.length) return [];
      const material =
        kind === "person" || kind === "community"
          ? new THREE.MeshStandardMaterial({
              color: "#ffffff",
              roughness: 0.45,
              metalness: 0.08,
              emissive: "#243864",
              emissiveIntensity: 0.18,
            })
          : new THREE.MeshBasicMaterial({
              color: "#ffffff",
              transparent: true,
              opacity: kind === "concept" ? 0.85 : 0.95,
            });
      const mesh = new THREE.InstancedMesh(
        kind === "community"
          ? communityGeometry
          : kind === "person"
            ? nodeGeometry
            : smallGeometry,
        material,
        indices.length,
      );
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      indices.forEach((index, instance) => {
        scale.setScalar(RADII[kind]);
        matrix.compose(layout.positions[index], quaternion, scale);
        mesh.setMatrixAt(instance, matrix);
        mesh.setColorAt(instance, nodeColors[index]);
      });
      mesh.computeBoundingSphere();
      scene.add(mesh);
      resources.push(material);
      return [{ kind, indices, mesh }];
    });

    const edgePositions = new Float32Array(layout.edges.length * 6);
    const edgeColors = new Float32Array(layout.edges.length * 6);
    layout.edges.forEach((edge, index) => {
      edgePositions.set(layout.positions[edge.source].toArray(), index * 6);
      edgePositions.set(layout.positions[edge.target].toArray(), index * 6 + 3);
      const color = new THREE.Color(COLORS[category(nodes[edge.target])]).lerp(
        new THREE.Color("#6a80b3"),
        0.65,
      );
      edgeColors.set(color.toArray(), index * 6);
      edgeColors.set(color.toArray(), index * 6 + 3);
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(edgePositions, 3),
    );
    edgeGeometry.setAttribute(
      "color",
      new THREE.BufferAttribute(edgeColors, 3),
    );
    const edgeMaterial = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.055,
      depthWrite: false,
    });
    const edgeMesh = new THREE.LineSegments(edgeGeometry, edgeMaterial);
    scene.add(edgeMesh);
    resources.push(edgeGeometry, edgeMaterial);
    const highlightPositions = new Float32Array(layout.edges.length * 6);
    const highlightGeometry = new THREE.BufferGeometry();
    const highlightAttribute = new THREE.BufferAttribute(
      highlightPositions,
      3,
    ).setUsage(THREE.DynamicDrawUsage);
    highlightGeometry.setAttribute("position", highlightAttribute);
    highlightGeometry.setDrawRange(0, 0);
    const highlightMaterial = new THREE.LineBasicMaterial({
      color: "#b8caff",
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
    });
    const highlightMesh = new THREE.LineSegments(
      highlightGeometry,
      highlightMaterial,
    );
    highlightMesh.frustumCulled = false;
    scene.add(highlightMesh);
    resources.push(highlightGeometry, highlightMaterial);

    const glowCanvas = document.createElement("canvas");
    glowCanvas.width = glowCanvas.height = 96;
    const context = glowCanvas.getContext("2d");
    if (context) {
      const gradient = context.createRadialGradient(48, 48, 0, 48, 48, 48);
      gradient.addColorStop(0, "rgba(255,255,255,0.9)");
      gradient.addColorStop(0.18, "rgba(255,255,255,0.3)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      context.fillStyle = gradient;
      context.fillRect(0, 0, 96, 96);
    }
    const glowTexture = new THREE.CanvasTexture(glowCanvas);
    const selectedGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: "#91a8ff",
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const hoverGlowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: "#dfe8ff",
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const selectedGlow = new THREE.Sprite(selectedGlowMaterial),
      hoverGlow = new THREE.Sprite(hoverGlowMaterial);
    selectedGlow.scale.setScalar(1.3);
    hoverGlow.scale.setScalar(0.68);
    selectedGlow.visible = hoverGlow.visible = false;
    scene.add(selectedGlow, hoverGlow);
    resources.push(glowTexture, selectedGlowMaterial, hoverGlowMaterial);
    const screenPositions = new Float32Array(nodes.length * 3);
    const projected = new THREE.Vector3();

    function requestRender() {
      if (!disposed && visible && !contextLost && !document.hidden && !frame)
        frame = requestAnimationFrame(tick);
    }

    function paintSelection() {
      const id = latestRef.current.selectedId;
      if (id === paintedSelection) return;
      paintedSelection = id;
      const selectedIndex = id === null ? undefined : layout.byId.get(id);
      const neighborhood =
        selectedIndex === undefined
          ? null
          : new Set([selectedIndex, ...layout.neighbors[selectedIndex]]);
      groups.forEach(({ kind, indices, mesh }) => {
        indices.forEach((index, instance) => {
          const selected = index === selectedIndex;
          const connected = neighborhood?.has(index);
          const color = nodeColors[index].clone();
          if (neighborhood && !connected) color.lerp(background, 0.8);
          else if (selected) color.lerp(new THREE.Color("#ffffff"), 0.7);
          mesh.setColorAt(instance, color);
          scale.setScalar(
            RADII[kind] * (selected ? 1.9 : connected ? 1.18 : 1),
          );
          matrix.compose(layout.positions[index], quaternion, scale);
          mesh.setMatrixAt(instance, matrix);
        });
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.instanceMatrix.needsUpdate = true;
      });
      edgeMaterial.opacity = neighborhood ? 0.013 : 0.055;
      let count = 0;
      if (selectedIndex !== undefined) {
        layout.edges.forEach((edge) => {
          if (edge.source !== selectedIndex && edge.target !== selectedIndex)
            return;
          highlightPositions.set(
            layout.positions[edge.source].toArray(),
            count * 6,
          );
          highlightPositions.set(
            layout.positions[edge.target].toArray(),
            count * 6 + 3,
          );
          count += 1;
        });
        selectedGlow.position.copy(layout.positions[selectedIndex]);
        selectedGlowMaterial.color.copy(nodeColors[selectedIndex]);
        highlightMaterial.color
          .copy(nodeColors[selectedIndex])
          .lerp(new THREE.Color("#d5e0ff"), 0.35);
      }
      highlightAttribute.needsUpdate = true;
      highlightGeometry.setDrawRange(0, count * 2);
      selectedGlow.visible = selectedIndex !== undefined;
    }

    function placeLabel(
      label: HTMLDivElement | null,
      index: number | null,
      hovered: boolean,
    ) {
      if (!label) return;
      if (index === null || index === undefined) {
        label.hidden = true;
        return;
      }
      const x = screenPositions[index * 3],
        y = screenPositions[index * 3 + 1],
        depth = screenPositions[index * 3 + 2];
      if (
        depth < -1 ||
        depth > 1 ||
        x < 0 ||
        x > width ||
        y < 0 ||
        y > height
      ) {
        label.hidden = true;
        return;
      }
      label.hidden = false;
      const node = nodes[index];
      const name = label.querySelector<HTMLElement>("[data-node-name]");
      const kind = label.querySelector<HTMLElement>("[data-node-kind]");
      if (name) name.textContent = node.label;
      if (kind)
        kind.textContent = `${kindLabel(node)}${hovered ? " · Click to inspect" : " · Selected"}`;
      label.style.setProperty("--node-color", COLORS[category(node)]);
      const labelWidth = label.offsetWidth,
        labelHeight = label.offsetHeight;
      label.style.left = `${Math.max(9, Math.min(width - labelWidth - 9, x + 14))}px`;
      label.style.top = `${Math.max(9, Math.min(height - labelHeight - 32, y - labelHeight / 2))}px`;
    }

    function render() {
      paintSelection();
      camera.updateMatrixWorld();
      layout.positions.forEach((position, index) => {
        projected.copy(position).project(camera);
        screenPositions[index * 3] = (projected.x * 0.5 + 0.5) * width;
        screenPositions[index * 3 + 1] = (-projected.y * 0.5 + 0.5) * height;
        screenPositions[index * 3 + 2] = projected.z;
      });
      const selectedIndex = latestRef.current.selectedId
        ? (layout.byId.get(latestRef.current.selectedId) ?? null)
        : null;
      placeLabel(
        tooltipRef.current,
        hoveredIndex === selectedIndex ? null : hoveredIndex,
        true,
      );
      placeLabel(selectedLabelRef.current, selectedIndex, false);
      renderer.render(scene, camera);
    }

    function tick(time: number) {
      frame = 0;
      if (disposed || !visible || contextLost || document.hidden) return;
      if (tween) {
        const progress = reducedMotion.matches
          ? 1
          : Math.min(1, (time - tween.started) / 640);
        const ease = 1 - (1 - progress) ** 3;
        camera.position.lerpVectors(tween.camera, tween.destination, ease);
        controls.target.lerpVectors(tween.target, tween.center, ease);
        if (progress === 1) tween = null;
      }
      const moving = controls.update();
      render();
      if (moving || tween) requestRender();
    }

    function moveCamera(center: THREE.Vector3, destination: THREE.Vector3) {
      if (reducedMotion.matches) {
        camera.position.copy(destination);
        controls.target.copy(center);
        tween = null;
      } else
        tween = {
          camera: camera.position.clone(),
          target: controls.target.clone(),
          destination,
          center,
          started: performance.now(),
        };
      requestRender();
    }

    function focus(id: string | null) {
      if (!id) return;
      const index = layout.byId.get(id);
      if (index === undefined) return;
      const center = layout.positions[index].clone();
      const direction = camera.position
        .clone()
        .sub(controls.target)
        .normalize();
      const distance = Math.max(6.0, Math.min(fitDistance * 0.48, 12));
      moveCamera(center, center.clone().addScaledVector(direction, distance));
    }

    function reset() {
      moveCamera(
        new THREE.Vector3(),
        new THREE.Vector3(
          layout.radius * 0.12,
          layout.radius * 0.13,
          fitDistance,
        ),
      );
    }

    const resize = () => {
      const previousFitDistance = fitDistance;
      width = Math.max(1, root.clientWidth);
      height = Math.max(1, root.clientHeight);
      camera.aspect = width / height;
      const verticalFov = THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov =
        2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
      fitDistance =
        (layout.radius / Math.sin(Math.min(verticalFov, horizontalFov) / 2)) *
        1.02;
      if (!latestRef.current.selectedId && camera.position.lengthSq() > 0) {
        camera.position
          .sub(controls.target)
          .multiplyScalar(fitDistance / previousFitDistance)
          .add(controls.target);
      }
      controls.maxDistance = Math.max(50, fitDistance * 3);
      camera.far = Math.max(400, fitDistance * 5);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      requestRender();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(root);
    const intersectionObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        if (visible) requestRender();
        else {
          cancelAnimationFrame(frame);
          frame = 0;
        }
      },
      { threshold: 0.01 },
    );
    intersectionObserver.observe(root);

    function nearest(x: number, y: number) {
      let result: number | null = null,
        bestScore = Infinity;
      nodes.forEach((node, index) => {
        const sx = screenPositions[index * 3],
          sy = screenPositions[index * 3 + 1],
          depth = screenPositions[index * 3 + 2];
        if (depth < -1 || depth > 1) return;
        const threshold =
          category(node) === "community"
            ? 13
            : category(node) === "person"
              ? 10
              : 7;
        const distance = (sx - x) ** 2 + (sy - y) ** 2;
        if (distance > threshold * threshold) return;
        const score = distance / (threshold * threshold) + depth * 0.025;
        if (score < bestScore) {
          result = index;
          bestScore = score;
        }
      });
      return result;
    }

    function setHover(index: number | null) {
      if (index === hoveredIndex) return;
      hoveredIndex = index;
      hoverGlow.visible = index !== null;
      if (index !== null) {
        hoverGlow.position.copy(layout.positions[index]);
        hoverGlowMaterial.color.copy(nodeColors[index]);
      }
      renderer.domElement.style.cursor =
        index !== null ? "pointer" : interacting ? "grabbing" : "grab";
      requestRender();
    }

    const pointerMove = (event: PointerEvent) => {
      const bounds = renderer.domElement.getBoundingClientRect();
      pointerPosition = {
        x: event.clientX - bounds.left,
        y: event.clientY - bounds.top,
      };
      if (interacting || hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (pointerPosition && !interacting)
          setHover(nearest(pointerPosition.x, pointerPosition.y));
      });
    };
    const pointerDown = (event: PointerEvent) => {
      pointerOrigin = { x: event.clientX, y: event.clientY };
    };
    const pointerUp = (event: PointerEvent) => {
      if (
        !pointerOrigin ||
        event.button !== 0 ||
        Math.hypot(
          event.clientX - pointerOrigin.x,
          event.clientY - pointerOrigin.y,
        ) > 5
      ) {
        pointerOrigin = null;
        return;
      }
      pointerOrigin = null;
      const bounds = renderer.domElement.getBoundingClientRect();
      const index = nearest(
        event.clientX - bounds.left,
        event.clientY - bounds.top,
      );
      if (index !== null) latestRef.current.onSelect(nodes[index].id);
    };
    const pointerLeave = () => {
      pointerPosition = null;
      setHover(null);
    };
    const controlsStart = () => {
      interacting = true;
      tween = null;
      setHover(null);
      renderer.domElement.style.cursor = "grabbing";
    };
    const controlsEnd = () => {
      interacting = false;
      renderer.domElement.style.cursor = "grab";
      requestRender();
    };
    const visibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(frame);
        frame = 0;
      } else requestRender();
    };
    const motionChange = () => {
      controls.enableDamping = !reducedMotion.matches;
      requestRender();
    };
    const lostContext = (event: Event) => {
      event.preventDefault();
      contextLost = true;
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      setStatus("fallback");
    };
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointerleave", pointerLeave);
    renderer.domElement.addEventListener("webglcontextlost", lostContext);
    controls.addEventListener("change", requestRender);
    controls.addEventListener("start", controlsStart);
    controls.addEventListener("end", controlsEnd);
    document.addEventListener("visibilitychange", visibilityChange);
    reducedMotion.addEventListener("change", motionChange);
    actionsRef.current = { refresh: requestRender, focus, reset };
    resize();
    camera.position.set(
      layout.radius * 0.12,
      layout.radius * 0.13,
      fitDistance,
    );
    controls.update();
    render();
    setStatus("ready");
    const initialFocus =
      latestRef.current.focusId === undefined
        ? latestRef.current.selectedId
        : latestRef.current.focusId;
    if (initialFocus) focus(initialFocus);

    return () => {
      disposed = true;
      actionsRef.current = {
        refresh: () => {},
        focus: () => {},
        reset: () => {},
      };
      cancelAnimationFrame(frame);
      cancelAnimationFrame(hoverFrame);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
      document.removeEventListener("visibilitychange", visibilityChange);
      reducedMotion.removeEventListener("change", motionChange);
      controls.removeEventListener("change", requestRender);
      controls.removeEventListener("start", controlsStart);
      controls.removeEventListener("end", controlsEnd);
      controls.dispose();
      groups.forEach(({ mesh }) => mesh.dispose());
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointerleave", pointerLeave);
      renderer.domElement.removeEventListener("webglcontextlost", lostContext);
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [layout]);

  useEffect(() => {
    actionsRef.current.refresh();
    if (focusId === undefined) actionsRef.current.focus(selectedId);
  }, [selectedId, focusId]);
  useEffect(() => {
    if (focusId !== undefined) actionsRef.current.focus(focusId);
  }, [focusId]);
  useEffect(() => {
    if (resetKey !== undefined && resetKey !== 0) actionsRef.current.reset();
  }, [resetKey]);

  const fallbackNodes = nodes.length ? nodes : EMPTY_ACTOR_LIST;
  return (
    <div
      ref={rootRef}
      className={`backend-graph backend-graph-${status}`}
      role="group"
      aria-label={`Three-dimensional network of ${nodes.length} nodes and ${edges.length} relationships. Use the node search and connection notes to inspect nodes with a keyboard.`}
    >
      <div ref={mountRef} className="backend-graph-canvas" />
      {nodes.length === 0 ? (
        <div className="backend-graph-empty">
          <Network size={27} strokeWidth={1.2} />
          <p>No nodes match this view.</p>
        </div>
      ) : status === "loading" ? (
        <div className="backend-graph-loading" role="status">
          <Network size={25} strokeWidth={1.2} />
          <p>Drawing the network…</p>
        </div>
      ) : status === "fallback" ? (
        <GraphFallback
          nodes={fallbackNodes}
          selectedId={selectedId}
          onSelect={onSelect}
        />
      ) : null}
      <div
        ref={tooltipRef}
        className="backend-graph-tooltip"
        hidden
        aria-hidden="true"
      >
        <strong data-node-name />
        <span data-node-kind />
      </div>
      <div
        ref={selectedLabelRef}
        className="backend-graph-tooltip backend-graph-selected-label"
        hidden
        aria-hidden="true"
      >
        <strong data-node-name />
        <span data-node-kind />
      </div>
      {status === "ready" && nodes.length > 0 && (
        <div className="backend-graph-hint" aria-hidden="true">
          <span>
            <i />
            Drag to orbit
          </span>
          <span>Scroll to zoom</span>
          <span>Click a node to inspect</span>
        </div>
      )}
    </div>
  );
}

export default BackendGraph;
