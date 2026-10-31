export function transition(reduced: boolean | null) {
  return reduced
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 32, mass: 0.9 };
}
