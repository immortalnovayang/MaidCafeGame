class GameLoop {
    constructor(gameState, view) {
        this.gameState = gameState;
        this.view = view;
        this.lastTime = 0;
        this.accumulator = 0;
        this.tickRate = 1000;
        this.frameId = null;
        this.timeScale = 1; // Default 1x
    }

    setTimeScale(scale) {
        this.timeScale = scale;
    }

    start() {
        if (this.frameId) return;
        this.lastTime = performance.now();
        this.frameId = requestAnimationFrame(this.loop.bind(this));
    }

    stop() {
        if (this.frameId) {
            cancelAnimationFrame(this.frameId);
            this.frameId = null;
        }
    }

    loop(timestamp) {
        const deltaTime = timestamp - this.lastTime;
        this.lastTime = timestamp;

        if (this.gameState.status === 'RUNNING') {
            // Convert to seconds
            const dt = (deltaTime / 1000) * this.timeScale;
            if (dt > 0.5) { // Cap lag (relaxed for high speed)
                this.gameState.updateTime(0.016 * this.timeScale);
            } else {
                this.gameState.updateTime(dt);
            }
        }

        this.frameId = requestAnimationFrame(this.loop.bind(this));
    }
}
