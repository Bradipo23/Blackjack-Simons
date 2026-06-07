// three-table.js - 3D Casino Blackjack Table Engine (Three.js)

let scene, camera, renderer, container;
const dealerCardsMesh = [];
const playerCardsMesh = { 1: [], 2: [], 3: [], 4: [] };
const playerBetsMesh = { 1: [], 2: [], 3: [], 4: [] };
const animatedObjects = [];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let cardBackTexture;

// 3D coordinates for seats
const SEAT_POSITIONS = {
    'dealer': new THREE.Vector3(0, 0.005, -1.3),
    1: new THREE.Vector3(-2.1, 0.005, 0.7),
    2: new THREE.Vector3(-0.7, 0.005, 1.1),
    3: new THREE.Vector3(0.7, 0.005, 1.1),
    4: new THREE.Vector3(2.1, 0.005, 0.7)
};

const BET_POSITIONS = {
    1: new THREE.Vector3(-1.3, 0.005, 0.1),
    2: new THREE.Vector3(-0.45, 0.005, 0.55),
    3: new THREE.Vector3(0.45, 0.005, 0.55),
    4: new THREE.Vector3(1.3, 0.005, 0.1)
};

// Initialize Three.js WebGL Scene
function init3DTable() {
    container = document.getElementById('three-canvas-container');
    if (!container) return;

    // Create scene
    scene = new THREE.Scene();

    // Create camera looking down at the table at an angle
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 4.4, 5.0);
    camera.lookAt(0, -0.4, 0);

    // Create WebGL Renderer with alpha channel for transparent background
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Spotlight pointing at table center for casino glow & shadows
    const spotLight = new THREE.SpotLight(0xfff6e0, 1.6);
    spotLight.position.set(0, 6, 2);
    spotLight.angle = Math.PI / 4;
    spotLight.penumbra = 0.6;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 1;
    spotLight.shadow.camera.far = 15;
    spotLight.shadow.bias = -0.002;
    scene.add(spotLight);

    // Directional helper light
    const dirLight = new THREE.DirectionalLight(0x95d3ba, 0.35); // subtle green table glow
    dirLight.position.set(-2, 3, -1);
    scene.add(dirLight);

    // Shadow receiver plane on table surface (invisible, shadows only)
    const shadowPlaneGeo = new THREE.PlaneGeometry(12, 10);
    const shadowPlaneMat = new THREE.ShadowMaterial({ opacity: 0.55 });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = 0;
    shadowPlane.receiveShadow = true;
    scene.add(shadowPlane);

    // Generate reusable card back texture
    cardBackTexture = createCardBackTexture();

    // Create 3D Shoe (Sabot) at top right
    const shoeGeo = new THREE.BoxGeometry(0.7, 0.35, 1.0);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1d1a16, roughness: 0.6, metalness: 0.1 });
    const shoeMesh = new THREE.Mesh(shoeGeo, shoeMat);
    shoeMesh.position.set(2.4, 0.175, -1.8);
    shoeMesh.rotation.set(-0.15, -0.45, -0.1);
    shoeMesh.castShadow = true;
    scene.add(shoeMesh);

    // Start render loop
    requestAnimationFrame(animateScene);

    // Listen for mousemove to handle hover raycasting
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
}

