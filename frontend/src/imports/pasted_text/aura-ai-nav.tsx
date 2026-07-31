Role

You are a Senior Product Designer from Apple Human Interface Design, VisionOS, and iOS UI teams.

Your task is NOT to redesign this navigation.

Your task is to recreate it exactly, preserving the same composition, proportions, spacing, and interaction style.

Think of this as rebuilding the navigation bar from scratch inside Figma using Auto Layout, Components, Variables, Smart Animate, and Interactive Components.

IMPORTANT

Do NOT redesign anything.

Do NOT change

layout
spacing
proportions
colors
typography hierarchy
glass effect
bubble effect
overall composition

The final result should feel like an Apple-designed Liquid Glass navigation bar.

Navigation Layout

The navigation must be positioned at the very top of the application.

It should be horizontally centered.

Navigation Width

1780px

Height

92px

Border Radius

999px

Padding

Left 20px

Right 20px

Top 12px

Bottom 12px
Background

The navigation background is made of ultra-thin Liquid Glass.

Properties

Background

rgba(255,255,255,0.34)

Background Blur

40px

Border

1px

rgba(255,255,255,0.55)

Inner Shadow

0 1 0 rgba(255,255,255,0.6)

Outer Shadow

0 18 60 rgba(110,140,255,0.10)

No hard edges.

No solid colors.

Everything should appear like frosted liquid crystal.

Aura AI Logo

Important

The Aura AI logo must NOT be inside the navigation tabs.

It must remain permanently fixed on the top-left side inside the navigation container.

Structure

○ Icon

Aura AI

The logo consists of

Circular Glass Icon

↓

Aura AI Text

The logo is independent from navigation.

Logo Icon

Create

48 × 48

Perfect Circle

Glass

Gradient

Blue

Purple

Cyan

White reflection

Center icon

Spark icon

Glow

Border

1px rgba(255,255,255,0.6)
Logo Text

To the right

Aura

Dark

Bold

AI

Gradient

Purple

Blue

Font

SF Pro Display

Weight

Semibold

Navigation Items

After the logo

Leave

80px

spacing.

Navigation items

Home

Chat

Emotion

Analytics

Reports

History

Settings

No other items.

No logout.

No profile.

Those belong elsewhere.

Typography

Font

SF Pro Display

Size

26px

Weight

500

Letter spacing

0

Color

#49536A

Active

#2458FF
Navigation Spacing

Every navigation item

Same spacing

Approximately

72px

No uneven spacing.

Everything perfectly centered.

Bubble Navigation

This is the most important feature.

There is only ONE active bubble.

The bubble moves between tabs.

It never duplicates.

The bubble is made of Liquid Glass.

Bubble Shape

Rounded Capsule

Height

68px

Width

Auto

Padding

Left

34px

Right

34px

Top

18px

Bottom

18px

Radius

999px

Bubble Material

Background

rgba(255,255,255,0.45)

Background Blur

55px

Border

rgba(255,255,255,0.65)

Shadow

0 18 50 rgba(120,150,255,0.18)

Glow

0 0 35 rgba(150,190,255,0.30)
Bubble Reflection

Top Reflection

Large soft highlight

Opacity

25%

Very smooth.

Bottom reflection

Almost invisible.

Bubble Drag Interaction

Exactly like iOS 27.

When user presses the active bubble

Bubble expands

↓

Glass stretches

↓

Background bends

↓

Neighbor tabs slightly move away

↓

Bubble follows cursor

↓

The liquid surface deforms

↓

The bubble snaps onto another tab

↓

The previous tab smoothly returns

↓

Everything settles with spring animation

This should feel like dragging a glass marble over water.

Liquid Morph

The background behind the bubble stretches.

Imagine

Mercury

Liquid silicone

VisionOS interface

No sharp animation.

Everything morphs.

Bubble Physics

The bubble has

Mass

Elasticity

Spring

Resistance

Viscosity

Momentum

It never teleports.

During Drag

The bubble

Scales

100%

↓

108%

Glow increases

Background blur increases

Specular reflection changes

Soft particles appear

Tiny bubbles appear around it

Bubble Release

When released

Bubble

Compresses

↓

Expands

↓

Settles

↓

Glow fades

↓

Particles disappear

↓

Navigation returns to normal

Animation

Spring

Glass Distortion

When dragging

The navigation background bends.

Like pressing your finger into liquid glass.

The distortion radius

Approximately

140px

No sharp edges.

Hover

Hover on tabs

Small glass highlight

Opacity

12%

Scale

102%

Duration

180ms

Cursor

Pointer changes

↓

Hand

↓

Grab

↓

Grabbing

During drag

Background

Exactly like reference.

Very soft

Apple

Light

Gradient

White

↓

Lavender

↓

Blue

↓

White

Huge radial gradients

Very soft.

No textures.

Ambient Lighting

Large blurred lights

Top Left

Bottom Right

Center

Very subtle.

Floating Glass Particles

Small

Transparent

Circular

Opacity

12%

Blur

8px

Very few.

Animation

Use Smart Animate.

Use Interactive Components.

Use Variables.

Use Spring animation.

Duration

400ms

Bounce

Medium

Ease

Spring

Component Structure
Navigation

├── Glass Container

├── Aura AI Logo

│      ├── Circle Icon

│      └── Aura AI Text

├── Home

├── Chat

├── Emotion

├── Analytics

├── Reports

├── History

├── Settings

└── Active Bubble
Final Experience

The finished navigation should feel indistinguishable from an Apple-designed Liquid Glass interface. The Aura AI logo remains fixed at the top-left, separate from the navigation items. The navigation order remains Home → Chat → Emotion → Analytics → Reports → History → Settings, with no Logout or Profile in the bar. A single translucent liquid-glass bubble slides, stretches, and morphs between tabs using smooth spring physics, while the surrounding glass surface subtly deforms, creating the impression of interacting with a living sheet of liquid glass rather than a conventional navigation bar. This interaction should feel calm, premium, tactile, and worthy of a next-generation operating system.