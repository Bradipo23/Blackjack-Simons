import { createServer } from 'http';
import { readFileSync, existsSync } from 'fs';
import { WebSocketServer } from 'ws';
import { join } from 'path';

const PORT = process.env.PORT || 8080;
const STARTING_CHIPS = 1000;

// HTTP Server to serve static files
const server = createServer((req, res) => {
    let urlPath = req.url === '/' ? 'index.html' : req.url.slice(1);
    urlPath = urlPath.split('?')[0]; // strip query params
    
    if (existsSync(urlPath)) {
        let contentType = 'text/html';
        if (urlPath.endsWith('.js')) {
            contentType = 'application/javascript';
        } else if (urlPath.endsWith('.css')) {
            contentType = 'text/css';
        }
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(readFileSync(urlPath));
    } else {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
    }
});

// WebSocket Server
const wss = new WebSocketServer({ noServer: true });

server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Active game rooms map: roomCode -> roomState
const rooms = new Map();

// Helper to generate random 4-digit room code
function generateRoomCode() {
    let code;
    do {
        code = Math.floor(1000 + Math.random() * 9000).toString();
    } while (rooms.has(code));
    return code;
}

// Card Deck utility
function createDeck() {
    const suits = ['H', 'D', 'C', 'S']; // Hearts, Diamonds, Clubs, Spades
    const values = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
    const deck = [];
    // Use 6 decks standard
    for (let d = 0; d < 6; d++) {
        for (const suit of suits) {
            for (const val of values) {
                deck.push({ value: val, suit: suit });
            }
        }
    }
    // Shuffle
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}

// Calculate hand value
function calculateHandValue(cards) {
    let value = 0;
    let aces = 0;
    for (const card of cards) {
        if (card.value === 'A') {
            aces++;
            value += 11;
        } else if (['J', 'Q', 'K'].includes(card.value)) {
            value += 10;
        } else {
            value += parseInt(card.value);
        }
    }
    while (value > 21 && aces > 0) {
        value -= 10;
        aces--;
    }
    return value;
}

// Broadcast game state to everyone in the room
function broadcastToRoom(room) {
    const payload = JSON.stringify({
        type: 'room_state',
        room: {
            code: room.code,
            state: room.state,
            players: room.players.map(p => ({
                id: p.id,
                name: p.name,
                chips: p.chips,
                bet: p.bet,
                hand: p.hand,
                score: calculateHandValue(p.hand),
                seat: p.seat,
                active: p.active,
                isBusted: calculateHandValue(p.hand) > 21,
                hasStood: p.hasStood
            })),
            dealerHand: room.state === 'player_turn' && room.dealerHand.length > 0 
                ? [room.dealerHand[0], { value: 'hidden', suit: 'hidden' }] // Hide dealer second card during player turn
                : room.dealerHand,
            dealerScore: room.state === 'player_turn' && room.dealerHand.length > 0
                ? calculateHandValue([room.dealerHand[0]])
                : calculateHandValue(room.dealerHand),
            activeSeat: room.activeSeat,
            timer: room.timer
        }
    });
    
    room.players.forEach(p => {
        if (p.ws && p.ws.readyState === 1) {
            p.ws.send(payload);
        }
    });
}

// Handle turn progression
function nextPlayer(room) {
    let currentIdx = room.players.findIndex(p => p.seat === room.activeSeat);
    let foundNext = false;
    
    // Scan next players
    for (let i = 1; i <= room.players.length; i++) {
        let nextIdx = (currentIdx + i) % room.players.length;
        let p = room.players[nextIdx];
        // Only active players with a bet can play their turn
        if (p.bet > 0 && calculateHandValue(p.hand) < 21 && !p.hasStood) {
            room.activeSeat = p.seat;
            foundNext = true;
            break;
        }
    }
    
    if (foundNext) {
        broadcastToRoom(room);
    } else {
        // All players done, Dealer's turn!
        dealerPlay(room);
    }
}

// Dealer plays its hand
async function dealerPlay(room) {
    room.state = 'dealer_turn';
    broadcastToRoom(room);
    
    // Delay dealer actions for visual pacing
    const dealCardWithDelay = () => {
        return new Promise(resolve => {
            setTimeout(() => {
                let dealerScore = calculateHandValue(room.dealerHand);
                
                // Dealer must hit on soft 17 (17 or lower)
                if (dealerScore < 17) {
                    room.dealerHand.push(room.deck.pop());
                    broadcastToRoom(room);
                    resolve(true);
                } else {
                    resolve(false); // dealer stands
                }
            }, 1000);
        });
    };
    
    let hitting = true;
    while (hitting) {
        hitting = await dealCardWithDelay();
    }
    
    // Compare hands and settle chips
    settleRound(room);
}

