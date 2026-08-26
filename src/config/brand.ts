/**
 * The only place the product name lives. Rename freely (Part 0).
 * "Aangan" (आँगन) — the courtyard at the centre of a home, where the family
 * gathers.
 */
export const brand = {
  name: "Aangan",
  nameDevanagari: "आँगन",
  /** External links shown in onboarding (Part 4.1, screen 2). */
  links: {
    islrtc: "https://www.islrtc.nic.in/",
    nadIndia: "https://nadindia.org/",
  },
} as const;

export type Brand = typeof brand;