// Mouse move tracking
function onMouseMove(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function onWindowResize() {
    if (!container || !renderer) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}

// Main Render Loop & Animation Interpolation
function animateScene(time) {
    requestAnimationFrame(animateScene);

    const now = performance.now();
    
    // Process card deal animations
    for (let i = animatedObjects.length - 1; i >= 0; i--) {
        const anim = animatedObjects[i];
        if (now < anim.startTime) {
            anim.mesh.position.copy(anim.startPos);
            anim.mesh.rotation.copy(anim.startRot);
            anim.mesh.visible = false;
            continue;
        }
        
        anim.mesh.visible = true;
        const elapsed = now - anim.startTime;
        const t = Math.min(elapsed / anim.duration, 1);
        
        // Easing: easeOutQuart
        const easeT = 1 - Math.pow(1 - t, 4);
        
        anim.mesh.position.lerpVectors(anim.startPos, anim.targetPos, easeT);
        
        anim.mesh.rotation.x = anim.startRot.x + (anim.targetRot.x - anim.startRot.x) * easeT;
        anim.mesh.rotation.y = anim.startRot.y + (anim.targetRot.y - anim.startRot.y) * easeT;
        anim.mesh.rotation.z = anim.startRot.z + (anim.targetRot.z - anim.startRot.z) * easeT;
        
        if (t === 1) {
            animatedObjects.splice(i, 1);
        }
    }

    // Raycast hover logic for cards
    checkCardHover();

    // Render WebGL
    renderer.render(scene, camera);
}

// Hover Raycaster
function checkCardHover() {
    if (!renderer) return;
    raycaster.setFromCamera(mouse, camera);

    const allCards = [];
    dealerCardsMesh.forEach(m => allCards.push(m));
    for (let s = 1; s <= 4; s++) {
        playerCardsMesh[s].forEach(m => allCards.push(m));
    }

    const intersects = raycaster.intersectObjects(allCards);
    allCards.forEach(c => c.userData.isHovered = false);

    if (intersects.length > 0) {
        // Intersect only the top-most card under cursor
        intersects[0].object.userData.isHovered = true;
    }

    // Smoothly lift card up off table surface on hover
    allCards.forEach(card => {
        const targetLift = card.userData.isHovered ? 0.25 : 0;
        card.userData.currentLift = card.userData.currentLift || 0;
        card.userData.currentLift += (targetLift - card.userData.currentLift) * 0.15; // smooth lerp

        // Only apply if not currently in animation
        const anim = animatedObjects.find(a => a.mesh === card);
        if (!anim) {
            const zIndexOffset = card.userData.zIndex * 0.005;
            card.position.y = 0.008 + zIndexOffset + card.userData.currentLift;
            
            // Add slight Y/Z offsets to show lift relative to perspective camera
            const baseRotY = card.userData.baseRotY || 0;
            card.rotation.y = baseRotY + (card.userData.isHovered ? 0.04 : 0);
        }
    });
}

// Card deals animation triggers
function animateCardDeal(mesh, targetPos, targetRot, delay) {
    const startPos = new THREE.Vector3(2.4, 0.2, -1.8); // sabot coordinates
    const startRot = new THREE.Vector3(-Math.PI / 3, -Math.PI / 6, -Math.PI / 6); // shoe angle
    
    mesh.position.copy(startPos);
    mesh.rotation.copy(startRot);
    
    animatedObjects.push({
        mesh: mesh,
        startPos: startPos,
        startRot: startRot,
        targetPos: targetPos,
        targetRot: targetRot,
        startTime: performance.now() + delay,
        duration: 650
    });
}

// Generate Canvas texture for dynamic card faces
function createCardTexture(value, suit) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Gold filigree border
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    
    const isRed = ['H', 'D'].includes(suit);
    ctx.fillStyle = isRed ? '#ff4a4a' : '#131313';
    
    const suitSymbol = { H: '♥', D: '♦', C: '♣', S: '♠' }[suit] || '';
    
    // Font parameters
    ctx.font = 'bold 38px "Open Sans", sans-serif';
    ctx.fillText(value, 22, 55);
    ctx.font = '32px sans-serif';
    ctx.fillText(suitSymbol, 22, 95);
    
    // Rotated bottom corner
    ctx.save();
    ctx.translate(canvas.width - 22, canvas.height - 55);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 38px "Open Sans", sans-serif';
    ctx.fillText(value, 0, 0);
    ctx.font = '32px sans-serif';
    ctx.fillText(suitSymbol, 0, 40);
    ctx.restore();
    
    // Illustration in center
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    if (['J', 'Q', 'K'].includes(value)) {
        ctx.font = '100px sans-serif';
        let icon = '👑';
        if (value === 'J') icon = '🛡️';
        ctx.fillText(icon, -50, 32);
    } else if (value === 'A') {
        ctx.font = '115px sans-serif';
        ctx.fillText(suitSymbol, -58, 40);
    } else {
        ctx.font = '90px sans-serif';
        ctx.fillText(suitSymbol, -45, 30);
    }
    ctx.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

// Generate Canvas texture for geometric card backs
function createCardBackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    
    // Gold/Red gradients back texture
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 20, canvas.width/2, canvas.height/2, 240);
    grad.addColorStop(0, '#7b1d1d');
    grad.addColorStop(1, '#470b0b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Diamond lattice pattern
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = -100; i < canvas.width + 100; i += 24) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 384, 384);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i - 384, 384);
        ctx.stroke();
    }
    
    // White card border
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    
    // Gold inner border
    ctx.strokeStyle = 'rgba(212, 175, 55, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

