import React, { useEffect, useRef, useState, useImperativeHandle, forwardRef } from 'react';
import * as THREE from 'three';
import { Station, WaterQualityStatus } from '../types';

export interface GlobeViewRef {
  zoomIn: () => void;
  zoomOut: () => void;
  resetRotation: () => void;
  toggleLayers: () => void;
  focusCoordinates: (lat: number, lon: number) => void;
}

interface GlobeViewProps {
  stations: Station[];
  onSelectStation: (stationId: string) => void;
  activeStationId?: string;
}

const STATUS_COLORS: Record<WaterQualityStatus, string> = {
  excellent: '#adcebd', // Sage/Primary
  good: '#b2d094',      // Secondary
  moderate: '#efbc98',  // Tertiary
  poor: '#8C5E45',      // Terracotta
  severe: '#ffb4ab',    // Error
};

export const GlobeView = forwardRef<GlobeViewRef, GlobeViewProps>(({
  stations,
  onSelectStation,
  activeStationId,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoveredStation, setHoveredStation] = useState<Station | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const earthRef = useRef<THREE.Mesh | null>(null);
  const wireframeRef = useRef<THREE.Mesh | null>(null);
  const markersGroupRef = useRef<THREE.Group | null>(null);

  useImperativeHandle(ref, () => ({
    zoomIn: () => {
      if (cameraRef.current) {
        cameraRef.current.position.z = Math.max(cameraRef.current.position.z - 35, 130);
      }
    },
    zoomOut: () => {
      if (cameraRef.current) {
        cameraRef.current.position.z = Math.min(cameraRef.current.position.z + 35, 400);
      }
    },
    resetRotation: () => {
      if (earthRef.current && wireframeRef.current && markersGroupRef.current && cameraRef.current) {
        earthRef.current.rotation.set(0, 0, 0);
        wireframeRef.current.rotation.set(0, 0, 0);
        markersGroupRef.current.rotation.set(0, 0, 0);
        cameraRef.current.position.z = 240;
      }
    },
    toggleLayers: () => {
      if (wireframeRef.current) {
        wireframeRef.current.visible = !wireframeRef.current.visible;
      }
    },
    focusCoordinates: (lat: number, lon: number) => {
      if (earthRef.current && wireframeRef.current && markersGroupRef.current) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = (lon + 180) * (Math.PI / 180);
        const rotY = -(theta - Math.PI);
        const rotX = phi - Math.PI / 2;

        earthRef.current.rotation.set(rotX, rotY, 0);
        wireframeRef.current.rotation.set(rotX, rotY, 0);
        markersGroupRef.current.rotation.set(rotX, rotY, 0);
      }
    },
  }));

  useEffect(() => {
    if (!containerRef.current || !canvasRef.current) return;

    const container = containerRef.current;
    const canvas = canvasRef.current;
    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    // 1. Scene, Camera, Renderer
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    camera.position.z = 240;
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    // 2. Earth Sphere
    const radius = 80;
    const sphereGeometry = new THREE.SphereGeometry(radius, 64, 64);

    const earthMaterial = new THREE.MeshPhongMaterial({
      color: 0x183025,
      emissive: 0x0f241a,
      specular: 0x4a8c70,
      shininess: 25,
      wireframe: false,
      transparent: true,
      opacity: 0.95,
    });
    const earth = new THREE.Mesh(sphereGeometry, earthMaterial);
    scene.add(earth);
    earthRef.current = earth;

    // 3. Grid Lines Wireframe
    const wireframeGeometry = new THREE.SphereGeometry(radius + 0.2, 32, 24);
    const wireframeMaterial = new THREE.MeshBasicMaterial({
      color: 0xadcebd,
      wireframe: true,
      transparent: true,
      opacity: 0.18,
    });
    const wireframe = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    scene.add(wireframe);
    wireframeRef.current = wireframe;

    // 4. Atmosphere Glow Outer Ring
    const atmosphereGeometry = new THREE.SphereGeometry(radius + 4, 32, 32);
    const atmosphereMaterial = new THREE.MeshBasicMaterial({
      color: 0xadcebd,
      side: THREE.BackSide,
      transparent: true,
      opacity: 0.2,
    });
    const atmosphere = new THREE.Mesh(atmosphereGeometry, atmosphereMaterial);
    scene.add(atmosphere);

    // 5. Lighting
    const ambientLight = new THREE.AmbientLight(0xd9e2dc, 1.1);
    scene.add(ambientLight);

    const dirLight1 = new THREE.DirectionalLight(0xadcebd, 1.5);
    dirLight1.position.set(150, 100, 150);
    scene.add(dirLight1);

    const dirLight2 = new THREE.DirectionalLight(0x8C5E45, 0.6);
    dirLight2.position.set(-150, -100, -150);
    scene.add(dirLight2);

    // Helper: Convert Lat/Long to 3D Coordinates
    const latLongToVector3 = (lat: number, lon: number, radiusOffset = 0.5) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const theta = (lon + 180) * (Math.PI / 180);

      const x = -(radius + radiusOffset) * Math.sin(phi) * Math.cos(theta);
      const z = (radius + radiusOffset) * Math.sin(phi) * Math.sin(theta);
      const y = (radius + radiusOffset) * Math.cos(phi);

      return new THREE.Vector3(x, y, z);
    };

    // 6. Station Markers Group
    const markersGroup = new THREE.Group();
    scene.add(markersGroup);
    markersGroupRef.current = markersGroup;

    const stationMeshes: { mesh: THREE.Mesh; station: Station }[] = [];

    stations.forEach(station => {
      const colorHex = STATUS_COLORS[station.status] || '#adcebd';
      const isSelected = station.station_id === activeStationId;

      const markerGeo = new THREE.SphereGeometry(isSelected ? 2.8 : 2.0, 16, 16);
      const markerMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
      });
      const markerMesh = new THREE.Mesh(markerGeo, markerMat);

      const pos = latLongToVector3(station.latitude, station.longitude, 1.2);
      markerMesh.position.copy(pos);

      // Add a subtle pulsating outer ring sprite/mesh
      const ringGeo = new THREE.RingGeometry(2.5, 3.8, 24);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.4,
      });
      const ringMesh = new THREE.Mesh(ringGeo, ringMat);
      ringMesh.position.copy(pos);
      ringMesh.lookAt(0, 0, 0);

      markersGroup.add(markerMesh);
      markersGroup.add(ringMesh);

      stationMeshes.push({ mesh: markerMesh, station });
    });

    // 7. Raycasting for hover / click
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let isMouseDown = false;
    let previousMousePosition = { x: 0, y: 0 };

    const onPointerDown = (e: MouseEvent) => {
      isMouseDown = true;
      previousMousePosition = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;

      mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      if (isMouseDown) {
        const deltaX = e.clientX - previousMousePosition.x;
        const deltaY = e.clientY - previousMousePosition.y;

        earth.rotation.y += deltaX * 0.005;
        earth.rotation.x += deltaY * 0.005;
        wireframe.rotation.y += deltaX * 0.005;
        wireframe.rotation.x += deltaY * 0.005;
        markersGroup.rotation.y += deltaX * 0.005;
        markersGroup.rotation.x += deltaY * 0.005;

        previousMousePosition = { x: e.clientX, y: e.clientY };
        setHoveredStation(null);
        return;
      }

      // Check intersections
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(stationMeshes.map(s => s.mesh));

      if (intersects.length > 0) {
        const hit = stationMeshes.find(s => s.mesh === intersects[0].object);
        if (hit) {
          setHoveredStation(hit.station);
          setTooltipPos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
          canvas.style.cursor = 'pointer';
          return;
        }
      }

      setHoveredStation(null);
      canvas.style.cursor = 'grab';
    };

    const onPointerUp = (e: MouseEvent) => {
      if (isMouseDown) {
        const deltaX = Math.abs(e.clientX - previousMousePosition.x);
        const deltaY = Math.abs(e.clientY - previousMousePosition.y);
        if (deltaX < 3 && deltaY < 3) {
          raycaster.setFromCamera(mouse, camera);
          const intersects = raycaster.intersectObjects(stationMeshes.map(s => s.mesh));
          if (intersects.length > 0) {
            const hit = stationMeshes.find(s => s.mesh === intersects[0].object);
            if (hit) {
              onSelectStation(hit.station.station_id);
            }
          }
        }
      }
      isMouseDown = false;
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      camera.position.z = Math.min(Math.max(camera.position.z + e.deltaY * 0.1, 130), 400);
    };

    canvas.addEventListener('mousedown', onPointerDown);
    window.addEventListener('mousemove', onPointerMove);
    window.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // Robust Resize Handler preventing 0 / NaN camera aspects
    const handleResize = () => {
      if (!containerRef.current) return;
      const w = containerRef.current.clientWidth || 800;
      const h = containerRef.current.clientHeight || 600;
      if (w > 0 && h > 0) {
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    window.addEventListener('resize', handleResize);
    handleResize(); // Trigger immediate initial sizing

    // Animation Loop
    let animationFrameId: number;
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (!isMouseDown) {
        earth.rotation.y += 0.0012;
        wireframe.rotation.y += 0.0012;
        markersGroup.rotation.y += 0.0012;
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      canvas.removeEventListener('mousedown', onPointerDown);
      window.removeEventListener('mousemove', onPointerMove);
      window.removeEventListener('mouseup', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
    };
  }, [stations, activeStationId]);

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full cursor-grab active:cursor-grabbing min-h-[300px]" />

      {/* Floating Station Hover Tooltip */}
      {hoveredStation && (
        <div
          className="absolute z-50 glass-panel rounded-2xl p-4 border border-primary/20 shadow-2xl pointer-events-none max-w-xs transition-all transform -translate-x-1/2 -translate-y-full mb-3"
          style={{ left: tooltipPos.x, top: tooltipPos.y }}
        >
          <div className="flex justify-between items-center mb-1">
            <span className="font-label-caps text-[10px] text-primary uppercase font-bold tracking-widest">
              {hoveredStation.source.toUpperCase()} NODE
            </span>
            <span
              className="px-2 py-0.5 text-[10px] rounded-full font-bold uppercase tracking-wider text-black"
              style={{ backgroundColor: STATUS_COLORS[hoveredStation.status] }}
            >
              {hoveredStation.status}
            </span>
          </div>
          <h4 className="font-headline-lg-mobile text-sm text-white font-bold leading-tight">
            {hoveredStation.name}
          </h4>
          <p className="font-body-sm text-xs text-outline-variant mb-2">
            {hoveredStation.country} • {hoveredStation.water_body_type}
          </p>
          <div className="grid grid-cols-2 gap-2 text-xs border-t border-primary/10 pt-2 font-label-caps">
            <div>
              <span className="text-outline-variant block">DO:</span>
              <span className="text-white font-bold">
                {hoveredStation.latest_readings.find(r => r.parameter === 'dissolved_oxygen_mg_l')?.value || '--'} mg/L
              </span>
            </div>
            <div>
              <span className="text-outline-variant block">Temp:</span>
              <span className="text-white font-bold">
                {hoveredStation.latest_readings.find(r => r.parameter === 'temperature_c')?.value || '--'} °C
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

GlobeView.displayName = 'GlobeView';

export default GlobeView;
