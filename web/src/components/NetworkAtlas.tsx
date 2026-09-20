import { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import '../styles/network-atlas.css';

export type AtlasPerson = {
  id: string;
  name: string;
  group: number;
  groups?: number[];
  initials: string;
};

type NetworkAtlasProps = {
  people: AtlasPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeGroup: number | null;
  still: boolean;
  zoom: number;
};

const GROUP_COLORS = ['#168f8d', '#a394c7', '#bd9651', '#73a1b6', '#829977'];
const PERSON_POSITIONS = [
  [-1.72, 0.68, 1.05], [0.10, 1.55, 0.80], [1.58, 0.82, 0.94],
  [1.53, -0.90, 1.02], [-0.48, -1.39, 1.09], [-1.76, -0.64, 0.69],
  [0.32, 0.06, 1.97], [0.05, -0.57, -1.68],
];

function seededRandom(seed: number) {
  let value = seed;
  return () => {
    value = (value * 1664525 + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function personPosition(index: number) {
  if (index < PERSON_POSITIONS.length) return new THREE.Vector3(...PERSON_POSITIONS[index] as [number, number, number]);
  const random = seededRandom(index * 149 + 73);
  const azimuth = random() * Math.PI * 2;
  const polar = Math.acos(random() * 2 - 1);
  const radius = 1.22 + random() * 0.67;
  return new THREE.Vector3(Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth)).multiplyScalar(radius);
}

function matchesGroup(person: AtlasPerson, activeGroup: number | null) {
  return activeGroup === null || (person.groups ?? [person.group]).includes(activeGroup);
}

function personLabel(person: AtlasPerson, people: AtlasPerson[]) {
  const [first, last] = person.name.split(' ');
  return last && people.some((other) => other.id !== person.id && other.name.split(' ')[0] === first)
    ? `${first} ${last[0]}.` : first;
}

function makeConstellation() {
  const random = seededRandom(2031);
  const centers = [
    new THREE.Vector3(-1.1, 0.60, 0.40), new THREE.Vector3(0.36, 1.02, -0.40),
    new THREE.Vector3(1.13, -0.04, 0.26), new THREE.Vector3(-0.13, -0.97, 0.43),
    new THREE.Vector3(-0.83, -0.34, -0.93),
  ];
  const nodes: { position: THREE.Vector3; group: number; size: number }[] = [];
  centers.forEach((center, group) => {
    for (let index = 0; index < 37; index += 1) {
      const azimuth = random() * Math.PI * 2;
      const polar = Math.acos(2 * random() - 1);
      const radius = Math.pow(random(), 0.55) * 1.04;
      const position = new THREE.Vector3(
        Math.sin(polar) * Math.cos(azimuth), Math.cos(polar), Math.sin(polar) * Math.sin(azimuth),
      ).multiplyScalar(radius).add(center);
      nodes.push({ position, group, size: 0.015 + random() * 0.024 });
    }
  });
  const edges: [number, number][] = [];
  nodes.forEach((node, index) => {
    const nearest = nodes.map((other, otherIndex) => ({
      index: otherIndex, distance: node.position.distanceToSquared(other.position),
    })).filter((other) => other.index !== index)
      .sort((a, b) => a.distance - b.distance).slice(0, 4);
    nearest.forEach((other) => {
      if (other.index > index) edges.push([index, other.index]);
    });
  });
  return { nodes, edges };
}

const constellation = makeConstellation();

function StaticAtlas({ people, selectedId, onSelect, activeGroup, gradientId }: {
  people: AtlasPerson[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  activeGroup: number | null;
  gradientId: string;
}) {
  const toPoint = (position: THREE.Vector3) => ({ x: 375 + position.x * 99, y: 209 - position.y * 99 });
  return (
    <div className="atlas-fallback">
      <svg viewBox="0 0 750 420" preserveAspectRatio="none" role="img" aria-label="Campus constellation of people and shared interests">
        <defs>
          <radialGradient id={gradientId} cx="35%" cy="25%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="65%" stopColor="#d0e8e3" />
            <stop offset="100%" stopColor="#94c4bd" />
          </radialGradient>
        </defs>
        <g fill="none" stroke="#6ba99f" strokeWidth="0.7" opacity="0.5">
          <ellipse cx="375" cy="210" rx="245" ry="158" transform="rotate(-24 375 210)" />
          <ellipse cx="375" cy="210" rx="225" ry="86" transform="rotate(37 375 210)" />
          <ellipse cx="375" cy="210" rx="211" ry="78" transform="rotate(-73 375 210)" />
        </g>
        <g stroke="#579a8d" strokeWidth="0.65" opacity="0.48">
          {constellation.edges.map(([a, b]) => {
            const start = toPoint(constellation.nodes[a].position);
            const end = toPoint(constellation.nodes[b].position);
            return <line key={`${a}-${b}`} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
          })}
        </g>
        {constellation.nodes.map((node, index) => {
          const point = toPoint(node.position);
          return <circle key={index} cx={point.x} cy={point.y} r={node.size * 80} fill={GROUP_COLORS[node.group]} opacity="0.45" />;
        })}
        {people.map((person, index) => {
          const point = toPoint(personPosition(index));
          const selected = selectedId === person.id;
          return <g key={person.id} opacity={matchesGroup(person, activeGroup) ? 1 : 0.3}>
            <circle cx={point.x} cy={point.y} r={selected ? 15 : index < 7 ? 11 : 5} fill={selected ? '#0b8c85' : `url(#${gradientId})`} stroke={selected ? '#d8ffff' : '#ffffff'} strokeWidth="1.5" />
            {selected && <circle cx={point.x} cy={point.y} r="22" fill="none" stroke="#169890" opacity="0.35" />}
          </g>;
        })}
      </svg>
      <div className="atlas-fallback-labels">
        {people.map((person, index) => {
          if (index >= 7 && selectedId !== person.id) return null;
          const point = toPoint(personPosition(index));
          return <button
            key={person.id}
            type="button"
            className={`atlas-person ${selectedId === person.id ? 'atlas-person-selected' : ''}`}
            style={{ left: `${point.x / 7.5}%`, top: `${point.y / 4.2}%`, opacity: matchesGroup(person, activeGroup) ? 1 : 0.32 }}
            onClick={() => onSelect(person.id)}
            aria-label={`Explore ${person.name}'s connections`}
            aria-pressed={selectedId === person.id}
          >
            <span className="atlas-person-initials" style={{ color: GROUP_COLORS[person.group % GROUP_COLORS.length] }}>{person.initials}</span>
            <span>{personLabel(person, people)}</span>
          </button>;
        })}
      </div>
    </div>
  );
}

export function NetworkAtlas(props: NetworkAtlasProps) {
  const { people, selectedId, onSelect, activeGroup, still, zoom } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasMountRef = useRef<HTMLDivElement>(null);
  const labelsRef = useRef(new Map<string, HTMLButtonElement>());
  const latestRef = useRef(props);
  const refreshRef = useRef<() => void>(() => {});
  const [webglReady, setWebglReady] = useState(false);
  const gradientId = useId().replace(/:/g, '');
  latestRef.current = props;
  const signature = people.map((person) => `${person.id}:${person.group}:${person.groups?.join(',') ?? ''}`).join('|');
  const displayedPeople = useMemo(() => {
    const displayed = people.slice(0, 7);
    const selected = people.find((person) => person.id === selectedId);
    if (selected && !displayed.includes(selected)) displayed.push(selected);
    return displayed;
  }, [people, selectedId]);

  useEffect(() => {
    const container = containerRef.current;
    const mount = canvasMountRef.current;
    if (!container || !mount) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
    } catch {
      setWebglReady(false);
      return;
    }

    let disposed = false;
    let visible = true;
    let animationFrame = 0;
    let previousTime = 0;
    let width = 1;
    let height = 1;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 80);
    camera.position.set(0, 0.05, 6.15);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.8));
    renderer.setClearColor(0xffffff, 0);
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.04;
    renderer.domElement.setAttribute('aria-hidden', 'true');
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableZoom = false;
    controls.enablePan = false;
    controls.enableDamping = false;
    controls.rotateSpeed = 0.42;
    controls.minPolarAngle = Math.PI * 0.22;
    controls.maxPolarAngle = Math.PI * 0.78;
    controls.touches.ONE = THREE.TOUCH.ROTATE;
    controls.touches.TWO = THREE.TOUCH.ROTATE;

    scene.add(new THREE.AmbientLight(0xcdf6ef, 1.3));
    const keyLight = new THREE.DirectionalLight(0xffffff, 3.8);
    keyLight.position.set(-4, 5, 6);
    scene.add(keyLight);
    const rimLight = new THREE.DirectionalLight(0x81c6c2, 1.9);
    rimLight.position.set(5, -2, -3);
    scene.add(rimLight);

    const network = new THREE.Group();
    network.rotation.z = -0.075;
    scene.add(network);
    const resources: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];
    const sphereGeometry = new THREE.SphereGeometry(1, 18, 14);
    resources.push(sphereGeometry);
    const dustMaterial = new THREE.MeshPhysicalMaterial({
      color: '#a8cfc2', roughness: 0.26, metalness: 0.08, clearcoat: 1,
      transparent: true, opacity: 0.95,
    });
    resources.push(dustMaterial);
    const dust = new THREE.InstancedMesh(sphereGeometry, dustMaterial, constellation.nodes.length);
    const matrix = new THREE.Matrix4();
    const quaternion = new THREE.Quaternion();
    constellation.nodes.forEach((node, index) => {
      matrix.compose(node.position, quaternion, new THREE.Vector3(node.size, node.size, node.size));
      dust.setMatrixAt(index, matrix);
      dust.setColorAt(index, new THREE.Color(GROUP_COLORS[node.group]).lerp(new THREE.Color('#d8f4e9'), 0.44));
    });
    network.add(dust);

    const edgePositions: number[] = [];
    constellation.edges.forEach(([a, b]) => {
      edgePositions.push(...constellation.nodes[a].position.toArray(), ...constellation.nodes[b].position.toArray());
    });
    const edgeGeometry = new THREE.BufferGeometry();
    edgeGeometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
    const edgeMaterial = new THREE.LineBasicMaterial({ color: '#4d9487', transparent: true, opacity: 0.3, depthWrite: false });
    resources.push(edgeGeometry, edgeMaterial);
    network.add(new THREE.LineSegments(edgeGeometry, edgeMaterial));

    const orbitSettings = [
      { radius: 2.37, x: 1.02, y: 0.18, z: -0.40, opacity: 0.36 },
      { radius: 2.22, x: 0.71, y: 1.16, z: 0.72, opacity: 0.3 },
      { radius: 2.43, x: 1.57, y: 0.56, z: -0.53, opacity: 0.27 },
    ];
    orbitSettings.forEach((orbit, index) => {
      const points = Array.from({ length: 161 }, (_, step) => {
        const angle = step / 160 * Math.PI * 2;
        return new THREE.Vector3(Math.cos(angle) * orbit.radius, Math.sin(angle) * orbit.radius, 0);
      });
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({ color: index === 1 ? '#c6b88c' : '#56a29a', transparent: true, opacity: orbit.opacity, depthWrite: false });
      const line = new THREE.Line(geometry, material);
      line.rotation.set(orbit.x, orbit.y, orbit.z);
      network.add(line);
      resources.push(geometry, material);
      const satelliteMaterial = new THREE.MeshPhysicalMaterial({ color: index === 1 ? '#dfcea4' : '#b7d8d3', roughness: 0.22, metalness: 0.12 });
      const satellite = new THREE.Mesh(sphereGeometry, satelliteMaterial);
      satellite.scale.setScalar(0.055);
      satellite.position.copy(points[24 + index * 41]).applyEuler(line.rotation);
      network.add(satellite);
      resources.push(satelliteMaterial);
    });

    const haloCanvas = document.createElement('canvas');
    haloCanvas.width = 128;
    haloCanvas.height = 128;
    const context = haloCanvas.getContext('2d');
    if (context) {
      const gradient = context.createRadialGradient(64, 64, 4, 64, 64, 64);
      gradient.addColorStop(0, 'rgba(37, 173, 154, 0.40)');
      gradient.addColorStop(0.4, 'rgba(80, 184, 165, 0.13)');
      gradient.addColorStop(1, 'rgba(80, 184, 165, 0)');
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    const haloTexture = new THREE.CanvasTexture(haloCanvas);
    resources.push(haloTexture);
    const personMeshes = latestRef.current.people.map((person, index) => {
      const material = new THREE.MeshPhysicalMaterial({
        color: '#e3f2e7', roughness: 0.19, metalness: 0.09, clearcoat: 1,
        clearcoatRoughness: 0.18, transparent: true, opacity: 1,
      });
      const mesh = new THREE.Mesh(sphereGeometry, material);
      mesh.scale.setScalar(0.115);
      mesh.position.copy(personPosition(index));
      mesh.userData.personId = person.id;
      network.add(mesh);
      const haloMaterial = new THREE.SpriteMaterial({ map: haloTexture, transparent: true, opacity: 0.65, depthWrite: false });
      const halo = new THREE.Sprite(haloMaterial);
      halo.position.copy(mesh.position);
      halo.scale.set(0.78, 0.78, 1);
      network.add(halo);
      const nearest = constellation.nodes.map((node, nodeIndex) => ({ nodeIndex, distance: node.position.distanceToSquared(mesh.position) }))
        .sort((a, b) => a.distance - b.distance).slice(0, 8);
      const positions: number[] = [];
      nearest.forEach(({ nodeIndex }) => positions.push(...mesh.position.toArray(), ...constellation.nodes[nodeIndex].position.toArray()));
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      const lineMaterial = new THREE.LineBasicMaterial({ color: '#279e90', transparent: true, opacity: 0.24, depthWrite: false });
      network.add(new THREE.LineSegments(geometry, lineMaterial));
      resources.push(material, haloMaterial, geometry, lineMaterial);
      return { person, mesh, material, halo, haloMaterial, lineMaterial, index };
    });

    const projected = new THREE.Vector3();
    const worldPosition = new THREE.Vector3();
    const render = () => {
      if (disposed || !visible) return;
      const current = latestRef.current;
      const currentZoom = Math.max(0.7, Math.min(1.6, current.zoom));
      camera.zoom = currentZoom;
      camera.updateProjectionMatrix();
      network.updateMatrixWorld(true);
      const labelPlacements: { label: HTMLButtonElement; x: number; y: number; selected: boolean; subdued: boolean }[] = [];
      personMeshes.forEach(({ person, mesh, material, halo, haloMaterial, lineMaterial, index }) => {
        const selected = current.selectedId === person.id;
        const subdued = !matchesGroup(person, current.activeGroup);
        material.color.set(selected ? '#168f87' : '#deeee3');
        material.opacity = subdued ? 0.28 : 1;
        mesh.scale.setScalar(selected ? 0.14 : index < 7 ? 0.1 : 0.048 + index % 3 * 0.009);
        haloMaterial.opacity = subdued ? 0.08 : selected ? 1 : 0.42;
        halo.scale.setScalar(selected ? 1.08 : 0.67);
        lineMaterial.opacity = subdued ? 0.06 : selected ? 0.58 : 0.2;
        const label = labelsRef.current.get(person.id);
        if (label) {
          mesh.getWorldPosition(worldPosition);
          projected.copy(worldPosition).project(camera);
          const x = (projected.x * 0.5 + 0.5) * width;
          const y = (-projected.y * 0.5 + 0.5) * height;
          const inFrame = projected.z < 1 && x > 8 && x < width - 8 && y > 8 && y < height - 8;
          label.style.opacity = inFrame ? subdued ? '0.3' : '1' : '0';
          label.style.visibility = inFrame ? 'visible' : 'hidden';
          label.style.zIndex = selected ? '5' : `${Math.round(2 + (1 - projected.z))}`;
          if (inFrame) labelPlacements.push({ label, x, y, selected, subdued });
        }
      });
      const occupied: { x: number; y: number; width: number; height: number }[] = [];
      labelPlacements.sort((a, b) => Number(b.selected) - Number(a.selected) || Number(a.subdued) - Number(b.subdued));
      labelPlacements.forEach(({ label, x, y }) => {
        const labelWidth = label.offsetWidth;
        const labelHeight = label.offsetHeight;
        const offsets = [[15, -labelHeight / 2], [-labelWidth - 15, -labelHeight / 2], [15, 20], [15, -labelHeight - 20], [-labelWidth - 15, 20], [-labelWidth - 15, -labelHeight - 20]];
        const options = offsets.map(([offsetX, offsetY]) => ({
          x: Math.max(9, Math.min(width - labelWidth - 9, x + offsetX)),
          y: Math.max(7, Math.min(height - labelHeight - 7, y + offsetY)),
          width: labelWidth,
          height: labelHeight,
        }));
        const position = options.find((option) => !occupied.some((other) => (
          option.x < other.x + other.width + 5 && option.x + option.width + 5 > other.x
          && option.y < other.y + other.height + 5 && option.y + option.height + 5 > other.y
        ))) ?? options[0];
        occupied.push(position);
        label.style.left = `${position.x}px`;
        label.style.top = `${position.y}px`;
      });
      renderer.render(scene, camera);
    };
    const shouldAnimate = () => visible && !document.hidden && !latestRef.current.still && !reducedMotion.matches;
    const tick = (time: number) => {
      animationFrame = 0;
      if (!shouldAnimate() || disposed) return;
      const delta = previousTime ? Math.min((time - previousTime) / 1000, 0.05) : 0;
      previousTime = time;
      network.rotation.y += delta * 0.028;
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
    controls.addEventListener('change', render);

    const resize = () => {
      width = Math.max(1, container.clientWidth);
      height = Math.max(1, container.clientHeight);
      camera.aspect = width / height;
      camera.position.setLength(width / height < 1.25 ? 8.6 : 6.15);
      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      refresh();
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    const visibilityObserver = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      refresh();
    }, { threshold: 0.01 });
    visibilityObserver.observe(container);
    document.addEventListener('visibilitychange', refresh);
    reducedMotion.addEventListener('change', refresh);

    const raycaster = new THREE.Raycaster();
    const pointerStart = { x: 0, y: 0 };
    const pointerDown = (event: PointerEvent) => {
      pointerStart.x = event.clientX;
      pointerStart.y = event.clientY;
    };
    const pointerUp = (event: PointerEvent) => {
      if (Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y) > 5) return;
      const bounds = renderer.domElement.getBoundingClientRect();
      const pointer = new THREE.Vector2((event.clientX - bounds.left) / bounds.width * 2 - 1, -(event.clientY - bounds.top) / bounds.height * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(personMeshes.map(({ mesh }) => mesh))[0];
      if (hit) latestRef.current.onSelect(hit.object.userData.personId as string);
    };
    const contextLost = (event: Event) => {
      event.preventDefault();
      visible = false;
      cancelAnimationFrame(animationFrame);
      setWebglReady(false);
    };
    renderer.domElement.addEventListener('pointerdown', pointerDown);
    renderer.domElement.addEventListener('pointerup', pointerUp);
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    resize();
    setWebglReady(true);

    return () => {
      disposed = true;
      refreshRef.current = () => {};
      cancelAnimationFrame(animationFrame);
      resizeObserver.disconnect();
      visibilityObserver.disconnect();
      document.removeEventListener('visibilitychange', refresh);
      reducedMotion.removeEventListener('change', refresh);
      controls.removeEventListener('change', render);
      controls.dispose();
      renderer.domElement.removeEventListener('pointerdown', pointerDown);
      renderer.domElement.removeEventListener('pointerup', pointerUp);
      renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      resources.forEach((resource) => resource.dispose());
      renderer.dispose();
      renderer.forceContextLoss();
      renderer.domElement.remove();
    };
  }, [signature]);

  useEffect(() => { refreshRef.current(); }, [selectedId, activeGroup, still, zoom, webglReady]);

  return (
    <div ref={containerRef} className={`atlas-root ${webglReady ? 'atlas-ready' : ''}`} aria-label="Interactive campus network">
      <div className="atlas-atmosphere" aria-hidden="true" />
      <div ref={canvasMountRef} className="atlas-canvas" />
      {!webglReady && <StaticAtlas people={people} selectedId={selectedId} onSelect={onSelect} activeGroup={activeGroup} gradientId={gradientId} />}
      {webglReady && <div className="atlas-labels">
        {displayedPeople.map((person) => <button
          key={person.id}
          ref={(element) => {
            if (element) labelsRef.current.set(person.id, element);
            else labelsRef.current.delete(person.id);
          }}
          type="button"
          className={`atlas-person ${selectedId === person.id ? 'atlas-person-selected' : ''}`}
          onClick={() => onSelect(person.id)}
          aria-label={`Explore ${person.name}'s connections`}
          aria-pressed={selectedId === person.id}
        >
          <span className="atlas-person-initials" style={{ color: GROUP_COLORS[person.group % GROUP_COLORS.length] }}>{person.initials}</span>
          <span>{personLabel(person, people)}</span>
          {selectedId === person.id && <span className="atlas-person-dot" aria-hidden="true" />}
        </button>)}
      </div>}
    </div>
  );
}

export default NetworkAtlas;
