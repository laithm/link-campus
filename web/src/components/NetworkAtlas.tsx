import {
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import "../styles/network-atlas.css";

export type AtlasPerson = {
  id: string;
  name: string;
  group: number;
  groups?: number[];
  initials: string;
  sharedConceptIds?: string[];
  score?: number;
  sharedEvidence?: { id: string; label: string; kind: "interest" | "context" }[];
};

type NetworkAtlasProps = {
  people: AtlasPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeGroup: number | null;
  still: boolean;
  zoom: number;
};

type PersonPoint = {
  id: string;
  x: number;
  y: number;
  radius: number;
  distance: number;
  opacity: number;
  inFrame: boolean;
  kind?: "person" | "evidence" | "you";
  priority?: number;
};
type LabelMap = Map<string, HTMLElement>;
type EvidenceNode = {
  key: string;
  id: string;
  label: string;
  kind: "interest" | "context";
  people: number[];
  position: THREE.Vector3;
  selected: boolean;
};
const MAX_EVIDENCE = 3;
const VIEWER_ID = "atlas:viewer";
const VIEWER_POSITION = new THREE.Vector3(0, 0, 0.3);

const GROUP_COLORS = ["#3156d3", "#8c6cac", "#dc673e", "#4f8d9a", "#8585a7"];
// Rank determines position: the strongest match starts at the top/front.
const PERSON_POSITIONS: [number, number, number][] = [
  [-0.16, 1.64, 1.03],
  [-1.68, 0.73, 0.88],
  [1.65, 0.72, 0.78],
  [-1.62, -0.93, 1.02],
  [1.61, -0.98, 0.84],
  [0.02, -1.66, 0.94],
  [-0.85, 1.40, -1.24],
  [1.78, -0.16, -0.90],
  [-1.74, -0.42, -0.92],
  [-0.66, -1.44, -0.86],
  [0.87, 1.38, -0.95],
  [0.80, -1.38, -1.09],
];

function personPosition(index: number, count: number) {
  if (count === 1) return new THREE.Vector3(0.2, 1.65, 1.0);
  if (count === 2)
    return new THREE.Vector3(
      index ? 1.40 : -1.40,
      index ? -0.95 : 1.05,
      index ? 0.72 : 0.95,
    );
  if (index < PERSON_POSITIONS.length)
    return new THREE.Vector3(...PERSON_POSITIONS[index]);
  const angle = index * Math.PI * (3 - Math.sqrt(5));
  const y = 1 - (2 * (index + 0.5)) / count;
  const radius = Math.sqrt(1 - y * y);
  return new THREE.Vector3(
    Math.cos(angle) * radius,
    y,
    Math.sin(angle) * radius,
  ).multiplyScalar(1.65);
}

function matchesGroup(person: AtlasPerson, activeGroup: number | null) {
  return (
    activeGroup === null ||
    (person.groups ?? [person.group]).includes(activeGroup)
  );
}

function personLabel(person: AtlasPerson, people: AtlasPerson[]) {
  const [first, last] = person.name.split(" ");
  return last &&
    people.some(
      (other) => other.id !== person.id && other.name.split(" ")[0] === first,
    )
    ? `${first} ${last[0]}.`
    : first;
}

function evidenceNodes(people: AtlasPerson[], selectedId: string | null): EvidenceNode[] {
  const candidates = new Map<string, Omit<EvidenceNode, "position">>();
  people.forEach((person, index) => {
    const seen = new Set<string>();
    (person.sharedEvidence ?? []).forEach((evidence) => {
      const key = `evidence:${evidence.kind}:${evidence.id}`;
      if (seen.has(key) || !evidence.label.trim()) return;
      // An interest bridge must be a member of the complete, authoritative intersection.
      if (evidence.kind === "interest" && !person.sharedConceptIds?.includes(evidence.id)) return;
      seen.add(key);
      const existing = candidates.get(key);
      if (existing) {
        existing.people.push(index);
        existing.selected ||= person.id === selectedId;
      } else {
        candidates.set(key, { ...evidence, key, people: [index], selected: person.id === selectedId });
      }
    });
  });
  const picked = [...candidates.values()].sort((a, b) =>
    Number(b.selected) - Number(a.selected)
    || Number(a.kind === "context") - Number(b.kind === "context")
    || b.people.length - a.people.length
    || a.people[0] - b.people[0]
    || a.key.localeCompare(b.key),
  ).slice(0, MAX_EVIDENCE);
  const angles: number[] = [];
  return picked.map((node) => {
    const anchor = node.people.find((index) => people[index].id === selectedId) ?? node.people[0];
    const target = personPosition(anchor, people.length);
    const desiredAngle = Math.atan2(target.y, target.x);
    // Separate the small explanation nodes even when several explain the same person.
    const options = Array.from({ length: 12 }, (_, step) => desiredAngle + step * Math.PI / 6);
    const separation = (angle: number) => Math.min(Math.PI, ...angles.map((other) => Math.abs(Math.atan2(Math.sin(angle - other), Math.cos(angle - other)))));
    const angle = options.find((candidate) => separation(candidate) >= 1.5)
      ?? options.sort((a, b) => separation(b) - separation(a))[0];
    angles.push(angle);
    return { ...node, position: new THREE.Vector3(Math.cos(angle) * 0.78, Math.sin(angle) * 0.78, 1.12) };
  });
}

function fitDistance(width: number, height: number) {
  return Math.max(6.35, 5.1 / (width / height));
}

function projectPerson(
  id: string,
  position: THREE.Vector3,
  camera: THREE.PerspectiveCamera,
  width: number,
  height: number,
  radius: number,
  subdued: boolean,
): PersonPoint {
  const projected = position.clone().project(camera);
  const cameraSpace = position.clone().applyMatrix4(camera.matrixWorldInverse);
  const front = position.dot(camera.position.clone().normalize()) / 1.8;
  const opacity =
    THREE.MathUtils.smoothstep(front, -0.65, 0.78) * (subdued ? 0.25 : 1);
  const x = (projected.x * 0.5 + 0.5) * width;
  const y = (-projected.y * 0.5 + 0.5) * height;
  return {
    id,
    x,
    y,
    opacity,
    radius:
      (radius * height * camera.zoom) /
      (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) * -cameraSpace.z),
    distance: camera.position.distanceTo(position),
    inFrame:
      projected.z > -1 &&
      projected.z < 1 &&
      x > 12 &&
      x < width - 12 &&
      y > 12 &&
      y < height - 12,
  };
}

