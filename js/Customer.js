class Customer {
    constructor(id) {
        this.id = id;
        this.state = 'ENTERING'; // ENTERING, QUEUEING, WALKING, SEATED, ORDERING, WAITING_FOOD, EATING, PAYING, LEAVING
        this.table = null;

        // Position - will be set by GameState based on door position
        this.x = 0;
        this.y = 0;
        this.targetX = 0;
        this.targetY = 0;
        this.speed = GameState.getInstance().baseCustomerSpeed || 80; // px per second
        this.queueIndex = -1; // Position in queue (-1 = not queuing)
        this.exitPos = { x: 0, y: 0 }; // Will be set by GameState

        // Stats
        this.patience = 100;
        this.maxPatience = 100;
        this.emoji = "🙂"; // Default

        // Timers (seconds)
        const gs = GameState.getInstance();
        this.orderTime = Math.max(0, gs.customerOrderTime || 3);
        this.eatTime = Math.max(0, gs.customerEatTime || 5);
        this.timer = 0;

        this.needsServing = false;
        this.ratingRecorded = false;
        this.recordedRating = 0;
    }

    assignTable(table) {
        this.table = table;
        this.queueIndex = -1; // No longer in queue

        // If already inside or walking, go to table
        // If still entering, update() will switch to WALKING after reaching door
        if (this.state !== 'ENTERING') {
            this.state = 'WALKING';
            this.targetX = table.x + 25; // Offset to center
            this.targetY = table.y + 25;

            // [New] Seating Relief: Recover more patience
            const baseRelief = 30;
            const bonus = GameState.getInstance().seatingReliefBonus || 0;
            this.patience = Math.min(this.maxPatience, this.patience + baseRelief + bonus);
            this.emoji = "✨"; // Show relief effect
        }
        console.log(`Customer ${this.id} assigned to Table ${table.id}. Patience now: ${this.patience.toFixed(1)}`);
    }

    update(dt) {
        // Movement Logic for all moving states
        const movingStates = ['ENTERING', 'QUEUEING', 'WALKING', 'LEAVING'];
        if (movingStates.includes(this.state)) {
            const dx = this.targetX - this.x;
            const dy = this.targetY - this.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            const moveDist = this.speed * dt;
            if (dist > 1 && moveDist < dist) {
                this.x += (dx / dist) * moveDist;
                this.y += (dy / dist) * moveDist;
            } else {
                this.x = this.targetX;
                this.y = this.targetY;

                // State transitions after arriving
                if (this.state === 'ENTERING') {
                    // Once reached door, if already assigned table, go to walking
                    if (this.table) {
                        this.state = 'WALKING';
                        this.targetX = this.table.x + 25;
                        this.targetY = this.table.y + 25;
                    }
                } else if (this.state === 'WALKING') {
                    this.state = 'SEATED';
                    this.timer = this.orderTime;
                    this.emoji = "🤔"; // Thinking/Ordering
                }
            }
        }

        // Patience decay based on state (from planning doc)
        const gs = GameState.getInstance();
        const globalMod = gs.patienceDecayMod || 1.0;

        let decayRate = 0;
        if (this.state === 'QUEUEING') decayRate = 1.0;
        else if (['ORDERING', 'WAITING_FOOD'].includes(this.state)) decayRate = 1.0;
        else if (this.state === 'PAYING') decayRate = 5.0 * (gs.payStressMod || 1.0); // Modifiable via upgrades
        else if (this.state === 'SEATED') decayRate = 0.5;

        if (decayRate > 0) {
            let finalDecay = decayRate * globalMod;

            // [Trash Penalty] +5% decay per trash
            const trashCount = gs.trash ? gs.trash.length : 0;
            if (trashCount > 0) {
                finalDecay *= (1 + (trashCount * 0.05));
            }

            // [Rei & Queue Upgrades]
            if (this.state === 'QUEUEING') {
                // Check if Rei is hired (Rei ID is maid_rei)
                const hasRei = gs.maids.some(m => m.id === 'maid_rei');
                if (hasRei) {
                    const reiSkill = gs.skills.find(s => s.id === 'skill_rei');
                    if (reiSkill && reiSkill.effect && reiSkill.effect.stat === 'queuePatienceMod') {
                        finalDecay *= reiSkill.effect.value; // Reduces decay (e.g. * 0.3)
                    }
                }

                // [VIP Couch] Apply to all in queue
                finalDecay *= (gs.queuePatienceMod || 1.0);
            }

            this.patience -= dt * finalDecay;
            if (this.patience <= 0) {
                this.leave(false);
            }
        }

        // State Logic
        switch (this.state) {
            case 'SEATED':
                this.timer -= dt;
                if (this.timer <= 0) {
                    this.state = 'ORDERING';
                    this.needsServing = true;
                    this.timer = Math.max(0, this.orderTime * (1 - (gs.orderTimeReduction || 0)));
                    this.emoji = "💬";
                }
                break;
            case 'EATING':
                this.timer -= dt;
                if (this.timer <= 0) {
                    this.state = 'PAYING';
                    this.needsServing = true;
                    this.emoji = "💰";
                }
                break;
        }
    }

    // Called when Maid interacts
    interact(maidAction, sourceMaid) {
        const gs = GameState.getInstance();

        switch (this.state) {
            case 'ORDERING':
                if (maidAction === 'take_order') {
                    this.state = 'WAITING_FOOD';
                    this.needsServing = false;
                    this.emoji = "⏳";
                    return 'order_taken';
                }
                break;
            case 'WAITING_FOOD':
                if (maidAction === 'serve_food') {
                    this.state = 'EATING';
                    // [Policy] Standing Policy: Eat 2x faster
                    let effectiveEatTime = this.eatTime * (1 - (gs.eatTimeReduction || 0));

                    // [Event] Eat Time Modifier (e.g. Festival)
                    if (gs.eatTimeMod) effectiveEatTime /= gs.eatTimeMod;

                    if (gs.policyStandEat) effectiveEatTime /= 2;
                    this.timer = Math.max(0, effectiveEatTime);
                    this.emoji = "😋";

                    // [Hill] Golden Food Logic
                    const extraMods = {};
                    if (sourceMaid && sourceMaid.skillId === 'skill_hill') {
                        const skill = gs.skills.find(s => s.id === 'skill_hill');
                        if (skill && skill.effect && Math.random() < (skill.effect.chance || 0.2)) {
                            extraMods.foodValueMultiplier = skill.effect.multiplier || 5.0;
                            this.emoji = "🌟🥘"; // Special emoji for golden food
                            console.log("Hill cooked GOLDEN FOOD! Value x5!");
                        }
                    }

                    return { type: 'food_served', extraMods };
                }
                break;
            case 'PAYING':
                if (maidAction === 'checkout') {
                    const rating = this.calculateRating();
                    const extraMods = {};

                    // [Lisa] Tip Bonus Logic
                    if (sourceMaid && sourceMaid.skillId === 'skill_lisa') {
                        const skill = gs.skills.find(s => s.id === 'skill_lisa');
                        if (skill && skill.effect && skill.effect.stat === 'tipBonus') {
                            extraMods.tipMod = 1 + skill.effect.value;
                            console.log("Lisa checkout: +20% Tip Bonus applied!");
                        }
                    }

                    this.leave(true);
                    return { type: 'paid', rating: rating, x: this.x, y: this.y, patience: this.patience, servedByAutomation: this.servedByAutomation, ...extraMods };
                }
                break;
        }
        return null;
    }

    calculateRating() {
        if (this.patience >= 80) return 5;
        if (this.patience >= 50) return 4;
        if (this.patience >= 20) return 3;
        return 2;
    }

    leave(happy) {
        if (this.state === 'LEAVING') return 1;

        const rating = happy ? this.calculateRating() : 1;
        this.recordedRating = rating;
        this.state = 'LEAVING';
        // Walk back to exit point (set by GameState)
        this.targetX = this.exitPos.x;
        this.targetY = this.exitPos.y;
        this.emoji = happy ? "🥰" : "😡";

        // Trash Spawning Logic
        // Configurable chance to drop trash when leaving (higher if angry?)
        const gs = GameState.getInstance();

        // [Void Roomba] If active, trash is instantly consumed (not spawned)
        if (gs.roomba > 0) {
            // No trash spawned
        } else {
            // [Scheme C] Trash Spawn with Chance
            const baseChance = gs.trashSpawnChance || 0.3;
            if (Math.random() < (baseChance * (gs.trashProbMod || 1.0))) {
                gs.spawnTrash(this.x, this.y);
            }
        }

        if (this.table) {
            this.table.leave();
            this.table = null;
        }

        return rating;
    }
}
