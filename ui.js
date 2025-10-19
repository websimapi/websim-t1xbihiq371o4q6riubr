// UI interaction management
function initializeCharacterSelection() {
    const characterSlots = document.querySelectorAll('.character-slot');

    characterSlots.forEach((slot, index) => {
        // Initial setup
        const slotData = playerSlots[index];
        if (!slotData.occupied) {
            slot.classList.add('empty');
            // ensure skull overlay exists for empty slots on load
            if (!slot.querySelector('.skull-overlay')) {
                const wrap = slot.querySelector('.character-image-wrapper');
                const skull = document.createElement('div');
                skull.className = 'skull-overlay';
                skull.innerHTML = '<img src="/skull.png" alt="Empty Slot">';
                wrap.appendChild(skull);
            }
        }

        // Initial gender setup for archer
        if(slot.dataset.characterIndex === '1') {
            slot.dataset.archerGender = 'male';
            slot.querySelector('.gender-toggle-container').style.visibility = 'visible';
        }

        // Initial color shader application
        applyColorShader(slot);

        // Arrow click listeners for character swapping (only for host or own slot)
        const leftArrow = slot.querySelector('.left-arrow');
        const rightArrow = slot.querySelector('.right-arrow');

        leftArrow.addEventListener('click', () => {
            if (!canControlSlot(index)) return;
            
            let currentIndex = parseInt(slot.dataset.characterIndex, 10);
            currentIndex = (currentIndex - 1 + characters.length) % characters.length;
            
            if (isHost) {
                updateCharacterSlot(slot, characters[currentIndex], 'left');
                playerSlots[index].characterIndex = currentIndex;
                broadcastToClients({ type: 'character_change', slotIndex: index, characterIndex: currentIndex, direction: 'left' });
            } else {
                slot.querySelectorAll('.arrow, .gender-toggle').forEach(el => el.disabled = true);
                sendToHost({ type: 'character_change', slotIndex: index, characterIndex: currentIndex, direction: 'left' });
            }
        });

        rightArrow.addEventListener('click', () => {
            if (!canControlSlot(index)) return;
            
            let currentIndex = parseInt(slot.dataset.characterIndex, 10);
            currentIndex = (currentIndex + 1) % characters.length;
            
            if (isHost) {
                updateCharacterSlot(slot, characters[currentIndex], 'right');
                playerSlots[index].characterIndex = currentIndex;
                broadcastToClients({ type: 'character_change', slotIndex: index, characterIndex: currentIndex, direction: 'right' });
            } else {
                slot.querySelectorAll('.arrow, .gender-toggle').forEach(el => el.disabled = true);
                sendToHost({ type: 'character_change', slotIndex: index, characterIndex: currentIndex, direction: 'right' });
            }
        });

        // Gender toggle listeners
        const genderToggles = slot.querySelectorAll('.gender-toggle');
        genderToggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                if (!canControlSlot(index)) return;
                
                const newGender = toggle.dataset.gender;
                if (slot.dataset.archerGender === newGender) return; // No change

                if (isHost) {
                    slot.dataset.archerGender = newGender;
                    genderToggles.forEach(t => t.classList.toggle('active', t.dataset.gender === newGender));
                    updateCharacterSlot(slot, characters[parseInt(slot.dataset.characterIndex, 10)], 'fade');
                    playerSlots[index].gender = newGender;
                    broadcastToClients({ type: 'gender_change', slotIndex: index, gender: newGender });
                } else {
                    slot.querySelectorAll('.arrow, .gender-toggle').forEach(el => el.disabled = true);
                    sendToHost({ type: 'gender_change', slotIndex: index, gender: newGender });
                }
            });
        });

        // Desktop: click empty slot to switch into it
        slot.addEventListener('click', () => {
            const finePointer = window.matchMedia('(pointer: fine)').matches;
            if (!finePointer) return;
            if (playerSlots[index]?.occupied) return;
            requestSlotSwitch(index);
        });
    });
    setupMobileSlotPicker();
}

function setupMobileSlotPicker() {
    const picker = document.getElementById('mobile-slot-picker');
    if (!picker) return;
    const isMobile = document.body.classList.contains('mobile');
    picker.classList.toggle('hidden', !isMobile);
    picker.querySelectorAll('.slot-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            const idx = parseInt(btn.dataset.slot, 10);
            if (playerSlots[idx]?.occupied) return;
            requestSlotSwitch(idx);
        });
    });
    updateMobileSlotPicker();
}

function updateMobileSlotPicker() {
    const picker = document.getElementById('mobile-slot-picker');
    if (!picker) return;
    picker.querySelectorAll('.slot-pill').forEach(btn => {
        const idx = parseInt(btn.dataset.slot, 10);
        btn.classList.toggle('occupied', !!playerSlots[idx]?.occupied);
        btn.classList.toggle('current', idx === mySlotIndex);
    });
}

function canControlSlot(slotIndex) {
    // Players can only control their assigned slot.
    return slotIndex === mySlotIndex;
}

