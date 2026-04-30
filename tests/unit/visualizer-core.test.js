const assert = require("node:assert/strict");
const path = require("node:path");

const core = require(path.join(__dirname, "..", "..", "src", "visualizer", "visualizer-core.js"));

function createToolRunSnapshot(overrides = {}) {
  return {
    meta: {
      id: overrides.id || "session-active",
      scopeId: overrides.scopeId || "scope-active",
      title: overrides.title || "Search products",
      updatedAt: overrides.updatedAt || 200,
      createdAt: overrides.createdAt || 100,
      selectedModel: overrides.selectedModel || "gpt-5.4",
      currentUrl: overrides.currentUrl || "https://shop.example"
    },
    messages: overrides.messages || [
      {
        role: "user",
        content: [{
          type: "text",
          text: "帮我搜索蓝牙耳机"
        }]
      },
      {
        role: "assistant",
        content: [{
          type: "text",
          text: "我先看看页面结构。"
        }, {
          type: "tool_use",
          id: "tool-read",
          name: "read_page",
          input: {
            depth: 2
          }
        }]
      },
      {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "tool-read",
          content: [{
            type: "text",
            text: "页面中包含搜索框"
          }]
        }]
      },
      {
        role: "assistant",
        content: [{
          type: "tool_use",
          id: "tool-find",
          name: "find",
          input: {
            query: "搜索框"
          }
        }, {
          type: "tool_use",
          id: "turn-1",
          name: "turn_answer_start",
          input: {}
        }, {
          type: "text",
          text: "我已经定位到搜索入口。"
        }]
      },
      {
        role: "user",
        content: [{
          type: "tool_result",
          tool_use_id: "tool-find",
          content: [{
            type: "text",
            text: "FOUND: 1"
          }]
        }]
      }
    ]
  };
}

function createStorageState() {
  return {
    "claw.chat.scopes.scope-active.activeSession": createToolRunSnapshot({ updatedAt: 300 }),
    "claw.chat.scopes.scope-active.index": [{
      id: "session-active",
      scopeId: "scope-active",
      updatedAt: 300
    }],
    "claw.chat.scopes.scope-active.byId.session-active": createToolRunSnapshot({ updatedAt: 300 }),
    "claw.chat.scopes.scope-history.index": [{
      id: "session-old",
      scopeId: "scope-history",
      updatedAt: 250,
      title: "Old run"
    }],
    "claw.chat.scopes.scope-history.byId.session-old": createToolRunSnapshot({
      id: "session-old",
      scopeId: "scope-history",
      title: "Old run",
      updatedAt: 250
    })
  };
}

function testActiveSessionWinsByDefault() {
  const run = core.selectVisualizerRun(createStorageState());
  assert.equal(run.meta.scopeId, "scope-active");
  assert.equal(run.meta.sessionId, "session-active");
  assert.equal(run.meta.source, "active");
}

function testRecentHistoryFallbackWorksWithoutActiveSession() {
  const storage = createStorageState();
  delete storage["claw.chat.scopes.scope-active.activeSession"];

  const run = core.selectVisualizerRun(storage);
  assert.equal(run.meta.scopeId, "scope-active");
  assert.equal(run.meta.sessionId, "session-active");
  assert.equal(run.meta.source, "recent");
}

function testRunParsesIntoFourStages() {
  const run = core.selectVisualizerRun(createStorageState());

  assert.deepEqual(run.stages.map((stage) => stage.id), ["request", "planning", "execution", "final"]);
  assert.equal(run.stages[0].eventCount, 1);
  assert.equal(run.stages[1].eventCount, 1);
  assert.equal(run.stages[2].eventCount, 4);
  assert.equal(run.stages[3].eventCount, 1);
  assert.equal(run.stages[2].events[0].type, "tool_use");
  assert.equal(run.stages[2].events[1].type, "tool_result");
  assert.equal(run.stages[3].events[0].text, "我已经定位到搜索入口。");
  assert.equal(run.currentEvent?.type, "final_answer");
  assert.equal(run.meta.currentStageId, "final");
}

