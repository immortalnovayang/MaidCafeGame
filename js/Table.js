class Table {
    constructor(id, x, y) {
        this.id = id;
        this.x = x; // Logical position
        this.y = y;
        this.state = 'EMPTY'; // EMPTY, OCCUPIED, DIRTY
        this.customer = null;
        this.dirtyAmount = 0;
        this.unlocked = true; // Default to unlocked, GameState will set this
    }

    isAvailable() {
        return this.unlocked && this.state === 'EMPTY';
    }

    occupy(customer) {
        if (!this.isAvailable()) return false;
        this.state = 'OCCUPIED';
        this.customer = customer;
        return true;
    }

    leave() {
        this.state = 'EMPTY';
        this.customer = null;
        this.dirtyAmount = 0;
        // [Scheme C] Tables don't get dirty, trash goes to floor instead.
        // Immediately available for next customer.
    }

    clean() {
        this.state = 'EMPTY';
        this.dirtyAmount = 0;
    }
}