function requestSlotSwitch(targetIndex) {
    if (isHost) {
        hostSwitchToSlot(targetIndex);
    } else {
        sendToHost({ type: 'slot_switch', targetIndex });
    }
}

function initializeStartOverlay() {
    const startOverlay = document.getElementById('start-overlay');
    const hostBtn = document.getElementById('host-btn');
    const scanBtn = document.getElementById('scan-qr-btn');
    const joinInput = document.getElementById('join-id-input');
    const realtimeBtn = document.getElementById('realtime-mode-btn');
    const joinBtn = document.getElementById('join-btn');
    const joinControlGroup = document.querySelector('.join-control-group');

    // Check for join ID in URL
    const urlParams = new URLSearchParams(window.location.search);
    const hostIdFromUrl = urlParams.get('ID');
    if (hostIdFromUrl) {
        joinInput.value = hostIdFromUrl;
        hostBtn.style.display = 'none';
        realtimeBtn.style.display = 'none';
        document.querySelector('.mode-description').style.display = 'none';
        joinControlGroup.style.display = 'none';
        joinBtn.style.display = 'block';
        
        joinBtn.addEventListener('click', () => {
            if (peerId) {
                joinGame(hostIdFromUrl);
            } else {
                alert('Connection service is not ready, please wait a moment.');
            }
        });

    } else {
         hostBtn.addEventListener('click', () => {
            if (peerId) {
                startHosting();
            } else {
                console.log('PeerJS not ready yet');
                alert('Connection service is not ready, please wait a moment.');
            }
        });

        scanBtn.addEventListener('click', () => {
            if (peerId) {
                startCameraScanner();
            } else {
                console.log('PeerJS not ready yet');
                alert('Connection service is not ready, please wait a moment.');
            }
        });

        joinInput.addEventListener('click', async () => {
            if (peerId && navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
                try {
                    // This may trigger a browser permission prompt
                    const clipboardText = await navigator.clipboard.readText();
                    const trimmedText = clipboardText.trim();
                    // Basic check for a plausible ID (not empty)
                    if (trimmedText.length > 3) {
                        joinInput.value = trimmedText;
                        joinGame(trimmedText);
                    }
                } catch (err) {
                    console.warn('Could not read from clipboard or permission denied:', err.name);
                    // Fail silently, user can still type manually.
                }
            }
        });

        joinInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const hostId = joinInput.value.trim();
                if (hostId) {
                    joinGame(hostId);
                } else {
                    alert('Please enter a valid join code.');
                }
            }
        });
    }
    
    realtimeBtn.addEventListener('click', () => {
        // Disabled for now
        console.log('Realtime mode not implemented yet');
    });

    const qrOverlay = document.getElementById('qr-code-overlay');
    const closeQrBtn = document.getElementById('close-qr-overlay');
    const copyIdBtn = document.getElementById('copy-id-btn');
    const peerIdSpan = document.getElementById('peer-id-display');

    closeQrBtn.addEventListener('click', () => {
        qrOverlay.classList.add('hidden');
    });

    copyIdBtn.addEventListener('click', () => {
        const hostId = peerIdSpan.textContent;
        if (hostId && navigator.clipboard) {
            navigator.clipboard.writeText(hostId).then(() => {
                const originalText = copyIdBtn.textContent;
                copyIdBtn.textContent = 'Copied!';
                copyIdBtn.disabled = true;
                setTimeout(() => {
                    copyIdBtn.textContent = originalText;
                    copyIdBtn.disabled = false;
                }, 2000);
            }).catch(err => {
                console.error('Failed to copy ID: ', err);
                alert('Could not copy ID to clipboard.');
            });
        }
    });

    // Add listener for mini QR code to show fullscreen overlay
    const hostQrDisplay = document.getElementById('host-qr-display');
    hostQrDisplay.addEventListener('click', () => {
        if (isHost) {
            qrOverlay.classList.remove('hidden');
        }
    });
}

function startHosting() {
    gameMode = 'scan';
    isHost = true;
    
    // Hide start overlay
    document.getElementById('start-overlay').classList.add('hidden');
    // Show character selection screen
    document.querySelector('.character-selection').classList.add('visible');
    
    // Show mini QR code in top right
    document.getElementById('host-qr-display').classList.add('visible');
    
    // Initialize audio
    initializeAudio();
    
    console.log('Started Scan to Play mode as host with ID:', peerId);
    mySlotIndex = 0;
    
    // Update the UI to show empty slots correctly
    updateCharacterSlotsUI();

    applyMobileSingleSlotMode();
}


function generateHostQRCodes(id) {
    const joinUrl = `https://champions.on.websim.com?ID=${id}`;
    
    // Generate mini QR code for in-game display
    new QRious({
        element: document.getElementById('mini-qr-code'),
        value: joinUrl,
        size: 80,
        foreground: '#ffffff',
        background: 'transparent'
    });

    // Generate fullscreen QR code
    new QRious({
        element: document.getElementById('fullscreen-qr-code'),
        value: joinUrl,
        size: Math.min(window.innerWidth, window.innerHeight) * 0.6,
        foreground: '#ffffff',
        background: 'transparent',
        padding: 20
    });

    // Display the Peer ID text
    document.getElementById('peer-id-display').textContent = id;
}

