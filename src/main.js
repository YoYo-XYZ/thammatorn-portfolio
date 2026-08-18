import "./styles.css";
import { FluidSimulation } from "./fluid-simulation.js";

const shell = document.querySelector(".portfolio-shell");
const canvas = document.querySelector(".fluid-canvas");
const title = document.querySelector(".hero-title");

let simulation;

try {
  simulation = new FluidSimulation(canvas, title);
  simulation.setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handleMotionPreference = (event) => simulation.setReducedMotion(event.matches);

  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", handleMotionPreference);
  } else {
    reducedMotionQuery.addListener(handleMotionPreference);
  }

  document.addEventListener("visibilitychange", () => {
    simulation.setPaused(document.hidden);
  });

  window.addEventListener("resize", () => simulation.resize(), { passive: true });
  document.fonts?.ready?.then(() => simulation.resize());
} catch (error) {
  console.error("Unable to initialize the fluid background.", error);
  shell.classList.add("is-fallback");
}
