class GameState {
    constructor() {
        this.gold = 0;
        this.day = 1;
        this.time = 0;
        this.dayDuration = 60;
        this.config = {};
        this.balance = {}; // Loaded from balance.json
        this.socialComments = {}; // Loaded from social_comments.json
        this.maids = [];
        this.trash = [];
        this.listeners = [];
        this.status = 'INIT';

        // Stats & Evaluation
        this.dailyRatings = [];
        this.weeklyRatings = [];
        this.dailyIncome = 0;
        this.reputation = 0;
        this.week = 1;

        // Progression Tools
        this.rerollLimit = 2;
        this.rerollCurrent = 2;
        this.banishCurrent = 1;
        this.banishedIds = [];
        this.storeItems = [];
        this.purchasedStoreItems = {};
        this.appliedUpgradeIds = [];
        this.rentShieldCount = 0;
        this.incomeMod = 1.0;
        this.rentBase = 2500;
        this.currentRent = 2500;

        this.autoCleanEnabled = true;
        this.customerSpawnTimer = 0;
    }

    static getInstance() {
        if (!GameState.instance) {
            GameState.instance = new GameState();
        }
        return GameState.instance;
    }

    async init() {
        try {
            // Load Configs
            const [configResp, balanceResp, skillsResp, maidsResp, upgradesResp, storeResp, socialResp, eventsResp] = await Promise.all([
                fetch('data/config.json'),
                fetch('data/balance.json'),
                fetch('data/skills.json'),
                fetch('data/maids.json'),
                fetch('data/upgrades.json'),
                fetch('data/store.json'),
                fetch('data/social_comments.json'),
                fetch('data/events.json')
            ]);

            this.config = await configResp.json();
            this.balance = await balanceResp.json();
            this.skills = await skillsResp.json();
            this.socialComments = await socialResp.json();
            const maidsData = await maidsResp.json();
            this.allMaidsData = maidsData;
            this.upgradesList = await upgradesResp.json();
            this.storeItems = await storeResp.json();
            this.events = await eventsResp.json();

            // Initialize Random Events
            if (this.initEventManager) {
                this.initEventManager();
            }

            // Setup initial state from config
            this.dayDuration = this.config.dayDuration || 60;
            this.gold = this.config.initialGold || 0;
            this.rentBase = this.config.rentBase || 2500;
            this.currentRent = this.rentBase;
            this.reputation = this.config.initialReputation || 0;

            this.baseMaidSpeed = this.config.baseMaidSpeed || 200;
            this.baseCustomerSpeed = this.config.baseCustomerSpeed || 100;

            this.maidWorkTime_Order = this.config.maidWorkTime_Order || 2;
            this.maidWorkTime_Prep = this.config.maidWorkTime_Prep || 1;
            this.maidWorkTime_Clean = this.config.maidWorkTime_Clean || 1.5;
            this.maidIdleRegenRate = (this.config.maidIdleRegenRate !== undefined) ? this.config.maidIdleRegenRate : 5;
            this.upgradeOptionCount = this.config.upgradeOptionCount || 3;
            this.trashSpawnChance = this.config.trashSpawnChance !== undefined ? this.config.trashSpawnChance : 0.3;
            this.victoryGoldGoal = this.config.victoryGoldGoal || 300000;
            this.maxDays = this.config.maxDays || 30;

            // Start with only the first maid
            this.maids = maidsData.length > 0 ? [new Maid(maidsData[0])] : [];

            // Initialize Tables
            this.tables = [];
            const cols = 5;
            const maxT = this.config.maxTables || 10;
            const initialT = this.config.initialTables || 3;
            const spacingX = 110, spacingY = 100, startX = 80, startY = 60;

            for (let i = 0; i < maxT; i++) {
                const row = Math.floor(i / cols), col = i % cols;
                const tx = startX + col * spacingX, ty = startY + row * spacingY;
                const table = new Table(i, tx, ty);
                table.unlocked = (i < initialT);
                this.tables.push(table);
            }

            this.customers = [];
            this.queue = [];

            // Default positions
            this.doorPos = { x: 300, y: 0 };
            this.entrancePos = { x: 300, y: 0 };
            this.queueStartPos = { x: 300, y: 60 };
            this.kitchenPos = { x: 480, y: 30 };

            console.log("GameState initialized. Modules merged.");
            this.notify('init_complete');
        } catch (e) {
            console.error("Failed to load game data:", e);
        }
    }

