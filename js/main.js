// Main Entry Point

document.addEventListener('DOMContentLoaded', async () => {
    const gameState = GameState.getInstance();
    const view = new View();
    const gameLoop = new GameLoop(gameState, view);

    // Initialize Systems
    await gameState.init();
    view.init(gameState, gameLoop);

    // Save/Load UI Logic
    const startBtn = document.getElementById('start-btn');
    const continueBtn = document.getElementById('continue-btn');

    if (SaveManager.hasSave()) {
        continueBtn.style.display = 'block';
        continueBtn.style.margin = '0 auto 10px auto'; // Center the button
        continueBtn.onclick = () => {
            if (SaveManager.loadGame()) {
                view.hideOverlay();
                gameState.startGame();
                // Refresh HUD because hydration might changed stats
                view.updateHUD({
                    time: gameState.time,
                    gold: gameState.gold,
                    day: gameState.day,
                    rep: gameState.reputation,
                    avgRating: gameState.getDailyAverageRating(),
                    rentDay: Math.ceil(gameState.day / 7) * 7,
                    rentAmount: gameState.currentRent
                });
            }
        };

        startBtn.onclick = () => {
            if (confirm("已有存檔進度。確定要開始新遊戲嗎？這將會覆蓋您目前的進度。")) {
                SaveManager.deleteSave();
                view.hideOverlay();
                gameState.startGame();
            }
        };
    } else {
        startBtn.onclick = () => {
            view.hideOverlay();
            gameState.startGame();
        };
    }

    // Wire up Observer
    gameState.subscribe((event, data) => {
        switch (event) {
            case 'time_update':
            case 'hud_update':
                view.updateHUD({
                    time: gameState.time,
                    gold: gameState.gold,
                    day: gameState.day,
                    rep: gameState.reputation,
                    avgRating: gameState.getDailyAverageRating(),
                    rentDay: Math.ceil(gameState.day / 7) * 7,
                    rentAmount: gameState.currentRent
                });
                break;
            case 'gold_gain':
                const color = data.isTotal ? "#f1c40f" : null; // Golden color for queue total
                view.showFloatingText(`+$${data.amount}`, data.x, data.y, color);
                break;
            case 'special_event':
                view.showFloatingText(data.text, data.x, data.y - 20, data.color);
                break;
            case 'day_end':
                view.updateHUD({
                    time: 0,
                    gold: gameState.gold,
                    day: data.day,
                    rep: gameState.reputation,
                    avgRating: 0,
                    rentDay: Math.ceil(gameState.day / 7) * 7,
                    rentAmount: gameState.currentRent
                });

                // Sequential Day End Flow:
                // 1. Show Report
                view.showDayReport(data, () => {
                    // 2. Show Upgrades
                    view.showUpgradeSelection(data.upgrades);
                    // 3. User picking upgrade will trigger showStore() in View.js
                });
                break;
            case 'game_over':
                if (data.reason === 'BANKRUPTCY') {
                    let costDetails = "";
                    if (data.rent > 0) costDetails += `<br>租金: <span style="color:var(--color-accent-pink);">-$${data.rent}</span>`;
                    if (data.totalSalaries > 0) costDetails += `<br>女僕薪資: <span style="color:var(--color-accent-pink);">-$${data.totalSalaries}</span>`;
                    if (data.eventFine > 0) costDetails += `<br>${data.eventFineReason || '活動罰款'}: <span style="color:var(--color-accent-pink);">-$${data.eventFine}</span>`;
                    if (data.facilityCost > 0) costDetails += `<br>設施維護費: <span style="color:var(--color-accent-pink);">-$${data.facilityCost}</span>`;

                    view.showOverlay("經營失敗", `因資產過低破產了！<br>最終資產: <strong style="color:var(--color-accent-pink);">$${data.finalGold}</strong><hr style="border:1px dashed #ccc">${costDetails}`, "重新開始遊戲");
                } else if (data.reason === 'GOAL_NOT_REACHED') {
                    view.showOverlay("合約到期", `30 天合約已滿，但未賺夠 $${data.goal.toLocaleString()}...<br>最終資產: $${data.finalGold.toLocaleString()}`, "重新嘗試");
                }
                document.getElementById('start-btn').onclick = () => location.reload();
                break;
            case 'game_victory':
                view.showOverlay("🎉 萌萌租約達成！", `恭喜！你在 30 天內成功賺到了 $${data.finalGold.toLocaleString()}！<br>現在你成功買下了這間店面，成為真正的老闆！`, "太棒了！");
                document.getElementById('start-btn').onclick = () => location.reload();
                break;
            case 'entities_update':
                view.updateEntities(data);
                break;
            case 'state_change':
                if (data.status === 'RUNNING') {
                    gameLoop.start();
                } else {
                    // gameLoop.stop(); // Optional, depending on if we want animations to pause
                }
                break;
        }
    });

    // Hook into View.showStore to handle "Next Day" transition
    // The View.showStore callback currently calls gameState.startGame() directly.
    // We need to intercept this to show potential events first.
    const originalShowStore = view.showStore.bind(view);
    view.showStore = function (msg, isError) {
        // Call original to render (synchronous)
        originalShowStore(msg, isError);

        // Target the main action button directly
        const btn = document.getElementById('start-btn');
        if (btn) {
            btn.onclick = () => {
                view.hideOverlay();

                // Trigger Event Check
                console.log("[Main] Checking for daily events...");
                const event = gameState.triggerDailyEvent(gameState.day);

                if (event) {
                    console.log("[Main] Event found:", event.title);
                    view.showEventModal(event, () => {
                        view.hideOverlay();
                        gameState.startGame();
                    });
                } else {
                    console.log("[Main] No event triggered.");
                    gameState.startGame();
                }
            };
        } else {
            console.error("[Main] Failed to find start-btn in showStore hook");
        }
    };

    console.log("Maid Cafe Game System Initialized");
});
