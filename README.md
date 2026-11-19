# AERO-X | Aerodynamic Laboratory

A Next.js + TypeScript educational aerofoil simulator MVP.

## Requirements
- Node.js 20.9 or newer
- npm

## Run locally
```bash
npm install
npm run dev
```
Open http://localhost:3000.

## Current features
- Interactive dashboard and aerodynamics lab navigation
- NACA 2412-style 2D section illustration with schematic streamlines
- Adjustable airspeed, angle of attack, air density, chord and span
- Live estimates for lift, drag, lift coefficient, drag coefficient, Reynolds number, dynamic pressure and L/D
- Lift coefficient vs angle-of-attack graph
- Reset controls

## Model limitations
This is an educational low-order model, not a CFD solver or aircraft-design tool. The lift curve, assumed stall onset (14 degrees), and drag polar are illustrative approximations. The SVG streamlines are schematic and are not numerically solved flow fields. The current model does not account for compressibility, viscous boundary-layer transition, finite-wing effects, ground effect, control surfaces, turbulence, or aeroelastic coupling. Do not use it for real aircraft design or flight decisions.

## Next development milestones
1. Replace illustrative lift/drag polar with documented, Reynolds-number-specific aerofoil data (e.g. XFOIL or published wind-tunnel polars).
2. Add selectable NACA profiles and clearly document their geometry.
3. Add finite-wing induced drag and span efficiency.
4. Add materials and a separately validated structural beam model.
5. Add validation experiments and exportable simulation reports.