// Settle chips and reset
function settleRound(room) {
    room.state = 'round_over';
    const dealerScore = calculateHandValue(room.dealerHand);
    const dealerBusted = dealerScore > 21;
    
    room.players.forEach(p => {
        if (p.bet === 0) return;
        
        const playerScore = calculateHandValue(p.hand);
        const playerBusted = playerScore > 21;
        
        if (playerBusted) {
            // Player lost (already lost bet)
        } else if (dealerBusted) {
            // Dealer busted, player wins 1:1 (or 3:2 if Blackjack)
            if (p.hand.length === 2 && playerScore === 21) {
                p.chips += Math.floor(p.bet * 2.5); // Blackjack pays 3:2 (return bet + 1.5 bet)
            } else {
                p.chips += p.bet * 2; // Win pays 1:1 (return bet + bet)
            }
        } else if (playerScore > dealerScore) {
            // Player wins
            if (p.hand.length === 2 && playerScore === 21) {
                p.chips += Math.floor(p.bet * 2.5);
            } else {
                p.chips += p.bet * 2;
            }
        } else if (playerScore === dealerScore) {
            // Push (tie, return bet)
            p.chips += p.bet;
        } else {
            // Player loses (bet is gone)
        }
        
        p.bet = 0; // Clear bet
    });
    
    broadcastToRoom(room);
    
    // Automatically reset back to betting state after 6 seconds
    setTimeout(() => {
        resetRoomRound(room);
    }, 6000);
}

// Reset hands for a new round
function resetRoomRound(room) {
    if (room.players.length === 0) {
        rooms.delete(room.code);
        return;
    }
    
    // If deck runs low (less than 40 cards), reshuffle new deck shoe
    if (room.deck.length < 40) {
        room.deck = createDeck();
    }
    
    room.state = 'betting';
    room.dealerHand = [];
    room.activeSeat = null;
    
    room.players.forEach(p => {
        p.hand = [];
        p.bet = 0;
        p.hasStood = false;
        // Kick players with 0 chips? Or reset them to 100 chips so they can keep playing
        if (p.chips <= 0) {
            p.chips = 200; 
        }
    });
    
    broadcastToRoom(room);
}

