const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

function cloneValue(value) {
  if (value == null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

function createEventMock() {
  const listeners = [];
  return {
    listeners,
    addListener(listener) {
      listeners.push(listener);
    },
    removeListener(listener) {
      const index = listeners.indexOf(listener);
      if (index >= 0) {
        listeners.splice(index, 1);
      }
    },
    hasListener(listener) {
      return listeners.includes(listener);
    },
    async emit(...args) {
      const results = [];
      for (const listener of [...listeners]) {
        results.push(await listener(...args));
      }
      return results;
    }
  };
}

function createStorageMock(initialState = {}) {
  const state = {
    ...cloneValue(initialState)
  };
  const onChanged = createEventMock();

  async function get(keys) {
    if (keys == null) {
      return cloneValue(state);
    }
    if (typeof keys === "string") {
      return {
        [keys]: cloneValue(state[keys])
      };
    }
    if (Array.isArray(keys)) {
      const output = {};
      for (const key of keys) {
        output[key] = cloneValue(state[key]);
      }
      return output;
    }
    if (typeof keys === "object") {
      const output = {};
      for (const [key, fallbackValue] of Object.entries(keys)) {
        output[key] = Object.prototype.hasOwnProperty.call(state, key) ? cloneValue(state[key]) : cloneValue(fallbackValue);
      }
      return output;
    }
    return {};
  }

  async function set(next) {
    const changes = {};
    for (const [key, value] of Object.entries(next || {})) {
      const oldValue = cloneValue(state[key]);
      const newValue = cloneValue(value);
      state[key] = newValue;
      changes[key] = {
        oldValue,
        newValue
      };
    }
    if (Object.keys(changes).length > 0) {
      await onChanged.emit(changes, "local");
    }
  }

  async function remove(keys) {
    const list = Array.isArray(keys) ? keys : [keys];
    const changes = {};
    for (const key of list) {
      if (!Object.prototype.hasOwnProperty.call(state, key)) {
        continue;
      }
      changes[key] = {
        oldValue: cloneValue(state[key])
      };
      delete state[key];
    }
    if (Object.keys(changes).length > 0) {
      await onChanged.emit(changes, "local");
    }
  }

  return {
    state,
    area: {
      get,
      set,
      remove
    },
    onChanged
  };
}

function createChromeMock(options = {}) {
  const storageMock = options.storageMock || createStorageMock(options.storageState);
  const runtimeOnInstalled = createEventMock();
  const runtimeOnStartup = createEventMock();
  const runtimeOnMessage = createEventMock();
  const alarmsOnAlarm = createEventMock();
  const tabGroupsOnRemoved = createEventMock();
  const windowsOnRemoved = createEventMock();
  const tabsOnRemoved = createEventMock();
  const existingGroupIds = new Set(options.existingGroupIds || []);
  const tabById = new Map(Object.entries(options.tabById || {}).map(([key, value]) => [Number(key), cloneValue(value)]));
  const calls = {
    action: {
      setBadgeText: [],
      setBadgeBackgroundColor: [],
      setBadgeTextColor: []
    },
    alarms: {
      create: [],
      clear: []
    },
    runtime: {
      setUninstallURL: []
    },
    windows: {
      remove: [],
      update: [],
      create: []
    },
    tabs: {
      update: [],
      group: []
    }
  };

  const chrome = {
    action: {
      async setBadgeText(payload) {
        calls.action.setBadgeText.push(cloneValue(payload));
      },
      async setBadgeBackgroundColor(payload) {
        calls.action.setBadgeBackgroundColor.push(cloneValue(payload));
      },
      async setBadgeTextColor(payload) {
        calls.action.setBadgeTextColor.push(cloneValue(payload));
      }
    },
    alarms: {
      onAlarm: alarmsOnAlarm,
      async create(name, info) {
        calls.alarms.create.push({
          name,
          info: cloneValue(info)
        });
      },
      async clear(name) {
        calls.alarms.clear.push(name);
        return true;
      }
    },
    runtime: {
      id: options.runtimeId || "test-extension-id",
      onInstalled: runtimeOnInstalled,
      onStartup: runtimeOnStartup,
      onMessage: runtimeOnMessage,
      getManifest() {
        return {
          version: options.manifestVersion || "1.0.0.0"
        };
      },
      getURL(targetPath) {
        return `chrome-extension://${options.runtimeId || "test-extension-id"}/${String(targetPath || "").replace(/^\/+/, "")}`;
      },
      async setUninstallURL(url) {
        calls.runtime.setUninstallURL.push(String(url || ""));
      }
    },
    storage: {
      local: storageMock.area,
      onChanged: storageMock.onChanged
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      onRemoved: tabGroupsOnRemoved,
      async get(groupId) {
        if (existingGroupIds.has(Number(groupId))) {
          return {
            id: Number(groupId)
          };
        }
        throw new Error(`Unknown group ${groupId}`);
      }
    },
    windows: {
      onRemoved: windowsOnRemoved,
      async remove(windowId) {
        calls.windows.remove.push(Number(windowId));
      },
      async update(windowId, payload) {
        calls.windows.update.push({
          windowId: Number(windowId),
          payload: cloneValue(payload)
        });
      },
      async create(payload) {
        calls.windows.create.push(cloneValue(payload));
        return {
          id: options.createdWindowId || 901,
          tabs: [{
            id: options.createdPopupTabId || 902
          }]
        };
      },
      async getAll() {
        return cloneValue(options.windowsList || []);
      }
    },
    tabs: {
      onRemoved: tabsOnRemoved,
      async get(tabId) {
        const tab = tabById.get(Number(tabId));
        if (!tab) {
          throw new Error(`Unknown tab ${tabId}`);
        }
        return cloneValue(tab);
      },
      async update(tabId, payload) {
        calls.tabs.update.push({
          tabId: Number(tabId),
          payload: cloneValue(payload)
        });
        return {
          id: Number(tabId),
          ...cloneValue(payload)
        };
      },
      async group(payload) {
        calls.tabs.group.push(cloneValue(payload));
        return options.groupIdResult || 777;
      }
    }
  };

  return {
    chrome,
    calls,
    storageMock,
    events: {
      runtimeOnInstalled,
      runtimeOnStartup,
      runtimeOnMessage,
      alarmsOnAlarm,
      tabGroupsOnRemoved,
      windowsOnRemoved,
      tabsOnRemoved
    },
    setExistingGroupIds(nextIds) {
      existingGroupIds.clear();
      for (const groupId of nextIds || []) {
        existingGroupIds.add(Number(groupId));
      }
    },
    setTab(tabId, tab) {
      tabById.set(Number(tabId), cloneValue(tab));
    }
  };
}

function runScriptInSandbox(filePath, sandbox) {
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInNewContext(source, sandbox, {
    filename: path.basename(filePath)
  });
  return sandbox;
}

function loadScriptIntoSandbox(filePath, sandboxOverrides = {}) {
  const sandbox = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    ...sandboxOverrides
  };
  sandbox.globalThis = sandbox;
  return runScriptInSandbox(filePath, sandbox);
}

async function flushMicrotasks() {
  await new Promise(resolve => setTimeout(resolve, 0));
}

module.exports = {
  createChromeMock,
  createEventMock,
  createStorageMock,
  loadScriptIntoSandbox,
  runScriptInSandbox,
  flushMicrotasks
};