function updateCharacterSlotsUI() {
    const slots = document.querySelectorAll('.character-slot');
    slots.forEach((slot, index) => {
        const playerSlot = playerSlots[index];
        const currentCharacterIndex = parseInt(slot.dataset.characterIndex, 10);
        const currentGender = slot.dataset.archerGender;

        if (playerSlot.occupied) {
            slot.classList.remove('empty');
            const skull = slot.querySelector('.skull-overlay'); if (skull) skull.remove();
            
            let characterChanged = playerSlot.characterIndex !== currentCharacterIndex;
            let genderChanged = false;
            if (characters[playerSlot.characterIndex].genders) {
                genderChanged = playerSlot.gender !== currentGender;
            }

            // Only update if there's a change
            if (characterChanged || genderChanged) {
                if (!suppressUIAnimationOnce) {
                    updateCharacterSlot(slot, characters[playerSlot.characterIndex], 'fade');
                }
            }
            
            // Always ensure data attributes are in sync, even if no visual update is needed right now.
            slot.dataset.characterIndex = playerSlot.characterIndex;
            if (characters[playerSlot.characterIndex].genders) {
                slot.dataset.archerGender = playerSlot.gender;
                const genderContainer = slot.querySelector('.gender-toggle-container');
                genderContainer.style.visibility = 'visible';
                genderContainer.querySelectorAll('.gender-toggle').forEach(t => {
                    t.classList.toggle('active', t.dataset.gender === playerSlot.gender);
                });
            } else {
                 slot.querySelector('.gender-toggle-container').style.visibility = 'hidden';
            }

        } else {
            slot.classList.add('empty');
            const wrap = slot.querySelector('.character-image-wrapper');
            if (wrap && !slot.querySelector('.skull-overlay')) {
                const skull = document.createElement('div');
                skull.className = 'skull-overlay';
                skull.innerHTML = '<img src="/skull.png" alt="Empty Slot">';
                wrap.appendChild(skull);
            }
            
            // Add "waiting for player" text if it doesn't exist
            const statsContainer = slot.querySelector('.character-stats');
            if (statsContainer && !statsContainer.querySelector('.waiting-for-player')) {
                const waitingText = document.createElement('div');
                waitingText.className = 'waiting-for-player';
                waitingText.innerHTML = 'Waiting for a player to join<span class="ellipsis"></span>';
                statsContainer.appendChild(waitingText);
            }
        }
    });
    suppressUIAnimationOnce = false;
    if (typeof renderPlayersStrip === 'function') renderPlayersStrip();
}

function hostSwitchToSlot(targetIndex) {
    if (!isHost) return;
    const target = playerSlots[targetIndex];
    if (!target || target.occupied) return;
    const prevIndex = mySlotIndex;
    const current = playerSlots[mySlotIndex];
    target.occupied = true; target.playerId = 'host'; target.characterIndex = current.characterIndex; target.gender = current.gender;
    current.occupied = false; current.playerId = null;
    mySlotIndex = targetIndex;
    suppressUIAnimationOnce = true;
    broadcastToClients({ type: 'player_slots_update', playerSlots });
    updateCharacterSlotsUI();
    const prevEl = document.querySelector(`.character-slot[data-player="${prevIndex + 1}"]`);
    if (prevEl) {
        prevEl.classList.add('empty');
        const wrap = prevEl.querySelector('.character-image-wrapper');
        wrap && wrap.querySelectorAll('.character-image').forEach(img => { if (img.dataset.blobUrl) URL.revokeObjectURL(img.dataset.blobUrl); img.remove(); });
        // add skull overlay to the slot we vacated
        if (wrap && !prevEl.querySelector('.skull-overlay')) {
            const skull = document.createElement('div');
            skull.className = 'skull-overlay';
            skull.innerHTML = '<img src="/skull.png" alt="Empty Slot">';
            wrap.appendChild(skull);
        }
    }
    const targetEl = document.querySelector(`.character-slot[data-player="${targetIndex + 1}"]`);
    if (targetEl) {
        const twrap = targetEl.querySelector('.character-image-wrapper');
        if (twrap) twrap.querySelectorAll('.character-image').forEach(img => { if (img.dataset.blobUrl) URL.revokeObjectURL(img.dataset.blobUrl); img.remove(); });
        const skull = targetEl.querySelector('.skull-overlay');
        if (skull) {
            skull.classList.add('slide-out-to-left');
            setTimeout(() => { skull.remove(); targetEl.classList.remove('empty'); updateCharacterSlot(targetEl, characters[target.characterIndex], 'right'); }, 500);
        } else {
            targetEl.classList.remove('empty');
            updateCharacterSlot(targetEl, characters[target.characterIndex], 'right');
        }
    }
    applyMobileSingleSlotMode();
    updateMobileSlotPicker(); // Update the slot pills for mobile
}