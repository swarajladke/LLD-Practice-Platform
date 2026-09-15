export const STARTER_TEMPLATES: Record<string, string> = {
  'parking-lot': JSON.stringify(
    {
      assumptions: [
        'Single physical parking structure with 4 floors.',
        'Maximum 500 spots per floor.',
        'Ticket issued upon entry, fee paid upon exit.',
      ],
      entities: [
        {
          name: 'ParkingLot',
          responsibility: 'Coordinates floor managers and routes incoming vehicles to available spots.',
          attributes: ['id', 'floors', 'activeTickets'],
          methods: ['enterVehicle(v: Vehicle): Ticket', 'exitVehicle(t: Ticket): Receipt'],
        },
        {
          name: 'ParkingSpot',
          responsibility: 'Tracks occupancy and vehicle assignment for a single physical stall.',
          attributes: ['spotNumber', 'floorNumber', 'spotType', 'isOccupied'],
          methods: ['occupy(v: Vehicle): void', 'vacate(): void'],
        },
        {
          name: 'ParkingTicket',
          responsibility: 'Represents active session receipt holding entry timestamp and assigned spot.',
          attributes: ['ticketId', 'vehicleLicense', 'entryTime', 'spotId', 'isPaid'],
          methods: ['markPaid(): void', 'getDurationHours(): number'],
        },
        {
          name: 'Gate',
          responsibility: 'Operates barrier arm upon ticket validation or payment confirmation.',
          attributes: ['gateId', 'isOpen', 'gateType'],
          methods: ['open(): void', 'close(): void'],
        },
      ],
      relationships: [
        { from: 'ParkingLot', to: 'ParkingSpot', type: 'has-a', note: 'Lot contains parking spots' },
        { from: 'ParkingLot', to: 'ParkingTicket', type: 'uses', note: 'Lot issues and settles tickets' },
        { from: 'ParkingLot', to: 'Gate', type: 'has-a', note: 'Lot manages entry and exit gates' },
      ],
      interfaces: [
        {
          name: 'PricingStrategy',
          purpose: 'Calculates hourly or tiered parking fees for different vehicle types.',
          methods: ['calculateFee(ticket: ParkingTicket): number'],
        },
        {
          name: 'SpotAllocationStrategy',
          purpose: 'Selects the nearest optimal spot based on vehicle dimensions.',
          methods: ['findSpot(vehicleType: string, spots: ParkingSpot[]): ParkingSpot'],
        },
      ],
      tradeoffs: [
        {
          decision: 'In-memory array for parking spot occupancy queries',
          alternative: 'Relational DB query per spot search',
          why: 'In-memory spot lookup achieves microsecond latency under high gate traffic.',
        },
        {
          decision: 'Strategy pattern for pricing calculation',
          alternative: 'Hardcoding hourly fee logic inside ParkingTicket',
          why: 'Allows dynamic rate adjustments and special event pricing without modifying the domain model.',
        },
      ],
      extensibility:
        'New vehicle categories (e.g. EV with charging) and custom rate rules can be added by implementing PricingStrategy and SpotAllocationStrategy without changing core ParkingLot classes.',
    },
    null,
    2
  ),
  'elevator-system': JSON.stringify(
    {
      assumptions: [
        'Bank of 4 elevator cars serving 30 floors.',
        'Cars handle internal and hall floor requests.',
      ],
      entities: [
        {
          name: 'ElevatorController',
          responsibility: 'Supervises elevator cars and assigns pending hall requests to the best car.',
          attributes: ['cars', 'pendingRequests'],
          methods: ['handleHallCall(floor: number, dir: string): void', 'stepSimulation(): void'],
        },
        {
          name: 'ElevatorCar',
          responsibility: 'Controls movement between floors, door states, and internal button destinations.',
          attributes: ['carId', 'currentFloor', 'direction', 'doorState', 'destinations'],
          methods: ['moveToFloor(floor: number): void', 'openDoor(): void', 'closeDoor(): void'],
        },
        {
          name: 'Door',
          responsibility: 'Manages physical door obstruction detection and safety timers.',
          attributes: ['isOpen', 'hasObstruction'],
          methods: ['open(): void', 'close(): void'],
        },
      ],
      relationships: [
        { from: 'ElevatorController', to: 'ElevatorCar', type: 'has-a', note: 'Controller manages cars' },
        { from: 'ElevatorCar', to: 'Door', type: 'has-a', note: 'Car contains safety doors' },
      ],
      interfaces: [
        {
          name: 'DispatchStrategy',
          purpose: 'Calculates optimal car assignment score for hall calls.',
          methods: ['selectCar(cars: ElevatorCar[], requestFloor: number, dir: string): ElevatorCar'],
        },
      ],
      tradeoffs: [
        {
          decision: 'Supervisory controller dispatching algorithm',
          alternative: 'Independent car bidding protocol',
          why: 'Centralized controller prevents multiple elevators responding to the same hall call.',
        },
        {
          decision: 'SCAN/LOOK algorithm over FIFO queue',
          alternative: 'First-come first-served queue',
          why: 'Drastically reduces car motor direction reversals and minimizes average passenger wait time.',
        },
      ],
      extensibility:
        'Different dispatch strategies (morning up-peak, evening down-peak) can be swapped at runtime via DispatchStrategy.',
    },
    null,
    2
  ),
};
