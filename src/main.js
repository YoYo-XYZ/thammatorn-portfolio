import "./styles.css";
import { attachDebugControls } from "./debug-controls.js";
import { FluidSimulation } from "./fluid-simulation.js";

const shell = document.querySelector(".portfolio-shell");
const canvas = document.querySelector(".fluid-canvas");
const title = document.querySelector(".hero-title");
const heroCopy = document.querySelector(".hero-copy");
const debugPanel = document.querySelector(".debug-panel");

const HERO_FADE_START = 0.3;
const HERO_FADE_END = 0.7;

let simulation;
let resizeFrame = 0;

const updateFluidDomain = () => {
  const viewportHeight = Math.max(window.innerHeight, 1);
  const scrollOffset = Math.min(Math.max(window.scrollY, 0), viewportHeight);
  const scrollProgress = scrollOffset / viewportHeight;
  const heroOpacity = Math.min(
    1,
    Math.max(0, (HERO_FADE_END - scrollProgress) / (HERO_FADE_END - HERO_FADE_START)),
  );

  shell.style.setProperty("--scroll-offset", `${scrollOffset}px`);
  heroCopy.style.opacity = heroOpacity;
  simulation?.setObstacleActive(heroOpacity > 0);
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
