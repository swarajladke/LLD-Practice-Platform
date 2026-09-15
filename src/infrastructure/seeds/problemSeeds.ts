import type { Problem } from '../../domain/models/Problem.js';
import { Rubric, type RubricDimension } from '../../domain/models/Rubric.js';

const standardWeights: Record<RubricDimension, number> = {
  requirementUnderstanding: 0.15,
  classResponsibilities: 0.20,
  couplingCohesion: 0.15,
  encapsulationInterfaces: 0.10,
  abstractionPatterns: 0.15,
  extensibility: 0.10,
  edgeCasesTestability: 0.08,
  explanationQuality: 0.07,
};

export const SEEDED_PROBLEMS: readonly Problem[] = [
  {
    id: 'parking-lot',
    title: 'Parking Lot Management System',
    description:
      'Design an automated multi-floor parking lot system supporting different vehicle types, ticket issuance, real-time spot allocation, and dynamic pricing strategies.',
    requirements: [
      'Support multiple vehicle types (Car, Motorcycle, Truck, Electric Vehicle).',
      'Allocate parking spots dynamically based on vehicle size and proximity.',
      'Issue timestamped parking tickets on vehicle arrival at entry gates.',
      'Calculate parking fees upon exit using configurable pricing rules.',
      'Track real-time capacity and display occupancy per floor.',
    ],
    clarifyingContext: [
      'Single physical building with 4 floors.',
      'Peak concurrency: 10 entry/exit gates simultaneously.',
      'Pricing can vary by vehicle type, duration, and weekend surges.',
    ],
    rubric: Rubric.create({
      rubricVersion: '1.0.0',
      expectedConcepts: ['ParkingLot', 'Spot', 'Vehicle', 'Ticket', 'Gate', 'Payment'],
      extensionAxes: ['PricingStrategy', 'SpotAllocationStrategy', 'VehicleType'],
      minEntities: 4,
      minTradeoffs: 2,
      dimensionWeights: standardWeights,
      godClassMethodThreshold: 6,
      minRationaleLength: 15,
      minExtensibilityLength: 25,
    }),
  },
  {
    id: 'elevator-system',
    title: 'Elevator Dispatching System',
    description:
      'Design a supervisory controller and car management system for a bank of elevators in a high-rise office building with peak-traffic dispatching algorithms.',
    requirements: [
      'Manage multiple elevator cars serving 30 floors.',
      'Handle hall calls (up/down requests from floors) and car calls (floor buttons inside cars).',
      'Select optimal elevator car to serve each request based on distance and direction.',
      'Model door state, movement state (idle, moving up, moving down), and weight limits.',
      'Support emergency stop and maintenance mode operations.',
    ],
    clarifyingContext: [
      'Building with 4 elevator cars.',
      'Peak hours (morning rush up, evening rush down) require adaptive scheduling.',
      'Cars must safely handle door obstructions and overload sensors.',
    ],
    rubric: Rubric.create({
      rubricVersion: '1.0.0',
      expectedConcepts: ['ElevatorController', 'ElevatorCar', 'Floor', 'Request', 'Door', 'DispatchStrategy'],
      extensionAxes: ['DispatchStrategy', 'SchedulingAlgorithm'],
      minEntities: 4,
      minTradeoffs: 2,
      dimensionWeights: standardWeights,
      godClassMethodThreshold: 6,
      minRationaleLength: 15,
      minExtensibilityLength: 25,
    }),
  },
  {
    id: 'vending-machine',
    title: 'Smart Vending Machine',
    description:
      'Design an automated snack and beverage vending machine supporting inventory tracking, state transitions (idle, coin inserted, dispensing, maintenance), and multi-currency payments.',
    requirements: [
      'Display available products, shelf positions, and real-time inventory counts.',
      'Accept currency (coins, notes, contactless cards) and calculate exact change.',
      'Enforce state machine constraints: selection only after sufficient balance, refund on cancellation.',
      'Dispense selected item and update inventory or trigger refund on jam.',
      'Support restocking and price updates in maintenance mode.',
    ],
    clarifyingContext: [
      'Physical machine with 5 shelves, 10 slots per shelf.',
      'Supports coin denomination inventory for dispensing change.',
      'State transitions must be race-condition free.',
    ],
    rubric: Rubric.create({
      rubricVersion: '1.0.0',
      expectedConcepts: ['VendingMachine', 'State', 'Product', 'Inventory', 'PaymentProcessor', 'ChangeCalculator'],
      extensionAxes: ['VendingState', 'PaymentMethod', 'ChangeAlgorithm'],
      minEntities: 4,
      minTradeoffs: 2,
      dimensionWeights: standardWeights,
      godClassMethodThreshold: 6,
      minRationaleLength: 15,
      minExtensibilityLength: 25,
    }),
  },
  {
    id: 'rate-limiter',
    title: 'In-Memory Rate Limiter',
    description:
      'Design a high-throughput, low-latency rate limiter library supporting pluggable limiting algorithms (Token Bucket, Leaky Bucket, Sliding Window Counter).',
    requirements: [
      'Evaluate whether an incoming client request should be allowed or throttled based on client key.',
      'Support configurable rate limits (e.g. 100 requests per minute per API key).',
      'Support multiple rate-limiting algorithms through a unified interface.',
      'Return remaining tokens, reset timestamp, and retry-after header values.',
      'Provide thread-safe synchronization for concurrent requests.',
    ],
    clarifyingContext: [
      'In-memory library embedded in an application gateway.',
      'Low latency: sub-millisecond evaluation overhead.',
      'Memory cleanup: expired client buckets must be pruned to avoid leaks.',
    ],
    rubric: Rubric.create({
      rubricVersion: '1.0.0',
      expectedConcepts: ['RateLimiter', 'RateLimitRule', 'TokenBucket', 'ClientBucket', 'LimiterStrategy'],
      extensionAxes: ['RateLimitAlgorithm', 'StorageBackend', 'KeyExtractor'],
      minEntities: 3,
      minTradeoffs: 2,
      dimensionWeights: standardWeights,
      godClassMethodThreshold: 5,
      minRationaleLength: 15,
      minExtensibilityLength: 25,
    }),
  },
];