    setDoorPosition(doorX, doorY, gameAreaHeight, kitchenX, kitchenY) {
        this.doorPos = { x: doorX, y: doorY };
        this.entrancePos = { x: doorX, y: doorY };
        this.queueStartPos = { x: doorX, y: gameAreaHeight - 105 };
        this.kitchenPos = { x: kitchenX || (doorX * 2), y: kitchenY || 30 };
    }

    startGame() {
        this.status = 'RUNNING';
        this.isBusinessHours = true;
        this.time = this.dayDuration;
        this.customerSpawnTimer = 0;
        this.dailyIncome = 0;

        // Reset Daily Modifiers
        this.spawnRateMod = 0; // Reset
        this.patienceDecayMod = 1.0; // Reset
        this.incomeMod = 1.0; // Reset (Base)
        this.tipMod = 1.0;
        this.eatTimeMod = 1.0;
        this.maidSpeedMod = 1.0;
        this.trashProbMod = 1.0;
        this.disableAutomation = false;
        this.checkTrash = false;
        this.specialGoal = null;
        this.angryLeaveCount = 0;

        // Re-apply permanent upgrades mods if stored separately, or just let events stack on 1.0
        // (Assuming upgrades modify base stats or other props, but here we reset transient mods)

        // Trigger Daily Event (Should be done before this function ideally, but placing here for flow)
        // Ideally: Show Event Overlay -> Click OK -> startGame()
        // But for now, let's assume Event Overlay calls startGame after decision.

        // Apply Event Effects if any active
        if (this.activeEvent) {
            this.applyEventEffects(this);
            console.log("Applied event effects:", this.activeEvent.id);
        }

        this.notify('state_change', { status: this.status });
        this.notify('hud_update', {
            day: this.day, time: this.time,
            rentDay: Math.ceil(this.day / 7) * 7,
            rentAmount: this.currentRent
        });
    }

    setPaused(paused) {
        if (this.status === 'END') return;
        this.status = paused ? 'PAUSED' : 'RUNNING';
        this.notify('state_change', { status: this.status });
    }

    toggleAutoClean() {
        this.autoCleanEnabled = !this.autoCleanEnabled;
        return this.autoCleanEnabled;
    }

