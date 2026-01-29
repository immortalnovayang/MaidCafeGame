const RandomEventManager = {
    initEventManager() {
        this.activeEvent = null;
        this.eventsHistory = []; // Full history of triggered events
        this.recentEventIds = []; // IDs of the last N events to avoid repetition
        this.eventPool = this.events || [];
    },

    triggerDailyEvent(day) {
        this.clearDailyEvent();

        const startDay = this.config.eventStartDay || 3;
        console.log(`[EventCheck] Day: ${day}, StartDay: ${startDay}`);

        if (day < startDay) {
            console.log(`[EventCheck] Day ${day} < ${startDay}, skipping.`);
            return null;
        }

        // Filter valid events by day requirement
        let validEvents = this.eventPool.filter(e => day >= e.minDay);

        // Avoid repeating the last few events (e.g., last 3)
        const cooldownCount = 3;
        if (validEvents.length > cooldownCount) {
            validEvents = validEvents.filter(e => !this.recentEventIds.includes(e.id));
        }

        console.log(`[EventCheck] Valid events count: ${validEvents.length} (Excluded: ${this.recentEventIds.join(', ')})`);

        // Simple weighted random
        const totalWeight = validEvents.reduce((sum, e) => sum + e.weight, 0);
        let r = Math.random() * totalWeight;

        let selected = null;
        for (const e of validEvents) {
            r -= e.weight;
            if (r <= 0) {
                selected = e;
                break;
            }
        }

        if (selected) {
            this.activeEvent = selected;

            // Add to history and maintain cooldown list
            this.eventsHistory.push({ id: selected.id, day: day });
            this.recentEventIds.push(selected.id);
            if (this.recentEventIds.length > 3) { // Keep last 3 in cooldown
                this.recentEventIds.shift();
            }

            if (selected.id === 'evt_robbery') {
                const hasMidori = this.maids.some(m => m.id === 'maid_midori' && m.employmentStatus === 'ACTIVE');
                const hasNora = this.maids.some(m => m.id === 'maid_nora' && m.employmentStatus === 'ACTIVE');

                if (hasMidori || hasNora) {
                    const fightChoice = selected.choices.find(c => c.action === 'robbery_fight');
                    if (fightChoice) {
                        let bonusText = "";
                        if (hasMidori) bonusText += "小翠";
                        if (hasNora) bonusText += (bonusText ? "&" : "") + "諾拉"; // e.g. 小翠&諾拉
                        fightChoice.text = `把它打出去！(勝率UP! ${bonusText}在場)`;
                        fightChoice.bonus = true; // Flag for internal logic
                    }
                }
            }

            console.log(`Event Triggered: ${selected.title}`);
            return selected;
        }
        return null;
    },

    applyEventEffects(gameState) {
        if (!this.activeEvent) return;
        const e = this.activeEvent;
        const effects = e.effects || {};

        if (effects.spawnRateMod) gameState.spawnRateMod = (gameState.spawnRateMod || 0) + effects.spawnRateMod;
        if (effects.patienceDecayMod) gameState.patienceDecayMod = (gameState.patienceDecayMod || 1.0) * effects.patienceDecayMod;
        if (effects.incomeMod) gameState.incomeMod = (gameState.incomeMod || 1.0) * effects.incomeMod;
        if (effects.tipMod) gameState.tipMod = (gameState.tipMod || 1.0) * effects.tipMod;
        if (effects.eatTimeMod) gameState.eatTimeMod = (gameState.eatTimeMod || 1.0) * effects.eatTimeMod;
        if (effects.maidSpeedMod) gameState.maidSpeedMod = (gameState.maidSpeedMod || 1.0) * effects.maidSpeedMod;
        if (effects.trashProbMod) gameState.trashProbMod = (gameState.trashProbMod || 1.0) * effects.trashProbMod;
        if (effects.disableAutomation) gameState.disableAutomation = true;

        // Pass special flags
        if (effects.checkTrash) gameState.checkTrash = true;
        if (effects.specialGoal) gameState.specialGoal = effects.specialGoal;

        // Special logic handled in specific systems (e.g. Hill check for inflation in Economy)
    },

    clearDailyEvent() {
        this.activeEvent = null;
        // Reset modifiers logic will be handled by GameState resetting daily mods
    },

    // Handle decision outcomes
    handleDecision(action, gameState) {
        const result = { success: true, message: "" };

        if (action === 'salesman_buy') {
            if (gameState.gold < 500) return { success: false, message: "金幣不足！" };
            gameState.gold -= 500;

            const rand = Math.random();
            if (rand < 0.4) {
                // Good: Full Heal
                gameState.maids.forEach(m => m.stamina = m.maxStamina);
                result.message = "女僕們喝了飲料，體力完全恢復了！✨";
            } else if (rand < 0.7) {
                // Good: Speed Buff
                gameState.maids.forEach(m => m.workSpeedBonus = (m.workSpeedBonus || 0) + 0.5); // Temp boost
                result.message = "這飲料勁頭真大！大家工作速度變快了！⚡";
            } else {
                // Bad: Sick
                gameState.maids.forEach(m => m.stamina = Math.max(0, m.stamina - 50));
                result.message = "糟糕...這飲料過期了，大家肚子痛。(體力-50) 🤢";
            }
        } else if (action === 'salesman_deny') {
            result.message = "你拒絕了推銷員，平靜的一天。";
        }
        // [Robbery Event Logic]
        else if (action === 'robbery_pay') {
            if (gameState.gold < 500) return { success: false, message: "金幣不足...你只能眼睜睜看著他砸店...(損失$1000)" }; // Handle bankruptcy case if needed, but assuming check happens
            // Assuming sufficient gold or debt
            if (gameState.gold >= 500) {
                gameState.gold -= 500;
                gameState.reputation = Math.max(0, gameState.reputation - 5);
                result.message = "你給了強盜 $500。他離開了，但大家覺得你有點軟弱。(名聲 -5)";
            } else {
                gameState.gold -= 1000;
                result.message = "你拿不出錢，強盜生氣地砸壞了櫃檯！(維修費 -$1000)";
            }
        } else if (action === 'robbery_police') {
            const rand = Math.random(); // 0.0 to 1.0
            if (rand < 0.6) { // 60% Success
                gameState.reputation += 10;
                result.message = "警察及時趕到！強盜被逮捕了，社區居民對你讚賞有加！(名聲 +10)";
            } else { // 40% Fail
                gameState.gold -= 1000;
                result.message = "警察太慢來了...強盜發現你在報警，憤怒地砸店後逃跑。(損失 $1000)";
            }
        } else if (action === 'robbery_fight') {
            // Check bonuses
            const hasMidori = gameState.maids.some(m => m.id === 'maid_midori' && m.employmentStatus === 'ACTIVE');
            const hasNora = gameState.maids.some(m => m.id === 'maid_nora' && m.employmentStatus === 'ACTIVE');

            let winRate = 0.4;
            let bonusMsg = "";
            if (hasMidori) { winRate += 0.2; bonusMsg += "小翠"; }
            if (hasNora) { winRate += 0.2; bonusMsg += "諾拉"; }

            const rand = Math.random();
            if (rand < winRate) {
                gameState.gold += 500;
                gameState.reputation += 20;
                result.message = `勝利！${bonusMsg ? bonusMsg + "大顯神威！" : ""}大家合力把強盜打得落花流水！還從他身上搜出了 $500！(名聲 +20)`;
            } else {
                gameState.gold -= 800;
                gameState.maids.forEach(m => m.stamina = Math.max(0, m.stamina - 50));
                result.message = "失敗...強盜太強了，女僕們都受了傷 (體力-50)，店裡也被搶走了 $800。";
                result.success = false;
            }
        }

        return result;
    }
};
