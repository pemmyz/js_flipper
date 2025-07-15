document.addEventListener('DOMContentLoaded', () => {
    // --- Canvas and Context Setup ---
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const CANVAS_WIDTH = 600;
    const CANVAS_HEIGHT = 800;
    canvas.width = CANVAS_WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // --- UI Elements ---
    const scoreEl = document.getElementById('score');
    const attemptsEl = document.getElementById('attempts');
    const gameOverScreen = document.getElementById('game-over-screen');
    const finalScoreEl = document.getElementById('final-score');
    const restartButton = document.getElementById('restart-button');
    const helpLegend = document.getElementById('help-legend');
    const closeHelpButton = document.getElementById('close-help-button');
    const muteButton = document.getElementById('mute-button');
    const gapButton = document.getElementById('gap-button');
    const helpToggleButton = document.getElementById('help-toggle-button');
    const themeToggleButton = document.getElementById('theme-toggle-button');
    const botStatusText = document.getElementById('bot-status-text');

    // --- Game State and Constants ---
    let score = 0;
    let ballsLeft = 3;
    let gameState = 'launch';
    let showHelp = false;
    let isMuted = false;
    let flipperGapBetweenTips;
    
    // --- BOT MODE STATE ---
    let botModeActive = false;
    let botActivationTimer = null;
    let botCountdownInterval = null;
    let botLaunchTimerId = null;

    let chuteBecameEmptyAt = null;
    const AUTO_SERVE_DELAY = 5000;

    const GRAVITY = 0.15;
    const FRICTION = 0.995;
    const BOUNCE_FACTOR = 0.6;
    const BALL_RADIUS = 10;
    const BUMPER_RADIUS = 10;
    const SLOPE_LINE_WIDTH = 12; // MODIFIED: For fatter slopes

    const CHUTE_WIDTH = 50;
    const PLAYFIELD_WIDTH = CANVAS_WIDTH - CHUTE_WIDTH;
    const CHUTE_EXIT_Y = 100;

    const FLIPPER_Y_OFFSET = 60;
    const FLIPPER_LENGTH = 85;
    const FLIPPER_REST_ANGLE = Math.PI / 8;
    const FLIPPER_SWING_ANGLE = Math.PI / 3;
    const INITIAL_FLIPPER_GAP = (BALL_RADIUS * 2 + 5) + (BALL_RADIUS / 2); // NEW: Store initial gap

    // --- Anti-stuck constants for flippers ---
    const FLIPPER_ANTI_STUCK_BOOST = 10; 
    const FLIPPER_ANTI_STUCK_COUNT = 4;   
    const FLIPPER_ANTI_STUCK_TIME_WINDOW = 1000;

    // --- Sound Effects ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    
    function unlockAudio() {
        if (audioCtx && audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }

    function playSound(type, volume = 0.3) {
        if (isMuted || !audioCtx) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        if (type === 'launch'){oscillator.type = 'sine';oscillator.frequency.setValueAtTime(100, audioCtx.currentTime);oscillator.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);}
        else if (type === 'bounce'){oscillator.type = 'triangle';oscillator.frequency.setValueAtTime(400 + Math.random() * 200, audioCtx.currentTime);gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);}
        else if (type === 'flipper'){oscillator.type = 'square';oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);}
        else if (type === 'lose_ball'){oscillator.type = 'sawtooth';oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.5);gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);}
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.8);
    }

    // --- Game Objects ---
    let balls = [];
    let launcher = {};
    let leftFlipper = {};
    let rightFlipper = {};
    const bumpers = [];
    const slopes = [];

    function initializeGame() {
        score = 0;
        ballsLeft = 3;
        gameState = 'launch';
        showHelp = false;
        chuteBecameEmptyAt = null;
        flipperGapBetweenTips = INITIAL_FLIPPER_GAP; // MODIFIED: Use initial gap constant
        
        botModeActive = false;
        clearTimeout(botActivationTimer);
        clearInterval(botCountdownInterval);
        clearTimeout(botLaunchTimerId); 
        botLaunchTimerId = null;
        startBotCountdown();

        helpLegend.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        balls = [];
        createBumpers();
        createFlippers();
        createSlopes();
        createLauncher();
        prepareNextBall();
        updateUI();
    }

    function prepareNextBall() {
        if (ballsLeft <= 0) {
            gameState = 'playing';
            return;
        }
        ballsLeft--;
        updateUI();
        const newBall = { 
            x: PLAYFIELD_WIDTH + CHUTE_WIDTH / 2, 
            y: launcher.y, 
            radius: BALL_RADIUS, 
            vx: 0, 
            vy: 0, 
            state: 'ready',
            recentSlopeBounces: [],
            recentFlipperBounces: []
        };
        balls.push(newBall);
        launcher.power = 0;
        gameState = 'launch';

        if (botModeActive) {
            botLaunchTimerId = setTimeout(botLaunchBall, 3000);
        }
    }
    
    function createBumpers() {
        bumpers.length = 0;
        bumpers.push({ x: 300, y: 300, radius: BUMPER_RADIUS * 1.5, points: 50 });
        bumpers.push({ x: 250, y: 350, radius: BUMPER_RADIUS, points: 25 });
        bumpers.push({ x: 350, y: 350, radius: BUMPER_RADIUS, points: 25 });
        bumpers.push({ x: 150, y: 250, radius: BUMPER_RADIUS, points: 25 });
        bumpers.push({ x: 450, y: 250, radius: BUMPER_RADIUS, points: 25 });
        bumpers.push({ x: 100, y: 450, radius: BUMPER_RADIUS, points: 25 });
        bumpers.push({ x: 500, y: 450, radius: BUMPER_RADIUS, points: 25 });
        bumpers.push({ x: 200, y: 150, radius: BUMPER_RADIUS, points: 25 });
        bumpers.push({ x: 400, y: 150, radius: BUMPER_RADIUS, points: 25 });
    }

    function createFlippers() {
        const flipperBaseY = CANVAS_HEIGHT - FLIPPER_Y_OFFSET;
        const flipperSpeed = 0.4;
        const flipperGapTotal = (2 * FLIPPER_LENGTH * Math.cos(FLIPPER_REST_ANGLE)) + flipperGapBetweenTips;
        const leftPivotX = PLAYFIELD_WIDTH / 2 - flipperGapTotal / 2;
        const rightPivotX = PLAYFIELD_WIDTH / 2 + flipperGapTotal / 2;
        leftFlipper = { x: leftPivotX, y: flipperBaseY, length: FLIPPER_LENGTH, baseAngle: FLIPPER_REST_ANGLE, activeAngle: FLIPPER_REST_ANGLE - FLIPPER_SWING_ANGLE, angle: FLIPPER_REST_ANGLE, speed: flipperSpeed, active: false, width: 15, isRight: false };
        rightFlipper = { x: rightPivotX, y: flipperBaseY, length: FLIPPER_LENGTH, baseAngle: Math.PI - FLIPPER_REST_ANGLE, activeAngle: Math.PI - FLIPPER_REST_ANGLE + FLIPPER_SWING_ANGLE, angle: Math.PI - FLIPPER_REST_ANGLE, speed: flipperSpeed, active: false, width: 15, isRight: true };
    }

    function createSlopes() {
        slopes.length = 0;
        const slopeStartY = CANVAS_HEIGHT * 0.6;
        slopes.push({ x1: 0, y1: slopeStartY, x2: leftFlipper.x, y2: leftFlipper.y });
        slopes.push({ x1: PLAYFIELD_WIDTH, y1: slopeStartY, x2: rightFlipper.x, y2: rightFlipper.y });
    }

    function createLauncher() {
        launcher = { x: PLAYFIELD_WIDTH + CHUTE_WIDTH / 2, y: CANVAS_HEIGHT - 30, width: 20, height: 50, power: 0, maxPower: 20, charging: false };
    }

    function toggleHelp() {
        showHelp = !showHelp;
        helpLegend.classList.toggle('hidden');
    }

    // --- BOT MODE FUNCTIONS ---
    function startBotCountdown() {
        if (!botStatusText) return;
        let countdown = 5;
        botStatusText.textContent = `Bot mode starts in: ${countdown}s`;
        
        botCountdownInterval = setInterval(() => {
            countdown--;
            if (countdown > 0) {
                botStatusText.textContent = `Bot mode starts in: ${countdown}s`;
            } else {
                botStatusText.textContent = `Bot mode starting...`;
                clearInterval(botCountdownInterval);
                botCountdownInterval = null;
            }
        }, 1000);
        
        botActivationTimer = setTimeout(() => {
            if (gameState !== 'gameOver') { 
                if (showHelp) {
                    toggleHelp();
                }
                botModeActive = true;
                updateBotStatusText();
                botLaunchBall(); 
            }
            botActivationTimer = null;
        }, 5000);
    }

    function toggleBotMode() {
        unlockAudio();
        botModeActive = !botModeActive;
        if (botActivationTimer) clearTimeout(botActivationTimer);
        if (botCountdownInterval) clearInterval(botCountdownInterval);
        botActivationTimer = null;
        botCountdownInterval = null;
        if (!botModeActive) {
            clearTimeout(botLaunchTimerId);
            botLaunchTimerId = null;
        }
        updateBotStatusText();
    }

    function cancelBotMode() {
        if (!botModeActive) return;
        botModeActive = false;
        clearTimeout(botLaunchTimerId);
        botLaunchTimerId = null;
        updateBotStatusText();
    }

    function botLaunchBall() {
        const ballToLaunch = balls.find(b => b.state === 'ready');
        if (ballToLaunch) {
            launcher.power = launcher.maxPower;
            ballToLaunch.vy = -launcher.power;
            ballToLaunch.state = 'launching';
            playSound('launch');
        }
    }

    function updateBotStatusText() {
        if (!botStatusText) return;
        botStatusText.textContent = `Bot Mode: ${botModeActive ? 'ON' : 'OFF'}`;
    }

    // --- Event Listeners ---
    canvas.addEventListener('mouseenter', unlockAudio);

    window.addEventListener('keydown', (e) => {
        unlockAudio(); 

        if (botModeActive && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) {
            cancelBotMode();
        }

        if (e.code === 'KeyH') {
            toggleHelp();
            return;
        }
        if (e.code === 'KeyM') {
            muteButton.click();
            return;
        }
        if (e.code === 'KeyB') {
            toggleBotMode();
            return;
        }
        if (showHelp || gameState === 'gameOver') return;
        if (e.code === 'KeyG') {
            gapButton.click();
            return;
        }
        if (e.code === 'ArrowLeft') leftFlipper.active = true;
        if (e.code === 'ArrowRight') rightFlipper.active = true;
        if (e.code === 'Space' && gameState === 'launch') launcher.charging = true;
    });

    window.addEventListener('keyup', (e) => {
        if (showHelp) return;
        if (e.code === 'ArrowLeft') leftFlipper.active = false;
        if (e.code === 'ArrowRight') rightFlipper.active = false;
        if (e.code === 'Space' && gameState === 'launch') {
            launcher.charging = false;
            const ballToLaunch = balls.find(b => b.state === 'ready');
            if (ballToLaunch) {
                ballToLaunch.vy = -launcher.power;
                ballToLaunch.state = 'launching';
                playSound('launch');
            }
        }
    });

    restartButton.addEventListener('click', () => {
        unlockAudio();
        initializeGame();
    });
    closeHelpButton.addEventListener('click', () => {
        unlockAudio();
        toggleHelp();
    });

    muteButton.addEventListener('click', () => {
        unlockAudio();
        isMuted = !isMuted;
        muteButton.textContent = isMuted ? 'Unmute' : 'Mute';
    });
    
    helpToggleButton.addEventListener('click', () => {
        unlockAudio();
        toggleHelp();
    });

    gapButton.addEventListener('click', () => {
        if (gameState === 'gameOver') return;
        flipperGapBetweenTips += 5;
        createFlippers();
        createSlopes();
    });

    themeToggleButton.addEventListener('click', () => {
        document.body.classList.toggle('light-mode');
        if (document.body.classList.contains('light-mode')) {
            themeToggleButton.textContent = 'Dark Mode';
        } else {
            themeToggleButton.textContent = 'Light Mode';
        }
    });

    // --- Touch and Mouse Controls ---
    const touchLeft = document.getElementById('touch-left');
    const touchRight = document.getElementById('touch-right');
    const touchLaunch = document.getElementById('touch-launch');

    const handleControlStart = (type) => {
        unlockAudio();
        if (botModeActive && (type === 'left' || type === 'right')) { cancelBotMode(); }
        if (showHelp || gameState === 'gameOver') return;
        switch(type) {
            case 'left': leftFlipper.active = true; break;
            case 'right': rightFlipper.active = true; break;
            case 'launch': if (gameState === 'launch') launcher.charging = true; break;
        }
    };

    const handleControlEnd = (type) => {
        switch(type) {
            case 'left': leftFlipper.active = false; break;
            case 'right': rightFlipper.active = false; break;
            case 'launch':
                if (gameState === 'launch' && launcher.charging) {
                    launcher.charging = false;
                    const ballToLaunch = balls.find(b => b.state === 'ready');
                    if (ballToLaunch) {
                        ballToLaunch.vy = -launcher.power;
                        ballToLaunch.state = 'launching';
                        playSound('launch');
                    }
                }
                break;
        }
    };

    function setupControlEvents(element, type) {
        ['touchstart', 'mousedown'].forEach(evt => {
            element.addEventListener(evt, e => { e.preventDefault(); handleControlStart(type); });
        });
        ['touchend', 'touchcancel', 'mouseup', 'mouseleave'].forEach(evt => {
            element.addEventListener(evt, e => { e.preventDefault(); handleControlEnd(type); });
        });
    }

    setupControlEvents(touchLeft, 'left');
    setupControlEvents(touchRight, 'right');
    setupControlEvents(touchLaunch, 'launch');


    // --- Main Game Loop Functions ---
    function update() {
        if (showHelp || gameState === 'gameOver') return;

        // BOT MODE LOGIC
        if (botModeActive) {
            // Flipper AI
            let activateLeft = false;
            let activateRight = false;
            const triggerY = leftFlipper.y - 15;
            const bottomY = leftFlipper.y + 20;

            for (const ball of balls) {
                if (ball.state === 'playing' && ball.vy >= 0 && ball.y > triggerY && ball.y < bottomY) {
                    const leftFlipperTipX = leftFlipper.x + FLIPPER_LENGTH * Math.cos(leftFlipper.baseAngle);
                    if (ball.x < leftFlipperTipX + ball.radius) { activateLeft = true; }
                    const rightFlipperTipX = rightFlipper.x + FLIPPER_LENGTH * Math.cos(rightFlipper.baseAngle);
                    if (ball.x > rightFlipperTipX - ball.radius) { activateRight = true; }
                }
            }
            leftFlipper.active = activateLeft;
            rightFlipper.active = activateRight;
            
            // NEW: Widen gap based on score
            const expectedGap = INITIAL_FLIPPER_GAP + Math.floor(score / 500);
            if (flipperGapBetweenTips < expectedGap) {
                flipperGapBetweenTips = expectedGap;
                createFlippers();
                createSlopes();
            }
        }

        updateFlipper(leftFlipper);
        updateFlipper(rightFlipper);
        
        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];
            switch (ball.state) {
                case 'ready':
                    if (launcher.charging && launcher.power < launcher.maxPower) { launcher.power += 1; }
                    ball.y = launcher.y - launcher.power;
                    break;
                case 'launching':
                    ball.vy += GRAVITY;
                    ball.y += ball.vy;
                    ball.x = launcher.x;
                    if (ball.y < CHUTE_EXIT_Y && ball.vy < 0) {
                        ball.state = 'playing';
                        ball.vx = -4;
                        prepareNextBall();
                    }
                    if (ball.y > CANVAS_HEIGHT) { ballsLeft++; balls.splice(i, 1); }
                    break;
                case 'playing':
                    ball.vy += GRAVITY;
                    ball.vx *= FRICTION;
                    ball.vy *= FRICTION;
                    ball.x += ball.vx;
                    ball.y += ball.vy;
                    if (ball.x + ball.radius > PLAYFIELD_WIDTH) { ball.vx *= -BOUNCE_FACTOR; ball.x = PLAYFIELD_WIDTH - ball.radius; }
                    if (ball.x - ball.radius < 0) { ball.vx *= -BOUNCE_FACTOR; ball.x = ball.radius; }
                    if (ball.y - ball.radius < 0) { ball.vy *= -BOUNCE_FACTOR; ball.y = ball.radius; }
                    bumpers.forEach(bumper => {
                        const dx = ball.x - bumper.x; const dy = ball.y - bumper.y;
                        const distance = Math.hypot(dx, dy);
                        if (distance < ball.radius + bumper.radius) {
                            playSound('bounce', 0.5); score += bumper.points;
                            const angle = Math.atan2(dy, dx); const overlap = ball.radius + bumper.radius - distance;
                            ball.x += Math.cos(angle) * overlap; ball.y += Math.sin(angle) * overlap;
                            const normalX = dx / distance; const normalY = dy / distance;
                            const dotProduct = (ball.vx * normalX + ball.vy * normalY);
                            ball.vx = (ball.vx - 2 * dotProduct * normalX) * (BOUNCE_FACTOR + 0.3);
                            ball.vy = (ball.vy - 2 * dotProduct * normalY) * (BOUNCE_FACTOR + 0.3);
                        }
                    });
                    handleFlipperCollision(ball, leftFlipper);
                    handleFlipperCollision(ball, rightFlipper);
                    handleSlopeCollisions(ball);
                    if (ball.y > CANVAS_HEIGHT) { balls.splice(i, 1); }
                    break;
            }
        }
        
        // NEW: Handle collisions between balls
        handleBallToBallCollisions();

        const isChuteReady = balls.some(b => b.state === 'ready');
        const hasBallInPlay = balls.some(b => b.state === 'playing');
        if (!isChuteReady && hasBallInPlay && ballsLeft > 0 && chuteBecameEmptyAt === null) {
            chuteBecameEmptyAt = performance.now();
        } else if (isChuteReady) {
            chuteBecameEmptyAt = null;
        }
        if (chuteBecameEmptyAt !== null && performance.now() - chuteBecameEmptyAt > AUTO_SERVE_DELAY) {
            prepareNextBall();
            chuteBecameEmptyAt = null;
        }
        updateUI();
        if (balls.length === 0 && gameState !== 'gameOver') {
            playSound('lose_ball');
            endGame();
        }
    }

    function updateFlipper(flipper) {
        const targetAngle = flipper.active ? flipper.activeAngle : flipper.baseAngle;
        const diff = targetAngle - flipper.angle;
        if (Math.abs(diff) < 0.001) { flipper.angle = targetAngle; return; }
        if (Math.abs(diff) <= flipper.speed) {
            flipper.angle = targetAngle;
            if (flipper.active) { playSound('flipper', 0.2); }
        } else {
            flipper.angle += Math.sign(diff) * flipper.speed;
        }
    }
    
    // NEW: Handles collisions between any two balls
    function handleBallToBallCollisions() {
        for (let i = 0; i < balls.length; i++) {
            for (let j = i + 1; j < balls.length; j++) {
                const ballA = balls[i];
                const ballB = balls[j];

                // Only collide balls that are actively in the playfield
                if (ballA.state !== 'playing' || ballB.state !== 'playing') continue;

                const dx = ballB.x - ballA.x;
                const dy = ballB.y - ballA.y;
                const distance = Math.hypot(dx, dy);
                const minDistance = ballA.radius + ballB.radius;

                if (distance < minDistance) {
                    playSound('bounce', 0.2);
                    // 1. Resolve overlap
                    const overlap = (minDistance - distance) / 2;
                    const nx = dx / distance;
                    const ny = dy / distance;
                    ballA.x -= nx * overlap;
                    ballA.y -= ny * overlap;
                    ballB.x += nx * overlap;
                    ballB.y += ny * overlap;

                    // 2. Elastic collision response (for equal mass balls)
                    const tx = -ny;
                    const ty = nx;

                    const dpTanA = ballA.vx * tx + ballA.vy * ty;
                    const dpTanB = ballB.vx * tx + ballB.vy * ty;
                    const dpNormA = ballA.vx * nx + ballA.vy * ny;
                    const dpNormB = ballB.vx * nx + ballB.vy * ny;
                    
                    // New normal velocities after collision
                    const vNormA_new = dpNormB;
                    const vNormB_new = dpNormA;
                    
                    ballA.vx = tx * dpTanA + nx * vNormA_new;
                    ballA.vy = ty * dpTanA + ny * vNormA_new;
                    ballB.vx = tx * dpTanB + nx * vNormB_new;
                    ballB.vy = ty * dpTanB + ny * vNormB_new;
                }
            }
        }
    }

    function handleFlipperCollision(ball, flipper) {
        const targetAngle = flipper.active ? flipper.activeAngle : flipper.baseAngle;
        const x1 = flipper.x, y1 = flipper.y;
        const x2 = x1 + Math.cos(flipper.angle) * flipper.length;
        const y2 = y1 + Math.sin(flipper.angle) * flipper.length;
        const dx = x2 - x1, dy = y2 - y1;
        const lineLengthSq = dx * dx + dy * dy;
        let t = ((ball.x - x1) * dx + (ball.y - y1) * dy) / lineLengthSq;
        t = Math.max(0, Math.min(1, t));
        const closestX = x1 + t * dx, closestY = y1 + t * dy;
        const dist = Math.hypot(ball.x - closestX, ball.y - closestY);

        if (dist < ball.radius + flipper.width / 2) {
            playSound('bounce', 0.8);
            const overlap = (ball.radius + flipper.width / 2) - dist;
            const normalX = ball.x - closestX, normalY = ball.y - closestY;
            const magnitude = Math.hypot(normalX, normalY) || 1;
            const nx = normalX / magnitude, ny = normalY / magnitude;
            ball.x += nx * overlap; ball.y += ny * overlap;
            const dotProduct = ball.vx * nx + ball.vy * ny;
            const bounce = 0.4;
            ball.vx = (ball.vx - 2 * dotProduct * nx) * bounce;
            ball.vy = (ball.vy - 2 * dotProduct * ny) * bounce;
            if (flipper.active && Math.abs(flipper.angle - targetAngle) > 0.01) {
                ball.vy -= 16;
                ball.vx += (ball.x - flipper.x) * 0.18;
            }
            const now = performance.now();
            ball.recentFlipperBounces.push(now);
            ball.recentFlipperBounces = ball.recentFlipperBounces.filter(timestamp => now - timestamp < FLIPPER_ANTI_STUCK_TIME_WINDOW);
            if (ball.recentFlipperBounces.length >= FLIPPER_ANTI_STUCK_COUNT) {
                ball.vy -= FLIPPER_ANTI_STUCK_BOOST; 
                ball.vx += flipper.isRight ? -2 : 2; 
                ball.recentFlipperBounces = []; 
            }
        }
    }

    // MODIFIED: Slope collision uses a "capsule" model for robustness
    function handleSlopeCollisions(ball) {
        const ANTI_STUCK_BOOST = 6;
        const ANTI_STUCK_COUNT = 5;
        const ANTI_STUCK_TIME_WINDOW = 1000;
        const slopeRadius = SLOPE_LINE_WIDTH / 2; // Physical radius of the slope line

        slopes.forEach(slope => {
            const dx = slope.x2 - slope.x1; const dy = slope.y2 - slope.y1;
            const lineLengthSq = dx * dx + dy * dy;
            let t = ((ball.x - slope.x1) * dx + (ball.y - slope.y1) * dy) / lineLengthSq;
            t = Math.max(0, Math.min(1, t));
            const closestX = slope.x1 + t * dx; const closestY = slope.y1 + t * dy;
            const dist = Math.hypot(ball.x - closestX, ball.y - closestY);
            
            if (dist < ball.radius + slopeRadius) { // Check collision with the fatter slope
                playSound('bounce', 0.4);
                const overlap = (ball.radius + slopeRadius) - dist;
                const normalX = ball.x - closestX; const normalY = ball.y - closestY;
                const magnitude = Math.hypot(normalX, normalY) || 1;
                const nx = normalX / magnitude; const ny = normalY / magnitude;
                ball.x += nx * overlap; ball.y += ny * overlap;
                const dotProduct = ball.vx * nx + ball.vy * ny;
                ball.vx = (ball.vx - 2 * dotProduct * nx) * BOUNCE_FACTOR;
                ball.vy = (ball.vy - 2 * dotProduct * ny) * BOUNCE_FACTOR;
                const now = performance.now();
                ball.recentSlopeBounces.push(now);
                ball.recentSlopeBounces = ball.recentSlopeBounces.filter(timestamp => now - timestamp < ANTI_STUCK_TIME_WINDOW);
                if (ball.recentSlopeBounces.length >= ANTI_STUCK_COUNT) {
                    ball.vx += nx * ANTI_STUCK_BOOST;
                    ball.vy += ny * ANTI_STUCK_BOOST;
                    ball.recentSlopeBounces = [];
                }
            }
        });
    }

    function endGame() {
        clearTimeout(botActivationTimer);
        clearInterval(botCountdownInterval);
        clearTimeout(botLaunchTimerId);
        botActivationTimer = null;
        botCountdownInterval = null;
        botLaunchTimerId = null;

        gameState = 'gameOver';
        finalScoreEl.textContent = score;
        gameOverScreen.classList.remove('hidden');
    }

    function updateUI() {
        scoreEl.textContent = score;
        attemptsEl.textContent = ballsLeft;
    }

    function draw() {
        const isLightMode = document.body.classList.contains('light-mode');
        const mainColor = isLightMode ? '#333' : '#999';
        const flipperColor = isLightMode ? '#888' : '#bbbbbb';
        const flipperShadow = isLightMode ? '#555' : '#fff';
        const ballColor = isLightMode ? '#444' : '#c0c0c0';
        const ballStroke = isLightMode ? '#222' : '#f0f0f0';
        const ballShadow = isLightMode ? '#777' : '#fff';

        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        
        // MODIFIED: Draw slopes 3x fatter
        ctx.strokeStyle = mainColor; ctx.lineWidth = SLOPE_LINE_WIDTH; ctx.shadowColor = mainColor; ctx.shadowBlur = 10;
        ctx.lineCap = 'round'; // Makes the ends of the fat lines rounded
        slopes.forEach(slope => { ctx.beginPath(); ctx.moveTo(slope.x1, slope.y1); ctx.lineTo(slope.x2, slope.y2); ctx.stroke(); });
        ctx.shadowBlur = 0; ctx.lineCap = 'butt';

        bumpers.forEach(bumper => {
            ctx.beginPath(); ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
            ctx.fillStyle = mainColor; ctx.shadowColor = mainColor; ctx.shadowBlur = 10;
            ctx.fill();
        });
        ctx.shadowBlur = 0;

        function drawFlipper(flipper) {
            ctx.save();
            ctx.translate(flipper.x, flipper.y); ctx.rotate(flipper.angle);
            ctx.beginPath(); ctx.rect(0, -flipper.width / 2, flipper.length, flipper.width);
            ctx.fillStyle = flipperColor; ctx.shadowColor = flipperShadow; ctx.shadowBlur = 10;
            ctx.fill();
            ctx.restore(); ctx.shadowBlur = 0;
        }
        drawFlipper(leftFlipper);
        drawFlipper(rightFlipper);
        
        ctx.fillStyle = isLightMode ? '#ddd' : '#222';
        ctx.fillRect(PLAYFIELD_WIDTH, 0, CHUTE_WIDTH, CANVAS_HEIGHT);
        ctx.strokeStyle = mainColor; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PLAYFIELD_WIDTH, 0); ctx.lineTo(PLAYFIELD_WIDTH, CANVAS_HEIGHT); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PLAYFIELD_WIDTH, CHUTE_EXIT_Y + 50); ctx.quadraticCurveTo(PLAYFIELD_WIDTH, CHUTE_EXIT_Y, PLAYFIELD_WIDTH - 30, CHUTE_EXIT_Y); ctx.stroke();
        const plungerY = launcher.y - launcher.power;
        ctx.fillStyle = isLightMode ? '#aaa' : '#ccc';
        ctx.fillRect(launcher.x - launcher.width / 2, plungerY, launcher.width, launcher.height);
        
        balls.forEach(ball => {
            if (ball.state === 'ready' || ball.state === 'launching' || ball.state === 'playing') {
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                ctx.fillStyle = ballColor; ctx.strokeStyle = ballStroke; ctx.lineWidth = 2;
                ctx.shadowColor = ballShadow; ctx.shadowBlur = 10;
                ctx.fill(); ctx.stroke();
                ctx.shadowBlur = 0;
            }
        });

        if (gameState === 'launch' && launcher.charging) {
            ctx.fillStyle = isLightMode ? 'rgba(255, 100, 0, 0.7)' : 'rgba(255, 255, 0, 0.7)';
            ctx.fillRect(launcher.x + launcher.width, launcher.y, 5, -launcher.power * (150 / launcher.maxPower));
        }

        if (botModeActive) {
            ctx.save();
            ctx.font = 'bold 50px "Courier New", Courier, monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.shadowBlur = 5;

            if (isLightMode) {
                ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
                ctx.shadowColor = 'rgba(255, 255, 255, 0.7)';
            } else {
                ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
                ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
            }
            
            ctx.fillText('BOT MODE ACTIVE', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2);
            ctx.restore();
        }
    }

    function gameLoop() {
        update();
        draw();
        if (gameState !== 'gameOver') {
            requestAnimationFrame(gameLoop);
        }
    }

    initializeGame();
    toggleHelp();
    requestAnimationFrame(gameLoop);
});
