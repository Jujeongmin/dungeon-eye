import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { ModelLibrary } from "../game/assets/ModelLibrary";
import { publicUrl } from "../game/assets/publicUrl";

// Development viewer for picking art: open the game with ?gallery in the address.
export function galleryEnabled(): boolean {
  return import.meta.env.DEV && new URLSearchParams(window.location.search).has("gallery");
}

interface Shown { name: string; size: THREE.Vector3; triangles: number }

export function ModelGallery() {
  const host = useRef<HTMLDivElement>(null);
  const [names, setNames] = useState<string[]>([]);
  const [current, setCurrent] = useState<string | null>(null);
  const [shown, setShown] = useState<Shown | null>(null);
  const show = useRef<((name: string) => Promise<void>) | null>(null);

  useEffect(() => {
    const container = host.current!;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    container.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a1714);
    scene.add(new THREE.HemisphereLight(0xcfc6bb, 0x2a2018, 1.4));
    const sun = new THREE.DirectionalLight(0xffffff, 2);
    sun.position.set(3, 6, 4);
    scene.add(sun);
    const grid = new THREE.GridHelper(20, 20, 0x665544, 0x332a22);
    scene.add(grid);
    const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 200);
    camera.position.set(4, 3, 5);
    const controls = new OrbitControls(camera, renderer.domElement);
    let model: THREE.Object3D | null = null;
    let library: ModelLibrary | null = null;
    let frame = 0;

    const resize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    show.current = async (name: string) => {
      library ??= await ModelLibrary.load();
      await library.preload([name]);
      if (model) scene.remove(model);
      model = library.instance(name);
      scene.add(model);
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const centre = box.getCenter(new THREE.Vector3());
      let triangles = 0;
      model.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (mesh.isMesh) triangles += (mesh.geometry.index?.count ?? mesh.geometry.attributes.position.count) / 3;
      });
      controls.target.copy(centre);
      const reach = Math.max(size.x, size.y, size.z, 0.5);
      camera.position.copy(centre).add(new THREE.Vector3(reach, reach * 0.7, reach * 1.2));
      setShown({ name, size, triangles });
    };

    void fetch(publicUrl("assets/models/manifest.json"))
      .then((r) => r.json())
      .then((m: { models: Record<string, unknown> }) => setNames(Object.keys(m.models).sort()));

    const tick = () => {
      frame = requestAnimationFrame(tick);
      controls.update();
      renderer.render(scene, camera);
    };
    tick();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    if (current) void show.current?.(current);
  }, [current]);

  return (
    <div className="app gallery" ref={host}>
      <div className="gallery-list">
        <strong>모델 보기</strong>
        {names.map((n) => (
          <button key={n} type="button" className={n === current ? "on" : ""} onClick={() => setCurrent(n)}>{n}</button>
        ))}
      </div>
      {shown && (
        <div className="gallery-info">
          {shown.name} · 크기 {shown.size.x.toFixed(2)} × {shown.size.y.toFixed(2)} × {shown.size.z.toFixed(2)} m (격자 1칸 = 1m) · 삼각형 {Math.round(shown.triangles)}
        </div>
      )}
    </div>
  );
}
