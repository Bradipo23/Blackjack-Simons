// three-table.js - 3D Casino Blackjack Table Engine (Three.js)

let scene, camera, renderer, container;
const dealerCardsMesh = [];
const playerCardsMesh = { 1: [], 2: [], 3: [], 4: [] };
const playerBetsMesh = { 1: [], 2: [], 3: [], 4: [] };
const animatedObjects = [];

const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();
let cardBackTexture;
const chipTexturesCache = {};

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

    // Warm, dim saloon ambient light (lantern mood)
    const ambientLight = new THREE.AmbientLight(0xffedd5, 0.22);
    scene.add(ambientLight);

    // Heavy warm spotlight representing a hanging oil lantern above table center
    const spotLight = new THREE.SpotLight(0xffaa44, 2.8);
    spotLight.position.set(0, 5.0, 0.5);
    spotLight.angle = Math.PI / 3;
    spotLight.penumbra = 0.8;
    spotLight.castShadow = true;
    spotLight.shadow.mapSize.width = 1024;
    spotLight.shadow.mapSize.height = 1024;
    spotLight.shadow.camera.near = 1;
    spotLight.shadow.camera.far = 15;
    spotLight.shadow.bias = -0.001;
    scene.add(spotLight);

    // Subtle fill light (brass bounce glow)
    const dirLight = new THREE.DirectionalLight(0xcba258, 0.4);
    dirLight.position.set(-2, 3.5, 2);
    scene.add(dirLight);

    // 1. Table Felt Mesh (circular plane)
    const feltGeo = new THREE.CylinderGeometry(3.5, 3.5, 0.02, 64);
    const feltMat = new THREE.MeshStandardMaterial({
        color: 0x213d2b, // vintage dusty green felt
        roughness: 0.95,
        metalness: 0.05
    });
    const feltMesh = new THREE.Mesh(feltGeo, feltMat);
    feltMesh.position.y = -0.01;
    feltMesh.receiveShadow = true;
    scene.add(feltMesh);

    // 2. Torus for the rounded mahogany wood rail around the table
    const railGeo = new THREE.TorusGeometry(3.55, 0.15, 16, 100);
    const railMat = new THREE.MeshStandardMaterial({
        color: 0x3e2212, // dark mahogany wood
        roughness: 0.5,
        metalness: 0.1
    });
    const railMesh = new THREE.Mesh(railGeo, railMat);
    railMesh.rotation.x = Math.PI / 2;
    railMesh.position.y = 0.01;
    railMesh.castShadow = true;
    railMesh.receiveShadow = true;
    scene.add(railMesh);

    // Reusable card back texture
    cardBackTexture = createCardBackTexture();

    // Create 3D Shoe (Sabot) detailed wooden base + brass plate at top right
    const shoeGroup = new THREE.Group();

    // Wood base box
    const shoeBaseGeo = new THREE.BoxGeometry(0.65, 0.3, 0.95);
    const shoeBaseMat = new THREE.MeshStandardMaterial({ color: 0x3e2212, roughness: 0.45, metalness: 0.05 });
    const shoeBase = new THREE.Mesh(shoeBaseGeo, shoeBaseMat);
    shoeBase.castShadow = true;
    shoeGroup.add(shoeBase);

    // Brass front plate
    const brassPlateGeo = new THREE.BoxGeometry(0.67, 0.28, 0.08);
    const brassPlateMat = new THREE.MeshStandardMaterial({ color: 0xcba258, roughness: 0.15, metalness: 0.9 });
    const brassPlate = new THREE.Mesh(brassPlateGeo, brassPlateMat);
    brassPlate.position.set(0, 0.02, 0.45);
    brassPlate.castShadow = true;
    shoeGroup.add(brassPlate);

    shoeGroup.position.set(2.4, 0.15, -1.8);
    shoeGroup.rotation.set(-0.15, -0.45, -0.1);
    scene.add(shoeGroup);

    // Start render loop
    requestAnimationFrame(animateScene);

    // Listen for mousemove to handle hover raycasting
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('resize', onWindowResize);
}

