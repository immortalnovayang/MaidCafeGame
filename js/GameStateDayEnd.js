const GameStateDayEnd = {
    endDay() {
        this.status = 'PAUSED';
        this.isBusinessHours = false;
        const b = this.balance.rent;

        // Calculate daily stats
        const avg = parseFloat(this.getDailyAverageRating());
        this.weeklyRatings.push(avg);

        // [Landfill Contract] Trash Bonus
        let trashIncome = 0;
        if (this.trashBonus && this.trash.length > 0) {
            trashIncome = this.trashBonus * this.trash.length;
            this.gold += trashIncome;
        }

        // [Moe Fund] Interest (Calculated based on gold BEFORE expenses? Or AFTER? Let's do BEFORE expenses to be generous, or AFTER to be realistic? "剩余金钱" implies after. But usually games calculate interest on STARTING gold. Let's stick to CURRENT gold here which includes daily income but before rent/salary?)
        // Actually, let's put it AFTER salary deduction for "Remaining".
        // Deferred to later block.

        // [Maintenance] Conveyor Belt Fee
        let facilityCost = 0;
        if (this.conveyorBelt) {
            const fee = this.balance.automation.conveyorMaintenanceFee || 0;
            if (fee > 0) {
                facilityCost += fee;
                this.gold -= fee;
                console.log(`Paid Conveyor Maintenance Fee: $${fee}`);
            }
        }

        // [Event] Hygiene Check (Trash Fine)
        let eventFine = 0;
        let eventFineReason = "";
        if (this.checkTrash) {
            if (this.trash.length > 3) {
                eventFine = 1000;
                eventFineReason = "衛生稽查罰款";
                this.gold -= eventFine;
                this.notify('special_event', { text: `衛生稽查罰款 -$${eventFine}`, x: 300, y: 300, color: '#e74c3c' });
                console.log(`Hygiene Check Failed! Fined ${eventFine} gold.`);
            } else {
                console.log(`Hygiene Check Passed! Trash count: ${this.trash.length}`);
            }
            // Reset daily event flag handled by RandomEventManager/GameState
        }

        // [Event] Special Goal Check (Influencer)
        if (this.specialGoal === 'NO_ANGRY_LEAVE') {
            if (this.angryLeaveCount === 0) {
                this.reputation += 50;
                this.notify('special_event', { text: `網紅盛讚！名聲 +50`, x: 300, y: 250, color: '#9b59b6' });
            } else {
                this.notify('special_event', { text: `網紅失望離開...`, x: 300, y: 250, color: '#95a5a6' });
            }
        }

        // Reputation gain/loss
        let repChange = 0;
        if (avg >= (b.highRatingThreshold || 4.5)) repChange = 10;
        else if (avg >= 3.5) repChange = 5;
        else if (avg > 0 && avg < 2.5) repChange = -5;

        // [Maid Jean] Passive: +1 Rep per day if active (+20% seemed too weak if base is low, flat is safer for now or combine? Let's do Flat +2 extra for now or maybe percentage of total rep?). 
        // User asked for "Stronger". Let's do: Base Rep Gain + 20% of Current Rep (capped) to really snowball?
        // Or simply: If Jean is active, daily rep gain is DOUBLED? No that's too OP.
        // Let's do: If Jean is active, gain +5 extra Reputation.
        const hasJean = this.maids.some(m => m.id === 'maid_jean' && m.employmentStatus !== 'REST');
        if (hasJean) {
            repChange += 5;
            console.log("Maid Jean Bonus: +5 Rep");
        }

        this.reputation += repChange;

        // [Viral Reputation] Interest on Reputation
        let repInterest = 0;
        if (this.repInterestRate && this.reputation > 0) {
            repInterest = Math.floor(this.reputation * this.repInterestRate);
            this.reputation += repInterest;
            console.log(`Viral Rep Interest: +${repInterest}`);
        }

        // Generate Social Feed
        const socialFeed = this.generateSocialFeed(avg);

        // Check if it's the end of the week
        const isRentDay = (this.day % 7 === 0);
        const finishedDay = this.day;

        // Calculate Salaries (Only for ACTIVE maids)
        const activeMaids = this.maids.filter(m => m.employmentStatus !== 'REST');
        const totalSalary = activeMaids.reduce((sum, m) => sum + (m.salary || 0), 0);

        // Deduct Salaries immediately
        this.gold -= totalSalary;

        // [Moe Fund] Interest on Remaining Gold
        let interestIncome = 0;
        if (this.interestRate && this.gold > 0) {
            interestIncome = Math.floor(this.gold * this.interestRate);
            this.gold += interestIncome;
            console.log(`Moe Fund Interest: +$${interestIncome}`);
        }

        // Calculate Net Profit for display (Income + Trash + Interest - Salary - Fines - Facility Costs)
        const netProfit = this.dailyIncome + trashIncome + interestIncome - totalSalary - eventFine - facilityCost;

        if (this.gold < 0) {
            this.status = 'END';
            this.notify('game_over', {
                reason: 'BANKRUPTCY',
                rent: 0,
                totalSalaries: totalSalary,
                eventFine: eventFine,
                eventFineReason: eventFineReason,
                facilityCost: facilityCost,
                finalGold: this.gold
            });
            return;
        }

        // Maid Day End Processing
        const staminaLossBase = 25;
        let staminaLossMod = this.staminaLossReduction || 0;
        const hasNora = this.maids.some(m => m.skillId === 'skill_nora' && m.employmentStatus !== 'REST');
        if (hasNora) staminaLossMod += 7.5;

        this.maids.forEach(m => {
            if (m.employmentStatus === 'REST') {
                // Resting maids recover full stamina
                m.stamina = m.maxStamina;
                // Also could recover "Sick" status if implemented
            } else {
                // Working maids lose stamina
                m.stamina = Math.max(0, m.stamina - Math.max(0, staminaLossBase - staminaLossMod));
            }
            m.cooldown = 0;
            m.skillDuration = 0;
        });
        this.rerollCurrent = this.rerollLimit;

        let upgrades = null;
        if (!isRentDay) {
            // Victory Check (For normal days)
            if (this.day >= this.maxDays) {
                this.status = 'END';
                if (this.gold >= this.victoryGoldGoal) {
                    this.notify('game_victory', { finalGold: this.gold, goal: this.victoryGoldGoal });
                } else {
                    this.notify('game_over', { reason: 'GOAL_NOT_REACHED', finalGold: this.gold, goal: this.victoryGoldGoal });
                }
                return;
            }

            // Advance Day Setup
            this.day++;
            this.dailyRatings = [];
            this.customerSpawnTimer = 0;
            this.customers = [];
            this.queue = [];
            this.tables.forEach(t => t.clean());
            upgrades = this.getRandomUpgrades(this.upgradeOptionCount);
        }

        const report = {
            day: finishedDay,
            gold: this.gold,
            income: this.dailyIncome,
            trashIncome: trashIncome,
            interestIncome: interestIncome,
            facilityCost: facilityCost,
            eventFine: eventFine,
            eventFineReason: eventFineReason,
            avgRating: avg,
            isRentDay: isRentDay,
            rentDue: isRentDay ? this.currentRent : 0,
            salaryTotal: totalSalary,
            netProfit: netProfit,
            reputation: this.reputation,
            repInterest: repInterest,
            socialFeed: socialFeed,
            upgrades: upgrades
        };

        this.notify('day_end', report);
    },

    generateSocialFeed(avgRating) {
        if (!this.socialComments) return [];
        const star = Math.floor(avgRating) || 3;
        const pool = this.socialComments[star.toString()] || this.socialComments["3"];

        // Pick 3 random comments
        const shuffled = [...pool].sort(() => 0.5 - Math.random());
        const selected = shuffled.slice(0, 3);

        const avatars = [
            "👩‍🦰", "👴", "👱‍♂️", "👩", "🧔", "👧",
            "👦", "👨", "👵", "👱‍♀️", "👨‍🦱", "👩‍🦱",
            "👨‍🦲", "👨‍🎓", "👩‍🎓", "👨‍💼", "👩‍💼", "🕵️‍♂️",
            "👸", "😺"
        ];
        const names = [
            "匿名網友", "萌萌愛好者", "路人甲", "咖啡中毒者", "美食部落客",
            "乾爹", "專業肥宅", "附近上班族", "第一次來", "女僕推推",
            "隔壁老王", "挑嘴美食家", "潛水鄉民", "快樂小肥羊", "見習魔法師",
            "課金戰士", "邊緣人", "網美", "打卡魔人", "貓奴"
        ];

        return selected.map(comment => {
            const avatar = avatars[Math.floor(Math.random() * avatars.length)];
            const name = names[Math.floor(Math.random() * names.length)];
            const time = Math.floor(Math.random() * 23) + "小時前";
            return { avatar, name, comment, time };
        });
    },

    // New method for rent negotiation
    async handleRentNegotiation(strategy) {
        // [SAFEGUARD] If already bankrupt, fail immediately
        if (this.gold < 0) {
            return { success: false, reason: 'BANKRUPTCY', rent: this.currentRent };
        }

        const b = this.balance.rent;
        const weeklySum = this.weeklyRatings.reduce((a, b) => a + b, 0);
        const weeklyAvg = weeklySum / this.weeklyRatings.length || 0;
        let rentMultiplier = 1.0;
        let message = "";

        // Success probability based on strategy and performance
        let successProb = 0.5;
        if (weeklyAvg >= 4.5) successProb += 0.3;
        if (weeklyAvg < 3.0) successProb -= 0.3;

        // Alice Negotiator bonus
        const hasAlice = this.maids.some(m => m.skillId === 'skill_alice');
        if (hasAlice) successProb += 0.15;

        // Strategy modifiers
        if (strategy === 'MERCY') { // Appeal to Mercy
            successProb += 0.1;
            rentMultiplier = 0.95;
        } else if (strategy === 'RESULTS') { // Show Results
            if (weeklyAvg >= 4.0) successProb += 0.2;
            else successProb -= 0.2;
            rentMultiplier = 0.8;
        } else if (strategy === 'THREAT') { // Threaten to Move
            successProb -= 0.2; // High risk
            rentMultiplier = 0.6;
        }

        const success = Math.random() < successProb;

        if (success) {
            if (hasAlice) {
                // Alice Critical Success: Rent Free + Sponsorship
                rentMultiplier = 0;
                const sponsorship = this.day * 500;
                this.gold += sponsorship;
                message = `談判大成功！愛麗絲展現了驚人的談判技巧！\n房東不僅免除了本次租金，還贊助了 $${sponsorship} 作為營運資金！`;
            } else {
                // Normal Success
                message = "談判成功！房東被你的誠意（或實力）打動了，同意減免租金。";
            }
        } else {
            rentMultiplier = (weeklyAvg < 3.0) ? b.lowRatingPenalty || 1.5 : 1.1;
            message = successProb < 0.3 ? "談判慘敗！房東對你的表現極度不滿，決定大幅漲租。" : "談判失敗，房東堅持要漲租。";

            if (this.rentShieldCount > 0) {
                this.rentShieldCount--;
                rentMultiplier = 1.0;
                message += "（使用了租金護盾，租金維持原樣！）";
            }
        }

        const rentDue = Math.floor(this.currentRent * rentMultiplier);
        this.gold -= rentDue;

        if (this.gold < 0) {
            return { success: false, reason: 'BANKRUPTCY', rent: rentDue };
        }

        // Logic for next day setup after negotiation
        const dayReport = {
            rentPaid: rentDue,
            message: message,
            success: success
        };

        // Victory Check (After negotiation)
        if (this.day >= this.maxDays) {
            if (this.gold >= this.victoryGoldGoal) {
                this.status = 'END';
                this.notify('game_victory', { finalGold: this.gold, goal: this.victoryGoldGoal });
                return { success: true, report: dayReport, upgrades: [], victory: true };
            } else {
                this.status = 'END';
                this.notify('game_over', { reason: 'GOAL_NOT_REACHED', finalGold: this.gold, goal: this.victoryGoldGoal });
                return { success: true, report: dayReport, upgrades: [], gameOver: true };
            }
        }

        // Advance Day
        this.day++;
        this.dailyRatings = [];
        this.weeklyRatings = [];
        this.week++;
        const rate = this.config.rentIncreaseRate || 1.2;
        this.currentRent = Math.floor(this.currentRent * rate);

        this.customerSpawnTimer = 0;
        this.customers = [];
        this.queue = [];
        this.tables.forEach(t => t.clean());

        const upgrades = this.getRandomUpgrades(this.upgradeOptionCount);
        return { success: true, report: dayReport, upgrades: upgrades };
    },

    finalizeNormalDay() {
        // Advanced Day
        this.day++;
        this.dailyRatings = [];
        this.customerSpawnTimer = 0;
        this.customers = [];
        this.queue = [];
        this.tables.forEach(t => t.clean());

        const upgrades = this.getRandomUpgrades(this.upgradeOptionCount);
        return upgrades;
    }
};
