import type { BoardSpace, ColorGroup } from "./types";

// Airport & utility economics (computed dynamically in the engine).
export const AIRPORT_PRICE = 200;
export const AIRPORT_MORTGAGE = 100;
/** Rent = AIRPORT_BASE_RENT * 2^(owned-1) → 25 / 50 / 100 / 200. */
export const AIRPORT_BASE_RENT = 25;

export const UTILITY_PRICE = 150;
export const UTILITY_MORTGAGE = 75;
/** Utility rent = diceSum * (owns both ? 10 : 4) * UTILITY_RENT_UNIT. */
export const UTILITY_RENT_UNIT = 1;

export const GO_SALARY = 200;
export const JAIL_FINE = 50;
export const STARTING_CASH = 1500;

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
  { pos: 0, type: "go", name: "GO — Salary Day", bonus: "Collect Rs. 200 as you pass." },

  city(1, "Kasur", "brown", 60,
    [2, 10, 30, 90, 250], 50, 30,
    "Lower purchase price — a cheap foothold."),

  { pos: 2, type: "chest", name: "Awami Fund", bonus: "Draw an Awami Fund (community) card." },

  city(3, "Jhelum", "brown", 60,
    [4, 20, 60, 180, 450], 50, 30,
    "Historic city — small rent discount for visitors."),

  { pos: 4, type: "tax", name: "Income Tax — FBR", amount: 200,
    bonus: "Federal Board of Revenue collects Rs. 200." },

  { pos: 5, type: "airport", name: "Jinnah International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "Karachi's gateway. Own more airports for higher fees." },

  city(6, "Okara", "lightblue", 100,
    [6, 30, 90, 270, 550], 50, 50,
    "Agricultural growth bonus."),

  { pos: 7, type: "chance", name: "Qismat", bonus: "Draw a Qismat (chance) card." },

  city(8, "Gujrat", "lightblue", 100,
    [6, 30, 90, 270, 550], 50, 50,
    "Manufacturing bonus — fans, ceramics, furniture."),

  city(9, "Sahiwal", "lightblue", 120,
    [8, 40, 100, 300, 600], 50, 60,
    "Utility synergy bonus."),

  { pos: 10, type: "jail", name: "Central Lockup", bonus: "Just visiting — unless you've been sent here." },

  city(11, "Bahawalpur", "pink", 140,
    [10, 50, 150, 450, 750], 100, 70,
    "Tourism bonus — palaces and the Cholistan desert."),

  { pos: 12, type: "utility", name: "WAPDA",
    price: UTILITY_PRICE, mortgage: UTILITY_MORTGAGE, bonus: "Water & power. Rent scales with dice and ownership." },

  city(13, "Sargodha", "pink", 140,
    [10, 50, 150, 450, 750], 100, 70,
    "Agricultural exports bonus — the city of citrus."),

  city(14, "Abbottabad", "pink", 160,
    [12, 60, 180, 500, 900], 100, 80,
    "Education and tourism bonus."),

  { pos: 15, type: "airport", name: "Allama Iqbal International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "Lahore's hub of trade and travel." },

  city(16, "Hyderabad", "orange", 180,
    [14, 70, 200, 550, 950], 100, 90,
    "Trade bonus — bangles and bustling bazaars."),

  { pos: 17, type: "chest", name: "Awami Fund", bonus: "Draw an Awami Fund (community) card." },

  city(18, "Multan", "orange", 180,
    [14, 70, 200, 550, 950], 100, 90,
    "Agricultural commerce bonus — the city of saints & mangoes."),

  city(19, "Quetta", "orange", 200,
    [16, 80, 220, 600, 1000], 100, 100,
    "Transit route bonus — the gateway to Central Asia."),

  { pos: 20, type: "parking", name: "Chai Dhaba", bonus: "Free parking. Pull up a charpai and sip some chai." },

  city(21, "Faisalabad", "red", 220,
    [18, 90, 250, 700, 1050], 150, 110,
    "Industrial income bonus — the Manchester of Pakistan."),

  { pos: 22, type: "chance", name: "Qismat", bonus: "Draw a Qismat (chance) card." },

  city(23, "Rawalpindi", "red", 220,
    [18, 90, 250, 700, 1050], 150, 110,
    "Military-contract bonus."),

  city(24, "Peshawar", "red", 240,
    [20, 100, 300, 750, 1100], 150, 120,
    "Cross-border trade bonus."),

  { pos: 25, type: "airport", name: "Islamabad International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "The capital's modern aerial gateway." },

  city(26, "Sialkot", "yellow", 260,
    [22, 110, 330, 800, 1150], 150, 130,
    "Export manufacturing bonus — surgical goods & sportswear."),

  city(27, "Gwadar", "yellow", 260,
    [22, 110, 330, 800, 1150], 150, 130,
    "Infrastructure growth bonus — the deep-sea port of the future."),

  { pos: 28, type: "utility", name: "Sui Northern Gas Pipelines",
    price: UTILITY_PRICE, mortgage: UTILITY_MORTGAGE, bonus: "Natural gas. Rent scales with dice and ownership." },

  city(29, "Murree", "yellow", 280,
    [24, 120, 360, 850, 1200], 150, 140,
    "Seasonal tourism bonus — the Queen of the Hills."),

  { pos: 30, type: "gotojail", name: "NAB Investigation", bonus: "Go directly to Central Lockup. Do not collect Salary." },

  city(31, "Islamabad", "green", 300,
    [26, 130, 390, 900, 1275], 200, 150,
    "Government contract bonus — the planned capital."),

  city(32, "Lahore", "green", 300,
    [26, 130, 390, 900, 1275], 200, 150,
    "Culture and tourism bonus — the heart of Pakistan."),

  { pos: 33, type: "chest", name: "Awami Fund", bonus: "Draw an Awami Fund (community) card." },

  city(34, "Karachi", "green", 320,
    [28, 150, 450, 1000, 1400], 200, 160,
    "Highest economic output bonus — the City of Lights."),

  { pos: 35, type: "airport", name: "Bacha Khan International Airport",
    price: AIRPORT_PRICE, mortgage: AIRPORT_MORTGAGE, bonus: "Peshawar's link to the wider world." },

  { pos: 36, type: "chance", name: "Qismat", bonus: "Draw a Qismat (chance) card." },

  city(37, "DHA Karachi", "darkblue", 350,
    [35, 175, 500, 1100, 1500], 200, 175,
    "Highest rent multiplier — Pakistan's most prestigious address."),

  { pos: 38, type: "luxury", name: "Withholding Tax", amount: 100,
    bonus: "A premium levy of Rs. 100." },

  city(39, "DHA Lahore", "darkblue", 400,
    [50, 200, 600, 1400, 2000], 200, 200,
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
