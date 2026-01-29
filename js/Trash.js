class Trash {
    constructor(id, x, y) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.type = 'NORMAL'; // NORMAL, VOMIT, etc.
        this.timestamp = Date.now();
        this.emoji = "🗑️";
    }
}
