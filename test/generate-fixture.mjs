import PDFDocument from "pdfkit";
import { createWriteStream } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

const doc = new PDFDocument({ margin: 50 });
const outPath = join(__dirname, "fixtures", "graphene-aluminum-composites.pdf");
doc.pipe(createWriteStream(outPath));

doc.fontSize(16).font("Helvetica-Bold");
doc.text(
  "Thermal Conductivity Enhancement in Graphene-Reinforced Aluminum Matrix Composites: A Combined Experimental and Molecular Dynamics Study",
  { align: "center" },
);

doc.moveDown();
doc.fontSize(11).font("Helvetica");
doc.text(
  "Wei Zhang¹, Maria Rodriguez-Lopez², Kenji Tanaka¹, Sarah O'Brien²",
  { align: "center" },
);
doc.fontSize(9).text(
  "¹Department of Materials Science and Engineering, University of Cambridge\n²Department of Mechanical Engineering, MIT",
  { align: "center" },
);

doc.moveDown();
doc.fontSize(12).font("Helvetica-Bold").text("Abstract");
doc.fontSize(10).font("Helvetica").text(
  `We report a systematic investigation of the thermal conductivity of aluminum matrix composites reinforced with few-layer graphene (FLG) nanoplatelets at volume fractions ranging from 0.1 to 5.0 vol%. Composites were fabricated via spark plasma sintering (SPS) at 550°C and 50 MPa for 10 minutes. Thermal conductivity was measured using the laser flash method (LFA 457, Netzsch) from 25°C to 400°C.

At 2.0 vol% graphene loading, in-plane thermal conductivity reached 274 ± 8 W/(m·K), representing a 27% enhancement over the unreinforced Al matrix (216 ± 5 W/(m·K)). The through-thickness conductivity showed a more modest improvement of 11%, reaching 240 ± 6 W/(m·K), consistent with the anisotropic platelet morphology.

Molecular dynamics simulations using the AIREBO potential for carbon and EAM potential for aluminum predict an interfacial thermal conductance (ITC) of 85 ± 12 MW/(m²·K) at the Al-graphene interface. This value is 40% lower than the theoretically perfect contact value of 142 MW/(m²·K), which we attribute to the presence of nanoscale voids at the interface observed via HRTEM.

We demonstrate that thermal conductivity follows a modified effective medium approximation (EMA) when the Kapitza resistance is included, with predictions within 5% of experimental values across all volume fractions studied. The percolation threshold for thermal transport was identified at 1.8 vol%, consistent with excluded-volume Monte Carlo simulations predicting 1.7 ± 0.2 vol%.`,
);

doc.addPage();
doc.fontSize(12).font("Helvetica-Bold").text("1. Introduction");
doc.fontSize(10).font("Helvetica").text(
  `Aluminum matrix composites (AMCs) have attracted significant attention for thermal management applications in electronics packaging and aerospace components, where high thermal conductivity combined with low density is desirable [1-3]. Traditional reinforcements such as SiC and Al₂O₃ particles improve mechanical properties but often degrade thermal performance due to high interfacial thermal resistance [4].

Graphene, with its extraordinary in-plane thermal conductivity of approximately 5000 W/(m·K) for suspended single layers [5], represents a promising alternative reinforcement. However, translating this intrinsic property into macroscopic composite performance remains challenging due to: (i) interfacial thermal resistance at the metal-graphene boundary, (ii) difficulty in achieving uniform dispersion, and (iii) potential degradation of graphene during high-temperature processing [6].`,
);

doc.moveDown();
doc.fontSize(12).font("Helvetica-Bold").text("2. Experimental Methods");
doc.fontSize(10).font("Helvetica").text(
  `Few-layer graphene nanoplatelets (FLG, average thickness 2-5 nm, lateral size 5-15 μm) were procured from XG Sciences (Grade M-5). Aluminum powder (99.7% purity, D50 = 35 μm) was obtained from Alfa Aesar.

Graphene-aluminum mixtures were prepared by ball milling (300 rpm, 2 hours, BPR 10:1) under argon atmosphere. Consolidation was performed by spark plasma sintering (SPS, FCT HP D 25) at 550°C, 50 MPa, 10 min hold time, with a heating rate of 100°C/min.

Thermal diffusivity was measured by laser flash analysis (LFA 457, Netzsch) under argon flow. Specific heat was determined by differential scanning calorimetry (DSC 404 F3, Netzsch). Density was measured by the Archimedes method. Thermal conductivity was calculated as κ = α × Cp × ρ.`,
);