function positionLabels(
  points: PersonPoint[],
  labels: LabelMap,
  width: number,
  height: number,
) {
  const occupied: { x: number; y: number; width: number; height: number }[] =
    [];
  const byDepth = [...points].sort((a, b) => a.distance - b.distance);
  const sorted = [...byDepth].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.distance - b.distance);
  const limit = width < 440 ? 4 : 6;
  let personLabels = 0;
  let evidenceLabels = 0;
  sorted.forEach((point, index) => {
    const label = labels.get(point.id);
    if (!label) return;
    let opacity = 0;
    const occluded = byDepth
      .filter((other) => other.distance < point.distance)
      .some(
        (nearer) =>
          nearer.inFrame &&
          Math.hypot(nearer.x - point.x, nearer.y - point.y) <
            nearer.radius + point.radius * 0.4,
      );
    if (
      point.inFrame &&
      point.opacity > 0.13 &&
      !occluded &&
      (point.kind === "you" || (point.kind === "evidence" ? evidenceLabels < (width < 440 ? 2 : MAX_EVIDENCE) : personLabels < limit))
    ) {
      const labelWidth = label.offsetWidth;
      const labelHeight = label.offsetHeight;
      const gap = point.radius + 8;
      const right = [gap, -labelHeight / 2];
      const left = [-labelWidth - gap, -labelHeight / 2];
      const offsets = point.x > width * 0.64 ? [left, right] : [right, left];
      if (point.kind === "evidence") offsets.unshift([-labelWidth / 2, gap], [-labelWidth / 2, -labelHeight - gap]);
      if (point.kind === "you") offsets.unshift([-labelWidth / 2, gap]);
      offsets.push(
        [-labelWidth / 2, gap],
        [-labelWidth / 2, -labelHeight - gap],
      );
      const position = offsets
        .map(([offsetX, offsetY]) => ({
          x: point.x + offsetX,
          y: point.y + offsetY,
          width: labelWidth,
          height: labelHeight,
        }))
        .find(
          (option) =>
            option.x > 8 &&
            option.y > 8 &&
            option.x + option.width < width - 8 &&
            option.y + option.height < height - 8 &&
            !occupied.some(
              (other) =>
                option.x < other.x + other.width + 7 &&
                option.x + option.width + 7 > other.x &&
                option.y < other.y + other.height + 7 &&
                option.y + option.height + 7 > other.y,
            ) &&
            !points.some(
              (other) =>
                other.id !== point.id &&
                other.inFrame &&
                other.opacity > 0.25 &&
                other.distance <= point.distance + 0.8 &&
                other.x + other.radius > option.x - 4 &&
                other.x - other.radius < option.x + option.width + 4 &&
                other.y + other.radius > option.y - 4 &&
                other.y - other.radius < option.y + option.height + 4,
            ),
        );
      if (position) {
        occupied.push(position);
        label.style.left = `${position.x}px`;
        label.style.top = `${position.y}px`;
        opacity = point.opacity;
        if (point.kind === "evidence") evidenceLabels += 1;
        else if (point.kind !== "you") personLabels += 1;
      }
    }
    label.style.opacity = `${opacity}`;
    label.dataset.depth = point.distance.toFixed(3);
    label.style.zIndex = `${sorted.length - index + 1}`;
    const interactive = label instanceof HTMLButtonElement;
    label.style.pointerEvents = interactive && opacity > 0.25 ? "auto" : "none";
    label.tabIndex = interactive && opacity > 0.25 ? 0 : -1;
    label.setAttribute("aria-hidden", opacity > 0.25 ? "false" : "true");
  });
}

