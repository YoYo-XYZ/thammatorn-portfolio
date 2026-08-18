function attachDebugControls(root, simulation) {
  if (!root || !simulation) return;

  const controls = [...root.querySelectorAll("[data-config]")];
  const typographyControls = [...root.querySelectorAll("[data-typography]")];
  const status = root.querySelector("[data-debug-status]");
  const statusDot = root.querySelector("[data-debug-status-dot]");
  const content = root.querySelector("#debug-controls");
  const toggle = root.querySelector("[data-debug-toggle]");

  const toHex = (color) =>
    `#${color
      .map((channel) => Math.round(Math.min(Math.max(channel, 0), 1) * 255).toString(16).padStart(2, "0"))
      .join("")}`;

  const fromHex = (value) => {
    const hex = value.replace("#", "");
    return [0, 2, 4].map((offset) => parseInt(hex.slice(offset, offset + 2), 16) / 255);
  };

  const formatValue = (control, value) => {
    if (control.tagName === "SELECT") {
      return control.selectedOptions[0]?.textContent || value;
    }

    const precision = Number(control.dataset.precision ?? 2);
    return Number(value).toFixed(precision);
  };

  const updateOutput = (control) => {
    const output = root.querySelector(`[data-debug-value-for="${control.dataset.config}"]`);
    if (output) output.textContent = formatValue(control, control.value);
  };

  const setControlValue = (control) => {
    const value = simulation.config[control.dataset.config];

    if (control.type === "checkbox") {
      control.checked = Boolean(value);
    } else if (control.type === "color") {
      control.value = toHex(value);
    } else {
      control.value = String(value);
    }

    updateOutput(control);
  };

  const positionDefaultMarker = (control) => {
    const marker = control.parentElement.querySelector(".debug-range__default");
    if (!marker) return;

    const min = Number(control.min || 0);
    const max = Number(control.max || 100);
    const value = Number(control.dataset.defaultValue ?? control.value);
    const position = ((value - min) / Math.max(max - min, 1)) * 100;
    marker.parentElement.style.setProperty("--default-position", `${Math.min(Math.max(position, 0), 100)}%`);
  };

  const readControlValue = (control) => {
    if (control.type === "checkbox") return control.checked;
    if (control.type === "color") return fromHex(control.value);
    if (control.tagName === "SELECT" || control.type === "range") return Number(control.value);
    return control.value;
  };

  const titleStyle = getComputedStyle(simulation.title);
  const defaultFontSize = Number.parseFloat(titleStyle.fontSize);
  const defaultLetterSpacing = Number.parseFloat(titleStyle.letterSpacing);
  const defaultWordSpacing = Number.parseFloat(titleStyle.wordSpacing);
  const typographyDefaults = {
    fontSize: defaultFontSize,
    letterSpacing: Number.isFinite(defaultLetterSpacing) ? defaultLetterSpacing / defaultFontSize : 0,
    wordSpacing: Number.isFinite(defaultWordSpacing) ? defaultWordSpacing / defaultFontSize : 0,
  };

  const formatTypographyValue = (control) => {
    if (control.tagName === "SELECT") {
      return control.selectedOptions[0]?.textContent || control.value;
    }

    const precision = Number(control.dataset.precision ?? 2);
    const suffix = control.dataset.typography === "fontSize" ? "px" : "em";
    return `${Number(control.value).toFixed(precision)} ${suffix}`;
  };

  const updateTypographyOutput = (control) => {
    const output = root.querySelector(`[data-typography-value-for="${control.dataset.typography}"]`);
    if (output) output.textContent = formatTypographyValue(control);
  };

  const setTypographyControlValue = (control) => {
    const property = control.dataset.typography;

    if (property in typographyDefaults) {
      control.value = String(typographyDefaults[property]);
      control.dataset.defaultValue = String(typographyDefaults[property]);
    } else if (titleStyle[property]) {
      const matchingOption = [...control.options].find((option) => option.value === titleStyle[property]);
      if (matchingOption) control.value = matchingOption.value;
    }

    updateTypographyOutput(control);
    positionDefaultMarker(control);
  };

  const applyTypographyControl = (control) => {
    const property = control.dataset.typography;
    const value = control.type === "range" ? Number(control.value) : control.value;
    const cssValue =
      property === "fontSize"
        ? `${value}px`
        : property === "letterSpacing" || property === "wordSpacing"
          ? `${value}em`
          : value;

    simulation.setTypography(property, cssValue);
    updateTypographyOutput(control);
  };

  const updateStatus = () => {
    const { dyeResolution, paused, simResolution } = simulation.config;
    status.textContent = `${paused ? "paused" : "live"} / sim ${simResolution} / dye ${dyeResolution}`;
    statusDot.classList.toggle("is-paused", paused);
  };

  const applyControl = (control) => {
    simulation.updateConfig(control.dataset.config, readControlValue(control));
    setControlValue(control);
    updateStatus();
  };

  controls.forEach((control) => {
    setControlValue(control);
    positionDefaultMarker(control);
    const eventName = control.type === "range" || control.type === "color" ? "input" : "change";
    control.addEventListener(eventName, () => applyControl(control));
  });

  root.querySelector('[data-debug-action="randomSplats"]')?.addEventListener("click", () => {
    simulation.randomSplats();
  });

  root.querySelector('[data-debug-action="captureScreenshot"]')?.addEventListener("click", () => {
    simulation.captureScreenshot();
  });

  typographyControls.forEach((control) => {
    setTypographyControlValue(control);
    const eventName = control.type === "range" ? "input" : "change";
    control.addEventListener(eventName, () => applyTypographyControl(control));
  });

  const setCollapsed = (collapsed) => {
    content.hidden = collapsed;
    toggle.setAttribute("aria-expanded", String(!collapsed));
    toggle.textContent = collapsed ? "Show" : "Hide";
  };

  toggle.addEventListener("click", () => setCollapsed(!content.hidden));
  updateStatus();
}

export { attachDebugControls };
