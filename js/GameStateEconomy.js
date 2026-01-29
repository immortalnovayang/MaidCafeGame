const GameStateEconomy = {
    addGold(amount, rating = 0, extraMods = {}) {
        let finalAmount = amount;
        const balance = this.balance.economy;

        // Base amount modifications (Hill's Golden Food)
        if (extraMods.foodValueMultiplier) {
            finalAmount *= extraMods.foodValueMultiplier;
        }

        // Tip logic based on rating
        const tipMod = balance.tipRatings[rating];
        if (tipMod) {
            // [Conveyor Nerf] No tips if served by automation. Only apply if NOT served by automation.
            if (!extraMods.servedByAutomation) {
                finalAmount *= tipMod;
            }
        }

        // [Lisa] Bonus Tip
        if (extraMods.tipMod) {
            finalAmount *= extraMods.tipMod;
        }

        // Income Mod from rare utilities
        if (this.incomeMod) finalAmount *= this.incomeMod;

        // [Event] Global Tip Mod
        if (this.tipMod) finalAmount *= this.tipMod;

        // [Royal Plate] Reputation Scaling: +0.5% income per Reputation point
        if (this.appliedUpgradeIds && this.appliedUpgradeIds.includes('UT_GOLDEN_PLATE')) {
            const repBonus = (this.reputation || 0) * 0.005;
            finalAmount *= (1 + repBonus);
        }

        // [Policy] Standing Policy: -50% tips
        if (this.policyStandEat) {
            finalAmount *= 0.5;
        }

        // [Legendary] Perfect Tip Bonus: x2 if patience > 90%
        if (this.perfectTipBonus && extraMods.rating >= 5) {
            // Note: Rating 5 is triggered at 80% patience in current Customer.js
            // But user requested >90%. Let's check patience specifically.
            if (extraMods.patience && extraMods.patience >= 90) {
                finalAmount *= this.perfectTipBonus;
                this.notify('special_event', { text: "💎 心情大好 x2!", x: extraMods.x, y: extraMods.y, color: "#3498db" });
            }
        }

        const roundedAmount = Math.floor(finalAmount);
        this.gold += roundedAmount;
        this.dailyIncome += roundedAmount;
        this.notify('hud_update', { gold: this.gold });

        if (extraMods.x !== undefined && extraMods.y !== undefined) {
            this.notify('gold_gain', { amount: roundedAmount, x: extraMods.x, y: extraMods.y });
        }
    },

    processQueueIncome(dt) {
        if (this.queue.length === 0) return;

        // Passive Income / Rep from Queue
        if (!this.queueIncomeMod && !this.queueRepMod) return;

        this.queueTimer = (this.queueTimer || 0) + dt;
        if (this.queueTimer >= 5.0) {
            this.queueTimer = 0;
            const centerC = this.queue[Math.floor(this.queue.length / 2)];

            // 1. Income (Vending Machine)
            if (this.queueIncomeMod) {
                const totalPassive = this.queue.length * this.queueIncomeMod;
                if (totalPassive > 0) {
                    this.gold += totalPassive;
                    this.dailyIncome += totalPassive;
                    this.notify('hud_update', { gold: this.gold });
                    this.notify('gold_gain', { amount: totalPassive, x: centerC.x, y: centerC.y, isTotal: true });
                    console.log(`Stable Queue Income: $${totalPassive}`);
                }
            }

            // 2. Reputation (Street Performance)
            if (this.queueRepMod) {
                const rawGain = this.queue.length * this.queueRepMod;

                // Use buffer to support fractional values (e.g. 0.1)
                this.repBuffer = (this.repBuffer || 0) + rawGain;

                if (this.repBuffer >= 1) {
                    const gain = Math.floor(this.repBuffer);
                    this.reputation += gain;
                    this.repBuffer -= gain;

                    // Add visual effect for Rep?
                    this.notify('special_event', { text: `名聲 +${gain}`, x: centerC.x, y: centerC.y - 30, color: '#9b59b6' });
                    this.notify('hud_update', { reputation: this.reputation });
                    console.log(`Stable Queue Rep: +${gain} (Buffer: ${this.repBuffer.toFixed(2)})`);
                }
            }
        }
    },

    recordEvaluation(rating) {
        if (rating === null || rating === undefined) return;
        this.dailyRatings.push(rating);
        if (rating <= 1) {
            this.angryLeaveCount = (this.angryLeaveCount || 0) + 1;
        }
        this.notify('hud_update', { avgRating: this.getDailyAverageRating() });
        console.log(`Rating recorded: ${rating}. Daily average: ${this.getDailyAverageRating()}`);
    },

    getDailyAverageRating() {
        if (this.dailyRatings.length === 0) return 0;
        const sum = this.dailyRatings.reduce((a, b) => a + b, 0);
        return parseFloat((sum / this.dailyRatings.length).toFixed(1));
    }
};