function testToolPairingAndPendingStatusWork() {
  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-pending",
    sessionId: "session-pending",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "打开控制台"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "tool-open",
        name: "navigate",
        input: {
          url: "https://example.com"
        }
      }]
    }]
  }, {
    scopeId: "scope-pending"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: true,
    source: "active"
  });
  const toolUse = run.stages[2].events.find((event) => event.type === "tool_use");

  assert.equal(toolUse.pending, true);
  assert.equal(run.meta.status, "running");
  assert.equal(run.currentEvent?.id, toolUse.id);
  assert.equal(run.currentEvent?.type, "tool_use");
  assert.equal(run.meta.currentStageId, "execution");
}

function testPermissionRequiredActionDataStaysVisibleInVisualizer() {
  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-permission",
    sessionId: "session-permission",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "跳转到设置页"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "tool-nav",
        name: "navigate",
        input: {
          url: "https://example.com/settings"
        }
      }]
    }, {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "tool-nav",
        content: {
          type: "permission_required",
          tool: "navigate",
          url: "https://example.com/settings",
          actionData: {
            authorization: "Bearer super-secret-token",
            screenshot: "data:image/png;base64,abc"
          }
        }
      }]
    }]
  }, {
    scopeId: "scope-permission"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: true,
    source: "active"
  });
  const permissionEvent = run.stages[2].events.find((event) => event.type === "permission_required");

  assert.ok(permissionEvent);
  assert.match(permissionEvent.actionDataPreview, /Bearer super-secret-token/);
  assert.match(permissionEvent.actionDataPreview, /data:image\/png;base64,abc/);
  assert.equal(run.meta.status, "running");
  assert.equal(run.currentEvent?.id, permissionEvent.id);
  assert.equal(run.currentEvent?.type, "permission_required");
  assert.equal(run.meta.currentStageId, "execution");
}

function testLongToolResultKeepsFullTextForExpandedResult() {
  const longText = Array.from({ length: 500 }, function (_, index) {
    return "seg-" + String(index).padStart(3, "0");
  }).join(" ");

  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-long-result",
    sessionId: "session-long-result",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "读取长结果"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "tool-long-result",
        name: "read_page",
        input: {}
      }]
    }, {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "tool-long-result",
        content: [{
          type: "text",
          text: longText
        }]
      }]
    }]
  }, {
    scopeId: "scope-long-result"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: true,
    source: "active"
  });
  const toolResult = run.stages[2].events.find((event) => event.type === "tool_result");
  const toolUse = run.stages[2].events.find((event) => event.type === "tool_use");

  assert.ok(toolResult);
  assert.ok(toolUse);
  assert.ok(toolResult.text.length < longText.length);
  assert.ok(toolResult.text.endsWith("…"));
  assert.equal(toolResult.fullText, longText);
  assert.equal(toolUse.resultSummaryFull, longText);
  assert.equal(toolUse.resultSummaryFull.endsWith("…"), false);
}

function testModalCollapseOnlyTriggersForTallOrVeryLongContent() {
  const fiveLines = [
    "{",
    '  "alpha": 1,',
    '  "beta": 2,',
    '  "gamma": 3',
    "}"
  ].join("\n");
  const nineLines = Array.from({ length: 9 }, function (_, index) {
    return "line-" + index;
  }).join("\n");
  const longSingleLine = "x".repeat(1700);

  assert.equal(core.countLogicalLines(fiveLines), 5);
  assert.equal(core.shouldCollapseText(fiveLines, "modal"), false);
  assert.equal(core.shouldCollapseText(nineLines, "modal"), true);
  assert.equal(core.shouldCollapseText(longSingleLine, "modal"), true);
  assert.equal(core.shouldCollapseText("short\nmultiline", "step"), true);
}

