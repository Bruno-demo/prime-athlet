import {
  Bike,
  CircleDot,
  Disc3,
  Dribbble,
  Dumbbell,
  Fish,
  Footprints,
  Goal,
  Hand,
  Mountain,
  PersonStanding,
  Swords,
  Target,
  Volleyball,
  Waves,
  type LucideIcon,
} from "lucide-react";
import { createElement, ReactElement } from "react";

const exactSportIconMap: Record<string, LucideIcon> = {
  football: Goal,
  soccer: Goal,
  futsal: Goal,
  basketball: Dribbble,
  running: Footprints,
  training: Dumbbell,
  gym: Dumbbell,
  fitness: Dumbbell,
  outdoor: Mountain,
  hiking: Mountain,
  cycling: Bike,
  biking: Bike,
  swimming: Waves,
  volleyball: Volleyball,
  tennis: CircleDot,
  badminton: CircleDot,
  squash: CircleDot,
  padel: CircleDot,
  boxing: Swords,
  mma: Swords,
  wrestling: Swords,
  handball: Hand,
  baseball: Target,
  cricket: Target,
  golf: Target,
  archery: Target,
  fishing: Fish,
  yoga: PersonStanding,
  pilates: PersonStanding,
  frisbee: Disc3,
  disc: Disc3,
};

const keywordIconMatchers: Array<{ keywords: string[]; icon: LucideIcon }> = [
  { keywords: ["football", "soccer", "futsal", "rugby"], icon: Goal },
  { keywords: ["basketball"], icon: Dribbble },
  { keywords: ["running", "jogging", "marathon", "track"], icon: Footprints },
  { keywords: ["training", "gym", "fitness", "workout", "crossfit"], icon: Dumbbell },
  { keywords: ["outdoor", "hiking", "trekking", "camping", "climbing"], icon: Mountain },
  { keywords: ["cycling", "biking", "bike"], icon: Bike },
  { keywords: ["swimming", "water", "surf", "triathlon"], icon: Waves },
  { keywords: ["volleyball"], icon: Volleyball },
  { keywords: ["tennis", "badminton", "padel", "squash", "racquet", "racket"], icon: CircleDot },
  { keywords: ["boxing", "mma", "martial", "wrestling", "fencing", "karate", "judo"], icon: Swords },
  { keywords: ["baseball", "cricket", "golf", "archery", "shooting"], icon: Target },
  { keywords: ["handball"], icon: Hand },
  { keywords: ["fishing"], icon: Fish },
  { keywords: ["yoga", "pilates"], icon: PersonStanding },
  { keywords: ["frisbee", "disc"], icon: Disc3 },
];

function normalizeSportName(sport: string): string {
  return sport.trim().toLowerCase();
}

function resolveSportIcon(sport: string): LucideIcon {
  const normalized = normalizeSportName(sport);
  if (!normalized) {
    return Dumbbell;
  }

  const exact = exactSportIconMap[normalized];
  if (exact) {
    return exact;
  }

  for (const matcher of keywordIconMatchers) {
    if (matcher.keywords.some((keyword) => normalized.includes(keyword))) {
      return matcher.icon;
    }
  }

  return Dumbbell;
}

function resolveSportColorClass(sport: string): string {
  const icon = resolveSportIcon(sport);

  if (icon === Goal) {
    return "text-[var(--sport-icon-football)]";
  }
  if (
    icon === Dribbble ||
    icon === Volleyball ||
    icon === CircleDot ||
    icon === Target ||
    icon === Hand ||
    icon === Disc3
  ) {
    return "text-[var(--sport-icon-basketball)]";
  }
  if (icon === Footprints || icon === Bike || icon === Waves) {
    return "text-[var(--sport-icon-running)]";
  }
  if (icon === Dumbbell || icon === PersonStanding || icon === Swords) {
    return "text-[var(--sport-icon-training)]";
  }
  if (icon === Mountain || icon === Fish) {
    return "text-[var(--sport-icon-outdoor)]";
  }

  return "text-[var(--sport-icon-default)]";
}

export function getSportIcon(sport: string): LucideIcon {
  return resolveSportIcon(sport);
}

export function getSportIconColorClass(sport: string): string {
  return resolveSportColorClass(sport);
}

interface RenderSportIconOptions {
  className?: string;
  toned?: boolean;
}

export function renderSportIcon(
  sport: string,
  options: RenderSportIconOptions = {},
): ReactElement {
  const iconClassName = [
    options.className,
    options.toned ? getSportIconColorClass(sport) : "",
  ]
    .filter(Boolean)
    .join(" ");

  return createElement(getSportIcon(sport), {
    className: iconClassName,
    "aria-hidden": true,
  });
}