    updateTime(dt) {
        if (this.status !== 'RUNNING' || !this.isBusinessHours) return;

        this.time -= dt;

        // Customer Spawning
        this.customerSpawnTimer = (this.customerSpawnTimer || 0) + dt;
        const baseInterval = this.balance.queue.baseSpawnInterval || 5.0;
        let spawnInterval = baseInterval / (1 + (this.reputation / 100));
        if (this.spawnRateMod) spawnInterval /= (1 + this.spawnRateMod);

        if (this.customerSpawnTimer >= spawnInterval) {
            this.spawnCustomer();
            this.customerSpawnTimer = 0;
        }

        // Update Customers
        this.customers.forEach(c => {
            c.update(dt);
            if (c.state === 'LEAVING' && !c.ratingRecorded) {
                // Halve rating if served by automation (Conveyor Nerf)
                const finalRating = c.servedByAutomation ? Math.floor(c.recordedRating * 0.5) : c.recordedRating;
                this.recordEvaluation(finalRating);
                c.ratingRecorded = true;
            }
        });

        // Update Maids (Only active ones)
        this.maids.forEach(maid => {
            if (maid.employmentStatus !== 'REST') {
                maid.update(dt, this);
            } else {
                // HACK: Ensure resting maids are moved off-screen so they don't block anything
                maid.x = -1000;
                maid.y = -1000;
            }
        });

        // Update Queue
        this.queue.forEach(c => c.update(dt));
        this.processQueueIncome(dt);
        this.queue = this.queue.filter(c => {
            if (c.state === 'LEAVING') {
                if (!c.ratingRecorded) {
                    // Halve rating if served by automation (Conveyor Nerf)
                    const finalRating = c.servedByAutomation ? Math.floor(c.recordedRating * 0.5) : c.recordedRating;
                    this.recordEvaluation(finalRating);
                    c.ratingRecorded = true;
                }
                return false;
            }
            return true;
        });

        // Remove left customers
        this.customers = this.customers.filter(c => !(c.state === 'LEAVING' && c.y >= 500));

        // Seat customers from queue if tables are free
        this.checkQueue();

        if (this.time <= 0) {
            this.time = 0;
            this.endDay();
        }

        // [Roomba] Auto Clean
        if (this.roomba > 0 && !this.disableAutomation) {
            this.roombaTimer = (this.roombaTimer || 0) + dt;
            const interval = Math.max(this.balance.automation.autoCleanFloor || 0.5,
                (this.balance.automation.roombaInterval || 10) / this.getAutomationEfficiency());

            if (this.roombaTimer >= interval) {
                this.roombaTimer = 0;
                if (this.trash.length > 0) {
                    this.trash.shift();
                    this.notify('entities_update', { trash: this.trash });
                }
            }
        }

        // [Conveyor Belt] Auto Serve
        if (this.conveyorBelt > 0 && !this.disableAutomation) {
            this.customers.forEach(c => {
                if (c.state === 'WAITING_FOOD' && !c.beingServedByMaid) {
                    c.conveyorTimer = (c.conveyorTimer || 0) + dt;
                    const basePrep = this.maidWorkTime_Prep || 1.0;
                    const cookTime = Math.max(this.balance.automation.cookTimeFloor || 0.1,
                        basePrep / this.getAutomationEfficiency());

                    if (c.conveyorTimer >= cookTime) {
                        c.interact('serve_food');
                        c.servedByAutomation = true; // Mark as served by automation
                        c.conveyorTimer = 0;
                    }
                }
            });
        }

        this.notify('time_update', { time: this.time.toFixed(1) });
        this.notify('entities_update', { tables: this.tables, customers: this.customers, maids: this.maids, queue: this.queue });
    }

    subscribe(callback) { this.listeners.push(callback); }
    notify(event, data) { this.listeners.forEach(cb => cb(event, data)); }

    serialize() {
        return {
            gold: this.gold,
            day: this.day,
            reputation: this.reputation,
            week: this.week,
            currentRent: this.currentRent,
            rentShieldCount: this.rentShieldCount,
            appliedUpgradeIds: this.appliedUpgradeIds,
            purchasedStoreItems: this.purchasedStoreItems,
            banishedIds: this.banishedIds,
            victoryGoldGoal: this.victoryGoldGoal,
            maxDays: this.maxDays,
            autoCleanEnabled: this.autoCleanEnabled,
            maids: this.maids.map(m => ({
                id: m.id,
                stamina: m.stamina,
                employmentStatus: m.employmentStatus
            })),
            tables: this.tables.map(t => ({
                id: t.id,
                unlocked: t.unlocked
            }))
        };
    }

