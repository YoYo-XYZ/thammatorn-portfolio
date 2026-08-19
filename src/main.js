import "./styles.css";
import { attachDebugControls } from "./debug-controls.js";
import { FluidSimulation } from "./fluid-simulation.js";

const shell = document.querySelector(".portfolio-shell");
const canvas = document.querySelector(".fluid-canvas");
const title = document.querySelector(".hero-title");
const debugPanel = document.querySelector(".debug-panel");

let simulation;
let resizeFrame = 0;

const updateFluidDomain = () => {
  const scrollOffset = Math.min(Math.max(window.scrollY, 0), window.innerHeight);
  shell.style.setProperty("--scroll-offset", `${scrollOffset}px`);
};

const handleFluidDomainChange = () => {
  updateFluidDomain();

  if (resizeFrame) return;

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    simulation?.resize();
  });
};

try {
  simulation = new FluidSimulation(canvas, title);
  attachDebugControls(debugPanel, simulation);
  simulation.setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handleMotionPreference = (event) => simulation.setReducedMotion(event.matches);

  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", handleMotionPreference);
  } else {
    reducedMotionQuery.addListener(handleMotionPreference);
  }

  document.addEventListener("visibilitychange", () => {
    simulation.setVisibilityPaused(document.hidden);
  });

  window.addEventListener("scroll", handleFluidDomainChange, { passive: true });
  window.addEventListener("resize", handleFluidDomainChange, { passive: true });
  handleFluidDomainChange();
  document.fonts?.ready?.then(() => simulation.resize(true));
} catch (error) {
  console.error("Unable to initialize the fluid background.", error);
  shell.classList.add("is-fallback");
}
