"use client";

import { useState } from "react";
import {
  // Layout
  Container,
  Stack,
  Divider,
  // Typography
  Heading,
  Text,
  Code,
  Label,
  // Data display
  StatCard,
  DataTable,
  type DataTableColumn,
  ProgressBar,
  VerdictBadge,
  ConfidenceMeter,
  LifecycleStage,
  ClaimCard,
  // Existing
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Badge,
  // Navigation
  NavBar,
  TabGroup,
  Breadcrumb,
  Sidebar,
  SidebarSection,
  SidebarItem,
  // Forms
  Input,
  Select,
  Textarea,
  FileUpload,
  // Feedback
  Alert,
  Toast,
  Spinner,
  Skeleton,
  EmptyState,
  // Overlays
  Dialog,
  Tooltip,
  Drawer,
} from "@toiletpaper/ui";

/* ------------------------------------------------------------------ */
/* Section wrapper                                                     */
/* ------------------------------------------------------------------ */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20 pb-16">
      <h2 className="mb-6 border-b-2 border-[var(--color-rule)] pb-2 font-[var(--font-serif)] text-[30px] font-bold tracking-[-0.01em] text-[var(--color-ink)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

function SubSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-8">
      <h3 className="mb-3 font-[var(--font-serif)] text-[20px] font-semibold text-[var(--color-ink)]">
        {title}
      </h3>
      {children}
    </div>
  );
}