doc.addPage();
doc.fontSize(12).font("Helvetica-Bold").text("3. Results and Discussion");
doc.moveDown(0.5);
doc.fontSize(11).font("Helvetica-Bold").text("3.1 Thermal Conductivity");
doc.fontSize(10).font("Helvetica").text(
  `Table 1: Thermal conductivity at 25°C

Graphene (vol%)  |  In-plane κ W/(m·K)  |  Through-thickness κ W/(m·K)
0.0              |  216 ± 5             |  216 ± 5
0.1              |  221 ± 4             |  218 ± 5
0.5              |  234 ± 6             |  225 ± 4
1.0              |  248 ± 7             |  232 ± 5
2.0              |  274 ± 8             |  240 ± 6
3.0              |  285 ± 9             |  243 ± 7
5.0              |  291 ± 11            |  238 ± 8

The in-plane thermal conductivity increases monotonically with graphene content up to 5.0 vol%, though the rate of increase diminishes above 3.0 vol%. The through-thickness conductivity peaks at 2.0-3.0 vol% and decreases at 5.0 vol%, which we attribute to increased porosity (2.3% at 5.0 vol% vs. 0.4% at 2.0 vol%).`,
);

doc.moveDown();
doc.fontSize(11).font("Helvetica-Bold").text("3.2 Molecular Dynamics Simulations");
doc.fontSize(10).font("Helvetica").text(
  `Non-equilibrium molecular dynamics (NEMD) simulations were performed using LAMMPS (version 2023.08.02) with a simulation cell of 10 nm × 10 nm × 40 nm containing approximately 250,000 atoms. The AIREBO potential was used for C-C interactions and the embedded atom method (EAM) potential for Al-Al interactions.

The calculated interfacial thermal conductance (ITC) values were:
- Perfect interface: 142 ± 8 MW/(m²·K)
- With 5% vacancy defects: 118 ± 10 MW/(m²·K)
- With nanoscale void (2 nm diameter): 85 ± 12 MW/(m²·K)

The experimental Kapitza conductance extracted from the EMA model fitting is 82 ± 15 MW/(m²·K), in excellent agreement with the MD prediction for interfaces containing nanoscale voids.`,
);

doc.moveDown();
doc.fontSize(11).font("Helvetica-Bold").text("3.3 Percolation Analysis");
doc.fontSize(10).font("Helvetica").text(
  `The onset of thermal percolation was identified at 1.8 vol% from the inflection point in the κ vs. volume fraction curve. Monte Carlo simulations using excluded-volume theory predict a percolation threshold of 1.7 ± 0.2 vol% for platelets with aspect ratio 1000:1, consistent with our experimental observation.`,
);

doc.addPage();
doc.fontSize(12).font("Helvetica-Bold").text("4. Conclusions");
doc.fontSize(10).font("Helvetica").text(
  `1. Graphene-reinforced aluminum composites achieve a maximum in-plane thermal conductivity of 274 ± 8 W/(m·K) at 2.0 vol% loading, a 27% enhancement over the unreinforced matrix.

2. MD simulations accurately predict the interfacial thermal conductance (85 vs. 82 MW/(m²·K) for experimental), demonstrating that nanoscale voids are the primary source of Kapitza resistance.

3. The thermal percolation threshold of 1.8 vol% matches excluded-volume Monte Carlo predictions (1.7 ± 0.2 vol%).

4. The modified EMA model with Kapitza resistance reproduces experimental data within 5% across all compositions studied.

5. SPS processing at 550°C preserves graphene structural integrity with no detectable Al₄C₃ carbide formation.`,
);

doc.moveDown();
doc.fontSize(12).font("Helvetica-Bold").text("References");
doc.fontSize(9).font("Helvetica").text(
  `[1] Bakshi SR, Lahiri D, Agarwal A. International Materials Reviews 2010;55:41-64.
[2] Huang Y, Ouyang Q, Zhang D. Acta Metallurgica Sinica 2014;27:481-489.
[3] Tjong SC. Materials Science and Engineering R 2013;74:281-350.
[4] Ramanathan T, et al. Nature Nanotechnology 2008;3:327-331.
[5] Balandin AA, et al. Nano Letters 2008;8:902-907.
[6] Nieto A, Bisht A, Lahiri D, Zhang C, Agarwal A. International Materials Reviews 2017;62:241-302.
[7] Chu K, Jia C. Physica Status Solidi A 2014;211:184-190.
[8] Jiang R, Zhou X, Fang Q, Liu Z. Materials & Design 2016;92:84-93.
[9] Chen F, et al. Carbon 2016;96:836-842.`,
);

doc.end();
console.log(`Generated: ${outPath}`);