// Mouse move tracking
function onMouseMove(event) {
    if (!renderer) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

// Window resize
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
    
    // Process card deal and repositioning animations
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
        intersects[0].object.userData.isHovered = true;
    }

    // Smoothly lift card up off table surface on hover
    allCards.forEach(card => {
        const targetLift = card.userData.isHovered ? 0.22 : 0;
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
        startPos: startPos.clone(),
        startRot: startRot.clone(),
        targetPos: targetPos.clone(),
        targetRot: targetRot.clone(),
        startTime: performance.now() + delay,
        duration: 650
    });
}

// Generate Canvas texture for dynamic card faces (Playfair Display & Warm Parchment)
function createCardTexture(value, suit) {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    
    // Background: warm vintage parchment
    ctx.fillStyle = '#f5eedc';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Gold/brass filigree double border
    ctx.strokeStyle = '#cba258';
    ctx.lineWidth = 4;
    ctx.strokeRect(8, 8, canvas.width - 16, canvas.height - 16);
    
    ctx.strokeStyle = 'rgba(203, 162, 88, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(14, 14, canvas.width - 28, canvas.height - 28);
    
    const isRed = ['H', 'D'].includes(suit);
    ctx.fillStyle = isRed ? '#cc3c3c' : '#221f1e';
    
    const suitSymbol = { H: '♥', D: '♦', C: '♣', S: '♠' }[suit] || '';
    
    // Font parameters - Playfair Display
    ctx.font = 'bold 36px "Playfair Display", Georgia, serif';
    ctx.fillText(value, 22, 54);
    ctx.font = '28px sans-serif';
    ctx.fillText(suitSymbol, 22, 90);
    
    // Rotated bottom corner
    ctx.save();
    ctx.translate(canvas.width - 22, canvas.height - 54);
    ctx.rotate(Math.PI);
    ctx.font = 'bold 36px "Playfair Display", Georgia, serif';
    ctx.fillText(value, 0, 0);
    ctx.font = '28px sans-serif';
    ctx.fillText(suitSymbol, 0, 36);
    ctx.restore();
    
    // Center illustration
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    if (['J', 'Q', 'K'].includes(value)) {
        ctx.font = '90px sans-serif';
        let icon = '👑';
        if (value === 'J') icon = '🤠'; // cowboy hat for Jack!
        ctx.fillText(icon, -45, 30);
    } else if (value === 'A') {
        ctx.font = '110px sans-serif';
        ctx.fillText(suitSymbol, -55, 38);
    } else {
        ctx.font = '85px sans-serif';
        ctx.fillText(suitSymbol, -42, 28);
    }
    ctx.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

// Generate Canvas texture for geometric card backs (Sheriff Star & Rich Red)
function createCardBackTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 384;
    const ctx = canvas.getContext('2d');
    
    // Radial gradient: rust red center to deep coffee brown
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, 20, canvas.width/2, canvas.height/2, 240);
    grad.addColorStop(0, '#912c2c');
    grad.addColorStop(1, '#240c0c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Diamond lattice pattern
    ctx.strokeStyle = 'rgba(203, 162, 88, 0.35)';
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
    
    // Warm parchment card border
    ctx.strokeStyle = '#f5eedc';
    ctx.lineWidth = 8;
    ctx.strokeRect(4, 4, canvas.width - 8, canvas.height - 8);
    
    // Gold inner border
    ctx.strokeStyle = 'rgba(203, 162, 88, 0.6)';
    ctx.lineWidth = 3;
    ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);
    
    // Draw Sheriff star in the center of card back
    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.fillStyle = '#cba258';
    
    ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1;
    ctx.shadowOffsetY = 1;
    
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        ctx.rotate(Math.PI / 4);
        ctx.lineTo(0, -20);
        ctx.rotate(Math.PI / 4);
        ctx.lineTo(0, -7);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    return texture;
}

