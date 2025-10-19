// PeerJS connection and data management
function initializePeerJS() {
    peer = new Peer();
    
    peer.on('open', (id) => {
        peerId = id;
        console.log('PeerJS initialized with ID:', id);
        generateHostQRCodes(id);

        const urlParams = new URLSearchParams(window.location.search);
        const hostIdFromUrl = urlParams.get('ID');
        if (hostIdFromUrl) {
            // If we have an ID in the URL, we're a client, so try to join.
            // A small delay might be needed for the UI to be ready.
            setTimeout(() => {
                const joinBtn = document.getElementById('join-btn');
                if (joinBtn) joinBtn.click();
            }, 100);
        }
    });

    peer.on('connection', (conn) => {
        console.log('Incoming connection:', conn.peer);
        handleIncomingConnection(conn);
    });

    peer.on('error', (error) => {
        console.error('PeerJS error:', error);
    });
}

function joinGame(hostId) {
    console.log('Attempting to join game with host:', hostId);
    isHost = false;
    
    const conn = peer.connect(hostId);
    
    conn.on('open', () => {
        console.log('Connected to host:', hostId);
        connections = [conn]; // Client only has one connection (to host)
        
        // Hide start overlay
        document.getElementById('start-overlay').classList.add('hidden');
        // Show character selection screen
        document.querySelector('.character-selection').classList.add('visible');
        
        // Initialize audio
        initializeAudio();
    });
    
    conn.on('data', (data) => {
        handleHostMessage(data);
    });
    
    conn.on('close', () => {
        console.log('Disconnected from host');
        // Could show reconnection UI here
    });
}

function handleHostMessage(data) {
    const slotElement = document.querySelector(`.character-slot[data-player="${data.slotIndex + 1}"]`);
    switch (data.type) {
        case 'slot_assignment':
            console.log('Assigned to slot:', data.slot);
            playerSlots = data.playerSlots;
            updateCharacterSlotsUI(); // Full sync on first join
            mySlotIndex = data.slot;
            applyMobileSingleSlotMode();
            break;
            
        case 'player_slots_update':
            // Used for players joining/leaving
            playerSlots = data.playerSlots;
            updateCharacterSlotsUI();
            updateMobileSlotPicker();
            break;
            
        case 'character_change':
            if (slotElement) {
                playerSlots[data.slotIndex].characterIndex = data.characterIndex;
                updateCharacterSlot(slotElement, characters[data.characterIndex], data.direction);
            }
            updatePlayerChip(data.slotIndex, data.direction);
            break;
            
        case 'gender_change':
            if (slotElement) {
                playerSlots[data.slotIndex].gender = data.gender;
                slotElement.dataset.archerGender = data.gender;
                slotElement.querySelectorAll('.gender-toggle').forEach(t => {
                    t.classList.toggle('active', t.dataset.gender === data.gender);
                });
                updateCharacterSlot(slotElement, characters[playerSlots[data.slotIndex].characterIndex], 'fade');
            }
            updatePlayerChip(data.slotIndex, 'fade');
            break;
    }
}

function handleIncomingConnection(conn) {
    connections.push(conn);
    
    conn.on('open', () => {
        console.log('Connection established with:', conn.peer);
        
        // Assign player to available slot
        const availableSlot = playerSlots.find(slot => !slot.occupied);
        if (availableSlot) {
            availableSlot.occupied = true;
            availableSlot.playerId = conn.peer;
            
            // Send slot assignment to new player
            conn.send({
                type: 'slot_assignment',
                slot: playerSlots.indexOf(availableSlot),
                playerSlots: playerSlots
            });
            
            // Broadcast updated player slots to all clients
            broadcastToClients({
                type: 'player_slots_update',
                playerSlots: playerSlots
            });
            
            updateCharacterSlotsUI();
        }
    });

    conn.on('data', (data) => {
        handleClientMessage(conn, data);
    });

    conn.on('close', () => {
        console.log('Connection closed:', conn.peer);
        removePlayer(conn.peer);
    });
}

function sendToHost(message) {
    // Client function to send data to the host
    if (!isHost && connections.length > 0 && connections[0].open) {
        connections[0].send(message);
    }
}

function handleClientMessage(conn, data) {
    const playerSlot = playerSlots.find(slot => slot.playerId === conn.peer);
    if (!playerSlot) {
        console.warn('Received message from unassigned player:', conn.peer);
        return;
    }
    const slotIndex = playerSlots.indexOf(playerSlot);

    switch (data.type) {
        case 'character_change':
            if (slotIndex === data.slotIndex) { // Security check
                playerSlot.characterIndex = data.characterIndex;
                
                broadcastToClients({
                    type: 'character_change',
                    slotIndex: slotIndex,
                    characterIndex: data.characterIndex,
                    direction: data.direction
                });
                
                const slotElement = document.querySelector(`.character-slot[data-player="${slotIndex + 1}"]`);
                if (slotElement) {
                    updateCharacterSlot(slotElement, characters[data.characterIndex], data.direction);
                }
            }
            break;
        case 'gender_change':
             if (slotIndex === data.slotIndex) { // Security check
                playerSlot.gender = data.gender;
                
                broadcastToClients({
                    type: 'gender_change',
                    slotIndex: slotIndex,
                    gender: data.gender
                });
                
                const slotElement = document.querySelector(`.character-slot[data-player="${slotIndex + 1}"]`);
                if (slotElement) {
                     slotElement.dataset.archerGender = data.gender;
                     updateCharacterSlot(slotElement, characters[playerSlot.characterIndex], 'fade');
                }
            }
            break;
        case 'slot_switch':
            hostAssignClientToSlot(conn.peer, data.targetIndex);
            break;
    }
}

function broadcastToClients(message) {
    connections.forEach(conn => {
        if (conn.open) {
            conn.send(message);
        }
    });
}

function removePlayer(playerId) {
    const slot = playerSlots.find(slot => slot.playerId === playerId);
    if (slot) {
        slot.occupied = false;
        slot.playerId = null;
        
        broadcastToClients({
            type: 'player_slots_update',
            playerSlots: playerSlots
        });
        
        updateCharacterSlotsUI();
    }
    
    connections = connections.filter(conn => conn.peer !== playerId);
}

function hostAssignClientToSlot(peerIdToMove, targetIndex) {
    const target = playerSlots[targetIndex];
    if (!target || target.occupied) return;
    const current = playerSlots.find(s => s.playerId === peerIdToMove);
    if (!current) return;
    target.occupied = true; target.playerId = peerIdToMove; target.characterIndex = current.characterIndex; target.gender = current.gender;
    current.occupied = false; current.playerId = null;
    broadcastToClients({ type: 'player_slots_update', playerSlots });
    const conn = connections.find(c => c.peer === peerIdToMove);
    if (conn && conn.open) {
        conn.send({ type: 'slot_assignment', slot: targetIndex, playerSlots });
    }
    updateCharacterSlotsUI();
}