wss.on('connection', (ws) => {
    let clientRoom = null;
    let clientPlayer = null;
    
    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            
            switch (data.type) {
                case 'create_room': {
                    const code = generateRoomCode();
                    const player = {
                        id: Math.random().toString(36).substring(2, 9),
                        name: data.playerName || 'Player 1',
                        chips: STARTING_CHIPS,
                        bet: 0,
                        hand: [],
                        seat: 1,
                        ws: ws,
                        hasStood: false
                    };
                    
                    const room = {
                        code: code,
                        state: 'lobby', // lobby -> betting -> player_turn -> dealer_turn -> round_over
                        players: [player],
                        dealerHand: [],
                        deck: createDeck(),
                        activeSeat: null
                    };
                    
                    rooms.set(code, room);
                    clientRoom = room;
                    clientPlayer = player;
                    
                    ws.send(JSON.stringify({
                        type: 'room_joined',
                        roomCode: code,
                        playerId: player.id,
                        seat: player.seat
                    }));
                    
                    broadcastToRoom(room);
                    break;
                }
                
                case 'join_room': {
                    const code = data.roomCode;
                    const room = rooms.get(code);
                    
                    if (!room) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
                        break;
                    }
                    
                    if (room.players.length >= 4) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                        break;
                    }
                    
                    if (room.state !== 'lobby' && room.state !== 'betting') {
                        ws.send(JSON.stringify({ type: 'error', message: 'Game already in progress. Wait for round to finish.' }));
                        break;
                    }
                    
                    // Assign next available seat
                    const occupiedSeats = room.players.map(p => p.seat);
                    let seat = 1;
                    for (let s = 1; s <= 4; s++) {
                        if (!occupiedSeats.includes(s)) {
                            seat = s;
                            break;
                        }
                    }
                    
                    const player = {
                        id: Math.random().toString(36).substring(2, 9),
                        name: data.playerName || `Player ${seat}`,
                        chips: STARTING_CHIPS,
                        bet: 0,
                        hand: [],
                        seat: seat,
                        ws: ws,
                        hasStood: false
                    };
                    
                    room.players.push(player);
                    // Sort players by seat
                    room.players.sort((a, b) => a.seat - b.seat);
                    
                    clientRoom = room;
                    clientPlayer = player;
                    
                    ws.send(JSON.stringify({
                        type: 'room_joined',
                        roomCode: code,
                        playerId: player.id,
                        seat: player.seat
                    }));
                    
                    broadcastToRoom(room);
                    break;
                }
                
                case 'start_round': {
                    if (!clientRoom || clientRoom.state !== 'lobby') break;
                    clientRoom.state = 'betting';
                    broadcastToRoom(clientRoom);
                    break;
                }
                
                case 'place_bet': {
                    if (!clientRoom || clientRoom.state !== 'betting') break;
                    const bet = parseInt(data.betAmount);
                    if (isNaN(bet) || bet <= 0 || bet > clientPlayer.chips) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Invalid bet amount' }));
                        break;
                    }
                    
                    clientPlayer.bet = bet;
                    clientPlayer.chips -= bet;
                    broadcastToRoom(clientRoom);
                    
                    // If all connected players have bet, deal the cards!
                    const allBet = clientRoom.players.every(p => p.bet > 0);
                    if (allBet) {
                        startDealing(clientRoom);
                    }
                    break;
                }
                
                case 'action': {
                    if (!clientRoom || clientRoom.state !== 'player_turn') break;
                    if (clientRoom.activeSeat !== clientPlayer.seat) {
                        ws.send(JSON.stringify({ type: 'error', message: 'Not your turn!' }));
                        break;
                    }
                    
                    const act = data.actionType;
                    const handVal = calculateHandValue(clientPlayer.hand);
                    
                    if (act === 'hit') {
                        clientPlayer.hand.push(clientRoom.deck.pop());
                        const newVal = calculateHandValue(clientPlayer.hand);
                        if (newVal >= 21) {
                            // Automatically stand/bust
                            nextPlayer(clientRoom);
                        } else {
                            broadcastToRoom(clientRoom);
                        }
                    } else if (act === 'stand') {
                        clientPlayer.hasStood = true;
                        nextPlayer(clientRoom);
                    } else if (act === 'double') {
                        // Double bet if chips are enough
                        if (clientPlayer.chips < clientPlayer.bet) {
                            ws.send(JSON.stringify({ type: 'error', message: 'Not enough chips to double!' }));
                            break;
                        }
                        clientPlayer.chips -= clientPlayer.bet;
                        clientPlayer.bet *= 2;
                        clientPlayer.hand.push(clientRoom.deck.pop());
                        clientPlayer.hasStood = true;
                        nextPlayer(clientRoom);
                    }
                    break;
                }
            }
        } catch (e) {
            console.error('Error handling message:', e);
        }
    });
    
    ws.on('close', () => {
        if (clientRoom && clientPlayer) {
            const idx = clientRoom.players.indexOf(clientPlayer);
            if (idx > -1) {
                clientRoom.players.splice(idx, 1);
            }
            
            if (clientRoom.players.length === 0) {
                rooms.delete(clientRoom.code);
            } else {
                // If it was the disconnected player's turn, pass to next
                if (clientRoom.state === 'player_turn' && clientRoom.activeSeat === clientPlayer.seat) {
                    nextPlayer(clientRoom);
                } else {
                    broadcastToRoom(clientRoom);
                }
            }
        }
    });
});

// Deal initial 2 cards to everyone
function startDealing(room) {
    room.state = 'dealing';
    broadcastToRoom(room);
    
    // Sincronize deal with delays for animations
    setTimeout(() => {
        // First card to players
        room.players.forEach(p => {
            p.hand.push(room.deck.pop());
        });
        broadcastToRoom(room);
        
        setTimeout(() => {
            // First card to dealer
            room.dealerHand.push(room.deck.pop());
            broadcastToRoom(room);
            
            setTimeout(() => {
                // Second card to players
                room.players.forEach(p => {
                    p.hand.push(room.deck.pop());
                });
                broadcastToRoom(room);
                
                setTimeout(() => {
                    // Second card to dealer
                    room.dealerHand.push(room.deck.pop());
                    
                    // Determine first active player
                    room.state = 'player_turn';
                    // Find first player with a bet
                    let firstPlayer = room.players.find(p => p.bet > 0);
                    if (firstPlayer) {
                        room.activeSeat = firstPlayer.seat;
                        
                        // Check if anyone got instant Blackjack!
                        const pScore = calculateHandValue(firstPlayer.hand);
                        if (pScore === 21) {
                            nextPlayer(room);
                        } else {
                            broadcastToRoom(room);
                        }
                    } else {
                        dealerPlay(room);
                    }
                }, 800);
            }, 800);
        }, 800);
    }, 800);
}

server.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`  CASINO BLACKJACK ONLINE SERVER RUNNING`);
    console.log(`  Open: http://localhost:${PORT}`);
    console.log(`==================================================\n`);
});
