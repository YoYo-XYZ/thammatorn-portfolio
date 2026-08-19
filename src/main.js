import "./styles.css";
import { FluidSimulation } from "./fluid-simulation.js";

const shell = document.querySelector(".portfolio-shell");
const canvas = document.querySelector(".fluid-canvas");
const title = document.querySelector(".hero-title");
const hero = document.querySelector(".hero");

let simulation;
let resizeFrame = 0;

const handleResize = () => {
  if (resizeFrame) return;

  resizeFrame = window.requestAnimationFrame(() => {
    resizeFrame = 0;
    simulation?.resize();
  });
};

try {
  simulation = new FluidSimulation(canvas, title);
  simulation.setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
  const handleMotionPreference = (event) => simulation.setReducedMotion(event.matches);
  let heroVisible = true;
  const updateVisibility = () => simulation.setVisibilityPaused(document.hidden || !heroVisible);

  if (reducedMotionQuery.addEventListener) {
    reducedMotionQuery.addEventListener("change", handleMotionPreference);
  } else {
    reducedMotionQuery.addListener(handleMotionPreference);
  }

  document.addEventListener("visibilitychange", updateVisibility);

  if (hero && "IntersectionObserver" in window) {
    const heroObserver = new IntersectionObserver(
      ([entry]) => {
        heroVisible = entry.isIntersecting;
        updateVisibility();
      },
      { threshold: 0.01 },
    );
    heroObserver.observe(hero);
  }

  window.addEventListener("resize", handleResize, { passive: true });
  updateVisibility();
  simulation.resize(true);
  document.fonts?.ready?.then(() => simulation.resize(true));
} catch (error) {
  console.error("Unable to initialize the fluid background.", error);
  shell.classList.add("is-fallback");
}
