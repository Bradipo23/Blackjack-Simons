// client.js - Royal Casino Blackjack Client
let socket;
let myId = null;
let myRoomCode = null;
let mySeat = null;
let currentBet = 0;
let roomState = null;
let audioCtx = null;

// DOM Elements
const lobbyScreen = document.getElementById('lobby-screen');
const tableScreen = document.getElementById('table-screen');
const playerNameInput = document.getElementById('player-name');
const roomCodeInput = document.getElementById('room-code-input');
const btnCreateRoom = document.getElementById('btn-create-room');
const btnJoinRoom = document.getElementById('btn-join-room');
const btnLeaveRoom = document.getElementById('btn-leave-room');
const lobbyError = document.getElementById('lobby-error');

const roomCodeDisplay = document.getElementById('room-code-display');
const gameStatusMsg = document.getElementById('game-status-msg');
const dealerCards = document.getElementById('dealer-cards');
const dealerScoreBadge = document.getElementById('dealer-score-badge');

const bettingControls = document.getElementById('betting-controls');
const gameplayControls = document.getElementById('gameplay-controls');
const lobbyControls = document.getElementById('lobby-controls');
const btnStartGame = document.getElementById('btn-start-game');
const btnPlaceBet = document.getElementById('btn-place-bet');
const btnClearBet = document.getElementById('btn-clear-bet');
const currentBetVal = document.getElementById('current-bet-val');

const btnHit = document.getElementById('btn-action-hit');
const btnStand = document.getElementById('btn-action-stand');
const btnDouble = document.getElementById('btn-action-double');

// Suit Symbols Mapping
const SUIT_SYMBOLS = { H: '♥', D: '♦', C: '♣', S: '♠' };
const SUIT_NAMES = { H: 'red', D: 'red', C: 'black', S: 'black' };

// Initialize Sound Synthesis
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
}

// Chip sound (Metallic clink)
function playChipSound() {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = 'sine';
    osc.frequency.setValueAtTime(2500, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1500, audioCtx.currentTime + 0.08);
    
    gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.08);
}

// Card sound (slide and snap)
function playCardSound() {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.12;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;
    
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, audioCtx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.12);
    
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);
    noise.start();
}

// Win sound (Happy chime)
function playWinSound() {
    if (!audioCtx) return;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio
    notes.forEach((freq, i) => {
        setTimeout(() => {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sine';
            osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.25);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 0.25);
        }, i * 80);
    });
}

// Connect to WS server
function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
        console.log('Connected to server');
    };
    
    socket.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        switch (data.type) {
            case 'room_joined':
                myRoomCode = data.roomCode;
                myId = data.playerId;
                mySeat = data.seat;
                lobbyScreen.style.display = 'none';
                tableScreen.style.display = 'flex';
                roomCodeDisplay.innerText = myRoomCode;
                break;
                
            case 'room_state':
                renderState(data.room);
                break;
                
            case 'error':
                lobbyError.innerText = data.message;
                break;
        }
    };
    
    socket.onclose = () => {
        console.log('Disconnected from server');
        lobbyScreen.style.display = 'flex';
        tableScreen.style.display = 'none';
    };
}

// Lobby actions
btnCreateRoom.addEventListener('click', () => {
    initAudio();
    const name = playerNameInput.value.trim() || 'Player 1';
    if (socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'create_room', playerName: name }));
    }
});

btnJoinRoom.addEventListener('click', () => {
    initAudio();
    const name = playerNameInput.value.trim() || 'Giocatore';
    const code = roomCodeInput.value.trim();
    if (code.length === 4 && socket && socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'join_room', roomCode: code, playerName: name }));
    } else {
        lobbyError.innerText = 'Inserisci un codice a 4 cifre';
    }
});

btnLeaveRoom.addEventListener('click', () => {
    if (socket) {
        socket.close();
        // Reconnect so lobby is active
        connect();
    }
});

// Betting actions
document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
        playChipSound();
        const val = parseInt(chip.getAttribute('data-value'));
        currentBet += val;
        currentBetVal.innerText = `$${currentBet}`;
    });
});

btnClearBet.addEventListener('click', () => {
    currentBet = 0;
    currentBetVal.innerText = `$0`;
});

btnPlaceBet.addEventListener('click', () => {
    if (currentBet <= 0) return;
    socket.send(JSON.stringify({ type: 'place_bet', betAmount: currentBet }));
});

btnStartGame.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'start_round' }));
});

// In-game decisions
btnHit.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'action', actionType: 'hit' }));
});

btnStand.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'action', actionType: 'stand' }));
});

