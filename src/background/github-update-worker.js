import "./github-update-worker-runtime.js";

(function () {
  const shared = globalThis.__CP_GITHUB_UPDATE_SHARED__;
  const runtimeApi = globalThis.__CP_GITHUB_UPDATE_WORKER_RUNTIME__;
  if (!shared || !runtimeApi || !globalThis.chrome?.runtime?.id) {
    return;
  }

  runtimeApi.registerGithubUpdateWorker({
    chrome: globalThis.chrome,
    console: globalThis.console,
    fetch: globalThis.fetch?.bind(globalThis),
    shared,
  });
})();
