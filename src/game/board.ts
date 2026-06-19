import type { BoardSpace, ColorGroup } from "./types";

// Airport & utility economics (computed dynamically in the engine).
export const AIRPORT_PRICE = 2_000_000;
export const AIRPORT_MORTGAGE = 1_000_000;
/** Rent = AIRPORT_BASE_RENT * 2^(owned-1) → 250k / 500k / 1M / 2M. */
export const AIRPORT_BASE_RENT = 250_000;

export const UTILITY_PRICE = 1_500_000;
export const UTILITY_MORTGAGE = 750_000;
/** Utility rent = diceSum * (owns both ? 10 : 4) * UTILITY_RENT_UNIT. */
export const UTILITY_RENT_UNIT = 10_000;

export const GO_SALARY = 2_000_000;
export const JAIL_FINE = 500_000;
export const STARTING_CASH = 15_000_000;

// helper to build a city space tersely
function city(
  pos: number,
  name: string,
  group: ColorGroup,
  price: number,
  rent: number[],
  buildCost: number,
  mortgage: number,
  bonus: string
): BoardSpace {
  return { pos, type: "city", name, group, price, rent, buildCost, mortgage, bonus };
}

export const BOARD: BoardSpace[] = [
  { pos: 0, type: "go", name: "GO — Salary Day", bonus: "Collect Rs. 2,000,000 as you pass." },

  city(1, "Kasur", "brown", 600_000,
    [20_000, 100_000, 300_000, 900_000, 2_500_000], 500_000, 300_000,
    "Lower purchase price — a cheap foothold."),

  { pos: 2, type: "chest", name: "Awami Fund", bonus: "Draw an Awami Fund (community) card." },

  city(3, "Jhelum", "brown", 600_000,
    [40_000, 200_000, 600_000, 1_800_000, 4_500_000], 500_000, 300_000,
    "Historic city — small rent discount for visitors."),

  { pos: 4, type: "tax", name: "Income Tax — FBR", amount: 2_000_000,
    bonus: "Federal Board of Revenue collects Rs. 2,000,000." },

  { pos: 5, type: "airport", name: "Jinnah International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "Karachi's gateway. Own more airports for higher fees." },

  city(6, "Okara", "lightblue", 1_000_000,
    [60_000, 300_000, 900_000, 2_700_000, 5_500_000], 500_000, 500_000,
    "Agricultural growth bonus."),

  { pos: 7, type: "chance", name: "Qismat", bonus: "Draw a Qismat (chance) card." },

  city(8, "Gujrat", "lightblue", 1_000_000,
    [60_000, 300_000, 900_000, 2_700_000, 5_500_000], 500_000, 500_000,
    "Manufacturing bonus — fans, ceramics, furniture."),

  city(9, "Sahiwal", "lightblue", 1_200_000,
    [80_000, 400_000, 1_000_000, 3_000_000, 6_000_000], 500_000, 600_000,
    "Utility synergy bonus."),

  { pos: 10, type: "jail", name: "Central Lockup", bonus: "Just visiting — unless you've been sent here." },

  city(11, "Bahawalpur", "pink", 1_400_000,
    [100_000, 500_000, 1_500_000, 4_500_000, 7_500_000], 1_000_000, 700_000,
    "Tourism bonus — palaces and the Cholistan desert."),

  { pos: 12, type: "utility", name: "WAPDA",
    price: UTILITY_PRICE, mortgage: UTILITY_MORTGAGE, bonus: "Water & power. Rent scales with dice and ownership." },

  city(13, "Sargodha", "pink", 1_400_000,
    [100_000, 500_000, 1_500_000, 4_500_000, 7_500_000], 1_000_000, 700_000,
    "Agricultural exports bonus — the city of citrus."),

  city(14, "Abbottabad", "pink", 1_600_000,
    [120_000, 600_000, 1_800_000, 5_000_000, 9_000_000], 1_000_000, 800_000,
    "Education and tourism bonus."),

  { pos: 15, type: "airport", name: "Allama Iqbal International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "Lahore's hub of trade and travel." },

  city(16, "Hyderabad", "orange", 1_800_000,
    [140_000, 700_000, 2_000_000, 5_500_000, 9_500_000], 1_000_000, 900_000,
    "Trade bonus — bangles and bustling bazaars."),

  { pos: 17, type: "chest", name: "Awami Fund", bonus: "Draw an Awami Fund (community) card." },

  city(18, "Multan", "orange", 1_800_000,
    [140_000, 700_000, 2_000_000, 5_500_000, 9_500_000], 1_000_000, 900_000,
    "Agricultural commerce bonus — the city of saints & mangoes."),

  city(19, "Quetta", "orange", 2_000_000,
    [160_000, 800_000, 2_200_000, 6_000_000, 10_000_000], 1_000_000, 1_000_000,
    "Transit route bonus — the gateway to Central Asia."),

  { pos: 20, type: "parking", name: "Chai Dhaba", bonus: "Free parking. Pull up a charpai and sip some chai." },

  city(21, "Faisalabad", "red", 2_200_000,
    [180_000, 900_000, 2_500_000, 7_000_000, 10_500_000], 1_500_000, 1_100_000,
    "Industrial income bonus — the Manchester of Pakistan."),

  { pos: 22, type: "chance", name: "Qismat", bonus: "Draw a Qismat (chance) card." },

  city(23, "Rawalpindi", "red", 2_200_000,
    [180_000, 900_000, 2_500_000, 7_000_000, 10_500_000], 1_500_000, 1_100_000,
    "Military-contract bonus."),

  city(24, "Peshawar", "red", 2_400_000,
    [200_000, 1_000_000, 3_000_000, 7_500_000, 11_000_000], 1_500_000, 1_200_000,
    "Cross-border trade bonus."),

  { pos: 25, type: "airport", name: "Islamabad International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "The capital's modern aerial gateway." },

  city(26, "Sialkot", "yellow", 2_600_000,
    [220_000, 1_100_000, 3_300_000, 8_000_000, 11_500_000], 1_500_000, 1_300_000,
    "Export manufacturing bonus — surgical goods & sportswear."),

  city(27, "Gwadar", "yellow", 2_600_000,
    [220_000, 1_100_000, 3_300_000, 8_000_000, 11_500_000], 1_500_000, 1_300_000,
    "Infrastructure growth bonus — the deep-sea port of the future."),

  { pos: 28, type: "utility", name: "Sui Northern Gas Pipelines",
    price: UTILITY_PRICE, mortgage: UTILITY_MORTGAGE, bonus: "Natural gas. Rent scales with dice and ownership." },

  city(29, "Murree", "yellow", 2_800_000,
    [240_000, 1_200_000, 3_600_000, 8_500_000, 12_000_000], 1_500_000, 1_400_000,
    "Seasonal tourism bonus — the Queen of the Hills."),

  { pos: 30, type: "gotojail", name: "NAB Investigation", bonus: "Go directly to Central Lockup. Do not collect Salary." },

  city(31, "Islamabad", "green", 3_000_000,
    [260_000, 1_300_000, 3_900_000, 9_000_000, 12_750_000], 2_000_000, 1_500_000,
    "Government contract bonus — the planned capital."),

  city(32, "Lahore", "green", 3_000_000,
    [260_000, 1_300_000, 3_900_000, 9_000_000, 12_750_000], 2_000_000, 1_500_000,
    "Culture and tourism bonus — the heart of Pakistan."),

  { pos: 33, type: "chest", name: "Awami Fund", bonus: "Draw an Awami Fund (community) card." },

  city(34, "Karachi", "green", 3_200_000,
    [280_000, 1_500_000, 4_500_000, 10_000_000, 14_000_000], 2_000_000, 1_600_000,
    "Highest economic output bonus — the City of Lights."),

  { pos: 35, type: "airport", name: "Bacha Khan International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "Peshawar's link to the wider world." },

  { pos: 36, type: "chance", name: "Qismat", bonus: "Draw a Qismat (chance) card." },

  city(37, "DHA Karachi", "darkblue", 3_500_000,
    [350_000, 1_750_000, 5_000_000, 11_000_000, 15_000_000], 2_000_000, 1_750_000,
    "Highest rent multiplier — Pakistan's most prestigious address."),

  { pos: 38, type: "luxury", name: "Withholding Tax", amount: 1_000_000,
    bonus: "A premium levy of Rs. 1,000,000." },

  city(39, "DHA Lahore", "darkblue", 4_000_000,
    [500_000, 2_000_000, 6_000_000, 14_000_000, 20_000_000], 2_000_000, 2_000_000,
    "Highest property appreciation — blue-chip real estate."),
];

/** All positions belonging to a colour group (for monopoly / even-build checks). */
export const GROUP_POSITIONS: Record<ColorGroup, number[]> = (() => {
  const map: Partial<Record<ColorGroup, number[]>> = {};
  for (const s of BOARD) {
    if (s.type === "city" && s.group) {
      (map[s.group] ??= []).push(s.pos);
    }
  }
  return map as Record<ColorGroup, number[]>;
})();

export const AIRPORT_POSITIONS = BOARD.filter((s) => s.type === "airport").map((s) => s.pos);
export const UTILITY_POSITIONS = BOARD.filter((s) => s.type === "utility").map((s) => s.pos);
export const OWNABLE_POSITIONS = BOARD.filter(
  (s) => s.type === "city" || s.type === "airport" || s.type === "utility"
).map((s) => s.pos);

export const GROUP_LABELS: Record<ColorGroup, string> = {
  brown: "Heritage Towns",
  lightblue: "Agri Belt",
  pink: "Regional Capitals",
  orange: "Trade Centers",
  red: "Industrial Heartland",
  yellow: "Export & Tourism",
  green: "Metropolis",
  darkblue: "Prestige (DHA)",
};

export const GROUP_COLORS: Record<ColorGroup, string> = {
  brown: "#7c4a2d",
  lightblue: "#5bb6d6",
  pink: "#d6589f",
  orange: "#e8843c",
  red: "#d23b3b",
  yellow: "#e8c33c",
  green: "#159b5a",
  darkblue: "#243b73",
};