btnDouble.addEventListener('click', () => {
    socket.send(JSON.stringify({ type: 'action', actionType: 'double' }));
});

// Render the synced game state from server
let prevDealerCardCount = 0;
let prevPlayerCardCounts = {};

function renderState(room) {
    roomState = room.state;
    
    // Status text
    updateStatusMessage(room);

    // Render Dealer
    renderDealerHand(room);

    // Render 4 Player Slots
    renderPlayerSlots(room);

    // Update controls visibilities
    updateControlsVisibility(room);
}

function updateStatusMessage(room) {
    if (room.state === 'lobby') {
        gameStatusMsg.innerText = 'In attesa dei giocatori...';
    } else if (room.state === 'betting') {
        // Find if local player has placed bet
        const me = room.players.find(p => p.id === myId);
        if (me && me.bet > 0) {
            gameStatusMsg.innerText = 'In attesa delle scommesse altrui...';
        } else {
            gameStatusMsg.innerText = 'Fai la tua puntata!';
        }
    } else if (room.state === 'player_turn') {
        const active = room.players.find(p => p.seat === room.activeSeat);
        if (active) {
            const timerSuffix = room.timer !== undefined && room.timer !== null ? ` (${room.timer}s)` : '';
            if (active.id === myId) {
                gameStatusMsg.innerText = `È il tuo turno! Scegli la mossa.${timerSuffix}`;
            } else {
                gameStatusMsg.innerText = `Turno di ${active.name}...${timerSuffix}`;
            }
        }
    } else if (room.state === 'dealer_turn') {
        gameStatusMsg.innerText = 'Il Banco gioca le sue carte...';
    } else if (room.state === 'round_over') {
        gameStatusMsg.innerText = 'Mano terminata. Confronto punteggi...';
    }
}

function renderDealerHand(room) {
    // Check if new card was dealt to play card deal sound
    if (room.dealerHand.length > prevDealerCardCount) {
        if (roomState !== 'lobby') playCardSound();
        prevDealerCardCount = room.dealerHand.length;
    } else if (room.dealerHand.length === 0) {
        prevDealerCardCount = 0;
    }

    dealerCards.innerHTML = '';
    const totalDealerCards = room.dealerHand.length;
    room.dealerHand.forEach((card, index) => {
        const cardEl = createCardElement(card, 'dealer');
        // Do not animate previous dealer cards unless we are dealing the initial round
        if (room.state !== 'dealing' && index < totalDealerCards - 1) {
            cardEl.classList.add('no-deal-animate');
        }
        
        let tx = 0;
        let ta = 0;
        
        // Fan out the dealer's cards slightly for a natural look!
        if (totalDealerCards > 1) {
            const mid = (totalDealerCards - 1) / 2;
            ta = (index - mid) * 4; // subtle 4 degrees separation
            tx = (index - mid) * 12; // spread
            cardEl.style.marginLeft = '0px';
        }
        
        cardEl.style.setProperty('--target-x', `${tx}px`);
        cardEl.style.setProperty('--target-y', '0px');
        cardEl.style.setProperty('--target-angle', `${ta}deg`);
        cardEl.style.transform = `translateX(${tx}px) rotate(${ta}deg)`;
        
        dealerCards.appendChild(cardEl);
    });
    
    if (room.dealerHand.length > 0) {
        dealerScoreBadge.style.display = 'block';
        dealerScoreBadge.innerText = room.dealerScore;
    } else {
        dealerScoreBadge.style.display = 'none';
    }
}

