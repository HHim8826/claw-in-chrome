# Summary

Describe the behavior changed and why the change is necessary.

# Verification

Record exact commands and runtime evidence.

- [ ] `npm run validate:fast` passed.
- [ ] `npm run validate:full` passed, or the change does not affect runtime-sensitive surfaces.
- [ ] UI or runtime evidence is attached when static tests cannot prove behavior.
- [ ] Documentation reflects command, contract, permission, or architecture changes.

# Harness impact

Explain how the repository prevents this change from regressing.

- [ ] A focused test or executable check covers the new invariant.
- [ ] Bundle changes include a semantic anchor and recovery-model update.
- [ ] Repeated review feedback was converted into a durable guardrail where practical.

# Security and risk

Describe permission, credential, compatibility, rollout, and rollback impact.

- [ ] Manifest permission changes are intentional and update the reviewed baseline.
- [ ] Logs and fixtures contain no credentials or personal browsing data.
- [ ] Release and rollback risks are documented.