    hydrate(saveData) {
        if (!saveData) return;

        this.gold = saveData.gold;
        this.day = saveData.day;
        this.reputation = saveData.reputation;
        this.week = saveData.week || 1;
        this.currentRent = saveData.currentRent;
        this.rentShieldCount = saveData.rentShieldCount || 0;
        this.appliedUpgradeIds = saveData.appliedUpgradeIds || [];
        this.purchasedStoreItems = saveData.purchasedStoreItems || {};
        this.banishedIds = saveData.banishedIds || [];
        this.victoryGoldGoal = saveData.victoryGoldGoal || 300000;
        this.maxDays = saveData.maxDays || 30;
        this.autoCleanEnabled = (saveData.autoCleanEnabled !== undefined) ? saveData.autoCleanEnabled : true;

        // Restore Maids
        if (saveData.maids && this.allMaidsData) {
            this.maids = saveData.maids.map(mSave => {
                const baseData = this.allMaidsData.find(d => d.id === mSave.id);
                if (baseData) {
                    const maid = new Maid(baseData);
                    maid.stamina = mSave.stamina;
                    maid.employmentStatus = mSave.employmentStatus;
                    return maid;
                }
                return null;
            }).filter(m => m !== null);
        }

        // Restore Tables
        if (saveData.tables) {
            saveData.tables.forEach(tSave => {
                const table = this.tables.find(t => t.id === tSave.id);
                if (table) {
                    table.unlocked = tSave.unlocked;
                }
            });
        }

        // Re-apply permanent upgrades logic if necessary
        // (Assuming applyUpgrade itself handles the logic, but if they are flags on GameState, 
        // they need to be re-evaluated from appliedUpgradeIds)
        this.reapplyUpgrades();

        console.log("GameState hydrated from save data.");
    }

    reapplyUpgrades() {
        // Reset dynamic flags modified by upgrades
        this.interestRate = 0;
        this.repInterestRate = 0;
        this.trashBonus = 0;
        this.staminaLossReduction = 0;
        this.roomba = 0;
        this.conveyorBelt = 0;
        this.trashSpeedBoost = 0;
        this.lowStaminaBuffMod = 0;
        this.checkoutTimeMod = 0;

        // Re-apply each upgrade ID
        const uniqueIds = [...new Set(this.appliedUpgradeIds)];
        const counts = {};
        this.appliedUpgradeIds.forEach(id => counts[id] = (counts[id] || 0) + 1);

        uniqueIds.forEach(id => {
            // We need a subtle version of applyUpgrade that doesn't push to the array
            const upgrade = this.upgradesList.find(u => u.id === id);
            if (upgrade && upgrade.effect) {
                // Repeat for each instance (stacking)
                for (let i = 0; i < counts[id]; i++) {
                    this.executeUpgradeEffect(upgrade.effect);
                }
            }
        });
    }

    executeUpgradeEffect(effect) {
        if (effect.type === 'INTEREST') this.interestRate = (this.interestRate || 0) + effect.value;
        if (effect.type === 'REP_INTEREST') this.repInterestRate = (this.repInterestRate || 0) + effect.value;
        if (effect.type === 'TRASH_RECYCLE') this.trashBonus = (this.trashBonus || 0) + effect.value;
        if (effect.type === 'STAMINA_SAVE') this.staminaLossReduction = (this.staminaLossReduction || 0) + (effect.value * 25);
        if (effect.type === 'ROOMBA') this.roomba = (this.roomba || 0) + 1;
        if (effect.type === 'CONVEYOR') this.conveyorBelt = (this.conveyorBelt || 0) + 1;
        if (effect.type === 'TRASH_SPEED') this.trashSpeedBoost = (this.trashSpeedBoost || 0) + effect.value;
        if (effect.type === 'LOW_STAMINA_BUFF') this.lowStaminaBuffMod = (this.lowStaminaBuffMod || 0) + effect.value;
        if (effect.type === 'CHECKOUT_SPEED') this.checkoutTimeMod = (this.checkoutTimeMod || 0) + effect.value;
    }
}

// Attach Mixins
Object.assign(GameState.prototype,
    GameStateEconomy,
    GameStateCustomers,
    GameStateUpgrades,
    GameStateDayEnd,
    GameStateMaids,
    RandomEventManager // Integrate Event Manager
);
