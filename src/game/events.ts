import type { ActiveModifier } from "./types";

/**
 * National Events fire every 5 rounds. Each returns a fresh ActiveModifier
 * (with its own duration) that the engine layers onto rent calculations.
 */
export interface NationalEvent {
  id: string;
  name: string;
  desc: string;
  make: () => ActiveModifier;
}

export const NATIONAL_EVENTS: NationalEvent[] = [
  {
    id: "psl",
    name: "PSL Season",
    desc: "Cricket fever grips the nation — tourism and hospitality cities earn more. Green & Yellow rents +30% for 3 rounds.",
    make: () => ({
      id: "psl",
      name: "PSL Season",
      desc: "Green & Yellow rents +30%.",
      roundsLeft: 3,
      groupRent: { green: 1.3, yellow: 1.3 },
    }),
  },
  {
    id: "monsoon",
    name: "Monsoon Flooding",
    desc: "Heavy monsoon rains disrupt the agri belt — Light Blue & Orange rents drop 40% for 2 rounds.",
    make: () => ({
      id: "monsoon",
      name: "Monsoon Flooding",
      desc: "Light Blue & Orange rents −40%.",
      roundsLeft: 2,
      groupRent: { lightblue: 0.6, orange: 0.6 },
    }),
  },
  {
    id: "boom",
    name: "Economic Boom",
    desc: "GDP surges — ALL rents increase 25% for 2 rounds.",
    make: () => ({
      id: "boom",
      name: "Economic Boom",
      desc: "All rents +25%.",
      roundsLeft: 2,
      globalRent: 1.25,
    }),
  },
  {
    id: "infra",
    name: "Infrastructure Investment",
    desc: "CPEC funds flow to ports and airports — airport fees +50% for 3 rounds.",
    make: () => ({
      id: "infra",
      name: "Infrastructure Investment",
      desc: "Airport fees +50%.",
      roundsLeft: 3,
      airportRent: 1.5,
    }),
  },
  {
    id: "export",
    name: "Export Growth",
    desc: "Strong global demand for surgical goods & textiles — Yellow & Red rents +35% for 3 rounds.",
    make: () => ({
      id: "export",
      name: "Export Growth",
      desc: "Yellow & Red rents +35%.",
      roundsLeft: 3,
      groupRent: { yellow: 1.35, red: 1.35 },
    }),
  },
  {
    id: "fuel",
    name: "Fuel Price Increase",
    desc: "OGRA hikes prices — utility charges double for 2 rounds.",
    make: () => ({
      id: "fuel",
      name: "Fuel Price Increase",
      desc: "Utility charges ×2.",
      roundsLeft: 2,
      utilityRent: 2,
    }),
  },
  {
    id: "it",
    name: "IT Sector Expansion",
    desc: "Tech parks boom in the capitals — Green rents +40% for 3 rounds.",
    make: () => ({
      id: "it",
      name: "IT Sector Expansion",
      desc: "Green rents +40%.",
      roundsLeft: 3,
      groupRent: { green: 1.4 },
    }),
  },
  {
    id: "bubble",
    name: "Real Estate Bubble",
    desc: "Plot prices soar — Pink, Orange, Red, Yellow, Green & DHA rents +20% for 4 rounds.",
    make: () => ({
      id: "bubble",
      name: "Real Estate Bubble",
      desc: "Most city rents +20%.",
      roundsLeft: 4,
      groupRent: { pink: 1.2, orange: 1.2, red: 1.2, yellow: 1.2, green: 1.2, darkblue: 1.2 },
    }),
  },
  {
    id: "slowdown",
    name: "Economic Slowdown",
    desc: "An IMF squeeze cools the market — ALL rents drop 25% for 3 rounds.",
    make: () => ({
      id: "slowdown",
      name: "Economic Slowdown",
      desc: "All rents −25%.",
      roundsLeft: 3,
      globalRent: 0.75,
    }),
  },
];