function renderPlayerSlots(room) {
    // Initialize list of slots
    for (let s = 1; s <= 4; s++) {
        const slot = document.getElementById(`slot-${s}`);
        const emptyEl = slot.querySelector('.slot-empty');
        const cardEl = slot.querySelector('.slot-player-card');
        
        // Find player in this seat
        const p = room.players.find(player => player.seat === s);
        
        if (!p) {
            emptyEl.style.display = 'flex';
            cardEl.style.display = 'none';
            delete prevPlayerCardCounts[s];
        } else {
            emptyEl.style.display = 'none';
            cardEl.style.display = 'flex';
            
            // Highlight active player
            if (room.state === 'player_turn' && room.activeSeat === s) {
                cardEl.classList.add('active-turn');
            } else {
                cardEl.classList.remove('active-turn');
            }

            // Fill text
            cardEl.querySelector('.player-name').innerText = p.name + (p.id === myId ? ' (Tu)' : '');
            cardEl.querySelector('.player-chips').innerText = `$${p.chips}`;
            
            // Bet Display (3D Stacked Chips)
            const betArea = cardEl.querySelector('.player-bet-area');
            if (p.bet > 0) {
                betArea.style.display = 'flex';
                betArea.querySelector('.bet-value-badge').innerText = `$${p.bet}`;
                betArea.querySelector('.chip-stack-container').innerHTML = getChipStackHTML(p.bet);
            } else {
                betArea.style.display = 'none';
            }

            // Sound check for dealt cards
            if (p.hand.length > (prevPlayerCardCounts[s] || 0)) {
                if (roomState !== 'lobby') playCardSound();
                prevPlayerCardCounts[s] = p.hand.length;
            } else if (p.hand.length === 0) {
                prevPlayerCardCounts[s] = 0;
            }

            // Render hand
            const handLayout = cardEl.querySelector('.cards-layout');
            handLayout.innerHTML = '';
            
            const totalCards = p.hand.length;
            p.hand.forEach((card, index) => {
                const cardEl = createCardElement(card, 'player', s);
                
                // Disable deal animation for cards already in hand
                if (index < totalCards - 1) {
                    cardEl.classList.add('no-deal-animate');
                }
                
                let tx = 0;
                let ty = 0;
                let ta = 0;
                
                // Apply fan rotation/offset to simulate holding cards in hand physically
                if (totalCards > 1) {
                    const mid = (totalCards - 1) / 2;
                    ta = (index - mid) * 8; // 8 degrees separation
                    ty = Math.abs(index - mid) * 4; // curved vertical arc offset
                    tx = (index - mid) * 15; // horizontal overlap spread offset
                    
                    cardEl.style.marginLeft = '0px'; // override overlapping margin
                }
                
                cardEl.style.setProperty('--target-x', `${tx}px`);
                cardEl.style.setProperty('--target-y', `${ty}px`);
                cardEl.style.setProperty('--target-angle', `${ta}deg`);
                
                cardEl.style.transform = `translateX(${tx}px) translateY(${ty}px) rotate(${ta}deg)`;
                
                handLayout.appendChild(cardEl);
            });

            // Timer bar rendering
            let timerContainer = cardEl.querySelector('.timer-container');
            if (!timerContainer) {
                timerContainer = document.createElement('div');
                timerContainer.className = 'timer-container';
                timerContainer.innerHTML = '<div class="timer-bar"></div>';
                cardEl.appendChild(timerContainer);
            }

            if (room.state === 'player_turn' && room.activeSeat === s && room.timer !== undefined && room.timer !== null) {
                timerContainer.style.display = 'block';
                const timerBar = timerContainer.querySelector('.timer-bar');
                const pct = (room.timer / 20) * 100;
                timerBar.style.width = `${pct}%`;
                if (room.timer <= 5) {
                    timerBar.style.backgroundColor = '#ff4a4a';
                } else {
                    timerBar.style.backgroundColor = 'var(--gold)';
                }
            } else {
                timerContainer.style.display = 'none';
            }

            // Score Badge
            const scoreEl = cardEl.querySelector('.score-badge');
            if (p.hand.length > 0) {
                scoreEl.style.display = 'block';
                scoreEl.innerText = p.score;
            } else {
                scoreEl.style.display = 'none';
            }

            // Win / Bust Status Tags
            const statusTag = cardEl.querySelector('.player-status-tag');
            statusTag.style.display = 'none';
            statusTag.className = 'player-status-tag'; // reset class

            if (p.isBusted) {
                statusTag.style.display = 'block';
                statusTag.innerText = 'BUST';
            } else if (room.state === 'round_over' && p.bet === 0) {
                // Determine win / lose
                const dScore = room.dealerScore;
                const pScore = p.score;
                
                if (pScore <= 21) {
                    const pBJ = p.hand.length === 2 && pScore === 21;
                    const dBJ = room.dealerHand.length === 2 && dScore === 21;
                    
                    let won = false;
                    let pushed = false;
                    
                    if (dScore > 21) {
                        won = true;
                    } else {
                        if (pBJ && !dBJ) {
                            won = true;
                        } else if (!pBJ && dBJ) {
                            won = false;
                        } else if (pBJ && dBJ) {
                            pushed = true;
                        } else if (pScore > dScore) {
                            won = true;
                        } else if (pScore === dScore) {
                            pushed = true;
                        }
                    }
                    
                    if (won) {
                        statusTag.style.display = 'block';
                        if (pBJ) {
                            statusTag.classList.add('blackjack');
                            statusTag.innerText = 'BLACKJACK';
                        } else {
                            statusTag.classList.add('win');
                            statusTag.innerText = 'VINCE';
                        }
                        // Play win chime once if it is local player
                        if (p.id === myId && p.hand.length > 0) {
                            p.hand = []; // prevent repeat
                            playWinSound();
                        }
                    } else if (pushed) {
                        statusTag.style.display = 'block';
                        statusTag.classList.add('push');
                        statusTag.innerText = 'PATTA';
                    }
                }
            } else if (p.hasStood) {
                statusTag.style.display = 'block';
                statusTag.innerText = 'STÀ';
            }
        }
    }
}

