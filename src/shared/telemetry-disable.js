(function () {
  if (globalThis.__CP_TELEMETRY_DISABLED__ === true) {
    return;
  }

  const existingEnterpriseConfig =
    globalThis.desktopEnterpriseConfig &&
    typeof globalThis.desktopEnterpriseConfig === "object"
      ? globalThis.desktopEnterpriseConfig
      : {};

  globalThis.__CP_TELEMETRY_DISABLED__ = true;
  globalThis.desktopEnterpriseConfig = {
    ...existingEnterpriseConfig,
    disableNonessentialTelemetry: true,
  };
  globalThis.desktopTelemetryConfig = null;
})();
