(function () {
  if (globalThis.__CP_CONTRACT__) {
    return;
  }

  function deepFreeze(value) {
    if (!value || typeof value !== "object" || Object.isFrozen(value)) {
      return value;
    }
    Object.freeze(value);
    for (const child of Object.values(value)) {
      deepFreeze(child);
    }
    return value;
  }

  const contract = {
    version: 1,
    customProvider: {
      STORAGE_KEY: "customProviderConfig",
      PROFILES_STORAGE_KEY: "customProviderProfiles",
      ACTIVE_PROFILE_STORAGE_KEY: "customProviderActiveProfileId",
      BACKUP_KEY: "customProviderOriginalApiKey",
      ANTHROPIC_API_KEY_STORAGE_KEY: "anthropicApiKey",
      FETCHED_MODELS_CACHE_KEY: "customProviderFetchedModelsCache",
      SELECTED_MODEL_STORAGE_KEY: "selectedModel",
      SELECTED_MODEL_QUICK_MODE_STORAGE_KEY: "selectedModelQuickMode",
      MODEL_SELECTION_SYNC_SIGNATURE_KEY:
        "customProviderSelectedModelSyncSignature",
      QUICK_MODEL_SELECTION_SYNC_SIGNATURE_KEY:
        "customProviderSelectedModelQuickModeSyncSignature",
      HTTP_PROVIDER_STORAGE_KEY: "customProviderAllowHttp",
      HTTP_PROVIDER_MIGRATED_KEY: "customProviderAllowHttpMigrated",
    },
    auth: {
      ACCESS_TOKEN_STORAGE_KEY: "accessToken",
      REFRESH_TOKEN_STORAGE_KEY: "refreshToken",
      LAST_AUTH_FAILURE_REASON_STORAGE_KEY: "lastAuthFailureReason",
    },
    prompts: {
      SYSTEM_PROMPT_STORAGE_KEY: "chrome_ext_system_prompt",
      SKIP_PERMISSIONS_SYSTEM_PROMPT_STORAGE_KEY:
        "chrome_ext_skip_perms_system_prompt",
      MULTIPLE_TABS_SYSTEM_PROMPT_STORAGE_KEY:
        "chrome_ext_multiple_tabs_system_prompt",
      EXPLICIT_PERMISSIONS_PROMPT_STORAGE_KEY:
        "chrome_ext_explicit_permissions_prompt",
      TOOL_USAGE_PROMPT_STORAGE_KEY: "chrome_ext_tool_usage_prompt",
      PROFILES_STORAGE_KEY: "customSystemPromptProfiles",
      ACTIVE_PROFILE_STORAGE_KEY: "customSystemPromptActiveProfileId",
    },
    workflows: {
      STORAGE_KEY: "claw_site_workflows_v1",
    },
    models: {
      CONFIG_STORAGE_KEY: "chrome_ext_models",
    },
    ui: {
      PREFERRED_LOCALE_STORAGE_KEY: "preferred_locale",
      DEBUG_MODE_STORAGE_KEY: "debugMode",
      SHOW_TRACE_IDS_STORAGE_KEY: "showTraceIds",
      SHOW_SYSTEM_REMINDERS_STORAGE_KEY: "showSystemReminders",
      SHOW_TOOL_RESULT_DETAILS_STORAGE_KEY: "showToolResultDetails",
    },
    session: {
      CHAT_SCOPE_PREFIX: "claw.chat.scopes.",
      CHAT_CLEANUP_AUDIT_KEY: "claw.chat.cleanup.audit",
      CHAT_CLEANUP_AUDIT_LIMIT: 40,
    },
    detachedWindow: {
      LOCKS_STORAGE_KEY: "claw.detachedWindowLocks",
      OPEN_GROUP_MESSAGE_TYPE: "OPEN_GROUP_DETACHED_WINDOW",
      PAGE_PATH: "sidepanel.html",
      DEFAULT_SIZE: {
        width: 500,
        height: 768,
        left: 100,
        top: 100,
      },
    },
    offscreen: {
      KEEPALIVE_INTERVAL_MS: 20000,
      AUDIO_FIELD_URL: "audioUrl",
      AUDIO_FIELD_VOLUME: "volume",
      DEFAULT_VOLUME: 0.5,
      GIF_FIELD_FRAMES: "frames",
      GIF_FIELD_OPTIONS: "options",
      GIF_FIELD_BLOB_URL: "blobUrl",
    },
    pairing: {
      QUERY_KEYS: {
        REQUEST_ID: "request_id",
        CLIENT_TYPE: "client_type",
        CURRENT_NAME: "current_name",
      },
      MESSAGE_FIELDS: {
        REQUEST_ID: "request_id",
        NAME: "name",
      },
      DEFAULT_CLIENT_TYPE: "desktop",
      CLOSE_DELAY_MS: 100,
      PAGE_ROOT_MOUNT_ID: "root",
    },
    agentIndicator: {
      RUNTIME_MESSAGE_TYPES: {
        SHOW_AGENT_INDICATORS: "SHOW_AGENT_INDICATORS",
        HIDE_AGENT_INDICATORS: "HIDE_AGENT_INDICATORS",
        HIDE_FOR_TOOL_USE: "HIDE_FOR_TOOL_USE",
        SHOW_AFTER_TOOL_USE: "SHOW_AFTER_TOOL_USE",
        SHOW_STATIC_INDICATOR: "SHOW_STATIC_INDICATOR",
        HIDE_STATIC_INDICATOR: "HIDE_STATIC_INDICATOR",
      },
      CURRENT_TAB_SENTINEL: "CURRENT_TAB",
      DOM_IDS: {
        ANIMATION_STYLES: "claude-agent-animation-styles",
        GLOW_BORDER: "claude-agent-glow-border",
        STOP_CONTAINER: "claude-agent-stop-container",
        STOP_BUTTON: "claude-agent-stop-button",
        STATIC_CONTAINER: "claude-static-indicator-container",
        STATIC_CHAT_BUTTON: "claude-static-chat-button",
        STATIC_CHAT_TOOLTIP: "claude-static-chat-tooltip",
        STATIC_CLOSE_BUTTON: "claude-static-close-button",
        STATIC_CLOSE_TOOLTIP: "claude-static-close-tooltip",
      },
      HIDE_TRANSITION_DELAY_MS: 300,
      HEARTBEAT_INTERVAL_MS: 5000,
    },
    permissionManager: {
      PERMISSION_STORAGE_KEY: "permissionStorage",
      LAST_PERMISSION_MODE_PREFERENCE_STORAGE_KEY:
        "lastPermissionModePreference",
      AUTO_APPROVE_ALL_REQUESTS_STORAGE_KEY:
        "autoApprovePermissionRequests",
      MCP_CONNECTED_STORAGE_KEY: "mcpConnected",
      PENDING_SCHEDULED_TASK_STORAGE_KEY: "pendingScheduledTask",
      TARGET_TAB_ID_STORAGE_KEY: "targetTabId",
      UPDATE_AVAILABLE_STORAGE_KEY: "updateAvailable",
      SAVED_PROMPTS_STORAGE_KEY: "savedPrompts",
    },
    nativeMessaging: {
      PERMISSION: "nativeMessaging",
      HOST_DESKTOP: "com.anthropic.claude_browser_extension",
      HOST_CLAUDE_CODE: "com.anthropic.claude_code_browser_extension",
      BINDING_INSTANCE_ID_STORAGE_KEY: "claw.nativeHostBinding.instanceId.v1",
    },
    githubUpdate: {
      STORAGE_KEYS: {
        INFO: "githubUpdateInfo",
        DISMISSED_VERSION: "githubUpdateDismissedVersion",
        AUTO_CHECK_ENABLED: "githubUpdateAutoCheckEnabled",
        SEEN_VERSION: "githubUpdateSeenVersion",
        PREVIOUS_VERSION: "githubUpdatePreviousVersion",
        UPDATE_AVAILABLE: "updateAvailable",
        VERSION_INFO: "chrome_ext_version_info",
      },
      MESSAGE_TYPES: {
        CHECK_NOW: "CP_GITHUB_UPDATE_CHECK_NOW",
        DISMISS: "CP_GITHUB_UPDATE_DISMISS",
      },
      ALARM_NAME: "cp_github_update_check",
    },
    mcpBridge: {
      RUNTIME_MESSAGE_FIELDS: {
        REQUEST_ID: "requestId",
        ALLOWED: "allowed",
      },
      PERMISSION_PROMPT_STORAGE_KEY_PREFIX: "mcp_prompt_",
      PERMISSION_PROMPT_STORAGE_FIELDS: {
        PROMPT: "prompt",
        TAB_ID: "tabId",
        TIMESTAMP: "timestamp",
      },
      PERMISSION_POPUP_QUERY_KEYS: {
        TAB_ID: "tabId",
        PERMISSION_ONLY: "mcpPermissionOnly",
        REQUEST_ID: "requestId",
      },
      PERMISSION_POPUP_RESPONSE_TIMEOUT_MS: 30000,
    },
    messages: {
      // service worker: runtime.onMessage + alarm/offscreen 相关
      SW_KEEPALIVE: "SW_KEEPALIVE",
      open_side_panel: "open_side_panel",
      PING_SIDEPANEL: "PING_SIDEPANEL",
      PANEL_OPENED: "PANEL_OPENED",
      PANEL_CLOSED: "PANEL_CLOSED",
      SHOW_PERMISSION_NOTIFICATION: "SHOW_PERMISSION_NOTIFICATION",
      resize_window: "resize_window",
      MCP_PERMISSION_RESPONSE: "MCP_PERMISSION_RESPONSE",
      check_and_refresh_oauth: "check_and_refresh_oauth",
      PLAY_NOTIFICATION_SOUND: "PLAY_NOTIFICATION_SOUND",
      check_native_host_status: "check_native_host_status",
      SEND_MCP_NOTIFICATION: "SEND_MCP_NOTIFICATION",
      OPEN_OPTIONS_WITH_TASK: "OPEN_OPTIONS_WITH_TASK",
      EXECUTE_SCHEDULED_TASK: "EXECUTE_SCHEDULED_TASK",
      SECONDARY_TAB_CHECK_MAIN: "SECONDARY_TAB_CHECK_MAIN",
      EXECUTE_TASK: "EXECUTE_TASK",
      POPULATE_INPUT_TEXT: "POPULATE_INPUT_TEXT",
      OFFSCREEN_PLAY_SOUND: "OFFSCREEN_PLAY_SOUND",
      MAIN_TAB_ACK_REQUEST: "MAIN_TAB_ACK_REQUEST",
      MAIN_TAB_ACK_RESPONSE: "MAIN_TAB_ACK_RESPONSE",

      // pairing: pairing.html <-> service worker / bridge
      pairing_confirmed: "pairing_confirmed",
      pairing_dismissed: "pairing_dismissed",
      show_pairing_prompt: "show_pairing_prompt",

      // agent indicator: content script indicator <-> service worker
      STOP_AGENT: "STOP_AGENT",
      SWITCH_TO_MAIN_TAB: "SWITCH_TO_MAIN_TAB",
      STATIC_INDICATOR_HEARTBEAT: "STATIC_INDICATOR_HEARTBEAT",
      DISMISS_STATIC_INDICATOR_FOR_GROUP: "DISMISS_STATIC_INDICATOR_FOR_GROUP",

      // MCP bridge socket: desktop bridge 消息类型
      tool_call: "tool_call",
      tool_result: "tool_result",
      pairing_request: "pairing_request",
      permission_response: "permission_response",

      // offscreen: offscreen document message types
      GENERATE_GIF: "GENERATE_GIF",
      REVOKE_BLOB_URL: "REVOKE_BLOB_URL",
    },
    debug: {
      SIDEPANEL_LOGS_STORAGE_KEY: "sidepanelDebugLogs",
      SIDEPANEL_META_STORAGE_KEY: "sidepanelDebugMeta",
      RELEVANT_STORAGE_KEYS: [
        "customProviderConfig",
        "anthropicApiKey",
        "accessToken",
        "refreshToken",
        "lastAuthFailureReason",
        "selectedModel",
        "selectedModelQuickMode",
        "lastPermissionModePreference",
        "chrome_ext_models",
      ],
    },
  };

  globalThis.__CP_CONTRACT__ = deepFreeze(contract);
})();