function testFullModePreservesExactStructuredValues() {
  const inputPayload = {
    query: "完整模式参数",
    items: Array.from({ length: 28 }, function (_, index) {
      return {
        id: index,
        label: "entry-" + index
      };
    }),
    nested: {
      a: {
        b: {
          c: {
            d: {
              e: {
                f: "deep-tool-input"
              }
            }
          }
        }
      }
    },
    longText: "x".repeat(900)
  };
  const toolResultPayload = {
    status: "ok",
    rows: Array.from({ length: 26 }, function (_, index) {
      return {
        row: index,
        value: "result-" + index
      };
    }),
    nested: {
      level1: {
        level2: {
          level3: {
            level4: {
              level5: {
                level6: "deep-tool-result"
              }
            }
          }
        }
      }
    },
    longText: "r".repeat(1200)
  };
  const permissionActionData = {
    steps: Array.from({ length: 24 }, function (_, index) {
      return {
        step: index,
        action: "click-" + index
      };
    }),
    headers: {
      authorization: "Bearer " + "z".repeat(300)
    },
    nested: {
      alpha: {
        beta: {
          gamma: {
            delta: {
              epsilon: {
                zeta: "deep-permission"
              }
            }
          }
        }
      }
    }
  };

  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-full-mode",
    sessionId: "session-full-mode",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "展示完整模式"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "tool-raw-json",
        name: "inspect_page",
        input: inputPayload
      }]
    }, {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "tool-raw-json",
        content: toolResultPayload
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "tool-permission",
        name: "navigate",
        input: {
          url: "https://example.com/settings"
        }
      }]
    }, {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "tool-permission",
        content: {
          type: "permission_required",
          tool: "navigate",
          url: "https://example.com/settings",
          actionData: permissionActionData
        }
      }]
    }]
  }, {
    scopeId: "scope-full-mode"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: true,
    source: "active"
  });
  const rawToolUse = run.stages[2].events.find(function (event) {
    return event.type === "tool_use" && event.toolUseId === "tool-raw-json";
  });
  const rawToolResult = run.stages[2].events.find(function (event) {
    return event.type === "tool_result" && event.toolUseId === "tool-raw-json";
  });
  const permissionEvent = run.stages[2].events.find(function (event) {
    return event.type === "permission_required" && event.toolUseId === "tool-permission";
  });

  assert.ok(rawToolUse);
  assert.ok(rawToolResult);
  assert.ok(permissionEvent);
  assert.equal(rawToolUse.input.items.length, 28);
  assert.equal(rawToolUse.input.items[27].label, "entry-27");
  assert.equal(rawToolUse.input.nested.a.b.c.d.e.f, "deep-tool-input");
  assert.equal(rawToolUse.input.longText.length, 900);
  assert.equal(rawToolResult.rawFull, core.exactJsonString(toolResultPayload));
  assert.match(rawToolResult.rawFull, /"result-25"/);
  assert.match(rawToolResult.rawFull, /deep-tool-result/);
  assert.equal(permissionEvent.actionData.steps.length, 24);
  assert.equal(permissionEvent.actionData.steps[23].action, "click-23");
  assert.equal(permissionEvent.actionData.nested.alpha.beta.gamma.delta.epsilon.zeta, "deep-permission");
  assert.match(core.exactJsonString(permissionEvent.actionData), /click-23/);
}