// Mesh Instantiation
function createCardMesh(card, zIndex = 0) {
    const cardGeo = new THREE.BoxGeometry(0.68, 0.94, 0.012);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, roughness: 0.9 });
    
    let frontTex = (card.value === 'hidden') ? cardBackTexture : createCardTexture(card.value, card.suit);
    const frontMat = new THREE.MeshStandardMaterial({ map: frontTex, roughness: 0.25, metalness: 0.05 });
    const backMat = new THREE.MeshStandardMaterial({ map: cardBackTexture, roughness: 0.25, metalness: 0.05 });
    
    const materials = [
        sideMat, sideMat, sideMat, sideMat, // Right, Left, Top, Bottom
        frontMat, backMat // Front, Back
    ];
    
    const mesh = new THREE.Mesh(cardGeo, materials);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.userData = { value: card.value, suit: card.suit, zIndex: zIndex, isHovered: false };
    
    return mesh;
}

function updateCardMeshTexture(mesh, card) {
    if (mesh.userData.value !== card.value || mesh.userData.suit !== card.suit) {
        mesh.userData.value = card.value;
        mesh.userData.suit = card.suit;
        
        let frontTex = (card.value === 'hidden') ? cardBackTexture : createCardTexture(card.value, card.suit);
        // Clean old map
        if (mesh.material[4].map && mesh.material[4].map !== cardBackTexture) {
            mesh.material[4].map.dispose();
        }
        mesh.material[4].map = frontTex;
        mesh.material[4].needsUpdate = true;
    }
}

// API: Sync Dealer Cards in 3D
function updateDealerHand3D(hand) {
    if (!scene) return;
    const totalNew = hand.length;
    const totalCurrent = dealerCardsMesh.length;
    
    if (totalNew === 0) {
        dealerCardsMesh.forEach(m => scene.remove(m));
        dealerCardsMesh.length = 0;
        return;
    }
    
    const basePos = SEAT_POSITIONS['dealer'];
    const mid = (totalNew - 1) / 2;
    
    hand.forEach((card, index) => {
        let mesh;
        
        // Fan offset parameters
        const ta = (index - mid) * 0.05; // 3 degrees separation
        const tx = basePos.x + (index - mid) * 0.25; // spread offset
        const tz = basePos.z + Math.abs(index - mid) * 0.04;
        const zOffset = index * 0.005;
        
        const targetPos = new THREE.Vector3(tx, basePos.y + zOffset, tz);
        const targetRot = new THREE.Vector3(-Math.PI / 2, 0, ta); // Flat on XZ, rotated on Y/Z
        
        if (index < totalCurrent) {
            mesh = dealerCardsMesh[index];
            mesh.userData.zIndex = index;
            mesh.userData.baseRotY = ta;
            
            // Check if card is currently anim, redirect it
            const anim = animatedObjects.find(a => a.mesh === mesh);
            if (anim) {
                anim.targetPos.copy(targetPos);
                anim.targetRot.copy(targetRot);
            } else {
                mesh.position.copy(targetPos);
                mesh.rotation.copy(targetRot);
            }
            updateCardMeshTexture(mesh, card);
        } else {
            mesh = createCardMesh(card, index);
            mesh.userData.baseRotY = ta;
            scene.add(mesh);
            dealerCardsMesh.push(mesh);
            
            // Deal animation
            const delay = (index - totalCurrent) * 150;
            animateCardDeal(mesh, targetPos, targetRot, delay);
        }
    });
    
    // Clear extra cards
    if (totalCurrent > totalNew) {
        for (let i = totalNew; i < totalCurrent; i++) {
            scene.remove(dealerCardsMesh[i]);
        }
        dealerCardsMesh.length = totalNew;
    }
}