function Showcase({
  label,
  children,
}: {
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      {label && (
        <span className="mb-2 block font-[var(--font-sans)] text-xs font-medium uppercase tracking-[0.08em] text-[var(--color-ink-muted)]">
          {label}
        </span>
      )}
      <div className="rounded-[4px] border border-[var(--color-rule-faint)] bg-white p-6">
        {children}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nav sections for sidebar                                            */
/* ------------------------------------------------------------------ */

const sections = [
  { id: "tokens", label: "Design Tokens" },
  { id: "layout", label: "Layout" },
  { id: "typography", label: "Typography" },
  { id: "data-display", label: "Data Display" },
  { id: "navigation", label: "Navigation" },
  { id: "forms", label: "Forms" },
  { id: "feedback", label: "Feedback" },
  { id: "overlays", label: "Overlays" },
];

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function StyleguidePage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [activeSection, setActiveSection] = useState("tokens");

  return (
    <div className="flex min-h-screen bg-[var(--color-paper)]">
      {/* Sidebar nav */}
      <nav className="sticky top-0 hidden h-screen w-56 shrink-0 overflow-y-auto border-r border-[var(--color-rule)] bg-white px-4 py-8 lg:block">
        <span className="mb-6 block font-[var(--font-serif)] text-lg font-bold text-[var(--color-ink)]">
          Styleguide
        </span>
        <div className="flex flex-col gap-0.5">
          {sections.map((s) => (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={() => setActiveSection(s.id)}
              className={`rounded-[4px] px-3 py-1.5 font-[var(--font-sans)] text-sm transition-colors ${
                activeSection === s.id
                  ? "bg-[var(--color-primary-faint)] font-medium text-[var(--color-primary)]"
                  : "text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]"
              }`}
            >
              {s.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main className="flex-1 px-8 py-12 lg:px-16">
        <div className="mx-auto max-w-4xl">
          {/* Page header */}
          <div className="mb-12">
            <h1 className="font-[var(--font-serif)] text-[48px] font-bold leading-tight tracking-[-0.02em] text-[var(--color-ink)]">
              toiletpaper
            </h1>
            <p className="mt-2 font-[var(--font-sans)] text-lg text-[var(--color-ink-muted)]">
              Component styleguide and design system reference. Academic
              precision for scientific claim verification.
            </p>
          </div>

          {/* ============================================================ */}
          {/* 1. DESIGN TOKENS                                             */}
          {/* ============================================================ */}

          <Section id="tokens" title="Design Tokens">
            {/* Colors */}
            <SubSection title="Color Palette">
              <Showcase label="Backgrounds">
                <div className="flex flex-wrap gap-3">
                  <ColorSwatch color="#FAFAF8" name="Paper" />
                  <ColorSwatch color="#F5F3EF" name="Paper Warm" />
                  <ColorSwatch color="#FFFFFF" name="White" />
                </div>
              </Showcase>

              <Showcase label="Text / Ink">
                <div className="flex flex-wrap gap-3">
                  <ColorSwatch color="#1A1A1A" name="Ink" dark />
                  <ColorSwatch color="#3D3D3D" name="Ink Light" dark />
                  <ColorSwatch color="#6B6B6B" name="Ink Muted" dark />
                  <ColorSwatch color="#9B9B9B" name="Ink Faint" />
                </div>
              </Showcase>

              <Showcase label="Borders / Rules">
                <div className="flex flex-wrap gap-3">
                  <ColorSwatch color="#D4D0C8" name="Rule" />
                  <ColorSwatch color="#E8E5DE" name="Rule Faint" />
                  <ColorSwatch color="#B0ADA6" name="Rule Strong" />
                </div>
              </Showcase>

              <Showcase label="Primary">
                <div className="flex flex-wrap gap-3">
                  <ColorSwatch color="#4A6FA5" name="Primary" dark />
                  <ColorSwatch color="#6B8FBF" name="Primary Light" dark />
                  <ColorSwatch color="#E8EEF5" name="Primary Faint" />
                  <ColorSwatch color="#3A5A87" name="Primary Dark" dark />
                </div>
              </Showcase>

              <Showcase label="Verdict States">
                <div className="flex flex-wrap gap-3">
                  <ColorSwatch color="#2D6A4F" name="Reproduced" dark />
                  <ColorSwatch color="#D4EDE1" name="Reproduced Light" />
                  <ColorSwatch color="#9B2226" name="Contradicted" dark />
                  <ColorSwatch color="#F5D5D6" name="Contradicted Light" />
                  <ColorSwatch color="#B07D2B" name="Fragile" dark />
                  <ColorSwatch color="#F5ECD4" name="Fragile Light" />
                  <ColorSwatch color="#6B6B6B" name="Undetermined" dark />
                  <ColorSwatch color="#E8E5DE" name="Undetermined Light" />
                  <ColorSwatch color="#8B8589" name="Not Simulable" dark />
                  <ColorSwatch color="#EDEBEC" name="Not Simulable Light" />
                </div>
              </Showcase>
            </SubSection>

            {/* Typography scale */}
            <SubSection title="Type Scale">
              <Showcase>
                <div className="space-y-4">
                  {[
                    { size: "48px", label: "5xl / 48px" },
                    { size: "36px", label: "4xl / 36px" },
                    { size: "30px", label: "3xl / 30px" },
                    { size: "24px", label: "2xl / 24px" },
                    { size: "20px", label: "xl / 20px" },
                    { size: "18px", label: "lg / 18px" },
                    { size: "16px", label: "base / 16px" },
                    { size: "14px", label: "sm / 14px" },
                    { size: "12px", label: "xs / 12px" },
                  ].map(({ size, label }) => (
                    <div key={size} className="flex items-baseline gap-4">
                      <span className="w-28 shrink-0 font-[var(--font-mono)] text-xs text-[var(--color-ink-muted)]">
                        {label}
                      </span>
                      <span
                        style={{ fontSize: size }}
                        className="font-[var(--font-serif)] leading-tight text-[var(--color-ink)]"
                      >
                        Scientific Claims
                      </span>
                    </div>
                  ))}
                </div>
              </Showcase>
            </SubSection>

            {/* Font families */}
            <SubSection title="Font Families">
              <Showcase>
                <Stack gap={4}>
                  <div>
                    <Label>Serif (Headings)</Label>
                    <p className="mt-1 font-[var(--font-serif)] text-xl text-[var(--color-ink)]">
                      The quick brown fox jumps over the lazy dog. 0123456789
                    </p>
                  </div>
                  <div>
                    <Label>Sans-serif (Body)</Label>
                    <p className="mt-1 font-[var(--font-sans)] text-base text-[var(--color-ink)]">
                      The quick brown fox jumps over the lazy dog. 0123456789
                    </p>
                  </div>
                  <div>
                    <Label>Monospace (Data)</Label>
                    <p className="mt-1 font-[var(--font-mono)] text-sm text-[var(--color-ink)]">
                      The quick brown fox jumps over the lazy dog. 0123456789
                    </p>
                  </div>
                </Stack>
              </Showcase>
            </SubSection>

            {/* Spacing */}
            <SubSection title="Spacing Scale">
              <Showcase>
                <div className="space-y-2">
                  {[
                    [1, 4],
                    [2, 8],
                    [3, 12],
                    [4, 16],
                    [5, 20],
                    [6, 24],
                    [8, 32],
                    [10, 40],
                    [12, 48],
                    [16, 64],
                  ].map(([step, px]) => (
                    <div key={step} className="flex items-center gap-3">
                      <span className="w-10 font-[var(--font-mono)] text-xs text-[var(--color-ink-muted)]">
                        {step}
                      </span>
                      <div
                        className="h-3 rounded-sm bg-[var(--color-primary)]"
                        style={{ width: `${px}px` }}
                      />
                      <span className="font-[var(--font-mono)] text-xs text-[var(--color-ink-faint)]">
                        {px}px
                      </span>
                    </div>
                  ))}
                </div>
              </Showcase>
            </SubSection>

            {/* Shadows */}
            <SubSection title="Shadows">
              <Showcase>
                <div className="flex flex-wrap gap-6">
                  {[
                    { name: "Subtle", shadow: "0 1px 2px rgba(0,0,0,0.04)" },
                    { name: "Medium", shadow: "0 2px 8px rgba(0,0,0,0.08)" },
                    {
                      name: "Elevated",
                      shadow: "0 8px 24px rgba(0,0,0,0.12)",
                    },
                  ].map(({ name, shadow }) => (
                    <div
                      key={name}
                      className="flex h-20 w-32 items-center justify-center rounded-[4px] border border-[var(--color-rule-faint)] bg-white font-[var(--font-sans)] text-sm text-[var(--color-ink-muted)]"
                      style={{ boxShadow: shadow }}
                    >
                      {name}
                    </div>
                  ))}
                </div>
              </Showcase>
            </SubSection>

            {/* Radii */}
            <SubSection title="Border Radii">
              <Showcase>
                <div className="flex flex-wrap gap-4">
                  {[
                    { name: "none", r: "0px" },
                    { name: "sm", r: "2px" },
                    { name: "md", r: "4px" },
                    { name: "lg", r: "8px" },
                    { name: "xl", r: "12px" },
                    { name: "2xl", r: "16px" },
                  ].map(({ name, r }) => (
                    <div key={name} className="text-center">
                      <div
                        className="mb-1 h-14 w-14 border-2 border-[var(--color-primary)] bg-[var(--color-primary-faint)]"
                        style={{ borderRadius: r }}
                      />
                      <span className="font-[var(--font-mono)] text-[10px] text-[var(--color-ink-muted)]">
                        {name} ({r})
                      </span>
                    </div>
                  ))}
                </div>
              </Showcase>
            </SubSection>
          </Section>

          {/* ============================================================ */}
          {/* 2. LAYOUT                                                    */}
          {/* ============================================================ */}

          <Section id="layout" title="Layout">
            <SubSection title="Container">
              <Showcase>
                <Stack gap={3}>
                  {(["sm", "md", "default", "lg", "full"] as const).map(
                    (size) => (
                      <Container
                        key={size}
                        size={size}
                        className="rounded-[4px] border border-dashed border-[var(--color-primary)] bg-[var(--color-primary-faint)] px-3 py-2"
                      >
                        <span className="font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
                          Container size=&quot;{size}&quot;
                        </span>
                      </Container>
                    ),
                  )}
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Stack">
              <Showcase label="Vertical (default)">
                <Stack gap={2}>
                  <div className="rounded-sm bg-[var(--color-primary-faint)] p-3 text-center font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
                    Item 1
                  </div>
                  <div className="rounded-sm bg-[var(--color-primary-faint)] p-3 text-center font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
                    Item 2
                  </div>
                  <div className="rounded-sm bg-[var(--color-primary-faint)] p-3 text-center font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
                    Item 3
                  </div>
                </Stack>
              </Showcase>

              <Showcase label="Horizontal with gap=4, align=center">
                <Stack direction="horizontal" gap={4} align="center">
                  <div className="rounded-sm bg-[var(--color-primary-faint)] p-3 font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
                    Left
                  </div>
                  <div className="rounded-sm bg-[var(--color-primary-faint)] p-6 font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
                    Center (tall)
                  </div>
                  <div className="rounded-sm bg-[var(--color-primary-faint)] p-3 font-[var(--font-mono)] text-xs text-[var(--color-primary)]">
                    Right
                  </div>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Divider">
              <Showcase>
                <Stack gap={4}>
                  <Text size="sm" color="muted">
                    Content above divider
                  </Text>
                  <Divider />
                  <Text size="sm" color="muted">
                    Plain divider above
                  </Text>
                  <Divider label="Section" />
                  <Text size="sm" color="muted">
                    Labeled divider above
                  </Text>
                </Stack>
              </Showcase>
            </SubSection>
          </Section>

          {/* ============================================================ */}
          {/* 3. TYPOGRAPHY                                                */}
          {/* ============================================================ */}

          <Section id="typography" title="Typography">
            <SubSection title="Headings">
              <Showcase>
                <Stack gap={4}>
                  <Heading level={1}>Heading 1 — 48px Serif</Heading>
                  <Heading level={2}>Heading 2 — 36px Serif</Heading>
                  <Heading level={3}>Heading 3 — 30px Serif</Heading>
                  <Heading level={4}>Heading 4 — 24px Serif</Heading>
                  <Heading level={5}>Heading 5 — 20px Serif</Heading>
                  <Heading level={6}>Heading 6 — 18px Serif</Heading>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Body Text">
              <Showcase>
                <Stack gap={3}>
                  <Text size="xl">
                    Extra-large body text for introductions and summaries.
                  </Text>
                  <Text size="lg">
                    Large body text for important paragraphs and callouts.
                  </Text>
                  <Text>
                    Default body text (16px). This is the standard reading size
                    for content. The gravitational constant G = 6.674 x 10^-11
                    N(m/kg)^2 has been measured with increasing precision.
                  </Text>
                  <Text size="sm" color="muted">
                    Small muted text for secondary information and metadata.
                  </Text>
                  <Text size="xs" color="faint">
                    Extra-small faint text for timestamps, IDs, and fine print.
                  </Text>
                </Stack>
              </Showcase>

              <Showcase label="Text colors">
                <Stack gap={2}>
                  <Text color="default">Default ink color</Text>
                  <Text color="light">Light ink color</Text>
                  <Text color="muted">Muted ink color</Text>
                  <Text color="faint">Faint ink color</Text>
                  <Text color="primary">Primary color</Text>
                  <Text color="success">Success / Reproduced</Text>
                  <Text color="warning">Warning / Fragile</Text>
                  <Text color="error">Error / Contradicted</Text>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Code">
              <Showcase>
                <Stack gap={4}>
                  <Text>
                    Inline code example:{" "}
                    <Code>G = 6.674e-11 N(m/kg)^2</Code> within
                    running text.
                  </Text>
                  <Code variant="block">{`# Simulation parameters
mass = 1.989e30      # Solar mass (kg)
radius = 6.957e8     # Solar radius (m)
temperature = 5778   # Surface temp (K)

result = simulate(mass, radius, temperature)
print(f"Luminosity: {result.luminosity:.3e} W")`}</Code>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Labels">
              <Showcase>
                <Stack direction="horizontal" gap={6} align="baseline">
                  <Label size="xs">Extra Small</Label>
                  <Label size="sm">Small</Label>
                  <Label>Default</Label>
                  <Label size="lg">Large</Label>
                  <Label weight="semibold">Semibold</Label>
                </Stack>
              </Showcase>
            </SubSection>
          </Section>

          {/* ============================================================ */}
          {/* 4. DATA DISPLAY                                              */}
          {/* ============================================================ */}

          <Section id="data-display" title="Data Display">
            <SubSection title="Stat Cards">
              <Showcase>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                  <StatCard
                    label="Papers Analyzed"
                    value={142}
                    trend={{ direction: "up", value: "+12 this week" }}
                  />
                  <StatCard
                    label="Claims Extracted"
                    value="1,847"
                    trend={{ direction: "up", value: "+89" }}
                  />
                  <StatCard
                    label="Reproduction Rate"
                    value="73.2"
                    unit="%"
                    trend={{ direction: "down", value: "-2.1%" }}
                  />
                  <StatCard
                    label="Avg Confidence"
                    value="68.5"
                    unit="%"
                    trend={{ direction: "flat", value: "steady" }}
                  />
                </div>
              </Showcase>
            </SubSection>

            <SubSection title="Data Table">
              <Showcase>
                <DataTable
                  columns={
                    [
                      { key: "id", header: "ID", mono: true, sortable: true },
                      { key: "claim", header: "Claim", sortable: true },
                      { key: "value", header: "Value", mono: true, sortable: true },
                      {
                        key: "confidence",
                        header: "Confidence",
                        mono: true,
                        sortable: true,
                      },
                      {
                        key: "verdict",
                        header: "Verdict",
                        render: (row: Record<string, unknown>) => (
                          <VerdictBadge
                            verdict={
                              row.verdict as
                                | "reproduced"
                                | "contradicted"
                                | "fragile"
                                | "undetermined"
                            }
                          />
                        ),
                      },
                    ] as DataTableColumn<Record<string, unknown>>[]
                  }
                  data={[
                    {
                      id: "CLM-001",
                      claim: "G = 6.674e-11 N(m/kg)^2",
                      value: "6.674e-11",
                      confidence: "94.2%",
                      verdict: "reproduced",
                    },
                    {
                      id: "CLM-002",
                      claim: "Hubble constant H0 = 67.4 km/s/Mpc",
                      value: "67.4",
                      confidence: "71.8%",
                      verdict: "fragile",
                    },
                    {
                      id: "CLM-003",
                      claim: "Dark energy fraction = 0.683",
                      value: "0.683",
                      confidence: "45.1%",
                      verdict: "undetermined",
                    },
                    {
                      id: "CLM-004",
                      claim: "Proton lifetime > 10^34 years",
                      value: ">1e34",
                      confidence: "88.7%",
                      verdict: "reproduced",
                    },
                    {
                      id: "CLM-005",
                      claim: "Neutrino mass = 0.12 eV",
                      value: "0.12",
                      confidence: "22.3%",
                      verdict: "contradicted",
                    },
                  ]}
                  getRowKey={(row) => row.id as string}
                />
              </Showcase>
            </SubSection>

            <SubSection title="Progress Bars">
              <Showcase>
                <Stack gap={4}>
                  <div>
                    <Label className="mb-1">Default</Label>
                    <ProgressBar value={72} showLabel />
                  </div>
                  <div>
                    <Label className="mb-1">Success / Reproduced</Label>
                    <ProgressBar value={94} color="reproduced" showLabel />
                  </div>
                  <div>
                    <Label className="mb-1">Warning / Fragile</Label>
                    <ProgressBar value={45} color="fragile" showLabel />
                  </div>
                  <div>
                    <Label className="mb-1">Error / Contradicted</Label>
                    <ProgressBar value={18} color="contradicted" showLabel />
                  </div>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Verdict Badges">
              <Showcase>
                <Stack direction="horizontal" gap={3} wrap>
                  <VerdictBadge verdict="reproduced" />
                  <VerdictBadge verdict="contradicted" />
                  <VerdictBadge verdict="fragile" />
                  <VerdictBadge verdict="undetermined" />
                  <VerdictBadge verdict="not-simulable" />
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Confidence Meters">
              <Showcase>
                <Stack gap={3}>
                  <div>
                    <Label className="mb-1">High (95%)</Label>
                    <ConfidenceMeter value={95} />
                  </div>
                  <div>
                    <Label className="mb-1">Good (72%)</Label>
                    <ConfidenceMeter value={72} />
                  </div>
                  <div>
                    <Label className="mb-1">Moderate (55%)</Label>
                    <ConfidenceMeter value={55} />
                  </div>
                  <div>
                    <Label className="mb-1">Low (30%)</Label>
                    <ConfidenceMeter value={30} />
                  </div>
                  <div>
                    <Label className="mb-1">Very Low (12%)</Label>
                    <ConfidenceMeter value={12} />
                  </div>
                </Stack>
              </Showcase>

              <Showcase label="Sizes">
                <Stack gap={3}>
                  <div>
                    <Label className="mb-1">Small</Label>
                    <ConfidenceMeter value={78} size="sm" />
                  </div>
                  <div>
                    <Label className="mb-1">Medium (default)</Label>
                    <ConfidenceMeter value={78} size="md" />
                  </div>
                  <div>
                    <Label className="mb-1">Large</Label>
                    <ConfidenceMeter value={78} size="lg" />
                  </div>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Lifecycle Stages">
              <Showcase>
                <Stack direction="horizontal" gap={6} wrap>
                  <LifecycleStage label="Uploaded" reached />
                  <LifecycleStage label="Extracted" reached />
                  <LifecycleStage label="Ingested" reached />
                  <LifecycleStage label="Simulating" reached={false} current />
                  <LifecycleStage label="Verified" reached={false} />
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Claim Cards">
              <Showcase>
                <Stack gap={4}>
                  <ClaimCard
                    claim="The gravitational constant G = 6.674 x 10^-11 N(m/kg)^2 was measured using a torsion balance experiment with improved systematic error control."
                    verdict="reproduced"
                    confidence={94.2}
                    value="6.674e-11"
                    unit="N(m/kg)^2"
                    evidence="Simulation converged within 0.1% of claimed value across 10,000 Monte Carlo runs. Systematic uncertainties bounded."
                    source="arxiv:2301.12345"
                  />
                  <ClaimCard
                    claim="The Hubble constant H0 = 73.04 km/s/Mpc based on Type Ia supernovae distance ladder measurements."
                    verdict="fragile"
                    confidence={45.1}
                    value="73.04"
                    unit="km/s/Mpc"
                    evidence="Tension with CMB-derived value (67.4). Result sensitive to calibration assumptions. Simulation shows bifurcation."
                  />
                  <ClaimCard
                    claim="Cold fusion at room temperature produces excess heat of 20W per cell."
                    verdict="contradicted"
                    confidence={8.3}
                    value="20"
                    unit="W/cell"
                    evidence="No excess heat detected in simulation. Claimed energy output violates conservation constraints."
                  />
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Existing: Badges">
              <Showcase>
                <Stack direction="horizontal" gap={2} wrap>
                  <Badge>Default</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="danger">Danger</Badge>
                  <Badge variant="muted">Muted</Badge>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Existing: Cards">
              <Showcase>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card>
                    <CardHeader>
                      <CardTitle>Paper Analysis</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Text size="sm" color="muted">
                        142 claims extracted, 104 reproduced, 12 contradicted,
                        26 undetermined.
                      </Text>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardHeader>
                      <CardTitle>Simulation Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Text size="sm" color="muted">
                        3 active simulations, avg runtime 4.2s per claim.
                      </Text>
                    </CardContent>
                  </Card>
                </div>
              </Showcase>
            </SubSection>
          </Section>

          {/* ============================================================ */}
          {/* 5. NAVIGATION                                                */}
          {/* ============================================================ */}

          <Section id="navigation" title="Navigation">
            <SubSection title="Nav Bar">
              <Showcase>
                <div className="-m-6">
                  <NavBar
                    brand="toiletpaper"
                    actions={
                      <Button size="sm">Upload Paper</Button>
                    }
                  >
                    <a href="#" className="hover:text-[var(--color-ink)]">
                      Papers
                    </a>
                    <a href="#" className="hover:text-[var(--color-ink)]">
                      Claims
                    </a>
                    <a href="#" className="hover:text-[var(--color-ink)]">
                      Simulations
                    </a>
                  </NavBar>
                </div>
              </Showcase>
            </SubSection>

            <SubSection title="Tab Group">
              <Showcase>
                <TabGroup
                  tabs={[
                    { id: "overview", label: "Overview" },
                    { id: "claims", label: "Claims (24)" },
                    { id: "simulations", label: "Simulations" },
                    { id: "evidence", label: "Evidence Graph" },
                    { id: "raw", label: "Raw PDF", disabled: true },
                  ]}
                  defaultValue="claims"
                />
              </Showcase>
            </SubSection>

            <SubSection title="Breadcrumb">
              <Showcase>
                <Stack gap={3}>
                  <Breadcrumb>
                    <a href="#">Papers</a>
                    <a href="#">arXiv:2301.12345</a>
                    <span>Claim CLM-001</span>
                  </Breadcrumb>
                  <Breadcrumb separator="/">
                    <a href="#">Home</a>
                    <a href="#">Simulations</a>
                    <span>Run #847</span>
                  </Breadcrumb>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Sidebar">
              <Showcase>
                <div className="h-64 overflow-hidden rounded-[4px] border border-[var(--color-rule)]">
                  <Sidebar className="h-full">
                    <SidebarSection title="Analysis">
                      <SidebarItem active>Dashboard</SidebarItem>
                      <SidebarItem>Papers</SidebarItem>
                      <SidebarItem>Claims</SidebarItem>
                    </SidebarSection>
                    <SidebarSection title="Simulation">
                      <SidebarItem>Active Runs</SidebarItem>
                      <SidebarItem>History</SidebarItem>
                      <SidebarItem>Configuration</SidebarItem>
                    </SidebarSection>
                  </Sidebar>
                </div>
              </Showcase>
            </SubSection>
          </Section>

          {/* ============================================================ */}
          {/* 6. FORMS                                                     */}
          {/* ============================================================ */}

          <Section id="forms" title="Forms">
            <SubSection title="Text Input">
              <Showcase>
                <Stack gap={4}>
                  <Input label="Paper Title" placeholder="Enter paper title..." />
                  <Input
                    label="DOI"
                    placeholder="10.1234/example"
                    hint="Digital Object Identifier"
                  />
                  <Input
                    label="Author ORCID"
                    placeholder="0000-0000-0000-0000"
                    errorMessage="Invalid ORCID format"
                  />
                  <Stack direction="horizontal" gap={4}>
                    <Input
                      label="Value"
                      placeholder="0.0"
                      inputSize="sm"
                    />
                    <Input
                      label="Unit"
                      placeholder="kg/m^3"
                      inputSize="sm"
                    />
                  </Stack>
                  <Input
                    label="Disabled Input"
                    value="Cannot edit"
                    disabled
                  />
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Select">
              <Showcase>
                <Stack gap={4}>
                  <Select
                    label="Simulation Engine"
                    placeholder="Select engine..."
                    options={[
                      { value: "mts", label: "MTS Integrator" },
                      { value: "verlet", label: "Velocity Verlet" },
                      { value: "rk4", label: "Runge-Kutta 4" },
                      { value: "leapfrog", label: "Leapfrog" },
                    ]}
                  />
                  <Select
                    label="Output Format"
                    options={[
                      { value: "json", label: "JSON" },
                      { value: "csv", label: "CSV" },
                      { value: "hdf5", label: "HDF5", disabled: true },
                    ]}
                    errorMessage="Please select an output format"
                  />
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Textarea">
              <Showcase>
                <Stack gap={4}>
                  <Textarea
                    label="Claim Description"
                    placeholder="Describe the scientific claim being tested..."
                    hint="Include the specific numerical assertion if applicable."
                  />
                  <Textarea
                    label="Notes"
                    placeholder="Add reviewer notes..."
                    errorMessage="Notes are required for contradicted claims"
                  />
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="File Upload">
              <Showcase>
                <FileUpload
                  onFiles={(files) => console.log("Files:", files)}
                  accept="application/pdf"
                  label="Drag & drop a PDF here, or click to browse"
                  hint="Supports PDF files up to 50MB"
                />
              </Showcase>
            </SubSection>

            <SubSection title="Buttons">
              <Showcase>
                <Stack gap={4}>
                  <Stack direction="horizontal" gap={3} wrap align="center">
                    <Button>Primary</Button>
                    <Button variant="secondary">Secondary</Button>
                    <Button variant="destructive">Destructive</Button>
                    <Button variant="ghost">Ghost</Button>
                    <Button variant="link">Link</Button>
                  </Stack>
                  <Stack direction="horizontal" gap={3} wrap align="center">
                    <Button size="sm">Small</Button>
                    <Button size="default">Default</Button>
                    <Button size="lg">Large</Button>
                  </Stack>
                  <Stack direction="horizontal" gap={3} wrap align="center">
                    <Button disabled>Disabled</Button>
                  </Stack>
                </Stack>
              </Showcase>
            </SubSection>
          </Section>

          {/* ============================================================ */}
          {/* 7. FEEDBACK                                                  */}
          {/* ============================================================ */}

          <Section id="feedback" title="Feedback">
            <SubSection title="Alerts">
              <Showcase>
                <Stack gap={3}>
                  <Alert variant="info" title="Information">
                    Paper arxiv:2301.12345 has been queued for claim extraction.
                  </Alert>
                  <Alert variant="success" title="Simulation Complete">
                    All 24 claims have been verified. 18 reproduced, 4 fragile, 2 contradicted.
                  </Alert>
                  <Alert variant="warning" title="Fragile Result">
                    Claim CLM-007 shows sensitivity to initial conditions. Confidence below threshold.
                  </Alert>
                  <Alert variant="error" title="Simulation Failed">
                    Runtime error in Monte Carlo step 847. Check boundary conditions.
                  </Alert>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Toasts">
              <Showcase>
                <Stack gap={3}>
                  <Toast>Paper uploaded successfully.</Toast>
                  <Toast variant="success" onClose={() => {}}>
                    Simulation completed in 4.2 seconds.
                  </Toast>
                  <Toast variant="error" onClose={() => {}}>
                    Failed to connect to donto sidecar.
                  </Toast>
                  <Toast variant="warning" onClose={() => {}}>
                    Rate limit approaching (847/1000 requests).
                  </Toast>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Spinners">
              <Showcase>
                <Stack direction="horizontal" gap={6} align="center">
                  <Spinner size="sm" />
                  <Spinner />
                  <Spinner size="lg" />
                  <Spinner size="xl" />
                  <div className="flex items-center gap-2">
                    <Spinner size="sm" color="muted" />
                    <Text size="sm" color="muted">
                      Simulating...
                    </Text>
                  </div>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Skeletons">
              <Showcase>
                <Stack gap={4}>
                  <div>
                    <Label className="mb-2">Text skeleton</Label>
                    <Stack gap={2}>
                      <Skeleton />
                      <Skeleton width="80%" />
                      <Skeleton width="60%" />
                    </Stack>
                  </div>
                  <div>
                    <Label className="mb-2">Card skeleton</Label>
                    <div className="rounded-[4px] border border-[var(--color-rule-faint)] p-4">
                      <Stack direction="horizontal" gap={3} align="center">
                        <Skeleton variant="circular" />
                        <Stack gap={1} className="flex-1">
                          <Skeleton width="40%" />
                          <Skeleton width="70%" />
                        </Stack>
                      </Stack>
                      <Skeleton
                        variant="rectangular"
                        className="mt-3"
                        height={80}
                      />
                    </div>
                  </div>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Empty State">
              <Showcase>
                <EmptyState
                  icon={
                    <svg
                      className="h-12 w-12"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={1}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                      />
                    </svg>
                  }
                  title="No papers uploaded"
                  description="Upload a scientific paper to begin extracting and verifying claims against physics simulations."
                  action={<Button>Upload Paper</Button>}
                />
              </Showcase>
            </SubSection>
          </Section>

          {/* ============================================================ */}
          {/* 8. OVERLAYS                                                  */}
          {/* ============================================================ */}

          <Section id="overlays" title="Overlays">
            <SubSection title="Dialog">
              <Showcase>
                <Button onClick={() => setDialogOpen(true)}>Open Dialog</Button>
                <Dialog
                  open={dialogOpen}
                  onClose={() => setDialogOpen(false)}
                  title="Confirm Simulation"
                  description="This will run a full Monte Carlo simulation on all extracted claims."
                  footer={
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDialogOpen(false)}
                      >
                        Cancel
                      </Button>
                      <Button size="sm" onClick={() => setDialogOpen(false)}>
                        Run Simulation
                      </Button>
                    </>
                  }
                >
                  <Stack gap={3}>
                    <Text size="sm">
                      The simulation will process 24 claims using the MTS
                      integrator with default parameters. Estimated runtime: 4-8
                      minutes.
                    </Text>
                    <Alert variant="warning">
                      Running simulations consumes compute credits. Current
                      balance: 847 credits.
                    </Alert>
                  </Stack>
                </Dialog>
              </Showcase>
            </SubSection>

            <SubSection title="Tooltip">
              <Showcase>
                <Stack direction="horizontal" gap={6} align="center">
                  <Tooltip content="Gravitational constant" position="top">
                    <Code>G = 6.674e-11</Code>
                  </Tooltip>
                  <Tooltip
                    content="94.2% confidence"
                    position="bottom"
                  >
                    <VerdictBadge verdict="reproduced" />
                  </Tooltip>
                  <Tooltip
                    content="Click to view simulation details"
                    position="right"
                  >
                    <Button variant="ghost" size="sm">
                      Details
                    </Button>
                  </Tooltip>
                </Stack>
              </Showcase>
            </SubSection>

            <SubSection title="Drawer">
              <Showcase>
                <Button onClick={() => setDrawerOpen(true)}>
                  Open Drawer
                </Button>
                <Drawer
                  open={drawerOpen}
                  onClose={() => setDrawerOpen(false)}
                  title="Claim Details"
                  footer={
                    <Stack direction="horizontal" gap={2} justify="end">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setDrawerOpen(false)}
                      >
                        Close
                      </Button>
                      <Button size="sm">Re-run Simulation</Button>
                    </Stack>
                  }
                >
                  <Stack gap={4}>
                    <div>
                      <Label className="mb-1">Claim</Label>
                      <Text size="sm">
                        The gravitational constant G = 6.674 x 10^-11 N(m/kg)^2
                      </Text>
                    </div>
                    <div>
                      <Label className="mb-1">Verdict</Label>
                      <VerdictBadge verdict="reproduced" />
                    </div>
                    <div>
                      <Label className="mb-1">Confidence</Label>
                      <ConfidenceMeter value={94.2} />
                    </div>
                    <Divider label="Simulation Log" />
                    <Code variant="block">{`Step 1/10000: E = -1.234e-08 J
Step 2/10000: E = -1.234e-08 J
Step 3/10000: E = -1.235e-08 J
...
Step 10000/10000: E = -1.234e-08 J
Converged: YES
Error: 0.08%`}</Code>
                  </Stack>
                </Drawer>
              </Showcase>
            </SubSection>
          </Section>
        </div>
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Helper: color swatch                                                */
/* ------------------------------------------------------------------ */

function ColorSwatch({
  color,
  name,
  dark = false,
}: {
  color: string;
  name: string;
  dark?: boolean;
}) {
  return (
    <div className="text-center">
      <div
        className="mb-1 h-14 w-20 rounded-[4px] border border-[var(--color-rule-faint)]"
        style={{ backgroundColor: color }}
      />
      <span className="block font-[var(--font-sans)] text-[10px] font-medium text-[var(--color-ink-muted)]">
        {name}
      </span>
      <span className="block font-[var(--font-mono)] text-[10px] text-[var(--color-ink-faint)]">
        {color}
      </span>
    </div>
  );
}
