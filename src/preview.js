import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export class Preview {
  constructor(element) {
    this.element = element;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color("#141e23");
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 10000);
    this.camera.position.set(110, 65, 280);
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true,
    });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    element.appendChild(this.renderer.domElement);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.scene.add(new THREE.HemisphereLight(0xfff4df, 0x526573, 2.8));
    const light = new THREE.DirectionalLight(0xffffff, 3);
    light.position.set(-80, 150, 200);
    this.scene.add(light);
    this.grid = new THREE.GridHelper(500, 25, 0x42555a, 0x23373d);
    this.grid.position.y = -52;
    this.scene.add(this.grid);
    new ResizeObserver(() => {
      const w = element.clientWidth,
        h = element.clientHeight;
      this.renderer.setSize(w, h);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
    }).observe(element);
    this.renderer.setAnimationLoop(() => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
    });
  }
  update(data, reset = false) {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.positions, 3));
    g.setAttribute("color", new THREE.BufferAttribute(data.colors, 3));
    g.setIndex(new THREE.BufferAttribute(data.indices, 1));
    g.computeVertexNormals();
    g.computeBoundingBox();
    this.mesh = new THREE.Mesh(
      g,
      new THREE.MeshStandardMaterial({
        color: 0xeee4ce,
        roughness: 0.8,
        metalness: 0,
        side: THREE.DoubleSide,
      }),
    );
    this.scene.add(this.mesh);
    this.setMode(this.mode || "solid");
    this.grid.position.y = g.boundingBox.min.y - 1;
    if (reset) this.reset();
  }
  setMode(mode) {
    this.mode = mode;
    if (!this.mesh) return;
    this.mesh.material.dispose();
    this.mesh.material =
      mode === "light"
        ? new THREE.MeshBasicMaterial({
            vertexColors: true,
            side: THREE.DoubleSide,
          })
        : new THREE.MeshStandardMaterial({
            color: 0xddd2bc,
            roughness: 0.8,
            metalness: 0,
            side: THREE.DoubleSide,
            wireframe: mode === "wire",
          });
  }
  reset() {
    if (!this.mesh) return;
    const box = this.mesh.geometry.boundingBox,
      center = box.getCenter(new THREE.Vector3()),
      size = box.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(center);
    this.camera.position
      .copy(center)
      .add(new THREE.Vector3(size * 0.32, size * 0.16, size * 1.7));
    this.controls.update();
  }
  front() {
    if (!this.mesh) return;
    const b = this.mesh.geometry.boundingBox,
      c = b.getCenter(new THREE.Vector3()),
      size = b.getSize(new THREE.Vector3()).length();
    this.controls.target.copy(c);
    this.camera.position.copy(c).add(new THREE.Vector3(0, 0, size * 1.8));
    this.controls.update();
  }
}
