/**
 * Typical room-temperature properties for the structural comparison.
 * These are published typical values, not design allowables. Temper, product
 * form, layup and test direction change them. MatWeb marks the aluminium
 * figures "NOT FOR DESIGN".
 */

export type MetalMaterial = {
  id: string;
  name: string;
  kind: 'metal';
  /** kg/m³ */
  density: number;
  /** Pa. Treated as isotropic, which is the usual engineering assumption for these wrought alloys. */
  youngsModulus: number;
  /** Pa. 0.2% tensile yield. */
  tensileYield: number;
  /** Pa. Ultimate tensile strength. */
  ultimateTensile: number;
  limitations: string;
  source: string;
  sourceUrl: string;
};

export type CompositeMaterial = {
  id: string;
  name: string;
  kind: 'composite';
  /** kg/m³. Nominal cured unidirectional laminate density. */
  density: number;
  /**
   * Pa. 0° tensile modulus, used only as an equivalent beam modulus when the
   * fibres are assumed to run along the spar. This is not an isotropic modulus.
   */
  youngsModulus: number;
  /** Pa. 0° tensile strength. Not a yield strength. */
  tensileStrength0: number;
  /** Pa. 0° compression strength. Not a yield strength. */
  compressiveStrength0: number;
  /** Pa. 90° tensile modulus, shown so the anisotropy is visible. Not used as the beam modulus. */
  tensileModulus90: number;
  /** Pa. 90° tensile strength. Not used as the beam failure stress. */
  tensileStrength90: number;
  limitations: string;
  source: string;
  sourceUrl: string;
};

export type Material = MetalMaterial | CompositeMaterial;

export const MATERIALS: Material[] = [
  {
    id: 'al-2024-t3',
    name: 'Aluminium 2024-T3',
    kind: 'metal',
    density: 2780,
    youngsModulus: 73.1e9,
    tensileYield: 345e6,
    ultimateTensile: 483e6,
    limitations: 'Typical Aluminium Association values for sheet, including the 18% elongation quoted for 1.6 mm sheet. Copper-bearing alloy: poorer corrosion resistance than 6061, so cladding or protection matters on a wing skin. Fatigue, bearing and notch values are not used in this beam.',
    source: 'ASM MatWeb, Aluminum 2024-T3. Density, modulus, yield and ultimate strength are marked AA typical and not for design.',
    sourceUrl: 'https://asm.matweb.com/search/specificmaterial.asp?bassnum=ma2024t3',
  },
  {
    id: 'al-6061-t6',
    name: 'Aluminium 6061-T6',
    kind: 'metal',
    density: 2700,
    youngsModulus: 68.9e9,
    tensileYield: 276e6,
    ultimateTensile: 310e6,
    limitations: 'Typical Aluminium Association values. Good corrosion resistance and joining, which is why it appears in fittings and secondary structure. It is not a high-strength spar alloy. The sheet and the bar do not share one elongation.',
    source: 'ASM MatWeb, Aluminum 6061-T6 and 6061-T651. Density, modulus, yield and ultimate strength are marked AA typical and not for design.',
    sourceUrl: 'https://asm.matweb.com/search/specificmaterial.asp?bassnum=ma6061t6',
  },
  {
    id: 'al-7075-t6',
    name: 'Aluminium 7075-T6',
    kind: 'metal',
    density: 2810,
    youngsModulus: 71.7e9,
    tensileYield: 503e6,
    ultimateTensile: 572e6,
    limitations: 'Typical Aluminium Association values for 7075-T6 and T651. High yield comes with stress-corrosion sensitivity in the short-transverse direction. The T73 temper is often chosen when that resistance matters, at a lower strength than these T6 numbers. Not a weldable alloy.',
    source: 'ASM MatWeb, Aluminum 7075-T6 and T651. Density 2.81 g/cm³, modulus 71.7 GPa, tensile yield 503 MPa and ultimate strength 572 MPa are the AA typical figures. Not for design.',
    sourceUrl: 'https://asm.matweb.com/search/SpecificMaterial.asp?bassnum=MA7075T6',
  },
  {
    id: 'hexply-8552-as4',
    name: 'HexPly 8552 / AS4 tape',
    kind: 'composite',
    density: 1580,
    youngsModulus: 141e9,
    tensileStrength0: 2207e6,
    compressiveStrength0: 1531e6,
    tensileModulus90: 10e9,
    tensileStrength90: 81e6,
    limitations: 'Unidirectional carbon tape, 25°C, dry, from the Hexcel European product sheet. The 0° tensile modulus is used here only if the fibres are imagined to run along the spar axis. The 90° tensile strength is 81 MPa, so the same material across the fibres is not this beam. A quasi-isotropic skin is less stiff than 141 GPa. The US product sheet lists a lower 0° tensile modulus, 19.6 msi, for the same nominal condition. Compression modulus on the European sheet is 128 GPa, not 141 GPa. None of these strengths is a metal yield stress.',
    source: 'Hexcel HexPly 8552 European product data sheet, AS4 unidirectional column, 25°C dry. Nominal cured laminate density 1.58 g/cm³.',
    sourceUrl: 'https://www.hexcel.com/wp-content/uploads/2025/12/HexPly_8552_eu_DataSheet1.pdf',
  },
];

export function materialById(id: string): Material | undefined {
  return MATERIALS.find((material) => material.id === id);
}