// API: Sync Player Cards in 3D
function updatePlayerHand3D(seat, hand) {
    if (!scene) return;
    const totalNew = hand.length;
    const totalCurrent = (playerCardsMesh[seat] || []).length;
    
    if (totalNew === 0) {
        if (playerCardsMesh[seat]) {
            playerCardsMesh[seat].forEach(m => scene.remove(m));
            playerCardsMesh[seat].length = 0;
        }
        return;
    }
    
    const basePos = SEAT_POSITIONS[seat];
    if (!basePos) return;
    
    const mid = (totalNew - 1) / 2;
    
    hand.forEach((card, index) => {
        let mesh;
        
        // Fan offset parameters (similar to physical fans)
        const ta = (index - mid) * 0.09; // 5 degrees fanning
        const tx = basePos.x + (index - mid) * 0.32; // fanning overlap
        const tz = basePos.z + Math.abs(index - mid) * 0.07;
        const zOffset = index * 0.005;
        
        const targetPos = new THREE.Vector3(tx, basePos.y + zOffset, tz);
        const targetRot = new THREE.Vector3(-Math.PI / 2, 0, ta);
        
        if (index < totalCurrent) {
            mesh = playerCardsMesh[seat][index];
            mesh.userData.zIndex = index;
            mesh.userData.baseRotY = ta;
            
            const anim = animatedObjects.find(a => a.mesh === mesh);
            if (anim) {
                anim.targetPos.copy(targetPos);
                anim.targetRot.copy(targetRot);
            } else {
                mesh.position.copy(targetPos);
                mesh.rotation.copy(targetRot);
            }
            updateCardMeshTexture(mesh, card);
        } else {
            mesh = createCardMesh(card, index);
            mesh.userData.baseRotY = ta;
            scene.add(mesh);
            playerCardsMesh[seat].push(mesh);
            
            // Deal animation
            const delay = (index - totalCurrent) * 150;
            animateCardDeal(mesh, targetPos, targetRot, delay);
        }
    });
    
    if (totalCurrent > totalNew) {
        for (let i = totalNew; i < totalCurrent; i++) {
            scene.remove(playerCardsMesh[seat][i]);
        }
        playerCardsMesh[seat].length = totalNew;
    }
}

// API: Sync Player Bet Stack in 3D (Physical stack)
function updatePlayerBet3D(seat, amount) {
    if (!scene) return;
    
    // Clear old bet meshes
    if (playerBetsMesh[seat]) {
        playerBetsMesh[seat].forEach(m => scene.remove(m));
        playerBetsMesh[seat].length = 0;
    } else {
        playerBetsMesh[seat] = [];
    }
    
    if (amount <= 0) return;
    
    let remaining = amount;
    const chipValues = [500, 100, 50, 25, 10];
    const chipsToRender = [];
    
    for (const val of chipValues) {
        while (remaining >= val) {
            chipsToRender.push(val);
            remaining -= val;
        }
    }
    
    const basePos = BET_POSITIONS[seat];
    if (!basePos) return;
    
    chipsToRender.slice(0, 8).forEach((val, index) => {
        const chipHeight = 0.024;
        const chipRadius = 0.17;
        const chipGeo = new THREE.CylinderGeometry(chipRadius, chipRadius, chipHeight, 32);
        
        const chipColors = {
            10: 0x3e8eff,  // Blue
            25: 0xe53935,  // Red
            50: 0x43a047,  // Green
            100: 0x1e1e1e, // Black
            500: 0x8e24aa  // Purple
        };
        
        const color = chipColors[val] || 0xffffff;
        const chipMat = new THREE.MeshStandardMaterial({
            color: color,
            roughness: 0.35,
            metalness: val === 100 ? 0.75 : 0.1, // make 100 chip slightly metallic/gold ringed
            bumpScale: 0.05
        });
        
        const mesh = new THREE.Mesh(chipGeo, chipMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Calculate stack vertical offset (Y axis is up)
        const yPos = basePos.y + index * (chipHeight + 0.002);
        mesh.position.set(basePos.x, yPos, basePos.z);
        
        scene.add(mesh);
        playerBetsMesh[seat].push(mesh);
    });
}
