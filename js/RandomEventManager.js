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

        return result;
    }
};
