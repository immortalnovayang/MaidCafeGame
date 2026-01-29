const GameStateMaids = {
    async fetchMaidAndHire(maidId) {
        if (!this.allMaidsData) {
            const resp = await fetch('data/maids.json');
            this.allMaidsData = await resp.json();
        }

        const data = this.allMaidsData.find(m => m.id === maidId);
        if (!data) return;

        try {
            const newMaid = new Maid(data);
            this.maids.push(newMaid);
            this.notify('entities_update', { maids: this.maids });
            console.log(`Hired maid: ${newMaid.name}`);
        } catch (e) {
            console.error("Failed to hire maid:", e);
        }
    },

    triggerMaidSkill(maidId) {
        const maid = this.maids.find(m => m.id === maidId);
        if (maid) {
            maid.activateSkill();
        }
    },

    fireMaid(maidId) {
        if (this.maids.length <= 1) return { success: false, reason: 'LAST_MAID' };
        const index = this.maids.findIndex(m => m.id === maidId);
        if (index !== -1) {
            this.maids.splice(index, 1);

            // [New] Remove the "Unlock Maid" upgrade from applied list so it disappears from status UI
            if (this.upgradesList) {
                const upgrade = this.upgradesList.find(u => u.type === 'UNLOCK_MAID' && u.targetMaidId === maidId);
                if (upgrade) {
                    const upIdx = this.appliedUpgradeIds.indexOf(upgrade.id);
                    if (upIdx !== -1) {
                        this.appliedUpgradeIds.splice(upIdx, 1);
                    }
                }
            }

            this.notify('entities_update', { maids: this.maids });
            return { success: true };
        }
        return { success: false, reason: 'NOT_FOUND' };
    }
};
