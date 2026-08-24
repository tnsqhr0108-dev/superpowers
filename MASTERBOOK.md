# MasterBook verification profile

This fork adds a standalone, zero-dependency verification state machine. It
extracts the useful root-cause and verification-before-completion principles
without modifying or automatically installing upstream skills.

The profile never uses subagents, telemetry, human checkpoints, or direct
`main` writes. It separates spec review from code review, caps repair attempts
at two per fingerprint, and rejects runs that exceed twenty cycles. Any
candidate fingerprint change resets the pass streak.

Run it with:

```bash
node masterbook/verification-loop.mjs --input verification-history.json
```

Commit, push, and PR update may proceed after the local test and private-source
boundary pass. Merge remains disabled until the unchanged candidate has ten
consecutive Harness 10.0 passes plus independent spec and code reviews.