function testFullSessionModeIncludesEarlierTurnsAndResetsStageBoundaries() {
  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-full-session",
    sessionId: "session-full-session",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "第一轮：打开首页"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "text",
        text: "我先看看首页结构。"
      }, {
        type: "tool_use",
        id: "tool-home",
        name: "read_page",
        input: {}
      }]
    }, {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "tool-home",
        content: [{
          type: "text",
          text: "首页读取完成"
        }]
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "turn-first",
        name: "turn_answer_start",
        input: {}
      }, {
        type: "text",
        text: "第一轮完成"
      }]
    }, {
      role: "user",
      content: [{
        type: "text",
        text: "第二轮：搜索罗翔"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "text",
        text: "我再看看搜索入口。"
      }, {
        type: "tool_use",
        id: "tool-search",
        name: "find",
        input: {
          query: "罗翔"
        }
      }]
    }, {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "tool-search",
        content: [{
          type: "text",
          text: "搜索入口已定位"
        }]
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "turn-second",
        name: "turn_answer_start",
        input: {}
      }, {
        type: "text",
        text: "第二轮完成"
      }]
    }]
  }, {
    scopeId: "scope-full-session"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: false,
    source: "recent"
  });

  assert.deepEqual(run.stages.map((stage) => stage.id), ["request", "planning", "execution", "final"]);
  assert.equal(run.stages[0].eventCount, 2);
  assert.equal(run.stages[1].eventCount, 2);
  assert.equal(run.stages[2].eventCount, 4);
  assert.equal(run.stages[3].eventCount, 2);
  assert.deepEqual(
    run.stages[1].events.map((event) => event.text),
    ["我先看看首页结构。", "我再看看搜索入口。"]
  );
  assert.deepEqual(
    run.stages[3].events.map((event) => event.text),
    ["第一轮完成", "第二轮完成"]
  );
  assert.equal(run.currentEvent?.type, "final_answer");
  assert.equal(run.currentEvent?.text, "第二轮完成");
  assert.equal(run.meta.currentStageId, "final");
}

function testTurnAnswerStartToolResultDoesNotRenderAsExecution() {
  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-turn-answer",
    sessionId: "session-turn-answer",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "你好"
      }]
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "turn-1",
        name: "turn_answer_start",
        input: {}
      }]
    }, {
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "turn-1",
        content: [{
          type: "text",
          text: "Proceed with your response."
        }]
      }]
    }, {
      role: "assistant",
      content: [{
        type: "text",
        text: "你好！有什么我可以帮你处理的吗？"
      }]
    }]
  }, {
    scopeId: "scope-turn-answer"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: true,
    source: "active"
  });

  assert.deepEqual(run.stages.map((stage) => stage.eventCount), [1, 0, 0, 1]);
  assert.equal(run.events.some((event) => event.type === "tool_result"), false);
  assert.equal(run.currentEvent?.type, "final_answer");
  assert.equal(run.currentEvent?.text, "你好！有什么我可以帮你处理的吗？");
  assert.equal(run.meta.currentStageId, "final");
}

function testSyntheticResultTextDoesNotBecomeUserInput() {
  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-synthetic-result",
    sessionId: "session-synthetic-result",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "帮我执行快捷命令"
      }]
    }, {
      role: "user",
      content: [{
        type: "text",
        text: "Done."
      }],
      _syntheticResult: true
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "turn-1",
        name: "turn_answer_start",
        input: {}
      }]
    }, {
      role: "assistant",
      content: [{
        type: "text",
        text: "已完成。"
      }]
    }]
  }, {
    scopeId: "scope-synthetic-result"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: true,
    source: "active"
  });

  assert.equal(snapshot.messages[1].isSyntheticResult, true);
  assert.deepEqual(run.stages.map((stage) => stage.eventCount), [1, 0, 0, 1]);
  assert.equal(
    run.events.some((event) => event.type === "user_text" && event.text === "Done."),
    false
  );
  assert.equal(run.currentEvent?.type, "final_answer");
  assert.equal(run.currentEvent?.text, "已完成。");
  assert.equal(run.meta.currentStageId, "final");
}

