/**
 * SaveManager.js - Handles Saving, Loading, and Deleting Game State
 */
class SaveManager {
    static SAVE_KEY = 'MaidCafe_Save_01';

    static hasSave() {
        return !!localStorage.getItem(this.SAVE_KEY);
    }

    static saveGame() {
        try {
            const gs = GameState.getInstance();
            const data = gs.serialize();
            localStorage.setItem(this.SAVE_KEY, JSON.stringify(data));
            console.log("[SaveManager] Game saved successfully.");
            return true;
        } catch (e) {
            console.error("[SaveManager] Failed to save game:", e);
            return false;
        }
    }

    static loadGame() {
        try {
            const raw = localStorage.getItem(this.SAVE_KEY);
            if (!raw) return false;

            const data = JSON.parse(raw);
            const gs = GameState.getInstance();
            gs.hydrate(data);

            console.log("[SaveManager] Game loaded successfully.");
            return true;
        } catch (e) {
            console.error("[SaveManager] Failed to load game:", e);
            return false;
        }
    }

    static deleteSave() {
        localStorage.removeItem(this.SAVE_KEY);
        console.log("[SaveManager] Save deleted.");
    }
}