function PersonLabels({
  people,
  evidence,
  selectedId,
  onSelect,
  labels,
}: {
  people: AtlasPerson[];
  evidence: EvidenceNode[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  labels: LabelMap;
}) {
  return (
    <div className="atlas-labels">
      <span
        className="atlas-viewer-label"
        data-atlas-node="you"
        ref={(element) => {
          if (element) labels.set(VIEWER_ID, element);
          else labels.delete(VIEWER_ID);
        }}
      >You</span>
      {evidence.map((node) => <span
        key={node.key}
        className={`atlas-evidence-label${node.selected ? " is-selected-evidence" : ""}`}
        data-evidence-id={node.id}
        data-evidence-kind={node.kind}
        data-connected-people={node.people.map((index) => people[index].id).join(",")}
        aria-label={`Shared ${node.kind}: ${node.label}. Connects you with ${node.people.length} ${node.people.length === 1 ? "profile" : "profiles"}.`}
        ref={(element) => {
          if (element) labels.set(node.key, element);
          else labels.delete(node.key);
        }}
      ><span>{node.label}</span></span>)}
      {people.map((person) => (
        <button
          key={person.id}
          ref={(element) => {
            if (element) labels.set(person.id, element);
            else labels.delete(person.id);
          }}
          type="button"
          data-person-id={person.id}
          tabIndex={-1}
          className={`atlas-person ${selectedId === person.id ? "atlas-person-selected" : ""}`}
          onClick={() => onSelect(person.id)}
          aria-label={`Explore ${person.name}'s connections`}
          aria-pressed={selectedId === person.id}
        >
          <span
            className="atlas-person-initials"
            style={{ color: GROUP_COLORS[person.group % GROUP_COLORS.length] }}
          >
            {person.initials}
          </span>
          <span>{personLabel(person, people)}</span>
          {selectedId === person.id && (
            <span className="atlas-person-dot" aria-hidden="true" />
          )}
        </button>
      ))}
    </div>
  );
}

function StaticAtlas({
  people,
  selectedId,
  onSelect,
  activeGroup,
  zoom,
  gradientId,
}: NetworkAtlasProps & { gradientId: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<LabelMap>(new Map());
  const [size, setSize] = useState({ width: 500, height: 450 });
  const evidence = useMemo(() => evidenceNodes(people, selectedId), [people, selectedId]);
  const camera = new THREE.PerspectiveCamera(
    43,
    size.width / size.height,
    0.1,
    80,
  );
  camera.position.set(0, 0, fitDistance(size.width, size.height));
  camera.zoom = Math.max(0.7, Math.min(1.6, zoom));
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  const points = people.map((person, index) => ({
    ...projectPerson(
      person.id,
      personPosition(index, people.length),
      camera,
      size.width,
      size.height,
      selectedId === person.id ? 0.155 : 0.12,
      !matchesGroup(person, activeGroup),
    ), kind: "person" as const, priority: person.id === selectedId ? 6 : 0,
  }));
  const viewerPoint = {
    ...projectPerson(VIEWER_ID, VIEWER_POSITION, camera, size.width, size.height, 0.14, false),
    kind: "you" as const, opacity: 1, priority: 5,
  };
  const evidencePoints = evidence.map((node, index) => {
    const point = projectPerson(node.key, node.position, camera, size.width, size.height, 0.055, false);
    return { ...point, inFrame: point.inFrame && index < (size.width < 440 ? 2 : MAX_EVIDENCE), kind: "evidence" as const, opacity: 0.3 + point.opacity * 0.7, priority: node.selected ? node.kind === "interest" ? 4.5 : 4 : 3 };
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const observer = new ResizeObserver(() =>
      setSize({
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight),
      }),
    );
    observer.observe(container);
    return () => observer.disconnect();
  }, []);
  useLayoutEffect(() => {
    positionLabels([...points, viewerPoint, ...evidencePoints], labelsRef.current, size.width, size.height);
  });

  return (
    <div ref={containerRef} className="atlas-fallback">
      <svg
        viewBox={`0 0 ${size.width} ${size.height}`}
        role="img"
        aria-label={`You connected to ${people.length} matching profiles through named shared interests and contexts`}
      >
        <defs>
          <radialGradient id={gradientId} cx="28%" cy="22%" r="80%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="42%" stopColor="#e4eaf6" />
            <stop offset="100%" stopColor="#8da3ca" />
          </radialGradient>
        </defs>
        {evidence.slice(0, size.width < 440 ? 2 : MAX_EVIDENCE).map((node, index) => <g key={node.key} fill="none" stroke={node.selected ? "#ba7256" : "#9cabc2"} strokeWidth="0.9" opacity={node.selected ? 0.5 : 0.28}>
          <line x1={viewerPoint.x} y1={viewerPoint.y} x2={evidencePoints[index].x} y2={evidencePoints[index].y} />
          {node.people.map((personIndex) => <line key={people[personIndex].id}
            x1={evidencePoints[index].x} y1={evidencePoints[index].y}
            x2={points[personIndex].x} y2={points[personIndex].y} />)}
        </g>)}
        <circle cx={viewerPoint.x} cy={viewerPoint.y} r={viewerPoint.radius + 5} fill="none" stroke="#3156d3" opacity="0.28" />
        <circle cx={viewerPoint.x} cy={viewerPoint.y} r={viewerPoint.radius} fill="#1d2940" stroke="#fbfcfe" strokeWidth="1.5" />
        {evidencePoints.slice(0, size.width < 440 ? 2 : MAX_EVIDENCE).map((point) => <circle key={point.id} cx={point.x} cy={point.y} r={point.radius} fill="#dc673e" stroke="#fbfcfe" strokeWidth="1" opacity={point.opacity} />)}
        {[...points]
          .sort((a, b) => b.distance - a.distance)
          .map((point) => (
            <g
              key={point.id}
              opacity={0.2 + point.opacity * 0.8}
              onClick={() => onSelect(point.id)}
              className="atlas-fallback-node"
            >
              {selectedId === point.id && (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={point.radius + 6}
                  fill="none"
                  stroke="#3156d3"
                  opacity="0.3"
                />
              )}
              <circle
                cx={point.x}
                cy={point.y}
                r={point.radius}
                fill={
                  selectedId === point.id ? "#3156d3" : `url(#${gradientId})`
                }
                stroke="#ffffff"
                strokeWidth="1"
              />
            </g>
          ))}
      </svg>
      <PersonLabels
        people={people}
        evidence={evidence}
        selectedId={selectedId}
        onSelect={onSelect}
        labels={labelsRef.current}
      />
    </div>
  );
}

export function NetworkAtlas(props: NetworkAtlasProps) {
  const { people, selectedId, activeGroup, still, zoom } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef<LabelMap>(new Map());
  const latestRef = useRef(props);
  const refreshRef = useRef<() => void>(() => {});
  const [webglReady, setWebglReady] = useState(false);
  const gradientId = useId().replace(/:/g, "");
  const evidence = useMemo(() => evidenceNodes(people, selectedId), [people, selectedId]);
  const evidenceRef = useRef(evidence);
  evidenceRef.current = evidence;
  latestRef.current = props;
  const signature = JSON.stringify(
    people.map(({ id, group, groups, sharedConceptIds, sharedEvidence, score }) => [
      id,
      group,
      groups,
      sharedConceptIds,
      sharedEvidence,
      score,
    ]),
  );

  useEffect(() => {
    const container = containerRef.current;
    const mount = canvasMountRef.current;
    if (!container || !mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        powerPreference: "low-power",
      });
    } catch {
      setWebglReady(false);
      return;
    }

    let disposed = false;
    let visible = true;
    let contextAvailable = true;
    let animationFrame = 0;
    let previousTime = 0;
    let width = 1;
    let height = 1;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
    camera.position.set(0, 0, 6.35);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.domElement.setAttribute("aria-hidden", "true");
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.rotateSpeed = 0.48;
    controls.minPolarAngle = Math.PI * 0.16;
    controls.maxPolarAngle = Math.PI * 0.84;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.ROTATE;

    scene.add(new THREE.AmbientLight(0xe7edff, 1.8));
    const keyLight = new THREE.DirectionalLight(0xffffff, 4.5);
    keyLight.position.set(-4, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x7895ce, 2.2);
    rimLight.position.set(5, -2, -3);
    scene.add(rimLight);

    const network = new THREE.Group();
    scene.add(network);
    const resources: (THREE.BufferGeometry | THREE.Material)[] = [];
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 24);
    const ringGeometry = new THREE.RingGeometry(1.48, 1.54, 48);
    resources.push(sphereGeometry, ringGeometry);
    const personMeshes = latestRef.current.people.map((person, index) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: "#d1dcef",
        roughness: 0.45,
        metalness: 0.08,
        clearcoat: 0.35,
        clearcoatRoughness: 0.14,
        transparent: true,
      });
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.position.copy(
        personPosition(index, latestRef.current.people.length),
      );
      mesh.userData.personId = person.id;
      network.add(mesh);
      const ringMaterial = new THREE.MeshBasicMaterial({
        color: "#3156d3",
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeometry, ringMaterial);
      ring.position.copy(mesh.position);
      ring.scale.setScalar(0.155);
      network.add(ring);
      resources.push(material, ringMaterial);
      return { person, mesh, material, ring, ringMaterial };
    });

    const viewerMaterial = new THREE.MeshPhysicalMaterial({ color: "#1d2940", roughness: 0.4, metalness: 0.05 });
    const viewer = new THREE.Mesh(sphereGeometry, viewerMaterial);
    viewer.position.copy(VIEWER_POSITION);
    viewer.scale.setScalar(0.14);
    network.add(viewer);
    const viewerRingMaterial = new THREE.MeshBasicMaterial({ color: "#3156d3", transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false });
    const viewerRing = new THREE.Mesh(ringGeometry, viewerRingMaterial);
    viewerRing.position.copy(VIEWER_POSITION);
    viewerRing.scale.setScalar(0.14);
    network.add(viewerRing);
    resources.push(viewerMaterial, viewerRingMaterial);

    // Reuse a small fixed pool: changing the selected profile updates evidence without replacing WebGL.
    const evidenceMeshes = Array.from({ length: MAX_EVIDENCE }, () => {
      const material = new THREE.MeshBasicMaterial({ color: "#dc673e", transparent: true });
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.scale.setScalar(0.055);
      network.add(mesh);
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array((personMeshes.length + 1) * 6), 3));
      const lineMaterial = new THREE.LineBasicMaterial({ color: "#bd795d", transparent: true, opacity: 0.4, depthWrite: false });
      const lines = new THREE.LineSegments(geometry, lineMaterial);
      lines.frustumCulled = false;
      network.add(lines);
      resources.push(material, geometry, lineMaterial);
      return { mesh, material, geometry, lines, lineMaterial };
    });
    let previousEvidence: EvidenceNode[] | undefined;
    const syncEvidence = () => {
      const currentEvidence = evidenceRef.current;
      if (currentEvidence === previousEvidence) return;
      previousEvidence = currentEvidence;
      evidenceMeshes.forEach(({ mesh, geometry, lines }, index) => {
        const node = currentEvidence[index];
        mesh.visible = lines.visible = Boolean(node);
        if (!node) return;
        mesh.position.copy(node.position);
        const attribute = geometry.getAttribute("position") as THREE.BufferAttribute;
        const values = attribute.array as Float32Array;
        values.set([...VIEWER_POSITION.toArray(), ...node.position.toArray()], 0);
        node.people.forEach((personIndex, memberIndex) => {
          values.set([...node.position.toArray(), ...personMeshes[personIndex].mesh.position.toArray()], (memberIndex + 1) * 6);
        });
        attribute.needsUpdate = true;
        geometry.setDrawRange(0, (node.people.length + 1) * 2);
      });
    };

    const worldPosition = new THREE.Vector3();
    const render = () => {
      if (disposed || !visible || !contextAvailable) return;
      const current = latestRef.current;
      camera.zoom = Math.max(0.7, Math.min(1.6, current.zoom));
      camera.updateProjectionMatrix();
      camera.updateMatrixWorld();
      syncEvidence();
      network.updateMatrixWorld(true);
      const points = personMeshes.map(
        ({ person, mesh, material, ring, ringMaterial }) => {
          const selected = current.selectedId === person.id;
          const subdued = !matchesGroup(person, current.activeGroup);
          const radius = selected ? 0.155 : 0.12;
          mesh.getWorldPosition(worldPosition);
          const point = projectPerson(
            person.id,
            worldPosition,
            camera,
            width,
            height,
            radius,
            subdued,
          );
          material.color.set(selected ? "#3156d3" : "#d1dcef");
          material.opacity = 0.18 + point.opacity * 0.82;
          mesh.scale.setScalar(radius);
          ring.visible = selected;
          ringMaterial.opacity = point.opacity * 0.35;
          ring.quaternion.copy(
            network.quaternion.clone().invert().multiply(camera.quaternion),
          );
          return { ...point, kind: "person" as const, priority: selected ? 6 : 0 };
        },
      );
      viewer.getWorldPosition(worldPosition);
      const viewerPoint = {
        ...projectPerson(VIEWER_ID, worldPosition, camera, width, height, 0.14, false),
        kind: "you" as const, opacity: 1, priority: 5,
      };
      viewerRing.quaternion.copy(network.quaternion.clone().invert().multiply(camera.quaternion));
      const evidencePoints = evidenceRef.current.map((node, index) => {
        const { mesh, material, lineMaterial, lines } = evidenceMeshes[index];
        const shown = index < (width < 440 ? 2 : MAX_EVIDENCE);
        mesh.visible = lines.visible = shown;
        mesh.getWorldPosition(worldPosition);
        const point = projectPerson(node.key, worldPosition, camera, width, height, 0.055, false);
        material.opacity = 0.35 + point.opacity * 0.65;
        lineMaterial.opacity = (node.selected ? 0.24 : 0.10) + point.opacity * (node.selected ? 0.24 : 0.14);
        lineMaterial.color.set(node.selected ? "#b87557" : "#92a3be");
        return { ...point, inFrame: point.inFrame && shown, kind: "evidence" as const, opacity: 0.3 + point.opacity * 0.7, priority: node.selected ? node.kind === "interest" ? 4.5 : 4 : 3 };
      });
      positionLabels([...points, viewerPoint, ...evidencePoints], labelsRef.current, width, height);

      renderer.render(scene, camera);
    };
    const shouldAnimate = () =>
      visible &&
      contextAvailable &&
      !document.hidden &&
      !latestRef.current.still &&
      !reducedMotion.matches;
    const tick = (time: number) => {
      animationFrame = 0;
      if (!shouldAnimate() || disposed) return;
      const delta = previousTime
        ? Math.min((time - previousTime) / 1000, 0.05)
        : 0;
      previousTime = time;
      network.rotation.y += delta * 0.021;
      render();
      animationFrame = requestAnimationFrame(tick);
    };
    const refresh = () => {
      render();
      if (shouldAnimate() && !animationFrame) {
        previousTime = 0;
        animationFrame = requestAnimationFrame(tick);
      } else if (!shouldAnimate() && animationFrame) {
        cancelAnimationFrame(animationFrame);
        animationFrame = 0;
      }
    };
    refreshRef.current = refresh;
    controls.addEventListener("change", render);

    const resize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.position.setLength(fitDistance(width, height));
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      refresh();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const visibilityObserver = new IntersectionObserver(
      ([entry]) => {
        visible = entry.isIntersecting;
        refresh();
      },
      { threshold: 0.01 },
    );
    visibilityObserver.observe(container);
    document.addEventListener("visibilitychange", refresh);
    reducedMotion.addEventListener("change", refresh);

    const raycaster = new THREE.Raycaster();
    const pointerStart = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => {
      pointerStart.x = event.clientX;
      pointerStart.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (
        Math.hypot(
          event.clientX - pointerStart.x,
          event.clientY - pointerStart.y,
        ) > 5
      )
        return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
        (-(event.clientY - bounds.top) / bounds.height) * 2 + 1,
      );
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(
        personMeshes.map(({ mesh }) => mesh),
      )[0];
      if (hit)
        latestRef.current.onSelect(hit.object.userData.personId as string);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      contextAvailable = false;
      refresh();
      setWebglReady(false);
    };
    const contextRestored = () => {
      contextAvailable = true;
      setWebglReady(true);
      refresh();
    };
    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("webglcontextlost", contextLost);
    renderer.domElement.addEventListener(
      "webglcontextrestored",
      contextRestored,
    );
    resize();
    setWebglReady(true);

    return () => {
      disposed = true;
      refreshRef.current = () => {};
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener("visibilitychange", refresh);
      reducedMotion.removeEventListener("change", refresh);
      controls.removeEventListener("change", render);
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("webglcontextlost", contextLost);
      renderer.domElement.removeEventListener(
        "webglcontextrestored",
        contextRestored,
      );
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [signature]);

  useEffect(() => {
    refreshRef.current();
  }, [people, selectedId, activeGroup, still, zoom, webglReady]);

  return (
    <div
      ref={containerRef}
      className={`atlas-root ${webglReady ? "atlas-ready" : ""}`}
      aria-label="Matching people in an interactive network"
    >
      <div className="atlas-atmosphere" aria-hidden="true" />
      <div ref={canvasMountRef} className="atlas-canvas" />
      {!webglReady && <StaticAtlas {...props} gradientId={gradientId} />}
      {webglReady && (
        <PersonLabels
          people={people}
          evidence={evidence}
          selectedId={selectedId}
          onSelect={props.onSelect}
          labels={labelsRef.current}
        />
      )}
    </div>
  );
}

export default NetworkAtlas;