function updateControlsVisibility(room) {
    const me = room.players.find(p => p.id === myId);
    
    // Default hide all controls
    bettingControls.style.display = 'none';
    gameplayControls.style.display = 'none';
    lobbyControls.style.display = 'none';
    btnStartGame.style.display = 'none';
    
    if (room.state === 'lobby') {
        lobbyControls.style.display = 'flex';
        // Only Room Host (first connected player) can start the game
        if (room.players[0] && room.players[0].id === myId) {
            btnStartGame.style.display = 'block';
        }
    } else if (room.state === 'betting') {
        if (me && me.bet === 0) {
            bettingControls.style.display = 'flex';
        } else {
            lobbyControls.style.display = 'flex';
            document.querySelector('.waiting-text').innerText = 'Attendi che gli altri scommettano...';
        }
    } else if (room.state === 'player_turn') {
        if (room.activeSeat === mySeat) {
            gameplayControls.style.display = 'flex';
            // Disable double if player doesn't have enough chips or has more than 2 cards
            if (me.chips < me.bet || me.hand.length !== 2) {
                btnDouble.disabled = true;
            } else {
                btnDouble.disabled = false;
            }
        }
    }
}

// Chip Stacking Calculator Helper
function getChipStackHTML(amount) {
    let remaining = amount;
    const chipValues = [500, 100, 50, 25, 10];
    const chipsToRender = [];
    
    for (const val of chipValues) {
        while (remaining >= val) {
            chipsToRender.push(val);
            remaining -= val;
        }
    }
    
    // Render up to 8 chips in vertical offset
    let html = '<div class="chip-stack relative w-12 h-14 flex items-end justify-center">';
    chipsToRender.slice(0, 8).forEach((val, index) => {
        const offset = index * 4; // 4px vertical stacking offset
        html += `
            <div class="absolute w-8 h-8 rounded-full border border-white/20 shadow-md chip-${val} flex items-center justify-center font-bold text-[9px] text-white" 
                 style="bottom: ${offset}px; z-index: ${index};">
                $${val}
            </div>
        `;
    });
    html += '</div>';
    return html;
}

// Card DOM Creator Helper
function createCardElement(card, type = 'dealer', seat = null) {
    const cardDiv = document.createElement('div');
    
    if (card.value === 'hidden') {
        cardDiv.className = 'card back';
        // Set deal offset for hidden dealer card
        cardDiv.style.setProperty('--deal-x', '50px');
        cardDiv.style.setProperty('--deal-y', '-50px');
        return cardDiv;
    }
    
    const isRed = SUIT_NAMES[card.suit] === 'red';
    cardDiv.className = `card ${isRed ? 'red' : 'black'}`;
    
    // Set custom deal offset based on slot to make it look physical
    let dx = 0;
    let dy = -250;
    
    if (type === 'dealer') {
        dx = 50;
        dy = -50;
    } else if (type === 'player' && seat) {
        if (seat === 1) { dx = 250; dy = -300; }
        else if (seat === 2) { dx = 100; dy = -300; }
        else if (seat === 3) { dx = -100; dy = -300; }
        else if (seat === 4) { dx = -250; dy = -300; }
    }
    
    cardDiv.style.setProperty('--deal-x', `${dx}px`);
    cardDiv.style.setProperty('--deal-y', `${dy}px`);
    
    const suitSymbol = SUIT_SYMBOLS[card.suit];
    
    // Royal card center illustrations
    let centerHTML = `<div class="card-center">${suitSymbol}</div>`;
    if (['J', 'Q', 'K'].includes(card.value)) {
        let royalIcon = '👑'; // default crown for King/Queen
        if (card.value === 'J') royalIcon = '🛡️'; // shield for Jack
        centerHTML = `<div class="card-center text-xl filter drop-shadow-sm">${royalIcon}</div>`;
    } else if (card.value === 'A') {
        centerHTML = `<div class="card-center text-2xl filter drop-shadow-sm animate-pulse">${suitSymbol}</div>`;
    }
    
    cardDiv.innerHTML = `
        <div class="card-top">${card.value}<br>${suitSymbol}</div>
        ${centerHTML}
        <div class="card-bottom">${card.value}<br>${suitSymbol}</div>
    `;
    
    return cardDiv;
}

// Connect automatically on load
window.onload = connect;
