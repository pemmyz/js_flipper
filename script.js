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

    // --- Game State and Constants ---
    let score = 0;
    let ballsLeft = 3;
    let gameState = 'launch';
    let showHelp = false;

    const GRAVITY = 0.15;
    const FRICTION = 0.995;
    const BOUNCE_FACTOR = 0.6;
    const BALL_RADIUS = 10;
    const BUMPER_RADIUS = 10;

    const CHUTE_WIDTH = 50;
    const PLAYFIELD_WIDTH = CANVAS_WIDTH - CHUTE_WIDTH;
    const CHUTE_EXIT_Y = 100; // The Y-coordinate where the ball enters the playfield

    // --- REFACTORED: FLIPPER & SLOPE TUNING CONSTANTS ---
    const FLIPPER_Y_OFFSET = 60;
    const FLIPPER_LENGTH = 85;
    const FLIPPER_REST_ANGLE = Math.PI / 8;
    const FLIPPER_SWING_ANGLE = Math.PI / 3;
    const FLIPPER_GAP = (2 * FLIPPER_LENGTH * Math.cos(FLIPPER_REST_ANGLE)) + 35;

    // --- Sound Effects (Unchanged) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playSound(type, volume = 0.3) {
        if (!audioCtx) return;
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
        helpLegend.classList.add('hidden');
        gameOverScreen.classList.add('hidden');
        balls = [];
        createBumpers();
        createFlippers();
        createSlopes();
        createLauncher();
        prepareNextBall();
    }

    // NEW: Function to prepare a new ball in the launch chute
    function prepareNextBall() {
        if (ballsLeft <= 0) {
            gameState = 'playing'; // No more balls to launch
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
            // NEW: State machine for ball lifecycle
            state: 'ready' // 'ready', 'launching', 'playing'
        };
        balls.push(newBall);
        launcher.power = 0;
        gameState = 'launch';
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
        const leftPivotX = PLAYFIELD_WIDTH / 2 - FLIPPER_GAP / 2;
        const rightPivotX = PLAYFIELD_WIDTH / 2 + FLIPPER_GAP / 2;
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

    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyH') { toggleHelp(); return; }
        if (showHelp) return;
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
                ballToLaunch.state = 'launching'; // NEW: Set to launching state
                playSound('launch');
                prepareNextBall();
            }
        }
    });

    restartButton.addEventListener('click', initializeGame);
    closeHelpButton.addEventListener('click', toggleHelp);

    function update() {
        if (showHelp || gameState === 'gameOver') return;

        updateFlipper(leftFlipper);
        updateFlipper(rightFlipper);

        for (let i = balls.length - 1; i >= 0; i--) {
            const ball = balls[i];

            // --- NEW: State-based physics ---
            switch (ball.state) {
                case 'ready':
                    // Ball is sitting on the plunger, its Y is controlled by launch power
                    if (launcher.charging && launcher.power < launcher.maxPower) {
                        launcher.power += 1;
                    }
                    ball.y = launcher.y - launcher.power;
                    break;

                case 'launching':
                    // Ball is traveling up the chute. Only vertical physics apply.
                    ball.vy += GRAVITY;
                    ball.y += ball.vy;
                    ball.x = launcher.x; // Keep it locked in the chute's X position

                    // Check if it reached the top and is moving up
                    if (ball.y < CHUTE_EXIT_Y && ball.vy < 0) {
                        ball.state = 'playing'; // Transition to main playfield
                        ball.vx = -4; // Nudge it left into play
                    }
                    
                    // Check if it fell back down (dud launch)
                    if (ball.y > CANVAS_HEIGHT) {
                        balls.splice(i, 1); // Remove lost ball
                    }
                    break;

                case 'playing':
                    // Ball is in the main playfield, full physics apply.
                    ball.vy += GRAVITY;
                    ball.vx *= FRICTION;
                    ball.vy *= FRICTION;
                    ball.x += ball.vx;
                    ball.y += ball.vy;

                    // Wall collisions
                    if (ball.x + ball.radius > PLAYFIELD_WIDTH) { ball.vx *= -BOUNCE_FACTOR; ball.x = PLAYFIELD_WIDTH - ball.radius; }
                    if (ball.x - ball.radius < 0) { ball.vx *= -BOUNCE_FACTOR; ball.x = ball.radius; }
                    if (ball.y - ball.radius < 0) { ball.vy *= -BOUNCE_FACTOR; ball.y = ball.radius; }

                    // Bumper collisions
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

                    // Flipper and slope collisions
                    handleFlipperCollision(ball, leftFlipper);
                    handleFlipperCollision(ball, rightFlipper);
                    handleSlopeCollisions(ball);

                    // Check if ball has drained
                    if (ball.y > CANVAS_HEIGHT) {
                        balls.splice(i, 1); // Remove drained ball
                    }
                    break;
            }
        }

        updateUI();

        if (balls.length === 0 && gameState !== 'gameOver') {
            playSound('lose_ball');
            endGame();
        }
    }

    function updateFlipper(flipper) {
        const targetAngle = flipper.active ? flipper.activeAngle : flipper.baseAngle;
        if (Math.abs(flipper.angle - targetAngle) > 0.01) {
            flipper.angle += (targetAngle > flipper.angle ? 1 : -1) * flipper.speed;
            if (flipper.active && Math.abs(flipper.angle - targetAngle) < flipper.speed) playSound('flipper', 0.2);
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
                ball.vy -= 12;
                ball.vx += (ball.x - flipper.x) * 0.15;
            }
        }
    }

    function handleSlopeCollisions(ball) {
        slopes.forEach(slope => {
            const dx = slope.x2 - slope.x1, dy = slope.y2 - slope.y1;
            const lineLengthSq = dx * dx + dy * dy;
            let t = ((ball.x - slope.x1) * dx + (ball.y - slope.y1) * dy) / lineLengthSq;
            t = Math.max(0, Math.min(1, t));
            const closestX = slope.x1 + t * dx, closestY = slope.y1 + t * dy;
            const dist = Math.hypot(ball.x - closestX, ball.y - closestY);
            if (dist < ball.radius) {
                playSound('bounce', 0.4);
                const overlap = ball.radius - dist;
                const normalX = ball.x - closestX, normalY = ball.y - closestY;
                const magnitude = Math.hypot(normalX, normalY) || 1;
                const nx = normalX / magnitude, ny = normalY / magnitude;
                ball.x += nx * overlap; ball.y += ny * overlap;
                const dotProduct = ball.vx * nx + ball.vy * ny;
                ball.vx = (ball.vx - 2 * dotProduct * nx) * BOUNCE_FACTOR;
                ball.vy = (ball.vy - 2 * dotProduct * ny) * BOUNCE_FACTOR;
            }
        });
    }

    function endGame() {
        gameState = 'gameOver';
        finalScoreEl.textContent = score;
        gameOverScreen.classList.remove('hidden');
    }

    function updateUI() {
        scoreEl.textContent = score;
        attemptsEl.textContent = ballsLeft;
    }

    function draw() {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        drawSlopes();
        drawBumpers();
        drawFlippers();
        drawLauncherAndChute(); // Draws the chute and the ball inside it
        
        // Draw all balls that are in the main playfield
        balls.forEach(ball => {
            if (ball.state === 'playing') {
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                ctx.fillStyle = '#c0c0c0'; ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 2;
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
                ctx.fill(); ctx.stroke();
                ctx.shadowBlur = 0;
            }
        });
    }

    function drawBumpers() {
        bumpers.forEach(bumper => {
            ctx.beginPath(); ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#999999'; ctx.shadowColor = '#999999'; ctx.shadowBlur = 10;
            ctx.fill();
        });
        ctx.shadowBlur = 0;
    }

    function drawFlipper(flipper) {
        ctx.save();
        ctx.translate(flipper.x, flipper.y); ctx.rotate(flipper.angle);
        ctx.beginPath(); ctx.rect(0, -flipper.width / 2, flipper.length, flipper.width);
        ctx.fillStyle = '#bbbbbb'; ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore(); ctx.shadowBlur = 0;
    }

    function drawFlippers() {
        drawFlipper(leftFlipper);
        drawFlipper(rightFlipper);
    }

    function drawSlopes() {
        ctx.strokeStyle = '#999'; ctx.lineWidth = 4; ctx.shadowColor = '#999'; ctx.shadowBlur = 5;
        slopes.forEach(slope => {
            ctx.beginPath(); ctx.moveTo(slope.x1, slope.y1); ctx.lineTo(slope.x2, slope.y2);
            ctx.stroke();
        });
        ctx.shadowBlur = 0;
    }

    function drawLauncherAndChute() {
        ctx.fillStyle = '#222';
        ctx.fillRect(PLAYFIELD_WIDTH, 0, CHUTE_WIDTH, CANVAS_HEIGHT);
        ctx.strokeStyle = '#999'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(PLAYFIELD_WIDTH, 0); ctx.lineTo(PLAYFIELD_WIDTH, CANVAS_HEIGHT); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(PLAYFIELD_WIDTH, CHUTE_EXIT_Y + 50); ctx.quadraticCurveTo(PLAYFIELD_WIDTH, CHUTE_EXIT_Y, PLAYFIELD_WIDTH - 30, CHUTE_EXIT_Y); ctx.stroke();
        
        const plungerY = launcher.y - launcher.power;
        ctx.fillStyle = '#ccc';
        ctx.fillRect(launcher.x - launcher.width / 2, plungerY, launcher.width, launcher.height);

        // Draw any ball that is 'ready' or 'launching'
        balls.forEach(ball => {
            if (ball.state === 'ready' || ball.state === 'launching') {
                ctx.beginPath();
                ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
                ctx.fillStyle = '#c0c0c0'; ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 2;
                ctx.shadowColor = '#fff'; ctx.shadowBlur = 10;
                ctx.fill(); ctx.stroke();
                ctx.shadowBlur = 0;
            }
        });

        if (gameState === 'launch' && launcher.charging) {
            ctx.fillStyle = 'rgba(255, 255, 0, 0.7)';
            ctx.fillRect(launcher.x + launcher.width, launcher.y, 5, -launcher.power * (150 / launcher.maxPower));
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
    requestAnimationFrame(gameLoop);
});
