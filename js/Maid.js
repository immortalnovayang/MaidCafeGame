class Maid {
    constructor(data) {
        this.id = data.id;
        this.name = data.name;
        this.color = data.color;

        // Final Speed = Global Base + Individual Speed
        const globalBase = GameState.getInstance().baseMaidSpeed || 0;
        this.individualSpeed = data.speed || 0;
        this.baseSpeed = globalBase + this.individualSpeed;
        this.speed = this.baseSpeed; // px per sec

        this.state = 'IDLE'; // IDLE, MOVING, WORKING

        // Position - start at kitchen or counter
        this.x = 480;
        this.y = 50;
        this.targetX = 480;
        this.targetY = 50;

        this.targetEntity = null; // Customer or Table
        this.taskType = null; // 'take_order', 'serve_food', 'checkout', 'clean', 'clean_trash'

        this.maxStamina = data.maxStamina || 100;
        this.stamina = this.maxStamina;
        this.workingTimer = 0;
        this.workSpeedBonus = 0;
        this.emoji = "🎀";
        this.salary = data.salary || 0;
        this.desc = data.desc || "";
        this.employmentStatus = 'ACTIVE'; // 'ACTIVE' (Working), 'REST' (Resting)

        // Skills - Data-driven approach
        this.skillId = data.skillId || null;
        this.skillData = this.loadSkillData(this.skillId);
        this.skillName = this.skillData ? this.skillData.name : "無技能";
        this.skillType = this.skillData ? this.skillData.type : "PASSIVE";
        this.skillDesc = this.skillData ? this.skillData.desc : "";
        this.cooldown = 0;
        this.maxCooldown = this.skillData ? (this.skillData.cooldown || 15) : 15;
        this.skillDuration = 0;
    }

    loadSkillData(skillId) {
        if (!skillId) return null;
        const gs = GameState.getInstance();
        if (!gs.skills) return null;
        return gs.skills.find(s => s.id === skillId) || null;
    }

    update(dt, gameState) {
        // Cooldowns
        if (this.cooldown > 0) this.cooldown -= dt;
        if (this.skillDuration > 0) {
            this.skillDuration -= dt;
            if (this.skillDuration <= 0) {
                this.endSkill();
            }
        }

        // Stamina logic (simple regen if idle)
        const gs = GameState.getInstance();
        if (this.state === 'IDLE' && this.stamina < this.maxStamina) {
            const regen = (gs.maidIdleRegenRate !== undefined) ? gs.maidIdleRegenRate : 5;
            this.stamina += dt * regen;
        }

        // AI Logic
        if (this.state === 'IDLE') {
            this.findTask(gameState);
        } else if (this.state === 'MOVING') {
            this.move(dt, gameState);
        } else if (this.state === 'WORKING') {
            this.work(dt, gameState);
        }
    }

    activateSkill() {
        if (this.skillType === 'PASSIVE') return false;
        if (this.cooldown > 0 || this.stamina <= 0) return false;
        if (!this.skillData) return false;

        const skill = this.skillData;

        // [Lulu] Active Skill: Heal Patience
        if (skill.effect && skill.effect.type === 'HEAL_PATIENCE') {
            GameState.getInstance().healAllCustomers(skill.effect.value);
        }

        this.cooldown = skill.cooldown || this.maxCooldown;
        this.stamina = Math.max(0, this.stamina - (skill.staminaCost || 10));
        console.log(`${this.name} activated skill: ${skill.name}`);

        // Apply effect based on skill data
        if (skill.effect) {
            if (skill.effect.stat === 'speed' && skill.effect.multiplier) {
                this.speed = this.baseSpeed * skill.effect.multiplier;
            }
            if (skill.effect.stat === 'workSpeed' && skill.effect.bonus) {
                this.workSpeedBonus = (this.workSpeedBonus || 0) + skill.effect.bonus;
            }
        }

        this.skillDuration = skill.duration || 5;
        this.emoji = skill.activeEmoji || "⚡";
        return true;
    }

    endSkill() {
        if (!this.skillData) return;
        const skill = this.skillData;

        // Revert effect based on skill data
        if (skill.effect) {
            if (skill.effect.stat === 'speed') {
                this.speed = this.baseSpeed;
            }
            if (skill.effect.stat === 'workSpeed' && skill.effect.bonus) {
                this.workSpeedBonus = Math.max(0, this.workSpeedBonus - skill.effect.bonus);
            }
        }
        this.emoji = "🎀";
    }

    getSpeed() {
        let currentSpeed = this.speed;
        const gs = GameState.getInstance();

        // [Kuro] Dynamic Speed: +5% per trash
        if (this.skillId === 'skill_kuro') {
            const trashCount = gs.trash ? gs.trash.length : 0;
            currentSpeed *= (1 + (trashCount * 0.05));
        }

        // [Jean] Dynamic Speed: +1% per reputation
        if (this.skillId === 'skill_jean') {
            const rep = gs.reputation || 0;
            currentSpeed *= (1 + (rep * 0.01));
        }

        // [Fly Swatter] Speed Boost from upgrades
        if (gs.trashSpeedBoost && gs.trash && gs.trash.length > 0) {
            currentSpeed *= (1 + gs.trashSpeedBoost);
        }

        // [Event] Maid Speed Mod (e.g. Extreme Cold)
        if (gs.maidSpeedMod) {
            currentSpeed *= gs.maidSpeedMod;
        }

        return currentSpeed;
    }

    getWorkSpeedBonus() {
        let bonus = this.workSpeedBonus || 0;
        const gs = GameState.getInstance();

        // [Kuro] Dynamic Work Efficiency: +10% per trash
        if (this.skillId === 'skill_kuro') {
            const trashCount = gs.trash ? gs.trash.length : 0;
            bonus += (trashCount * 0.1);
        }

        // [Jean] Dynamic Work Efficiency: +2% per reputation
        if (this.skillId === 'skill_jean') {
            const rep = gs.reputation || 0;
            bonus += (rep * 0.02);
        }

        // [Energy Drink] Low Stamina Buff
        if (this.stamina > 0 && this.stamina < 20 && gs.lowStaminaBuffMod) {
            bonus += gs.lowStaminaBuffMod;
        }

        return bonus;
    }

    findTask(gameState) {
        // Priority: Serve Food > Take Order > Checkout
        const availableCustomers = gameState.customers.filter(c => !this.isTargeted(c, gameState.maids));

        // 1. Checkout
        const paying = availableCustomers.find(c => c.state === 'PAYING');
        if (paying) {
            this.assignTask(paying, 'checkout');
            return;
        }

        // 2. Take Order
        const ordering = availableCustomers.find(c => c.state === 'ORDERING');
        if (ordering) {
            this.assignTask(ordering, 'take_order');
            return;
        }

        // 3. Serve Food (If no Conveyor Belt)
        if (!gameState.conveyorBelt) {
            const waiting = availableCustomers.find(c => c.state === 'WAITING_FOOD' && !c.beingServedByMaid);
            if (waiting) {
                this.assignTask(waiting, 'serve_food_step1', gameState);
                return;
            }
        }

        // 4. [REMOVED for Scheme C] Clean Dirty Tables - Tables auto-clean now.
        // const dirtyTable = gameState.tables.find(t => t.state === 'DIRTY' && !this.isTableTargeted(t, gameState.maids));
        // if (dirtyTable) {
        //     this.assignTask(dirtyTable, 'clean', gameState);
        //     return;
        // }

        // 5. Clean Trash
        if (gameState.autoCleanEnabled) {
            const trash = gameState.trash.find(t => !this.isTrashTargeted(t, gameState.maids));
            if (trash) {
                this.assignTask(trash, 'clean_trash', gameState);
                return;
            }
        }
    }

    isTrashTargeted(trash, maids) {
        return maids.some(m => m.targetEntity === trash);
    }

    isTableTargeted(table, maids) {
        return maids.some(m => m.targetEntity === table);
    }

    isTargeted(customer, maids) {
        return maids.some(m => m.targetEntity === customer);
    }

    assignTask(entity, type, gameState) {
        this.state = 'MOVING';
        this.targetEntity = entity;
        this.taskType = type;

        if (type === 'serve_food_step1') {
            this.targetX = gameState.kitchenPos.x;
            this.targetY = gameState.kitchenPos.y;
            this.emoji = "🏃‍♀️🍱";
        } else if (type === 'clean') {
            this.targetX = entity.x + 25;
            this.targetY = entity.y + 25;
            this.emoji = "🧹";
        } else if (type === 'clean_trash') {
            this.targetX = entity.x;
            this.targetY = entity.y;
            this.emoji = "🚮";
        } else {
            this.targetX = entity.x;
            this.targetY = entity.y;
            this.emoji = "🏃‍♀️";
        }
    }

    move(dt, gameState) {
        if (this.targetEntity && this.taskType !== 'serve_food_step1') {
            this.targetX = this.targetEntity.x;
            this.targetY = this.targetEntity.y;
            if (this.taskType === 'clean') {
                this.targetX += 25;
                this.targetY += 25;
            }
        }

        const dx = this.targetX - this.x;
        const dy = this.targetY - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        let currentSpeed = this.getSpeed();

        // [Fly Swatter] Speed Boost from upgrades
        if (gameState.trashSpeedBoost && gameState.trash && gameState.trash.length > 0) {
            currentSpeed *= (1 + gameState.trashSpeedBoost);
        }

        const moveDist = currentSpeed * dt;

        if (dist > 1 && moveDist < dist) {
            this.x += (dx / dist) * moveDist;
            this.y += (dy / dist) * moveDist;
        } else {
            this.x = this.targetX;
            this.y = this.targetY;

            if (this.taskType === 'serve_food_step1') {
                this.state = 'WORKING';
                let workTime = Math.max(0.1, (gameState.maidWorkTime_Prep || 1) - this.getWorkSpeedBonus());
                if (this.stamina <= 0) workTime *= 2.0;
                this.workingTimer = workTime;
                this.emoji = "🍱";
            } else if (this.taskType === 'clean') {
                this.state = 'WORKING';
                let workTime = Math.max(0.1, (gameState.maidWorkTime_Clean || 1.5) - this.getWorkSpeedBonus());
                if (this.stamina <= 0) workTime *= 2.0;
                this.workingTimer = workTime;
                this.emoji = "🧹";
            } else if (this.taskType === 'clean_trash') {
                this.state = 'WORKING';
                let workTime = Math.max(0.1, 0.5 - this.getWorkSpeedBonus());
                if (this.stamina <= 0) workTime *= 2.0;
                this.workingTimer = workTime;
                this.emoji = "🚮";
            } else {
                this.state = 'WORKING';
                let baseTime = gameState.maidWorkTime_Order || 2;
                if (this.taskType === 'checkout' && gameState.checkoutTimeMod) {
                    const efficiency = gameState.getAutomationEfficiency();
                    const totalMod = Math.min(0.9, gameState.checkoutTimeMod * efficiency);
                    baseTime *= (1 - totalMod);
                }
                let workTime = Math.max(0.1, baseTime - this.getWorkSpeedBonus());
                if (this.stamina <= 0) workTime *= 2.0;
                this.workingTimer = workTime;
                this.emoji = this.stamina <= 0 ? "😫" : (this.taskType === 'checkout' ? "💸" : "💬");
            }
        }
    }

    work(dt, gameState) {
        this.workingTimer -= dt;
        if (this.workingTimer <= 0) {
            this.completeTask(gameState);
        }
    }

    completeTask(gameState) {
        if (this.taskType === 'serve_food_step1') {
            this.taskType = 'serve_food_step2';
            this.state = 'MOVING';
            if (this.targetEntity) {
                this.targetX = this.targetEntity.x;
                this.targetY = this.targetEntity.y;
                return;
            }
        }

        if (this.targetEntity) {
            if (this.taskType === 'clean') {
                this.targetEntity.clean();
            } else if (this.taskType === 'clean_trash') {
                gameState.removeTrash(this.targetEntity.id);
            } else {
                const result = this.targetEntity.interact(this.taskType === 'serve_food_step2' ? 'serve_food' : this.taskType, this);

                // [Hill] Golden Food feedback
                if (result && result.type === 'food_served' && result.extraMods && result.extraMods.foodValueMultiplier) {
                    gameState.notify('special_event', { text: "🌟 黃金料理 x5!", x: this.targetEntity.x, y: this.targetEntity.y, color: "#f1c40f" });
                }

                if (result && result.type === 'paid') {
                    gameState.recordEvaluation(result.rating);
                    gameState.addGold(120, result.rating, result);
                }
            }
        }

        this.state = 'IDLE';
        this.targetEntity = null;
        this.taskType = null;
        this.emoji = "🎀";
    }
}
