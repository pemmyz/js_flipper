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
    
    // --- MODIFIED --- Physics constants adjusted for slower ball movement.
    const GRAVITY = 0.15;        // Lower gravity makes the ball feel heavier and fall slower.
    const FRICTION = 0.995;      // More friction (lower number) slows the ball down faster.
    const BOUNCE_FACTOR = 0.6;
    const BALL_RADIUS = 10;
    const BUMPER_RADIUS = 10;
    
    const CHUTE_WIDTH = 50;
    const PLAYFIELD_WIDTH = CANVAS_WIDTH - CHUTE_WIDTH;

    // --- Sound Effects (Unchanged) ---
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playSound(type, volume = 0.3) {
        if (!audioCtx) return;
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        if (type === 'launch') {
            oscillator.type = 'sine';
            oscillator.frequency.setValueAtTime(100, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(1000, audioCtx.currentTime + 0.1);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3);
        } else if (type === 'bounce') {
            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(400 + Math.random() * 200, audioCtx.currentTime);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.15);
        } else if (type === 'flipper') {
             oscillator.type = 'square';
             oscillator.frequency.setValueAtTime(150, audioCtx.currentTime);
             gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.08);
        } else if (type === 'lose_ball') {
            oscillator.type = 'sawtooth';
            oscillator.frequency.setValueAtTime(200, audioCtx.currentTime);
            oscillator.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.5);
            gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.6);
        }
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.8);
    }

    // --- Game Objects ---
    let ball = {};
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
        updateUI();
        gameOverScreen.classList.add('hidden');
        
        createBumpers();
        createFlippers();
        createSlopes();
        createLauncher();
        resetBall();
    }
    
    function resetBall() {
        ball = {
            x: PLAYFIELD_WIDTH + CHUTE_WIDTH / 2,
            y: launcher.y,
            radius: BALL_RADIUS,
            vx: 0,
            vy: 0,
        };
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
        const flipperBaseY = CANVAS_HEIGHT - 50;
        const flipperLength = 85;
        const flipperSpeed = 0.4;
        const flipperGap = 50;
        
        leftFlipper = {
            x: PLAYFIELD_WIDTH / 2 - flipperGap, y: flipperBaseY,
            length: flipperLength, angle: Math.PI / 6,
            baseAngle: Math.PI / 6, activeAngle: -Math.PI / 6,
            speed: flipperSpeed, active: false,
            width: 15, isRight: false
        };
        rightFlipper = {
            x: PLAYFIELD_WIDTH / 2 + flipperGap, y: flipperBaseY,
            length: flipperLength,
            baseAngle: Math.PI - Math.PI / 6, activeAngle: Math.PI + Math.PI / 6,
            speed: flipperSpeed, active: false,
            width: 15, isRight: true
        };
    }
    
    function createLauncher() {
        launcher = {
            x: PLAYFIELD_WIDTH + CHUTE_WIDTH / 2,
            y: CANVAS_HEIGHT - 30,
            width: 20, height: 50,
            // --- MODIFIED --- Reduced maxPower for a much softer launch.
            power: 0, maxPower: 20, charging: false
        };
    }
    
    function createSlopes() {
        slopes.length = 0;
        slopes.push({ x1: 0, y1: 500, x2: leftFlipper.x, y2: leftFlipper.y });
        slopes.push({ x1: PLAYFIELD_WIDTH, y1: 500, x2: rightFlipper.x, y2: rightFlipper.y });
    }

    function toggleHelp() {
        showHelp = !showHelp;
        helpLegend.classList.toggle('hidden');
    }

    // --- Input Handling ---
    window.addEventListener('keydown', (e) => {
        if (e.code === 'KeyH') {
            toggleHelp();
            return;
        }
        if (showHelp) return;
        if (e.code === 'ArrowLeft') leftFlipper.active = true;
        if (e.code === 'ArrowRight') rightFlipper.active = true;
        if (e.code === 'Space' && gameState === 'launch') {
            launcher.charging = true;
        }
    });

    window.addEventListener('keyup', (e) => {
        if (showHelp) return;
        if (e.code === 'ArrowLeft') leftFlipper.active = false;
        if (e.code === 'ArrowRight') rightFlipper.active = false;
        if (e.code === 'Space' && gameState === 'launch') {
            launcher.charging = false;
            ball.vy = -launcher.power;
            gameState = 'in_chute'; 
            playSound('launch');
        }
    });
    
    restartButton.addEventListener('click', initializeGame);
    closeHelpButton.addEventListener('click', toggleHelp);


    // --- Game Logic (Update) ---
    function update() {
        if (showHelp || gameState === 'gameOver') return;

        if (gameState === 'launch') {
            if (launcher.charging && launcher.power < launcher.maxPower) launcher.power += 1;
            ball.y = launcher.y - launcher.power;
            return;
        }

        if (gameState === 'in_chute') {
            ball.vy += GRAVITY;
            ball.y += ball.vy;
            ball.x = launcher.x;
            if (ball.y < 100 && ball.vy < 0) {
                gameState = 'playing';
                ball.vx = -4; // Slightly slower entry speed
            }
            if (ball.y > CANVAS_HEIGHT) loseBall();
            return;
        }

        if (gameState === 'playing') {
            ball.vy += GRAVITY;
            ball.vx *= FRICTION;
            ball.vy *= FRICTION;
            ball.x += ball.vx;
            ball.y += ball.vy;

            if (ball.x + ball.radius > PLAYFIELD_WIDTH) {
                ball.vx *= -BOUNCE_FACTOR;
                ball.x = PLAYFIELD_WIDTH - ball.radius;
            }
            if (ball.x - ball.radius < 0) {
                ball.vx *= -BOUNCE_FACTOR;
                ball.x = ball.radius;
            }
            if (ball.y - ball.radius < 0) {
                ball.vy *= -BOUNCE_FACTOR;
                ball.y = ball.radius;
            }
            
            bumpers.forEach(bumper => {
                const dx = ball.x - bumper.x;
                const dy = ball.y - bumper.y;
                const distance = Math.hypot(dx, dy);
                if (distance < ball.radius + bumper.radius) {
                    playSound('bounce', 0.5);
                    score += bumper.points;
                    updateUI();
                    const angle = Math.atan2(dy, dx);
                    const overlap = ball.radius + bumper.radius - distance;
                    ball.x += Math.cos(angle) * overlap;
                    ball.y += Math.sin(angle) * overlap;
                    const normalX = dx / distance;
                    const normalY = dy / distance;
                    const dotProduct = (ball.vx * normalX + ball.vy * normalY);
                    ball.vx = (ball.vx - 2 * dotProduct * normalX) * (BOUNCE_FACTOR + 0.3);
                    ball.vy = (ball.vy - 2 * dotProduct * normalY) * (BOUNCE_FACTOR + 0.3);
                }
            });
            
            updateFlipper(leftFlipper);
            updateFlipper(rightFlipper);
            handleFlipperCollision(leftFlipper);
            handleFlipperCollision(rightFlipper);
            handleSlopeCollisions();

            if (ball.y > CANVAS_HEIGHT) loseBall();
        }
    }
    
    function updateFlipper(flipper) {
        const targetAngle = flipper.active ? flipper.activeAngle : flipper.baseAngle;
        if (Math.abs(flipper.angle - targetAngle) > 0.01) {
            if (flipper.angle < targetAngle) flipper.angle += flipper.speed;
            else flipper.angle -= flipper.speed;
            if (flipper.active && Math.abs(flipper.angle - targetAngle) < flipper.speed) playSound('flipper', 0.2);
        }
    }
    function handleFlipperCollision(flipper) {
        const length = flipper.isRight ? -flipper.length : flipper.length;
        const endX = flipper.x + Math.cos(flipper.angle) * length;
        const endY = flipper.y + Math.sin(flipper.angle) * length;
        const dist = Math.hypot(ball.x - endX, ball.y - endY);
        if (dist < ball.radius + flipper.width / 2) {
            const flipperVelocity = (flipper.activeAngle - flipper.baseAngle) * flipper.speed;
            // --- MODIFIED --- Reduced the force of the flipper hit.
            ball.vy = -12 - Math.random() * 3 - Math.abs(flipperVelocity);
            ball.vx += (ball.x - flipper.x) * 0.1;
            playSound('bounce', 0.8);
        }
    }
    function handleSlopeCollisions() {
        slopes.forEach(slope => {
            const dx = slope.x2 - slope.x1;
            const dy = slope.y2 - slope.y1;
            const lineLengthSq = dx * dx + dy * dy;
            let t = ((ball.x - slope.x1) * dx + (ball.y - slope.y1) * dy) / lineLengthSq;
            t = Math.max(0, Math.min(1, t));
            const closestX = slope.x1 + t * dx;
            const closestY = slope.y1 + t * dy;
            const dist = Math.hypot(ball.x - closestX, ball.y - closestY);
            if (dist < ball.radius) {
                playSound('bounce', 0.4);
                const overlap = ball.radius - dist;
                const normalX = ball.x - closestX;
                const normalY = ball.y - closestY;
                const magnitude = Math.hypot(normalX, normalY) || 1;
                const nx = normalX / magnitude;
                const ny = normalY / magnitude;
                ball.x += nx * overlap;
                ball.y += ny * overlap;
                const dotProduct = ball.vx * nx + ball.vy * ny;
                ball.vx = (ball.vx - 2 * dotProduct * nx) * BOUNCE_FACTOR;
                ball.vy = (ball.vy - 2 * dotProduct * ny) * BOUNCE_FACTOR;
            }
        });
    }
    function loseBall() {
        playSound('lose_ball');
        ballsLeft--;
        updateUI();
        if (ballsLeft <= 0) endGame();
        else resetBall();
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

    // --- Rendering (Draw) ---
    function draw() {
        ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
        drawSlopes();
        drawBumpers();
        drawFlippers();
        drawLauncherAndChute();
        
        ctx.beginPath();
        ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
        ctx.fillStyle = '#c0c0c0';
        ctx.strokeStyle = '#f0f0f0';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    // (Unchanged drawing helper functions)
    function drawBumpers() {
        bumpers.forEach(bumper => {
            ctx.beginPath();
            ctx.arc(bumper.x, bumper.y, bumper.radius, 0, Math.PI * 2);
            ctx.fillStyle = '#999999';
            ctx.shadowColor = '#999999';
            ctx.shadowBlur = 10;
            ctx.fill();
        });
        ctx.shadowBlur = 0;
    }
    function drawFlipper(flipper) {
        ctx.save();
        ctx.translate(flipper.x, flipper.y);
        ctx.rotate(flipper.angle);
        const length = flipper.isRight ? -flipper.length : flipper.length;
        ctx.beginPath();
        ctx.rect(0, -flipper.width / 2, length, flipper.width);
        ctx.fillStyle = '#bbbbbb';
        ctx.shadowColor = '#fff';
        ctx.shadowBlur = 10;
        ctx.fill();
        ctx.restore();
        ctx.shadowBlur = 0;
    }
    function drawFlippers() {
        drawFlipper(leftFlipper);
        drawFlipper(rightFlipper);
    }
    function drawSlopes() {
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#999';
        ctx.shadowBlur = 5;
        slopes.forEach(slope => {
            ctx.beginPath();
            ctx.moveTo(slope.x1, slope.y1);
            ctx.lineTo(slope.x2, slope.y2);
            ctx.stroke();
        });
        ctx.shadowBlur = 0;
    }
    function drawLauncherAndChute() {
        ctx.fillStyle = '#222';
        ctx.fillRect(PLAYFIELD_WIDTH, 0, CHUTE_WIDTH, CANVAS_HEIGHT);
        ctx.strokeStyle = '#999';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(PLAYFIELD_WIDTH, 0);
        ctx.lineTo(PLAYFIELD_WIDTH, CANVAS_HEIGHT);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(PLAYFIELD_WIDTH, 150);
        ctx.quadraticCurveTo(PLAYFIELD_WIDTH, 100, PLAYFIELD_WIDTH - 30, 100);
        ctx.stroke();
        ctx.fillStyle = '#ccc';
        const plungerY = launcher.y - launcher.power;
        ctx.fillRect(launcher.x - launcher.width / 2, plungerY, launcher.width, launcher.height);
        if (gameState === 'launch' && launcher.charging) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fillRect(launcher.x - launcher.width / 2 - 10, launcher.y, 5, -launcher.power * 2);
        }
    }

    // --- Main Game Loop ---
    function gameLoop() {
        update();
        draw();
        if (gameState !== 'gameOver') {
            requestAnimationFrame(gameLoop);
        }
    }

    // --- Start Game ---
    initializeGame();
    requestAnimationFrame(gameLoop);
});