// Canvas texture generator for premium chips
function getChipTexture(val, colorHex) {
    if (chipTexturesCache[val]) return chipTexturesCache[val];
    
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    
    // Base circle color
    ctx.fillStyle = colorHex;
    ctx.beginPath();
    ctx.arc(64, 64, 64, 0, Math.PI * 2);
    ctx.fill();
    
    // Outer gold rim
    ctx.strokeStyle = '#cba258';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(64, 64, 58, 0, Math.PI * 2);
    ctx.stroke();
    
    // Alternating dashes on the rim (poker chip dashes)
    ctx.strokeStyle = '#ebdcb9';
    ctx.lineWidth = 5;
    ctx.setLineDash([12, 16]);
    ctx.beginPath();
    ctx.arc(64, 64, 52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]); // Reset
    
    // Core circle
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.beginPath();
    ctx.arc(64, 64, 34, 0, Math.PI * 2);
    ctx.fill();
    
    // Gold text value
    ctx.fillStyle = '#ebdcb9';
    ctx.font = 'bold 24px "Playfair Display", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$' + val, 64, 64);
    
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    chipTexturesCache[val] = texture;
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
            
            // Correct position adjustments smoothly instead of wiggling/snapping
            const anim = animatedObjects.find(a => a.mesh === mesh);
            if (anim) {
                anim.targetPos.copy(targetPos);
                anim.targetRot.copy(targetRot);
            } else {
                const dist = mesh.position.distanceTo(targetPos);
                if (dist > 0.01) {
                    animatedObjects.push({
                        mesh: mesh,
                        startPos: mesh.position.clone(),
                        startRot: new THREE.Vector3(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z),
                        targetPos: targetPos.clone(),
                        targetRot: targetRot.clone(),
                        startTime: performance.now(),
                        duration: 250 // quick smooth correction
                    });
                } else {
                    mesh.position.copy(targetPos);
                    mesh.rotation.copy(targetRot);
                }
            }
            updateCardMeshTexture(mesh, card);
        } else {
            mesh = createCardMesh(card, index);
            mesh.userData.baseRotY = ta;
            scene.add(mesh);
            dealerCardsMesh.push(mesh);
            
            // Deal flight animation from sabot
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
            
            // Correct position adjustments smoothly instead of wiggling/snapping
            const anim = animatedObjects.find(a => a.mesh === mesh);
            if (anim) {
                anim.targetPos.copy(targetPos);
                anim.targetRot.copy(targetRot);
            } else {
                const dist = mesh.position.distanceTo(targetPos);
                if (dist > 0.01) {
                    animatedObjects.push({
                        mesh: mesh,
                        startPos: mesh.position.clone(),
                        startRot: new THREE.Vector3(mesh.rotation.x, mesh.rotation.y, mesh.rotation.z),
                        targetPos: targetPos.clone(),
                        targetRot: targetRot.clone(),
                        startTime: performance.now(),
                        duration: 250 // quick smooth correction
                    });
                } else {
                    mesh.position.copy(targetPos);
                    mesh.rotation.copy(targetRot);
                }
            }
            updateCardMeshTexture(mesh, card);
        } else {
            mesh = createCardMesh(card, index);
            mesh.userData.baseRotY = ta;
            scene.add(mesh);
            playerCardsMesh[seat].push(mesh);
            
            // Deal flight animation from sabot
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

// API: Sync Player Bet Stack in 3D (Physical textured coin stack)
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
            10: '#4a5568',  // Grey/Iron
            25: '#aa3838',  // Red/Copper
            50: '#2d5a3c',  // Green/Verdigris
            100: '#1a1919', // Charcoal/Brass
            500: '#6b2d5c'  // Plum/Gold
        };
        
        const colorHex = chipColors[val] || '#ffffff';
        const colorVal = new THREE.Color(colorHex);
        
        const sideMat = new THREE.MeshStandardMaterial({
            color: colorVal,
            roughness: 0.55,
            metalness: val === 100 || val === 500 ? 0.6 : 0.1
        });
        
        const faceTex = getChipTexture(val, colorHex);
        const faceMat = new THREE.MeshStandardMaterial({
            map: faceTex,
            roughness: 0.3,
            metalness: val === 100 || val === 500 ? 0.6 : 0.1
        });
        
        const materials = [sideMat, faceMat, faceMat]; // side, top, bottom
        
        const mesh = new THREE.Mesh(chipGeo, materials);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        
        // Calculate stack vertical offset (Y axis is up)
        const yPos = basePos.y + index * (chipHeight + 0.002);
        mesh.position.set(basePos.x, yPos, basePos.z);
        
        scene.add(mesh);
        playerBetsMesh[seat].push(mesh);
    });
}
