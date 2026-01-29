const GameStateUpgrades = {
    getRandomUpgrades(count) {
        if (!this.upgradesList) return [];
        const rawPool = this.upgradesList.filter(u => {
            // 1. Banish check
            if (this.banishedIds.includes(u.id)) return false;

            // 2. Recruitment check (specific to avoid hiring same maid twice even if ID differs)
            if (u.category === 'RECRUITMENT') {
                if (this.maids.some(m => m.id === u.targetMaidId)) return false;
            }

            // 3. Stack limit check
            if (u.maxStack && u.maxStack > 0) {
                const count = this.appliedUpgradeIds.filter(id => id === u.id).length;
                if (count >= u.maxStack) return false;
            }

            return true;
        });

        const shuffle = (arr) => [...arr].sort(() => 0.5 - Math.random());
        const pool = shuffle(rawPool);
        const selected = [];

        // Try to ensure variety: One Augment
        const augPool = pool.filter(u => u.category === 'AUGMENT');
        if (augPool.length > 0) {
            selected.push(augPool[Math.floor(Math.random() * augPool.length)]);
        }

        // One Recruitment OR Rare Utility
        let expansionPool = pool.filter(u => u.category === 'RECRUITMENT' && !selected.includes(u));
        if (expansionPool.length === 0) {
            expansionPool = pool.filter(u => u.category === 'RARE_UTILITY' && !selected.includes(u));
        }
        if (expansionPool.length > 0) {
            selected.push(expansionPool[Math.floor(Math.random() * expansionPool.length)]);
        }

        // Fill remaining with Wildcards
        while (selected.length < count && pool.length > selected.length) {
            const remaining = pool.filter(u => !selected.includes(u));
            selected.push(remaining[Math.floor(Math.random() * remaining.length)]);
        }
        return selected;
    },

    skipReward() {
        // Scheme C: Day Based ($50 * Day)
        const reward = 50 * (this.day - 1 || 1);

        this.gold += reward;
        console.log(`Player skipped reward. Compensation: $${reward}`);

        // Notify for UI effect
        this.notify('special_event', {
            text: `跳過獎勵 +$${reward}`,
            x: 400,
            y: 300,
            color: '#f1c40f'
        });

        return reward;
    },

    rerollUpgrades() {
        if (this.rerollCurrent > 0) {
            this.rerollCurrent--;
            return this.getRandomUpgrades(this.upgradeOptionCount);
        }
        return null;
    },

    banishUpgrade(upgradeId) {
        if (this.banishCurrent > 0) {
            this.banishCurrent--;
            this.banishedIds.push(upgradeId);
            return true;
        }
        return false;
    },

    buyFromStore(itemId) {
        const item = this.storeItems.find(i => i.id === itemId);
        if (!item) return { success: false, reason: 'ITEM_NOT_FOUND' };

        const purchaseCount = this.purchasedStoreItems[itemId] || 0;
        if (item.limit && purchaseCount >= item.limit) return { success: false, reason: 'LIMIT_REACHED' };

        const price = item.priceMultiplier ?
            Math.floor(item.price * Math.pow(item.priceMultiplier, purchaseCount)) :
            item.price;

        if (this.gold < price) return { success: false, reason: 'INSUFFICIENT_GOLD' };

        this.gold -= price;
        this.purchasedStoreItems[itemId] = (this.purchasedStoreItems[itemId] || 0) + 1;
        this.applyStoreEffect(item);
        return { success: true };
    },

    applyStoreEffect(item) {
        if (item.effectType === 'ADD_ENTITY' && item.target === 'TABLE') {
            const table = this.tables.find(t => !t.unlocked);
            if (table) table.unlocked = true;
            this.notify('entities_update', { tables: this.tables, forceRebuildTables: true });
        } else if (item.effectType === 'RECOVER_STAMINA') {
            this.maids.forEach(m => {
                m.stamina = Math.min(m.maxStamina || 100, m.stamina + item.value);
            });
            this.notify('entities_update', { maids: this.maids });
        } else if (item.effectType === 'ADD_REROLL') {
            this.rerollLimit += item.value;
            this.rerollCurrent += item.value;
        } else if (item.effectType === 'ADD_BANISH') {
            this.banishCurrent += item.value;
        } else if (item.type === 'MAID_TRAINING') {
            this.maids.forEach(m => {
                if (item.stat === 'speed') m.baseSpeed += (m.baseSpeed * (item.value / 100));
                if (item.stat === 'workSpeed') m.workSpeedBonus = (m.workSpeedBonus || 0) + item.value;
            });
            this.notify('entities_update', { maids: this.maids });
        }
    },

    applyUpgrade(upgradeId) {
        const upgrade = this.upgradesList.find(u => u.id === upgradeId);
        if (!upgrade) return;

        this.appliedUpgradeIds.push(upgradeId);

        if (upgrade.type === 'STAT_BOOST' && upgrade.target === 'ALL_MAIDS') {
            this.maids.forEach(m => {
                if (upgrade.stat === 'speed') m.baseSpeed += (m.baseSpeed * (upgrade.value / 100));
                if (upgrade.stat === 'workSpeed') m.workSpeedBonus = (m.workSpeedBonus || 0) + upgrade.value;
                if (upgrade.stat === 'maxStamina') {
                    m.maxStamina = (m.maxStamina || 100) + upgrade.value;
                    m.stamina += upgrade.value;
                }
            });
        }

        if (upgrade.type === 'UNLOCK_MAID') {
            this.fetchMaidAndHire(upgrade.targetMaidId);
        }

        if (upgrade.type === 'ONE_TIME_BUFF') {
            if (upgrade.stat === 'rentShield') {
                this.rentShieldCount = (this.rentShieldCount || 0) + upgrade.value;
            }
            if (upgrade.stat === 'extraTable') {
                const newId = this.tables.length + 1;
                const newTable = new Table(newId, 80, 400);
                newTable.unlocked = true;
                this.tables.push(newTable);
                this.notify('entities_update', { tables: this.tables, forceRebuildTables: true });
                console.log("Extra table added!");
            }
        }

        if (upgrade.type === 'GLOBAL_CONFIG') {
            if (upgrade.stat === 'spawnRate') {
                this.spawnRateMod = (this.spawnRateMod || 0) + Math.abs(upgrade.value);
            }
            if (upgrade.stat === 'patienceDecay') {
                this.patienceDecayMod = (this.patienceDecayMod || 1.0) * upgrade.value;
            }
            if (upgrade.stat === 'seatingRelief') {
                this.seatingReliefBonus = (this.seatingReliefBonus || 0) + upgrade.value;
            }
            if (upgrade.stat === 'payStress') {
                this.payStressMod = (this.payStressMod || 0) + upgrade.value;
            }
            if (upgrade.stat === 'staminaLoss') {
                this.staminaLossReduction = (this.staminaLossReduction || 0) + upgrade.value;
            }
            if (upgrade.stat === 'trashBonus') {
                this.trashBonus = (this.trashBonus || 0) + upgrade.value;
            }
            if (upgrade.stat === 'trashSpeedBoost') {
                this.trashSpeedBoost = (this.trashSpeedBoost || 0) + upgrade.value;
            }
            if (upgrade.stat === 'autoCollectGold') {
                this.checkoutTimeMod = (this.checkoutTimeMod || 0) + upgrade.value;
            }
            if (upgrade.stat === 'conveyorBelt') {
                this.conveyorBelt = (this.conveyorBelt || 0) + upgrade.value;
            }
            if (upgrade.stat === 'roomba') {
                this.roomba = (this.roomba || 0) + upgrade.value;
            }
            if (upgrade.stat === 'maxQueueSize') {
                this.maxQueueSizeBonus = (this.maxQueueSizeBonus || 0) + upgrade.value;
            }
            if (upgrade.stat === 'policyStandEat') {
                this.policyStandEat = (this.policyStandEat || 0) + upgrade.value;
            }
            if (upgrade.stat === 'lowStaminaBuff') {
                this.lowStaminaBuffMod = (this.lowStaminaBuffMod || 0) + upgrade.value;
            }
            if (upgrade.stat === 'perfectTipBonus') {
                this.perfectTipBonus = (this.perfectTipBonus || 0) + upgrade.value;
            }
            if (upgrade.stat === 'queueIncome') {
                this.queueIncomeMod = (this.queueIncomeMod || 0) + upgrade.value;
            }
            if (upgrade.stat === 'queueRep') {
                this.queueRepMod = (this.queueRepMod || 0) + upgrade.value;
            }
            if (upgrade.stat === 'eatTimeReduction') {
                this.eatTimeReduction = (this.eatTimeReduction || 0) + upgrade.value;
            }
            if (upgrade.stat === 'queuePatienceMod') {
                this.queuePatienceMod = (this.queuePatienceMod || 1.0) * upgrade.value;
            }
            if (upgrade.stat === 'incomeMod') {
                this.incomeMod = (this.incomeMod || 1.0) * upgrade.value;
            }
            if (upgrade.stat === 'interestRate') {
                this.interestRate = (this.interestRate || 0) + upgrade.value;
            }
            if (upgrade.stat === 'repInterestRate') {
                this.repInterestRate = (this.repInterestRate || 0) + upgrade.value;
            }
        }

        if (upgrade.type === 'RARE_UTILITY') {
            if (upgrade.stat === 'income') {
                this.incomeMod = (this.incomeMod || 1.0) + upgrade.value;
            }
            if (upgrade.stat === 'queuePatience') {
                this.queuePatienceMod = (this.queuePatienceMod || 1.0) - upgrade.value;
            }
        }
    }
};