function testCompactionMarkersDoNotBecomeVisibleConversationFlow() {
  const snapshot = core.normalizeSessionSnapshot({
    scopeId: "scope-compaction",
    sessionId: "session-compaction",
    messages: [{
      role: "user",
      content: [{
        type: "text",
        text: "原始请求"
      }]
    }, {
      role: "assistant",
      content: "This conversation has been summarized so we can keep going.",
      isCompactionMessage: true
    }, {
      role: "user",
      content: "这里是压缩后的对话摘要。",
      isCompactSummary: true
    }, {
      role: "assistant",
      content: [{
        type: "tool_use",
        id: "turn-1",
        name: "turn_answer_start",
        input: {}
      }]
    }, {
      role: "assistant",
      content: [{
        type: "text",
        text: "继续处理你的请求。"
      }]
    }]
  }, {
    scopeId: "scope-compaction"
  });

  const run = core.buildVisualizerRun(snapshot, {
    active: true,
    source: "active"
  });

  assert.equal(snapshot.messages[1].isCompactionMessage, true);
  assert.equal(snapshot.messages[2].isCompactSummary, true);
  assert.equal(snapshot.meta.title, "原始请求");
  assert.equal(
    run.events.some((event) => event.text === "这里是压缩后的对话摘要。"),
    false
  );
  assert.equal(
    run.events.some((event) => event.text === "This conversation has been summarized so we can keep going."),
    false
  );
  assert.deepEqual(run.stages.map((stage) => stage.eventCount), [1, 0, 0, 1]);
  assert.equal(run.currentEvent?.type, "final_answer");
  assert.equal(run.currentEvent?.text, "继续处理你的请求。");
}

function testQueryOverrideSelectsExplicitSession() {
  const run = core.selectVisualizerRun(createStorageState(), {
    scopeId: "scope-history",
    sessionId: "session-old"
  });

  assert.equal(run.meta.scopeId, "scope-history");
  assert.equal(run.meta.sessionId, "session-old");
}

function testMissingRequestedSessionFallsBackToSameScope() {
  const run = core.selectVisualizerRun(createStorageState(), {
    scopeId: "scope-history",
    sessionId: "missing-session"
  });

  assert.equal(run.meta.scopeId, "scope-history");
  assert.equal(run.meta.sessionId, "session-old");
}

function testSessionGroupsCollectEntriesByScope() {
  const storage = createStorageState();
  storage["claw.chat.scopes.scope-history.index"] = [{
    id: "session-old",
    scopeId: "scope-history",
    updatedAt: 250,
    title: "Old run"
  }, {
    id: "session-older",
    scopeId: "scope-history",
    updatedAt: 180,
    title: "Older run"
  }];
  storage["claw.chat.scopes.scope-history.byId.session-older"] = createToolRunSnapshot({
    id: "session-older",
    scopeId: "scope-history",
    title: "Older run",
    updatedAt: 180,
    currentUrl: "https://old.example"
  });

  const groups = core.collectVisualizerSessionGroups(storage);
  const activeGroup = groups.find((group) => group.scopeId === "scope-active");
  const historyGroup = groups.find((group) => group.scopeId === "scope-history");

  assert.ok(activeGroup);
  assert.equal(activeGroup.entries.length, 1);
  assert.equal(activeGroup.activeSessionId, "session-active");
  assert.ok(historyGroup);
  assert.equal(historyGroup.entries.length, 2);
  assert.equal(historyGroup.entries[0].sessionId, "session-old");
  assert.equal(historyGroup.entries[1].sessionId, "session-older");
  assert.match(historyGroup.title, /old\.example|shop\.example|scope-history/i);
}

function main() {
  testActiveSessionWinsByDefault();
  testRecentHistoryFallbackWorksWithoutActiveSession();
  testRunParsesIntoFourStages();
  testToolPairingAndPendingStatusWork();
  testPermissionRequiredActionDataStaysVisibleInVisualizer();
  testLongToolResultKeepsFullTextForExpandedResult();
  testModalCollapseOnlyTriggersForTallOrVeryLongContent();
  testFullModePreservesExactStructuredValues();
  testFullSessionModeIncludesEarlierTurnsAndResetsStageBoundaries();
  testTurnAnswerStartToolResultDoesNotRenderAsExecution();
  testSyntheticResultTextDoesNotBecomeUserInput();
  testCompactionMarkersDoNotBecomeVisibleConversationFlow();
  testQueryOverrideSelectsExplicitSession();
  testMissingRequestedSessionFallsBackToSameScope();
  testSessionGroupsCollectEntriesByScope();
  console.log("visualizer core unit tests passed");
}

main();
