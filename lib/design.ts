/** Shared wing used by structures, safety and the design search. */

export type WingDesign = {
  mass: number;
  loadFactor: number;
  materialId: string;
  /** m */
  sparWidth: number;
  /** m */
  sparHeight: number;
  /** m */
  wallThickness: number;
};

export const DEFAULT_DESIGN: WingDesign = {
  mass: 1000,
  loadFactor: 3.8,
  materialId: 'al-2024-t3',
  sparWidth: 0.12,
  sparHeight: 0.16,
  wallThickness: 0.008,
};

export type SavedCase = {
  name: string;
  span: number;
  chord: number;
  design: WingDesign;
};

export const EXAMPLE_CONDITIONS: { id: string; name: string; detail: string; mass: number; loadFactor: number }[] = [
  {
    id: 'level',
    name: 'Example: level-flight load',
    detail: '1,000 kg at a load factor of 1. An example input, not a flight-manual case.',
    mass: 1000,
    loadFactor: 1,
  },
  {
    id: 'utility',
    name: 'Example: 3.8 g load',
    detail: '1,000 kg at 3.8. The same starting load as the structures page.',
    mass: 1000,
    loadFactor: 3.8,
  },
  {
    id: 'heavy',
    name: 'Example: heavier aircraft',
    detail: '1,800 kg at 2.5 on the current spar. Edit either number after loading it.',
    mass: 1800,
    loadFactor: 2.5,
  },
];
